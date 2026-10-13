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
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { streamExperienceEvents } from './sse';
import type {
  ExperienceStage,
  ExperienceView,
  TurnEvent,
  TurnKind,
  TurnRecord,
} from '@/lib/experience/types';

/** content 事件可能出现的全部 kind（含升级/边界通知）。 */
export type ContentKind = TurnKind | 'ESCALATION_NOTICE' | 'BOUNDARY_NOTICE';

/** 呈现层的一条轮次记录（pending = 已有 userText、尚无内容）。 */
export interface DisplayTurn {
  key: string;
  turn: number;
  userText: string;
  kind?: ContentKind;
  content?: string;
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
  };
  updatedAt: string;
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
}

export interface StartInput {
  seedId?: string;
  entry?: string;
  freeText?: string;
}

/** start 的呈现层初始信息（topic + 首轮展示文本——种子无角度时为 seed.prompt）。 */
export interface StartOptions {
  topic: string;
  origin: 'seed' | 'free';
  /** 首轮待定气泡的文本；缺省时回退 freeText / entry。 */
  firstUserText?: string | null;
}

let keySeq = 0;
const nextKey = () => `t-${Date.now().toString(36)}-${(keySeq += 1)}`;

function stripPending(turns: DisplayTurn[]): DisplayTurn[] {
  return turns.filter((t) => t.kind !== undefined);
}

function historyToTurns(history: TurnRecord[]): DisplayTurn[] {
  return history.map((h) => ({
    key: `h-${h.turn}`,
    turn: h.turn,
    userText: h.userText,
    kind: h.kind,
    content: h.content,
  }));
}

export function useExperienceSession(options?: {
  onDirectionChanged?: () => void;
  onStartFailed?: (origin: 'seed' | 'free') => void;
}) {
  const [session, setSession] = useState<ExperienceSessionState | null>(null);
  const sessionRef = useRef<ExperienceSessionState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<{
    input: StartInput;
    topic: string;
    origin: 'seed' | 'free';
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
      apply((prev) => ({
        ...prev,
        topic: loaded.topic,
        stage: loaded.state.view.stage,
        turn: loaded.state.turn,
        expectedStateVersion: loaded.stateVersion,
        turns: historyToTurns(loaded.state.history),
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
        case 'state':
          apply((prev) => ({
            ...prev,
            stage: event.view.stage,
            turn: event.state.turn,
            expectedStateVersion: event.stateVersion,
          }));
          break;
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
          cbRef.current.onStartFailed?.(options.origin);
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
    retryRef.current = null;
    const restored: ExperienceSessionState = {
      sessionId: loaded.id,
      topic: loaded.topic,
      stage: loaded.state.view.stage,
      turn: loaded.state.turn,
      expectedStateVersion: loaded.stateVersion,
      turns: historyToTurns(loaded.state.history),
      generating: false,
      ended: completed,
      exitReason: completed ? null : loaded.exitReason,
      readOnly: completed,
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
        turns: [...stripPending(prev.turns), { key: nextKey(), turn: prev.turn, userText: trimmed }],
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
      cbRef.current.onDirectionChanged?.();
    }
  }, [session]);

  useEffect(() => abortInFlight, [abortInFlight]); // 卸载时中止

  return { session, start, restore, send, retry, reset };
}
