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
 *   任务 + 轮询，产物 content.video_url）；本机桥接契约
 *   （豆包 App 桥接 127.0.0.1:3220 → 同步 /videos/generations）；
 *   否则 Agnes 契约
 *   （/videos 创建 + /agnesapi?video_id=&model_name= 轮询，
 *   产物顶层 url）
 *
 * 瞬态纪律（与 chat 一致）：网络异常 / 408/5xx 等 2 秒
 * 重试 1 次；限速（429）按官方指引等 1 分钟；4xx 立即报。
 * 视频队列满（503/queue_full）按退避序列 [30s,60s,90s,120s]
 * ride out 短时波动。
 *
 * 错误纪律：错误信息仅含 provider / 状态码 / 提供方原文
 * 片段——不含 key、不含完整请求体。
 */

import type { ProviderConfigRecord } from '../config-store';
import { isRetryableStatus, transientDelayMs } from '../retry';
import {
  buildHunyuanImageRequest,
  imageProviderOf,
  parseHunyuanImageUrl,
  type ImageAspectRatio,
} from './image-contract';

/** 统一产物形态：远程 url 或内联 dataUri（二选一）。 */
export interface MediaArtifact {
  url?: string;
  dataUri?: string;
  mime: string;
  /** 请求携带参考图时，提供方是否真正消费（图像→视频诚实边界）。 */
  referenceApplied?: boolean;
}

/**
 * 视频参考图消费判定（G1.1 图像→视频）——本地产品产物是
 * dataURI，云端视频契约通常只消费 http(s) 参考。只有
 * Agnes / 本机桥接契约在有 http 参考时才会挂载 images；
 * Seedance 契约当前未实现图像输入。判定结果随产物回传，
 * 产品据此决定是否如实说明「按画面描述降级生成」。
 */
export function resolveVideoReferencePlan(
  record: ProviderConfigRecord,
  refs: readonly string[] | undefined,
): { requested: boolean; applied: boolean; images: string[] } {
  const requested = (refs?.length ?? 0) > 0;
  if (isSeedanceContract(record)) {
    return { requested, applied: false, images: [] };
  }
  const images = (refs ?? [])
    .filter((ref) => ref.startsWith('http'))
    .slice(0, 5);
  return { requested, applied: images.length > 0, images };
}

export class MediaProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
    public readonly status?: number,
    public readonly failoverBlocked = false,
    /** 提供方队列满：同提供方不再排队重试（防反复提交，2026-10-19 真实
     *  E2E——Agnes 视频队列满时旧逻辑最多重投 5 轮）；仍允许故障转移到其它候选。 */
    public readonly queueFull = false,
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
    // 队列满不重试同提供方（再投只会排进同一个满队列；
    // 用户约束：满了就不要反复试视频生成——2026-10-19）。
    if (!isLast && detail.retryable && !detail.queueFull) {
      // 退避按状态选择：限速（429）按官方指引
      // 等待 1 分钟，其余瞬态 2 秒。
      await sleep(transientDelayMs(response.status));
      continue;
    }
    const reason = detail.message.length > 0 ? `：${detail.message}` : '';
    throw new MediaProviderError(
      detail.queueFull
        ? `提供方「${providerName}」队列已满（${modality}，HTTP ${response.status}），未继续排队重试${reason}`
        : `提供方「${providerName}」返回错误（${modality}，HTTP ${response.status}）${reason}`,
      detail.retryable,
      response.status,
      false,
      detail.queueFull,
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

const QUEUE_FULL_CODES = new Set(['video_queue_full', 'queue_full']);
const QUEUE_FULL_PATTERN = /queue[ _-]?is[ _-]?full|队列已满/i;

/** 提供方错误体解析（message / error / code 三形态）+ 队列满识别。
 * 纯函数：状态码 + 已解析 JSON → 归一化错误详情（供测试锁定）。 */
export function classifyProviderError(
  status: number,
  payload: unknown,
): { message: string; code?: string; retryable: boolean; queueFull: boolean } {
  let message = '';
  let code: string | undefined;
  if (payload !== null && typeof payload === 'object') {
    const record = payload as { message?: unknown; error?: unknown; code?: unknown };
    if (typeof record.message === 'string' && record.message.length > 0) {
      message = record.message;
    } else if (typeof record.error === 'string' && record.error.length > 0) {
      message = record.error;
    } else if (record.error !== null && typeof record.error === 'object') {
      const nested = (record.error as { message?: unknown }).message;
      if (typeof nested === 'string' && nested.length > 0) message = nested;
    }
    if (typeof record.code === 'string' && record.code.length > 0) {
      code = record.code;
    }
  }
  return {
    message,
    ...(code !== undefined ? { code } : {}),
    retryable:
      RETRYABLE_STATUS.has(status) ||
      (code !== undefined && RETRYABLE_CODES.has(code)),
    queueFull:
      (code !== undefined && QUEUE_FULL_CODES.has(code)) ||
      QUEUE_FULL_PATTERN.test(message),
  };
}

/** 提供方错误体读取（响应体 + 状态码 → 归一化详情）。 */
async function readProviderError(response: Response): Promise<{
  message: string;
  retryable: boolean;
  queueFull: boolean;
}> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // 非 JSON 错误体——仅用状态码
  }
  return classifyProviderError(response.status, payload);
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

