/**
 * LLM 网关（S1-07；S1 规范 §16/§17）。
 *
 * LLM Request 必须结构化（§16）；LLM Response 必须是 Proposal（§16）。
 * LLM 禁止动作（§17）：不得写 ExperienceState / 决定 STOP 或 CHANGE 是否
 * 有效 / 修改 Policy / 写 Memory / 决定 Completion / 自动启动下一体验 /
 * 修改 State Version / 写 Analytics Truth。
 *
 * 治理约束（ADR-0002 §3 边界在实施阶段持续有效）：
 * - 合成模式：网关从合成语料 fixture 生成提案，不调用任何真实 LLM
 *   提供方；真实提供方接入须另经产品决策与隐私六要素批准。
 * - 网关接口是证据注入点：GS-06 证据（进程内形态）经同一接口注入
 *   带越权 state_update 的脚本化提案，验证真实验证器与运行时拒绝路径。
 */

import type { PolicyAction, SemanticAction } from './policy';
import type { ChunkFixture } from './chunks';

export interface LlmRequest {
  request_id: string;
  session_id: string;
  experience_id: string;
  intent: unknown;
  experience_state: unknown;
  semantic_action: SemanticAction;
  allowed_action: PolicyAction;
  context: unknown;
  /** 创作对象摘要（可选——创作域轮次注入：模型据此理解
   * 当前作品的主体结构，修改 / 预览轮输出贴合对象本身）。 */
  creation?: CreationLlmSummary;
  /** 取消信号（可选——增量流式形态经此中止上游连接；S5A v1.2.0）。 */
  signal?: AbortSignal;
  /** 图像 URL 列表（可选——Agnes 3.0 Flash 多模态输入：
   * 用户可在对话中附带图片 URL，模型理解图像内容后
   * 生成回应。docs/agnes-30-flash §图像 URL 输入）。 */
  imageUrls?: string[];
}

/** 创作对象 LLM 摘要（九分量的紧凑形态——结构化字段
 * 确定性渲染进用户消息，模型无需猜测作品内容）。 */
export interface CreationLlmSummary {
  theme: string;
  coreMechanic: string;
  goal: string;
  version: number;
  objects: string[];
  rules: string[];
  interactions: string[];
  presentation: string;
}

export interface LlmProposal {
  proposal_id: string;
  content: string;
  state_update_proposal: Record<string, unknown>;
  confidence: number;
}

export interface LlmGateway {
  propose(request: LlmRequest): Promise<LlmProposal>;
  /**
   * 增量流式提案（S5A-SEMANTIC-FREEZE-01 v1.2.0 / CR-38）：
   * 内容增量逐片产出（提供方 SSE delta）——运行期经此路径
   * 增量产出 chunk 事件（真流式呈现）。默认实现委托
   * propose()（合成 / 故障注入网关——单次完整内容，行为
   * 零变化）；提供方网关覆写为真流式（请求体 stream:true）。
   */
  proposeStream?(request: LlmRequest): AsyncIterable<string>;
}

/**
 * 证据故障注入网关（S2a F-1 / OBL-01；CR-18 选项 A 形态）。
 *
 * 仅经 server-runtime.ts 的环境门控注入缝构造
 * （EXPERIENCE_LLM_GATEWAY_SEAM === '1'），只服务于证据 / 测试环境：
 * - mode=unavailable（默认）：每次调用均失败（上游不可用形态）；
 * - mode=fail_once：首次调用失败，后续调用委托合成网关（有界恢复形态）。
 * - mode=succeed_once：首次调用委托合成网关，后续调用均失败
 *   （成功后故障形态——支撑“失败后 STOP 合法”证据：WHY 成功后
 *   再次 WHY 失败，体验保持 WAITING，STOP 从 WAITING 合法终止）。
 *
 * 失败以异常向上抛出，由运行时统一捕获并映射为 LLM_UNAVAILABLE
 * （HTTP 503，retryable=true）。默认合成模式不经过本网关。
 */
export class EvidenceFaultLlmGateway implements LlmGateway {
  private readonly synthetic: SyntheticLlmGateway;
  private calls = 0;

