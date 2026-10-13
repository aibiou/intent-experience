/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  MEMORY_DECAY_K,
  MEMORY_DECAY_THRESHOLD,
  MEMORY_EXPIRE_THRESHOLD,
  MEMORY_INTEREST_ANCHOR,
  MEMORY_RETENTION_MS,
  applyMemoryDecay,
  correctMemory,
  effectiveInterest,
  extractCorrectedTopic,
  passesMemoryWriteFilter,
  recallMemory,
  recognizeMemoryOperation,
  recordMemory,
  retrieveRelevant,
  withdrawMemory,
} from '../../src/lib/experience/memory';
import type { MemoryRecord } from '../../src/lib/experience/memory';

/**
 * 记忆域（memory.ts）——Minimal Memory 生命周期 + 衰减 + 写入过滤 + 检索。
 * 契约依据：S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 + 07 号契约（§4 兴趣信号措辞 /
 * §7 不默认长期记住 / §11 衰减锚点 / §13 撤回 / §17 纠正 / §20 检索 /
 * §22 检索不改变体验）+ D-02 / D-03 / D-04 / D-05 选项 A。
 * 切片边界：S2a = 仅短期记忆（不引入 S3a 长期记忆 / memoryClass / explicit）。
 * 纯逻辑：零 DB / 零网络；所有函数 records 数组 → 新数组，不 mutate 入参。
 */

const T0 = '2025-01-01T00:00:00.000Z';
const T1 = '2025-01-10T00:00:00.000Z';
const T2 = '2025-02-01T00:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

function atDay(days: number): string {
  return new Date(Date.parse(T0) + days * DAY_MS).toISOString();
}

function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    recordId: 'memory_0001',
    topic: '雨声与放松',
    intentSignal: '雨声白噪声的探索',
    lifecycle: 'REMEMBERED',
    createdAt: T0,
    updatedAt: T0,
    source: 'session_observation',
    confidence: 0.7,
    interestSignal: 0.9,
    corrections: 0,
    lastRecalledAt: null,
    withdrawnAt: null,
    expiredAt: null,
    deletionAudit: null,
    ...overrides,
  };
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('memory：有效兴趣衰减（07 §11 规范参数）', () => {
  it('规范参数常量锁定', () => {
    expect(MEMORY_INTEREST_ANCHOR).toBe(0.9);
    expect(MEMORY_DECAY_K).toBe(Math.log(0.9 / 0.63) / 3);
    expect(MEMORY_DECAY_THRESHOLD).toBe(0.5);
    expect(MEMORY_EXPIRE_THRESHOLD).toBe(0.1);
    expect(MEMORY_RETENTION_MS).toBe(180 * 24 * 60 * 60 * 1000);
  });

  it('Day 0 锚点：有效兴趣 = 0.9', () => {
    expect(effectiveInterest(makeRecord(), T0)).toBe(0.9);
  });

  it('Day 3 ≈ 0.63（容差 0.01）', () => {
    const value = effectiveInterest(makeRecord(), atDay(3));
    expect(Math.abs(value - 0.63)).toBeLessThan(0.01);
  });

  it('未来时间不增（daysBetween 下界 0 天）', () => {
    const record = makeRecord({ updatedAt: atDay(10) });
    expect(effectiveInterest(record, T0)).toBe(0.9);
  });

  it('非法日期按 0 天处理（容错）', () => {
    const record = makeRecord({ updatedAt: 'not-a-date' });
    expect(effectiveInterest(record, T0)).toBe(0.9);
  });

  it('自定义兴趣基数参与衰减（0.5 × Day 3 ≈ 0.35）', () => {
    const record = makeRecord({ interestSignal: 0.5, updatedAt: T0 });
    expect(Math.abs(effectiveInterest(record, atDay(3)) - 0.35)).toBeLessThan(0.01);
  });
});

