/**
 * WHAT_IF 模拟域（S2a 切片 F-4）——S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 冻结语义的
 * 真实 LLM 会话适配版（语义权威源：intent-experience 仓库 src/experience/simulation.ts）。
 *
 * - 四元分离（E8-G2-CC07）：事实 / 推断 / 假设 / 模拟结果——模拟结果不得表现为事实；
 *   三段按语料分离标记确定性切分（缺标记空串容错），simulation 字段承载完整提案内容。
 * - 分支域（D-02 选项 A 轴外分支子状态机 + D-03 选项 A 四操作最小集 +
 *   S2-BRANCH-REFLOW-DEF-01 v1.0.0 第五操作 ADOPT_BRANCH）：
 *   SWITCH / ABANDON / RETURN / ADOPT_BRANCH；CREATE 由 WHAT_IF 首轮自动执行
 *   （无激活分支上下文时自动创建分支记录——D-03 CREATE）。
 * - 会话内持久（D-04 选项 A——07 号契约 §3 Session State 纪律）：S2a 切片不引入
 *   S3a 的跨会话分支持久化与长期记忆——模拟历史与分支记录仅存活于会话 state JSON。
 * - 分支模拟结果默认不回流主线结论（D-02 推导：回流即把模拟当事实）；显式回流
 *   唯一例外通道 ADOPT_BRANCH 仅附加 adopted 标记（生命周期三态契约不变、幂等），
 *   采用结果仍为模拟来源，纳入作品须另行 CREATE 提交（创作版本化纪律不变）。
 *
 * 纯逻辑纪律（本切片）：零 DB / 零网络 / 零 Prisma import；全部函数输入数组 / 状态
 * → 返回新数组 / 新状态，绝不 mutate 入参；持久化与事件登记由 runtime 单一写入者
 * 负责（Task 6-c 接线）。
 */

/** 四元分离（E8-G2-CC07）：事实 / 推断 / 假设 / 模拟结果。模拟结果不得表现为事实。 */
export interface SimulationSeparation {
  fact: string;
  inference: string;
  hypothesis: string;
  simulation: string;
}

/** 模拟轮次记录（第一层——模拟历史的原子事实）。 */
export interface SimulationRoundRecord {
  roundId: string;
  /** 模拟轮次（体验内单调，从 1 起——跨分支连续编号）。 */
  round: number;
  /** 所属分支（WHAT_IF 首轮自动创建分支记录——D-03 选项 A CREATE）。 */
  branchId: string;
  /** 源输入（用户原始输入）。 */
  sourceInput: string;
  separation: SimulationSeparation;
  /** 版本化提交版本（S1-12：每次合法提交恰好 +1）。 */
  stateVersion: number;
  recordedAt: string;
}

/** 分支生命周期状态（D-02 选项 A——分支记录分量之一；三态契约不增第四态）。 */
export type BranchLifecycle = 'ACTIVE' | 'ABANDONED' | 'RETURNED';

/**
 * 分支记录（第二层——D-02 选项 A 轴外分支子状态机；会话内持久——D-04 选项 A）。
 * 分支为体验状态轴之外的持久对象；分支模拟结果不回流为主线结论。
 */
