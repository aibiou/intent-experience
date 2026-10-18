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
  /** 呈现形式类表达（「用视频展现 / 以图片形式呈现」）：
   * 输入本身不含画面主题，提示词须由本轮回答内容构建。 */
  useContext?: boolean;
  /** 指代类表达（「生成一个对应的猫图片」）：主体在对话
   * 上文——提示词优先由上一轮助手内容解析（而非首轮主题）。 */
  referential?: boolean;
}

// 生成动词表（显式创作表达）。消费意图
// （「想看 / 看看 / 来看」）不含此动词，
// 不会误判；「来」「给我」不再单独作
// 开头——「来一段视频 / 给我看看视频」
// 语义偏消费，须跟生成动词才识别。
// 「生产」为实测缺口（2026-10-11 用户输入
// 「生产一个图片猫」未命中——与「生成」
// 同义的常见表达）。
const MAKE_VERBS = '(?:做|生成|生产|制作|创作|拍|画|搞)';

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
  // 名词短语式表达（实测缺口——「美女的展示」「美女的视频」
  // 被升级拒绝）：「…的视频 / 动画 / 短片」是视频主题表达。
  /.{0,16}的(?:视频|动画|短片)/,
  // 再生成表达（视频侧——「换一个视频」）。
  /(?:换|再|来)(?:一个|一段|张|个)?(?:视频|动画|短片)(?:[，,、].*)?$/,
  // 呈现形式类表达（实测缺口——「视频方式展现」被
  // 升级拒绝 HTTP 400）：模态词 + 方式 / 形式 /
  // 展现 / 呈现 / 展示。这类输入不含画面主题，
  // useContext 标记提示编排层用回答内容构建提示词。
  /(?:视频|动画|短片).{0,6}(?:方式|形式)/,
  /(?:视频|动画|短片).{0,4}(?:展现|呈现|展示)/,
  /(?:以|用|改|换).{0,4}(?:视频|动画|短片)/,
];

const IMAGE_PATTERNS: ReadonlyArray<RegExp> = [
  /画.{0,30}/,
  new RegExp(`${MAKE_VERBS}.{0,40}(?:图|图片|画像|插画|插图|壁纸|头像|背景|封面)`),
  /(?:图|图片|画像|插画|插图|壁纸|头像|背景|封面).{0,6}(?:生成|制作|创作)/,
  /(?:设计|画).{0,8}(?:头像|像素)/,
  new RegExp(`(?:做|生成|制作).{0,40}(?:示意图|概念图)`),
  new RegExp(`给我.{0,4}${MAKE_VERBS}.{0,40}(?:图|图片|画像|插画|插图|壁纸|头像|背景|封面)`),
  // 名词短语式表达（实测缺口——「美女的展示」被升级拒绝）：
  // 「…的图片 / 照片 / 画像 / 写真」是图像主题表达；
  // 「…的展示 / 演示」缺模态词，按最常用的图像模态理解
  // （提示词裁剪见 recognize——剥去「的展示」尾缀）。
  /.{0,16}的(?:图片|照片|图像|画像|插画|插图|写真|壁纸|头像|背景|封面)/,
  /.{0,16}的(?:展示|演示)/,
  // 再生成表达（实测缺口——「换一张图片，夏天的服装」被
  // 误路由 CHANGE_DIRECTION 撞状态机）：换 / 再 / 来 + 模态
  // 词是对上一张的再生成；新约束经 recognize 提取为提示词。
  /(?:换|再|来)(?:一张|一幅|一个|张|幅)?(?:图片|照片|图像|画|图|插画|头像|壁纸)(?:[，,、].*)?$/,
  // 裸「模态词 + 展示动词」（无主题——呈现形式类，与视频
  // 侧同形；「图像展示一下」）。
  /(?:图像|图片|照片|画像|插画).{0,4}(?:展现|呈现|展示)/,
  // 呈现形式类表达（同视频——模态词 + 方式 / 形式 /
  // 展现 / 呈现；「用图片展现这个概念」）。
  /(?:图片|画像|插画|插图|壁纸|头像|背景|封面).{0,6}(?:方式|形式)/,
  /(?:图片|画像|插画|插图|壁纸|头像|背景|封面).{0,4}(?:展现|呈现|展示)/,
  /(?:以|用|改|换).{0,4}(?:图片|画像|插画|插图)/,
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
  // 呈现形式类表达（「语音方式呈现 / 换成语音」）。
  /语音.{0,6}(?:方式|形式)/,
  /(?:以|改|换).{0,4}语音/,
];

