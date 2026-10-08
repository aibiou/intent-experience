/**
 * S1 范围内策略解析（冻结映射）。
 *
 * 治理约束：
 * - 仅实施 S1 §26 GS-02 冻结的映射与 C3 §7/§8 单目标映射。
 * - C3 行为语义空缺（G-1…G-7，见 c3-semantic-gap-register-v1.md）未由编码者补写：
 *   多目标映射的选择准则未定义，因此除冻结点外一律拒绝并升级，不在运行时发明语义。
 * - S1 范围边界（PD-05/PD-06/PD-07）：CREATE / SEARCH 禁用；WHAT_IF 仅基础单次模拟，
 *   不在本流式切片实施；STOP / CHANGE 为 S1 硬边界（本切片仅实施 STOP 终止）。
 */

export type SemanticAction = 'DIRECT_ANSWER' | 'WHY' | 'STOP';

export type PolicyAction = 'ANSWER' | 'EXPLAIN' | 'STOP';

/** 冻结映射表：键为 S1 范围内语义动作，值为对应策略动作。 */
const FROZEN_POLICY_MAP: Readonly<Record<SemanticAction, PolicyAction>> = {
  DIRECT_ANSWER: 'ANSWER', // C3 §8 单目标映射
  WHY: 'EXPLAIN', // S1 §26 GS-02 冻结（C3 G-2 多目标选择准则未定义，仅此冻结点可实施）
  STOP: 'STOP', // C3 §7 单目标映射；S1 硬边界
};

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