/** 元宝页面本来就会产出 4 个候选；桥接只决定取回几张。
 * 全量取回可把已经产生的上游产物转成用户可选项，不额外触发生成。 */
const MAX_IMAGE_CANDIDATES = 4;

/** 目前只有本机桥接能稳定把 n 映射为页面候选下载数量；
 * 官方 OpenAI 兼容端点可能只允许 n=1，不能把本机约定强加过去。 */
function supportsImageCandidateCount(record: ProviderConfigRecord): boolean {
  return (
    record.baseUrl.toLowerCase().startsWith('http://127.0.0.1:') ||
    record.baseUrl.toLowerCase().startsWith('http://localhost:') ||
    record.model.toLowerCase().includes('app-local')
  );
}

/** 元宝主窗口是否真的可自动化；进程活着不等于 AX 输入区可用。 */
async function assertYuanbaoBridgeReady(
  record: ProviderConfigRecord,
): Promise<void> {
  if (!record.model.toLowerCase().includes('yuanbao-app-local')) return;
  let health: Response;
  try {
    health = await fetch(`${new URL(record.baseUrl).origin}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    throw new MediaProviderError(
      `元宝本机桥接不可达：${error instanceof Error ? error.message : String(error)}`,
      false,
      undefined,
      true,
    );
  }
  if (!health.ok) {
    throw new MediaProviderError(
      `元宝本机桥接健康检查失败（HTTP ${health.status}）`,
      false,
      undefined,
      true,
    );
  }
  let payload: {
    ready?: unknown;
    trusted?: unknown;
    yuanbaoRunning?: unknown;
  } | null = null;
  try {
    payload = (await health.json()) as { ready?: unknown };
  } catch {
    payload = null;
  }
  if (payload?.ready === true) return;
  if (payload?.ready === false) {
    throw new MediaProviderError(
      '元宝主窗口当前不可自动化——请打开元宝主窗口后重试',
      false,
      undefined,
      true,
    );
  }

  // 兼容已授权但尚未重新编译的旧 bridge：它只暴露 trusted + running。
  // 进程活着不等于窗口可用，这里用只读 AX 查询确认输入区；
  // 查询只读取控件树，不点击、不抢焦点。
  const legacyReady =
    payload?.ready === undefined
    && payload?.trusted === true
    && payload?.yuanbaoRunning === true;
  if (!legacyReady) {
    throw new MediaProviderError(
      '元宝主窗口当前不可自动化——请打开元宝主窗口后重试',
      false,
      undefined,
      true,
    );
  }
  try {
    const ax = await fetch(`${new URL(record.baseUrl).origin}/v1/ax`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd: 'query',
        match: { role: 'AXTextArea' },
        limit: 1,
      }),
      signal: AbortSignal.timeout(2_500),
    });
    const result = (await ax.json()) as { count?: unknown };
    if (typeof result.count !== 'number' || result.count < 1) {
      throw new MediaProviderError(
        '元宝主窗口未打开或输入区不可用——请打开元宝主窗口后重试',
        false,
        undefined,
        true,
      );
    }
  } catch (error) {
    if (error instanceof MediaProviderError) throw error;
    throw new MediaProviderError(
      `元宝 AX 可用性检查失败：${error instanceof Error ? error.message : String(error)}`,
      false,
      undefined,
      true,
    );
  }
}

/** 本机路由丢失时禁止静默切外部模型；用户应得到可操作的窗口提示。 */
export function isLocalBridgeRouteUnavailable(error: unknown): boolean {
  return error instanceof MediaProviderError
    && /无法切换到 ai 分组|未找到元宝输入区|元宝主窗口|无水印 IndexedDB 原图不足|下载无水印原图失败/.test(error.message);
}

/** OpenAI 图像响应中的有效产物（元宝桥接一次可返回 4 张候选——截取前 N 张）。 */
function imageDataArtifacts(parsed: unknown, maxCount = MAX_IMAGE_CANDIDATES): MediaArtifact[] {
  if (parsed === null || typeof parsed !== 'object') return [];
  const data = (parsed as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const artifacts: MediaArtifact[] = [];
  for (const item of data) {
    if (item === null || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const url = extractUrl(entry);
    if (typeof url === 'string' && url.length > 0) {
      artifacts.push({ url, mime: 'image/png' });
      continue;
    }
    const b64 = entry.b64_json;
    if (typeof b64 === 'string' && b64.length > 0) {
      artifacts.push({ dataUri: `data:image/png;base64,${b64}`, mime: 'image/png' });
    }
  }
  return artifacts.slice(0, maxCount);
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

/**
 * 混元生图执行器（腾讯混元——元宝 App「AI 生图」同源模型）。
 *
 * 契约与 OpenAI 兼容 /images/generations 不同：官方走自有
 * 路径 /wand/hunyuan-image/{v3,v35}-generation，同步返回
 * （一次请求直接出图，无任务轮询），产物在
 * choices[0].delta.image.url（3.5）或 data[0].url（3.0）。
 * 请求体 / 响应解析为纯函数（image-contract.ts）；瞬态重试与
 * 错误归一复用 mediaFetch（429/5xx 退避一次）。
 */
async function generateImageHunyuan(
  record: ProviderConfigRecord,
  prompt: string,
  options?: { aspectRatio?: string; referenceImages?: string[] },
): Promise<MediaArtifact> {
  const request = buildHunyuanImageRequest(record.model, prompt, {
    ...(options?.aspectRatio !== undefined
      ? { aspectRatio: options.aspectRatio as ImageAspectRatio }
      : {}),
    ...(options?.referenceImages !== undefined
      ? { referenceImages: options.referenceImages }
      : {}),
  });
  const response = await mediaFetch(
    `${baseUrl(record.baseUrl)}${request.path}`,
    {
      method: 'POST',
      headers: bearerHeaders(record.apiKey ?? ''),
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(120_000),
    },
    record.name,
    '图像',
  );
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    throw new MediaProviderError(
      `提供方「${record.name}」图像响应读取失败`,
    );
  }
  const url = parseHunyuanImageUrl(raw);
  if (url === undefined) {
    throw new MediaProviderError(
      `提供方「${record.name}」图像响应无产物地址（混元生图）`,
    );
  }
  return { url, mime: 'image/png' };
}

/** 图像生成（返回提供方本批返回的全部候选）。 */
export async function generateImageSet(
  record: ProviderConfigRecord,
  prompt: string,
  options?: { aspectRatio?: string; referenceImages?: string[] },
): Promise<MediaArtifact[]> {
  // 契约路由：混元生图（hy-image 系列——元宝 App 同源模型）走
  // 自有 /wand/hunyuan-image/* 端点；其余按 OpenAI 兼容
  // /images/generations（原实现，纯增量零回归）。
  await assertYuanbaoBridgeReady(record);
  if (imageProviderOf(record) === 'hunyuan') {
    return [await generateImageHunyuan(record, prompt, options)];
  }
  const tier = DEFAULT_IMAGE_TIER;
  const refs = options?.referenceImages ?? [];
  // 参考图透传日志（CR-61 实证链——确认 dataURI 参考图
  // 确实到达上游，而非被参数兼容降级静默丢弃）。
  if (refs.length > 0) {
    console.log(
      `[image-gen] referenceImages=${refs.length} first=${refs[0]?.slice(0, 32)}… len=${refs[0]?.length ?? 0}`,
    );
  }
  const candidateCount = supportsImageCandidateCount(record)
    ? MAX_IMAGE_CANDIDATES
    : 1;
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
          n: candidateCount,
          ...(withSize && hasRatio ? { size: tier, ratio: options!.aspectRatio } : {}),
          extra_body: {
            response_format: 'url',
            ...(withRefs && refs.length > 0 ? { image: refs } : {}),
          },
        }),
        // 图像超时 240s（实测缺口 2026-10-15——上游图像队列
        // 饱和期请求挂起 >120s 无响应，连续 4 轮 120s 超时失败；
        // 官方建议超时区间 60–360s，240s 给排队请求留足完成时间）。
        signal: AbortSignal.timeout(240_000),
      },
      record.name,
      '图像',
    );

  let response: Response;
  try {
    response = await call(hasRatio, refs.length > 0);
  } catch (error) {
    if (
      supportsImageCandidateCount(record)
      && isLocalBridgeRouteUnavailable(error)
    ) {
      const routeError = error as MediaProviderError;
      throw new MediaProviderError(
        routeError.message,
        false,
        routeError.status,
        true,
      );
    }
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
  const artifacts = imageDataArtifacts(parsed);
  if (artifacts.length === 0) {
    throw new MediaProviderError(
      `提供方「${record.name}」图像响应没有可用产物`,
    );
  }
  return artifacts;
}

/** 兼容旧调用方：返回首选图像。 */
export async function generateImage(
  record: ProviderConfigRecord,
  prompt: string,
  options?: { aspectRatio?: string; referenceImages?: string[] },
): Promise<MediaArtifact> {
  const [artifact] = await generateImageSet(record, prompt, options);
  return artifact;
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

/** 异步任务轮询间隔与总超时（免费档常态：排队可达数分钟；真实
 * E2E 2026-10-19 观察到 Agnes 任务被受理但 7 分钟仍未出片——
 * 窗口对齐产品侧 16 分钟等待，给慢队列出片的余量）。 */
const VIDEO_POLL_INTERVAL_MS = 1_500;
const VIDEO_POLL_TIMEOUT_MS = 840_000;
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

/**
 * 本机桥接视频契约判定（豆包 App 桥接 tools/doubao-bridge）：
 * 桥接只实现 OpenAI 兼容 /videos/generations（同步产物）——
 * 落到 Agnes 契约 POST /videos 会被桥接未知路径兜底拒成
 * 404 "Not Found"（实测 2026-10-16）。按端点（127.0.0.1:3220）
 * 或桥接预设模型名（doubao-app-local）识别。
 */
export function isLocalBridgeVideoContract(record: ProviderConfigRecord): boolean {
  return (
    /127\.0\.0\.1:3220/.test(record.baseUrl) ||
    /doubao-app-local/i.test(record.model)
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

/** 任务轮询瞬态等待（任务仍在队列里，不应因此判失败）；
 * deadline 与轮询总预算一致——上游持续 5xx 也不会无限重试。 */
async function pollWithRetry(
  pollUrl: string,
  headers: Record<string, string>,
  providerName: string,
  deadline: number,
): Promise<Response> {
  for (;;) {
    if (Date.now() >= deadline) {
      throw new MediaProviderError(
        `提供方「${providerName}」任务超时（${VIDEO_POLL_TIMEOUT_MS / 1000}s 未完成）`,
        true,
      );
    }
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
    const response = await pollWithRetry(pollUrl, headers, providerName, deadline);
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
  options?: { referenceImages?: string[] },
): Promise<MediaArtifact> {
  const referencePlan = resolveVideoReferencePlan(record, options?.referenceImages);
  const referenceFlag = referencePlan.requested
    ? { referenceApplied: referencePlan.applied }
    : {};
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
      return { url: syncUrl, mime: 'video/mp4', ...referenceFlag };
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
    return { url, mime: 'video/mp4', ...referenceFlag };
  }

  // 本机桥接契约（豆包 App 桥接）：同步 /videos/generations——
  // 桥接在内部驱动豆包出片（官方预估 10 分钟），响应即产物，
  // 无任务 id 可轮询（超时与 src 参考实现 LOCAL_BRIDGE_TIMEOUT_MS 对齐）。
  if (isLocalBridgeVideoContract(record)) {
    const response = await mediaFetch(
      `${baseUrl(record.baseUrl)}/videos/generations`,
      {
        method: 'POST',
        headers: bearerHeaders(record.apiKey ?? ''),
        body: JSON.stringify({
          model: record.model,
          prompt,
          ...(referencePlan.images.length > 0
            ? { referenceImages: referencePlan.images }
            : {}),
        }),
        signal: AbortSignal.timeout(900_000),
      },
      record.name,
      '视频',
    );
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new MediaProviderError(
        `提供方「${record.name}」视频响应无法解析（非 JSON）`,
      );
    }
    const entry = firstDataEntry(parsed);
    const url =
      (entry !== null ? extractUrl(entry) : undefined) ??
      extractUrl(parsed as Record<string, unknown>);
    if (url === undefined) {
      throw new MediaProviderError(
        `提供方「${record.name}」视频响应无产物地址（本机桥接）`,
      );
    }
    return { url, mime: 'video/mp4', ...referenceFlag };
  }
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
          ...(referencePlan.applied
            ? { mode: 'reference', images: referencePlan.images }
            : { mode: 'text' }),
          seconds: '4',
          size: '720P',
          aspect_ratio: '16:9',
        }),
        signal: AbortSignal.timeout(120_000),
      },
      record.name,
      '视频',
    );

  // 创建瞬态失败退避（ride out 瞬态抖动）；队列满不重试——
  // 满足队列只会让任务排得更靠后，且可能产生重复付费提交（2026-10-19）。
  let response: Response;
  let attemptIndex = 0;
  for (;;) {
    try {
      response = await createTask();
      break;
    } catch (error) {
      const transient =
        error instanceof MediaProviderError && error.retryable && !error.queueFull;
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
    return { url: syncUrl, mime: 'video/mp4', ...referenceFlag };
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
  return { url, mime: 'video/mp4', ...referenceFlag };
}

/** 复用 chat 侧的重试状态判定（导出供端点层映射错误码）。 */
export { isRetryableStatus };
