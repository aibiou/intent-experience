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
  loadProviderGatewayConfig,
  type LlmGateway,
} from './llm-gateway';
import { allFixtures } from './chunks';
import { createServerEventSink, serverEventLogPath } from './events';
import {
  createServerDecisionTraceSink,
  serverDecisionTraceLogPath,
} from './decision-trace';
import { createServerAuditSink, serverAuditLogPath } from './audit';

/**
 * 解析服务端 LLM 网关（OBL-01 注入缝；S5 LLM 模式）。
 * 优先级：EXPERIENCE_LLM_GATEWAY_SEAM === '1'（证据故障注入——
 * 证据 / 测试环境）> EXPERIENCE_LLM_MODE === 'provider'（LLM 模式——
 * S5A-SEMANTIC-FREEZE-01）> 默认合成网关（缝完全惰性——行为与
 * S1–S4 完全一致）。
 */
function resolveServerGateway(): LlmGateway | undefined {
  if (process.env.EXPERIENCE_LLM_GATEWAY_SEAM !== '1') {
    const providerConfig = loadProviderGatewayConfig();
    if (providerConfig) {
      return new ProviderLlmGateway(providerConfig);
    }
    return undefined;
  }
  return new EvidenceFaultLlmGateway(allFixtures());
}

let serverRuntime: ExperienceRuntime | undefined;

export function getServerRuntime(): ExperienceRuntime {
  if (!serverRuntime) {
    const gateway = resolveServerGateway();
    serverRuntime = new ExperienceRuntime({
      eventSink: createServerEventSink(serverEventLogPath()),
      decisionTraceSink: createServerDecisionTraceSink(serverDecisionTraceLogPath()),
      auditSink: createServerAuditSink(serverAuditLogPath()),
      ...(gateway ? { gateway } : {}),
    });
  }
  return serverRuntime;
}
