/**
 * Session 生命周期（S1-01；状态机规范 §4）。
 *
 * 状态层级 L0：SESSION_IDLE → SESSION_ACTIVE → SESSION_ENDING → SESSION_ENDED。
 * - IDLE：用户尚未进入有效体验（允许表达 Intent、开始探索、退出）。
 * - ACTIVE：至少存在一个有效的用户意图或体验上下文。
 * - ENDING：系统正在完成事件记录、状态保存与决策追踪写入（非常短）。
 * - ENDED：会话结束；不允许自动开始新体验/推送内容/生成下一体验；
 *   用户再次操作须创建新的 Session（§4.4）。
 *
 * S1-01 验收：Session 可创建；状态合法；ended 后旧操作拒绝；Event 完整。
 */

export type SessionState = 'SESSION_IDLE' | 'SESSION_ACTIVE' | 'SESSION_ENDING' | 'SESSION_ENDED';

export interface SessionRecord {
  sessionId: string;
  state: SessionState;
  /** 当前关联的意图 / 体验（S1 首体验冻结：单一探索型问题体验路径）。 */
  intentId: string | null;
  experienceId: string | null;
  createdAt: string;
  endedAt: string | null;
}

export type SessionTransition =
  | { ok: true; next: SessionState }
  | { ok: false; code: 'INVALID_STATE_TRANSITION'; from: SessionState; to: SessionState };

/** IDLE/ACTIVE → ACTIVE（首个意图解析或体验开始）。 */
function toActive(from: SessionState): SessionTransition {
  if (from === 'SESSION_IDLE' || from === 'SESSION_ACTIVE') {
    return { ok: true, next: 'SESSION_ACTIVE' };
  }
  return { ok: false, code: 'INVALID_STATE_TRANSITION', from, to: 'SESSION_ACTIVE' };
}

/** ACTIVE → ENDING（停止/退出触发）。 */
function toEnding(from: SessionState): SessionTransition {
  if (from === 'SESSION_ACTIVE') {
    return { ok: true, next: 'SESSION_ENDING' };
  }
  return { ok: false, code: 'INVALID_STATE_TRANSITION', from, to: 'SESSION_ENDING' };
}

/** ENDING → ENDED（收尾完成）。ENDED 为终态。 */
function toEnded(from: SessionState): SessionTransition {
  if (from === 'SESSION_ENDING') {
    return { ok: true, next: 'SESSION_ENDED' };
  }
  return { ok: false, code: 'INVALID_STATE_TRANSITION', from, to: 'SESSION_ENDED' };
}

/** 对当前状态施加一次生命周期迁移；非法迁移一律拒绝（状态机规范 §4）。 */
export function transitionSession(current: SessionState, target: 'SESSION_ACTIVE' | 'SESSION_ENDING' | 'SESSION_ENDED'): SessionTransition {
  switch (target) {
    case 'SESSION_ACTIVE':
      return toActive(current);
    case 'SESSION_ENDING':
      return toEnding(current);
    case 'SESSION_ENDED':
      return toEnded(current);
  }
}

let sessionCounter = 0;

/** 创建新 Session（初始状态 SESSION_IDLE）。 */
export function createSession(now: string): SessionRecord {
  sessionCounter += 1;
  return {
    sessionId: `session_synthetic_${String(sessionCounter).padStart(4, '0')}`,
    state: 'SESSION_IDLE',
    intentId: null,
    experienceId: null,
    createdAt: now,
    endedAt: null,
  };
}
