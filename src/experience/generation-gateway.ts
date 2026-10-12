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
    /** 瞬态失败（限速 / 队列满 / 5xx）——
     * 调用方可退避重试。 */
    public readonly retryable = false,
    /** 提供方 HTTP 状态码（参数兼容降级判定——
     * 400 表示请求体字段被拒绝）。 */
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

/**
 * 生成失败人性化文案（体验流 withGeneration / 直接生成
 * /api/generate 两路共用——展示纪律统一：用户面对的不再是
 * 「出错了」或提供方原文）：瞬态失败给重试指引，余额类失败
 * 指引充值，其余失败给换法指引；提供方技术细节保留在尾部
 * 括注供排障（前端 splitGenerationDetail 拆为次行），
 * 不含 key、不含请求体。
 */
export function humanizeGenerationFailure(
  error: unknown,
  modality: 'image' | 'voice' | 'video',
): string {
  const modalityLabel =
    modality === 'image' ? '图像' : modality === 'video' ? '视频' : '语音';
  if (error instanceof GenerationError) {
    if (/quota|余额/i.test(error.message)) {
      // 余额类失败（非瞬态）——重试 / 换说法都无效，
      // 指引直指充值。
      return `生成账户余额不足——充值后到「模型配置」确认启用，再说一次即可。`;
    }
    if (error.retryable) {
      return `${modalityLabel}生成暂时排队繁忙——稍等片刻再说一次即可重试。（${error.message}）`;
    }
    return `${modalityLabel}生成没有成功——可以换个说法再试一次。（${error.message}）`;
  }
  return `${modalityLabel}生成没有成功——可以换个说法再试一次。`;
}

/** 创作参数（前端透传——画幅 / 视频时长 / 参考图；缺省用
 * 提供方默认，不改变既有生成行为）。 */
export interface GenerationOptions {
  /** 画幅（视频 aspect_ratio 直传；图像映射为
   * OpenAI images 契约的 size 三档）。 */
  aspectRatio?: '16:9' | '9:16' | '1:1';
  /** 视频时长（官方契约 "4"–"12" 秒）。 */
  seconds?: '4' | '6' | '8' | '12';
  /** 参考图（dataURI 数组，≤3 张——图生图：Agnes
   * extra_body.image 契约，生成与参考图主体一致）。 */
  referenceImages?: string[];
}

// 画幅 → 图像尺寸（OpenAI images 兼容契约——聚合
// 提供方普遍接受的三档；不发送即提供方默认）。
const IMAGE_SIZES: Record<string, string> = {
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '1:1': '1024x1024',
};

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
    // 错误体透传：提供方返回人类可读原因
    // （如「视频队列已满，请稍后重试」）——
    // 丢弃它会让用户面对一个无法行动的
    // 状态码。瞬态失败标记 retryable。
    const detail = await readProviderError(response);
    const reason = detail.message.length > 0 ? `: ${detail.message}` : '';
    throw new GenerationError(
      `generation provider failed (provider=${config.provider}, modality=${config.modality}, status=${response.status}${reason})`,
      config.modality,
      detail.retryable,
      response.status,
    );
  }
  return response;
}

// 瞬态失败：限速 / 队列满 / 服务端临时
// 错误——等待后重试通常可恢复（免费档
// 常态，非产品缺陷）。
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set([
  'rate_limit_exceeded',
  'video_queue_full',
  'queue_full',
  'server_overloaded',
  'internal_error',
  'try_again',
]);

interface ProviderErrorDetail {
  message: string;
  retryable: boolean;
}

/** 提供方错误体解析（message / error /
 * code 三形态——不含 key、不含请求体）。 */
async function readProviderError(response: Response): Promise<ProviderErrorDetail> {
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
    // 非 JSON 错误体——仅用状态码。
  }
  const retryable =
    RETRYABLE_STATUS.has(response.status) ||
    (code !== undefined && RETRYABLE_CODES.has(code));
  return { message, retryable };
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
  // 官方文档：任务完成响应的产物地址在 metadata.url。
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

/** 异步任务轮询间隔与总超时（Agnes 视频官方
 * 建议每 1–2 秒查询一次；生成通常需数十秒）。 */
