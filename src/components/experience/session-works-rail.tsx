'use client';

/**
 * 宽屏作品侧栏（xl+）：把本次会话已产生的媒体收拢成可回看的清单。
 * - 只读呈现（点击滚动到对应轮次，不触发任何生成）；
 * - 空态说明"作品会随探索出现"，与首页作品区同一语义；
 * - 数字与文字优先，缩略图仅作识别；不抢主对话的注意力。
 */

import { AudioLines, Clapperboard, ImageIcon } from 'lucide-react';
import type { DisplayTurn, TurnMedia } from './use-experience-session';

interface RailWork {
  key: string;
  turn: number;
  modality: TurnMedia['modality'];
  url: string;
  promptUsed?: string;
  selected: boolean;
}

function railWorks(turns: DisplayTurn[]): RailWork[] {
  const works: RailWork[] = [];
  for (const item of turns) {
    const media = item.media;
    if (!media || media.modality === undefined) continue;
    if (media.status === 'pending') {
      works.push({
        key: item.key,
        turn: item.turn,
        modality: media.modality,
        url: '',
        promptUsed: media.promptUsed,
        selected: false,
      });
      continue;
    }
    if (media.status !== 'completed') continue;
    const url = media.selectedFile
      ? `/api/experience/media/${media.selectedFile}`
      : (media.url ?? media.urls?.[0] ?? '');
    if (!url) continue;
    works.push({
      key: item.key,
      turn: item.turn,
      modality: media.modality,
      url,
      promptUsed: media.promptUsed,
      selected: Boolean(media.selectedFile),
    });
  }
  return works;
}

const MODALITY_LABELS: Record<TurnMedia['modality'], string> = {
  image: '图像',
  video: '视频',
  voice: '声音',
};

function jumpToTurn(key: string) {
  const el = document.querySelector(`[data-turn-key="${key}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function SessionWorksRail({ turns }: { turns: DisplayTurn[] }) {
  const works = railWorks(turns);
  const pending = works.filter((work) => work.url === '');

  return (
    <aside
      aria-label="本次作品"
      className="hidden w-[320px] shrink-0 flex-col xl:flex"
    >
      <div className="my-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-stone-200/80 bg-white/70 p-4 backdrop-blur-[2px]">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-stone-700">本次作品</h2>
          <span className="shrink-0 text-xs tabular-nums text-stone-400">
            {pending.length > 0 ? `${pending.length} 件生成中` : `${works.length} 件`}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-stone-400">
          探索留下的图像、声音与影像
        </p>

        <div className="exp-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {works.length === 0 ? (
            <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-stone-200/90 px-4 py-8 text-center">
              <ImageIcon className="size-4 text-stone-300" aria-hidden="true" />
              <p className="mt-2 text-sm text-stone-400">作品会随探索出现在这里</p>
              <p className="mt-1 text-xs leading-5 text-stone-400">
                生成一张图，或者说「把它做成视频」
              </p>
            </div>
          ) : (
            works.map((work) => (
              <button
                key={work.key}
                type="button"
                onClick={() => jumpToTurn(work.key)}
                className="group flex w-full items-center gap-3 rounded-xl border border-stone-200/70 bg-white px-2.5 py-2 text-left transition-colors hover:border-amber-300/80 hover:bg-amber-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
              >
                <span className="relative block size-12 shrink-0 overflow-hidden rounded-lg border border-stone-200/70 bg-stone-100">
                  {work.url !== '' ? (
                    work.modality === 'image' ? (
                      <img
                        src={work.url}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center text-stone-400">
                        {work.modality === 'video' ? (
                          <Clapperboard className="size-5" aria-hidden="true" />
                        ) : (
                          <AudioLines className="size-5" aria-hidden="true" />
                        )}
                      </span>
                    )
                  ) : (
                    <span className="flex size-full items-center justify-center">
                      <span className="size-2 animate-pulse rounded-full bg-amber-400/90" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[11px] leading-4 text-stone-400">
                    <span className="tabular-nums">第 {work.turn} 轮</span>
                    <span aria-hidden="true">·</span>
                    <span>{MODALITY_LABELS[work.modality]}</span>
                    {work.url === '' ? (
                      <span className="text-amber-700/90">生成中</span>
                    ) : work.selected ? (
                      <span className="text-amber-700">已选中</span>
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-5 text-stone-600">
                    {work.promptUsed ?? ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
