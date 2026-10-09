/**
 * Experience 状态机与阶段机（S1-04；状态机规范 §7 / §14 / §15 / §23）。
 *
 * 状态轴（§7）：ENTERING → READY → ACTIVE → WAITING → ACTIVE → … → COMPLETED；
 *              READY/ACTIVE 可经 CHANGE_DIRECTION 回到 ENTERING（新候选周期）；
 *              ACTIVE/WAITING 可经 STOP 到 COMPLETED。
 * 阶段轴（§14/§15）：CURIOSITY → UNDERSTANDING → SIMULATION →
 * CREATION（PD-21 关闭切片最小形态）→ COMPLETION。
 *
 * S1-04 验收：非法 transition = reject（S1 禁用任意状态跳转）。
 * S1 边界（PD-05/PD-06/PD-07）：完整 WHAT_IF 分支、完整 Creation /
 * Correction 与持久 Memory 属 S2；CREATION 阶段与 CREATE / CORRECTION
 * 触发经 PD-21 在 P2 关闭切片以最小形态启用。
 *
 * 轴外记忆子状态机（state_machine_v1.4.0；S2a F-5；
 * S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §4——体验
 * 阶段轴不变，记忆为体验状态轴之外的持久对象）：
 * 状态 {REMEMBERED, IN_USE, DECAYING, EXPIRED}；操作
 * {CREATE（记住，→REMEMBERED，经 Runtime 单一写入者）,
 * RECALL（暂时使用，REMEMBERED→IN_USE，只读、不发事件）,
 * DECAY（逐渐失效，IN_USE→DECAYING，时间衰减驱动，内部
 * 置信度更新、不逐点发事件）, EXPIRE（到期，→EXPIRED，
 * 自动，发出 memory_expired + 删除审计）, CORRECT（被用户
 * 纠正，内容更正 + 留痕，→REMEMBERED，发出 memory_corrected）,
 * WITHDRAW（被用户撤回，→EXPIRED + 撤回留痕 + 删除审计，
 * 发出 memory_withdrawn）}。记忆域事件词表（domain=memory，
 * C6 §7 已预留）：memory_recorded / memory_corrected /
 * memory_withdrawn / memory_expired。07 §10 映射冻结：
 * OBSERVED/CANDIDATE → REMEMBERED（创建）；ACTIVE →
 * IN_USE；DECAYING → DECAYING；EXPIRED → EXPIRED；显式
 * EXPLICIT 路径 S2 不存在（长期记忆禁用）。记忆子状态机
 * 实现承载于 memory.ts（轴外持久对象——D-01 选项 A）。
 */

export type ExperienceStatus = 'ENTERING' | 'READY' | 'ACTIVE' | 'WAITING' | 'COMPLETED';

export type ExperienceStage =
  | 'CURIOSITY'
  | 'UNDERSTANDING'
  | 'SIMULATION'
  | 'CREATION'
  | 'COMPLETION';

export interface ExperienceView {
  status: ExperienceStatus;
  stage: ExperienceStage;
}

/**
 * 触发器（一次用户输入在状态机上的完整效果按序分解为若干合法步骤，
 * 每步必须命中下表，否则整次输入非法——运行时只提交最终视图）。
 */
export type ExperienceTrigger =
  | 'EXPERIENCE_STARTED' // ENTERING → READY（候选选定；阶段 CURIOSITY → UNDERSTANDING）
  | 'USER_ACTION' // READY → ACTIVE；WAITING → ACTIVE（用户继续交互）
  | 'WHAT_IF_SIMULATE' // 阶段 UNDERSTANDING/SIMULATION → SIMULATION（§15.2/§15.3；须先经 USER_ACTION 到 ACTIVE）
  | 'RESPONSE_COMPLETED' // ACTIVE → WAITING（系统完成当前工作，有意等待用户）
  | 'CHANGE_DIRECTION' // READY/ACTIVE → ENTERING（取消旧候选，进入新候选周期；阶段 → CURIOSITY）
  | 'STOP' // ACTIVE/WAITING → COMPLETED（阶段 → COMPLETION；终态）
  | 'CREATE' // READY/ACTIVE/WAITING × UNDERSTANDING/SIMULATION/CREATION → ACTIVE/CREATION（PD-21 关闭切片）
  | 'CORRECTION'; // 同域但阶段保持：重评估当前阶段（PD-21 关闭切片；G07）

interface TransitionRule {
  from: ExperienceStatus;
  to: ExperienceStatus;
  fromStage?: ExperienceStage;
  toStage?: ExperienceStage;
}

/** 合法迁移表（状态机规范 §7 / §15 的直接转写；未列出的组合一律非法）。 */
const LEGAL_TRANSITIONS: ReadonlyArray<TransitionRule> = [
  { from: 'ENTERING', to: 'READY', fromStage: 'CURIOSITY', toStage: 'UNDERSTANDING' },
  { from: 'READY', to: 'ACTIVE' },
  { from: 'ACTIVE', to: 'WAITING' },
  { from: 'WAITING', to: 'ACTIVE' },
  { from: 'ACTIVE', to: 'COMPLETED', toStage: 'COMPLETION' },
  { from: 'WAITING', to: 'COMPLETED', toStage: 'COMPLETION' },
  { from: 'READY', to: 'ENTERING', toStage: 'CURIOSITY' },
  { from: 'ACTIVE', to: 'ENTERING', toStage: 'CURIOSITY' },
];

