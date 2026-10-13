import { describe, expect, it } from 'vitest';
import {
  buildMemoryTopicIndex,
  MemoryStore,
  nextMemoryCounter,
  type MemoryRecord,
} from '../../src/experience/memory';

/**
 * 记忆持久化（CR-52）——恢复纯函数与持久化钩子契约。
 * fs 读写层（memory-persistence.ts）不单测（路径固定于
 * process.cwd()）；本测试锁：
 * ① buildMemoryTopicIndex——EXPIRED 不入索引；同主题多条
 *   活跃记录保留 updatedAt 最新者；
 * ② nextMemoryCounter——memory_synthetic_NNNN 最大序号，
 *   非规范 ID 忽略；
 * ③ MemoryStore.restore——水合 records / byTopic / counter，
 *   幂等（内存非空返回 0 不覆盖），EXPIRED 记录保留
 *   （审计留痕）但检索排除；
 * ④ persist 钩子——record / recall / correct / withdraw /
 *   到期衰减后触发，无注入形态零行为变化。
 */

function record(
  overrides: Partial<MemoryRecord> & { recordId: string; topic: string },
): MemoryRecord {
  return {
    sessionId: 'session_synthetic_0001',
    experienceId: null,
    intentSignal: 'observed_interest',
    lifecycle: 'REMEMBERED',
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    source: 'session_observation',
    confidence: 0.7,
    memoryClass: 'short_term',
    candidateLongTerm: false,
    interestSignal: 0.9,
    corrections: 0,
    lastRecalledAt: null,
    withdrawnAt: null,
    expiredAt: null,
    deletionAudit: null,
    ...overrides,
  };
}

describe('buildMemoryTopicIndex', () => {
  it('EXPIRED 记录不入主题索引', () => {
    const active = record({ recordId: 'memory_synthetic_0001', topic: '深海生物' });
    const expired = record({
      recordId: 'memory_synthetic_0002',
      topic: '猫呼噜',
      lifecycle: 'EXPIRED',
    });
    const index = buildMemoryTopicIndex([active, expired]);
    expect(index.get('深海生物')).toBe('memory_synthetic_0001');
    expect(index.has('猫呼噜')).toBe(false);
  });

  it('同主题多条活跃记录——保留 updatedAt 最新者', () => {
    const older = record({
      recordId: 'memory_synthetic_0001',
      topic: '深海生物',
      updatedAt: '2026-10-11T00:00:00.000Z',
    });
    const newer = record({
      recordId: 'memory_synthetic_0002',
      topic: '深海生物',
      updatedAt: '2026-10-12T00:00:00.000Z',
    });
    const index = buildMemoryTopicIndex([older, newer]);
    expect(index.get('深海生物')).toBe('memory_synthetic_0002');
  });

  it('空输入 → 空索引', () => {
    expect(buildMemoryTopicIndex([]).size).toBe(0);
  });
});

describe('nextMemoryCounter', () => {
  it('取 memory_synthetic_NNNN 最大序号', () => {
    const records = [
      record({ recordId: 'memory_synthetic_0001', topic: 'a' }),
      record({ recordId: 'memory_synthetic_0042', topic: 'b' }),
      record({ recordId: 'memory_synthetic_0007', topic: 'c' }),
    ];
    expect(nextMemoryCounter(records)).toBe(42);
  });

  it('非规范 ID 忽略——空输入返回 0', () => {
    expect(nextMemoryCounter([])).toBe(0);
    expect(
      nextMemoryCounter([record({ recordId: 'legacy-id', topic: 'a' })]),
    ).toBe(0);
  });
});

describe('MemoryStore.restore', () => {
  it('水合 records / byTopic / counter——恢复后新记录 ID 递增不撞号', () => {
    const store = new MemoryStore();
    const restored = [
      record({ recordId: 'memory_synthetic_0001', topic: '深海生物' }),
      record({ recordId: 'memory_synthetic_0002', topic: '猫呼噜' }),
    ];
    expect(store.restore(restored)).toBe(2);
    expect(store.getSnapshot().records).toHaveLength(2);
    expect(store.findByTopic('深海生物')?.recordId).toBe('memory_synthetic_0001');

    const written = store.recordMemory({
      sessionId: 'session_synthetic_0001',
      topic: '发光水母',
      intentSignal: 'observed_interest',
      source: 'session_observation',
      now: '2026-10-12T01:00:00.000Z',
    });
    expect(written.recorded).toBe(true);
    // 计数器从 2 恢复 → 新记录为 0003（不与历史撞号）。
    expect(written.record.recordId).toBe('memory_synthetic_0003');
  });

  it('幂等——内存非空时返回 0 且不覆盖既有记录', () => {
    const store = new MemoryStore();
    store.recordMemory({
      sessionId: 'session_synthetic_0001',
      topic: '深海生物',
      intentSignal: 'observed_interest',
      source: 'session_observation',
      now: '2026-10-12T00:00:00.000Z',
    });
    const incoming = [
      record({ recordId: 'memory_synthetic_0009', topic: '不应注入' }),
    ];
    expect(store.restore(incoming)).toBe(0);
    expect(store.getSnapshot().records).toHaveLength(1);
    expect(store.findByTopic('不应注入')).toBeUndefined();
  });

  it('EXPIRED 记录原样保留（审计留痕）但主题索引排除', () => {
    const store = new MemoryStore();
    const restored = [
      record({ recordId: 'memory_synthetic_0001', topic: '深海生物' }),
      record({
        recordId: 'memory_synthetic_0002',
        topic: '猫呼噜',
        lifecycle: 'EXPIRED',
        deletionAudit: {
          deletedAt: '2026-10-12T00:00:00.000Z',
          scope: 'record memory_synthetic_0002 (topic: 猫呼噜)',
          reason: 'withdrawn',
          verification: 'withdrawal acknowledged',
        },
      }),
    ];
    expect(store.restore(restored)).toBe(2);
    // EXPIRED 仍在快照（审计留痕不丢）……
    expect(store.getSnapshot().records).toHaveLength(2);
    // ……但主题索引与检索面排除。
    expect(store.findByTopic('猫呼噜')).toBeUndefined();
    const signals = store.retrieveRelevant('猫呼噜', '2026-10-12T00:00:00.000Z');
    expect(signals).toHaveLength(0);
  });
});

