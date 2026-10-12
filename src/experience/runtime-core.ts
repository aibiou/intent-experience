/**
 * 体验运行时核心（RuntimeCoreBase）——S6 拆分第一阶段：
 * 状态存储 / 依赖注入 / 记忆与上下文辅助 / 低层事件与追踪辅助。
 * 由 runtime-generation.ts 与 runtime.ts 继承，成员以 protected 暴露。
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
import { recognizeGenerationIntent } from './generation-intent';
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
  loadSessionSnapshot,
  saveSessionSnapshot,
  type SessionSnapshot,
} from './session-snapshot';
import {
  CORRECTION_APPLIED_EVENT,
  CORRECTION_RESTORED_EVENT,
  MEMORY_CORRECTED_EVENT,
  MEMORY_EXPIRED_EVENT,
  MEMORY_RECORDED_EVENT,
  MEMORY_WITHDRAWN_EVENT,
  SIMULATION_ADOPTED_EVENT,
  SIMULATION_RECORDED_EVENT,
  type EventSink,
  type ExperienceEvent,
  EventRecorder,
} from './events';
import {
  nextDecisionId,
  type DecisionTraceSink,
} from './decision-trace';
import { SyntheticLlmGateway, nextProviderProposalId, type CreationLlmSummary, type LlmGateway, type LlmProposal, type LlmRequest } from './llm-gateway';
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
  type LongTermMemoryExpression,
  type MemoryOperationResult,
  type MemoryRecord,
  type MemorySignal,
  type MemorySnapshot,
} from './memory';
import { deriveCorrectionTarget, isRestoreIntent } from './correction';
import type { AuditSink } from './audit';

import {
  errorCodeStatus,
  runtimeError,
  type RuntimeErrorCode,
  type RuntimeError,
} from './runtime-errors';
import {
  INTERACTION_EVENT_BY_SEMANTIC_ACTION,
  type GenerationRecord,
  type IntentRecord,
  type ExperienceRecord,
  type SubmissionHeader,
  type StateUpdatedEvent,
  type RuntimeStreamEvent,
  type SubmissionResult,
  type RuntimeOptions,
} from './runtime-contracts';
export { errorCodeStatus, runtimeError } from './runtime-errors';
export type { RuntimeErrorCode, RuntimeError } from './runtime-errors';
export type { IntentRecord, ExperienceRecord, SubmissionHeader, StateUpdatedEvent, RuntimeStreamEvent, SubmissionResult, RuntimeOptions, GenerationRecord } from './runtime-contracts';
export { INTERACTION_EVENT_BY_SEMANTIC_ACTION } from './runtime-contracts';

/**
 * 体验运行时核心基类——持有全运行时共享状态与低层辅助，
 * execute* 执行语义与生成链路分别位于子类（runtime-generation.ts）
 * 与门面（runtime.ts）。单进程单例（HTTP 形态）。
 */
export class RuntimeCoreBase {
  protected readonly sessions = new Map<string, SessionRecord>();
  protected readonly intents = new Map<string, IntentRecord>();
  protected readonly experiences = new Map<string, ExperienceRecord>();
  protected readonly store = new ExperienceStateStore();
  /** 创作状态存储（G04 完整 Creation 语义；S2A-F2-SEMANTIC-FREEZE-01 §4/D-03 选项 A——会话内持久）。 */
  protected readonly creations = new CreationStore();
  protected readonly simulations = new SimulationStore();
  /** 记忆记录存储（S2a F-5；轴外持久对象——D-01 选项 A；跨会话短期记忆）。 */
  protected readonly memories = new MemoryStore();
  /** 语义动作历史（创作上下文继承派生用；08 §6 五项。仅登记已提交动作）。 */
  protected readonly actionHistory = new Map<string, SemanticAction[]>();
  /** 上一完成轮响应内容（S4 D-1 选项 A——REPEAT 呈现层重放数据源；
   * 内存映射——运行时为进程内单例（server-runtime），与 sessions /
   * experiences / store 同生命周期；仅内容轮次（chunk 数 > 0）登记，
   * 空轮次（STOP / CONTINUE 等）不覆盖上一内容轮记录）。 */
  protected readonly lastResponseByExperience = new Map<
    string,
    { chunks: string[]; fixtureId: string; at: string }
  >();
  protected readonly recorder: EventRecorder;
  protected readonly traceSink: DecisionTraceSink;
  protected readonly auditSink: AuditSink;
  protected readonly gateway: LlmGateway;
  protected readonly userId: string;
  /** 请求幂等（C6 §27 / API 契约 §2.4）：request_id 去重，重复提交拒绝。 */
  protected readonly requestIds = new Set<string>();
  /** 当前生效 generation（每体验单写者视角的 generation epoch）。 */
  protected readonly activeGenerations = new Map<string, string>();
  protected readonly generationControllers = new Map<string, AbortController>();
  /** 对话转录（连续性——提供方上下文携带近几轮用户/助手
   * 内容，指代（「对应的」「它」）可被模型理解；会话内存活，
   * 上限 12 轮滚动淘汰）。 */
  protected readonly transcripts = new Map<string, Array<{ role: 'user' | 'assistant'; text: string }>>();
  /** 已发出 generation_cancelled 的 generation（事件不重复登记）。 */
  protected readonly cancellationMarked = new Set<string>();
  protected counters = { intent: 0, experience: 0, candidate: 0, generation: 0, creation: 0 };

