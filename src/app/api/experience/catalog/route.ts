/**
 * GET /api/experience/catalog —— 体验目录 + 最近探索。
 * 薄封装：目录是静态资产；最近会话来自持久层（只读）。
 */

import { NextResponse } from 'next/server';
import { EXPERIENCE_CATALOG } from '@/lib/experience/catalog';
import { recentSessions } from '@/lib/experience/store';

export async function GET() {
  const recent = await recentSessions(6);
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
