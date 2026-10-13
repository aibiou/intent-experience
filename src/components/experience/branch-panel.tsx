'use client';

/**
 * 模拟分支面板（S2a F-4 分支域呈现 + 快捷动作）。
 *
 * - 只呈现引擎分支域的既有事实（序号 = 记录顺序；三态生命周期 + adopted 标记）；
 * - 快捷动作发送的是"如果…"前缀的普通输入——与参考 UI 同一纪律：
 *   经分类器 WHAT_IF 层 → interpretBranchOperation 确定性词表路由，
 *   面板本身不直接改任何状态（Runtime 仍是唯一写入者）；
 * - 分支模拟结果不回流主线：面板明示「采纳为参考」只是标记（S2-BRANCH-REFLOW-DEF-01）。
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, CornerUpLeft, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BranchLite } from './use-experience-session';

const LIFECYCLE_LABELS: Record<BranchLite['lifecycle'], string> = {
  ACTIVE: '进行中',
  RETURNED: '已返回',
  ABANDONED: '已放弃',
};

const LIFECYCLE_CLASS: Record<BranchLite['lifecycle'], string> = {
  ACTIVE: 'border-amber-300/70 bg-amber-50/70 text-amber-700',
  RETURNED: 'border-stone-200 bg-stone-50 text-stone-400',
  ABANDONED: 'border-stone-200 bg-stone-50 text-stone-400 line-through',
};

interface BranchPanelProps {
  branches: BranchLite[];
  currentBranchId: string | null;
  /** 输入锁定（生成中 / 已结束）时动作按钮一并禁用。 */
  disabled: boolean;
  onSend: (text: string) => void;
}

export function BranchPanel({ branches, currentBranchId, disabled, onSend }: BranchPanelProps) {
  const [open, setOpen] = useState(false);
  if (branches.length === 0) return null;

  const current = branches.find((b) => b.branchId === currentBranchId) ?? null;
  const headerText = current
    ? `分支 ${current.ordinal} · 模拟进行中`
    : `主线 · ${branches.length} 支模拟留有记录`;

  return (
    <section
      aria-label="模拟分支"
      className="rounded-2xl border border-stone-200/90 bg-white/80 shadow-[0_1px_2px_rgba(87,83,78,0.04)]"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-amber-50/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-500"
      >
        <GitBranch className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm text-stone-500">{headerText}</span>
        <span className="shrink-0 text-xs text-stone-400">{branches.length} 支</span>
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-4 shrink-0 rotate-180 text-stone-400" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="branch-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-stone-200/70 px-4 pb-4 pt-3">
              {currentBranchId ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSend('如果回到主线')}
                  className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50/60 text-sm text-stone-600 transition-colors hover:border-amber-300/80 hover:bg-amber-50/60 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-500 disabled:opacity-40"
                >
                  <CornerUpLeft className="size-3.5" aria-hidden="true" />
                  回到主线
                </button>
              ) : null}

              <ul className="space-y-2">
                {branches.map((branch) => {
                  const isCurrent = branch.branchId === currentBranchId;
                  const operable = !isCurrent && branch.lifecycle !== 'ABANDONED';
                  return (
                    <li
                      key={branch.branchId}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200/80 bg-white px-3 py-2.5"
                    >
                      <span className="shrink-0 text-sm font-medium text-stone-700">
                        分支 {branch.ordinal}
                      </span>
                      <Badge
                        variant="outline"
                        className={`rounded-full border px-2 font-normal text-xs ${LIFECYCLE_CLASS[branch.lifecycle]}`}
                      >
                        {LIFECYCLE_LABELS[branch.lifecycle]}
                      </Badge>
                      {branch.adopted ? (
                        <Badge
                          variant="outline"
                          className="rounded-full border-emerald-300/70 bg-emerald-50/70 px-2 font-normal text-xs text-emerald-700"
                        >
                          已采纳为参考
                        </Badge>
                      ) : null}
                      {isCurrent ? (
                        <Badge
                          variant="outline"
                          className="rounded-full border-amber-400/70 bg-amber-100/70 px-2 font-normal text-xs text-amber-700"
                        >
                          当前
                        </Badge>
                      ) : null}
                      <span className="ml-auto flex items-center gap-1.5">
                        <span className="text-xs text-stone-400">{branch.roundsCount} 轮推演</span>
                        {operable ? (
                          <>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => onSend(`如果切换到分支${branch.ordinal}`)}
                              className="min-h-9 rounded-full border border-stone-200 px-3 text-xs text-stone-600 transition-colors hover:border-amber-300/80 hover:bg-amber-50/60 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-40"
                            >
                              进入
                            </button>
                            {!branch.adopted ? (
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => onSend(`如果采用分支${branch.ordinal}`)}
                                className="min-h-9 rounded-full border border-stone-200 px-3 text-xs text-stone-600 transition-colors hover:border-amber-300/80 hover:bg-amber-50/60 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-40"
                              >
                                采纳为参考
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <p className="pt-1 text-xs leading-relaxed text-stone-400">
                分支里的推演不会自动变成事实；「采纳为参考」只是做标记，想把它变成作品可以直说。
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
