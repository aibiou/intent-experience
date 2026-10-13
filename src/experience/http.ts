/**
 * 框架无关的请求处理：把语义动作请求转换为 NDJSON 流式响应。
 *
 * Route Handler（app/api/experience/stream/route.ts）仅做薄封装，
 * 使同一代码路径可在两种形态执行：
 * - 进程内形态：证据执行器直接调用本函数（注入内存审计汇与合成 Request 等价输入）。
 * - HTTP 形态：Next.js 运行时经 Route Handler 调用本函数（request.signal 为客户端断开信号）。
 *
 * S3b（D-3 选项 A——S3-SCOPE-PROPOSAL-01 v1.0.0 / S3B-SEMANTIC-FREEZE-01
 * v1.0.0 §3 变更 4：既有端点 semanticAction 枚举扩展——纯暴露层）：
 * 两种请求形态：
 * - S1 形态（向后兼容）：{ semanticAction }——合成语料 fixture 流式
 *   输出（既有路径，行为不变）。
 * - S2/S3 形态：{ request_id, session_id, user_input, experience_id?,
 *   state_version?, semantic_action?, aspect_ratio?, seconds? }——经同一
 *   ExperienceRuntime 单例执行真实运行路径（resolveIntent →
 *   startExperience → submitExperienceEvent）：WHAT_IF 分支操作经用户输入负载携带
 *   分支操作词（/采用/、/切换/、/放弃/、/返回主线/——词表优先级
 *   RETURN > SWITCH > ABANDON > ADOPT_BRANCH，与进程内识别完全
 *   一致）；创作域顶层动作（deepen / simplify / reframe）经创作
 *   会话路由承载；CORRECTION / RESTORE_PREVIOUS_VERSION 经既有
 *   纠正路径；记忆 WITHDRAW / CORRECT 与长期记忆显式表达
 *   （S3a D-1——"记住我喜欢…"等 A/B 类显式表达）经既有记忆
 *   事件路径（记忆操作结果经 NDJSON 响应行返回）；跨会话分支
 *   操作（S3a D-2——新会话对已结束会话的持久分支记录显式
 *   操作）经既有事件提交路径（experience_id + state_version
 *   定位持久体验）。
 * 暴露层不变量：API 面扩展不改变任何运行时语义、决策追踪、
 * 事件契约——同一运行时实例（默认 getServerRuntime() 单例；
 * 证据形态经 options.runtime 注入构造的运行时，进程内证据
 * 不经服务器单例）。
 */

import { resolvePolicy } from './policy';
import { loadChunkFixture, type ChunkFixture, type ChunkResolution } from './chunks';
import { createExperienceStream, type StreamEvent } from './stream';
import { classifyInput } from './classifier';
import { getServerRuntime } from './server-runtime';
import {
  recognizeGenerationIntent,
  resolveDistillDesignText,
  type GenerationModality,
} from './generation-intent';
import {
  GENERATION_CALLS,
  humanizeGenerationFailure,
  type GenerationOptions,
} from './generation-gateway';
import { getEnabledProviderConfig, getEnabledProviderConfigForModality } from './config-store';
import {
  distillVisualPrompt,
  planSeries,
  safeVisualFallback,
  type SeriesPlan,
} from './prompt-engine';

/** 本会话最终蒸馏提示词（按体验 id——系列连贯性参考；进程内存量）。 */
const distilledPromptsByExperience = new Map<string, string[]>();

/** 系列规划触发词（用户显式要求系列化产出——角色设定 / 分集 / 短剧）。 */
const SERIES_PLAN_PATTERN = /(系列|分集|短剧|连续剧|角色设定|插画集|组图)/;

/**
 * 系列规划包装（流末触发）：对话回答先完整呈现（用户先读到
 * 规划内容），流末经规划器结构化为角色 + 分集 JSON——
 * series_plan 事件随流输出；规划失败静默（文字回答仍在）。
 */
