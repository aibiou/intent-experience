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
import {
  buildZhipuVideoCreate,
  parseZhipuCreateId,
  parseZhipuPoll,
  videoProviderOf,
} from './video-contract';

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
      return `${modalityLabel}生成服务暂时繁忙（排队或网络波动）——稍等片刻再说一次即可重试。（${error.message}）`;
    }
    return `${modalityLabel}生成没有成功——可以换个说法再试一次。（${error.message}）`;
  }
  return `${modalityLabel}生成没有成功——可以换个说法再试一次。`;
}

/** 画幅类型（官方支持 8 种宽高比；项目 UI 默认暴露
 * 3 种常用值，但后端全量接受——前端白名单逐步开放）。 */
export type AspectRatio =
  | '16:9' | '9:16' | '1:1'
  | '3:4' | '4:3' | '2:3' | '3:2' | '21:9';

/** 创作参数（前端透传——画幅 / 视频时长 / 参考图 / 高级参数；
 * 缺省用提供方默认，不改变既有生成行为）。 */
export interface GenerationOptions {
  /** 画幅（视频 aspect_ratio 直传；图像映射为官方
   * size 档位 + ratio 组合——官方图像文档）。 */
  aspectRatio?: AspectRatio;
  /** 视频时长（官方契约 "4"–"12" 秒）。 */
  seconds?: '4' | '6' | '8' | '12';
  /** 参考图（dataURI 数组，≤3 张——图生图：官方
   * extra_body.image 契约，生成与参考图主体一致）。 */
  referenceImages?: string[];
  /** 语音音色（speaker ID——豆包语音 2.0 音色库；
   * 不传即提供方默认音色）。 */
  voice?: string;
  /** 图像尺寸档位（官方 size 参数——1K/2K/3K/4K；
   * 缺省 "2K"，与既有像素量级一致）。 */
  imageTier?: '1K' | '2K' | '3K' | '4K';
  /** 视频首帧图片 URL（keyframe 模式——官方
   * first_frame 参数，与 lastFrame 至少提供一个）。 */
  firstFrame?: string;
  /** 视频尾帧图片 URL（keyframe 模式——官方
   * last_frame 参数，与 firstFrame 至少提供一个）。 */
  lastFrame?: string;
  /** 视频参考音频 URL 数组（reference 模式——官方
   * audios 参数，Flash 最多 3 段）。 */
  referenceAudios?: string[];
  /** 随机种子（视频官方 seed 参数——可复现结果）。 */
  seed?: number;
}

