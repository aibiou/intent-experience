'use client';

/**
 * useExperienceSession——单个体验会话的客户端生命周期（页面状态机的体验轴）。
 *
 * 职责：
 * - start：首页自由输入 / 入口屏种子 → POST /api/experience/start → 立即进入体验态
 * - restore：最近探索 → GET /api/experience/session → 从 state.history 重放
 * - send：体验内一条输入 → POST /api/experience/message（带 expectedStateVersion）
 * - 生成中可继续输入：中止在途请求（AbortController）后以同一版本号发送——
 *   被中止的轮次永不提交（后端契约保证），前端亦丢弃其待定气泡
 * - VERSION_CONFLICT：经 session 端点同步最新状态 + 软提示，不自动重试
 * - 停止是成功路径：done{ended:true} → ended 态，由呈现层给干净的结束屏
 *
 * S2a（6-d）：从 SSE state 事件 / 会话恢复中提取轴外域的呈现视图——
 * - 分支域：branches（序号 = 记录顺序 + 1，与后端 resolveTarget 一致）、currentBranchId；
 * - 创作域：version / active（版本徽章数据源）；
 * - 轮次徽章推导（纯呈现层，不触碰引擎语义）：
 *   · 创作版本游标：CREATION_PREVIEW → 重置为 1；CREATION_PATCHED → +1
 *     （历史顺序游走，superseded 重建创作时游标自然重置）；
 *   · 分支归属拉链：第 i 条 SIMULATION_RESULT ↔ simulation.rounds[i]
 *     （每个成功的 SIMULATE 轮恰好登记一条轮次记录——1:1 顺序对应）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { streamExperienceEvents } from './sse';
import type {
  ExperienceStage,
  ExperienceState,
  ExperienceView,
  TurnEvent,
  TurnKind,
  TurnRecord,
} from '@/lib/experience/types';

/** content 事件可能出现的全部 kind（含升级/边界通知）。 */
export type ContentKind = TurnKind | 'ESCALATION_NOTICE' | 'BOUNDARY_NOTICE';

/** S2b：轮次内嵌媒体（生成事件驱动的呈现层状态）。 */
export interface TurnMedia {
  modality: 'image' | 'voice' | 'video';
  status: 'pending' | 'completed' | 'failed';
  url?: string;
  promptUsed?: string;
  mime?: string;
  message?: string;
}

/** 会话恢复时 GET /api/experience/session 附带的媒体产物。 */
interface SessionMediaRecord {
  turn: number;
  modality: 'image' | 'voice' | 'video';
  url: string;
  promptUsed: string;
  mime: string;
  at: string;
}

/** 分支域的呈现视图（序号从 1 起——与后端分支记录顺序一致）。 */
export interface BranchLite {
  ordinal: number;
  branchId: string;
  lifecycle: 'ACTIVE' | 'RETURNED' | 'ABANDONED';
  adopted: boolean;
  version: number;
  roundsCount: number;
}

/** 创作域的呈现视图。 */
export interface CreationLite {
  version: number;
  active: boolean;
  conceptTheme: string;
}

/** 呈现层的一条轮次记录（pending = 已有 userText、尚无内容）。 */
export interface DisplayTurn {
  key: string;
  turn: number;
  userText: string;
  kind?: ContentKind;
  content?: string;
  /** 创作轮的版本徽章（CREATION_PREVIEW / CREATION_PATCHED；推导游标）。 */
  creationVersion?: number;
  /** 模拟轮的归属分支序号（SIMULATION_RESULT；轮次拉链推导）。 */
  branchOrdinal?: number;
  /** S2b：轮次内嵌媒体（音频 / 图片 / 未接入说明）。 */
  media?: TurnMedia;
}

/** GET /api/experience/session 返回的会话形状。 */
export interface LoadedSession {
  id: string;
  seedId: string | null;
  topic: string;
  status: string;
  exitReason: string | null;
  stateVersion: number;
  state: {
    view: ExperienceView;
    turn: number;
    history: TurnRecord[];
    simulation: ExperienceState['simulation'];
    creation: ExperienceState['creation'];
  };
  updatedAt: string;
  /** S2b：该会话的媒体产物（按 turn 号挂回轮次）。 */
  media?: SessionMediaRecord[];
}

