import { deleteWork } from '../../../../src/experience/works-store';

/**
 * DELETE /api/works/{id} — 删除作品（索引记录 + 资产文件）。
 *
 * 响应：{ deleted: true } / 404（记录不存在）。
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  const params = await context.params;
  const deleted = await deleteWork(params.id);
  if (!deleted) {
    return new Response(JSON.stringify({ code: 'WORK_NOT_FOUND', message: '作品不存在。' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ deleted: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 方法约束：本路由仅允许 DELETE（Command）。
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', allowed: ['DELETE'] }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
