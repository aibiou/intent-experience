'use client';

/**
 * 一轮体验的呈现：用户气泡（小）+ 内容卡片。
 * - kind 未定义 = 生成中：用户气泡 + 安静的"正在理解…"指示
 * - 内容按 \n\n 分段渲染为 <p>；卡片样式按 kind 区分：
 *   - FIRST_LAYER / EXPLANATION：默认卡片
 *   - ANSWER：左侧暖色细边（直接回答）
 *   - SIMULATION_RESULT：琥珀暖色调 + 「模拟」徽标 + 「模拟结果 ≠ 事实」脚注
 *   - CORRECTION_EXPLAIN：默认卡片 + 「已纠正」徽标
 *   - ESCALATION_NOTICE / BOUNDARY_NOTICE：系统注记（虚线边框、muted）
 */

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import type { DisplayTurn } from './use-experience-session';
import { ThinkingIndicator } from './thinking-indicator';

type SettledKind = NonNullable<DisplayTurn['kind']>;

function paragraphs(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function KindBadge({ kind }: { kind: SettledKind }) {
  if (kind === 'SIMULATION_RESULT') {
    return (
      <Badge
        variant="outline"
        className="mb-3 rounded-full border-amber-300/70 bg-amber-100/60 text-amber-700"
      >
        模拟
      </Badge>
    );
  }
  if (kind === 'CORRECTION_EXPLAIN') {
    return (
      <Badge variant="outline" className="mb-3 rounded-full border-stone-300 bg-stone-50 text-stone-500">
        已纠正
      </Badge>
    );
  }
  return null;
}

function contentCardClass(kind: SettledKind): string {
  if (kind === 'ESCALATION_NOTICE' || kind === 'BOUNDARY_NOTICE') {
    return 'rounded-2xl border border-dashed border-stone-300 bg-transparent px-5 py-4';
  }
  const base =
    'rounded-2xl border border-stone-200/90 bg-white px-5 py-5 shadow-[0_1px_2px_rgba(87,83,78,0.05)] md:px-6';
  if (kind === 'SIMULATION_RESULT') {
    return `${base} border-amber-200/80 bg-amber-50/60`;
  }
  if (kind === 'ANSWER') {
    return `${base} border-l-2 border-l-amber-500/80`;
  }
  return base;
}

export function TurnItem({ item }: { item: DisplayTurn }) {
  // 用户气泡（小）——始终呈现这一轮"人说了什么"
  const bubble = (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-md border border-stone-200/80 bg-stone-100/80 px-4 py-2 text-sm leading-relaxed text-stone-600">
        {item.userText}
      </p>
    </div>
  );

  // 生成中：气泡 + 安静等待
  if (item.kind === undefined || item.content === undefined) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="space-y-2.5"
      >
        {bubble}
        <ThinkingIndicator />
      </motion.div>
    );
  }

  const kind = item.kind;
  const isNotice = kind === 'ESCALATION_NOTICE' || kind === 'BOUNDARY_NOTICE';
  const isSimulation = kind === 'SIMULATION_RESULT';
  const isFirstLayer = kind === 'FIRST_LAYER';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="space-y-2.5"
    >
      {bubble}
      <article className={contentCardClass(kind)}>
        <KindBadge kind={kind} />
        <div className={isNotice ? 'space-y-3' : 'space-y-4'}>
          {paragraphs(item.content).map((para, i) => (
            <p
              key={i}
              className={[
                'whitespace-pre-line leading-relaxed',
                isNotice
                  ? 'text-sm text-stone-500'
                  : isFirstLayer
                    ? 'text-[1.05rem] text-stone-700'
                    : 'text-base text-stone-700',
              ].join(' ')}
            >
              {para}
            </p>
          ))}
        </div>
        {isSimulation ? (
          <p className="mt-4 border-t border-amber-200/70 pt-2.5 text-xs text-stone-400">
            模拟结果 ≠ 事实
          </p>
        ) : null}
      </article>
    </motion.div>
  );
}
