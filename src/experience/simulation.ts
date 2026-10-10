/**
 * WHAT_IF 模拟域（S2a F-4；S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施）。
 *
 * 第一层（§3 变更 1——WHAT_IF 多轮模拟持久化，frozen 源可机械派生）：
 * - 每轮模拟结果经模拟域事件登记（simulation_recorded，D-05 选项 A），
 *   四元分离（事实 / 推断 / 假设 / 模拟结果——E8-G2-CC07）；模拟结果
 *   不得表现为事实（事件 schema 互斥注记 + 语料分离格式双重保证）。
 * - 模拟历史会话内持久（D-04 选项 A——07 §3 Session State 纪律；
 *   S3a 增量——S3B-SEMANTIC-FREEZE-01 v1.0.0：分支记录与模拟历史
 *   跨会话持久（持久化范围 = 全部分量）；当前激活分支指针
 *   currentBranchId 保持会话级（会话结束清空，不跨会话自动恢复
 *   激活分支；恢复为只读加载，不登记新事件））。
 * - 多轮模拟阶段迁移保持 SIMULATION（13 §15.3；状态机 WHAT_IF_SIMULATE
 *   规则已覆盖 SIMULATION→SIMULATION——直接转写，本模块不重复定义）。
 *
 * 第二层（§3 变更 2——WHAT_IF 分支语义，经 D-02…D-04 产品负责人版本化
 * 定义后于本版冻结文本内补写生效）：
 * - 轴外分支子状态机（D-02 选项 A，model on F-2 创作子状态机纪律）：
 *   分支记录含 branch_id / 源模拟轮次 / 模拟结果记录（四元分离）/ 版本 /
 *   生命周期状态五分量；体验阶段轴不变（WHAT_IF 轮次保持 SIMULATION 阶段，
 *   13 §15.3——分支为体验状态轴之外的对象化承载）。
 * - 四操作最小集（D-03 选项 A）：CREATE（WHAT_IF 首轮自动创建分支记录）/
 *   SWITCH（显式切换激活分支）/ ABANDON（放弃分支）/ RETURN（返回主线
 *   模拟上下文）；操作识别为确定性规则词表（同分类器纪律，具体词表为
 *   实现细节——本模块词表；词表优先级 RETURN > SWITCH > ABANDON）。
 * - 分支模拟结果默认不回流为主线结论（D-02 选项 A 推导：模拟结果不得
 *   表现为事实——回流即把模拟当事实；"采用某分支结论"须产品负责人另案
 *   版本化定义，本版不预先写死）。
 * - 分支状态会话内持久（S3a 起跨会话持久——S3B-SEMANTIC-FREEZE-01
 *   v1.0.0：D-04 会话结束失效语义经 D-2 选项 A 裁决升格为跨会话
 *   持久化——分支记录全部分量跨会话持久；currentBranchId 会话级
 *   不变式——会话结束清空激活指针，不跨会话自动恢复激活分支；
 *   事件为不可变权威事实——C6 §5，失效仅作用于运行时指针）。
 *
 * 第三层（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决补写生效——
 * 显式回流操作 ADOPT_BRANCH）：
 * - 第五分支操作 ADOPT_BRANCH（词表优先级 RETURN > SWITCH >
 *   ABANDON > ADOPT_BRANCH；须命中分支作用域词表 + 可解析目标
 *   序号，否则走通用 SIMULATE 执行路径——同 SWITCH / ABANDON
 *   识别纪律）。
 * - 目标分支记录附加 adopted 标记（生命周期契约不变——ACTIVE /
 *   RETURNED / ABANDONED 三态不增第四态，adopted 为分支记录
 *   附加属性而非生命周期状态）。
 * - 采用结果经模拟域事件 simulation_adopted 登记（events.ts；
 *   properties 含 branch_id / source_round / adopted_content 摘要 /
 *   separation_invariant=simulation_result_is_not_fact——采用结果
 *   仍标记为模拟来源）。
 * - 采用结果呈现为新一轮模拟上下文（主线当前上下文不变——用户
 *   须另行 CREATE 提交方将采纳内容纳入作品，创作版本化纪律
 *   不变）；显式回流是经用户指令的例外通道，"分支模拟结果默认
 *   不回流为主线结论"的默认语义不变。
 */