const VIDEO_POLL_INTERVAL_MS = 1_500;
// 免费档常态：任务入队后排队可达数分钟
// （实测约 2 分钟才开始处理），总超时
// 须容纳排队 + 处理——过短会把正在
// 处理的任务误判为失败。
const VIDEO_POLL_TIMEOUT_MS = 420_000;
// 任务创建瞬态失败重试（免费档限速 / 队列满常见——
// 实测「视频队列已满」可持续 10 分钟以上，退避 4 段
// 约 5 分钟，尽量 ride out 短时队列波动；仍满则把
// 重试指引交给用户）。重试等待期进度 0 =「排队中」。
const VIDEO_CREATE_RETRY_DELAYS_MS = [30_000, 60_000, 90_000, 120_000];
// 轮询自身瞬态失败（限速）的等待——
// 任务仍在队列里，不应因此判失败。
const POLL_RETRY_WAIT_MS = 5_000;

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
  _onProgress?: (progress: number) => void,
  options?: GenerationOptions,
): Promise<GenerationArtifact> {
  const size =
    options?.aspectRatio !== undefined
      ? IMAGE_SIZES[options.aspectRatio]
      : undefined;
  const refs = options?.referenceImages ?? [];
  // 三段调用形态：带画幅 + 带参考图 → 仅参考图（画幅被拒）→
  // 裸调用（参考图也被拒——保底出图，文生图契约兜底）。
  const call = (withSize: boolean, withRefs: boolean) =>
    callProvider(config, '/images/generations', {
      model: config.model,
      prompt,
      n: 1,
      ...(withSize && size !== undefined ? { size } : {}),
      ...(withRefs && refs.length > 0
        ? { extra_body: { image: refs } }
        : {}),
    });
  let response: Response;
  try {
    response = await call(size !== undefined, refs.length > 0);
  } catch (error) {
    // 参数兼容降级：显式画幅被提供方拒绝（400 且非瞬态）
    // → 无画幅重试（仍带参考图——图生图意图优先于画幅）；
    // 再被拒 → 裸重试（丢参考图保底出图）。
    if (
      size !== undefined &&
      error instanceof GenerationError &&
      !error.retryable &&
      error.status === 400
    ) {
      try {
        response = await call(false, refs.length > 0);
      } catch (retryError) {
        if (
          refs.length > 0 &&
          retryError instanceof GenerationError &&
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
  options?: GenerationOptions,
): Promise<GenerationArtifact> {
  // 官方文档契约（Agnes Video 2.5 Flash——docs/agnes-video-25-flash，
  // OpenAI Videos 兼容异步任务接口）：POST /videos 创建任务
  // （mode 为生成模式 text/keyframe/reference；size 固定 "720P"；
  // seconds 为字符串 "4"–"12"），保存 video_id 后轮询
  // GET /agnesapi?video_id=&model_name= 直至 status=completed，
  // 产物在响应顶层 url。注意与 agnes-video-v2.0 的文档是两代
  // 契约（V2.0 用 width/height/num_frames、产物在 metadata.url
  // ——对本模型发 height 会被 400「禁止字段」拒绝，实测 2026-10-11）。
  // 503 = 服务忙（队列满）——按瞬态退避重试处理。
  // 创作参数：画幅 / 时长由前端透传（缺省 16:9 / 4s 保持
  // 原行为）；自定义参数被 400 拒绝时降级默认参数重试
  // （契约容差——时长/画幅档位可能随提供方收窄）。
  const hasCustomParams =
    options?.aspectRatio !== undefined || options?.seconds !== undefined;
  let useCustomParams = hasCustomParams;
  // 系列参考模式：有公开 URL 参考图时走 reference 模式——
  // 会话内全部分集图作为角色 / 场景参考（≤5），视频连续剧
  // 逐集保持角色一致；无参考图回退 text 模式。dataURI 不
  // 适合视频参考（官方要求公开可访问 URL）——过滤之。
  const videoRefs = (options?.referenceImages ?? []).filter((ref) =>
    ref.startsWith('http'),
  );
  let useRefs = videoRefs.length > 0;
  const createTask = () =>
    callProvider(config, '/videos', {
      model: config.model,
      prompt,
      ...(useRefs
        ? { mode: 'reference', images: videoRefs.slice(0, 5) }
        : { mode: 'text' }),
      seconds: useCustomParams && options?.seconds !== undefined ? options.seconds : '4',
      size: '720P',
      aspect_ratio:
        useCustomParams && options?.aspectRatio !== undefined
          ? options.aspectRatio
          : '16:9',
    });
  const retryDelays = [...VIDEO_CREATE_RETRY_DELAYS_MS];
  // 瞬态失败退避重试：限速 / 队列满时
  // 等待比立即失败更接近成功。
  let response: Response;
  for (;;) {
    try {
      response = await createTask();
      break;
    } catch (error) {
      // 参数拒绝降级：自定义画幅 / 时长 / 参考模式被 400 拒绝
      // → 先降参考模式（保底文本生成），再降参数；逐级保出图。
      if (
        error instanceof GenerationError &&
        !error.retryable &&
        error.status === 400
      ) {
        if (useRefs) {
          useRefs = false;
          continue;
        }
        if (useCustomParams) {
          useCustomParams = false;
          continue;
        }
        throw error;
      }
      const retryable =
        error instanceof GenerationError && error.retryable;
      if (!retryable || retryDelays.length === 0) {
        throw error;
      }
      const wait = retryDelays.shift();
      if (wait === undefined) throw error;
      // 重试等待期间保持前端反馈——
      // 进度 0 即「排队中」态，否则
      // 用户面对两分钟无反馈的「生成中」。
      onProgress?.(0);
      await sleep(wait);
    }
  }
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
      // 轮询瞬态失败（限速）：任务仍在
      // 队列里——等待后继续轮询，而非
      // 判任务失败。
      const detail = await readProviderError(status);
      if (!detail.retryable) {
        const reason =
          detail.message.length > 0 ? `: ${detail.message}` : '';
        throw new GenerationError(
          `generation provider failed (provider=${config.provider}, modality=video: task poll status=${status.status}${reason})`,
          'video',
        );
      }
      await sleep(POLL_RETRY_WAIT_MS);
      continue;
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
      const failed = state as {
        error?: unknown;
        message?: unknown;
        code?: unknown;
      };
      const reason =
        typeof failed.error === 'string' && failed.error.length > 0
          ? failed.error
          : typeof failed.message === 'string' && failed.message.length > 0
            ? failed.message
            : typeof failed.code === 'string' && failed.code.length > 0
              ? failed.code
              : 'unknown';
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
    options?: GenerationOptions,
  ) => Promise<GenerationArtifact>
 > = {
  image: generateImage,
  voice: generateVoice,
  video: generateVideo,
};
