/**
 * GET /api/experience/works —— 作品墙（媒体产物 + 会话主题 join，只读）。
 *
 * 产物来自 data/media/index.json（生成即落盘，无需显式保存）；
 * 主题来自持久层。新作品在前，上限 48 条（首页展示有界）。
 */

import { NextResponse } from 'next/server';
import { getMediaGateway } from '@/lib/experience/media-gateway';
import { sessionTopicsByIds } from '@/lib/experience/store';

const WORKS_LIMIT = 48;

export async function GET() {
  const allRecords = (await getMediaGateway().readIndex())
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, WORKS_LIMIT);

  // 同一轮多候选只占作品墙一个位置，避免一次 4 图把回看流刷满；
  // 全部候选仍保留在所属会话里供用户选择。
  const seenTurns = new Set<string>();
  const records = allRecords.filter((record) => {
    const key = `${record.sessionId}:${record.turn}`;
    if (seenTurns.has(key)) return false;
    seenTurns.add(key);
    return true;
  });

  const topics = await sessionTopicsByIds([
    ...new Set(records.map((r) => r.sessionId)),
  ]);

  return NextResponse.json({
    works: records.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      topic: topics.get(r.sessionId) ?? null,
      turn: r.turn,
      modality: r.modality,
      url: `/api/experience/media/${r.file}`,
      mime: r.mime,
      promptUsed: r.promptUsed,
      at: r.at,
    })),
  });
}
