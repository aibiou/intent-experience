/**
 * 媒体生成提供方客户端（按模态契约路由——不硬编码提供方）。
 *
 * 契约判定与执行（移植自参考实现 generation-gateway.ts，
 * 适配本网关记录形态）：
 * - 图像：OpenAI 兼容 /images/generations（Agnes 契约：
 *   size 档位 1K/2K/3K/4K + ratio 宽高比；response_format
 *   必须放 extra_body 内——官方警告勿放顶层；data[0].url
 *   或 data[0].b64_json）
 * - 语音：豆包契约（openspeech 域 / tts·audio 模型名 →
 *   /api/v3/tts/create + X-Api-Key 单头鉴权，响应 url 或
 *   audio base64）；否则 OpenAI 兼容 /audio/speech（字节流）
 * - 视频：Seedance 契约（volcengine/volces/ark./api/v3 域
 *   或 seedance 模型名 → /contents/generations/tasks 异步
 *   任务 + 轮询，产物 content.video_url）；否则 Agnes 契约
 *   （/videos 创建 + /agnesapi?video_id=&model_name= 轮询，
 *   产物顶层 url）
 *
 * 瞬态纪律（与 chat 一致）：网络异常 / 408/429/5xx 等 2 秒
 * 重试 1 次；4xx 立即报。视频队列满（503/queue_full）按
 * 退避序列 [30s,60s,90s,120s] ride out 短时波动。
 *
 * 错误纪律：错误信息仅含 provider / 状态码 / 提供方原文
 * 片段——不含 key、不含完整请求体。
 */

import type { ProviderConfigRecord } from '../config-store';
import { isRetryableStatus } from '../retry';

/** 统一产物形态：远程 url 或内联 dataUri（二选一）。 */
export interface MediaArtifact {
  url?: string;
  dataUri?: string;
  mime: string;
}

export class MediaProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'MediaProviderError';
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 端点基地址（剥离 chat-completions 后缀——生成端点与对话端点共享 API Base）。 */
function baseUrl(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions')
    ? trimmed.slice(0, -'/chat/completions'.length)
    : trimmed;
}

function bearerHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

