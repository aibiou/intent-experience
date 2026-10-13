/**
 * 请求与配置校验（纯函数，必须单测）。
 *
 * POST /api/providers 输入校验（中文错误消息，HTTP 层映射 400）：
 * - name / baseUrl / apiKey / model 必填非空
 * - baseUrl 必须 http(s):// 开头
 * - name 不得与现有记录重复（更新自身除外——调用方传入的
 *   existingRecords 已排除自身，此处只做纯比较）
 * - enabled / isDefault 可选布尔（缺省 enabled=true, isDefault=false）
 */

import type { ProviderConfigRecord } from './config-store';

export interface ProviderInputValue {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
}

export type ProviderInputValidation =
  | { ok: true; value: ProviderInputValue }
  | { ok: false; message: string };

export function validateProviderInput(
  input: unknown,
  existingRecords: ProviderConfigRecord[],
): ProviderInputValidation {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '请求体必须是 JSON 对象' };
  }
  const { name, baseUrl, apiKey, model, enabled, isDefault } = input as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, message: 'name 不能为空（提供方显示名必填）' };
  }
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
    return { ok: false, message: 'baseUrl 不能为空（提供方 API Base 必填）' };
  }
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return { ok: false, message: 'apiKey 不能为空（提供方密钥必填）' };
  }
  if (typeof model !== 'string' || model.trim().length === 0) {
    return { ok: false, message: 'model 不能为空（模型名必填）' };
  }

  const trimmedBaseUrl = baseUrl.trim();
  if (!/^https?:\/\//.test(trimmedBaseUrl)) {
    return { ok: false, message: 'baseUrl 必须以 http:// 或 https:// 开头' };
  }

  const trimmedName = name.trim();
  if (existingRecords.some((r) => r.name === trimmedName)) {
    return { ok: false, message: `名称已存在：${trimmedName}（提供方名称不可重复）` };
  }

  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return { ok: false, message: 'enabled 必须是布尔值' };
  }
  if (isDefault !== undefined && typeof isDefault !== 'boolean') {
    return { ok: false, message: 'isDefault 必须是布尔值' };
  }

  return {
    ok: true,
    value: {
      name: trimmedName,
      baseUrl: trimmedBaseUrl,
      apiKey: apiKey.trim(),
      model: model.trim(),
      enabled: enabled ?? true,
      isDefault: isDefault ?? false,
    },
  };
}
