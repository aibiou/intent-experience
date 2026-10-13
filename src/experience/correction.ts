/**
 * 纠正运行时（G07 完整 Correction 语义；S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §3/§4）。
 *
 * 语义来源（frozen reference archive，G1 PASSED）：
 * - 08 号契约 §10（修改类型族）/§11（局部补丁）/§12（patch target
 *   纪律）/§13（理解职责）/§16（冲突判据）/§28（版本化与
 *   RESTORE_PREVIOUS_VERSION）
 * - Evaluation System V1 §5 G07（remove invalid inference /
 *   preserve valid context / reassess）
 * - C05.2 动作表（MODIFY = "用户要求修改已有结果"）/ C05.4 schema
 *   target 字段 / C6 §14 事件命名模式
 * - P3-S2-IMPL-AUTH-01 v1.2.0 §2(2)（MODIFY 登记为 CORRECTION 用户面
 *   别名；完整 G07 四要素：定位目标 / 局部修改 / 重生成 / 历史版本化）
 *
 * 治理约束（冻结文本 §2 裁决区，产品负责人 2026-10-09 签署）：
 * - D-01 选项 A：MODIFY 词表（08 §10 修改类型族）与创作修改族同源
 *   ——单一词表两处路由（通用分类器别名登记 + 创作会话路由保护预检）；
 * - D-02 选项 A：纠正目标为确定性规则派生（指代词表 + 默认当前候选 /
 *   创作分量映射），无新增模型调用（合成网关无真实语义提取能力——
 *   E5 环境约束；GS-01 负向案例纪律）；
 * - D-03 选项 A：创作域 G07 由 F-2 补丁机制承载（不重建）；非创作域
 *   G07 = PD-21 重评估链路完整化（目标登记 + 纠正历史事件登记；
 *   重评估候选替换即"局部修改"在非结构化理解状态的忠实派生——
 *   不重放会话历史）；
 * - D-04 选项 A：RESTORE_PREVIOUS_VERSION 登记为 CORRECTION 用户面
 *   恢复子型，不新增轴触发器（创作域经创作存储回滚提交——版本单调
 *   +1 满足 S1-12 不变式；非创作域经意图登记 + 重评估，
 *   decision-trace reason=restore_previous_version）；
 * - D-05 选项 A：纠正域事件 correction_applied / correction_restored
 *   （C6 §14 命名模式 <domain>_<past_participle>；C6 §5 事件为不可变
 *   权威事实）。
 *
 * 不变式保持（授权 §3.3）：
 * - 纠正写入经 Runtime 单一写入者（GS-06 / CC02）；
 * - 版本化提交经现有承诺链（串行化 + stale 拒绝）；
 * - 错误路径不修改已提交状态（S1 §28）；版本链单调（S1-12）；
 * - 纠正不持久化跨会话（PD-07——纠正域事件均为会话内事实登记，
 *   无 memory 层事件）。
 */

import { TARGET_SYNONYMS, type CreationObject } from './creation';

// ---------------------------------------------------------------------------
// 词表（D-01 / D-02 / D-04——确定性规则，同 S1 分类器纪律）
// ---------------------------------------------------------------------------

/**
 * MODIFY 词表（08 §10 修改类型族；与 interpretCreationInput 修改族
 * 同源——单一词表两处路由，D-01 选项 A）。通用分类器登记为
 * CORRECTION 用户面别名（授权 §2(2)）；创作会话路由保护预检复用。
 */
export const MODIFY_PATTERNS: ReadonlyArray<RegExp> = [
  /太难|太简单/,
  /科幻|科幻感|更有.{0,4}感/,
  /换成|替换/,
  /改名|叫做|更名为/,
  /改|修改|调整|放远|放近|太远|太近/,
];

/**
 * RESTORE 词表（D-04 选项 A；08 §28："刚才那个更好" / "退回刚才那个"
 * / "撤销刚才修改" → RESTORE_PREVIOUS_VERSION 用户面恢复子型）。
 */
export const RESTORE_PATTERNS: ReadonlyArray<RegExp> = [
  /刚才那个更好/,
  /退回刚才那个/,
  /撤销刚才修改/,
];

/**
 * 指代词表（D-02 选项 A：命中 → 上一候选；确定性规则，无新增模型调用）。
 */
export const PREVIOUS_CANDIDATE_PATTERNS: ReadonlyArray<RegExp> = [
  /刚才/,
  /那个/,
  /上一步/,
  /上一个/,
  /上一版/,
  /上一个版本/,
];

/** 恢复意图判定（D-04 词表命中）。 */
export function isRestoreIntent(rawInput: string): boolean {
  return RESTORE_PATTERNS.some((pattern) => pattern.test(rawInput));
}

// ---------------------------------------------------------------------------
// 纠正目标定位（D-02 选项 A：确定性规则派生）
// ---------------------------------------------------------------------------

/** 纠正目标（确定性派生；登记于纠正域事件 properties 与决策追踪）。 */
export type CorrectionTarget =
  | { kind: 'previous_candidate' }
  | { kind: 'current_candidate' }
  | { kind: 'creation_component'; component: string };

/**
 * 派生纠正目标（D-02 选项 A）：
 * - 指代词表命中（刚才 / 那个 / 上一步 / 上一个 / 上一版 / 上一个版本）
 *   → 上一候选；
 * - 创作域：创作分量经 TARGET_SYNONYMS 同义词表映射（与创作修改目标
 *   提取同源——单一词表）；
 * - 默认：当前候选。
 */
export function deriveCorrectionTarget(
  rawInput: string,
  creation?: CreationObject,
): CorrectionTarget {
  if (PREVIOUS_CANDIDATE_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { kind: 'previous_candidate' };
  }
  if (creation) {
    for (const synonym of TARGET_SYNONYMS) {
      if (synonym.pattern.test(rawInput)) {
        return { kind: 'creation_component', component: synonym.target };
      }
    }
  }
  return { kind: 'current_candidate' };
}
