/**
 * 生成网关（产品负责人指令 2026-10-10：按模态自动
 * 调用相应模型进行生成）。
 *
 * 协议：OpenAI 兼容生成端点——
 * - 图像：POST {base}/images/generations（{model, prompt}；
 *   响应 data[0].url 或 data[0].b64_json）
 * - 语音：POST {base}/audio/speech（{model, input, voice}；
 *   响应音频字节流）
 * - 视频：POST {base}/videos（{model, prompt}；响应形态
 *   依提供方而异——data[0].url / output.url / url 兜底解析）
 *
 * 提供方不写死：端点 + 模型 + key 经配置注入
 * （S5B 持久化配置——按模态单条启用）。
 *
 * 错误纪律（与 ProviderLlmGateway 一致）：错误信息仅含
 * provider / 状态码——不含 key、不含请求体。
 */

import type { EnabledProviderConfig } from './config-store';

export interface GenerationArtifact {
  /** 远程 URL（提供方托管产物）。 */
  url?: string;
  /** 内联 data URI（语音字节流 / b64 图像——自包含产物）。 */
  dataUri?: string;
  mime: string;
}

export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly modality: string,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

/** 端点基地址（剥离 chat-completions 后缀——生成端点
 * 与对话端点共享同一 API Base）。 */
function baseUrl(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions')
    ? trimmed.slice(0, -'/chat/completions'.length)
    : trimmed;
}

