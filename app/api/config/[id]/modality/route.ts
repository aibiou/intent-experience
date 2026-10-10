import {
  cloneConfigForModality,
  ConfigStoreError,
  type ProviderModality,
} from '../../../../../src/experience/config-store';

/**
 * POST /api/config/{id}/modality —— 按模态克隆
 * （产品负责人指令 2026-10-10：获取模型后按
 * 模态分类选用——复制源配置的端点与 key 密文，
 * 仅模态与模型不同；key 任何形态不经过本路由
 * 明文——克隆在存储层原样复制密文引用）。
 *
 * 请求：{ modality: 'text'|'voice'|'image'|'video', model }
 * 响应：{ config }（新记录摘要——无 key）。
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  const params = await context.params;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await req.text());
  } catch {
    return Response.json(
      { code: 'INVALID_REQUEST', message: 'body must be valid JSON' },
      { status: 400 },
    );
  }
  const body = parsed as { modality?: unknown; model?: unknown };
  if (
    body.modality !== 'text' &&
    body.modality !== 'voice' &&
    body.modality !== 'image' &&
    body.modality !== 'video'
  ) {
    return Response.json(
      { code: 'INVALID_MODALITY', message: 'modality must be text, voice, image or video' },
      { status: 400 },
    );
  }
  if (typeof body.model !== 'string' || body.model.trim().length === 0) {
    return Response.json(
      { code: 'MODEL_REQUIRED', message: 'model name is required' },
      { status: 400 },
    );
  }
  try {
    const config = await cloneConfigForModality(params.id, {
      modality: body.modality as ProviderModality,
      model: body.model,
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

// 方法约束：本路由仅允许 POST。
export async function GET(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] }, { status: 405 });
}
