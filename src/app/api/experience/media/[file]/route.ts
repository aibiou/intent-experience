/**
 * GET /api/experience/media/<file> —— 媒体产物提供（只读）。
 *
 * 产物由 media-gateway 落盘 data/media/；Content-Type 由扩展名映射
 * （png / jpg / webp / mp3 / wav / ogg / mp4 白名单——文件名先过
 * 严格字符校验，杜绝路径穿越）。
 * 产物不可变（id 含时间戳），可长缓存。
 */

import { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ file: string }> }
): Promise<Response> {
  const { file } = await ctx.params;
  if (typeof file !== 'string' || !/^[A-Za-z0-9._-]+$/.test(file) || file.includes('..')) {
    return Response.json({ error: 'INVALID_INPUT', message: '非法文件名' }, { status: 400 });
  }
  const ext = path.extname(file).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    return Response.json({ error: 'NOT_FOUND', message: '不支持的媒体类型' }, { status: 404 });
  }
  try {
    const data = await readFile(path.join(process.cwd(), 'data', 'media', file));
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return Response.json({ error: 'NOT_FOUND', message: '媒体不存在' }, { status: 404 });
  }
}
