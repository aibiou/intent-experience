/**
 * 视觉生成提示词引擎（体验流算法层——多轮表达的质量与多样性）。
 *
 * 动机（2026-10-12）：直接创作此前把用户原话（≤11 字）直接发给
 * 图像模型——创作轮 LLM 产出的设计文案（风格 / 构图 / 色调细节）
 * 从未参与生成。后果：说「像素头像」出写实人像（提示词太薄，
 * 模型回落人物先验）；「再来一次」同词同图（无信息增量）。
 *
 * 算法：LLM 提示词蒸馏——文本模型把「创作意图 + 创作描述」
 * 浓缩为一条图像模型可消费的提示词（40~90 字，覆盖主体 / 风格
 * 手法 / 构图视角 / 色调光线）。创作描述逐轮不同 → 蒸馏结果
 * 逐轮不同 → 多轮作品自然分化；系列上下文注入使作品集可连贯。
 *
 * 失败纪律：蒸馏是增强项，绝不阻塞生成——无文本配置 / 超时 /
 * 输出不合格一律返回 null，调用方回退原提示词。
 */

import type { EnabledProviderConfig } from './config-store';

/**
 * 通用画面纪律（2026-10-13 CR-59）：产品实测（猫呼噜科普体验
 * 「画成图片」）发现图像模型把「喉部 / 声带 / 发声机制」等解剖
 * 生理词具象为解剖教学图——颈部发光项圈、彩色管道剖面、胸前
 * 解剖示意图 + 箭头标注 + 乱码英文。此纪律对**全部题材**生效
 * （CR-54 只覆盖冥想类，科普类未被拦截——同类缺陷在科普主题
 * 复现）。任何模态的蒸馏都必须收敛到「自然场景表达主题」。
 */
const DISTILL_VISUAL_DISCIPLINE = [
  '- 禁止解剖式呈现：不得出现剖面、内部器官、血管、管道、骨骼等内部结构示意，不得出现箭头 / 框线 / 标注 / 图解式构图',
  '- 画面不得出现任何文字、字母、数字、符号（含乱码与装饰性文字）',
  '- 表达「如何运作 / 机制 / 原理」类主题时，用主体自然状态 + 环境氛围隐喻表达（如动物打呼噜的温馨场景、抽象光波 / 声波涟漪），不得画示意图',
].join('\n');

const DISTILL_SYSTEM_PROMPT_IMAGE = [
  '你是文生图提示词工程师。把「创作意图」与「创作描述」浓缩为一条直接可用的图像生成提示词：',
  '- 一段话 40~90 字；涵盖画面主体、风格手法、构图视角、色调光线中与画面直接相关的信息',
  '- 创作描述中明确的风格（像素风、水墨、赛博朋克等）必须保留，不得漂移为写实',
  '- 只输出提示词本身：无解释、无引号、无「提示词：」等前缀、无换行',
  DISTILL_VISUAL_DISCIPLINE,
].join('\n');

const DISTILL_SYSTEM_PROMPT_VIDEO = [
  '你是文生视频提示词工程师。把「创作意图」与「创作描述」浓缩为一条直接可用的视频生成提示词：',
  '- 一段话 60~110 字；涵盖画面主体、场景氛围、主体运动方式与镜头语言（推 / 拉 / 摇 / 移 / 缓慢推进等）',
  '- 视频是动态的——必须写出「什么在动、镜头怎么动」，静态罗列元素视为不合格',
  '- 创作描述中明确的风格必须保留，不得漂移',
  '- 只输出提示词本身：无解释、无引号、无前缀、无换行',
  DISTILL_VISUAL_DISCIPLINE,
].join('\n');

/**
 * 冥想 / 放松 / 心灵类题材校准纪律（2026-10-12 CR-53）：
 * 产品实测发现「以风声为引的安静练习」深入轮生成出「人体背部 +
 * 脊柱银光」解剖式图——创作描述中「银光流入血管 / 吹开胸腔的结」
 * 等体内意象被提示词蒸馏直接具象为人体解剖，与冥想意境不匹配、
 * 观感不适。命中冥想类意图时向蒸馏 system prompt 注入本纪律，
 * 强制向意境化自然意象收敛。
 */
const DISTILL_MEDITATIVE_CALIBRATION = [
  '- 若创作意图或创作描述属于冥想 / 放松 / 心灵 / 治愈类：画面必须为意境化自然意象（风、光、雾、云、星、水面、山野、羽毛、涟漪、纱幔等）或远景剪影',
  '- 禁止人体解剖、器官、骨架、血管、血肉等具象——体内意象一律以自然物隐喻表达，不得出现解剖式主体',
].join('\n');