export interface ExperienceSessionState {
  sessionId: string;
  topic: string;
  stage: ExperienceStage;
  turn: number;
  expectedStateVersion: number;
  turns: DisplayTurn[];
  generating: boolean;
  ended: boolean;
  exitReason: string | null;
  readOnly: boolean;
  /** S2a 分支域呈现视图（无模拟时为空数组）。 */
  branches: BranchLite[];
  currentBranchId: string | null;
  /** S2a 创作域呈现视图（无创作时 null）。 */
  creation: CreationLite | null;
}

export interface StartInput {
  seedId?: string;
  entry?: string;
  freeText?: string;
  /** 完成后续作：种子会话 id（首轮图生图参考图的来源）。 */
  continueSessionId?: string;
}

/** start 的呈现层初始信息（topic + 首轮展示文本——种子无角度时为 seed.prompt）。 */
export interface StartOptions {
  topic: string;
  origin: 'seed' | 'free' | 'continuation';
  /** 首轮待定气泡的文本；缺省时回退 freeText / entry。 */
  firstUserText?: string | null;
}

let keySeq = 0;
const nextKey = () => `t-${Date.now().toString(36)}-${(keySeq += 1)}`;

function stripPending(turns: DisplayTurn[]): DisplayTurn[] {
  return turns.filter((t) => t.kind !== undefined);
}

