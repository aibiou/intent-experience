/**
 * 语义动作分类器（S1-05；S1 规范 §26 GS-01…GS-04 定义行为）。
 *
 * 确定性规则分类（合成模式）：输入自然语言 → S1 冻结语义动作。
 * 优先级（P-01 STOP 永远优先；P-03 显式用户方向优先；PD-12 解释顺序
 * WHY > WHAT_IF）：
 *   STOP > CHANGE_DIRECTION > WHY > WHAT_IF > DIRECT_ANSWER
 *
 * 治理约束：
 * - 分类是确定性规则，不调用任何模型：模型异常不存在于本路径，
 *   因此"模型异常时不得改写用户意图"（GS-01 负向）由构造保证。
 * - 无法分类的输入返回 UNKNOWN 并升级（未知情况升级而非由 LLM 决定，
 *   授权 §5.7）；不在运行时发明语义。
 * - 仅覆盖 S1 冻结语义动作词汇表；CREATE/SEARCH 等 S1 禁用动作
 *   永不产生（PD-05/PD-06）。
 */

import type { SemanticAction } from './policy';

export type ClassificationResult =
  | { semanticAction: SemanticAction }
  | { semanticAction: 'UNKNOWN' };

const STOP_PATTERNS: ReadonlyArray<RegExp> = [
  /好了/,
  /先这样/,
  /就这些/,
  /到此为止/,
  /不用了/,
  /停止/,
];

const CHANGE_DIRECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /换一个/,
  /换个/,
  /换一/,
  /改变方向/,
  /换个方向/,
  /换一个方向/,
  /换个话题/,
];

const WHY_PATTERNS: ReadonlyArray<RegExp> = [/为什么/, /为何/, /为啥/, /什么缘故/];

const WHAT_IF_PATTERNS: ReadonlyArray<RegExp> = [/如果/, /假如/, /假设/, /要是/, /倘使/];

const DIRECT_ANSWER_PATTERNS: ReadonlyArray<RegExp> = [
  /直接告诉我/,
  /直接回答/,
  /直接说/,
  /告诉我答案/,
  /直接给/,
];

/** 通用提问标记：用户提出问题并期待回答（DIRECT_ANSWER 的默认形态）。 */
const QUESTION_MARKERS: ReadonlyArray<RegExp> = [
  /[？?]/,
  /什么/,
  /怎么/,
  /如何/,
  /为什么/,
  /为何/,
  /哪里/,
  /哪个/,
  /谁/,
  /是否/,
  /吗/,
  /呢/,
  /告诉/,
  /回答/,
];

/**
 * 分类输入文本。
 * 同一输入重复分类结果恒定（确定性；GS-01 负向案例的证据基础）。
 */
export function classifyInput(rawInput: string): ClassificationResult {
  // P-01：STOP 永远优先（输入含 STOP 标记时 STOP 压倒其他一切动作）。
  if (STOP_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'STOP' };
  }
  // P-03：显式方向变更优先于探索继续。
  if (CHANGE_DIRECTION_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'CHANGE_DIRECTION' };
  }
  // PD-12：WHY > WHAT_IF（同一优先级层内的解释顺序）。
  if (WHY_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'WHY' };
  }
  if (WHAT_IF_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'WHAT_IF' };
  }
  if (DIRECT_ANSWER_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'DIRECT_ANSWER' };
  }
  if (QUESTION_MARKERS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'DIRECT_ANSWER' };
  }
  return { semanticAction: 'UNKNOWN' };
}