export interface BranchRecord {
  branchId: string;
  /** 源模拟轮次（分支创建时所属模拟轮号）。 */
  sourceRound: number;
  /** 模拟结果记录（四元分离——分支内模拟轮次序列）。 */
  rounds: SimulationRoundRecord[];
  /** 分支版本（分支内模拟轮次计数——单调不减）。 */
  version: number;
  lifecycle: BranchLifecycle;
  /**
   * 采用标记（S2-BRANCH-REFLOW-DEF-01 v1.0.0——附加属性而非生命周期状态：
   * lifecycle 契约保持 ACTIVE / RETURNED / ABANDONED 三态；经显式回流操作
   * ADOPT_BRANCH 附加，幂等——重复采用不改变已置标记）。
   */
  adopted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 分支操作（D-03 选项 A 四操作最小集 + ADOPT_BRANCH；CREATE 由首轮模拟自动执行）。 */
export type BranchOperationKind = 'SWITCH' | 'ABANDON' | 'RETURN' | 'ADOPT_BRANCH';

/** 分支操作识别结果（确定性规则词表——具体词表为实现细节）。 */
export interface BranchOperation {
  operation: BranchOperationKind;
  /** 目标分支序号（SWITCH / ABANDON / ADOPT_BRANCH；RETURN 返回主线无目标）。 */
  targetOrdinal: number | null;
}

/** 模拟域状态（会话 state JSON 内的分支域承载——D-04 会话内持久）。 */
export interface SimulationDomainState {
  /** 模拟历史（体验内全部模拟轮次——跨分支连续）。 */
  rounds: SimulationRoundRecord[];
  branches: BranchRecord[];
  /** 当前激活分支（任一时刻至多一个；RETURN / ABANDON 当前分支时清空）。 */
  currentBranchId: string | null;
  /** 轮次 ID 计数器（roundId 单调来源，自 1 起编号）。 */
  roundCounter: number;
  /** 分支 ID 计数器（branchId 单调来源，自 1 起编号）。 */
  branchCounter: number;
}

// ---------------------------------------------------------------------------
// 分支操作识别（确定性规则词表——D-03 选项 A；同分类器纪律）
// ---------------------------------------------------------------------------

/** RETURN 词表（返回主线模拟上下文——无目标参数）。 */
const BRANCH_RETURN_PATTERNS: ReadonlyArray<RegExp> = [
  /返回主线/,
  /回到主线/,
  /返回主模拟/,
  /回到主模拟/,
  /返回主上下文/,
];
/** SWITCH 词表（显式切换激活分支）。 */
const BRANCH_SWITCH_PATTERNS: ReadonlyArray<RegExp> = [/切换/, /换到/, /查看/];
/** ABANDON 词表（放弃分支）。 */
const BRANCH_ABANDON_PATTERNS: ReadonlyArray<RegExp> = [/放弃/, /丢弃/, /删除/];
/** ADOPT_BRANCH 词表（显式采用分支结论——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A）。 */
const BRANCH_ADOPT_PATTERNS: ReadonlyArray<RegExp> = [/采用/, /采纳/];
/** 分支作用域词表（SWITCH / ABANDON / ADOPT_BRANCH 须命中分支域限定）。 */
const BRANCH_SCOPE_PATTERNS: ReadonlyArray<RegExp> = [/分支/, /支线/];
/** 目标分支序号提取（分支一 / 分支 2——序号从 1 起，与分支记录顺序一致）。 */
const BRANCH_ORDINAL_PATTERN = /分支\s*([0-9一二三四五六七八九十]+)/;

const CHINESE_NUMERALS: Readonly<Record<string, number>> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function parseBranchOrdinal(rawInput: string): number | null {
  const match = BRANCH_ORDINAL_PATTERN.exec(rawInput);
  if (!match) {
    return null;
  }
  const token = match[1];
  if (/^[0-9]+$/.test(token)) {
    return Number(token);
  }
  return CHINESE_NUMERALS[token] ?? null;
}

/**
 * 分支操作识别（确定性规则词表——D-03 选项 A；ADOPT_BRANCH 经
 * S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决补写生效）。
 * 词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH（确定性，无歧义输入集）；
 * SWITCH / ABANDON / ADOPT_BRANCH 须同时命中分支作用域词表与可解析目标序号
 * （序号 ≥ 1，中文数字一~十映射 1~10），否则不识别为分支操作
 * （未命中 → 通用 SIMULATE 执行路径）。
 */
export function interpretBranchOperation(rawInput: string): BranchOperation | null {
  if (BRANCH_RETURN_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { operation: 'RETURN', targetOrdinal: null };
  }
  if (!BRANCH_SCOPE_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return null;
  }
  const switchHit = BRANCH_SWITCH_PATTERNS.some((pattern) => pattern.test(rawInput));
  const abandonHit = BRANCH_ABANDON_PATTERNS.some((pattern) => pattern.test(rawInput));
  const adoptHit = BRANCH_ADOPT_PATTERNS.some((pattern) => pattern.test(rawInput));
  if (!switchHit && !abandonHit && !adoptHit) {
    return null;
  }
  const targetOrdinal = parseBranchOrdinal(rawInput);
  if (targetOrdinal === null || targetOrdinal < 1) {
    return null;
  }
  // 词表优先级 SWITCH > ABANDON > ADOPT_BRANCH（确定性选择）。
  return {
    operation: switchHit ? 'SWITCH' : abandonHit ? 'ABANDON' : 'ADOPT_BRANCH',
    targetOrdinal,
  };
}

// ---------------------------------------------------------------------------
// 四元分离派生（E8-G2-CC07 的字段化承载——D-05 选项 A）
// ---------------------------------------------------------------------------

/** 模拟语料分段标记（事实 / 推断 / 假设分离格式——G03-N 断言格式）。 */
const FACT_MARKER = '事实——';
const INFERENCE_MARKER = '推断——';
const HYPOTHESIS_MARKER = '假设——';
const PROPOSAL_TAIL_MARKER = '。本提案';

function sectionOf(content: string, start: number, end: number): string {
  return start >= 0 && end > start ? content.slice(start, end) : '';
}

/** 标记体起点（标记缺失 → 保持 -1，经 sectionOf 守卫回退空串——缺标记空串容错）。 */
function bodyStart(markerAt: number, markerLength: number): number {
  return markerAt < 0 ? markerAt : markerAt + markerLength;
}

/**
 * 四元分离派生（确定性解析——不做代码推断，只按语料分离格式分段）：
 * 事实 / 推断 / 假设三段经标记确定性切分；模拟结果为完整模拟提案内容
 * （模拟结果与事实字段语义互斥——模拟结果不得表现为事实，E8-G2-CC07）。
 * 缺标记容错：任一段标记缺失 → 该段空串（不产出错位切片）。
 */
export function deriveSimulationSeparation(content: string): SimulationSeparation {
  const factStart = content.indexOf(FACT_MARKER);
  const inferenceStart = content.indexOf(INFERENCE_MARKER);
  const hypothesisStart = content.indexOf(HYPOTHESIS_MARKER);
  const tailStart = content.indexOf(PROPOSAL_TAIL_MARKER);
  const factEnd = inferenceStart >= 0 ? inferenceStart : tailStart >= 0 ? tailStart : content.length;
  const inferenceEnd = hypothesisStart >= 0 ? hypothesisStart : tailStart >= 0 ? tailStart : content.length;
  const hypothesisEnd = tailStart >= 0 ? tailStart : content.length;
  return {
    fact: sectionOf(content, bodyStart(factStart, FACT_MARKER.length), factEnd),
    inference: sectionOf(content, bodyStart(inferenceStart, INFERENCE_MARKER.length), inferenceEnd),
    hypothesis: sectionOf(content, bodyStart(hypothesisStart, HYPOTHESIS_MARKER.length), hypothesisEnd),
    simulation: content,
  };
}

// ---------------------------------------------------------------------------
// 分支操作前置校验与应用（D-02 / D-03 / S2-BRANCH-REFLOW-DEF-01）
// ---------------------------------------------------------------------------

/** 目标分支解析（序号从 1 起，与分支记录顺序一致——实现细节）。 */
function resolveTarget(branches: BranchRecord[], ordinal: number | null): BranchRecord | null {
  if (ordinal === null || ordinal < 1 || ordinal > branches.length) {
    return null;
  }
  return branches[ordinal - 1] ?? null;
}

/**
 * 分支操作前置校验（确定性——提交前拒绝路径；不修改任何状态，失败不消耗版本号
 * ——OBL-01 同族纪律）。RETURN 须有激活分支上下文；SWITCH / ABANDON / ADOPT_BRANCH
 * 须解析为存活分支（ABANDONED 分支不可操作——ADOPT 同 SWITCH / ABANDON 校验纪律，
 * 不要求激活分支上下文，采用面向分支记录本身，主线当前上下文不变）。
 */
export function validateBranchOperation(
  branches: BranchRecord[],
  currentBranchId: string | null,
  operation: BranchOperation,
): { ok: true } | { ok: false; code: 'INVALID_STATE_TRANSITION'; reason: string } {
  if (operation.operation === 'RETURN') {
    if (currentBranchId === null) {
      return {
        ok: false,
        code: 'INVALID_STATE_TRANSITION',
        reason:
          'branch operation RETURN illegal: no active simulation branch (return requires an active branch context)',
      };
    }
    return { ok: true };
  }
  const target = resolveTarget(branches, operation.targetOrdinal);
  if (!target) {
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      reason: `branch operation ${operation.operation} illegal: branch ordinal ${operation.targetOrdinal} does not resolve to a live branch (${branches.length} branch(es) recorded)`,
    };
  }
  if (target.lifecycle === 'ABANDONED') {
    return {
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      reason: `branch operation ${operation.operation} illegal: branch ${target.branchId} is ABANDONED (abandoned branches are not operable)`,
    };
  }
  return { ok: true };
}

