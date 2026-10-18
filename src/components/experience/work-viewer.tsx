'use client';

/**
 * 作品查看器（孤儿作品降级入口）：
 * 作品墙条目点击后，若其所属会话已不存在（历史残留媒体 / 会话被清理），
 * 不再 toast 拒绝——直接以媒体本体查看作品（图像/语音/视频均可播放）。
 * 会话存在时仍走完整 restore（可续作），本组件仅作兜底。
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { WorkSummary } from './client-types';

export function WorkViewer({
  work,
  onClose,
}: {
  work: WorkSummary;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden rounded-3xl border-stone-200 bg-white p-0 shadow-2xl"
        aria-label="作品查看"
        aria-modal="true"
      >
        <DialogHeader className="border-b border-stone-100 px-5 py-3.5">
          <DialogTitle className="truncate text-sm font-medium text-stone-800">
            {work.topic ?? '作品'}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-stone-400">
            {work.modality === 'image' ? '图像' : work.modality === 'voice' ? '语音' : '视频'}
            {work.promptUsed ? ` · ${work.promptUsed}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="exp-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#faf9f7] p-5">
          {work.modality === 'image' ? (
            <img
              src={work.url}
              alt={work.promptUsed || work.topic || '作品'}
              className="mx-auto max-h-[60dvh] rounded-2xl object-contain"
            />
          ) : work.modality === 'voice' ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <AudioIcon />
              </div>
              <audio src={work.url} controls className="w-full max-w-sm" />
            </div>
          ) : (
            <video src={work.url} controls className="mx-auto max-h-[60dvh] rounded-2xl" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AudioIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}
