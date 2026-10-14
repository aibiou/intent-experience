/**
 * Provider 解析链（纯函数，必须单测）。
 *
 * resolveProvider(records, requested?, modality='text')：
 * 1. requested 是某条 enabled 记录的 id → 该记录（模态不匹配 → 明确错误）
 * 2. 未指定 → 该模态 isDefault=true 且 enabled 的记录
 *    → 否则该模态第一条 enabled 记录
 * 3. 该模态无任何 enabled 记录 → 明确错误（MEDIA_PROVIDER_MISSING，
 *    中文指引——不伪装兜底，不回退合成）
 *
 * 模态路由纪律：所有模态的提供方由用户按模态配置，
 * 网关不硬编码任何提供方，不回退任何内置兜底。
 */

import {
  type ProviderConfigRecord,
  type ProviderModality,
} from './config-store';

export type ResolvedProvider =
  | { kind: 'record'; record: ProviderConfigRecord };

/** 解析失败（HTTP 层映射 400）。 */
export class ProviderResolveError extends Error {
  readonly code:
    | 'PROVIDER_NOT_FOUND'
    | 'PROVIDER_MODALITY_MISMATCH'
    | 'MEDIA_PROVIDER_MISSING';

  constructor(
    message: string,
    code:
      | 'PROVIDER_NOT_FOUND'
      | 'PROVIDER_MODALITY_MISMATCH'
      | 'MEDIA_PROVIDER_MISSING' = 'PROVIDER_NOT_FOUND',
  ) {
    super(message);
    this.name = 'ProviderResolveError';
    this.code = code;
  }
}

const MODALITY_LABEL: Record<ProviderModality, string> = {
  text: '文本',
  image: '图像',
  video: '视频',
  voice: '语音',
};

export function resolveProvider(
  records: ProviderConfigRecord[],
  requested?: string,
  modality: ProviderModality = 'text',
): ResolvedProvider {
  // 空串视为未指定
  const requestedId =
    typeof requested === 'string' && requested.trim().length > 0
      ? requested.trim()
      : undefined;

  // 链 1：显式记录 id（须 enabled 且模态匹配）
  if (requestedId !== undefined) {
    const record = records.find((r) => r.id === requestedId);
    if (!record) {
      throw new ProviderResolveError(`未找到提供方：${requestedId}`);
    }
    if (!record.enabled) {
      throw new ProviderResolveError(`提供方已禁用：${record.name}（id=${requestedId}）`);
    }
    if (record.modality !== modality) {
      throw new ProviderResolveError(
        `提供方「${record.name}」是${MODALITY_LABEL[record.modality]}模态，不能用于${MODALITY_LABEL[modality]}生成`,
        'PROVIDER_MODALITY_MISMATCH',
      );
    }
    return { kind: 'record', record };
  }

  // 链 2：缺省 → 该模态 isDefault=true 且 enabled 的记录
  const def = records.find((r) => r.modality === modality && r.isDefault && r.enabled);
  if (def) {
    return { kind: 'record', record: def };
  }

  // 链 2b：该模态第一条 enabled 记录（无 default 时的确定性回退）
  const first = records.find((r) => r.modality === modality && r.enabled);
  if (first) {
    return { kind: 'record', record: first };
  }

  // 链 3：该模态无任何 enabled 记录 → 明确报错（不伪装，不兜底）
  throw new ProviderResolveError(
    `未配置${MODALITY_LABEL[modality]}生成提供方——请在 /config 页面添加并启用${MODALITY_LABEL[modality]}模态提供方`,
    'MEDIA_PROVIDER_MISSING',
  );
}