/** 冥想 / 放松 / 心灵 / 治愈类意图提示词（命中任一即触发意境化校准）。 */
export const MEDITATIVE_INTENT_HINTS = [
  '冥想', '静心', '打坐', '正念', '放松', '安静', '平静', '舒缓', '治愈', '安神',
  '入眠', '睡眠', '助眠', '呼吸', '深呼吸', '风声', '雨声', '白噪音', '心灵',
  '减压', '焦虑', '禅', '晚安',
] as const;

/** 强解剖 / 人体内部具象词——蒸馏结果含任一即视为不合格（回退）。 */
export const ANATOMIC_LITERALS = [
  '脊柱', '脊椎', '肋骨', '骨骼', '骨架', '解剖', '血管', '器官', '内脏', '血肉',
  '神经', '肌腱', '胸腔', '腹腔', '剖面', '躯干', '背部轮廓',
  '喉部', '声带', '气管', '咽喉', '肌肉层', '截面',
] as const;

/** 示意 / 图解类具象词（科普「机制」类主题的常见跑偏面——解剖教学图）。 */
export const SCHEMATIC_LITERALS = [
  '示意图', '图解', '标注', '箭头', '框线', '结构图', '管道', '导管', '脉络', '构造图',
] as const;

/** 冥想 / 放松 / 心灵 / 治愈类意图判定（意图 + 创作描述任一命中）。 */
export function isMeditativeIntent(intentPrompt: string, designText?: string): boolean {
  const haystack = `${intentPrompt} ${designText ?? ''}`;
  return MEDITATIVE_INTENT_HINTS.some((hint) => haystack.includes(hint));
}

/** 文本是否含强解剖 / 人体内部具象词。 */
export function containsAnatomicLiteral(text: string): boolean {
  return ANATOMIC_LITERALS.some((literal) => text.includes(literal));
}

/** 文本是否含解剖或示意 / 图解类具象词（任一命中即视为有解剖式呈现倾向）。 */
export function containsSchematicLiteral(text: string): boolean {
  return containsAnatomicLiteral(text) || SCHEMATIC_LITERALS.some((literal) => text.includes(literal));
}

/**
 * 蒸馏 system prompt 构造：通用画面纪律常驻（CR-59——全题材禁解剖
 * 示意 / 画面文字），冥想类意图额外注入意境化校准纪律（CR-54）。
 */
export function buildDistillSystemPrompt(
  modality: 'image' | 'video',
  isMeditative: boolean,
): string {
  const base = modality === 'video' ? DISTILL_SYSTEM_PROMPT_VIDEO : DISTILL_SYSTEM_PROMPT_IMAGE;
  return isMeditative ? `${base}\n${DISTILL_MEDITATIVE_CALIBRATION}` : base;
}

/**
 * 蒸馏结果质量门：任何题材的蒸馏结果含解剖 / 示意 / 图解类具象词
 * 即视为不合格（CR-59 由冥想类泛化为通用——科普「机制」类主题的
 * 「喉部 / 声带 / 示意图」跑偏面同等拦截；isMeditative 参数保留
 * 兼容旧签名，判定已不再依赖题材）。
 */
export function shouldRejectDistilled(text: string, isMeditative?: boolean): boolean {
  return containsSchematicLiteral(text);
}

/**
 * 蒸馏失败 / 不合格时的安全视觉兜底（CR-59）：机制问句（「猫的
 * 呼噜声是怎么发出来的？」）直接作图像提示会引导模型画解剖示意
 * 图——兜底一律收敛为「主体自然状态 + 温馨场景」。
 * 优先级：无解剖 / 示意词且 ≥10 字的设计文本（有画面信息）→
 * 机制问句主题化场景（去掉疑问 / 机制词尾，保留主体短语）。
 * 带参考图（hasReference，CR-61）时优先「以参考图为蓝本」导向
 * ——参考图承载主体与构图，兜底词只说明跟随参考图 + 氛围，
 * 不再把机制问句的主体短语作为画面指令（弱化主题句干扰）。
 */
