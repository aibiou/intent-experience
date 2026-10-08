/**
 * HTTP 形态的运行时单例（Next.js 服务器进程内唯一）。
 *
 * 路由处理器（app/api/**）通过 getServerRuntime() 取得同一实例，
 * 使跨请求的状态（Session / Experience / StateStore / generation epoch）
 * 在单个服务器进程内一致。事件汇与决策追踪汇由环境变量注入路径：
 * - EXPERIENCE_EVENT_LOG：C6 事件流（NDJSON）
 * - EXPERIENCE_DECISION_TRACE_LOG：决策追踪（NDJSON，C6 §23 分离）
 * - EXPERIENCE_AUDIT_LOG：流式审计汇（F-1 形态）
 *
 * 进程内证据形态由执行器直接构造 ExperienceRuntime 并注入内存汇，
 * 不经本模块。
 */

import { ExperienceRuntime } from './runtime';
import { createServerEventSink, serverEventLogPath } from './events';
import {
  createServerDecisionTraceSink,
  serverDecisionTraceLogPath,
} from './decision-trace';
import { createServerAuditSink, serverAuditLogPath } from './audit';

let serverRuntime: ExperienceRuntime | undefined;

export function getServerRuntime(): ExperienceRuntime {
  if (!serverRuntime) {
    serverRuntime = new ExperienceRuntime({
      eventSink: createServerEventSink(serverEventLogPath()),
      decisionTraceSink: createServerDecisionTraceSink(serverDecisionTraceLogPath()),
      auditSink: createServerAuditSink(serverAuditLogPath()),
    });
  }
  return serverRuntime;
}
