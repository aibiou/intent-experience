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

/** 独立模型网关地址（本机部署形态；端口与 mini-services/model-gateway 一致）。 */
const MODEL_GATEWAY_URL = 'http://127.0.0.1:3031';

/** 单次生成调用超时。 */
const GATEWAY_TIMEOUT_MS = 60_000;

/** 网关拉起限频窗口（毫秒）——避免并发请求时重复 spawn。 */
const REVIVE_THROTTLE_MS = 10_000;

/** 网关拉起后的就绪等待（毫秒）。 */
const REVIVE_WAIT_MS = 3_000;

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
    const res = await fetch(`${MODEL_GATEWAY_URL}/healthz`, {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) return;
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
      env: { ...process.env },
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
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    });

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (request.signal?.aborted) {
          throw new GatewayError('生成已被取消', false);
        }
        const timeout = AbortSignal.timeout(GATEWAY_TIMEOUT_MS);
        const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
        const response = await fetch(`${MODEL_GATEWAY_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal,
        });
        if (!response.ok) {
          const detail = await this.readErrorDetail(response);
          // 4xx：请求层面的问题（如 messages 缺失）——重试无意义；
          // 5xx：网关或上游瞬态——客户端消化一次。
          const retryable = response.status >= 500;
          throw new GatewayError(detail, retryable);
        }
        const payload = (await response.json()) as ChatCompletionResponse;
        const text = payload.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || text.trim().length === 0) {
          throw new GatewayError('模型返回了空内容', true);
        }
        return { text: text.trim() };
      } catch (error) {
        lastError = error;
        if (error instanceof GatewayError && !error.retryable) throw error;
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

  private async readErrorDetail(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      if (payload.error?.message) return payload.error.message;
    } catch {
      // 非 JSON 错误体——落到状态码描述
    }
    return `模型网关返回 ${response.status}`;
  }
}
