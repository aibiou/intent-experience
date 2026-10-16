/**
 * 图像契约（多提供方适配层）。
 *
 * 与主应用 src/experience/image-contract.ts 同源移植（本网关
 * 独立部署，不跨包 import——与 providers/media.ts 移植自
 * generation-gateway.ts 的纪律一致）。只放纯函数
 * （provider 判定 / 请求体构造 / 响应解析）；网络执行在
 * providers/media.ts。
 *
 * 已支持：
 * - openai：POST {base}/images/generations，产物
 *   data[0].url 或 data[0].b64_json。
 * - hunyuan（腾讯混元生图——元宝 App「AI 生图」同源模型）：
 *   · Hy-Image-3.5-preview：POST
 *     {base}/wand/hunyuan-image/v35-generation（model/messages/
 *     size/seed），产物 choices[0].delta.image.url。
 *   · Hy-Image-3.0：POST {base}/wand/hunyuan-image/v3-generation
 *     （model/prompt/images/size/seed），产物 data[0].url。
 *   两者均同步返回（一次请求直接出图，无任务轮询）。
 */

/** 图像提供方契约类别。 */
export type ImageProvider = 'openai' | 'hunyuan';

/** 画幅（与主应用 AspectRatio 同集合——本网关不跨包取类型）。 */
export type ImageAspectRatio =
  | '16:9'
  | '9:16'
  | '1:1'
  | '3:4'
  | '4:3'
  | '2:3'
  | '3:2'
  | '21:9';

/**
 * 判定图像请求走哪套契约。
 *
 * 主判据是模型名（混元生图调用名恒为 hy-image-*），
 * 端点兜底覆盖用户自填模型别名的情况：混元生图路径段
 * /wand/hunyuan-image 与 TokenHub 域名（hy-image 系列的
 * 唯一托管平台）均视为混元契约。其余默认 OpenAI 兼容。
 */
export function imageProviderOf(config: {
  name: string;
  model: string;
  baseUrl: string;
}): ImageProvider {
  const model = config.model.toLowerCase();
  const endpoint = config.baseUrl.toLowerCase();
  if (
    model.includes('hy-image') ||
    model.includes('hunyuan-image') ||
    endpoint.includes('hunyuan-image') ||
    endpoint.includes('tokenhub.tencentmaas')
  ) {
    return 'hunyuan';
  }
  return 'openai';
}

/** Hy-Image-3.5-preview 判定（调用名形如 hy-image-v3.5-preview）。 */
export function isHunyuanImage35(model: string): boolean {
  return /3[.\-]5/.test(model.toLowerCase());
}

/**
 * 画幅 → 混元 size（"宽x高" 像素）。
 *
 * 两代模型尺寸约束不同（官方文档）：
 * - 3.5-preview：宽高 ∈ [256, 8192]，面积 ≤ 16777216——按
 *   2K 档位（约 4M 像素）取贴近各画幅的精确比例尺寸。
 * - 3.0：宽高 ∈ [512, 2048]，面积 ≤ 1024×1024——按 1M 像素
 *   上限取精确比例尺寸（比官方 37 组预设更贴近用户所选画幅）。
 */
export function hunyuanImageSize(ratio: ImageAspectRatio, model: string): string {
  if (isHunyuanImage35(model)) {
    switch (ratio) {
      case '9:16':
        return '1440x2560';
      case '1:1':
        return '2048x2048';
      case '3:4':
        return '1728x2304';
      case '4:3':
        return '2304x1728';
      case '2:3':
        return '1664x2496';
      case '3:2':
        return '2496x1664';
      case '21:9':
        return '3360x1440';
      case '16:9':
      default:
        return '2560x1440';
    }
  }
  switch (ratio) {
    case '9:16':
      return '720x1280';
    case '1:1':
      return '1024x1024';
    case '3:4':
      return '896x1152';
    case '4:3':
      return '1152x896';
    case '2:3':
      return '832x1248';
    case '3:2':
      return '1248x832';
    case '21:9':
      return '1512x648';
    case '16:9':
    default:
      return '1280x720';
  }
}

/**
 * 图像档位 → 混元 generate_max_pixels（仅在未传 size 时生效）。
 * 官方只开放 1K / 1.5K / 2K 三档——更高档位收敛到 2K。
 */
const HUNYUAN_MAX_PIXELS: Readonly<Record<string, number>> = {
  '1K': 1_048_576,
  '2K': 4_194_304,
  '3K': 4_194_304,
  '4K': 4_194_304,
};
const HUNYUAN_DEFAULT_MAX_PIXELS = 4_194_304;

