import { handleExperienceStreamRequest } from '../../../../src/experience/http';
import { createServerAuditSink, serverAuditLogPath } from '../../../../src/experience/audit';

/**
 * POST /api/experience/stream — 首体验流式 API（S1 切片）。
 *
 * 请求体：{ "semanticAction": "DIRECT_ANSWER" | "WHY" | "STOP" }
 * 响应：application/x-ndjson，每行一个事件
 * （chunk / done / stopped / cancelled）。
 *
 * 取消传播：request.signal（客户端断开）传入生成核心，
 * 取消后不再产出任何分块，并向服务端审计汇写入 cancellation 事件。
 */
export async function POST(req: Request): Promise<Response> {
  const audit = createServerAuditSink(serverAuditLogPath());
  const result = await handleExperienceStreamRequest({
    method: req.method,
    body: await req.text(),
    signal: req.signal,
    audit,
  });
  return new Response(result.body, {
    status: result.status,
    headers: result.headers,
  });
}

// 方法约束（C5 API Contract V1）：本路由仅允许 POST。
// 显式导出 GET 以返回结构化 405；其余未导出方法由框架返回 405。
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
