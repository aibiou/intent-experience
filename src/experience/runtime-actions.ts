/**
 * 体验运行时语义动作执行引擎（RuntimeActions）——S6 拆分第一阶段：
 * execute* 动作执行族 + 生成链路辅助（captureLastResponse /
 * executeContentGeneration / interruptGeneration / wrapGenerationStream /
 * createProviderChunkSource / resolveGenerationChunks / registerGeneration /
 * markStreamCancellation / isGenerationDead）。由 runtime.ts 门面继承。
 * 治理约束：合成模式——网关由合成语料提供，不调用任何真实 LLM 提供方。
 */
import {
  POLICY_VERSION,
  resolvePolicy,
  type PolicyAction,
  type SemanticAction,
} from './policy';
import { classifyInput } from './classifier';
import { shouldCompactReplay } from './generation-intent';
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

/** 创作对象 → LLM 请求摘要（九分量的紧凑形态——修改轮预览
 * 由真模型产出时，模型据此知道作品本身的主体结构）。 */
function creationLlmSummary(creation: CreationObject): CreationLlmSummary {
  return {
    theme: creation.concept.theme,
    coreMechanic: creation.concept.coreMechanic,
    goal: creation.goal,
    version: creation.version,
    objects: creation.objects,
    rules: creation.rules,
    interactions: creation.interactions,
    presentation: creation.presentation,
  };
}

/**
 * 提供方内容确定性分块（句界切分——S5A 内容流缺口修复）：
 * 真实模型响应按句界分段流式（与合成语料既有分块形态
 * 对齐的流式体验）；无句界文本整体为一块。确定性纯函数
 * ——同输入恒同输出。
 */
