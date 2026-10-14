/**
 * openai-compatible 提供方（newapi / 任意 OpenAI 兼容端点）。
 *
 * 对接形态（严格对齐任务规格）：
 *   fetch(`${baseUrl}/chat/completions`, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
 *     body: JSON.stringify({ model, messages, stream: false }),
 *     signal: AbortSignal.timeout(60000),
 *   });
 *
 * - messages 原样透传（system/user/assistant 不做转换——区别于 zai 分支）。
 * - 非 2xx → 读 body 里的 error.message（OpenAI 风格）抛 UpstreamHttpError。
 * - 2xx → data.choices[0].message.content；空内容按错误处理（EmptyContentError）。
 * - 网络异常（fetch throw / 超时）→ UpstreamNetworkError（瞬态，由 retry 分类）。
 * - baseUrl 容错：尾斜杠剥除；已含 /chat/completions 后缀不重复拼
 *   （对齐参考仓库 S5B v1.3.0 端点容错纪律）。
 */

import type { ProviderConfigRecord } from '../config-store';
import { buildUpstreamRequestBody, type ChatMessage } from '../openai';
import { EmptyContentError, UpstreamHttpError, UpstreamNetworkError } from '../retry';

export const UPSTREAM_TIMEOUT_MS = 60_000;

/** 请求 URL 构造：base 拼 /chat/completions（含容错）。 */
export function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

interface UpstreamErrorShape {
  error?: { message?: unknown } | string;
}

interface UpstreamSuccessShape {
  choices?: Array<{ message?: { content?: unknown } }>;
}

function networkReason(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') {
      return `请求超时（${UPSTREAM_TIMEOUT_MS / 1000} 秒）`;
    }
    return error.message.length > 0 ? error.message : error.name;
  }
  return String(error);
}

/** 非 2xx body 的 error.message 提取（OpenAI 风格；非 JSON 时回退原文前 200 字）。 */
function extractErrorMessage(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as UpstreamErrorShape;
    const errorField = parsed?.error;
    if (
      typeof errorField === 'object' &&
      errorField !== null &&
      typeof errorField.message === 'string' &&
      errorField.message.length > 0
    ) {
      return errorField.message;
    }
    if (typeof errorField === 'string' && errorField.length > 0) {
      return errorField;
    }
  } catch {
    /* 非 JSON body——回退原文 */
  }
  const trimmed = raw.trim();
  if (trimmed.length > 0) return trimmed.slice(0, 200);
  return `HTTP ${status}`;
}

export async function callOpenAICompatible(
  record: ProviderConfigRecord,
  messages: ChatMessage[],
): Promise<string> {
  const url = chatCompletionsUrl(record.baseUrl);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${record.apiKey}`,
      },
      body: JSON.stringify(buildUpstreamRequestBody(record.model, messages)),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    // 网络异常 / 超时 → 瞬态（重试与否由 withRetry 决定）
    throw new UpstreamNetworkError(networkReason(error));
  }

  const raw = await response.text();
  if (!response.ok) {
    throw new UpstreamHttpError(response.status, extractErrorMessage(raw, response.status));
  }

  let parsed: UpstreamSuccessShape;
  try {
    parsed = JSON.parse(raw) as UpstreamSuccessShape;
  } catch {
    throw new UpstreamNetworkError('提供方返回了无法解析的响应（非 JSON）');
  }
  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new EmptyContentError();
  }
  return content;
}
