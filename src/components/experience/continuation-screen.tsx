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
    <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-4">
      <header className="border-b border-stone-200/70 pb-4 pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="mb-3 inline-flex items-center gap-1 text-xs text-stone-400 transition-colors hover:text-stone-600"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          返回
        </button>
        <h1 className="line-clamp-2 text-base font-medium leading-snug text-stone-800 md:text-lg">
          《{topic}》续作
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">
          以上一步作品为基础继续创作——想改哪里，直接说……
        </p>
      </header>

      <div className="mt-auto pb-8 pt-2">
        <form
          aria-label="续作输入"
          onSubmit={handleSubmit}
          className="flex items-center gap-1.5 rounded-full border border-stone-300/90 bg-white py-1.5 pl-5 pr-1.5 shadow-[0_1px_3px_rgba(87,83,78,0.05)] transition-colors focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20"
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
            className="size-11 shrink-0 rounded-full bg-stone-800 text-stone-50 hover:bg-stone-700 disabled:opacity-40"
          >
            <SendHorizontal className="size-4.5" aria-hidden="true" />
          </Button>
        </form>
      </div>
    </main>
  );
}