describe('memory：写入过滤（07 §7 不默认长期记住清单——六类）', () => {
  it('六类标记各一例 → 拒绝', () => {
    expect(passesMemoryWriteFilter('我现在很烦，一时情绪', '体验中的表达')).toBe(false); // 临时情绪
    expect(passesMemoryWriteFilter('就这一次想看深海视频', '临时起意')).toBe(false); // 一次性兴趣
    expect(passesMemoryWriteFilter('帮我查这班列车时刻，单次任务', '出行')).toBe(false); // 一次性任务
    expect(passesMemoryWriteFilter('这个环境太吵了', '环境感受')).toBe(false); // 当前环境
    expect(passesMemoryWriteFilter('这次先不要，单次拒绝', '')).toBe(false); // 单次拒绝
    expect(passesMemoryWriteFilter('我觉得他大概是内向的人，纯属猜测', '')).toBe(false); // 推测人格
  });

  it('intentSignal 侧命中同样拒绝', () => {
    expect(passesMemoryWriteFilter('夜间跑步', '当前会话中的观察')).toBe(false);
  });

  it('正常主题通过', () => {
    expect(passesMemoryWriteFilter('雨声与睡眠', '对白噪声的持续探索')).toBe(true);
    expect(passesMemoryWriteFilter('轻音乐专注', '工作时段的背景音探索')).toBe(true);
  });
});

describe('memory：记忆操作识别与纠正内容提取（07 §13 / §17）', () => {
  it('WITHDRAW 词表五词全部命中', () => {
    const inputs = ['别再给我推荐这个', '别再推荐雨声', '别再出现这种建议', '不要再给我推了', '不要再推荐了'];
    for (const input of inputs) {
      expect(recognizeMemoryOperation(input)).toEqual({ memoryIntent: 'withdraw' });
    }
  });

  it('CORRECT 词表四词全部命中', () => {
    const inputs = ['记忆纠正', '纠正记忆', '记忆有误', '记忆记错'];
    for (const input of inputs) {
      expect(recognizeMemoryOperation(input)).toEqual({ memoryIntent: 'correct' });
    }
  });

  it('WITHDRAW > CORRECT（撤回为用户主权更强信号）', () => {
    expect(recognizeMemoryOperation('别再推荐这个了，而且记忆有误')).toEqual({ memoryIntent: 'withdraw' });
  });

  it('无关输入 → null', () => {
    expect(recognizeMemoryOperation('雨声为什么让人放松')).toBeNull();
  });

  it('extractCorrectedTopic：“记忆纠正：X” → X（去前导标点空白）', () => {
    expect(extractCorrectedTopic('记忆纠正：雨声助眠')).toBe('雨声助眠');
    expect(extractCorrectedTopic('纠正记忆：轻音乐专注')).toBe('轻音乐专注');
    expect(extractCorrectedTopic('记忆纠正：，。 雨声')).toBe('雨声');
    expect(extractCorrectedTopic('记忆纠正:白噪声')).toBe('白噪声');
  });

  it('extractCorrectedTopic：无显式内容 → null（纯留痕纠正）', () => {
    expect(extractCorrectedTopic('记忆纠正：')).toBeNull();
    expect(extractCorrectedTopic('记忆有误')).toBeNull();
    expect(extractCorrectedTopic('随便聊聊')).toBeNull();
  });
});