/** 四元分离（E8-G2-CC07）：事实 / 推断 / 假设 / 模拟结果。 */
export interface SimulationSeparation {
  fact: string;
  inference: string;
  hypothesis: string;
  /** 模拟结果——不得表现为事实（E8-G2-CC07；事件层互斥注记保证）。 */
  simulation: string;
}

/** 模拟轮次记录（第一层——模拟历史的原子事实）。 */
export interface SimulationRoundRecord {
  roundId: string;
  experienceId: string;
  sessionId: string;
  /** 模拟轮次（体验内单调，从 1 起——跨分支连续编号）。 */
  round: number;
  /** 所属分支（WHAT_IF 首轮自动创建分支记录——D-03 选项 A CREATE）。 */
  branchId: string;
  /** 源输入摘要（用户原始输入）。 */
  sourceInput: string;
  separation: SimulationSeparation;
  /** 版本化提交版本（S1-12：每次合法提交恰好 +1）。 */
  stateVersion: number;
  proposalId: string;
  generationId: string;
  recordedAt: string;
}

/** 分支生命周期状态（D-02 选项 A——分支记录五分量之一）。 */
export type BranchLifecycle = 'ACTIVE' | 'ABANDONED' | 'RETURNED';

/**
 * 分支记录（第二层——D-02 选项 A：轴外分支子状态机）。
 * 分支为体验状态轴之外的持久对象；分支模拟结果不回流为主线结论。
 */
export interface BranchRecord {
  branchId: string;
  experienceId: string;
  sessionId: string;
  /** 源模拟轮次（分支创建时所属模拟轮号）。 */
  sourceRound: number;
  /** 模拟结果记录（四元分离——分支内模拟轮次序列）。 */
  rounds: SimulationRoundRecord[];
  /** 分支版本（分支内模拟轮次计数——单调不减）。 */
  version: number;
  lifecycle: BranchLifecycle;
  /**
   * 采用标记（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A——ADOPT_BRANCH
   * 附加属性，非生命周期状态：lifecycle 契约保持 ACTIVE / RETURNED /
   * ABANDONED 三态；标记经显式回流操作 ADOPT_BRANCH 附加，
   * 幂等（重复采用不改变已置标记）。
   */
  adopted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 分支操作（D-03 选项 A——四操作最小集 + S2-BRANCH-REFLOW-DEF-01 第五操作 ADOPT_BRANCH；CREATE 由首轮模拟自动执行）。 */
export type BranchOperationKind = 'SWITCH' | 'ABANDON' | 'RETURN' | 'ADOPT_BRANCH';

/** 分支操作识别结果（确定性规则词表——具体词表为实现细节）。 */
export interface BranchOperation {
  operation: BranchOperationKind;
  /** 目标分支序号（SWITCH / ABANDON / ADOPT_BRANCH；RETURN 返回主线无目标）。 */
  targetOrdinal: number | null;
}

/** 模拟域快照（证据 / 审计查询入口——E5 进程内形态取证）。 */
export interface SimulationSnapshot {
  rounds: SimulationRoundRecord[];
  branches: BranchRecord[];
  currentBranchId: string | null;
}

export interface SimulationRoundInput {
  experienceId: string;
  sessionId: string;
  sourceInput: string;
  separation: SimulationSeparation;
  stateVersion: number;
  proposalId: string;
  generationId: string;
  now: string;
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
 * 分支操作识别（确定性规则词表——D-03 选项 A；
 * ADOPT_BRANCH 经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A
 * 裁决补写生效）。
 * 词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH
 * （确定性，无歧义输入集）；SWITCH / ABANDON / ADOPT_BRANCH
 * 须同时命中分支作用域词表与可解析目标序号，否则不识别
 * 为分支操作（未命中 → 通用 SIMULATE 执行路径）。
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

/**
 * 四元分离派生（确定性解析——不做代码推断，只按语料分离格式分段）：
 * 事实 / 推断 / 假设三段经标记确定性切分；模拟结果为完整模拟提案
 * 内容（模拟结果与事实字段语义互斥——事件层 separation_invariant
 * 互斥注记保证模拟结果不得表现为事实，E8-G2-CC07）。
 */
export function deriveSimulationSeparation(content: string): SimulationSeparation {
  const factStart = content.indexOf(FACT_MARKER);
  const inferenceStart = content.indexOf(INFERENCE_MARKER);
  const hypothesisStart = content.indexOf(HYPOTHESIS_MARKER);
  const tailStart = content.indexOf(PROPOSAL_TAIL_MARKER);
  return {
    fact: sectionOf(
      content,
      factStart + FACT_MARKER.length,
      inferenceStart >= 0 ? inferenceStart : tailStart >= 0 ? tailStart : content.length,
    ),
    inference: sectionOf(
      content,
      inferenceStart + INFERENCE_MARKER.length,
      hypothesisStart >= 0 ? hypothesisStart : tailStart >= 0 ? tailStart : content.length,
    ),
    hypothesis: sectionOf(
      content,
      hypothesisStart + HYPOTHESIS_MARKER.length,
      tailStart >= 0 ? tailStart : content.length,
    ),
    simulation: content,
  };
}

// ---------------------------------------------------------------------------
// 模拟域存储（会话内持久——D-04 选项 A；07 §3 Session State 纪律）
// ---------------------------------------------------------------------------

/**
 * 模拟域存储（model on CreationStore 纪律）：
 * - 模拟历史（第一层）：体验内全部模拟轮次的权威时序记录
 *   （S3a 起跨会话持久——S3B-SEMANTIC-FREEZE-01 v1.0.0）；
 * - 分支记录（第二层）：轴外分支子状态机，会话内持久 + 跨会话持久
 *   （S3a D-2 选项 A——持久化范围 = 分支记录全部分量）；
 * - 当前激活分支：07 §3 current_branch 标量字段的对象化承载
 *   （D-02 选项 A）——任一时刻至多一个激活分支；指针为会话级
 *   （S3a——会话结束清空，不跨会话自动恢复激活分支）。
 */
export class SimulationStore {
  /** 模拟历史（第一层——体验内全部模拟轮次）。 */
  private readonly histories = new Map<string, SimulationRoundRecord[]>();
  /** 分支记录（第二层——轴外分支子状态机）。 */
  private readonly branches = new Map<string, BranchRecord[]>();
  /** 当前激活分支（current_branch 对象化——D-02 选项 A）。 */
  private readonly currentBranch = new Map<string, string>();
  private roundCounter = 0;
  private branchCounter = 0;

