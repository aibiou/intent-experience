/**
 * 生成意图识别（产品负责人指令 2026-10-10：问答过程中
 * 识别用户意图，自动调用相应文本 / 语音 / 图像 / 视频
 * 模型进行生成）。
 *
 * 确定性规则识别（与语义动作分类器同一纪律——不调用
 * 任何模型；未知情况不发明意图）。识别层独立于策略
 * 语义动作域：不改变 policy_v2.3.0 任何语义动作，
 * 仅作为运行期生成编排的输入（对话回应照常进行，
 * 生成物作为体验产物随流呈现）。
 *
 * 优先级：视频 > 图像 > 语音（显式生成动词 + 模态
 * 标记同时命中才识别——避免把「想看点视频」这类
 * 消费意图误判为生成意图）。
 */

export type GenerationModality = 'image' | 'video' | 'voice';

export interface GenerationIntent {
  modality: GenerationModality;
  /** 生成提示（原始输入——提供方模型消费自然语言提示）。 */
  prompt: string;
}

// 生成动词表（显式创作表达）。消费意图
// （「想看 / 看看 / 来看」）不含此动词，
// 不会误判；「来」「给我」不再单独作
// 开头——「来一段视频 / 给我看看视频」
// 语义偏消费，须跟生成动词才识别。
const MAKE_VERBS = '(?:做|生成|制作|创作|拍|画|搞)';

const VIDEO_PATTERNS: ReadonlyArray<RegExp> = [
  // 生成动词 + 模态词（间隔放宽——自然
  // 语言描述常超 8 字：「做一段清晨森林
  // 雾气的视频」中间隔 9 字）。
  new RegExp(`${MAKE_VERBS}.{0,40}视频`),
  // 「给我 + 生成动词 + 模态词」——给我
  // 后须跟生成动词，避免「给我看看视频」
  // 这类消费意图误判。
  new RegExp(`给我.{0,4}${MAKE_VERBS}.{0,40}视频`),
  /视频.{0,6}(?:生成|制作|创作)/,
  new RegExp(`${MAKE_VERBS}.{0,40}动画`),
  new RegExp(`给我.{0,4}${MAKE_VERBS}.{0,40}动画`),
  /动画.{0,6}(?:生成|制作|创作)/,
  new RegExp(`${MAKE_VERBS}.{0,40}短片`),
  new RegExp(`给我.{0,4}${MAKE_VERBS}.{0,40}短片`),
  /拍.{0,40}短片/,
];

const IMAGE_PATTERNS: ReadonlyArray<RegExp> = [
  /画.{0,30}/,
  new RegExp(`${MAKE_VERBS}.{0,40}(?:图|图片|画像|插画|插图|壁纸|头像|背景|封面)`),
  /(?:图|图片|画像|插画|插图|壁纸|头像|背景|封面).{0,6}(?:生成|制作|创作)/,
  /(?:设计|画).{0,8}(?:头像|像素)/,
  new RegExp(`(?:做|生成|制作).{0,40}(?:示意图|概念图)`),
  new RegExp(`给我.{0,4}${MAKE_VERBS}.{0,40}(?:图|图片|画像|插画|插图|壁纸|头像|背景|封面)`),
];

const VOICE_PATTERNS: ReadonlyArray<RegExp> = [
  /读出来/,
  /朗读/,
  /读成语音/,
  /语音读/,
  /读给我听/,
  /(用|发出).{0,4}语音/,
  /说.{0,4}出来/,
  /发音/,
];

export function recognizeGenerationIntent(rawInput: string): GenerationIntent | null {
  const input = rawInput.trim();
  if (input.length === 0) return null;
  if (VIDEO_PATTERNS.some((pattern) => pattern.test(input))) {
    return { modality: 'video', prompt: input };
  }
  if (IMAGE_PATTERNS.some((pattern) => pattern.test(input))) {
    return { modality: 'image', prompt: input };
  }
  if (VOICE_PATTERNS.some((pattern) => pattern.test(input))) {
    return { modality: 'voice', prompt: input };
  }
  return null;
}
