/**
 * POST /api/config/probe-models —— 用 baseUrl + apiKey 预览上游模型列表（无需先保存）。
 *
 * 直接请求上游 {baseUrl}/models，返回模型 ID 列表。
 * 密钥不经持久化、不进日志。
 */

import { NextRequest } from 'next/server';

export async function POST(req: NextRequest): Promise<Response> {
  let body: { baseUrl?: unknown; apiKey?: unknown };
  try {
    body = JSON.parse(await req.text()) as { baseUrl?: unknown; apiKey?: unknown };
  } catch {
    return Response.json({ code: 'INVALID_REQUEST', message: 'body must be valid JSON' }, { status: 400 });
  }
  if (typeof body.baseUrl !== 'string' || body.baseUrl.trim().length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'baseUrl is required' }, { status: 400 });
  }
  if (typeof body.apiKey !== 'string' || body.apiKey.trim().length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'apiKey is required' }, { status: 400 });
  }
  try {
    const base = body.baseUrl.trim().replace(/\/+$/, '');
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${body.apiKey.trim()}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return Response.json(
        { code: 'UPSTREAM_ERROR', message: `上游返回 HTTP ${res.status}${text ? '：' + text.slice(0, 200) : ''}` },
        { status: 502 },
      );
    }
    const payload = (await res.json()) as { data?: Array<{ id: string }>; models?: Array<{ id: string }> };
    const list = payload.data ?? payload.models ?? [];
    const models = list
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return Response.json({ ok: true, models, count: models.length });
  } catch (error) {
    return Response.json(
      { code: 'UPSTREAM_UNREACHABLE', message: `无法连接到上游提供方：${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
