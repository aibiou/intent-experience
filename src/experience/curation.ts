// 目录策展（⑥ 项）——让首页目录"会挑"的纯逻辑模块（可单测）。
// 在默认"推荐"视图，把与全局记忆偏好（③「我记得你」topic 信号）匹配的
// 体验整体前移，匹配组内部保持原顺序（保留轮换带来的新鲜感）。硬约束：
//  ① 无记忆（新用户）→ 原序零变化；
//  ② 用户显式搜索 / 选分类 / 选热门·最新 → 不策展（由调用侧保证）；
//  ③ 只前移不删除——其余内容仍可见（避免过度个性化收窄视野）。

import { CATEGORY_LABELS, type ExperienceSeed } from './catalog';

export interface CurateMemorySignal {
  topic?: string;
}

/**
 * 把文本切成相邻 n-gram 集合（中文无空格分词，bigram 是无需分词器的
 * 轻量匹配基元）。先去掉标点/空白，再取连续 2 字窗口。
 */
function charNgrams(text: string, n = 2): Set<string> {
  const clean = text.replace(/[^\p{L}\p{N}]+/gu, '');
  const out = new Set<string>();
  for (let index = 0; index + n <= clean.length; index += 1) {
    out.add(clean.slice(index, index + n));
  }
  return out;
}

/**
 * 记忆信号与单个体验的匹配分：把记忆主题切 bigram，与体验的
 * title / summary / 分类名 / tags 拼接文本的 bigram 求交集——
 * 任一共享 bigram 即 +1（每条记忆至多计一次）。返回 0 = 无匹配。
 * 对中文（深海/生物/发光）与英文单词都有效。
 */
export function curateMatchScore(
  seed: ExperienceSeed,
  memories: CurateMemorySignal[],
): number {
  if (memories.length === 0) return 0;
  const haystack = [
    seed.title,
    seed.summary,
    CATEGORY_LABELS[seed.category],
    ...seed.tags,
  ]
    .join(' ')
    .toLowerCase();
  const hayNgrams = charNgrams(haystack);
  let score = 0;
  for (const memory of memories) {
    const topic = (memory.topic ?? '').toLowerCase();
    if (!topic) continue;
    const topicNgrams = charNgrams(topic);
    for (const gram of topicNgrams) {
      if (hayNgrams.has(gram)) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

/**
 * 策展排序：把与记忆匹配的体验整体前移到前面（匹配组保持原相对顺序），
 * 未匹配的排后（同样保持原相对顺序）。记忆为空、或全部匹配 / 全部不匹配时
 * 返回原数组（零变化）。不修改入参。
 */
export function curateList(
  list: ExperienceSeed[],
  memories: CurateMemorySignal[],
): ExperienceSeed[] {
  if (memories.length === 0) return list;
  const matched: ExperienceSeed[] = [];
  const rest: ExperienceSeed[] = [];
  for (const seed of list) {
    if (curateMatchScore(seed, memories) > 0) matched.push(seed);
    else rest.push(seed);
  }
  if (matched.length === 0 || matched.length === list.length) return list;
  return [...matched, ...rest];
}
