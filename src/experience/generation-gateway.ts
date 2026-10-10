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
): Promise<GenerationArtifact> {
  const response = await callProvider(config, '/videos', {
    model: config.model,
    prompt,
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
  // 响应形态依提供方：data[0].url / output.url / 顶层 url。
  const entry = firstDataEntry(parsed);
  const url =
    (entry !== null ? extractUrl(entry) : undefined) ??
    extractUrl(parsed as Record<string, unknown>);
  if (url !== undefined) {
    return { url, mime: 'video/mp4' };
  }
  throw new GenerationError(
    `generation provider response malformed (provider=${config.provider}, modality=video: no artifact url)`,
    'video',
  );
}

export const GENERATION_CALLS: Record<
  'image' | 'voice' | 'video',
  (config: EnabledProviderConfig, prompt: string) => Promise<GenerationArtifact>
 > = {
  image: generateImage,
  voice: generateVoice,
  video: generateVideo,
};
