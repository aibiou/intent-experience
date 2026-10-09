import type { ChunkFixture } from '../chunks';

/**
 * SIMPLIFY 方向性操作合成语料（S2b；S2B-SEMANTIC-FREEZE-01
 * D-01 选项 A——顶层语义动作 14 §8 恒等映射；创作域顶层
 * 补丁操作承载，08 §十 方向性操作自然语示例锚点
 * "简单一点"→SIMPLIFY）。
 * 合成数据：方向性修改提案——简化当前创作对象的复杂度
 * （不重新生成整个作品，08 §11 局部变更纪律；合成模式下
 * 结构保持、版本单调 +1、user_changes 权威登记）。
 */
export const simplify: ChunkFixture = {
  fixtureId: 'synthetic/simplify/v1',
  semanticAction: 'SIMPLIFY',
  policyAction: 'SIMPLIFY',
  chunks: [
    '方向性修改提案',
    '（合成数据）：',
    '简化——降低当前创作',
    '对象的复杂度，收敛',
    '次要机制与冗余规则；',
    '作品结构保持，仅登记',
    '方向性补丁（版本单调',
    '+1）。（流式结束）',
  ],
};
