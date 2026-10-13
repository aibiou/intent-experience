/**
 * 请求与配置校验（纯函数，必须单测）。
 *
 * POST /api/providers 输入校验（中文错误消息，HTTP 层映射 400）：
 * - name / baseUrl / model 必填非空；apiKey 可选（密钥分离纪律：
 *   共享配置入库、密钥本地留存——允许先建提供方、后补本地密钥）
 * - baseUrl 必须 http(s):// 开头
 * - name 不得与现有记录重复（更新自身除外——调用方传入的
 *   existingRecords 已排除自身，此处只做纯比较）
 * - enabled / isDefault 可选布尔（缺省 enabled=true, isDefault=false）
 */

import {
  isProviderModality,
  type ProviderConfigRecord,
  type ProviderModality,
} from './config-store';

export interface ProviderInputValue {
  name: string;
  baseUrl: string;
  apiKey: string; // 可为空串（新增时空=暂无私钥；更新时空=保留现有密钥）
  model: string;
  modality: ProviderModality; // 模态绑定（缺省 text）
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
  const { name, baseUrl, apiKey, model, modality, enabled, isDefault } =
    input as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, message: 'name 不能为空（提供方显示名必填）' };
  }
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
    return { ok: false, message: 'baseUrl 不能为空（提供方 API Base 必填）' };
  }
  if (apiKey !== undefined && typeof apiKey !== 'string') {
    return { ok: false, message: 'apiKey 必须是字符串' };
  }
  if (typeof model !== 'string' || model.trim().length === 0) {
    return { ok: false, message: 'model 不能为空（模型名必填）' };
  }
  if (modality !== undefined && !isProviderModality(modality)) {
    return {
      ok: false,
      message: `modality 必须是 text / image / video / voice 之一（收到：${String(modality)}）`,
    };
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
      apiKey: typeof apiKey === 'string' ? apiKey.trim() : '',
      model: model.trim(),
      modality: isProviderModality(modality) ? modality : 'text',
      enabled: enabled ?? true,
      isDefault: isDefault ?? false,
    },
  };
}
