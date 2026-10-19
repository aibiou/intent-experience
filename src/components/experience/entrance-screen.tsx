'use client';

/**
 * Screen 03｜第一体验入口（种子进入路径）。
 * 一个值得进入的问题（hook）+ 一小段不解释完的 context
 * + 1–3 个入口角度 + 开始探索/换一个 + 小自由输入。
 * 没有分享/收藏/点赞/评论/关注——用户还没有理由做这些事。
 */

import { useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, RefreshCw, SendHorizontal } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { CatalogSeed } from './client-types';

/** 入口顶部标签按种子类别呈现（与首页四状态入口呼应，不再写死「一个问题」）。 */
const ENTRANCE_LABEL: Record<CatalogSeed['category'], string> = {
  discover: '一个发现',
  deep: '一个问题',
  create: '一个创作',
  relax: '一个放松',
  wild: '一次探索',
};

interface EntranceScreenProps {
  seed: CatalogSeed;
  onStart: (entry: string | null) => void;
  onChange: () => void;
  onBackHome: () => void;
  onSubmitFreeText: (text: string) => void;
}

export function EntranceScreen({ seed, onStart, onChange, onBackHome, onSubmitFreeText }: EntranceScreenProps) {
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
    <main className="experience-shell flex flex-1 flex-col px-5 py-6 sm:px-8 sm:py-9">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 lg:gap-5">
        <Button
          type="button"
          variant="quiet"
          onClick={onBackHome}
          className="min-h-10 h-auto w-fit gap-1.5 px-3 py-2 text-sm font-normal"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回首页
        </Button>

        <motion.section
          aria-label="一个值得进入的问题"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' }}
          className="experience-panel experience-panel--quiet grid w-full gap-8 px-5 py-7 backdrop-blur-sm sm:px-8 sm:py-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:gap-0 lg:px-12 lg:py-12"
        >
          <div className="flex flex-col justify-center lg:min-h-[420px] lg:pr-12">
            <p className="experience-kicker flex items-center gap-2">
              <span className="h-px w-6 bg-amber-700/50" />
              {ENTRANCE_LABEL[seed.category] ?? '一次探索'}
            </p>

            <h1 className="home-title mt-6 max-w-3xl text-4xl font-medium leading-[1.28] tracking-[-0.02em] text-stone-900 sm:text-5xl xl:text-6xl">
              {seed.hook}
            </h1>

            {seed.context ? (
              <p className="mt-6 max-w-2xl border-l-2 border-amber-700/20 pl-4 text-base leading-8 text-stone-500 sm:text-lg sm:leading-9">
                {seed.context}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col justify-center border-t border-stone-200/80 pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-stone-800">从一个角度开始</h2>
              <p className="mt-1 text-sm leading-6 text-stone-400">选一种轻松的切入方式，也可以直接开始。</p>
            </div>

            {/* 入口角度——低门槛参与；点任意角度即开始 */}
            <div className="flex flex-col gap-2.5">
              {seed.entries.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  onClick={() => onStart(entry.prompt)}
                  className={cn(
                    buttonVariants({ variant: 'paper' }),
                    'group flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-[#f9f8f4]/80 px-5 py-3.5 text-left text-[15px] text-stone-600 transition-all duration-200 hover:border-amber-400/70 hover:bg-amber-50/70 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600',
                  )}
                >
                  <span>{entry.label}</span>
                  <ArrowRight
                    className="size-4 shrink-0 text-stone-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-amber-700"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => onStart(null)}
                variant="ink"
                className="h-12 px-7 text-base"
              >
                开始探索
                <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                onClick={onChange}
                variant="quiet"
                className="min-h-11 h-auto gap-1.5 px-4 py-2 text-sm font-normal"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                换一个
              </Button>
            </div>
          </div>

          <form
            aria-label="或者直接告诉我"
            onSubmit={handleFreeSubmit}
            className="border-t border-stone-200/80 pt-6 lg:col-span-2 lg:mt-8"
          >
            <label htmlFor="entrance-free-text" className="mb-3 block text-sm font-medium text-stone-600">
              也可以直接说你想体验什么
            </label>
            <div className="experience-composer">
              <Input
                id="entrance-free-text"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="写下你此刻的想法……"
                aria-label="或者直接告诉我你的想法"
                maxLength={500}
                className="h-11 flex-1 border-0 bg-transparent text-base text-stone-700 shadow-none placeholder:text-stone-400 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="发送"
                disabled={!freeText.trim()}
                variant="ink"
                className="size-11 shrink-0 disabled:opacity-40"
              >
                <SendHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </form>
        </motion.section>
      </div>
    </main>
  );
}
