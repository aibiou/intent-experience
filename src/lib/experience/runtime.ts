/**
 * Runtime——产品状态的唯一写入者（S1 切片核心）。
 *
 * 单一写入者纪律（intent-experience 授权 §5 / GS-05 / GS-06）：
 * - 前端、LLM、策略、验证器都不接触数据库；一切状态变更只经本文件。
 * - 每次合法提交 stateVersion 恰好 +1；stale 写入在 store.commitTurn
 *   的条件守卫处被拒绝（GS-05）。
 * - STOP / CHANGE_DIRECTION 是确定性路径：不调用模型、零续行（GS-04 /
 *   GS-03：用户说停就停，说换就换）。
 * - LLM 只提供内容提案（LlmProposal 无状态字段）；提案经 validator
 *   验证后才进入状态（GS-06 构造保证）。
 * - 范围外/未知语义动作：零版本零事件升级——给诚实的边界说明，
 *   不发明语义（授权 §5.7）。
 * - 会话周期适配（切片声明）：CHANGE_DIRECTION 按"方向变更 = 会话
 *   结束"落地（S3B endSession 语义）；会话内候选周期属后续切片。
 */

import { classifyInput } from './classifier';
import { getSeed, matchSeed, randomSeed } from './catalog';
import type { LlmGateway } from './llm-gateway';
import { POLICY_VERSION, resolvePolicy } from './policy';
import { buildCorrectionPrompt, buildSystemPrompt, buildUserPrompt } from './prompt-engine';
import { STATE_MACHINE_VERSION, transitionExperience } from './state-machine';
import * as store from './store';
import type { ExperienceState, TurnEvent, TurnKind } from './types';
import { validateProposal } from './validator';

export interface StartInput {
  seedId?: string;
  entry?: string; // 入口屏选定的角度 prompt（或种子默认 prompt）
  freeText?: string; // 首页自由输入（意图解析入口）
}

const BOUNDARY_NOTICES: Record<string, string> = {
  CREATE: '把理解变成作品——这是这个产品最重要的一步，创造模式正在下一个切片到来。现在你可以继续问、提一个"如果…"，或者随时说"好了"结束。',
  DEEPEN: '深入展开是下一个切片的方向性操作。现在你可以直接问出想深入的那一点，或者提一个"如果…"。',
  SIMPLIFY: '换一个更简单的讲法是下一个切片的方向性操作。你可以直接说"再简单点告诉我哪里看不懂"，我会直接回答。',
  REFRAME: '换角度重讲是下一个切片的方向性操作。你可以直接说出想换的角度。',
  REPEAT: '重放上一条是下一个切片的操作。上面那条还在，你可以往上翻看。',
};

const UNKNOWN_NOTICE =
  '这句话我还没能理解。这个切片里你可以：问"为什么"、提一个"如果…"、说"继续"，或者随时说"好了"结束。';

export class ExperienceRuntime {
  constructor(private readonly gateway: LlmGateway) {}

