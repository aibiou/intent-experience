import {
  disableProviderConfig,
  ConfigStoreError,
} from '../../../../../src/experience/config-store';

/**
 * POST /api/config/{id}/disable — 停用提供方配置
 * （停用后运行时即时回退合成模式——委托网关每次
 * 调用解析，无启用配置即委托合成网关）。
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  const params = await context.params;
  try {
    const config = await disableProviderConfig(params.id);
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
