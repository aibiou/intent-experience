/**
 * HTTP 形态的运行时单例（Next.js 服务器进程内唯一）。
 *
 * 2026-10-14 统一重构：取消合成回退——无已配置的真实模型时，
 * 运行时不假装回答，明确进入 MODEL_NOT_CONFIGURED 状态。
 *
 * 配置优先级：
 * 1. 证据注入缝（EXPERIENCE_LLM_GATEWAY_SEAM=1——仅证据/测试环境）
 * 2. 页面持久化配置（data/config/provider-configs.json——经 /config 管理）
 * 3. 环境变量配置（EXPERIENCE_LLM_MODE=provider）
 * 4. 无配置 → undefined（运行时进入 MODEL_NOT_CONFIGURED）
 *
 * 不再有合成网关回退。没有真实模型能力 = 产品诚实告知用户。
 */

import { ExperienceRuntime } from './runtime';
import {
  EvidenceFaultLlmGateway,
  ProviderLlmGateway,
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
 * 解析服务端 LLM 网关。
 *
 * 优先级：证据注入缝 > 页面持久化配置 > 环境变量 > 无配置(undefined)。
 *
 * 无配置时返回 undefined——运行时据此进入 MODEL_NOT_CONFIGURED 状态，
 * 不回退合成网关，不假装回答。
 */
function resolveServerGateway(): LlmGateway | undefined {
  // 证据注入缝（仅证据/测试环境——最高优先级）。
  if (process.env.EXPERIENCE_LLM_GATEWAY_SEAM === '1') {
    return new EvidenceFaultLlmGateway(allFixtures());
  }

  // 页面持久化配置（经 /config 页面管理——用户配置的真实模型）。
  if (hasEnabledPersistedConfigSync()) {
    return new PersistedConfigLlmGateway();
  }

  // 环境变量配置（S5A 形态——经 EXPERIENCE_LLM_MODE=provider 启用）。
  const providerConfig = loadProviderGatewayConfig();
  if (providerConfig) {
    return new ProviderLlmGateway(providerConfig);
  }

  // 无任何配置——返回 undefined，运行时进入 MODEL_NOT_CONFIGURED。
  // 不回退合成网关，不假装回答。
  return undefined;
}

/**
 * 页面持久化配置委托网关——每次调用解析当前启用的持久化配置，
 * 构造 ProviderLlmGateway 发起真实 API 调用。
 *
 * 无启用配置时抛出 MODEL_NOT_CONFIGURED 错误——不回退合成。
 */
class PersistedConfigLlmGateway implements LlmGateway {
  async propose(request: LlmRequest): Promise<LlmProposal> {
    const persisted = await getEnabledProviderConfig();
    if (!persisted) {
      // 没有真实模型配置——不假装回答。
      throw new Error('MODEL_NOT_CONFIGURED: 未配置文本模型——请前往 /config 页面配置并启用模型');
    }
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

  /**
   * 增量流式能力：有启用持久化配置时返回真流式委托
   * （ProviderLlmGateway.proposeStream——SSE delta 逐片产出）；
   * 无启用配置时返回 undefined（运行期经可选方法存在性判定
   * 回退静态路径——进入 MODEL_NOT_CONFIGURED）。
   */
  get proposeStream(): ((request: LlmRequest) => AsyncIterable<string>) | undefined {
    if (!hasEnabledPersistedConfigSync()) {
      return undefined;
    }
    return async function* (request: LlmRequest): AsyncIterable<string> {
      const persisted = await getEnabledProviderConfig();
      if (!persisted) {
        // 配置于判定后禁用（竞态）——失败上抛，由运行期
        // 按流中断处理（不静默回退）。
        throw new Error(
          'MODEL_NOT_CONFIGURED: 未配置文本模型——配置已被禁用',
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
// 热重载会重求值本模块——模块级变量随重置，globalThis
// 不随重置。挂载于此，热重载后 Session / Experience / 内存
// 创作会话跨请求保持连续。
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