/** 混元参考图上限（官方：3.5 单轮 ≤ 20 张；3.0 ≤ 3 张）。 */
const HUNYUAN_35_MAX_REFS = 20;
const HUNYUAN_30_MAX_REFS = 3;

export interface HunyuanImageRequest {
  /** 相对 baseUrl 的路径。 */
  path: string;
  body: Record<string, unknown>;
}

/**
 * 混元生图请求体构造（纯函数）。
 *
 * - 给定画幅 → 传 size（精确比例）；未给定 → 3.5 传
 *   generate_max_pixels 面积档位，3.0 交给官方预设尺寸。
 * - 参考图透传（dataURI 与公网 URL 官方均支持）。
 * - seed 仅透传正整数（3.0 要求 ≥1；3.5 为 0 时官方随机，
 *   与不传等价——统一按「不传即随机」处理）。
 */
export function buildHunyuanImageRequest(
  model: string,
  prompt: string,
  options?: {
    aspectRatio?: ImageAspectRatio;
    imageTier?: '1K' | '2K' | '3K' | '4K';
    referenceImages?: string[];
    seed?: number;
  },
): HunyuanImageRequest {
  const refs = (options?.referenceImages ?? []).filter(
    (ref) => typeof ref === 'string' && ref.length > 0,
  );
  const seed = options?.seed;
  const withSeed = typeof seed === 'number' && Number.isInteger(seed) && seed > 0;

  if (isHunyuanImage35(model)) {
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: prompt },
    ];
    for (const url of refs.slice(0, HUNYUAN_35_MAX_REFS)) {
      content.push({ type: 'image_url', image_url: { url } });
    }
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content }],
    };
    if (options?.aspectRatio !== undefined) {
      body.size = hunyuanImageSize(options.aspectRatio, model);
    } else {
      body.generate_max_pixels =
        HUNYUAN_MAX_PIXELS[options?.imageTier ?? '2K'] ??
        HUNYUAN_DEFAULT_MAX_PIXELS;
    }
    if (withSeed) body.seed = seed;
    return { path: '/wand/hunyuan-image/v35-generation', body };
  }

  const body: Record<string, unknown> = { model, prompt };
  if (refs.length > 0) body.images = refs.slice(0, HUNYUAN_30_MAX_REFS);
  if (options?.aspectRatio !== undefined) {
    body.size = hunyuanImageSize(options.aspectRatio, model);
  }
  if (withSeed) body.seed = seed;
  return { path: '/wand/hunyuan-image/v3-generation', body };
}

/** 响应体取图地址（3.5：choices[0].delta.image.url；3.0：data[0].url）。 */
function imageUrlFromPayload(parsed: unknown): string | undefined {
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  const choices = record.choices;
  if (
    Array.isArray(choices) &&
    choices.length > 0 &&
    choices[0] !== null &&
    typeof choices[0] === 'object'
  ) {
    const delta = (choices[0] as Record<string, unknown>).delta;
    if (delta !== null && typeof delta === 'object') {
      const image = (delta as Record<string, unknown>).image;
      if (image !== null && typeof image === 'object') {
        const url = (image as Record<string, unknown>).url;
        if (typeof url === 'string' && url.length > 0) return url;
      }
    }
  }
  const data = record.data;
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    data[0] !== null &&
    typeof data[0] === 'object'
  ) {
    const url = (data[0] as Record<string, unknown>).url;
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return undefined;
}

/**
 * 混元生图响应解析（纯文本入——兼容两种返回形态）：
 * 1. 单帧 JSON 对象（官方文档形态）。
 * 2. SSE 文本（`data: {...}` 行——服务端内部流式推理若被
 *    原样透传，取最后一条含图帧兜底）。
 */
export function parseHunyuanImageUrl(rawText: string): string | undefined {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.startsWith('{')) {
    try {
      return imageUrlFromPayload(JSON.parse(trimmed));
    } catch {
      return undefined;
    }
  }
  const payloads: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const match = /^data:\s*(.+)$/.exec(line.trim());
    if (match !== null) payloads.push(match[1]);
  }
  for (let i = payloads.length - 1; i >= 0; i -= 1) {
    if (payloads[i] === '[DONE]') continue;
    try {
      const url = imageUrlFromPayload(JSON.parse(payloads[i]));
      if (url !== undefined) return url;
    } catch {
      // 非 JSON 负载——跳过
    }
  }
  return undefined;
}