  /**
   * 记录一轮模拟结果（第一层登记 + WHAT_IF 首轮自动 CREATE 分支——
   * D-03 选项 A）：无激活分支时自动创建分支记录（源模拟轮次 = 本轮号），
   * 模拟轮次同时登记模拟历史与所属分支；分支版本随轮次单调不减。
   */
  recordRound(input: SimulationRoundInput): {
    round: SimulationRoundRecord;
    branch: BranchRecord;
    branchCreated: boolean;
  } {
    const history = this.histories.get(input.experienceId) ?? [];
    let branchList = this.branches.get(input.experienceId) ?? [];
    let currentId = this.currentBranch.get(input.experienceId) ?? null;
    const roundNumber = history.length + 1;
    this.roundCounter += 1;
    const roundId = `sim_round_synthetic_${String(this.roundCounter).padStart(4, '0')}`;
    let branch: BranchRecord;
    let branchCreated = false;
    if (currentId === null) {
      // WHAT_IF 首轮自动创建分支记录（D-03 选项 A CREATE——
      // 无激活分支上下文时，模拟轮次自动开启新分支）。
      this.branchCounter += 1;
      const branchId = `branch_synthetic_${String(this.branchCounter).padStart(4, '0')}`;
      branch = {
        branchId,
        experienceId: input.experienceId,
        sessionId: input.sessionId,
        sourceRound: roundNumber,
        rounds: [],
        version: 0,
        lifecycle: 'ACTIVE',
        adopted: false,
        createdAt: input.now,
        updatedAt: input.now,
      };
      currentId = branchId;
      branchCreated = true;
    } else {
      branch = branchList.find((entry) => entry.branchId === currentId) ?? branchList[0];
    }
    const round: SimulationRoundRecord = {
      roundId,
      experienceId: input.experienceId,
      sessionId: input.sessionId,
      round: roundNumber,
      branchId: currentId,
      sourceInput: input.sourceInput,
      separation: input.separation,
      stateVersion: input.stateVersion,
      proposalId: input.proposalId,
      generationId: input.generationId,
      recordedAt: input.now,
    };
    history.push(round);
    const nextBranch: BranchRecord = {
      ...branch,
      rounds: [...branch.rounds, round],
      version: branch.rounds.length + 1,
      updatedAt: input.now,
    };
    branchList = branchCreated
      ? [...branchList, nextBranch]
      : branchList.map((entry) => (entry.branchId === nextBranch.branchId ? nextBranch : entry));
    this.histories.set(input.experienceId, history);
    this.branches.set(input.experienceId, branchList);
    this.currentBranch.set(input.experienceId, currentId);
    return { round, branch: nextBranch, branchCreated };
  }