export function safeVisualFallback(
  intentPrompt: string,
  designText?: string,
  hasReference?: boolean,
): string {
  const design = designText?.trim();
  if (design && design.length >= 10 && !containsSchematicLiteral(design)) {
    return design.slice(0, 200);
  }
  if (hasReference === true) {
    return '以参考图为蓝本，保持其主体、姿态与场景氛围，在同样的光线与色调下自然呈现的温馨生活画面';
  }
  const subject = intentPrompt
    .replace(/[？?！!。，,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(是怎么|是如何|为什么会|为什么|怎么|如何|怎样|多少|哪|什么|呢|吗|啊)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(发出来|产生|形成|由来|回事|原因|来源|运作|工作|原理|机制|构成|组成的|产生的|形成的|来的).*$/u, '')
    .trim();
  const subjectText = subject.length >= 2 ? subject : '主题主体';
  return `${subjectText}，温馨自然的生活场景，柔和光线，安静舒适的氛围`;
}

const DISTILL_TIMEOUT_MS = 12_000;

export interface VisualPromptDistillInput {
  /** 目标模态（图像 / 视频的提示词语法不同）。 */
  modality: 'image' | 'video';
  /** 创作意图（用户原话——主题锚，不得被丢弃）。 */
  intentPrompt: string;
  /** 创作描述（本轮 LLM 设计文案——风格与细节的来源；可为空）。 */
  designText?: string;
  /** 画幅（注入构图方向——横版 / 竖版 / 方构图）。 */
  aspectRatio?: string;
  /** 视频时长（注入节奏参考）。 */
  seconds?: string;
  /** 用户提供了参考图（图生图——蒸馏指令切换为「与参考图保持一致」）。 */
  hasReference?: boolean;
  /** 系列上下文（本会话已生成的【最终】提示词——连贯性参考；可为空）。 */
  previousPrompts?: string[];
}

/** 从模型输出提取合格提示词（剥引号 / 前缀，校验长度）。 */
export function sanitizeDistilled(raw: string): string | null {
  let text = raw.trim();
  // 单行化（模型偶发换行）：取内容最丰富的非空行——多行输出时
  // 主体行通常最长，首行可能是格式前缀 / 客套话（「好的，让我
  // 为你构思：」）。曾按首行取，首行过短致整条蒸馏被拒、作品
  // caption 静默退化为主题（CR-58）。
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;
  text = lines.reduce((best, line) => (line.length > best.length ? line : best));
  // 剥常见前缀与成对引号。
  text = text.replace(/^(提示词|Prompt)\s*[:：]\s*/i, '');
  text = text.replace(/^["'「『]+|["'」』]+$/g, '').trim();
  if (text.length < 5) {
    console.warn(`[distill] sanitize rejected too-short (${raw.length} chars raw)`);
    return null;
  }
  // 超长截断保主体（原为直接拒绝——模型偶发超长导致整条蒸馏
  // 静默失败、作品 caption 退化为主题句；截断优于放弃）。
  if (text.length > 200) {
    console.warn(`[distill] sanitize truncated ${text.length} -> 200 chars`);
    text = text.slice(0, 200).trim();
  }
  return text;
}

export async function distillVisualPrompt(
  config: EnabledProviderConfig,
  input: VisualPromptDistillInput,
): Promise<string | null> {
  const sections: string[] = [`创作意图：${input.intentPrompt}`];
  if (input.hasReference === true) {
    sections.push(
      '参考图：用户提供了参考图——画面主体与整体风格须与参考图保持一致；后续描述是相对参考图的修改要求。不得添加参考图中不存在的新主体（如参考图中没有人，画面中也不得出现人物；同理不得新增与参考图无关的物体或角色）。',
    );
  }
  if (input.designText && input.designText.trim().length > 0) {
    sections.push(`创作描述：${input.designText.trim().slice(0, 700)}`);
  }
  if (input.aspectRatio !== undefined) {
    const aspectLabel =
      input.aspectRatio === '9:16'
        ? '竖版构图（9:16）'
        : input.aspectRatio === '1:1'
          ? '方形构图（1:1）'
          : '横版构图（16:9）';
    sections.push(`画幅要求：${aspectLabel}`);
  }
  if (input.modality === 'video' && input.seconds !== undefined) {
    sections.push(`视频时长：约 ${input.seconds} 秒（节奏与之匹配）`);
  }
  if (input.previousPrompts && input.previousPrompts.length > 0) {
    sections.push(
      `本会话已有作品提示词（保持系列连贯或给出明显不同的诠释）：${input.previousPrompts
        .slice(-3)
        .map((prompt, index) => `第${index + 1}幅「${prompt.slice(0, 60)}」`)
        .join('；')}`,
    );
  }
  const isMeditative = isMeditativeIntent(input.intentPrompt, input.designText);
  const systemPrompt = buildDistillSystemPrompt(input.modality, isMeditative);
  // 瞬态重试（CR-58，对齐 CR-51 生成链路纪律）：蒸馏是 caption
  // 画面语义的来源，一次网络抖动 / 网关限流不该让整条蒸馏静默
  // 丢失、作品 caption 退化为主题句。失败与超时重试一次。
  const distillEndpoint = config.endpoint.replace(/\/+$/, '').endsWith('/chat/completions')
    ? config.endpoint
    : `${config.endpoint.replace(/\/+$/, '')}/chat/completions`;
  const distillBody = JSON.stringify({
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: sections.join('\n\n') },
    ],
    temperature: 0.85,
    max_tokens: 300,
  });
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2 && response === null; attempt += 1) {
    try {
      const candidate = await fetch(distillEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: distillBody,
        signal: AbortSignal.timeout(DISTILL_TIMEOUT_MS),
      });
      if (candidate.ok) {
        response = candidate;
      } else {
        console.error(`[distill] http ${candidate.status} (attempt ${attempt + 1}/2) for ${config.endpoint}`);
      }
    } catch (error) {
      console.error(
        `[distill] fetch failed (attempt ${attempt + 1}/2):`,
        (error as Error)?.message ?? error,
      );
    }
  }
  if (response === null) {
    console.error('[distill] give up after retries, fallback to topic/intent prompt');
    return null;
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (error) {
    console.error('[distill] json parse failed:', (error as Error)?.message ?? error);
    return null;
  }
  const content = (parsed as {
    choices?: Array<{ message?: { content?: unknown } }>;
  })?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return null;
  const sanitized = sanitizeDistilled(content);
  // 质量门：冥想类蒸馏结果若仍含解剖具象词（人体脊柱 / 血管 /
  // 器官等）视为不合格——回退原提示词，避免产出观感不适的画面。
  if (sanitized === null || shouldRejectDistilled(sanitized, isMeditative)) return null;
  return sanitized;
}

