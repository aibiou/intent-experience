/**
 * 媒体网关（S2b 媒体生成切片）——图像 / 语音生成的提供方客户端。
 *
 * 边界纪律（对齐 llm-gateway 的三层纪律）：
 * - 只产出媒体产物（MediaArtifactRecord），不接触 ExperienceState、
 *   不接触策略、不写会话状态——媒体是体验产物而非产品状态。
 * - 提供方为环境内置 z-ai-web-dev-sdk（仅服务端）；视频模态本环境
 *   无提供方——识别层如实报告意图，编排层走诚实「未接入」路径，
 *   本网关不假装支持。
 * - 产物落盘 data/media/<id>.<ext> + index.json 登记（单进程顺序写；
 *   会话恢复时按 sessionId 重建呈现）。经
 *   GET /api/experience/media/<file> 提供（Content-Type 由扩展名映射）。
 * - 失败抛 MediaGatewayError（retryable 标记）；错误信息不含密钥。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ZAI from 'z-ai-web-dev-sdk';
import type { GenerationModality } from './generation-intent';

const MEDIA_DIR = path.join(process.cwd(), 'data', 'media');
const INDEX_FILE = path.join(MEDIA_DIR, 'index.json');

/** 本网关支持的模态（video 无提供方，不在此列）。 */
export type SupportedMediaModality = Exclude<GenerationModality, 'video'>;

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

export interface MediaPersistOptions {
  sessionId: string;
  turn: number;
  signal?: AbortSignal;
}

export class MediaGatewayError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'MediaGatewayError';
  }
}

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

export class MediaGateway {
  private client: ZaiClient | null = null;

  private async ensureClient(): Promise<ZaiClient> {
    if (!this.client) {
      this.client = await ZAI.create();
    }
    return this.client;
  }

  /** 图像生成（横幅画幅——体验流内嵌卡片与宽内容卡一致）。 */
  async generateImage(
    prompt: string,
    options: MediaPersistOptions
  ): Promise<MediaArtifactRecord> {
    const zai = await this.ensureClient();
    const response = await zai.images.generations.create({
      prompt,
      size: '1344x768',
    });
    const base64 = response.data?.[0]?.base64;
    if (typeof base64 !== 'string' || base64.length === 0) {
      throw new MediaGatewayError('图片生成返回了空结果', true);
    }
    return this.persist(
      Buffer.from(base64, 'base64'),
      'image/png',
      'image',
      prompt,
      options
    );
  }

  /** 语音合成（朗读——温暖声线；TTS 单次输入上限 1024 字符）。 */
  async generateVoice(
    text: string,
    options: MediaPersistOptions
  ): Promise<MediaArtifactRecord> {
    const input = text.slice(0, 1000);
    if (input.trim().length === 0) {
      throw new MediaGatewayError('没有可朗读的内容', false);
    }
    const zai = await this.ensureClient();
    const response = await zai.audio.tts.create({
      input,
      voice: 'tongtong',
      speed: 1.0,
      response_format: 'wav',
      stream: false,
    });
    const buffer = Buffer.from(new Uint8Array(await response.arrayBuffer()));
    if (buffer.length === 0) {
      throw new MediaGatewayError('语音合成返回了空结果', true);
    }
    return this.persist(buffer, 'audio/wav', 'voice', input.slice(0, 80), options);
  }

  /** 产物落盘 + 索引登记（写前检查中止——被取消的生成不落盘）。 */
  private async persist(
    buffer: Buffer,
    mime: string,
    modality: SupportedMediaModality,
    promptUsed: string,
    options: MediaPersistOptions
  ): Promise<MediaArtifactRecord> {
    if (options.signal?.aborted) {
      throw new MediaGatewayError('生成已被取消', false);
    }
    const id = `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = mime === 'image/png' ? 'png' : 'wav';
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
