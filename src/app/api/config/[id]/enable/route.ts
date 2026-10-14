/**
 * POST /api/config/[id]/enable — 启用提供方配置
 * （启用即默认：记录提升至同模态首位；同模态
 * 其余已启用记录保留为容灾候选链——G2-6）。
 */

import { enableProviderConfig, ConfigStoreError } from '@/experience/config-store';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const config = await enableProviderConfig(id);
    return Response.json({ config });
  } catch (error) {
    if (error instanceof ConfigStoreError) {
      const status = error.code === 'CONFIG_NOT_FOUND' ? 404 : 400;
      return Response.json({ code: error.code, message: error.message }, { status });
    }
    return Response.json({ code: 'INTERNAL', message: 'internal error' }, { status: 500 });
  }
}
