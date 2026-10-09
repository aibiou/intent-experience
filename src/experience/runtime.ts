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
  CORRECTION_APPLIED_EVENT,
  CORRECTION_RESTORED_EVENT,
  MEMORY_CORRECTED_EVENT,
  MEMORY_EXPIRED_EVENT,
  MEMORY_RECORDED_EVENT,
  MEMORY_WITHDRAWN_EVENT,
  SIMULATION_RECORDED_EVENT,
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
import {
  CreationStore,
  buildMinimalCreation,
  buildDirectionalPatch,
  inheritCreationContext,
  interpretCreationInput,
  type CreationInterpretation,
  type CreationObject,
  type CreationPatch,
} from './creation';
import {
  firstExperiencePresentation,
  presentationStageFor,
  type FirstExperiencePresentation,
  type PresentationStage,
} from './presentation';
import { searchExperienceContext, type SearchContextResult } from './search';
import {
  SimulationStore,
  deriveSimulationSeparation,
  interpretBranchOperation,
  type BranchOperation,
  type SimulationSnapshot,
} from './simulation';
import {
  MemoryStore,
  extractCorrectedTopic,
  type MemoryOperationResult,
  type MemoryRecord,
  type MemorySignal,
  type MemorySnapshot,
} from './memory';
import { deriveCorrectionTarget, isRestoreIntent } from './correction';
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
  DEEPEN: 'deepen_requested', // S2b（D-01 选项 A；C6 §14 交互事件命名模式）
  SIMPLIFY: 'simplify_requested', // S2b（同上）
  REFRAME: 'reframe_requested', // S2b（同上）
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
  /** 创作状态存储（G04 完整 Creation 语义；S2A-F2-SEMANTIC-FREEZE-01 §4/D-03 选项 A——会话内持久）。 */
  private readonly creations = new CreationStore();
  private readonly simulations = new SimulationStore();
  /** 记忆记录存储（S2a F-5；轴外持久对象——D-01 选项 A；跨会话短期记忆）。 */
  private readonly memories = new MemoryStore();
  /** 语义动作历史（创作上下文继承派生用；08 §6 五项。仅登记已提交动作）。 */
  private readonly actionHistory = new Map<string, SemanticAction[]>();
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
  private counters = { intent: 0, experience: 0, candidate: 0, generation: 0, creation: 0 };

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
        action: 'start_experience' | 'escalate' | 'memory_operation';
        events: ExperienceEvent[];
        /** F-5：记忆域操作执行结果（action='memory_operation' 时存在）。 */
        memoryOperation?: MemoryOperationResult;
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

    // S2a F-5（D-05 选项 A）：UNKNOWN + 记忆操作标记（确定性
    // 规则词表识别——仅认领会成为 UNKNOWN 的输入）→ 记忆域
    // 操作经 Runtime 单一写入者执行并留痕（memory_withdrawn /
    // memory_corrected）；不新增语义动作（PD-23 §5——记忆操作
    // 不是体验语义动作，分类优先级层不变）。
    if (classification.semanticAction === 'UNKNOWN' && classification.memoryIntent) {
      const memoryOperation = await this.executeMemoryOperation({
        sessionId: input.sessionId,
        memoryIntent: classification.memoryIntent,
        rawInput: input.rawInput,
        requestId: input.requestId,
        intentId,
      });
      return {
        ok: true,
        intent,
        semanticAction: classification.semanticAction,
        confidence: 1,
        action: 'memory_operation' as const,
        events: [received, parsed, ...memoryOperation.events],
        memoryOperation: memoryOperation.result,
      };
    }

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
  // S2a F-5 记忆域操作（D-05 选项 A——用户动作路由经 Runtime 单一写入者）
  // ---------------------------------------------------------------------

  /**
   * 执行记忆域操作（用户显式撤回 / 纠正）。
   * 目标派生：当前会话活跃体验的探索主题（07 §13"别再给我这个"
   * 的"这个" = 当前探索主题），否则最近更新的活跃记录；
   * 无目标 → 幂等空操作（操作已识别、无留痕对象）。
   */
  private async executeMemoryOperation(input: {
    sessionId: string;
    memoryIntent: 'withdraw' | 'correct';
    rawInput: string;
    requestId: string;
    intentId: string;
  }): Promise<{ result: MemoryOperationResult; events: ExperienceEvent[] }> {
    const now = new Date().toISOString();
    const session = this.sessions.get(input.sessionId);
    let target: MemoryRecord | undefined;
    if (session?.experienceId) {
      const experience = this.experiences.get(session.experienceId);
      const originIntent = experience ? this.intents.get(experience.intentId) : undefined;
      if (originIntent) {
        target = this.memories.findByTopic(originIntent.rawInput);
      }
    }
    target ??= this.memories.mostRecentActive() ?? undefined;
    if (!target) {
      return {
        result: { kind: input.memoryIntent, executed: false, reason: 'no_memory_target', recordId: null, lifecycle: null },
        events: [],
      };
    }
    const identity = { user_id: this.userId, session_id: input.sessionId };
    const context = {
      experience_id: session?.experienceId ?? null,
      intent_id: input.intentId,
      state_version: null,
      request_id: input.requestId,
      decision_id: null,
    };
    const source = { layer: 'memory' as const, component: 'memory-store' };
    if (input.memoryIntent === 'withdraw') {
      const outcome = this.memories.withdrawMemory(target.recordId, now);
      if (!outcome.ok) {
        return {
          result: { kind: 'withdraw', executed: false, reason: outcome.code, recordId: target.recordId, lifecycle: target.lifecycle },
          events: [],
        };
      }
      const event = await this.recordEvent(MEMORY_WITHDRAWN_EVENT, {
        identity,
        context,
        source,
        properties: {
          record_id: outcome.record.recordId,
          topic: outcome.record.topic,
          previous_lifecycle: outcome.previousLifecycle,
          lifecycle: outcome.record.lifecycle,
          deletion_audit: outcome.record.deletionAudit,
        },
      });
      return {
        result: { kind: 'withdraw', executed: true, reason: null, recordId: outcome.record.recordId, lifecycle: outcome.record.lifecycle },
        events: [event],
      };
    }
    const correctedTopic = extractCorrectedTopic(input.rawInput);
    const outcome = this.memories.correctMemory(target.recordId, { correctedTopic, now });
    if (!outcome.ok) {
      return {
        result: { kind: 'correct', executed: false, reason: outcome.code, recordId: target.recordId, lifecycle: target.lifecycle },
        events: [],
      };
    }
    const event = await this.recordEvent(MEMORY_CORRECTED_EVENT, {
      identity,
      context,
      source,
      properties: {
        record_id: outcome.record.recordId,
        topic: outcome.record.topic,
        previous_lifecycle: outcome.previousLifecycle,
        lifecycle: outcome.record.lifecycle,
        corrections: outcome.record.corrections,
        corrected_topic: correctedTopic,
      },
    });
    return {
      result: { kind: 'correct', executed: true, reason: null, recordId: outcome.record.recordId, lifecycle: outcome.record.lifecycle },
      events: [event],
    };
  }

  /**
   * L5 记忆信号注入（D-03 选项 A——07 §21 优先级链；07 §20
   * 检索纪律：以当前意图为检索键，只取相关记录）。
   * 到期衰减在每次生成请求前应用（懒到期——memory_expired
   * 事件经 Runtime 事件管道留痕）。
   */
  private async buildLlmContext(rawInput: string): Promise<{ raw_input: string; memory_signals: MemorySignal[] }> {
    const now = new Date().toISOString();
    const decay = this.memories.applyDecay(now);
    for (const record of decay.expired) {
      await this.recordEvent(MEMORY_EXPIRED_EVENT, {
        identity: { user_id: this.userId, session_id: record.sessionId },
        context: {
          experience_id: record.experienceId,
          intent_id: null,
          state_version: null,
          request_id: null,
          decision_id: null,
        },
        source: { layer: 'memory', component: 'memory-store' },
        properties: {
          record_id: record.recordId,
          topic: record.topic,
          lifecycle: record.lifecycle,
          deletion_audit: record.deletionAudit,
        },
      });
    }
    return {
      raw_input: rawInput,
      memory_signals: this.memories.retrieveRelevant(rawInput, now),
    };
  }

  /**
   * 解释层生成上下文构建（S2b；S2B-SEMANTIC-FREEZE-01
   * 附列裁决区选项 A——VERIFY 类输入按既有 WHY /
   * DIRECT_ANSWER 解释层处理，SEARCH 内部能力在这些
   * 路径内被调用；policy_v2.0.0 变更 2/6）。
   *
   * SEARCH 能力集成（D-02/D-03 选项 A）：只读检索当前
   * 体验内容 / 创作对象 / 会话内上下文——不改变体验、
   * 不触发产品动作、不产生事件、无外部网络出口；跨会话
   * 记忆检索属 F-5 记忆域 L5 检索（07 §20），不经
   * SEARCH 动作（由 buildLlmContext 承载）。
   */
  private async buildGenerationContext(input: {
    rawInput: string;
    experienceId: string;
  }): Promise<{
    raw_input: string;
    memory_signals: MemorySignal[];
    search_context: SearchContextResult;
  }> {
    const base = await this.buildLlmContext(input.rawInput);
    const current = this.store.get(input.experienceId);
    const creationRecord = this.creations.get(input.experienceId);
    const history = this.actionHistory.get(input.experienceId) ?? [];
    const searchContext = searchExperienceContext({
      query: input.rawInput,
      experienceContent: current
        ? `status=${current.status} stage=${current.stage} version=${current.stateVersion} lastAction=${current.lastSemanticAction ?? ''}`
        : '',
      creationObject: creationRecord?.active
        ? {
            active: true,
            theme: creationRecord.creation.concept.theme,
            goal: creationRecord.creation.goal,
            version: creationRecord.creation.version,
          }
        : undefined,
      sessionContext: history,
    });
    return { ...base, search_context: searchContext };
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

  /** 创作状态查询（S2a F2；只读，不改变任何状态——同 getExperienceState 纪律）。 */
  getCreation(
    experienceId: string,
  ): { ok: true; creation: CreationObject; active: boolean } | { ok: false; error: RuntimeError } {
    const record = this.creations.get(experienceId);
    if (!record) {
      return { ok: false, error: runtimeError('INVALID_REQUEST', `no creation session for experience: ${experienceId}`) };
    }
    return { ok: true, creation: record.creation, active: record.active };
  }

  /**
   * 模拟域快照查询（S2a F-4——E5 进程内形态取证入口；
   * D-04 选项 A 会话内持久：分支 / 模拟历史 / 当前激活分支）。
   */
  getSimulation(
    experienceId: string,
  ): { ok: true; simulation: SimulationSnapshot } | { ok: false; error: RuntimeError } {
    const snapshot = this.simulations.getSnapshot(experienceId);
    if (!snapshot) {
      return { ok: false, error: runtimeError('INVALID_REQUEST', `no simulation context for experience: ${experienceId}`) };
    }
    return { ok: true, simulation: snapshot };
  }

  /**
   * 记忆域快照查询（S2a F-5——E5 进程内形态取证入口；
   * 轴外持久对象——D-01 选项 A：跨会话短期记忆记录 /
   * 生命周期 / 来源与置信度分量 / 删除审计留痕）。
   * 只读，不改变任何状态——同 getSimulation 纪律。
   */
  getMemory(): { ok: true; memory: MemorySnapshot } {
    return { ok: true, memory: this.memories.getSnapshot() };
  }

  /**
   * First Experience 呈现路径查询（S2b；S2B-SEMANTIC-FREEZE-01
   * D-04 选项 A——只读呈现层：不产生事件、不改变任何状态——
   * 同 getSimulation / getMemory 纪律；视觉样式不在冻结范围
   * （E2 §5））。
   */
  getFirstExperiencePresentation(
    experienceId?: string,
  ): {
    ok: true;
    presentation: FirstExperiencePresentation;
    current: {
      experienceId: string | null;
      view: ExperienceView | null;
      presentationStage: PresentationStage;
      branchActive: boolean;
    };
  } {
    const presentation = firstExperiencePresentation();
    if (!experienceId) {
      return {
        ok: true,
        presentation,
        current: {
          experienceId: null,
          view: null,
          presentationStage: 'CURIOSITY',
          branchActive: false,
        },
      };
    }
    const current = this.store.get(experienceId);
    const view: ExperienceView = current
      ? { status: current.status, stage: current.stage }
      : initialExperienceView();
    const snapshot = this.simulations.getSnapshot(experienceId);
    const branchActive =
      snapshot?.currentBranchId != null &&
      snapshot.branches.find((branch) => branch.branchId === snapshot.currentBranchId)
        ?.lifecycle === 'ACTIVE';
    return {
      ok: true,
      presentation,
      current: {
        experienceId,
        view: current ? view : null,
        presentationStage: presentationStageFor(view, branchActive),
        branchActive,
      },
    };
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
    /** 客户端已知的创作版本（创作修改轮次；S2a F-2——陈旧 → 冲突拒绝）。 */
    expectedCreationVersion?: number;
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
    let semanticAction = classification.semanticAction;
    let creationIntent: CreationInterpretation | null = null;
    let creationCompletionSignal = false;
    // 创作会话内输入路由（policy_v1.2.0 变更 2；S2A-F2-SEMANTIC-FREEZE-01 §3）：
    // 通用分类器返回 UNKNOWN 时，创作运行时解释输入（08 §13 理解职责；
    // 修改意图不落入通用 CORRECTION → EXPLAIN 路径——冻结文本 §3 变更 2）。
    const activeCreation = this.creations.get(input.experienceId);
    if (
      classification.semanticAction === 'UNKNOWN' &&
      activeCreation?.active &&
      activeCreation.creation.phase !== 'COMPLETE'
    ) {
      const interpretation = interpretCreationInput(input.rawInput, activeCreation.creation);
      if (interpretation.kind === 'completion') {
        // 08 §27 完成信号：经 STOP 执行路径在创作域登记（D-05 选项 A）。
        semanticAction = 'STOP';
        creationCompletionSignal = true;
      } else if (interpretation.kind === 'modification') {
        // 创作修改意图：创作域伞形动作 CREATE（PD-23 §5：S2a 不新增动作集）。
        semanticAction = 'CREATE';
        creationIntent = interpretation;
      } else if (interpretation.kind === 'ambiguous') {
        // 冲突判据（08 §16）：与既有轴触发器词表冲突——不自动判定，
        // 至多一个高价值澄清问题。
        semanticAction = 'CREATE';
        creationIntent = interpretation;
      }
      // interpretation.kind === 'none'：保持 UNKNOWN，走下方通用升级拒绝。
    }
    // 创作会话路由保护（D-01 选项 A；policy_v1.3.0 变更 3）：
    // MODIFY 别名登记为 CORRECTION 后，活跃创作会话内 CORRECTION
    // 分类输入先经 RESTORE 预检（D-04 词表），再经创作修改族预检
    // （复用 interpretCreationInput 词表族与 08 §16 冲突判据）——
    // 命中创作 ADD/REMOVE/MODIFY 族 → 创作解释（CREATE 伞形动作 +
    // 补丁轮次，F-2 机制不变）；命中冲突判据 → ASK（至多一个澄清
    // 问题，08 §16）；未命中创作修改族 → 通用 CORRECTION 路径
    // （executeCorrect；F-2 变更 3 保持：重评估创作子状态，不推进
    // 子状态机）。非创作会话 CORRECTION 分类输入 → 通用 CORRECTION
    // 路径（G07 完整语义）。
    if (
      classification.semanticAction === 'CORRECTION' &&
      activeCreation?.active &&
      activeCreation.creation.phase !== 'COMPLETE'
    ) {
      if (
        classification.correctionIntent === 'restore' &&
        activeCreation.creation.version > 1
      ) {
        // RESTORE 预检（D-04 选项 A）：恢复词表先判——"撤销刚才修改"
        // 亦含修改词，须先按恢复语义路由（恢复为修改轮次特例；
        // 创作版本 >1 才有上一版本可恢复）。
        semanticAction = 'CREATE';
        creationIntent = {
          kind: 'modification',
          patch: {
            operation: 'restore',
            target: 'creation',
            change: { restoreFromVersion: activeCreation.creation.version - 1 },
            summary: input.rawInput,
          },
        };
      } else {
        const correctionInterpretation = interpretCreationInput(
          input.rawInput,
          activeCreation.creation,
        );
        if (correctionInterpretation.kind === 'completion') {
          // 08 §27 完成信号：经 STOP 执行路径在创作域登记（D-05 选项 A）。
          semanticAction = 'STOP';
          creationCompletionSignal = true;
        } else if (
          correctionInterpretation.kind === 'modification' ||
          correctionInterpretation.kind === 'ambiguous'
        ) {
          // 创作修改意图 / 冲突判据：创作域伞形动作 CREATE
          // （PD-23 §5：S2a 不新增动作集）。
          semanticAction = 'CREATE';
          creationIntent = correctionInterpretation;
        }
        // correctionInterpretation.kind === 'none'：保持 CORRECTION，
        // 走下方通用 CORRECTION 执行路径（executeCorrect）。
      }
    }
    // S2b 创作域方向性操作路由（S2B-SEMANTIC-FREEZE-01
    // D-01 选项 A；policy_v2.0.0 变更 1/3/5）：DEEPEN /
    // SIMPLIFY / REFRAME 为顶层语义动作（14 §8 恒等映射，
    // 分类器确定性规则词表识别——优先级链 CREATE >
    // DEEPEN = SIMPLIFY = REFRAME > WHY），执行语义承载
    // 于创作域——创作会话内为与 add / remove / modify 同级
    // 的顶层补丁操作（buildDirectionalPatch：目标经
    // TARGET_SYNONYMS 确定性派生）；无活跃创作对象时按
    // 升级规则处理（C3 纪律，model on F-2/F-3 创作会话
    // 路由保护——INVALID_ACTION 升级，不静默执行未定义语义）。
    if (
      classification.semanticAction === 'DEEPEN' ||
      classification.semanticAction === 'SIMPLIFY' ||
      classification.semanticAction === 'REFRAME'
    ) {
      if (activeCreation?.active && activeCreation.creation.phase !== 'COMPLETE') {
        creationIntent = {
          kind: 'modification',
          patch: buildDirectionalPatch(
            classification.semanticAction.toLowerCase() as 'deepen' | 'simplify' | 'reframe',
            input.rawInput,
            activeCreation.creation,
          ),
        };
      } else {
        return {
          ok: false,
          error: runtimeError(
            'INVALID_ACTION',
            `directional operation ${classification.semanticAction} requires an active creation session (escalated per policy_v2.0.0 变更 5; C3 upgrade discipline)`,
          ),
        };
      }
    }
    if (semanticAction === 'UNKNOWN') {
      return {
        ok: false,
        error: runtimeError(
          'INVALID_ACTION',
          'unclassifiable input: escalated per authorization §5.7 (unknown situations escalate, never LLM-decided)',
        ),
      };
    }
    if (input.semanticAction !== semanticAction) {
      return {
        ok: false,
        error: runtimeError(
          'INVALID_REQUEST',
          `semantic_action mismatch: declared ${input.semanticAction} but input classifies as ${semanticAction} (clients cannot inject policy actions)`,
        ),
      };
    }

    // --- 策略决策（S1-06；P-05：LLM 不允许自己选择最终 Action） --------
    const policy = resolvePolicy(semanticAction);
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

    // --- WHAT_IF 分支操作路由（D-03 选项 A；policy_v1.4.0 变更 2） ---
    // WHAT_IF 分类输入经分支操作词表识别（确定性规则词表——同分类器
    // 纪律，具体词表为实现细节）：命中 → 分支操作轮次（确定性系统
    // 回合，无 LLM 提案——llm_used=false）；未命中 → 通用 SIMULATE
    // 执行路径（每轮模拟结果登记 simulation_recorded——变更 1；
    // WHAT_IF 首轮自动创建分支记录——D-03 选项 A CREATE）。
    const branchOperation =
      policy.policyAction === 'SIMULATE'
        ? interpretBranchOperation(input.rawInput)
        : null;

    // --- 策略分支（S1-06；P-05：LLM 不允许自己选择最终 Action） ------
    let branchResult: SubmissionResult;
    if (creationIntent?.kind === 'modification') {
      // 创作修改轮次（G04；USER_FEEDBACK 轮补丁应用——冻结文本 §4 变更 1）。
      branchResult = await this.executeCreationModify(input, session, experience, current, stateBefore, policy, decisionId, creationIntent.patch);
    } else if (creationIntent?.kind === 'ambiguous') {
      // 创作 ASK 轮次（08 §16：至多一个澄清问题；创作子状态不推进）。
      branchResult = await this.executeCreationAsk(input, session, experience, current, stateBefore, policy, decisionId, creationIntent.question);
    } else if (policy.policyAction === 'STOP') {
      branchResult = await this.executeStop({ ...input, creationCompletionSignal }, session, current, stateBefore, policy, decisionId, interactionEventType);
    } else if (policy.policyAction === 'CHANGE_EXPERIENCE') {
      branchResult = await this.executeChange(input, session, experience, current, stateBefore, policy, decisionId);
    } else if (policy.policyAction === 'CREATE') {
      branchResult = await this.executeCreate(input, session, experience, current, stateBefore, policy, decisionId);
    } else if (branchOperation) {
      // WHAT_IF 分支操作轮次（D-03 选项 A——四操作最小集
      // SWITCH / ABANDON / RETURN；CREATE 由模拟轮次自动执行）。
      branchResult = await this.executeBranchOperation(
        input,
        session,
        experience,
        current,
        stateBefore,
        policy,
        decisionId,
        branchOperation,
      );
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

    // 语义动作历史登记（创作上下文继承派生用；仅登记已提交动作——
    // 失败分支不改变历史，失败写入不消耗任何版本号）。
    if (branchResult.ok) {
      const history = this.actionHistory.get(input.experienceId) ?? [];
      history.push(policy.semanticAction);
      this.actionHistory.set(input.experienceId, history);
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
      /** 创作完成信号（08 §27 词表经创作路由适配为 STOP——D-05 选项 A）。 */
      creationCompletionSignal?: boolean;
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

    // 创作完成登记（G04；D-05 选项 A——创作完成经 STOP 执行路径在
    // 创作域登记：08 §27 完成信号 / 13 §22 条件 A/B/C；立即结束，
    // 不自动推荐、不自动继续）。
    await this.terminateCreationSession(input.experienceId, input.sessionId, 'completed', input.creationCompletionSignal ? 'creation_completion_signal' : 'user_stop', now, {
      requestId: input.requestId,
      decisionId,
      stateVersion: commit.state.stateVersion,
    });
    // 模拟域失效（D-04 选项 A——分支状态会话内持久，体验
    // 完成即失效；事件为不可变权威事实——C6 §5）。
    this.simulations.invalidate(input.experienceId);

    // S2a F-5（07 §4；D-01/D-05 选项 A）：体验完成登记
    // 短期记忆——跨会话主题 / 意图信号（"最近产生过较高
    // 兴趣"信号 ≠ 偏好——07 §4 措辞纪律）；写入侧执行
    // 07 §7 不默认长期记住清单过滤（临时情绪 / 一次性兴趣 /
    // 一次性任务 / 当前环境 / 单次拒绝 / 推测人格不得写入——
    // 命中即不记录）。记忆事件在 session_ended 之前登记
    // （STOP 后无 continuation 硬边界——P0/CC02 H02——
    // 不受影响）。
    const events: ExperienceEvent[] = [];
    const originExperience = this.experiences.get(input.experienceId);
    const originIntent = originExperience ? this.intents.get(originExperience.intentId) : undefined;
    if (originIntent) {
      const sessionIntents = Array.from(this.intents.values()).filter(
        (candidate) => candidate.sessionId === input.sessionId && candidate.state === 'INTERPRETED',
      );
      const actions = Array.from(new Set(sessionIntents.map((candidate) => candidate.semanticAction)));
      const memoryWrite = this.memories.recordMemory({
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        topic: originIntent.rawInput,
        intentSignal: `turns=${String(sessionIntents.length)};actions=${actions.join('+')}`,
        source: 'session_observation',
        now,
      });
      if (memoryWrite.recorded) {
        events.push(
          await this.recordEvent(MEMORY_RECORDED_EVENT, {
            identity: { user_id: this.userId, session_id: input.sessionId },
            context: {
              experience_id: input.experienceId,
              intent_id: originIntent.intentId,
              state_version: commit.state.stateVersion,
              request_id: input.requestId,
              decision_id: null,
            },
            source: { layer: 'memory', component: 'memory-store' },
            properties: {
              record_id: memoryWrite.record.recordId,
              topic: memoryWrite.record.topic,
              intent_signal: memoryWrite.record.intentSignal,
              lifecycle: memoryWrite.record.lifecycle,
              source: memoryWrite.record.source,
              confidence: memoryWrite.record.confidence,
              reexploration: memoryWrite.reexploration,
            },
          }),
        );
      }
    }

    // Session 收尾：ACTIVE → ENDING → ENDED（§4.3/§4.4；ENDING 非常短）。
    const sessionEnding = transitionSession(session.state, 'SESSION_ENDING');
    const sessionEnded = sessionEnding.ok ? transitionSession('SESSION_ENDING', 'SESSION_ENDED') : sessionEnding;
    if (sessionEnding.ok && sessionEnded.ok) {
      session.state = 'SESSION_ENDED';
      session.endedAt = now;
    }

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
      reasonSecondary: input.creationCompletionSignal
        ? 'CREATION_COMPLETE: completion signal ends the experience via the STOP execution path (08 §27; creation domain registered via creation_completed — D-05 选项 A)'
        : 'STOP terminates the current experience (P-01: STOP always wins)',
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
        context: await this.buildLlmContext(input.rawInput),
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

    // 7.5 创作会话终止（13 §23.6：方向变更后旧运行时必须取消或冻结——
    // 创作历史保留至会话结束，不跨会话持久（D-03 选项 A））。
    await this.terminateCreationSession(input.experienceId, input.sessionId, 'ended', 'superseded_by_change_direction', now, {
      requestId: input.requestId,
      decisionId,
      stateVersion: commit.state.stateVersion,
    });
    // 模拟域失效（D-04 选项 A——方向变更后旧方向模拟上下文
    // 失效；下一方向 WHAT_IF 首轮自动创建新分支——D-03 CREATE）。
    this.simulations.invalidate(input.experienceId);

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
        context: await this.buildLlmContext(input.rawInput),
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

    // 6.5 创作会话建立（G04 完整 Creation 语义；S2A-F2-SEMANTIC-FREEZE-01 §4）。
    // 相邻重复 CREATE 取代在途创作会话（黄金契约 G04-Boundary：
    // 每次均生成完整最小构建，内容逐字节等于 fixture，不省略、不累积）。
    const supersededCreation = this.creations.get(input.experienceId);
    if (supersededCreation?.active) {
      await this.terminateCreationSession(input.experienceId, input.sessionId, 'ended', 'superseded_by_create', now, {
        requestId: input.requestId,
        decisionId,
        stateVersion: commit.state.stateVersion,
      });
      // 模拟域失效（D-04 选项 A——相邻重复 CREATE 取代在途
      // 创作会话，旧方向模拟上下文同步失效——与创作会话纪律一致）。
      this.simulations.invalidate(input.experienceId);
    }
    this.counters.creation += 1;
    const creationId = `creation_${String(this.counters.creation).padStart(4, '0')}`;
    const inherited = inheritCreationContext({
      theme: this.intents.get(experience.intentId)?.rawInput ?? input.rawInput,
      actionHistory: this.actionHistory.get(input.experienceId) ?? [],
      createInput: input.rawInput,
    });
    const creation = buildMinimalCreation({
      creationId,
      experienceId: input.experienceId,
      stateVersion: commit.state.stateVersion,
      inherited,
      at: now,
    });
    this.creations.create({ creation, active: true });
    await this.recordEvent('creation_started', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: commit.state.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'creation-runtime' },
      properties: {
        creation_id: creationId,
        source_experience_id: input.experienceId,
        source_state_version: commit.state.stateVersion,
        theme: creation.concept.theme,
        goal: creation.goal,
        inherited_context: { understood: inherited.understood, attempted: inherited.attempted },
      },
    });
    // 子状态机推进：对象随继承上下文建立于 CONTEXT_INHERIT（CREATE_INTENT
    // 阶段先于对象存在，经 creation_started 权威登记）→ MINIMAL_BUILD
    // （最小可玩物已构建）→ PREVIEW（预览流即将交付）。
    const buildPhase = await this.creations.advancePhase(input.experienceId, 'minimal_built', now);
    await this.recordEvent('creation_phase_transitioned', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: commit.state.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'creation-runtime' },
      properties: buildPhase.ok
        ? { creation_id: creationId, from_phase: buildPhase.from, to_phase: buildPhase.to, trigger: buildPhase.event }
        : { creation_id: creationId, from_phase: buildPhase.from, to_phase: null, trigger: buildPhase.event, rejected: true },
    });
    const previewPhase = await this.creations.advancePhase(input.experienceId, 'previewed', now);
    await this.recordEvent('creation_phase_transitioned', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: commit.state.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'creation-runtime' },
      properties: previewPhase.ok
        ? { creation_id: creationId, from_phase: previewPhase.from, to_phase: previewPhase.to, trigger: previewPhase.event }
        : { creation_id: creationId, from_phase: previewPhase.from, to_phase: null, trigger: previewPhase.event, rejected: true },
    });

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
  // 创作会话终止（G04；D-05 选项 A / 13 §23.6）
  // ---------------------------------------------------------------------

  /**
   * 创作会话终止。
   * - completed：USER_FEEDBACK → COMPLETE（08 §27 完成语义），
   *   creation_completed 事件权威登记；非 USER_FEEDBACK 阶段
   *   （如预览在途）完成迁移非法——按 aborted 终止登记
   *   （完成信号只在反馈轮有效）。
   * - ended：会话生命周期终止（取代 / 方向变更），creation_ended
   *   事件登记；创作历史保留至会话结束（D-03 选项 A——
   *   跨会话持久化属 F-5 Minimal Memory 裁决范围）。
   */
  private async terminateCreationSession(
    experienceId: string,
    sessionId: string,
    mode: 'completed' | 'ended',
    reason: string,
    now: string,
    context: { requestId: string | null; decisionId: string | null; stateVersion: number },
  ): Promise<void> {
    const record = this.creations.get(experienceId);
    if (!record?.active) {
      return;
    }
    if (mode === 'completed') {
      const phaseResult = await this.creations.advancePhase(experienceId, 'completed', now);
      if (phaseResult.ok) {
        await this.recordEvent('creation_phase_transitioned', {
          identity: { user_id: this.userId, session_id: sessionId },
          context: { experience_id: experienceId, intent_id: null, state_version: context.stateVersion, request_id: context.requestId, decision_id: context.decisionId },
          source: { layer: 'runtime', component: 'creation-runtime' },
          properties: {
            creation_id: record.creation.creationId,
            from_phase: phaseResult.from,
            to_phase: phaseResult.to,
            trigger: phaseResult.event,
          },
        });
        await this.recordEvent('creation_completed', {
          identity: { user_id: this.userId, session_id: sessionId },
          context: { experience_id: experienceId, intent_id: null, state_version: context.stateVersion, request_id: context.requestId, decision_id: context.decisionId },
          source: { layer: 'runtime', component: 'creation-runtime' },
          properties: {
            creation_id: record.creation.creationId,
            creation_version: phaseResult.record.creation.version,
            completion_condition: reason,
          },
        });
        // 会话生命周期收尾（CreationRecord 契约：完成 / 取代 / 终止后
        // active 置 false——历史保留至会话结束，D-03 选项 A）。
        await this.creations.end(experienceId, reason);
        return;
      }
      // 完成迁移非法（预览在途等）：按终止登记——完成信号只在反馈轮有效。
    }
    await this.creations.end(experienceId, reason);
    await this.recordEvent('creation_ended', {
      identity: { user_id: this.userId, session_id: sessionId },
      context: { experience_id: experienceId, intent_id: null, state_version: context.stateVersion, request_id: context.requestId, decision_id: context.decisionId },
      source: { layer: 'runtime', component: 'creation-runtime' },
      properties: {
        creation_id: record.creation.creationId,
        creation_version: record.creation.version,
        reason,
      },
    });
  }

  // ---------------------------------------------------------------------
  // 创作修改执行（G04 完整 Creation 语义；USER_FEEDBACK 轮补丁应用）
  // ---------------------------------------------------------------------

  private async executeCreationModify(
    input: {
      experienceId: string;
      sessionId: string;
      requestId: string;
      expectedStateVersion: number;
      expectedCreationVersion?: number;
      signal?: AbortSignal;
      rawInput: string;
    },
    session: SessionRecord,
    experience: ExperienceRecord,
    current: ExperienceState,
    stateBefore: ExperienceView,
    policy: { semanticAction: SemanticAction; policyAction: PolicyAction },
    decisionId: string,
    patch: CreationPatch,
  ): Promise<SubmissionResult> {
    const now = new Date().toISOString();

    // 1. 取消在途 generation（补丁应用与在途生成互斥——同族纪律）。
    await this.interruptGeneration(input.experienceId, 'creation_patch');

    // 2. 拒绝旧候选（修改轮次取代在途候选）。
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
        reason: 'creation_patch',
        old_generation_rejected: true,
      },
    });

    // 3. 创作阶段校验：补丁仅在 USER_FEEDBACK 轮应用（子状态机不变式；
    //    13 §21：修改必须先经 PREVIEW 再由用户判断——补丁必经
    //    PREVIEW，存在未预览补丁不得 COMPLETE）。
    const creationRecord = this.creations.get(input.experienceId);
    if (!creationRecord?.active || creationRecord.creation.phase !== 'USER_FEEDBACK') {
      const phase = creationRecord?.creation.phase ?? 'NONE';
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
        reasonSecondary: `creation patch requires USER_FEEDBACK phase (creation phase: ${phase}; preview must be delivered before modification, 13 §21)`,
        llmUsed: false,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'INVALID_STATE_TRANSITION',
          `creation patch illegal in phase ${phase} (patches apply in USER_FEEDBACK after preview delivery)`,
        ),
      };
    }

    // 4. 前置版本校验（失败写入不消耗版本号——OBL-01 纪律）：
    //    体验状态版本与创作版本均须为客户端声明值，否则拒绝且不写入。
    const expectedCreationVersion = input.expectedCreationVersion ?? creationRecord.creation.version;
    if (current.stateVersion !== input.expectedStateVersion) {
      await this.recordEvent('state_version_conflict', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'state-store' },
        properties: {
          expected_state_version: input.expectedStateVersion,
          current_state_version: current.stateVersion,
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
        reasonSecondary: `expected ${input.expectedStateVersion}, current ${current.stateVersion}`,
        llmUsed: false,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'STATE_VERSION_CONFLICT',
          `stale expected_state_version: expected ${input.expectedStateVersion}, current ${current.stateVersion} (no overwrite, S1-12)`,
          false,
          { expected_state_version: input.expectedStateVersion, current_state_version: current.stateVersion },
        ),
      };
    }
    if (creationRecord.creation.version !== expectedCreationVersion) {
      await this.recordEvent('creation_version_conflict', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'creation-runtime' },
        properties: {
          expected_creation_version: expectedCreationVersion,
          current_creation_version: creationRecord.creation.version,
          creation_id: creationRecord.creation.creationId,
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
        reasonSecondary: `stale creation version: expected ${expectedCreationVersion}, current ${creationRecord.creation.version} (no overwrite, S1-12 同族)`,
        llmUsed: false,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'STATE_VERSION_CONFLICT',
          `stale expected_creation_version: expected ${expectedCreationVersion}, current ${creationRecord.creation.version} (no overwrite, S1-12)`,
          false,
          { expected_creation_version: expectedCreationVersion, current_creation_version: creationRecord.creation.version },
        ),
      };
    }

    // 5. 状态迁移合法性校验（CREATE 触发器：WAITING/ACTIVE/CREATION
    //    → ACTIVE/CREATION；逐步合法校验）。
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
        llmUsed: false,
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

    // 6. 创作补丁提交（版本化 +1；user_changes 权威登记；
    //    08 §11/§12：局部补丁，不重新生成整个作品）。
    const patchCommit = await this.creations.commitPatch(input.experienceId, expectedCreationVersion, patch, now);
    if (!patchCommit.ok) {
      // 前置校验后仅剩并发竞态窗口（如实登记冲突，不修改状态）。
      await this.recordEvent('creation_version_conflict', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'creation-runtime' },
        properties: {
          expected_creation_version: expectedCreationVersion,
          current_creation_version: patchCommit.currentVersion,
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
        reasonSecondary: `stale creation version: expected ${expectedCreationVersion}, current ${patchCommit.currentVersion}`,
        llmUsed: false,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'STATE_VERSION_CONFLICT',
          `stale expected_creation_version: expected ${expectedCreationVersion}, current ${patchCommit.currentVersion} (no overwrite, S1-12)`,
          false,
          { expected_creation_version: expectedCreationVersion, current_creation_version: patchCommit.currentVersion },
        ),
      };
    }
    await this.recordEvent('creation_patch_applied', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'creation-runtime' },
      properties: {
        creation_id: patchCommit.record.creation.creationId,
        creation_version: patchCommit.record.creation.version,
        operation: patch.operation,
        target: patch.target,
        change: patch.change,
        summary: patch.summary,
      },
    });
    if (patch.operation === 'restore') {
      // D-05 选项 A：纠正域恢复事实登记（C6 §14 命名模式
      // <domain>_<past_participle>；C6 §5 事件为不可变权威事实）。
      await this.recordEvent(CORRECTION_RESTORED_EVENT, {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: {
          experience_id: input.experienceId,
          intent_id: experience.intentId,
          state_version: current.stateVersion,
          request_id: input.requestId,
          decision_id: decisionId,
        },
        source: { layer: 'runtime', component: 'correction-runtime' },
        properties: {
          restored_from_version: typeof patch.change.restoreFromVersion === 'number' ? patch.change.restoreFromVersion : null,
          restored_to_version: patchCommit.record.creation.version,
          creation_id: patchCommit.record.creation.creationId,
          semantic_action: 'CORRECTION',
        },
      });
    }
    const patchPhase = await this.creations.advancePhase(input.experienceId, 'patch_applied', now);
    await this.recordEvent('creation_phase_transitioned', {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId, decision_id: decisionId },
      source: { layer: 'runtime', component: 'creation-runtime' },
      properties: patchPhase.ok
        ? { creation_id: patchCommit.record.creation.creationId, from_phase: patchPhase.from, to_phase: patchPhase.to, trigger: patchPhase.event }
        : { creation_id: patchCommit.record.creation.creationId, from_phase: patchPhase.from, to_phase: null, trigger: patchPhase.event, rejected: true },
    });

    // 7. 体验状态版本化提交（迁移结果；expected_state_version 前置已校验）。
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

    // 8. generation epoch 登记 + 迁移事件 + 决策追踪。
    this.counters.generation += 1;
    const generationId = `gen_synthetic_${String(this.counters.generation).padStart(4, '0')}`;
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
        steps: ['CREATE'],
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
      reasonPrimary: patch.operation === 'restore' ? 'creation_restore' : 'explicit_user_direction',
      reasonSecondary: patch.operation === 'restore'
        ? `creation restore committed as monotonic revert patch (creation v${expectedCreationVersion} → v${patchCommit.record.creation.version}; new content = version ${typeof patch.change.restoreFromVersion === 'number' ? patch.change.restoreFromVersion : 'n/a'} content; version pointer never rolls back, S1-12; RESTORE_PREVIOUS_VERSION subtype of CORRECTION, 08 §28 / D-04 选项 A)`
        : `creation modification applied as patch (creation v${expectedCreationVersion} → v${patchCommit.record.creation.version}; local patch, no whole-work regeneration, 08 §11)`,
      llmUsed: false,
      userOverride: true,
      inputEvent: null,
      intentBefore: null,
    });

    // 9. 预览流（合成语料——补丁后创作状态经 getCreation 可查；
    //    流完成经 completeGeneration 推进 PREVIEW → USER_FEEDBACK）。
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
          reason: patch.operation === 'restore' ? 'creation_restore' : 'creation_modification',
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
  // 创作 ASK 执行（08 §16：至多一个澄清问题；创作子状态不推进）
  // ---------------------------------------------------------------------

  private async executeCreationAsk(
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
    question: string,
  ): Promise<SubmissionResult> {
    const now = new Date().toISOString();

    // 1. 取消在途 generation（ASK 轮次与在途生成互斥）。
    await this.interruptGeneration(input.experienceId, 'creation_ask');

    // 2. 状态迁移合法性校验（CREATE 触发器——ASK 轮次是创作域
    //    系统回合：系统产出澄清问题后等待用户判断）。
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
        llmUsed: false,
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

    // 3. 版本化提交（ASK 轮次；创作子状态不推进——澄清问题
    //    不修改作品，08 §16）。
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

    // 4. generation epoch 登记 + 迁移事件 + 决策追踪。
    this.counters.generation += 1;
    const generationId = `gen_synthetic_${String(this.counters.generation).padStart(4, '0')}`;
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
        steps: ['CREATE'],
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
      reasonSecondary: 'creation ASK: at most one clarifying question (08 §16); creation phase and creation version unchanged',
      llmUsed: false,
      userOverride: true,
      inputEvent: null,
      intentBefore: null,
    });

    // 5. 澄清问题流（单块；至多一个问题——08 §16）。
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
        reason: 'creation_ask_clarification',
      },
      state_version: commit.state.stateVersion,
      state: { status: commit.state.status, stage: commit.state.stage, waiting_for_user: commit.state.waitingForUser },
      at: now,
    };
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
        fixtureId: 'creation_ask',
        chunks: [question],
        signal: combinedSignal,
        chunkDelayMs: 0,
        audit: this.auditSink,
      },
      completionCommit: true,
      stateTransitionedEvent: stateTransitions,
    });

    return { ok: true, header, stream, generationId };
  }

  // ---------------------------------------------------------------------
  // WHAT_IF 分支操作执行（S2a F-4；D-03 选项 A——四操作最小集
  // SWITCH / ABANDON / RETURN；CREATE 由模拟轮次自动执行）
  // ---------------------------------------------------------------------

  private async executeBranchOperation(
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
    branchOperation: BranchOperation,
  ): Promise<SubmissionResult> {
    const now = new Date().toISOString();

    // 1. 分支操作前置校验（确定性——拒绝先于任何写入；
    //    失败不消耗版本号——OBL-01 同族纪律）。
    const validation = this.simulations.validateBranchOperation(input.experienceId, branchOperation);
    if (!validation.ok) {
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
        reasonSecondary: validation.reason,
        llmUsed: false,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError('INVALID_STATE_TRANSITION', validation.reason, false),
      };
    }

    // 2. 取消在途 generation（分支操作轮次与在途生成互斥——
    //    P-02 同族纪律）。
    await this.interruptGeneration(input.experienceId, 'simulation_branch_operation');

    // 3. 状态迁移合法性校验（WHAT_IF_SIMULATE 触发器逐步合法
    //    校验——分支操作轮次保持 SIMULATION 阶段，13 §15.3；
    //    体验阶段轴不变——D-02 选项 A）。
    const steps: ExperienceTrigger[] = ['USER_ACTION', 'WHAT_IF_SIMULATE'];
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
          llmUsed: false,
          userOverride: true,
          inputEvent: null,
          intentBefore: null,
        });
        return {
          ok: false,
          error: runtimeError(
            'INVALID_STATE_TRANSITION',
            `step ${trigger} illegal from ${view.status}/${view.stage} (branch operation rounds keep the SIMULATION stage, 13 §15.3)`,
            true,
          ),
        };
      }
      view = step.next;
    }

    // 4. 版本化提交（分支操作轮次——阶段保持 SIMULATION，
    //    lastSemanticAction=WHAT_IF；每次合法提交恰好 +1，S1-12）。
    const commit = await this.store.commit(input.experienceId, input.expectedStateVersion, (state) => ({
      ...state,
      status: view.status,
      stage: view.stage,
      waitingForUser: false,
      lastSemanticAction: 'WHAT_IF',
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
          trigger: 'WHAT_IF',
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

    // 5. 分支操作应用（版本化提交后——D-02/D-03 选项 A 形态；
    //    分支模拟结果默认不回流为主线结论——D-02 选项 A 推导）。
    const applied = this.simulations.applyBranchOperation(input.experienceId, branchOperation, now);

    // 6. generation epoch 登记 + 迁移事件 + 决策追踪
    //    （确定性系统回合——llm_used=false）。
    this.counters.generation += 1;
    const generationId = `gen_synthetic_${String(this.counters.generation).padStart(4, '0')}`;
    this.activeGenerations.set(input.experienceId, generationId);
    const controller = new AbortController();
    this.generationControllers.set(input.experienceId, controller);

    await this.recordEvent('state_transitioned', {
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
      reasonPrimary: 'explicit_user_direction',
      reasonSecondary: `WHAT_IF branch operation ${branchOperation.operation}: ${applied.summary}`,
      llmUsed: false,
      userOverride: true,
      inputEvent: null,
      intentBefore: null,
    });

    // 7. 分支操作结果流（单块确定性内容——无 LLM 提案，
    //    同创作 ASK 轮纪律）。
    const operationLabel =
      branchOperation.operation === 'SWITCH'
        ? '切换激活分支'
        : branchOperation.operation === 'ABANDON'
          ? '放弃分支'
          : '返回主线模拟上下文';
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
        reason: 'simulation_branch_operation',
      },
      state_version: commit.state.stateVersion,
      state: { status: commit.state.status, stage: commit.state.stage, waiting_for_user: commit.state.waitingForUser },
      at: now,
    };
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
        fixtureId: 'simulation_branch_operation',
        chunks: [`分支操作（确定性规则词表，D-03 选项 A）：${operationLabel}——${applied.summary}（流式结束）`],
        signal: combinedSignal,
        chunkDelayMs: 0,
        audit: this.auditSink,
      },
      completionCommit: true,
      stateTransitionedEvent: undefined,
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

    // 纠正目标定位（D-02 选项 A：确定性规则派生——指代词表 +
    // 默认当前候选 / 创作分量映射；登记于纠正域事件 properties
    // 与决策追踪）。
    const correctionCreation = this.creations.get(input.experienceId);
    const correctionTarget = deriveCorrectionTarget(
      input.rawInput,
      correctionCreation?.active ? correctionCreation.creation : undefined,
    );

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
        context: await this.buildGenerationContext(input),
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

    // 6.1 纠正域事实登记（D-05 选项 A；C6 §5 事件为不可变权威
    // 事实——纠正历史经事件日志权威可追溯；登记范围：非创作域 +
    // 创作会话内未命中创作修改族的通用纠正）。
    await this.recordEvent(CORRECTION_APPLIED_EVENT, {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: {
        experience_id: input.experienceId,
        intent_id: experience.intentId,
        state_version: commit.state.stateVersion,
        request_id: input.requestId,
        decision_id: decisionId,
      },
      source: { layer: 'runtime', component: 'correction-runtime' },
      properties: {
        correction_target: correctionTarget,
        correction_summary: input.rawInput,
        corrected_candidate_id: proposal.proposal_id,
        semantic_action: 'CORRECTION',
      },
    });

    // 6.5 创作域重评估（冻结文本 §4 变更 3：CORRECTION 在 CREATION 阶段
    // 保持阶段且重评估创作子状态，不推进子状态机——完整 G07 操作语义属 F-3）。
    if (correctionCreation?.active) {
      await this.recordEvent('creation_reevaluated', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: commit.state.stateVersion, request_id: input.requestId, decision_id: decisionId },
        source: { layer: 'runtime', component: 'creation-runtime' },
        properties: {
          creation_id: correctionCreation.creation.creationId,
          creation_version: correctionCreation.creation.version,
          phase: correctionCreation.creation.phase,
          detail: 'correction re-evaluates the active creation; creation phase unchanged (no sub-state advancement)',
        },
      });
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
      reasonPrimary: isRestoreIntent(input.rawInput) ? 'restore_previous_version' : 'reassess',
      reasonSecondary: isRestoreIntent(input.rawInput)
        ? `restore intent registered and the previous candidate reassessed as the corrected candidate (non-creation domain carries no versioned rollback; correction target: ${correctionTarget.kind}; RESTORE_PREVIOUS_VERSION as CORRECTION subtype, D-04 选项 A / 08 §28)`
        : `CORRECTION cancels in-flight generation, removes the invalid inference, preserves valid context (session/intent/prior events intact), and reassesses the corrected candidate (G07; PD-21 closure slice; correction target: ${correctionTarget.kind})`,
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
          reason: isRestoreIntent(input.rawInput) ? 'restore_previous_version' : 'reassess',
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
        context: await this.buildGenerationContext(input),
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

    // WHAT_IF 模拟结果登记（policy_v1.4.0 变更 1；D-05 选项 A）：
    // 每轮模拟结果经模拟域事件登记——四元分离（事实 / 推断 /
    // 假设 / 模拟结果——E8-G2-CC07），模拟结果不得表现为事实
    // （事件 properties 互斥注记 separation_invariant + 语料分离
    // 格式双重保证）；模拟历史会话内持久（D-04 选项 A）；
    // WHAT_IF 首轮自动创建分支记录（D-03 选项 A CREATE——
    // 无激活分支上下文时自动开启新分支）。
    if (policy.policyAction === 'SIMULATE') {
      const recorded = this.simulations.recordRound({
        experienceId: input.experienceId,
        sessionId: input.sessionId,
        sourceInput: input.rawInput,
        separation: deriveSimulationSeparation(proposal.content),
        stateVersion: commit.state.stateVersion,
        proposalId: proposal.proposal_id,
        generationId,
        now,
      });
      await this.recordEvent(SIMULATION_RECORDED_EVENT, {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: commit.state.stateVersion, request_id: input.requestId, decision_id: decisionId },
        source: { layer: 'runtime', component: 'simulation-runtime' },
        properties: {
          simulation_id: recorded.round.roundId,
          round: recorded.round.round,
          branch_id: recorded.round.branchId,
          branch_created: recorded.branchCreated,
          source_input: recorded.round.sourceInput,
          fact: recorded.round.separation.fact,
          inference: recorded.round.separation.inference,
          hypothesis: recorded.round.separation.hypothesis,
          simulation: recorded.round.separation.simulation,
          separation_invariant: 'simulation_result_is_not_fact',
          proposal_id: proposal.proposal_id,
          generation_id: generationId,
        },
      });
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
    // 创作会话：PREVIEW → USER_FEEDBACK（流完成 = 预览已交付，用户获得
    // 判断权——08 §18/§19）。非创作会话或非 PREVIEW 阶段（如 ASK 轮次
    // 保持 USER_FEEDBACK）迁移非法——拒绝写入，不改变创作状态。
    const creationPhase = await this.creations.advancePhase(experienceId, 'feedback_started', new Date().toISOString());
    if (creationPhase.ok) {
      await this.recordEvent('creation_phase_transitioned', {
        identity: { user_id: this.userId, session_id: this.experiences.get(experienceId)?.sessionId ?? '' },
        context: { experience_id: experienceId, intent_id: null, state_version: commit.state.stateVersion, request_id: null, decision_id: null },
        source: { layer: 'runtime', component: 'creation-runtime' },
        properties: {
          creation_id: creationPhase.record.creation.creationId,
          from_phase: creationPhase.from,
          to_phase: creationPhase.to,
          trigger: creationPhase.event,
        },
      });
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
