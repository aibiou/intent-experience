/**
 * Runtime——产品状态的唯一写入者（S1 + S2a 切片核心）。
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
 *
 * S2a 编排（F-2 完整 Creation / F-3 完整 Correction / F-4 WHAT_IF 分支 /
 * F-5 Minimal Memory——均经本文件单一写入者，域操作随轮次版本化）：
 * - 创作会话输入路由（对齐参考 runtime 语义）：分类器 UNKNOWN/CORRECTION
 *   层的输入在活跃创作下经 interpretCreationInput 解释——完成信号 →
 *   STOP 执行路径登记（D-05 选项 A）；修改意图 → CREATE 伞形补丁轮次；
 *   冲突判据 → ASK（至多一个澄清问题，08 §16，子状态不推进）。
 *   修改意图不落入通用 CORRECTION → EXPLAIN 路径（冻结文本 §3 变更 2）。
 * - RESTORE 预检（D-04 选项 A）：恢复词表先判（"撤销刚才修改"亦含修改
 *   词，须先按恢复语义路由）；版本 > 1 才有上一版本可恢复。
 * - 创作子状态机（E2 Stage 5）：首建 CREATE_INTENT→CONTEXT_INHERIT→
 *   MINIMAL_BUILD→PREVIEW 同轮编排（LLM 最小构建）；反馈轮
 *   PREVIEW→feedback_started→USER_FEEDBACK→patch_applied→PREVIEW
 *   多轮循环；完成信号只在反馈轮有效（PREVIEW→USER_FEEDBACK→completed，
 *   13 §21 补丁必经预览、完成必经用户反馈）。
 * - WHAT_IF 分支域（F-4）：模拟结果四元分离确定性切分并登记轮次
 *   （首轮自动建分支）；分支操作（SWITCH/ABANDON/RETURN/ADOPT_BRANCH）
 *   为确定性系统轮次（不调用模型）；WHAT_IF 自 CREATION 阶段非法
 *   （冻结契约）——按冲突判据 ASK 或诚实拒绝。
 * - 记忆域（F-5 唯一跨会话域）：读侧 retrieveRelevant（懒到期 + RECALL
 *   迁移 + 2 字滑窗相关性）注入提示；写侧 recordMemory（07 §7 过滤）；
 *   用户显式 withdraw/correct 为确定性系统轮次。读写仅经本文件。
 *
 * S2b 编排（媒体生成切片——产品负责人指令 2026-10-10：问答过程中
 * 识别用户意图，自动调用相应文本 / 语音 / 图像 / 视频模型进行生成）：
 * - 生成意图只认领分类器 UNKNOWN / CHANGE_DIRECTION 层的输入
 *   （零黄金回归面）；对话回应照常进行，媒体产物随流追加。
 * - 路由（对齐参考 http.ts L586-596）：呈现/收听类（useContext）
 *   借 REPEAT 的重放语义提供生成材料（语音=完整重放供 TTS 朗读；
 *   视觉=CR-56 收敛为一句简短引导）；直接创作类走 CREATE 伞形
 *   （创作域预览 + 媒体随流追加）；「换一张图片」再生成特例路由
 *   CREATE（避免误触方向变更结束会话）。
 * - 媒体生成不改变会话状态：轮次先提交，生成随后（started →
 *   completed | failed | unconfigured）；失败不回滚轮次。
 * - REPEAT 为确定性重放（无 LLM）：重放上一条可呈现内容轮；
 *   无可重放内容时回退内容轮（回答照常进行 + 生成随流追加）。
 */

import { classifyInput } from './classifier';
import { getSeed, matchSeed, randomSeed } from './catalog';
import type { CreationInterpretation, CreationObject, CreationPatch, CreationPhase } from './creation';
import {
  applyCreationPatchMeta,
  buildRestorePatch,
  inheritCreationContext,
  interpretCreationInput,
  nextCreationPhase,
} from './creation';
import type { LlmGateway } from './llm-gateway';
import { getMediaGateway, MediaGatewayError, type MediaGateway } from './media-gateway';
import {
  recognizeGenerationIntent,
  shouldCompactReplay,
  type GenerationIntent,
} from './generation-intent';
import type { MemoryRecord } from './memory';
import { correctMemory, extractCorrectedTopic, recordMemory, retrieveRelevant, withdrawMemory } from './memory';
import { POLICY_VERSION, resolvePolicy } from './policy';
import {
  buildCorrectionPrompt,
  buildCreationFirstPrompt,
  buildCreationPatchPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  type MemorySignalInput,
} from './prompt-engine';
import {
  applyBranchOperation,
  deriveSimulationSeparation,
  interpretBranchOperation,
  recordSimulationRound,
  validateBranchOperation,
} from './simulation';
import type { BranchOperation } from './simulation';
import { STATE_MACHINE_VERSION, transitionExperience } from './state-machine';
import * as store from './store';
import type { SessionRow } from './store';
import type { ExperienceState, TurnEvent, TurnKind } from './types';
import { validateProposal } from './validator';

export interface StartInput {
  seedId?: string;
  entry?: string; // 入口屏选定的角度 prompt（或种子默认 prompt）
  freeText?: string; // 首页自由输入（意图解析入口）
}

const BOUNDARY_NOTICES: Record<string, string> = {
  DEEPEN: '深入展开是下一个切片的方向性操作。现在你可以直接问出想深入的那一点，或者提一个"如果…"。',
  SIMPLIFY: '换一个更简单的讲法是下一个切片的方向性操作。你可以直接说"再简单点告诉我哪里看不懂"，我会直接回答。',
  REFRAME: '换角度重讲是下一个切片的方向性操作。你可以直接说出想换的角度。',
};

/** S2b：可重放的内容轮 kind（通知/澄清/完成不参与重放）。 */
const REPLAYABLE_KINDS: ReadonlySet<string> = new Set([
  'FIRST_LAYER',
  'ANSWER',
  'EXPLANATION',
  'SIMULATION_RESULT',
  'CORRECTION_EXPLAIN',
  'CREATION_PREVIEW',
  'CREATION_PATCHED',
]);

const UNKNOWN_NOTICE =
  '这句话我还没能理解。这个切片里你可以：问"为什么"、提一个"如果…"、说"继续"，或者随时说"好了"结束。';

/** WHAT_IF 自 CREATION 阶段非法（冻结契约）的诚实边界说明。 */
const WHAT_IF_IN_CREATION_NOTICE =
  '创作进行时暂时不能开新的模拟。你可以继续修改这个作品，说"就这样"完成它，或者直接提问题；想结束可以说"好了"。';

