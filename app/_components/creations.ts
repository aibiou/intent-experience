// 作品（生成物）持久化——本地形态（V1）。
// 生成完成时由体验页写入，首页作品墙读取展示；
// 产物形态：远程提供方为 URL，内联产物（语音）
// 为 dataUri。localStorage 容量有限（语音约百 KB
// 级），上限 12 条、超出淘汰最早。

export interface CreationEntry {
  id: string;
  modality: 'image' | 'voice' | 'video';
  prompt: string;
  url?: string;
  dataUri?: string;
  mime?: string;
  at: string;
  /** 服务端作品库记录 id（服务端持久化后由 /api/works 回填——
   * 删除时同步服务端；纯本地缓存条目无此字段）。 */
  workId?: string;
}

const CREATIONS_KEY = 'intent-experience.creations';
const CREATIONS_MAX = 12;

export function creationSrc(entry: CreationEntry): string | undefined {
  return entry.dataUri ?? entry.url;
}

export function loadCreations(): CreationEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CREATIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as CreationEntry[]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        (item.modality === 'image' ||
          item.modality === 'voice' ||
          item.modality === 'video') &&
        typeof item.prompt === 'string' &&
        creationSrc(item) !== undefined,
    );
  } catch {
    return [];
  }
}

export function saveCreations(creations: CreationEntry[]): void {
  try {
    window.localStorage.setItem(
      CREATIONS_KEY,
      JSON.stringify(creations.slice(0, CREATIONS_MAX)),
    );
  } catch {
    // 容量超限（dataUri 产物过多）时静默放弃持久化——
    // 会话内展示不受影响。
  }
}

export function creationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function timeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}
