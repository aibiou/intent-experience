/**
 * 创作运行时（G04 完整 Creation 语义；S2A-F2-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §3/§4）。
 *
 * 语义来源（frozen reference archive，G1 PASSED）：
 * - 08 号契约 §3–§28（进入条件 / 阶段链 / 创作对象模型 / 上下文继承 /
 *   修改类型与补丁 / 修改运行时 / 创作域策略 / ASK 纪律 / 用户主权 /
 *   预览核心 / 反馈循环 / 完成语义 / 版本化 / 安全禁区 / Creation Graph）
 * - 13 号状态机规范 §15.4/§15.5/§16–§23（创造状态机为独立 V1 机器；
 *   修改必须形成明确补丁；存在未预览补丁不得 COMPLETE；forbidden transitions）
 * - E2 Stage 5（CREATE → CONTEXT_INHERIT → MINIMAL_BUILD → PREVIEW →
 *   USER_FEEDBACK 编排标签为契约标签）
 *
 * 治理约束（冻结文本 §2 裁决区，产品负责人 2026-10-09 签署）：
 * - D-02 选项 A：创作子状态机轴外承载于持久创作对象，体验阶段轴不变；
 * - D-03 选项 A：创作状态会话内持久（跨 USER_ACTION / RESPONSE_COMPLETED
 *   周期存活），跨会话持久化属 F-5 Minimal Memory 裁决范围；
 * - D-04 选项 A：补丁 operation 值域收敛为 {add, remove, modify}，
 *   REPLACE / TUNE / REBALANCE / RENAME / RESTYLE 作 modify 的 change 子型；
 *   SIMPLIFY / DEEPEN / REFRAME 经 S2b 实施为顶层补丁操作
 *   （S2B-SEMANTIC-FREEZE-01 v1.0.0 D-01 选项 A——与
 *   add / remove / modify 同级，policy_v2.0.0 变更 3）；
 * - D-05 选项 A：CREATION_COMPLETE 经 STOP 执行路径在创作域登记，
 *   体验轴触发器不变（P-01 STOP 永远优先链不动）。
 *
 * 不变式（授权 §3.2 明示保持）：
 * - 创作状态写入经 Runtime 单一写入者（GS-06 / CC02；LLM / 前端不得直接写）；
 * - 版本化提交 + stale 拒绝（expectedCreationVersion 不一致 →
 *   STATE_VERSION_CONFLICT，不修改状态——S1-12 同族纪律）；
 * - 失败写入不消耗版本号（OBL-01 纪律）；错误路径不修改已提交状态（S1 §28）；
 * - 补丁应用是局部变更（08 §11：不重新生成整个作品；版本单调 + user_changes 累积）。
 */

import type { SemanticAction } from './policy';

// ---------------------------------------------------------------------------
// 创作对象模型（08 §8 规范实例 + §9 九分量）
// ---------------------------------------------------------------------------

/** 创作阶段（E2 Stage 5 编排标签；08 §5；13 §16 同义标签对账见冻结文本 §4 变更 1）。 */
export type CreationPhase =
  | 'CREATE_INTENT'
  | 'CONTEXT_INHERIT'
  | 'MINIMAL_BUILD'
  | 'PREVIEW'
  | 'USER_FEEDBACK'
  | 'COMPLETE';

/**
 * 创作补丁操作（08 §12 示例 operation 值域；D-04 选项 A 收敛；
 * restore 为 F-3 D-04 选项 A 的恢复轮次特例——修改轮次特例，
 * 版本单调 +1，新版本内容 = 目标历史版本内容；
 * deepen / simplify / reframe 为 S2b 顶层方向性补丁操作
 * （S2B-SEMANTIC-FREEZE-01 D-01 选项 A——整体验方向性操作
 * （深入 / 简化 / 换角度），不可归约为局部修改，故与
 * add / remove / modify 同级而非 modify 子型；合成模式下
 * 结构保持、版本 +1、user_changes 权威登记——08 §11
 * 局部变更纪律，policy_v2.0.0 变更 3）。
 */
