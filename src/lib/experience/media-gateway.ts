/**
 * 媒体网关客户端（S2b 媒体生成切片）——图像 / 语音 / 视频
 * 生成的提供方路由客户端。
 *
 * 边界纪律（对齐 llm-gateway 的三层纪律）：
 * - 只产出媒体产物（MediaArtifactRecord），不接触 ExperienceState、
 *   不接触策略、不写会话状态——媒体是体验产物而非产品状态。
 * - 提供方路由收敛在独立模型网关（127.0.0.1:3031）：
 *   文本/图像/视频/语音各自按模态选提供方（用户配置——
 *   本地默认 Agnes × 文本/图像/视频 + 火山云 × 语音）。
 *   主应用不感知具体提供方、不内置任何提供方 SDK。
 * - 产物落盘 data/media/<id>.<ext> + index.json 登记（单进程顺序写；
 *   会话恢复时按 sessionId 重建呈现）。经
 *   GET /api/experience/media/<file> 提供（Content-Type 由扩展名映射）。
 * - 失败抛 MediaGatewayError（retryable 标记）；错误信息不含密钥。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { GenerationModality } from './generation-intent';
import { LocalHttpError, localHttpRequest, localNoProxyEnv } from './loopback-http';

const MEDIA_DIR = path.join(process.cwd(), 'data', 'media');
const INDEX_FILE = path.join(MEDIA_DIR, 'index.json');

/** 独立模型网关地址（本机部署形态；端口与 mini-services/model-gateway 一致）。 */
const MODEL_GATEWAY_URL = 'http://127.0.0.1:3031';

/** 单次图像 / 语音调用超时（秒级上游响应）。 */
// 媒体调用总超时：与网关侧图像超时（240s）对齐——上游图像队列
// 饱和时可排队 >120s（实测缺口 2026-10-15/10-16：体验层 120s 先于
// 网关 240s 超时，排队请求被体验层误判为失败；统一 240s 让
// 排队请求留足完成时间）。
const MEDIA_TIMEOUT_MS = 240_000;
/** 视频调用超时（异步任务：免费档排队可达数分钟）。
 * 豆包本机桥接为同步长请求（官方预估 10 分钟、网关侧上限
 * 900s，另有创建瞬态退避最长 5 分钟）——480s 会先于网关
 * 掐断仍会成功的生成（同类缺口见 2026-10-15/10-16 图像
 * 120s/240s 实测），统一放宽到 960s 覆盖最坏链路。 */
const VIDEO_TIMEOUT_MS = 960_000;

/** 网关拉起限频窗口（毫秒）——避免并发请求时重复 spawn。 */
const REVIVE_THROTTLE_MS = 10_000;

/** 网关拉起后的就绪等待（毫秒）。 */
const REVIVE_WAIT_MS = 3_000;

/** 参考图解码字节上限（官方 extra_body.image 契约）。 */
const REFERENCE_MAX_BYTES = 1_500_000;

/** 网关健康检查（静默——不可达走拉起路径）。 */
let lastReviveAt = 0;

async function ensureGateway(): Promise<void> {
  try {
    // 健康探测同样必须直连：Bun 下 fetch 会被 HTTP_PROXY 劫持，代理对
    // 127.0.0.1 的失败会伪装成「网关不可达」，从而每次生成都误判为
    // 需要拉起（实测会造成网关重复 spawn 与端口竞争）。
    const probe = await localHttpRequest({
      url: `${MODEL_GATEWAY_URL}/healthz`,
      timeoutMs: 3_000,
    });
    if (probe.status >= 200 && probe.status < 300) return;
  } catch {
    // 不可达——走拉起路径
  }
  const now = Date.now();
  if (now - lastReviveAt < REVIVE_THROTTLE_MS) return;
  lastReviveAt = now;
  try {
    const { spawn } = await import('node:child_process');
    const pathModule = await import('node:path');
    // 以主应用根为 cwd 拉起：网关默认配置路径
    // （data/config/provider-configs.json）按 process.cwd() 解析——
    // cwd 若为 mini-services/model-gateway 会读不到统一配置源
    // （实测 MEDIA_PROVIDER_MISSING，所有模态"未配置"）。
    const child = spawn('bun', [pathModule.join(process.cwd(), 'mini-services', 'model-gateway', 'index.ts')], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      // 同上：网关内部调本机桥的 fetch 需要回环豁免（进程启动时生效）。
      env: localNoProxyEnv(),
    });
    child.unref();
    await new Promise((resolve) => setTimeout(resolve, REVIVE_WAIT_MS));
  } catch {
    // 拉起失败——让后续 fetch 走诚实报错路径
  }
}

