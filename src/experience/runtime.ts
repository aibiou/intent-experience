/**
 * 运行时执行器（S1-09；S1 规范 §19 执行链）。
 *
 * 执行链（任何 API 不得绕过，API 契约 §2.2）：
 *   Input → Semantic Action → Policy Decision → Capability → Validation →
 *   State Transition → Event → Response
 *
 * 关键不变量：
 * - 每次状态变化都有明确 Transition（S1 §19），且经版本化单写者提交（S1-03）；
 * - 旧 operation 不得提交（S1-10 Critical）：generation epoch 守卫 +
 *   预期版本双重检查，CHANGE 后旧 generation 的迟到达提交被拒绝（GS-03 负向）；
 * - LLM 输出永远是 Proposal，验证器拒绝任何越权状态写入（S1-07/§17，GS-06）；
 * - STOP 永远优先（P-01），CHANGE 必须取消旧操作（P-02）；
 * - 决策追踪与事件分离记录（C6 §22/§23）。
 *
 * 治理约束：合成模式——网关由合成语料提供，不调用任何真实 LLM 提供方；
 * 所有身份/内容均为合成数据（隐私护栏：真实用户数据禁收，授权 §5.1）。
 */

import {
  POLICY_VERSION,
  resolvePolicy,
  type PolicyAction,
  type SemanticAction,
} from './policy';
import { classifyInput } from './classifier';
import { validateProposal } from './validator';
import {
  initialExperienceView,
  transitionExperience,
  type ExperienceStage,
  type ExperienceStatus,
  type ExperienceTrigger,
  type ExperienceView,
} from './state-machine';
import { createSession, transitionSession, type SessionRecord } from './session';
import { ExperienceStateStore, type ExperienceState } from './state-store';
import {
  type EventSink,
  type ExperienceEvent,
  EventRecorder,
} from './events';
import {
  nextDecisionId,
  type DecisionTraceSink,
} from './decision-trace';
import { SyntheticLlmGateway, type LlmGateway } from './llm-gateway';
import { createExperienceStream, type StreamEvent } from './stream';
import { allFixtures, loadChunkFixture } from './chunks';
import type { AuditSink } from './audit';

/** S1 §28 错误契约代码（API 契约 §22 错误结构：{code, message, retryable}）。 */
export type RuntimeErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_STATE_TRANSITION'
  | 'STATE_VERSION_CONFLICT'
  | 'INVALID_ACTION'
  | 'POLICY_REJECTED'
  | 'LLM_SCHEMA_INVALID'
  | 'LLM_UNAVAILABLE'
  | 'REQUEST_DUPLICATE'
  | 'INTERNAL_ERROR';

export interface RuntimeError {
  code: RuntimeErrorCode;
  message: string;
  retryable: boolean;
  /** HTTP 形态状态码（错误契约未规定状态码，此处为工程映射并记录于迭代记录）。 */
  status: number;
  details?: Record<string, unknown>;
}

/** C6 §14 交互事件名：S1 §23 "user_action" 的权威实现（名称调和见迭代记录）。 */
const INTERACTION_EVENT_BY_SEMANTIC_ACTION: Readonly<Record<SemanticAction, string>> = {
  DIRECT_ANSWER: 'question_asked',
  WHY: 'why_requested',
  WHAT_IF: 'what_if_requested',
  CHANGE_DIRECTION: 'change_direction_requested',
  STOP: 'stop_requested',
  CREATE: 'create_requested', // PD-21 关闭切片（C6 §14 交互事件命名模式）
  CORRECTION: 'correction_requested', // PD-21 关闭切片（C6 §14 交互事件命名模式）
};

function errorCodeStatus(code: RuntimeErrorCode): number {
  switch (code) {
    case 'STATE_VERSION_CONFLICT':
    case 'REQUEST_DUPLICATE':
      return 409;
    case 'LLM_UNAVAILABLE':
      return 503;
    case 'INTERNAL_ERROR':
      return 500;
    default:
      return 400;
  }
}

function runtimeError(
  code: RuntimeErrorCode,
  message: string,
  retryable = false,
  details?: Record<string, unknown>,
): RuntimeError {
  return { code, message, retryable, status: errorCodeStatus(code), details };
}

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

interface GenerationRecord {
  generationId: string;
  experienceId: string;
  controller: AbortController;
}

/**
 * 体验运行时（S1-09 执行器 + S1-01/03/04/05/07/08/10/11/12 组件）。
 * 单进程单例（HTTP 形态）；进程内形态由证据执行器按案例构造。
 */
export class ExperienceRuntime {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly intents = new Map<string, IntentRecord>();
  private readonly experiences = new Map<string, ExperienceRecord>();
  private readonly store = new ExperienceStateStore();
  private readonly recorder: EventRecorder;
  private readonly traceSink: DecisionTraceSink;
  private readonly auditSink: AuditSink;
  private readonly gateway: LlmGateway;
  private readonly userId: string;
  /** 请求幂等（C6 §27 / API 契约 §2.4）：request_id 去重，重复提交拒绝。 */
  private readonly requestIds = new Set<string>();
  /** 当前生效 generation（每体验单写者视角的 generation epoch）。 */
  private readonly activeGenerations = new Map<string, string>();
  private readonly generationControllers = new Map<string, AbortController>();
  /** 已发出 generation_cancelled 的 generation（事件不重复登记）。 */
  private readonly cancellationMarked = new Set<string>();
  private counters = { intent: 0, experience: 0, candidate: 0, generation: 0 };

  constructor(options: RuntimeOptions = {}) {
    this.userId = options.userId ?? 'user_synthetic_001';
    this.recorder = new EventRecorder(options.eventSink ?? (() => undefined));
    this.traceSink = options.decisionTraceSink ?? (() => undefined);
    this.auditSink = options.auditSink ?? (() => undefined);
    this.gateway = options.gateway ?? new SyntheticLlmGateway(allFixtures());
  }

  // ---------------------------------------------------------------------
  // S1-01 Session 生命周期
  // ---------------------------------------------------------------------

  async startSession(): Promise<{ session: SessionRecord; event: ExperienceEvent }> {
    const session = createSession(new Date().toISOString());
    this.sessions.set(session.sessionId, session);
    const event = await this.recordEvent('session_started', {
      identity: { user_id: this.userId, session_id: session.sessionId },
      context: { experience_id: null, intent_id: null, state_version: null, request_id: null },
      source: { layer: 'runtime', component: 'session-lifecycle' },
      properties: { session_state: 'SESSION_IDLE' },
    });
    return { session, event };
  }