  /** 目标分支解析（序号从 1 起，与分支记录顺序一致——实现细节）。 */
  private resolveTarget(branchList: BranchRecord[], ordinal: number | null): BranchRecord | null {
    if (ordinal === null || ordinal < 1 || ordinal > branchList.length) {
      return null;
    }
    return branchList[ordinal - 1] ?? null;
  }

  /**
   * 分支操作前置校验（确定性——提交前拒绝路径；不修改任何状态，
   * 失败不消耗版本号——OBL-01 同族纪律）。
   * ADOPT_BRANCH 同 SWITCH / ABANDON 校验纪律：目标序号须解析
   * 为存活分支（ABANDONED 分支不可操作）；不要求激活分支
   * 上下文（采用面向分支记录本身，与主线当前上下文无关——
   * S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A：主线当前上下文
   * 不变）。
   */
  validateBranchOperation(
    experienceId: string,
    operation: BranchOperation,
  ): { ok: true } | { ok: false; code: 'INVALID_STATE_TRANSITION'; reason: string } {
    const branchList = this.branches.get(experienceId) ?? [];
    if (operation.operation === 'RETURN') {
      const currentId = this.currentBranch.get(experienceId) ?? null;
      if (currentId === null) {
        return {
          ok: false,
          code: 'INVALID_STATE_TRANSITION',
          reason: 'branch operation RETURN illegal: no active simulation branch (return requires an active branch context)',
        };
      }
      return { ok: true };
    }
    const target = this.resolveTarget(branchList, operation.targetOrdinal);
    if (!target) {
      return {
        ok: false,
        code: 'INVALID_STATE_TRANSITION',
        reason: `branch operation ${operation.operation} illegal: branch ordinal ${operation.targetOrdinal} does not resolve to a live branch (${branchList.length} branch(es) recorded)`,
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
   * 分支操作应用（版本化提交后——与体验状态提交同一串行化写者
   * 纪律；调用前须经 validateBranchOperation 校验）。
   */
  applyBranchOperation(
    experienceId: string,
    operation: BranchOperation,
    now: string,
  ): { branch: BranchRecord; previousBranchId: string | null; summary: string } {
    const branchList = this.branches.get(experienceId) ?? [];
    if (operation.operation === 'RETURN') {
      const currentId = this.currentBranch.get(experienceId) ?? null;
      const branch = branchList.find((entry) => entry.branchId === currentId) ?? branchList[0];
      const returned: BranchRecord = { ...branch, lifecycle: 'RETURNED', updatedAt: now };
      this.branches.set(
        experienceId,
        branchList.map((entry) => (entry.branchId === branch.branchId ? returned : entry)),
      );
      this.currentBranch.delete(experienceId);
      return {
        branch: returned,
        previousBranchId: currentId,
        summary: `returned to the mainline simulation context (branch ${branch.branchId} lifecycle RETURNED; the next WHAT_IF round auto-creates a new branch - D-03 CREATE)`,
      };
    }
    const target = this.resolveTarget(branchList, operation.targetOrdinal) ?? branchList[0];
    if (operation.operation === 'ABANDON') {
      const abandoned: BranchRecord = { ...target, lifecycle: 'ABANDONED', updatedAt: now };
      this.branches.set(
        experienceId,
        branchList.map((entry) => (entry.branchId === target.branchId ? abandoned : entry)),
      );
      const wasCurrent = (this.currentBranch.get(experienceId) ?? null) === target.branchId;
      if (wasCurrent) {
        this.currentBranch.delete(experienceId);
      }
      return {
        branch: abandoned,
        previousBranchId: wasCurrent ? target.branchId : (this.currentBranch.get(experienceId) ?? null),
        summary: `abandoned branch ${target.branchId} (lifecycle ABANDONED; branch records persist to session end - D-04)`,
      };
    }
    if (operation.operation === 'ADOPT_BRANCH') {
      // ADOPT_BRANCH：显式采用分支结论（S2-BRANCH-REFLOW-DEF-01
      // v1.0.0 选项 A——第五分支操作）。目标分支记录附加
      // adopted 标记（幂等——重复采用不改变已置标记）；
      // 生命周期契约不变（ACTIVE / RETURNED / ABANDONED
      // 三态，adopted 为附加属性而非生命周期状态）；主线
      // 当前上下文不变（current_branch 不改动——采用结果
      // 呈现为新一轮模拟上下文，用户须另行 CREATE 提交
      // 方将采纳内容纳入作品——创作版本化纪律不变；分支
      // 模拟结果默认不回流为主线结论的默认语义不变，
      // 显式回流是经用户指令的例外通道）。
      const adoptedBranch: BranchRecord = {
        ...target,
        adopted: true,
        updatedAt: now,
      };
      this.branches.set(
        experienceId,
        branchList.map((entry) => (entry.branchId === target.branchId ? adoptedBranch : entry)),
      );
      return {
        branch: adoptedBranch,
        previousBranchId: this.currentBranch.get(experienceId) ?? null,
        summary: `adopted branch ${target.branchId} conclusion as new simulation context (source round ${target.sourceRound}; branch marked adopted; lifecycle ${target.lifecycle} unchanged; the adopted result remains simulation-sourced and does not flow back to the mainline as fact - S2-BRANCH-REFLOW-DEF-01; incorporate the adopted content via a separate CREATE submit)`,
      };
    }
    // SWITCH：显式切换激活分支（RETURNED 分支经切换恢复探索——
    // 生命周期 ACTIVE；ABANDONED 分支不可切换——前置校验拒绝）。
    const previousBranchId = this.currentBranch.get(experienceId) ?? null;
    const switched: BranchRecord = { ...target, lifecycle: 'ACTIVE', updatedAt: now };
    this.branches.set(
      experienceId,
      branchList.map((entry) => (entry.branchId === target.branchId ? switched : entry)),
    );
    this.currentBranch.set(experienceId, target.branchId);
    return {
      branch: switched,
      previousBranchId,
      summary: `switched to branch ${target.branchId} (source round ${target.sourceRound}; branch simulation results do not flow back to the mainline - D-02)`,
    };
  }

  /** 模拟域快照（证据 / 审计查询——E5 进程内形态取证入口）。 */
  getSnapshot(experienceId: string): SimulationSnapshot | undefined {
    const history = this.histories.get(experienceId);
    if (!history) {
      return undefined;
    }
    return {
      rounds: [...history],
      branches: [...(this.branches.get(experienceId) ?? [])],
      currentBranchId: this.currentBranch.get(experienceId) ?? null,
    };
  }

  /**
   * 会话结束（S3a D-2 选项 A——S3B-SEMANTIC-FREEZE-01 v1.0.0 §1.5：
   * 清空当前激活分支指针（currentBranchId 会话级不变式——会话结束
   * 清空，不跨会话自动恢复激活分支）；分支记录与模拟历史跨会话
   * 持久（可枚举——恢复为只读加载，不登记新事件；新会话可经显式
   * 五操作操作持久分支记录——§1.4 跨会话操作路径）。
   * 统一应用于四条路径：会话结束（SESSION_ENDED）/ 体验完成（STOP）
   * / 方向变更（CHANGE_DIRECTION——旧方向激活上下文结束，下一方向
   * WHAT_IF 首轮自动创建新分支——D-03 CREATE）/ 相邻重复 CREATE 取代。
   */
  endSession(experienceId: string): void {
    this.currentBranch.delete(experienceId);
  }
}
