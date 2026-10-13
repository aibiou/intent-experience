/**
 * 策略解析（S1 切片冻结映射；intent-experience policy 契约的切片子集）。
 *
 * 冻结映射表（S1 §14 + PD-21 最小关闭切片）：
 * - DIRECT_ANSWER → ANSWER（GS-01：用户要求直接答案时直接回答，不强迫探索）
 * - WHY → EXPLAIN（GS-02：基于当前上下文解释"为什么"）
 * - WHAT_IF → SIMULATE（基础单次模拟提案，不建立持久/多轮分支——PD-06）
 * - CHANGE_DIRECTION → CHANGE_EXPERIENCE（硬边界 P-02：必须取消旧操作）
 * - STOP → STOP（硬边界 P-01：永远优先，确定性执行，不调用模型）
 * - CORRECTION → EXPLAIN（G07 最小形态：重评估是内部过程，落到合法
 *   Policy Action EXPLAIN——重评估后的纠正候选）
 * - CONTINUE → ANSWER（切片适配：Screen 04"继续"= 下一层理解；
 *   S4A 幂等确认回合语义属后续切片）
 *
 * 范围外纪律：CREATE / DEEPEN / SIMPLIFY / REFRAME / REPEAT 本切片
 * 未启用——一律 ACTION_OUT_OF_SCOPE 拒绝并升级，不在运行时发明语义。
 * 策略不生成事实内容（P-04）；LLM 不允许自己选择最终 Action（P-05）。
 */

import type { SemanticAction } from './classifier';

export type PolicyAction = 'ANSWER' | 'EXPLAIN' | 'SIMULATE' | 'CHANGE_EXPERIENCE' | 'STOP';

/** 本切片冻结映射表。 */
const FROZEN_POLICY_MAP: Readonly<Record<string, PolicyAction>> = {
  DIRECT_ANSWER: 'ANSWER',
  WHY: 'EXPLAIN',
  WHAT_IF: 'SIMULATE',
  CHANGE_DIRECTION: 'CHANGE_EXPERIENCE',
  STOP: 'STOP',
  CORRECTION: 'EXPLAIN',
  CONTINUE: 'ANSWER',
};

/** 策略版本（决策追踪与策略事件记录使用）。 */
export const POLICY_VERSION = 'policy_v1.0.0-slice';

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
