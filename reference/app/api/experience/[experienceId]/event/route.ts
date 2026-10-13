import { getServerRuntime } from '../../../../../src/experience/server-runtime';

/**
 * POST /api/experience/{experienceId}/event — 核心 Runtime Command
 * （S1 规范 §27；API 契约 §11.3）。
 *
 * 请求：
 * {
 *   "request_id": "req_xxx",
 *   "session_id": "session_xxx",
 *   "state_version": 12,
 *   "event": { "type": "user_action", "semantic_action": "WHY", "raw_input": "为什么？", "source": "text" }
 * }
 *
 * 响应：application/x-ndjson。
 * 首行为 API 契约 §11.3 响应结构（accepted / policy_decision /
 * state_version / state）的流式实现；随后为内容分块事件
 * （chunk / done / stopped / cancelled）与最终状态（state_updated）。
 *
 * 执行链（§11.3）：Event → Semantic validation → Policy →
 * State Machine → Capability → State Update。
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ experienceId: string }> | { experienceId: string } },
): Promise<Response> {
  const params = await context.params;
  const experienceId = params.experienceId;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await req.text());
  } catch {
    return jsonError(400, 'INVALID_REQUEST', 'body must be valid JSON', false);
  }
  const body = parsed as {
    request_id?: unknown;
    session_id?: unknown;
    state_version?: unknown;
    event?: { semantic_action?: unknown; raw_input?: unknown };
  };
  if (typeof body.request_id !== 'string' || body.request_id.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'request_id is required', false);
  }
  if (typeof body.session_id !== 'string' || body.session_id.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'session_id is required', false);
  }
  if (typeof body.state_version !== 'number' || !Number.isInteger(body.state_version)) {
    return jsonError(400, 'INVALID_REQUEST', 'state_version (expected_state_version, PD-16) is required', false);
  }
  const semanticAction = body.event?.semantic_action;
  const rawInput = body.event?.raw_input;
  if (typeof semanticAction !== 'string' || semanticAction.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'event.semantic_action is required', false);
  }
  if (typeof rawInput !== 'string' || rawInput.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'event.raw_input is required', false);
  }

  const runtime = getServerRuntime();
  const result = await runtime.submitExperienceEvent({
    experienceId,
    sessionId: body.session_id,
    semanticAction,
    rawInput,
    expectedStateVersion: body.state_version,
    requestId: body.request_id,
    signal: req.signal,
  });
  if (!result.ok) {
    return jsonError(result.error.status, result.error.code, result.error.message, result.error.retryable, result.error.details);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of result.stream) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

// 方法约束：本路由仅允许 POST（Command）。
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify(details ? { code, message, retryable, details } : { code, message, retryable }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
