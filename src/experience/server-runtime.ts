/**
 * HTTP 形态的运行时单例（Next.js 服务器进程内唯一）。
 *
 * 路由处理器（app/api/**）通过 getServerRuntime() 取得同一实例，
 * 使跨请求的状态（Session / Experience / StateStore / generation epoch）
 * 在单个服务器进程内一致。事件汇与决策追踪汇由环境变量注入路径：
 * - EXPERIENCE_EVENT_LOG：C6 事件流（NDJSON）
 * - EXPERIENCE_DECISION_TRACE_LOG：决策追踪（NDJSON，C6 §23 分离）
 * - EXPERIENCE_AUDIT_LOG：流式审计汇（F-1 形态）
 * - EXPERIENCE_LLM_GATEWAY_SEAM：LlmGateway 注入缝（S2a F-1 / OBL-01；
 *   CR-18 选项 A 形态）——仅当值为 '1' 时解析证据故障注入网关
 *   （EvidenceFaultLlmGateway，源语料与合成模式相同）；未设置时
 *   运行时保持默认合成网关，行为与 S1 完全一致（SEAM-INERT 不变式）
 * - EXPERIENCE_LLM_MODE：LLM 模式（S5；S5A-SEMANTIC-FREEZE-01
 *   v1.0.0）——值为 'provider' 时经 loadProviderGatewayConfig 解析
 *   提供方配置（环境变量：EXPERIENCE_LLM_PROVIDER / EXPERIENCE_LLM_MODEL
 *   / EXPERIENCE_LLM_API_KEY）并构造 ProviderLlmGateway（model-agnostic
 *   提供方抽象——LlmGateway 接口实现）；未登记提供方或 API key 缺失
 *   时拒绝启动并报错（不静默回退合成模式）。无该变量时运行时保持
 *   默认合成网关——行为与 S1–S4 完全一致。证据注入缝（上一条）
 *   优先于 LLM 模式。
 * - 页面持久化配置（S5B；S5B-CONFIG-SURFACE-PROPOSAL-01 裁决
 *   选项 A——产品负责人指令 2026-10-10）：运行时配置解析优先级
 *   为证据注入缝 > 页面持久化配置 > 环境变量 > 合成默认。持久化
 *   配置经 PersistedConfigLlmGateway 委托网关每次调用解析——用户
 *   在配置面启用 / 禁用 / 删除提供方配置即时生效（单进程内存缓存，
 *   无需重启）；无启用配置时委托合成网关，行为与 S1–S4 默认形态
 *   完全一致（SEAM-INERT 不变式保持）。
 * - EXPERIENCE_GATEWAY_FAULT_MODE：注入网关故障形态——
 *   'unavailable'（默认，每次调用均失败）/ 'fail_once'（首次失败，
 *   后续委托合成网关）
 *   / 'succeed_once'（首次委托合成网关，后续均失败——
 *   成功后故障形态，支撑“失败后 STOP 合法”证据）
 *
 * 进程内证据形态由执行器直接构造 ExperienceRuntime 并注入内存汇，
 * 不经本模块。
 */

import { ExperienceRuntime } from './runtime';
import {
  EvidenceFaultLlmGateway,
  ProviderLlmGateway,
  SyntheticLlmGateway,
  loadProviderGatewayConfig,
  type LlmGateway,
  type LlmProposal,
  type LlmRequest,
} from './llm-gateway';
import { getEnabledProviderConfig, hasEnabledPersistedConfigSync } from './config-store';
import { readMemoryIndexSync, writeMemoryIndex } from './memory-persistence';
import { allFixtures } from './chunks';
import { createServerEventSink, serverEventLogPath } from './events';
import {
  createServerDecisionTraceSink,
  serverDecisionTraceLogPath,
} from './decision-trace';
import { createServerAuditSink, serverAuditLogPath } from './audit';

/**
 * 解析服务端 LLM 网关（OBL-01 注入缝；S5 LLM 模式；S5B 页面
 * 持久化配置）。
 * 优先级：EXPERIENCE_LLM_GATEWAY_SEAM === '1'（证据故障注入——
 * 证据 / 测试环境）> 页面持久化配置（S5B——用户页面添加的提供方
 * 配置，单条启用）> EXPERIENCE_LLM_MODE === 'provider'（LLM 模式——
 * S5A-SEMANTIC-FREEZE-01）> 合成默认网关。
 *
 * S5B 委托网关（PersistedConfigLlmGateway）：每次调用解析当前
 * 启用的持久化配置——启用 / 禁用 / 删除经配置面即时生效；无启用
 * 配置时委托 SyntheticLlmGateway（与运行时默认构造完全一致——
 * 行为零变化）。环境变量形态保持 S5A 启动期校验语义（仅当无
 * 持久化配置时解析——未登记提供方或 API key 缺失拒绝启动并报错，
 * 不静默回退）。
 */
