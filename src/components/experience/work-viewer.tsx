'use client';

/**
 * 作品查看器（孤儿作品降级入口）：
 * 作品墙条目点击后，若其所属会话已不存在（历史残留媒体 / 会话被清理），
 * 不再 toast 拒绝——直接以媒体本体查看作品（图像/语音/视频均可播放）。
 * 会话存在时仍走完整 restore（可续作），本组件仅作兜底。
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { WorkSummary } from './client-types';

export function WorkViewer({
  work,
  onClose,
}: {
  work: WorkSummary;
  onClose: () => void;
}) {
  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="作品查看"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-800">{work.topic ?? '作品'}</p>
            <p className="mt-0.5 text-xs text-stone-400">
              {work.modality === 'image' ? '图像' : work.modality === 'voice' ? '语音' : '视频'}
              {work.promptUsed ? ` · ${work.promptUsed}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

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
      </motion.div>
    </motion.div>
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
