/**
 * 瞬态失败分类与有界重试（对齐参考仓库 CR-51 纪律：
 * 瞬态失败自动消化，非瞬态立即报）。
 *
 * 瞬态 = 网络异常（fetch throw，含超时）或 HTTP 408/429/500/502/503/504。
 * 策略：等待 2 秒重试 1 次（共 2 次尝试），两次都失败才抛；
 * 400/401/403/404 等其它状态码与空内容错误不重试。
 *
 * 全部纯逻辑（withRetry 的等待函数可注入），单测不发真实网络请求。
 */

export const RETRY_DELAY_MS = 2000;
export const MAX_ATTEMPTS = 2;

/** 可重试的 HTTP 状态码（瞬态）。 */
const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

/** 上游返回非 2xx（openai-compatible 分支构造；zai 分支经 wrapZaiError 归一）。 */
export class UpstreamHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UpstreamHttpError';
    this.status = status;
  }
}

/** 网络异常（fetch throw / DNS / 连接拒绝 / 超时）——瞬态。 */
export class UpstreamNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamNetworkError';
  }
}

/** 上游返回空内容——非瞬态（重试同样的空响应没有意义）。 */
export class EmptyContentError extends Error {
  constructor(message = '模型返回了空内容') {
    super(message);
    this.name = 'EmptyContentError';
  }
}

const NETWORK_FAILURE_PATTERN =
  /fetch failed|failed to fetch|network|econnrefused|enotfound|econnreset|eai_again|etimedout|socket hang up|connection refused|connection reset/i;

/** 网络异常判定（fetch throw 形态：TypeError / TimeoutError / 自定义包装）。 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof UpstreamNetworkError) return true;
  if (!(error instanceof Error)) return false;
  // AbortSignal.timeout() 的超时形态：DOMException(name='TimeoutError')；
  // AbortError 在本网关只来源于该超时机制 → 按瞬态处理。
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
  // fetch 网络层失败（DNS 解析失败 / 连接拒绝）在 Bun/undici 里是 TypeError
  if (error instanceof TypeError) return true;
  return NETWORK_FAILURE_PATTERN.test(error.message);
}

/** 从错误消息提取上游状态码（z-ai-web-dev-sdk 抛 "API request failed with status 502: ..."）。 */
export function extractUpstreamStatus(message: string): number | null {
  const match = message.match(/status (\d{3})/i);
  return match ? Number(match[1]) : null;
}

/** 瞬态判定：可重试的才重试。 */
export function isTransientFailure(error: unknown): boolean {
  if (error instanceof UpstreamHttpError) return isRetryableStatus(error.status);
  if (error instanceof EmptyContentError) return false;
  if (isNetworkFailure(error)) return true;
  // z-ai-web-dev-sdk 以普通 Error 携带上游状态 → 按状态分类
  if (error instanceof Error) {
    const status = extractUpstreamStatus(error.message);
    if (status !== null) return isRetryableStatus(status);
  }
  return false;
}

export const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  delayMs?: number;
  /** 等待函数（测试注入假 sleep，不发真实等待）。 */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * 有界重试：瞬态失败等待 delayMs 后重试 1 次（共 2 次尝试）；
 * 非瞬态失败立即抛出；两次瞬态失败都失败才抛。
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const delayMs = options.delayMs ?? RETRY_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isTransientFailure(error)) {
        throw error; // 非瞬态立即报 / 已达上限
      }
      await sleep(delayMs);
    }
  }
  /* istanbul ignore next -- 循环必然 return 或 throw */
  throw new Error('withRetry: unreachable');
}