/** WHAT_IF 的阶段迁移（§15.2 UNDERSTANDING→SIMULATION；§15.3 SIMULATION→SIMULATION）。 */
const WHAT_IF_STAGE_RULES: ReadonlyArray<TransitionRule> = [
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'UNDERSTANDING', toStage: 'SIMULATION' },
  { from: 'WAITING', to: 'WAITING', fromStage: 'UNDERSTANDING', toStage: 'SIMULATION' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'SIMULATION', toStage: 'SIMULATION' },
  { from: 'WAITING', to: 'WAITING', fromStage: 'SIMULATION', toStage: 'SIMULATION' },
];

/**
 * CREATE 的阶段迁移（PD-21 关闭切片：最小 Creation Branch，E2 §13 / Stage 5）。
 * 7 条规则：READY/ACTIVE/WAITING × UNDERSTANDING/SIMULATION/CREATION →
 * ACTIVE/CREATION（READY 仅与 UNDERSTANDING 组合可达，故 3×3 中 7 条）。
 */
const CREATE_STAGE_RULES: ReadonlyArray<TransitionRule> = [
  { from: 'READY', to: 'ACTIVE', fromStage: 'UNDERSTANDING', toStage: 'CREATION' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'UNDERSTANDING', toStage: 'CREATION' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'SIMULATION', toStage: 'CREATION' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'CREATION', toStage: 'CREATION' },
  { from: 'WAITING', to: 'ACTIVE', fromStage: 'UNDERSTANDING', toStage: 'CREATION' },
  { from: 'WAITING', to: 'ACTIVE', fromStage: 'SIMULATION', toStage: 'CREATION' },
  { from: 'WAITING', to: 'ACTIVE', fromStage: 'CREATION', toStage: 'CREATION' },
];

/**
 * CORRECTION 的阶段迁移（PD-21 关闭切片：最小 Correction，G07）。
 * 与 CREATE 同域但阶段保持——重评估当前阶段，不切换 CREATION。
 */
const CORRECTION_RULES: ReadonlyArray<TransitionRule> = [
  { from: 'READY', to: 'ACTIVE', fromStage: 'UNDERSTANDING' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'UNDERSTANDING' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'SIMULATION' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'CREATION' },
  { from: 'WAITING', to: 'ACTIVE', fromStage: 'UNDERSTANDING' },
  { from: 'WAITING', to: 'ACTIVE', fromStage: 'SIMULATION' },
  { from: 'WAITING', to: 'ACTIVE', fromStage: 'CREATION' },
];

export type TransitionResult =
  | { ok: true; next: ExperienceView }
  | { ok: false; code: 'INVALID_STATE_TRANSITION'; from: ExperienceView; trigger: ExperienceTrigger };

function matches(rule: TransitionRule, current: ExperienceView): boolean {
  if (rule.from !== current.status) return false;
  if (rule.fromStage !== undefined && rule.fromStage !== current.stage) return false;
  return true;
}

function applyRule(rule: TransitionRule, current: ExperienceView): ExperienceView {
  return {
    status: rule.to,
    stage: rule.toStage !== undefined ? rule.toStage : current.stage,
  };
}

/**
 * 对当前视图施加一次触发器。
 * 状态轴与阶段轴的组合必须命中合法表；COMPLETED 为终态，任何触发器均非法。
 */
export function transitionExperience(current: ExperienceView, trigger: ExperienceTrigger): TransitionResult {
  if (current.status === 'COMPLETED') {
    return { ok: false, code: 'INVALID_STATE_TRANSITION', from: current, trigger };
  }
  if (trigger === 'WHAT_IF_SIMULATE') {
    const rule = WHAT_IF_STAGE_RULES.find((candidate) => matches(candidate, current));
    if (!rule) {
      return { ok: false, code: 'INVALID_STATE_TRANSITION', from: current, trigger };
    }
    return { ok: true, next: applyRule(rule, current) };
  }
  // CREATE / CORRECTION 与 WHAT_IF_SIMULATE 同理：目标状态 ACTIVE 在
  // 通用 LEGAL_TRANSITIONS 中对应多条规则，须经专用规则数组按阶段判定，
  // 不进入通用 targetStatus 匹配路径。
  if (trigger === 'CREATE') {
    const rule = CREATE_STAGE_RULES.find((candidate) => matches(candidate, current));
    if (!rule) {
      return { ok: false, code: 'INVALID_STATE_TRANSITION', from: current, trigger };
    }
    return { ok: true, next: applyRule(rule, current) };
  }
  if (trigger === 'CORRECTION') {
    const rule = CORRECTION_RULES.find((candidate) => matches(candidate, current));
    if (!rule) {
      return { ok: false, code: 'INVALID_STATE_TRANSITION', from: current, trigger };
    }
    return { ok: true, next: applyRule(rule, current) };
  }
  const rule = LEGAL_TRANSITIONS.find((candidate) => matches(candidate, current) && candidate.to === targetStatus(trigger));
  if (!rule) {
    return { ok: false, code: 'INVALID_STATE_TRANSITION', from: current, trigger };
  }
  return { ok: true, next: applyRule(rule, current) };
}

function targetStatus(trigger: ExperienceTrigger): ExperienceStatus {
  switch (trigger) {
    case 'EXPERIENCE_STARTED':
      return 'READY';
    case 'USER_ACTION':
      return 'ACTIVE';
    case 'RESPONSE_COMPLETED':
      return 'WAITING';
    case 'CHANGE_DIRECTION':
      return 'ENTERING';
    case 'STOP':
      return 'COMPLETED';
    case 'WHAT_IF_SIMULATE':
      return 'ACTIVE';
    case 'CREATE':
      return 'ACTIVE';
    case 'CORRECTION':
      return 'ACTIVE';
  }
}

/** 初始视图（体验创建：进入中 / 好奇阶段）。 */
export function initialExperienceView(): ExperienceView {
  return { status: 'ENTERING', stage: 'CURIOSITY' };
}