describe('memory：写入（recordMemory）', () => {
  it('新记录字段全量断言（session_observation → confidence 0.7、兴趣锚点 0.9）', () => {
    const result = recordMemory([], {
      topic: '雨声助眠',
      intentSignal: '用户连续两天探索雨声助眠',
      source: 'session_observation',
      now: T1,
      recordId: 'memory_0001',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.record).toEqual({
      recordId: 'memory_0001',
      topic: '雨声助眠',
      intentSignal: '用户连续两天探索雨声助眠',
      lifecycle: 'REMEMBERED',
      createdAt: T1,
      updatedAt: T1,
      source: 'session_observation',
      confidence: 0.7,
      interestSignal: 0.9,
      corrections: 0,
      lastRecalledAt: null,
      withdrawnAt: null,
      expiredAt: null,
      deletionAudit: null,
    });
    expect(result.reexploration).toBe(false);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].recordId).toBe('memory_0001');
  });

  it('user_correction 来源 → confidence 0.95', () => {
    const result = recordMemory([], {
      topic: '雨声助眠',
      intentSignal: '纠正后的意图信号',
      source: 'user_correction',
      now: T1,
      recordId: 'memory_0009',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.record.confidence).toBe(0.95);
    expect(result.record.source).toBe('user_correction');
    expect(result.record.interestSignal).toBe(0.9);
    expect(result.record.lifecycle).toBe('REMEMBERED');
  });

  it('默认 recordId：memory_ 四位补零（序号 = 数组长度 + 1，冲突去重）', () => {
    const first = recordMemory([], { topic: '雨声助眠', intentSignal: 'i', source: 'session_observation', now: T1 });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error('expected ok');
    }
    expect(first.record.recordId).toBe('memory_0001');
    const second = recordMemory(first.records, {
      topic: '轻音乐专注',
      intentSignal: 'i',
      source: 'session_observation',
      now: T1,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error('expected ok');
    }
    expect(second.record.recordId).toBe('memory_0002');
    // 去重：已有非顺序 id（memory_0002）时默认序号跳到 0003
    const sparse = [makeRecord({ recordId: 'memory_0002', topic: '其他主题' })];
    const third = recordMemory(sparse, { topic: '又一事', intentSignal: 'i', source: 'session_observation', now: T1 });
    expect(third.ok).toBe(true);
    if (!third.ok) {
      throw new Error('expected ok');
    }
    expect(third.record.recordId).toBe('memory_0003');
  });

  it('同主题活跃记录 → 再探索：+0.15、updatedAt 刷新、不新建', () => {
    const existing = makeRecord({
      recordId: 'memory_0001',
      topic: '雨声助眠',
      intentSignal: '旧信号',
      interestSignal: 0.6,
      lifecycle: 'IN_USE',
      createdAt: T0,
      updatedAt: T0,
      lastRecalledAt: T0,
    });
    const records = [existing];
    const result = recordMemory(records, { topic: '雨声助眠', intentSignal: '再次探索', source: 'session_observation', now: T1 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.reexploration).toBe(true);
    expect(result.record.interestSignal).toBeCloseTo(0.75, 10); // 0.6 + 0.15
    expect(result.record.updatedAt).toBe(T1); // 刷新（活跃记忆不因持续使用而意外过期）
    expect(result.record.createdAt).toBe(T0); // 创建时间不变
    expect(result.record.corrections).toBe(0);
    expect(result.records).toHaveLength(1); // 不新建记录
    expect(records[0].interestSignal).toBe(0.6); // 入参未被 mutate
    expect(records[0].updatedAt).toBe(T0);
  });

  it('再探索兴趣上限 1（0.9 + 0.15 → 1）', () => {
    const existing = makeRecord({ topic: '雨声助眠', interestSignal: 0.9 });
    const result = recordMemory([existing], { topic: '雨声助眠', intentSignal: 'x', source: 'session_observation', now: T1 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.record.interestSignal).toBe(1);
  });

  it('同主题已过期记录 → 新建（非再探索）', () => {
    const expired = makeRecord({
      recordId: 'memory_0001',
      topic: '雨声助眠',
      lifecycle: 'EXPIRED',
      expiredAt: T0,
      deletionAudit: {
        deletedAt: T0,
        scope: 'record memory_0001 (topic: 雨声助眠)',
        reason: 'withdrawn',
        verification: 'v',
      },
    });
    const result = recordMemory([expired], {
      topic: '雨声助眠',
      intentSignal: '重新出现',
      source: 'session_observation',
      now: T1,
      recordId: 'memory_0002',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.reexploration).toBe(false);
    expect(result.records).toHaveLength(2);
    expect(result.record.recordId).toBe('memory_0002');
    expect(result.record.lifecycle).toBe('REMEMBERED');
  });

  it('写入过滤拒绝 → { ok: false, reason: write_filter }', () => {
    const result = recordMemory([], {
      topic: '就这一次想看深海视频',
      intentSignal: '临时起意',
      source: 'session_observation',
      now: T1,
    });
    expect(result).toEqual({ ok: false, reason: 'write_filter' });
  });
});

describe('memory：召回（recallMemory——REMEMBERED→IN_USE）', () => {
  it('REMEMBERED → IN_USE：lastRecalledAt + updatedAt 刷新', () => {
    const record = makeRecord({ lifecycle: 'REMEMBERED', updatedAt: T0, lastRecalledAt: null });
    const records = [record];
    const result = recallMemory(records, 'memory_0001', T1);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.record.lifecycle).toBe('IN_USE');
    expect(result.record.lastRecalledAt).toBe(T1);
    expect(result.record.updatedAt).toBe(T1);
    expect(result.records[0].lifecycle).toBe('IN_USE');
    expect(record.lifecycle).toBe('REMEMBERED'); // 入参未被 mutate
    expect(record.lastRecalledAt).toBeNull();
  });

  it('EXPIRED → 拒绝（MEMORY_EXPIRED）', () => {
    expect(recallMemory([makeRecord({ lifecycle: 'EXPIRED' })], 'memory_0001', T1)).toEqual({
      ok: false,
      code: 'MEMORY_EXPIRED',
    });
  });

  it('不存在 → MEMORY_NOT_FOUND', () => {
    expect(recallMemory([], 'memory_9999', T1)).toEqual({ ok: false, code: 'MEMORY_NOT_FOUND' });
  });

  it('IN_USE 幂等：再召回不重复刷新', () => {
    const record = makeRecord({ lifecycle: 'IN_USE', updatedAt: T1, lastRecalledAt: T1 });
    const result = recallMemory([record], 'memory_0001', T2);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.record.lifecycle).toBe('IN_USE');
    expect(result.record.lastRecalledAt).toBe(T1); // 不刷新
    expect(result.record.updatedAt).toBe(T1);
  });

  it('DECAYING 幂等：召回不迁移不刷新', () => {
    const record = makeRecord({ lifecycle: 'DECAYING', updatedAt: T1, lastRecalledAt: T1 });
    const result = recallMemory([record], 'memory_0001', T2);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.record.lifecycle).toBe('DECAYING');
    expect(result.record.updatedAt).toBe(T1);
    expect(result.record.lastRecalledAt).toBe(T1);
  });
});

