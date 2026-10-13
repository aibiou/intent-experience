/**
 * 模型网关 mini-service 入口（Bun.serve，端口固定 3031——不读环境变量）。
 *
 * 对接 LLM 提供方的唯一出入口，独立于主应用（自己的 package.json，
 * 不依赖主应用代码）。主应用接线是下一个任务。
 *
 * HTTP 面（OpenAI 兼容风格）：
 * - GET  /healthz                 → {ok:true, uptimeSec, defaultProvider}
 * - POST /v1/chat/completions     → OpenAI 兼容 chat.completion
 * - POST /v1/images/generations   → 图像生成（默认图像模态提供方）
 * - POST /v1/audio/speech         → 语音合成（默认语音模态提供方）
 * - POST /v1/videos               → 视频生成（异步任务轮询直至完成）
 * - GET  /api/providers           → 列表（apiKey 脱敏，绝不回完整 key）
 * - POST /api/providers           → 新增（无 id，201）/ 更新（有 id，200）
 * - DELETE /api/providers/:id     → 删除
 * - POST /api/providers/:id/test  → 连通性测试（总是 200，body 区分成败）
 *
 * 模态路由：文本/图像/视频/语音各自独立选提供方——
 * 每条记录绑定一个模态，缺省走该模态的 default 记录
 * （无 default 则该模态第一条 enabled）。媒体模态无
 * 内置兜底：未配置时明确报 MEDIA_PROVIDER_MISSING。
 *
 * 密钥分离：提供方配置存 providers.json（入库共享，人人是同一份）；
 * 密钥只存 data/secrets.json（gitignored，本地独有）。apiKey 可选
 * 传入——未配置密钥的提供方调用时明确报 PROVIDER_NO_KEY（400）。
 *
 * CORS：所有响应带 Access-Control-Allow-Origin: *；OPTIONS 预检 204。
 */

import {
  configStore,
  summarizeRecord,
  type ProviderConfigRecord,
  type ProviderModality,
} from './src/config-store';
import { BUILTIN_ZAI, ProviderResolveError, resolveProvider, type ResolvedProvider } from './src/resolve';
import {
  EmptyContentError,
  UpstreamHttpError,
  UpstreamNetworkError,
  isNetworkFailure,
  isRetryableStatus,
  withRetry,
} from './src/retry';
import { validateProviderInput } from './src/validate';
import {
  buildApiErrorBody,
  buildChatCompletionResponse,
  parseChatRequest,
  type ChatMessage,
} from './src/openai';
import { callZai } from './src/providers/zai';
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
  return resolved.kind === 'zai' ? 'zai' : `「${resolved.record.name}」`;
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
    defaultProvider: def ? def.name : BUILTIN_ZAI,
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

  if (resolved.kind === 'zai') {
    try {
      const result = await withRetry(() => callZai(messages));
      return json(buildChatCompletionResponse(result.model, result.content));
    } catch (error) {
      return mapChatError(error, resolved);
    }
  }

  const record = resolved.record;
  if (typeof record.apiKey !== 'string' || record.apiKey.length === 0) {
    return json(
      buildApiErrorBody(
        `提供方「${record.name}」尚未配置本地密钥——密钥只存本地（data/secrets.json），请在设置中填入`,
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
  if (resolved.kind === 'zai') {
    return json(
      buildApiErrorBody('内置 zai 不支持媒体生成', 'invalid_request_error', 'PROVIDER_MODALITY_MISMATCH'),
      400,
    );
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

async function handleUpsertProvider(req: Request): Promise<Response> {
  const body = await readJsonBody(req);
  const bodyObj =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  const id =
    typeof bodyObj?.id === 'string' && bodyObj.id.length > 0 ? (bodyObj.id as string) : undefined;

  const records = await configStore.load();
  // 重名校验范围：更新自身除外（自身从比较集中排除）
  const others = id === undefined ? records : records.filter((r) => r.id !== id);

  const validated = validateProviderInput(body, others);
  if (!validated.ok) {
    return json(
      buildApiErrorBody(validated.message, 'invalid_request_error', 'INVALID_PROVIDER_INPUT'),
      400,
    );
  }
  const value = validated.value;

  if (id === undefined) {
    const now = new Date().toISOString();
    const record: ProviderConfigRecord = {
      id: crypto.randomUUID(),
      name: value.name,
      kind: 'openai-compatible',
      baseUrl: value.baseUrl,
      apiKey: value.apiKey.length > 0 ? value.apiKey : undefined, // 密钥只写本地 secrets
      model: value.model,
      modality: value.modality,
      enabled: value.enabled,
      isDefault: value.isDefault,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await configStore.save([...records, record]);
    return json(summarizeRecord(saved.find((r) => r.id === record.id) ?? record), 201);
  }

  const existing = records.find((r) => r.id === id);
  if (!existing) {
    return json(
      buildApiErrorBody(`未找到提供方配置：${id}`, 'invalid_request_error', 'PROVIDER_NOT_FOUND'),
      404,
    );
  }
  existing.name = value.name;
  existing.baseUrl = value.baseUrl;
  if (value.apiKey.length > 0) {
    existing.apiKey = value.apiKey; // 传了新密钥才替换；空=保留现有本地密钥
  }
  existing.model = value.model;
  existing.modality = value.modality;
  existing.enabled = value.enabled;
  existing.isDefault = value.isDefault;
  existing.updatedAt = new Date().toISOString();
  const saved = await configStore.save(records);
  return json(summarizeRecord(saved.find((r) => r.id === id) ?? existing), 200);
}

async function handleDeleteProvider(id: string): Promise<Response> {
  const records = await configStore.load();
  if (!records.some((r) => r.id === id)) {
    return json(
      buildApiErrorBody(`未找到提供方配置：${id}`, 'invalid_request_error', 'PROVIDER_NOT_FOUND'),
      404,
    );
  }
  await configStore.save(records.filter((r) => r.id !== id));
  return json({ ok: true, deleted: id });
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
        if (req.method === 'POST') return await handleUpsertProvider(req);
      }
      const testMatch = path.match(/^\/api\/providers\/([^/]+)\/test$/);
      if (testMatch && req.method === 'POST') {
        return await handleTestProvider(decodeURIComponent(testMatch[1]));
      }
      const deleteMatch = path.match(/^\/api\/providers\/([^/]+)$/);
      if (deleteMatch && req.method === 'DELETE') {
        return await handleDeleteProvider(decodeURIComponent(deleteMatch[1]));
      }
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