async function* withSeriesPlanning(
  source: AsyncGenerator<unknown>,
  runPlan: (answerText: string) => Promise<SeriesPlan | null>,
  signal?: AbortSignal,
): AsyncGenerator<unknown> {
  let answerText = '';
  let ended = false;
  for await (const event of source) {
    yield event;
    if ((event as { type?: string }).type === 'done') ended = true;
    if ((event as { type?: string }).type === 'chunk') {
      const content = (event as { content?: unknown }).content;
      if (typeof content === 'string') answerText += content;
    }
  }
  if (!ended || signal?.aborted) return;
  const seriesPlan = await runPlan(answerText);
  if (seriesPlan) {
    yield {
      type: 'series_plan',
      plan: seriesPlan,
      at: new Date().toISOString(),
    };
  }
}
import type { ExperienceRuntime, RuntimeError, SubmissionResult } from './runtime';
import type { AuditSink } from './audit';

export interface StreamRequestInput {
  method: string;
  body: string;
  signal?: AbortSignal;
  audit?: AuditSink;
  /** 运行时实例注入（S3b——证据形态注入构造的运行时；缺省为服务器单例）。 */
  runtime?: ExperienceRuntime;
}

export interface HandlerResult {
  status: number;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NDJSON_HEADERS = { 'Content-Type': 'application/x-ndjson' };

// 提示词增稠（2026-10-11——实测 agnes-image 对单词级提示词
// 先验极强：「美女」两次独立生成收敛到同一张「图库感」
// 图像——同款毛衣同款沙发）。短提示词自动补充多样化的
// 质感 / 光影描述（每次随机一组），让再生成有差异。仅用于
// 用户直接输入的短提示词——体验主题派生的提示词（呈现类）
// 不增稠：后缀会把非人物主题拉偏（实测「猫…」+「自然光
// 摄影质感」生成人物肖像），主题正确性优先于多样性。
const PROMPT_ENRICHERS: ReadonlyArray<string> = [
  '自然光摄影质感',
  '电影感光影',
  '温暖柔和的色调',
  '清新明亮的色调',
  '细腻的细节刻画',
  '氛围感光影',
  '高细节写实风格',
  '柔和的背景虚化',
];

function enrichPrompt(prompt: string): string {
  if (prompt.length >= 12) return prompt;
  const pick = PROMPT_ENRICHERS[Math.floor(Math.random() * PROMPT_ENRICHERS.length)];
  return `${prompt}，${pick}`;
}

function jsonResponse(status: number, payload: Record<string, unknown>): HandlerResult {
  return {
    status,
    headers: JSON_HEADERS,
    body: new Blob([JSON.stringify(payload)]).stream(),
  };
}

/** NDJSON 流式响应（S3b——运行时执行结果流：submission 首行 + chunk / done / stopped / cancelled + state_updated）。 */
function ndjsonResponse(stream: AsyncGenerator<unknown>): HandlerResult {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
  return { status: 200, headers: NDJSON_HEADERS, body };
}

/**
 * 生成编排（产品负责人指令 2026-10-10：问答过程中识别
 * 生成意图，自动调用相应模态模型）。
 *
 * 编排层——不触碰策略语义（policy_v2.3.0 不变）：对话
 * 事件原样透传；流末（done 之后）经确定性规则识别的
 * 生成意图触发对应模态模型调用，产物以 generation 事件
 * 随同一 NDJSON 流呈现。
 *
 * 事件形态：
 * - started：生成开始（呈现层占位）
 * - completed：{ url } 或 { dataUri }（远程 / 内联产物）
 * - unconfigured：该模态尚无启用模型（引导去配置）
 * - failed：提供方调用失败（错误信息不含 key）
 */
async function* withGeneration(
  source: AsyncGenerator<unknown>,
  intent: {
    modality: GenerationModality;
    prompt: string;
    useContext?: boolean;
    /** 指代类（「对应的猫图片」）——提示词优先由上一轮
     * 助手内容解析（getTranscript 回调注入转录）。 */
    referential?: boolean;
    /** 创作参数（画幅 / 视频时长 / 参考图——透传生成网关）。 */
    aspectRatio?: GenerationOptions['aspectRatio'];
    seconds?: GenerationOptions['seconds'];
    referenceImages?: string[];
  },
  signal?: AbortSignal,
  getTopic?: () => string | null,
  getTranscript?: () => Array<{ role: 'user' | 'assistant'; text: string }>,
  experienceId?: string | null,
): AsyncGenerator<unknown> {
  // 回答内容累积（呈现形式类生成的提示词原料——
  // 「用视频展现」这类输入不含画面主题，主题在本轮
  // 回答里）。chunk 事件在流内逐段拼接。
  let answerText = '';
  let ended = false;
  for await (const event of source) {
    yield event;
    if ((event as { type?: string }).type === 'done') ended = true;
    if ((event as { type?: string }).type === 'chunk') {
      const content = (event as { content?: unknown }).content;
      if (typeof content === 'string') answerText += content;
    }
  }
  // 流末（done 之后）触发生成——对话回应先完整呈现。
  if (!ended || signal?.aborted) return;
  // 呈现形式类生成的提示词来源（2026-10-11 修订）：
  // ①视觉模态（图像 / 视频）优先用体验主题（首轮用户
  // 输入，如「猫为什么会发出呼噜声」——短视觉主题，
  // 文生图模型可消费；实测 400 字叙述文被提供方忽略
  // 并回落人物先验）；无主题时回退回答首句。
  // ①′ 指代类（referential——「生成一个对应的猫图片」）：
  // 主体在上一轮助手内容里（「对应的」指代上文）——优先
  // 由转录的上一轮助手首句解析，主题仅作回退。
  // ②语音为朗读语义——直接朗读回答内容，不加前缀。
  let prompt = intent.prompt;
  if (intent.useContext === true) {
    let topic: string | null = null;
    try {
      topic = getTopic?.() ?? null;
    } catch (topicError) {
      console.error('[withGeneration] getTopic failed:', topicError);
      topic = null;
    }
    if (intent.modality === 'voice') {
      prompt = answerText.trim().slice(0, 1_000) || intent.prompt;
    } else if (intent.referential === true) {
      let referent: string | null = null;
      try {
        const transcript = getTranscript?.() ?? [];
        // 指针须落在当前用户轮**之前**的最近助手轮——当前轮的
        // 回答在流末先入转录（captureLastResponse），直接取
        // 「最后一条助手」会拿到本轮而非指代所指的上文。
        let lastUserIdx = -1;
        for (let i = transcript.length - 1; i >= 0; i -= 1) {
          if (transcript[i].role === 'user') {
            lastUserIdx = i;
            break;
          }
        }
        const lastAssistant =
          lastUserIdx > 0
            ? transcript
                .slice(0, lastUserIdx)
                .reverse()
                .find((turn) => turn.role === 'assistant')
            : undefined;
        const first = lastAssistant?.text.split(/(?<=[。！？])/)[0]?.trim() ?? '';
        if (first.length > 0) referent = first.slice(0, 60);
      } catch (transcriptError) {
        console.error('[withGeneration] getTranscript failed:', transcriptError);
        referent = null;
      }
      prompt =
        referent ??
        (topic !== null && topic.trim().length > 0
          ? topic.trim().slice(0, 60)
          : prompt);
    } else if (topic !== null && topic.trim().length > 0) {
      prompt = topic.trim().slice(0, 60);
    } else {
      const firstSentence = answerText.trim().split(/(?<=[。！？])/)[0] ?? '';
      prompt =
        firstSentence.trim().length > 0
          ? firstSentence.trim().slice(0, 60)
          : intent.prompt;
    }
  }
  const at = new Date().toISOString();
    try {
      const config = await getEnabledProviderConfigForModality(intent.modality);
      // 提示词引擎（2026-10-12——视觉生成算法层）：先经 LLM
      // 蒸馏——创作轮设计文案 + 系列上下文 → 一条覆盖主体 /
      // 风格 / 构图 / 色调的专业提示词。逐轮设计文案不同 →
      // 蒸馏结果不同 → 多轮作品自然分化；蒸馏失败（无文本
      // 配置 / 超时 / 输出不合格）回退既有规则（呈现类用
      // 主题 / 首句；直接创作用原话+增稠），绝不阻塞生成。
      let finalPrompt =
        intent.useContext === true ? prompt : enrichPrompt(prompt);
      let distilledPrompt: string | null = null;
      let designTextForFallback: string | undefined;
      if (intent.modality !== 'voice') {
        try {
          const textConfig = await getEnabledProviderConfig();
          if (textConfig === null) {
            console.error(
              '[withGeneration] distill skipped: no enabled text provider config',
            );
          }
          if (textConfig) {
            // 系列上下文取本会话的【最终】蒸馏提示词（用户意图
            // 太薄，做连贯性参考会失真）。
            const previousPrompts =
              experienceId !== undefined && experienceId !== null
                ? distilledPromptsByExperience.get(experienceId)
                : undefined;
            // 蒸馏设计文案（2026-10-13 CR-56）：呈现形式类生成
            // （useContext——「画成图片」等）的 REPEAT 展示层已
            // 收敛为简短引导，流内 answerText 不再是完整内容——
            // 蒸馏原料由 resolveDistillDesignText 独立从转录取
            // 上一轮助手原文（REPEAT 不入转录，原文仍可回溯）；
            // 取不到原文时为 undefined（蒸馏只基于意图/主题），
            // 绝不把收敛后的简短引导回喂；指代类与直接创作保持
            // 原逻辑（详见 generation-intent.ts 纯函数与单测）。
            let transcriptForDistill: ReadonlyArray<{
              role: 'user' | 'assistant';
              text: string;
            }> = [];
            try {
              transcriptForDistill = getTranscript?.() ?? [];
            } catch {
              transcriptForDistill = [];
            }
            designTextForFallback = resolveDistillDesignText(
              intent,
              answerText,
              transcriptForDistill,
            );
            distilledPrompt = await distillVisualPrompt(textConfig, {
              modality: intent.modality === 'video' ? 'video' : 'image',
              intentPrompt: prompt,
              designText: designTextForFallback,
              aspectRatio: intent.aspectRatio,
              seconds: intent.seconds,
              hasReference: (intent.referenceImages?.length ?? 0) > 0,
              previousPrompts,
            });
          }
        } catch (distillError) {
          console.error('[withGeneration] distill failed:', (distillError as Error)?.message ?? distillError);
          distilledPrompt = null;
        }
        if (distilledPrompt !== null) {
          finalPrompt = distilledPrompt;
          if (experienceId !== undefined && experienceId !== null) {
            const history = distilledPromptsByExperience.get(experienceId) ?? [];
            history.push(distilledPrompt);
            distilledPromptsByExperience.set(experienceId, history.slice(-5));
          }
          console.log('[withGeneration] distilled prompt:', distilledPrompt);
        } else {
          // 蒸馏失败 / 不合格的安全兜底（CR-59）：机制问句直接作
          // 图像提示会引导模型画解剖示意（猫呼噜实测：颈部发光项圈 /
          // 彩色管道剖面 / 箭头标注 / 乱码文字）——兜底收敛为
          // 「主体自然状态 + 温馨场景」，绝不把机制问句原样下发。
          finalPrompt = safeVisualFallback(prompt, designTextForFallback);
          console.warn(
            '[withGeneration] distill failed, safe visual fallback:',
            finalPrompt,
          );
        }
      }
      yield {
        type: 'generation',
        status: 'started',
        modality: intent.modality,
        prompt,
        ...(distilledPrompt !== null ? { distilledPrompt } : {}),
        at,
      };
      if (!config) {
        yield {
          type: 'generation',
          status: 'unconfigured',
          modality: intent.modality,
          message: `尚未启用${intent.modality === 'image' ? '图像' : intent.modality === 'video' ? '视频' : '语音'}模型——到模型配置添加并启用后，再说一次即可生成。`,
          at: new Date().toISOString(),
        };
        return;
      }
      // 进度透传：提供方轮询回调推入队列，
      // 本循环每 400ms drain 一次并随流输出
      // progress 事件——视频生成耗时数十秒
      // 至数分钟，呈现层据此展示进度条。
      const progressQueue: number[] = [];
      const artifactPromise = GENERATION_CALLS[intent.modality](
        config,
        finalPrompt,
        (progress) => {
          progressQueue.push(progress);
        },
        // 创作参数（画幅 / 时长——前端创作参数条透传；
        // 缺省 undefined 保持提供方默认行为）。
        { aspectRatio: intent.aspectRatio, seconds: intent.seconds },
      );
      let artifact: Awaited<typeof artifactPromise>;
      let generationError: unknown;
      let settled = false;
      while (!settled) {
        while (progressQueue.length > 0) {
          const progress = progressQueue.shift();
          if (progress !== undefined) {
            yield {
              type: 'generation',
              status: 'progress',
              modality: intent.modality,
              progress,
              at: new Date().toISOString(),
            };
          }
        }
        settled = await Promise.race([
          artifactPromise.then(
            () => true,
            (error: unknown) => {
              generationError = error;
              return true;
            },
          ),
          new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), 400);
          }),
        ]);
      }
      if (generationError !== undefined) {
        throw generationError;
      }
      artifact = await artifactPromise;
      yield {
        type: 'generation',
        status: 'completed',
        modality: intent.modality,
        ...(artifact.url !== undefined ? { url: artifact.url } : {}),
        ...(artifact.dataUri !== undefined ? { dataUri: artifact.dataUri } : {}),
        mime: artifact.mime,
        at: new Date().toISOString(),
      };
    } catch (error) {
      // 人性化文案（体验流 / 直接生成共用同一纪律——
      // 见 humanizeGenerationFailure）。
      const message = humanizeGenerationFailure(error, intent.modality);
      console.error('[withGeneration] generation failed:', message);
      yield { type: 'generation', status: 'failed', modality: intent.modality, message, at: new Date().toISOString() };
    }
}

