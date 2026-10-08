/**
 * 框架无关的请求处理：把语义动作请求转换为 NDJSON 流式响应。
 *
 * Route Handler（app/api/experience/stream/route.ts）仅做薄封装，
 * 使同一代码路径可在两种形态执行：
 * - 进程内形态：证据执行器直接调用本函数（注入内存审计汇与合成 Request 等价输入）。
 * - HTTP 形态：Next.js 运行时经 Route Handler 调用本函数（request.signal 为客户端断开信号）。
 */

import { resolvePolicy } from './policy';
import { loadChunkFixture, type ChunkFixture, type ChunkResolution } from './chunks';
import { createExperienceStream, type StreamEvent } from './stream';
import type { AuditSink } from './audit';

export interface StreamRequestInput {
  method: string;
  body: string;
  signal?: AbortSignal;
  audit?: AuditSink;
}

export interface HandlerResult {
  status: number;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NDJSON_HEADERS = { 'Content-Type': 'application/x-ndjson' };

function jsonResponse(status: number, payload: Record<string, unknown>): HandlerResult {
  return {
    status,
    headers: JSON_HEADERS,
    body: new Blob([JSON.stringify(payload)]).stream(),
  };
}

export async function handleExperienceStreamRequest(
  input: StreamRequestInput,
): Promise<HandlerResult> {
  if (input.method !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return jsonResponse(400, { error: 'INVALID_JSON_BODY' });
  }

  const semanticAction = (parsed as { semanticAction?: unknown }).semanticAction;
  if (typeof semanticAction !== 'string' || semanticAction.length === 0) {
    return jsonResponse(400, { error: 'MISSING_SEMANTIC_ACTION' });
  }

  const policy = resolvePolicy(semanticAction);
  if (!policy.ok) {
    return jsonResponse(400, {
      error: policy.code,
      semanticAction,
      reason: 'action is not in the S1 frozen policy set; undefined semantics are escalated, not implemented',
    });
  }

  // 策略 STOP（S1 硬边界）立即终止，无内容分块，不需要内容语料。
  // 语义空缺（C3 G-1…G-7）不在此补写：冻结表之外的动作已在上方拒绝。
  const stopFixture: ChunkFixture = {
    fixtureId: 'synthetic/stop/v1',
    semanticAction: policy.semanticAction,
    policyAction: 'STOP',
    chunks: [],
  };
  const fixtureResolution: ChunkResolution =
    policy.policyAction === 'STOP'
      ? { ok: true, fixture: stopFixture }
      : loadChunkFixture(policy.semanticAction);
  if (!fixtureResolution.ok) {
    return jsonResponse(500, { error: fixtureResolution.code, semanticAction });
  }
  const fixture = fixtureResolution.fixture;

  const encoder = new TextEncoder();
  const audit = input.audit;
  const signal = input.signal;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of createExperienceStream({
          semanticAction: policy.semanticAction,
          policyAction: policy.policyAction,
          fixtureId: fixture.fixtureId,
          chunks: fixture.chunks,
          signal,
          chunkDelayMs: 40,
          audit,
        })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });

  return {
    status: 200,
    headers: NDJSON_HEADERS,
    body,
  };
}
