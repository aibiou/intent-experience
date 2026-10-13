/**
 * POST /api/experience/start —— 首页/入口屏 → 建立会话并跑完第一轮。
 * Body: { seedId?: string; entry?: string; freeText?: string }
 * 响应：SSE（session → trace → content → state → done / error）
 */

import { NextRequest } from 'next/server';
import { getRuntime } from '@/lib/experience/runtime';
import { sseResponse } from '../sse';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    seedId?: string;
    entry?: string;
    freeText?: string;
  };
  const runtime = getRuntime();
  const stream = runtime.start(
    {
      seedId: typeof body.seedId === 'string' ? body.seedId : undefined,
      entry: typeof body.entry === 'string' ? body.entry : undefined,
      freeText: typeof body.freeText === 'string' ? body.freeText : undefined,
    },
    req.signal
  );
  return sseResponse(stream);
}
