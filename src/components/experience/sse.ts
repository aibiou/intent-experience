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
 *
 * 2026-10-16（模拟用户实测）：生成触发必须有时限反馈——SSE 上游
 * 长时间无任何事件（文本挂起 / 媒体生成卡死）时主动抛错，调用方
 * toast + 可重试，不再静默死屏。默认阈值 240s 对齐图像超时；视频
 * started 事件到达后放宽到 960s，与视频链路最坏耗时一致。
 */

import type { TurnEvent } from '@/lib/experience/types';

/** 默认无事件超时（ms）：达到后按上游挂起失败处理。 */
const DEFAULT_INACTIVITY_TIMEOUT_MS = 240_000;
/** 视频无事件超时（ms）：豆包本机视频预估可达 10 分钟。 */
const VIDEO_INACTIVITY_TIMEOUT_MS = 960_000;

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
 * 流开始后若在 INACTIVITY_TIMEOUT_MS 内无任何事件到达，抛错结束
 * （调用方据此提示超时/可重试；不会误用调用方 signal 的 abort）。
 */
export function streamExperienceEvents(
  url: string,
  body: object,
  onEvent: (event: TurnEvent) => void,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let finishTimer: ReturnType<typeof setTimeout> | null = null;
    let inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS;
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      if (finishTimer) clearTimeout(finishTimer);
      reject(new Error(message));
    };

    const armTimer = () => {
      if (finishTimer) clearTimeout(finishTimer);
      finishTimer = setTimeout(
        () => fail(`等待生成结果超过 ${inactivityTimeoutMs / 1000} 秒，请再试一次。`),
        inactivityTimeoutMs
      );
    };

    (async () => {
      armTimer(); // 请求阶段同样计时（服务端可能迟迟不建流）
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
        fail(message);
        return;
      }
      try {
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
            if (event) {
              if (event.type === 'generation' && event.status === 'started' && event.modality === 'video') {
                inactivityTimeoutMs = VIDEO_INACTIVITY_TIMEOUT_MS;
              }
              armTimer(); // 有事件 → 重置无事件计时
              onEvent(event);
            }
          }
        }
        if (finishTimer) clearTimeout(finishTimer);
        if (!settled) {
          settled = true;
          resolve();
        }
      } catch (e) {
        // 用户取消：原样抛出（调用方已按 controller.signal.aborted 处理）。
        // 超时：fail() 已 reject——此处避免二次 settle。
        if (!settled) {
          settled = true;
          if (finishTimer) clearTimeout(finishTimer);
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }
    })().catch((e) => {
      if (!settled) {
        settled = true;
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}