/** 网关媒体产物形态（url 或 dataUri 二选一）。 */
interface GatewayMediaArtifactEntry {
  url?: string;
  dataUri?: string;
  mime?: string;
}

interface GatewayMediaArtifact {
  ok: boolean;
  url?: string;
  dataUri?: string;
  mime?: string;
  /** 提供方是否真正消费了 referenceImages（视频侧诚实边界——
   * 本地图片是 dataURI，只有接受 http 参考的提供方会用上）。 */
  referenceApplied?: boolean;
  artifacts?: GatewayMediaArtifactEntry[];
  error?: { message?: string; code?: string };
}

export class MediaGatewayError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MediaGatewayError';
  }
}

/** 产物字节化：远程 url 下载 / dataURI 内联解码。 */
async function artifactToBuffer(
  artifact: GatewayMediaArtifact,
): Promise<{ buffer: Buffer; mime: string }> {
  const mime =
    typeof artifact.mime === 'string' && artifact.mime.length > 0
      ? artifact.mime
      : 'application/octet-stream';
  if (typeof artifact.url === 'string' && artifact.url.length > 0) {
    const res = await fetch(artifact.url, {
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new MediaGatewayError(`产物下载失败（HTTP ${res.status}）`, true);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { buffer: Buffer.from(bytes), mime };
  }
  if (typeof artifact.dataUri === 'string' && artifact.dataUri.length > 0) {
    const comma = artifact.dataUri.indexOf(',');
    if (comma < 0) {
      throw new MediaGatewayError('产物 dataURI 形态非法', false);
    }
    return {
      buffer: Buffer.from(artifact.dataUri.slice(comma + 1), 'base64'),
      mime,
    };
  }
  throw new MediaGatewayError('提供方返回了空产物（无 url 或 dataUri）', true);
}

/** 批次响应归一：新 artifacts 契约优先，旧单产物响应自动兼容。 */
function gatewayArtifactBatch(artifact: GatewayMediaArtifact): GatewayMediaArtifact[] {
  if (Array.isArray(artifact.artifacts) && artifact.artifacts.length > 0) {
    return artifact.artifacts
      .filter((item) => item !== null && typeof item === 'object')
      .map((item) => ({ ok: true, ...item }));
  }
  return [artifact];
}

/** 逐个下载批次产物：避免四张 2K 原图同时占用带宽与内存。 */
async function artifactBatchToBuffers(
  artifact: GatewayMediaArtifact,
): Promise<Array<{ buffer: Buffer; mime: string }>> {
  const buffers: Array<{ buffer: Buffer; mime: string }> = [];
  for (const item of gatewayArtifactBatch(artifact)) {
    buffers.push(await artifactToBuffer(item));
  }
  return buffers;
}

/**
 * POST JSON 到本机网关并取回 JSON。
 *
 * 传输层用 loopback-http（node:net 直连），原因有两条，都是真实 E2E 逼出来的：
 * 1. 全局 fetch 的默认 headersTimeout 是 300s——视频这类「几分钟后才写出
 *    响应头」的调用会在 5 分钟处被系统级中断（fetch failed，2026-10-19 复现），
 *    与 VIDEO_TIMEOUT_MS 的 16 分钟契约不一致；
 * 2. Bun 运行时会把 HTTP_PROXY 应用到 fetch / node:http，且不豁免 127.0.0.1
 *    ——带代理的机器上本机网关调用会拿到代理的 502，伪装成「网关不可达」
 *    （DEFECT-LOCAL-PROXY-001，2026-10-20）。
 * 这里整体等待窗口只由调用方 timeoutMs 决定。
 */
export async function requestGatewayJson(
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ status: number; parsed: GatewayMediaArtifact }> {
  let response: { status: number; body: string };
  try {
    response = await localHttpRequest({ url, method: 'POST', body, timeoutMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 取消不是网关故障：调用方（AbortSignal）需要能区分。
    const aborted = error instanceof LocalHttpError && error.code === 'aborted';
    throw new MediaGatewayError(message, !aborted);
  }
  try {
    return { status: response.status, parsed: JSON.parse(response.body) as GatewayMediaArtifact };
  } catch {
    throw new MediaGatewayError(`模型网关响应无法解析（HTTP ${response.status}）`, true);
  }
}

/** 调用网关媒体端点（请求驱动保活 + 错误归一）。 */
async function callMediaEndpoint(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<GatewayMediaArtifact> {
  await ensureGateway();
  const { status, parsed } = await requestGatewayJson(
    `${MODEL_GATEWAY_URL}${endpoint}`,
    body,
    timeoutMs,
  );
  if (status < 200 || status >= 300 || !parsed.ok) {
    const message = parsed.error?.message ?? `媒体生成失败（HTTP ${status}）`;
    throw new MediaGatewayError(message, status >= 500 || status === 429);
  }
  return parsed;
}

export interface MediaArtifactRecord {
  id: string;
  sessionId: string;
  turn: number;
  modality: SupportedMediaModality;
  file: string;
  mime: string;
  promptUsed: string;
  at: string;
  /** 用户选中为创作素材（G1.1 目标 4——后续引用此产物而非隐式末条）。 */
  selected?: boolean;
  /** 请求时是否要求以既有图像为参考（G1.1 图像→视频接续）。 */
  referenceRequested?: boolean;
  /** 参考图是否真正被提供方消费（false = 按画面描述降级生成）。 */
  referenceApplied?: boolean;
  /** 降级时用于提示的来源画面描述。 */
  referenceSource?: string;
}

/** 本网关支持的模态（全模态——各自由网关按模态路由提供方）。 */
export type SupportedMediaModality = GenerationModality;

export interface MediaPersistOptions {
  sessionId: string;
  turn: number;
  signal?: AbortSignal;
  /** 参考图 dataURI / http(s) 数组——图像→视频 / 图生图上下文接续。
   * 图像用 extra_body.image 契约；视频提供方各自适配。 */
  referenceImages?: string[];
  /** 参考来源的画面描述（视频降级提示用）。 */
  referenceSource?: string;
}

/** 会话内可接续的图像上下文（参考图 + 画面描述 + 产物文件）。 */
export interface SessionImageContext {
  reference: string;
  promptUsed: string;
  file: string;
}

/** 图像生成选项（G2-5 创作闭环——参考图生图）。 */
export interface ImageGenerateOptions extends MediaPersistOptions {
  /** 参考图 dataURI 数组（官方 extra_body.image 契约——
   * 生成与参考图主体一致；校验后 ≤3 张）。 */
  referenceImages?: string[];
}

/**
 * 参考图校验（官方 extra_body.image 契约——dataURI 白名单：
 * 仅 data:image/、解码后 ≤1.5MB、至多 3 张；非法项静默丢弃。
 * CR-61：按 base64 负载估算解码字节（len×3/4，padding 略高估——
 * 判定保守不误放），避免大图被字符串长度误杀导致图生图
 * 退化为纯文生。
 */
export function validateReferenceImages(refs: readonly string[]): string[] {
  const valid = refs.filter((item) => {
    if (typeof item !== 'string' || !item.startsWith('data:image/')) {
      return false;
    }
    const metaEnd = item.indexOf(',');
    if (metaEnd < 0) return false;
    const payloadLength = item.length - metaEnd - 1;
    if (payloadLength <= 0) return false;
    return (payloadLength * 3) / 4 <= REFERENCE_MAX_BYTES;
  });
  return valid.slice(0, 3);
}

/**
 * 视频参考图校验（G1.1 图像→视频）：本地产物是 dataURI，
 * 云端视频提供方通常只接受 http(s) URL。两者都放行交给
 * 提供方契约判定；是否真正消费由网关回传 referenceApplied。
 * 旧实现只放行 dataURI，http 参考在到达网关前就被丢弃，
 * 导致“支持 http 参考的提供方”永远收不到参考。
 */
export function validateVideoReferenceImages(refs: readonly string[]): string[] {
  const valid = refs.filter((item) => {
    if (typeof item !== 'string' || item.length === 0) return false;
    if (/^https?:\/\//.test(item)) return true;
    if (!item.startsWith('data:image/')) return false;
    const metaEnd = item.indexOf(',');
    if (metaEnd < 0) return false;
    const payloadLength = item.length - metaEnd - 1;
    if (payloadLength <= 0) return false;
    return (payloadLength * 3) / 4 <= REFERENCE_MAX_BYTES;
  });
  return valid.slice(0, 3);
}

/**
 * 参考图 dataURI 适配（CR-61 契约硬约束——解码后 ≤1.5MB）：
 * 提供方 2K 产物系统性超限（实测 Agnes 2K PNG ~1.56MB），
 * 原样透传会被校验层丢弃、图生图退化为纯文生图（CR-61
 * 失败模式）。超限产物经 JPEG q80 重编码（照片类内容体积
 * 骤降）适配；仍超限再等比缩小（宽度阶梯），直至适配；
 * 全部候选耗尽 / 产物解码失败 → null（降级文生图——防御
 * 性边界，真实图像在 512 宽度内必然适配）。
 */
export async function toReferenceDataUri(
  buffer: Buffer,
  mime: string,
): Promise<string | null> {
  if (buffer.byteLength <= REFERENCE_MAX_BYTES) {
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }
  try {
    const widthSteps: ReadonlyArray<number | undefined> = [
      undefined,
      1536,
      1024,
      768,
      512,
    ];
    for (const width of widthSteps) {
      let pipeline = sharp(buffer);
      if (width !== undefined) {
        pipeline = pipeline.resize({
          width,
          withoutEnlargement: true,
        });
      }
      const encoded = await pipeline.jpeg({ quality: 80 }).toBuffer();
      if (encoded.byteLength <= REFERENCE_MAX_BYTES) {
        return `data:image/jpeg;base64,${encoded.toString('base64')}`;
      }
    }
  } catch {
    // 产物解码失败——降级为文生图（不阻断生成）
  }
  return null;
}

/**
 * 会话最新图像产物记录（多轮链的选择核心——纯函数：
 * 索引按追加序即时间序，同一会话的图像记录取末条。
 * 第 N 轮「再换一张」引用第 N-1 轮产物；直接创作
 * （无情境标记）不调用本函数，不携带陈旧引用。
 */
export function latestImageRecord(
  records: readonly MediaArtifactRecord[],
  sessionId: string,
): MediaArtifactRecord | null {
  let latest: MediaArtifactRecord | null = null;
  for (const record of records) {
    if (record.sessionId === sessionId && record.modality === 'image') {
      latest = record;
    }
  }
  return latest;
}

/** 用户选中的图像记录（G1.1 目标 4——优先用户选择，兜底末条）。
 * 同会话同轮多候选中最多一条 selected=true；无选中时退回 latest。 */
export function selectedImageRecord(
  records: readonly MediaArtifactRecord[],
  sessionId: string,
): MediaArtifactRecord | null {
  let selected: MediaArtifactRecord | null = null;
  let latest: MediaArtifactRecord | null = null;
  for (const record of records) {
    if (record.sessionId !== sessionId || record.modality !== 'image') continue;
    if (record.selected) selected = record;
    latest = record;
  }
  return selected ?? latest;
}

/** mime → 落盘扩展名。 */
const EXT_BY_MIME: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
};

export class MediaGateway {
  /** 图像生成（体验流内嵌卡片与宽内容卡一致；带参考图时为图生图）。 */
  async generateImages(
    prompt: string,
    options: ImageGenerateOptions,
  ): Promise<MediaArtifactRecord[]> {
    const referenceImages = validateReferenceImages(
      options.referenceImages ?? [],
    );
    const artifact = await callMediaEndpoint(
      '/v1/images/generations',
      referenceImages.length > 0
        ? { prompt, referenceImages }
        : { prompt },
      MEDIA_TIMEOUT_MS,
    );
    const artifacts = await artifactBatchToBuffers(artifact);
    const records: MediaArtifactRecord[] = [];
    for (const { buffer, mime } of artifacts) {
      records.push(await this.persist(buffer, mime, 'image', prompt, options));
    }
    return records;
  }

  /** 兼容旧调用方：返回首选图像。 */
  async generateImage(
    prompt: string,
    options: ImageGenerateOptions,
  ): Promise<MediaArtifactRecord> {
    const [record] = await this.generateImages(prompt, options);
    return record;
  }

  /**
   * 会话最新图像产物（dataURI——图生图参考，G2-5 创作闭环：
   * 「换一张」/ 按材料修改时把上一张产物作为参考图，而非
   * 每次从零开始）。索引按追加序（追加即时间序），取末条
   * （多轮链：第 N 轮再生成引用第 N-1 轮产物）；无图像产物
   * / 文件读取失败 → null（降级为文生图——不阻断生成，
   * 诚实边界）。
   */
  async loadSessionImageReference(sessionId: string): Promise<string | null> {
    const context = await this.loadSessionImageContext(sessionId);
    return context?.reference ?? null;
  }

  /**
   * 可接续的图像上下文（G1.1 图像→视频）：参考图 dataURI +
   * 该产物的画面描述。描述让视频提供方不支持直接参考本地图时
   * 仍能保留主体与画面意图，并向用户如实说明降级来源。
   */
  async loadSessionImageContext(sessionId: string): Promise<SessionImageContext | null> {
    const index = await this.readIndex();
    const chosen = selectedImageRecord(index, sessionId);
    if (!chosen) return null;
    try {
      const buffer = await readFile(path.join(MEDIA_DIR, chosen.file));
      const reference = await toReferenceDataUri(buffer, chosen.mime);
      if (reference === null) return null;
      return { reference, promptUsed: chosen.promptUsed, file: chosen.file };
    } catch {
      return null;
    }
  }

  /** 持久化用户候选选择（G1.1 目标 4——同一会话同轮内互斥）。 */
  async selectCandidate(
    sessionId: string,
    turn: number,
    file: string,
  ): Promise<boolean> {
    const index = await this.readIndex();
    let found = false;
    const updated = index.map((record) => {
      if (record.sessionId !== sessionId || record.turn !== turn || record.modality !== 'image') return record;
      const isSelected = record.file === file;
      if (isSelected) found = true;
      return { ...record, selected: isSelected || undefined };
    });
    if (!found) return false;
    await this.writeIndex(updated);
    return true;
  }

  /** 语音合成（朗读——提供方默认音色；TTS 单次输入上限 1024 字符）。 */
  async generateVoice(
    text: string,
    options: MediaPersistOptions,
  ): Promise<MediaArtifactRecord> {
    const input = text.slice(0, 1000);
    if (input.trim().length === 0) {
      throw new MediaGatewayError('没有可朗读的内容', false);
    }
    const artifact = await callMediaEndpoint(
      '/v1/audio/speech',
      { input },
      MEDIA_TIMEOUT_MS,
    );
    const { buffer, mime } = await artifactToBuffer(artifact);
    return this.persist(buffer, mime, 'voice', input.slice(0, 80), options);
  }

  /** 视频生成（异步任务——创建 + 轮询直至完成，免费档排队可达数分钟）。 */
  async generateVideo(
    prompt: string,
    options: MediaPersistOptions,
  ): Promise<MediaArtifactRecord> {
    const referenceImages = validateVideoReferenceImages(options.referenceImages ?? []);
    const referenceRequested = referenceImages.length > 0;
    const artifact = await callMediaEndpoint(
      '/v1/videos',
      referenceRequested ? { prompt, referenceImages } : { prompt },
      VIDEO_TIMEOUT_MS,
    );
    const { buffer, mime } = await artifactToBuffer(artifact);
    return this.persist(buffer, mime, 'video', prompt, options, {
      // 老网关不回传该字段时按未消费处理（诚实降级，不假装参考生效）。
      referenceRequested,
      referenceApplied: referenceRequested && artifact.referenceApplied === true,
      referenceSource: referenceRequested ? options.referenceSource : undefined,
    });
  }

  /** 产物落盘 + 索引登记（写前检查中止——被取消的生成不落盘）。 */
  private async persist(
    buffer: Buffer,
    mime: string,
    modality: SupportedMediaModality,
    promptUsed: string,
    options: MediaPersistOptions,
    reference?: Pick<
      MediaArtifactRecord,
      'referenceRequested' | 'referenceApplied' | 'referenceSource'
    >,
  ): Promise<MediaArtifactRecord> {
    if (options.signal?.aborted) {
      throw new MediaGatewayError('生成已被取消', false);
    }
    const id = `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = EXT_BY_MIME[mime] ?? 'bin';
    const file = `${id}.${ext}`;
    await mkdir(MEDIA_DIR, { recursive: true });
    await writeFile(path.join(MEDIA_DIR, file), buffer);
    const record: MediaArtifactRecord = {
      id,
      sessionId: options.sessionId,
      turn: options.turn,
      modality,
      file,
      mime,
      promptUsed,
      at: new Date().toISOString(),
      ...(reference?.referenceRequested
        ? {
            referenceRequested: true,
            referenceApplied: reference.referenceApplied === true,
            ...(reference.referenceSource
              ? { referenceSource: reference.referenceSource }
              : {}),
          }
        : {}),
    };
    const index = await this.readIndex();
    index.push(record);
    await writeFile(INDEX_FILE, JSON.stringify(index, null, 1), 'utf8');
    return record;
  }

  /** 读取产物索引（无索引文件 / 损坏时回退空数组——呈现层容错）。 */
  async readIndex(): Promise<MediaArtifactRecord[]> {
    try {
      const raw = await readFile(INDEX_FILE, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as MediaArtifactRecord[]) : [];
    } catch {
      return [];
    }
  }

  /** 写入产物索引（selectCandidate 用——全量替换，调用方已做好互斥清理）。 */
  private async writeIndex(records: MediaArtifactRecord[]): Promise<void> {
    await writeFile(INDEX_FILE, JSON.stringify(records, null, 1), 'utf8');
  }
}

/** 单例（本切片单进程部署）。 */
let mediaGatewayInstance: MediaGateway | null = null;
export function getMediaGateway(): MediaGateway {
  if (!mediaGatewayInstance) {
    mediaGatewayInstance = new MediaGateway();
  }
  return mediaGatewayInstance;
}
