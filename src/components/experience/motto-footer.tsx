'use client';

/** 产品铁律页脚——非常克制的存在（muted、小号），sticky footer 规范落地。 */
export function MottoFooter() {
  return (
    <footer className="mt-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
      <p className="text-center text-xs text-stone-400/90 tracking-wide">
        人决定方向，AI 降低成本
      </p>
    </footer>
  );
}
