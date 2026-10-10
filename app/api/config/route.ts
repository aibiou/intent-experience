import {
  createProviderConfig,
  listProviderConfigs,
  ConfigStoreError,
} from '../../../src/experience/config-store';

/**
 * GET /api/config — 配置列表（S5B D-4——读操作永不返回
 * key 任何形态，仅 hasKey 标记）。
 * POST /api/config — 新增提供方配置（provider / model /
 * api_key——key 仅以密文持久化，AES-256-GCM 密钥分离）。
 */
export async function GET(): Promise<Response> {
  try {
    const configs = await listProviderConfigs();
    return Response.json({ configs });
  } catch (error) {
    return configError(error);
  }
}

export async function POST(req: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await req.text());
  } catch {
    return Response.json({ code: 'INVALID_REQUEST', message: 'body must be valid JSON' }, { status: 400 });
  }
  const body = parsed as { provider?: unknown; model?: unknown; api_key?: unknown };
  if (typeof body.provider !== 'string' || body.provider.length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'provider is required' }, { status: 400 });
  }
  if (typeof body.model !== 'string' || body.model.length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'model is required' }, { status: 400 });
  }
  if (typeof body.api_key !== 'string' || body.api_key.length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'api_key is required' }, { status: 400 });
  }
  try {
    const config = await createProviderConfig({
      provider: body.provider,
      model: body.model,
      apiKey: body.api_key,
    });
    return Response.json({ config }, { status: 201 });
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

// 方法约束：本路由仅允许 GET / POST。
export async function PUT(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'POST'] }, { status: 405 });
}
export async function DELETE(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'POST'] }, { status: 405 });
}
