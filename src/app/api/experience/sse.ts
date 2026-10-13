/**
 * SSE 辅助——把 Runtime 的 TurnEvent 流转成 text/event-stream 响应。
 * 仅服务端使用；Route Handler 是薄封装，不含业务语义。
 */

import type { TurnEvent } from '@/lib/experience/types';

export function sseResponse(stream: AsyncGenerator<TurnEvent>): Response {
  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnEvent) => {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        );
      };
      try {
        for await (const event of stream) {
          send(event);
        }
      } catch (error) {
        try {
          send({
            type: 'error',
            code: 'LLM_GATEWAY_ERROR',
            message: `体验流异常中断：${error instanceof Error ? error.message : String(error)}`,
          });
        } catch {
          // 客户端已断开：静默
        }
      }
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
