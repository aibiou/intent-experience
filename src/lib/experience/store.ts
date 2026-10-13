/**
 * 持久层（S1 切片）——Prisma/SQLite 之上的薄存储。
 *
 * 单一写入者纪律的落地点：
 * - commitTurn 使用 updateMany + stateVersion 条件守卫做原子的
 *   check-and-set：版本不匹配 → 0 行更新 → stale 写入被拒绝（GS-05）。
 * - 事件账本只追加：commitTurn 内先取事件数作 seq 基，同一事务写入。
 * - 本文件不包含任何业务语义：业务语义全部在 runtime.ts。
 */

import { db } from '@/lib/db';
import { initialExperienceView } from './state-machine';
import type { ExperienceState, SessionSummary } from './types';

export interface SessionRow {
  id: string;
  seedId: string | null;
  topic: string;
  status: string;
  exitReason: string | null;
  stateVersion: number;
  generation: number;
  state: ExperienceState;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewEvent {
  type: string;
  payload?: Record<string, unknown>;
}

function toRow(session: {
  id: string;
  seedId: string | null;
  topic: string;
  status: string;
  exitReason: string | null;
  stateVersion: number;
  generation: number;
  state: unknown;
  createdAt: Date;
  updatedAt: Date;
}): SessionRow {
  return {
    ...session,
    state: session.state as ExperienceState,
  };
}

export async function createSession(input: {
  seedId: string | null;
  topic: string;
  experienceId: string;
}): Promise<SessionRow> {
  const state: ExperienceState = {
    view: initialExperienceView(),
    experienceId: input.experienceId,
    topic: input.topic,
    turn: 0,
    goal: { primary: 'understand', satisfaction: 0.1 },
    knowledge: { confirmed: [], inferred: [] },
    userModel: { questions: [], hypotheses: [], corrections: [] },
    variables: {},
    history: [],
    completion: { done: false, exitReason: null },
  };
  const session = await db.experienceSession.create({
    data: {
      seedId: input.seedId,
      topic: input.topic,
      status: 'ACTIVE',
      stateVersion: 1,
      generation: 0,
      state: state as unknown as object,
      events: {
        create: {
          seq: 0,
          type: 'SESSION_STARTED',
          payload: { seedId: input.seedId, topic: input.topic },
          stateVersion: 1,
        },
      },
    },
  });
  return toRow(session);
}

export async function loadSession(sessionId: string): Promise<SessionRow | null> {
  const session = await db.experienceSession.findUnique({
    where: { id: sessionId },
  });
  return session ? toRow(session) : null;
}

/**
 * 原子提交一轮状态变更。
 * 条件守卫：id + stateVersion（期望值）。任何并发/过期写入在此被拒绝。
 * 返回 false = 版本冲突（GS-05 stale write rejected）。
 */
export async function commitTurn(params: {
  sessionId: string;
  expectedVersion: number;
  newState: ExperienceState;
  newStatus: string;
  exitReason: string | null;
  events: NewEvent[];
}): Promise<boolean> {
  const newVersion = params.expectedVersion + 1;
  const updated = await db.$transaction(async (tx) => {
    const count = await tx.experienceSession.updateMany({
      where: { id: params.sessionId, stateVersion: params.expectedVersion, status: 'ACTIVE' },
      data: {
        state: params.newState as unknown as object,
        stateVersion: newVersion,
        status: params.newStatus,
        exitReason: params.exitReason,
      },
    });
    if (count === 0) return false;
    const base = await tx.experienceEvent.count({ where: { sessionId: params.sessionId } });
    if (params.events.length > 0) {
      await tx.experienceEvent.createMany({
        data: params.events.map((event, index) => ({
          sessionId: params.sessionId,
          seq: base + index,
          type: event.type,
          payload: (event.payload ?? undefined) as object | undefined,
          stateVersion: newVersion,
        })),
      });
    }
    return true;
  });
  return updated;
}

/** 只追加审计事件（不改状态版本）——失败/取消必须如实登记，不得隐藏。 */
export async function appendAuditEvent(
  sessionId: string,
  type: string,
  payload: Record<string, unknown>,
  stateVersion: number
): Promise<void> {
  const base = await db.experienceEvent.count({ where: { sessionId } });
  await db.experienceEvent.createMany({
    data: [
      {
        sessionId,
        seq: base,
        type,
        payload: payload as object,
        stateVersion,
      },
    ],
  });
}

/** 生成取消的审计登记（迟到写入不落库的直接证据）。 */
export async function appendCancellationEvent(
  sessionId: string,
  generation: number,
  stateVersion: number
): Promise<void> {
  await appendAuditEvent(sessionId, 'GENERATION_CANCELLED', { generation, at: new Date().toISOString() }, stateVersion);
}

/** 最近的会话列表（首页"最近探索"）。 */
export async function recentSessions(limit = 6): Promise<SessionSummary[]> {
  const sessions = await db.experienceSession.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  return sessions.map((s) => {
    const state = s.state as ExperienceState;
    return {
      id: s.id,
      topic: s.topic,
      seedId: s.seedId,
      status: s.status,
      exitReason: s.exitReason,
      view: state.view,
      turn: state.turn,
      updatedAt: s.updatedAt.toISOString(),
    };
  });
}