// 画幅 → 官方 ratio（官方图像文档：
// size 档位 + ratio 组合，替代历史精确像素写法。
// 档位默认 2K——与既有像素量级一致，保证出图质量不降）。
const DEFAULT_IMAGE_TIER = '2K';

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
  // 瞬态自动重试一次：网络波动 / 限速 / 队列满 / 服务端临时
  // 错误（免费档常态）——等待 2s 后重发，两次仍失败才向上抛。
  // 间歇性失败在产品内消化，用户无感；不把「服务正忙」甩给
  // 用户自己重试。
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const isLastAttempt = attempt === 2;
    let response: Response;
    try {
      response = await fetch(`${baseUrl(config.endpoint)}${path}`, {
        method: 'POST',
        headers: headers(config.apiKey),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      // 网络失败（超时 / 连接中断——dev 冷启动、上游波动均属
      // 此类）：非末次则重试一次；仍失败标记可重试，文案指向
      // 「稍后再试」而非「换说法」。
      if (!isLastAttempt) {
        await sleep(2_000);
        continue;
      }
      throw new GenerationError(
        `generation provider network failure (provider=${config.provider}, modality=${config.modality})`,
        config.modality,
        true,
      );
    }
    if (response.ok) return response;
    // 错误体透传：提供方返回人类可读原因
    // （如「视频队列已满，请稍后重试」）——
    // 丢弃它会让用户面对一个无法行动的
    // 状态码。瞬态失败标记 retryable。
    const detail = await readProviderError(response);
    if (!isLastAttempt && detail.retryable) {
      await sleep(2_000);
      continue;
    }
    const reason = detail.message.length > 0 ? `: ${detail.message}` : '';
    throw new GenerationError(
      `generation provider failed (provider=${config.provider}, modality=${config.modality}, status=${response.status}${reason})`,
      config.modality,
      detail.retryable,
      response.status,
    );
  }
  // 不可达（循环两轮必抛）——类型收口。
  throw new GenerationError(
    `generation provider failed (provider=${config.provider}, modality=${config.modality})`,
    config.modality,
  );
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

/** 异步任务轮询间隔与总超时（视频官方
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

/** 任务 ID（异步任务——video_id 优先，
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

/**
 * 视频契约路由：Seedance（火山方舟豆包——POST
 * /contents/generations/tasks 异步任务 + GET
 * /contents/generations/tasks/{id} 轮询，产物在 content.video_url）
 * 与官方（/v1/videos + /agnesapi 轮询）两套契约不同——按模型名 /
 * 端点域判定，避免把 Seedance 请求发到官方契约（实测经第三方
 * OpenAI 兼容网关转发视频会被网关无 /v1/videos 路由拒成 400；
 * 走提供方官方端点后契约正确、仅剩队列瞬态 503——网关能力边界，
 * 非产品参数缺陷）。
 */
function isSeedanceContract(config: EnabledProviderConfig): boolean {
  const model = config.model.toLowerCase();
  const endpoint = config.endpoint.toLowerCase();
  return (
    model.includes('seedance') ||
    endpoint.includes('volcengine') ||
    endpoint.includes('volces') ||
    /ark\./.test(endpoint) ||
    endpoint.includes('/api/v3')
  );
}

/**
 * Seedance（火山方舟豆包）视频契约执行器——异步任务：
 * POST {base}/contents/generations/tasks 创建（content[0].text
 * 承载提示词），保存 task id 后轮询
 * GET {base}/contents/generations/tasks/{id} 直至 succeeded，
 * 产物在 content.video_url。免费档常态排队/限速——错误映射与
 * 退避复用 callProvider / readProviderError（瞬态 status 标记
 * retryable），轮询用与官方相同的间隔 / 超时纪律。
 */
async function generateVideoSeedance(
  config: EnabledProviderConfig,
  prompt: string,
  onProgress?: (progress: number) => void,
  _options?: GenerationOptions,
): Promise<GenerationArtifact> {
  const response = await callProvider(config, '/contents/generations/tasks', {
    model: config.model,
    content: [{ type: 'text', text: prompt }],
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
    throw new GenerationError(
      `generation provider response malformed (provider=${config.provider}, modality=video: no artifact url or task id)`,
      'video',
    );
  }
  const pollUrl = `${baseUrl(config.endpoint)}/contents/generations/tasks/${encodeURIComponent(taskId)}`;
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
      const detail = await readProviderError(status);
      if (!detail.retryable) {
        const reason = detail.message.length > 0 ? `: ${detail.message}` : '';
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
    const poll = parseSeedancePoll(state);
    if (poll.status === 'succeeded') {
      if (poll.url !== undefined) {
        return { url: poll.url, mime: 'video/mp4' };
      }
      throw new GenerationError(
        `generation provider response malformed (provider=${config.provider}, modality=video: task completed without url)`,
        'video',
      );
    }
    if (poll.status === 'failed') {
      throw new GenerationError(
        `generation provider task failed (provider=${config.provider}, modality=video: task failed)`,
        'video',
      );
    }
    if (onProgress && poll.progress !== undefined) {
      onProgress(poll.progress);
    }
    if (Date.now() >= deadline) {
      throw new GenerationError(
        `generation provider timeout (provider=${config.provider}, modality=video: task not completed within ${VIDEO_POLL_TIMEOUT_MS / 1000}s)`,
        'video',
      );
    }
  }
}

/** Seedance 轮询响应解析（status / content.video_url / progress）。 */
function parseSeedancePoll(parsed: unknown): {
  status: string;
  progress?: number;
  url?: string;
} {
  if (parsed === null || typeof parsed !== 'object') {
    return { status: '' };
  }
  const record = parsed as Record<string, unknown>;
  const status =
    typeof record.status === 'string'
      ? record.status.toLowerCase()
      : typeof record.state === 'string'
        ? record.state.toLowerCase()
        : '';
  let progress: number | undefined;
  if (typeof record.progress === 'number') progress = record.progress;
  const content = record.content;
  let url: string | undefined;
  if (content !== null && typeof content === 'object') {
    const c = content as Record<string, unknown>;
    if (typeof c.video_url === 'string' && c.video_url.length > 0) url = c.video_url;
    else if (typeof c.url === 'string' && c.url.length > 0) url = c.url;
  }
  return { status, progress, url };
}

/** 取异步任务 id（video_id / id / task_id 兜底——兼容各家）。 */
function extractTaskId(parsed: unknown): string | undefined {
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  for (const key of ['video_id', 'id', 'task_id', 'taskId']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * 智谱（CogVideoX / Vidu）视频契约执行器——OpenAI 兼容
 * 异步任务：POST /videos/generations 创建（model/prompt，
 * 可选 size/duration），保存 id 后轮询
 * GET {base}/async-result/{id}，task_status=SUCCESS 时取
 * data[0].url / video_result。请求体 / 响应解析为纯函数
 * （video-contract.ts——单测锁定）；网络与轮询纪律与
 * 官方 / seedance 一致。
 */
async function generateVideoZhipu(
  config: EnabledProviderConfig,
  prompt: string,
  onProgress?: (progress: number) => void,
  options?: GenerationOptions,
): Promise<GenerationArtifact> {
  const response = await callProvider(config, '/videos/generations', {
    ...buildZhipuVideoCreate(config.model, prompt, options),
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
  const entry = firstDataEntry(parsed);
  const syncUrl =
    (entry !== null ? extractUrl(entry) : undefined) ??
    extractUrl(parsed as Record<string, unknown>);
  if (syncUrl !== undefined) {
    return { url: syncUrl, mime: 'video/mp4' };
  }
  const videoId = parseZhipuCreateId(parsed);
  if (videoId === undefined) {
    throw new GenerationError(
      `generation provider response malformed (provider=${config.provider}, modality=video: no artifact url or task id)`,
      'video',
    );
  }
  const pollUrl = `${baseUrl(config.endpoint)}/async-result/${encodeURIComponent(videoId)}`;
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
      const detail = await readProviderError(status);
      if (!detail.retryable) {
        const reason = detail.message.length > 0 ? `: ${detail.message}` : '';
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
    const poll = parseZhipuPoll(state);
    if (poll.status.toUpperCase() === 'SUCCESS') {
      if (poll.url !== undefined) {
        return { url: poll.url, mime: 'video/mp4' };
      }
      throw new GenerationError(
        `generation provider response malformed (provider=${config.provider}, modality=video: task completed without url)`,
        'video',
      );
    }
    if (poll.status.toUpperCase() === 'FAIL') {
      throw new GenerationError(
        `generation provider task failed (provider=${config.provider}, modality=video: task failed)`,
        'video',
      );
    }
    if (onProgress && poll.progress !== undefined) {
      onProgress(poll.progress);
    }
    if (Date.now() >= deadline) {
      throw new GenerationError(
        `generation provider timeout (provider=${config.provider}, modality=video: task not completed within ${VIDEO_POLL_TIMEOUT_MS / 1000}s)`,
        'video',
      );
    }
  }
}

export async function generateImage(
  config: EnabledProviderConfig,
  prompt: string,
  _onProgress?: (progress: number) => void,
  options?: GenerationOptions,
): Promise<GenerationArtifact> {
  // 官方契约（官方图像文档）：size 用档位
  // （1K/2K/3K/4K），ratio 指定宽高比；response_format 放
  // extra_body 内（官方警告：勿放顶层）。
  const hasRatio = options?.aspectRatio !== undefined;
  const tier = options?.imageTier ?? DEFAULT_IMAGE_TIER;
  const refs = options?.referenceImages ?? [];
  // 参考图透传日志（CR-61 实证链——确认 dataURI 参考图确实到达
  // 生成网关；仅打长度与来源，不含敏感内容）。
  if (refs.length > 0) {
    console.log(
      `[image-gen] referenceImages=${refs.length} first=${refs[0]?.slice(0, 32)}… len=${refs[0]?.length ?? 0}`,
    );
  }
  // 三段调用形态：带画幅 + 带参考图 → 仅参考图（画幅被拒）→
  // 裸调用（参考图也被拒——保底出图，文生图契约兜底）。
  // extra_body 始终含 response_format:"url"（官方推荐——
  // 图生图时叠加 image 数组）。
  const call = (withSize: boolean, withRefs: boolean) =>
    callProvider(config, '/images/generations', {
      model: config.model,
      prompt,
      n: 1,
      ...(withSize && hasRatio
        ? { size: tier, ratio: options!.aspectRatio }
        : {}),
      extra_body: {
        response_format: 'url',
        ...(withRefs && refs.length > 0 ? { image: refs } : {}),
      },
    });
  let response: Response;
  try {
    response = await call(hasRatio, refs.length > 0);
  } catch (error) {
    // 参数兼容降级：显式画幅被提供方拒绝（400 且非瞬态）
    // → 无画幅重试（仍带参考图——图生图意图优先于画幅）；
    // 再被拒 → 裸重试（丢参考图保底出图）。
    if (
      hasRatio &&
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

/**
 * 豆包语音（火山引擎）契约判定：openspeech 域 / tts·audio
 * 模型名——X-Api-Key 单头鉴权 + /api/v3/tts/create 非流式
 * 音频生成（响应 audio base64 或 url），与 OpenAI 兼容
 * /audio/speech（Bearer 鉴权）协议不同，须走独立适配器。
 */
function isDoubaoVoiceContract(config: EnabledProviderConfig): boolean {
  const model = config.model.toLowerCase();
  const endpoint = config.endpoint.toLowerCase();
  return (
    endpoint.includes('openspeech') ||
    model.includes('tts') ||
    model.includes('audio')
  );
}

async function generateVoiceDoubao(
  config: EnabledProviderConfig,
  prompt: string,
  speaker?: string,
): Promise<GenerationArtifact> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl(config.endpoint)}/api/v3/tts/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.apiKey,
      },
      body: JSON.stringify({
        model: config.model,
        text_prompt: prompt,
        audio_config: { format: 'mp3', sample_rate: 48000 },
        ...(speaker !== undefined && speaker.length > 0 ? { speaker } : {}),
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new GenerationError(
      `generation provider network failure (provider=${config.provider}, modality=voice)`,
      'voice',
      true,
    );
  }
  if (!response.ok) {
    const detail = await readProviderError(response);
    const reason = detail.message.length > 0 ? `: ${detail.message}` : '';
    throw new GenerationError(
      `generation provider failed (provider=${config.provider}, modality=voice, status=${response.status}${reason})`,
      'voice',
      detail.retryable,
      response.status,
    );
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new GenerationError(
      `generation provider response malformed (provider=${config.provider}, modality=voice: non-JSON body)`,
      'voice',
    );
  }
  const record = parsed as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.length > 0 ? record.url : undefined;
  if (url !== undefined) {
    return { url, mime: 'audio/mpeg' };
  }
  const audio =
    typeof record.audio === 'string' && record.audio.length > 0 ? record.audio : undefined;
  if (audio !== undefined) {
    return { dataUri: `data:audio/mpeg;base64,${audio}`, mime: 'audio/mpeg' };
  }
  throw new GenerationError(
    `generation provider response malformed (provider=${config.provider}, modality=voice: no url or audio)`,
    'voice',
  );
}

export async function generateVoice(
  config: EnabledProviderConfig,
  prompt: string,
  _onProgress?: (progress: number) => void,
  options?: GenerationOptions,
): Promise<GenerationArtifact> {
  // 契约路由：豆包语音走自有 /api/v3/tts/create 适配器
  // （options.voice 透传 2.0 音色库 speaker）；
  // 否则按 OpenAI 兼容 /audio/speech（原实现，纯增量零回归）。
  if (isDoubaoVoiceContract(config)) {
    return generateVoiceDoubao(config, prompt, options?.voice);
  }
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
  // 契约路由：Seedance（火山方舟豆包）用其自有异步任务契约；
  // 否则按官方契约（下方原实现，纯增量零回归）。
  if (isSeedanceContract(config)) {
    return generateVideoSeedance(config, prompt, onProgress, options);
  }
  // 智谱（CogVideoX / Vidu）——OpenAI 兼容 /videos/generations 契约。
  if (videoProviderOf(config) === 'zhipu') {
    return generateVideoZhipu(config, prompt, onProgress, options);
  }
  // 官方文档契约（官方视频文档，
  // OpenAI Videos 兼容异步任务接口）：POST /videos 创建任务
  // （mode 为生成模式 text/keyframe/reference；size 固定 "720P"；
  // seconds 为字符串 "4"–"12"），保存 video_id 后轮询
  // GET /agnesapi?video_id=&model_name= 直至 status=completed，
  // 产物在响应顶层 url。注意与视频 v2.0 的文档是两代
  // 契约（V2.0 用 width/height/num_frames、产物在 metadata.url
  // ——对本模型发 height 会被 400「禁止字段」拒绝，实测 2026-10-11）。
  // 503 = 服务忙（队列满）——按瞬态退避重试处理。
  // 创作参数：画幅 / 时长由前端透传（缺省 16:9 / 4s 保持
  // 原行为）；自定义参数被 400 拒绝时降级默认参数重试
  // （契约容差——时长/画幅档位可能随提供方收窄）。
  //
  // 模式路由（官方视频文档 §生成模式规则）：
  // - keyframe：有 firstFrame / lastFrame 时启用——首尾帧控制。
  // - reference：有公开 URL 参考图 / 参考音频时启用——多模态参考。
  // - text：无媒体输入时默认——纯文本生成。
  // Flash 限制：images ≤5、audios ≤3、videos 不支持。
  const hasCustomParams =
    options?.aspectRatio !== undefined || options?.seconds !== undefined;
  let useCustomParams = hasCustomParams;

  // keyframe 模式（首尾帧控制——官方 first_frame / last_frame）。
  const hasKeyframe =
    options?.firstFrame !== undefined || options?.lastFrame !== undefined;

  // reference 模式：有公开 URL 参考图时走 reference 模式——
  // 会话内全部分集图作为角色 / 场景参考（≤5），视频连续剧
  // 逐集保持角色一致；无参考图回退 text 模式。dataURI 不
  // 适合视频参考（官方要求公开可访问 URL）——过滤之。
  const videoRefs = (options?.referenceImages ?? []).filter((ref) =>
    ref.startsWith('http'),
  );
  // reference 模式参考音频（官方 audios 参数——Flash ≤3 段）。
  const videoAudios = (options?.referenceAudios ?? []).filter((ref) =>
    ref.startsWith('http'),
  );
  let useRefs = videoRefs.length > 0 || videoAudios.length > 0;
  let useKeyframe = hasKeyframe;

  // seed 参数（官方 seed integer——可复现结果）。
  const seed = options?.seed;

  const createTask = () => {
    // 模式优先级：keyframe > reference > text（互斥——
    // 官方 §生成模式规则：keyframe 不允许 images/audios；
    // reference 不允许 first_frame/last_frame）。
    let mode: 'text' | 'keyframe' | 'reference' = 'text';
    let extraFields: Record<string, unknown> = {};
    if (useKeyframe) {
      mode = 'keyframe';
      if (options?.firstFrame) extraFields.first_frame = options.firstFrame;
      if (options?.lastFrame) extraFields.last_frame = options.lastFrame;
    } else if (useRefs) {
      mode = 'reference';
      // 参考图 ≤5、参考音频 ≤3（Flash 限制）。
      if (videoRefs.length > 0) extraFields.images = videoRefs.slice(0, 5);
      if (videoAudios.length > 0) extraFields.audios = videoAudios.slice(0, 3);
    }
    return callProvider(config, '/videos', {
      model: config.model,
      prompt,
      mode,
      seconds: useCustomParams && options?.seconds !== undefined ? options.seconds : '4',
      size: '720P',
      aspect_ratio:
        useCustomParams && options?.aspectRatio !== undefined
          ? options.aspectRatio
          : '16:9',
      ...(seed !== undefined ? { seed } : {}),
      ...extraFields,
    });
  };
  const retryDelays = [...VIDEO_CREATE_RETRY_DELAYS_MS];
  // 瞬态失败退避重试：限速 / 队列满时
  // 等待比立即失败更接近成功。
  let response: Response;
  for (;;) {
    try {
      response = await createTask();
      break;
    } catch (error) {
      // 参数拒绝降级：自定义画幅 / 时长 / keyframe / 参考模式被 400 拒绝
      // → 先降 keyframe（保底参考或文本），再降参考模式，再降参数；逐级保出图。
      if (
        error instanceof GenerationError &&
        !error.retryable &&
        error.status === 400
      ) {
        if (useKeyframe) {
          useKeyframe = false;
          continue;
        }
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
