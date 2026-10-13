'use client';

/**
 * 记忆查看面板（Screen 01 右上角安静入口；S2a F-5 呈现层）。
 *
 * - 只读呈现：我记住了什么、各自的衰减状态（数据经 /api/experience/memory）；
 * - 撤回 / 更正不在面板里做——它们是体验内输入（"别再推荐X相关的东西" /
 *   "记忆纠正：Y"），保持单一确定性路径；面板只给入口提示语；
 * - 兴趣信号以 0–1 的安静刻度呈现（衰减是诚实机制，不是评分）。
 */

import { useCallback, useEffect, useState } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

interface MemoryRecordView {
  topic: string;
  lifecycle: 'REMEMBERED' | 'IN_USE' | 'DECAYING' | 'EXPIRED';
  interestSignal: number;
  corrections: number;
  createdAt: string;
  updatedAt: string;
  withdrawnAt: string | null;
  expiredAt: string | null;
}

const LIFECYCLE_LABELS: Record<MemoryRecordView['lifecycle'], { label: string; className: string }> = {
  REMEMBERED: { label: '记住', className: 'border-stone-200 bg-stone-50 text-stone-500' },
  IN_USE: { label: '使用中', className: 'border-amber-300/70 bg-amber-50/70 text-amber-700' },
  DECAYING: { label: '淡化中', className: 'border-stone-200 bg-stone-50 text-stone-400' },
  EXPIRED: { label: '已失效', className: 'border-stone-200 bg-stone-50 text-stone-400' },
};

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const min = Math.floor(Math.max(0, Date.now() - t) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '昨天';
  if (day < 30) return `${day} 天前`;
  return new Date(t).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

export function MemoryPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<MemoryRecordView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/experience/memory', { cache: 'no-store' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { records: MemoryRecordView[] };
      setRecords(data.records);
    } catch {
      setError('记忆暂时读不出来，稍后再试。');
      setRecords(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const active = (records ?? []).filter((r) => r.lifecycle !== 'EXPIRED');
  const expired = (records ?? []).filter((r) => r.lifecycle === 'EXPIRED');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="我记住的"
          title="我记住的"
          className="absolute right-14 top-4 rounded-full text-stone-400 hover:text-stone-600"
        >
          <Brain className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>我记住的</DialogTitle>
          <DialogDescription>
            记忆只用来让以后的探索更贴近你。它只记录你真正花时间探索的主题，会随时间自然淡化。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2" aria-label="加载中">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-stone-400">{error}</p>
        ) : records === null ? null : active.length === 0 && expired.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-stone-500">还没有记住什么。</p>
            <p className="mt-1.5 text-xs text-stone-400">
              去探索点什么，你真正花时间的东西会留在这里。
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {active.length > 0 ? (
              <ul className="space-y-2" aria-label="生效中的记忆">
                {active.map((record) => {
                  const meta = LIFECYCLE_LABELS[record.lifecycle];
                  return (
                    <li
                      key={record.topic}
                      className="flex items-center gap-3 rounded-xl border border-stone-200/80 bg-white px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-stone-700">{record.topic}</p>
                        <p className="mt-0.5 text-xs text-stone-400">
                          {formatRelative(record.updatedAt)}
                          {record.corrections > 0 ? ` · 更正过 ${record.corrections} 次` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Badge variant="outline" className={`rounded-full border px-2 font-normal text-xs ${meta.className}`}>
                          {meta.label}
                        </Badge>
                        <span className="text-[10px] text-stone-300" aria-hidden="true">
                          {'◆'.repeat(Math.max(1, Math.round(record.interestSignal * 4)))}
                        </span>
                        <span className="sr-only">兴趣信号 {Math.round(record.interestSignal * 100)}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {expired.length > 0 ? (
              <div>
                <p className="mb-2 text-xs text-stone-400">已失效（不再影响任何体验）</p>
                <ul className="space-y-1.5" aria-label="已失效的记忆">
                  {expired.map((record) => (
                    <li
                      key={record.topic}
                      className="flex items-center gap-2 rounded-xl border border-dashed border-stone-200 px-4 py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-stone-400 line-through">
                        {record.topic}
                      </span>
                      <span className="shrink-0 text-xs text-stone-300">
                        {record.withdrawnAt ? '你撤回的' : '自然过期'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-xs leading-relaxed text-stone-400">
              想让我忘掉某条？在任何体验里说「别再推荐××相关的东西」即可撤回；
              记错了就说「记忆纠正：××」。
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="text-stone-500"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            刷新
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
