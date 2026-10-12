/**
 * 运行时契约（拆分自 runtime.ts —— runtime.ts 单文件瘦身第一步）。
 * 含对外暴露的请求/响应契约类型、内部簿记类型与交互事件映射常量。
 * 纯类型 + 只读常量，无运行时副作用。
 */

import { type PolicyAction, type SemanticAction } from './policy';
import { type ExperienceStage, type ExperienceStatus } from './state-machine';
import type { EventSink } from './events';
import type { DecisionTraceSink } from './decision-trace';
import type { AuditSink } from './audit';
import type { LlmGateway } from './llm-gateway';
import type { StreamEvent } from './stream';
import type { RuntimeError } from './runtime-errors';

export interface IntentRecord {
  intentId: string;
  sessionId: string;
  rawInput: string;
  semanticAction: SemanticAction | 'UNKNOWN';
  state: 'CREATED' | 'INTERPRETED';
  createdAt: string;
}

export interface ExperienceRecord {
  experienceId: string;
  sessionId: string;
  intentId: string;
  candidateId: string;
}

/** 提交响应首行（API 契约 §11.3 响应结构的流式实现：首行即契约响应）。 */
export interface SubmissionHeader {
  type: 'submission';
  accepted: true;
  experience_id: string;
  session_id: string;
  request_id: string;
  policy_decision: {
    decision_id: string;
    policy_version: string;
    semantic_action: SemanticAction;
    selected_action: PolicyAction;
    reason: string;
  };
  state_version: number;
  state: { status: ExperienceStatus; stage: ExperienceStage; waiting_for_user: boolean };
  at: string;
}

/** 流结束后的最终状态（客户端据此更新预期版本，PD-16 字段名）。 */
export interface StateUpdatedEvent {
  type: 'state_updated';
  state_version: number;
  state: { status: ExperienceStatus; stage: ExperienceStage; waiting_for_user: boolean };
  at: string;
}

export type RuntimeStreamEvent = SubmissionHeader | StreamEvent | StateUpdatedEvent;

export type SubmissionResult =
  | {
      ok: true;
      header: SubmissionHeader;
      stream: AsyncGenerator<RuntimeStreamEvent>;
      generationId: string;
    }
  | { ok: false; error: RuntimeError };

export interface RuntimeOptions {
  /** 合成用户标识（非真实用户数据）。 */
  userId?: string;
  eventSink?: EventSink;
  decisionTraceSink?: DecisionTraceSink;
  auditSink?: AuditSink;
  /** LLM 网关注入点（证据经同一接口注入脚本化提案以测试拒绝路径）。 */
  gateway?: LlmGateway;
}

/** 内部簿记：在途生成（死会话归位用）。 */
export interface GenerationRecord {
  generationId: string;
  experienceId: string;
  controller: AbortController;
}

/** C6 §14 交互事件名：S1 §23 "user_action" 的权威实现（名称调和见迭代记录）。 */
export const INTERACTION_EVENT_BY_SEMANTIC_ACTION: Readonly<Record<SemanticAction, string>> = {
  DIRECT_ANSWER: 'question_asked',
  WHY: 'why_requested',
  WHAT_IF: 'what_if_requested',
  CHANGE_DIRECTION: 'change_direction_requested',
  STOP: 'stop_requested',
  CREATE: 'create_requested', // PD-21 关闭切片（C6 §14 交互事件命名模式）
  CORRECTION: 'correction_requested', // PD-21 关闭切片（C6 §14 交互事件命名模式）
  DEEPEN: 'deepen_requested', // S2b（D-01 选项 A；C6 §14 交互事件命名模式）
  SIMPLIFY: 'simplify_requested', // S2b（同上）
  REFRAME: 'reframe_requested', // S2b（同上）
  CONTINUE: 'continue_requested', // S4（D-1 选项 A；C6 §14 交互事件命名模式）
  REPEAT: 'repeat_requested', // S4（同上）
};
