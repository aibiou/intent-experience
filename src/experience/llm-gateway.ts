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
}

export interface LlmProposal {
  proposal_id: string;
  content: string;
  state_update_proposal: Record<string, unknown>;
  confidence: number;
}

export interface LlmGateway {
  propose(request: LlmRequest): Promise<LlmProposal>;
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
};

let providerProposalCounter = 0;

export class ProviderLlmGateway implements LlmGateway {
  private readonly config: ProviderLlmConfig;
  private calls = 0;

  constructor(config: ProviderLlmConfig) {
    this.config = config;
  }

  async propose(request: LlmRequest): Promise<LlmProposal> {
    this.calls += 1;
    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: renderProviderUserMessage(request.context) },
      ],
      temperature: this.config.temperature,
    };
    let response: Response;
    try {
      response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      // 错误信息仅含 provider / 调用计数——不含 key、不含请求体。
      throw new Error(
        `llm provider upstream network failure (provider=${this.config.provider}, call=${this.calls})`,
      );
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
    providerProposalCounter += 1;
    return {
      proposal_id: `proposal_provider_${String(providerProposalCounter).padStart(4, '0')}`,
      content,
      // LLM 禁止动作（SRC-06 §17）：提供方不提案状态写入——恒空对象。
      state_update_proposal: {},
      // 提供方未返回结构化置信字段——映射为固定值 1.0（与合成模式一致；未来经版本化修订）。
      confidence: 1,
    };
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

function renderProviderUserMessage(context: unknown): string {
  // 确定性映射（S5A-SEMANTIC-FREEZE-01 §1 D-2）：LlmRequest.context
  // 为运行时构造的 { raw_input, memory_signals } 形态；缺失该形态时
  // 回退 JSON.stringify（防御性兜底——确定性）。
  if (context !== null && typeof context === 'object' && 'raw_input' in context) {
    const c = context as { raw_input: unknown; memory_signals?: unknown };
    return [String(c.raw_input), '[memory_signals]', JSON.stringify(c.memory_signals ?? [])].join('\n');
  }
  return JSON.stringify(context ?? null);
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
