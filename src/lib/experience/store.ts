/**
 * 持久层（S1 + S2a 切片）——Prisma/SQLite 之上的薄存储。
 *
 * 单一写入者纪律的落地点：
 * - commitTurn 使用 updateMany + stateVersion 条件守卫做原子的
 *   check-and-set：版本不匹配 → 0 行更新 → stale 写入被拒绝（GS-05）。
 * - 事件账本只追加：commitTurn 内先取事件数作 seq 基，同一事务写入。
 * - 本文件不包含任何业务语义：业务语义全部在 runtime.ts。
 *
 * S2a 扩展：
 * - ExperienceState 新增轴外域（creation / simulation）：createSession
 *   初始化空域，loadSession 对遗留行防御性回填（无域字段旧状态 → 空域，
 *   不崩溃不丢历史）；
 * - MemoryRecord（F-5 唯一跨会话域）：loadMemoryRecords / saveMemoryRecords
 *   提供 ISO 字符串 ↔ Prisma 行映射；写入仅由 runtime 调用（单一写入者）。
 */

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { MemoryDeletionAudit, MemoryLifecycle, MemoryRecord, MemorySource } from './memory';
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
    state: session.state as unknown as ExperienceState,
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
    // S2a 轴外域（D-02/D-04）：创作域空态起步；分支域结构恒在。
    creation: null,
    simulation: { rounds: [], branches: [], currentBranchId: null, roundCounter: 0, branchCounter: 0 },
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
  if (!session) return null;
  return toRow(withS2aDomains(session));
}

/**
 * 遗留行防御性回填（S1 旧会话无 creation / simulation 域字段）：
 * 缺失 → 空域；已有 → 保留。不改写任何既有字段（历史只读）。
 * 仅补齐类型要求的域字段，保证运行时不需要 nullish 判断。
 */
function withS2aDomains(session: {
  state: unknown;
} & Omit<SessionRow, 'state'>): { state: unknown } & Omit<SessionRow, 'state'> {
  const raw = session.state as Partial<ExperienceState> | null;
  const patched: Partial<ExperienceState> = raw ? { ...raw } : {};
  if (patched.creation === undefined) patched.creation = null;
  if (patched.simulation === undefined) {
    patched.simulation = { rounds: [], branches: [], currentBranchId: null, roundCounter: 0, branchCounter: 0 };
  }
  return { ...session, state: patched };
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
    // GS-05 修复（单测发现的既有缺陷）：updateMany 返回 BatchPayload
    // （{ count }），直接拿返回值与 0 比较恒为 false——stale 写入从未
    // 真正被拒绝（状态未更新但事件被追加且返回 true）。解构 count 后
    // 条件守卫才真正生效。
    const { count } = await tx.experienceSession.updateMany({
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

// ---------------------------------------------------------------------------
// S2a F-5：记忆域持久化（唯一跨会话域；写入仅由 runtime 单一写入者调用）
// ---------------------------------------------------------------------------

type MemoryRow = {
  id: string;
  topic: string;
  intentSignal: string;
  lifecycle: string;
  source: string;
  confidence: number;
  interestSignal: number;
  corrections: number;
  createdAt: Date;
  updatedAt: Date;
  lastRecalledAt: Date | null;
  withdrawnAt: Date | null;
  expiredAt: Date | null;
  deletionAudit: unknown;
};

function rowToMemoryRecord(row: MemoryRow): MemoryRecord {
  return {
    recordId: row.id,
    topic: row.topic,
    intentSignal: row.intentSignal,
    lifecycle: row.lifecycle as MemoryLifecycle,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    source: row.source as MemorySource,
    confidence: row.confidence,
    interestSignal: row.interestSignal,
    corrections: row.corrections,
    lastRecalledAt: row.lastRecalledAt ? row.lastRecalledAt.toISOString() : null,
    withdrawnAt: row.withdrawnAt ? row.withdrawnAt.toISOString() : null,
    expiredAt: row.expiredAt ? row.expiredAt.toISOString() : null,
    deletionAudit: (row.deletionAudit as MemoryDeletionAudit | null) ?? null,
  };
}

/** 全量记忆记录（本地单用户小表；写入侧过滤保证量级有界）。 */
export async function loadMemoryRecords(): Promise<MemoryRecord[]> {
  const rows = await db.memoryRecord.findMany({ orderBy: { updatedAt: 'asc' } });
  return rows.map(rowToMemoryRecord);
}

/** 按记录 id upsert（新记录 create / 变更记录 update；EXPIRED 保留供审计）。 */
export async function saveMemoryRecords(records: readonly MemoryRecord[]): Promise<void> {
  if (records.length === 0) return;
  for (const record of records) {
    const data = {
      topic: record.topic,
      intentSignal: record.intentSignal,
      lifecycle: record.lifecycle,
      source: record.source,
      confidence: record.confidence,
      interestSignal: record.interestSignal,
      corrections: record.corrections,
      updatedAt: new Date(record.updatedAt),
      lastRecalledAt: record.lastRecalledAt ? new Date(record.lastRecalledAt) : null,
      withdrawnAt: record.withdrawnAt ? new Date(record.withdrawnAt) : null,
      expiredAt: record.expiredAt ? new Date(record.expiredAt) : null,
      deletionAudit:
        record.deletionAudit === null
          ? Prisma.JsonNull
          : (JSON.parse(JSON.stringify(record.deletionAudit)) as Prisma.InputJsonObject),
    };
    await db.memoryRecord.upsert({
      where: { id: record.recordId },
      create: { id: record.recordId, createdAt: new Date(record.createdAt), ...data },
      update: data,
    });
  }
}

/** 最近的会话列表（首页"最近探索"）。 */
export async function recentSessions(limit = 6): Promise<SessionSummary[]> {
  const sessions = await db.experienceSession.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  return sessions.map((s) => {
    const state = s.state as unknown as ExperienceState;
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

/** 按 id 批量取会话主题（作品墙 join 用——只读；会话不存在则缺席）。 */
export async function sessionTopicsByIds(
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const sessions = await db.experienceSession.findMany({
    where: { id: { in: ids } },
    select: { id: true, topic: true },
  });
  return new Map(sessions.map((s) => [s.id, s.topic]));
}
