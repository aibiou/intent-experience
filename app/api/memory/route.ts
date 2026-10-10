import { getServerRuntime } from '../../../src/experience/server-runtime';

/**
 * GET /api/memory — 记忆域快照查询（S3b 只读观测路由；
 * S3A-SEMANTIC-FREEZE-01 v1.0.0 §1.3/§1.8——记忆记录
 * 含 memoryClass（short_term / long_term）/ candidateLongTerm
 * （C 类候选标记）/ 生命周期 / 来源与置信度分量 / 删除
 * 审计留痕）。
 *
 * 只读，不改变任何状态（API 契约 §2.3：Query 与 Command
 * 分离——同 getSimulation / getExperienceState 纪律；
 * 07 §22 检索只读纪律）。
 */
export async function GET(): Promise<Response> {
  const runtime = getServerRuntime();
  const result = runtime.getMemory();
  return new Response(
    JSON.stringify({
      records: result.memory.records.map((record) => ({
        record_id: record.recordId,
        session_id: record.sessionId,
        experience_id: record.experienceId,
        topic: record.topic,
        intent_signal: record.intentSignal,
        memory_class: record.memoryClass,
        candidate_long_term: record.candidateLongTerm,
        lifecycle: record.lifecycle,
        source: record.source,
        confidence: record.confidence,
        interest_signal: record.interestSignal,
        corrections: record.corrections,
        last_recalled_at: record.lastRecalledAt,
        withdrawn_at: record.withdrawnAt,
        expired_at: record.expiredAt,
        deletion_audit: record.deletionAudit,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
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
