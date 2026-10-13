'use client';

/**
 * Screen 01｜首页——状态入口。
 * 大问题 + 四个状态卡 + 随便看看 + 自由输入 + 最近探索。
 * 禁止：自动播放、弹窗、倒计时、排行榜、登录墙、兴趣问卷、成堆推荐。
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Coffee, Hammer, SendHorizontal, Shuffle, Sparkles, Telescope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { MemoryPanel } from './memory-panel';
import { SettingsPanel } from './settings-panel';
import {
  formatRelativeTime,
  STATE_ENTRIES,
  type CatalogSeed,
  type RecentSessionSummary,
} from './client-types';

const STATE_ICONS = {
  relax: Coffee,
  discover: Sparkles,
  deep: Telescope,
  create: Hammer,
} as const;

interface HomeScreenProps {
  seeds: CatalogSeed[];
  recent: RecentSessionSummary[];
  loading: boolean;
  onPickState: (category: 'relax' | 'discover' | 'deep' | 'create') => void;
  onWild: () => void;
  onSubmitFreeText: (text: string) => void;
  onOpenRecent: (id: string) => void;
}

export function HomeScreen({
  seeds,
  recent,
  loading,
  onPickState,
  onWild,
  onSubmitFreeText,
  onOpenRecent,
}: HomeScreenProps) {
  const [freeText, setFreeText] = useState('');

  const handleFreeSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = freeText.trim();
    if (!text) return;
    setFreeText('');
    onSubmitFreeText(text);
  };

  return (
    <main className="relative flex flex-1 flex-col items-center px-4 pb-10 pt-14 md:pt-24">
      {/* 安静的右上角入口：记忆查看 + 模型网关设置 */}
      <MemoryPanel />
      <SettingsPanel />

      <h1 className="text-center text-3xl font-medium tracking-wide text-stone-800 md:text-5xl">
        现在想要什么？
      </h1>

      {/* 状态入口——用户只需回答"我现在比较像哪一种" */}
      <section
        aria-label="选择当前状态"
        className="mt-10 grid w-full max-w-xl grid-cols-1 gap-3 sm:mt-14 sm:grid-cols-2"
      >
        {loading && seeds.length === 0
          ? STATE_ENTRIES.map((entry) => (
              <Skeleton key={entry.category} className="h-16 rounded-2xl md:h-[4.5rem]" />
            ))
          : STATE_ENTRIES.map((entry, index) => {
              const Icon = STATE_ICONS[entry.category];
              return (
                <motion.button
                  key={entry.category}
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
                  onClick={() => onPickState(entry.category)}
                  className="flex h-16 items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white text-lg text-stone-700 shadow-[0_1px_2px_rgba(87,83,78,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300/80 hover:bg-amber-50/50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 md:h-[4.5rem] md:text-xl"
                >
                  <Icon className="size-5 text-stone-400 transition-colors group-hover:text-amber-500" aria-hidden="true" />
                  {entry.label}
                </motion.button>
              );
            })}
      </section>

      <button
        type="button"
        onClick={onWild}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm text-stone-500 transition-colors hover:text-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
      >
        <Shuffle className="size-4" aria-hidden="true" />
        随便看看
      </button>

      {/* 自由输入——最重要的低摩擦入口 */}
      <form
        aria-label="直接告诉我"
        onSubmit={handleFreeSubmit}
        className="mt-10 w-full max-w-xl sm:mt-12"
      >
        <div className="flex items-center gap-1.5 rounded-full border border-stone-300/90 bg-white py-1.5 pl-5 pr-1.5 shadow-[0_1px_3px_rgba(87,83,78,0.05)] transition-colors focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20">
          <Input
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="直接告诉我……"
            aria-label="直接告诉我你的想法"
            maxLength={500}
            className="h-11 flex-1 border-0 bg-transparent text-base text-stone-700 shadow-none placeholder:text-stone-400 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="发送"
            disabled={!freeText.trim()}
            className="size-11 shrink-0 rounded-full bg-stone-800 text-stone-50 hover:bg-stone-700 disabled:opacity-40"
          >
            <SendHorizontal className="size-4.5" aria-hidden="true" />
          </Button>
        </div>
      </form>

      {/* 最近探索——安静的复访入口 */}
      {loading && recent.length === 0 ? (
        <div className="mt-12 w-full max-w-xl space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      ) : recent.length > 0 ? (
        <section aria-label="最近探索" className="mt-12 w-full max-w-xl">
          <h2 className="mb-3 text-sm text-stone-400">最近探索</h2>
          <div className="exp-scrollbar max-h-72 overflow-y-auto rounded-2xl border border-stone-200/90 bg-white">
            <ul className="divide-y divide-stone-200/70">
              {recent.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRecent(item.id)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-amber-50/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-500"
                  >
                    <span className="min-w-0 flex-1 truncate text-[15px] text-stone-700">
                      {item.topic}
                    </span>
                    {item.status === 'COMPLETED' ? (
                      <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-xs text-stone-400">
                        已结束
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-stone-400">
                        {item.turn > 0 ? `${item.turn} 轮` : null}
                        <span aria-hidden="true">→</span>
                      </span>
                    )}
                    <span className="sr-only">
                      {formatRelativeTime(item.updatedAt)}
                      {item.status === 'COMPLETED' ? '，已结束' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
