/**
 * First Experience 呈现路径（S2b；S2B-SEMANTIC-FREEZE-01
 * D-04 选项 A——S1 §37"First Experience 完整呈现"；
 * E2 §5 入口 / §6 六阶段 / §7 完成·退出·中断冻结面）。
 *
 * 呈现补全纪律（冻结文本 §4 变更 3）：六阶段呈现迁移
 * （Curiosity → Understanding → Simulation → Branch →
 * Creation → Completion）为已有体验阶段轴的呈现补全——
 * 不改契约（E2 §7 冻结面不变），只补全运行时呈现路径；
 * 13 号状态机阶段轴不变（Branch 为 Simulation 阶段的
 * 分支探索呈现面——轴外分支记录 F-4 D-02）；视觉样式
 * 不在冻结范围（E2 §5 纪律）。
 */

import type { ExperienceView } from './state-machine';

/** 呈现阶段（E2 §6 六阶段；BRANCH 为 Simulation 呈现面）。 */
export type PresentationStage =
  | 'CURIOSITY'
  | 'UNDERSTANDING'
  | 'SIMULATION'
  | 'BRANCH'
  | 'CREATION'
  | 'COMPLETION';

/** 呈现步骤（只读呈现层——视觉样式不在冻结范围，E2 §5）。 */
export interface PresentationStep {
  step: string;
  label: string;
  description: string;
}

/** 入口流程（E2 §5 形态：问题呈现 → 开始探索 → 换一个）。 */
export const FIRST_EXPERIENCE_ENTRY_FLOW: readonly PresentationStep[] = [
  {
    step: 'question_presented',
    label: '问题呈现',
    description: '呈现起始问题（E2 §5 入口——用户以一个问题进入第一体验）',
  },
  {
    step: 'exploration_started',
    label: '开始探索',
    description: '用户开始探索（体验启动：ENTERING → READY，阶段 CURIOSITY → UNDERSTANDING）',
  },
  {
    step: 'change_one',
    label: '换一个',
    description: '用户可随时要求换一个（CHANGE_DIRECTION：取消旧候选，进入新候选周期——亦为中断流程入口）',
  },
];

/**
 * 六阶段逐阶段呈现（E2 §6；stateMachineStage 为 13 号
 * 状态机阶段轴映射——呈现补全，阶段轴不变）。
 */
export const FIRST_EXPERIENCE_STAGES: readonly (PresentationStep & {
  stateMachineStage: 'CURIOSITY' | 'UNDERSTANDING' | 'SIMULATION' | 'CREATION' | 'COMPLETION';
})[] = [
  {
    step: 'curiosity',
    label: 'Curiosity（好奇）',
    description: '好奇阶段：起始问题呈现，探索兴趣建立',
    stateMachineStage: 'CURIOSITY',
  },
  {
    step: 'understanding',
    label: 'Understanding（理解）',
    description: '理解阶段：WHY 解释层交付，建立对主题的理解',
    stateMachineStage: 'UNDERSTANDING',
  },
  {
    step: 'simulation',
    label: 'Simulation（模拟）',
    description: '模拟阶段：WHAT_IF 模拟提案，事实 / 推断 / 假设四元分离登记',
    stateMachineStage: 'SIMULATION',
  },
  {
    step: 'branch',
    label: 'Branch（分支）',
    description: '分支呈现面：模拟分支探索（SWITCH / ABANDON / RETURN——轴外分支子状态机，F-4 D-02/D-03；13 号阶段轴不变）',
    stateMachineStage: 'SIMULATION',
  },
  {
    step: 'creation',
    label: 'Creation（创作）',
    description: '创作阶段：CREATE 进入创作运行时（上下文继承 → 最小构建 → 预览 → 反馈循环）',
    stateMachineStage: 'CREATION',
  },
  {
    step: 'completion',
    label: 'Completion（完成）',
    description: '完成阶段：体验完成（STOP 终止路径；创作完成信号经 STOP 执行路径登记，F-2 D-05）',
    stateMachineStage: 'COMPLETION',
  },
];

