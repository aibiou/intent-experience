import type { ChunkFixture } from '../chunks';

/**
 * CREATE 最小 Creation Branch 语料（合成数据；PD-21 关闭切片）。
 * 最小可玩构建：继承当前体验上下文（同一 session / intent / experience，
 * 先前事件与状态版本链完整保留），在当前探索问题上产出可执行的最小构建。
 * 完整 Creation 语义（多轮创作 / IDE 形态）属 S2（PD-05 / PD-06）。
 */
export const create: ChunkFixture = {
  fixtureId: 'synthetic/create/v1',
  semanticAction: 'CREATE',
  policyAction: 'CREATE',
  chunks: [
    '已接收创造意图',
    '（合成数据）',
    '。在当前探索上下文上',
    '构建最小可玩形态',
    '：沿用本会话的问题',
    '与已有推断，产出',
    '首个可试玩构建',
    '并等你反馈。',
    '（流式结束）',
  ],
};
