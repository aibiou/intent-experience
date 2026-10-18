/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  transitionExperience,
  initialExperienceView,
  STATE_MACHINE_VERSION,
} from '../../src/lib/experience/state-machine';
import type { ExperienceTrigger } from '../../src/lib/experience/state-machine';
import type { ExperienceView } from '../../src/lib/experience/types';

/**
 * 体验状态机（state-machine.ts）——状态轴 + 阶段轴双轴迁移表。
 * 锁：合法迁移全通、非法迁移一律拒绝（S1-04）、COMPLETED 终态零续行（GS-04）、
 * CHANGE_DIRECTION 取消旧候选回 CURIOSITY（GS-03 的状态机面）。
 * 契约依据：状态机规范 §7 / §15；G05-FR 修复回归（WAITING→ENTERING）。
 *
 * 迁移表（实现现状，未列出的组合一律非法）：
 *   状态轴：ENTERING→READY（EXPERIENCE_STARTED）；READY→ACTIVE（USER_ACTION）；
 *          ACTIVE↔WAITING（RESPONSE_COMPLETED / USER_ACTION）；
 *          ENTERING/READY/ACTIVE/WAITING→COMPLETED（STOP——缺陷修复：任何非终态可停）；
 *          READY/ACTIVE/WAITING→ENTERING（CHANGE_DIRECTION）。
 *   阶段轴：CURIOSITY→UNDERSTANDING（启动）；UNDERSTANDING/SIMULATION→SIMULATION（WHAT_IF）；
 *          UNDERSTANDING/SIMULATION/CREATION→CREATION（CREATE，契约保留）；
 *          CORRECTION 同域阶段保持。
 */

function view(status: ExperienceView['status'], stage: ExperienceView['stage']): ExperienceView {
  return { status, stage };
}

const ALL_TRIGGERS: ReadonlyArray<ExperienceTrigger> = [
  'EXPERIENCE_STARTED',
  'USER_ACTION',
  'RESPONSE_COMPLETED',
  'WHAT_IF_SIMULATE',
  'CHANGE_DIRECTION',
  'STOP',
  'CREATE',
  'CORRECTION',
];

function expectLegal(
  from: ExperienceView,
  trigger: ExperienceTrigger,
  next: ExperienceView
): void {
  const r = transitionExperience(from, trigger);
  expect(r).toEqual({ ok: true, next });
}

function expectIllegal(from: ExperienceView, trigger: ExperienceTrigger): void {
  const r = transitionExperience(from, trigger);
  expect(r).toEqual({ ok: false, code: 'INVALID_STATE_TRANSITION', from, trigger });
}

describe('state-machine：初始视图与版本', () => {
  it('初始视图 = ENTERING / CURIOSITY（体验创建）', () => {
    expect(initialExperienceView()).toEqual({ status: 'ENTERING', stage: 'CURIOSITY' });
  });

  it('STATE_MACHINE_VERSION 冻结值（S2a——创作/纠正/分支为轴外域不占轴）', () => {
    expect(STATE_MACHINE_VERSION).toBe('state_machine_v1.3.0-s2a');
  });
});