/**
 * 创作参数抽取（专业生产能力——画幅 / 视频时长随请求
 * 透传到生成网关）：白名单校验，非法值静默忽略——
 * 参数是增强项，绝不影响对话主轴。
 */
const ASPECT_RATIO_VALUES = new Set(['16:9', '9:16', '1:1']);
const VIDEO_SECONDS_VALUES = new Set(['4', '6', '8', '12']);

function extractCreationParams(body: {
  aspect_ratio?: unknown;
  seconds?: unknown;
  reference_images?: unknown;
}): GenerationOptions {
  const options: GenerationOptions = {};
  if (
    typeof body.aspect_ratio === 'string' &&
    ASPECT_RATIO_VALUES.has(body.aspect_ratio)
  ) {
    options.aspectRatio = body.aspect_ratio as GenerationOptions['aspectRatio'];
  }
  if (typeof body.seconds === 'string' && VIDEO_SECONDS_VALUES.has(body.seconds)) {
    options.seconds = body.seconds as GenerationOptions['seconds'];
  }
  // 参考图（图生图）：dataURI 白名单校验——仅 data:image/、
  // 单张 ≤1.5MB、至多 3 张；非法项静默丢弃。
  if (Array.isArray(body.reference_images)) {
    const refs = body.reference_images
      .filter(
        (item): item is string =>
          typeof item === 'string' &&
          item.startsWith('data:image/') &&
          item.length <= 1_500_000,
      )
      .slice(0, 3);
    if (refs.length > 0) options.referenceImages = refs;
  }
  return options;
}

