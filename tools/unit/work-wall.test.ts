import { describe, expect, it } from 'vitest';
import type { MediaArtifactRecord } from '../../src/lib/experience/media-gateway';
import { selectWorkWallRecords } from '../../src/lib/experience/work-wall';

function record(overrides: Partial<MediaArtifactRecord> & { id: string }): MediaArtifactRecord {
  return {
    sessionId: 'session-1',
    turn: 1,
    modality: 'image',
    file: `${overrides.id}.png`,
    mime: 'image/png',
    promptUsed: '候选图',
    at: '2026-10-19T10:00:00.000Z',
    ...overrides,
  };
}

describe('selectWorkWallRecords', () => {
  it('同一轮只保留一张，用户选中的候选优先', () => {
    const records = [
      record({ id: 'old', turn: 1, at: '2026-10-19T10:00:01Z' }),
      record({ id: 'newest', turn: 2, at: '2026-10-19T10:02:00Z', selected: true }),
      record({ id: 'unselected', turn: 2, at: '2026-10-19T10:01:00Z' }),
      record({ id: 'selected', turn: 1, at: '2026-10-19T10:00:02Z', selected: true }),
    ];

    const works = selectWorkWallRecords(records);
    expect(works.map((work) => work.id)).toEqual(['newest', 'selected']);
  });

  it('保留会话隔离与作品墙容量上限', () => {
    const records = [
      record({ id: 'other', sessionId: 'session-2', turn: 1, at: '2026-10-19T10:03:00Z' }),
      record({ id: 'first', turn: 1, at: '2026-10-19T10:00:00Z' }),
      record({ id: 'second', turn: 2, at: '2026-10-19T10:01:00Z' }),
      record({ id: 'hidden', turn: 3, at: '2026-10-19T09:00:00Z' }),
    ];

    const works = selectWorkWallRecords(records, 2);
    expect(works.map((work) => `${work.sessionId}:${work.file}`)).toEqual([
      'session-2:other.png',
      'session-1:second.png',
    ]);
  });
});
