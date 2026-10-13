import type { ChunkFixture } from '../chunks';

/**
 * CHANGE_DIRECTION 新候选语料（合成数据）。
 * 旧候选已取消并拒绝（S1 §11：Cancel Generation → Reject Old Candidate →
 * Create New Candidate → New Experience）；本语料是新方向的首轮内容。
 */
export const changeDirection: ChunkFixture = {
  fixtureId: 'synthetic/change-direction/v1',
  semanticAction: 'CHANGE_DIRECTION',
  policyAction: 'CHANGE_EXPERIENCE',
  chunks: [
    '已取消旧方向',
    '并拒绝其旧候选',
    '（合成数据）',
    '。新方向已就绪',
    '：从你的新问题',
    '出发重新探索',
    '，当前路况信息',
    '将按新意图重建',
    '。（流式结束）',
  ],
};
