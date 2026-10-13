import { getServerRuntime } from '../../../../src/experience/server-runtime';

/**
 * POST /api/session/start — Session 生命周期（S1-01；S1 规范 §27）。
 *
 * 创建新 Session（初始 SESSION_IDLE；首个意图解析后转 ACTIVE）。
 * 响应：{ session_id, state, created_at }。
 */
export async function POST(): Promise<Response> {
  const runtime = getServerRuntime();
  const { session, event } = await runtime.startSession();
  void event;
  return new Response(
    JSON.stringify({
      session_id: session.sessionId,
      state: session.state,
      created_at: session.createdAt,
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