describe('state-machine：合法迁移——主干路径（合法路径全通）', () => {
  it('EXPERIENCE_STARTED：ENTERING/CURIOSITY → READY/UNDERSTANDING', () => {
    expectLegal(view('ENTERING', 'CURIOSITY'), 'EXPERIENCE_STARTED', view('READY', 'UNDERSTANDING'));
  });

  it('USER_ACTION：READY → ACTIVE（阶段保持）', () => {
    expectLegal(view('READY', 'UNDERSTANDING'), 'USER_ACTION', view('ACTIVE', 'UNDERSTANDING'));
  });

  it('RESPONSE_COMPLETED：ACTIVE → WAITING（阶段保持）', () => {
    expectLegal(view('ACTIVE', 'UNDERSTANDING'), 'RESPONSE_COMPLETED', view('WAITING', 'UNDERSTANDING'));
    expectLegal(view('ACTIVE', 'SIMULATION'), 'RESPONSE_COMPLETED', view('WAITING', 'SIMULATION'));
  });

  it('USER_ACTION：WAITING → ACTIVE（阶段保持）', () => {
    expectLegal(view('WAITING', 'UNDERSTANDING'), 'USER_ACTION', view('ACTIVE', 'UNDERSTANDING'));
    expectLegal(view('WAITING', 'SIMULATION'), 'USER_ACTION', view('ACTIVE', 'SIMULATION'));
  });

  it('从初始视图经正常会话流到完成态的主干全链路', () => {
    let v = initialExperienceView();
    const chain: ReadonlyArray<[ExperienceTrigger, ExperienceView]> = [
      ['EXPERIENCE_STARTED', view('READY', 'UNDERSTANDING')],
      ['USER_ACTION', view('ACTIVE', 'UNDERSTANDING')],
      ['RESPONSE_COMPLETED', view('WAITING', 'UNDERSTANDING')],
      ['WHAT_IF_SIMULATE', view('WAITING', 'SIMULATION')],
      ['USER_ACTION', view('ACTIVE', 'SIMULATION')],
      ['RESPONSE_COMPLETED', view('WAITING', 'SIMULATION')],
      ['STOP', view('COMPLETED', 'COMPLETION')],
    ];
    for (const [trigger, expected] of chain) {
      const r = transitionExperience(v, trigger);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.next).toEqual(expected);
        v = r.next;
      }
    }
    expect(v).toEqual({ status: 'COMPLETED', stage: 'COMPLETION' });
  });

  it('从 WAITING 经 WHAT_IF → USER_ACTION → RESPONSE_COMPLETED 的第二形态主干', () => {
    let v = view('WAITING', 'UNDERSTANDING');
    const chain: ReadonlyArray<[ExperienceTrigger, ExperienceView]> = [
      ['WHAT_IF_SIMULATE', view('WAITING', 'SIMULATION')],
      ['USER_ACTION', view('ACTIVE', 'SIMULATION')],
      ['RESPONSE_COMPLETED', view('WAITING', 'SIMULATION')],
      ['STOP', view('COMPLETED', 'COMPLETION')],
    ];
    for (const [trigger, expected] of chain) {
      const r = transitionExperience(v, trigger);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.next).toEqual(expected);
        v = r.next;
      }
    }
  });
});

describe('state-machine：合法迁移——WHAT_IF_SIMULATE 阶段规则（§15.2 / §15.3）', () => {
  it('UNDERSTANDING → SIMULATION（ACTIVE 与 WAITING 两个承载）', () => {
    expectLegal(view('ACTIVE', 'UNDERSTANDING'), 'WHAT_IF_SIMULATE', view('ACTIVE', 'SIMULATION'));
    expectLegal(view('WAITING', 'UNDERSTANDING'), 'WHAT_IF_SIMULATE', view('WAITING', 'SIMULATION'));
  });

  it('SIMULATION → SIMULATION（同阶段幂等推进）', () => {
    expectLegal(view('ACTIVE', 'SIMULATION'), 'WHAT_IF_SIMULATE', view('ACTIVE', 'SIMULATION'));
    expectLegal(view('WAITING', 'SIMULATION'), 'WHAT_IF_SIMULATE', view('WAITING', 'SIMULATION'));
  });
});

describe('state-machine：合法迁移——CREATE 阶段规则（本切片契约保留，策略层未启用）', () => {
  it('WAITING/UNDERSTANDING → ACTIVE/CREATION（PD-21 关闭切片保留契约）', () => {
    expectLegal(view('WAITING', 'UNDERSTANDING'), 'CREATE', view('ACTIVE', 'CREATION'));
  });

  it('WAITING/SIMULATION → ACTIVE/CREATION 与 ACTIVE 同态保持', () => {
    expectLegal(view('WAITING', 'SIMULATION'), 'CREATE', view('ACTIVE', 'CREATION'));
    expectLegal(view('ACTIVE', 'UNDERSTANDING'), 'CREATE', view('ACTIVE', 'CREATION'));
    expectLegal(view('ACTIVE', 'CREATION'), 'CREATE', view('ACTIVE', 'CREATION'));
  });
});

