import type { ChunkFixture } from '../chunks';

/**
 * WHAT_IF 单次模拟提案语料（合成数据；S1 §14 / PD-06）。
 *
 * S1-ACT-WHAT_IF 边界：仅当前单次模拟提案，区分事实、推断与假设
 * （E8-G2-CC07）；不建立持久/多轮分支状态，不修改产品状态。
 * 输入含 STOP 时 STOP 优先（P-01，由分类器保证）。
 */
export const simulate: ChunkFixture = {
  fixtureId: 'synthetic/simulate/v1',
  semanticAction: 'WHAT_IF',
  policyAction: 'SIMULATE',
  chunks: [
    '单次模拟提案',
    '（合成数据）：',
    '事实——当前路况',
    '显示北山街拥堵',
    '；推断——若改走',
    '杨公堤预计节省',
    '约十分钟；假设',
    '——如果世界突然',
    '失去摩擦力，上述',
    '推断将不成立',
    '，车辆无法制动',
    '。本提案为单次',
    '模拟，不建立分支',
    '状态。（流式结束）',
  ],
};