export function recognizeGenerationIntent(rawInput: string): GenerationIntent | null {
  const input = rawInput.trim();
  if (input.length === 0) return null;
  // 名词短语提示词裁剪：「美女的展示」→ 提示词「美女」
  // （提供方模型消费画面主题而非 UI 用语）——仅作用于
  // 提示词，模式匹配仍用原句（否则剥尾后模式失配）。
  const stripped = /^(.{1,16})的(?:展示|演示)$/.exec(input);
  // 再生成新约束提取：「换一张图片，夏天的服装」→ 提示词
  // 「夏天的服装」（逗号后即用户对下一张的要求；无约束时
  // 保留原句——提示词能力所及的最优确定性变换）。
  const regen = /(?:换|再|来)(?:一张|一幅|一个|张|幅)?(?:图片|照片|图像|画|图|插画|头像|壁纸|视频|动画|短片)[，,、\s]+(.+)$/.exec(input);
  const promptBase = regen !== null && regen[1] !== undefined && regen[1].trim().length > 0
    ? regen[1].trim()
    : stripped !== null
      ? stripped[1]
      : input;
  // 呈现形式类表达：模态词 + 方式 / 形式 / 展现 / 呈现 /
  // 展示，或「改 / 换 + 模态词」（换介质表达）——输入是
  // 「换一种呈现介质」的表达，不含画面主题，提示词
  // 须由本轮回答内容构建（useContext）。再生成表达
  // （regen）自带约束主题，不是换介质，优先排除。
  // 指代类表达（2026-10-11 实测缺口——「生成一个对应的猫
  // 图片」「调用相应的图片模型生成图片」：主体在对话上文，
  // 裸短语直达 t2i 会因无主体回落提供方默认人像）。
  const referentialPresentation =
    regen === null &&
    (/(?:选中|刚才选|上一张|那张).{0,12}(?:图片|图像|插画|图)/.test(input) ||
      /(?:对应的?|相应|调用).{0,24}(?:图|图片|图像|插画|头像|壁纸|封面|视频|动画|短片)/.test(input));
  const presentation =
    regen === null &&
    (referentialPresentation ||
      /(?:视频|动画|短片|图片|图像|照片|写真|画像|插画|插图|语音).{0,6}(?:方式|形式)/.test(input) ||
      /(?:视频|动画|短片|图片|图像|照片|写真|画像|插画|插图|语音).{0,4}(?:展现|呈现|展示)/.test(input) ||
      /(?:改|换).{0,4}(?:视频|动画|短片|图片|图像|照片|写真|画像|插画|插图|语音)/.test(input));
  if (VIDEO_PATTERNS.some((pattern) => pattern.test(input))) {
    return {
      modality: 'video',
      prompt: promptBase,
      ...(presentation ? { useContext: true } : {}),
      ...(referentialPresentation ? { referential: true } : {}),
    };
  }
  if (IMAGE_PATTERNS.some((pattern) => pattern.test(input))) {
    return {
      modality: 'image',
      prompt: promptBase,
      ...(presentation ? { useContext: true } : {}),
      ...(referentialPresentation ? { referential: true } : {}),
    };
  }
  if (VOICE_PATTERNS.some((pattern) => pattern.test(input))) {
    // 朗读类请求（「读给我听 / 朗读 / 读出来」）的语义是
    // 「把上一轮回答读出来」——朗读对象是已有内容而非
    // 用户原话（实测「读给我听」曾把原话直接丢给 TTS）。
    // 输入携带引号内容（「把「静夜思」读出来」）时朗读
    // 用户指定的文本，不走上下文。
    const readingRequest = /读|朗读|念/.test(input) && !/[「『""']/u.test(input);
    const useContext = presentation === true || readingRequest === true;
    return { modality: 'voice', prompt: promptBase, ...(useContext ? { useContext: true } : {}) };
  }
  return null;
}

/**
 * CR-56（2026-10-13）——REPEAT 呈现层是否收敛为简短引导。
 *
 * 呈现形式类视觉生成（「画成图片 / 用图片展现刚才的内容 / 用视频
 * 展现」）触发的 REPEAT，用户意图是「把内容画出来」而非「再读
 * 一遍」——完整重放上一轮 300+ 字回答会污染对话流（实测「半截 /
 * 对不上」），应收敛为一句简短引导。
 *
 * 排除项：
 * - 语音朗读（modality === 'voice'）：用户要「听」完整内容，
 *   保留完整重放；
 * - 指代类（referential，「生成一个对应的猫图片」）：蒸馏链路
 *   独立（prompt 由上一轮助手首句解析），不纳入本次收敛。
 * - 「再说一遍」等纯重放指令：recognizeGenerationIntent 不命中，
 *   返回 false，保持原文重放。
 */
export function shouldCompactReplay(rawInput: string): boolean {
  const intent = recognizeGenerationIntent(rawInput);
  return (
    intent !== null &&
    intent.useContext === true &&
    intent.referential !== true &&
    intent.modality !== 'voice'
  );
}

/** 转录轮次（窄结构——只取蒸馏原料选择所需字段）。 */
export interface TranscriptTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * CR-56（2026-10-13）——选择视觉蒸馏的设计文案（designText）。
 *
 * 呈现形式类生成（useContext，非指代）的 REPEAT 展示层已收敛，
 * 流内 answerText 只剩简短引导，不能再作为蒸馏原料——改从转录
 * 取上一轮助手原文（REPEAT 不入转录，原文仍可回溯）。
 *
 * 取不到原文时返回 undefined（蒸馏只基于意图 / 主题），绝不把
 * 收敛后的简短引导回喂（避免画面结论漂移）。
 *
 * 直接创作（无 useContext）与指代类（referential）保持原逻辑：
 * 使用流内 answerText。
 *
 * 注意：仅用于视觉模态（图像 / 视频）；语音朗读不经过蒸馏。
 */
export function resolveDistillDesignText(
  intent: {
    useContext?: boolean;
    referential?: boolean;
  },
  answerText: string,
  transcript: ReadonlyArray<TranscriptTurn>,
): string | undefined {
  const fallback = answerText.trim().slice(0, 700) || undefined;
  if (intent.useContext !== true || intent.referential === true) {
    return fallback;
  }
  const lastAssistant = [...transcript]
    .reverse()
    .find((turn) => turn.role === 'assistant');
  const original = lastAssistant?.text?.trim();
  return original && original.length > 0 ? original.slice(0, 700) : undefined;
}