function headers(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

async function callProvider(
  config: EnabledProviderConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl(config.endpoint)}${path}`, {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new GenerationError(
      `generation provider network failure (provider=${config.provider}, modality=${config.modality})`,
      config.modality,
    );
  }
  if (!response.ok) {
    throw new GenerationError(
      `generation provider failed (provider=${config.provider}, modality=${config.modality}, status=${response.status})`,
      config.modality,
    );
  }
  return response;
}

function firstDataEntry(parsed: unknown): Record<string, unknown> | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  const data = (parsed as { data?: unknown }).data;
  if (Array.isArray(data) && data.length > 0 && data[0] !== null && typeof data[0] === 'object') {
    return data[0] as Record<string, unknown>;
  }
  return null;
}

function extractUrl(entry: Record<string, unknown>): string | undefined {
  const direct = entry.url;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const output = entry.output;
  if (output !== null && typeof output === 'object') {
    const nested = (output as { url?: unknown }).url;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return undefined;
}

/** 异步任务轮询间隔与总超时（Agnes 视频官方
 * 建议每 1–2 秒查询一次；生成通常需数十秒）。 */
const VIDEO_POLL_INTERVAL_MS = 1_500;
const VIDEO_POLL_TIMEOUT_MS = 180_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 任务 ID（Agnes 异步任务——video_id 优先，
 * 兼容 id / task_id 两种响应字段）。 */
function extractVideoId(parsed: unknown): string | undefined {
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  for (const key of ['video_id', 'id', 'task_id']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

export async function generateImage(
  config: EnabledProviderConfig,
  prompt: string,
): Promise<GenerationArtifact> {
  const response = await callProvider(config, '/images/generations', {
    model: config.model,
    prompt,
    n: 1,
  });
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new GenerationError(
      `generation provider response malformed (provider=${config.provider}, modality=image: non-JSON body)`,
      'image',
    );
  }
  const entry = firstDataEntry(parsed);
  if (entry === null) {
    throw new GenerationError(
      `generation provider response malformed (provider=${config.provider}, modality=image: missing data[0])`,
      'image',
    );
  }
  const url = extractUrl(entry);
  if (url !== undefined) {
    return { url, mime: 'image/png' };
  }
  const b64 = entry.b64_json;
  if (typeof b64 === 'string' && b64.length > 0) {
    return { dataUri: `data:image/png;base64,${b64}`, mime: 'image/png' };
  }
  throw new GenerationError(
    `generation provider response malformed (provider=${config.provider}, modality=image: no url or b64_json)`,
    'image',
  );
}

export async function generateVoice(
  config: EnabledProviderConfig,
  prompt: string,
): Promise<GenerationArtifact> {
  const response = await callProvider(config, '/audio/speech', {
    model: config.model,
    input: prompt,
    voice: 'alloy',
  });
  // 音频字节流——内容类型依提供方（audio/mpeg / wav / opus）。
  const contentType = response.headers.get('content-type') ?? 'audio/mpeg';
  const mime = contentType.split(';')[0].trim() || 'audio/mpeg';
  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    throw new GenerationError(
      `generation provider response malformed (provider=${config.provider}, modality=voice: unreadable audio body)`,
      'voice',
    );
  }
  if (buffer.byteLength === 0) {
    throw new GenerationError(
      `generation provider response malformed (provider=${config.provider}, modality=voice: empty audio body)`,
      'voice',
    );
  }
  const base64 = Buffer.from(buffer).toString('base64');
  return { dataUri: `data:${mime};base64,${base64}`, mime };
}

export async function generateVideo(
  config: EnabledProviderConfig,
  prompt: string,
  onProgress?: (progress: number) => void,
): Promise<GenerationArtifact> {
  // 官方文档最佳实践（Agnes Video 2.5 Flash——
  // 异步任务接口）：POST /videos 创建任务
  // （mode 为生成模式 text/keyframe/reference——
  // 非质量档位；size 固定 720P），保存返回的
  // video_id 后轮询 GET /agnesapi 直至
  // status=completed，从响应顶层 url 取产物。
  const response = await callProvider(config, '/videos', {
    model: config.model,
    prompt,
    mode: 'text',
    seconds: '5',
    size: '720P',
    aspect_ratio: '16:9',
  });
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new GenerationError(
      `generation provider response malformed (provider=${config.provider}, modality=video: non-JSON body)`,
      'video',
    );
  }
  // 同步形态兜底（部分提供方直接返回产物 URL，
  // 如本地 mock——无需轮询）。
  const entry = firstDataEntry(parsed);
  const syncUrl =
    (entry !== null ? extractUrl(entry) : undefined) ??
    extractUrl(parsed as Record<string, unknown>);
  if (syncUrl !== undefined) {
    return { url: syncUrl, mime: 'video/mp4' };
  }
  const videoId = extractVideoId(parsed);
  if (videoId === undefined) {
    throw new GenerationError(
      `generation provider response malformed (provider=${config.provider}, modality=video: no artifact url or task id)`,
      'video',
    );
  }
  // 异步任务轮询（官方建议每 1–2 秒查询一次，
  // 以 status 与 progress 为准——internal_status
  // 为内部字段，不作为完成判据）。
  const origin = new URL(config.endpoint).origin;
  const pollUrl = `${origin}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(config.model)}`;
  const deadline = Date.now() + VIDEO_POLL_TIMEOUT_MS;
  for (;;) {
    await sleep(VIDEO_POLL_INTERVAL_MS);
    let status: Response;
    try {
      status = await fetch(pollUrl, {
        headers: headers(config.apiKey),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new GenerationError(
        `generation provider network failure (provider=${config.provider}, modality=video: task poll)`,
        'video',
      );
    }
    if (!status.ok) {
      throw new GenerationError(
        `generation provider failed (provider=${config.provider}, modality=video: task poll status=${status.status})`,
        'video',
      );
    }
    let state: unknown;
    try {
      state = await status.json();
    } catch {
      throw new GenerationError(
        `generation provider response malformed (provider=${config.provider}, modality=video: task poll non-JSON body)`,
        'video',
      );
    }
    const record = state as {
      status?: unknown;
      error?: unknown;
      progress?: unknown;
    };
    if (record.status === 'completed') {
      const stateEntry = firstDataEntry(state);
      const url =
        extractUrl(state as Record<string, unknown>) ??
        (stateEntry !== null ? extractUrl(stateEntry) : undefined);
      if (url !== undefined) {
        return { url, mime: 'video/mp4' };
      }
      throw new GenerationError(
        `generation provider response malformed (provider=${config.provider}, modality=video: task completed without url)`,
        'video',
      );
    }
    if (record.status === 'failed') {
      const reason = typeof record.error === 'string' ? record.error : 'unknown';
      throw new GenerationError(
        `generation provider task failed (provider=${config.provider}, modality=video: ${reason})`,
        'video',
      );
    }
    // 进度透传（提供方任务 progress 0–100——
    // 呈现层据此展示进度条，视频生成耗时
    // 数十秒至数分钟，反馈不可省）。
    if (onProgress !== undefined && typeof record.progress === 'number') {
      onProgress(record.progress);
    }
    if (Date.now() >= deadline) {
      throw new GenerationError(
        `generation provider timeout (provider=${config.provider}, modality=video: task not completed within ${VIDEO_POLL_TIMEOUT_MS / 1000}s)`,
        'video',
      );
    }
  }
}

export const GENERATION_CALLS: Record<
  'image' | 'voice' | 'video',
  (
    config: EnabledProviderConfig,
    prompt: string,
    onProgress?: (progress: number) => void,
  ) => Promise<GenerationArtifact>
 > = {
  image: generateImage,
  voice: generateVoice,
  video: generateVideo,
};
