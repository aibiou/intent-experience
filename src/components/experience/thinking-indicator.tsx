'use client';

/** 生成中的安静等待指示：三个呼吸的小圆点。 */
export function ThinkingIndicator({ label = '正在理解…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-1" role="status" aria-live="polite">
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-500/80 [animation-delay:0ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-amber-500/80 [animation-delay:200ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-amber-500/80 [animation-delay:400ms]" />
      </span>
      <span className="text-sm text-stone-400">{label}</span>
    </div>
  );
}