  constructor(fixtures: Readonly<Record<string, ChunkFixture>>) {
    this.synthetic = new SyntheticLlmGateway(fixtures);
  }

  async propose(request: LlmRequest): Promise<LlmProposal> {
    this.calls += 1;
    const mode = process.env.EXPERIENCE_GATEWAY_FAULT_MODE ?? 'unavailable';
    if (mode === 'fail_once' && this.calls > 1) {
      return this.synthetic.propose(request);
    }
    if (mode === 'succeed_once' && this.calls === 1) {
      return this.synthetic.propose(request);
    }
    throw new Error(
      `llm gateway upstream unavailable (evidence fault injection: mode=${mode}, call=${this.calls})`,
    );
  }
}

let proposalCounter = 0;

/**
 * 提供方接入（S5；S5A-SEMANTIC-FREEZE-01 v1.0.0；S5B-SEMANTIC-FREEZE-01
 * v1.1.0 修订——产品负责人指令 2026-10-10：取消提供方准入登记）。
 *
 * model-agnostic 架构：LlmGateway 接口即提供方抽象层——产品运行时
 * 只依赖接口，不依赖任何提供方实现；提供方身份（provider / model /
 * 参数）经配置注入（环境变量——S5 形态；页面持久化配置——S5B 形态）。
 * 产品代码不写死任何提供方。
 *
 * 提供方配置双形态（S5B-SEMANTIC-FREEZE-01 v1.1.0）：
 * - 预设（PROVIDER_PROFILES）：已验证提供方的构造默认值（端点 / 默认
 *   模型 / 温度 / 系统提示词）——仅作表单预设与缺省回退，非准入清单，
 *   非产品写死；环境变量形态（S5A）仍经此解析。
 * - 自定义（页面配置）：任何 OpenAI 兼容提供方由用户直接配置
 *   （端点 + 模型 + API key），无需登记——产品经 ProviderLlmGateway
 *   统一构造（OpenAI 兼容协议：/chat/completions + Bearer 鉴权 +
 *   choices[0].message.content 解析）。
 *
 * 隐私纪律（D-5）：提供方启用前须经产品负责人 + 安全负责人隐私再
 * 确认——用户可选集 = 已确认集。API key 仅运行期注入（环境变量或
 * 页面持久化密文解密）：绝不写死、绝不落盘、不进日志、错误信息
 * 不得包含 key。
 */
export interface ProviderLlmConfig {
  provider: string;
  endpoint: string;
  model: string;
  temperature: number;
  apiKey: string;
  systemPrompt: string;
  /** 最大输出 Token 数（Agnes 3.0 Flash 官方 max_tokens 参数；
   * 缺省 undefined——由提供方默认决定）。 */
  maxTokens?: number;
  /** 核采样参数（Agnes 3.0 Flash 官方 top_p 参数；
   * 缺省 undefined——由提供方默认决定）。 */
  topP?: number;
  /** Thinking 模式（Agnes 3.0 Flash 官方 chat_template_kwargs.enable_thinking；
   * true 时启用更充分的任务拆解与推理——缺省 false）。 */
  enableThinking?: boolean;
}

/** 自定义提供方缺省值（预设未覆盖时——S5B-SEMANTIC-FREEZE-01 v1.1.0）。 */
export const DEFAULT_PROVIDER_TEMPERATURE = 0.7;
export const DEFAULT_PROVIDER_SYSTEM_PROMPT =
  '你是个人体验引擎的回应生成器。依据提供的上下文，生成对用户的回应内容。';

/** 已验证提供方预设（S5B v1.1.0 起：预设非准入——自定义配置无需登记）。 */
export const PROVIDER_PROFILES: Readonly<
  Record<string, { endpoint: string; defaultModel: string; temperature: number; systemPrompt: string }>
