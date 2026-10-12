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
 * 体验运行时（S1-09 执行器 + S1-01/03/04/05/07/08/10/11/12 组件）。
 * 单进程单例（HTTP 形态）；进程内形态由证据执行器按案例构造。
 */
import { RuntimeActions } from './runtime-actions';

export class ExperienceRuntime extends RuntimeActions {
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
    // 生成意图确定性路由（产品负责人指令 2026-10-10）：
    // 分类未命中（UNKNOWN）但生成意图规则命中时，
    // 意图确定性路由为 CREATE（创作族——「画 / 生成 /
    // 制作」是创作表达；不发明语义动作，policy
    // 词汇表不变；与 WHAT_IF 首轮自动 CREATE 同一
    // 先例）。分类命中时生成意图不干预（对话回应
    // 照常，生成编排由暴露层在流末触发）。
    const generationRouted =
      classification.semanticAction === 'UNKNOWN' &&
      recognizeGenerationIntent(input.rawInput) !== null;
    this.counters.intent += 1;
    const intentId = `intent_synthetic_${String(this.counters.intent).padStart(4, '0')}`;
    const now = new Date().toISOString();
    // 无法归类兜底（2026-10-11 产品可用性）：分类未命中且非生成
    // 意图 → DIRECT_ANSWER（自由文本交 LLM 会话承接，不再
    // escalate 死胡同——此前悬置建议，实测反馈后落地）。
    const resolvedSemanticAction =
      classification.semanticAction === 'UNKNOWN' && !generationRouted
        ? 'DIRECT_ANSWER'
        : generationRouted
          ? 'CREATE'
          : classification.semanticAction;
    const intent: IntentRecord = {
      intentId,
      sessionId: input.sessionId,
      rawInput: input.rawInput,
      semanticAction: resolvedSemanticAction,
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
      properties: { semantic_action: intent.semanticAction },
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

    // S3a（D-1 选项 A；S3A-SEMANTIC-FREEZE-01 v1.0.0
    // §1.2）：UNKNOWN + 长期记忆显式表达标记（A/B 类
    // ——确定性规则词表识别，仅认领会成为 UNKNOWN 的
    // 输入）→ 长期记忆经 Runtime 单一写入者执行并留痕
    // （memory_recorded——properties 增 memory_class /
    // source / confidence——C6 §14 属性扩展不新增事件
    // 名）；不新增语义动作（PD-23 §5——长期记忆识别
    // 不是体验语义动作，分类优先级层不变）。
    if (classification.semanticAction === 'UNKNOWN' && classification.longTermMemory) {
      const longTermWrite = await this.executeLongTermMemoryWrite({
        sessionId: input.sessionId,
        expression: classification.longTermMemory,
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
        events: [received, parsed, ...longTermWrite.events],
        memoryOperation: longTermWrite.result,
      };
    }

    return {
      ok: true,
      intent,
      semanticAction: intent.semanticAction,
      confidence: 1,
      // 无法归类兜底（2026-10-11 产品可用性——实测「美女的展示」
      // 等名词短语表达被升级拒绝 HTTP 400 死胡同）：不再 escalate，
      // 路由 DIRECT_ANSWER 交 LLM 会话承接（自由文本兜底问答——
      // 此前悬置建议，产品负责人实测反馈后落地）。语义动作域
      // 不变（DIRECT_ANSWER 在冻结集合内）。
      action: 'start_experience',
      events: [received, parsed],
    };
  }

  // ---------------------------------------------------------------------
  // S2a F-5 记忆域操作（D-05 选项 A——用户动作路由经 Runtime 单一写入者）
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
    // --- 语义动作：分类权威，客户端声明仅作完整性校验 ------------------
    // （分类为纯函数——提前至会话绑定校验前计算，供跨会话
    // 分支操作路径判定（S3a D-2 选项 A）；确定性分类
    // 恒定（GS-01），后续不重复计算。）
    const classification = classifyInput(input.rawInput);
    // S3a（D-2 选项 A；S3B-SEMANTIC-FREEZE-01 v1.0.0
    // §1.4）——跨会话分支操作识别（纯分类，无状态
    // 变更）：WHAT_IF 分类输入经分支操作词表识别
    // （确定性规则词表——与进程内识别完全一致；词表
    // 优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH）。
    // 跨会话操作仅在三条件同时满足时放行（① 输入
    // 会话 SESSION_ACTIVE——上方既有校验；② 宿主会话
    // 已 SESSION_ENDED——不干扰在途会话；③ 目标分支
    // 存活——executeBranchOperation 内 validateBranchOperation
    // 契约不变）。放宽范围仅限分支操作路径——内容轮次
    // （通用 SIMULATE 模拟轮 / 创作 / 纠正 / STOP）
    // 保持严格会话绑定（不变式）。
    const crossSessionBranchOperation =
      classification.semanticAction === 'WHAT_IF'
        ? interpretBranchOperation(input.rawInput)
        : null;
    const isCrossSession = experience.sessionId !== input.sessionId;
    if (isCrossSession) {
      if (!crossSessionBranchOperation) {
        return {
          ok: false,
          error: runtimeError('INVALID_REQUEST', 'experience/session mismatch'),
        };
      }
      const ownerSession = this.sessions.get(experience.sessionId);
      if (!ownerSession || ownerSession.state !== 'SESSION_ENDED') {
        return {
          ok: false,
          error: runtimeError(
            'INVALID_STATE_TRANSITION',
            `cross-session branch operation illegal: owning session ${experience.sessionId} is not ended (cross-session operation requires the owning session to have ended - S3B-SEMANTIC-FREEZE-01)`,
          ),
        };
      }
    }
    let current = this.store.get(input.experienceId);
    if (!current) {
      return { ok: false, error: runtimeError('INTERNAL_ERROR', 'experience state missing') };
    }
    if (current.status === 'COMPLETED' && !crossSessionBranchOperation) {
      return {
        ok: false,
        error: runtimeError('INVALID_STATE_TRANSITION', 'experience COMPLETED is terminal; start a new session'),
      };
    }

    // --- 生成中断归位（停止 / 断线后的 ACTIVE 悬挂恢复——
    //     2026-10-11 停止能力引入时修复的既有死锁）-------------
    // 客户端停止 / 断开使在途 generation 死亡（controller abort），
    // 但取消不提交版本（冻结纪律）——状态悬挂在提交时的 ACTIVE。
    // 冻结状态机从 ACTIVE mid-generation 只接受 STOP/CHANGE：
    // 继续对话类动作被永久拒绝（该 generation 不会再完成）。
    // 检测「ACTIVE 且在途 generation 已死」时提交一次归位版本
    // （ACTIVE → WAITING，等待用户），后续动作从 WAITING 正常
    // 评估；活跃 generation 不受影响（仍按 §7 拒绝新动作）。
    if (current.status === 'ACTIVE' && this.isGenerationDead(input.experienceId)) {
      const rollback = await this.store.commit(input.experienceId, current.stateVersion, (state) => ({
        ...state,
        status: 'WAITING' as const,
        waitingForUser: true,
        updatedAt: new Date().toISOString(),
      }));
      if (rollback.ok) {
        input.expectedStateVersion = rollback.state.stateVersion;
        current = rollback.state;
        await this.recordEvent('generation_interrupted_rollback', {
          identity: { user_id: this.userId, session_id: input.sessionId },
          context: { experience_id: input.experienceId, intent_id: null, state_version: rollback.state.stateVersion, request_id: input.requestId, decision_id: null },
          source: { layer: 'runtime', component: 'state-store' },
          properties: { reason: 'in-flight generation dead (client stop / disconnect); ACTIVE dangling normalized to WAITING' },
        });
      } else {
        // 并发归位（另一提交先完成归位）——以最新状态继续评估。
        const latest = this.store.get(input.experienceId);
        if (latest) {
          current = latest;
          input.expectedStateVersion = latest.stateVersion;
        }
      }
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
    // 创作域方向性补丁（14 §8）：SIMPLIFY / REFRAME 恒为创作
    // 操作（无活跃创作对象时升级拒绝——C3 纪律不变）；DEEPEN
    // 双语义——有活跃创作对象时深化作品（补丁），探索阶段不再
    // 升级拒绝（2026-10-11 按钮审计实测：动作坞在探索阶段提供
    // 「深入一点」，硬升级导致必死按钮）——落回解释层内容生成
    // （S1 §14 冻结映射 DEEPEN → ANSWER，按语义动作指令推进）。
    if (
      (classification.semanticAction === 'SIMPLIFY' || classification.semanticAction === 'REFRAME') &&
      !(activeCreation?.active && activeCreation.creation.phase !== 'COMPLETE')
    ) {
      return {
        ok: false,
        error: runtimeError(
          'INVALID_ACTION',
          `directional operation ${classification.semanticAction} requires an active creation session (escalated per policy_v2.0.0 变更 5; C3 upgrade discipline)`,
        ),
      };
    }
    if (
      (classification.semanticAction === 'SIMPLIFY' ||
        classification.semanticAction === 'REFRAME' ||
        classification.semanticAction === 'DEEPEN') &&
      activeCreation?.active &&
      activeCreation.creation.phase !== 'COMPLETE'
    ) {
      creationIntent = {
        kind: 'modification',
        patch: buildDirectionalPatch(
          classification.semanticAction.toLowerCase() as 'deepen' | 'simplify' | 'reframe',
          input.rawInput,
          activeCreation.creation,
        ),
      };
    }
    // 生成意图确定性路由（产品负责人指令 2026-10-10）：
    // 分类未命中（UNKNOWN）但生成意图规则命中时按
    // 意图类型路由——呈现形式类（useContext，如
    // 「用视频展现」）路由为 REPEAT（呈现层重放上一轮
    // 回答——重放内容即生成提示词的内容原料）；带
    // 创作主题的（如「做一段深海雾气的视频」）路由为
    // CREATE（与 resolveIntent 同一规则——提交层与解析层
    // 一致；客户端不能注入策略动作的守卫不变：路由由
    // 确定性规则完成，声明与分类结果经同一规则收敛为
    // 一致）。
    if (semanticAction === 'UNKNOWN') {
      const generationIntent = recognizeGenerationIntent(input.rawInput);
      if (generationIntent !== null) {
        semanticAction = generationIntent.useContext === true ? 'REPEAT' : 'CREATE';
      } else {
        // 无法归类兜底（2026-10-11 产品可用性——与 resolveIntent
        // 同一规则）：自由文本交 LLM 会话承接，不再升级拒绝。
        semanticAction = 'DIRECT_ANSWER';
      }
    } else if (
      semanticAction === 'CHANGE_DIRECTION' &&
      recognizeGenerationIntent(input.rawInput) !== null
    ) {
      // 再生成特例（2026-10-11——与暴露层同一规则）：
      // 「换一张图片…」分类命中 CHANGE_DIRECTION 但生成
      // 意图命中 → CREATE（对产物的再生成，非方向变更；
      // CHANGE_DIRECTION 在 WAITING/CREATION 阶段非法）。
      semanticAction = 'CREATE';
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

    // --- WHAT_IF 分支操作路由（D-03 选项 A；policy_v1.4.0 变更 2；
    //     ADOPT_BRANCH 经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A
    //     裁决补写生效——policy_v2.1.0 变更 1） ---
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
      // SWITCH / ABANDON / RETURN + S2-BRANCH-REFLOW-DEF-01
      // v1.0.0 选项 A 第五操作 ADOPT_BRANCH；CREATE 由模拟
      // 轮次自动执行）。
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
    } else if (policy.policyAction === 'CONTINUE' || policy.policyAction === 'REPEAT') {
      // S4（D-1 选项 A；S4A-SEMANTIC-FREEZE-01 v1.0.0 §1 D-1）：
      // CONTINUE 幂等确认轮次 / REPEAT 呈现层重放轮次——确定性
      // 系统回合（llm_used=false）；state_version 不变（不登记
      // 状态变更事件——纯呈现 / 确认语义）。
      branchResult =
        policy.policyAction === 'CONTINUE'
          ? await this.executeContinue(input, session, experience, current, stateBefore, policy, decisionId)
          : await this.executeRepeat(input, session, experience, current, stateBefore, policy, decisionId);
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
      // 连续性转录：用户输入入转录（助手侧于流末由
      // captureLastResponse 登记——空轮次不登记）。
      const transcript = this.transcripts.get(input.experienceId) ?? [];
      transcript.push({ role: 'user', text: input.rawInput.slice(0, 500) });
      this.transcripts.set(input.experienceId, transcript.slice(-12));
      // 快照不在此处落盘——提交时点 status=ACTIVE（生成中），
      // 恢复后会被状态机视为在途而拒绝新轮次；快照统一在
      // 流末（captureLastResponse）以完成后状态落盘。
      // S4（D-1 选项 A；S4A-SEMANTIC-FREEZE-01 v1.0.0 §1 D-1）——
      // 上一完成轮响应内容登记（REPEAT 呈现层重放数据源）：
      // 包装异步生成器——客户端事件原样转发，chunk 事件内容经
      // 内部登记（不改变客户端流；仅内容轮次登记——空轮次
      // 不覆盖上一内容轮记录）。
      branchResult = {
        ...branchResult,
        stream: this.captureLastResponse(input.experienceId, branchResult.stream),
      };
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

  /**
   * 体验主题（只读——2026-10-11 多模态编排用）：体验首轮的
   * 用户原始输入（如「猫为什么会发出呼噜声」）。呈现形式类
   * 生成（「用有趣的图像展示」）以此为视觉主题构建提示词
   * ——文生图模型消费短视觉主题而非叙述长文（实测 400 字
   * 叙述被提供方忽略并回落人物先验）。
   */
  getExperienceTopic(experienceId: string): string | null {
    this.ensureRestored(experienceId);
    const experience = this.experiences.get(experienceId);
    if (!experience) return null;
    const intent = this.intents.get(experience.intentId);
    return intent?.rawInput ?? null;
  }

  /** 对话转录（连续性——呈现层 / 生成编排读取近几轮上下文；
   * 指代类生成（「对应的猫图片」）据此解析主体。只读副本）。 */
  getExperienceTranscript(
    experienceId: string,
  ): Array<{ role: 'user' | 'assistant'; text: string }> {
    this.ensureRestored(experienceId);
    return [...(this.transcripts.get(experienceId) ?? [])];
  }
}
