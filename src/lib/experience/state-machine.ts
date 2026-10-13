/**
 * Experience 状态机（S1 切片；intent-experience state-machine 规范
 * §7 / §14 / §15 的直接转写——状态轴 + 阶段轴双轴）。
 *
 * 状态轴：ENTERING → READY → ACTIVE → WAITING → ACTIVE → … → COMPLETED；
 *         ACTIVE/WAITING 可经 STOP 到 COMPLETED。
 * 阶段轴：CURIOSITY → UNDERSTANDING → SIMULATION → CREATION → COMPLETION。
 *
 * S1-04 验收：非法 transition = reject（禁用任意状态跳转）。
 * 本切片边界：CREATION 阶段经 CREATE 触发器可达，但 CREATE 策略在
 * 本切片范围外（policy_v1.0.0-slice 表外）——触发器规则保留为
 * 契约完整性，不删除。
 */

import type { ExperienceView } from './types';

export type ExperienceTrigger =
  | 'EXPERIENCE_STARTED' // ENTERING → READY（阶段 CURIOSITY → UNDERSTANDING）
  | 'USER_ACTION' // READY → ACTIVE；WAITING → ACTIVE（用户继续交互）
  | 'WHAT_IF_SIMULATE' // 阶段 UNDERSTANDING/SIMULATION → SIMULATION（§15.2/§15.3）
  | 'RESPONSE_COMPLETED' // ACTIVE → WAITING（系统完成当前工作，有意等待用户）
  | 'CHANGE_DIRECTION' // → ENTERING（取消旧候选；本切片按会话结束语义落地）
  | 'STOP' // ACTIVE/WAITING → COMPLETED（阶段 → COMPLETION；终态）
  | 'CREATE' // × UNDERSTANDING/SIMULATION/CREATION → ACTIVE/CREATION（保留）
  | 'CORRECTION'; // 同域阶段保持：重评估当前阶段（G07 最小形态）

interface TransitionRule {
  from: ExperienceView['status'];
  to: ExperienceView['status'];
  fromStage?: ExperienceView['stage'];
  toStage?: ExperienceView['stage'];
}

/** 合法迁移表（§7 / §15 直接转写；未列出的组合一律非法）。 */
const LEGAL_TRANSITIONS: ReadonlyArray<TransitionRule> = [
  { from: 'ENTERING', to: 'READY', fromStage: 'CURIOSITY', toStage: 'UNDERSTANDING' },
  { from: 'READY', to: 'ACTIVE' },
  { from: 'ACTIVE', to: 'WAITING' },
  { from: 'WAITING', to: 'ACTIVE' },
  { from: 'ACTIVE', to: 'COMPLETED', toStage: 'COMPLETION' },
  { from: 'WAITING', to: 'COMPLETED', toStage: 'COMPLETION' },
  // 缺口修复（单测发现的 ENTERING 卡死缺陷）：首轮生成失败会话遗留
  // ENTERING 视图时，用户 STOP 无处可去 → 会话永久 ACTIVE（GS-04 违背）。
  // 修复语义：ENTERING / READY 上 STOP 合法（用户主权：任何时刻可停）。
  { from: 'ENTERING', to: 'COMPLETED', toStage: 'COMPLETION' },
  { from: 'READY', to: 'COMPLETED', toStage: 'COMPLETION' },
  { from: 'READY', to: 'ENTERING', toStage: 'CURIOSITY' },
  { from: 'ACTIVE', to: 'ENTERING', toStage: 'CURIOSITY' },
  { from: 'WAITING', to: 'ENTERING', toStage: 'CURIOSITY' },
];

/** WHAT_IF 的阶段迁移（§15.2 UNDERSTANDING→SIMULATION；§15.3 SIMULATION→SIMULATION）。 */
const WHAT_IF_STAGE_RULES: ReadonlyArray<TransitionRule> = [
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'UNDERSTANDING', toStage: 'SIMULATION' },
  { from: 'WAITING', to: 'WAITING', fromStage: 'UNDERSTANDING', toStage: 'SIMULATION' },
  { from: 'WAITING', to: 'WAITING', fromStage: 'SIMULATION', toStage: 'SIMULATION' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'SIMULATION', toStage: 'SIMULATION' },
];

/** CREATE 的阶段迁移（本切片保留契约完整性；策略层未启用）。 */
const CREATE_STAGE_RULES: ReadonlyArray<TransitionRule> = [
  { from: 'READY', to: 'ACTIVE', fromStage: 'UNDERSTANDING', toStage: 'CREATION' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'UNDERSTANDING', toStage: 'CREATION' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'SIMULATION', toStage: 'CREATION' },
  { from: 'ACTIVE', to: 'ACTIVE', fromStage: 'CREATION', toStage: 'CREATION' },
  { from: 'WAITING', to: 'ACTIVE', fromStage: 'UNDERSTANDING', toStage: 'CREATION' },
  { from: 'WAITING', to: 'ACTIVE', fromStage: 'SIMULATION', toStage: 'CREATION' },
  { from: 'WAITING', to: 'ACTIVE', fromStage: 'CREATION', toStage: 'CREATION' },
];

/** CORRECTION 的阶段迁移（同域阶段保持——重评估，不切换阶段）。 */
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
 * 一次用户输入的完整效果按序分解为若干触发器步骤，每步必须命中
 * 合法表，否则整次输入非法——运行时只提交最终视图。
 * COMPLETED 为终态，任何触发器均非法。
 */
export function transitionExperience(
  current: ExperienceView,
  trigger: ExperienceTrigger
): TransitionResult {
  if (current.status === 'COMPLETED') {
    return { ok: false, code: 'INVALID_STATE_TRANSITION', from: current, trigger };
  }
  const specialized: Array<[ExperienceTrigger, ReadonlyArray<TransitionRule>]> = [
    ['WHAT_IF_SIMULATE', WHAT_IF_STAGE_RULES],
    ['CREATE', CREATE_STAGE_RULES],
    ['CORRECTION', CORRECTION_RULES],
  ];
  for (const [t, rules] of specialized) {
    if (trigger === t) {
      const rule = rules.find((candidate) => matches(candidate, current));
      if (!rule) {
        return { ok: false, code: 'INVALID_STATE_TRANSITION', from: current, trigger };
      }
      return { ok: true, next: applyRule(rule, current) };
    }
  }
  const rule = LEGAL_TRANSITIONS.find(
    (candidate) => matches(candidate, current) && candidate.to === targetStatus(trigger)
  );
  if (!rule) {
    return { ok: false, code: 'INVALID_STATE_TRANSITION', from: current, trigger };
  }
  return { ok: true, next: applyRule(rule, current) };
}

function targetStatus(trigger: ExperienceTrigger): ExperienceView['status'] {
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

/** 状态机版本（决策追踪用）。 */
export const STATE_MACHINE_VERSION = 'state_machine_v1.0.0-slice';
