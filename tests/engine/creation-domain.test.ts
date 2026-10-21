/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  archiveActiveCreation,
  MAX_CREATION_HISTORY,
} from '../../src/lib/experience/creation-domain';
import type { CreationDomain, ExperienceState } from '../../src/lib/experience/types';

/**
 * 创作域归档（DEFECT-CREATION-001 §4.1）。
 *
 * 缺陷形态：首建路径触发时旧创作域被整块覆盖，contentHistory 一并消失——
 * 用户在一个会话里做过的作品只剩最后一个。这里锁定「取代 ≠ 丢弃」：
 * 旧域连同各版本内容归档进 creationHistory，且可追溯。
 */

function makeDomain(version: number, versions: number, active = true): CreationDomain {
  return {
    creation: {
      creationId: `creation_v${version}`,
      sourceSession: 'session-1',
      sourceStateVersion: version,
      concept: { theme: '深海生物发光', goal: '一个小游戏' },
      content: `第 ${version} 版内容`,
      userChanges: [],
      version,
      phase: 'PREVIEW',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    },
    active,
    contentHistory: Array.from({ length: versions }, (_, index) => `第 ${index + 1} 版内容`),
  };
}

function makeState(domain: CreationDomain | null, history?: CreationDomain[]): Pick<ExperienceState, 'creation' | 'creationHistory'> {
  return history === undefined ? { creation: domain } : { creation: domain, creationHistory: history };
}

describe('创作域归档（取代 ≠ 丢弃）', () => {
  it('无创作域 → no-op', () => {
    const state = makeState(null);
    expect(archiveActiveCreation(state)).toEqual({ superseded: false, archived: null });
    expect(state.creationHistory).toBeUndefined();
  });

  it('已结束的创作域 → no-op（幂等，不重复归档）', () => {
    const ended = makeDomain(2, 2, false);
    const state = makeState(ended, [makeDomain(1, 1, false)]);
    expect(archiveActiveCreation(state)).toEqual({ superseded: false, archived: null });
    expect(state.creationHistory).toHaveLength(1);
  });

  it('活跃创作被取代 → 整域归档（含各版本内容），并标记取代原因', () => {
    const domain = makeDomain(3, 3);
    const state = makeState(domain);
    const result = archiveActiveCreation(state);

    expect(result.superseded).toBe(true);
    expect(result.archived).toEqual({ creationId: 'creation_v3', version: 3, versions: 3 });
    expect(state.creationHistory).toHaveLength(1);
    const archivedDomain = state.creationHistory![0];
    expect(archivedDomain.active).toBe(false);
    expect(archivedDomain.endedReason).toBe('superseded_by_create');
    // 关键：版本内容不丢
    expect(archivedDomain.contentHistory).toEqual(['第 1 版内容', '第 2 版内容', '第 3 版内容']);
    expect(archivedDomain.creation.content).toBe('第 3 版内容');
  });

  it('连续取代 → 按顺序追加（旧作品全部可追溯）', () => {
    const state = makeState(makeDomain(1, 1));
    archiveActiveCreation(state);
    state.creation = makeDomain(2, 2);
    archiveActiveCreation(state);
    state.creation = makeDomain(4, 4);
    archiveActiveCreation(state);

    expect(state.creationHistory!.map((item) => item.creation.creationId)).toEqual([
      'creation_v1',
      'creation_v2',
      'creation_v4',
    ]);
    expect(state.creationHistory!.map((item) => item.contentHistory.length)).toEqual([1, 2, 4]);
  });

  it(`超过 ${MAX_CREATION_HISTORY} 个只保留最近 ${MAX_CREATION_HISTORY} 个（状态 JSON 不无限增长）`, () => {
    const state = makeState(makeDomain(1, 1));
    for (let index = 1; index <= MAX_CREATION_HISTORY + 5; index++) {
      state.creation = makeDomain(index, index);
      archiveActiveCreation(state);
    }
    expect(state.creationHistory).toHaveLength(MAX_CREATION_HISTORY);
    // 保留的是最近的：最后一个归档的 creationId 在末尾
    expect(state.creationHistory!.at(-1)!.creation.creationId).toBe(
      `creation_v${MAX_CREATION_HISTORY + 5}`,
    );
  });

  it('归档后 state.creation 仍指向该域（active=false），可被新创作安全覆盖', () => {
    const state = makeState(makeDomain(2, 2));
    archiveActiveCreation(state);
    expect(state.creation!.active).toBe(false);
    expect(state.creation!.endedReason).toBe('superseded_by_create');
    state.creation = makeDomain(1, 1);
    expect(state.creation.active).toBe(true);
    expect(state.creationHistory).toHaveLength(1);
  });
});
