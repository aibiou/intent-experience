/**
 * GET /api/experience/memory —— 记忆查看（只读；S2a F-5 呈现层）。
 *
 * 诚实边界：
 * - 只返回呈现所需的安全字段（topic / 生命周期 / 兴趣衰减 / 时间戳），
 *   不透出 intentSignal、deletionAudit 等内部字段；
 * - 撤回与更正不经此端点——它们是体验内输入（"别再推荐X相关的东西" /
 *   "记忆纠正：Y"），经分类器与 runtime 确定性路径执行（单一写入者纪律）。
 */

import { NextResponse } from 'next/server';
import { loadMemoryRecords } from '@/lib/experience/store';

export async function GET() {
  const records = await loadMemoryRecords();
  return NextResponse.json({
    records: records.map((record) => ({
      topic: record.topic,
      lifecycle: record.lifecycle,
      interestSignal: Math.round(record.interestSignal * 100) / 100,
      corrections: record.corrections,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      withdrawnAt: record.withdrawnAt,
      expiredAt: record.expiredAt,
    })),
  });
}
