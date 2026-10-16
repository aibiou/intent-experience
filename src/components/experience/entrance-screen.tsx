'use client';

/**
 * Screen 03｜第一体验入口（种子进入路径）。
 * 一个值得进入的问题（hook）+ 一小段不解释完的 context
 * + 1–3 个入口角度 + 开始探索/换一个 + 小自由输入。
 * 没有分享/收藏/点赞/评论/关注——用户还没有理由做这些事。
 */

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, RefreshCw, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  onSubmitFreeText: (text: string) => void;
}

export function EntranceScreen({ seed, onStart, onChange, onSubmitFreeText }: EntranceScreenProps) {
  const [freeText, setFreeText] = useState('');

  const handleFreeSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = freeText.trim();
    if (!text) return;
    setFreeText('');
    onSubmitFreeText(text);
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 md:py-20">
      <motion.section
        aria-label="一个值得进入的问题"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-xl"
      >
        <p className="text-center text-xs tracking-[0.3em] text-amber-600/90">
          {ENTRANCE_LABEL[seed.category] ?? '一次探索'}
        </p>

        <h1 className="mt-6 text-center text-2xl font-medium leading-snug text-stone-800 md:text-4xl md:leading-snug">
          {seed.hook}
        </h1>

        {seed.context ? (
          <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-stone-500 md:text-[15px]">
            {seed.context}
          </p>
        ) : null}

        {/* 入口角度——低门槛参与；点任意角度即开始 */}
        <div className="mx-auto mt-10 flex max-w-md flex-col gap-2.5">
          {seed.entries.map((entry) => (
            <button
              key={entry.label}
              type="button"
              onClick={() => onStart(entry.prompt)}
              className="group flex min-h-12 items-center justify-between gap-3 rounded-xl border border-stone-200/90 bg-white px-5 py-3 text-left text-[15px] text-stone-600 transition-all duration-200 hover:border-amber-300/90 hover:bg-amber-50/50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
            >
              <span>{entry.label}</span>
              <ArrowRight
                className="size-4 shrink-0 text-stone-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-amber-500"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>

        <div className="mt-9 flex flex-col items-center gap-4">
          <Button
            type="button"
            onClick={() => onStart(null)}
            className="h-12 rounded-full bg-amber-600 px-8 text-base text-white shadow-sm transition-colors hover:bg-amber-700 focus-visible:ring-amber-300"
          >
            开始探索
            <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
          </Button>
          <button
            type="button"
            onClick={onChange}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm text-stone-500 transition-colors hover:text-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            换一个
          </button>
        </div>

        {/* 小自由输入备选 */}
        <form
          aria-label="或者直接告诉我"
          onSubmit={handleFreeSubmit}
          className="mx-auto mt-12 flex max-w-md items-center gap-1.5 rounded-full border border-stone-200/90 bg-white/70 py-1 pl-4 pr-1 transition-colors focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/15"
        >
          <Input
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="或者直接告诉我……"
            aria-label="或者直接告诉我你的想法"
            maxLength={500}
            className="h-10 flex-1 border-0 bg-transparent text-sm text-stone-700 shadow-none placeholder:text-stone-400 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="发送"
            disabled={!freeText.trim()}
            className="size-10 shrink-0 rounded-full bg-stone-800 text-stone-50 hover:bg-stone-700 disabled:opacity-40"
          >
            <SendHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </motion.section>
    </main>
  );
}
