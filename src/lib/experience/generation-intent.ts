/**
 * 生成意图识别（S2b 媒体生成切片；产品负责人指令 2026-10-10，
 * 参考仓库注释原文：「问答过程中识别用户意图，自动调用相应
 * 文本 / 语音 / 图像 / 视频模型进行生成」）。
 *
 * 确定性规则识别（与语义动作分类器同一纪律——不调用任何模型；
 * 未知情况不发明意图）。识别层独立于策略语义动作域：不改变
 * 优先级链与 policy 冻结表的任何语义动作，仅认领分类器的
 * UNKNOWN 输出（运行期编排决定接线时机——本模块不知道分类器，
 * 零依赖：不 import 项目内任何其他文件）。
 *
 * 优先级：视频 > 图像 > 语音（显式生成动词 + 模态标记同时命中才
 * 识别——避免把「想看点视频」这类消费意图误判为生成意图）。
 *
 * 视频词表不扩展：本环境暂无视频提供方，识别后由编排层走诚实
 * 「未接入」路径（识别与提供是两层——识别层如实报告意图）。
 */

export type GenerationModality = 'image' | 'voice' | 'video';

export interface GenerationIntent {
  modality: GenerationModality;
  /** 生成提示（原始输入或确定性裁剪——提供方模型消费自然语言提示）。 */
  prompt: string;
  /** 呈现形式类表达（读给我听 / 声音我听听 / 图片我看看 /
   * 用图片展现刚才的内容）：输入本身不含主题，提示词材料须由
   * 上一轮回答内容构建。 */
  useContext?: boolean;
  /** 指代类表达（「生成一个对应的猫图片」）：主体在对话上文——
   * 提示词优先由上一轮助手内容解析（而非用户原话）。 */
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
  // 实测缺口（用户在「听风」体验里说「图片我看看」被回
  // 「这句话我还没能理解」）——模态词 + 看看 / 看一下的
  // 自然呈现请求（无生成动词；呈现类语义，useContext 见
  // recognize 的 presentation 判定）。
  /(?:图片|图像).{0,4}(?:看看|看一下)/,
  /(?:看看|看一下).{0,4}(?:图片|图像)/,
];

/**
 * 朗读请求扩展词表（实测缺口——用户在「听风」体验里的真实输入：
 * 「声音我听听」「读一段风的声音给我听」连续两次被回「这句话我还
 * 没能理解」）。命中即按朗读请求处理（useContext=true，见 recognize
 * 返回处判定）；词表同时并入 VOICE_PATTERNS 参与模态识别。
 */
const VOICE_READING_REQUEST_PATTERNS: ReadonlyArray<RegExp> = [
  // 实测缺口：模态词 + 听听 / 听一下（无生成动词的自然朗读请求
  // ——「声音我听听 / 听听声音」）。
  /(?:声音|音频).{0,4}(?:听听|听一下)/,
  /(?:听听|听一下).{0,4}(?:声音|音频)/,
  // 实测缺口：参考只有连续的「读给我听」——中间隔内容
  // （「读一段风的声音给我听」）时失配，放宽到 16 字间隔。
  /读.{0,16}给我听/,
  /念.{0,16}给我听/,
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
  // 实测缺口扩展（用户真实输入，见 VOICE_READING_REQUEST_PATTERNS
  // 注释——命中即朗读请求 useContext=true）。
  ...VOICE_READING_REQUEST_PATTERNS,
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
  const regenGroup = regen?.[1];
  const promptBase =
    regenGroup !== undefined && regenGroup.trim().length > 0
      ? regenGroup.trim()
      : stripped !== null
        ? stripped[1]
        : input;
  // 呈现形式类表达：模态词 + 方式 / 形式 / 展现 / 呈现 /
  // 展示，或「改 / 换 + 模态词」（换介质表达）——输入是
  // 「换一种呈现介质」的表达，不含画面主题，提示词
  // 须由本轮回答内容构建（useContext）。再生成表达
  // （regen）自带约束主题，不是换介质，优先排除。
  // 实测缺口（「图片我看看 / 看看图片」）：模态词 + 看看 /
  // 看一下同属呈现形式类——用户要「看到」而非「读到」内容。
  // 指代类表达（2026-10-11 实测缺口——「生成一个对应的猫
  // 图片」「调用相应的图片模型生成图片」：主体在对话上文，
  // 裸短语直达 t2i 会因无主体回落提供方默认人像）。
  const referentialPresentation =
    regen === null &&
    /(?:对应的?|相应|调用).{0,24}(?:图|图片|图像|插画|头像|壁纸|封面|视频|动画|短片)/.test(input);
  const presentation =
    regen === null &&
    (referentialPresentation ||
      /(?:视频|动画|短片|图片|图像|照片|写真|画像|插画|插图|语音).{0,6}(?:方式|形式)/.test(input) ||
      /(?:视频|动画|短片|图片|图像|照片|写真|画像|插画|插图|语音).{0,4}(?:展现|呈现|展示)/.test(input) ||
      /(?:图片|图像).{0,4}(?:看看|看一下)/.test(input) ||
      /(?:看看|看一下).{0,4}(?:图片|图像)/.test(input) ||
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
    // 实测缺口扩展：「声音我听听 / 听听声音 / 读…给我听 /
    // 念…给我听」与 /读|朗读|念/ 同属朗读请求——引号豁免
    // 仅作用于参考的 /读|朗读|念/ 判定（四条新增词表本身
    // 不含「读用户指定文本」语义，直接按朗读请求处理）。
    const readingRequest =
      VOICE_READING_REQUEST_PATTERNS.some((pattern) => pattern.test(input)) ||
      (/读|朗读|念/.test(input) && !/[「『""']/u.test(input));
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
 *   保留完整重放（「声音我听听」同理——要听的是内容本身）；
 * - 指代类（referential，「生成一个对应的猫图片」）：蒸馏链路
 *   独立（prompt 由上一轮助手首句解析），不纳入本次收敛；
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
