import type { ChunkFixture } from '../chunks';

/**
 * WHAT_IF 模拟提案语料（合成数据；S1 §14 / PD-06）。
 *
 * F-4 语义（S2A-F4-SEMANTIC-FREEZE-01 D-02/D-04 选项 A，policy_v1.4.0 变更 1 起）：
 * 本轮模拟经模拟域事件 simulation_recorded 登记 ACTIVE 分支记录——会话内持久、
 * 会话结束失效，后续模拟轮在分支上继续（多轮合法，13 §15.3）。
 * 区分事实、推断与假设（E8-G2-CC07）；输入含 STOP 时 STOP 优先（P-01，由分类器保证）。
 *
 * 语料版本：synthetic/simulate/v2（S2-CORPUS-TAIL-RULING-01 v1.0.0 选项 A 裁决——
 * 尾句与 F-4 分支语义对齐；v1 字节冻结于 git 历史，已提交证据哈希链不断裂）。
 */
export const simulate: ChunkFixture = {
  fixtureId: 'synthetic/simulate/v2',
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
    '模拟；本轮模拟已',
    '建立分支状态（会',
    '话内持久，可经后',
    '续"如果"轮继续）',
    '。（流式结束）',
  ],
};