describe('memory：纠正（correctMemory——07 §17）', () => {
  it('corrections+1、topic 更正、lifecycle→REMEMBERED、兴趣重置锚点、source/confidence 更新', () => {
    const record = makeRecord({
      lifecycle: 'IN_USE',
      topic: '雨声与放松',
      interestSignal: 0.4,
      corrections: 1,
      source: 'session_observation',
      confidence: 0.7,
      updatedAt: T0,
    });
    const records = [record];
    const result = correctMemory(records, 'memory_0001', { correctedTopic: '雨声与专注', now: T2 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.record.topic).toBe('雨声与专注');
    expect(result.record.corrections).toBe(2);
    expect(result.record.lifecycle).toBe('REMEMBERED');
    expect(result.record.interestSignal).toBe(0.9); // 重置锚点
    expect(result.record.source).toBe('user_correction');
    expect(result.record.confidence).toBe(0.95);
    expect(result.record.updatedAt).toBe(T2);
    expect(result.records[0].topic).toBe('雨声与专注');
    expect(record.topic).toBe('雨声与放松'); // 入参未被 mutate
    expect(record.corrections).toBe(1);
  });

  it('correctedTopic 为 null → 纯留痕纠正（topic 不变、corrections 仍 +1）', () => {
    const record = makeRecord({ topic: '雨声与放松', corrections: 0, lifecycle: 'DECAYING', interestSignal: 0.3 });
    const result = correctMemory([record], 'memory_0001', { correctedTopic: null, now: T1 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.record.topic).toBe('雨声与放松');
    expect(result.record.corrections).toBe(1);
    expect(result.record.lifecycle).toBe('REMEMBERED');
    expect(result.record.interestSignal).toBe(0.9);
  });

  it('EXPIRED / 不存在 → 拒绝', () => {
    expect(correctMemory([makeRecord({ lifecycle: 'EXPIRED' })], 'memory_0001', { correctedTopic: 'X', now: T1 })).toEqual({
      ok: false,
      code: 'MEMORY_EXPIRED',
    });
    expect(correctMemory([], 'memory_9999', { correctedTopic: 'X', now: T1 })).toEqual({
      ok: false,
      code: 'MEMORY_NOT_FOUND',
    });
  });
});

describe('memory：撤回（withdrawMemory——07 §13）', () => {
  it('→ EXPIRED + withdrawnAt + 删除审计（reason=withdrawn）', () => {
    const record = makeRecord({ lifecycle: 'IN_USE' });
    const records = [record];
    const result = withdrawMemory(records, 'memory_0001', T1);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected ok');
    }
    expect(result.record.lifecycle).toBe('EXPIRED');
    expect(result.record.withdrawnAt).toBe(T1);
    expect(result.record.expiredAt).toBeNull(); // 撤回留痕不占用到期字段（参考实现语义）
    expect(result.record.deletionAudit).not.toBeNull();
    expect(result.record.deletionAudit?.reason).toBe('withdrawn');
    expect(result.record.deletionAudit?.deletedAt).toBe(T1);
    expect(result.record.deletionAudit?.scope).toContain('memory_0001');
    expect(result.record.deletionAudit?.scope).toContain('雨声与放松');
    expect(typeof result.record.deletionAudit?.verification).toBe('string');
    expect(result.records[0].lifecycle).toBe('EXPIRED');
    expect(record.lifecycle).toBe('IN_USE'); // 入参未被 mutate
  });

  it('重复撤回 → 幂等拒绝（MEMORY_EXPIRED）', () => {
    const record = makeRecord({ lifecycle: 'EXPIRED', withdrawnAt: T0 });
    expect(withdrawMemory([record], 'memory_0001', T1)).toEqual({ ok: false, code: 'MEMORY_EXPIRED' });
  });

  it('不存在 → MEMORY_NOT_FOUND', () => {
    expect(withdrawMemory([], 'memory_9999', T1)).toEqual({ ok: false, code: 'MEMORY_NOT_FOUND' });
  });
});

describe('memory：时间衰减（applyMemoryDecay——07 §11 / D-04）', () => {
  it('IN_USE 超 90 天（有效兴趣 < 0.5）→ DECAYING，且不刷新 updatedAt（衰减时钟连续）', () => {
    const record = makeRecord({ lifecycle: 'IN_USE', updatedAt: T0, lastRecalledAt: T0 });
    const records = [record];
    const result = applyMemoryDecay(records, atDay(90));
    expect(result.decayed).toHaveLength(1);
    expect(result.expired).toHaveLength(0);
    expect(result.records[0].lifecycle).toBe('DECAYING');
    expect(result.records[0].updatedAt).toBe(T0); // 不刷新
    expect(result.records[0].lastRecalledAt).toBe(T0);
    expect(record.lifecycle).toBe('IN_USE'); // 入参未被 mutate
  });

  it('IN_USE 未达阈值（Day 3，0.63 > 0.5）→ 不迁移', () => {
    const record = makeRecord({ lifecycle: 'IN_USE', updatedAt: T0 });
    const result = applyMemoryDecay([record], atDay(3));
    expect(result.decayed).toHaveLength(0);
    expect(result.expired).toHaveLength(0);
    expect(result.records[0].lifecycle).toBe('IN_USE');
  });

  it('REMEMBERED 不参与 DECAYING 迁移（衰减迁移仅自 IN_USE 起）', () => {
    const record = makeRecord({ lifecycle: 'REMEMBERED', updatedAt: T0 });
    const result = applyMemoryDecay([record], atDay(90));
    expect(result.decayed).toHaveLength(0);
    expect(result.expired).toHaveLength(0);
    expect(result.records[0].lifecycle).toBe('REMEMBERED');
  });

  it('DECAYING 有效兴趣 < 0.1 → EXPIRED + 审计 decay_threshold', () => {
    const record = makeRecord({ lifecycle: 'DECAYING', updatedAt: T0 });
    const result = applyMemoryDecay([record], atDay(60));
    expect(result.expired).toHaveLength(1);
    expect(result.decayed).toHaveLength(0);
    expect(result.records[0].lifecycle).toBe('EXPIRED');
    expect(result.records[0].expiredAt).toBe(atDay(60));
    expect(result.records[0].deletionAudit?.reason).toBe('decay_threshold');
    expect(result.records[0].deletionAudit?.deletedAt).toBe(atDay(60));
  });

  it('超 180 天保留期 → EXPIRED + 审计 retention_expired（隐私优先于衰减阈值）', () => {
    const record = makeRecord({ lifecycle: 'IN_USE', updatedAt: T0 });
    const result = applyMemoryDecay([record], atDay(181));
    expect(result.expired).toHaveLength(1);
    expect(result.decayed).toHaveLength(0);
    expect(result.records[0].lifecycle).toBe('EXPIRED');
    expect(result.records[0].expiredAt).toBe(atDay(181));
    expect(result.records[0].deletionAudit?.reason).toBe('retention_expired');
  });

  it('179 天未满保留期 → 不因保留期删除', () => {
    const record = makeRecord({ lifecycle: 'REMEMBERED', updatedAt: T0 });
    const result = applyMemoryDecay([record], atDay(179));
    expect(result.expired).toHaveLength(0);
    expect(result.records[0].lifecycle).toBe('REMEMBERED');
  });

  it('已 EXPIRED 记录跳过（不重复处理、审计不被覆盖）', () => {
    const audit = { deletedAt: T0, scope: 's', reason: 'withdrawn' as const, verification: 'v' };
    const record = makeRecord({ lifecycle: 'EXPIRED', updatedAt: T0, deletionAudit: audit });
    const result = applyMemoryDecay([record], atDay(400));
    expect(result.decayed).toHaveLength(0);
    expect(result.expired).toHaveLength(0);
    expect(result.records[0].lifecycle).toBe('EXPIRED');
    expect(result.records[0].deletionAudit).toEqual(audit);
  });
});

describe('memory：相关记忆检索（retrieveRelevant——07 §20 / §22）', () => {
  it('相关命中：REMEMBERED → IN_USE（RECALL 迁移）、返回读取时点有效兴趣', () => {
    const record = makeRecord({
      topic: '雨声与放松',
      intentSignal: '雨声白噪声的探索',
      lifecycle: 'REMEMBERED',
      updatedAt: T0,
      lastRecalledAt: null,
    });
    const records = [record];
    const result = retrieveRelevant(records, '雨声为什么让人放松', T0);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].recordId).toBe('memory_0001');
    expect(result.signals[0].topic).toBe('雨声与放松');
    expect(result.signals[0].intentSignal).toBe('雨声白噪声的探索');
    expect(result.signals[0].lifecycle).toBe('IN_USE'); // RECALL 迁移
    expect(result.signals[0].interestSignal).toBe(0.9); // Day 0 读取时点
    expect(result.records[0].lifecycle).toBe('IN_USE');
    expect(result.records[0].lastRecalledAt).toBe(T0);
    expect(result.records[0].updatedAt).toBe(T0);
    expect(record.lifecycle).toBe('REMEMBERED'); // 入参未被 mutate
    expect(record.lastRecalledAt).toBeNull();
  });

  it('读取时点衰减值：3 天前的 IN_USE 记录 ≈ 0.63（不因命中回跳）', () => {
    const record = makeRecord({ lifecycle: 'IN_USE', updatedAt: T0, lastRecalledAt: T0 });
    const result = retrieveRelevant([record], '雨声为什么让人放松', atDay(3));
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].lifecycle).toBe('IN_USE'); // 0.63 > 0.5，衰减迁移不触发
    expect(Math.abs(result.signals[0].interestSignal - 0.63)).toBeLessThan(0.01);
  });

  it('EXPIRED 不返回（即使主题相关）', () => {
    const record = makeRecord({ lifecycle: 'EXPIRED', topic: '雨声与放松', intentSignal: '雨声白噪声的探索' });
    const result = retrieveRelevant([record], '雨声为什么让人放松', T0);
    expect(result.signals).toHaveLength(0);
    expect(result.records[0].lifecycle).toBe('EXPIRED');
  });

  it('超保留期记录在检索时先到期（懒到期）且不返回', () => {
    const record = makeRecord({ lifecycle: 'REMEMBERED', updatedAt: T0 });
    const result = retrieveRelevant([record], '雨声为什么让人放松', atDay(200));
    expect(result.signals).toHaveLength(0);
    expect(result.records[0].lifecycle).toBe('EXPIRED');
    expect(result.records[0].deletionAudit?.reason).toBe('retention_expired');
  });

  it('不相关不返回（2 字滑窗无交集）', () => {
    const record = makeRecord({ topic: '量子计算入门', intentSignal: '量子纠缠的科普' });
    const result = retrieveRelevant([record], '雨声为什么让人放松', T0);
    expect(result.signals).toHaveLength(0);
  });

  it('DECAYING 命中：不迁移（仅 REMEMBERED 执行 RECALL）', () => {
    const record = makeRecord({ lifecycle: 'DECAYING', updatedAt: T0, lastRecalledAt: null });
    const result = retrieveRelevant([record], '雨声为什么让人放松', T0);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].lifecycle).toBe('DECAYING');
    expect(result.records[0].lastRecalledAt).toBeNull();
    expect(result.records[0].updatedAt).toBe(T0);
  });

  it('入参数组未被 mutate', () => {
    const record = makeRecord({ lifecycle: 'REMEMBERED', updatedAt: T0 });
    const records = [record];
    const before = snapshot(records);
    retrieveRelevant(records, '雨声为什么让人放松', T0);
    expect(records).toEqual(before);
  });
});