> = {
  dashscope: {
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    temperature: DEFAULT_PROVIDER_TEMPERATURE,
    systemPrompt: DEFAULT_PROVIDER_SYSTEM_PROMPT,
  },
  volcengine: {
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-seed-2-0-lite-260428',
    temperature: DEFAULT_PROVIDER_TEMPERATURE,
    systemPrompt: DEFAULT_PROVIDER_SYSTEM_PROMPT,
  },
  'doubao-voice': {
    endpoint: 'https://openspeech.bytedance.com',
    defaultModel: 'seed-audio-1.0',
    temperature: DEFAULT_PROVIDER_TEMPERATURE,
    systemPrompt: DEFAULT_PROVIDER_SYSTEM_PROMPT,
  },
};

let providerProposalCounter = 0;

/**
 * 提供方提案 id 分配（与 propose() / 流式形态共享计数——
 * S5A-SEMANTIC-FREEZE-01 v1.2.0 / CR-38）：运行期流式
 * 路径于流末构造提案时经此分配（propose() 与 proposeStream
 * 路径 id 不重复）。
 */
export function nextProviderProposalId(): string {
  providerProposalCounter += 1;
  return `proposal_provider_${String(providerProposalCounter).padStart(4, '0')}`;
}

export class ProviderLlmGateway implements LlmGateway {
  private readonly config: ProviderLlmConfig;
  private calls = 0;

  constructor(config: ProviderLlmConfig) {
    this.config = config;
  }

  /** 请求 URL 构造（端点容错——S5B-SEMANTIC-FREEZE-01 v1.3.0）：
   * 用户经常填写提供方文档中的 API Base（如 https://api.example.com/v1）；
   * 缺 /chat/completions 后缀时自动补全——已含后缀的端点原样使用
   * （预设端点形态不变，零行为变化）。 */
  private get requestUrl(): string {
    const endpoint = this.config.endpoint.replace(/\/+$/, '');
    return endpoint.endsWith('/chat/completions')
      ? endpoint
      : `${endpoint}/chat/completions`;
  }

