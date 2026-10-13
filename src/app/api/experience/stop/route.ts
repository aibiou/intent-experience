/**
 * POST /api/experience/stop —— 显式停止（与"好了"同一条确定性路径：
 * 不调用模型、立即终止、零续行——GS-04）。
 * Body: { sessionId: string; expectedStateVersion: number }
 */

import { NextRequest } from 'next/server';
import { getRuntime } from '@/lib/experience/runtime';
import { sseResponse } from '../sse';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    expectedStateVersion?: number;
  };
  if (typeof body.sessionId !== 'string' || typeof body.expectedStateVersion !== 'number') {
    return Response.json(
      { error: 'INVALID_INPUT', message: 'sessionId / expectedStateVersion 必填' },
      { status: 400 }
    );
  }
  const runtime = getRuntime();
  const stream = runtime.stop(body.sessionId, body.expectedStateVersion);
  return sseResponse(stream);
}
