import { getServerRuntime } from '../../../../src/experience/server-runtime';

/**
 * POST /api/intent/resolve — 意图解析（S1-02/S1-05；API 契约 §10.1）。
 *
 * 请求：{ request_id, session_id, payload: { user_input } }
 * 响应：{ intent, semantic_action, confidence, action, clarification }
 *
 * 本接口不直接修改 ExperienceState（§10.1 重要约束）：
 * 只产生解释结果，最终状态转换由 Runtime / State Machine 执行。
 */
export async function POST(req: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await req.text());
  } catch {
    return jsonError(400, 'INVALID_REQUEST', 'body must be valid JSON', false);
  }
  const body = parsed as {
    request_id?: unknown;
    session_id?: unknown;
    payload?: { user_input?: unknown };
  };
  if (typeof body.request_id !== 'string' || body.request_id.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'request_id is required', false);
  }
  if (typeof body.session_id !== 'string' || body.session_id.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'session_id is required', false);
  }
  const userInput = body.payload?.user_input;
  if (typeof userInput !== 'string' || userInput.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'payload.user_input is required', false);
  }

  const runtime = getServerRuntime();
  const result = await runtime.resolveIntent({
    sessionId: body.session_id,
    rawInput: userInput,
    requestId: body.request_id,
  });
  if (!result.ok) {
    return jsonError(result.error.status, result.error.code, result.error.message, result.error.retryable, result.error.details);
  }
  return new Response(
    JSON.stringify({
      intent: {
        intent_id: result.intent.intentId,
        raw_input: result.intent.rawInput,
        state: result.intent.state,
      },
      semantic_action: result.semanticAction,
      confidence: result.confidence,
      action: result.action,
      clarification: null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

// 方法约束：本路由仅允许 POST。
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
