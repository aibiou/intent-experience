/**
 * SEARCH 内部能力（S2b；S2B-SEMANTIC-FREEZE-01
 * D-02 / D-03 选项 A——14 §7"SEARCH 不是用户体验类型，
 * 而是一种内部能力动作"；14 §8 VERIFY → SEARCH /
 * ANSWER 路由）。
 *
 * 能力纪律（policy_v2.0.0 变更 2 / 变更 6）：
 * - 只读：不改变体验、不触发产品动作、不产生任何事件；
 * - 无外部网络出口（确定性规则检索——不调用任何提供方）；
 * - 作用面（D-03 选项 A）：当前体验内容 / 创作对象 /
 *   会话内上下文；跨会话记忆检索属 F-5 记忆域 L5 检索
 *   （07 §20 检索纪律），不经 SEARCH 动作；
 * - VERIFY 类输入按既有 WHY / DIRECT_ANSWER 解释层处理，
 *   本能力在这些路径内被调用（附列裁决区选项 A）。
 */

/** 检索面（D-03 选项 A——三面，不含跨会话记忆面）。 */
export type SearchFacet =
  | 'experience_content'
  | 'creation_object'
  | 'session_context';

/** 单面检索结果（只读面摘要）。 */
export interface SearchFacetResult {
  facet: SearchFacet;
  relevant: boolean;
  summary: string;
}

/** 只读检索结果（read_only 恒真——能力纪律标识）。 */
export interface SearchContextResult {
  query: string;
  read_only: true;
  facets: SearchFacetResult[];
}

/** 2 字窗口相关性判定（确定性规则——model on F-5 记忆检索纪律）。 */
function relevantByWindow(query: string, text: string): boolean {
  const windows = new Set<string>();
  for (let i = 0; i + 1 < query.length; i += 1) {
    windows.add(query.slice(i, i + 2));
  }
  for (let i = 0; i + 1 < text.length; i += 1) {
    if (windows.has(text.slice(i, i + 2))) {
      return true;
    }
  }
  return false;
}

/**
 * 执行只读检索（SEARCH 内部能力）。
 * 纯函数：无状态写入、无事件、无网络。三面摘要经
 * 相关性判定过滤——只取相关信号（07 §20 检索纪律
 * 延伸：不把全部上下文塞进检索结果）。
 */
export function searchExperienceContext(input: {
  query: string;
  experienceContent: string;
  creationObject?:
    | { active: boolean; theme: string; goal: string; version: number }
    | undefined;
  sessionContext: readonly string[];
}): SearchContextResult {
  const experienceRelevant = relevantByWindow(input.query, input.experienceContent);
  const creationRelevant =
    input.creationObject?.active === true &&
    relevantByWindow(input.query, `${input.creationObject.theme}\n${input.creationObject.goal}`);
  const sessionRelevant = input.sessionContext.some((label) =>
    relevantByWindow(input.query, label),
  );
  const facets: SearchFacetResult[] = [
    {
      facet: 'experience_content',
      relevant: experienceRelevant,
      summary: experienceRelevant
        ? '当前体验内容与检索意图相关（只读面：体验状态与探索历史）'
        : '当前体验内容与检索意图无相关信号（只读面跳过）',
    },
    {
      facet: 'creation_object',
      relevant: creationRelevant,
      summary:
        input.creationObject?.active === true
          ? creationRelevant
            ? `创作对象（版本 ${input.creationObject.version}）与检索意图相关（只读面：创作对象快照）`
            : '创作对象与检索意图无相关信号（只读面跳过）'
          : '无活跃创作对象（只读面跳过）',
    },
    {
      facet: 'session_context',
      relevant: sessionRelevant,
      summary: sessionRelevant
        ? '会话内上下文与检索意图相关（只读面：已执行动作标签）'
        : '会话内上下文与检索意图无相关信号（只读面跳过）',
    },
  ];
  return { query: input.query, read_only: true, facets };
}
