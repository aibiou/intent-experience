/**
 * 策略解析（S1 + S2a 切片冻结映射；intent-experience policy 契约）。
 *
 * 冻结映射表（S1 §14 + PD-21 + S2a F-2/F-3 逐切片升版——对齐参考
 * policy_v1.4.0 终点语义，我们以单版 policy_v2.0.0-s2a 冻结）：
 * - DIRECT_ANSWER → ANSWER（GS-01：用户要求直接答案时直接回答，不强迫探索）
 * - WHY → EXPLAIN（GS-02：基于当前上下文解释"为什么"）
 * - WHAT_IF → SIMULATE（S2a F-4：多轮模拟持久化 + 分支记录——
 *   首轮自动创建分支，分支结果不回流主线）
 * - CHANGE_DIRECTION → CHANGE_EXPERIENCE（硬边界 P-02：必须取消旧操作）
 * - STOP → STOP（硬边界 P-01：永远优先，确定性执行，不调用模型）
 * - CREATE → CREATE（S2a F-2：完整 G04 Creation 语义——E2 Stage 5 编排
 *   CREATE → CONTEXT_INHERIT → MINIMAL_BUILD → PREVIEW → USER_FEEDBACK，
 *   多轮补丁循环至 COMPLETE；D-05 完成信号经 STOP 路径登记）
 * - CORRECTION → EXPLAIN（S2a F-3：完整 G07——MODIFY 登记为 CORRECTION
 *   用户面别名；创作会话内修改族命中走创作补丁（CREATE 伞形），
 *   非创作域为重评估候选替换；RESTORE 为恢复子型）
 * - CONTINUE → ANSWER（切片适配：Screen 04"继续"= 下一层理解；
 *   S4A 幂等确认回合语义属后续切片）
 *
 * 范围外纪律：DEEPEN / SIMPLIFY / REFRAME / REPEAT 属 S2b 及后续切片，
 * 一律 ACTION_OUT_OF_SLICE_SCOPE 拒绝并升级，不在运行时发明语义。
 * 策略不生成事实内容（P-04）；LLM 不允许自己选择最终 Action（P-05）。
 */

import type { SemanticAction } from './classifier';

export type PolicyAction = 'ANSWER' | 'EXPLAIN' | 'SIMULATE' | 'CHANGE_EXPERIENCE' | 'STOP' | 'CREATE';

/** 本切片冻结映射表。 */
const FROZEN_POLICY_MAP: Readonly<Record<string, PolicyAction>> = {
  DIRECT_ANSWER: 'ANSWER',
  WHY: 'EXPLAIN',
  WHAT_IF: 'SIMULATE',
  CHANGE_DIRECTION: 'CHANGE_EXPERIENCE',
  STOP: 'STOP',
  CORRECTION: 'EXPLAIN',
  CONTINUE: 'ANSWER',
  CREATE: 'CREATE', // S2a F-2：完整 Creation 语义启用（此前表外拒绝）
};

/** 策略版本（决策追踪与策略事件记录使用）。 */
export const POLICY_VERSION = 'policy_v2.0.0-s2a';

export type PolicyResolution =
  | { ok: true; semanticAction: SemanticAction; policyAction: PolicyAction }
  | { ok: false; code: 'ACTION_OUT_OF_SLICE_SCOPE'; semanticAction: SemanticAction };

/**
 * 解析语义动作到策略动作。
 * 不在冻结表中的动作一律拒绝——包括已知但本切片禁用的动作
 * （CREATE / DEEPEN / SIMPLIFY / REFRAME / REPEAT）与语义未定义的动作。
 */
export function resolvePolicy(semanticAction: SemanticAction): PolicyResolution {
  if (Object.prototype.hasOwnProperty.call(FROZEN_POLICY_MAP, semanticAction)) {
    return {
      ok: true,
      semanticAction,
      policyAction: FROZEN_POLICY_MAP[semanticAction] as PolicyAction,
    };
  }
  return { ok: false, code: 'ACTION_OUT_OF_SLICE_SCOPE', semanticAction };
}
