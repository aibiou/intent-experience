/**
 * 创作运行时纯逻辑（G04 完整 Creation 语义；S2a 切片——真实 LLM 适配版）。
 *
 * 语义来源（frozen reference archive，G1 PASSED）：
 * - 08 号契约 §4–§28（上下文继承五项 / 创作对象模型 / 修改类型与补丁 /
 *   创作会话输入路由 / ASK 纪律 / 预览核心 / 反馈循环 / 完成语义 /
 *   版本化与 RESTORE）；
 * - S2A-F2-SEMANTIC-FREEZE-01 v1.0.0（D-02 轴外子状态机 / D-03 会话内持久 /
 *   D-04 补丁操作值域收敛 {add, remove, modify} + restore 恢复轮次特例 /
 *   D-05 完成信号经 STOP 路径登记）；
 * - E2 Stage 5（CREATE → CONTEXT_INHERIT → MINIMAL_BUILD → PREVIEW →
 *   USER_FEEDBACK 编排标签为契约标签）。
 *
 * 与参考实现（intent-experience-repo/src/experience/creation.ts，合成模式）
 * 的关键适配（worklog 6-plan S2a 决策①——真实 LLM 适配）：
 * - 创作对象为内容型模型：concept{theme, goal} + content 草稿全文
 *   （由 LLM 生成 / 局部修改，runtime 维护）——参考的 objects/rules/
 *   variables 结构化模板为合成模式设计，本版不采用；
 * - applyCreationPatchMeta 只做版本与权威登记（version 恰好 +1、
 *   userChanges 追加），content 一律不变——内容由 runtime 经 LLM
 *   局部修改后另行写入（登记权威 / 内容生成分离）；
 * - 零 DB、零网络、零 Prisma；全部纯函数。持久化与 stale 拒绝由
 *   store / runtime 层承载（S1-03 / S1-12 同族纪律，不在本模块）。
 *
 * 不变式（本模块以纯函数结构保证的部分）：
 * - 子状态机未列出的 (phase, event) 组合一律返回 null（非法拒绝，
 *   同 S1-04 纪律）；completed 仅可从 USER_FEEDBACK 发出——完成前
 *   用户必经 PREVIEW（13 §21：存在未预览补丁不得 COMPLETE）；
 * - 版本单调 +1；userChanges 只追加（append-only 审计账本）；
 * - 补丁与历史登记为深拷贝（原对象不可变——调用方持有的旧版本
 *   不因后续补丁被 mutate）。
 */

import { isRestoreIntent } from './correction';

// ---------------------------------------------------------------------------
// 创作对象模型（08 §8 规范实例 + §9 分量；真实 LLM 适配——内容型模型）
// ---------------------------------------------------------------------------

/** 创作阶段（E2 Stage 5 编排标签；08 §5）。 */
export type CreationPhase =
  | 'CREATE_INTENT'
  | 'CONTEXT_INHERIT'
  | 'MINIMAL_BUILD'
  | 'PREVIEW'
  | 'USER_FEEDBACK'
  | 'COMPLETE';

/**
 * 创作补丁操作（08 §12 示例 operation 值域；S2A-F2 D-04 选项 A 收敛：
 * replace / tune / rebalance / rename / restyle 作 modify 的 change 子型；
 * restore 为 F-3 D-04 选项 A 的恢复轮次特例——版本单调 +1，
 * 新版本内容 = 目标历史版本内容，由 runtime 承载）。
 */
export type CreationOperation = 'add' | 'remove' | 'modify' | 'restore';

/** modify 的 change 子型（08 §10 修改类型中非 S2b 保留项；D-04 选项 A）。 */
export type CreationModifyKind = 'replace' | 'tune' | 'rebalance' | 'rename' | 'restyle';

/**
 * 创作补丁（08 §12：{operation, target, change}；summary 为人类可读摘要
 * ——用户原话）。
 */
export interface CreationPatch {
  operation: CreationOperation;
  target: string;
  change: {
    kind?: CreationModifyKind;
    count?: number;
    delta?: number;
    value?: number;
    to?: string;
    restoreFromVersion?: number;
    [key: string]: unknown;
  };
  summary: string;
}

