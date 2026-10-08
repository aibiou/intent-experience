import type { ChunkFixture } from '../chunks';

export const why: ChunkFixture = {
  fixtureId: 'synthetic/why/v1',
  semanticAction: 'WHY',
  policyAction: 'EXPLAIN',
  chunks: [
    '为什么推荐这条路线',
    '：因为当前路况',
    '（合成数据）',
    '显示北山街拥堵',
    '，而杨公堤',
    '畅通且风景',
    '更契合你的',
    '首体验目标。',
    '（流式结束）',
  ],
};
