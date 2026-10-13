/**
 * GET /api/experience/session?id=xxx —— 会话恢复（只读）。
 * 首页"最近探索"点入时重建体验屏（历史轮次从 ExperienceState 恢复）。
 *
 * S2b：响应附带该会话的媒体产物清单（data/media/index.json 按
 * sessionId 过滤）——前端按 turn 号挂回轮次卡片；媒体是体验产物，
 * 不进 ExperienceState（无版本语义）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadSession } from '@/lib/experience/store';
import { getMediaGateway } from '@/lib/experience/media-gateway';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'INVALID_INPUT', message: '缺少 id' }, { status: 400 });
  }
  const session = await loadSession(id);
  if (!session) {
    return NextResponse.json({ error: 'SESSION_NOT_FOUND', message: '会话不存在' }, { status: 404 });
  }
  const media = (await getMediaGateway().readIndex())
    .filter((record) => record.sessionId === id)
    .map((record) => ({
      turn: record.turn,
      modality: record.modality,
      url: `/api/experience/media/${record.file}`,
      promptUsed: record.promptUsed,
      mime: record.mime,
      at: record.at,
    }));
  return NextResponse.json({
    session: {
      id: session.id,
      seedId: session.seedId,
      topic: session.topic,
      status: session.status,
      exitReason: session.exitReason,
      stateVersion: session.stateVersion,
      state: session.state,
      updatedAt: session.updatedAt.toISOString(),
    },
    media,
  });
}
