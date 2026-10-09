import type { ChunkFixture } from '../chunks';

/**
 * REFRAME 方向性操作合成语料（S2b；S2B-SEMANTIC-FREEZE-01
 * D-01 选项 A——顶层语义动作 14 §8 恒等映射；创作域顶层
 * 补丁操作承载，08 §十 方向性操作自然语示例锚点
 * "换角度"→REFRAME）。
 * 合成数据：方向性修改提案——换角度重述当前创作对象的
 * 观察视角（不重新生成整个作品，08 §11 局部变更纪律；
 * 合成模式下结构保持、版本单调 +1、user_changes 权威登记）。
 */
export const reframe: ChunkFixture = {
  fixtureId: 'synthetic/reframe/v1',
  semanticAction: 'REFRAME',
  policyAction: 'REFRAME',
  chunks: [
    '方向性修改提案',
    '（合成数据）：',
    '换角度——从新的观察',
    '视角重述当前创作对象',
    '的主题与机制；作品结构',
    '保持，仅登记方向性补丁',
    '（版本单调 +1）。',
    '（流式结束）',
  ],
};