describe('state-machine：合法迁移——CORRECTION 同域阶段保持（G07）', () => {
  it('READY/ACTIVE/WAITING 上的 CORRECTION → ACTIVE，阶段保持', () => {
    expectLegal(view('READY', 'UNDERSTANDING'), 'CORRECTION', view('ACTIVE', 'UNDERSTANDING'));
    expectLegal(view('ACTIVE', 'UNDERSTANDING'), 'CORRECTION', view('ACTIVE', 'UNDERSTANDING'));
    expectLegal(view('ACTIVE', 'SIMULATION'), 'CORRECTION', view('ACTIVE', 'SIMULATION'));
    expectLegal(view('ACTIVE', 'CREATION'), 'CORRECTION', view('ACTIVE', 'CREATION'));
    expectLegal(view('WAITING', 'UNDERSTANDING'), 'CORRECTION', view('ACTIVE', 'UNDERSTANDING'));
    expectLegal(view('WAITING', 'SIMULATION'), 'CORRECTION', view('ACTIVE', 'SIMULATION'));
  });
});

describe('state-machine：合法迁移——CHANGE_DIRECTION（GS-03：取消旧候选）', () => {
  it('ACTIVE → ENTERING/CURIOSITY（旧方向候选作废，回到初始视图形态）', () => {
    expectLegal(view('ACTIVE', 'UNDERSTANDING'), 'CHANGE_DIRECTION', view('ENTERING', 'CURIOSITY'));
    expectLegal(view('ACTIVE', 'SIMULATION'), 'CHANGE_DIRECTION', view('ENTERING', 'CURIOSITY'));
  });

  it('WAITING → ENTERING/CURIOSITY（G05-FR 修复回归锁）', () => {
    expectLegal(view('WAITING', 'UNDERSTANDING'), 'CHANGE_DIRECTION', view('ENTERING', 'CURIOSITY'));
    expectLegal(view('WAITING', 'SIMULATION'), 'CHANGE_DIRECTION', view('ENTERING', 'CURIOSITY'));
  });

  it('READY → ENTERING/CURIOSITY', () => {
    expectLegal(view('READY', 'UNDERSTANDING'), 'CHANGE_DIRECTION', view('ENTERING', 'CURIOSITY'));
  });

  it('换方向后的视图与初始视图同构（旧阶段信息彻底丢弃）', () => {
    const r = transitionExperience(view('WAITING', 'SIMULATION'), 'CHANGE_DIRECTION');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next).toEqual(initialExperienceView());
  });
});

describe('state-machine：合法迁移——STOP（GS-04：确定性终态）', () => {
  it('ACTIVE → COMPLETED/COMPLETION（终态）', () => {
    expectLegal(view('ACTIVE', 'UNDERSTANDING'), 'STOP', view('COMPLETED', 'COMPLETION'));
    expectLegal(view('ACTIVE', 'SIMULATION'), 'STOP', view('COMPLETED', 'COMPLETION'));
  });

  it('WAITING → COMPLETED/COMPLETION（终态）', () => {
    expectLegal(view('WAITING', 'UNDERSTANDING'), 'STOP', view('COMPLETED', 'COMPLETION'));
    expectLegal(view('WAITING', 'SIMULATION'), 'STOP', view('COMPLETED', 'COMPLETION'));
  });

  // 缺陷修复回归锁：首轮生成失败遗留 ENTERING 视图的会话，此前 STOP 无处可去
  // （会话永久 ACTIVE，GS-04 违背）。修复后任何非终态状态都可停（用户主权）。
  it('缺陷修复回归锁：ENTERING / READY 上 STOP 合法（任何时刻可停，GS-04）', () => {
    expectLegal(view('ENTERING', 'CURIOSITY'), 'STOP', view('COMPLETED', 'COMPLETION'));
    expectLegal(view('READY', 'UNDERSTANDING'), 'STOP', view('COMPLETED', 'COMPLETION'));
  });
});

