import type { ChunkFixture } from '../chunks';

export const directAnswer: ChunkFixture = {
  fixtureId: 'synthetic/direct-answer/v1',
  semanticAction: 'DIRECT_ANSWER',
  policyAction: 'ANSWER',
  chunks: [
    '你问的是',
    '今天杭州的天气',
    '。根据合成语料',
    '（非真实数据）',
    '：晴，气温',
    '22 到 28 摄氏度',
    '。这是首体验直答。',
    '（流式结束）',
  ],
};
