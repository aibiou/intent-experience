/**
 * 模型网关 mini-service 入口（Bun.serve，端口固定 3031）。
 *
 * 2026-10-14 统一重构：
 * - 配置源统一为主应用的 data/config/provider-configs.json（AES-256-GCM 加密）
 * - model-gateway 只读取配置，不写入——所有配置变更经主应用 /config 页面
 * - 取消所有合成/zai 兜底——无配置时明确报 MEDIA_PROVIDER_MISSING
 * - 密钥经 EXPERIENCE_CONFIG_ENCRYPTION_KEY 环境变量解密
 *
 * HTTP 面（OpenAI 兼容风格）：
 * - GET  /healthz                 → {ok:true, uptimeSec, defaultProvider}
 * - POST /v1/chat/completions     → OpenAI 兼容 chat.completion
 * - POST /v1/images/generations   → 图像生成（默认图像模态提供方）
 * - POST /v1/audio/speech         → 语音合成（默认语音模态提供方）
 * - POST /v1/videos               → 视频生成（异步任务轮询直至完成）
 * - GET  /api/providers           → 列表（只读，apiKey 脱敏）
 * - POST /api/providers/:id/test  → 连通性测试（总是 200，body 区分成败）
 * - GET  /api/providers/:id/models → 拉取上游可用模型列表（OpenAI /v1/models）
 * - POST /api/providers/probe-models → 预览上游模型列表（无需先保存）
 *
 * 模态路由：文本/图像/视频/语音各自独立选提供方——
 * 每条记录绑定一个模态，缺省走该模态的 default 记录
 * （无 default 则该模态第一条 enabled）。所有模态无内置兜底：
 * 未配置时明确报 MEDIA_PROVIDER_MISSING。
 *
 * CORS：所有响应带 Access-Control-Allow-Origin: *；OPTIONS 预检 204。
 */

import {
  configStore,
  summarizeRecord,
  type ProviderConfigRecord,
  type ProviderModality,
} from './src/config-store';
import { ProviderResolveError, resolveProvider, type ResolvedProvider } from './src/resolve';
import {
  EmptyContentError,
  UpstreamHttpError,
  UpstreamNetworkError,
  isNetworkFailure,
  isRetryableStatus,
  withRetry,
} from './src/retry';
import {
  buildApiErrorBody,
  buildChatCompletionResponse,
  parseChatRequest,
  type ChatMessage,
} from './src/openai';
import { callOpenAICompatible } from './src/providers/openai-compatible';
import {
  generateImage,
  generateVoice,
  generateVideo,
  MediaProviderError,
  type MediaArtifact,
} from './src/providers/media';

const PORT = 3031;
const startedAt = Date.now();

/** 连通性测试用的极小请求（60s 超时在 provider 层生效）。 */
const TEST_MESSAGES: ChatMessage[] = [{ role: 'user', content: '回复ok两个字' }];

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  });
}

async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null; // 非法 JSON → parse/validate 层给出 400
  }
}

function providerLabel(resolved: ResolvedProvider): string {
  return `「${resolved.record.name}」`;
}

/** chat/completions 错误映射：可读中文错误 + OpenAI 风格 {error:{message,type,code}}。 */
function mapChatError(error: unknown, resolved: ResolvedProvider): Response {
  const label = providerLabel(resolved);
  if (error instanceof UpstreamNetworkError || isNetworkFailure(error)) {
    const reason = error instanceof Error ? error.message : String(error);
    return json(
      buildApiErrorBody(`无法连接到提供方${label}：${reason}`, 'api_error', 'UPSTREAM_UNREACHABLE'),
      502,
    );
  }
  if (error instanceof UpstreamHttpError) {
    if (isRetryableStatus(error.status)) {
      return json(
        buildApiErrorBody(
          `提供方${label}暂时不可用（HTTP ${error.status}）：${error.message}`,
          'api_error',
          'UPSTREAM_UNAVAILABLE',
        ),
        502,
      );
    }
    const type = error.status === 401 || error.status === 403 ? 'authentication_error' : 'invalid_request_error';
    return json(
      buildApiErrorBody(
        `提供方${label}返回错误（HTTP ${error.status}）：${error.message}`,
        type,
        'UPSTREAM_ERROR',
      ),
      error.status,
    );
  }
  if (error instanceof EmptyContentError) {
    return json(
      buildApiErrorBody(`提供方${label}返回了空内容`, 'api_error', 'EMPTY_CONTENT'),
      502,
    );
  }
  console.error('[model-gateway] unexpected chat error:', error);
  return json(
    buildApiErrorBody(
      `网关内部错误：${error instanceof Error ? error.message : String(error)}`,
      'api_error',
      'INTERNAL_ERROR',
    ),
    500,
  );
}

