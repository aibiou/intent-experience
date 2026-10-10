import { getServerRuntime } from '../../../../../src/experience/server-runtime';

/**
 * GET /api/experience/{experienceId}/simulation — 模拟域
 * 快照查询（S3b 只读观测路由；S3B-SEMANTIC-FREEZE-01
 * v1.0.0 §1.1/§1.3——跨会话持久：分支记录全部分量
 * （id / 内容 / 生命周期 / adopted 标记 / version /
 * rounds / 模拟轮内容）+ 模拟历史；current_branch_id
 * 为会话级指针（会话结束清空——null 表示无激活分支，
 * 不跨会话自动恢复）。
 *
 * 恢复为只读加载，不登记新事件（§1.3）；只读，不改变
 * 任何状态（API 契约 §2.3：Query 与 Command 分离）。
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ experienceId: string }> | { experienceId: string } },
): Promise<Response> {
  const params = await context.params;
  const runtime = getServerRuntime();
  const result = runtime.getSimulation(params.experienceId);
  if (!result.ok) {
    return new Response(
      JSON.stringify({ code: result.error.code, message: result.error.message, retryable: result.error.retryable }),
      { status: result.error.status, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return new Response(
    JSON.stringify({
      experience_id: params.experienceId,
      current_branch_id: result.simulation.currentBranchId,
      rounds: result.simulation.rounds.map((round) => ({
        round_id: round.roundId,
        round: round.round,
        branch_id: round.branchId,
        source_input: round.sourceInput,
        separation: round.separation,
        state_version: round.stateVersion,
        recorded_at: round.recordedAt,
      })),
      branches: result.simulation.branches.map((branch) => ({
        branch_id: branch.branchId,
        session_id: branch.sessionId,
        source_round: branch.sourceRound,
        version: branch.version,
        lifecycle: branch.lifecycle,
        adopted: branch.adopted,
        rounds: branch.rounds.length,
        created_at: branch.createdAt,
        updated_at: branch.updatedAt,
      })),
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
