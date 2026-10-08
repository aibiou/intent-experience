/**
 * 首体验流式生成核心（框架无关）。
 *
 * 取消传播：AbortSignal（Next.js Route Handler 中为 request.signal，即客户端断开）
 * 在每个分块之前与分块间等待中都被检查；取消后立即停止迭代、
 * 不产出任何后续分块，并向审计汇写入 cancellation 事件（含取消时的分块下标）。
 */

import type { PolicyAction } from './policy';

export type StreamEventType = 'chunk' | 'done' | 'stopped' | 'cancelled';

export interface StreamEvent {
  type: StreamEventType;
  policyAction: PolicyAction;
  semanticAction: string;
  fixtureId: string;
  /** chunk 下标（chunk 事件）；总chunk数（done 事件）；已产出chunk数（cancelled 事件）。 */
  index: number;
  totalChunks: number;
  /** chunk 内容（chunk 事件）；否则为 null。 */
  content: string | null;
  at: string;
}

export interface StreamOptions {
  semanticAction: string;
  policyAction: PolicyAction;
  fixtureId: string;
  chunks: string[];
  /** 客户端取消信号（HTTP 形态为 request.signal）。 */
  signal?: AbortSignal;
  /** 分块间等待毫秒数（使取消在流中间可确定性观测）。 */
  chunkDelayMs?: number;
  /** 审计汇：每次事件（含 cancellation）都会调用，可为异步。 */
  audit?: (event: StreamEvent) => void | Promise<void>;
}

const ABORTED = Symbol('aborted');

function abortableDelay(ms: number, signal?: AbortSignal): Promise<typeof ABORTED | void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  if (signal.aborted) {
    return Promise.resolve(ABORTED);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(ABORTED);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function* createExperienceStream(options: StreamOptions): AsyncGenerator<StreamEvent> {
  const { semanticAction, policyAction, fixtureId, chunks, signal, audit } = options;
  const chunkDelayMs = options.chunkDelayMs ?? 40;

  const emit = async (event: StreamEvent): Promise<void> => {
    await audit?.(event);
  };

  // 终止事件（stopped / cancelled）同时写入审计汇并 yield 给流：
  // 客户端（进程内消费者、断开前的 HTTP 客户端）必须能看到终止原因，
  // 服务端审计汇保留权威登记。
  // 取消先于第一个分块到达：不产出任何内容分块。
  if (signal?.aborted) {
    const event: StreamEvent = {
      type: 'cancelled',
      policyAction,
      semanticAction,
      fixtureId,
      index: 0,
      totalChunks: chunks.length,
      content: null,
      at: nowIso(),
    };
    await emit(event);
    yield event;
    return;
  }

  // 策略动作 STOP（S1 硬边界）：立即终止，不产出内容分块。
  if (policyAction === 'STOP') {
    const event: StreamEvent = {
      type: 'stopped',
      policyAction,
      semanticAction,
      fixtureId,
      index: 0,
      totalChunks: chunks.length,
      content: null,
      at: nowIso(),
    };
    await emit(event);
    yield event;
    return;
  }

  let produced = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    if (signal?.aborted) {
      const event: StreamEvent = {
        type: 'cancelled',
        policyAction,
        semanticAction,
        fixtureId,
        index,
        totalChunks: chunks.length,
        content: null,
        at: nowIso(),
      };
      await emit(event);
      yield event;
      return;
    }
    const waited = await abortableDelay(chunkDelayMs, signal);
    if (waited === ABORTED) {
      const event: StreamEvent = {
        type: 'cancelled',
        policyAction,
        semanticAction,
        fixtureId,
        index,
        totalChunks: chunks.length,
        content: null,
        at: nowIso(),
      };
      await emit(event);
      yield event;
      return;
    }
    produced = index + 1;
    await emit({
      type: 'chunk',
      policyAction,
      semanticAction,
      fixtureId,
      index,
      totalChunks: chunks.length,
      content: chunks[index],
      at: nowIso(),
    });
    yield {
      type: 'chunk',
      policyAction,
      semanticAction,
      fixtureId,
      index,
      totalChunks: chunks.length,
      content: chunks[index],
      at: nowIso(),
    };
  }

  const doneEvent: StreamEvent = {
    type: 'done',
    policyAction,
    semanticAction,
    fixtureId,
    index: produced,
    totalChunks: chunks.length,
    content: null,
    at: nowIso(),
  };
  await emit(doneEvent);
  yield doneEvent;
}
