/**
 * POST /api/experience/message —— 体验内一条用户输入。
 * Body: { sessionId: string; text: string; expectedStateVersion: number }
 * 响应：SSE（trace → content → state → done / error）
 *
 * 版本纪律（GS-05）：expectedStateVersion 不匹配 → VERSION_CONFLICT，
 * 状态零变更；并发提交经 store 条件守卫原子拒绝。
 */

import { NextRequest } from 'next/server';
import { getRuntime } from '@/lib/experience/runtime';
import { sseResponse } from '../sse';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    text?: string;
    expectedStateVersion?: number;
  };
  if (
    typeof body.sessionId !== 'string' ||
    typeof body.text !== 'string' ||
    typeof body.expectedStateVersion !== 'number'
  ) {
    return Response.json(
      { error: 'INVALID_INPUT', message: 'sessionId / text / expectedStateVersion 必填' },
      { status: 400 }
    );
  }
  const runtime = getRuntime();
  const stream = runtime.runTurn(
    body.sessionId,
    body.text,
    body.expectedStateVersion,
    req.signal
  );
  return sseResponse(stream);
}