describe('state-machine：非法迁移一律拒绝（S1-04）', () => {
  it('COMPLETED 为终态——任何触发器（含 STOP 自身）均被拒绝（GS-04 零续行）', () => {
    for (const trigger of ALL_TRIGGERS) {
      expectIllegal(view('COMPLETED', 'COMPLETION'), trigger);
    }
  });

  it('COMPLETED 后无任何自动续行路径可离开终态（主干触发器全集逐一断言）', () => {
    const terminal = view('COMPLETED', 'COMPLETION');
    for (const trigger of ALL_TRIGGERS) {
      const r = transitionExperience(terminal, trigger);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('INVALID_STATE_TRANSITION');
        expect(r.from).toEqual(terminal);
        expect(r.trigger).toBe(trigger);
      }
    }
  });

  it('ENTERING 接受 START / STOP / CHANGE_DIRECTION——其余触发器全部拒绝（越级跳步）', () => {
    const triggersWithoutLegal = ALL_TRIGGERS.filter(
      (t) =>
        t !== 'EXPERIENCE_STARTED' &&
        t !== 'STOP' &&
        t !== 'CHANGE_DIRECTION'
    );
    for (const trigger of triggersWithoutLegal) {
      expectIllegal(view('ENTERING', 'CURIOSITY'), trigger);
    }
  });

  it('READY 上 EXPERIENCE_STARTED / WHAT_IF_SIMULATE / RESPONSE_COMPLETED 仍被拒绝', () => {
    expectIllegal(view('READY', 'UNDERSTANDING'), 'RESPONSE_COMPLETED');
    expectIllegal(view('READY', 'UNDERSTANDING'), 'EXPERIENCE_STARTED');
    expectIllegal(view('READY', 'UNDERSTANDING'), 'WHAT_IF_SIMULATE');
  });

  it('ACTIVE 上 USER_ACTION（无自环）/ EXPERIENCE_STARTED / CHANGE_DIRECTION 之外的越级被拒绝', () => {
    expectIllegal(view('ACTIVE', 'UNDERSTANDING'), 'USER_ACTION');
    expectIllegal(view('ACTIVE', 'SIMULATION'), 'EXPERIENCE_STARTED');
  });

  it('WAITING 上 RESPONSE_COMPLETED（重复等待）/ EXPERIENCE_STARTED 被拒绝', () => {
    expectIllegal(view('WAITING', 'UNDERSTANDING'), 'RESPONSE_COMPLETED');
    expectIllegal(view('WAITING', 'UNDERSTANDING'), 'EXPERIENCE_STARTED');
  });

  it('阶段轴越级：WHAT_IF_SIMULATE 仅从 UNDERSTANDING / SIMULATION 可达', () => {
    expectIllegal(view('READY', 'UNDERSTANDING'), 'WHAT_IF_SIMULATE');
    expectIllegal(view('WAITING', 'CURIOSITY'), 'WHAT_IF_SIMULATE');
    expectIllegal(view('ACTIVE', 'CREATION'), 'WHAT_IF_SIMULATE');
  });

  it('阶段轴越级：CORRECTION 仅在 UNDERSTANDING / SIMULATION / CREATION 阶段合法', () => {
    expectIllegal(view('READY', 'CURIOSITY'), 'CORRECTION');
    expectIllegal(view('ACTIVE', 'CURIOSITY'), 'CORRECTION');
    expectIllegal(view('WAITING', 'CURIOSITY'), 'CORRECTION');
  });

  it('阶段轴越级：CREATE 仅从 UNDERSTANDING / SIMULATION / CREATION 阶段可达', () => {
    expectIllegal(view('WAITING', 'CURIOSITY'), 'CREATE');
    expectIllegal(view('ACTIVE', 'CURIOSITY'), 'CREATE');
  });

  it('拒绝结果携带明确错误信息（code + from + trigger）', () => {
    const r = transitionExperience(view('ENTERING', 'CURIOSITY'), 'USER_ACTION');
    expect(r).toEqual({
      ok: false,
      code: 'INVALID_STATE_TRANSITION',
      from: { status: 'ENTERING', stage: 'CURIOSITY' },
      trigger: 'USER_ACTION',
    });
  });
});
