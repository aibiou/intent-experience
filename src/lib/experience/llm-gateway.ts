/**
 * LLM 网关客户端（S1 切片；经独立模型网关 mini-service 调用）。
 *
 * 边界纪律（契约 GS-06 / CC02 H01/H05）：
 * - 客户端只产出内容提案（LlmProposal：仅 text 字段）。
 * - 客户端不接触数据库、不接触 ExperienceState、不接触策略——
 *   LLM 只提出候选结果，不拥有状态、策略或产品决策权。
 * - 提供方路由（内置 zai / 自定义 newapi OpenAI 兼容配置）全部收敛在
 *   mini-services/model-gateway（端口 3031）——主应用不感知具体提供方。
 * - 网关失败时抛出 GatewayError；Runtime 决定如何呈现失败
 *   （诚实报错，不伪造内容）。
 */

import type { LlmProposal } from './types';
import { LocalHttpError, localHttpRequest, localHttpStream, localNoProxyEnv } from './loopback-http';

/** 独立模型网关地址（本机部署形态；端口与 mini-services/model-gateway 一致）。 */
const MODEL_GATEWAY_URL = 'http://127.0.0.1:3031';

/** 单次生成调用超时。 */
const GATEWAY_TIMEOUT_MS = 60_000;

/** 网关拉起限频窗口（毫秒）——避免并发请求时重复 spawn。 */
const REVIVE_THROTTLE_MS = 10_000;

/** 网关拉起后的就绪等待（毫秒）。 */
const REVIVE_WAIT_MS = 3_000;

/**
 * 流式空闲超时（毫秒）：两次增量之间的最长等待。
 * 不能沿用 60s 总超时——长回答本来就该超过 60s，但「一分钟一个字都没有」
 * 必须判定为上游僵死。
 */
const GATEWAY_STREAM_IDLE_TIMEOUT_MS = 60_000;

/**
 * 请求驱动的网关保活（本沙箱会周期性收割后台 mini-service 进程——
 * 常驻定时器在 Next dev 的 instrumentation 中不可靠，实测会被清理）。
 * 策略：每次生成前探测 healthz；不可达且距上次拉起超过限频窗口时，
 * 以脱离会话方式重新拉起网关并等待就绪。主应用是环境白名单常驻进程，
 * 由它承担 supervisor 职责；生产部署应交给正规进程管理器。
 */
let lastReviveAt = 0;
async function ensureGateway(): Promise<void> {
  try {
    // 直连探测（不经 fetch）：Bun 会把 HTTP_PROXY 应用到 fetch 且不豁免
    // 127.0.0.1，代理失败会被误判成「网关挂了」，导致重复 spawn
    // （DEFECT-LOCAL-PROXY-001）。
    const probe = await localHttpRequest({
      url: `${MODEL_GATEWAY_URL}/healthz`,
      timeoutMs: 2_500,
    });
    if (probe.status >= 200 && probe.status < 300) return;
  } catch {
    // 不可达——走拉起路径
  }
  const now = Date.now();
  if (now - lastReviveAt < REVIVE_THROTTLE_MS) return;
  lastReviveAt = now;
  try {
    const { spawn } = await import('node:child_process');
    const path = await import('node:path');
    // 以主应用根为 cwd 拉起：网关默认配置路径
    // （data/config/provider-configs.json）按 process.cwd() 解析——
    // cwd 若为 mini-services/model-gateway 会读不到统一配置源
    // （实测 MEDIA_PROVIDER_MISSING，所有模态"未配置"）。
    const child = spawn('bun', [path.join(process.cwd(), 'mini-services', 'model-gateway', 'index.ts')], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      // 网关内部用 fetch 调本机桥（元宝 3210 / 豆包 3220），Bun 的 fetch
      // 会被 HTTP_PROXY 劫持且只在进程启动时读 NO_PROXY——必须在 spawn
      // 时注入回环豁免（外部提供方仍按用户代理出网）。
      env: localNoProxyEnv(),
    });
    child.unref();
    await new Promise((resolve) => setTimeout(resolve, REVIVE_WAIT_MS));
  } catch {
    // 拉起失败——让后续 fetch 走诚实报错路径
  }
}

