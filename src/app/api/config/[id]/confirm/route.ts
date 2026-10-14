/**
 * POST /api/config/[id]/confirm — 隐私再确认（通用模板）。
 */

import { confirmProviderPrivacy, ConfigStoreError } from '@/experience/config-store';

export async function POST(
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
  const body = parsed as { statement?: unknown };
  if (typeof body.statement !== 'string' || body.statement.length === 0) {
    return Response.json({ code: 'INVALID_REQUEST', message: 'statement is required' }, { status: 400 });
  }
  try {
    const confirmation = await confirmProviderPrivacy(id, body.statement);
    return Response.json({ confirmation });
  } catch (error) {
    if (error instanceof ConfigStoreError) {
      const status = error.code === 'CONFIG_NOT_FOUND' ? 404 : 400;
      return Response.json({ code: error.code, message: error.message }, { status });
    }
    return Response.json({ code: 'INTERNAL', message: 'internal error' }, { status: 500 });
  }
}
