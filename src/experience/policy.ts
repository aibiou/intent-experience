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
 * policy_v1.3.0（S2a F-3 版本化变更，2026-10-09 产品负责人批准——
 * S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §3）：
 * CORRECTION 语义动作完整化（PD-21 关闭切片最小形态 → 完整 G07
 * 语义）：
 * 变更 1——MODIFY 登记为 CORRECTION 用户面别名（08 §10 修改类型族，
 * 与创作修改族同源，单一词表两处路由；策略映射 CORRECTION → EXPLAIN
 * 不变；不新增顶层 SemanticAction / PolicyAction——PD-23 §5；分类
 * 优先级层不变）；
 * 变更 2——G07 完整操作语义（定位目标：确定性规则派生——指代词表 +
 * 默认当前候选 / 创作分量映射，D-02 选项 A；局部修改：创作域经 F-2
 * 补丁机制、非创作域经重评估候选替换，D-03 选项 A；重生成：既有
 * 重评估链路保持；历史版本化：纠正域事件 correction_applied /
 * correction_restored，D-05 选项 A）；
 * 变更 3——CREATION 阶段纠正保持（F-2 变更 3：保持阶段且重评估创作
 * 子状态，不推进子状态机）+ 创作会话路由保护（D-01 选项 A：RESTORE
 * 预检 → 创作修改族预检 → 命中创作族 CREATE 伞形 / 冲突判据 ASK /
 * 未命中通用 CORRECTION）；
 * 变更 4——RESTORE_PREVIOUS_VERSION 登记为 CORRECTION 用户面恢复
 * 子型（词表：刚才那个更好 / 退回刚才那个 / 撤销刚才修改；创作域经
 * 创作存储回滚提交——版本单调 +1、新版本内容 = 目标历史版本内容、
 * user_changes 登记 restore 条目；非创作域经意图登记 + 重评估，
 * decision-trace reason=restore_previous_version；不新增体验轴
 * 触发器）。
 * 不变：CORRECTION → EXPLAIN、WHAT_IF → SIMULATE 关闭切片映射；
 * SEARCH 仍表外（PD-06）；WHAT_IF 完整分支随 F-4（policy_v1.4.0）
 * 版本化变更冻结实施（P3-S2-IMPL-AUTH-01 v1.2.0 §4 逐切片升版）。
 */
export const POLICY_VERSION = 'policy_v1.3.0';

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
