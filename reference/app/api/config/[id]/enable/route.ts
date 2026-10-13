import {
  enableProviderConfig,
  ConfigStoreError,
} from '../../../../../src/experience/config-store';

/**
 * POST /api/config/{id}/enable — 启用提供方配置
 * （S5B D-3——单条启用；同时至多一条启用）。前置
 * 条件：提供方已登记（S5A-SEMANTIC-FREEZE-01
 * §1 D-2）且已经 D-5 隐私再确认——未确认配置
 * 不得启用。启用经委托网关即时生效（无需重启）。
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  const params = await context.params;
  try {
    const config = await enableProviderConfig(params.id);
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
