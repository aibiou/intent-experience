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
  /** 图像生成（体验流内嵌卡片与宽内容卡一致）。 */
  async generateImage(
    prompt: string,
    options: MediaPersistOptions,
  ): Promise<MediaArtifactRecord> {
    const artifact = await callMediaEndpoint(
      '/v1/images/generations',
      { prompt },
      MEDIA_TIMEOUT_MS,
    );
    const { buffer, mime } = await artifactToBuffer(artifact);
    return this.persist(buffer, mime, 'image', prompt, options);
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
