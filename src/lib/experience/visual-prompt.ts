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

/**
 * 把“现有图像做成视频”的指令拆成“来源画面 + 新约束”。
 * 指令本身（把它做成视频 / 把这张图做成一段视频）不是画面主题；
 * 来源画面描述来自该产物的 promptUsed，冒号/逗号后的镜头与动作
 * 要求保留为追加约束。无新增约束时返回来源描述本身。
 */
export function buildVideoContinuationPrompt(
  imagePrompt: string,
  userRequest: string,
): string {
  const base = stripNegatedClauses(withoutVisualContract(imagePrompt))
    .replace(/[。．.!！?？\s]+$/u, '')
    .trim();
  // 约束内保留空白（「持续 5 秒」不能被拆成「持续，5，秒」——
  // stripNegatedClauses 按空白切分，针对画面描述合适，对镜头
  // 指令会破坏值），只按标点切分并剥离否定子句。
  const clauses = userRequest
    .split(/[，,。．；;！!？?]+/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const positive = clauses.filter(
    (clause) => !NEGATION_MARKERS.some((marker) => clause.includes(marker)),
  );
  const constraint = (positive.length > 0 ? positive.join('，') : userRequest.trim())
    .replace(
      /^\s*(?:请|帮我|麻烦(?:你)?)?\s*(?:把|将)?\s*(?:它|这个|这段|这些|这张(?:图|图片|图像|照片|画面)?|那张(?:图|图片|图像|照片|画面)?|刚才[^，,。:：]{0,12}|上面[^，,。:：]{0,12})?\s*(?:做成|变成|转成|改成|制作成|生成)\s*(?:一段|一个|一张|一幅|个)?\s*(?:视频|动画|短片|图片|图像|照片|插画|语音|音频)\s*[吧呢啊]?\s*[，,。:：]?/u,
      '',
    )
    .replace(/^[，,。:：\s]+/u, '')
    .replace(/[。．.!！?？\s]+$/u, '')
    .trim();
  if (constraint.length === 0) return base;
  return `${base}，${constraint}`;
}

const CONTRACT_CLAUSE = [
  '严格遵循上述画面中的主体、数量、时间、天气、季节、光线、场景、材质、动作、位置和保留对象；',
  '不得替换成相反的时间、天气或场景，不得增删关键限定物，不得加入水印或文字签名。',
].join('');

/**
 * 已履约的提示词在接续（图像→视频、二次蒸馏）时会作为来源再次经过
 * 本层——先剥掉旧契约，避免「契约＋约束＋契约」的重复堆叠。
 */
function withoutVisualContract(prompt: string): string {
  return prompt
    .split(CONTRACT_CLAUSE)
    .join('')
    .replace(/[。．.!！?？]\s*(?=[，,])/gu, '')
    .replace(/^[，,。．\s]+/u, '')
    .trim();
}

export function applyVisualPromptContract(prompt: string): string {
  const clean = stripNegatedClauses(withoutVisualContract(prompt)).replace(/[。．.!！?？\s]+$/u, '');
  if (clean.length === 0) return prompt.trim();
  return [`${clean}。`, CONTRACT_CLAUSE].join('');
}
