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

const VIDEO_PATTERNS: ReadonlyArray<RegExp> = [
  /(做|生成|制作|创作|来|给我|拍|画).{0,8}视频/,
  /视频.{0,6}(生成|制作|创作)/,
  /(做|生成|制作|创作|来|给我).{0,8}动画/,
  /动画.{0,6}(生成|制作|创作)/,
  /(做|生成|制作|创作|来|给我).{0,8}短片/,
  /拍.{0,8}短片/,
];

const IMAGE_PATTERNS: ReadonlyArray<RegExp> = [
  /画.{0,12}/,
  /(生成|制作|创作|做|来|给我|搞).{0,8}(图|图片|画像|插画|插图|壁纸|头像|背景|封面)/,
  /(图|图片|画像|插画|插图|壁纸|头像|背景|封面).{0,6}(生成|制作|创作)/,
  /(设计|画).{0,8}(头像|像素)/,
  /(做|生成|制作).{0,8}(示意图|概念图)/,
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
