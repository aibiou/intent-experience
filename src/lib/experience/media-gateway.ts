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

const MEDIA_DIR = path.join(process.cwd(), 'data', 'media');
const INDEX_FILE = path.join(MEDIA_DIR, 'index.json');

/** 独立模型网关地址（本机部署形态；端口与 mini-services/model-gateway 一致）。 */
const MODEL_GATEWAY_URL = 'http://127.0.0.1:3031';

/** 单次图像 / 语音调用超时（秒级上游响应）。 */
const MEDIA_TIMEOUT_MS = 120_000;
/** 视频调用超时（异步任务：免费档排队可达数分钟）。 */
const VIDEO_TIMEOUT_MS = 480_000;

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
    const res = await fetch(`${MODEL_GATEWAY_URL}/healthz`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) return;
  } catch {
    // 不可达——走拉起路径
  }
  const now = Date.now();
  if (now - lastReviveAt < REVIVE_THROTTLE_MS) return;
  lastReviveAt = now;
  try {
    const { spawn } = await import('node:child_process');
    const pathModule = await import('node:path');
    const child = spawn('bun', ['index.ts'], {
      cwd: pathModule.join(process.cwd(), 'mini-services', 'model-gateway'),
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
    await new Promise((resolve) => setTimeout(resolve, REVIVE_WAIT_MS));
  } catch {
    // 拉起失败——让后续 fetch 走诚实报错路径
  }
}

/** 网关媒体产物形态（url 或 dataUri 二选一）。 */
interface GatewayMediaArtifact {
  ok: boolean;
  url?: string;
  dataUri?: string;
  mime?: string;
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

/** 调用网关媒体端点（请求驱动保活 + 错误归一）。 */
async function callMediaEndpoint(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<GatewayMediaArtifact> {
  await ensureGateway();
  let res: Response;
  try {
    res = await fetch(`${MODEL_GATEWAY_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new MediaGatewayError(
      `模型网关不可达（127.0.0.1:3031）：${error instanceof Error ? error.message : String(error)}`,
      true,
    );
  }
  let parsed: GatewayMediaArtifact;
  try {
    parsed = (await res.json()) as GatewayMediaArtifact;
  } catch {
    throw new MediaGatewayError(
      `模型网关响应无法解析（HTTP ${res.status}）`,
      true,
    );
  }
  if (!res.ok || !parsed.ok) {
    const message = parsed.error?.message ?? `媒体生成失败（HTTP ${res.status}）`;
    throw new MediaGatewayError(message, res.status >= 500 || res.status === 429);
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
}

/** 本网关支持的模态（全模态——各自由网关按模态路由提供方）。 */
export type SupportedMediaModality = GenerationModality;

export interface MediaPersistOptions {
  sessionId: string;
  turn: number;
  signal?: AbortSignal;
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
  async generateImage(
    prompt: string,
    options: ImageGenerateOptions,
  ): Promise<MediaArtifactRecord> {
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
    const { buffer, mime } = await artifactToBuffer(artifact);
    return this.persist(buffer, mime, 'image', prompt, options);
  }

  /**
   * 会话最新图像产物（dataURI——图生图参考，G2-5 创作闭环：
   * 「换一张」/ 按材料修改时把上一张产物作为参考图，而非
   * 每次从零开始）。索引按追加序（追加即时间序），取末条；
   * 无图像产物 / 文件读取失败 → null（降级为文生图——不
   * 阻断生成，诚实边界）。
   */
  async loadSessionImageReference(sessionId: string): Promise<string | null> {
    const index = await this.readIndex();
    const images = index.filter(
      (record) => record.sessionId === sessionId && record.modality === 'image',
    );
    const latest = images[images.length - 1];
    if (!latest) return null;
    try {
      const buffer = await readFile(path.join(MEDIA_DIR, latest.file));
      return await toReferenceDataUri(buffer, latest.mime);
    } catch {
      return null;
    }
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
    const artifact = await callMediaEndpoint(
      '/v1/videos',
      { prompt },
      VIDEO_TIMEOUT_MS,
    );
    const { buffer, mime } = await artifactToBuffer(artifact);
    return this.persist(buffer, mime, 'video', prompt, options);
  }

  /** 产物落盘 + 索引登记（写前检查中止——被取消的生成不落盘）。 */
  private async persist(
    buffer: Buffer,
    mime: string,
    modality: SupportedMediaModality,
    promptUsed: string,
    options: MediaPersistOptions,
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
}

/** 单例（本切片单进程部署）。 */
let mediaGatewayInstance: MediaGateway | null = null;
export function getMediaGateway(): MediaGateway {
  if (!mediaGatewayInstance) {
    mediaGatewayInstance = new MediaGateway();
  }
  return mediaGatewayInstance;
}