export class ExperienceRuntime {
  constructor(
    private readonly gateway: LlmGateway,
    private readonly media: MediaGateway = getMediaGateway()
  ) {}

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

    // ── S2a F-5：记忆操作路由（仅认领 UNKNOWN 层输入——零黄金回归面）──
    if (classification.memoryIntent) {
      yield* this.runMemoryOperationTurn(sessionId, session, state, raw, classification.memoryIntent, expectedVersion);
      return;
    }

    // ── S2b：生成意图路由（只认领 UNKNOWN / CHANGE_DIRECTION 层——零黄金
    // 回归面；对话回应照常进行，媒体产物随流追加）──
    let generationIntent: GenerationIntent | null = null;
    {
      const semanticActionBefore = classification.semanticAction;
      if (semanticActionBefore === 'UNKNOWN' || semanticActionBefore === 'CHANGE_DIRECTION') {
        generationIntent = recognizeGenerationIntent(raw);
      }
    }

    // ── S2a：创作会话内输入路由（对齐参考 runtime：UNKNOWN / CORRECTION 层）──
    let semanticAction = classification.semanticAction;
    let creationIntent: CreationInterpretation | null = null;
    let creationCompletionSignal = false;
    const activeDomain =
      state.creation && state.creation.active && state.creation.creation.phase !== 'COMPLETE' ? state.creation : null;
    const activeCreation = activeDomain ? activeDomain.creation : null;

    if (semanticAction === 'UNKNOWN' && activeCreation) {
      const interpretation = interpretCreationInput(raw, activeCreation);
      if (interpretation.kind === 'completion') {
        // 08 §27 完成信号：经 STOP 执行路径在创作域登记（D-05 选项 A）。
        semanticAction = 'STOP';
        creationCompletionSignal = true;
      } else if (interpretation.kind === 'modification' || interpretation.kind === 'ambiguous') {
        // 创作修改意图 / 冲突判据：创作域伞形动作 CREATE（PD-23 §5）。
        semanticAction = 'CREATE';
        creationIntent = interpretation;
      }
      // kind === 'none'：保持 UNKNOWN，走范围外升级拒绝。
    }
    if (semanticAction === 'CORRECTION' && activeCreation) {
      if (classification.correctionIntent === 'restore' && activeCreation.version > 1) {
        // RESTORE 预检（D-04 选项 A）：恢复词表先判（"撤销刚才修改"亦含
        // 修改词）；版本 > 1 才有上一版本可恢复。
        semanticAction = 'CREATE';
        creationIntent = {
          kind: 'modification',
          patch: buildRestorePatch(activeCreation, activeCreation.version - 1, raw),
        };
      } else {
        const correctionInterpretation = interpretCreationInput(raw, activeCreation);
        if (correctionInterpretation.kind === 'completion') {
          semanticAction = 'STOP';
          creationCompletionSignal = true;
        } else if (
          correctionInterpretation.kind === 'modification' ||
          correctionInterpretation.kind === 'ambiguous'
        ) {
          semanticAction = 'CREATE';
          creationIntent = correctionInterpretation;
        }
        // kind === 'none'：保持 CORRECTION，走通用纠正路径（G07 完整语义）。
      }
    }

    // 生成意图改写（在创作域路由之后——生成意图优先认领，对齐参考
    // http 层先于 runtime 创作路由的顺序）：改写后的动作进入策略解析。
    if (generationIntent) {
      if (semanticAction === 'UNKNOWN') {
        semanticAction = generationIntent.useContext ? 'REPEAT' : 'CREATE';
      } else if (semanticAction === 'CHANGE_DIRECTION') {
        // 再生成特例（「换一张图片，夏天的服装」）：模态词在场时「换」
        // 指向媒体再生成而非体验方向变更——否则会误触会话结束。
        semanticAction = 'CREATE';
      }
    }

    const resolution = resolvePolicy(semanticAction);
    // 范围外 / 未知：零版本零事件升级（确定性边界说明，不调用模型）。
    if (!resolution.ok) {
      yield {
        type: 'trace',
        turn: state.turn,
        semanticAction,
        policyAction: 'OUT_OF_SLICE_SCOPE',
        fromVersion: expectedVersion,
      };
      yield {
        type: 'content',
        turn: state.turn,
        kind: 'BOUNDARY_NOTICE',
        text: BOUNDARY_NOTICES[semanticAction] ?? UNKNOWN_NOTICE,
        stateVersion: expectedVersion,
      };
      yield { type: 'done', stateVersion: expectedVersion, ended: false, exitReason: null };
      return;
    }

    const policyAction = resolution.policyAction;
    yield {
      type: 'trace',
      turn: state.turn,
      semanticAction,
      policyAction,
      fromVersion: expectedVersion,
    };

    // ── GS-04：STOP——确定性、零续行、不调用模型 ──
    if (policyAction === 'STOP') {
      yield* this.runStopTurn(sessionId, state, semanticAction, creationCompletionSignal, expectedVersion);
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
      // 创作域终止登记（方向变更——历史保留，标记结束原因）。
      if (state.creation && state.creation.active) {
        state.creation = { ...state.creation, active: false, endedReason: 'direction_changed' };
      }
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
      yield { type: 'state', stateVersion: expectedVersion + 1, view: state.view, state };
      yield { type: 'done', stateVersion: expectedVersion + 1, ended: true, exitReason: 'direction_changed' };
      return;
    }

    // ── S2b：REPEAT——上一条内容的确定性重放（无 LLM；生成意图的语义载体）──
    if (policyAction === 'REPEAT') {
      yield* this.runRepeatTurn(sessionId, session, state, raw, semanticAction, expectedVersion, signal, generationIntent);
      return;
    }

    // ── S2a F-2：CREATE——创作域轮次 ──
    if (policyAction === 'CREATE') {
      if (creationIntent && creationIntent.kind === 'ambiguous') {
        // ASK 轮次（08 §16：至多一个澄清问题；创作子状态不推进；确定性）。
        yield* this.runCreationAskTurn(sessionId, state, raw, semanticAction, creationIntent, expectedVersion);
        return;
      }
      if (creationIntent && creationIntent.kind === 'modification') {
        yield* this.runCreationPatchTurn(sessionId, session, state, raw, semanticAction, creationIntent.patch, expectedVersion, signal);
        return;
      }
      // 首建（无活跃创作）或取代（活跃创作被新 CREATE 取代——历史保留）。
      yield* this.runCreationFirstTurn(sessionId, session, state, raw, semanticAction, expectedVersion, signal, generationIntent);
      return;
    }