  getSession(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  // ---------------------------------------------------------------------
  // S1-02/S1-05 意图解析（自然语言 → 结构化意图 / 语义动作）
  // ---------------------------------------------------------------------

  async resolveIntent(input: {
    sessionId: string;
    rawInput: string;
    requestId: string;
  }): Promise<
    | {
        ok: true;
        intent: IntentRecord;
        semanticAction: SemanticAction | 'UNKNOWN';
        confidence: number;
        action: 'start_experience' | 'escalate';
        events: ExperienceEvent[];
      }
    | { ok: false; error: RuntimeError }
  > {
    if (this.requestIds.has(input.requestId)) {
      return { ok: false, error: runtimeError('REQUEST_DUPLICATE', `request_id already used: ${input.requestId}`) };
    }
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return { ok: false, error: runtimeError('INVALID_REQUEST', `unknown session: ${input.sessionId}`) };
    }
    if (session.state !== 'SESSION_ACTIVE' && session.state !== 'SESSION_IDLE') {
      return {
        ok: false,
        error: runtimeError('INVALID_STATE_TRANSITION', `session ${session.state.toLowerCase()} rejects new intent`),
      };
    }
    if (typeof input.rawInput !== 'string' || input.rawInput.length === 0) {
      return { ok: false, error: runtimeError('INVALID_REQUEST', 'raw_input must be a non-empty string') };
    }
    this.requestIds.add(input.requestId);

    const classification = classifyInput(input.rawInput);
    this.counters.intent += 1;
    const intentId = `intent_synthetic_${String(this.counters.intent).padStart(4, '0')}`;
    const now = new Date().toISOString();
    const intent: IntentRecord = {
      intentId,
      sessionId: input.sessionId,
      rawInput: input.rawInput,
      semanticAction: classification.semanticAction,
      state: 'INTERPRETED',
      createdAt: now,
    };
    this.intents.set(intentId, intent);

    // 事件：intent_received（S1 §23 intent_created 的 C6 权威名）+
    // intent_parsed（携带 semantic_action——S1 §23 semantic_action_detected 的实现）。
    const received = await this.recordEvent('intent_received', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: null, intent_id: intentId, state_version: null, request_id: input.requestId },
      source: { layer: 'input', component: 'intent-resolver' },
      properties: { raw_input: input.rawInput },
    });
    const parsed = await this.recordEvent('intent_parsed', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: null, intent_id: intentId, state_version: null, request_id: input.requestId },
      source: { layer: 'input', component: 'intent-resolver' },
      properties: { semantic_action: classification.semanticAction },
    });

    // 首个意图解析使 Session 进入 ACTIVE（状态机规范 §4.2）。
    if (session.state === 'SESSION_IDLE') {
      const transition = transitionSession(session.state, 'SESSION_ACTIVE');
      if (!transition.ok) {
        return { ok: false, error: runtimeError('INTERNAL_ERROR', 'session idle→active transition failed') };
      }
      session.state = 'SESSION_ACTIVE';
    }
    session.intentId = intentId;

    return {
      ok: true,
      intent,
      semanticAction: classification.semanticAction,
      confidence: 1,
      action: classification.semanticAction === 'UNKNOWN' ? 'escalate' : 'start_experience',
      events: [received, parsed],
    };
  }

  // ---------------------------------------------------------------------
  // 体验启动（S1 规范 §27：POST /experience/start）
  // ---------------------------------------------------------------------

  async startExperience(input: {
    sessionId: string;
    intentId: string;
    requestId: string;
    candidateId?: string;
  }): Promise<
    | {
        ok: true;
        experienceId: string;
        experienceVersion: string;
        stateVersion: number;
        state: ExperienceState;
        events: ExperienceEvent[];
      }
    | { ok: false; error: RuntimeError }
  > {
    if (this.requestIds.has(input.requestId)) {
      return { ok: false, error: runtimeError('REQUEST_DUPLICATE', `request_id already used: ${input.requestId}`) };
    }
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return { ok: false, error: runtimeError('INVALID_REQUEST', `unknown session: ${input.sessionId}`) };
    }
    if (session.state !== 'SESSION_ACTIVE') {
      return {
        ok: false,
        error: runtimeError('INVALID_STATE_TRANSITION', `session ${session.state.toLowerCase()} rejects experience start`),
      };
    }
    const intent = this.intents.get(input.intentId);
    if (!intent || intent.sessionId !== input.sessionId) {
      return { ok: false, error: runtimeError('INVALID_REQUEST', `unknown intent: ${input.intentId}`) };
    }
    if (intent.semanticAction === 'UNKNOWN') {
      return {
        ok: false,
        error: runtimeError('INVALID_ACTION', 'intent semantic action is UNKNOWN (escalated, not implemented)'),
      };
    }
    this.requestIds.add(input.requestId);

    this.counters.experience += 1;
    this.counters.candidate += 1;
    const experienceId = `experience_synthetic_${String(this.counters.experience).padStart(4, '0')}`;
    const candidateId =
      input.candidateId ?? `candidate_synthetic_${String(this.counters.candidate).padStart(4, '0')}`;
    const now = new Date().toISOString();

    // L2 体验状态创建（ENTERING / CURIOSITY，版本 1）。
    const initial = this.store.create({
      experienceId,
      sessionId: input.sessionId,
      status: initialExperienceView().status,
      stage: initialExperienceView().stage,
      waitingForUser: false,
      candidateId,
      lastSemanticAction: null,
      updatedAt: now,
    });
    this.experiences.set(experienceId, { experienceId, sessionId: input.sessionId, intentId: input.intentId, candidateId });
    session.experienceId = experienceId;

    const events: ExperienceEvent[] = [];
    events.push(
      await this.recordEvent('experience_candidate_generated', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: experienceId, intent_id: input.intentId, state_version: initial.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'experience-candidate' },
        properties: { candidate_id: candidateId },
      }),
    );
    events.push(
      await this.recordEvent('experience_candidate_selected', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: experienceId, intent_id: input.intentId, state_version: initial.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'experience-candidate' },
        properties: { candidate_id: candidateId, selection: 'system_selected_first_experience' },
      }),
    );

    // 候选选定：ENTERING/CURIOSITY → READY/UNDERSTANDING（版本 2）。
    const startTransition = transitionExperience(
      { status: initial.status, stage: initial.stage },
      'EXPERIENCE_STARTED',
    );
    if (!startTransition.ok) {
      return { ok: false, error: runtimeError('INTERNAL_ERROR', 'initial experience transition failed') };
    }
    const committed = await this.store.commit(experienceId, initial.stateVersion, (state) => ({
      ...state,
      status: startTransition.next.status,
      stage: startTransition.next.stage,
      updatedAt: now,
    }));
    if (!committed.ok) {
      return { ok: false, error: runtimeError('INTERNAL_ERROR', 'initial experience commit failed') };
    }
    events.push(
      await this.recordEvent('experience_started', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: experienceId, intent_id: input.intentId, state_version: committed.state.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'experience-lifecycle' },
        properties: {
          initial_state_version: initial.stateVersion,
          candidate_id: candidateId,
          stage: committed.state.stage,
        },
      }),
    );
    events.push(
      await this.recordEvent('state_transitioned', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: experienceId, intent_id: input.intentId, state_version: committed.state.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'state-machine' },
        properties: {
          from: { status: initial.status, stage: initial.stage },
          event: 'EXPERIENCE_STARTED',
          action: 'START_EXPERIENCE',
          to: { status: committed.state.status, stage: committed.state.stage },
          state_version_before: initial.stateVersion,
          state_version_after: committed.state.stateVersion,
        },
      }),
    );

    return {
      ok: true,
      experienceId,
      experienceVersion: '1.0.0',
      stateVersion: committed.state.stateVersion,
      state: committed.state,
      events,
    };
  }

  // ---------------------------------------------------------------------
  // Query（S1 规范 §27：GET /experience/{id}/state——不改变任何状态）
  // ---------------------------------------------------------------------

  getExperienceState(
    experienceId: string,
  ): { ok: true; state: ExperienceState } | { ok: false; error: RuntimeError } {
    const state = this.store.get(experienceId);
    if (!state) {
      return { ok: false, error: runtimeError('INVALID_REQUEST', `unknown experience: ${experienceId}`) };
    }
    return { ok: true, state };
  }

  // ---------------------------------------------------------------------
  // S1-09/S1-10/S1-11 核心：提交体验事件（POST /experience/{id}/event）
  // ---------------------------------------------------------------------

  async submitExperienceEvent(input: {
    experienceId: string;
    sessionId: string;
    /** 客户端声明的语义动作（API 契约 §11.3 event.semantic_action）。 */
    semanticAction: string;
    rawInput: string;
    /** 客户端已知的状态版本（PD-16 规范字段名 expected_state_version）。 */
    expectedStateVersion: number;
    requestId: string;
    /** 客户端断开信号（HTTP 形态为 request.signal）。 */
    signal?: AbortSignal;
  }): Promise<SubmissionResult> {
    // --- 请求级校验 -----------------------------------------------------
    if (this.requestIds.has(input.requestId)) {
      return { ok: false, error: runtimeError('REQUEST_DUPLICATE', `request_id already used: ${input.requestId}`) };
    }
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return { ok: false, error: runtimeError('INVALID_REQUEST', `unknown session: ${input.sessionId}`) };
    }
    if (session.state !== 'SESSION_ACTIVE') {
      return {
        ok: false,
        error: runtimeError(
          'INVALID_STATE_TRANSITION',
          `session ${session.state.toLowerCase()} rejects experience events (ended sessions reject old operations, S1-01)`,
        ),
      };
    }
    const experience = this.experiences.get(input.experienceId);
    if (!experience) {
      return { ok: false, error: runtimeError('INVALID_REQUEST', `unknown experience: ${input.experienceId}`) };
    }
    if (experience.sessionId !== input.sessionId) {
      return {
        ok: false,
        error: runtimeError('INVALID_REQUEST', 'experience/session mismatch'),
      };
    }
    const current = this.store.get(input.experienceId);
    if (!current) {
      return { ok: false, error: runtimeError('INTERNAL_ERROR', 'experience state missing') };
    }
    if (current.status === 'COMPLETED') {
      return {
        ok: false,
        error: runtimeError('INVALID_STATE_TRANSITION', 'experience COMPLETED is terminal; start a new session'),
      };
    }
    if (typeof input.rawInput !== 'string' || input.rawInput.length === 0) {
      return { ok: false, error: runtimeError('INVALID_REQUEST', 'raw_input must be a non-empty string') };
    }
    if (!Number.isInteger(input.expectedStateVersion) || input.expectedStateVersion < 1) {
      return {
        ok: false,
        error: runtimeError('INVALID_REQUEST', 'expected_state_version must be a positive integer (PD-16)'),
      };
    }

    // --- 语义动作：分类权威，客户端声明仅作完整性校验 ------------------
    const classification = classifyInput(input.rawInput);
    if (classification.semanticAction === 'UNKNOWN') {
      return {
        ok: false,
        error: runtimeError(
          'INVALID_ACTION',
          'unclassifiable input: escalated per authorization §5.7 (unknown situations escalate, never LLM-decided)',
        ),
      };
    }
    if (input.semanticAction !== classification.semanticAction) {
      return {
        ok: false,
        error: runtimeError(
          'INVALID_REQUEST',
          `semantic_action mismatch: declared ${input.semanticAction} but input classifies as ${classification.semanticAction} (clients cannot inject policy actions)`,
        ),
      };
    }

    // --- 策略决策（S1-06；P-05：LLM 不允许自己选择最终 Action） --------
    const policy = resolvePolicy(classification.semanticAction);
    if (!policy.ok) {
      return {
        ok: false,
        error: runtimeError(
          'INVALID_ACTION',
          `action out of S1 scope: ${policy.semanticAction} (frozen policy set only; undefined semantics escalate)`,
        ),
      };
    }
    this.requestIds.add(input.requestId);

    // --- 交互事件（S1 §23 user_action 的 C6 §14 权威实现） --------------
    const interactionEventType = INTERACTION_EVENT_BY_SEMANTIC_ACTION[policy.semanticAction];
    await this.recordEvent(interactionEventType, {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: {
        experience_id: input.experienceId,
        intent_id: experience.intentId,
        state_version: current.stateVersion,
        request_id: input.requestId,
      },
      source: { layer: 'input', component: 'experience-event-api' },
      properties: { raw_input: input.rawInput, semantic_action: policy.semanticAction },
    });

    const stateBefore: ExperienceView = { status: current.status, stage: current.stage };
    const decisionId = nextDecisionId();

    // --- 策略分支（S1-06；P-05：LLM 不允许自己选择最终 Action） ------
    let branchResult: SubmissionResult;
    if (policy.policyAction === 'STOP') {
      branchResult = await this.executeStop(input, session, current, stateBefore, policy, decisionId, interactionEventType);
    } else if (policy.policyAction === 'CHANGE_EXPERIENCE') {
      branchResult = await this.executeChange(input, session, experience, current, stateBefore, policy, decisionId);
    } else if (policy.policyAction === 'CREATE') {
      branchResult = await this.executeCreate(input, session, experience, current, stateBefore, policy, decisionId);
    } else if (policy.semanticAction === 'CORRECTION') {
      // CORRECTION 的 Policy Action 为 EXPLAIN（重评估落到合法动作），
      // 须在 executeContentGeneration 兜底前按语义动作分派（PD-21 关闭切片）。
      branchResult = await this.executeCorrect(input, session, experience, current, stateBefore, policy, decisionId);
    } else {
      branchResult = await this.executeContentGeneration(
        input,
        session,
        experience,
        current,
        stateBefore,
        policy,
        decisionId,
      );
    }

    // policy_decided 事件（C6 §18；S1 §23 最低事件集）：记录决策与其
    // 已应用效果——已应用决策携带 state_before/state_after；被拒绝的
    // 决策 state_after 为 null 并以错误代码注明原因。事件在提交完成后
    // 发出（决策的完整事实含其应用结果）；决策链本身由决策追踪权威
    // 记录（C6 §22/§23：Policy Trace 与 LLM Trace 分离）。
    await this.recordEvent('policy_decided', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: {
        experience_id: input.experienceId,
        intent_id: experience.intentId,
        state_version: current.stateVersion,
        request_id: input.requestId,
        decision_id: decisionId,
      },
      source: { layer: 'policy', component: 'policy-engine' },
      properties: {
        decision_id: decisionId,
        policy_version: POLICY_VERSION,
        semantic_action: policy.semanticAction,
        selected_action: policy.policyAction,
        reason: branchResult.ok
          ? branchResult.header.policy_decision.reason
          : branchResult.error.code,
        state_before: {
          status: stateBefore.status,
          stage: stateBefore.stage,
          state_version: current.stateVersion,
        },
        state_after: branchResult.ok
          ? {
              status: branchResult.header.state.status,
              stage: branchResult.header.state.stage,
              state_version: branchResult.header.state_version,
            }
          : null,
      },
    });

    return branchResult;
  }

  // ---------------------------------------------------------------------
  // STOP 执行（S1 §20；GS-04；P-01 永远优先）
  // ---------------------------------------------------------------------

  private async executeStop(
    input: {
      experienceId: string;
      sessionId: string;
      requestId: string;
      expectedStateVersion: number;
      signal?: AbortSignal;
    },
    session: SessionRecord,
    current: ExperienceState,
    stateBefore: ExperienceView,
    policy: { semanticAction: SemanticAction; policyAction: PolicyAction },
    decisionId: string,
    interactionEventType: string,
  ): Promise<SubmissionResult> {
    const now = new Date().toISOString();
    const transition = transitionExperience(stateBefore, 'STOP');
    if (!transition.ok) {
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'invalid_state_transition',
        reasonSecondary: `STOP is not legal from ${stateBefore.status}`,
        llmUsed: false,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'INVALID_STATE_TRANSITION',
          `STOP is not legal from ${stateBefore.status}/${stateBefore.stage} (state machine §7 allows STOP from ACTIVE/WAITING)`,
        ),
      };
    }

    // 取消任何在途 generation（P-02 同族约束：STOP 不续行后台生成）。
    await this.interruptGeneration(input.experienceId, 'stop_requested');

    // 版本化提交：ACTIVE/WAITING → COMPLETED/COMPLETION。
    const commit = await this.store.commit(input.experienceId, input.expectedStateVersion, (state) => ({
      ...state,
      status: transition.next.status,
      stage: transition.next.stage,
      waitingForUser: false,
      lastSemanticAction: 'STOP',
      updatedAt: now,
    }));
    if (!commit.ok) {
      await this.recordEvent('state_version_conflict', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: null, state_version: current.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'state-store' },
        properties: {
          expected_state_version: input.expectedStateVersion,
          current_state_version: commit.currentStateVersion,
          trigger: 'STOP',
        },
      });
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'state_version_conflict',
        reasonSecondary: `expected ${input.expectedStateVersion}, current ${commit.currentStateVersion}`,
        llmUsed: false,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'STATE_VERSION_CONFLICT',
          `stale expected_state_version: expected ${input.expectedStateVersion}, current ${commit.currentStateVersion} (no overwrite, S1-12)`,
          false,
          { expected_state_version: input.expectedStateVersion, current_state_version: commit.currentStateVersion },
        ),
      };
    }

    // Session 收尾：ACTIVE → ENDING → ENDED（§4.3/§4.4；ENDING 非常短）。
    const sessionEnding = transitionSession(session.state, 'SESSION_ENDING');
    const sessionEnded = sessionEnding.ok ? transitionSession('SESSION_ENDING', 'SESSION_ENDED') : sessionEnding;
    if (sessionEnding.ok && sessionEnded.ok) {
      session.state = 'SESSION_ENDED';
      session.endedAt = now;
    }

    const events: ExperienceEvent[] = [];
    events.push(
      await this.recordEvent('state_transitioned', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: null, state_version: commit.state.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'state-machine' },
        properties: {
          from: { status: stateBefore.status, stage: stateBefore.stage },
          event: 'STOP',
          action: policy.policyAction,
          to: { status: commit.state.status, stage: commit.state.stage },
          state_version_before: current.stateVersion,
          state_version_after: commit.state.stateVersion,
        },
      }),
    );
    events.push(
      await this.recordEvent('experience_completed', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: null, state_version: commit.state.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'experience-lifecycle' },
        properties: { completion_condition: 'user_stop', interaction_event: interactionEventType },
      }),
    );
    events.push(
      await this.recordEvent('experience_exited', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: null, state_version: commit.state.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'experience-lifecycle' },
        properties: { exit_reason: 'user_stop' },
      }),
    );
    if (sessionEnding.ok && sessionEnded.ok) {
      events.push(
        await this.recordEvent('session_ended', {
          identity: { user_id: this.userId, session_id: input.sessionId },
          context: { experience_id: input.experienceId, intent_id: null, state_version: commit.state.stateVersion, request_id: input.requestId },
          source: { layer: 'runtime', component: 'session-lifecycle' },
          properties: { end_condition: 'first_experience_concluded', session_state: 'SESSION_ENDED' },
        }),
      );
    }

    await this.writeDecisionTrace({
      decisionId,
      sessionId: input.sessionId,
      experienceId: input.experienceId,
      semanticAction: policy.semanticAction,
      stateBefore,
      stateBeforeVersion: current.stateVersion,
      stateAfter: { status: commit.state.status, stage: commit.state.stage, state_version: commit.state.stateVersion },
      selectedAction: policy.policyAction,
      reasonPrimary: 'explicit_user_direction',
      reasonSecondary: 'STOP terminates the current experience (P-01: STOP always wins)',
      llmUsed: false,
      userOverride: true,
      inputEvent: null,
      intentBefore: null,
    });

    const header: SubmissionHeader = {
      type: 'submission',
      accepted: true,
      experience_id: input.experienceId,
      session_id: input.sessionId,
      request_id: input.requestId,
      policy_decision: {
        decision_id: decisionId,
        policy_version: POLICY_VERSION,
        semantic_action: policy.semanticAction,
        selected_action: policy.policyAction,
        reason: 'explicit_user_direction',
      },
      state_version: commit.state.stateVersion,
      state: {
        status: commit.state.status,
        stage: commit.state.stage,
        waiting_for_user: commit.state.waitingForUser,
      },
      at: now,
    };

    // STOP 无内容分块（空语料）；流产出 stopped 终止事件（F-1 语义保持）。
    const stopFixture = {
      fixtureId: 'synthetic/stop/v1',
      semanticAction: policy.semanticAction,
      policyAction: 'STOP' as PolicyAction,
      chunks: [],
    };
    const stream = this.wrapGenerationStream({
      header,
      experienceId: input.experienceId,
      generationId: 'gen-stop',
      streamOptions: {
        semanticAction: policy.semanticAction,
        policyAction: 'STOP',
        fixtureId: stopFixture.fixtureId,
        chunks: stopFixture.chunks,
        signal: input.signal,
        chunkDelayMs: 0,
        audit: this.auditSink,
      },
      completionCommit: false,
    });

    return { ok: true, header, stream, generationId: 'gen-stop' };
  }

  // ---------------------------------------------------------------------
  // CHANGE_DIRECTION 执行（S1 §11/§21；GS-03；P-02 必须取消旧操作）
  // ---------------------------------------------------------------------

  private async executeChange(
    input: {
      experienceId: string;
      sessionId: string;
      requestId: string;
      expectedStateVersion: number;
      signal?: AbortSignal;
      rawInput: string;
    },
    session: SessionRecord,
    experience: ExperienceRecord,
    current: ExperienceState,
    stateBefore: ExperienceView,
    policy: { semanticAction: SemanticAction; policyAction: PolicyAction },
    decisionId: string,
  ): Promise<SubmissionResult> {
    const now = new Date().toISOString();

    // 1. 取消旧 generation（P-02：CHANGE 必须取消旧操作）。
    //    旧 generation 的 C6 generation_cancelled 事件在此登记（与客户端是否
    //    消费旧流无关——服务端事实不依赖客户端可读性）。
    await this.interruptGeneration(input.experienceId, 'superseded_by_change');

    // 2. 拒绝旧候选（§11：Reject Old Candidate）。
    await this.recordEvent('experience_interrupted', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: {
        experience_id: input.experienceId,
        intent_id: experience.intentId,
        state_version: current.stateVersion,
        request_id: input.requestId,
      },
      source: { layer: 'runtime', component: 'interrupt-controller' },
      properties: {
        interrupted_candidate_id: experience.candidateId,
        reason: 'change_direction',
        old_generation_rejected: true,
      },
    });

    // 3. 状态迁移（复合步骤，逐步合法校验，单次版本化提交）：
    //    CHANGE_DIRECTION（→ENTERING/CURIOSITY）→ EXPERIENCE_STARTED（→READY/UNDERSTANDING）
    //    → USER_ACTION（→ACTIVE/UNDERSTANDING）。
    const steps: ExperienceTrigger[] = ['CHANGE_DIRECTION', 'EXPERIENCE_STARTED', 'USER_ACTION'];
    let view: ExperienceView = { status: current.status, stage: current.stage };
    for (const trigger of steps) {
      const step = transitionExperience(view, trigger);
      if (!step.ok) {
        await this.writeDecisionTrace({
          decisionId,
          sessionId: input.sessionId,
          experienceId: input.experienceId,
          semanticAction: policy.semanticAction,
          stateBefore,
          stateBeforeVersion: current.stateVersion,
          stateAfter: null,
          selectedAction: policy.policyAction,
          reasonPrimary: 'invalid_state_transition',
          reasonSecondary: `CHANGE_DIRECTION compound step ${trigger} illegal from ${view.status}/${view.stage}`,
          llmUsed: true,
          userOverride: true,
          inputEvent: null,
          intentBefore: null,
        });
        return {
          ok: false,
          error: runtimeError(
            'INVALID_STATE_TRANSITION',
            `CHANGE_DIRECTION step ${trigger} illegal from ${view.status}/${view.stage}`,
          ),
        };
      }
      view = step.next;
    }

    // 4. 能力层：新方向候选内容（S1-07 结构化请求 → 提案）。
    this.counters.generation += 1;
    const generationId = `gen_synthetic_${String(this.counters.generation).padStart(4, '0')}`;
    const requestId = `req_change_${generationId}`;
    await this.recordEvent('generation_started', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'generation' },
      properties: { generation_id: generationId, direction: 'new_candidate' },
    });
    await this.recordEvent('llm_request_started', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: requestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'llm-gateway' },
      properties: { generation_id: generationId, semantic_action: policy.semanticAction, allowed_action: policy.policyAction },
    });
    let proposal;
    try {
      proposal = await this.gateway.propose({
        request_id: requestId,
        session_id: input.sessionId,
        experience_id: input.experienceId,
        intent: { intent_id: experience.intentId },
        experience_state: { status: current.status, stage: current.stage, state_version: current.stateVersion },
        semantic_action: policy.semanticAction,
        allowed_action: policy.policyAction,
        context: { raw_input: input.rawInput },
      });
    } catch {
      return { ok: false, error: runtimeError('LLM_UNAVAILABLE', 'synthetic gateway failed', true) };
    }
    await this.recordEvent('llm_request_completed', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: requestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'llm-gateway' },
      properties: { generation_id: generationId, proposal_id: proposal.proposal_id },
    });

    // 5. 验证（S1-08：LLM 输出永远是提案；越权状态写入拒绝）。
    const validation = validateProposal(proposal);
    if (!validation.ok) {
      await this.recordEvent('llm_output_rejected', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: requestId, decision_id: decisionId },
        source: { layer: 'llm', component: 'validator' },
        properties: { generation_id: generationId, proposal_id: proposal.proposal_id, code: validation.code, reason: validation.reason },
      });
      if (validation.code === 'POLICY_REJECTED') {
        await this.recordEvent('state_write_rejected', {
          identity: { user_id: this.userId, session_id: input.sessionId },
          context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: requestId, decision_id: decisionId },
          source: { layer: 'runtime', component: 'validator' },
          properties: { reason: 'llm_state_mutation_forbidden', generation_id: generationId, detail: validation.reason },
        });
      }
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'proposal_rejected',
        reasonSecondary: `${validation.code}: ${validation.reason}`,
        llmUsed: true,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(validation.code, validation.reason),
      };
    }
    await this.recordEvent('llm_output_validated', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: requestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'validator' },
      properties: { generation_id: generationId, proposal_id: proposal.proposal_id },
    });

    // 6. 新候选（Create New Candidate）。
    this.counters.candidate += 1;
    const newCandidateId = `candidate_synthetic_${String(this.counters.candidate).padStart(4, '0')}`;
    await this.recordEvent('experience_candidate_generated', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
      source: { layer: 'runtime', component: 'experience-candidate' },
      properties: { candidate_id: newCandidateId, direction: 'new' },
    });
    await this.recordEvent('experience_candidate_selected', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
      source: { layer: 'runtime', component: 'experience-candidate' },
      properties: { candidate_id: newCandidateId, selection: 'system_selected_new_direction' },
    });

    // 7. 版本化提交（复合迁移结果；expected_state_version 陈旧 → 冲突拒绝）。
    const commit = await this.store.commit(input.experienceId, input.expectedStateVersion, (state) => ({
      ...state,
      status: view.status,
      stage: view.stage,
      waitingForUser: false,
      candidateId: newCandidateId,
      lastSemanticAction: 'CHANGE_DIRECTION',
      updatedAt: now,
    }));
    if (!commit.ok) {
      await this.recordEvent('state_version_conflict', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'state-store' },
        properties: {
          expected_state_version: input.expectedStateVersion,
          current_state_version: commit.currentStateVersion,
          trigger: 'CHANGE_DIRECTION',
        },
      });
      return {
        ok: false,
        error: runtimeError(
          'STATE_VERSION_CONFLICT',
          `stale expected_state_version: expected ${input.expectedStateVersion}, current ${commit.currentStateVersion} (no overwrite, S1-12)`,
          false,
          { expected_state_version: input.expectedStateVersion, current_state_version: commit.currentStateVersion },
        ),
      };
    }

    // 8. generation epoch 切换（旧 generation 迟到达提交由此守卫拒绝）。
    this.activeGenerations.set(input.experienceId, generationId);
    const controller = new AbortController();
    this.generationControllers.set(input.experienceId, controller);
    experience.candidateId = newCandidateId;

    const stateTransitions = await this.recordEvent('state_transitioned', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: commit.state.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'state-machine' },
      properties: {
        from: { status: stateBefore.status, stage: stateBefore.stage },
        event: 'CHANGE_DIRECTION',
        action: policy.policyAction,
        to: { status: commit.state.status, stage: commit.state.stage },
        state_version_before: current.stateVersion,
        state_version_after: commit.state.stateVersion,
        steps,
      },
    });

    await this.writeDecisionTrace({
      decisionId,
      sessionId: input.sessionId,
      experienceId: input.experienceId,
      semanticAction: policy.semanticAction,
      stateBefore,
      stateBeforeVersion: current.stateVersion,
      stateAfter: { status: commit.state.status, stage: commit.state.stage, state_version: commit.state.stateVersion },
      selectedAction: policy.policyAction,
      reasonPrimary: 'explicit_user_direction',
      reasonSecondary: 'CHANGE_DIRECTION cancels old generation, rejects old candidate, starts new direction (P-02)',
      llmUsed: true,
      userOverride: true,
      inputEvent: null,
      intentBefore: null,
    });

    const header: SubmissionHeader = {
      type: 'submission',
      accepted: true,
      experience_id: input.experienceId,
      session_id: input.sessionId,
      request_id: input.requestId,
      policy_decision: {
        decision_id: decisionId,
        policy_version: POLICY_VERSION,
        semantic_action: policy.semanticAction,
        selected_action: policy.policyAction,
        reason: 'explicit_user_direction',
      },
      state_version: commit.state.stateVersion,
      state: { status: commit.state.status, stage: commit.state.stage, waiting_for_user: commit.state.waitingForUser },
      at: now,
    };

    const fixture = loadChunkFixture(policy.semanticAction);
    if (!fixture.ok) {
      return { ok: false, error: runtimeError('INTERNAL_ERROR', `fixture missing for ${policy.semanticAction}`) };
    }
    const combinedSignal = input.signal
      ? AbortSignal.any([input.signal, controller.signal])
      : controller.signal;
    const stream = this.wrapGenerationStream({
      header,
      experienceId: input.experienceId,
      generationId,
      streamOptions: {
        semanticAction: policy.semanticAction,
        policyAction: policy.policyAction,
        fixtureId: fixture.fixture.fixtureId,
        chunks: fixture.fixture.chunks,
        signal: combinedSignal,
        chunkDelayMs: 40,
        audit: this.auditSink,
      },
      completionCommit: true,
      stateTransitionedEvent: stateTransitions,
    });

    return { ok: true, header, stream, generationId };
  }

  // ---------------------------------------------------------------------
  // CREATE 执行（PD-21 关闭切片：最小 Creation Branch；G04）
  // ---------------------------------------------------------------------

  private async executeCreate(
    input: {
      experienceId: string;
      sessionId: string;
      requestId: string;
      expectedStateVersion: number;
      signal?: AbortSignal;
      rawInput: string;
    },
    session: SessionRecord,
    experience: ExperienceRecord,
    current: ExperienceState,
    stateBefore: ExperienceView,
    policy: { semanticAction: SemanticAction; policyAction: PolicyAction },
    decisionId: string,
  ): Promise<SubmissionResult> {
    const now = new Date().toISOString();

    // 1. 取消在途 generation（P-02 同族约束：CREATE 取代在途生成）。
    await this.interruptGeneration(input.experienceId, 'superseded_by_create');

    // 2. 拒绝旧候选（与 CHANGE 同族：旧候选被取代拒绝）。
    await this.recordEvent('experience_interrupted', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: {
        experience_id: input.experienceId,
        intent_id: experience.intentId,
        state_version: current.stateVersion,
        request_id: input.requestId,
      },
      source: { layer: 'runtime', component: 'interrupt-controller' },
      properties: {
        interrupted_candidate_id: experience.candidateId,
        reason: 'create',
        old_generation_rejected: true,
      },
    });

    // 3. 状态迁移（CREATE：当前视图 → ACTIVE/CREATION，单步合法校验）。
    const steps: ExperienceTrigger[] = ['CREATE'];
    const transition = transitionExperience(stateBefore, 'CREATE');
    if (!transition.ok) {
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'invalid_state_transition',
        reasonSecondary: `CREATE illegal from ${stateBefore.status}/${stateBefore.stage}`,
        llmUsed: true,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'INVALID_STATE_TRANSITION',
          `CREATE illegal from ${stateBefore.status}/${stateBefore.stage} (state machine allows CREATE from READY/ACTIVE/WAITING)`,
        ),
      };
    }
    const view = transition.next;

    // 4. 能力层：结构化 LLM 请求 → 提案（S1-07）。
    this.counters.generation += 1;
    const generationId = `gen_synthetic_${String(this.counters.generation).padStart(4, '0')}`;
    const llmRequestId = `req_${generationId}`;
    await this.recordEvent('generation_started', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'generation' },
      properties: { generation_id: generationId },
    });
    await this.recordEvent('llm_request_started', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'llm-gateway' },
      properties: { generation_id: generationId, semantic_action: policy.semanticAction, allowed_action: policy.policyAction },
    });
    let proposal;
    try {
      proposal = await this.gateway.propose({
        request_id: llmRequestId,
        session_id: input.sessionId,
        experience_id: input.experienceId,
        intent: { intent_id: experience.intentId },
        experience_state: { status: current.status, stage: current.stage, state_version: current.stateVersion },
        semantic_action: policy.semanticAction,
        allowed_action: policy.policyAction,
        context: { raw_input: input.rawInput },
      });
    } catch {
      // EB-02：propose 失败不提交、不消耗版本号（在途 generation 已被取代取消）。
      return { ok: false, error: runtimeError('LLM_UNAVAILABLE', 'synthetic gateway failed', true) };
    }
    await this.recordEvent('llm_request_completed', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'llm-gateway' },
      properties: { generation_id: generationId, proposal_id: proposal.proposal_id },
    });

    // 5. 验证（S1-08；GS-06：任何越权状态写入提案在此拒绝）。
    const validation = validateProposal(proposal);
    if (!validation.ok) {
      await this.recordEvent('llm_output_rejected', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
        source: { layer: 'llm', component: 'validator' },
        properties: { generation_id: generationId, proposal_id: proposal.proposal_id, code: validation.code, reason: validation.reason },
      });
      if (validation.code === 'POLICY_REJECTED') {
        await this.recordEvent('state_write_rejected', {
          identity: { user_id: this.userId, session_id: input.sessionId },
          context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
          source: { layer: 'runtime', component: 'validator' },
          properties: { reason: 'llm_state_mutation_forbidden', generation_id: generationId, detail: validation.reason },
        });
      }
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'proposal_rejected',
        reasonSecondary: `${validation.code}: ${validation.reason}`,
        llmUsed: true,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return { ok: false, error: runtimeError(validation.code, validation.reason) };
    }
    await this.recordEvent('llm_output_validated', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'validator' },
      properties: { generation_id: generationId, proposal_id: proposal.proposal_id },
    });

    // 6. 版本化提交（CREATE 迁移结果；expected_state_version 陈旧 → 冲突拒绝）。
    const commit = await this.store.commit(input.experienceId, input.expectedStateVersion, (state) => ({
      ...state,
      status: view.status,
      stage: view.stage,
      waitingForUser: false,
      lastSemanticAction: 'CREATE',
      updatedAt: now,
    }));
    if (!commit.ok) {
      await this.recordEvent('state_version_conflict', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'state-store' },
        properties: {
          expected_state_version: input.expectedStateVersion,
          current_state_version: commit.currentStateVersion,
          trigger: 'CREATE',
        },
      });
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'state_version_conflict',
        reasonSecondary: `expected ${input.expectedStateVersion}, current ${commit.currentStateVersion}`,
        llmUsed: true,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'STATE_VERSION_CONFLICT',
          `stale expected_state_version: expected ${input.expectedStateVersion}, current ${commit.currentStateVersion} (no overwrite, S1-12)`,
          false,
          { expected_state_version: input.expectedStateVersion, current_state_version: commit.currentStateVersion },
        ),
      };
    }

    // 7. generation epoch 登记 + 迁移事件 + 决策追踪。
    this.activeGenerations.set(input.experienceId, generationId);
    const controller = new AbortController();
    this.generationControllers.set(input.experienceId, controller);

    const stateTransitions = await this.recordEvent('state_transitioned', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: commit.state.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'state-machine' },
      properties: {
        from: { status: stateBefore.status, stage: stateBefore.stage },
        event: 'CREATE',
        action: policy.policyAction,
        to: { status: commit.state.status, stage: commit.state.stage },
        state_version_before: current.stateVersion,
        state_version_after: commit.state.stateVersion,
        steps,
      },
    });

    await this.writeDecisionTrace({
      decisionId,
      sessionId: input.sessionId,
      experienceId: input.experienceId,
      semanticAction: policy.semanticAction,
      stateBefore,
      stateBeforeVersion: current.stateVersion,
      stateAfter: { status: commit.state.status, stage: commit.state.stage, state_version: commit.state.stateVersion },
      selectedAction: policy.policyAction,
      reasonPrimary: 'explicit_user_direction',
      reasonSecondary: 'CREATE cancels in-flight generation and starts the minimal creation turn on the inherited context (PD-21 closure slice)',
      llmUsed: true,
      userOverride: true,
      inputEvent: null,
      intentBefore: null,
    });

    const header: SubmissionHeader = {
      type: 'submission',
      accepted: true,
      experience_id: input.experienceId,
      session_id: input.sessionId,
      request_id: input.requestId,
      policy_decision: {
        decision_id: decisionId,
        policy_version: POLICY_VERSION,
        semantic_action: policy.semanticAction,
        selected_action: policy.policyAction,
        reason: 'explicit_user_direction',
      },
      state_version: commit.state.stateVersion,
      state: { status: commit.state.status, stage: commit.state.stage, waiting_for_user: commit.state.waitingForUser },
      at: now,
    };

    const fixture = loadChunkFixture(policy.semanticAction);
    if (!fixture.ok) {
      return { ok: false, error: runtimeError('INTERNAL_ERROR', `fixture missing for ${policy.semanticAction}`) };
    }
    const combinedSignal = input.signal
      ? AbortSignal.any([input.signal, controller.signal])
      : controller.signal;
    const stream = this.wrapGenerationStream({
      header,
      experienceId: input.experienceId,
      generationId,
      streamOptions: {
        semanticAction: policy.semanticAction,
        policyAction: policy.policyAction,
        fixtureId: fixture.fixture.fixtureId,
        chunks: fixture.fixture.chunks,
        signal: combinedSignal,
        chunkDelayMs: 40,
        audit: this.auditSink,
      },
      completionCommit: true,
      stateTransitionedEvent: stateTransitions,
    });

    return { ok: true, header, stream, generationId };
  }

  // ---------------------------------------------------------------------
  // CORRECTION 执行（PD-21 关闭切片：最小 Correction；G07）
  // ---------------------------------------------------------------------

  private async executeCorrect(
    input: {
      experienceId: string;
      sessionId: string;
      requestId: string;
      expectedStateVersion: number;
      signal?: AbortSignal;
      rawInput: string;
    },
    session: SessionRecord,
    experience: ExperienceRecord,
    current: ExperienceState,
    stateBefore: ExperienceView,
    policy: { semanticAction: SemanticAction; policyAction: PolicyAction },
    decisionId: string,
  ): Promise<SubmissionResult> {
    const now = new Date().toISOString();

    // 1. 取消在途 generation（纠正与在途生成互斥：旧生成被取代取消）。
    await this.interruptGeneration(input.experienceId, 'correction');

    // 2. 拒绝旧候选（纠正否定旧候选的推断）。
    await this.recordEvent('experience_interrupted', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: {
        experience_id: input.experienceId,
        intent_id: experience.intentId,
        state_version: current.stateVersion,
        request_id: input.requestId,
      },
      source: { layer: 'runtime', component: 'interrupt-controller' },
      properties: {
        interrupted_candidate_id: experience.candidateId,
        reason: 'correction',
        old_generation_rejected: true,
      },
    });

    // 3. 状态迁移（CORRECTION：当前视图 → ACTIVE，阶段保持——重评估当前阶段）。
    const steps: ExperienceTrigger[] = ['CORRECTION'];
    const transition = transitionExperience(stateBefore, 'CORRECTION');
    if (!transition.ok) {
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'invalid_state_transition',
        reasonSecondary: `CORRECTION illegal from ${stateBefore.status}/${stateBefore.stage}`,
        llmUsed: true,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'INVALID_STATE_TRANSITION',
          `CORRECTION illegal from ${stateBefore.status}/${stateBefore.stage} (state machine allows CORRECTION from READY/ACTIVE/WAITING)`,
        ),
      };
    }
    const view = transition.next;

    // 4. 能力层：结构化 LLM 请求 → 提案（S1-07；重评估后的纠正候选）。
    this.counters.generation += 1;
    const generationId = `gen_synthetic_${String(this.counters.generation).padStart(4, '0')}`;
    const llmRequestId = `req_${generationId}`;
    await this.recordEvent('generation_started', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'generation' },
      properties: { generation_id: generationId },
    });
    await this.recordEvent('llm_request_started', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'llm-gateway' },
      properties: { generation_id: generationId, semantic_action: policy.semanticAction, allowed_action: policy.policyAction },
    });
    let proposal;
    try {
      proposal = await this.gateway.propose({
        request_id: llmRequestId,
        session_id: input.sessionId,
        experience_id: input.experienceId,
        intent: { intent_id: experience.intentId },
        experience_state: { status: current.status, stage: current.stage, state_version: current.stateVersion },
        semantic_action: policy.semanticAction,
        allowed_action: policy.policyAction,
        context: { raw_input: input.rawInput },
      });
    } catch {
      // EB-02：propose 失败不提交、不消耗版本号（在途 generation 已被取消）。
      return { ok: false, error: runtimeError('LLM_UNAVAILABLE', 'synthetic gateway failed', true) };
    }
    await this.recordEvent('llm_request_completed', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'llm-gateway' },
      properties: { generation_id: generationId, proposal_id: proposal.proposal_id },
    });

    // 5. 验证（S1-08；GS-06：任何越权状态写入提案在此拒绝）。
    const validation = validateProposal(proposal);
    if (!validation.ok) {
      await this.recordEvent('llm_output_rejected', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
        source: { layer: 'llm', component: 'validator' },
        properties: { generation_id: generationId, proposal_id: proposal.proposal_id, code: validation.code, reason: validation.reason },
      });
      if (validation.code === 'POLICY_REJECTED') {
        await this.recordEvent('state_write_rejected', {
          identity: { user_id: this.userId, session_id: input.sessionId },
          context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
          source: { layer: 'runtime', component: 'validator' },
          properties: { reason: 'llm_state_mutation_forbidden', generation_id: generationId, detail: validation.reason },
        });
      }
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'proposal_rejected',
        reasonSecondary: `${validation.code}: ${validation.reason}`,
        llmUsed: true,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return { ok: false, error: runtimeError(validation.code, validation.reason) };
    }
    await this.recordEvent('llm_output_validated', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'validator' },
      properties: { generation_id: generationId, proposal_id: proposal.proposal_id },
    });

    // 6. 版本化提交（CORRECTION 迁移结果；expected_state_version 陈旧 → 冲突拒绝）。
    const commit = await this.store.commit(input.experienceId, input.expectedStateVersion, (state) => ({
      ...state,
      status: view.status,
      stage: view.stage,
      waitingForUser: false,
      lastSemanticAction: 'CORRECTION',
      updatedAt: now,
    }));
    if (!commit.ok) {
      await this.recordEvent('state_version_conflict', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'state-store' },
        properties: {
          expected_state_version: input.expectedStateVersion,
          current_state_version: commit.currentStateVersion,
          trigger: 'CORRECTION',
        },
      });
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'state_version_conflict',
        reasonSecondary: `expected ${input.expectedStateVersion}, current ${commit.currentStateVersion}`,
        llmUsed: true,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'STATE_VERSION_CONFLICT',
          `stale expected_state_version: expected ${input.expectedStateVersion}, current ${commit.currentStateVersion} (no overwrite, S1-12)`,
          false,
          { expected_state_version: input.expectedStateVersion, current_state_version: commit.currentStateVersion },
        ),
      };
    }

    // 7. generation epoch 登记 + 迁移事件 + 决策追踪。
    this.activeGenerations.set(input.experienceId, generationId);
    const controller = new AbortController();
    this.generationControllers.set(input.experienceId, controller);

    const stateTransitions = await this.recordEvent('state_transitioned', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: commit.state.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'state-machine' },
      properties: {
        from: { status: stateBefore.status, stage: stateBefore.stage },
        event: 'CORRECTION',
        action: policy.policyAction,
        to: { status: commit.state.status, stage: commit.state.stage },
        state_version_before: current.stateVersion,
        state_version_after: commit.state.stateVersion,
        steps,
      },
    });

    await this.writeDecisionTrace({
      decisionId,
      sessionId: input.sessionId,
      experienceId: input.experienceId,
      semanticAction: policy.semanticAction,
      stateBefore,
      stateBeforeVersion: current.stateVersion,
      stateAfter: { status: commit.state.status, stage: commit.state.stage, state_version: commit.state.stateVersion },
      selectedAction: policy.policyAction,
      reasonPrimary: 'reassess',
      reasonSecondary: 'CORRECTION cancels in-flight generation, removes the invalid inference, preserves valid context (session/intent/prior events intact), and reassesses the corrected candidate (G07; PD-21 closure slice)',
      llmUsed: true,
      userOverride: true,
      inputEvent: null,
      intentBefore: null,
    });

    const header: SubmissionHeader = {
      type: 'submission',
      accepted: true,
      experience_id: input.experienceId,
      session_id: input.sessionId,
      request_id: input.requestId,
      policy_decision: {
        decision_id: decisionId,
        policy_version: POLICY_VERSION,
        semantic_action: policy.semanticAction,
        selected_action: policy.policyAction,
        reason: 'reassess',
      },
      state_version: commit.state.stateVersion,
      state: { status: commit.state.status, stage: commit.state.stage, waiting_for_user: commit.state.waitingForUser },
      at: now,
    };

    const fixture = loadChunkFixture(policy.semanticAction);
    if (!fixture.ok) {
      return { ok: false, error: runtimeError('INTERNAL_ERROR', `fixture missing for ${policy.semanticAction}`) };
    }
    const combinedSignal = input.signal
      ? AbortSignal.any([input.signal, controller.signal])
      : controller.signal;
    const stream = this.wrapGenerationStream({
      header,
      experienceId: input.experienceId,
      generationId,
      streamOptions: {
        semanticAction: policy.semanticAction,
        policyAction: policy.policyAction,
        fixtureId: fixture.fixture.fixtureId,
        chunks: fixture.fixture.chunks,
        signal: combinedSignal,
        chunkDelayMs: 40,
        audit: this.auditSink,
      },
      completionCommit: true,
      stateTransitionedEvent: stateTransitions,
    });

    return { ok: true, header, stream, generationId };
  }

  // ---------------------------------------------------------------------
  // ANSWER / EXPLAIN / SIMULATE 执行（内容生成流）
  // ---------------------------------------------------------------------

  private async executeContentGeneration(
    input: {
      experienceId: string;
      sessionId: string;
      requestId: string;
      expectedStateVersion: number;
      signal?: AbortSignal;
      rawInput: string;
    },
    session: SessionRecord,
    experience: ExperienceRecord,
    current: ExperienceState,
    stateBefore: ExperienceView,
    policy: { semanticAction: SemanticAction; policyAction: PolicyAction },
    decisionId: string,
  ): Promise<SubmissionResult> {
    const now = new Date().toISOString();

    // 1. 复合迁移逐步合法校验：
    //    ANSWER/EXPLAIN：USER_ACTION（READY/WAITING → ACTIVE）。
    //    SIMULATE：USER_ACTION + WHAT_IF_SIMULATE（阶段 → SIMULATION，§15.2/§15.3）。
    const steps: ExperienceTrigger[] =
      policy.policyAction === 'SIMULATE' ? ['USER_ACTION', 'WHAT_IF_SIMULATE'] : ['USER_ACTION'];
    let view: ExperienceView = { status: current.status, stage: current.stage };
    for (const trigger of steps) {
      const step = transitionExperience(view, trigger);
      if (!step.ok) {
        await this.writeDecisionTrace({
          decisionId,
          sessionId: input.sessionId,
          experienceId: input.experienceId,
          semanticAction: policy.semanticAction,
          stateBefore,
          stateBeforeVersion: current.stateVersion,
          stateAfter: null,
          selectedAction: policy.policyAction,
          reasonPrimary: 'invalid_state_transition',
          reasonSecondary: `step ${trigger} illegal from ${view.status}/${view.stage}`,
          llmUsed: true,
          userOverride: false,
          inputEvent: null,
          intentBefore: null,
        });
        return {
          ok: false,
          error: runtimeError(
            'INVALID_STATE_TRANSITION',
            `step ${trigger} illegal from ${view.status}/${view.stage} (ACTIVE mid-generation accepts only STOP/CHANGE per §7; retry after completion)`,
            true,
          ),
        };
      }
      view = step.next;
    }

    // 2. 能力层：结构化 LLM 请求 → 提案（S1-07）。
    this.counters.generation += 1;
    const generationId = `gen_synthetic_${String(this.counters.generation).padStart(4, '0')}`;
    const llmRequestId = `req_${generationId}`;
    await this.recordEvent('generation_started', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'generation' },
      properties: { generation_id: generationId },
    });
    await this.recordEvent('llm_request_started', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'llm-gateway' },
      properties: { generation_id: generationId, semantic_action: policy.semanticAction, allowed_action: policy.policyAction },
    });
    let proposal;
    try {
      proposal = await this.gateway.propose({
        request_id: llmRequestId,
        session_id: input.sessionId,
        experience_id: input.experienceId,
        intent: { intent_id: experience.intentId },
        experience_state: { status: current.status, stage: current.stage, state_version: current.stateVersion },
        semantic_action: policy.semanticAction,
        allowed_action: policy.policyAction,
        context: { raw_input: input.rawInput },
      });
    } catch {
      return { ok: false, error: runtimeError('LLM_UNAVAILABLE', 'synthetic gateway failed', true) };
    }
    await this.recordEvent('llm_request_completed', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'llm-gateway' },
      properties: { generation_id: generationId, proposal_id: proposal.proposal_id },
    });

    // 3. 验证（S1-08；GS-06：任何越权状态写入提案在此拒绝，不产生状态写入）。
    const validation = validateProposal(proposal);
    if (!validation.ok) {
      await this.recordEvent('llm_output_rejected', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
        source: { layer: 'llm', component: 'validator' },
        properties: { generation_id: generationId, proposal_id: proposal.proposal_id, code: validation.code, reason: validation.reason },
      });
      if (validation.code === 'POLICY_REJECTED') {
        await this.recordEvent('state_write_rejected', {
          identity: { user_id: this.userId, session_id: input.sessionId },
          context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
          source: { layer: 'runtime', component: 'validator' },
          properties: { reason: 'llm_state_mutation_forbidden', generation_id: generationId, detail: validation.reason },
        });
      }
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'proposal_rejected',
        reasonSecondary: `${validation.code}: ${validation.reason}`,
        llmUsed: true,
        userOverride: false,
        inputEvent: null,
        intentBefore: null,
      });
      return { ok: false, error: runtimeError(validation.code, validation.reason) };
    }
    await this.recordEvent('llm_output_validated', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: llmRequestId, decision_id: decisionId },
      source: { layer: 'llm', component: 'validator' },
      properties: { generation_id: generationId, proposal_id: proposal.proposal_id },
    });

    // 4. 版本化提交（复合迁移结果）。
    const commit = await this.store.commit(input.experienceId, input.expectedStateVersion, (state) => ({
      ...state,
      status: view.status,
      stage: view.stage,
      waitingForUser: false,
      lastSemanticAction: policy.semanticAction,
      updatedAt: now,
    }));
    if (!commit.ok) {
      await this.recordEvent('state_version_conflict', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'state-store' },
        properties: {
          expected_state_version: input.expectedStateVersion,
          current_state_version: commit.currentStateVersion,
          trigger: policy.semanticAction,
        },
      });
      await this.writeDecisionTrace({
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        semanticAction: policy.semanticAction,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: null,
        selectedAction: policy.policyAction,
        reasonPrimary: 'state_version_conflict',
        reasonSecondary: `expected ${input.expectedStateVersion}, current ${commit.currentStateVersion}`,
        llmUsed: true,
        userOverride: false,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'STATE_VERSION_CONFLICT',
          `stale expected_state_version: expected ${input.expectedStateVersion}, current ${commit.currentStateVersion} (no overwrite, S1-12)`,
          false,
          { expected_state_version: input.expectedStateVersion, current_state_version: commit.currentStateVersion },
        ),
      };
    }

    // 5. generation epoch 登记。
    this.activeGenerations.set(input.experienceId, generationId);
    const controller = new AbortController();
    this.generationControllers.set(input.experienceId, controller);

    const stateTransitions = await this.recordEvent('state_transitioned', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: commit.state.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'state-machine' },
      properties: {
        from: { status: stateBefore.status, stage: stateBefore.stage },
        event: policy.semanticAction,
        action: policy.policyAction,
        to: { status: commit.state.status, stage: commit.state.stage },
        state_version_before: current.stateVersion,
        state_version_after: commit.state.stateVersion,
        steps,
      },
    });

    await this.writeDecisionTrace({
      decisionId,
      sessionId: input.sessionId,
      experienceId: input.experienceId,
      semanticAction: policy.semanticAction,
      stateBefore,
      stateBeforeVersion: current.stateVersion,
      stateAfter: { status: commit.state.status, stage: commit.state.stage, state_version: commit.state.stateVersion },
      selectedAction: policy.policyAction,
      reasonPrimary: 'semantic_action',
      reasonSecondary: `${policy.semanticAction} resolves to ${policy.policyAction} via the frozen S1 §14 policy map`,
      llmUsed: true,
      userOverride: false,
      inputEvent: null,
      intentBefore: null,
    });

    const header: SubmissionHeader = {
      type: 'submission',
      accepted: true,
      experience_id: input.experienceId,
      session_id: input.sessionId,
      request_id: input.requestId,
      policy_decision: {
        decision_id: decisionId,
        policy_version: POLICY_VERSION,
        semantic_action: policy.semanticAction,
        selected_action: policy.policyAction,
        reason: 'semantic_action',
      },
      state_version: commit.state.stateVersion,
      state: { status: commit.state.status, stage: commit.state.stage, waiting_for_user: commit.state.waitingForUser },
      at: now,
    };

    const fixture = loadChunkFixture(policy.semanticAction);
    if (!fixture.ok) {
      return { ok: false, error: runtimeError('INTERNAL_ERROR', `fixture missing for ${policy.semanticAction}`) };
    }
    const combinedSignal = input.signal
      ? AbortSignal.any([input.signal, controller.signal])
      : controller.signal;
    const stream = this.wrapGenerationStream({
      header,
      experienceId: input.experienceId,
      generationId,
      streamOptions: {
        semanticAction: policy.semanticAction,
        policyAction: policy.policyAction,
        fixtureId: fixture.fixture.fixtureId,
        chunks: fixture.fixture.chunks,
        signal: combinedSignal,
        chunkDelayMs: 40,
        audit: this.auditSink,
      },
      completionCommit: true,
      stateTransitionedEvent: stateTransitions,
    });

    return { ok: true, header, stream, generationId };
  }

  // ---------------------------------------------------------------------
  // generation 生命周期（S1-10 中断控制器）
  // ---------------------------------------------------------------------

  /** 取消在途 generation 并登记 generation_cancelled（幂等：每 generation 至多一次）。 */
  private async interruptGeneration(experienceId: string, reason: string): Promise<void> {
    const generationId = this.activeGenerations.get(experienceId);
    const controller = this.generationControllers.get(experienceId);
    if (!generationId || !controller) {
      return;
    }
    controller.abort();
    if (!this.cancellationMarked.has(generationId)) {
      this.cancellationMarked.add(generationId);
      const session = this.sessions.get(this.experiences.get(experienceId)?.sessionId ?? '');
      await this.recordEvent('generation_cancelled', {
        identity: { user_id: this.userId, session_id: session?.sessionId ?? '' },
        context: { experience_id: experienceId, intent_id: null, state_version: this.store.get(experienceId)?.stateVersion ?? null, request_id: null },
        source: { layer: 'runtime', component: 'interrupt-controller' },
        properties: { generation_id: generationId, reason },
      });
    }
  }

  /**
   * generation 完成提交（S1-10：旧 operation 不得提交）。
   * generation epoch 守卫：调用方 generationId 非当前生效 generation → 拒绝；
   * 且提交仍经版本化检查（双重保护，CC02 H03）。
   */
  async completeGeneration(
    experienceId: string,
    generationId: string,
  ): Promise<
    | { ok: true; state: ExperienceState }
    | {
        ok: false;
        code: 'STALE_GENERATION' | 'INVALID_STATE_TRANSITION' | 'STATE_VERSION_CONFLICT';
        currentStateVersion: number;
      }
  > {
    const currentGeneration = this.activeGenerations.get(experienceId);
    const state = this.store.get(experienceId);
    if (!state) {
      return { ok: false, code: 'STALE_GENERATION', currentStateVersion: -1 };
    }
    if (currentGeneration !== generationId) {
      // 迟到达的旧 generation 提交：拒绝并登记（S1-10 Critical；GS-03 负向）。
      await this.recordEvent('state_write_rejected', {
        identity: { user_id: this.userId, session_id: this.experiences.get(experienceId)?.sessionId ?? '' },
        context: { experience_id: experienceId, intent_id: null, state_version: state.stateVersion, request_id: null },
        source: { layer: 'runtime', component: 'interrupt-controller' },
        properties: {
          reason: 'superseded_generation',
          attempted_generation_id: generationId,
          active_generation_id: currentGeneration ?? null,
          detail: 'late commit from a superseded generation is rejected; it must not write the new state',
        },
      });
      return { ok: false, code: 'STALE_GENERATION', currentStateVersion: state.stateVersion };
    }
    const transition = transitionExperience(
      { status: state.status, stage: state.stage },
      'RESPONSE_COMPLETED',
    );
    if (!transition.ok) {
      return { ok: false, code: 'INVALID_STATE_TRANSITION', currentStateVersion: state.stateVersion };
    }
    const commit = await this.store.commit(experienceId, state.stateVersion, (previous) => ({
      ...previous,
      status: transition.next.status,
      stage: transition.next.stage,
      waitingForUser: transition.next.status === 'WAITING',
      updatedAt: new Date().toISOString(),
    }));
    if (!commit.ok) {
      return { ok: false, code: 'STATE_VERSION_CONFLICT', currentStateVersion: commit.currentStateVersion };
    }
    // generation 正常完成：清理在途 controller（generation epoch 保留作迟到达守卫）。
    this.generationControllers.delete(experienceId);
    return { ok: true, state: commit.state };
  }

  // ---------------------------------------------------------------------
  // 流包装：提交首行 + 内容分块 + 完成提交 + 最终状态
  // ---------------------------------------------------------------------

  private wrapGenerationStream(options: {
    header: SubmissionHeader;
    experienceId: string;
    generationId: string;
    streamOptions: Parameters<typeof createExperienceStream>[0];
    /** 流正常结束后是否执行 RESPONSE_COMPLETED 提交（STOP 流为 false）。 */
    completionCommit: boolean;
    stateTransitionedEvent?: ExperienceEvent;
  }): AsyncGenerator<RuntimeStreamEvent> {
    const { header, experienceId, generationId, streamOptions, completionCommit } = options;
    const runtime = this;
    let lastType: StreamEvent['type'] | null = null;

    return (async function* generate() {
      yield header;
      let generationCompletedEvent: ExperienceEvent | null = null;
      for await (const event of createExperienceStream(streamOptions)) {
        lastType = event.type;
        if (event.type === 'cancelled') {
          // 客户端断开/中断：登记 generation_cancelled（若尚未由中断控制器登记）。
          await runtime.markStreamCancellation(experienceId, generationId);
        }
        if (event.type === 'done') {
          generationCompletedEvent = await runtime.recordEvent('generation_completed', {
            identity: { user_id: runtime.userId, session_id: header.session_id },
            context: {
              experience_id: experienceId,
              intent_id: null,
              state_version: header.state_version,
              request_id: header.request_id,
              decision_id: header.policy_decision.decision_id,
            },
            source: { layer: 'runtime', component: 'generation' },
            properties: { generation_id: generationId, chunks_delivered: event.index, total_chunks: event.totalChunks },
          });
        }
        yield event;
      }
      if (!completionCommit || lastType !== 'done') {
        // 取消/停止终止：不做完成提交（状态保持提交时版本；旧 generation 不提交）。
        return;
      }
      const completion = await runtime.completeGeneration(experienceId, generationId);
      if (completion.ok) {
        yield {
          type: 'state_updated',
          state_version: completion.state.stateVersion,
          state: {
            status: completion.state.status,
            stage: completion.state.stage,
            waiting_for_user: completion.state.waitingForUser,
          },
          at: new Date().toISOString(),
        } satisfies StateUpdatedEvent;
        await runtime.recordEvent('runtime_waiting', {
          identity: { user_id: runtime.userId, session_id: header.session_id },
          context: {
            experience_id: experienceId,
            intent_id: null,
            state_version: completion.state.stateVersion,
            request_id: header.request_id,
            decision_id: header.policy_decision.decision_id,
          },
          source: { layer: 'runtime', component: 'runtime' },
          properties: {
            waiting_for_user: true,
            generation_id: generationId,
            detail: 'runtime correctly waits for the user; it does not continue on its own',
          },
        });
      }
      // 完成提交失败（迟到达冲突等）：不产出 state_updated；状态事实由
      // state_write_rejected / state_version_conflict 事件权威登记。
      void generationCompletedEvent;
    })();
  }

  /** 流观测到取消时登记 generation_cancelled（与 interruptGeneration 幂等互斥）。 */
  private async markStreamCancellation(experienceId: string, generationId: string): Promise<void> {
    if (this.cancellationMarked.has(generationId)) {
      return;
    }
    this.cancellationMarked.add(generationId);
    await this.recordEvent('generation_cancelled', {
      identity: { user_id: this.userId, session_id: this.experiences.get(experienceId)?.sessionId ?? '' },
      context: { experience_id: experienceId, intent_id: null, state_version: this.store.get(experienceId)?.stateVersion ?? null, request_id: null },
      source: { layer: 'runtime', component: 'generation' },
      properties: { generation_id: generationId, reason: 'client_disconnect_or_interrupt' },
    });
  }

  // ---------------------------------------------------------------------
  // 事件与决策追踪（S1-11/S1-12；C6 §22/§23 分离）
  // ---------------------------------------------------------------------

  private async recordEvent(
    eventType: string,
    fields: {
      identity: { user_id: string; session_id: string };
      context: {
        experience_id: string | null;
        intent_id: string | null;
        state_version: number | null;
        request_id: string | null;
        decision_id?: string | null;
      };
      source: { layer: 'frontend' | 'input' | 'runtime' | 'policy' | 'llm' | 'tool' | 'memory' | 'analytics'; component: string };
      properties?: Record<string, unknown>;
    },
  ): Promise<ExperienceEvent> {
    const event = this.recorder.build(eventType, fields);
    const result = await this.recorder.record(event);
    if (!result.ok) {
      // 事件记录失败（信封违规/重复 event_id）：升级而非静默丢弃。
      throw new Error(`event recording failed: ${result.reason}`);
    }
    return event;
  }

  private async writeDecisionTrace(input: {
    decisionId: string;
    sessionId: string;
    experienceId: string;
    semanticAction: SemanticAction;
    stateBefore: ExperienceView;
    stateBeforeVersion: number;
    stateAfter: { status: ExperienceStatus; stage: ExperienceStage; state_version: number } | null;
    selectedAction: PolicyAction;
    reasonPrimary: string;
    reasonSecondary: string | null;
    llmUsed: boolean;
    userOverride: boolean;
    inputEvent: string | null;
    intentBefore: unknown;
  }): Promise<void> {
    const trace = {
      decision_id: input.decisionId,
      session_id: input.sessionId,
      experience_id: input.experienceId,
      input_event: input.inputEvent,
      semantic_action: input.semanticAction,
      intent_before: input.intentBefore,
      state_before: {
        status: input.stateBefore.status,
        stage: input.stateBefore.stage,
        state_version: input.stateBeforeVersion,
      },
      policy: {
        policy_version: POLICY_VERSION,
        selected_action: input.selectedAction,
      },
      reason: {
        primary: input.reasonPrimary,
        secondary: input.reasonSecondary,
      },
      execution: {
        tool_used: false,
        llm_used: input.llmUsed,
      },
      state_after: input.stateAfter,
      user_override: input.userOverride,
      at: new Date().toISOString(),
    };
    await this.traceSink(trace);
  }
}
