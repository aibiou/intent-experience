/**
 * 纠正运行时纯逻辑（G07 完整 Correction 语义；S2a 切片——真实 LLM 适配版）。
 *
 * 语义来源（frozen reference archive，G1 PASSED）：
 * - 08 号契约 §10（修改类型族）/§11（局部补丁）/§12（patch target 纪律）/
 *   §13（理解职责）/§16（冲突判据）/§28（版本化与 RESTORE_PREVIOUS_VERSION）；
 * - S2A-F3-SEMANTIC-FREEZE-01 v1.0.0（D-01 MODIFY 词表与创作修改族同源
 *   ——单一词表两处路由；D-02 纠正目标确定性规则派生；D-04 RESTORE 登记为
 *   CORRECTION 用户面恢复子型，不新增轴触发器）；
 * - Evaluation System V1 §5 G07（remove invalid inference / preserve valid
 *   context / reassess）；C05.2 动作表（MODIFY = "用户要求修改已有结果"）。
 *
 * 与参考实现（intent-experience-repo/src/experience/correction.ts）一致，
 * 本模块为确定性词表 + 纯函数派生：零 DB、零网络、零模型调用
 * （GS-01 负向：模型异常不得改写用户意图——构造保证）。
 * 事件登记（correction_applied / correction_restored）与版本化提交由
 * runtime 层承载（GS-06 单一写入者），不在本模块。
 */

import { TARGET_SYNONYMS, type CreationObject } from './creation';

// ---------------------------------------------------------------------------
// 词表（S2A-F3 D-01 / D-02 / D-04——确定性规则，同 S1 分类器纪律）
// ---------------------------------------------------------------------------

/**
 * MODIFY 词表（08 §10 修改类型族；与 interpretCreationInput 修改族
 * 同源——单一词表两处路由，D-01 选项 A）。通用分类器登记为
 * CORRECTION 用户面别名；创作会话路由保护预检复用。
 */
export const MODIFY_PATTERNS: ReadonlyArray<RegExp> = [
  /太难|太简单/,
  /科幻|科幻感|更有.{0,4}感/,
  /换成|替换/,
  /改名|叫做|更名为/,
  /改|修改|调整|放远|放近|太远|太近/,
];

/**
 * RESTORE 词表（S2A-F3 D-04 选项 A；08 §28："刚才那个更好" /
 * "退回刚才那个" / "撤销刚才修改" → RESTORE_PREVIOUS_VERSION
 * 用户面恢复子型）。
 */
export const RESTORE_PATTERNS: ReadonlyArray<RegExp> = [
  /刚才那个更好/,
  /退回刚才那个/,
  /撤销刚才修改/,
  /撤销刚才的修改/,
];

/** 指代词表（D-02 选项 A：命中 → 上一候选；确定性规则，无新增模型调用）。 */
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
