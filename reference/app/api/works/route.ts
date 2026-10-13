import {
  listWorks,
  saveWork,
  type SaveWorkInput,
} from '../../../src/experience/works-store';

/**
 * GET /api/works — 作品库列表（服务端持久化——作品资产
 * 不再依赖浏览器 localStorage）。
 *
 * 响应：{ works: [{ id, modality, prompt, mime, bytes, source,
 *   createdAt, assetUrl }] }（新作品在前）。
 *
 * POST /api/works — 保存作品（生成完成时上报）。
 * 请求体：{ modality, prompt, url? , dataUri?, mime? }——
 * url（提供方托管）服务端抓取落地；dataUri（内联产物）
 * 解码落地。落盘目录 data/works/（.gitignore 排除）。
 */

export async function GET(): Promise<Response> {
  const works = listWorks().map((record) => ({
    id: record.id,
    modality: record.modality,
    prompt: record.prompt,
    ...(record.caption !== undefined ? { caption: record.caption } : {}),
    mime: record.mime,
    bytes: record.bytes,
    source: record.source,
    createdAt: record.createdAt,
    assetUrl: `/api/works/${record.id}/asset`,
  }));
  return new Response(JSON.stringify({ works }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ code: 'INVALID_JSON_BODY', message: '请求格式有问题。' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const body = (parsed ?? {}) as SaveWorkInput;
  if (typeof body.modality !== 'string') {
    return new Response(
      JSON.stringify({ code: 'INVALID_REQUEST', message: '缺少作品模态。' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  try {
    const record = await saveWork(body);
    return new Response(
      JSON.stringify({
        work: { ...record, assetUrl: `/api/works/${record.id}/asset` },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        code: 'WORK_SAVE_FAILED',
        message: error instanceof Error ? error.message : '作品保存失败。',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// 方法约束：仅 GET（Query）/ POST（Command）。
export async function DELETE(): Promise<Response> {
  return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'POST'] }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