  /** 首页/入口屏 → 建立会话并跑完第一轮（意图解析 → 体验）。 */
  async *start(input: StartInput, signal: AbortSignal): AsyncGenerator<TurnEvent> {
    let seedId: string | null = null;
    let topic = '';
    let firstInput = '';

    if (input.seedId) {
      const seed = getSeed(input.seedId);
      if (!seed) {
        yield { type: 'error', code: 'INVALID_INPUT', message: '未找到该体验' };
        return;
      }
      seedId = seed.id;
      topic = seed.hook;
      firstInput = (input.entry ?? seed.prompt).trim();
    } else if (input.freeText) {
      const freeText = input.freeText.trim();
      const classification = classifyInput(freeText);
      // 首页自由输入的意图解析（确定性）：
      // 换一个/随便 → 惊喜种子；命中目录 → 该种子；否则 → 自定义体验。
      if (classification.semanticAction === 'CHANGE_DIRECTION') {
        const seed = randomSeed();
        seedId = seed.id;
        topic = seed.hook;
        firstInput = seed.prompt;
      } else {
        const matched = matchSeed(freeText);
        if (matched) {
          seedId = matched.id;
          topic = matched.hook;
          firstInput = freeText;
        } else {
          topic = freeText.length > 40 ? `${freeText.slice(0, 40)}…` : freeText;
          firstInput = freeText;
        }
      }
    } else {
      yield { type: 'error', code: 'INVALID_INPUT', message: '缺少入口输入' };
      return;
    }

    if (firstInput.length === 0) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '入口输入为空' };
      return;
    }

    const session = await store.createSession({
      seedId,
      topic,
      experienceId: seedId ?? 'custom',
    });
    yield {
      type: 'session',
      sessionId: session.id,
      stateVersion: session.stateVersion,
      view: session.state.view,
      topic: session.topic,
    };
    yield* this.runTurn(session.id, firstInput, session.stateVersion, signal);
  }

  /** 体验内一条用户输入的完整处理管线。 */
  async *runTurn(
    sessionId: string,
    text: string,
    expectedVersion: number,
    signal: AbortSignal
  ): AsyncGenerator<TurnEvent> {
    const raw = text.trim();
    if (raw.length === 0 || raw.length > 500) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '输入为空或过长' };
      return;
    }
    const session = await store.loadSession(sessionId);
    if (!session) {
      yield { type: 'error', code: 'SESSION_NOT_FOUND', message: '会话不存在' };
      return;
    }
    if (session.status === 'COMPLETED') {
      yield { type: 'error', code: 'SESSION_COMPLETED', message: '这次体验已经结束了' };
      return;
    }
    if (session.stateVersion !== expectedVersion) {
      yield {
        type: 'error',
        code: 'VERSION_CONFLICT',
        message: '状态已更新（版本冲突），正在为你同步最新状态',
      };
      yield { type: 'done', stateVersion: session.stateVersion, ended: false, exitReason: null };
      return;
    }

    const state = structuredClone(session.state);
    const classification = classifyInput(raw);
    const resolution = resolvePolicy(classification.semanticAction);

    // 范围外 / 未知：零版本零事件升级（确定性边界说明，不调用模型）。
    if (!resolution.ok) {
      yield {
        type: 'trace',
        turn: state.turn,
        semanticAction: classification.semanticAction,
        policyAction: 'OUT_OF_SLICE_SCOPE',
        fromVersion: expectedVersion,
      };
      yield {
        type: 'content',
        turn: state.turn,
        kind: 'BOUNDARY_NOTICE',
        text: BOUNDARY_NOTICES[classification.semanticAction] ?? UNKNOWN_NOTICE,
        stateVersion: expectedVersion,
      };
      yield { type: 'done', stateVersion: expectedVersion, ended: false, exitReason: null };
      return;
    }

    const { semanticAction, policyAction } = resolution;
    yield {
      type: 'trace',
      turn: state.turn,
      semanticAction,
      policyAction,
      fromVersion: expectedVersion,
    };

    // ── GS-04：STOP——确定性、零续行、不调用模型 ──
    if (policyAction === 'STOP') {
      const t = transitionExperience(state.view, 'STOP');
      if (!t.ok) {
        yield { type: 'error', code: 'INVALID_INPUT', message: '当前状态无法停止' };
        return;
      }
      state.view = t.next;
      state.completion = { done: true, exitReason: 'user_stop' };
      const ok = await store.commitTurn({
        sessionId,
        expectedVersion,
        newState: state,
        newStatus: 'COMPLETED',
        exitReason: 'user_stop',
        events: [
          { type: 'POLICY_DECIDED', payload: { semanticAction, policyAction, policy: POLICY_VERSION, stateMachine: STATE_MACHINE_VERSION } },
          { type: 'EXPERIENCE_COMPLETED', payload: { exitReason: 'user_stop', zeroContinuation: true } },
        ],
      });
      if (!ok) {
        yield { type: 'error', code: 'VERSION_CONFLICT', message: '状态已被并发更新' };
        return;
      }
      yield {
        type: 'state',
        stateVersion: expectedVersion + 1,
        view: state.view,
        state,
      };
      yield {
        type: 'done',
        stateVersion: expectedVersion + 1,
        ended: true,
        exitReason: 'user_stop',
      };
      return;
    }

    // ── GS-03：CHANGE_DIRECTION——取消旧操作，会话结束（S3B endSession 语义）──
    if (policyAction === 'CHANGE_EXPERIENCE') {
      const t = transitionExperience(state.view, 'CHANGE_DIRECTION');
      if (!t.ok) {
        yield { type: 'error', code: 'INVALID_INPUT', message: '当前状态无法换方向' };
        return;
      }
      state.view = t.next;
      state.completion = { done: true, exitReason: 'direction_changed' };
      const ok = await store.commitTurn({
        sessionId,
        expectedVersion,
        newState: state,
        newStatus: 'COMPLETED',
        exitReason: 'direction_changed',
        events: [
          { type: 'POLICY_DECIDED', payload: { semanticAction, policyAction, policy: POLICY_VERSION, stateMachine: STATE_MACHINE_VERSION } },
          { type: 'DIRECTION_CHANGED', payload: { oldCandidateCancelled: true } },
        ],
      });
      if (!ok) {
        yield { type: 'error', code: 'VERSION_CONFLICT', message: '状态已被并发更新' };
        return;
      }
      yield {
        type: 'state',
        stateVersion: expectedVersion + 1,
        view: state.view,
        state,
      };
      yield {
        type: 'done',
        stateVersion: expectedVersion + 1,
        ended: true,
        exitReason: 'direction_changed',
      };
      return;
    }

    // ── 内容轮：ANSWER / EXPLAIN / SIMULATE（G07 纠正 = EXPLAIN 变体）──
    const isFirstTurn = state.turn === 0 && state.view.status === 'ENTERING';
    const trigger: 'USER_ACTION' | 'CORRECTION' =
      semanticAction === 'CORRECTION' && !isFirstTurn ? 'CORRECTION' : 'USER_ACTION';

    if (isFirstTurn) {
      const started = transitionExperience(state.view, 'EXPERIENCE_STARTED');
      if (!started.ok) {
        yield { type: 'error', code: 'INVALID_INPUT', message: '体验启动状态非法' };
        return;
      }
      state.view = started.next;
    }
    const acting = transitionExperience(state.view, trigger);
    if (!acting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '状态迁移被拒绝（非法转移）' };
      return;
    }
    state.view = acting.next;

    if (policyAction === 'SIMULATE') {
      const sim = transitionExperience(state.view, 'WHAT_IF_SIMULATE');
      if (!sim.ok) {
        yield { type: 'error', code: 'INVALID_INPUT', message: '模拟阶段迁移被拒绝' };
        return;
      }
      state.view = sim.next;
    }

    // LLM 内容提案（网关失败/取消 → 诚实报错，状态零变更）
    let proposalText: string;
    try {
      const systemPrompt = buildSystemPrompt(state);
      const userPrompt =
        semanticAction === 'CORRECTION' && !isFirstTurn
          ? buildCorrectionPrompt(raw)
          : buildUserPrompt(policyAction, raw, state.turn);
      const proposal = await this.gateway.generate({ systemPrompt, userPrompt, signal });
      if (signal.aborted) {
        await store.appendCancellationEvent(sessionId, session.generation + 1, expectedVersion);
        return; // 客户端已离开：不投递、不提交
      }
      const validated = validateProposal(proposal);
      if (!validated.ok) {
        await store.appendAuditEvent(sessionId, 'TURN_FAILED', {
          stage: 'validation',
          code: validated.code,
          semanticAction,
        }, expectedVersion);
        yield {
          type: 'error',
          code: 'LLM_PROPOSAL_INVALID',
          message: '这一轮生成的内容没有通过验证，状态未改变，可以重试',
        };
        yield { type: 'done', stateVersion: expectedVersion, ended: false, exitReason: null };
        return;
      }
      proposalText = validated.text;
    } catch (error) {
      if (signal.aborted) {
        await store.appendCancellationEvent(sessionId, session.generation + 1, expectedVersion);
        return;
      }
      await store.appendAuditEvent(sessionId, 'TURN_FAILED', {
        stage: 'gateway',
        message: error instanceof Error ? error.message : String(error),
        semanticAction,
      }, expectedVersion);
      yield {
        type: 'error',
        code: 'LLM_GATEWAY_ERROR',
        message: '这一轮生成失败了（状态未改变）。可以重试，或说"好了"结束。',
      };
      yield { type: 'done', stateVersion: expectedVersion, ended: false, exitReason: null };
      return;
    }

    // 内容落地 + 用户模型登记（确定性）
    const turnNumber = state.turn + 1;
    const kind: TurnKind = isFirstTurn
      ? 'FIRST_LAYER'
      : policyAction === 'SIMULATE'
        ? 'SIMULATION_RESULT'
        : semanticAction === 'CORRECTION'
          ? 'CORRECTION_EXPLAIN'
          : policyAction === 'EXPLAIN'
            ? 'EXPLANATION'
            : 'ANSWER';
    state.history.push({
      turn: turnNumber,
      semanticAction,
      policyAction,
      userText: raw,
      kind,
      content: proposalText,
      at: new Date().toISOString(),
    });
    state.turn = turnNumber;
    if (semanticAction === 'WHY' || semanticAction === 'DIRECT_ANSWER') {
      state.userModel.questions.push(raw);
    }
    if (semanticAction === 'CORRECTION') {
      state.userModel.corrections.push(raw);
    }
    state.goal.satisfaction = Math.min(
      1,
      state.goal.satisfaction +
        (semanticAction === 'WHAT_IF' ? 0.15 : semanticAction === 'WHY' ? 0.1 : 0.05)
    );

    const waiting = transitionExperience(state.view, 'RESPONSE_COMPLETED');
    if (!waiting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '等待态迁移被拒绝' };
      return;
    }
    state.view = waiting.next;

    // 原子提交（版本守卫——GS-05）
    const ok = await store.commitTurn({
      sessionId,
      expectedVersion,
      newState: state,
      newStatus: 'ACTIVE',
      exitReason: null,
      events: [
        { type: 'POLICY_DECIDED', payload: { semanticAction, policyAction, policy: POLICY_VERSION, stateMachine: STATE_MACHINE_VERSION } },
        { type: 'CONTENT_DELIVERED', payload: { turn: turnNumber, kind, length: proposalText.length } },
        { type: 'STATE_UPDATED', payload: { view: state.view } },
      ],
    });
    if (!ok) {
      yield {
        type: 'error',
        code: 'VERSION_CONFLICT',
        message: '这一轮结果到达时状态已被更新（迟到写入已拒绝）',
      };
      return;
    }
    yield { type: 'content', turn: turnNumber, kind, text: proposalText, stateVersion: expectedVersion + 1 };
    yield { type: 'state', stateVersion: expectedVersion + 1, view: state.view, state };
    yield { type: 'done', stateVersion: expectedVersion + 1, ended: false, exitReason: null };
  }

  /** 显式停止按钮（与"好了"同一条确定性路径）。 */
  async *stop(sessionId: string, expectedVersion: number): AsyncGenerator<TurnEvent> {
    yield* this.runTurn(sessionId, '好了', expectedVersion, new AbortController().signal);
  }
}

/** 单例（本切片单进程部署）。 */
import { HttpLlmGateway } from './llm-gateway';
let runtimeInstance: ExperienceRuntime | null = null;
export function getRuntime(): ExperienceRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new ExperienceRuntime(new HttpLlmGateway());
  }
  return runtimeInstance;
}
