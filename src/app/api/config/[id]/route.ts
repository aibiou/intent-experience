/**
 * GET /api/config/[id] — 查询单条配置。
 * PUT /api/config/[id] — 更新配置。
 * DELETE /api/config/[id] — 删除配置。
 */

import {
  deleteProviderConfig,
  updateProviderConfig,
  ConfigStoreError,
} from '@/experience/config-store';

export async function GET(
  _req: Request,
  _ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return Response.json({ code: 'NOT_IMPLEMENTED', message: 'use /api/config for list' }, { status: 501 });
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await req.text());
  } catch {
    return Response.json({ code: 'INVALID_REQUEST', message: 'body must be valid JSON' }, { status: 400 });
  }
  const body = parsed as {
    provider?: unknown;
    model?: unknown;
    endpoint?: unknown;
    api_key?: unknown;
    modality?: unknown;
  };
  try {
    const config = await updateProviderConfig(id, {
      ...(typeof body.provider === 'string' ? { provider: body.provider } : {}),
      ...(typeof body.model === 'string' ? { model: body.model } : {}),
      ...(typeof body.endpoint === 'string' ? { endpoint: body.endpoint } : {}),
      ...(typeof body.api_key === 'string' && body.api_key.length > 0 ? { apiKey: body.api_key } : {}),
      ...(body.modality !== undefined ? { modality: body.modality as 'text' | 'voice' | 'image' | 'video' } : {}),
    });
    return Response.json({ config });
  } catch (error) {
    if (error instanceof ConfigStoreError) {
      const status = error.code === 'CONFIG_NOT_FOUND' ? 404 : 400;
      return Response.json({ code: error.code, message: error.message }, { status });
    }
    return Response.json({ code: 'INTERNAL', message: 'internal error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  try {
    await deleteProviderConfig(id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ConfigStoreError) {
      const status = error.code === 'CONFIG_NOT_FOUND' ? 404 : 400;
      return Response.json({ code: error.code, message: error.message }, { status });
    }
    return Response.json({ code: 'INTERNAL', message: 'internal error' }, { status: 500 });
  }
}
