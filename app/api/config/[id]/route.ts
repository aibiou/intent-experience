import {
  deleteProviderConfig,
  listProviderConfigs,
  updateProviderConfig,
  ConfigStoreError,
} from '../../../../src/experience/config-store';

/**
 * GET /api/config/{id} — 单条配置（读操作不返回 key）。
 * PUT /api/config/{id} — 更新（model / endpoint / api_key——
 * key 更新仅以密文持久化）。
 * DELETE /api/config/{id} — 删除（启用中配置删除后
 * 运行时即时回退合成模式——委托网关每次调用解析）。
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  const params = await context.params;
  try {
    const configs = await listProviderConfigs();
    const config = configs.find((candidate) => candidate.id === params.id);
    if (!config) {
      return Response.json(
        { code: 'CONFIG_NOT_FOUND', message: `provider config '${params.id}' not found` },
        { status: 404 },
      );
    }
    return Response.json({ config });
  } catch (error) {
    return configError(error);
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  const params = await context.params;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await req.text());
  } catch {
    return Response.json({ code: 'INVALID_REQUEST', message: 'body must be valid JSON' }, { status: 400 });
  }
  const body = parsed as { model?: unknown; endpoint?: unknown; api_key?: unknown };
  if (body.model === undefined && body.endpoint === undefined && body.api_key === undefined) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'model, endpoint or api_key is required' }, { status: 400 });
  }
  if (body.endpoint !== undefined && typeof body.endpoint !== 'string') {
    return Response.json({ code: 'INVALID_REQUEST', message: 'endpoint must be a string when provided' }, { status: 400 });
  }
  try {
    const config = await updateProviderConfig(params.id, {
      ...(typeof body.model === 'string' ? { model: body.model } : {}),
      ...(typeof body.endpoint === 'string' ? { endpoint: body.endpoint } : {}),
      ...(typeof body.api_key === 'string' ? { apiKey: body.api_key } : {}),
    });
    return Response.json({ config });
  } catch (error) {
    return configError(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  const params = await context.params;
  try {
    await deleteProviderConfig(params.id);
    return Response.json({ deleted: true });
  } catch (error) {
    return configError(error);
  }
}

function configError(error: unknown): Response {
  if (error instanceof ConfigStoreError) {
    const status =
      error.code === 'CONFIG_NOT_FOUND'
        ? 404
        : error.code === 'CONFIG_STORE_CORRUPT' || error.code === 'CONFIG_CONFIRMATION_STORE_CORRUPT'
          ? 500
          : 400;
    return Response.json({ code: error.code, message: error.message }, { status });
  }
  return Response.json({ code: 'INTERNAL', message: 'internal error' }, { status: 500 });
}

// 方法约束：本路由仅允许 GET / PUT / DELETE。
export async function POST(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'PUT', 'DELETE'] }, { status: 405 });
}
