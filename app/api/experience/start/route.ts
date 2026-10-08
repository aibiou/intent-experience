import { getServerRuntime } from '../../../../src/experience/server-runtime';

/**
 * POST /api/experience/start — 体验启动（S1 规范 §27；API 契约 §11.1）。
 *
 * 请求：{ session_id, intent_id, candidate_id? }
 * 响应：{ experience_id, experience_version, state_version, state }
 *
 * 不得由 Frontend 自己创建 ExperienceState（§11.1）：
 * 体验状态由本运行时经版本化单写者路径创建（S1-03）。
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
    intent_id?: unknown;
    candidate_id?: unknown;
  };
  if (typeof body.request_id !== 'string' || body.request_id.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'request_id is required', false);
  }
  if (typeof body.session_id !== 'string' || body.session_id.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'session_id is required', false);
  }
  if (typeof body.intent_id !== 'string' || body.intent_id.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'intent_id is required', false);
  }

  const runtime = getServerRuntime();
  const result = await runtime.startExperience({
    sessionId: body.session_id,
    intentId: body.intent_id,
    requestId: body.request_id,
    candidateId: typeof body.candidate_id === 'string' ? body.candidate_id : undefined,
  });
  if (!result.ok) {
    return jsonError(result.error.status, result.error.code, result.error.message, result.error.retryable, result.error.details);
  }
  return new Response(
    JSON.stringify({
      experience_id: result.experienceId,
      experience_version: result.experienceVersion,
      state_version: result.stateVersion,
      state: {
        status: result.state.status,
        stage: result.state.stage,
        waiting_for_user: result.state.waitingForUser,
        candidate_id: result.state.candidateId,
        last_semantic_action: result.state.lastSemanticAction,
      },
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