function chunkProviderContent(content: string): string[] {
  const segments = content
    .split(/(?<=[。！？!?；;\n])/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments : [content];
}

import { RuntimeCoreBase } from './runtime-core';

/**
 * 体验运行时语义动作执行引擎——继承 RuntimeCoreBase 共享状态。
 */
export class RuntimeActions extends RuntimeCoreBase {
  protected async executeStop(
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
    // 模拟域会话结束（S3a D-2 选项 A——S3B-SEMANTIC-FREEZE-01
    // v1.0.0 §1.5：体验完成即会话结束——清空当前激活分支
    // 指针（currentBranchId 会话级不变式——不跨会话自动
    // 恢复激活分支）；分支记录与模拟历史跨会话持久
    // （可枚举、跨会话显式操作）；事件为不可变权威
    // 事实——C6 §5。
    this.simulations.endSession(input.experienceId);

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
        memoryClass: 'short_term',
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
              memory_class: memoryWrite.record.memoryClass,
              candidate_long_term: memoryWrite.record.candidateLongTerm,
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

  protected async executeChange(
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
    const llmRequest: LlmRequest = {
      request_id: requestId,
      session_id: input.sessionId,
      experience_id: input.experienceId,
      intent: { intent_id: experience.intentId },
      experience_state: { status: current.status, stage: current.stage, state_version: current.stateVersion },
      semantic_action: policy.semanticAction,
      allowed_action: policy.policyAction,
      context: await this.buildLlmContext(input.rawInput, input.experienceId),
    };
    // 流式形态（S5A-SEMANTIC-FREEZE-01 v1.2.0 / CR-38）：
    // 提供方网关经可选 proposeStream 增量产出——chunk 事件随
    // SSE delta 逐片到达（真流式呈现）；提案于流末构造并验证
    // （llm_request_completed / 验证 / llm_output_validated /
    // 决策轨迹于流末产出——完成时机差异经冻结文本 §1 登记，
    // 事件契约 / 名称 / 形状不变）。静态形态（合成 / 故障
    // 注入网关）保持单次完整提案路径（行为零变化——黄金回归
    // 不变式）；STOP 永不流式（策略硬边界——不产出内容分块，
    // stopped 事件纪律不变）。
    const streamingForm =
      policy.policyAction !== 'STOP' && typeof this.gateway.proposeStream === 'function';
    let proposal: LlmProposal | undefined;
    if (!streamingForm) {
      try {
        proposal = await this.gateway.propose(llmRequest);
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
    }

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
    // 模拟域激活上下文结束（S3a D-2 选项 A——S3B-SEMANTIC-FREEZE-01
    // v1.0.0 §1.6：方向变更后旧方向激活分支上下文结束
    // （currentBranch 清空——下一方向 WHAT_IF 首轮自动创建
    // 新分支——D-03 CREATE）；旧方向分支记录保留（跨会话
    // 持久——可枚举、RETURNED 分支经 SWITCH 恢复探索的
    // 纪律不变）。
    this.simulations.endSession(input.experienceId);

    // 8. generation epoch 切换（旧 generation 迟到达提交由此守卫拒绝）。
    const controller = this.registerGeneration(input.experienceId, generationId, input.signal);
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

    // 决策轨迹：静态形态于流前写入；流式形态于流末由
    // chunk 源写入（完成时机经 S5A v1.2.0 §1 登记）。
    if (!streamingForm) {
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
    }

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
    // 流式形态：增量分块源于此实例化（combinedSignal 就绪——
    // 取消经 request.signal 中止上游连接）。
    let providerChunkSource: AsyncGenerator<StreamEvent> | undefined;
    if (streamingForm) {
      llmRequest.signal = combinedSignal;
      providerChunkSource = this.createProviderChunkSource({
        request: llmRequest,
        semanticAction: policy.semanticAction,
        policyAction: policy.policyAction,
        fixtureId: fixture.fixture.fixtureId,
        generationId,
        llmRequestId: requestId,
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        intentId: experience.intentId,
        stateVersion: current.stateVersion,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: { status: commit.state.status, stage: commit.state.stage, state_version: commit.state.stateVersion },
        selectedAction: policy.policyAction,
        reasonPrimary: 'explicit_user_direction',
        reasonSecondary: 'CHANGE_DIRECTION cancels old generation, rejects old candidate, starts new direction (P-02)',
        llmUsed: true,
        userOverride: true,
        audit: this.auditSink,
      });
    }
    const stream = this.wrapGenerationStream({
      header,
      experienceId: input.experienceId,
      generationId,
      streamOptions: {
        semanticAction: policy.semanticAction,
        policyAction: policy.policyAction,
        fixtureId: fixture.fixture.fixtureId,
        // 流式形态：分块经 chunkSource 增量产出（chunks 不消费）；
        // 静态形态：提案内容经确定性句界分块（既有纪律）。
        chunks: proposal ? this.resolveGenerationChunks(proposal, fixture.fixture.chunks) : fixture.fixture.chunks,
        signal: combinedSignal,
        chunkDelayMs: 40,
        audit: this.auditSink,
        ...(providerChunkSource ? { chunkSource: providerChunkSource } : {}),
      },
      completionCommit: true,
      stateTransitionedEvent: stateTransitions,
    });

    return { ok: true, header, stream, generationId };
  }

  // ---------------------------------------------------------------------
  // CREATE 执行（PD-21 关闭切片：最小 Creation Branch；G04）
  // ---------------------------------------------------------------------

  protected async executeCreate(
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
        context: await this.buildLlmContext(input.rawInput, input.experienceId),
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
      // 模拟域激活上下文结束（S3a D-2 选项 A——S3B-SEMANTIC-FREEZE-01
      // v1.0.0 §1.5：相邻重复 CREATE 取代在途创作会话，
      // 旧方向激活分支指针同步清空（currentBranchId 会话级
      // 不变式）；分支记录与模拟历史跨会话持久——与创作
      // 会话纪律一致）。
      this.simulations.endSession(input.experienceId);
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
    const controller = this.registerGeneration(input.experienceId, generationId, input.signal);

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
        chunks: this.resolveGenerationChunks(proposal, fixture.fixture.chunks),
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
  protected async terminateCreationSession(
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

  protected async executeCreationModify(
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
    const controller = this.registerGeneration(input.experienceId, generationId, input.signal);
    // 提供方流式接线（CR-38 同款纪律）：修改轮预览由真模型
    // 产出——语义动作与修改后的创作对象随请求注入（网关
    // 确定性渲染进用户消息）；合成网关保持既有静态语料路径
    // （行为零变化——黄金回归不变式）。
    const llmRequestId = `req_${generationId}`;
    const streamingForm = typeof this.gateway.proposeStream === 'function';

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

    // 决策轨迹：静态形态于流前写入；流式形态于流末由
    // chunk 源写入（完成时机经 S5A v1.2.0 §1 登记）。
    if (!streamingForm) {
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
    }

    // 9. 预览流（流式形态由真模型产出预览；补丁后创作状态
    //    经 getCreation 可查；流完成经 completeGeneration 推进
    //    PREVIEW → USER_FEEDBACK）。
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
    let providerChunkSource: AsyncGenerator<StreamEvent> | undefined;
    if (streamingForm) {
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
      const llmRequest: LlmRequest = {
        request_id: llmRequestId,
        session_id: input.sessionId,
        experience_id: input.experienceId,
        intent: { intent_id: experience.intentId },
        experience_state: { status: commit.state.status, stage: commit.state.stage, state_version: commit.state.stateVersion },
        semantic_action: policy.semanticAction,
        allowed_action: policy.policyAction,
        context: await this.buildGenerationContext(input),
        // 修改后的创作对象随请求注入——模型重述的是打补丁
        // 之后的作品本身，而非泛泛地解释「换角度 / 简化」。
        creation: creationLlmSummary(patchCommit.record.creation),
        signal: combinedSignal,
      };
      providerChunkSource = this.createProviderChunkSource({
        request: llmRequest,
        semanticAction: policy.semanticAction,
        policyAction: policy.policyAction,
        fixtureId: fixture.fixture.fixtureId,
        generationId,
        llmRequestId,
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        intentId: experience.intentId,
        stateVersion: current.stateVersion,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: { status: commit.state.status, stage: commit.state.stage, state_version: commit.state.stateVersion },
        selectedAction: policy.policyAction,
        reasonPrimary: patch.operation === 'restore' ? 'creation_restore' : 'explicit_user_direction',
        reasonSecondary: patch.operation === 'restore'
          ? `creation restore committed as monotonic revert patch (creation v${expectedCreationVersion} → v${patchCommit.record.creation.version}; new content = version ${typeof patch.change.restoreFromVersion === 'number' ? patch.change.restoreFromVersion : 'n/a'} content; version pointer never rolls back, S1-12; RESTORE_PREVIOUS_VERSION subtype of CORRECTION, 08 §28 / D-04 选项 A)`
          : `creation modification applied as patch (creation v${expectedCreationVersion} → v${patchCommit.record.creation.version}; local patch, no whole-work regeneration, 08 §11)`,
        llmUsed: true,
        userOverride: true,
        audit: this.auditSink,
      });
    }
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
        ...(providerChunkSource ? { chunkSource: providerChunkSource } : {}),
      },
      completionCommit: true,
      stateTransitionedEvent: stateTransitions,
    });

    return { ok: true, header, stream, generationId };
  }

  // ---------------------------------------------------------------------
  // 创作 ASK 执行（08 §16：至多一个澄清问题；创作子状态不推进）
  // ---------------------------------------------------------------------

  protected async executeCreationAsk(
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
    const controller = this.registerGeneration(input.experienceId, generationId, input.signal);

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
  // SWITCH / ABANDON / RETURN + S2-BRANCH-REFLOW-DEF-01 v1.0.0
  // 选项 A 第五操作 ADOPT_BRANCH；CREATE 由模拟轮次自动执行）
  // ---------------------------------------------------------------------

  protected async executeBranchOperation(
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
    //    体验阶段轴不变——D-02 选项 A。S3a 例外（D-2 选项 A；
    //    S3B-SEMANTIC-FREEZE-01 v1.0.0 §1.4）：已完成
    //    （COMPLETED）体验的分支记录仍可跨会话操作——持久
    //    分支记录的可操作性不因体验完成而终止（分支为体验
    //    状态轴之外的对象化承载——分支操作不迁移体验轴，
    //    体验轴保持终态；仅跨会话路径可达——输入会话
    //    ACTIVE 而宿主会话已 ENDED，同一会话内 COMPLETED
    //    体验经会话状态校验已拒绝）。
    const steps: ExperienceTrigger[] = ['USER_ACTION', 'WHAT_IF_SIMULATE'];
    let view: ExperienceView = { status: current.status, stage: current.stage };
    const completedExperienceBranchRound = current.status === 'COMPLETED';
    for (const trigger of completedExperienceBranchRound ? [] : steps) {
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
    const controller = this.registerGeneration(input.experienceId, generationId, input.signal);

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

    // 采用结果登记（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A
    // 变更 3——模拟域事件 simulation_adopted：properties 含
    // branch_id / source_round / adopted_content 摘要（分支
    // 最新模拟轮的模拟结果内容——分支探索摘要）/
    // separation_invariant=simulation_result_is_not_fact——
    // 采用结果仍标记为模拟来源（模拟结果不得表现为事实，
    // E8-G2-CC07）；主线当前上下文不变（变更 4——采用内容
    // 经独立 CREATE 提交方纳入作品，创作版本化纪律不变）。
    if (branchOperation.operation === 'ADOPT_BRANCH') {
      const adoptLatestRound = applied.branch.rounds[applied.branch.rounds.length - 1];
      await this.recordEvent(SIMULATION_ADOPTED_EVENT, {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: commit.state.stateVersion, request_id: input.requestId, decision_id: decisionId },
        source: { layer: 'runtime', component: 'simulation-runtime' },
        properties: {
          branch_id: applied.branch.branchId,
          source_round: applied.branch.sourceRound,
          adopted_content: adoptLatestRound ? adoptLatestRound.separation.simulation : '',
          separation_invariant: 'simulation_result_is_not_fact',
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
          : branchOperation.operation === 'ADOPT_BRANCH'
            ? '采用分支结论（显式回流）'
            : '返回主线模拟上下文';
    // 采用结果呈现（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A
    // 变更 4）：采纳结果呈现为新一轮模拟上下文——分支
    // 最新模拟轮的模拟结果内容随结果流呈现（模拟来源、
    // 非事实——separation_invariant 互斥注记随文标注）；
    // 主线当前上下文不变，采纳内容经独立 CREATE 提交
    // 方纳入作品（创作版本化纪律不变）。
    const adoptLatestRound =
      branchOperation.operation === 'ADOPT_BRANCH'
        ? applied.branch.rounds[applied.branch.rounds.length - 1]
        : null;
    const operationChunks =
      branchOperation.operation === 'ADOPT_BRANCH' && adoptLatestRound
        ? [
            `分支操作（确定性规则词表，D-03 选项 A；S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A）：${operationLabel}——${applied.summary}`,
            `新一轮模拟上下文（分支 ${applied.branch.branchId} 最新模拟轮 ${adoptLatestRound.round} 的模拟结果——模拟来源，非事实；separation_invariant=simulation_result_is_not_fact；采纳内容经独立 CREATE 提交方纳入作品）：`,
            adoptLatestRound.separation.simulation,
            '（流式结束）',
          ]
        : [`分支操作（确定性规则词表，D-03 选项 A）：${operationLabel}——${applied.summary}（流式结束）`];
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
        chunks: operationChunks,
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

  protected async executeCorrect(
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
    const controller = this.registerGeneration(input.experienceId, generationId, input.signal);

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
        chunks: this.resolveGenerationChunks(proposal, fixture.fixture.chunks),
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

  // ---------------------------------------------------------------------
  // CONTINUE / REPEAT 执行（S4 D-1 选项 A；S4A-SEMANTIC-FREEZE-01
  // v1.0.0 §1 D-1——确定性系统回合：llm_used=false，state_version
  // 不变——不登记状态变更事件（纯呈现 / 确认语义））
  // ---------------------------------------------------------------------

  protected async executeContinue(
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
    // 乐观并发校验（无状态变更——客户端预期版本须与当前版本一致）。
    if (input.expectedStateVersion !== current.stateVersion) {
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
        reasonSecondary: `expected ${input.expectedStateVersion} but current is ${current.stateVersion}`,
        llmUsed: false,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      await this.recordEvent('state_version_conflict', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'state-store' },
        properties: {
          expected_state_version: input.expectedStateVersion,
          current_state_version: current.stateVersion,
          trigger: 'CONTINUE',
        },
      });
      return {
        ok: false,
        error: runtimeError(
          'STATE_VERSION_CONFLICT',
          `expected_state_version ${input.expectedStateVersion} but current is ${current.stateVersion} (CONTINUE is idempotent - no state change; retry with the current version)`,
        ),
      };
    }
    await this.writeDecisionTrace({
      decisionId,
      sessionId: input.sessionId,
      experienceId: input.experienceId,
      semanticAction: policy.semanticAction,
      stateBefore,
      stateBeforeVersion: current.stateVersion,
      stateAfter: { status: stateBefore.status, stage: stateBefore.stage, state_version: current.stateVersion },
      selectedAction: policy.policyAction,
      reasonPrimary: 'explicit_user_direction',
      reasonSecondary: 'CONTINUE confirms the current experience continues (idempotent confirmation round - no state change; S4A-SEMANTIC-FREEZE-01 D-1)',
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
        reason: 'semantic_action',
      },
      state_version: current.stateVersion,
      state: { status: current.status, stage: current.stage, waiting_for_user: current.waitingForUser },
      at: now,
    };
    // CONTINUE 无内容分块（幂等确认——空语料）；流产出 done 终止事件。
    const stream = this.wrapGenerationStream({
      header,
      experienceId: input.experienceId,
      generationId: 'gen-continue',
      streamOptions: {
        semanticAction: policy.semanticAction,
        policyAction: 'CONTINUE',
        fixtureId: 'synthetic/continue/v1',
        chunks: [],
        signal: input.signal,
        chunkDelayMs: 0,
        audit: this.auditSink,
      },
      completionCommit: false,
    });
    return { ok: true, header, stream, generationId: 'gen-continue' };
  }

  protected async executeRepeat(
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
    // 乐观并发校验（无状态变更——客户端预期版本须与当前版本一致）。
    if (input.expectedStateVersion !== current.stateVersion) {
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
        reasonSecondary: `expected ${input.expectedStateVersion} but current is ${current.stateVersion}`,
        llmUsed: false,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      await this.recordEvent('state_version_conflict', {
        identity: { user_id: this.userId, session_id: input.sessionId },
        context: { experience_id: input.experienceId, intent_id: experience.intentId, state_version: current.stateVersion, request_id: input.requestId },
        source: { layer: 'runtime', component: 'state-store' },
        properties: {
          expected_state_version: input.expectedStateVersion,
          current_state_version: current.stateVersion,
          trigger: 'REPEAT',
        },
      });
      return {
        ok: false,
        error: runtimeError(
          'STATE_VERSION_CONFLICT',
          `expected_state_version ${input.expectedStateVersion} but current is ${current.stateVersion} (REPEAT is a presentation-layer replay - no state change; retry with the current version)`,
        ),
      };
    }
    // 前置条件：上一完成轮响应存在（呈现层重放数据源）。
    const lastResponse = this.lastResponseByExperience.get(input.experienceId);
    if (!lastResponse) {
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
        reasonSecondary: 'REPEAT requires a previous completed response round (no prior content round in this experience)',
        llmUsed: false,
        userOverride: true,
        inputEvent: null,
        intentBefore: null,
      });
      return {
        ok: false,
        error: runtimeError(
          'INVALID_STATE_TRANSITION',
          'REPEAT requires a previous completed response round (no prior content round in this experience - S4A-SEMANTIC-FREEZE-01 D-1)',
        ),
      };
    }
    await this.writeDecisionTrace({
      decisionId,
      sessionId: input.sessionId,
      experienceId: input.experienceId,
      semanticAction: policy.semanticAction,
      stateBefore,
      stateBeforeVersion: current.stateVersion,
      stateAfter: { status: stateBefore.status, stage: stateBefore.stage, state_version: current.stateVersion },
      selectedAction: policy.policyAction,
      reasonPrimary: 'explicit_user_direction',
      reasonSecondary: 'REPEAT replays the previous completed round response (presentation-layer replay - no state change; S4A-SEMANTIC-FREEZE-01 D-1)',
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
        reason: 'semantic_action',
      },
      state_version: current.stateVersion,
      state: { status: current.status, stage: current.stage, waiting_for_user: current.waitingForUser },
      at: now,
    };
    // REPEAT 呈现层重放：上一完成轮响应内容经既有流式 chunk 路径
    // 重放（内容与 fixtureId 为上一轮原文——呈现层重放，不重新生成）。
    // 呈现形式类生成意图（如「画成图片 / 用图片展现刚才的内容」）
    // 触发的 REPEAT（2026-10-13 CR-56）：展示层收敛为简短引导——
    // 用户意图是「把内容画出来」，重复重放上一轮 300+ 字长文本
    // 造成对话流文本污染（实测截图「半截 / 对不上」）；蒸馏内容
    // 原料由 withGeneration 独立从转录取原文（REPEAT 不入转录，
    // 上一轮原文仍可回溯），图像质量不受影响；语音朗读保留完整
    // 重放（用户要听内容）；「再说一遍」等重放指令保持原文。
    const presentationalReplay = shouldCompactReplay(input.rawInput);
    const replayChunks = presentationalReplay
      ? ['好的，把刚才的感受画成图片——正在生成，马上就好。']
      : lastResponse.chunks;
    const stream = this.wrapGenerationStream({
      header,
      experienceId: input.experienceId,
      generationId: 'gen-repeat',
      streamOptions: {
        semanticAction: policy.semanticAction,
        policyAction: 'REPEAT',
        fixtureId: lastResponse.fixtureId,
        chunks: replayChunks,
        signal: input.signal,
        chunkDelayMs: 0,
        audit: this.auditSink,
      },
      completionCommit: false,
    });
    return { ok: true, header, stream, generationId: 'gen-repeat' };
  }

  /** S4（D-1 选项 A；S4A-SEMANTIC-FREEZE-01 v1.0.0 §1 D-1）——
   * 上一完成轮响应内容登记：包装异步生成器，客户端事件原样转发；
   * chunk 事件内容经内部登记（REPEAT 呈现层重放数据源——
   * 不改变客户端流；仅内容轮次登记——空轮次不覆盖上一内容轮记录）。
   *
   * CR-56（2026-10-13）：呈现形式类收敛 REPEAT（「画成图片」等）
   * 传 skipCapture=true——收敛引导语不是真实内容轮，既不更新
   * lastResponse（保证后续「再说一遍」仍能拿到完整原文），也不
   * 写入转录（保证 withGeneration 蒸馏取到的是上一轮真实回答，
   * 而非收敛引导）；事件流仍原样转发，会话快照仍在流末刷新。 */
  protected async *captureLastResponse(
    experienceId: string,
    source: AsyncGenerator<RuntimeStreamEvent>,
    options?: { skipCapture?: boolean },
  ): AsyncGenerator<RuntimeStreamEvent> {
    const skipCapture = options?.skipCapture === true;
    const chunks: string[] = [];
    let fixtureId = '';
    for await (const event of source) {
      if (!skipCapture && event.type === 'chunk' && event.content !== null) {
        chunks.push(event.content);
        fixtureId = event.fixtureId;
      }
      yield event;
    }
    if (!skipCapture && chunks.length > 0) {
      this.lastResponseByExperience.set(experienceId, { chunks, fixtureId, at: new Date().toISOString() });
      // 连续性转录：助手内容入转录（空轮次不覆盖——与 REPEAT
      // 数据源同纪律；截断 1500 字防上下文膨胀）。
      const transcript = this.transcripts.get(experienceId) ?? [];
      transcript.push({ role: 'assistant', text: chunks.join('').slice(0, 1_500) });
      this.transcripts.set(experienceId, transcript.slice(-12));
    }
    // 会话快照（跨重启续讲）：流末以完成态落盘——此时
    // completeGeneration 已提交（WAITING），快照状态可安全恢复。
    // 空轮次（STOP / CONTINUE）也刷新——状态变更不落旧态。
    this.snapshotSession(experienceId);
  }

  protected async executeContentGeneration(
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
    const llmRequest: LlmRequest = {
      request_id: llmRequestId,
      session_id: input.sessionId,
      experience_id: input.experienceId,
      intent: { intent_id: experience.intentId },
      experience_state: { status: current.status, stage: current.stage, state_version: current.stateVersion },
      semantic_action: policy.semanticAction,
      allowed_action: policy.policyAction,
      context: await this.buildGenerationContext(input),
    };
    // 流式形态（S5A-SEMANTIC-FREEZE-01 v1.2.0 / CR-38）：
    // 提供方网关经可选 proposeStream 增量产出——chunk 事件随
    // SSE delta 逐片到达（真流式呈现）；提案于流末构造并验证
    // （llm_request_completed / 验证 / llm_output_validated /
    // 模拟结果登记 / 决策轨迹于流末产出——完成时机差异经
    // 冻结文本 §1 登记，事件契约 / 名称 / 形状不变）。静态
    // 形态（合成 / 故障注入网关）保持单次完整提案路径（行为
    // 零变化——黄金回归不变式）；STOP 永不流式（策略硬边界——
    // 不产出内容分块，stopped 事件纪律不变）。
    const streamingForm =
      policy.policyAction !== 'STOP' && typeof this.gateway.proposeStream === 'function';
    let proposal: LlmProposal | undefined;
    if (!streamingForm) {
      try {
        proposal = await this.gateway.propose(llmRequest);
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
    }

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
    const controller = this.registerGeneration(input.experienceId, generationId, input.signal);

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
    // 流式形态：提案于流末构造——登记经 chunk 源 onProposal
    // 钩子于流末执行（同一纪律；完成时机经 S5A v1.2.0 §1 登记）。
    const recordSimulation = async (proposal: LlmProposal): Promise<void> => {
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
    };
    if (policy.policyAction === 'SIMULATE' && proposal) {
      await recordSimulation(proposal);
    }
    // 决策轨迹：静态形态于流前写入；流式形态于流末由
    // chunk 源写入（完成时机经 S5A v1.2.0 §1 登记）。
    if (!streamingForm) {
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
    }

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
    // 流式形态：增量分块源于此实例化（combinedSignal 就绪——
    // 取消经 request.signal 中止上游连接）。
    let providerChunkSource: AsyncGenerator<StreamEvent> | undefined;
    if (streamingForm) {
      llmRequest.signal = combinedSignal;
      providerChunkSource = this.createProviderChunkSource({
        request: llmRequest,
        semanticAction: policy.semanticAction,
        policyAction: policy.policyAction,
        fixtureId: fixture.fixture.fixtureId,
        generationId,
        llmRequestId,
        decisionId,
        sessionId: input.sessionId,
        experienceId: input.experienceId,
        intentId: experience.intentId,
        stateVersion: current.stateVersion,
        stateBefore,
        stateBeforeVersion: current.stateVersion,
        stateAfter: { status: commit.state.status, stage: commit.state.stage, state_version: commit.state.stateVersion },
        selectedAction: policy.policyAction,
        reasonPrimary: 'semantic_action',
        reasonSecondary: `${policy.semanticAction} resolves to ${policy.policyAction} via the frozen S1 §14 policy map`,
        llmUsed: true,
        userOverride: false,
        audit: this.auditSink,
        onProposal: policy.policyAction === 'SIMULATE' ? recordSimulation : undefined,
      });
    }
    const stream = this.wrapGenerationStream({
      header,
      experienceId: input.experienceId,
      generationId,
      streamOptions: {
        semanticAction: policy.semanticAction,
        policyAction: policy.policyAction,
        fixtureId: fixture.fixture.fixtureId,
        // 流式形态：分块经 chunkSource 增量产出（chunks 不消费）；
        // 静态形态：提案内容经确定性句界分块（既有纪律）。
        chunks: proposal ? this.resolveGenerationChunks(proposal, fixture.fixture.chunks) : fixture.fixture.chunks,
        signal: combinedSignal,
        chunkDelayMs: 40,
        audit: this.auditSink,
        ...(providerChunkSource ? { chunkSource: providerChunkSource } : {}),
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
  protected async interruptGeneration(experienceId: string, reason: string): Promise<void> {
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

  protected wrapGenerationStream(options: {
    header: SubmissionHeader;
    experienceId: string;
    generationId: string;
    streamOptions: Parameters<typeof createExperienceStream>[0] & {
      /**
       * 增量分块源（提供方真流式——S5A-SEMANTIC-FREEZE-01
       * v1.2.0 / CR-38）：chunk 事件随提供方 SSE delta 逐片
       * 产出（真流式呈现）。缺省走静态分块流（合成 / 故障
       * 注入网关——行为零变化，黄金回归不变式）。
       */
      chunkSource?: AsyncGenerator<StreamEvent>;
    };
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
      const chunkSource = streamOptions.chunkSource;
      for await (const event of (chunkSource ?? createExperienceStream(streamOptions))) {
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

  /**
   * 提供方增量分块源（S5A-SEMANTIC-FREEZE-01 v1.2.0 / CR-38）：
   * 经 LlmGateway.proposeStream 逐片产出 chunk 事件（真流式
   * 呈现——内容随提供方 SSE delta 到达，而非完整响应后
   * 分块重放）。流末构造提案并经既有纪律：llm_request_completed
   * → 验证（S1-08——提供方网关构造不变式：state_update_proposal
   * 恒空、confidence 恒 1.0）→ llm_output_validated / 拒绝链
   * → 决策轨迹 → 方法特定流末处理（WHAT_IF 模拟结果登记）
   * → done。
   *
   * 流式形态时序（S5A v1.2.0 §1 登记）：版本化提交先于流
   * （header 携带已提交版本），chunk 事件流式产出，上述
   * 事件于流末产出（静态形态于流前——完成时机差异经冻结
   * 文本版本化登记；事件契约 / 名称 / 形状不变）。
   *
   * 取消：信号中止 → cancelled 事件（与静态路径同形；上游
   * 连接随 request.signal 中止）。提供方流故障（非取消）
   * 向上抛出——客户端按连接中断处理（不静默回退，与静态
   * 形态 LLM_UNAVAILABLE 同纪律）。
   */
  protected async *createProviderChunkSource(options: {
    request: LlmRequest;
    semanticAction: SemanticAction;
    policyAction: PolicyAction;
    fixtureId: string;
    generationId: string;
    llmRequestId: string;
    decisionId: string;
    sessionId: string;
    experienceId: string;
    intentId: string | null;
    /** 请求 / 事件用状态版本（迁移前版本——与静态形态一致）。 */
    stateVersion: number;
    stateBefore: ExperienceView;
    stateBeforeVersion: number;
    stateAfter: { status: ExperienceStatus; stage: ExperienceStage; state_version: number };
    selectedAction: PolicyAction;
    reasonPrimary: string;
    reasonSecondary: string | null;
    llmUsed: boolean;
    userOverride: boolean;
    /** 审计汇（每次事件写入——与静态路径同纪律）。 */
    audit?: (event: StreamEvent) => void | Promise<void>;
    /** 流末（提案验证通过后）方法特定处理（WHAT_IF 模拟结果登记）。 */
    onProposal?: (proposal: LlmProposal) => Promise<void>;
  }): AsyncGenerator<StreamEvent> {
    const emit = async (event: StreamEvent): Promise<void> => {
      await options.audit?.(event);
    };
    let content = '';
    let produced = 0;
    let streamFailure: Error | null = null;
    if (!this.gateway.proposeStream) {
      // 不应到达（调用方经 streamingForm 门控）——防御性直接
      // 结束（无事件产出；wrapGenerationStream 的完成提交
      // 守卫由此不执行——与静态路径 stopped 形态同纪律）。
      return;
    }
    try {
      for await (const delta of this.gateway.proposeStream(options.request)) {
        if (options.request.signal?.aborted) {
          const cancelled: StreamEvent = {
            policyAction: options.policyAction,
            semanticAction: options.semanticAction,
            fixtureId: options.fixtureId,
            index: produced,
            totalChunks: produced,
            content: null,
            at: new Date().toISOString(),
            type: 'cancelled',
          };
          await emit(cancelled);
          yield cancelled;
          return;
        }
        content += delta;
        const event: StreamEvent = {
          policyAction: options.policyAction,
          semanticAction: options.semanticAction,
          fixtureId: options.fixtureId,
          index: produced,
          // 流式形态：chunk 事件 totalChunks 为已产出数（总数
          // 于流末可知——done 事件携带最终总数；S5A v1.2.0 §1）。
          totalChunks: produced + 1,
          content: delta,
          at: new Date().toISOString(),
          type: 'chunk',
        };
        produced += 1;
        await emit(event);
        yield event;
      }
    } catch (error) {
      if (options.request.signal?.aborted) {
        // 取消：上游连接随信号中止——cancelled 事件（同静态路径）。
        const cancelled: StreamEvent = {
          policyAction: options.policyAction,
          semanticAction: options.semanticAction,
          fixtureId: options.fixtureId,
          index: produced,
          totalChunks: produced,
          content: null,
          at: new Date().toISOString(),
          type: 'cancelled',
        };
        await emit(cancelled);
        yield cancelled;
        return;
      }
      streamFailure = error instanceof Error ? error : new Error(String(error));
    }
    // 流末：提案构造（提供方网关构造不变式——state_update_proposal
    // 恒空、confidence 恒 1.0）→ 既有验证 / 事件纪律。
    const proposal: LlmProposal = {
      proposal_id: nextProviderProposalId(),
      content,
      state_update_proposal: {},
      confidence: 1,
    };
    await this.recordEvent('llm_request_completed', {
      identity: { user_id: this.userId, session_id: options.sessionId },
      context: { experience_id: options.experienceId, intent_id: options.intentId, state_version: options.stateVersion, request_id: options.llmRequestId, decision_id: options.decisionId },
      source: { layer: 'llm', component: 'llm-gateway' },
      properties: { generation_id: options.generationId, proposal_id: proposal.proposal_id },
    });
    const validation = validateProposal(proposal);
    if (!validation.ok) {
      // 拒绝路径（结构不可达——提供方网关构造不变式；保留与
      // 静态形态同形的拒绝链以守住 S1-08 纪律）。
      await this.recordEvent('llm_output_rejected', {
        identity: { user_id: this.userId, session_id: options.sessionId },
        context: { experience_id: options.experienceId, intent_id: options.intentId, state_version: options.stateVersion, request_id: options.llmRequestId, decision_id: options.decisionId },
        source: { layer: 'llm', component: 'validator' },
        properties: { generation_id: options.generationId, proposal_id: proposal.proposal_id, code: validation.code, reason: validation.reason },
      });
      if (validation.code === 'POLICY_REJECTED') {
        await this.recordEvent('state_write_rejected', {
          identity: { user_id: this.userId, session_id: options.sessionId },
          context: { experience_id: options.experienceId, intent_id: options.intentId, state_version: options.stateVersion, request_id: options.llmRequestId, decision_id: options.decisionId },
          source: { layer: 'runtime', component: 'validator' },
          properties: { reason: 'llm_state_mutation_forbidden', generation_id: options.generationId, detail: validation.reason },
        });
      }
      await this.writeDecisionTrace({
        decisionId: options.decisionId,
        sessionId: options.sessionId,
        experienceId: options.experienceId,
        semanticAction: options.semanticAction,
        stateBefore: options.stateBefore,
        stateBeforeVersion: options.stateBeforeVersion,
        stateAfter: null,
        selectedAction: options.selectedAction,
        reasonPrimary: 'proposal_rejected',
        reasonSecondary: `${validation.code}: ${validation.reason}`,
        llmUsed: options.llmUsed,
        userOverride: options.userOverride,
        inputEvent: null,
        intentBefore: null,
      });
    } else {
      await this.recordEvent('llm_output_validated', {
        identity: { user_id: this.userId, session_id: options.sessionId },
        context: { experience_id: options.experienceId, intent_id: options.intentId, state_version: options.stateVersion, request_id: options.llmRequestId, decision_id: options.decisionId },
        source: { layer: 'llm', component: 'validator' },
        properties: { generation_id: options.generationId, proposal_id: proposal.proposal_id },
      });
      await options.onProposal?.(proposal);
      await this.writeDecisionTrace({
        decisionId: options.decisionId,
        sessionId: options.sessionId,
        experienceId: options.experienceId,
        semanticAction: options.semanticAction,
        stateBefore: options.stateBefore,
        stateBeforeVersion: options.stateBeforeVersion,
        stateAfter: options.stateAfter,
        selectedAction: options.selectedAction,
        reasonPrimary: options.reasonPrimary,
        reasonSecondary: options.reasonSecondary,
        llmUsed: options.llmUsed,
        userOverride: options.userOverride,
        inputEvent: null,
        intentBefore: null,
      });
    }
    if (streamFailure) {
      throw streamFailure;
    }
    const doneEvent: StreamEvent = {
      policyAction: options.policyAction,
      semanticAction: options.semanticAction,
      fixtureId: options.fixtureId,
      index: produced,
      totalChunks: produced,
      content: null,
      at: new Date().toISOString(),
      type: 'done',
    };
    await emit(doneEvent);
    yield doneEvent;
  }

  /**
   * 生成流分块解析（提供方模式内容面修复——S5A 内容流缺口）：
   * 合成模式提案内容与语料拼接文本字节一致——保持既有分块
   * 边界（黄金回归零变化）；提供方模式提案内容（真实模型
   * 响应）经确定性句界分块流式——用户看到模型实际响应，
   * 而非合成语料。事件流 / 状态机 / 策略契约均不变（仅
   * chunk 事件 content 与 totalChunks 随内容变化）。
   */
  protected resolveGenerationChunks(
    proposal: LlmProposal,
    fixtureChunks: string[],
  ): string[] {
    if (proposal.content === fixtureChunks.join('')) {
      return fixtureChunks;
    }
    return chunkProviderContent(proposal.content);
  }

  /**
   * generation epoch 登记（统一入口——各执行路径共用）：
   * 簿记登记 + 客户端断开监听。断开时在途生成死亡（上游
   * LLM fetch 经 request.signal 中止），但流消费侧随响应
   * 拆除而冻结——取消事件永远不会被流观测到，簿记收敛须由
   * 本监听直接完成；否则状态悬挂 ACTIVE 且在途簿记永驻
   * （停止 / 断线后继续对话被状态机永久拒绝——死锁）。
   */
  protected registerGeneration(experienceId: string, generationId: string, signal?: AbortSignal): AbortController {
    const controller = new AbortController();
    this.activeGenerations.set(experienceId, generationId);
    this.generationControllers.set(experienceId, controller);
    signal?.addEventListener(
      'abort',
      () => {
        // 正常完成后迟到的断开信号不登记（簿记已被
        // completeGeneration 清理——id 不再匹配）。
        if (this.activeGenerations.get(experienceId) === generationId) {
          void this.markStreamCancellation(experienceId, generationId);
        }
      },
      { once: true },
    );
    return controller;
  }

  /** 流观测到取消时登记 generation_cancelled（与 interruptGeneration 幂等互斥）。 */
  protected async markStreamCancellation(experienceId: string, generationId: string): Promise<void> {
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
    // 取消后清理在途簿记（与 completeGeneration 同纪律）——
    // 否则状态悬挂 ACTIVE 且簿记永驻：后续提交经
    // isGenerationDead 判定为死亡并归位恢复（无清理则
    // 判定恒为「活跃」，停止后继续对话被永久拒绝）。
    if (this.activeGenerations.get(experienceId) === generationId) {
      this.activeGenerations.delete(experienceId);
      this.generationControllers.delete(experienceId);
    }
  }

  /**
   * 在途 generation 是否已死（取消 / 断开 / 中断 / 未登记）——
   * 生成中断归位（ACTIVE 悬挂恢复）判定用；活跃 generation
   * （已登记且 controller 未 abort）返回 false——正常
   * mid-generation 拒绝语义（§7）不受影响。
   */
  protected isGenerationDead(experienceId: string): boolean {
    if (!this.activeGenerations.has(experienceId)) return true;
    const controller = this.generationControllers.get(experienceId);
    return controller !== undefined && controller.signal.aborted;
  }

  // ---------------------------------------------------------------------
  // 事件与决策追踪（S1-11/S1-12；C6 §22/§23 分离）
  // ---------------------------------------------------------------------

}
