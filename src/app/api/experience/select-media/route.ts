/**
 * POST /api/experience/select-media —— 持久化用户候选选择（G1.1 目标 4）。
 * Body: { sessionId: string; turn: number; file: string }
 * 同会话同轮内互斥：选中一张自动取消同轮其余的 selected 标记。
 * 后续图生图 / 续作 / 视频引用该产物而非隐式取末条。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMediaGateway } from '@/lib/experience/media-gateway';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    turn?: number;
    file?: string;
  };
  if (
    typeof body.sessionId !== 'string' ||
    typeof body.turn !== 'number' ||
    typeof body.file !== 'string'
  ) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', message: 'sessionId / turn / file 必填' },
      { status: 400 },
    );
  }
  const ok = await getMediaGateway().selectCandidate(body.sessionId, body.turn, body.file);
  if (!ok) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: '未找到该产物记录' },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
