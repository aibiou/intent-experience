'use client';

/**
 * 一轮体验的呈现：用户气泡（小）+ 内容卡片。
 * - kind 未定义 = 生成中：用户气泡 + 安静的"正在理解…"指示
 *
 * S2a（6-d）新增专项渲染：
 * - SIMULATION_RESULT：四元分离解析渲染（事实/推断/假设/提案——
 *   deriveSimulationPresentation，缺标记回退整文）；多分支时带「分支N」徽标
 * - CREATION_PREVIEW / CREATION_PATCHED：作品卡（版本徽章 + （分量：值）标注高亮）
 * - CREATION_ASK：澄清问题卡（至多一问——08 §16 ASK 纪律）
 * - CREATION_COMPLETED：作品完成卡（干净收束，零推荐）
 * - BRANCH_NOTICE / MEMORY_NOTICE：系统注记（虚线边框、muted）
 *
 * S2b：轮次内嵌媒体（生成事件驱动）——语音朗读播放器 / 图片卡 /
 * 生成中呼吸指示 / 失败与未接入说明。媒体是体验产物：挂在内容卡之下，
 * 不改变轮次本身的呈现语义。
 */

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AudioLines, ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DisplayTurn, TurnMedia } from './use-experience-session';
import { ThinkingIndicator } from './thinking-indicator';
import { deriveSimulationPresentation } from '@/lib/experience/simulation';

type SettledKind = NonNullable<DisplayTurn['kind']>;

