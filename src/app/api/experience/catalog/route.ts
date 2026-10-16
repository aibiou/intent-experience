/**
 * GET /api/experience/catalog —— 体验目录 + 最近探索。
 * 薄封装：目录是静态资产；最近会话来自持久层（只读）。
 */

import { NextResponse } from 'next/server';
import { EXPERIENCE_CATALOG } from '@/lib/experience/catalog';
import { recentSessions } from '@/lib/experience/store';

/** 乱码判定：替换字符 U+FFFD 是无效 UTF-8 解码的产物
 * （历史脏数据——早期 PowerShell 中文写入的 topic；展示层不呈现）。 */
function isMojibake(text: string): boolean {
  return text.includes('\uFFFD');
}

export async function GET() {
  const recent = (await recentSessions(6)).filter((s) => !isMojibake(s.topic));
  return NextResponse.json({
    seeds: EXPERIENCE_CATALOG.map((seed) => ({
      id: seed.id,
      title: seed.title,
      summary: seed.summary,
      category: seed.category,
      tags: seed.tags,
      hook: seed.hook,
      context: seed.context ?? null,
      entries: seed.entries,
    })),
    recent,
  });
}