export type CreationOperation =
  | 'add'
  | 'remove'
  | 'modify'
  | 'restore'
  | 'deepen'
  | 'simplify'
  | 'reframe';

/** modify 的 change 子型（08 §10 修改类型中非 S2b 保留项；D-04 选项 A）。 */
export type CreationModifyKind =
  | 'replace'
  | 'tune'
  | 'rebalance'
  | 'rename'
  | 'restyle';

/** 创作补丁（08 §12：{operation, target, change}；summary 为人类可读摘要）。 */
export interface CreationPatch {
  operation: CreationOperation;
  target: string;
  change: {
    kind?: CreationModifyKind;
    count?: number;
    delta?: number;
    value?: number;
    to?: string;
    [key: string]: unknown;
  };
  summary: string;
}

/** 用户修改历史条目（08 §9 Versions：用户每次修改之后的状态）。 */
export interface CreationChange {
  version: number;
  at: string;
  patch: CreationPatch;
}

/** 创作对象（08 §8/§9：九分量 + 身份 / 来源 / 用户修改 / 版本 / 阶段）。 */
export interface CreationObject {
  creationId: string;
  sourceExperience: { experienceId: string; stateVersion: number };
  concept: { theme: string; coreMechanic: string; goal: string };
  objects: string[];
  rules: string[];
  variables: Record<string, number>;
  interactions: string[];
  presentation: string;
  /** 完成条件（08 §9 Goal：什么时候算完成；08 §27 完成信号词表由运行时识别）。 */
  goal: string;
  userChanges: CreationChange[];
  version: number;
  phase: CreationPhase;
  createdAt: string;
  updatedAt: string;
}

/** 创作记录（会话生命周期；D-03 选项 A——会话内持久）。 */
export interface CreationRecord {
  creation: CreationObject;
  /** 会话内存活标记：完成 / 取代 / 终止后置 false（历史保留至会话结束）。 */
  active: boolean;
  endedReason?: string;
}

// ---------------------------------------------------------------------------
// 创作子状态机（13 §16 的 E2 标签契约化；轴外承载——D-02 选项 A）
// ---------------------------------------------------------------------------

/** 子状态机事件（冻结文本 §4 变更 1 迁移表）。 */
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
 * 不变式（13 §21）：存在未预览补丁时不得 COMPLETE——补丁应用必经 PREVIEW，
 * 机器结构保证完成前用户必见预览。
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
// 上下文继承（08 §4/§6/§25：五项——主题 / 用户已经理解 / 核心变量 /
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
 * 从当前探索上下文确定性派生继承五项（合成模式纪律：
 * 主题 = 首个意图原始输入；理解 / 尝试 = 已执行语义动作历史标签；
 * 核心变量 = 合成模式不提取（NL 变量提取须真实模式 LLM），
 * 由最小构建提供基础变量集；新目标 = CREATE 输入"做成 X"解析）。
 */
