/**
 * 体验会话快照（dev/personal 形态的跨重启续讲——PD-07 的
 * 附加层演化：不改状态机 / 事件契约语义，仅在每轮完成后
 * 把续讲所需的最小状态落盘，重启后按需恢复）。
 *
 * 快照内容 = 续讲所需最小集：体验状态（含版本号）、会话 /
 * 意图 / 体验记录、体验主题、对话转录。分支 / 创作 / 模拟
 * 域不在此列（恢复后相应操作走既有错误路径）。
 *
 * 存储位置：data/sessions/<experienceId>.json（.gitignore 排除；
 * 原子写——tmp + rename，与 config-store / works-store 同纪律）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExperienceState } from './state-store';

export interface SessionSnapshot {
  experienceId: string;
  sessionId: string;
  intentId: string | null;
  candidateId: string;
  /** 体验主题（首轮用户输入——话题 / 指代解析用）。 */
  topic: string;
  state: ExperienceState;
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>;
  savedAt: string;
}

const SNAPSHOTS_DIR = join(process.cwd(), 'data', 'sessions');

function snapshotPath(experienceId: string): string {
  // experienceId 由运行时生成（合成词表），仍做防御性过滤。
  const safe = experienceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(SNAPSHOTS_DIR, `${safe}.json`);
}

export function saveSessionSnapshot(snapshot: SessionSnapshot): void {
  try {
    mkdir(SNAPSHOTS_DIR, { recursive: true })
      .then(async () => {
        const path = snapshotPath(snapshot.experienceId);
        const tmp = `${path}.tmp`;
        await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
        await rename(tmp, path);
      })
      .catch(() => undefined);
  } catch {
    // 快照失败静默——续讲降级为既有死会话指引，不影响主流程
  }
}

export function loadSessionSnapshot(experienceId: string): SessionSnapshot | null {
  const path = snapshotPath(experienceId);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as SessionSnapshot;
    if (
      parsed &&
      typeof parsed.experienceId === 'string' &&
      parsed.state &&
      typeof parsed.state.stateVersion === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function deleteSessionSnapshot(experienceId: string): void {
  try {
    rm(snapshotPath(experienceId), { force: true }).catch(() => undefined);
  } catch {
    // 清理失败无碍——快照只是缓存
  }
}