/** 用户修改权威登记条目（08 §9 Versions：用户每次修改之后的状态）。 */
export interface CreationChange {
  version: number;
  at: string;
  patch: CreationPatch;
}

/**
 * 创作对象（08 §8/§9；真实 LLM 适配——内容型）：
 * concept{theme, goal} + content 草稿全文 + 用户修改权威历史 + 版本 + 阶段。
 * content 由 runtime 经 LLM 生成 / 局部修改后写入；本模块的补丁函数
 * 只管版本与登记，不改 content。
 */
export interface CreationObject {
  creationId: string;
  sourceSession: string;
  sourceStateVersion: number;
  concept: { theme: string; goal: string };
  /** 当前草稿全文（由 LLM 生成 / 修改，runtime 维护）。 */
  content: string;
  /** 用户修改权威登记（审计不变式：只追加，不重写）。 */
  userChanges: CreationChange[];
  /** 每次合法补丁恰好 +1（单调，永不回退）。 */
  version: number;
  phase: CreationPhase;
  createdAt: string;
  updatedAt: string;
}

/** 创作会话内输入解释结果（08 §13 理解职责 + §16 冲突判据 + §27 完成语义）。 */
export type CreationInterpretation =
  | { kind: 'completion' }
  | { kind: 'modification'; patch: CreationPatch }
  | { kind: 'ambiguous'; question: string; conflictingAxis: string }
  | { kind: 'none' };

// ---------------------------------------------------------------------------
// 创作子状态机（E2 Stage 5 契约标签；轴外承载——D-02 选项 A）
// ---------------------------------------------------------------------------

/** 子状态机事件（S2A-F2 冻结文本 §4 变更 1 迁移表）。 */
export type CreationPhaseEvent =
  | 'context_inherited'
  | 'minimal_built'
  | 'previewed'
  | 'feedback_started'
  | 'patch_applied'
  | 'completed';

/**
 * 合法迁移表（未列出的组合一律非法——同 S1-04 纪律）：
 * CREATE_INTENT → CONTEXT_INHERIT → MINIMAL_BUILD → PREVIEW → USER_FEEDBACK；
 * USER_FEEDBACK 经补丁应用 → PREVIEW（08 §11 / 13 §21：MODIFY → BUILD PATCH
 * → PREVIEW，多轮循环）；USER_FEEDBACK → COMPLETE（08 §27 / 13 §22）。
 * 不变式（13 §21）：completed 仅可从 USER_FEEDBACK 发出——补丁应用必经
 * PREVIEW，机器结构保证完成前用户必见预览。
 */
const CREATION_PHASE_RULES: ReadonlyArray<{
  from: CreationPhase;
  event: CreationPhaseEvent;
  to: CreationPhase;
}> = [
  { from: 'CREATE_INTENT', event: 'context_inherited', to: 'CONTEXT_INHERIT' },
  { from: 'CONTEXT_INHERIT', event: 'minimal_built', to: 'MINIMAL_BUILD' },
  { from: 'MINIMAL_BUILD', event: 'previewed', to: 'PREVIEW' },
  { from: 'PREVIEW', event: 'feedback_started', to: 'USER_FEEDBACK' },
  { from: 'USER_FEEDBACK', event: 'patch_applied', to: 'PREVIEW' },
  { from: 'USER_FEEDBACK', event: 'completed', to: 'COMPLETE' },
];

/**
 * 子状态机迁移（纯函数）。
 * 返回 null = 非法迁移（调用方拒绝写入，不修改状态）。
 */
export function nextCreationPhase(
  current: CreationPhase,
  event: CreationPhaseEvent,
): CreationPhase | null {
  const rule = CREATION_PHASE_RULES.find(
    (candidate) => candidate.from === current && candidate.event === event,
  );
  return rule ? rule.to : null;
}

// ---------------------------------------------------------------------------
// 上下文继承（08 §4/§6/§25 五项——主题 / 用户已经理解 / 核心变量 /
// 用户已经尝试 / 用户新的目标）
// ---------------------------------------------------------------------------

export interface InheritedCreationContext {
  theme: string;
  understood: string[];
  coreVariables: string[];
  attempted: string[];
  newGoal: string;
}

