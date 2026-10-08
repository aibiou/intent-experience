/**
 * Experience 状态机与阶段机（S1-04；状态机规范 §7 / §14 / §15 / §23）。
 *
 * 状态轴（§7）：ENTERING → READY → ACTIVE → WAITING → ACTIVE → … → COMPLETED；
 *              READY/ACTIVE 可经 CHANGE_DIRECTION 回到 ENTERING（新候选周期）；
 *              ACTIVE/WAITING 可经 STOP 到 COMPLETED。
 * 阶段轴（§14/§15）：CURIOSITY → UNDERSTANDING → SIMULATION →（S2：CREATION）→ COMPLETION。
 *
 * S1-04 验收：非法 transition = reject（S1 禁用任意状态跳转）。
 * S1 边界（PD-05/PD-06）：CREATION 阶段与完整 WHAT_IF 分支属 S2，本切片不实施。
 */

export type ExperienceStatus = 'ENTERING' | 'READY' | 'ACTIVE' | 'WAITING' | 'COMPLETED';

export type ExperienceStage = 'CURIOSITY' | 'UNDERSTANDING' | 'SIMULATION' | 'COMPLETION';

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
  | 'STOP'; // ACTIVE/WAITING → COMPLETED（阶段 → COMPLETION；终态）

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
  }
}

/** 初始视图（体验创建：进入中 / 好奇阶段）。 */
export function initialExperienceView(): ExperienceView {
  return { status: 'ENTERING', stage: 'CURIOSITY' };
}
