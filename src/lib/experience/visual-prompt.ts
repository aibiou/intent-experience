/**
 * 视觉提示词的通用履约层。
 *
 * 这里不识别“清晨/雪夜/信封”这类具体值；具体语义交给上游画面模型。
 * 本层只把用户已经给出的限定项声明为不可替换的硬约束，避免提供方
 * 在候选多样性中把时间、天气、保留物或主体悄悄换成相反设定。
 */
const NEGATION_MARKERS = ['不是', '并非', '而非', '避免', '不要', '别出现', '禁止', '没有'] as const;

/** 通用中文否定子句剥离：图像模型经常忽略否定词，反而渲染被禁止的物。 */
export function stripNegatedClauses(prompt: string): string {
  const clauses = prompt
    .split(/(?:[，,。．；;！!？?\s]+|，?(?:而不是|而非|而是))/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const positive = clauses.filter(
    (clause) => !NEGATION_MARKERS.some((marker) => clause.includes(marker)),
  );
  return positive.length > 0 ? positive.join('，') : prompt.trim();
}

export function applyVisualPromptContract(prompt: string): string {
  const clean = stripNegatedClauses(prompt).replace(/[。．.!！?？\s]+$/u, '');
  if (clean.length === 0) return prompt.trim();
  return [
    `${clean}。`,
    '严格遵循上述画面中的主体、数量、时间、天气、季节、光线、场景、材质、动作、位置和保留对象；',
    '不得替换成相反的时间、天气或场景，不得增删关键限定物，不得加入水印或文字签名。',
  ].join('');
}