/**
 * 从当前探索上下文确定性派生继承五项（08 §4/§6/§25）。
 * - 主题透传（首个意图原始输入，由调用方传入）；
 * - 理解 = 已执行语义动作历史计数标签（direct_answer_delivered×N /
 *   explanation_delivered×N，仅 N > 0 时加入）；
 * - 尝试 = what_if_simulation×N / direction_change×N；
 * - 核心变量 = []（真实 LLM 模式下由最小构建提供，此处不提取）；
 * - 新目标 = CREATE 输入"做成 X"解析，未命中用 createInput 原文。
 * actionHistory 为语义动作字符串（与 policy 的 SemanticAction 值同域，
 * 此处以 string 解耦——本模块不依赖 policy）。
 */
export function inheritCreationContext(input: {
  theme: string;
  actionHistory: readonly string[];
  createInput: string;
}): InheritedCreationContext {
  let answerCount = 0;
  let whyCount = 0;
  let whatIfCount = 0;
  let changeCount = 0;
  for (const action of input.actionHistory) {
    if (action === 'DIRECT_ANSWER') {
      answerCount += 1;
    } else if (action === 'WHY') {
      whyCount += 1;
    } else if (action === 'WHAT_IF') {
      whatIfCount += 1;
    } else if (action === 'CHANGE_DIRECTION') {
      changeCount += 1;
    }
  }
  const understood: string[] = [];
  if (answerCount > 0) {
    understood.push(`direct_answer_delivered×${answerCount}`);
  }
  if (whyCount > 0) {
    understood.push(`explanation_delivered×${whyCount}`);
  }
  const attempted: string[] = [];
  if (whatIfCount > 0) {
    attempted.push(`what_if_simulation×${whatIfCount}`);
  }
  if (changeCount > 0) {
    attempted.push(`direction_change×${changeCount}`);
  }
  const goalMatch = /做成(.+?)[。.]?$/.exec(input.createInput);
  return {
    theme: input.theme,
    understood,
    coreVariables: [],
    attempted,
    newGoal: goalMatch ? goalMatch[1] : input.createInput,
  };
}

// ---------------------------------------------------------------------------
// 修改意图识别（确定性规则，非模型——同 S1 分类器纪律）
// 语义来源：08 §10 示例映射 + 08 §16 冲突判据 + 08 §27 完成词表
// ---------------------------------------------------------------------------

/** 完成信号词表（08 §27；"好了"由通用 STOP 分类覆盖，此处补齐其余词）。 */
const COMPLETION_PATTERN = /就这样|可以了|完成|这个就是我想要的/;

/** ADD 意图（08 §10 示例："再加两个障碍" → ADD）。 */
const ADD_PATTERN = /加|添加|增加|多一|多两|多三|再来一个/;

/** REMOVE 意图（08 §10 修改类型；示例形状派生）。 */
const REMOVE_PATTERN = /移除|去掉|删除|减少/;

/** MODIFY 意图与 change 子型（08 §10：rebalance > restyle > replace > rename > tune）。 */
const MODIFY_REBALANCE_PATTERN = /太难|太简单/;
const MODIFY_RESTYLE_PATTERN = /科幻|科幻感|更有.{0,4}感/;
const MODIFY_REPLACE_PATTERN = /换成|替换/;
const MODIFY_RENAME_PATTERN = /改名|叫做|更名为/;
const MODIFY_TUNE_PATTERN = /改|修改|调整|放远|放近|太远|太近/;

/** 数量提取（08 §12 示例 {operation: "add", target: "obstacle", count: 2}）。
 * 确定性词表按序首个命中，不做算术。 */
export function extractCount(rawInput: string): number {
  if (/两|2/.test(rawInput)) return 2;
  if (/三|3/.test(rawInput)) return 3;
  if (/四|4/.test(rawInput)) return 4;
  if (/五|5/.test(rawInput)) return 5;
  if (/十|10/.test(rawInput)) return 10;
  return 1;
}

/**
 * 目标名词映射（确定性同义词表；未命中默认 'creation' 级修改）。
 * F-3 起导出（D-02 选项 A：纠正目标派生经同一同义词表映射创作
 * 分量——单一词表两处路由）。
 */
