import type { ChunkFixture } from '../chunks';

/**
 * CORRECTION 语料（合成数据；PD-21 关闭切片；G07）。
 * 最小 Correction：确认纠正、移除无效推断、保留有效上下文
 * （会话 / 意图 / 先前事件不清空），并给出重评估后的候选。
 * 完整 Correction 语义属 S2（PD-05）。
 */
export const correction: ChunkFixture = {
  fixtureId: 'synthetic/correction/v1',
  semanticAction: 'CORRECTION',
  policyAction: 'EXPLAIN',
  chunks: [
    '收到纠正',
    '（合成数据）',
    '：已移除无效推断',
    '，保留有效上下文',
    '（本会话与先前',
    '事件不清空），并',
    '基于纠正后的候选',
    '重新解释当前问题。',
    '（流式结束）',
  ],
};
