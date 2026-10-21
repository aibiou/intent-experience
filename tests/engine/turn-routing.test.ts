/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { isSameCreationGoal, normalizeCreationGoal } from '../../src/lib/experience/creation';
import type { CreationObject } from '../../src/lib/experience/creation';
import { routeTurn } from '../../src/lib/experience/turn-routing';

/**
 * 轮次路由（turn-routing.ts）——DEFECT-CREATION-001 的机器判据。
 *
 * 缺陷形态：活跃创作域内，用户重复表达同一诉求（「生成视频」「继续生成
 * 动态的视频」「生成动态的视频，俩人在观海」）被无条件改写为 CREATE，
 * 走首建路径 → supersede 现有创作 + version 重置为 1。真实库中 19/20
 * 个有创作域的会话 version 恒为 1、41 个会话只有 1 个走到 COMPLETED。
 *
 * 锁定三条：
 * 1. 无活跃创作时首建行为完全不变（不能因为修复而让「第一次创作」失效）；
 * 2. 活跃创作 + 同目标 → CONTINUE（创作对象不动，只追加生成）；
 * 3. 活跃创作 + 不同目标 → 仍 CREATE（用户确实换了作品，允许取代并归档）。
 */

function makeCreation(overrides?: Partial<CreationObject>): CreationObject {
  return {
    creationId: 'creation_abc123_003',
    sourceSession: 'session-1',
    sourceStateVersion: 3,
    concept: { theme: '傍晚海边风', goal: '生成动态的视频，俩人在观海' },
    content: '第一版：傍晚的海边，两个人并肩看海，风把衣角吹起。',
    userChanges: [],
    version: 1,
    phase: 'PREVIEW',
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('同目标判定（isSameCreationGoal）', () => {
  it('完全相同 → true', () => {
    expect(isSameCreationGoal('生成动态的视频，俩人在观海', '生成动态的视频，俩人在观海')).toBe(true);
  });

  it('标点 / 空格 / 大小写差异不影响判定（用户重复表达的真实形态）', () => {
    expect(isSameCreationGoal('生成动态的视频，俩人在观海', '生成动态的视频 俩人在观海。')).toBe(true);
    expect(isSameCreationGoal('生成动态的视频，俩人在观海', ' 生成动态的视频,俩人在观海 ')).toBe(true);
    expect(isSameCreationGoal('A Cat On The Beach', 'a cat on the beach')).toBe(true);
  });

  it('换主体 / 换场景 → false（宁可新建并归档，也不悄悄合并换向意图）', () => {
    expect(isSameCreationGoal('生成动态的视频，俩人在观海', '生成动态的视频，一个人在灯塔')).toBe(false);
    expect(isSameCreationGoal('一个小游戏', '一个小游戏，但要更难')).toBe(false);
  });

  it('空目标永不判同（防御脏数据）', () => {
    expect(isSameCreationGoal('', '')).toBe(false);
    expect(isSameCreationGoal('   ', '一个小游戏')).toBe(false);
    expect(normalizeCreationGoal('，。！')).toBe('');
  });
});

describe('轮次路由——同目标不重建创作', () => {
  it('无活跃创作：生成请求首建（CREATE），修复不影响第一次创作', () => {
    const routing = routeTurn('生成动态的视频，俩人在观海', null);
    expect(routing.semanticAction).toBe('CREATE');
    expect(routing.generationIntent?.modality).toBe('video');
  });

  it('活跃创作 + 同目标 + 生成意图 → CONTINUE（不 supersede、version 不重置）', () => {
    const routing = routeTurn('生成动态的视频，俩人在观海', makeCreation());
    expect(routing.semanticAction).toBe('CONTINUE');
    expect(routing.generationIntent?.modality).toBe('video');
    expect(routing.creationIntent).toBeNull();
  });

  it('活跃创作 + 同目标但标点不同 → 仍 CONTINUE（真实重复输入形态）', () => {
    const routing = routeTurn('生成动态的视频 俩人在观海。', makeCreation());
    expect(routing.semanticAction).toBe('CONTINUE');
  });

  it('活跃创作 + 不同目标 → CREATE（真的换作品：允许取代，历史由 runtime 归档）', () => {
    const routing = routeTurn('生成一张海边灯塔的插画', makeCreation());
    expect(routing.semanticAction).toBe('CREATE');
  });

  it('活跃创作 + 无生成意图的修改输入 → 仍走创作补丁（CREATE + creationIntent）', () => {
    const routing = routeTurn('再加两个障碍', makeCreation({ concept: { theme: '深海', goal: '一个小游戏' } }));
    expect(routing.semanticAction).toBe('CREATE');
    expect(routing.creationIntent?.kind).toBe('modification');
  });

  it('活跃创作 + 「继续生成视频」→ CONTINUE（步骤 1 修复不回归）', () => {
    const routing = routeTurn('继续生成视频', makeCreation());
    expect(routing.semanticAction).toBe('CONTINUE');
  });

  it('活跃创作 + 裸「生成视频」→ CONTINUE（步骤 1b 修复不回归）', () => {
    const routing = routeTurn('生成视频', makeCreation());
    expect(routing.semanticAction).toBe('CONTINUE');
  });

  it('停止语义优先于一切（用户主权不被同目标合并吞掉）', () => {
    const routing = routeTurn('算了', makeCreation());
    expect(routing.semanticAction).toBe('STOP');
  });
});
