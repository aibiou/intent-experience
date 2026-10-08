/**
 * ExperienceState 唯一写入路径（S1-03；状态机规范 §2.1 / S1 规范 §12 / §28）。
 *
 * 关键约束（S1-03 Critical）：所有写操作必须经过 State Version。
 * - 每次成功写入使 state_version 递增 1；
 * - 写入必须携带 expected_state_version（PD-16 规范字段名）；
 * - 陈旧版本写入返回 STATE_VERSION_CONFLICT，不得覆盖新状态（S1-12）；
 * - 单写者（Runtime 唯一写入；LLM/前端不得直接写状态——CC02 H01）；
 * - 同一体验的写入经承诺链串行化，使并发写入的先后关系确定可复现
 *   （先提交者胜，后者按版本冲突拒绝——S1-12 示例语义）。
 *
 * 错误不得导致状态静默损坏（S1 §28）：任何失败路径都不修改已提交状态。
 */

import type { ExperienceStage, ExperienceStatus, ExperienceView } from './state-machine';

export interface ExperienceState extends ExperienceView {
  experienceId: string;
  sessionId: string;
  stateVersion: number;
  /** WAITING 语义（状态机规范 §11）：系统已完成当前工作，等待用户决定下一步。 */
  waitingForUser: boolean;
  candidateId: string | null;
  lastSemanticAction: string | null;
  updatedAt: string;
}

export type CommitResult =
  | { ok: true; state: ExperienceState }
  | {
      ok: false;
      code: 'STATE_VERSION_CONFLICT';
      expectedStateVersion: number;
      currentStateVersion: number;
    };

export type Mutation = (state: ExperienceState) => ExperienceState;

/**
 * 内存态 ExperienceState 存储（S1 不持久化跨会话数据，PD-07：
 * 进程结束即销毁，无任何跨 Session 持久化）。
 */
export class ExperienceStateStore {
  private readonly states = new Map<string, ExperienceState>();
  /** 每体验写入承诺链：保证并发写入按到达顺序串行提交。 */
  private readonly locks = new Map<string, Promise<unknown>>();

  create(initial: Omit<ExperienceState, 'stateVersion'>): ExperienceState {
    const state: ExperienceState = { ...initial, stateVersion: 1 };
    this.states.set(initial.experienceId, state);
    return state;
  }

  get(experienceId: string): ExperienceState | undefined {
    return this.states.get(experienceId);
  }

  /**
   * 提交一次版本化写入。
   * expectedStateVersion 与当前版本不一致 → STATE_VERSION_CONFLICT（不修改状态）。
   */
  async commit(
    experienceId: string,
    expectedStateVersion: number,
    mutation: Mutation,
  ): Promise<CommitResult> {
    const previous = this.locks.get(experienceId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(experienceId, gate);
    await previous;
    try {
      const current = this.states.get(experienceId);
      if (!current) {
        // 体验不存在视同版本冲突（写入目标缺失，不创建静默状态）。
        return {
          ok: false,
          code: 'STATE_VERSION_CONFLICT',
          expectedStateVersion,
          currentStateVersion: -1,
        };
      }
      if (current.stateVersion !== expectedStateVersion) {
        return {
          ok: false,
          code: 'STATE_VERSION_CONFLICT',
          expectedStateVersion,
          currentStateVersion: current.stateVersion,
        };
      }
      const next = mutation(current);
      const committed: ExperienceState = { ...next, stateVersion: current.stateVersion + 1 };
      this.states.set(experienceId, committed);
      return { ok: true, state: committed };
    } finally {
      release();
    }
  }
}

/** 视图读取（不产生写入、不改变版本——Query 与 Command 分离，API 契约 §2.3）。 */
export function readView(state: ExperienceState): {
  status: ExperienceStatus;
  stage: ExperienceStage;
  stateVersion: number;
  waitingForUser: boolean;
} {
  return {
    status: state.status,
    stage: state.stage,
    stateVersion: state.stateVersion,
    waitingForUser: state.waitingForUser,
  };
}
