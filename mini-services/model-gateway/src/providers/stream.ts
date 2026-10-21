/**
 * openai-compatible 流式调用（SSE 增量）。
 *
 * 为什么单独一个文件：非流式调用（`callOpenAICompatible`）要「等完整 JSON」，
 * 流式调用要「边收边给」——两者的失败语义、超时语义、空内容判定都不同，
 * 混在一个函数里会让原本清晰的重试分类变模糊。
 *
 * 契约：
 * - 上游 body 带 `stream: true`，响应为 `text/event-stream`；
 * - 每个 `data: {choices:[{delta:{content}}]}` 增量回调一次 onDelta；
 * - `data: [DONE]` 结束；
 * - 非 2xx → 先读完 body 再抛 UpstreamHttpError（保留上游错误消息）；
 * - 网络异常 / 超时 → UpstreamNetworkError（瞬态，交给调用方决定是否重试）；
 * - 全程没有收到任何内容 → EmptyContentError（与非流式一致）。
 *
 * 超时：非流式是「整体 60s」。流式不能沿用——长回答本来就该超过 60s，
 * 但它必须有「多久一个字都没有」的上限。这里用两个窗口：
 * - firstTokenTimeoutMs（默认 30s）：首字迟迟不来，判定上游卡死；
 * - idleTimeoutMs（默认 60s）：中途长时间没有新块，判定连接僵死。
 */

import type { ProviderConfigRecord } from '../config-store';
import { buildUpstreamRequestBody, type ChatMessage } from '../openai';
import { EmptyContentError, UpstreamHttpError, UpstreamNetworkError } from '../retry';
import { chatCompletionsUrl } from './openai-compatible';

export const STREAM_FIRST_TOKEN_TIMEOUT_MS = 30_000;
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

interface UpstreamErrorShape {
  error?: { message?: unknown } | string;
}

interface StreamChunkShape {
  choices?: Array<{ delta?: { content?: unknown } }>;
}

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
    if (typeof errorField === 'string' && errorField.length > 0) return errorField;
  } catch {
    /* 非 JSON body——回退原文 */
  }
  const trimmed = raw.trim();
  if (trimmed.length > 0) return trimmed.slice(0, 200);
  return `HTTP ${status}`;
}

export interface StreamOptions {
  firstTokenTimeoutMs?: number;
  idleTimeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * 逐块流式调用；返回完整文本（调用方用它做校验与状态写入）。
 *
 * onDelta 只负责展示——内容是否可用由调用方的验证器决定（GS-06：
 * 流式文本不进入状态，完整文本通过校验后才提交）。
 */
export async function streamOpenAICompatible(
  record: ProviderConfigRecord,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  options: StreamOptions = {},
): Promise<string> {
  const firstTokenTimeout = options.firstTokenTimeoutMs ?? STREAM_FIRST_TOKEN_TIMEOUT_MS;
  const idleTimeout = options.idleTimeoutMs ?? STREAM_IDLE_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOutReason: string | null = null;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = (ms: number, reason: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOutReason = reason;
      controller.abort();
    }, ms);
  };
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  };

  arm(firstTokenTimeout, `等待首个字超过 ${Math.round(firstTokenTimeout / 1000)} 秒`);

  let response: Response;
  try {
    response = await fetch(chatCompletionsUrl(record.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${record.apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(buildUpstreamRequestBody(record.model, messages, true)),
      signal: controller.signal,
    });
  } catch (error) {
    cleanup();
    if (options.signal?.aborted) throw new UpstreamNetworkError('请求已取消');
    if (timedOutReason) throw new UpstreamNetworkError(timedOutReason);
    throw new UpstreamNetworkError(
      error instanceof Error && error.message.length > 0 ? error.message : '流式请求失败',
    );
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    cleanup();
    throw new UpstreamHttpError(response.status, extractErrorMessage(raw, response.status));
  }

  const reader = response.body?.getReader();
  if (!reader) {
    cleanup();
    throw new UpstreamNetworkError('提供方没有返回流式响应体');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let finished = false;

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      arm(idleTimeout, `超过 ${Math.round(idleTimeout / 1000)} 秒没有收到新内容`);
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload.length === 0) continue;
        if (payload === '[DONE]') {
          finished = true;
          break;
        }
        let chunk: StreamChunkShape;
        try {
          chunk = JSON.parse(payload) as StreamChunkShape;
        } catch {
          continue; // 心跳 / 非标准块：忽略而不是中断整条流
        }
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          if (full.length === 0) arm(idleTimeout, `超过 ${Math.round(idleTimeout / 1000)} 秒没有收到新内容`);
          full += delta;
          onDelta(delta);
        }
      }
    }
  } catch (error) {
    if (options.signal?.aborted) throw new UpstreamNetworkError('请求已取消');
    if (timedOutReason) throw new UpstreamNetworkError(timedOutReason);
    throw new UpstreamNetworkError(
      error instanceof Error && error.message.length > 0 ? error.message : '流式读取中断',
    );
  } finally {
    cleanup();
    void reader.cancel().catch(() => undefined);
  }

  if (full.length === 0) throw new EmptyContentError();
  return full;
}
