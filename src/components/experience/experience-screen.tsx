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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Clock3, Coins, House, SendHorizontal } from 'lucide-react';
import { recognizeGenerationIntent } from '@/lib/experience/generation-intent';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ExperienceStage } from '@/lib/experience/types';
import type { ExperienceSessionState } from './use-experience-session';
import { BranchPanel } from './branch-panel';
import { SessionWorksRail } from './session-works-rail';
import { TurnItem } from './turn-item';

const STAGE_LABELS: Record<ExperienceStage, string> = {
  CURIOSITY: '好奇',
  UNDERSTANDING: '理解',
  SIMULATION: '模拟探索',
  CREATION: '创造',
  COMPLETION: '完成',
};

const QUICK_ACTIONS = ['为什么？', '继续', '我大概懂了', '换一个'] as const;

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
  const [videoConfirmation, setVideoConfirmation] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新内容到达 → 温和地滚到最新
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // 图片完成时以图片为本体：不要滚到下方长文，避免主图和候选被顶出视野。
    const media = [...el.querySelectorAll('[data-media-result]')].at(-1);
    if (media instanceof HTMLElement) {
      const offset =
        media.getBoundingClientRect().top -
        el.getBoundingClientRect().top +
        el.scrollTop -
        8;
      el.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
      return;
    }

    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [session.turns, session.generating]);

  const inputLocked =
    !session.sessionId ||
    session.ended ||
    session.readOnly ||
    session.exitReason !== null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputLocked) return;
    const value = text.trim();
    if (!value) return;
    if (recognizeGenerationIntent(value)?.modality === 'video') {
      setVideoConfirmation(value);
      return;
    }
    setText('');
    onSend(value);
  };

  const confirmVideo = () => {
    const value = videoConfirmation?.trim();
    setVideoConfirmation(null);
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
  // 阶段徽章只在有真实内容（或正在生成）时可信——restore 失败会话
  // 零内容仍挂「阶段·好奇/刚开始」是虚假标签（2026-10-16 模拟用户⑧）。
  const showStageBadge = hasSettledContent || session.generating;
  const isReadOnly = session.readOnly;
  const hasTurns = session.turns.length > 0;

  return (
    <main className="experience-shell relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-5 sm:px-8 xl:max-w-6xl">
      {/* 头部：归档态弱化状态胶囊，让主题和元信息形成一组 */}
      <header className="flex items-start justify-between gap-4 border-b border-stone-200/80 pb-5 pt-6 sm:pt-8">
        <div className="min-w-0">
          <p className="experience-kicker mb-2.5">
            {isReadOnly ? '回看' : '探索中'}
          </p>
          <h1 className="home-title line-clamp-2 text-xl font-medium leading-snug text-stone-900 md:text-2xl">
            {session.topic}
          </h1>
          {showStageBadge ? (
            <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-5">
              <span className={cn('font-medium', isReadOnly ? 'text-stone-500' : 'text-amber-800/90')}>
                {STAGE_LABELS[session.stage] ?? session.stage}
              </span>
              <span aria-hidden="true" className="size-1 rounded-full bg-stone-300" />
              <span className="text-stone-400">
                {session.turn > 0 ? `已 ${session.turn} 轮` : '刚开始'}
              </span>
              {isReadOnly ? (
                <>
                  <span aria-hidden="true" className="size-1 rounded-full bg-stone-300" />
                  <span className="text-stone-400">已结束</span>
                </>
              ) : null}
            </div>
          ) : (
            <div className="mt-1.5 text-xs text-stone-400">
              {session.readOnly ? '这段会话没有可回看的内容' : '还没有生成内容'}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onBackHome}
            aria-label="返回首页"
            title="返回首页"
            className="flex size-10 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-white hover:text-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            <House className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
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

      {/* 宽屏双栏（xl+）：左侧对话与输入保持可读列宽，右侧作品侧栏
          收拢本次会话的媒体；窄屏退回单栏，内容区随页面滚动。 */}
      <div className="flex min-h-0 flex-1 gap-8">
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      {/* 内容区：正文固定到可读列宽；归档收束跟随内容流，避免被固定操作裁切 */}
      <div
        ref={scrollRef}
        className="exp-scrollbar my-4 min-h-0 flex-1 space-y-6 overflow-y-auto pr-1 sm:space-y-7"
        aria-live="polite"
      >
        <div className="mx-auto max-w-3xl">
          {session.turns.map((item) => (
            <TurnItem
              key={item.key}
              item={item}
              totalBranches={session.branches.length}
              sessionId={session.sessionId}
              onRetryMedia={onSend}
            />
          ))}

          {showRetry ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-8 text-center">
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

          {isReadOnly ? (
            <section
              aria-label="会话收束"
              className="mt-8 rounded-2xl border border-stone-200/85 bg-white/75 px-6 py-7 text-center shadow-[0_8px_30px_rgb(48_43_31/6%)] backdrop-blur-sm sm:px-8"
            >
              <p className="experience-kicker">
                {isCreationCompleted ? '作品完成' : '会话已归档'}
              </p>
              <h2 className="mt-3 text-lg font-medium leading-snug text-stone-800">
                {hasTurns
                  ? isCreationCompleted
                    ? '完整作品已经收在这里'
                    : '这段探索可以随时回看'
                  : '这段会话没有可回看的内容'}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-500">
                {hasTurns
                  ? isCreationCompleted
                    ? '图片、文字和修改记录都保留在本次会话中。'
                    : '完整对话和生成结果已按轮次整理完成。'
                  : '回到首页可以开始一次新的探索。'}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                {hasTurns && isCreationCompleted && onContinueCreation ? (
                  <Button
                    type="button"
                    onClick={onContinueCreation}
                    className="h-11 rounded-full bg-stone-900 px-6 text-sm text-white transition-colors hover:bg-amber-800"
                  >
                    以此续作
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={hasTurns && isCreationCompleted ? 'outline' : 'ink'}
                  onClick={onBackHome}
                  className={cn(
                    'h-11 rounded-full px-6 text-sm transition-colors',
                    hasTurns && isCreationCompleted
                      ? 'border-stone-300 text-stone-700 hover:border-amber-400 hover:bg-amber-50/60 hover:text-stone-900'
                      : 'hover:bg-amber-800',
                  )}
                >
                  回到首页
                </Button>
              </div>
            </section>
          ) : null}
        </div>
        <div aria-hidden="true" className="h-2" />
      </div>

      {/* 底部输入区：归档态不占据视口底部，完整让位给阅读 */}
      {isReadOnly ? null : (
        <div className="mt-auto pb-8 pt-2">
          <div
            className="mx-auto mb-3 flex max-w-3xl flex-wrap gap-2"
            role="toolbar"
            aria-label="快捷回应"
          >
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                disabled={inputLocked}
                onClick={() => onSend(action)}
                className={cn(
                  buttonVariants({ variant: 'paper' }),
                  'min-h-11 h-auto px-4 py-2 text-sm font-normal text-stone-600 transition-colors hover:border-amber-300/90 hover:bg-amber-50/60 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-40',
                )}
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
                    className={cn(
                      buttonVariants({ variant: 'accent' }),
                      'min-h-11 h-auto px-4 py-2 text-sm font-normal text-amber-900/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-40',
                    )}
                  >
                    {action.label}
                  </button>
                ))
              : null}
            <button
              type="button"
              disabled={inputLocked}
              onClick={() => onSend('好了')}
              className={cn(
                buttonVariants({ variant: 'paper' }),
                'inline-flex min-h-11 h-auto items-center gap-1.5 border-stone-300 bg-stone-100/80 px-4 py-2 text-sm font-normal text-stone-600 transition-colors hover:border-stone-400 hover:bg-stone-200/70 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:opacity-40',
              )}
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              结束探索
            </button>
          </div>
          {session.generating ? (
            <p className="mx-auto mb-2 max-w-3xl px-2 text-xs leading-5 text-stone-500" role="status" aria-live="polite">
              正在处理这一轮。你也可以继续输入；新输入会结束当前这一轮。
            </p>
          ) : null}
          <form
            aria-label="继续问"
            onSubmit={handleSubmit}
            className="experience-composer"
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
              variant="ink"
              className="size-11 shrink-0 disabled:opacity-40"
            >
              <SendHorizontal className="size-4.5" aria-hidden="true" />
            </Button>
          </form>
        </div>
      )}
        </div>

        {hasTurns ? <SessionWorksRail turns={session.turns} /> : null}
      </div>

      {/* 干净的结束层——这次探索到这里；零推荐；
          作品完成时「以此续作」为用户主动入口（G2-7） */}
      <AnimatePresence>
        {videoConfirmation ? (
          <AlertDialog
            key="video-confirmation"
            open
            onOpenChange={(open) => {
              if (!open) setVideoConfirmation(null);
            }}
          >
            <AlertDialogContent className="max-w-md rounded-[24px] border-stone-200 bg-[#faf9f7] p-6">
              <AlertDialogHeader className="text-left">
                <div className="mb-1 flex items-center gap-2">
                  <AlertCircle className="size-5 text-amber-700" aria-hidden="true" />
                  <AlertDialogTitle className="text-base font-semibold text-stone-900">
                    确认生成视频
                  </AlertDialogTitle>
                </div>
                <AlertDialogDescription className="text-sm leading-6 text-stone-600">
                  生成会进入上游队列，期间可以继续对话或稍后回到本会话查看。
                </AlertDialogDescription>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200/90 bg-white px-2.5 py-1 text-xs text-stone-500">
                    <Clock3 className="size-3.5 text-stone-400" aria-hidden="true" />
                    通常约 5–10 分钟
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50/70 px-2.5 py-1 text-xs text-amber-800">
                    <Coins className="size-3.5 text-amber-600/80" aria-hidden="true" />
                    免费额度用尽后可能消耗付费额度
                  </span>
                </div>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-2 sm:flex-row">
                <AlertDialogCancel className="h-11 rounded-full border-stone-300 px-5 text-stone-600">
                  先不生成
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmVideo}
                  className="h-11 rounded-full bg-stone-900 px-5 text-white hover:bg-amber-800"
                >
                  继续生成
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        {showEndOverlay ? (
          <motion.div
            key="end-overlay"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-[#faf9f7]/95 backdrop-blur-sm"
            role="dialog"
            aria-label="探索结束"
          >
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.45, delay: 0.1, ease: 'easeOut' }}
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