  constructor(options: RuntimeOptions = {}) {
    this.userId = options.userId ?? 'user_synthetic_001';
    this.recorder = new EventRecorder(options.eventSink ?? (() => undefined));
    this.traceSink = options.decisionTraceSink ?? (() => undefined);
    this.auditSink = options.auditSink ?? (() => undefined);
    this.gateway = options.gateway ?? new SyntheticLlmGateway(allFixtures());
  }

  /**
   * 执行记忆域操作（用户显式撤回 / 纠正）。
   * 目标派生：当前会话活跃体验的探索主题（07 §13"别再给我这个"
   * 的"这个" = 当前探索主题），否则最近更新的活跃记录；
   * 无目标 → 幂等空操作（操作已识别、无留痕对象）。
   */
  protected async executeMemoryOperation(input: {
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

  // ---------------------------------------------------------------------
  // S3a 长期记忆显式表达写入（D-1 选项 A——S3A-SEMANTIC-FREEZE-01
  // v1.0.0 §1.2；07 §5 A/B 类门槛——经 Runtime 单一写入者）
  // ---------------------------------------------------------------------

  /**
   * 执行长期记忆显式表达写入（A/B 类——07 §5）。
   * 写入门槛由存储层强制（memoryClass='long_term' 仅
   * source='explicit' 可写入——confidence=1.0）；写入侧
   * 执行 07 §7 不默认长期记住清单过滤（命中 → 不记录）；
   * 长期记忆记录同生命周期状态机（用户主权不因记忆类别
   * 而削弱——WITHDRAW / CORRECT 复用既有路径）。
   */
  protected async executeLongTermMemoryWrite(input: {
    sessionId: string;
    expression: LongTermMemoryExpression;
    rawInput: string;
    requestId: string;
    intentId: string;
  }): Promise<{ result: MemoryOperationResult; events: ExperienceEvent[] }> {
    const now = new Date().toISOString();
    const session = this.sessions.get(input.sessionId);
    const write = this.memories.recordMemory({
      sessionId: input.sessionId,
      experienceId: session?.experienceId ?? null,
      topic: input.expression.topic,
      intentSignal: input.expression.intentSignal,
      source: 'explicit',
      memoryClass: 'long_term',
      now,
    });
    if (!write.recorded) {
      return {
        result: {
          kind: 'record_long_term',
          executed: false,
          reason: write.reason,
          recordId: null,
          lifecycle: null,
          memoryClass: null,
        },
        events: [],
      };
    }
    const event = await this.recordEvent(MEMORY_RECORDED_EVENT, {
      identity: { user_id: this.userId, session_id: input.sessionId },
      context: {
        experience_id: session?.experienceId ?? null,
        intent_id: input.intentId,
        state_version: null,
        request_id: input.requestId,
        decision_id: null,
      },
      source: { layer: 'memory', component: 'memory-store' },
      properties: {
        record_id: write.record.recordId,
        topic: write.record.topic,
        intent_signal: write.record.intentSignal,
        lifecycle: write.record.lifecycle,
        source: write.record.source,
        confidence: write.record.confidence,
        memory_class: write.record.memoryClass,
        recognition_path: input.expression.kind,
      },
    });
    return {
      result: {
        kind: 'record_long_term',
        executed: true,
        reason: null,
        recordId: write.record.recordId,
        lifecycle: write.record.lifecycle,
        memoryClass: write.record.memoryClass,
      },
      events: [event],
    };
  }

  /**
   * L5 记忆信号注入（D-03 选项 A——07 §21 优先级链；07 §20
   * 检索纪律：以当前意图为检索键，只取相关记录）。
   * 到期衰减在每次生成请求前应用（懒到期——memory_expired
   * 事件经 Runtime 事件管道留痕）。
   */
  protected async buildLlmContext(rawInput: string, experienceId?: string): Promise<{ raw_input: string; memory_signals: MemorySignal[]; history?: Array<{ role: 'user' | 'assistant'; text: string }> }> {
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
      // 连续性（实测缺口——「对应的」「它」类指代无从理解）：
      // 近几轮对话转录随上下文携带（纯文本、确定性拼接；
      // 无转录的路径缺省省略）。
      ...(experienceId !== undefined
        ? { history: this.transcripts.get(experienceId)?.slice(-6) ?? [] }
        : {}),
      // 多模态生成编排感知（2026-10-11——实测文本模型在生成
      // 轮次宣称「我无法生成图像」，与下方的实时产物自相矛盾）：
      // 生成意图命中时向 LLM 声明编排事实，正文自然承接。
      ...(recognizeGenerationIntent(rawInput) !== null
        ? {
            generation_note:
              '用户的多模态生成请求已由系统编排：对应模态的生成模型正在实时生成产物，将自动展示在本条回答下方。请自然承接用户的创作请求，不要声明你无法生成图片、视频或语音。回答的第一句请直接描述生成的目标画面（主体 + 场景 + 视觉风格，一句完整的话）——它会作为提示词提供给图像 / 视频模型，请让画面主体明确、可供绘制；画面细节从第二句起展开。',
          }
        : // 死胡同引导（实测缺口——「生产一个图片猫」这类
          // 未命中词表的生成表达曾被模型引向 Midjourney 等
          // 外部工具，与平台能力相悖）：疑似生成表达但未
          // 识别时，给出可命中的说法而非否认平台能力。
          /(?:图|图片|图像|插画|头像|壁纸|封面|视频|动画|短片|语音|音频|音乐)/.test(rawInput)
            ? {
                generation_note:
                  '用户可能希望生成媒体内容，但本条输入未命中生成识别。本平台具备图像 / 视频 / 语音生成能力——请顺着用户意图回应，并引导其用可识别的说法触发：图像「画一张…」或「生成一张…的图片」，视频「做一段…视频」，朗读「读出来」。不要声称本平台无法生成媒体，也不要推荐外部工具。',
              }
            : {}),
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
  protected async buildGenerationContext(input: {
    rawInput: string;
    experienceId: string;
  }): Promise<{
    raw_input: string;
    memory_signals: MemorySignal[];
    search_context: SearchContextResult;
  }> {
    const base = await this.buildLlmContext(input.rawInput, input.experienceId);
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

    // 会话快照（跨重启续讲）：体验建立即落盘。
    this.snapshotSession(experienceId);
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
    this.ensureRestored(experienceId);
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


  protected async recordEvent(
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

  protected async writeDecisionTrace(input: {
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

  /**
   * 会话快照（跨重启续讲——PD-07 附加层）：体验建立后与每轮
   * 完成后落盘续讲最小集（状态含版本号 + 转录 + 主题）。
   * 失败静默——续讲降级为既有死会话指引，不影响主流程。
   */
  protected snapshotSession(experienceId: string): void {
    try {
      const experience = this.experiences.get(experienceId);
      const state = this.store.get(experienceId);
      if (!experience || !state) return;
      const intent = this.intents.get(experience.intentId);
      const snapshot: SessionSnapshot = {
        experienceId,
        sessionId: experience.sessionId,
        intentId: experience.intentId,
        candidateId: experience.candidateId,
        topic: intent?.rawInput ?? '',
        state,
        transcript: this.transcripts.get(experienceId) ?? [],
        savedAt: new Date().toISOString(),
      };
      void saveSessionSnapshot(snapshot);
    } catch {
      // 快照失败静默
    }
  }

  /** 内存无此体验时按快照重建最小续讲面（会话 / 意图 / 体验
   * 记录 + 状态含版本号 + 转录）。已存在则空操作。 */
  protected ensureRestored(experienceId: string): void {
    if (this.store.get(experienceId) !== undefined) return;
    const snapshot = loadSessionSnapshot(experienceId);
    if (!snapshot) return;
    try {
      const session = this.sessions.get(snapshot.sessionId);
      if (session) {
        session.state = 'SESSION_ACTIVE';
        session.intentId = snapshot.intentId;
        session.experienceId = snapshot.experienceId;
        session.endedAt = null;
      } else {
        this.sessions.set(snapshot.sessionId, {
          sessionId: snapshot.sessionId,
          state: 'SESSION_ACTIVE',
          intentId: snapshot.intentId,
          experienceId: snapshot.experienceId,
          createdAt: snapshot.savedAt,
          endedAt: null,
        });
      }
      if (snapshot.intentId !== null) {
        this.intents.set(snapshot.intentId, {
          intentId: snapshot.intentId,
          sessionId: snapshot.sessionId,
          rawInput: snapshot.topic,
          semanticAction: 'DIRECT_ANSWER',
          state: 'CREATED',
          createdAt: snapshot.savedAt,
        });
      }
      this.experiences.set(snapshot.experienceId, {
        experienceId: snapshot.experienceId,
        sessionId: snapshot.sessionId,
        intentId: snapshot.intentId ?? '',
        candidateId: snapshot.candidateId,
      });
      this.store.restore(snapshot.experienceId, snapshot.state);
      this.transcripts.set(snapshot.experienceId, snapshot.transcript ?? []);
    } catch {
      // 恢复失败静默——走既有 unknown experience 指引
    }
  }
}