async function handleHealthz(): Promise<Response> {
  const records = await configStore.load();
  const def = records.find((r) => r.isDefault && r.enabled);
  return json({
    ok: true,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    defaultProvider: def ? def.name : '(none)',
  });
}

async function handleChatCompletions(req: Request): Promise<Response> {
  const parsed = parseChatRequest(await readJsonBody(req));
  if (!parsed.ok) {
    return json(buildApiErrorBody(parsed.message, 'invalid_request_error', 'INVALID_REQUEST'), 400);
  }
  const { messages, provider } = parsed.value;

  const records = await configStore.load();
  let resolved: ResolvedProvider;
  try {
    resolved = resolveProvider(records, provider);
  } catch (error) {
    if (error instanceof ProviderResolveError) {
      return json(buildApiErrorBody(error.message, 'invalid_request_error', error.code), 400);
    }
    throw error;
  }

  const record = resolved.record;
  if (typeof record.apiKey !== 'string' || record.apiKey.length === 0) {
    return json(
      buildApiErrorBody(
        `提供方「${record.name}」尚未配置密钥——请在 /config 页面填入`,
        'invalid_request_error',
        'PROVIDER_NO_KEY',
      ),
      400,
    );
  }
  try {
    const content = await withRetry(() => callOpenAICompatible(record, messages));
    return json(buildChatCompletionResponse(record.model, content));
  } catch (error) {
    return mapChatError(error, resolved);
  }
}

async function handleListProviders(): Promise<Response> {
  const records = await configStore.load();
  return json({ providers: records.map(summarizeRecord), count: records.length });
}

// ───────────────────────── 媒体生成端点 ─────────────────────────

