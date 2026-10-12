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

const DISTILL_SYSTEM_PROMPT_IMAGE = [
  '你是文生图提示词工程师。把「创作意图」与「创作描述」浓缩为一条直接可用的图像生成提示词：',
  '- 一段话 40~90 字；涵盖画面主体、风格手法、构图视角、色调光线中与画面直接相关的信息',
  '- 创作描述中明确的风格（像素风、水墨、赛博朋克等）必须保留，不得漂移为写实',
  '- 只输出提示词本身：无解释、无引号、无「提示词：」等前缀、无换行',
].join('\n');

const DISTILL_SYSTEM_PROMPT_VIDEO = [
  '你是文生视频提示词工程师。把「创作意图」与「创作描述」浓缩为一条直接可用的视频生成提示词：',
  '- 一段话 60~110 字；涵盖画面主体、场景氛围、主体运动方式与镜头语言（推 / 拉 / 摇 / 移 / 缓慢推进等）',
  '- 视频是动态的——必须写出「什么在动、镜头怎么动」，静态罗列元素视为不合格',
  '- 创作描述中明确的风格必须保留，不得漂移',
  '- 只输出提示词本身：无解释、无引号、无前缀、无换行',
].join('\n');

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
function sanitizeDistilled(raw: string): string | null {
  let text = raw.trim();
  // 单行化（模型偶发换行——取首段非空行）。
  text = text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
  // 剥常见前缀与成对引号。
  text = text.replace(/^(提示词|Prompt)\s*[:：]\s*/i, '');
  text = text.replace(/^["'「『]+|["'」』]+$/g, '').trim();
  if (text.length < 5 || text.length > 200) return null;
  return text;
}

export async function distillVisualPrompt(
  config: EnabledProviderConfig,
  input: VisualPromptDistillInput,
): Promise<string | null> {
  const sections: string[] = [`创作意图：${input.intentPrompt}`];
  if (input.hasReference === true) {
    sections.push(
      '参考图：用户提供了参考图——画面主体与整体风格须与参考图保持一致；后续描述是相对参考图的修改要求。',
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
  const systemPrompt =
    input.modality === 'video'
      ? DISTILL_SYSTEM_PROMPT_VIDEO
      : DISTILL_SYSTEM_PROMPT_IMAGE;
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: sections.join('\n\n') },
        ],
        temperature: 0.85,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(DISTILL_TIMEOUT_MS),
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
  return sanitizeDistilled(content);
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
