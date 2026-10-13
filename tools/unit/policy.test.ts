import { describe, expect, it } from 'vitest';
import { resolvePolicy, POLICY_VERSION } from '../../src/experience/policy';

/**
 * 策略解析（policy.ts）——语义动作 → 策略动作的冻结表映射。
 * 锁：冻结表单目标映射、S1 域外动作拒绝（SEARCH/未知）。
 * 契约依据：C3 §7/§8、S1 §26 GS-02、S2b（14 §8 恒等映射）、P-01。
 */
describe('policy：冻结表单目标映射', () => {
  it('DEEPEN → DEEPEN（S2b 恒等映射）', () => {
    expect(resolvePolicy('DEEPEN')).toEqual({
      ok: true,
      semanticAction: 'DEEPEN',
      policyAction: 'DEEPEN',
    });
  });

  it('WHY → EXPLAIN（S1 §26 GS-02 冻结点）', () => {
    expect(resolvePolicy('WHY')).toEqual({
      ok: true,
      semanticAction: 'WHY',
      policyAction: 'EXPLAIN',
    });
  });

  it('STOP → STOP（P-01 硬边界，永远优先）', () => {
    expect(resolvePolicy('STOP')).toEqual({
      ok: true,
      semanticAction: 'STOP',
      policyAction: 'STOP',
    });
  });

  it('DIRECT_ANSWER → ANSWER（C3 §8 单目标映射）', () => {
    expect(resolvePolicy('DIRECT_ANSWER')).toEqual({
      ok: true,
      semanticAction: 'DIRECT_ANSWER',
      policyAction: 'ANSWER',
    });
  });
});

describe('policy：S1 域外 / 未知拒绝', () => {
  it('SEARCH 不在冻结表——ACTION_OUT_OF_S1_SCOPE', () => {
    expect(resolvePolicy('SEARCH')).toEqual({
      ok: false,
      code: 'ACTION_OUT_OF_S1_SCOPE',
      semanticAction: 'SEARCH',
    });
  });

  it('未知动作被拒绝', () => {
    const r = resolvePolicy('UNKNOWN');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ACTION_OUT_OF_S1_SCOPE');
  });
});

describe('policy：版本常量', () => {
  it('POLICY_VERSION 存在', () => {
    expect(typeof POLICY_VERSION).toBe('string');
    expect(POLICY_VERSION).toMatch(/^policy_v\d+\.\d+\.\d+$/);
  });
});
