/**
 * 语义动作分类器（S1 切片；intent-experience classifier 契约的直接转写）。
 *
 * 确定性规则分类：输入自然语言 → 语义动作。不调用任何模型——
 * "模型异常时不得改写用户意图"（GS-01 负向）由构造保证。
 * 优先级链（S2b policy_v2 冻结链）：
 *   STOP > CHANGE_DIRECTION > CORRECTION > CREATE >
 *   DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER >
 *   （通用提问标记 → DIRECT_ANSWER）> CONTINUE / REPEAT > UNKNOWN
 * 无法分类的输入返回 UNKNOWN 并升级（不在运行时发明语义）。
 */

export type SemanticAction =
  | 'DIRECT_ANSWER'
  | 'WHY'
  | 'WHAT_IF'
  | 'CHANGE_DIRECTION'
  | 'STOP'
  | 'CREATE'
  | 'CORRECTION'
  | 'DEEPEN'
  | 'SIMPLIFY'
  | 'REFRAME'
  | 'CONTINUE'
  | 'REPEAT'
  | 'UNKNOWN';

const STOP_PATTERNS: ReadonlyArray<RegExp> = [
  /好了/,
  /先这样/,
  /就这些/,
  /到此为止/,
  /不用了/,
  /停止/,
  /不想(?:继续|看|听|玩|探索)/,
  /结束/,
  /就到这里/,
  /到此/,
  // 缺口修复（单测发现）：常见停止表达此前落入 UNKNOWN——
  // "算了" / 行首"停…"（锚定 ^，避免"地球停转""别停"误伤）/ "别说了" 等。
  /算了/,
  /^停/,
  /别说了/,
  /别讲了/,
  /不聊了/,
  /不玩了/,
  /别继续了/,
  /退出/,
];

const CHANGE_DIRECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /换一个/,
  /换个/,
  /换一/,
  /改变方向/,
  /换个方向/,
  /换一个方向/,
  /换个话题/,
  /不要这个/,
  /不要了/,
  /别这样/,
  /不想看这个/,
  /下一个/,
];

const CORRECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /不是这个意思/,
  /理解错/,
  /误解/,
  /我说错了/,
  /搞错了/,
  /不是的/,
  /不对/,
  /你不是这么说的/,
];

const CREATE_PATTERNS: ReadonlyArray<RegExp> = [
  /做成/,
  /做一个/,
  /做出来/,
  /做个小?游戏/,
  /创造/,
  /创作/,
  /画一个/,
  /写一个/,
  /编一个/,
];

const DEEPEN_PATTERNS: ReadonlyArray<RegExp> = [/深入/, /深挖/, /细化/, /更丰富/, /加深度/, /展开讲/];

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

const WHY_PATTERNS: ReadonlyArray<RegExp> = [/为什么/, /为何/, /为啥/, /什么缘故/, /怎么回事/];

const WHAT_IF_PATTERNS: ReadonlyArray<RegExp> = [/如果/, /假如/, /假设/, /要是/, /倘使/];

const DIRECT_ANSWER_PATTERNS: ReadonlyArray<RegExp> = [
  /直接告诉我/,
  /直接回答/,
  /直接说/,
  /告诉我答案/,
  /直接给/,
  /别绕/,
];

/** 通用提问标记：用户提出问题并期待回答（DIRECT_ANSWER 的默认形态）。 */
const QUESTION_MARKERS: ReadonlyArray<RegExp> = [
  /[？?]/,
  /什么/,
  /怎么/,
  /如何/,
  /哪里/,
  /哪个/,
  /谁/,
  /是否/,
  /吗/,
  /呢/,
  /告诉/,
  /回答/,
];

const CONTINUE_PATTERNS: ReadonlyArray<RegExp> = [/继续当前体验/, /继续/, /往下进行/, /接着来/, /然后呢/, /还有呢/];

const REPEAT_PATTERNS: ReadonlyArray<RegExp> = [
  /重复上一/,
  /再说一遍/,
  /重新表达/,
  /再表达一次/,
];

export interface ClassificationResult {
  semanticAction: SemanticAction;
}

/**
 * 分类输入文本。同一输入重复分类结果恒定（确定性；GS-01 负向案例的证据基础）。
 */
export function classifyInput(rawInput: string): ClassificationResult {
  // P-01：STOP 永远优先（STOP 压倒其他一切动作）。
  if (STOP_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'STOP' };
  }
  // P-03：显式方向变更优先于探索继续。
  if (CHANGE_DIRECTION_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'CHANGE_DIRECTION' };
  }
  if (CORRECTION_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'CORRECTION' };
  }
  if (CREATE_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'CREATE' };
  }
  // S2b 优先级链：DEEPEN = SIMPLIFY = REFRAME 位于 CREATE 之后、WHY 之前。
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
  // CONTINUE / REPEAT：仅认领全部既有优先级层未命中的输入。
  if (CONTINUE_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'CONTINUE' };
  }
  if (REPEAT_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { semanticAction: 'REPEAT' };
  }
  return { semanticAction: 'UNKNOWN' };
}
