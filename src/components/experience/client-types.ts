'use client';

/** 客户端目录/会话摘要类型（对齐 GET /api/experience/catalog、SessionSummary）。 */

export type ClientCategory = 'relax' | 'discover' | 'deep' | 'create' | 'wild';

export interface CatalogSeed {
  id: string;
  title: string;
  summary: string;
  category: ClientCategory;
  tags: string[];
  hook: string;
  context: string | null;
  entries: { label: string; prompt: string }[];
}

export interface RecentSessionSummary {
  id: string;
  topic: string;
  seedId: string | null;
  status: string;
  exitReason: string | null;
  view: { status: string; stage: string };
  turn: number;
  updatedAt: string;
}

export interface CatalogResponse {
  seeds: CatalogSeed[];
  recent: RecentSessionSummary[];
}

/** 作品墙条目（对齐 GET /api/experience/works）。 */
export interface WorkSummary {
  id: string;
  sessionId: string;
  topic: string | null;
  turn: number;
  modality: 'image' | 'voice' | 'video';
  url: string;
  mime: string;
  promptUsed: string;
  at: string;
}

export interface WorksResponse {
  works: WorkSummary[];
}

/** 首页状态入口（Screen 01）——状态，不是兴趣分类。 */
export const STATE_ENTRIES: ReadonlyArray<{
  category: Exclude<ClientCategory, 'wild'>;
  label: string;
}> = [
  { category: 'relax', label: '放松一下' },
  { category: 'discover', label: '发现点东西' },
  { category: 'deep', label: '深入一个问题' },
  { category: 'create', label: '做点什么' },
];

/** 柔和的相对时间（最近探索用）。 */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '昨天';
  if (day < 7) return `${day} 天前`;
  return new Date(t).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}