export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export interface LlmGateway {
  readonly name: string;
  generate(request: LlmRequest): Promise<LlmProposal>;
  /**
   * 流式生成（可选能力）：逐块产出文本增量。
   *
   * 语义约定：增量只用于**展示**。完整文本由调用方拼接后再交给验证器，
   * 通过后才写入状态（GS-06：流式内容不进状态）。不支持流式的网关
   * 实现可以不提供本方法，调用方回退 generate。
   */
  stream?(request: LlmRequest): AsyncIterable<string>;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * 独立模型网关客户端：POST /v1/chat/completions（OpenAI 兼容）。
 * 提供方选择（zai / newapi 等）由网关按默认链解析。
 * 有界重试：1 次（网络异常 / 5xx；网关内部已按 CR-51 纪律对瞬态
 * 上游失败重试——客户端这层只消化网关自身的连接抖动，两层都不无限重跑）。
 */
export class HttpLlmGateway implements LlmGateway {
  readonly name = 'http-llm-gateway';

  async generate(request: LlmRequest): Promise<LlmProposal> {
    await ensureGateway();
    const body = {
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (request.signal?.aborted) {
          throw new GatewayError('生成已被取消', false);
        }
        const response = await localHttpRequest({
          url: `${MODEL_GATEWAY_URL}/v1/chat/completions`,
          method: 'POST',
          body,
          timeoutMs: GATEWAY_TIMEOUT_MS,
          signal: request.signal,
        });
        if (response.status < 200 || response.status >= 300) {
          // 4xx：请求层面的问题（如 messages 缺失）——重试无意义；
          // 5xx：网关或上游瞬态——客户端消化一次。
          const retryable = response.status >= 500;
          throw new GatewayError(this.readErrorDetail(response.body), retryable);
        }
        let payload: ChatCompletionResponse;
        try {
          payload = JSON.parse(response.body) as ChatCompletionResponse;
        } catch {
          throw new GatewayError('模型网关响应无法解析（非 JSON）', true);
        }
        const text = payload.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || text.trim().length === 0) {
          throw new GatewayError('模型返回了空内容', true);
        }
        return { text: text.trim() };
      } catch (error) {
        lastError = error;
        if (error instanceof GatewayError && !error.retryable) throw error;
        // 取消是用户主权：不重试、不包装成网关故障。
        if (error instanceof LocalHttpError && error.code === 'aborted') {
          throw new GatewayError('生成已被取消', false);
        }
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }
    throw new GatewayError(
      `生成失败（模型网关 ${MODEL_GATEWAY_URL}）：${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
      true
    );
  }

  /**
   * 流式生成：把网关的 SSE 增量转成异步序列。
   *
   * 三层缓冲各司其职：
   * - `queue`：已解析出的文本增量（等待被消费）；
   * - `sseBuffer`：跨网络块的半行文本（SSE 事件可能被切断）；
   * - `errorBody`：非 2xx 时的原始响应体（网关返回 JSON 错误而非流）。
   *
   * 不重试：流式重试会让用户看到重复内容；失败即如实报错，由用户决定
   * 是否重来（重试一次是 generate 的语义，不是 stream 的）。
   */
  async *stream(request: LlmRequest): AsyncGenerator<string> {
    await ensureGateway();

    const queue: string[] = [];
    let done = false;
    let failure: unknown = null;
    let wake: (() => void) | null = null;
    const notify = () => {
      const resume = wake;
      wake = null;
      resume?.();
    };

    let status = 0;
    let contentType = '';
    let sseBuffer = '';
    let errorBody = '';
    // 非 SSE 响应体（旧网关 / 中间层把流式请求当普通请求处理）——
    // 用于流式结束后的一次性回退，避免「新客户端 + 旧网关」静默返回空。
    let plainBody = '';
    let receivedAny = false;

    const feed = (text: string) => {
      if (status >= 400) {
        errorBody += text;
        return;
      }
      if (!contentType.includes('text/event-stream')) {
        plainBody += text;
        return;
      }
      sseBuffer += text;
      let newline = sseBuffer.indexOf('\n');
      while (newline !== -1) {
        const line = sseBuffer.slice(0, newline).replace(/\r$/, '');
        sseBuffer = sseBuffer.slice(newline + 1);
        newline = sseBuffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload.length === 0 || payload === '[DONE]') continue;
        let chunk: { error?: { message?: string }; choices?: Array<{ delta?: { content?: string } }> };
        try {
          chunk = JSON.parse(payload) as typeof chunk;
        } catch {
          continue;
        }
        const message = chunk.error?.message;
        if (typeof message === 'string' && message.length > 0) {
          failure = new GatewayError(message, true);
          continue;
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          receivedAny = true;
          queue.push(delta);
          notify();
        }
      }
    };

    const running = localHttpStream(
      {
        url: `${MODEL_GATEWAY_URL}/v1/chat/completions`,
        method: 'POST',
        body: {
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          stream: true,
        },
        idleTimeoutMs: GATEWAY_STREAM_IDLE_TIMEOUT_MS,
        signal: request.signal,
        onHead: (head) => {
          status = head.status;
          contentType = head.headers['content-type'] ?? '';
        },
      },
      feed
    ).then(
      () => {
        done = true;
        notify();
      },
      (error: unknown) => {
        failure = error;
        done = true;
        notify();
      }
    );

    while (true) {
      const next = queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (done) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    await running;

    // 回退：网关返回了普通 JSON（没有 SSE 帧）——按非流式响应解析，
    // 一次性交付完整文本。用户仍然拿到内容，只是没有逐字效果。
    if (!failure && !receivedAny && status > 0 && status < 400 && plainBody.length > 0) {
      try {
        const parsed = JSON.parse(plainBody) as ChatCompletionResponse;
        const text = parsed.choices?.[0]?.message?.content;
        if (typeof text === 'string' && text.trim().length > 0) {
          yield text.trim();
          return;
        }
      } catch {
        // 非 JSON 也不像 SSE——落到下面的错误分支
      }
      throw new GatewayError('模型网关返回了无法识别的响应（既不是 SSE 也不是 JSON）', true);
    }

    if (failure) {
      if (failure instanceof LocalHttpError && failure.code === 'aborted') {
        throw new GatewayError('生成已被取消', false);
      }
      if (status >= 400 && errorBody.length > 0) {
        throw new GatewayError(this.readErrorDetail(errorBody), status >= 500);
      }
      throw new GatewayError(
        failure instanceof Error ? failure.message : String(failure),
        true
      );
    }
  }

  private readErrorDetail(raw: string): string {
    try {
      const payload = JSON.parse(raw) as { error?: { message?: string } };
      if (payload.error?.message) return payload.error.message;
    } catch {
      // 非 JSON 错误体——落到原始文本
    }
    return raw.trim().length > 0 ? raw.trim().slice(0, 200) : '模型网关返回了空响应';
  }
}
