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
 * - CREATE → CREATE（PD-21 关闭切片：最小 Creation Branch，C3 §7/§8 合法动作；
 *   完整 Creation 语义属 S2，PD-05/PD-06）
 * - CORRECTION → EXPLAIN（PD-21 关闭切片：重评估是内部过程，必须落到
 *   合法 Policy Action；EXPLAIN = 重评估后的纠正候选，G07）
 *
 * 治理约束：
 * - C3 行为语义空缺（G-1…G-7，见 c3-semantic-gap-register-v1.md）未由编码者补写：
 *   冻结点之外一律拒绝并升级，不在运行时发明语义。
 * - 范围边界（PD-05/PD-06/PD-07/PD-21）：SEARCH 禁用；不持久化跨会话 Memory；
 *   CREATE / CORRECTION 仅在 P2 关闭切片以最小形态启用，完整语义属 S2。
 * - 策略不生成事实内容（P-04）；LLM 不允许自己选择最终 Action（P-05）。
 */

export type SemanticAction =
  | 'DIRECT_ANSWER'
  | 'WHY'
  | 'WHAT_IF'
  | 'CHANGE_DIRECTION'
  | 'STOP'
  | 'CREATE'
  | 'CORRECTION';

export type PolicyAction =
  | 'ANSWER'
  | 'EXPLAIN'
  | 'SIMULATE'
  | 'CHANGE_EXPERIENCE'
  | 'STOP'
  | 'CREATE';

/** 冻结映射表：键为 S1 范围内语义动作，值为对应策略动作（S1 §14）。 */
const FROZEN_POLICY_MAP: Readonly<Record<SemanticAction, PolicyAction>> = {
  DIRECT_ANSWER: 'ANSWER', // C3 §8 单目标映射；GS-01
  WHY: 'EXPLAIN', // S1 §26 GS-02 冻结点（C3 G-2 多目标选择准则未定义，仅此冻结点可实施）
  WHAT_IF: 'SIMULATE', // S1 §14；仅当前单次模拟提案（PD-06：不建立持久/多轮分支）
  CHANGE_DIRECTION: 'CHANGE_EXPERIENCE', // S1 §14；S1 硬边界（P-02：必须取消旧操作）
  STOP: 'STOP', // C3 §7 单目标映射；S1 硬边界（P-01：永远优先）
  CREATE: 'CREATE', // PD-21 关闭切片：最小 Creation Branch（C3 §7/§8 合法动作；完整语义属 S2）
  CORRECTION: 'EXPLAIN', // PD-21 关闭切片：重评估为内部过程，落到合法 Policy Action EXPLAIN（重评估后的纠正候选）
};

/** S1 策略版本（决策追踪与策略事件记录使用，C6 §18/§22）。 */
/**
 * policy_v1.2.0（S2a F-2 版本化变更，2026-10-09 产品负责人批准——
 * S2A-F2-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §3）：
 * CREATE 语义动作完整化（PD-21 关闭切片最小形态 → 完整 G04 语义）：
 * E2 Stage 5 完整编排（CREATE → CONTEXT_INHERIT → MINIMAL_BUILD →
 * PREVIEW → USER_FEEDBACK）；上下文继承（08 §4/§6/§25 五项）；
 * 创作对象模型（08 §8/§9）；创作域子策略（08 §15——创作执行内部
 * 决策记录，不新增顶层 SemanticAction / PolicyAction）；ASK 纪律
 * （08 §16：能推断即做，至多一个澄清问题）；用户主权（08 §17：
 * AI 建议 ≠ AI 决定，补丁经版本化历史可逆，预览即确认）；
 * 安全禁区（08 §14 / 13 §23：禁止自动扩张 / 自动发布 / 自动分享 /
 * 自动长期记忆保存 / 自动继续创作）；创作会话内输入路由（修改意图
 * 由创作运行时解释，不落入通用 CORRECTION → EXPLAIN 路径；完成信号
 * 经 STOP 执行路径在创作域登记——D-05 选项 A）。
 * 不变：CORRECTION → EXPLAIN、WHAT_IF → SIMULATE 关闭切片映射；
 * SEARCH 仍表外（PD-06）；完整 CORRECTION 语义随 F-3
 * （policy_v1.3.0）、WHAT_IF 完整分支随 F-4（policy_v1.4.0）
 * 各自版本化变更冻结实施（P3-S2-IMPL-AUTH-01 v1.2.0 §4 逐切片升版）。
 */
export const POLICY_VERSION = 'policy_v1.2.0';

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
