import { getProviderConfigById } from '../../../../src/experience/config-store';

/**
 * POST /api/config/models —— 模型列表识别（OpenAI 兼容 GET /models）。
 * 两种形态：
 * - 显式（保存前表单）：{ endpoint, api_key }——仅发送用户填写的端点与 key。
 * - 已存（保存后自动识别）：{ config_id }——服务端解密该配置的持久化 key
 *   使用（key 任何形态不返回客户端——S5B D-4 读操作纪律）。
 * 响应仅含模型 id 列表；错误信息仅含状态码——不含 key、不含请求体。
 */
export async function POST(req: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await req.text());
  } catch {
    return Response.json({ code: 'INVALID_REQUEST', message: 'body must be valid JSON' }, { status: 400 });
  }
  const body = parsed as { endpoint?: unknown; api_key?: unknown; config_id?: unknown };
  // 形态 B：已保存配置（url + 密钥均已持久化——服务端解密使用）。
  if (typeof body.config_id === 'string' && body.config_id.length > 0) {
    const stored = await getProviderConfigById(body.config_id);
    if (!stored) {
      return Response.json(
        { code: 'CONFIG_NOT_FOUND', message: `provider config '${body.config_id}' not found` },
        { status: 404 },
      );
    }
    return probeModels(stored.endpoint, stored.apiKey);
  }
  // 形态 A：显式端点 + key（保存前表单识别）。
  if (typeof body.endpoint !== 'string' || body.endpoint.trim().length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'endpoint is required' }, { status: 400 });
  }
  if (typeof body.api_key !== 'string' || body.api_key.length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'api_key is required' }, { status: 400 });
  }
  return probeModels(body.endpoint.trim(), body.api_key);
}

async function probeModels(endpoint: string, apiKey: string): Promise<Response> {
  let modelsUrl: URL;
  try {
    modelsUrl = deriveModelsUrl(endpoint);
  } catch {
    return Response.json({ code: 'INVALID_REQUEST', message: 'endpoint must be a valid http(s) URL' }, { status: 400 });
  }
  try {
    const probeResponse = await fetch(modelsUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!probeResponse.ok) {
      return Response.json(
        { code: 'MODELS_PROBE_FAILED', message: `provider responded ${probeResponse.status} for models list` },
        { status: 502 },
      );
    }
    const data = (await probeResponse.json()) as { data?: unknown };
    const models = extractModelIds(data);
    if (models.length === 0) {
      return Response.json(
        {
          code: 'MODELS_PROBE_EMPTY',
          message: 'provider returned an empty model list (endpoint may not support GET /models——可手动填写模型名)',
        },
        { status: 502 },
      );
    }
    return Response.json({ models });
  } catch (error) {
    return Response.json(
      {
        code: 'MODELS_PROBE_UNREACHABLE',
        message: `models list request failed: ${error instanceof Error ? error.message : 'network error'}`,
      },
      { status: 502 },
    );
  }
}

/** 端点 → /models URL（chat/completions 后缀剥离；兼容直填 base 或已含 /models 形态）。 */
function deriveModelsUrl(endpoint: string): URL {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('protocol');
  }
  let path = parsed.pathname.replace(/\/+$/, '');
  if (path.endsWith('/chat/completions')) {
    path = path.slice(0, -'/chat/completions'.length);
  }
  if (!path.endsWith('/models')) {
    path = `${path}/models`;
  }
  parsed.pathname = path;
  return parsed;
}

function extractModelIds(data: { data?: unknown }): string[] {
  if (!Array.isArray(data.data)) {
    return [];
  }
  return data.data
    .map((entry) =>
      entry && typeof entry === 'object' && 'id' in entry && typeof (entry as { id?: unknown }).id === 'string'
        ? (entry as { id: string }).id
        : null,
    )
    .filter((id): id is string => id !== null);
}

// 方法约束：本路由仅允许 POST。
export async function GET(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] }, { status: 405 });
}
export async function PUT(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] }, { status: 405 });
}
export async function DELETE(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] }, { status: 405 });
}