  async propose(request: LlmRequest): Promise<LlmProposal> {
    this.calls += 1;
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: renderProviderUserMessage(request) },
      ],
      temperature: this.config.temperature,
    };
    // Agnes 3.0 Flash 官方可选参数（docs/agnes-30-flash）。
    if (this.config.maxTokens !== undefined) {
      body.max_tokens = this.config.maxTokens;
    }
    if (this.config.topP !== undefined) {
      body.top_p = this.config.topP;
    }
    if (this.config.enableThinking === true) {
      body.chat_template_kwargs = { enable_thinking: true };
    }
    // 多模态图像 URL 输入（docs/agnes-30-flash §图像 URL 输入）：
    // 有 imageUrls 时 user content 改为数块格式
    // （text + image_url），让模型理解图像内容。
    const userText = renderProviderUserMessage(request);
    const imageUrls = request.imageUrls ?? [];
    if (imageUrls.length > 0) {
      const content: Array<Record<string, unknown>> = [
        { type: 'text', text: userText },
      ];
      for (const url of imageUrls) {
        content.push({ type: 'image_url', image_url: { url } });
      }
      (body.messages as Array<Record<string, unknown>>)[1] = {
        role: 'user',
        content,
      };
    }
    let response: Response;
    try {
      response = await fetch(this.requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      // 网络故障：自动重试一次（上游波动 / 冷启动 / 瞬态超时）。
      this.calls += 1;
      console.warn(
        `[ProviderLlmGateway] propose connect failed, retrying once (provider=${this.config.provider}, call=${this.calls - 1}):`,
        (error as Error)?.message ?? error,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        response = await fetch(this.requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (retryError) {
        // 错误信息仅含 provider / 调用计数——不含 key、不含请求体。
        throw new Error(
          `llm provider upstream network failure (provider=${this.config.provider}, call=${this.calls}): ${(retryError as Error)?.message ?? ''}`,
        );
      }
    }
    if (!response.ok) {
      throw new Error(
        `llm provider upstream failed (provider=${this.config.provider}, status=${response.status}, call=${this.calls})`,
      );
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new Error(
        `llm provider response malformed (provider=${this.config.provider}, call=${this.calls}: non-JSON body)`,
      );
    }
    const content = extractProviderContent(parsed);
    if (content === undefined) {
      throw new Error(
        `llm provider response malformed (provider=${this.config.provider}, call=${this.calls}: missing choices[0].message.content)`,
      );
    }
    return {
      proposal_id: nextProviderProposalId(),
      content,
      // LLM 禁止动作（SRC-06 §17）：提供方不提案状态写入——恒空对象。
      state_update_proposal: {},
      // 提供方未返回结构化置信字段——映射为固定值 1.0（与合成模式一致；未来经版本化修订）。
      confidence: 1,
    };
  }

  /**
   * 增量流式提案（S5A-SEMANTIC-FREEZE-01 v1.2.0 / CR-38）：
   * 请求体增 stream:true（chat-completions 兼容 SSE 流式
   * 形态）；响应经 data: 行逐片解析（choices[0].delta
   * .content），[DONE] 终止。失败映射与 propose() 同纪律
   * （错误信息仅含 provider / 状态码 / 调用计数——不含
   * key、不含请求体）。取消：request.signal 中止上游连接。
   */
  async *proposeStream(request: LlmRequest): AsyncIterable<string> {
    this.calls += 1;
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: renderProviderUserMessage(request) },
      ],
      temperature: this.config.temperature,
      stream: true,
    };
    // Agnes 3.0 Flash 官方可选参数（docs/agnes-30-flash）。
    if (this.config.maxTokens !== undefined) {
      body.max_tokens = this.config.maxTokens;
    }
    if (this.config.topP !== undefined) {
      body.top_p = this.config.topP;
    }
    if (this.config.enableThinking === true) {
      body.chat_template_kwargs = { enable_thinking: true };
    }
    // 多模态图像 URL 输入（docs/agnes-30-flash §图像 URL 输入）：
    // 有 imageUrls 时 user content 改为数块格式
    // （text + image_url），让模型理解图像内容。
    const userText = renderProviderUserMessage(request);
    const imageUrls = request.imageUrls ?? [];
    if (imageUrls.length > 0) {
      const content: Array<Record<string, unknown>> = [
        { type: 'text', text: userText },
      ];
      for (const url of imageUrls) {
        content.push({ type: 'image_url', image_url: { url } });
      }
      (body.messages as Array<Record<string, unknown>>)[1] = {
        role: 'user',
        content,
      };
    }
    let response: Response;
    try {
      response = await fetch(this.requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (error) {
      // 取消（信号中止）不重试——运行期按信号状态区分
      // （取消产出 cancelled 事件）。
      if (request.signal?.aborted) {
        throw new Error(
          `llm provider upstream cancelled (provider=${this.config.provider}, call=${this.calls})`,
        );
      }
      // 网络故障：自动重试一次（上游波动 / 冷启动 / 瞬态超时）。
      // 仅在连接阶段重试——SSE 读取阶段不重试（部分内容已
      // 产出，重试会导致内容重复）。重试间隔 1 秒（退避）。
      this.calls += 1;
      console.warn(
        `[ProviderLlmGateway] stream connect failed, retrying once (provider=${this.config.provider}, call=${this.calls - 1}):`,
        (error as Error)?.message ?? error,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        response = await fetch(this.requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: request.signal,
        });
      } catch (retryError) {
        if (request.signal?.aborted) {
          throw new Error(
            `llm provider upstream cancelled (provider=${this.config.provider}, call=${this.calls})`,
          );
        }
        throw new Error(
          `llm provider upstream network failure (provider=${this.config.provider}, call=${this.calls}): ${(retryError as Error)?.message ?? ''}`,
        );
      }
    }
    if (!response.ok) {
      throw new Error(
        `llm provider upstream failed (provider=${this.config.provider}, status=${response.status}, call=${this.calls})`,
      );
    }
    if (!response.body) {
      throw new Error(
        `llm provider response malformed (provider=${this.config.provider}, call=${this.calls}: no response body stream)`,
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (line.length === 0 || !line.startsWith('data:')) continue;
        const data = line.slice('data:'.length).trim();
        if (data === '[DONE]') return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          throw new Error(
            `llm provider response malformed (provider=${this.config.provider}, call=${this.calls}: non-JSON SSE data)`,
          );
        }
        const delta = extractProviderDelta(parsed);
        if (delta !== undefined && delta.length > 0) {
          yield delta;
        }
      }
    }
  }
}

