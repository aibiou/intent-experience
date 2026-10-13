import { describe, expect, it } from 'vitest';
import { curateList, curateMatchScore } from '../../src/experience/curation';
import type { ExperienceSeed } from '../../src/experience/catalog';

/**
 * 目录策展（curation.ts，⑥ 项）——首页默认"推荐"视图的个性化排序纯逻辑。
 * 契约：① 无记忆（新用户）→ 原序零变化；② 匹配体验整体前移、匹配组保持
 * 原相对顺序，未匹配组同样保持原相对顺序（只前移不删除——不收窄视野）；
 * ③ 全部匹配 / 全部不匹配 → 原序不变。
 */
function seed(id: string, title: string, summary: string, tags: string[]): ExperienceSeed {
  return {
    id,
    title,
    summary,
    prompt: '',
    category: 'discover',
    tags,
    hue: 0,
    hue2: 0,
    motif: 'dots',
    hot: 10,
    depth: 1,
    hook: 'h',
    entries: [],
  };
}

const DEEP_SEA = seed('d', '深海发光生物的生存策略', '聊聊生物发光怎么成了深海的通用语言', [
  '海洋',
  '生物',
]);
const RAIN_CAFE = seed('r', '雨夜咖啡馆声音漫游', '一场听觉散步：雨声、杯碟', ['声音', '夜晚']);
const CLOUD = seed('c', '云为什么是白色的', '藏着米氏散射的完整逻辑', ['物理', '天气']);

const catalog: ExperienceSeed[] = [RAIN_CAFE, DEEP_SEA, CLOUD];

describe('curation：匹配评分', () => {
  it('记忆主题关键词命中体验 → 加分（深海/生物/发光）', () => {
    expect(
      curateMatchScore(DEEP_SEA, [{ topic: '深海生物为什么要发光？' }]),
    ).toBeGreaterThan(0);
  });
  it('记忆主题与体验无交集 → 0', () => {
    expect(curateMatchScore(RAIN_CAFE, [{ topic: '深海生物为什么要发光？' }])).toBe(0);
  });
  it('空记忆 / 空主题 → 0（不误匹配）', () => {
    expect(curateMatchScore(DEEP_SEA, [])).toBe(0);
    expect(curateMatchScore(DEEP_SEA, [{ topic: '' }])).toBe(0);
  });
});

describe('curation：无记忆 → 零变化', () => {
  it('记忆为空时返回原数组（引用不变，新用户原序）', () => {
    expect(curateList(catalog, [])).toBe(catalog);
  });
});

describe('curation：有记忆 → 匹配前移', () => {
  it('匹配体验整体前移，匹配组/未匹配组各自保持原相对顺序', () => {
    const result = curateList(catalog, [{ topic: '我喜欢研究深海生物' }]);
    expect(result[0]).toBe(DEEP_SEA);
    expect(result[1]).toBe(RAIN_CAFE);
    expect(result[2]).toBe(CLOUD);
  });
  it('全部匹配 → 返回原数组（无重排）', () => {
    // bigram：深海→DEEP_SEA、雨夜→RAIN_CAFE、物理→CLOUD 全命中。
    const result = curateList(catalog, [{ topic: '深海雨夜物理云' }]);
    expect(result).toBe(catalog);
  });
  it('全部不匹配 → 返回原数组（无重排）', () => {
    const result = curateList(catalog, [{ topic: '编程代码调试' }]);
    expect(result).toBe(catalog);
  });
});
