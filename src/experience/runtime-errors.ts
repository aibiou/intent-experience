/**
 * 运行时错误契约（拆分自 runtime.ts —— runtime.ts 单文件瘦身第一步）。
 * 纯类型 + 纯函数，无运行时副作用，无外部依赖。
 */

/** S1 §28 错误契约代码（API 契约 §22 错误结构：{code, message, retryable}）。 */
export type RuntimeErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_STATE_TRANSITION'
  | 'STATE_VERSION_CONFLICT'
  | 'INVALID_ACTION'
  | 'POLICY_REJECTED'
  | 'LLM_SCHEMA_INVALID'
  | 'LLM_UNAVAILABLE'
  | 'REQUEST_DUPLICATE'
  | 'INTERNAL_ERROR';

export interface RuntimeError {
  code: RuntimeErrorCode;
  message: string;
  retryable: boolean;
  /** HTTP 形态状态码（错误契约未规定状态码，此处为工程映射并记录于迭代记录）。 */
  status: number;
  details?: Record<string, unknown>;
}

/** 错误代码 → HTTP 状态码映射（工程映射，非契约规定）。 */
export function errorCodeStatus(code: RuntimeErrorCode): number {
  switch (code) {
    case 'STATE_VERSION_CONFLICT':
    case 'REQUEST_DUPLICATE':
      return 409;
    case 'LLM_UNAVAILABLE':
      return 503;
    case 'INTERNAL_ERROR':
      return 500;
    default:
      return 400;
  }
}

/** 构造运行期错误对象（统一状态码映射）。 */
export function runtimeError(
  code: RuntimeErrorCode,
  message: string,
  retryable = false,
  details?: Record<string, unknown>,
): RuntimeError {
  return { code, message, retryable, status: errorCodeStatus(code), details };
}
