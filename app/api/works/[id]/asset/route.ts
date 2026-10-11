import { readFile } from 'node:fs/promises';
import { getWork, workAssetPath } from '../../../../../src/experience/works-store';

/**
 * GET /api/works/{id}/asset — 作品资产字节流。
 *
 * 已落地（服务端文件）→ 200 字节响应（immutable 缓存——
 * id 寻址，内容不变）；未落地（提供方抓取失败降级形态）
 * → 302 回源 remoteUrl。
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  const params = await context.params;
  const record = getWork(params.id);
  if (record === null) {
    return new Response(JSON.stringify({ code: 'WORK_NOT_FOUND', message: '作品不存在。' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const assetPath = workAssetPath(record);
  if (assetPath === null) {
    if (record.remoteUrl !== undefined) {
      return new Response(null, { status: 302, headers: { Location: record.remoteUrl } });
    }
    return new Response(JSON.stringify({ code: 'WORK_ASSET_MISSING', message: '作品资产缺失。' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const buffer = await readFile(assetPath);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': record.mime,
        'Content-Length': String(buffer.byteLength),
        // id 寻址资产内容不变——客户端长缓存安全。
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response(JSON.stringify({ code: 'WORK_ASSET_UNREADABLE', message: '作品资产读取失败。' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 方法约束：本路由仅允许 GET（Query）。
export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', allowed: ['GET'] }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