    // ── S2a F-4：SIMULATE——分支域路由 ──
    if (policyAction === 'SIMULATE') {
      if (activeCreation) {
        // WHAT_IF 自 CREATION 阶段非法（冻结契约）：按冲突判据 ASK 或诚实拒绝。
        const interpretation = interpretCreationInput(raw, activeCreation);
        if (interpretation.kind === 'ambiguous') {
          yield* this.runCreationAskTurn(sessionId, state, raw, semanticAction, interpretation, expectedVersion);
        } else {
          yield {
            type: 'content',
            turn: state.turn,
            kind: 'BOUNDARY_NOTICE',
            text: WHAT_IF_IN_CREATION_NOTICE,
            stateVersion: expectedVersion,
          };
          yield { type: 'done', stateVersion: expectedVersion, ended: false, exitReason: null };
        }
        return;
      }
      const branchOperation = interpretBranchOperation(raw);
      if (branchOperation) {
        // 分支操作轮次（D-03 选项 A 四操作 + ADOPT_BRANCH；确定性系统回合）。
        yield* this.runBranchOperationTurn(sessionId, state, raw, branchOperation, expectedVersion);
        return;
      }
      // 普通 SIMULATE：走内容轮（四元分离 + 轮次登记 + 分支记录）。
    }

    // ── 内容轮：ANSWER / EXPLAIN / SIMULATE（G07 纠正 = EXPLAIN 变体）──
    yield* this.runContentTurn(sessionId, session, state, raw, semanticAction, policyAction, expectedVersion, signal, generationIntent);
    return;
  }

  /** 显式停止按钮（与"好了"同一条确定性路径）。 */
  async *stop(sessionId: string, expectedVersion: number): AsyncGenerator<TurnEvent> {
    yield* this.runTurn(sessionId, '好了', expectedVersion, new AbortController().signal);
  }

  // -------------------------------------------------------------------------
  // S2a F-5：记忆操作轮次（确定性——不调用模型）
  // -------------------------------------------------------------------------

  private async *runMemoryOperationTurn(
    sessionId: string,
    session: SessionRow,
    state: ExperienceState,
    raw: string,
    memoryIntent: 'withdraw' | 'correct',
    expectedVersion: number
  ): AsyncGenerator<TurnEvent> {
    void session;
    // 前置视图迁移校验（先于任何记忆变异——被拒绝的轮次不得留下副作用）：
    // 纯状态机检查（零写入），失败即整轮拒绝（OBL-01 同族纪律——
    // 记忆写入与轮次提交必须同为"全成或全不成"，不允许"轮次被拒但记忆已变"）。
    const acting = transitionExperience(state.view, 'USER_ACTION');
    if (!acting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '当前状态无法执行记忆操作' };
      return;
    }
    state.view = acting.next;

    const records = await store.loadMemoryRecords();
    const now = new Date().toISOString();
    const searchText = memoryIntent === 'correct' ? (extractCorrectedTopic(raw) ?? raw) : raw;
    const target = findRecordByText(records, searchText);

    let noticeText: string;
    let saved: MemoryRecord[] = [];
    if (!target) {
      noticeText =
        memoryIntent === 'withdraw'
          ? '没有找到与这句话相关的记忆。记忆只记录你探索过的主题——撤回时提一下主题的名字会更容易找到。'
          : '没有找到与这句话相关的记忆，没有需要纠正的内容。';
    } else if (memoryIntent === 'withdraw') {
      const result = withdrawMemory(records, target.recordId, now);
      if (result.ok) {
        saved = [result.record];
        noticeText = `已撤回关于「${target.topic}」的记忆。它不会再出现在以后的探索里。`;
      } else {
        noticeText = '这条记忆已经失效，不需要再撤回。';
      }
    } else {
      const correctedTopic = extractCorrectedTopic(raw);
      const result = correctMemory(records, target.recordId, { correctedTopic, now });
      if (result.ok) {
        saved = [result.record];
        noticeText = correctedTopic
          ? `已把记忆「${target.topic}」更正为「${correctedTopic}」。以后按更正后的主题理解。`
          : `已把记忆「${target.topic}」标记为已纠正。`;
      } else {
        noticeText = '这条记忆已经失效，无法纠正。';
      }
    }
    await store.saveMemoryRecords(saved);

    const turnNumber = state.turn + 1;
    state.history.push({
      turn: turnNumber,
      semanticAction: memoryIntent === 'withdraw' ? 'MEMORY_WITHDRAW' : 'MEMORY_CORRECT',
      policyAction: 'MEMORY_OPERATION',
      userText: raw,
      kind: 'MEMORY_NOTICE',
      content: noticeText,
      at: now,
    });
    state.turn = turnNumber;

    const waiting = transitionExperience(state.view, 'RESPONSE_COMPLETED');
    if (!waiting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '等待态迁移被拒绝' };
      return;
    }
    state.view = waiting.next;

    const ok = await store.commitTurn({
      sessionId,
      expectedVersion,
      newState: state,
      newStatus: 'ACTIVE',
      exitReason: null,
      events: [
        {
          type: 'POLICY_DECIDED',
          payload: {
            semanticAction: memoryIntent === 'withdraw' ? 'MEMORY_WITHDRAW' : 'MEMORY_CORRECT',
            policyAction: 'MEMORY_OPERATION',
            deterministic: true,
            policy: POLICY_VERSION,
            stateMachine: STATE_MACHINE_VERSION,
          },
        },
        { type: 'MEMORY_OPERATION', payload: { intent: memoryIntent, targetTopic: target ? target.topic : null } },
        { type: 'STATE_UPDATED', payload: { view: state.view } },
      ],
    });
    if (!ok) {
      yield { type: 'error', code: 'VERSION_CONFLICT', message: '这一轮结果到达时状态已被更新（迟到写入已拒绝）' };
      return;
    }
    yield { type: 'content', turn: turnNumber, kind: 'MEMORY_NOTICE', text: noticeText, stateVersion: expectedVersion + 1 };
    yield { type: 'state', stateVersion: expectedVersion + 1, view: state.view, state };
    yield { type: 'done', stateVersion: expectedVersion + 1, ended: false, exitReason: null };
  }

  // -------------------------------------------------------------------------
  // S2b：REPEAT 轮次（确定性重放）与媒体生成编排
  // -------------------------------------------------------------------------

  /**
   * S2b：REPEAT 轮次——上一条可呈现内容的确定性重放（不调用模型）。
   *
   * - 语音朗读类（「读给我听 / 声音我听听」）：完整重放（用户要「听」
   *   的是内容本身），重放文本即 TTS 材料。
   * - 视觉呈现类（「用图片展现刚才的内容 / 图片我看看」）：CR-56
   *   收敛——完整重放会污染对话流，收敛为一句简短引导；画面提示词
   *   由被重放内容蒸馏。
   * - 视频呈现类：同样完整重放；随后编排层给出诚实「未接入」。
   * - 会话内无可重放内容（首条输入即呈现类表达）：回退内容轮——回答
   *   照常进行 + 生成随流追加（新生成的回答即材料）。
   */
  private async *runRepeatTurn(
    sessionId: string,
    session: SessionRow,
    state: ExperienceState,
    raw: string,
    semanticAction: string,
    expectedVersion: number,
    signal: AbortSignal,
    generationIntent: GenerationIntent | null
  ): AsyncGenerator<TurnEvent> {
    const last = [...state.history].reverse().find((h) => REPLAYABLE_KINDS.has(h.kind));
    if (!last) {
      // 无可呈现内容：回退内容轮（DIRECT_ANSWER + 生成随流追加）。
      yield* this.runContentTurn(
        sessionId,
        session,
        state,
        raw,
        'DIRECT_ANSWER',
        'ANSWER',
        expectedVersion,
        signal,
        generationIntent
      );
      return;
    }
    // CR-56 收敛仅限图像呈现类（视频走完整重放 + 诚实未接入，避免
    // 「正在生成」引导语与未接入说明自相矛盾）。
    const compact = generationIntent !== null && generationIntent.modality === 'image' && shouldCompactReplay(raw);
    const content = compact ? '好的，把刚才的内容画出来——正在生成，马上就好。' : last.content;

    const acting = transitionExperience(state.view, 'USER_ACTION');
    if (!acting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '状态迁移被拒绝（非法转移）' };
      return;
    }
    state.view = acting.next;

    const now = new Date().toISOString();
    const turnNumber = state.turn + 1;
    state.history.push({
      turn: turnNumber,
      semanticAction,
      policyAction: 'REPEAT',
      userText: raw,
      kind: 'ANSWER',
      content,
      at: now,
    });
    state.turn = turnNumber;

    const waiting = transitionExperience(state.view, 'RESPONSE_COMPLETED');
    if (!waiting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '等待态迁移被拒绝' };
      return;
    }
    state.view = waiting.next;

    const ok = await store.commitTurn({
      sessionId,
      expectedVersion,
      newState: state,
      newStatus: 'ACTIVE',
      exitReason: null,
      events: [
        {
          type: 'POLICY_DECIDED',
          payload: {
            semanticAction,
            policyAction: 'REPEAT',
            replay: true,
            compact,
            policy: POLICY_VERSION,
            stateMachine: STATE_MACHINE_VERSION,
          },
        },
        { type: 'CONTENT_DELIVERED', payload: { turn: turnNumber, kind: 'ANSWER', replay: true, compact } },
        { type: 'STATE_UPDATED', payload: { view: state.view } },
      ],
    });
    if (!ok) {
      yield { type: 'error', code: 'VERSION_CONFLICT', message: '这一轮结果到达时状态已被更新（迟到写入已拒绝）' };
      return;
    }
    yield { type: 'content', turn: turnNumber, kind: 'ANSWER', text: content, stateVersion: expectedVersion + 1 };
    yield { type: 'state', stateVersion: expectedVersion + 1, view: state.view, state };
    if (generationIntent) {
      yield* this.runGeneration(generationIntent, last.content, sessionId, turnNumber, signal);
    }
    yield { type: 'done', stateVersion: expectedVersion + 1, ended: false, exitReason: null };
  }

  /**
   * S2b：媒体生成编排——对话回应之后的随流追加（answer 先行纪律）。
   *
   * 生成不改变会话状态：轮次已提交，媒体是体验产物（失败不回滚轮次）。
   * 提示词构建：语音 = 重放/回答内容（≤1000 字符，TTS 单次上限）；
   * 视觉呈现类 = 上一轮内容经 LLM 蒸馏（失败回退确定性首段——
   * 蒸馏是增强项绝不阻塞）；直接创作 = 用户原话（短输入轻量增富）。
   */
  private async *runGeneration(
    intent: GenerationIntent,
    material: string,
    sessionId: string,
    turn: number,
    signal: AbortSignal
  ): AsyncGenerator<TurnEvent> {
    if (intent.modality === 'video') {
      yield {
        type: 'generation',
        status: 'unconfigured',
        turn,
        modality: 'video',
        message: '视频生成还没有接入。图片和语音现在就可以：说「画一张…的图片」，或者「读给我听」试试。',
      };
      return;
    }
    if (signal.aborted) return;
    try {
      let promptUsed: string;
      if (intent.modality === 'voice') {
        // 朗读类：材料是重放/回答内容；直接语音类（「用语音说…」）用用户原话。
        promptUsed = (intent.useContext || intent.referential ? material : intent.prompt).slice(0, 1000);
      } else if (intent.useContext || intent.referential) {
        promptUsed = await this.distillVisualPrompt(material, signal);
      } else {
        // 直接创作（CREATE 路由）：用户原话就是画面主题；短输入轻量增富
        // （对齐参考 enrichPrompt——裸短语直达 t2i 会因无主体回落默认人像）。
        promptUsed = intent.prompt.trim().length < 16 ? `${intent.prompt.trim()}，画面温馨自然，细节丰富` : intent.prompt.trim();
      }
      if (promptUsed.trim().length === 0) {
        yield {
          type: 'generation',
          status: 'failed',
          turn,
          modality: intent.modality,
          message: '没有可供生成的内容',
        };
        return;
      }
      yield { type: 'generation', status: 'started', turn, modality: intent.modality, prompt: promptUsed };
      const record =
        intent.modality === 'image'
          ? await this.media.generateImage(promptUsed, { sessionId, turn, signal })
          : await this.media.generateVoice(promptUsed, { sessionId, turn, signal });
      if (signal.aborted) return; // 产物已落盘但用户已离开：不投递
      yield {
        type: 'generation',
        status: 'completed',
        turn,
        modality: intent.modality,
        url: `/api/experience/media/${record.file}`,
        promptUsed,
        mime: record.mime,
      };
    } catch (error) {
      if (signal.aborted) return;
      const message =
        error instanceof MediaGatewayError && !error.retryable
          ? error.message
          : '这次没生成出来，可以稍后再试一次';
      yield { type: 'generation', status: 'failed', turn, modality: intent.modality, message };
    }
  }

  /**
   * S2b：视觉提示词蒸馏——上一轮内容 → 40-80 字画面描述。
   * 蒸馏是增强项绝不阻塞：LLM 失败时回退确定性首段（≤90 字）。
   */
  private async distillVisualPrompt(material: string, signal: AbortSignal): Promise<string> {
    const source = material.slice(0, 700);
    const fallback = source.split(/\n{2,}/)[0]?.slice(0, 90) ?? source.slice(0, 90);
    try {
      const proposal = await this.gateway.generate({
        systemPrompt:
          '你是画面导演。把给定内容浓缩成一句 40 到 80 字的中文画面描述：只描述可见的画面（主体、场景、光线、氛围），不出现「画」「图片」字样，不做任何解释，不加引号，直接输出这一句描述。',
        userPrompt: source,
        signal,
      });
      const text = proposal.text
        .trim()
        .replace(/^[「『"']+/, '')
        .replace(/[」』"']+$/, '')
        .slice(0, 120);
      return text.length > 0 ? text : fallback;
    } catch {
      return fallback;
    }
  }

  // -------------------------------------------------------------------------
  // S2a F-2：创作轮次（首建 / 补丁 / ASK）
  // -------------------------------------------------------------------------

  /** 首建（或取代旧创作）：CREATE_INTENT→CONTEXT_INHERIT→MINIMAL_BUILD→PREVIEW 同轮编排。 */
  private async *runCreationFirstTurn(
    sessionId: string,
    session: SessionRow,
    state: ExperienceState,
    raw: string,
    semanticAction: string,
    expectedVersion: number,
    signal: AbortSignal,
    generationIntent: GenerationIntent | null = null
  ): AsyncGenerator<TurnEvent> {
    const isFirstTurn = state.turn === 0 && state.view.status === 'ENTERING';
    if (isFirstTurn) {
      const started = transitionExperience(state.view, 'EXPERIENCE_STARTED');
      if (!started.ok) {
        yield { type: 'error', code: 'INVALID_INPUT', message: '体验启动状态非法' };
        return;
      }
      state.view = started.next;
    }
    const createT = transitionExperience(state.view, 'CREATE');
    if (!createT.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '当前状态无法开始创作' };
      return;
    }
    state.view = createT.next;

    // 取代登记（superseded_by_create——历史保留）。
    const superseded = Boolean(state.creation && state.creation.active);
    if (superseded) {
      state.creation = { ...state.creation!, active: false, endedReason: 'superseded_by_create' };
    }

    // 上下文继承（08 §4/§6/§25 五项）+ 记忆信号。
    const inherited = inheritCreationContext({
      theme: state.topic,
      actionHistory: state.history.map((entry) => entry.semanticAction),
      createInput: raw,
    });
    const memoryContext = await this.loadMemorySignals(raw);
    const systemPrompt = buildSystemPrompt(state, memoryContext.signals);
    const userPrompt = buildCreationFirstPrompt(inherited, raw);

    let content: string;
    try {
      const proposal = await this.gateway.generate({ systemPrompt, userPrompt, signal });
      if (signal.aborted) {
        await store.appendCancellationEvent(sessionId, session.generation + 1, expectedVersion);
        return;
      }
      const validated = validateProposal(proposal);
      if (!validated.ok) {
        await store.appendAuditEvent(sessionId, 'TURN_FAILED', { stage: 'validation', code: validated.code, semanticAction }, expectedVersion);
        yield { type: 'error', code: 'LLM_PROPOSAL_INVALID', message: '这一轮生成的内容没有通过验证，状态未改变，可以重试' };
        yield { type: 'done', stateVersion: expectedVersion, ended: false, exitReason: null };
        return;
      }
      content = validated.text;
    } catch (error) {
      if (signal.aborted) {
        await store.appendCancellationEvent(sessionId, session.generation + 1, expectedVersion);
        return;
      }
      await store.appendAuditEvent(sessionId, 'TURN_FAILED', { stage: 'gateway', message: error instanceof Error ? error.message : String(error), semanticAction }, expectedVersion);
      yield { type: 'error', code: 'LLM_GATEWAY_ERROR', message: '这一轮生成失败了（状态未改变）。可以重试，或说"好了"结束。' };
      yield { type: 'done', stateVersion: expectedVersion, ended: false, exitReason: null };
      return;
    }

    // 创作对象 + 域登记（子状态机链合法性校验：PREVIEW 必经）。
    const now = new Date().toISOString();
    const p1 = nextCreationPhase('CREATE_INTENT', 'context_inherited');
    const p2 = p1 ? nextCreationPhase(p1, 'minimal_built') : null;
    const p3 = p2 ? nextCreationPhase(p2, 'previewed') : null;
    if (!p1 || !p2 || !p3) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '创作阶段迁移被拒绝（非法转移）' };
      return;
    }
    const creation: CreationObject = {
      creationId: `creation_${sessionId.slice(-6)}_${String(expectedVersion).padStart(3, '0')}`,
      sourceSession: sessionId,
      sourceStateVersion: expectedVersion,
      concept: { theme: state.topic, goal: inherited.newGoal },
      content,
      userChanges: [],
      version: 1,
      phase: p3,
      createdAt: now,
      updatedAt: now,
    };
    state.creation = { creation, active: true, contentHistory: [content] };

    const turnNumber = state.turn + 1;
    state.history.push({
      turn: turnNumber,
      semanticAction,
      policyAction: 'CREATE',
      userText: raw,
      kind: 'CREATION_PREVIEW',
      content,
      at: now,
    });
    state.turn = turnNumber;
    state.goal.satisfaction = Math.min(1, state.goal.satisfaction + 0.05);

    const observed = recordMemory(memoryContext.records, {
      topic: state.topic,
      intentSignal: 'topic_observation',
      source: 'session_observation',
      now,
    });
    if (observed.ok) {
      await store.saveMemoryRecords([observed.record]);
    }

    const waiting = transitionExperience(state.view, 'RESPONSE_COMPLETED');
    if (!waiting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '等待态迁移被拒绝' };
      return;
    }
    state.view = waiting.next;

    const ok = await store.commitTurn({
      sessionId,
      expectedVersion,
      newState: state,
      newStatus: 'ACTIVE',
      exitReason: null,
      events: [
        { type: 'POLICY_DECIDED', payload: { semanticAction, policyAction: 'CREATE', policy: POLICY_VERSION, stateMachine: STATE_MACHINE_VERSION } },
        { type: 'CREATION_PREVIEWED', payload: { version: 1, goal: inherited.newGoal, superseded } },
        { type: 'STATE_UPDATED', payload: { view: state.view } },
      ],
    });
    if (!ok) {
      yield { type: 'error', code: 'VERSION_CONFLICT', message: '这一轮结果到达时状态已被更新（迟到写入已拒绝）' };
      return;
    }
    yield { type: 'content', turn: turnNumber, kind: 'CREATION_PREVIEW', text: content, stateVersion: expectedVersion + 1 };
    yield { type: 'state', stateVersion: expectedVersion + 1, view: state.view, state };
    if (generationIntent) {
      // S2b：直接创作类的媒体随流追加（「画一张风图」→ 作品预览 + 图片）。
      // 材料参数在直接创作分支不参与（runGeneration 用 intent.prompt）。
      yield* this.runGeneration(generationIntent, raw, sessionId, turnNumber, signal);
    }
    yield { type: 'done', stateVersion: expectedVersion + 1, ended: false, exitReason: null };
  }

  /** 补丁轮次：PREVIEW→USER_FEEDBACK→(LLM 局部修改)→PREVIEW（多轮循环）。 */
  private async *runCreationPatchTurn(
    sessionId: string,
    session: SessionRow,
    state: ExperienceState,
    raw: string,
    semanticAction: string,
    patch: CreationPatch,
    expectedVersion: number,
    signal: AbortSignal
  ): AsyncGenerator<TurnEvent> {
    const domain = state.creation;
    if (!domain || !domain.active) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '没有进行中的创作，无法应用修改' };
      return;
    }
    const creation = domain.creation;

    // 子状态机：PREVIEW → feedback_started → USER_FEEDBACK → patch_applied → PREVIEW。
    let phase: CreationPhase | null = creation.phase;
    if (phase === 'PREVIEW') {
      phase = nextCreationPhase(phase, 'feedback_started');
    }
    if (!phase || phase !== 'USER_FEEDBACK') {
      yield { type: 'error', code: 'INVALID_INPUT', message: '创作阶段无法应用修改（非法转移）' };
      return;
    }
    const afterPatchPhase = nextCreationPhase('USER_FEEDBACK', 'patch_applied');
    if (!afterPatchPhase) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '创作阶段迁移被拒绝（非法转移）' };
      return;
    }

    const acting = transitionExperience(state.view, 'USER_ACTION');
    if (!acting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '状态迁移被拒绝（非法转移）' };
      return;
    }
    state.view = acting.next;

    const memoryContext = await this.loadMemorySignals(raw);
    const systemPrompt = buildSystemPrompt(state, memoryContext.signals);

    let newContent: string;
    if (patch.operation === 'restore') {
      // RESTORE 内容回填（08 §28：新版本内容 = 目标历史版本内容——确定性，
      // 不调用模型；无历史（防御）时保底当前内容）。
      const fromVersion = patch.change.restoreFromVersion ?? Math.max(1, creation.version - 1);
      const history = domain.contentHistory ?? [];
      newContent = history[fromVersion - 1] ?? creation.content;
    } else {
      try {
        const userPrompt = buildCreationPatchPrompt(creation, patch);
        const proposal = await this.gateway.generate({ systemPrompt, userPrompt, signal });
        if (signal.aborted) {
          await store.appendCancellationEvent(sessionId, session.generation + 1, expectedVersion);
          return;
        }
        const validated = validateProposal(proposal);
        if (!validated.ok) {
          await store.appendAuditEvent(sessionId, 'TURN_FAILED', { stage: 'validation', code: validated.code, semanticAction }, expectedVersion);
          yield { type: 'error', code: 'LLM_PROPOSAL_INVALID', message: '这一轮生成的内容没有通过验证，状态未改变，可以重试' };
          yield { type: 'done', stateVersion: expectedVersion, ended: false, exitReason: null };
          return;
        }
        newContent = validated.text;
      } catch (error) {
        if (signal.aborted) {
          await store.appendCancellationEvent(sessionId, session.generation + 1, expectedVersion);
          return;
        }
        await store.appendAuditEvent(sessionId, 'TURN_FAILED', { stage: 'gateway', message: error instanceof Error ? error.message : String(error), semanticAction }, expectedVersion);
        yield { type: 'error', code: 'LLM_GATEWAY_ERROR', message: '这一轮生成失败了（状态未改变）。可以重试，或说"好了"结束。' };
        yield { type: 'done', stateVersion: expectedVersion, ended: false, exitReason: null };
        return;
      }
    }

    const now = new Date().toISOString();
    // 登记权威（applyCreationPatchMeta：version 恰好+1、userChanges 追加）
    // + 内容写入（真实 LLM 适配：登记权威 / 内容生成分离）。
    const updated = applyCreationPatchMeta(creation, patch, now);
    updated.content = newContent;
    updated.phase = afterPatchPhase;
    state.creation = {
      creation: updated,
      active: true,
      contentHistory: [...(domain.contentHistory ?? []), newContent],
    };

    const turnNumber = state.turn + 1;
    state.history.push({
      turn: turnNumber,
      semanticAction,
      policyAction: 'CREATE',
      userText: raw,
      kind: 'CREATION_PATCHED',
      content: newContent,
      at: now,
    });
    state.turn = turnNumber;
    state.goal.satisfaction = Math.min(1, state.goal.satisfaction + 0.05);

    const waiting = transitionExperience(state.view, 'RESPONSE_COMPLETED');
    if (!waiting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '等待态迁移被拒绝' };
      return;
    }
    state.view = waiting.next;

    const ok = await store.commitTurn({
      sessionId,
      expectedVersion,
      newState: state,
      newStatus: 'ACTIVE',
      exitReason: null,
      events: [
        { type: 'POLICY_DECIDED', payload: { semanticAction, policyAction: 'CREATE', policy: POLICY_VERSION, stateMachine: STATE_MACHINE_VERSION } },
        {
          type: 'CREATION_PATCHED',
          payload: {
            version: updated.version,
            operation: patch.operation,
            target: patch.target,
            ...(patch.operation === 'restore' ? { restoreFromVersion: patch.change.restoreFromVersion ?? null } : {}),
          },
        },
        { type: 'STATE_UPDATED', payload: { view: state.view } },
      ],
    });
    if (!ok) {
      yield { type: 'error', code: 'VERSION_CONFLICT', message: '这一轮结果到达时状态已被更新（迟到写入已拒绝）' };
      return;
    }
    yield { type: 'content', turn: turnNumber, kind: 'CREATION_PATCHED', text: newContent, stateVersion: expectedVersion + 1 };
    yield { type: 'state', stateVersion: expectedVersion + 1, view: state.view, state };
    yield { type: 'done', stateVersion: expectedVersion + 1, ended: false, exitReason: null };
  }

  /** ASK 轮次（08 §16：至多一个澄清问题；确定性；创作子状态不推进）。 */
  private async *runCreationAskTurn(
    sessionId: string,
    state: ExperienceState,
    raw: string,
    semanticAction: string,
    interpretation: { question: string; conflictingAxis: string },
    expectedVersion: number
  ): AsyncGenerator<TurnEvent> {
    const acting = transitionExperience(state.view, 'USER_ACTION');
    if (!acting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '状态迁移被拒绝（非法转移）' };
      return;
    }
    state.view = acting.next;

    const now = new Date().toISOString();
    const turnNumber = state.turn + 1;
    state.history.push({
      turn: turnNumber,
      semanticAction,
      policyAction: 'CREATE',
      userText: raw,
      kind: 'CREATION_ASK',
      content: interpretation.question,
      at: now,
    });
    state.turn = turnNumber;

    const waiting = transitionExperience(state.view, 'RESPONSE_COMPLETED');
    if (!waiting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '等待态迁移被拒绝' };
      return;
    }
    state.view = waiting.next;

    const ok = await store.commitTurn({
      sessionId,
      expectedVersion,
      newState: state,
      newStatus: 'ACTIVE',
      exitReason: null,
      events: [
        { type: 'POLICY_DECIDED', payload: { semanticAction, policyAction: 'CREATE', deterministic: true, policy: POLICY_VERSION, stateMachine: STATE_MACHINE_VERSION } },
        { type: 'CREATION_ASKED', payload: { conflictingAxis: interpretation.conflictingAxis } },
        { type: 'STATE_UPDATED', payload: { view: state.view } },
      ],
    });
    if (!ok) {
      yield { type: 'error', code: 'VERSION_CONFLICT', message: '这一轮结果到达时状态已被更新（迟到写入已拒绝）' };
      return;
    }
    yield { type: 'content', turn: turnNumber, kind: 'CREATION_ASK', text: interpretation.question, stateVersion: expectedVersion + 1 };
    yield { type: 'state', stateVersion: expectedVersion + 1, view: state.view, state };
    yield { type: 'done', stateVersion: expectedVersion + 1, ended: false, exitReason: null };
  }

  // -------------------------------------------------------------------------
  // S2a F-4：分支操作轮次（确定性系统回合——不调用模型）
  // -------------------------------------------------------------------------

  private async *runBranchOperationTurn(
    sessionId: string,
    state: ExperienceState,
    raw: string,
    branchOperation: BranchOperation,
    expectedVersion: number
  ): AsyncGenerator<TurnEvent> {
    const validation = validateBranchOperation(state.simulation.branches, state.simulation.currentBranchId, branchOperation);
    if (!validation.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: validation.reason };
      return;
    }
    const acting = transitionExperience(state.view, 'USER_ACTION');
    if (!acting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '状态迁移被拒绝（非法转移）' };
      return;
    }
    state.view = acting.next;

    const now = new Date().toISOString();
    const applied = applyBranchOperation(state.simulation.branches, state.simulation.currentBranchId, branchOperation, now);
    state.simulation = {
      ...state.simulation,
      branches: applied.branches,
      currentBranchId: applied.currentBranchId,
    };

    const ordinal = branchOperation.targetOrdinal;
    const noticeText =
      branchOperation.operation === 'RETURN'
        ? '已回到主线模拟。这个分支的记录还在，之后说「如果切换到分支N」可以再进入。'
        : branchOperation.operation === 'SWITCH'
          ? `已切换到分支${ordinal}。接下来的「如果…」会在分支${ordinal}里继续推演。`
          : branchOperation.operation === 'ABANDON'
            ? `已放弃分支${ordinal}。它的模拟记录保留，但不再激活。`
            : `已把分支${ordinal}的结论采纳为参考。它仍然是模拟结果，不是事实；想把它做成作品可以说「做成…」。`;

    const turnNumber = state.turn + 1;
    state.history.push({
      turn: turnNumber,
      semanticAction: 'WHAT_IF',
      policyAction: 'SIMULATE',
      userText: raw,
      kind: 'BRANCH_NOTICE',
      content: noticeText,
      at: now,
    });
    state.turn = turnNumber;

    const waiting = transitionExperience(state.view, 'RESPONSE_COMPLETED');
    if (!waiting.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '等待态迁移被拒绝' };
      return;
    }
    state.view = waiting.next;

    const ok = await store.commitTurn({
      sessionId,
      expectedVersion,
      newState: state,
      newStatus: 'ACTIVE',
      exitReason: null,
      events: [
        { type: 'POLICY_DECIDED', payload: { semanticAction: 'WHAT_IF', policyAction: 'SIMULATE', deterministic: true, policy: POLICY_VERSION, stateMachine: STATE_MACHINE_VERSION } },
        { type: 'BRANCH_OPERATION', payload: { operation: branchOperation.operation, targetOrdinal: branchOperation.targetOrdinal, branchId: applied.branch.branchId } },
        { type: 'STATE_UPDATED', payload: { view: state.view } },
      ],
    });
    if (!ok) {
      yield { type: 'error', code: 'VERSION_CONFLICT', message: '这一轮结果到达时状态已被更新（迟到写入已拒绝）' };
      return;
    }
    yield { type: 'content', turn: turnNumber, kind: 'BRANCH_NOTICE', text: noticeText, stateVersion: expectedVersion + 1 };
    yield { type: 'state', stateVersion: expectedVersion + 1, view: state.view, state };
    yield { type: 'done', stateVersion: expectedVersion + 1, ended: false, exitReason: null };
  }

  // -------------------------------------------------------------------------
  // STOP 轮次（含 S2a D-05 创作完成登记）
  // -------------------------------------------------------------------------

  private async *runStopTurn(
    sessionId: string,
    state: ExperienceState,
    semanticAction: string,
    creationCompletionSignal: boolean,
    expectedVersion: number
  ): AsyncGenerator<TurnEvent> {
    const t = transitionExperience(state.view, 'STOP');
    if (!t.ok) {
      yield { type: 'error', code: 'INVALID_INPUT', message: '当前状态无法停止' };
      return;
    }
    state.view = t.next;

    // S2a D-05 选项 A：完成信号经 STOP 执行路径在创作域登记。
    // 完成必经用户反馈轮（13 §21）：PREVIEW → feedback_started →
    // USER_FEEDBACK → completed → COMPLETE；预览在途（或无创作）按终止登记。
    let exitReason = 'user_stop';
    let completionContent: string | null = null;
    if (state.creation && state.creation.active) {
      if (creationCompletionSignal) {
        let phase: CreationPhase | null = state.creation.creation.phase;
        if (phase === 'PREVIEW') {
          phase = nextCreationPhase(phase, 'feedback_started');
        }
        if (phase === 'USER_FEEDBACK') {
          const completed = nextCreationPhase(phase, 'completed');
          if (completed) {
            const version = state.creation.creation.version;
            state.creation = {
              ...state.creation,
              creation: { ...state.creation.creation, phase: completed, updatedAt: new Date().toISOString() },
              active: false,
              endedReason: 'completed',
            };
            exitReason = 'creation_completed';
            completionContent = `作品完成（第 ${version} 版）。你的每一步修改都完整保留在这次体验里。`;
          }
        }
      }
      if (state.creation.active) {
        state.creation = { ...state.creation, active: false, endedReason: 'stopped_by_user' };
      }
    }

    state.completion = { done: true, exitReason };
    const ok = await store.commitTurn({
      sessionId,
      expectedVersion,
      newState: state,
      newStatus: 'COMPLETED',
      exitReason,
      events: [
        { type: 'POLICY_DECIDED', payload: { semanticAction, policyAction: 'STOP', policy: POLICY_VERSION, stateMachine: STATE_MACHINE_VERSION } },
        {
          type: 'EXPERIENCE_COMPLETED',
          payload: { exitReason, zeroContinuation: true, creationCompleted: exitReason === 'creation_completed' },
        },
      ],
    });
    if (!ok) {
      yield { type: 'error', code: 'VERSION_CONFLICT', message: '状态已被并发更新' };
      return;
    }
    if (completionContent) {
      yield { type: 'content', turn: state.turn, kind: 'CREATION_COMPLETED', text: completionContent, stateVersion: expectedVersion + 1 };
    }
    yield { type: 'state', stateVersion: expectedVersion + 1, view: state.view, state };
    yield { type: 'done', stateVersion: expectedVersion + 1, ended: true, exitReason };
  }

  // -------------------------------------------------------------------------
  // 内容轮（ANSWER / EXPLAIN / SIMULATE——SIMULATE 含四元分离与分支登记）
  // -------------------------------------------------------------------------

  private async *runContentTurn(
    sessionId: string,
    session: SessionRow,
    state: ExperienceState,
    raw: string,
    semanticAction: string,
    policyAction: string,
    expectedVersion: number,
    signal: AbortSignal,
    generationIntent: GenerationIntent | null = null
  ): AsyncGenerator<TurnEvent> {
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

    // LLM 内容提案（网关失败/取消 → 诚实报错，状态零变更）。
    // S2a F-5：读侧记忆信号注入（L5——只取相关记录，L2 当前意图覆盖）。
    const memoryContext = await this.loadMemorySignals(raw);
    let proposalText: string;
    try {
      const systemPrompt = buildSystemPrompt(state, memoryContext.signals);
      // S2b：呈现类表达作首条输入（无前文可重放）时回退到内容轮——生成
      // 注记让回答直接进入内容本身（新生成的回答即生成材料）。
      const genNote = generationIntent
        ? `\n\n（用户想要这段内容的${generationIntent.modality === 'voice' ? '语音朗读版' : '画面版'}——不要复述或回应这句话本身，第一句就直接进入内容。）`
        : '';
      const userPrompt =
        (semanticAction === 'CORRECTION' && !isFirstTurn
          ? buildCorrectionPrompt(raw)
          : buildUserPrompt(policyAction as 'ANSWER' | 'EXPLAIN' | 'SIMULATE' | 'CHANGE_EXPERIENCE' | 'STOP' | 'CREATE', raw, state.turn)) + genNote;
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
    const now = new Date().toISOString();
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
      at: now,
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

    // S2a F-4：模拟轮次登记（四元分离 + 首轮自动建分支——分支结果不回流主线）。
    if (policyAction === 'SIMULATE') {
      const separation = deriveSimulationSeparation(proposalText);
      const recorded = recordSimulationRound(state.simulation, {
        sourceInput: raw,
        separation,
        stateVersion: expectedVersion,
        now,
      });
      state.simulation = recorded.state;
    }

    // S2a F-5：写侧记忆登记（07 §7 过滤；再次探索 +0.15 上限 1）。
    const observed = recordMemory(memoryContext.records, {
      topic: state.topic,
      intentSignal: 'topic_observation',
      source: 'session_observation',
      now,
    });
    if (observed.ok) {
      await store.saveMemoryRecords([observed.record]);
    }

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
        ...(policyAction === 'SIMULATE'
          ? [{ type: 'SIMULATION_RECORDED', payload: { round: state.simulation.rounds.length, currentBranchId: state.simulation.currentBranchId } }]
          : []),
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
    if (generationIntent) {
      // S2b：首条输入即呈现类表达的回退路径——新生成的回答即生成材料。
      yield* this.runGeneration(generationIntent, proposalText, sessionId, turnNumber, signal);
    }
    yield { type: 'done', stateVersion: expectedVersion + 1, ended: false, exitReason: null };
  }

  // -------------------------------------------------------------------------
  // S2a F-5：记忆读写辅助（唯一跨会话域——读写仅经本类）
  // -------------------------------------------------------------------------

  private async loadMemorySignals(raw: string): Promise<{
    signals: MemorySignalInput[];
    records: MemoryRecord[];
  }> {
    const records = await store.loadMemoryRecords();
    const now = new Date().toISOString();
    const { records: afterRetrieve, signals } = retrieveRelevant(records, raw, now);
    // 检索引发的确定性变更（懒到期 / RECALL 迁移）立即持久化——
    // 与内容轮成败解耦（时间驱动与读取纪律独立于生成）。
    const changed = afterRetrieve.filter((entry) => {
      const before = records.find((candidate) => candidate.recordId === entry.recordId);
      return !before || JSON.stringify(before) !== JSON.stringify(entry);
    });
    await store.saveMemoryRecords(changed);
    return {
      signals: signals.map((signal) => ({ topic: signal.topic, interestSignal: signal.interestSignal })),
      records: afterRetrieve,
    };
  }
}

/** 记忆操作目标检索（2 字滑窗——与 retrieveRelevant 同一相关性纪律）。 */
function findRecordByText(records: MemoryRecord[], text: string): MemoryRecord | null {
  const source = text.replace(/\s+/g, '');
  if (source.length < 2) return null;
  for (const record of records) {
    if (record.lifecycle === 'EXPIRED') continue;
    const topic = record.topic.replace(/\s+/g, '');
    for (let i = 0; i + 2 <= topic.length; i++) {
      if (source.includes(topic.slice(i, i + 2))) return record;
    }
  }
  return null;
}

/** 单例（本切片单进程部署）。 */
import { HttpLlmGateway } from './llm-gateway';
let runtimeInstance: ExperienceRuntime | null = null;
export function getRuntime(): ExperienceRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new ExperienceRuntime(new HttpLlmGateway(), getMediaGateway());
  }
  return runtimeInstance;
}
