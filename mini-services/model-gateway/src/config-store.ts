/**
 * 提供方配置持久化（对齐参考仓库 D-3 多记录配置纪律）。
 *
 * 密钥分离（2026-10-14）：
 * - 共享配置 providers.json（服务根目录，入库）：提供方形态
 *   （id / name / baseUrl / model / enabled / isDefault …），
 *   绝不含密钥——每个拉取代码的人看到同一份提供方配置。
 * - 本地密钥 data/secrets.json（gitignored，绝不入库）：
 *   仅 {"keys": {id: apiKey}}——每个本地环境用自己的密钥。
 * - 运行时 load() 合并两者：record.apiKey = secrets[id]（缺失 → 空串，
 *   hasKey=false；调用时明确报「未配置密钥」而非伪装请求）。
 *
 * 其余纪律不变：
 * - 原子写：先写临时文件（同目录 + pid + 时间戳后缀）再 rename，
 *   绝不出现半写状态；rename 失败时清理 tmp 残留。
 * - 容错：文件缺失 / 损坏（非法 JSON、records 非数组）返回空记录列表，
 *   不崩溃（区别于参考仓库的“损坏拒绝启动”——本网关是可独立重启的
 *   mini-service，空列表即安全回退，等价于无自定义提供方）。
 * - isDefault 唯一性：写入时保证——设置 isDefault=true 时把其它记录
 *   的 isDefault 置 false（同一时刻至多一条 default）。
 * - 读操作永不返回明文 key 的完整形态：对外摘要只含掩码 + hasKey。
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
  id: string; // crypto.randomUUID()
  name: string; // 显示名，唯一（如 "agnes-com"、"火山云语音"）
  kind: 'openai-compatible';
  baseUrl: string; // 完整 base，如 https://api.example.com/v1（网关按契约拼生成端点）
  apiKey?: string; // 运行时形态：load() 从 data/secrets.json 合并；持久化（providers.json）绝不写
  model: string; // 模型名（如 gpt-4o / agnes-image-2.5-flash / seed-audio-1.0）
  modality: ProviderModality; // 模态绑定——一条记录只服务一个模态
  enabled: boolean;
  isDefault: boolean; // 同一模态至多一条 isDefault=true（enforceDefaultUniqueness 按模态归一）
  createdAt: string; // ISO 时间
  updatedAt: string; // ISO 时间
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
  apiKeyMasked: string; // "sk-***后4位" 形式；无密钥时全掩蔽
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
 * isDefault 唯一性（纯函数，按模态）：同一模态多条 isDefault=true
 * 时仅保留第一条，其余置 false；无 default 时保持原状（删除
 * default 记录后允许短暂没有 default——解析链按模态回退）。
 */
export function enforceDefaultUniqueness(
  records: ProviderConfigRecord[],
): ProviderConfigRecord[] {
  const seen = new Set<ProviderModality>();
  return records.map((record) => {
    if (record.isDefault && !seen.has(record.modality)) {
      seen.add(record.modality);
      return record;
    }
    return { ...record, isDefault: false };
  });
}

/** 单条记录形态防御（加载时过滤掉关键字段缺失/类型错误的垃圾行）。 */
function isRecordLike(value: unknown): value is ProviderConfigRecord {
  if (value === null || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.baseUrl === 'string' &&
    typeof r.model === 'string' &&
    isProviderModality(r.modality)
  );
}

/** 原子写：tmp 文件 + rename；rename 失败清残留并抛出。 */
async function writeAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, 'utf8');
  try {
    await rename(tmp, filePath);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined); // 不留 tmp 残余
    throw error;
  }
}

/**
 * 本地密钥存储（data/secrets.json，绝不入库）。
 * 形态：{"keys": {<providerId>: <apiKey>}}；文件缺失/损坏 → 空映射。
 */
export class SecretsStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<Record<string, string>> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch {
      return {}; // 文件缺失等 → 空映射
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {}; // 损坏 JSON → 空映射（不崩溃）
    }
    if (parsed === null || typeof parsed !== 'object') return {};
    const keys = (parsed as { keys?: unknown }).keys;
    if (keys === null || typeof keys !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [id, key] of Object.entries(keys as Record<string, unknown>)) {
      if (typeof id === 'string' && id.length > 0 && typeof key === 'string' && key.length > 0) {
        out[id] = key;
      }
    }
    return out;
  }

  async save(keys: Record<string, string>): Promise<void> {
    await writeAtomic(this.filePath, `${JSON.stringify({ keys }, null, 2)}\n`);
  }
}

export class ConfigStore {
  constructor(
    private readonly filePath: string,
    private readonly secretsStore: SecretsStore,
  ) {}

  /**
   * 读取记录（合并本地密钥）。文件缺失 / 损坏 → 空列表，
   * 不抛异常（调用方无需 try/catch）。
   */
  async load(): Promise<ProviderConfigRecord[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch {
      return []; // ENOENT（文件缺失）等 → 空列表
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return []; // 损坏 JSON → 空列表（不崩溃）
    }
    if (parsed === null || typeof parsed !== 'object') return [];
    const records = (parsed as { records?: unknown }).records;
    if (!Array.isArray(records)) return [];
    const secrets = await this.secretsStore.load();
    return records.filter(isRecordLike).map((record) => ({
      ...record,
      kind: 'openai-compatible' as const,
      modality: record.modality, // 模态绑定（isRecordLike 已校验合法值）
      enabled: record.enabled === true,
      isDefault: record.isDefault === true,
      apiKey: secrets[record.id], // 密钥只来自本地 secrets（缺失 → undefined，hasKey=false）
    }));
  }

  /**
   * 原子写：共享配置与本地密钥分文件落盘。
   * - providers.json：记录本体（剥离 apiKey——共享配置绝不含密钥）
   * - secrets.json：仅当前记录集中有密钥的 id（删除记录即清其密钥）
   * 写入前执行 isDefault 唯一性归一；返回归一化后的记录列表（含 apiKey）。
   */
  async save(records: ProviderConfigRecord[]): Promise<ProviderConfigRecord[]> {
    const normalized = enforceDefaultUniqueness(records);
    const shared = normalized.map((record) => {
      const { apiKey: _omit, ...rest } = record;
      return rest;
    });
    await writeAtomic(this.filePath, `${JSON.stringify({ records: shared }, null, 2)}\n`);
    const keys: Record<string, string> = {};
    for (const record of normalized) {
      if (typeof record.apiKey === 'string' && record.apiKey.length > 0) {
        keys[record.id] = record.apiKey;
      }
    }
    await this.secretsStore.save(keys);
    return normalized;
  }
}

/** 共享配置路径：<mini-service>/providers.json（入库，人人同一份）。 */
export function defaultStorePath(): string {
  return join(import.meta.dir, '..', 'providers.json');
}

/** 本地密钥路径：<mini-service>/data/secrets.json（gitignored，绝不入库）。 */
export function defaultSecretsPath(): string {
  return join(import.meta.dir, '..', 'data', 'secrets.json');
}

export const secretsStore = new SecretsStore(defaultSecretsPath());
export const configStore = new ConfigStore(defaultStorePath(), secretsStore);