describe('MemoryStore persist 钩子', () => {
  it('recordMemory（新记录 / 再探索）后 flush 全量快照', () => {
    const seen: MemoryRecord[][] = [];
    const store = new MemoryStore({ persist: (records) => seen.push(records) });
    store.recordMemory({
      sessionId: 'session_synthetic_0001',
      topic: '深海生物',
      intentSignal: 'observed_interest',
      source: 'session_observation',
      now: '2026-10-12T00:00:00.000Z',
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1);
    expect(seen[0][0].topic).toBe('深海生物');

    // 同主题再探索 → 再探索路径 flush。
    store.recordMemory({
      sessionId: 'session_synthetic_0001',
      topic: '深海生物',
      intentSignal: 'observed_interest',
      source: 'session_observation',
      now: '2026-10-12T01:00:00.000Z',
    });
    expect(seen).toHaveLength(2);
    expect(seen[1][0].interestSignal).toBeGreaterThan(0.9);
  });

  it('recall / correct / withdraw 后 flush', () => {
    const seen: MemoryRecord[][] = [];
    const store = new MemoryStore({ persist: (records) => seen.push(records) });
    const written = store.recordMemory({
      sessionId: 'session_synthetic_0001',
      topic: '深海生物',
      intentSignal: 'observed_interest',
      source: 'session_observation',
      now: '2026-10-12T00:00:00.000Z',
    });
    const recordId = written.record.recordId;
    seen.length = 0;

    store.recallMemory(recordId, '2026-10-12T00:01:00.000Z');
    expect(seen).toHaveLength(1);
    expect(seen[0][0].lifecycle).toBe('IN_USE');
    seen.length = 0;

    store.correctMemory(recordId, { correctedTopic: '深海发光生物', now: '2026-10-12T00:02:00.000Z' });
    expect(seen).toHaveLength(1);
    expect(seen[0][0].corrections).toBe(1);
    seen.length = 0;

    store.withdrawMemory(recordId, '2026-10-12T00:03:00.000Z');
    expect(seen).toHaveLength(1);
    expect(seen[0][0].lifecycle).toBe('EXPIRED');
    expect(seen[0][0].deletionAudit).not.toBeNull();
  });

  it('applyDecay 发生迁移 / 到期时 flush；无迁移不 flush', () => {
    const seen: MemoryRecord[][] = [];
    const store = new MemoryStore({ persist: (records) => seen.push(records) });
    const written = store.recordMemory({
      sessionId: 'session_synthetic_0001',
      topic: '深海生物',
      intentSignal: 'observed_interest',
      source: 'session_observation',
      now: '2026-10-12T00:00:00.000Z',
    });
    // recall → IN_USE（激活衰减面）。
    store.recallMemory(written.record.recordId, '2026-10-12T00:00:00.000Z');
    seen.length = 0;

    // 时间推进 5 天使有效兴趣跌破 DECAYING 阈值
    // （0.9·e^(-k·5)≈0.497 < 0.5——IN_USE → DECAYING 迁移；
    // 仍高于 EXPIRE 阈值 0.1，不到期）。
    const decayResult = store.applyDecay('2026-10-17T00:00:00.000Z');
    expect(decayResult.decayed).toHaveLength(1);
    expect(decayResult.expired).toHaveLength(0);
    expect(seen).toHaveLength(1);
    expect(seen[0][0].lifecycle).toBe('DECAYING');
    seen.length = 0;

    // 无迁移扫描（DECAYING 且兴趣仍高于 EXPIRE 阈值）不 flush。
    const noChange = store.applyDecay('2026-10-17T01:00:00.000Z');
    expect(noChange.decayed).toHaveLength(0);
    expect(noChange.expired).toHaveLength(0);
    expect(seen).toHaveLength(0);
  });

  it('无 persist 注入——recordMemory 正常返回（零行为变化）', () => {
    const store = new MemoryStore();
    const written = store.recordMemory({
      sessionId: 'session_synthetic_0001',
      topic: '深海生物',
      intentSignal: 'observed_interest',
      source: 'session_observation',
      now: '2026-10-12T00:00:00.000Z',
    });
    expect(written.recorded).toBe(true);
    expect(store.getSnapshot().records).toHaveLength(1);
  });
});