function extractProviderContent(parsed: unknown): string | undefined {
  if (parsed === null || typeof parsed !== 'object') {
    return undefined;
  }
  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const first = choices[0];
  if (first === null || typeof first !== 'object') {
    return undefined;
  }
  const message = (first as { message?: unknown }).message;
  if (message === null || typeof message !== 'object') {
    return undefined;
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : undefined;
}

/** SSE 流式增量解析（choices[0].delta.content——S5A v1.2.0）。 */
function extractProviderDelta(parsed: unknown): string | undefined {
  if (parsed === null || typeof parsed !== 'object') {
    return undefined;
  }
  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const first = choices[0];
  if (first === null || typeof first !== 'object') {
    return undefined;
  }
  const delta = (first as { delta?: unknown }).delta;
  if (delta === null || typeof delta !== 'object') {
    return undefined;
  }
  const content = (delta as { content?: unknown }).content;
  return typeof content === 'string' ? content : undefined;
}

/**
 * 语义动作 → 用户消息指令行（确定性映射——dock 动作如
 * 「换角度 / 简化」的原始输入不含意图信息，模型据此理解
 * 本轮要做什么；未登记的语义动作不注入该行）。
 */
const SEMANTIC_ACTION_GUIDANCE: Record<string, string> = {
  DIRECT_ANSWER: '直接回答用户的问题或回应用户的输入。',
  WHY: '解释原因与底层机制。',
  WHAT_IF: '展开假设推演，并区分事实 / 推断 / 假设 / 模拟结果。',
  DEEPEN: '在既有话题上向更深处推进一层。',
  SIMPLIFY: '把当前创作对象（或话题）以更简单直白的方式重述——结构保持，表达降阶。',
  REFRAME: '换一个观察视角重述当前创作对象（或话题）——主体不变，视角更新。',
  CREATE: '基于继承的主题与上下文构建创作预览。',
  CONTINUE: '顺着既有上下文继续推进。',
  REPEAT: '重述上一轮的内容要点。',
  CORRECTION: '根据用户的纠正调整上一轮的说法。',
  CHANGE_DIRECTION: '更换探索方向，开启新的话题。',
  STOP: '为本次体验做收束。',
};

/** 创作对象 → 用户消息结构块（确定性渲染）。 */
function renderCreationBlock(creation: CreationLlmSummary): string {
  const lines = [
    '[当前创作对象]',
    `主题：${creation.theme}；核心机制：${creation.coreMechanic}；目标：${creation.goal}；版本：v${creation.version}`,
  ];
  const structure: string[] = [];
  if (creation.objects.length > 0) structure.push(`对象：${creation.objects.join('、')}`);
  if (creation.rules.length > 0) structure.push(`规则：${creation.rules.join('；')}`);
  if (creation.interactions.length > 0) structure.push(`交互：${creation.interactions.join('；')}`);
  if (creation.presentation.length > 0) structure.push(`呈现：${creation.presentation}`);
  if (structure.length > 0) lines.push(structure.join('\n'));
  return lines.join('\n');
}

function renderProviderUserMessage(request: LlmRequest): string {
  // 确定性映射（S5A-SEMANTIC-FREEZE-01 §1 D-2 的超集演化）：
  // LlmRequest.context 为运行时构造的 { raw_input, memory_signals,
  // history? } 形态；缺失该形态时回退 JSON.stringify（防御性兜底）。
  // generation_note 为运行时多模态编排感知注入（可选行）。对话
  // 历史 / 语义动作指令 / 创作对象块随请求注入（连续性 + 创作域
  // 轮次——模型不知道「换角度」「对应的」指什么，必须明说；
  // 确定性拼接，无随机性）。
  const context = request.context;
  const lines: string[] = [];
  if (context !== null && typeof context === 'object' && 'raw_input' in context) {
    const c = context as {
      raw_input: unknown;
      memory_signals?: unknown;
      generation_note?: unknown;
      history?: unknown;
    };
    const note =
      typeof c.generation_note === 'string' && c.generation_note.length > 0
        ? `[系统编排] ${c.generation_note}\n\n`
        : '';
    if (note.length > 0) lines.push(note);
    // 对话历史（连续性）——置于当前输入之前，模型先理解上文
    // 再读本轮；指代（「对应的」「它」）由此可解。
    if (Array.isArray(c.history) && c.history.length > 0) {
      lines.push('[对话历史]');
      for (const turn of c.history as Array<{ role?: unknown; text?: unknown }>) {
        const who = turn.role === 'user' ? '用户' : '助手';
        lines.push(`${who}：${String(turn.text ?? '')}`);
      }
      lines.push('（以上为更早轮次——理解用户的指代与本轮意图时参考）');
      lines.push('');
    }
    lines.push(String(c.raw_input));
    lines.push('[memory_signals]');
    lines.push(JSON.stringify(c.memory_signals ?? []));
  } else {
    lines.push(JSON.stringify(context ?? null));
  }
  const guidance = SEMANTIC_ACTION_GUIDANCE[request.semantic_action];
  if (guidance !== undefined) {
    lines.push(`[语义动作] ${request.semantic_action}——${guidance}`);
  }
  if (request.creation !== undefined) {
    lines.push(renderCreationBlock(request.creation));
  }
  return lines.join('\n');
}

/**
 * 经环境变量解析 LLM 模式配置（server-runtime 注入缝调用）。
 *
 * - EXPERIENCE_LLM_MODE !== 'provider' → undefined（合成默认——行为零变化）
 * - 未登记提供方 → 抛出（配置不得绕过版本化纪律——拒绝启动并报错）
 * - API key 缺失 → 抛出（不静默回退合成模式——静默回退违背「LLM 模式
 *   已启用」的启用意图）
 */
export function loadProviderGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProviderLlmConfig | undefined {
  if (env.EXPERIENCE_LLM_MODE !== 'provider') {
    return undefined;
  }
  const provider = env.EXPERIENCE_LLM_PROVIDER ?? '';
  const profile = PROVIDER_PROFILES[provider];
  if (!profile) {
    throw new Error(
      `llm mode enabled but provider not registered (provider=${provider || '(empty)'}; registered: ${Object.keys(PROVIDER_PROFILES).join(', ')})——S5A-SEMANTIC-FREEZE-01 提供方规则未经版本化冻结不得启用`,
    );
  }
  const apiKey = env.EXPERIENCE_LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      'llm mode enabled but EXPERIENCE_LLM_API_KEY missing——API key 仅运行期环境变量注入；缺失时拒绝启动（不静默回退合成模式）',
    );
  }
  return {
    provider,
    endpoint: profile.endpoint,
    model: env.EXPERIENCE_LLM_MODEL ?? profile.defaultModel,
    temperature: profile.temperature,
    apiKey,
    systemPrompt: profile.systemPrompt,
  };
}

/**
 * 合成网关：按语义动作返回合成语料提案。
 * state_update_proposal 恒为空对象——合成模式下模型从不提案状态写入
 * （越权提案只能经证据注入的脚本化网关产生，以测试拒绝路径）。
 */
export class SyntheticLlmGateway implements LlmGateway {
  private readonly fixtures: Readonly<Record<string, ChunkFixture>>;

  constructor(fixtures: Readonly<Record<string, ChunkFixture>>) {
    this.fixtures = fixtures;
  }

  async propose(request: LlmRequest): Promise<LlmProposal> {
    const fixture = this.fixtures[request.semantic_action];
    if (!fixture) {
      // 调用方（运行时）已在策略层拒绝表外动作；此处为防御性兜底。
      throw new Error(`no synthetic fixture for semantic action: ${request.semantic_action}`);
    }
    proposalCounter += 1;
    return {
      proposal_id: `proposal_synthetic_${String(proposalCounter).padStart(4, '0')}`,
      content: fixture.chunks.join(''),
      state_update_proposal: {},
      confidence: 1,
    };
  }
}