/** 运行时错误 → JSON 错误响应（与 Route Handler 错误形态一致）。 */
function runtimeErrorResponse(error: RuntimeError): HandlerResult {
  return jsonResponse(error.status, {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    ...(error.details ? { details: error.details } : {}),
  });
}

/**
 * S2/S3 执行形态（S3b——纯暴露层）：经同一运行时实例执行
 * 真实运行路径。experience_id + state_version 定位既有
 * 体验（跨会话分支操作 / 续轮提交）；缺省时经
 * resolveIntent → startExperience 建立新体验并提交首轮。
 */
async function handleExecutionForm(
  body: {
    request_id?: unknown;
    session_id?: unknown;
    user_input?: unknown;
    experience_id?: unknown;
    state_version?: unknown;
    semantic_action?: unknown;
    aspect_ratio?: unknown;
    seconds?: unknown;
  },
  input: StreamRequestInput,
): Promise<HandlerResult> {
  const runtime = input.runtime ?? getServerRuntime();
  const requestId =
    typeof body.request_id === 'string' && body.request_id.length > 0 ? body.request_id : null;
  const sessionId =
    typeof body.session_id === 'string' && body.session_id.length > 0 ? body.session_id : null;
  const userInput =
    typeof body.user_input === 'string' && body.user_input.length > 0 ? body.user_input : null;
  if (requestId === null || sessionId === null || userInput === null) {
    return jsonResponse(400, {
      code: 'INVALID_REQUEST',
      message: '请求缺了必要字段——请刷新页面再试一次。',
      error: 'INVALID_REQUEST',
      reason: 'request_id, session_id and user_input are required non-empty strings',
    });
  }
  const experienceId =
    typeof body.experience_id === 'string' && body.experience_id.length > 0 ? body.experience_id : null;
  const stateVersion =
    typeof body.state_version === 'number' && Number.isInteger(body.state_version) ? body.state_version : null;
  const declaredAction =
    typeof body.semantic_action === 'string' && body.semantic_action.length > 0 ? body.semantic_action : null;
  // 创作参数（专业生产能力——画幅 / 视频时长，白名单外静默忽略）。
  const creationParams = extractCreationParams(body);

  // 既有体验提交（含跨会话分支操作——S3a D-2：新会话经
  // experience_id + state_version 对持久分支记录显式操作，
  // 会话绑定放宽仅限分支操作路径——运行时内校验）。
  if (experienceId !== null && stateVersion !== null) {
    const classification = classifyInput(userInput);
    const generation = recognizeGenerationIntent(userInput);
    // 生成意图确定性路由（暴露层——与记忆操作同一
    // 纪律）：语义动作词表未命中时按生成意图路由——
    // 呈现形式类（useContext，如「用视频展现」）路由
    // 为 REPEAT（重放上一轮回答——呈现层重放恰好
    // 提供生成提示词的内容原料）；带创作主题的
    // （如「做一段深海雾气的视频」）路由为 CREATE；
    // 其余自由文本兜底 DIRECT_ANSWER（LLM 会话承接
    // ——不再升级拒绝死胡同）。再生成特例：分类为
    // CHANGE_DIRECTION（「换一张图片…」）但生成意图
    // 命中时路由 CREATE（换介质/换一张是对产物的
    // 再生成，非探索方向变更——CHANGE_DIRECTION 在
    // WAITING/CREATION 阶段非法，曾以英文原文报错）。
    // 不发明新语义动作，policy_v2.3.0 词汇表不变。
    const routedClassification =
      classification.semanticAction === 'CHANGE_DIRECTION' && generation !== null
        ? 'CREATE'
        : classification.semanticAction;
    const semanticAction =
      declaredAction ??
      (routedClassification !== 'UNKNOWN'
        ? routedClassification
        : generation !== null
          ? (generation.useContext === true ? 'REPEAT' : 'CREATE')
          : 'DIRECT_ANSWER');
    const submission: SubmissionResult = await runtime.submitExperienceEvent({
      experienceId,
      sessionId,
      semanticAction,
      rawInput: userInput,
      expectedStateVersion: stateVersion,
      requestId,
      signal: input.signal,
    });
    if (!submission.ok) {
      // 呈现形式类降级引导：REPEAT 需要上一完成轮
      // 内容（新会话首轮没有可重放的内容）——此时
      // 用户想展现的对象还不存在，给出可行动的
      // 引导而非创建空创作会话。
      if (
        semanticAction === 'REPEAT' &&
        !declaredAction &&
        submission.error.code === 'INVALID_STATE_TRANSITION'
      ) {
        return jsonResponse(400, {
          code: 'INVALID_ACTION',
          message: '还没有可展现的内容——先聊一个话题，再说「用视频 / 图片展现」。',
          error: 'INVALID_ACTION',
          reason: 'presentation intent with no previous content round to present',
        });
      }
      return runtimeErrorResponse(submission.error);
    }
    return ndjsonResponse(
      generation
        ? withGeneration(
            submission.stream,
            { ...generation, ...creationParams },
            input.signal,
            () => runtime.getExperienceTopic(experienceId),
            () => runtime.getExperienceTranscript(experienceId),
            experienceId,
          )
        : submission.stream,
    );
  }

  // 新体验流程：意图解析（分类权威——分支操作词 / 记忆操作 /
  // 长期记忆显式表达均在解析阶段确定性识别）。
  const resolution = await runtime.resolveIntent({
    sessionId,
    rawInput: userInput,
    requestId: `${requestId}#intent`,
  });
  if (!resolution.ok) {
    return runtimeErrorResponse(resolution.error);
  }

  // 记忆操作（WITHDRAW / CORRECT / 长期记忆显式表达写入
  // ——S3a D-1）：无体验轴动作——NDJSON 单行结果 + done。
  if (resolution.action === 'memory_operation') {
    const encoder = new TextEncoder();
    const result = resolution;
    const streamBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: 'submission',
              accepted: true,
              session_id: sessionId,
              request_id: requestId,
              intent_id: result.intent.intentId,
              memory_operation: result.memoryOperation ?? null,
              at: new Date().toISOString(),
            })}\n`,
          ),
        );
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'done', at: new Date().toISOString() })}\n`));
        controller.close();
      },
    });
    return { status: 200, headers: NDJSON_HEADERS, body: streamBody };
  }

  // 生成意图（确定性规则识别——运行时意图解析
  // 已将分类未命中的生成输入确定性路由为 CREATE
  // 创作体验——与 WHAT_IF 首轮自动 CREATE 同一
  // 先例，不发明语义动作）。
  const generation = recognizeGenerationIntent(userInput);

  // 体验建立 + 首轮提交（创作会话路由 / WHAT_IF 首轮自动
  // CREATE 分支——与进程内路径完全一致；无法归类的自由
  // 文本已在 resolveIntent 兜底为 DIRECT_ANSWER）。
  const started = await runtime.startExperience({
    sessionId,
    intentId: resolution.intent.intentId,
    requestId: `${requestId}#experience`,
  });
  if (!started.ok) {
    return runtimeErrorResponse(started.error);
  }
  const routedSemanticAction =
    declaredAction ?? resolution.semanticAction;
  const submission: SubmissionResult = await runtime.submitExperienceEvent({
    experienceId: started.experienceId,
    sessionId,
    semanticAction: routedSemanticAction,
    rawInput: userInput,
    expectedStateVersion: started.stateVersion,
    requestId: `${requestId}#event`,
    signal: input.signal,
  });
  if (!submission.ok) {
    return runtimeErrorResponse(submission.error);
  }
  // 系列规划触发：无生成意图但用户显式要求系列化产出
  // （角色设定 / 分集 / 短剧）——流末结构化为可执行计划。
  const planTriggered =
    generation === null && SERIES_PLAN_PATTERN.test(userInput);
  const runPlan = planTriggered
    ? async (answerText: string): Promise<SeriesPlan | null> => {
        const textConfig = await getEnabledProviderConfig().catch(() => null);
        if (!textConfig) return null;
        const plan = await planSeries(textConfig, { userInput, answerText });
        if (plan) {
          console.log(
            `[withSeriesPlanning] series plan: ${plan.title}（${plan.characters.length} 角色 / ${plan.episodes.length} 集）`,
          );
        }
        return plan;
      }
    : null;
  return ndjsonResponse(
    generation
      ? withGeneration(
          submission.stream,
          { ...generation, ...creationParams },
          input.signal,
          () => runtime.getExperienceTopic(started.experienceId),
          () => runtime.getExperienceTranscript(started.experienceId),
          started.experienceId,
        )
      : runPlan
        ? withSeriesPlanning(submission.stream, runPlan, input.signal)
        : submission.stream,
  );
}