/** 媒体端点请求体公共校验：字符串字段非空。 */
function requireString(
  body: Record<string, unknown>,
  field: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, message: `${field} 不能为空（必填字符串）` };
  }
  return { ok: true, value: value.trim() };
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function optionalStringArray(
  body: Record<string, unknown>,
  field: string,
): string[] | undefined {
  const value = body[field];
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

/** 媒体产物响应（url 或 dataUri 二选一）。 */
function mediaOk(artifact: MediaArtifact): Response {
  return json({ ok: true, ...artifact });
}

/** 媒体错误映射：上游不可达/瞬态 → 502；参数/上游明确拒绝 → 透传状态。 */
function mapMediaError(error: unknown): Response {
  if (error instanceof MediaProviderError) {
    if (error.retryable || error.status === undefined) {
      return json(
        buildApiErrorBody(error.message, 'api_error', 'MEDIA_UPSTREAM_ERROR'),
        502,
      );
    }
    return json(
      buildApiErrorBody(error.message, 'invalid_request_error', 'MEDIA_UPSTREAM_ERROR'),
      error.status,
    );
  }
  console.error('[model-gateway] unexpected media error:', error);
  return json(
    buildApiErrorBody(
      `网关内部错误：${error instanceof Error ? error.message : String(error)}`,
      'api_error',
      'INTERNAL_ERROR',
    ),
    500,
  );
}

/** 按模态解析提供方并执行媒体生成（解析错误 → 400）。 */
async function runMediaGeneration(
  modality: ProviderModality,
  generate: (record: ProviderConfigRecord) => Promise<MediaArtifact>,
): Promise<Response> {
  const records = await configStore.load();
  let resolved: ResolvedProvider;
  try {
    resolved = resolveProvider(records, undefined, modality);
  } catch (error) {
    if (error instanceof ProviderResolveError) {
      return json(buildApiErrorBody(error.message, 'invalid_request_error', error.code), 400);
    }
    throw error;
  }
  try {
    const artifact = await generate(resolved.record);
    return mediaOk(artifact);
  } catch (error) {
    return mapMediaError(error);
  }
}

/** POST /v1/images/generations —— 图像生成（默认图像模态提供方）。 */
async function handleImageGenerations(req: Request): Promise<Response> {
  const body = await readJsonBody(req);
  const bodyObj =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (bodyObj === null) {
    return json(buildApiErrorBody('请求体必须是 JSON 对象', 'invalid_request_error', 'INVALID_REQUEST'), 400);
  }
  const prompt = requireString(bodyObj, 'prompt');
  if (!prompt.ok) {
    return json(buildApiErrorBody(prompt.message, 'invalid_request_error', 'INVALID_REQUEST'), 400);
  }
  return runMediaGeneration('image', (record) =>
    generateImage(record, prompt.value, {
      aspectRatio: optionalString(bodyObj, 'aspectRatio'),
      referenceImages: optionalStringArray(bodyObj, 'referenceImages'),
    }),
  );
}

/** POST /v1/audio/speech —— 语音合成（默认语音模态提供方）。 */
async function handleAudioSpeech(req: Request): Promise<Response> {
  const body = await readJsonBody(req);
  const bodyObj =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (bodyObj === null) {
    return json(buildApiErrorBody('请求体必须是 JSON 对象', 'invalid_request_error', 'INVALID_REQUEST'), 400);
  }
  const input = requireString(bodyObj, 'input');
  if (!input.ok) {
    return json(buildApiErrorBody(input.message, 'invalid_request_error', 'INVALID_REQUEST'), 400);
  }
  const speaker = optionalString(bodyObj, 'voice');
  return runMediaGeneration('voice', (record) =>
    generateVoice(record, input.value, speaker),
  );
}

/** POST /v1/videos —— 视频生成（默认视频模态提供方，异步任务轮询直至完成）。 */
async function handleVideoGenerations(req: Request): Promise<Response> {
  const body = await readJsonBody(req);
  const bodyObj =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (bodyObj === null) {
    return json(buildApiErrorBody('请求体必须是 JSON 对象', 'invalid_request_error', 'INVALID_REQUEST'), 400);
  }
  const prompt = requireString(bodyObj, 'prompt');
  if (!prompt.ok) {
    return json(buildApiErrorBody(prompt.message, 'invalid_request_error', 'INVALID_REQUEST'), 400);
  }
  return runMediaGeneration('video', (record) => generateVideo(record, prompt.value));
}

/** 测试端点总是 200，用 body 区分成败。按模态路由：文本走对话，图像/语音走最小真实调用，视频为异步任务（创建+轮询数分钟）指引实际生成验证。 */
async function handleTestProvider(id: string): Promise<Response> {
  const records = await configStore.load();
  const record = records.find((r) => r.id === id);
  if (!record) {
    return json({ ok: false, error: `未找到提供方配置：${id}` });
  }
  if (typeof record.apiKey !== 'string' || record.apiKey.length === 0) {
    return json({ ok: false, error: `提供方「${record.name}」未配置本地密钥` });
  }
  if (record.modality === 'video') {
    return json({
      ok: true,
      sample: '视频为异步任务模型（创建+轮询数分钟）——请在体验中实际生成验证',
    });
  }
  try {
    if (record.modality === 'image') {
      const artifact = await generateImage(record, '一个红色的圆点，纯色背景');
      return json({
        ok: true,
        sample: artifact.url ?? `dataUri:${(artifact.dataUri ?? '').slice(0, 40)}…`,
      });
    }
    if (record.modality === 'voice') {
      const artifact = await generateVoice(record, 'ok');
      return json({
        ok: true,
        sample: artifact.url ?? `dataUri:${(artifact.dataUri ?? '').slice(0, 40)}…`,
      });
    }
    const content = await callOpenAICompatible(record, TEST_MESSAGES);
    return json({ ok: true, sample: content.slice(0, 50) });
  } catch (error) {
    const reason =
      error instanceof UpstreamNetworkError || isNetworkFailure(error)
        ? `无法连接到提供方「${record.name}」：${error instanceof Error ? error.message : String(error)}`
        : error instanceof UpstreamHttpError
          ? `提供方返回错误（HTTP ${error.status}）：${error.message}`
          : error instanceof MediaProviderError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
    return json({ ok: false, error: reason });
  }
}

/** GET /api/providers/:id/models —— 拉取上游可用模型列表。 */
async function handleProviderModels(id: string): Promise<Response> {
  const records = await configStore.load();
  const record = records.find((r) => r.id === id);
  if (!record) {
    return json(buildApiErrorBody(`未找到提供方配置：${id}`, 'invalid_request_error', 'PROVIDER_NOT_FOUND'), 404);
  }
  if (typeof record.apiKey !== 'string' || record.apiKey.length === 0) {
    return json(buildApiErrorBody(`提供方「${record.name}」未配置本地密钥`, 'invalid_request_error', 'PROVIDER_NO_KEY'), 400);
  }
  return probeUpstreamModels(record.baseUrl, record.apiKey);
}

/** POST /api/providers/probe-models —— 用 baseUrl + apiKey 预览上游模型列表（无需先保存）。 */
async function handleProbeModels(req: Request): Promise<Response> {
  const body = await readJsonBody(req);
  const bodyObj =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (bodyObj === null) {
    return json(buildApiErrorBody('请求体必须是 JSON 对象', 'invalid_request_error', 'INVALID_REQUEST'), 400);
  }
  const baseUrl = requireString(bodyObj, 'baseUrl');
  if (!baseUrl.ok) {
    return json(buildApiErrorBody(baseUrl.message, 'invalid_request_error', 'INVALID_REQUEST'), 400);
  }
  const apiKey = requireString(bodyObj, 'apiKey');
  if (!apiKey.ok) {
    return json(buildApiErrorBody(apiKey.message, 'invalid_request_error', 'INVALID_REQUEST'), 400);
  }
  return probeUpstreamModels(baseUrl.value, apiKey.value);
}

/** 公共逻辑：向 baseUrl/models 发起请求，解析并返回模型 ID 列表。 */
async function probeUpstreamModels(rawBaseUrl: string, apiKey: string): Promise<Response> {
  try {
    const base = rawBaseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return json(
        buildApiErrorBody(`上游返回 HTTP ${res.status}${text ? '：' + text.slice(0, 200) : ''}`, 'api_error', 'UPSTREAM_ERROR'),
        502,
      );
    }
    const payload = (await res.json()) as { data?: Array<{ id: string }>; models?: Array<{ id: string }> };
    const list = payload.data ?? payload.models ?? [];
    const models = list.map((m) => m.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
    return json({ ok: true, models, count: models.length });
  } catch (error) {
    return json(
      buildApiErrorBody(
        `无法连接到上游提供方：${error instanceof Error ? error.message : String(error)}`,
        'api_error',
        'UPSTREAM_UNREACHABLE',
      ),
      502,
    );
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const path = new URL(req.url).pathname;
    try {
      if (req.method === 'GET' && path === '/healthz') {
        return await handleHealthz();
      }
      if (req.method === 'POST' && path === '/v1/chat/completions') {
        return await handleChatCompletions(req);
      }
      if (req.method === 'POST' && path === '/v1/images/generations') {
        return await handleImageGenerations(req);
      }
      if (req.method === 'POST' && path === '/v1/audio/speech') {
        return await handleAudioSpeech(req);
      }
      if (req.method === 'POST' && path === '/v1/videos') {
        return await handleVideoGenerations(req);
      }
      if (path === '/api/providers') {
        if (req.method === 'GET') return await handleListProviders();
        // POST/DELETE 经主应用 /config 页面管理——model-gateway 只读
      }
      // probe-models 必须在 :id 路由之前匹配
      if (req.method === 'POST' && path === '/api/providers/probe-models') {
        return await handleProbeModels(req);
      }
      const modelsMatch = path.match(/^\/api\/providers\/([^/]+)\/models$/);
      if (modelsMatch && req.method === 'GET') {
        return await handleProviderModels(decodeURIComponent(modelsMatch[1]));
      }
      const testMatch = path.match(/^\/api\/providers\/([^/]+)\/test$/);
      if (testMatch && req.method === 'POST') {
        return await handleTestProvider(decodeURIComponent(testMatch[1]));
      }
      // DELETE 经主应用 /config 页面管理——model-gateway 只读
      return json(
        buildApiErrorBody(`未知路由：${req.method} ${path}`, 'invalid_request_error', 'NOT_FOUND'),
        404,
      );
    } catch (error) {
      console.error('[model-gateway] unhandled error:', error);
      return json(
        buildApiErrorBody(
          `网关内部错误：${error instanceof Error ? error.message : String(error)}`,
          'api_error',
          'INTERNAL_ERROR',
        ),
        500,
      );
    }
  },
});

console.log(`[model-gateway] listening on http://127.0.0.1:${server.port} (pid ${process.pid})`);