/**
 * 系列创作规划器：把「做一系列……」的对话回答结构化为
 * 角色设定 + 分集（每集带独立图像提示词）——系列作品
 * 有序生成与查看的数据源。失败返回 null（静默——用户
 * 仍保有文字回答，规划是增强不是门槛）。
 */
export interface SeriesPlan {
  title: string;
  characters: Array<{ name: string; design: string }>;
  episodes: Array<{ title: string; prompt: string }>;
}

const PLAN_SYSTEM_PROMPT = [
  '你是系列创作规划师。依据对话内容输出严格的 JSON（不要 markdown 代码块、不要解释）：',
  '{"title":"系列名","characters":[{"name":"角色名","design":"外观设定 30~60 字（发型/服饰/配色/气质——图像生成可消费）"}],',
  '"episodes":[{"title":"第X集标题","prompt":"该集画面提示词 40~80 字（主体+场景+构图+色调）"}]}',
  '- 角色 1~3 个；分集 2~4 集；每集 prompt 需含对应角色的外观关键词以保持角色一致性',
].join('\n');

const PLAN_TIMEOUT_MS = 15_000;

export async function planSeries(
  config: EnabledProviderConfig,
  input: { userInput: string; answerText: string },
): Promise<SeriesPlan | null> {
  let response: Response;
  try {
    response = await fetch(config.endpoint.replace(/\/+$/, '').endsWith('/chat/completions')
      ? config.endpoint
      : `${config.endpoint.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: PLAN_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `用户请求：${input.userInput.slice(0, 200)}\n\n对话中的规划内容：${input.answerText.slice(0, 1200)}`,
          },
        ],
        temperature: 0.6,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(PLAN_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return null;
  }
  const content = (parsed as {
    choices?: Array<{ message?: { content?: unknown } }>;
  })?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return null;
  // 容错解析：剥 markdown 代码围栏 → 提取首个 {...} 平衡块。
  let jsonText = content.replace(/```(?:json)?/gi, '').trim();
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  jsonText = jsonText.slice(start, end + 1);
  let plan: unknown;
  try {
    plan = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const record = plan as {
    title?: unknown;
    characters?: unknown;
    episodes?: unknown;
  };
  if (typeof record.title !== 'string' || !Array.isArray(record.episodes)) return null;
  const episodes = record.episodes
    .filter(
      (item): item is { title: string; prompt: string } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { title?: unknown }).title === 'string' &&
        typeof (item as { prompt?: unknown }).prompt === 'string' &&
        (item as { prompt: string }).prompt.trim().length > 0,
    )
    .slice(0, 4)
    .map((item) => ({ title: item.title.slice(0, 40), prompt: item.prompt.trim().slice(0, 300) }));
  if (episodes.length < 2) return null;
  const characters = Array.isArray(record.characters)
    ? record.characters
        .filter(
          (item): item is { name: string; design: string } =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { name?: unknown }).name === 'string' &&
            typeof (item as { design?: unknown }).design === 'string',
        )
        .slice(0, 3)
        .map((item) => ({ name: item.name.slice(0, 20), design: item.design.slice(0, 120) }))
    : [];
  return { title: record.title.slice(0, 40), characters, episodes };
}
