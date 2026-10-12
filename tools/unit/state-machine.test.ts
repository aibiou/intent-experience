import { describe, expect, it } from 'vitest';
import {
  transitionExperience,
  initialExperienceView,
} from '../../src/experience/state-machine';

/**
 * 状态机（state-machine.ts）——体验状态/阶段转移表。
 * 锁：合法迁移、终态拒绝、非法组合、G05-FR 修复回归（WAITING→ENTERING）。
 * 契约依据：状态机规范 §7 / §15；spec 参考 docs/product/reference/13｜State Machine。
 */
describe('state-machine：初始视图', () => {
  it('初始视图 = ENTERING / CURIOSITY（体验创建）', () => {
    expect(initialExperienceView()).toEqual({ status: 'ENTERING', stage: 'CURIOSITY' });
  });
});

describe('state-machine：合法迁移', () => {
  it('EXPERIENCE_STARTED：ENTERING/CURIOSITY → READY/UNDERSTANDING', () => {
    const r = transitionExperience(
      { status: 'ENTERING', stage: 'CURIOSITY' },
      'EXPERIENCE_STARTED',
    );
    expect(r).toEqual({ ok: true, next: { status: 'READY', stage: 'UNDERSTANDING' } });
  });

  it('USER_ACTION：READY → ACTIVE（阶段保持 UNDERSTANDING）', () => {
    const r = transitionExperience(
      { status: 'READY', stage: 'UNDERSTANDING' },
      'USER_ACTION',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next).toEqual({ status: 'ACTIVE', stage: 'UNDERSTANDING' });
  });

  it('RESPONSE_COMPLETED：ACTIVE → WAITING', () => {
    const r = transitionExperience(
      { status: 'ACTIVE', stage: 'UNDERSTANDING' },
      'RESPONSE_COMPLETED',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next.status).toBe('WAITING');
  });

  it('CHANGE_DIRECTION：WAITING → ENTERING/CURIOSITY（G05-FR 修复回归锁）', () => {
    const r = transitionExperience(
      { status: 'WAITING', stage: 'UNDERSTANDING' },
      'CHANGE_DIRECTION',
    );
    expect(r).toEqual({ ok: true, next: { status: 'ENTERING', stage: 'CURIOSITY' } });
  });

  it('CHANGE_DIRECTION：ACTIVE → ENTERING/CURIOSITY', () => {
    const r = transitionExperience(
      { status: 'ACTIVE', stage: 'SIMULATION' },
      'CHANGE_DIRECTION',
    );
    expect(r).toEqual({ ok: true, next: { status: 'ENTERING', stage: 'CURIOSITY' } });
  });

  it('WHAT_IF_SIMULATE：WAITING/UNDERSTANDING → WAITING/SIMULATION（§15.2）', () => {
    const r = transitionExperience(
      { status: 'WAITING', stage: 'UNDERSTANDING' },
      'WHAT_IF_SIMULATE',
    );
    expect(r).toEqual({ ok: true, next: { status: 'WAITING', stage: 'SIMULATION' } });
  });

  it('CREATE：WAITING/UNDERSTANDING → ACTIVE/CREATION（PD-21 关闭切片）', () => {
    const r = transitionExperience(
      { status: 'WAITING', stage: 'UNDERSTANDING' },
      'CREATE',
    );
    expect(r).toEqual({ ok: true, next: { status: 'ACTIVE', stage: 'CREATION' } });
  });

  it('STOP：ACTIVE → COMPLETED/COMPLETION（终态）', () => {
    const r = transitionExperience(
      { status: 'ACTIVE', stage: 'UNDERSTANDING' },
      'STOP',
    );
    expect(r).toEqual({ ok: true, next: { status: 'COMPLETED', stage: 'COMPLETION' } });
  });
});

describe('state-machine：非法 / 终态拒绝', () => {
  it('COMPLETED 为终态——任何触发器非法', () => {
    const triggers = [
      'EXPERIENCE_STARTED',
      'USER_ACTION',
      'RESPONSE_COMPLETED',
      'CHANGE_DIRECTION',
      'WHAT_IF_SIMULATE',
      'CREATE',
      'CORRECTION',
      'STOP',
    ] as const;
    for (const trigger of triggers) {
      const r = transitionExperience(
        { status: 'COMPLETED', stage: 'COMPLETION' },
        trigger,
      );
      expect(r).toEqual({
        ok: false,
        code: 'INVALID_STATE_TRANSITION',
        from: { status: 'COMPLETED', stage: 'COMPLETION' },
        trigger,
      });
    }
  });

  it('ENTERING 上 USER_ACTION 不合法（ENTERING 仅接受 EXPERIENCE_STARTED）', () => {
    const r = transitionExperience(
      { status: 'ENTERING', stage: 'CURIOSITY' },
      'USER_ACTION',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('WAITING 上 EXPERIENCE_STARTED 不合法（READY 目标需 ENTERING 源）', () => {
    const r = transitionExperience(
      { status: 'WAITING', stage: 'UNDERSTANDING' },
      'EXPERIENCE_STARTED',
    );
    expect(r.ok).toBe(false);
  });
});