function historyToTurns(history: TurnRecord[], media?: SessionMediaRecord[]): DisplayTurn[] {
  const mediaByTurn = new Map<number, SessionMediaRecord[]>();
  for (const record of media ?? []) {
    const list = mediaByTurn.get(record.turn) ?? [];
    list.push(record);
    mediaByTurn.set(record.turn, list);
  }
  return history.map((h) => {
    const record = mediaByTurn.get(h.turn)?.[0];
    return {
      key: `h-${h.turn}`,
      turn: h.turn,
      userText: h.userText,
      kind: h.kind,
      content: h.content,
      ...(record
        ? {
            media: {
              modality: record.modality,
              status: 'completed' as const,
              url: record.url,
              promptUsed: record.promptUsed,
              mime: record.mime,
            },
          }
        : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// S2a 轴外域呈现视图推导（纯函数——只读 state，不碰引擎语义）
// ---------------------------------------------------------------------------

function deriveBranches(state: Pick<ExperienceState, 'simulation'>): {
  branches: BranchLite[];
  currentBranchId: string | null;
} {
  const { simulation } = state;
  return {
    branches: simulation.branches.map((branch, index) => ({
      ordinal: index + 1,
      branchId: branch.branchId,
      lifecycle: branch.lifecycle,
      adopted: branch.adopted,
      version: branch.version,
      roundsCount: branch.rounds.length,
    })),
    currentBranchId: simulation.currentBranchId,
  };
}

function deriveCreation(state: Pick<ExperienceState, 'creation'>): CreationLite | null {
  if (!state.creation) return null;
  return {
    version: state.creation.creation.version,
    active: state.creation.active,
    conceptTheme: state.creation.creation.concept.theme,
  };
}

/**
 * 轮次徽章推导（呈现层拉链——live 与 restore 共用一条路径）：
 * - 创作版本：历史顺序游走，CREATION_PREVIEW 重置 1、CREATION_PATCHED 递增；
 * - 分支归属：第 i 条 SIMULATION_RESULT ↔ 第 i 条模拟轮次记录。
 */
function enrichTurns(
  turns: DisplayTurn[],
  history: TurnRecord[],
  simulation: ExperienceState['simulation'] | undefined
): DisplayTurn[] {
  const creationVersionByTurn = new Map<number, number>();
  let creationVersion = 0;
  for (const h of history) {
    if (h.kind === 'CREATION_PREVIEW') {
      creationVersion = 1;
    } else if (h.kind === 'CREATION_PATCHED') {
      creationVersion += 1;
    }
    if (creationVersion > 0) {
      creationVersionByTurn.set(h.turn, creationVersion);
    }
  }

  const branchOrdinalByTurn = new Map<number, number>();
  if (simulation) {
    const ordinalOfBranchId = new Map<string, number>();
    simulation.branches.forEach((branch, index) => {
      ordinalOfBranchId.set(branch.branchId, index + 1);
    });
    let roundIndex = 0;
    for (const h of history) {
      if (h.kind !== 'SIMULATION_RESULT') continue;
      const round = simulation.rounds[roundIndex];
      roundIndex += 1;
      if (!round) continue;
      const ordinal = ordinalOfBranchId.get(round.branchId);
      if (ordinal !== undefined) {
        branchOrdinalByTurn.set(h.turn, ordinal);
      }
    }
  }

  return turns.map((t) =>
    t.kind === undefined
      ? t
      : {
          ...t,
          creationVersion: creationVersionByTurn.get(t.turn),
          branchOrdinal: branchOrdinalByTurn.get(t.turn),
        }
  );
}

export function useExperienceSession(options?: {
  onDirectionChanged?: () => void;
  onStartFailed?: (origin: 'seed' | 'free' | 'continuation') => void;
}) {
  const [session, setSession] = useState<ExperienceSessionState | null>(null);
  const sessionRef = useRef<ExperienceSessionState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<{
    input: StartInput;
    topic: string;
    origin: 'seed' | 'free' | 'continuation';
    firstUserText: string | null;
  } | null>(null);
  const cbRef = useRef(options);
  useEffect(() => {
    cbRef.current = options;
  }, [options]);

  /** 唯一的本地状态写入点：同步 ref 镜像，避免流式回调闭包读到旧值。 */
  const apply = useCallback(
    (updater: (prev: ExperienceSessionState) => ExperienceSessionState) => {
      const current = sessionRef.current;
      if (!current) return;
      const next = updater(current);
      sessionRef.current = next;
      setSession(next);
    },
    []
  );

  /** VERSION_CONFLICT → 只读同步最新服务端状态，不自动重试。 */
  const syncFromServer = useCallback(async () => {
    const current = sessionRef.current;
    if (!current?.sessionId) return;
    try {
      const res = await fetch(`/api/experience/session?id=${encodeURIComponent(current.sessionId)}`);
      if (!res.ok) throw new Error('sync failed');
      const data = (await res.json()) as { session: LoadedSession };
      const loaded = data.session;
      const { branches, currentBranchId } = deriveBranches(loaded.state);
      apply((prev) => ({
        ...prev,
        topic: loaded.topic,
        stage: loaded.state.view.stage,
        turn: loaded.state.turn,
        expectedStateVersion: loaded.stateVersion,
        turns: enrichTurns(
          historyToTurns(loaded.state.history, loaded.media),
          loaded.state.history,
          loaded.state.simulation
        ),
        branches,
        currentBranchId,
        creation: deriveCreation(loaded.state),
        generating: false,
        ended: loaded.status === 'COMPLETED' || prev.ended,
        exitReason: loaded.status === 'COMPLETED' ? loaded.exitReason : prev.exitReason,
        readOnly: loaded.status === 'COMPLETED' || prev.readOnly,
      }));
      toast({ description: '已同步最新状态' });
    } catch {
      apply((prev) => ({ ...prev, generating: false }));
      toast({ description: '刚才没接上，我们再试一次。' });
    }
  }, [apply]);

  const handleEvent = useCallback(
    (event: TurnEvent) => {
      switch (event.type) {
        case 'session':
          apply((prev) => ({
            ...prev,
            sessionId: event.sessionId,
            topic: event.topic || prev.topic,
            stage: event.view.stage,
            expectedStateVersion: event.stateVersion,
          }));
          break;
        case 'trace':
          break; // 决策过程保持安静（产品语义：不打扰）
        case 'content':
          apply((prev) => ({
            ...prev,
            turns: prev.turns.map((t) =>
              t.kind === undefined
                ? { ...t, kind: event.kind, content: event.text, turn: event.turn }
                : t
            ),
          }));
          break;
        case 'generation': {
          // S2b：媒体生成事件——挂到对应轮次（content 已先到，turn 号已定）。
          const setMedia = (t: DisplayTurn): DisplayTurn => {
            if (t.turn !== event.turn || t.kind === undefined) return t;
            if (event.status === 'started') {
              return {
                ...t,
                media: {
                  modality: event.modality,
                  status: 'pending',
                  // 生成进程透明（started 事件携带提示词）——
                  // 呈现层显示「正在生成什么」，慢速上游
                  // （图像约一两分钟）下用户有明确预期。
                  promptUsed: event.prompt,
                },
              };
            }
            if (event.status === 'completed') {
              return {
                ...t,
                media: {
                  modality: event.modality,
                  status: 'completed',
                  url: event.url,
                  promptUsed: event.promptUsed,
                  mime: event.mime,
                },
              };
            }
            return {
              ...t,
              media: { modality: event.modality, status: 'failed', message: event.message },
            };
          };
          apply((prev) => ({ ...prev, turns: prev.turns.map(setMedia) }));
          break;
        }
        case 'state': {
          const { branches, currentBranchId } = deriveBranches(event.state);
          apply((prev) => ({
            ...prev,
            stage: event.view.stage,
            turn: event.state.turn,
            expectedStateVersion: event.stateVersion,
            turns: enrichTurns(prev.turns, event.state.history, event.state.simulation),
            branches,
            currentBranchId,
            creation: deriveCreation(event.state),
          }));
          break;
        }
        case 'done':
          apply((prev) => ({
            ...prev,
            generating: false,
            expectedStateVersion: event.stateVersion,
            turns: event.ended ? stripPending(prev.turns) : prev.turns,
            ended: event.ended ? true : prev.ended,
            exitReason: event.ended ? event.exitReason : prev.exitReason,
          }));
          break;
        case 'error': {
          if (event.code === 'VERSION_CONFLICT') {
            void syncFromServer();
          } else {
            apply((prev) => ({
              ...prev,
              generating: false,
              turns: stripPending(prev.turns),
            }));
            toast({ description: event.message });
          }
          break;
        }
      }
    },
    [apply, syncFromServer]
  );

  /** 中止在途请求（被中止的轮次永不提交）。 */
  const abortInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  /** 建立新会话并跑完第一轮；立即进入体验态（乐观呈现）。 */
  const start = useCallback(
    (input: StartInput, options: StartOptions) => {
      abortInFlight();
      const controller = new AbortController();
      abortRef.current = controller;
      const firstUserText =
        options.firstUserText !== undefined && options.firstUserText !== null
          ? options.firstUserText
          : (input.freeText ?? input.entry ?? null);
      retryRef.current = {
        input,
        topic: options.topic,
        origin: options.origin,
        firstUserText,
      };
      const draft: ExperienceSessionState = {
        sessionId: '',
        topic: options.topic,
        stage: 'CURIOSITY',
        turn: 0,
        expectedStateVersion: 0,
        turns: firstUserText ? [{ key: nextKey(), turn: 0, userText: firstUserText }] : [],
        generating: true,
        ended: false,
        exitReason: null,
        readOnly: false,
        branches: [],
        currentBranchId: null,
        creation: null,
      };
      sessionRef.current = draft;
      setSession(draft);
      void streamExperienceEvents('/api/experience/start', input, handleEvent, controller.signal)
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          sessionRef.current = null;
          setSession(null);
          toast({
            description:
              error instanceof Error && error.message
                ? error.message
                : '刚才没接上，我们再试一次。',
          });
          cbRef.current?.onStartFailed?.(options.origin);
        })
        .finally(() => {
          if (abortRef.current === controller) abortRef.current = null;
        });
    },
    [abortInFlight, handleEvent]
  );

  /** 最近探索 → 恢复体验（历史轮次从服务端状态重放）。 */
  const restore = useCallback((loaded: LoadedSession) => {
    abortInFlight();
    const completed = loaded.status === 'COMPLETED';
    // 2026-10-16 修复：失败/未完成的恢复会话要能「再试一次」——
    // 此前 retryRef 恒为 null，restore 会话点「再试一次」静默 return
    // （模拟用户实测：等满 4 分钟零反馈）。重发首条用户输入即可。
    const firstUserTurn = loaded.state.history.find((h) => h.userText);
    // 2026-10-16 复测缺口：首轮即失败的会话（如 turn=0、生成未落盘）
    // history 可能没有任何 userText 记录，此前 firstUserTurn=undefined →
    // retryRef=null → 点「再试一次」静默 return（复测：90s 零反馈零请求）。
    // 用 loaded.topic 兜底（topic=用户最初输入/种子标题，恒非空）。
    const retryInput = firstUserTurn?.userText ?? loaded.topic;
    retryRef.current = completed
      ? null
      : retryInput
        ? {
            input: { freeText: retryInput },
            topic: loaded.topic,
            origin: 'free',
            firstUserText: retryInput,
          }
        : null;
    const { branches, currentBranchId } = deriveBranches(loaded.state);
    const restored: ExperienceSessionState = {
      sessionId: loaded.id,
      topic: loaded.topic,
      stage: loaded.state.view.stage,
      turn: loaded.state.turn,
      expectedStateVersion: loaded.stateVersion,
      turns: enrichTurns(
        historyToTurns(loaded.state.history, loaded.media),
        loaded.state.history,
        loaded.state.simulation
      ),
      generating: false,
      ended: completed,
      // 结束原因原样保留（呈现层据此区分「作品完成」——
      // 可续作——与普通停止；与 syncFromServer 同一规则）。
      exitReason: loaded.exitReason,
      readOnly: completed,
      branches,
      currentBranchId,
      creation: deriveCreation(loaded.state),
    };
    sessionRef.current = restored;
    setSession(restored);
  }, [abortInFlight]);

  /** 体验内发送一条输入；生成中发送会先中止在途轮次（同版本号，被中止轮永不提交）。 */
  const send = useCallback(
    (text: string) => {
      const current = sessionRef.current;
      const trimmed = text.trim();
      if (!current || !trimmed || trimmed.length > 500 || current.ended || current.readOnly) return;
      if (!current.sessionId) return; // 会话握手未完成（session 事件到达前）
      abortInFlight();
      const controller = new AbortController();
      abortRef.current = controller;
      apply((prev) => ({
        ...prev,
        turns: [
          ...stripPending(
            prev.turns.map((t) =>
              // S2b：被新输入打断的在途媒体——服务端已随流中止，不落盘；
              // 呈现层降级为失败说明（轮次本身已提交，保持完整）。
              t.media?.status === 'pending'
                ? { ...t, media: { ...t.media, status: 'failed' as const, message: '已被新的输入打断' } }
                : t
            )
          ),
          { key: nextKey(), turn: prev.turn, userText: trimmed },
        ],
        generating: true,
      }));
      void streamExperienceEvents(
        '/api/experience/message',
        {
          sessionId: current.sessionId,
          text: trimmed,
          expectedStateVersion: current.expectedStateVersion,
        },
        handleEvent,
        controller.signal
      )
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          apply((prev) => ({ ...prev, generating: false, turns: stripPending(prev.turns) }));
          toast({
            description:
              error instanceof Error && error.message
                ? error.message
                : '刚才没接上，我们再试一次。',
          });
        })
        .finally(() => {
          if (abortRef.current === controller) abortRef.current = null;
        });
    },
    [abortInFlight, apply, handleEvent]
  );

  /** 首轮生成失败后的"再试一次"：会话已建立则直接重发初始输入。 */
  const retry = useCallback(() => {
    const current = sessionRef.current;
    const saved = retryRef.current;
    if (!current || !saved) return;
    if (current.sessionId) {
      const initialText =
        saved.firstUserText ?? (saved.input.freeText ?? saved.input.entry ?? null);
      if (initialText) send(initialText);
    } else {
      start(saved.input, {
        topic: saved.topic,
        origin: saved.origin,
        firstUserText: saved.firstUserText,
      });
    }
  }, [send, start]);

  /** 回到首页：中止在途请求并清空会话。 */
  const reset = useCallback(() => {
    abortInFlight();
    sessionRef.current = null;
    setSession(null);
  }, [abortInFlight]);

  /** direction_changed = 会话结束（S3B 语义）→ 交还页面回到首页。 */
  useEffect(() => {
    if (session && session.exitReason === 'direction_changed' && !session.readOnly) {
      cbRef.current?.onDirectionChanged?.();
    }
  }, [session]);

  useEffect(() => abortInFlight, [abortInFlight]); // 卸载时中止

  return { session, start, restore, send, retry, reset };
}
