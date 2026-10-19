'use client';

/**
 * 会话恢复载荷拼装——GET /api/experience/session 的响应形状适配。
 *
 * 接口把 media / mediaJobs 放在 session 同级；恢复会话的三处调用点
 * （最近探索 / VERSION_CONFLICT 同步 / 恢复任务轮询）统一经此函数挂回
 * LoadedSession，避免各自从 data.session 上读到 undefined
 * （2026-10-19 真实 E2E：失败任务卡与后台轮询因此静默失效）。
 */

import type { LoadedSession } from './use-experience-session';

export interface SessionPayload {
  session: LoadedSession;
  media?: LoadedSession['media'];
  mediaJobs?: LoadedSession['mediaJobs'];
}

export function toLoadedSession(payload: SessionPayload): LoadedSession {
  return { ...payload.session, media: payload.media, mediaJobs: payload.mediaJobs };
}
