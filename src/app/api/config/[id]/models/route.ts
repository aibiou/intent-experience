/**
 * GET /api/config/[id]/models —— 拉取上游可用模型列表。
 *
 * 从 config-store 按 id 读取配置（含解密 API key），
 * 直接请求上游 {endpoint}/models，返回模型 ID 列表。
 */

import { NextRequest } from 'next/server';
import { getProviderConfigById } from '@/experience/config-store';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const config = await getProviderConfigById(id);
  if (!config) {
    return Response.json({ code: 'CONFIG_NOT_FOUND', message: `provider config '${id}' not found` }, { status: 404 });
  }
  try {
    const base = config.endpoint.replace(/\/+$/, '');
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
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
      .filter((mid): mid is string => typeof mid === 'string' && mid.length > 0);
    return Response.json({ ok: true, models, count: models.length });
  } catch (error) {
    return Response.json(
      { code: 'UPSTREAM_UNREACHABLE', message: `无法连接到上游提供方：${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
