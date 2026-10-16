'use client';

/**
 * Screen 04/05｜体验屏——分层内容 + 系统安静等待。
 * 头部：主题 + 阶段指示 + 轮次；分支面板（S2a）；内容区（max-h 滚动 + 自定义滚动条）；
 * 底部输入："直接问……" + 快捷动作（为什么/继续/我大概懂了/换一个/好了）。
 * 生成中输入保持可用（新输入会中止在途轮次）；停止是成功路径——
 * done{ended, user_stop} → 干净的结束层：只有"这次探索到这里"，零推荐。
 * creation_completed（D-05）→ 结束层文案区分："作品完成"——零推荐收束，
 * 但提供用户主动发起的「以此续作」（G2-7：以最新图像产物为参考图
 * 建立新会话——新一轮创造，不是推荐钩子）。
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SendHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExperienceStage } from '@/lib/experience/types';
import type { ExperienceSessionState } from './use-experience-session';
import { BranchPanel } from './branch-panel';
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

/**
 * S2b：媒体快捷动作（发现性入口——能力直达，无需知道说法）。
 * 发送的是可被词表识别的完整表达（与参考「画成图片」chip 同一纪律：
 * 面板动作 = 普通输入，分类器→词表路由，UI 无特权直写）。
 * 仅在有已呈现内容后出现（朗读/呈现的材料是上一轮内容）。
 */
const MEDIA_ACTIONS: ReadonlyArray<{ label: string; sends: string }> = [
  { label: '读给我听', sends: '读给我听' },
  { label: '画成图片', sends: '用图片展现刚才的内容' },
];

/** 阶段化输入提示（创作阶段：局部修改的入口语——08 §13）。 */
const STAGE_PLACEHOLDERS: Partial<Record<ExperienceStage, string>> = {
  SIMULATION: '提一个"如果……"，看看会怎样……',
  CREATION: '想改哪里，直接说……',
};

interface ExperienceScreenProps {
  session: ExperienceSessionState;
  onSend: (text: string) => void;
  onRetry: () => void;
  onBackHome: () => void;
  /** 作品完成 → 以此续作（以最新图像产物为参考图建立新会话）。 */
  onContinueCreation?: () => void;
}

export function ExperienceScreen({
  session,
  onSend,
  onRetry,
  onBackHome,
  onContinueCreation,
}: ExperienceScreenProps) {
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
  const isCreationCompleted = session.exitReason === 'creation_completed';
  const showRetry =
    !session.readOnly &&
    !session.ended &&
    !session.generating &&
    // 没有任何已生成内容（含空轮/仅用户输入的首轮失败）才可重试——
    // 已呈现过内容、但后续轮失败的不弹重试（用户可自由继续输入）。
    session.turns.every((t) => t.kind === undefined) &&
    Boolean(session.sessionId);
  // 媒体入口仅在有已呈现内容后出现（朗读/呈现的材料是上一轮内容）。
  const hasSettledContent = session.turns.some((t) => t.kind !== undefined);

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

      {/* S2a：模拟分支面板（有分支记录才出现；安静折叠） */}
      {session.branches.length > 0 ? (
        <div className="mt-4">
          <BranchPanel
            branches={session.branches}
            currentBranchId={session.currentBranchId}
            disabled={inputLocked}
            onSend={onSend}
          />
        </div>
      ) : null}

      {/* 内容区——分层内容 + 安静等待 */}
      <div
        ref={scrollRef}
        className="exp-scrollbar my-5 max-h-[52dvh] space-y-7 overflow-y-auto pr-1 md:max-h-[58dvh]"
        aria-live="polite"
      >
        {session.turns.map((item) => (
          <TurnItem key={item.key} item={item} totalBranches={session.branches.length} />
        ))}

        {/* 生成进行中且存在尚未收到内容的轮次 → 明确"正在生成"反馈
            （2026-10-16 模拟用户实测：原条件 every(kind!==undefined) 语义
            反了——生成中恰好是 kind 未定的轮，导致无任何进行中指示、
            静默死屏）。 */}
        {session.generating && session.turns.some((t) => t.kind === undefined) ? (
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
          <p className="text-sm text-stone-400">
            {session.exitReason === 'creation_completed'
              ? '作品已完成'
              : '这次探索已经结束'}
          </p>
          <div className="flex items-center gap-2.5">
            {session.exitReason === 'creation_completed' && onContinueCreation ? (
              <Button
                type="button"
                variant="outline"
                onClick={onContinueCreation}
                className="h-11 rounded-full border-stone-300 px-6 text-stone-600 hover:border-amber-400 hover:bg-amber-50/50 hover:text-stone-800"
              >
                以此续作
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={onBackHome}
              className="h-11 rounded-full border-stone-300 px-6 text-stone-600 hover:border-amber-400 hover:bg-amber-50/50 hover:text-stone-800"
            >
              回到首页
            </Button>
          </div>
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
            {hasSettledContent
              ? MEDIA_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    disabled={inputLocked}
                    onClick={() => onSend(action.sends)}
                    className="min-h-11 rounded-full border border-amber-200/80 bg-amber-50/50 px-4 text-sm text-amber-800/90 transition-colors hover:border-amber-400 hover:bg-amber-100/70 hover:text-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-40"
                  >
                    {action.label}
                  </button>
                ))
              : null}
          </div>
          <form
            aria-label="继续问"
            onSubmit={handleSubmit}
            className="flex items-center gap-1.5 rounded-full border border-stone-300/90 bg-white py-1.5 pl-5 pr-1.5 shadow-[0_1px_3px_rgba(87,83,78,0.05)] transition-colors focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20"
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                session.sessionId
                  ? (STAGE_PLACEHOLDERS[session.stage] ?? '直接问……')
                  : '正在准备……'
              }
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

      {/* 干净的结束层——这次探索到这里；零推荐；
          作品完成时「以此续作」为用户主动入口（G2-7） */}
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
              <p className="text-2xl font-medium text-stone-800 md:text-3xl">
                {isCreationCompleted ? '作品完成' : '这次探索到这里'}
              </p>
              <p className="text-sm text-stone-400">
                {isCreationCompleted
                  ? '你的每一步修改都完整保留在这次体验里'
                  : '你想继续的时候随时回来'}
              </p>
              <div className="mt-2 flex items-center gap-2.5">
                {isCreationCompleted && onContinueCreation ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onContinueCreation}
                    className="h-12 rounded-full border-stone-300 px-6 text-base text-stone-600 hover:border-amber-400 hover:bg-amber-50/50 hover:text-stone-800"
                  >
                    以此续作
                  </Button>
                ) : null}
                <Button
                  type="button"
                  onClick={onBackHome}
                  className="h-12 rounded-full bg-amber-600 px-8 text-base text-white shadow-sm transition-colors hover:bg-amber-700 focus-visible:ring-amber-300"
                >
                  回到首页
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