/** 瞬态重试封装（媒体专用——需要原始 Response 形态）。 */
async function mediaFetch(
  url: string,
  init: RequestInit,
  providerName: string,
  modality: string,
): Promise<Response> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const isLast = attempt === 2;
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (!isLast) {
        await sleep(2_000);
        continue;
      }
      throw new MediaProviderError(
        `提供方「${providerName}」网络失败（${modality}）：${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
    if (response.ok) return response;
    const detail = await readProviderError(response);
    if (!isLast && detail.retryable) {
      await sleep(2_000);
      continue;
    }
    const reason = detail.message.length > 0 ? `：${detail.message}` : '';
    throw new MediaProviderError(
      `提供方「${providerName}」返回错误（${modality}，HTTP ${response.status}）${reason}`,
      detail.retryable,
      response.status,
    );
  }
  throw new MediaProviderError(`提供方「${providerName}」调用失败（${modality}）`);
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set([
  'rate_limit_exceeded',
  'video_queue_full',
  'queue_full',
  'server_overloaded',
  'internal_error',
  'try_again',
]);

/** 提供方错误体解析（message / error / code 三形态）。 */
async function readProviderError(response: Response): Promise<{
  message: string;
  retryable: boolean;
}> {
  let message = '';
  let code: string | undefined;
  try {
    const payload = (await response.json()) as {
      message?: unknown;
      error?: unknown;
      code?: unknown;
    };
    if (typeof payload.message === 'string' && payload.message.length > 0) {
      message = payload.message;
    } else if (typeof payload.error === 'string' && payload.error.length > 0) {
      message = payload.error;
    } else if (payload.error !== null && typeof payload.error === 'object') {
      const nested = (payload.error as { message?: unknown }).message;
      if (typeof nested === 'string' && nested.length > 0) message = nested;
    }
    if (typeof payload.code === 'string' && payload.code.length > 0) {
      code = payload.code;
    }
  } catch {
    // 非 JSON 错误体——仅用状态码
  }
  return {
    message,
    retryable:
      RETRYABLE_STATUS.has(response.status) ||
      (code !== undefined && RETRYABLE_CODES.has(code)),
  };
}

function firstDataEntry(parsed: unknown): Record<string, unknown> | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  const data = (parsed as { data?: unknown }).data;
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    data[0] !== null &&
    typeof data[0] === 'object'
  ) {
    return data[0] as Record<string, unknown>;
  }
  return null;
}

function extractUrl(entry: Record<string, unknown>): string | undefined {
  const direct = entry.url;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const metadata = entry.metadata;
  if (metadata !== null && typeof metadata === 'object') {
    const nested = (metadata as { url?: unknown }).url;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  const output = entry.output;
  if (output !== null && typeof output === 'object') {
    const nested = (output as { url?: unknown }).url;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return undefined;
}

// ───────────────────────── 图像 ─────────────────────────

/** Agnes 官方契约：size 档位 + ratio 组合（缺省 2K 档位）。 */
const DEFAULT_IMAGE_TIER = '2K';

export async function generateImage(
  record: ProviderConfigRecord,
  prompt: string,
  options?: { aspectRatio?: string; referenceImages?: string[] },
): Promise<MediaArtifact> {
  const tier = DEFAULT_IMAGE_TIER;
  const refs = options?.referenceImages ?? [];
  // 参考图透传日志（CR-61 实证链——确认 dataURI 参考图
  // 确实到达上游，而非被参数兼容降级静默丢弃）。
  if (refs.length > 0) {
    console.log(
      `[image-gen] referenceImages=${refs.length} first=${refs[0]?.slice(0, 32)}… len=${refs[0]?.length ?? 0}`,
    );
  }
  const hasRatio = options?.aspectRatio !== undefined;

  // 三段调用形态：带画幅 + 带参考图 → 仅参考图（画幅被拒）
  // → 裸调用（参考图也被拒——保底出图，文生图契约兜底）。
  const call = (withSize: boolean, withRefs: boolean) =>
    mediaFetch(
      `${baseUrl(record.baseUrl)}/images/generations`,
      {
        method: 'POST',
        headers: bearerHeaders(record.apiKey ?? ''),
        body: JSON.stringify({
          model: record.model,
          prompt,
          n: 1,
          ...(withSize && hasRatio ? { size: tier, ratio: options!.aspectRatio } : {}),
          extra_body: {
            response_format: 'url',
            ...(withRefs && refs.length > 0 ? { image: refs } : {}),
          },
        }),
        signal: AbortSignal.timeout(120_000),
      },
      record.name,
      '图像',
    );

  let response: Response;
  try {
    response = await call(hasRatio, refs.length > 0);
  } catch (error) {
    // 参数兼容降级：显式画幅被拒（400 非瞬态）→ 无画幅重试
    // （仍带参考图）；再被拒 → 裸重试（丢参考图保底出图）。
    if (
      hasRatio &&
      error instanceof MediaProviderError &&
      !error.retryable &&
      error.status === 400
    ) {
      try {
        response = await call(false, refs.length > 0);
      } catch (retryError) {
        if (
          refs.length > 0 &&
          retryError instanceof MediaProviderError &&
          !retryError.retryable &&
          retryError.status === 400
        ) {
          response = await call(false, false);
        } else {
          throw retryError;
        }
      }
    } else {
      throw error;
    }
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new MediaProviderError(
      `提供方「${record.name}」图像响应无法解析（非 JSON）`,
    );
  }
  const entry = firstDataEntry(parsed);
  if (entry === null) {
    throw new MediaProviderError(
      `提供方「${record.name}」图像响应缺少 data[0]`,
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
  throw new MediaProviderError(
    `提供方「${record.name}」图像响应无 url 或 b64_json`,
  );
}

// ───────────────────────── 语音 ─────────────────────────

/** 豆包语音契约判定：openspeech 域 / tts·audio 模型名。 */
function isDoubaoVoiceContract(record: ProviderConfigRecord): boolean {
  const model = record.model.toLowerCase();
  const endpoint = record.baseUrl.toLowerCase();
  return (
    endpoint.includes('openspeech') ||
    model.includes('tts') ||
    model.includes('audio')
  );
}

export async function generateVoice(
  record: ProviderConfigRecord,
  input: string,
  speaker?: string,
): Promise<MediaArtifact> {
  // 豆包语音走自有 /api/v3/tts/create 适配器（X-Api-Key 单头鉴权）；
  // 否则按 OpenAI 兼容 /audio/speech（Bearer 鉴权，字节流）。
  if (isDoubaoVoiceContract(record)) {
    const response = await mediaFetch(
      `${baseUrl(record.baseUrl)}/api/v3/tts/create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': record.apiKey ?? '',
        },
        body: JSON.stringify({
          model: record.model,
          text_prompt: input,
          audio_config: { format: 'mp3', sample_rate: 48000 },
          ...(speaker !== undefined && speaker.length > 0 ? { speaker } : {}),
        }),
        signal: AbortSignal.timeout(120_000),
      },
      record.name,
      '语音',
    );
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new MediaProviderError(
        `提供方「${record.name}」语音响应无法解析（非 JSON）`,
      );
    }
    const json = parsed as Record<string, unknown>;
    const url = typeof json.url === 'string' && json.url.length > 0 ? json.url : undefined;
    if (url !== undefined) {
      return { url, mime: 'audio/mpeg' };
    }
    const audio =
      typeof json.audio === 'string' && json.audio.length > 0 ? json.audio : undefined;
    if (audio !== undefined) {
      return { dataUri: `data:audio/mpeg;base64,${audio}`, mime: 'audio/mpeg' };
    }
    throw new MediaProviderError(
      `提供方「${record.name}」语音响应无 url 或 audio`,
    );
  }

  const response = await mediaFetch(
    `${baseUrl(record.baseUrl)}/audio/speech`,
    {
      method: 'POST',
      headers: bearerHeaders(record.apiKey ?? ''),
      body: JSON.stringify({ model: record.model, input, voice: 'alloy' }),
      signal: AbortSignal.timeout(120_000),
    },
    record.name,
    '语音',
  );
  const contentType = response.headers.get('content-type') ?? 'audio/mpeg';
  const mime = contentType.split(';')[0].trim() || 'audio/mpeg';
  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch {
    throw new MediaProviderError(
      `提供方「${record.name}」语音响应读取失败`,
    );
  }
  if (buffer.byteLength === 0) {
    throw new MediaProviderError(`提供方「${record.name}」语音响应为空`);
  }
  const base64 = Buffer.from(buffer).toString('base64');
  return { dataUri: `data:${mime};base64,${base64}`, mime };
}