/** 完成流程（E2 §7 冻结面——正常完成路径）。 */
export const FIRST_EXPERIENCE_COMPLETION_FLOW: readonly PresentationStep[] = [
  {
    step: 'goal_reached',
    label: '目标达成',
    description: '体验目标达成（创作完成信号或探索目标完成）',
  },
  {
    step: 'completion_registered',
    label: '完成登记',
    description: '完成事实经 STOP 执行路径登记（体验轴 ACTIVE/WAITING → COMPLETED，阶段 → COMPLETION）',
  },
  {
    step: 'short_term_memory_recorded',
    label: '短期记忆登记',
    description: '跨会话短期记忆登记（F-5：主题 / 意图信号，来源 session_observation——STOP 完成路径）',
  },
];

/** 退出流程（E2 §7 冻结面——用户主动提前退出）。 */
export const FIRST_EXPERIENCE_EXIT_FLOW: readonly PresentationStep[] = [
  {
    step: 'exit_requested',
    label: '退出请求',
    description: '用户主动退出（STOP 输入——P-01 永远优先）',
  },
  {
    step: 'exit_registered',
    label: '退出登记',
    description: '退出经 STOP 终止路径登记（体验轴 → COMPLETED 终态；无完成信号登记）',
  },
];

/** 中断流程（E2 §7 冻结面——方向变更中断当前探索）。 */
export const FIRST_EXPERIENCE_INTERRUPT_FLOW: readonly PresentationStep[] = [
  {
    step: 'interrupt_requested',
    label: '中断请求',
    description: '用户要求换一个（CHANGE_DIRECTION——P-02 必须取消旧操作）',
  },
  {
    step: 'old_candidate_cancelled',
    label: '旧候选取消',
    description: '旧候选周期取消（在途生成取消，旧流终止——P-02 / S1-10）',
  },
  {
    step: 'new_cycle',
    label: '新候选周期',
    description: '进入新候选周期（体验轴 → ENTERING，阶段 → CURIOSITY）',
  },
];

/** First Experience 完整呈现路径模型（只读）。 */
export interface FirstExperiencePresentation {
  entryFlow: readonly PresentationStep[];
  stages: readonly (PresentationStep & {
    stateMachineStage: 'CURIOSITY' | 'UNDERSTANDING' | 'SIMULATION' | 'CREATION' | 'COMPLETION';
  })[];
  completionFlow: readonly PresentationStep[];
  exitFlow: readonly PresentationStep[];
  interruptFlow: readonly PresentationStep[];
}

/** First Experience 完整呈现路径（只读模型——D-04 选项 A）。 */
export function firstExperiencePresentation(): FirstExperiencePresentation {
  return {
    entryFlow: FIRST_EXPERIENCE_ENTRY_FLOW,
    stages: FIRST_EXPERIENCE_STAGES,
    completionFlow: FIRST_EXPERIENCE_COMPLETION_FLOW,
    exitFlow: FIRST_EXPERIENCE_EXIT_FLOW,
    interruptFlow: FIRST_EXPERIENCE_INTERRUPT_FLOW,
  };
}

/**
 * 状态机视图 → 呈现阶段映射（只读呈现层）。
 * SIMULATION 阶段经 branchActive 区分 Simulation / Branch
 * 呈现面（分支探索中呈现 Branch 面——轴外分支记录
 * F-4；阶段轴不变）。
 */
export function presentationStageFor(
  view: ExperienceView,
  branchActive?: boolean,
): PresentationStage {
  switch (view.stage) {
    case 'CURIOSITY':
      return 'CURIOSITY';
    case 'UNDERSTANDING':
      return 'UNDERSTANDING';
    case 'SIMULATION':
      return branchActive ? 'BRANCH' : 'SIMULATION';
    case 'CREATION':
      return 'CREATION';
    case 'COMPLETION':
      return 'COMPLETION';
  }
}
