import type { MediaArtifactRecord } from './media-gateway';

/**
 * 作品墙压缩同一轮多候选；用户显式选中的候选优先作为代表。
 * Map 保留首轮产物的插入位置，替换代表不会把旧作品顶到前面。
 */
export function selectWorkWallRecords(
  records: MediaArtifactRecord[],
  limit = 48,
): MediaArtifactRecord[] {
  const bounded = records
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
  const representativeByTurn = new Map<string, MediaArtifactRecord>();

  for (const record of bounded) {
    const key = `${record.sessionId}:${record.turn}`;
    const current = representativeByTurn.get(key);
    if (!current) {
      representativeByTurn.set(key, record);
    } else if (record.selected && !current.selected) {
      representativeByTurn.set(key, record);
    }
  }

  return [...representativeByTurn.values()];
}
