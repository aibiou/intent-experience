/**
 * SSE 客户端——消费 /api/experience/* 的 text/event-stream。
 *
 * 与后端契约严格对齐（src/app/api/experience/sse.ts）：
 * 每帧形如
 *   event: content
 *   data: {"type":"content",...}
 *   （空行分隔）
 * 解析策略：fetch + res.body.getReader() + TextDecoder，
 * 缓冲区按 "\n\n" 切帧，"event:" 行给出事件名，"data:" 行是 JSON 载荷。
 */

import type { TurnEvent } from '@/lib/experience/types';

/** 解析单帧（不含结尾空行）。 */
function parseFrame(frame: string): TurnEvent | null {
  let eventName = '';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data = line.slice('data:'.length).trim();
    }
  }
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as TurnEvent;
    if (eventName && parsed.type !== eventName) return null; // 帧不一致：丢弃
    return parsed;
  } catch {
    return null;
  }
}

/**
 * POST 一个体验端点并把 SSE 流逐事件回调。
 * 非流式错误响应（如 400 JSON）会抛出携带 message 的 Error。
 */
export async function streamExperienceEvents(
  url: string,
  body: object,
  onEvent: (event: TurnEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `请求失败（${res.status}）`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      // 保留默认 message
    }
    throw new Error(message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (;;) {
      const idx = buffer.indexOf('\n\n');
      if (idx === -1) break;
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = parseFrame(frame);
      if (event) onEvent(event);
    }
  }
}