export const TARGET_SYNONYMS: ReadonlyArray<{ pattern: RegExp; target: string }> = [
  { pattern: /出口/, target: 'exit' },
  { pattern: /障碍/, target: 'obstacle' },
  { pattern: /玩家|角色/, target: 'player' },
  { pattern: /时间|时限/, target: 'time_limit' },
  { pattern: /难度/, target: 'difficulty' },
  { pattern: /资源/, target: 'resource' },
  { pattern: /分数|得分/, target: 'score' },
  { pattern: /关卡/, target: 'level' },
];

/**
 * 补丁目标提取（三层，确定性）：
 * 1. 中文同义词表命中（出口→exit / 障碍→obstacle / …）；
 * 2. 创作草稿 content 含某英文目标词（真实 LLM 适配：草稿由 LLM 生成，
 *    分量以英文标签形态出现在 content 中——首个命中者）；
 * 3. 默认 'creation'（作品级修改）。
 */
export function extractTarget(rawInput: string, creation: CreationObject): string {
  for (const synonym of TARGET_SYNONYMS) {
    if (synonym.pattern.test(rawInput)) {
      return synonym.target;
    }
  }
  for (const synonym of TARGET_SYNONYMS) {
    if (creation.content.includes(synonym.target)) {
      return synonym.target;
    }
  }
  return 'creation';
}

/** 既有轴触发器词表（冲突判据；08 §16：与修改意图同时命中 → 至多一个澄清问题）。 */
const AXIS_CONFLICT_PATTERNS: ReadonlyArray<{ pattern: RegExp; axis: string }> = [
  { pattern: /换|不要这个|别这样|不要了/, axis: 'CHANGE_DIRECTION' },
  { pattern: /不是|不对|错了|理解错|误解/, axis: 'CORRECTION' },
  { pattern: /如果|假如|假设|要是|倘使/, axis: 'WHAT_IF' },
  { pattern: /为什么|为何|为啥/, axis: 'WHY' },
];

/**
 * 创作会话内输入解释（08 §13 理解职责）。
 * 仅当通用分类器返回 UNKNOWN 时由运行时调用（通用分类权威不变；
 * S2A-F2 §3 变更 2：修改意图不落入通用 CORRECTION → EXPLAIN 路径）。
 * 顺序：完成信号（08 §27 立即结束）→ 修改意图（08 §10 示例映射）→
 * 冲突判据（08 §16：能安全推断就直接做；与既有轴触发器冲突时不自动
 * 判定——至多一个高价值澄清问题）→ none。
 */
export function interpretCreationInput(
  rawInput: string,
  creation: CreationObject,
): CreationInterpretation {
  // 1. 完成信号（08 §27：立即结束，不自动推荐、不自动继续）。
  if (COMPLETION_PATTERN.test(rawInput)) {
    return { kind: 'completion' };
  }

  // 2. 修改意图识别（08 §10 示例映射；add/remove 带 count，modify 带 kind）。
  let patch: CreationPatch | null = null;
  if (ADD_PATTERN.test(rawInput)) {
    patch = {
      operation: 'add',
      target: extractTarget(rawInput, creation),
      change: { count: extractCount(rawInput) },
      summary: rawInput,
    };
  } else if (REMOVE_PATTERN.test(rawInput)) {
    patch = {
      operation: 'remove',
      target: extractTarget(rawInput, creation),
      change: { count: extractCount(rawInput) },
      summary: rawInput,
    };
  } else if (
    MODIFY_REBALANCE_PATTERN.test(rawInput) ||
    MODIFY_RESTYLE_PATTERN.test(rawInput) ||
    MODIFY_REPLACE_PATTERN.test(rawInput) ||
    MODIFY_RENAME_PATTERN.test(rawInput) ||
    MODIFY_TUNE_PATTERN.test(rawInput)
  ) {
    let kind: CreationModifyKind = 'tune';
    if (MODIFY_REBALANCE_PATTERN.test(rawInput)) {
      kind = 'rebalance';
    } else if (MODIFY_RESTYLE_PATTERN.test(rawInput)) {
      kind = 'restyle';
    } else if (MODIFY_REPLACE_PATTERN.test(rawInput)) {
      kind = 'replace';
    } else if (MODIFY_RENAME_PATTERN.test(rawInput)) {
      kind = 'rename';
    }
    const change: CreationPatch['change'] = { kind };
    if (kind === 'rename' && /改名为?(.+?)[。.]?$/.test(rawInput)) {
      change.to = /改名为?(.+?)[。.]?$/.exec(rawInput)?.[1];
    }
    patch = { operation: 'modify', target: extractTarget(rawInput, creation), change, summary: rawInput };
  }

  if (!patch) {
    return { kind: 'none' };
  }

  // 3. 冲突判据（08 §16：命中修改意图又命中冲突轴 → 不自动判定，
  //    至多一个澄清问题）。
  for (const axis of AXIS_CONFLICT_PATTERNS) {
    if (axis.pattern.test(rawInput)) {
      return {
        kind: 'ambiguous',
        conflictingAxis: axis.axis,
        question: `你的输入同时涉及修改当前作品与${axis.axis}意图。请确认：要把它作为当前作品的修改，还是作为${axis.axis}处理？（创作 ASK 纪律：至多一个澄清问题，08 §16）`,
      };
    }
  }

  return { kind: 'modification', patch };
}