export async function handleExperienceStreamRequest(
  input: StreamRequestInput,
): Promise<HandlerResult> {
  if (input.method !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return jsonResponse(400, { code: 'INVALID_JSON_BODY', message: '请求格式有问题——请刷新页面再试一次。', error: 'INVALID_JSON_BODY' });
  }

  const body = parsed as {
    semanticAction?: unknown;
    request_id?: unknown;
    session_id?: unknown;
    user_input?: unknown;
    experience_id?: unknown;
    state_version?: unknown;
    semantic_action?: unknown;
    aspect_ratio?: unknown;
    seconds?: unknown;
  };

  // S2/S3 执行形态判定（S3b）：会话上下文三要素齐备
  // （request_id + session_id + user_input）→ 运行时执行
  // 路径；否则为 S1 fixture 形态（semanticAction 直送）。
  const executionForm =
    typeof body.request_id === 'string' &&
    body.request_id.length > 0 &&
    typeof body.session_id === 'string' &&
    body.session_id.length > 0 &&
    typeof body.user_input === 'string' &&
    body.user_input.length > 0;
  if (executionForm) {
    return handleExecutionForm(body, input);
  }

  const semanticAction = body.semanticAction;
  if (typeof semanticAction !== 'string' || semanticAction.length === 0) {
    return jsonResponse(400, {
      code: 'MISSING_SEMANTIC_ACTION',
      message: '请求缺了必要字段——请刷新页面再试一次。',
      error: 'MISSING_SEMANTIC_ACTION',
    });
  }

  const policy = resolvePolicy(semanticAction);
  if (!policy.ok) {
    return jsonResponse(400, {
      code: policy.code,
      message: '这个操作目前还不支持——请从界面上的选项里选择。',
      error: policy.code,
      semanticAction,
      reason: 'action is not in the S1 frozen policy set; undefined semantics are escalated, not implemented',
    });
  }

  // 策略 STOP（S1 硬边界）立即终止，无内容分块，不需要内容语料。
  // 语义空缺（C3 G-1…G-7）不在此补写：冻结表之外的动作已在上方拒绝。
  const stopFixture: ChunkFixture = {
    fixtureId: 'synthetic/stop/v1',
    semanticAction: policy.semanticAction,
    policyAction: 'STOP',
    chunks: [],
  };
  const fixtureResolution: ChunkResolution =
    policy.policyAction === 'STOP'
      ? { ok: true, fixture: stopFixture }
      : loadChunkFixture(policy.semanticAction);
  if (!fixtureResolution.ok) {
    return jsonResponse(500, { error: fixtureResolution.code, semanticAction });
  }
  const fixture = fixtureResolution.fixture;

  const encoder = new TextEncoder();
  const audit = input.audit;
  const signal = input.signal;

  const streamBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of createExperienceStream({
          semanticAction: policy.semanticAction,
          policyAction: policy.policyAction,
          fixtureId: fixture.fixtureId,
          chunks: fixture.chunks,
          signal,
          chunkDelayMs: 40,
          audit,
        })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });

  return {
    status: 200,
    headers: NDJSON_HEADERS,
    body: streamBody,
  };
}