function resolveServerGateway(): LlmGateway | undefined {
  // 证据注入缝（S2a F-1 / OBL-01——证据 / 测试环境最高优先级）。
  if (process.env.EXPERIENCE_LLM_GATEWAY_SEAM !== '1') {
    // S5B（D-1 选项 A）：页面持久化配置优先于环境变量形态。
    if (hasEnabledPersistedConfigSync()) {
      return new PersistedConfigLlmGateway();
    }
    const providerConfig = loadProviderGatewayConfig();
    if (providerConfig) {
      return new ProviderLlmGateway(providerConfig);
    }
    // 无任何配置时返回委托网关：无启用配置即委托合成网关——
    // 与 S1–S4 默认形态行为完全一致；用户在配置面启用配置后
    // 即时生效（无需重启）。
    return new PersistedConfigLlmGateway();
  }
  return new EvidenceFaultLlmGateway(allFixtures());
}

/**
 * S5B 页面持久化配置委托网关（model-agnostic——按已启用配置
 * 记录的端点直连构造 ProviderLlmGateway；任何 OpenAI 兼容提供方
 * 由用户自定义配置（S5B-SEMANTIC-FREEZE-01 v1.1.0——取消提供方
 * 准入登记，PROVIDER_PROFILES 仅作预设），产品代码不写死任何提供方）。
 */
class PersistedConfigLlmGateway implements LlmGateway {
  private synthetic?: SyntheticLlmGateway;

  async propose(request: LlmRequest): Promise<LlmProposal> {
    const persisted = await getEnabledProviderConfig();
    if (persisted) {
      return new ProviderLlmGateway({
        provider: persisted.provider,
        endpoint: persisted.endpoint,
        model: persisted.model,
        temperature: persisted.temperature,
        apiKey: persisted.apiKey,
        systemPrompt: persisted.systemPrompt,
        ...(persisted.maxTokens !== undefined ? { maxTokens: persisted.maxTokens } : {}),
        ...(persisted.topP !== undefined ? { topP: persisted.topP } : {}),
        ...(persisted.enableThinking !== undefined ? { enableThinking: persisted.enableThinking } : {}),
      }).propose(request);
    }
    this.synthetic ??= new SyntheticLlmGateway(allFixtures());
    return this.synthetic.propose(request);
  }

  /**
   * 增量流式能力（S5A-SEMANTIC-FREEZE-01 v1.2.0 / CR-38）：
   * 随启用配置即时变化——有启用持久化配置时返回真流式
   * 委托（ProviderLlmGateway.proposeStream——SSE delta
   * 逐片产出）；无启用配置时返回 undefined（运行期经
   * 可选方法存在性判定回退静态路径——合成形态行为
   * 零变化，黄金回归不变式）。
   */
  get proposeStream(): ((request: LlmRequest) => AsyncIterable<string>) | undefined {
    if (!hasEnabledPersistedConfigSync()) {
      return undefined;
    }
    return async function* (request: LlmRequest): AsyncIterable<string> {
      const persisted = await getEnabledProviderConfig();
      if (!persisted) {
        // 配置于判定后禁用（竞态）——失败上抛，由运行期
        // 按流中断处理（不静默回退——与失败语义一致）。
        throw new Error(
          'llm provider upstream unavailable (persisted config disabled mid-request)',
        );
      }
      yield* new ProviderLlmGateway({
        provider: persisted.provider,
        endpoint: persisted.endpoint,
        model: persisted.model,
        temperature: persisted.temperature,
        apiKey: persisted.apiKey,
        systemPrompt: persisted.systemPrompt,
        ...(persisted.maxTokens !== undefined ? { maxTokens: persisted.maxTokens } : {}),
        ...(persisted.topP !== undefined ? { topP: persisted.topP } : {}),
        ...(persisted.enableThinking !== undefined ? { enableThinking: persisted.enableThinking } : {}),
      }).proposeStream(request);
    };
  }
}

// 单例挂载于进程级 globalThis（dev 形态存活）：Turbopack
// 热重载会重求值本模块——模块级变量随重置（2026-10-11 实测
// 用户会话在代码编辑后被清空：unknown session），globalThis
// 不随重置。挂载于此，热重载后 Session / Experience / 内存
// 创作会话跨请求保持连续。注意 trade-off：网关构造参数随
// 实例冻结——但 PersistedConfigLlmGateway 每次调用重新解析
// 持久化配置，配置面启用 / 禁用仍即时生效；仅网关类代码
// 本身的修改需完整重启 dev 服务器。
const globalStore = globalThis as { __experienceRuntime?: ExperienceRuntime };

export function getServerRuntime(): ExperienceRuntime {
  if (!globalStore.__experienceRuntime) {
    const gateway = resolveServerGateway();
    globalStore.__experienceRuntime = new ExperienceRuntime({
      eventSink: createServerEventSink(serverEventLogPath()),
      decisionTraceSink: createServerDecisionTraceSink(serverDecisionTraceLogPath()),
      auditSink: createServerAuditSink(serverAuditLogPath()),
      ...(gateway ? { gateway } : {}),
      // 记忆持久化（CR-52——跨进程重启记忆保留）：
      // 启动时从 data/memory/index.json 恢复（文件缺失 /
      // 损坏 → 空数组——不静默损坏运行时）；记忆每次
      // 变更后经写队列原子落盘（写失败仅丢当次持久化——
      // 内存态仍为运行时准）。
      initialMemoryRecords: readMemoryIndexSync(),
      memoryPersist: (records) => {
        void writeMemoryIndex(records).catch(() => undefined);
      },
    });
  }
  return globalStore.__experienceRuntime;
}
