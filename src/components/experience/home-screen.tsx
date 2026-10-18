'use client';

/**
 * Screen 01｜首页——状态入口。
 * 大问题 + 四个状态卡 + 随便看看 + 自由输入 + 最近探索。
 * 禁止：自动播放、弹窗、倒计时、排行榜、登录墙、兴趣问卷、成堆推荐。
 */

import { useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Coffee, Hammer, SendHorizontal, Settings2, Shuffle, Sparkles, Telescope } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { MemoryPanel } from './memory-panel';
import {
  formatRelativeTime,
  STATE_ENTRIES,
  type CatalogSeed,
  type RecentSessionSummary,
  type WorkSummary,
} from './client-types';

const STATE_ICONS = {
  relax: Coffee,
  discover: Sparkles,
  deep: Telescope,
  create: Hammer,
} as const;

const STATE_NOTES = {
  relax: '给思绪一点空隙',
  discover: '顺着好奇往前走',
  deep: '把一个念头想透',
  create: '让想法变成作品',
} as const;

interface HomeScreenProps {
  seeds: CatalogSeed[];
  recent: RecentSessionSummary[];
  works: WorkSummary[];
  loading: boolean;
  onPickState: (category: 'relax' | 'discover' | 'deep' | 'create') => void;
  onWild: () => void;
  onSubmitFreeText: (text: string) => void;
  onOpenRecent: (id: string, work?: WorkSummary) => void;
}

const MODALITY_LABEL: Readonly<Record<WorkSummary['modality'], string>> = {
  image: '图像',
  voice: '语音',
  video: '视频',
};

