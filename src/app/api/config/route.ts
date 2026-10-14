/**
 * GET /api/config — 配置列表（读操作永不返回 key 任何形态，仅 hasKey 标记）。
 * POST /api/config — 新增提供方配置（provider / model / endpoint / api_key / modality）。
 *
 * 统一配置源：直接操作主应用 config-store（data/config/provider-configs.json）。
 */

import {
  createProviderConfig,
  listProviderConfigs,
  ConfigStoreError,
} from '@/experience/config-store';

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
  const body = parsed as {
    provider?: unknown;
    model?: unknown;
    endpoint?: unknown;
    api_key?: unknown;
    modality?: unknown;
  };
  if (typeof body.provider !== 'string' || body.provider.length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'provider is required' }, { status: 400 });
  }
  if (typeof body.model !== 'string' || body.model.length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'model is required' }, { status: 400 });
  }
  if (typeof body.api_key !== 'string' || body.api_key.length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'api_key is required' }, { status: 400 });
  }
  if (body.endpoint !== undefined && typeof body.endpoint !== 'string') {
    return Response.json({ code: 'INVALID_REQUEST', message: 'endpoint must be a string when provided' }, { status: 400 });
  }
  if (
    body.modality !== undefined &&
    body.modality !== 'text' &&
    body.modality !== 'voice' &&
    body.modality !== 'image' &&
    body.modality !== 'video'
  ) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'modality must be text | voice | image | video' }, { status: 400 });
  }
  try {
    const config = await createProviderConfig({
      provider: body.provider,
      model: body.model,
      ...(typeof body.endpoint === 'string' ? { endpoint: body.endpoint } : {}),
      ...(body.modality !== undefined ? { modality: body.modality } : {}),
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
