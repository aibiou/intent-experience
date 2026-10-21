/**
 * 创作域生命周期（纯函数）——取代 ≠ 丢弃。
 *
 * DEFECT-CREATION-001 §4.1：原实现把旧创作域标 `active:false` 后，立刻用
 * 新对象整块覆盖 `state.creation`，旧的 `contentHistory` 一并消失。结果是
 * 用户在一个会话里做过的每个作品都不留痕：首建路径每触发一次，会话里就
 * 只剩 1 个版本的内容（真实库 19/20 个有创作域的会话 version 恒为 1）。
 *
 * 这里把「归档」抽成产品与诊断共用的同一份实现——诊断脚本若自己复刻一份，
 * 测的就不是产品（同一缺陷首次修复后回放仍 FAIL 正是此因）。
 */

import type { CreationDomain, ExperienceState } from './types';

/** 会话内最多保留多少个已被取代的创作域（防止状态 JSON 无限增长）。 */
export const MAX_CREATION_HISTORY = 20;

export interface ArchiveResult {
  superseded: boolean;
  /** 归档摘要（写入 CREATION_PREVIEWED 事件，便于事后复盘）。 */
  archived: { creationId: string; version: number; versions: number } | null;
}

/**
 * 把当前活跃创作域归档进会话历史，并标记为已被取代。
 * 无创作 / 创作已结束时为 no-op（幂等——重复调用不会重复归档）。
 */
export function archiveActiveCreation(
  state: Pick<ExperienceState, 'creation' | 'creationHistory'>
): ArchiveResult {
  const domain = state.creation;
  if (!domain || !domain.active) {
    return { superseded: false, archived: null };
  }
  const ended: CreationDomain = {
    ...domain,
    active: false,
    endedReason: 'superseded_by_create',
  };
  const archived = {
    creationId: ended.creation.creationId,
    version: ended.creation.version,
    versions: ended.contentHistory.length,
  };
  state.creationHistory = [...(state.creationHistory ?? []), ended].slice(-MAX_CREATION_HISTORY);
  state.creation = ended;
  return { superseded: true, archived };
}
