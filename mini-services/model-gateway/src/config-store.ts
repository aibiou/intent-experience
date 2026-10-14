/**
 * 提供方配置持久化（统一配置源——读取主应用 config-store 格式）。
 *
 * 2026-10-14 统一重构：
 * 废弃旧的 providers.json + secrets.json 双文件形态，改为读取主应用
 * 的 data/config/provider-configs.json（AES-256-GCM 加密密钥存储）。
 * 这是唯一的配置真相源——/config 页面经主应用 API 管理，
 * model-gateway 只读取运行时需要的配置。
 *
 * 数据格式映射（主应用 → 网关）：
 * - provider → name（显示名）
 * - endpoint → baseUrl（网关拼生成端点用）
 * - keyCiphertext → 解密为 apiKey（需 EXPERIENCE_CONFIG_ENCRYPTION_KEY）
 * - enabledAt !== null → enabled
 * - modality 模态字段直接对应
 * - isDefault 由网关按模态推导（enabled 记录中第一条为 default）
 *
 * 密钥纪律：
 * - API key 仅以 AES-256-GCM 密文持久化（主应用 config-store 格式）
 * - 加密密钥经环境变量 EXPERIENCE_CONFIG_ENCRYPTION_KEY 注入（32 字节 hex）
 * - 解密仅在 load() 时内存持有，绝不落盘、不进日志
 * - 读操作永不返回明文 key 的完整形态：对外摘要只含掩码 + hasKey
 *
 * 容错：文件缺失/损坏返回空记录列表，不崩溃。
 */

import { createDecipheriv } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 提供方模态（按模态路由：文本/图像/视频/语音各自独立选提供方）。 */
export type ProviderModality = 'text' | 'image' | 'video' | 'voice';

export const PROVIDER_MODALITIES: readonly ProviderModality[] = [
  'text',
  'image',
  'video',
  'voice',
];

export function isProviderModality(value: unknown): value is ProviderModality {
  return (
    typeof value === 'string' &&
    (PROVIDER_MODALITIES as readonly string[]).includes(value)
  );
}

export interface ProviderConfigRecord {
  id: string;
  name: string; // 主应用 record.provider
  kind: 'openai-compatible';
  baseUrl: string; // 主应用 record.endpoint
  apiKey?: string; // 运行时解密形态
  model: string;
  modality: ProviderModality;
  enabled: boolean; // 主应用 record.enabledAt !== null
  isDefault: boolean; // 网关推导：同模态第一条 enabled
  createdAt: string;
  updatedAt: string;
}

/** 对外摘要（API 读形态——绝不回完整 key，仅掩码 + hasKey 标记）。 */
export interface ProviderConfigSummary {
  id: string;
  name: string;
  kind: 'openai-compatible';
  baseUrl: string;
  model: string;
  modality: ProviderModality;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  apiKeyMasked: string;
  hasKey: boolean;
}

/** key 脱敏：只保留后 4 位；过短（<=4 位）时完全掩蔽。 */
export function maskApiKey(apiKey: string): string {
  if (typeof apiKey !== 'string' || apiKey.length <= 4) {
    return 'sk-****';
  }
  return `sk-***${apiKey.slice(-4)}`;
}

export function summarizeRecord(record: ProviderConfigRecord): ProviderConfigSummary {
  const hasKey = typeof record.apiKey === 'string' && record.apiKey.length > 0;
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    baseUrl: record.baseUrl,
    model: record.model,
    modality: record.modality,
    enabled: record.enabled,
    isDefault: record.isDefault,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    apiKeyMasked: hasKey ? maskApiKey(record.apiKey as string) : 'sk-****',
    hasKey,
  };
}

/**
 * isDefault 唯一性（纯函数，按模态）：同一模态多条 enabled 时
 * 第一条标记为 default，其余 false。
 */
export function enforceDefaultUniqueness(
  records: ProviderConfigRecord[],
): ProviderConfigRecord[] {
  const seen = new Set<ProviderModality>();
  return records.map((record) => {
    if (record.enabled && !seen.has(record.modality)) {
      seen.add(record.modality);
      return { ...record, isDefault: true };
    }
    return { ...record, isDefault: false };
  });
}

