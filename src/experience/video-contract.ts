/**
 * 视频契约（多提供方适配层）。
 *
 * 生成网关按提供方路由到对应视频契约（CreateTask → PollTask）。
 * 本模块只放纯函数（provider 判定 / 请求体构造 / 响应解析），
 * 便于单测锁定；网络与轮询执行放 generation-gateway.ts。
 *
 * 已支持：
 * - agnes：POST {base}/videos（mode/seconds/size/aspect_ratio），
 *   轮询 {base}/agnesapi?video_id=，产物在响应顶层 url。
 * - zhipu（智谱 CogVideoX / Vidu）：OpenAI 兼容
 *   POST {base}/videos/generations（model/prompt/size/duration），
 *   创建响应 id；轮询 GET {base}/async-result/{id}，
 *   task_status=SUCCESS 时 data[0].url / data[0].video_result。
 */

import type { AspectRatio } from './generation-gateway';

/** 视频提供方契约类别。 */
export type VideoProvider = 'agnes' | 'zhipu';

/**
 * 判定视频请求走哪套契约。优先按模型名识别（cogvideox / vidu
 * 均为智谱），其次按端点域名（bigmodel.cn）；其余默认 agnes。
 */
export function videoProviderOf(config: {
  provider: string;
  model: string;
  endpoint: string;
}): VideoProvider {
  if (/cogvideox/i.test(config.model) || /vidu/i.test(config.model)) {
    return 'zhipu';
  }
  if (config.endpoint.includes('bigmodel.cn')) {
    return 'zhipu';
  }
  return 'agnes';
}

/** 画幅 → 智谱 size（"宽x高" 像素）。缺省用提供方默认。
 * 智谱仅支持 3 种画幅——其余映射到最接近的值。 */
export function zhipuSizeOf(ratio: AspectRatio): string {
  switch (ratio) {
    case '9:16':
    case '2:3':
    case '3:4':
      return '1080x1920';
    case '1:1':
      return '1080x1080';
    case '16:9':
    case '4:3':
    case '3:2':
    case '21:9':
    default:
      return '1920x1080';
  }
}

/**
 * 智谱视频创建请求体（OpenAI 兼容契约）。
 * - size / duration 仅在用户显式给定画幅 / 时长时透传；
 *   未指定则交给提供方默认（保守——不引入可能被拒绝的参数）。
 */
export function buildZhipuVideoCreate(
  model: string,
  prompt: string,
  options?: {
    aspectRatio?: AspectRatio;
    seconds?: '4' | '6' | '8' | '12';
  },
): Record<string, unknown> {
  const body: Record<string, unknown> = { model, prompt };
  if (options?.aspectRatio !== undefined) {
    body.size = zhipuSizeOf(options.aspectRatio);
  }
  if (options?.seconds !== undefined) {
    body.duration = Number(options.seconds);
  }
  return body;
}

/** 智谱创建响应取任务 id（同步兜底时返回 undefined 走轮询）。 */
export function parseZhipuCreateId(parsed: unknown): string | undefined {
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  const value = record.id;
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

export interface ZhipuPollState {
  /** task_status：SUCCESS / PROCESSING / FAIL / QUEUED 等。 */
  status: string;
  /** 任务进度 0–100（提供方未给则 undefined）。 */
  progress?: number;
  /** SUCCESS 时的产物地址（data[0].url 或 data[0].video_result）。 */
  url?: string;
}

/**
 * 智谱异步任务查询响应解析。SUCCESS 时取 data[0] 的 url；
 * video_result 兜底（官方部分模型返回视频地址字段名 video_result）。
 */
export function parseZhipuPoll(parsed: unknown): ZhipuPollState {
  if (parsed === null || typeof parsed !== 'object') {
    return { status: '' };
  }
  const record = parsed as Record<string, unknown>;
  const statusRaw = record.task_status;
  const status = typeof statusRaw === 'string' ? statusRaw : '';
  let progress: number | undefined;
  if (typeof record.progress === 'number') progress = record.progress;
  let url: string | undefined;
  const data = record.data;
  if (Array.isArray(data) && data.length > 0 && data[0] !== null && typeof data[0] === 'object') {
    const entry = data[0] as Record<string, unknown>;
    const u = entry.url;
    if (typeof u === 'string' && u.length > 0) {
      url = u;
    } else {
      const v = entry.video_result;
      if (typeof v === 'string' && v.length > 0) url = v;
    }
  }
  return { status, progress, url };
}
