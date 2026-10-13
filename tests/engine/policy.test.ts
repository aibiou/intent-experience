/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { resolvePolicy, POLICY_VERSION } from '../../src/lib/experience/policy';
import type { PolicyAction } from '../../src/lib/experience/policy';
import type { SemanticAction } from '../../src/lib/experience/classifier';

/**
 * 策略解析（policy.ts）——S2a 冻结映射表（policy_v2.0.0-s2a）。
 * 锁：每个语义动作 → 策略动作的单目标映射（任何改动 policy 的人都会被抓住）、
 * 范围外动作一律 ACTION_OUT_OF_SLICE_SCOPE 拒绝（不发明语义）、
 * 冻结性（键集合与值域精确锁定，防悄悄增删）。
 * 契约依据：S1 §14 + PD-21 + S2a F-2（CREATE 启用）/ F-3 / F-4；P-01（STOP 硬边界）；
 * P-04 / P-05（策略不生成事实内容、LLM 不选最终 Action——resolvePolicy 为纯函数，无模型调用）。
 */

/** SemanticAction 闭集全成员（classifier.ts 类型定义的运行时镜像）。 */
const ALL_SEMANTIC_ACTIONS: ReadonlyArray<SemanticAction> = [
  'DIRECT_ANSWER',
  'WHY',
  'WHAT_IF',
  'CHANGE_DIRECTION',
  'STOP',
  'CREATE',
  'CORRECTION',
  'DEEPEN',
  'SIMPLIFY',
  'REFRAME',
  'CONTINUE',
  'REPEAT',
  'UNKNOWN',
];

/** 本切片冻结表（逐条锁定——冻结表的存在意义）。 */
const FROZEN_MAP: Readonly<Record<string, PolicyAction>> = {
  DIRECT_ANSWER: 'ANSWER', // GS-01：用户要求直接答案时直接回答，不强迫探索
  WHY: 'EXPLAIN', // GS-02：基于当前上下文解释“为什么”
  WHAT_IF: 'SIMULATE', // S2a F-4：多轮模拟持久化 + 分支记录（首轮自动建分支）
  CHANGE_DIRECTION: 'CHANGE_EXPERIENCE', // P-02 硬边界：取消旧操作
  STOP: 'STOP', // P-01 硬边界：永远优先，确定性执行，不调用模型
  CORRECTION: 'EXPLAIN', // S2a F-3：G07 完整语义（创作会话内修改族走 CREATE 伞形——路由在 runtime）
  CONTINUE: 'ANSWER', // 切片适配：Screen 04 “继续” = 下一层理解
  CREATE: 'CREATE', // S2a F-2：完整 G04 Creation 语义启用（此前表外拒绝）
};

describe('policy：冻结表单目标映射（逐条锁定）', () => {
  it.each(Object.entries(FROZEN_MAP))('%s → %s', (semanticAction, policyAction) => {
    expect(resolvePolicy(semanticAction as SemanticAction)).toEqual({
      ok: true,
      semanticAction,
      policyAction,
    });
  });

  it('GS-04：STOP → STOP（确定性硬边界，映射目标不得改变）', () => {
    expect(resolvePolicy('STOP')).toEqual({ ok: true, semanticAction: 'STOP', policyAction: 'STOP' });
  });

  it('GS-03：CHANGE_DIRECTION → CHANGE_EXPERIENCE（硬边界：必须取消旧操作）', () => {
    expect(resolvePolicy('CHANGE_DIRECTION')).toEqual({
      ok: true,
      semanticAction: 'CHANGE_DIRECTION',
      policyAction: 'CHANGE_EXPERIENCE',
    });
  });

  it('GS-01：DIRECT_ANSWER → ANSWER（不强迫探索）', () => {
    expect(resolvePolicy('DIRECT_ANSWER')).toEqual({
      ok: true,
      semanticAction: 'DIRECT_ANSWER',
      policyAction: 'ANSWER',
    });
  });

  it('GS-02：WHY → EXPLAIN（基于上下文的解释）', () => {
    expect(resolvePolicy('WHY')).toEqual({
      ok: true,
      semanticAction: 'WHY',
      policyAction: 'EXPLAIN',
    });
  });

  it('CORRECTION → EXPLAIN（纠正重评估落到合法动作）', () => {
    expect(resolvePolicy('CORRECTION')).toEqual({
      ok: true,
      semanticAction: 'CORRECTION',
      policyAction: 'EXPLAIN',
    });
  });

  it('WHAT_IF → SIMULATE（S2a F-4：多轮模拟持久化 + 分支记录）', () => {
    expect(resolvePolicy('WHAT_IF')).toEqual({
      ok: true,
      semanticAction: 'WHAT_IF',
      policyAction: 'SIMULATE',
    });
  });

  it('CONTINUE → ANSWER（切片适配语义）', () => {
    expect(resolvePolicy('CONTINUE')).toEqual({
      ok: true,
      semanticAction: 'CONTINUE',
      policyAction: 'ANSWER',
    });
  });

  it('CREATE → CREATE（S2a F-2：完整 G04 Creation 语义启用）', () => {
    expect(resolvePolicy('CREATE')).toEqual({
      ok: true,
      semanticAction: 'CREATE',
      policyAction: 'CREATE',
    });
  });
});

