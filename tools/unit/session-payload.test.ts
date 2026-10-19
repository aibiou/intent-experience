/**
 * 会话恢复载荷测试——GET /api/experience/session 的响应形状拼装。
 *
 * 背景（2026-10-19 真实 E2E 缺陷）：接口把 media / mediaJobs 放在 session
 * 同级；三处调用点都从 data.session 上读 media/mediaJobs（undefined），
 * 导致恢复会话时「失败的任务卡 / 后台任务轮询」整条链路静默失效。
 * 本测试锁定纯函数拼装规则，防回归。
 */

import { describe, it, expect } from 'vitest';
import { toLoadedSession, type SessionPayload } from '../../src/components/experience/session-payload';
import type { LoadedSession, SessionMediaJob, SessionMediaRecord } from '../../src/components/experience/use-experience-session';

const session: LoadedSession = {
  id: 's-1',
  seedId: null,
  topic: '傍晚渔港的橘猫船主',
  status: 'ACTIVE',
  exitReason: null,
  stateVersion: 3,
  state: {
    view: { status: 'WAITING', stage: 'CREATION' },
    turn: 2,
    history: [],
    simulation: undefined,
    creation: undefined,
  } as unknown as LoadedSession['state'],
  updatedAt: '2026-10-19T06:38:58.454Z',
};

const media: SessionMediaRecord[] = [
  { turn: 1, modality: 'image', file: 'a.png', url: '/api/experience/media/a.png', promptUsed: 'p', mime: 'image/png', at: '2026-10-19T06:38:58.454Z', selected: true },
];

const mediaJobs: SessionMediaJob[] = [
  { id: 'job-1', turn: 2, modality: 'video', status: 'failed', prompt: 'p2', startedAt: '2026-10-19T06:38:58.725Z', updatedAt: '2026-10-19T06:44:00.264Z', error: '模型网关不可达', artifactFiles: [], referenceRequested: true, referenceApplied: false, referenceSource: 'src' },
];

describe('toLoadedSession', () => {
  it('把顶层 media / mediaJobs 挂回 LoadedSession（恢复失败/进行中任务卡的数据源）', () => {
    const payload: SessionPayload = { session, media, mediaJobs };
    const loaded = toLoadedSession(payload);
    expect(loaded.media).toEqual(media);
    expect(loaded.mediaJobs).toEqual(mediaJobs);
    expect(loaded.id).toBe('s-1');
    expect(loaded.stateVersion).toBe(3);
  });

  it('顶层缺失 media / mediaJobs 时为 undefined（旧接口/空会话兼容）', () => {
    const loaded = toLoadedSession({ session });
    expect(loaded.media).toBeUndefined();
    expect(loaded.mediaJobs).toBeUndefined();
  });
});
