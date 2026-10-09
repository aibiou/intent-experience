/**
 * 语义动作分类器（S1-05；S1 规范 §26 GS-01…GS-04 定义行为）。
 *
 * 确定性规则分类（合成模式）：输入自然语言 → S1 冻结语义动作。
 * 优先级（P-01 STOP 永远优先；P-03 显式用户方向优先；C3 §4 用户控制
 * 优先；PD-12 解释顺序 WHY > WHAT_IF；PD-21 关闭切片）：
 *   STOP > CHANGE_DIRECTION > CORRECTION > CREATE > WHY > WHAT_IF >
 *   DIRECT_ANSWER
 * （S2b 起 policy_v2.0.0 变更 4 冻结链：STOP > CHANGE_DIRECTION >
 * CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY =
 * WHAT_IF > DIRECT_ANSWER）
 *
 * 治理约束：
 * - 分类是确定性规则，不调用任何模型：模型异常不存在于本路径，
 *   因此"模型异常时不得改写用户意图"（GS-01 负向）由构造保证。
 * - 无法分类的输入返回 UNKNOWN 并升级（未知情况升级而非由 LLM 决定，
 *   授权 §5.7）；不在运行时发明语义。
 * - 语义动作词汇表：S1 冻结动作 + PD-21 关闭切片启用的 CREATE /
 *   CORRECTION（最小形态）+ S2b 启用的 DEEPEN / SIMPLIFY / REFRAME
 *   （S2B-SEMANTIC-FREEZE-01 D-01 选项 A——顶层语义动作）；
 *   SEARCH 不入语义动作域（内部能力动作——14 §7；S2b D-02 选项 A）。
 */

import type { SemanticAction } from './policy';
import { MODIFY_PATTERNS, RESTORE_PATTERNS } from './correction';
import { recognizeMemoryOperation } from './memory';

export type ClassificationResult =
  | { semanticAction: SemanticAction; correctionIntent?: 'restore' }
  | { semanticAction: 'UNKNOWN'; memoryIntent?: 'withdraw' | 'correct' };

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
  // PD-21 关闭切片（G08 当前会话方向信号：不持久化为跨会话偏好）：
  /不要这个/,
  /不要了/,
  /别这样/,
];

const CORRECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /不是/,
  /不对/,
  /错了/,
  /理解错/,
  /误解/,
];

const CREATE_PATTERNS: ReadonlyArray<RegExp> = [
  /做成/,
  /做一个/,
  /做出来/,
  /做个小?游戏/,
  /我想试试/,
  /创造/,
  /创作/,
];

const WHY_PATTERNS: ReadonlyArray<RegExp> = [/为什么/, /为何/, /为啥/, /什么缘故/];

/**
 * S2b 方向性操作识别词表（S2B-SEMANTIC-FREEZE-01 D-01 选项 A
 * ——确定性规则词表，model on F-4 D-03 纪律；自然语示例锚点：
 * 08 §十 修改类型与自然语示例）。碰撞核验：不命中任何更高
 * 优先级层词表——"换角度"不含"换个/换一"（不落入
 * CHANGE_DIRECTION），"重新框/重构视角/重新表述"不含"改"
 * （不落入 CORRECTION 修改族），三动作词表不含 STOP / CREATE
 * 标记；既有黄金输入与合成语料零命中（零黄金回归面）。
 */
const DEEPEN_PATTERNS: ReadonlyArray<RegExp> = [
  /深入/,
  /深挖/,
  /细化/,
  /更丰富/,
  /加深度/,
  /展开/,
];

const SIMPLIFY_PATTERNS: ReadonlyArray<RegExp> = [
  /简单一点/,
  /简单些/,
  /简化/,
  /简易化/,
  /再简单/,
  /太复杂/,
];

const REFRAME_PATTERNS: ReadonlyArray<RegExp> = [
  /换角度/,
  /换视角/,
  /重新框/,
  /重构视角/,
  /重新表述/,
  /另一种视角/,
];

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
  // PD-21 关闭切片：用户显式纠正 / 创造意图先于继续探索
  // （G04-NEG / G07-NEG 负向案例基础：CORRECTION / CREATE 优先于 WHY）。
  // F-3（policy_v1.3.0 变更 1）：MODIFY 登记为 CORRECTION 用户面
  // 别名（08 §10 修改类型族，与创作修改族同源——单一词表两处路由，
  // D-01 选项 A；授权 §2(2)）；RESTORE 词表（D-04 选项 A）登记为
  // CORRECTION 用户面恢复子型（correctionIntent='restore' 标记，
  // 路由恢复预检用）。优先级层不变（STOP / CHANGE_DIRECTION 仍先判）。
  const restoreIntent = RESTORE_PATTERNS.some((pattern) => pattern.test(rawInput));
  if (
    CORRECTION_PATTERNS.some((pattern) => pattern.test(rawInput)) ||
    MODIFY_PATTERNS.some((pattern) => pattern.test(rawInput)) ||
    restoreIntent
  ) {
    return {
      semanticAction: 'CORRECTION',
      ...(restoreIntent ? { correctionIntent: 'restore' as const } : {}),
    };
  }
  if (CREATE_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'CREATE' };
  }
  // S2b（policy_v2.0.0 变更 4 冻结优先级链）：DEEPEN =
  // SIMPLIFY = REFRAME 识别层位于 CREATE 之后、WHY 之前
  // （CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF）。
  if (DEEPEN_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'DEEPEN' };
  }
  if (SIMPLIFY_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'SIMPLIFY' };
  }
  if (REFRAME_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'REFRAME' };
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
  // S2a F-5（D-05 选项 A）：记忆操作识别——仅在全部既有优先级层
  // 未命中后调用（仅认领会成为 UNKNOWN 的输入；不改变
  // STOP > CHANGE_DIRECTION > CORRECTION > CREATE > WHY >
  // WHAT_IF > DIRECT_ANSWER 优先级层——零黄金套件回归面）。
  const memoryOperation = recognizeMemoryOperation(rawInput);
  if (memoryOperation) {
    return { semanticAction: 'UNKNOWN', memoryIntent: memoryOperation.memoryIntent };
  }
  return { semanticAction: 'UNKNOWN' };
}
