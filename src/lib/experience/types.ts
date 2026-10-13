/**
 * 核心数据结构（S1 切片；对齐 intent-experience C1 核心契约的最小形态）。
 *
 * 纪律：
 * - 状态机视图（view）是 ExperienceState 的一部分，任何变更必须经
 *   state-machine.ts 的合法迁移表——禁用任意状态跳转（S1-04）。
 * - LlmProposal 只有内容字段：LLM 只提出候选内容，不拥有状态、策略
 *   或产品决策权（GS-06 由构造保证——该类型不可能携带状态变更）。
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

/** LLM 内容提案——结构上不可能携带状态写入（GS-06 构造保证）。 */
export interface LlmProposal {
  text: string;
}

export type TurnKind =
  | 'FIRST_LAYER'
  | 'ANSWER'
  | 'EXPLANATION'
  | 'SIMULATION_RESULT'
  | 'CORRECTION_EXPLAIN';

export interface TurnRecord {
  turn: number;
  semanticAction: string;
  policyAction: string;
  userText: string;
  kind: TurnKind;
  content: string;
  at: string; // ISO 时间戳
}

/** ExperienceState——Runtime 单一写入者维护的完整产品状态。 */
export interface ExperienceState {
  view: ExperienceView;
  experienceId: string; // 目录种子 id 或 'custom'
  topic: string;
  turn: number;
  goal: { primary: 'understand'; satisfaction: number };
  knowledge: { confirmed: string[]; inferred: string[] };
  userModel: { questions: string[]; hypotheses: string[]; corrections: string[] };
  variables: Record<string, number | string>;
  history: TurnRecord[];
  completion: { done: boolean; exitReason: string | null };
}

/** 体验流事件（SSE 载荷）——Route 层透传给前端。 */
export type TurnEvent =
  | { type: 'session'; sessionId: string; stateVersion: number; view: ExperienceView; topic: string }
  | {
      type: 'trace';
      turn: number;
      semanticAction: string;
      policyAction: string;
      fromVersion: number;
    }
  | { type: 'content'; turn: number; kind: TurnKind | 'ESCALATION_NOTICE' | 'BOUNDARY_NOTICE'; text: string; stateVersion: number }
  | {
      type: 'state';
      stateVersion: number;
      view: ExperienceView;
      state: ExperienceState;
    }
  | { type: 'done'; stateVersion: number; ended: boolean; exitReason: string | null }
  | { type: 'error'; code: TurnErrorCode; message: string };

export type TurnErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_COMPLETED'
  | 'VERSION_CONFLICT'
  | 'INVALID_INPUT'
  | 'LLM_GATEWAY_ERROR'
  | 'LLM_PROPOSAL_INVALID';

/** 会话摘要（首页"最近探索"用）。 */
export interface SessionSummary {
  id: string;
  topic: string;
  seedId: string | null;
  status: string;
  exitReason: string | null;
  view: ExperienceView;
  turn: number;
  updatedAt: string;
}