function paragraphs(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// 模拟四元分离渲染（E8-G2-CC07：模拟结果不得表现为事实）
// ---------------------------------------------------------------------------

function SeparationRow({
  label,
  tone,
  text,
}: {
  label: string;
  tone: 'stone' | 'amber' | 'rose';
  text: string;
}) {
  const toneClass =
    tone === 'stone'
      ? 'border-stone-200 bg-stone-50/80 text-stone-500'
      : tone === 'amber'
        ? 'border-amber-200/80 bg-amber-50/80 text-amber-700'
        : 'border-rose-200/70 bg-rose-50/70 text-rose-600';
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 shrink-0 rounded-full border px-2.5 py-0.5 text-xs leading-5 ${toneClass}`}
      >
        {label}
      </span>
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-stone-500">{text}</p>
    </div>
  );
}

function SimulationCard({
  content,
  branchOrdinal,
  totalBranches,
}: {
  content: string;
  branchOrdinal: number | undefined;
  totalBranches: number;
}) {
  const view = deriveSimulationPresentation(content);
  const showBranch = totalBranches > 1 && typeof branchOrdinal === 'number';

  return (
    <article className="rounded-2xl border border-amber-200/80 bg-amber-50/60 px-5 py-5 shadow-[0_1px_2px_rgba(87,83,78,0.05)] md:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="rounded-full border-amber-300/70 bg-amber-100/60 text-amber-700"
        >
          模拟
        </Badge>
        {showBranch ? (
          <Badge
            variant="outline"
            className="rounded-full border-stone-300/80 bg-white/70 font-normal text-stone-500"
          >
            分支 {branchOrdinal}
          </Badge>
        ) : null}
      </div>

      {view.parsed ? (
        <div className="space-y-4">
          <div className="space-y-2.5">
            {view.fact ? (
              <SeparationRow label="事实" tone="stone" text={view.fact} />
            ) : null}
            {view.inference ? (
              <SeparationRow label="推断" tone="stone" text={view.inference} />
            ) : null}
            {view.hypothesis ? (
              <SeparationRow label="假设" tone="rose" text={view.hypothesis} />
            ) : null}
          </div>
          <div className="space-y-4 border-t border-amber-200/60 pt-4">
            {paragraphs(view.proposal).map((para, i) => (
              <p key={i} className="whitespace-pre-line text-base leading-relaxed text-stone-700">
                {para}
              </p>
            ))}
          </div>
        </div>
      ) : (
        // 缺标记容错：回退整文渲染（诚实边界——LLM 未按格式输出时不高估解析能力）
        <div className="space-y-4">
          {paragraphs(content).map((para, i) => (
            <p key={i} className="whitespace-pre-line text-base leading-relaxed text-stone-700">
              {para}
            </p>
          ))}
        </div>
      )}

      <p className="mt-4 border-t border-amber-200/70 pt-2.5 text-xs text-stone-400">
        模拟结果 ≠ 事实
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// 创作卡渲染（版本徽章 + （分量：值）标注）
// ---------------------------------------------------------------------------

/** 分量标注模式：（分量名：值）——创作首建提示约定的标注格式（08 §9 分量的语料承载）。 */
const ANNOTATION_SPLIT_RE = /(（[^（）]{1,12}[:：][^（）]{0,80}）)/g;

function splitAnnotation(annotation: string): { name: string; value: string } | null {
  const inner = annotation.slice(1, -1);
  const idx = inner.search(/[:：]/);
  if (idx <= 0) return null;
  return { name: inner.slice(0, idx), value: inner.slice(idx + 1) };
}

function AnnotationChip({ annotation }: { annotation: string }) {
  const parts = splitAnnotation(annotation);
  if (!parts) {
    return <span className="text-sm text-stone-500">{annotation}</span>;
  }
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-amber-300/60 bg-amber-50/80 px-3 py-1 text-sm text-amber-800/90">
      <span className="font-medium text-amber-900/80">{parts.name}</span>
      <span aria-hidden="true" className="text-amber-400">
        ·
      </span>
      <span>{parts.value}</span>
    </span>
  );
}

/** 段落渲染：整段皆为标注 → 标注行；否则正文 + 行内标注高亮。 */
function CreationParagraph({ para }: { para: string }) {
  const parts = para.split(ANNOTATION_SPLIT_RE).filter((p) => p !== '');
  const isAnnotation = (s: string) => /^（[^（）]{1,12}[:：][^（）]{0,80}）$/.test(s);
  const onlyAnnotations = parts.length > 0 && parts.every(isAnnotation);

  if (onlyAnnotations) {
    return (
      <div className="flex flex-wrap gap-2">
        {parts.map((part, i) => (
          <AnnotationChip key={i} annotation={part} />
        ))}
      </div>
    );
  }

  return (
    <p className="whitespace-pre-line text-[1.02rem] leading-relaxed text-stone-700">
      {parts.map((part, i) =>
        isAnnotation(part) ? (
          <span
            key={i}
            className="mx-0.5 inline rounded-md bg-amber-100/80 px-1.5 py-0.5 text-[0.92em] text-amber-900"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

function CreationCard({
  kind,
  content,
  creationVersion,
}: {
  kind: 'CREATION_PREVIEW' | 'CREATION_PATCHED';
  content: string;
  creationVersion: number | undefined;
}) {
  return (
    <article className="rounded-2xl border border-amber-200/90 bg-white px-5 py-5 shadow-[0_1px_2px_rgba(87,83,78,0.05)] md:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="rounded-full border-amber-300/70 bg-amber-100/60 text-amber-700"
        >
          作品
        </Badge>
        {typeof creationVersion === 'number' ? (
          <Badge
            variant="outline"
            className="rounded-full border-stone-300/80 bg-stone-50 font-normal text-stone-500"
          >
            第 {creationVersion} 版
          </Badge>
        ) : null}
        {kind === 'CREATION_PATCHED' ? (
          <span className="text-xs text-stone-400">已应用你的修改</span>
        ) : null}
      </div>
      <div className="space-y-4">
        {paragraphs(content).map((para, i) => (
          <CreationParagraph key={i} para={para} />
        ))}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// 通用卡片（默认 / 直接回答 / 澄清 / 完成 / 注记）
// ---------------------------------------------------------------------------

function KindBadge({ kind, creationVersion }: { kind: SettledKind; creationVersion?: number }) {
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
  if (kind === 'CREATION_ASK') {
    return (
      <Badge
        variant="outline"
        className="mb-3 rounded-full border-amber-300/70 bg-amber-50/80 text-amber-700"
      >
        再确认一下
      </Badge>
    );
  }
  if (kind === 'CREATION_COMPLETED') {
    return (
      <Badge className="mb-3 rounded-full border border-amber-300/70 bg-amber-500/90 text-white">
        作品完成
      </Badge>
    );
  }
  if (kind === 'BRANCH_NOTICE') {
    return (
      <Badge variant="outline" className="rounded-full border-stone-200 bg-transparent font-normal text-stone-400">
        分支
      </Badge>
    );
  }
  if (kind === 'MEMORY_NOTICE') {
    return (
      <Badge variant="outline" className="rounded-full border-stone-200 bg-transparent font-normal text-stone-400">
        记忆
      </Badge>
    );
  }
  void creationVersion;
  return null;
}

function contentCardClass(kind: SettledKind): string {
  if (
    kind === 'ESCALATION_NOTICE' ||
    kind === 'BOUNDARY_NOTICE' ||
    kind === 'BRANCH_NOTICE' ||
    kind === 'MEMORY_NOTICE'
  ) {
    return 'rounded-2xl border border-dashed border-stone-300 bg-transparent px-5 py-4';
  }
  const base =
    'rounded-2xl border border-stone-200/90 bg-white px-5 py-5 shadow-[0_1px_2px_rgba(87,83,78,0.05)] md:px-6';
  if (kind === 'CREATION_ASK') {
    return `${base} border-l-2 border-l-amber-400/90`;
  }
  if (kind === 'CREATION_COMPLETED') {
    return `${base} border-amber-200/90 bg-amber-50/70`;
  }
  if (kind === 'ANSWER') {
    return `${base} border-l-2 border-l-amber-500/80`;
  }
  return base;
}

function TextParagraphs({ content, kind }: { content: string; kind: SettledKind }): ReactNode {
  const isNotice =
    kind === 'ESCALATION_NOTICE' ||
    kind === 'BOUNDARY_NOTICE' ||
    kind === 'BRANCH_NOTICE' ||
    kind === 'MEMORY_NOTICE';
  const isFirstLayer = kind === 'FIRST_LAYER';
  return (
    <>
      {paragraphs(content).map((para, i) => (
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
    </>
  );
}

// ---------------------------------------------------------------------------
// S2b：轮次内嵌媒体渲染（音频 / 图片 / 生成中 / 失败与未接入说明）
// ---------------------------------------------------------------------------

function MediaPending({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/70" />
        <span className="relative inline-flex size-2 rounded-full bg-amber-500/90" />
      </span>
      <p className="text-sm text-stone-500">{label}</p>
    </div>
  );
}

function MediaBlock({ media }: { media: TurnMedia }) {
  if (media.status === 'pending') {
    return (
      <MediaPending
        label={media.modality === 'voice' ? '正在合成语音，马上就好…' : '正在生成图片，马上就好…'}
      />
    );
  }
  if (media.status === 'failed') {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-3">
        <p className="text-sm text-stone-500">
          {media.modality === 'voice' ? '这段语音' : '这张图片'}
          {media.message ? `没能生成：${media.message}` : '没能生成出来'}
        </p>
      </div>
    );
  }
  // 未接入（视频）：诚实说明——不假装支持。
  if (media.modality === 'video') {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-3">
        <p className="text-sm text-stone-500">{media.message}</p>
      </div>
    );
  }
  if (media.modality === 'voice' && media.url) {
    return (
      <figure className="rounded-2xl border border-stone-200/90 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(87,83,78,0.05)]">
        <figcaption className="mb-2 flex items-center gap-2 text-xs font-medium text-stone-500">
          <AudioLines className="size-3.5 text-amber-600/80" aria-hidden="true" />
          读给你听
        </figcaption>
        {/* 朗读内容即上方轮次正文（音频元素自带可访问性控件）。 */}
        <audio controls preload="metadata" src={media.url} className="h-10 w-full">
          你的浏览器不支持音频播放。
        </audio>
      </figure>
    );
  }
  if (media.modality === 'image' && media.url) {
    return (
      <figure className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-[0_1px_2px_rgba(87,83,78,0.05)]">
        <a href={media.url} target="_blank" rel="noreferrer" aria-label="查看原图">
          {/* 生成产物为任意尺寸位图，经产物端点提供（非 Next 静态资源）。 */}
          <img
            src={media.url}
            alt={media.promptUsed ?? '根据这次体验内容生成的图片'}
            className="w-full object-cover"
            loading="lazy"
          />
        </a>
        <figcaption className="flex items-start gap-2 px-4 py-2.5 text-xs text-stone-400">
          <ImageIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="line-clamp-2">{media.promptUsed}</span>
        </figcaption>
      </figure>
    );
  }
  return null;
}

export function TurnItem({
  item,
  totalBranches = 1,
}: {
  item: DisplayTurn;
  totalBranches?: number;
}) {
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
  const isNotice =
    kind === 'ESCALATION_NOTICE' ||
    kind === 'BOUNDARY_NOTICE' ||
    kind === 'BRANCH_NOTICE' ||
    kind === 'MEMORY_NOTICE';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="space-y-2.5"
    >
      {bubble}
      {kind === 'SIMULATION_RESULT' ? (
        <SimulationCard
          content={item.content}
          branchOrdinal={item.branchOrdinal}
          totalBranches={totalBranches}
        />
      ) : kind === 'CREATION_PREVIEW' || kind === 'CREATION_PATCHED' ? (
        <CreationCard kind={kind} content={item.content} creationVersion={item.creationVersion} />
      ) : (
        <article className={contentCardClass(kind)}>
          <KindBadge kind={kind} />
          <div className={isNotice ? 'space-y-3' : 'space-y-4'}>
            <TextParagraphs content={item.content} kind={kind} />
          </div>
        </article>
      )}
      {item.media ? <MediaBlock media={item.media} /> : null}
    </motion.div>
  );
}
