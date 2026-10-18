'use client';

/**
 * 续作输入屏（Screen 04b）——完成后续作的入口态。
 * 「以此续作」后进入：原主题为题，首轮输入即续作表达
 * （如「再换一张，猫在打盹」），经 /start{continueSessionId}
 * 建立新会话——首轮图生图以原会话最新图像产物为参考图。
 */

import { useState, type FormEvent } from 'react';
import { ArrowLeft, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ContinuationScreenProps {
  topic: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function ContinuationScreen({
  topic,
  onSubmit,
  onCancel,
}: ContinuationScreenProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    onSubmit(value);
  };

  return (
    <main className="experience-shell relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 sm:px-8">
      <header className="border-b border-stone-300/70 pb-6 pt-6 sm:pt-8">
        <button
          type="button"
          onClick={onCancel}
          className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-full pr-3 text-xs font-medium text-stone-500 transition-colors hover:text-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          返回
        </button>
        <p className="mb-2 text-[11px] font-semibold text-amber-800/75">继续创作</p>
        <h1 className="home-title line-clamp-2 text-2xl font-medium leading-snug text-stone-900 md:text-3xl">
          《{topic}》
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">
          以上一步作品为基础继续创作——想改哪里，直接说……
        </p>
      </header>

      <div className="mt-auto pb-8 pt-8">
        <form
          aria-label="续作输入"
          onSubmit={handleSubmit}
          className="flex items-center gap-1.5 rounded-2xl border border-stone-300/90 bg-white py-1.5 pl-5 pr-1.5 shadow-[0_8px_30px_rgba(48,43,31,0.06)] transition-colors focus-within:border-amber-500/70 focus-within:ring-4 focus-within:ring-amber-500/10 sm:rounded-full"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="想怎么继续，直接说……"
            aria-label="续作输入"
            maxLength={500}
            autoFocus
            className="h-11 flex-1 border-0 bg-transparent text-base text-stone-700 shadow-none placeholder:text-stone-400 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="发送"
            disabled={!text.trim()}
            className="size-11 shrink-0 rounded-xl bg-stone-900 text-stone-50 hover:bg-amber-800 disabled:opacity-40 sm:rounded-full"
          >
            <SendHorizontal className="size-4.5" aria-hidden="true" />
          </Button>
        </form>
      </div>
    </main>
  );
}
