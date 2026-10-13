'use client';

/**
 * Screen 04/05｜体验屏——分层内容 + 系统安静等待。
 * 头部：主题 + 阶段指示 + 轮次；内容区（max-h 滚动 + 自定义滚动条）；
 * 底部输入："直接问……" + 快捷动作（为什么/继续/我大概懂了/换一个/好了）。
 * 生成中输入保持可用（新输入会中止在途轮次）；停止是成功路径——
 * done{ended, user_stop} → 干净的结束层：只有"这次探索到这里"，零推荐。
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SendHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExperienceStage } from '@/lib/experience/types';
import type { ExperienceSessionState } from './use-experience-session';
import { ThinkingIndicator } from './thinking-indicator';
import { TurnItem } from './turn-item';

const STAGE_LABELS: Record<ExperienceStage, string> = {
  CURIOSITY: '好奇',
  UNDERSTANDING: '理解',
  SIMULATION: '模拟探索',
  CREATION: '创造',
  COMPLETION: '完成',
};

const QUICK_ACTIONS = ['为什么？', '继续', '我大概懂了', '换一个', '好了'] as const;

interface ExperienceScreenProps {
  session: ExperienceSessionState;
  onSend: (text: string) => void;
  onRetry: () => void;
  onBackHome: () => void;
}

export function ExperienceScreen({ session, onSend, onRetry, onBackHome }: ExperienceScreenProps) {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新内容到达 → 温和地滚到最新
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [session.turns, session.generating]);

  const inputLocked =
    !session.sessionId || session.ended || session.readOnly || session.exitReason !== null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputLocked) return;
    const value = text.trim();
    if (!value) return;
    setText('');
    onSend(value);
  };

  const showEndOverlay = session.ended && !session.readOnly && session.exitReason !== 'direction_changed';
  const showRetry =
    !session.readOnly &&
    !session.ended &&
    !session.generating &&
    session.turns.length === 0 &&
    Boolean(session.sessionId);

  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-4">
      {/* 头部：主题 + 阶段 + 轮次 */}
      <header className="flex items-start justify-between gap-3 border-b border-stone-200/70 pb-4 pt-6">
        <div className="min-w-0">
          <h1 className="line-clamp-2 text-base font-medium leading-snug text-stone-800 md:text-lg">
            {session.topic}
          </h1>
          <div className="mt-1.5 flex items-center gap-2.5">
            <Badge
              variant="outline"
              className="rounded-full border-amber-300/70 bg-amber-50/60 px-2.5 font-normal text-amber-700/90"
            >
              阶段 · {STAGE_LABELS[session.stage] ?? session.stage}
            </Badge>
            <span className="text-xs text-stone-400">
              {session.turn > 0 ? `已 ${session.turn} 轮` : '刚开始'}
            </span>
          </div>
        </div>
        {session.readOnly ? (
          <span className="mt-1 shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-xs text-stone-400">
            已结束
          </span>
        ) : null}
      </header>

      {/* 内容区——分层内容 + 安静等待 */}
      <div
        ref={scrollRef}
        className="exp-scrollbar my-5 max-h-[52dvh] space-y-7 overflow-y-auto pr-1 md:max-h-[58dvh]"
        aria-live="polite"
      >
        {session.turns.map((item) => (
          <TurnItem key={item.key} item={item} />
        ))}

        {session.generating && session.turns.every((t) => t.kind !== undefined) ? (
          <ThinkingIndicator />
        ) : null}

        {showRetry ? (
          <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-8 text-center">
            <p className="text-sm text-stone-500">这个体验刚才没生成好。</p>
            <Button
              type="button"
              variant="outline"
              onClick={onRetry}
              className="mt-4 h-11 rounded-full border-stone-300 px-6 text-stone-600 hover:border-amber-400 hover:bg-amber-50/50 hover:text-stone-800"
            >
              再试一次
            </Button>
          </div>
        ) : null}
      </div>

      {/* 底部输入区 */}
      {session.readOnly ? (
        <div className="mt-auto flex flex-col items-center gap-3 pb-8 pt-2">
          <p className="text-sm text-stone-400">这次探索已经结束</p>
          <Button
            type="button"
            variant="outline"
            onClick={onBackHome}
            className="h-11 rounded-full border-stone-300 px-6 text-stone-600 hover:border-amber-400 hover:bg-amber-50/50 hover:text-stone-800"
          >
            回到首页
          </Button>
        </div>
      ) : (
        <div className="mt-auto pb-8 pt-2">
          <div
            className="mb-3 flex flex-wrap gap-2"
            role="toolbar"
            aria-label="快捷回应"
          >
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                disabled={inputLocked}
                onClick={() => onSend(action)}
                className="min-h-11 rounded-full border border-stone-200 bg-white/80 px-4 text-sm text-stone-600 transition-colors hover:border-amber-300/90 hover:bg-amber-50/60 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-40"
              >
                {action}
              </button>
            ))}
          </div>
          <form
            aria-label="继续问"
            onSubmit={handleSubmit}
            className="flex items-center gap-1.5 rounded-full border border-stone-300/90 bg-white py-1.5 pl-5 pr-1.5 shadow-[0_1px_3px_rgba(87,83,78,0.05)] transition-colors focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20"
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={session.sessionId ? '直接问……' : '正在准备……'}
              aria-label="直接问"
              maxLength={500}
              disabled={inputLocked}
              className="h-11 flex-1 border-0 bg-transparent text-base text-stone-700 shadow-none placeholder:text-stone-400 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="发送"
              disabled={inputLocked || !text.trim()}
              className="size-11 shrink-0 rounded-full bg-stone-800 text-stone-50 hover:bg-stone-700 disabled:opacity-40"
            >
              <SendHorizontal className="size-4.5" aria-hidden="true" />
            </Button>
          </form>
        </div>
      )}

      {/* 干净的结束层——这次探索到这里；零推荐、零续行 */}
      <AnimatePresence>
        {showEndOverlay ? (
          <motion.div
            key="end-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-[#faf9f7]/95 backdrop-blur-sm"
            role="dialog"
            aria-label="探索结束"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
              className="flex flex-col items-center gap-5 px-6 text-center"
            >
              <p className="text-2xl font-medium text-stone-800 md:text-3xl">这次探索到这里</p>
              <p className="text-sm text-stone-400">你想继续的时候随时回来</p>
              <Button
                type="button"
                onClick={onBackHome}
                className="mt-2 h-12 rounded-full bg-amber-600 px-8 text-base text-white shadow-sm transition-colors hover:bg-amber-700 focus-visible:ring-amber-300"
              >
                回到首页
              </Button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
