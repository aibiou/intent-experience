/**
 * 生成失败展示拆分（体验页 gen-card / 创作页失败态共用）：
 * 人性化主行 + 提供方技术细节（humanizeGenerationFailure
 * 尾部全角括注）降级为次行——主行可行动，细节悬停可查，
 * 用户不必面对英文错误堆。
 */
export function splitGenerationDetail(message?: string): {
  main: string;
  detail: string | null;
} {
  const text = message ?? '';
  const marker = text.indexOf('（generation');
  if (marker === -1) return { main: text, detail: null };
  const main = text.slice(0, marker).trim();
  const detail = (
    text.endsWith('）') ? text.slice(marker + 1, -1) : text.slice(marker + 1)
  ).trim();
  return { main, detail: detail.length > 0 ? detail : null };
}

/**
 * 下载文件名（语义化——标签 / 提示词摘要 + 扩展名，
 * 替代无意义的内部 id）。
 */
export function downloadFileName(
  item: { label?: string; prompt: string; modality: string },
): string {
  const base = (item.label ?? item.prompt)
    .replace(/[\\/:*?"<>|#\s]+/g, '-')
    .slice(0, 24)
    .replace(/^-+|-+$/g, '');
  const ext = item.modality === 'video' ? 'mp4' : item.modality === 'voice' ? 'mp3' : 'png';
  return `${base.length > 0 ? base : 'work'}.${ext}`;
}