describe('policy：范围外动作拒绝（诚实边界，不发明语义）', () => {
  it('本切片禁用的已知动作（DEEPEN / SIMPLIFY / REFRAME / REPEAT——S2b 预留）一律 ACTION_OUT_OF_SLICE_SCOPE', () => {
    const outOfSlice: ReadonlyArray<SemanticAction> = ['DEEPEN', 'SIMPLIFY', 'REFRAME', 'REPEAT'];
    for (const action of outOfSlice) {
      expect(resolvePolicy(action)).toEqual({
        ok: false,
        code: 'ACTION_OUT_OF_SLICE_SCOPE',
        semanticAction: action,
      });
    }
  });

  it('语义未定义动作（UNKNOWN）被拒绝', () => {
    expect(resolvePolicy('UNKNOWN')).toEqual({
      ok: false,
      code: 'ACTION_OUT_OF_SLICE_SCOPE',
      semanticAction: 'UNKNOWN',
    });
  });

  it('表外动作（如 SEARCH——SemanticAction 闭集之外的字面量）被 hasOwnProperty 守卫拒绝', () => {
    const r = resolvePolicy('SEARCH' as SemanticAction);
    expect(r).toEqual({ ok: false, code: 'ACTION_OUT_OF_SLICE_SCOPE', semanticAction: 'SEARCH' as SemanticAction });
  });

  it('拒绝结果回显语义动作（升级路径可追踪是谁被拒）', () => {
    const r = resolvePolicy('DEEPEN');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('ACTION_OUT_OF_SLICE_SCOPE');
      expect(r.semanticAction).toBe('DEEPEN');
    }
  });
});

describe('policy：冻结性断言（防悄悄增删映射表条目）', () => {
  it('可解析键集合精确等于冻结表 8 键（多一条少一条都会被抓）', () => {
    const resolvedOk = ALL_SEMANTIC_ACTIONS.filter((action) => resolvePolicy(action).ok);
    expect(resolvedOk.sort()).toEqual(
      [
        'DIRECT_ANSWER',
        'WHY',
        'WHAT_IF',
        'CHANGE_DIRECTION',
        'STOP',
        'CORRECTION',
        'CONTINUE',
        'CREATE',
      ].sort()
    );
  });

  it('全部 13 个语义动作中恰好 8 个在表内、5 个在表外', () => {
    const okCount = ALL_SEMANTIC_ACTIONS.filter((action) => resolvePolicy(action).ok).length;
    const rejectedCount = ALL_SEMANTIC_ACTIONS.filter((action) => !resolvePolicy(action).ok).length;
    expect(okCount).toBe(8);
    expect(rejectedCount).toBe(5);
    expect(okCount + rejectedCount).toBe(ALL_SEMANTIC_ACTIONS.length);
  });

  it('映射目标值域封闭于 6 个合法策略动作（防拼写错误引入新动作）', () => {
    const legalPolicyActions: ReadonlyArray<PolicyAction> = [
      'ANSWER',
      'EXPLAIN',
      'SIMULATE',
      'CHANGE_EXPERIENCE',
      'STOP',
      'CREATE',
    ];
    for (const action of ALL_SEMANTIC_ACTIONS) {
      const r = resolvePolicy(action);
      if (r.ok) {
        expect(legalPolicyActions).toContain(r.policyAction);
      }
    }
  });

  it('POLICY_VERSION 精确冻结为 policy_v2.0.0-s2a', () => {
    expect(POLICY_VERSION).toBe('policy_v2.0.0-s2a');
  });
});

describe('policy：确定性（P-04 / P-05 的证据基础）', () => {
  it('同一输入重复解析结果恒定（纯函数，无模型调用）', () => {
    for (const action of ALL_SEMANTIC_ACTIONS) {
      const first = resolvePolicy(action);
      const second = resolvePolicy(action);
      expect(first).toEqual(second);
    }
  });
});