/**
 * 分支操作应用（提交后——调用前须经 validateBranchOperation 校验；纯函数，
 * 不 mutate 入参）。未命中目标时的回退行为与前置校验契约一致（回退 branchList[0]
 * ——契约上不可达，仅保证全函数不崩溃）：
 * - RETURN：当前分支 lifecycle→RETURNED、指针清空（下一轮 WHAT_IF 自动开新分支）；
 * - ABANDON：目标→ABANDONED（记录保留至会话结束——D-04）；若目标为当前分支则清指针；
 * - ADOPT_BRANCH：目标 adopted=true（幂等）、指针不变、生命周期不变；
 * - SWITCH：目标→ACTIVE（RETURNED 分支经切换恢复探索）、指针切换。
 */
export function applyBranchOperation(
  branches: BranchRecord[],
  currentBranchId: string | null,
  operation: BranchOperation,
  now: string,
): { branches: BranchRecord[]; currentBranchId: string | null; summary: string; branch: BranchRecord } {
  if (operation.operation === 'RETURN') {
    const branch = branches.find((entry) => entry.branchId === currentBranchId) ?? branches[0];
    const returned: BranchRecord = { ...branch, lifecycle: 'RETURNED', updatedAt: now };
    return {
      branches: branches.map((entry) => (entry.branchId === returned.branchId ? returned : entry)),
      currentBranchId: null,
      summary: `returned to the mainline simulation context (branch ${returned.branchId} lifecycle RETURNED; the next WHAT_IF round auto-creates a new branch - D-03 CREATE)`,
      branch: returned,
    };
  }
  const target = resolveTarget(branches, operation.targetOrdinal) ?? branches[0];
  if (operation.operation === 'ABANDON') {
    const abandoned: BranchRecord = { ...target, lifecycle: 'ABANDONED', updatedAt: now };
    const wasCurrent = currentBranchId === abandoned.branchId;
    return {
      branches: branches.map((entry) => (entry.branchId === abandoned.branchId ? abandoned : entry)),
      currentBranchId: wasCurrent ? null : currentBranchId,
      summary: `abandoned branch ${abandoned.branchId} (lifecycle ABANDONED; branch records persist to session end - D-04)`,
      branch: abandoned,
    };
  }
  if (operation.operation === 'ADOPT_BRANCH') {
    // 显式回流例外通道（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A）：目标附加
    // adopted 标记（幂等）；生命周期三态不变；currentBranchId 不改动——采用
    // 结果呈现为新一轮模拟上下文，纳入作品须另行 CREATE 提交（创作版本化纪律
    // 不变；"分支模拟结果默认不回流为主线结论"的默认语义不变）。
    const adoptedBranch: BranchRecord = { ...target, adopted: true, updatedAt: now };
    return {
      branches: branches.map((entry) => (entry.branchId === adoptedBranch.branchId ? adoptedBranch : entry)),
      currentBranchId,
      summary: `adopted branch ${adoptedBranch.branchId} conclusion as new simulation context (source round ${adoptedBranch.sourceRound}; branch marked adopted; lifecycle ${target.lifecycle} unchanged; the adopted result remains simulation-sourced and does not flow back to the mainline as fact - S2-BRANCH-REFLOW-DEF-01; incorporate the adopted content via a separate CREATE submit)`,
      branch: adoptedBranch,
    };
  }
  // SWITCH：显式切换激活分支（RETURNED 分支经切换恢复探索——生命周期 ACTIVE；
  // ABANDONED 分支不可切换——前置校验拒绝）。
  const switched: BranchRecord = { ...target, lifecycle: 'ACTIVE', updatedAt: now };
  return {
    branches: branches.map((entry) => (entry.branchId === switched.branchId ? switched : entry)),
    currentBranchId: switched.branchId,
    summary: `switched to branch ${switched.branchId} (source round ${switched.sourceRound}; branch simulation results do not flow back to the mainline - D-02)`,
    branch: switched,
  };
}

