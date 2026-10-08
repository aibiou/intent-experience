/**
 * S1 范围内策略解析（冻结映射）。
 *
 * 映射表为 S1 规范 §14 Policy Rules 的批准映射（acceptance-mapping §A/§C；
 * PODR-001 / PD-05 / PD-06 批准的范围）：
 * - DIRECT_ANSWER → ANSWER（C3 §8 单目标映射；GS-01）
 * - WHY → EXPLAIN（S1 §26 GS-02 冻结点）
 * - WHAT_IF → SIMULATE（S1 §14；仅基础单次模拟提案，不建立持久/多轮分支，PD-06）
 * - CHANGE_DIRECTION → CHANGE_EXPERIENCE（S1 §14；S1 硬边界，必须取消旧操作，P-02）
 * - STOP → STOP（C3 §7 单目标映射；S1 硬边界，永远优先，P-01）
 *
 * 治理约束：
 * - C3 行为语义空缺（G-1…G-7，见 c3-semantic-gap-register-v1.md）未由编码者补写：
 *   冻结点之外一律拒绝并升级，不在运行时发明语义。
 * - S1 范围边界（PD-05/PD-06/PD-07）：CREATE / SEARCH 禁用；不持久化跨会话 Memory。
 * - 策略不生成事实内容（P-04）；LLM 不允许自己选择最终 Action（P-05）。
 */

export type SemanticAction = 'DIRECT_ANSWER' | 'WHY' | 'WHAT_IF' | 'CHANGE_DIRECTION' | 'STOP';

export type PolicyAction = 'ANSWER' | 'EXPLAIN' | 'SIMULATE' | 'CHANGE_EXPERIENCE' | 'STOP';

/** 冻结映射表：键为 S1 范围内语义动作，值为对应策略动作（S1 §14）。 */
const FROZEN_POLICY_MAP: Readonly<Record<SemanticAction, PolicyAction>> = {
  DIRECT_ANSWER: 'ANSWER', // C3 §8 单目标映射；GS-01
  WHY: 'EXPLAIN', // S1 §26 GS-02 冻结点（C3 G-2 多目标选择准则未定义，仅此冻结点可实施）
  WHAT_IF: 'SIMULATE', // S1 §14；仅当前单次模拟提案（PD-06：不建立持久/多轮分支）
  CHANGE_DIRECTION: 'CHANGE_EXPERIENCE', // S1 §14；S1 硬边界（P-02：必须取消旧操作）
  STOP: 'STOP', // C3 §7 单目标映射；S1 硬边界（P-01：永远优先）
};

/** S1 策略版本（决策追踪与策略事件记录使用，C6 §18/§22）。 */
export const POLICY_VERSION = 'policy_v1.0.0';

export type PolicyResolution =
  | { ok: true; semanticAction: SemanticAction; policyAction: PolicyAction }
  | { ok: false; code: 'ACTION_OUT_OF_S1_SCOPE'; semanticAction: string };

/**
 * 解析语义动作到策略动作。
 * 不在冻结表中的动作一律拒绝——包括已知但 S1 禁用的动作（CREATE/SEARCH 等）
 * 与语义未定义的动作（如 REPEAT/CONTINUE 等 G-1 空缺项）。
 */
export function resolvePolicy(semanticAction: string): PolicyResolution {
  if (Object.prototype.hasOwnProperty.call(FROZEN_POLICY_MAP, semanticAction)) {
    return {
      ok: true,
      semanticAction: semanticAction as SemanticAction,
      policyAction: FROZEN_POLICY_MAP[semanticAction as SemanticAction],
    };
  }
  return { ok: false, code: 'ACTION_OUT_OF_S1_SCOPE', semanticAction };
}