// ──────────────────────────────────────────────────────────────────
// 主应用 config-store 格式（只读适配层）
// ──────────────────────────────────────────────────────────────────

/** 主应用配置记录格式（data/config/provider-configs.json 中的形态）。 */
interface MainAppRecord {
  id: string;
  provider: string;
  model: string;
  endpoint: string;
  modality: string;
  keyCiphertext: string;
  createdAt: string;
  updatedAt: string;
  enabledAt: string | null;
}

interface MainAppStoreData {
  records: MainAppRecord[];
}

/** AES-256-GCM 密文格式：base64(iv).base64(ciphertext).base64(tag)。 */
function decryptApiKey(ciphertext: string): string | undefined {
  const encKeyHex = process.env.EXPERIENCE_CONFIG_ENCRYPTION_KEY;
  if (!encKeyHex) {
    console.error('[model-gateway] EXPERIENCE_CONFIG_ENCRYPTION_KEY not set — cannot decrypt API keys');
    return undefined;
  }
  try {
    const key = Buffer.from(encKeyHex, 'hex');
    if (key.length !== 32) {
      console.error('[model-gateway] EXPERIENCE_CONFIG_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
      return undefined;
    }
    const parts = ciphertext.split('.');
    if (parts.length !== 3) return undefined;
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('[model-gateway] failed to decrypt API key:', error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

/** 主应用记录 → 网关记录格式转换。 */
function mapMainAppRecord(record: MainAppRecord): ProviderConfigRecord | null {
  if (!isProviderModality(record.modality)) return null;
  const apiKey = record.keyCiphertext ? decryptApiKey(record.keyCiphertext) : undefined;
  return {
    id: record.id,
    name: record.provider,
    kind: 'openai-compatible' as const,
    baseUrl: record.endpoint,
    apiKey,
    model: record.model,
    modality: record.modality,
    enabled: record.enabledAt !== null,
    isDefault: false, // 后续由 enforceDefaultUniqueness 推导
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ConfigStore {
  constructor(private readonly filePath: string) {}

  /**
   * 读取记录（从主应用 config-store 格式文件读取并解密密钥）。
   * 文件缺失/损坏 → 空列表，不抛异常。
   */
  async load(): Promise<ProviderConfigRecord[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch {
      return []; // ENOENT → 空列表
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return []; // 损坏 JSON → 空列表
    }
    if (parsed === null || typeof parsed !== 'object') return [];
    const records = (parsed as { records?: unknown }).records;
    if (!Array.isArray(records)) return [];

    const mapped: ProviderConfigRecord[] = [];
    for (const record of records) {
      const r = record as MainAppRecord;
      if (typeof r.id !== 'string' || typeof r.provider !== 'string' || typeof r.model !== 'string') continue;
      const converted = mapMainAppRecord(r);
      if (converted) mapped.push(converted);
    }

    return enforceDefaultUniqueness(mapped);
  }

  /**
   * 写入操作——统一配置源后，model-gateway 不再直接写入配置。
   * 所有配置变更经主应用 /config 页面 → 主应用 config-store API。
   * 此方法保留签名兼容但抛出明确错误。
   */
  async save(_records: ProviderConfigRecord[]): Promise<ProviderConfigRecord[]> {
    throw new Error(
      'model-gateway config-store is read-only after unification — use /config page (main app API) to manage providers',
    );
  }
}

// ──────────────────────────────────────────────────────────────────
// 路径解析
// ──────────────────────────────────────────────────────────────────

/**
 * 统一配置路径：主应用的 data/config/provider-configs.json。
 * 环境变量 EXPERIENCE_CONFIG_STORE_PATH 可覆盖（与主应用 config-store.ts 对齐）。
 */
export function defaultStorePath(): string {
  return (
    process.env.EXPERIENCE_CONFIG_STORE_PATH ??
    join(process.cwd(), 'data/config/provider-configs.json')
  );
}

export const configStore = new ConfigStore(defaultStorePath());