// ---------------------------------------------------------------------------
// 模拟轮次登记（第一层 + WHAT_IF 首轮自动 CREATE——D-03 选项 A）
// ---------------------------------------------------------------------------

/**
 * 记录一轮模拟结果（模拟历史登记 + 所属分支轮次追加；纯函数——输入状态 → 新状态）：
 * - round = 模拟历史长度 + 1（跨分支连续编号）；roundId = sim_round_ 四位补零
 *   （roundCounter 单调，自 1 起编号）；
 * - 无激活分支 → 自动创建新分支（branch_ 四位补零、sourceRound=本轮、ACTIVE）
 *   ——WHAT_IF 首轮自动 CREATE（D-03）；指针悬挂时回退首支（与前置校验契约一致的
 *   实现细节，契约上不可达）；
 * - 轮次同时登记模拟历史与所属分支；分支版本 = 分支内轮次计数（单调不减）。
 */
export function recordSimulationRound(
  state: SimulationDomainState,
  input: { sourceInput: string; separation: SimulationSeparation; stateVersion: number; now: string },
): { state: SimulationDomainState; branch: BranchRecord; branchCreated: boolean } {
  const round = state.rounds.length + 1;
  const roundCounter = state.roundCounter + 1;
  const roundId = `sim_round_${String(roundCounter).padStart(4, '0')}`;
  const activeBranch =
    state.currentBranchId === null
      ? null
      : (state.branches.find((entry) => entry.branchId === state.currentBranchId) ??
        (state.branches.length > 0 ? state.branches[0] : null));
  let branchCounter = state.branchCounter;
  let branchCreated = false;
  let branch: BranchRecord;
  if (activeBranch === null) {
    // WHAT_IF 首轮自动创建分支记录（D-03 选项 A CREATE——无激活分支上下文时，
    // 模拟轮次自动开启新分支）。
    branchCounter += 1;
    branchCreated = true;
    branch = {
      branchId: `branch_${String(branchCounter).padStart(4, '0')}`,
      sourceRound: round,
      rounds: [],
      version: 0,
      lifecycle: 'ACTIVE',
      adopted: false,
      createdAt: input.now,
      updatedAt: input.now,
    };
  } else {
    branch = activeBranch;
  }
  const roundRecord: SimulationRoundRecord = {
    roundId,
    round,
    branchId: branch.branchId,
    sourceInput: input.sourceInput,
    separation: input.separation,
    stateVersion: input.stateVersion,
    recordedAt: input.now,
  };
  const nextBranch: BranchRecord = {
    ...branch,
    rounds: [...branch.rounds, roundRecord],
    version: branch.rounds.length + 1,
    updatedAt: input.now,
  };
  const nextState: SimulationDomainState = {
    rounds: [...state.rounds, roundRecord],
    branches: branchCreated
      ? [...state.branches, nextBranch]
      : state.branches.map((entry) => (entry.branchId === nextBranch.branchId ? nextBranch : entry)),
    currentBranchId: nextBranch.branchId,
    roundCounter,
    branchCounter,
  };
  return { state: nextState, branch: nextBranch, branchCreated };
}
