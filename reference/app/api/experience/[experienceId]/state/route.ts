import { getServerRuntime } from '../../../../../src/experience/server-runtime';

/**
 * GET /api/experience/{experienceId}/state — 状态查询
 * （S1 规范 §27；API 契约 §11.2）。
 *
 * 响应：{ experience_id, state_version, state }
 *
 * Query 不改变任何状态（API 契约 §2.3：Query 与 Command 分离）。
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ experienceId: string }> | { experienceId: string } },
): Promise<Response> {
  const params = await context.params;
  const runtime = getServerRuntime();
  const result = runtime.getExperienceState(params.experienceId);
  if (!result.ok) {
    return new Response(
      JSON.stringify({ code: result.error.code, message: result.error.message, retryable: result.error.retryable }),
      { status: result.error.status, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return new Response(
    JSON.stringify({
      experience_id: result.state.experienceId,
      state_version: result.state.stateVersion,
      state: {
        status: result.state.status,
        stage: result.state.stage,
        waiting_for_user: result.state.waitingForUser,
        candidate_id: result.state.candidateId,
        last_semantic_action: result.state.lastSemanticAction,
        updated_at: result.state.updatedAt,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

// 方法约束：本路由仅允许 GET（Query）。
export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', allowed: ['GET'] }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
