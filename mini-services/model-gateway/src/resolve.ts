/**
 * Provider 解析链（纯函数，必须单测）。
 *
 * resolveProvider(records, requested?)：
 * 1. requested === 'zai' → 内置 zai（z-ai-web-dev-sdk）
 * 2. requested 是某条 enabled 记录的 id → 该记录
 * 3. 未指定 → isDefault=true 且 enabled 的记录 → 否则内置 zai
 * 4. requested 指向不存在 / 已禁用的记录 → 明确错误（400 PROVIDER_NOT_FOUND）
 */

import type { ProviderConfigRecord } from './config-store';

export const BUILTIN_ZAI = 'zai';

export type ResolvedProvider =
  | { kind: 'zai' }
  | { kind: 'record'; record: ProviderConfigRecord };

/** 解析失败（HTTP 层映射 400）。 */
export class ProviderResolveError extends Error {
  readonly code = 'PROVIDER_NOT_FOUND';

  constructor(message: string) {
    super(message);
    this.name = 'ProviderResolveError';
  }
}

export function resolveProvider(
  records: ProviderConfigRecord[],
  requested?: string,
): ResolvedProvider {
  // 空串视为未指定（解析链第 3 步）
  const requestedId = typeof requested === 'string' && requested.trim().length > 0 ? requested.trim() : undefined;

  // 链 1：显式内置 zai
  if (requestedId === BUILTIN_ZAI) {
    return { kind: 'zai' };
  }

  // 链 2：显式记录 id（须 enabled）
  if (requestedId !== undefined) {
    const record = records.find((r) => r.id === requestedId);
    if (!record) {
      throw new ProviderResolveError(`未找到提供方：${requestedId}`);
    }
    if (!record.enabled) {
      throw new ProviderResolveError(`提供方已禁用：${record.name}（id=${requestedId}）`);
    }
    return { kind: 'record', record };
  }

  // 链 3：缺省 → isDefault=true 且 enabled 的记录
  const def = records.find((r) => r.isDefault && r.enabled);
  if (def) {
    return { kind: 'record', record: def };
  }

  // 链 4：回退内置 zai
  return { kind: 'zai' };
}