export function inheritCreationContext(input: {
  theme: string;
  actionHistory: readonly SemanticAction[];
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
    understood.push(`direct_answer_delivered\u00d7${answerCount}`);
  }
  if (whyCount > 0) {
    understood.push(`explanation_delivered\u00d7${whyCount}`);
  }
  const attempted: string[] = [];
  if (whatIfCount > 0) {
    attempted.push(`what_if_simulation\u00d7${whatIfCount}`);
  }
  if (changeCount > 0) {
    attempted.push(`direction_change\u00d7${changeCount}`);
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

/**
 * 最小可玩物构建（08 §6/§7：第一次创建必须尽快产生可感知结果；
 * 先做一个可玩的东西，再让用户修改；不问类型配置）。
 * 合成模式确定性模板（与 SyntheticLlmGateway 固定语料纪律一致）。
 */
export function buildMinimalCreation(input: {
  creationId: string;
  experienceId: string;
  stateVersion: number;
  inherited: InheritedCreationContext;
  at: string;
}): CreationObject {
  return {
    creationId: input.creationId,
    sourceExperience: { experienceId: input.experienceId, stateVersion: input.stateVersion },
    concept: {
      theme: input.inherited.theme,
      coreMechanic: 'minimal_playable_loop',
      goal: input.inherited.newGoal,
    },
    objects: ['player', 'exit'],
    rules: ['player_progresses_toward_exit', 'reach_exit_to_complete'],
    variables: { progress: 0 },
    interactions: ['move', 'observe'],
    presentation: 'text',
    goal: input.inherited.newGoal,
    userChanges: [],
    version: 1,
    phase: 'CONTEXT_INHERIT',
    createdAt: input.at,
    updatedAt: input.at,
  };
}

// ---------------------------------------------------------------------------
// 补丁应用（纯函数；08 §11：局部补丁，不重新生成整个作品）
// ---------------------------------------------------------------------------

/** 深拷贝创作对象（结构共享不适用——补丁必须产生新版本对象）。 */
function cloneCreation(creation: CreationObject): CreationObject {
  return {
    ...creation,
    sourceExperience: { ...creation.sourceExperience },
    concept: { ...creation.concept },
    objects: [...creation.objects],
    rules: [...creation.rules],
    variables: { ...creation.variables },
    interactions: [...creation.interactions],
    userChanges: creation.userChanges.map((change) => ({ ...change, patch: { ...change.patch, change: { ...change.patch.change } } })),
  };
}

/**
 * 应用一次创作补丁（08 §11/§12）。
 * - add：目标对象追加（已存在则序号去重），变量 {target}_count 累加；
 * - remove：目标对象移除（至多 count 个），变量 {target}_count 扣减；
 * - modify：rename → 对象重命名；数值 delta / value → 变量调整；
 *   其余（tune / rebalance / restyle / replace 及未命中目标的结构）
 *   变更事实经 userChanges 权威登记，版本 +1，结构保持（局部修改）。
 * - restore（D-04 选项 A；08 §28）：恢复目标历史版本内容——新版本
 *   内容 = 目标历史版本内容（经版本快照历史定位，D-04 实施承载）；
 *   版本单调 +1（S1-12 不变式：版本指针永不回退）；user_changes
 *   登记 restore 条目（含恢复来源版本号——change.restoreFromVersion）。
 * - deepen / simplify / reframe（S2b；D-01 选项 A）：方向性补丁——
 *   合成模式下结构保持（方向性语义属真实模式生成纪律），版本
 *   单调 +1，user_changes 权威登记方向性条目（change.direction
 *   标识操作方向——08 §11 局部变更纪律：不重新生成整个作品）。
 * 任何补丁：version +1、userChanges 追加（版本化提交；08 §28 单调历史）。
 */
export function applyCreationPatch(
  creation: CreationObject,
  patch: CreationPatch,
  now: string,
  history?: ReadonlyArray<CreationObject>,
): CreationObject {
  const next = cloneCreation(creation);
  next.version = creation.version + 1;
  next.updatedAt = now;
  next.userChanges = [
    ...creation.userChanges,
    { version: next.version, at: now, patch: { ...patch, change: { ...patch.change } } },
  ];

  if (patch.operation === 'add') {
    const count = typeof patch.change.count === 'number' && patch.change.count > 0 ? patch.change.count : 1;
    for (let i = 0; i < count; i += 1) {
      const exists = next.objects.includes(patch.target);
      const name = exists || i > 0 ? `${patch.target}_${next.version}_${i + 1}` : patch.target;
      if (!next.objects.includes(name)) {
        next.objects.push(name);
      }
    }
    const countKey = `${patch.target}_count`;
    next.variables[countKey] = (next.variables[countKey] ?? 0) + count;
  } else if (patch.operation === 'remove') {
    const count = typeof patch.change.count === 'number' && patch.change.count > 0 ? patch.change.count : 1;
    let removed = 0;
    next.objects = next.objects.filter((object) => {
      const matches = object === patch.target || object.startsWith(`${patch.target}_`);
      if (matches && removed < count) {
        removed += 1;
        return false;
      }
      return true;
    });
    const countKey = `${patch.target}_count`;
    next.variables[countKey] = Math.max(0, (next.variables[countKey] ?? 0) - count);
  } else if (patch.operation === 'restore') {
    // RESTORE（D-04 选项 A；08 §28）：恢复目标历史版本内容——
    // 新版本内容 = 目标历史版本内容；版本单调 +1（S1-12 不变式：
    // 版本指针永不回退）；user_changes 登记 restore 条目（含来源
    // 版本号——上方已追加）。目标版本快照缺失（不应发生——调用方
    // 经版本前置校验）时结构保持当前版本，版本与变更事实照常登记。
    const fromVersion =
      typeof patch.change.restoreFromVersion === 'number'
        ? patch.change.restoreFromVersion
        : creation.version;
    const snapshot = history?.find((candidate) => candidate.version === fromVersion);
    if (snapshot) {
      const restored = cloneCreation(snapshot);
      next.concept = restored.concept;
      next.objects = restored.objects;
      next.rules = restored.rules;
      next.variables = restored.variables;
      next.interactions = restored.interactions;
      next.presentation = restored.presentation;
      next.goal = restored.goal;
    }
  } else {
    // modify
    if (patch.change.kind === 'rename' && typeof patch.change.to === 'string') {
      next.objects = next.objects.map((object) =>
        object === patch.target || object.startsWith(`${patch.target}_`) ? patch.change.to as string : object,
      );
    } else if (
      Object.prototype.hasOwnProperty.call(next.variables, patch.target) &&
      (typeof patch.change.value === 'number' || typeof patch.change.delta === 'number')
    ) {
      const base = next.variables[patch.target];
      next.variables[patch.target] =
        typeof patch.change.value === 'number' ? patch.change.value : base + (patch.change.delta as number);
    } else if (
      typeof patch.change.delta === 'number' &&
      Object.prototype.hasOwnProperty.call(next.variables, `${patch.target}_count`)
    ) {
      next.variables[`${patch.target}_count`] += patch.change.delta;
    }
    // 非结构性修改（tune / rebalance / restyle / replace 与未命中目标）：
    // 变更事实登记于 userChanges（上方已追加），结构保持不变——
    // 局部修改，不重新生成整个作品（08 §11）。
  }
  return next;
}

// ---------------------------------------------------------------------------
// 创作修改意图识别（确定性规则，非模型——同 S1 分类器纪律）
// 语义来源：08 §10 示例映射 + 08 §16 冲突判据 + 08 §27 完成词表
// ---------------------------------------------------------------------------

export type CreationInterpretation =
  | { kind: 'completion' }
  | { kind: 'modification'; patch: CreationPatch }
  | { kind: 'ambiguous'; question: string; conflictingAxis: string }
  | { kind: 'none' };

// S2b（D-01 选项 A；policy_v2.0.0 变更 1/3）：DEEPEN / SIMPLIFY /
// REFRAME 已经产品负责人版本化冻结并授权实施（S2B-SEMANTIC-FREEZE-01
// v1.0.0）——三动作由顶层分类器识别为顶层语义动作（14 §8 恒等
// 映射），创作会话内经 buildDirectionalPatch 构造顶层补丁操作；
// 本解释器不再升级拒绝（保留操作纪律经分类器优先级链与运行时
// 非创作会话升级路径承接——policy_v2.0.0 变更 5）。

/** 完成信号词表（08 §27；"好了" 由通用 STOP 分类直接覆盖，此处补齐其余词）。 */
const COMPLETION_PATTERN = /就这样|可以了|完成|这个就是我想要的/;

/** ADD 意图（08 §10 示例："再加两个障碍" → ADD）。 */
const ADD_PATTERN = /加|添加|增加|多一|多两|多三|再来一个/;
/** REMOVE 意图（08 §10 修改类型；示例形状派生）。 */
const REMOVE_PATTERN = /移除|去掉|删除|减少/;
/** MODIFY 意图与 change 子型（08 §10 示例："把出口放远一点" → MODIFY；"太难了" → REBALANCE；"做得更有科幻感" → RESTYLE）。 */
const MODIFY_REBALANCE_PATTERN = /太难|太简单/;
const MODIFY_RESTYLE_PATTERN = /科幻|科幻感|更有.{0,4}感/;
const MODIFY_REPLACE_PATTERN = /换成|替换/;
const MODIFY_RENAME_PATTERN = /改名|叫做|更名为/;
const MODIFY_TUNE_PATTERN = /改|修改|调整|放远|放近|太远|太近/;

/** 数量提取（08 §12 示例 {operation: "add", target: "obstacle", count: 2}）。 */
function extractCount(rawInput: string): number {
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

function extractTarget(rawInput: string, creation: CreationObject): string {
  for (const synonym of TARGET_SYNONYMS) {
    if (synonym.pattern.test(rawInput)) {
      return synonym.target;
    }
  }
  for (const object of creation.objects) {
    if (rawInput.includes(object)) {
      return object;
    }
  }
  return 'creation';
}

/**
 * 方向性操作补丁构建（S2b；S2B-SEMANTIC-FREEZE-01 D-01 选项
 * A——顶层语义动作 DEEPEN / SIMPLIFY / REFRAME 的创作域承载：
 * 与 add / remove / modify 同级的顶层补丁操作。目标经
 * TARGET_SYNONYMS 同义词表确定性派生（默认 'creation' 级
 * 方向性修改）；change.direction 登记操作方向——合成模式下
 * 方向性操作不重生成作品（08 §11 局部变更纪律），版本 +1、
 * user_changes 权威登记）。
 */
export function buildDirectionalPatch(
  operation: 'deepen' | 'simplify' | 'reframe',
  rawInput: string,
  creation: CreationObject,
): CreationPatch {
  return {
    operation,
    target: extractTarget(rawInput, creation),
    change: { direction: operation },
    summary: rawInput,
  };
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
 * 冻结文本 §3 变更 2：修改意图不落入通用 CORRECTION → EXPLAIN 路径）。
 */
export function interpretCreationInput(
  rawInput: string,
  creation: CreationObject,
): CreationInterpretation {
  // 1. 完成信号（08 §27：立即结束，不自动推荐、不自动继续）。
  if (COMPLETION_PATTERN.test(rawInput)) {
    return { kind: 'completion' };
  }

  // 2. 修改意图识别（08 §10 示例映射）。
  let patch: CreationPatch | null = null;
  if (ADD_PATTERN.test(rawInput)) {
    const target = extractTarget(rawInput, creation);
    patch = {
      operation: 'add',
      target,
      change: { count: extractCount(rawInput) },
      summary: rawInput,
    };
  } else if (REMOVE_PATTERN.test(rawInput)) {
    const target = extractTarget(rawInput, creation);
    patch = {
      operation: 'remove',
      target,
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
    const target = extractTarget(rawInput, creation);
    const change: CreationPatch['change'] = { kind };
    if (kind === 'rename' && /改名为?(.+?)[。.]?$/.test(rawInput)) {
      change.to = /改名为?(.+?)[。.]?$/.exec(rawInput)?.[1];
    }
    patch = { operation: 'modify', target, change, summary: rawInput };
  }

  if (!patch) {
    return { kind: 'none' };
  }

  // 3. 冲突判据（08 §16：能安全推断就直接做；与既有轴触发器冲突时
  //    不自动判定——至多一个高价值澄清问题）。
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
// 创作存储（版本化提交 + stale 拒绝 + 承诺链串行化；
// 同 ExperienceStateStore 纪律——S1-03/S1-12 同族）
// ---------------------------------------------------------------------------

export type CreationCommitResult =
  | { ok: true; record: CreationRecord }
  | {
      ok: false;
      code: 'STATE_VERSION_CONFLICT';
      expectedVersion: number;
      currentVersion: number;
    };

export type CreationPhaseResult =
  | { ok: true; record: CreationRecord; from: CreationPhase; to: CreationPhase; event: CreationPhaseEvent }
  | { ok: false; code: 'CREATION_PHASE_ILLEGAL'; from: CreationPhase; event: CreationPhaseEvent };

/**
 * 创作状态存储（每体验一个创作会话；D-03 选项 A——会话内持久）。
 * - commitPatch：版本化补丁提交（expectedVersion 陈旧 → 冲突拒绝，不修改状态）；
 * - advancePhase：子状态机迁移（不消耗版本号——阶段迁移非修改轮次）；
 * - end：会话生命周期终止（完成 / 取代 / 终止；历史保留至会话结束）。
 * 同一体验的写入经承诺链串行化（并发写入先后关系确定可复现——S1-12 同族）。
 */
export class CreationStore {
  private readonly records = new Map<string, CreationRecord>();
  /**
   * 版本内容快照历史（D-04 实施承载——RESTORE 恢复源；08 §28
   * 版本化历史）。每次合法提交（create / commitPatch）快照当前
   * 版本；会话内持久（D-03 选项 A——历史保留至会话结束）。
   */
  private readonly histories = new Map<string, CreationObject[]>();
  private readonly locks = new Map<string, Promise<unknown>>();

  create(record: CreationRecord): CreationRecord {
    this.records.set(record.creation.sourceExperience.experienceId, record);
    this.histories.set(record.creation.sourceExperience.experienceId, [record.creation]);
    return record;
  }

  get(experienceId: string): CreationRecord | undefined {
    return this.records.get(experienceId);
  }

  private async serialize<T>(experienceId: string, action: () => T | Promise<T>): Promise<T> {
    const previous = this.locks.get(experienceId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(experienceId, gate);
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  /** 版本化补丁提交（stale 拒绝；失败不修改状态）。 */
  async commitPatch(
    experienceId: string,
    expectedVersion: number,
    patch: CreationPatch,
    now: string,
  ): Promise<CreationCommitResult> {
    return this.serialize(experienceId, () => {
      const record = this.records.get(experienceId);
      if (!record || !record.active) {
        return {
          ok: false as const,
          code: 'STATE_VERSION_CONFLICT' as const,
          expectedVersion,
          currentVersion: -1,
        };
      }
      if (record.creation.version !== expectedVersion) {
        return {
          ok: false as const,
          code: 'STATE_VERSION_CONFLICT' as const,
          expectedVersion,
          currentVersion: record.creation.version,
        };
      }
      const history = this.histories.get(experienceId) ?? [];
      const next: CreationRecord = {
        creation: applyCreationPatch(record.creation, patch, now, history),
        active: true,
      };
      this.records.set(experienceId, next);
      this.histories.set(experienceId, [...history, next.creation]);
      return { ok: true as const, record: next };
    });
  }

  /** 子状态机迁移（非法迁移拒绝写入；不消耗版本号）。 */
  async advancePhase(
    experienceId: string,
    event: CreationPhaseEvent,
    now: string,
  ): Promise<CreationPhaseResult> {
    return this.serialize(experienceId, () => {
      const record = this.records.get(experienceId);
      if (!record || !record.active) {
        return {
          ok: false as const,
          code: 'CREATION_PHASE_ILLEGAL' as const,
          from: (record?.creation.phase ?? 'COMPLETE') as CreationPhase,
          event,
        };
      }
      const to = nextCreationPhase(record.creation.phase, event);
      if (!to) {
        return {
          ok: false as const,
          code: 'CREATION_PHASE_ILLEGAL' as const,
          from: record.creation.phase,
          event,
        };
      }
      const next: CreationRecord = {
        creation: { ...record.creation, phase: to, updatedAt: now },
        active: true,
      };
      this.records.set(experienceId, next);
      return { ok: true as const, record: next, from: record.creation.phase, to, event };
    });
  }

  /** 会话生命周期终止（完成 / 取代 / 终止；历史保留）。 */
  async end(experienceId: string, reason: string): Promise<void> {
    return this.serialize(experienceId, () => {
      const record = this.records.get(experienceId);
      if (!record || !record.active) {
        return;
      }
      this.records.set(experienceId, { ...record, active: false, endedReason: reason });
    });
  }
}
