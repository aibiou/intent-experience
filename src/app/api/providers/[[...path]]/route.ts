/**
 * 模型网关代理（浏览器 → 127.0.0.1:3031）。
 *
 * 浏览器同源策略下网页代码无法直连本机网关端口，本路由把
 * /api/providers/* 原样转发给模型网关（GET 列表 / POST 新增·
 * 更新 / DELETE 删除 / POST :id/test 连通性测试）。查询参数
 * XTransformPort=3031 为面板侧历史约定，接受并忽略。
 *
 * 网关存活保障（与 llm-gateway/media-gateway 的 ensureGateway
 * 同纪律）：沙箱会周期性收割后台进程，转发前先探 /healthz，
 * 不可达且过 10s 限频窗则 detached 拉起网关并等 3s 就绪——
 * 配置面（尤其连通性测试）不依赖网关常驻。
 *
 * 密钥纪律：网关响应只有脱敏掩码（apiKeyMasked + hasKey），
 * 本代理不落盘、不改写——密钥不出网关进程。
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const GATEWAY_ORIGIN = 'http://127.0.0.1:3031';
/** 以主应用根目录为 cwd 拉起——网关默认配置路径
 * （data/config/provider-configs.json）按 process.cwd() 解析，
 * cwd 若为 mini-services/model-gateway 会读不到统一配置源。 */
const GATEWAY_SCRIPT = join(
  process.cwd(),
  'mini-services',
  'model-gateway',
  'index.ts',
);
const HEALTHZ_TIMEOUT_MS = 2_500;
const REVIVE_THROTTLE_MS = 10_000;
const REVIVE_WAIT_MS = 3_000;

let lastReviveAttempt = 0;

async function gatewayAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${GATEWAY_ORIGIN}/healthz`, {
      signal: AbortSignal.timeout(HEALTHZ_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Bun 可执行文件解析（缓存）：Windows 上 PATH 中的
 * bun 多为 npm shim（bun.cmd——spawn 无法直接执行，
 * 仅 shell 能跑），故经 `where bun.exe` 解析真实可
 * 执行文件；解析失败时回退 npm 全局安装位置与官方
 * 安装器位置；全部不可用时兜底 'bun'（spawn 失败由
 * 健康探测如实呈现为 502）。 */
let resolvedBun: string | undefined;
function resolveBun(): string {
  if (resolvedBun) return resolvedBun;
  const candidates: string[] = [];
  if (process.env.EXPERIENCE_BUN_PATH) {
    candidates.push(process.env.EXPERIENCE_BUN_PATH);
  }
  if (process.platform === 'win32') {
    try {
      const where = execSync('where bun.exe', {
        encoding: 'utf8',
        timeout: 5_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const line = where.split(/\r?\n/)[0]?.trim();
      if (line) candidates.push(line);
    } catch {
      /* PATH 无 bun.exe——继续下面的候选位置 */
    }
  } else {
    candidates.push('bun');
  }
  const appData = process.env.APPDATA;
  if (appData) {
    candidates.push(join(appData, 'npm', 'node_modules', 'bun', 'bin', 'bun.exe'));
  }
  candidates.push(join(homedir(), '.bun', 'bin', 'bun.exe'));
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      resolvedBun = candidate;
      return resolvedBun;
    }
  }
  resolvedBun = 'bun';
  return resolvedBun;
}

/** 网关不可达时 detached 拉起（10s 限频防重复 spawn 风暴）。 */
async function ensureGateway(): Promise<void> {
  if (await gatewayAlive()) return;
  const now = Date.now();
  if (now - lastReviveAttempt < REVIVE_THROTTLE_MS) return;
  lastReviveAttempt = now;
  try {
    const child = spawn(resolveBun(), [GATEWAY_SCRIPT], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
    });
    // spawn 失败（如可执行文件不可用）是异步 error 事件——
    // 不监听会静默丢失，这里如实记录供排查
    child.on('error', (error) => {
      console.error('[providers-proxy] 网关进程拉起失败：', error.message);
    });
    child.unref();
    // 轮询健康端点直至就绪（启动快时不等；满 3s 放弃）
    const deadline = Date.now() + REVIVE_WAIT_MS;
    while (Date.now() < deadline) {
      if (await gatewayAlive()) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } catch (error) {
    console.error('[providers-proxy] 拉起模型网关失败：', error instanceof Error ? error.message : String(error));
  }
}

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> }
): Promise<Response> {
  await ensureGateway();
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