export function HomeScreen({
  seeds,
  recent,
  works,
  loading,
  onPickState,
  onWild,
  onSubmitFreeText,
  onOpenRecent,
}: HomeScreenProps) {
  const [freeText, setFreeText] = useState('');
  const reduceMotion = useReducedMotion();

  const handleFreeSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = freeText.trim();
    if (!text) return;
    setFreeText('');
    onSubmitFreeText(text);
  };

  return (
    <main className="home-shell relative flex flex-1 flex-col items-center px-5 pb-16 sm:px-8">
      <header className="relative z-10 flex w-full max-w-6xl items-center justify-between border-b border-stone-300/70 py-5">
        <a href="#home" className="inline-flex items-center gap-2.5 text-stone-800" aria-label="个人体验引擎首页">
          <span className="home-mark" aria-hidden="true"><span /></span>
          <span className="text-sm font-semibold tracking-[0.08em]">体验引擎</span>
        </a>
        <div className="flex items-center gap-1">
          <MemoryPanel />
          <Link
            href="/config"
            aria-label="设置"
            title="设置"
            className="flex size-10 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-white hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            <Settings2 className="size-[18px]" />
          </Link>
        </div>
      </header>

      <div id="home" className="relative z-10 w-full max-w-6xl">
        <section className="home-hero relative grid min-h-[370px] items-center gap-8 py-14 sm:py-16 lg:min-h-[420px] lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:py-20">
          <div className="relative z-10 max-w-2xl">
            <p className="mb-5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-amber-800/80">
              <span className="h-px w-7 bg-amber-700/60" />
              给当下的自己，一点空间
            </p>
            <h1 className="home-title max-w-xl text-[clamp(2.8rem,7vw,5.7rem)] font-medium leading-[1.05] tracking-[-0.055em] text-stone-900">
              现在，想要<br className="hidden sm:block" />什么？
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-7 text-stone-500 sm:text-base">
              从一个念头开始。慢下来、走远一点，或把它做出来。
            </p>

            <form
              aria-label="直接告诉我"
              onSubmit={handleFreeSubmit}
              className="mt-8 w-full max-w-xl"
            >
              <div className="home-prompt flex items-center gap-2 rounded-2xl border border-stone-300/90 bg-white/90 p-2 pl-4 shadow-[0_8px_30px_rgba(48,43,31,0.06)] transition-all focus-within:border-amber-500/70 focus-within:ring-4 focus-within:ring-amber-500/10 sm:rounded-full sm:pl-6">
                <Input
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="此刻有什么在你脑海里？"
                  aria-label="直接告诉我你的想法"
                  maxLength={500}
                  className="h-12 flex-1 border-0 bg-transparent px-0 text-base text-stone-800 shadow-none placeholder:text-stone-400 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <Button
                  type="submit"
                  aria-label="开始探索"
                  disabled={!freeText.trim()}
                  className="h-12 shrink-0 gap-2 rounded-xl bg-stone-900 px-4 text-white transition-colors hover:bg-amber-800 disabled:opacity-35 sm:rounded-full sm:px-5"
                >
                  <span className="hidden sm:inline">开始探索</span>
                  <SendHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <p className="mt-2.5 pl-2 text-xs text-stone-400">不用想好怎么问，写下第一句话就行</p>
            </form>
          </div>

          <div className="home-orbit relative hidden min-h-[330px] items-center justify-center lg:flex" aria-hidden="true">
            <div className="home-orbit-ring home-orbit-ring--outer" />
            <div className="home-orbit-ring home-orbit-ring--inner" />
            <div className="home-orbit-axis home-orbit-axis--x" />
            <div className="home-orbit-axis home-orbit-axis--y" />
            <div className="home-orbit-core"><span>此刻</span><i /></div>
            <span className="home-orbit-point home-orbit-point--one"><Coffee /></span>
            <span className="home-orbit-point home-orbit-point--two"><Sparkles /></span>
            <span className="home-orbit-point home-orbit-point--three"><Telescope /></span>
            <span className="home-orbit-point home-orbit-point--four"><Hammer /></span>
            <span className="absolute bottom-4 right-5 text-[10px] font-medium tracking-[0.2em] text-stone-400">FOLLOW YOUR CURIOSITY</span>
          </div>
        </section>

        <section aria-label="选择当前状态" className="border-t border-stone-300/80 pt-7 sm:pt-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-stone-800">或者，选一种此刻的状态</h2>
              <p className="mt-1 text-xs text-stone-400">从这里出发，方向由你决定</p>
            </div>
            <button
              type="button"
              onClick={onWild}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-stone-500 transition-colors hover:bg-white hover:text-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
            >
              随便看看 <Shuffle className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
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
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
                  onClick={() => onPickState(entry.category)}
                  className="home-state-card group flex min-h-[86px] items-center gap-3.5 rounded-2xl border border-stone-300/75 bg-white/70 px-4 text-left text-stone-800 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/60 hover:bg-white hover:shadow-[0_8px_24px_rgba(48,43,31,0.07)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 sm:px-5"
                >
                  <span className="home-state-icon"><Icon className="size-[18px]" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{entry.label}</span>
                    <span className="mt-1 block text-xs text-stone-400">{STATE_NOTES[entry.category]}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-stone-300 transition-all group-hover:translate-x-0.5 group-hover:text-amber-700" aria-hidden="true" />
                </motion.button>
              );
            })}
          </div>
        </section>

      <div className="home-library-grid">
      {/* 最近探索——安静的复访入口 */}
      {loading && recent.length === 0 ? (
        <div className="mt-9 w-full space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      ) : recent.length > 0 ? (
        <section aria-label="最近探索" className="mt-9 w-full">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-800">最近探索</h2>
              <p className="mt-1 text-xs text-stone-400">回到上次停下的地方</p>
            </div>
            <span className="text-xs text-stone-400">{recent.length} 个片段</span>
          </div>
          <div className="exp-scrollbar max-h-80 overflow-y-auto rounded-2xl border border-stone-300/75 bg-white/75">
            <ul className="divide-y divide-stone-200/80">
              {recent.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRecent(item.id)}
                    className="group flex min-h-[68px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-amber-50/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-600 sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-stone-700">{item.topic}</span>
                      <span className="mt-1 block text-xs text-stone-400">{formatRelativeTime(item.updatedAt)}</span>
                    </span>
                    {item.status === 'COMPLETED' ? (
                      <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-xs text-stone-400">
                        已结束
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-stone-400">
                        {item.turn > 0 ? `${item.turn} 轮` : null}
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* 作品墙——生成即落盘的作品，安静回看 */}
      {loading && works.length === 0 ? (
        <div className="mt-9 w-full space-y-2">
          <Skeleton className="h-5 w-16" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
            ))}
          </div>
        </div>
      ) : works.length > 0 ? (
        <section aria-label="作品" className="mt-9 w-full">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-stone-800">作品</h2>
            <p className="mt-1 text-xs text-stone-400">探索留下的图像、声音与影像</p>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            {works.map((work) => (
              <li key={work.id}>
                <WorkCard work={work} onOpen={onOpenRecent} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </div>
      </div>
    </main>
  );
}

/** 作品墙卡片——图像缩略图；语音/视频内联播放；点击回看所属会话（会话缺失时兜底为作品查看）。 */
function WorkCard({
  work,
  onOpen,
}: {
  work: WorkSummary;
  onOpen: (sessionId: string, work?: WorkSummary) => void;
}) {
  const caption = (
    <span className="block px-3 py-2.5">
      <span className="block truncate text-sm text-stone-700">
        {work.topic ?? work.promptUsed}
      </span>
      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-400">
        <span className="rounded-full border border-stone-200 bg-stone-50 px-1.5 py-px">
          {MODALITY_LABEL[work.modality]}
        </span>
        <span>第 {work.turn} 轮</span>
        <span aria-hidden="true">·</span>
        <span>{formatRelativeTime(work.at)}</span>
      </span>
    </span>
  );

  if (work.modality === 'image') {
    return (
      <button
        type="button"
        onClick={() => onOpen(work.sessionId, work)}
        className="block w-full overflow-hidden rounded-2xl border border-stone-200/90 bg-white text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300/80 hover:shadow-[0_2px_8px_rgba(87,83,78,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
      >
        <img
          src={work.url}
          alt={work.promptUsed.slice(0, 80)}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover"
        />
        {caption}
      </button>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white">
      <div className="bg-stone-50/80 px-3 py-2.5">
        {work.modality === 'voice' ? (
          <audio controls preload="none" src={work.url} className="h-9 w-full">
            你的浏览器不支持音频播放。
          </audio>
        ) : (
          <video controls preload="metadata" src={work.url} className="aspect-video w-full">
            你的浏览器不支持视频播放。
          </video>
        )}
      </div>
      <button
        type="button"
        onClick={() => onOpen(work.sessionId, work)}
        aria-label={`回看会话：${work.topic ?? work.promptUsed}`}
        className="block w-full text-left transition-colors hover:bg-amber-50/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-500"
      >
        {caption}
      </button>
    </article>
  );
}