// ───────────────────────── 视频 ─────────────────────────

/** 异步任务轮询间隔与总超时（免费档常态：排队可达数分钟）。 */
const VIDEO_POLL_INTERVAL_MS = 1_500;
const VIDEO_POLL_TIMEOUT_MS = 420_000;
/** 任务创建瞬态失败退避（队列满可持续 10 分钟以上——ride out 短时波动）。 */
const VIDEO_CREATE_RETRY_DELAYS_MS = [30_000, 60_000, 90_000, 120_000];
const POLL_RETRY_WAIT_MS = 5_000;

/** Seedance（火山方舟）契约判定：volcengine/volces/ark. 域 / api/v3 / seedance 模型名。 */
function isSeedanceContract(record: ProviderConfigRecord): boolean {
  const model = record.model.toLowerCase();
  const endpoint = record.baseUrl.toLowerCase();
  return (
    model.includes('seedance') ||
    endpoint.includes('volcengine') ||
    endpoint.includes('volces') ||
    /ark\./.test(endpoint) ||
    endpoint.includes('/api/v3')
  );
}

function extractTaskId(parsed: unknown): string | undefined {
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const json = parsed as Record<string, unknown>;
  for (const key of ['video_id', 'id', 'task_id', 'taskId']) {
    const value = json[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** 任务轮询瞬态等待（任务仍在队列里，不应因此判失败）。 */
async function pollWithRetry(
  pollUrl: string,
  headers: Record<string, string>,
  providerName: string,
): Promise<Response> {
  for (;;) {
    let response: Response;
    try {
      response = await fetch(pollUrl, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new MediaProviderError(
        `提供方「${providerName}」任务轮询网络失败`,
        true,
      );
    }
    if (response.ok) return response;
    const detail = await readProviderError(response);
    if (!detail.retryable) {
      const reason = detail.message.length > 0 ? `：${detail.message}` : '';
      throw new MediaProviderError(
        `提供方「${providerName}」任务轮询错误（HTTP ${response.status}）${reason}`,
        detail.retryable,
        response.status,
      );
    }
    await sleep(POLL_RETRY_WAIT_MS);
  }
}

/** 轮询直至终态（succeeded/completed → url；failed → 错误；超时 → 错误）。 */
async function pollUntilDone(
  pollUrl: string,
  headers: Record<string, string>,
  providerName: string,
  parsePoll: (parsed: unknown) => { status: string; progress?: number; url?: string },
  doneStatus: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const deadline = Date.now() + VIDEO_POLL_TIMEOUT_MS;
  for (;;) {
    await sleep(VIDEO_POLL_INTERVAL_MS);
    const response = await pollWithRetry(pollUrl, headers, providerName);
    let state: unknown;
    try {
      state = await response.json();
    } catch {
      throw new MediaProviderError(
        `提供方「${providerName}」轮询响应无法解析（非 JSON）`,
      );
    }
    const poll = parsePoll(state);
    if (poll.status === doneStatus) {
      if (poll.url !== undefined) return poll.url;
      throw new MediaProviderError(
        `提供方「${providerName}」任务完成但无产物地址`,
      );
    }
    if (poll.status === 'failed' || poll.status === 'fail') {
      throw new MediaProviderError(`提供方「${providerName}」任务失败`);
    }
    if (onProgress && poll.progress !== undefined) {
      onProgress(poll.progress);
    }
    if (Date.now() >= deadline) {
      throw new MediaProviderError(
        `提供方「${providerName}」任务超时（${VIDEO_POLL_TIMEOUT_MS / 1000}s 未完成）`,
        true,
      );
    }
  }
}

export async function generateVideo(
  record: ProviderConfigRecord,
  prompt: string,
  onProgress?: (progress: number) => void,
): Promise<MediaArtifact> {
  if (isSeedanceContract(record)) {
    // Seedance（火山方舟）异步任务契约：创建 + 轮询，产物 content.video_url。
    const response = await mediaFetch(
      `${baseUrl(record.baseUrl)}/contents/generations/tasks`,
      {
        method: 'POST',
        headers: bearerHeaders(record.apiKey ?? ''),
        body: JSON.stringify({
          model: record.model,
          content: [{ type: 'text', text: prompt }],
        }),
        signal: AbortSignal.timeout(120_000),
      },
      record.name,
      '视频',
    );
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new MediaProviderError(
        `提供方「${record.name}」视频任务响应无法解析（非 JSON）`,
      );
    }
    // 同步形态兜底（部分提供方直接返回产物 url）。
    const entry = firstDataEntry(parsed);
    const syncUrl =
      (entry !== null ? extractUrl(entry) : undefined) ??
      extractUrl(parsed as Record<string, unknown>);
    if (syncUrl !== undefined) {
      return { url: syncUrl, mime: 'video/mp4' };
    }
    const taskId = extractTaskId(parsed);
    if (taskId === undefined) {
      throw new MediaProviderError(
        `提供方「${record.name}」视频任务响应无产物地址或任务 id`,
      );
    }
    const url = await pollUntilDone(
      `${baseUrl(record.baseUrl)}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      bearerHeaders(record.apiKey ?? ''),
      record.name,
      (state) => {
        const json = (state ?? {}) as Record<string, unknown>;
        const status =
          typeof json.status === 'string'
            ? json.status.toLowerCase()
            : typeof json.state === 'string'
              ? json.state.toLowerCase()
              : '';
        let progress: number | undefined;
        if (typeof json.progress === 'number') progress = json.progress;
        let url: string | undefined;
        const content = json.content;
        if (content !== null && typeof content === 'object') {
          const c = content as Record<string, unknown>;
          if (typeof c.video_url === 'string' && c.video_url.length > 0) url = c.video_url;
          else if (typeof c.url === 'string' && c.url.length > 0) url = c.url;
        }
        return { status, progress, url };
      },
      'succeeded',
      onProgress,
    );
    return { url, mime: 'video/mp4' };
  }

  // Agnes 视频契约（Video 2.5 Flash）：/videos 创建任务 + /agnesapi 轮询。
  // 模式路由：keyframe > reference > text（本切片仅 text 模式——
  // 首尾帧/参考音频由后续切片开放）。
  const createTask = (): Promise<Response> =>
    mediaFetch(
      `${baseUrl(record.baseUrl)}/videos`,
      {
        method: 'POST',
        headers: bearerHeaders(record.apiKey ?? ''),
        body: JSON.stringify({
          model: record.model,
          prompt,
          mode: 'text',
          seconds: '4',
          size: '720P',
          aspect_ratio: '16:9',
        }),
        signal: AbortSignal.timeout(120_000),
      },
      record.name,
      '视频',
    );

  // 创建瞬态失败退避（队列满 ride out）；参数拒绝（400 非瞬态）立即报。
  let response: Response;
  let attemptIndex = 0;
  for (;;) {
    try {
      response = await createTask();
      break;
    } catch (error) {
      const transient =
        error instanceof MediaProviderError && error.retryable;
      if (transient && attemptIndex < VIDEO_CREATE_RETRY_DELAYS_MS.length) {
        await sleep(VIDEO_CREATE_RETRY_DELAYS_MS[attemptIndex]);
        attemptIndex += 1;
        continue;
      }
      throw error;
    }
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new MediaProviderError(
      `提供方「${record.name}」视频任务响应无法解析（非 JSON）`,
    );
  }
  const entry = firstDataEntry(parsed);
  const syncUrl =
    (entry !== null ? extractUrl(entry) : undefined) ??
    extractUrl(parsed as Record<string, unknown>);
  if (syncUrl !== undefined) {
    return { url: syncUrl, mime: 'video/mp4' };
  }
  const videoId = extractTaskId(parsed);
  if (videoId === undefined) {
    throw new MediaProviderError(
      `提供方「${record.name}」视频任务响应无产物地址或任务 id`,
    );
  }
  const url = await pollUntilDone(
    `${baseUrl(record.baseUrl)}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(record.model)}`,
    bearerHeaders(record.apiKey ?? ''),
    record.name,
    (state) => {
      const json = (state ?? {}) as Record<string, unknown>;
      const status =
        typeof json.status === 'string' ? json.status.toLowerCase() : '';
      let progress: number | undefined;
      if (typeof json.progress === 'number') progress = json.progress;
      const topUrl =
        typeof json.url === 'string' && json.url.length > 0 ? json.url : undefined;
      return { status, progress, url: topUrl };
    },
    'completed',
    onProgress,
  );
  return { url, mime: 'video/mp4' };
}

/** 复用 chat 侧的重试状态判定（导出供端点层映射错误码）。 */
export { isRetryableStatus };
