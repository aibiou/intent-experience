/**
 * 模型网关代理（浏览器 → 127.0.0.1:3031）。
 *
 * 浏览器同源策略下网页代码无法直连本机网关端口，本路由把
 * /api/providers/* 原样转发给模型网关（GET 列表 / POST 新增·
 * 更新 / DELETE 删除 / POST :id/test 连通性测试）。查询参数
 * XTransformPort=3031 为面板侧历史约定，接受并忽略。
 *
 * 密钥纪律：网关响应只有脱敏掩码（apiKeyMasked + hasKey），
 * 本代理不落盘、不改写——密钥不出网关进程。
 */

import { NextRequest } from 'next/server';

const GATEWAY_ORIGIN = 'http://127.0.0.1:3031';

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> }
): Promise<Response> {
  const { path } = await ctx.params;
  const sub = Array.isArray(path) && path.length > 0 ? `/${path.join('/')}` : '';
  const upstream = `${GATEWAY_ORIGIN}/api/providers${sub}`;

  const init: RequestInit = {
    method: req.method,
    headers: { 'content-type': req.headers.get('content-type') ?? 'application/json' },
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  try {
    const upstreamRes = await fetch(upstream, init);
    const body = await upstreamRes.text();
    return new Response(body, {
      status: upstreamRes.status,
      headers: {
        'content-type': upstreamRes.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (error) {
    return Response.json(
      { error: { message: `模型网关服务不可达（127.0.0.1:3031）：${error instanceof Error ? error.message : String(error)}` } },
      { status: 502 }
    );
  }
}

export const GET = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
  proxy(req, ctx);
export const POST = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
  proxy(req, ctx);
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
  proxy(req, ctx);
export const OPTIONS = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
  proxy(req, ctx);