// ---------------------------------------------------------------------------
// 补丁登记（纯函数；08 §11/§28：版本化提交 + 权威历史）
// 与参考 applyCreationPatch 的关键差异（真实 LLM 适配）：本函数只管
// 版本与登记，content 不变——内容由 runtime 经 LLM 局部修改后另行写入。
// ---------------------------------------------------------------------------

/** 深拷贝创作对象（补丁必须产生新版本对象；旧对象不被 mutate）。 */
function cloneCreation(creation: CreationObject): CreationObject {
  return {
    ...creation,
    concept: { ...creation.concept },
    userChanges: creation.userChanges.map((change) => ({
      ...change,
      patch: { ...change.patch, change: { ...change.patch.change } },
    })),
  };
}

/**
 * 应用一次创作补丁的纯状态部分（08 §11/§12/§28）：
 * - 深拷贝（原对象不可变）；
 * - version 恰好 +1（单调；失败写入不消耗版本号由调用方守卫）；
 * - updatedAt = now；
 * - userChanges 追加 {version, at, patch}（append-only 权威登记）；
 * - content 一律不变（真实 LLM 适配：内容由 runtime 经 LLM 局部修改后
 *   另行写入——登记权威 / 内容生成分离）。
 */
export function applyCreationPatchMeta(
  creation: CreationObject,
  patch: CreationPatch,
  now: string,
): CreationObject {
  const next = cloneCreation(creation);
  next.version = creation.version + 1;
  next.updatedAt = now;
  next.userChanges = [
    ...next.userChanges,
    { version: next.version, at: now, patch: { ...patch, change: { ...patch.change } } },
  ];
  return next;
}

/**
 * 构造恢复补丁（08 §28 RESTORE_PREVIOUS_VERSION；F-3 D-04 选项 A）：
 * {operation: 'restore', target: 'creation', change: {restoreFromVersion}}。
 * 恢复为作品级操作（target 恒 'creation'）；creation 参数保留于签名
 * （与 interpretRestore 的调用形状对称，供后续分量级恢复扩展）。
 * 版本单调 +1 与内容回填由 applyCreationPatchMeta（登记）+ runtime
 * （内容）承载。
 */
export function buildRestorePatch(
  creation: CreationObject,
  fromVersion: number,
  summary: string,
): CreationPatch {
  void creation;
  return {
    operation: 'restore',
    target: 'creation',
    change: { restoreFromVersion: fromVersion },
    summary,
  };
}

/**
 * 恢复意图解释（08 §28；RESTORE 词表来自 correction.ts——单一词表
 * 两处路由）。命中且存在可恢复历史时返回 restore 补丁：
 * fromVersion = max(1, creation.version - 1)（版本指针永不回退；
 * 无历史（version = 1）时指向初始版本 1）。未命中返回 null。
 */
export function interpretRestore(
  rawInput: string,
  creation: CreationObject,
): { kind: 'restore'; patch: CreationPatch } | null {
  if (!isRestoreIntent(rawInput)) {
    return null;
  }
  const fromVersion = Math.max(1, creation.version - 1);
  return {
    kind: 'restore',
    patch: buildRestorePatch(creation, fromVersion, rawInput),
  };
}
