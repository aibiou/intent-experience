/**
 * 提供方配置持久化（对齐参考仓库 D-3 多记录配置纪律）。
 *
 * - 存储：data/config.json，格式 {"records": ProviderConfigRecord[]}。
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

export interface ProviderConfigRecord {
  id: string; // crypto.randomUUID()
  name: string; // 显示名，唯一（如 "newapi"、"公司中转"）
  kind: 'openai-compatible';
  baseUrl: string; // 完整 base，如 https://api.example.com/v1（网关拼 /chat/completions）
  apiKey: string;
  model: string; // 模型名（如 gpt-4o / deepseek-chat）
  modality: 'text'; // 本切片仅 text（图/视频/语音是后续切片）
  enabled: boolean;
  isDefault: boolean; // 同时刻最多一条 isDefault=true 的 text 记录
  createdAt: string; // ISO 时间
  updatedAt: string;
}

/** 对外摘要（API 读形态——绝不回完整 key，仅掩码 + hasKey 标记）。 */
export interface ProviderConfigSummary {
  id: string;
  name: string;
  kind: 'openai-compatible';
  baseUrl: string;
  model: string;
  modality: 'text';
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  apiKeyMasked: string; // "sk-***后4位" 形式
  hasKey: true;
}

/** key 脱敏：只保留后 4 位；过短（<=4 位）时完全掩蔽。 */
export function maskApiKey(apiKey: string): string {
  if (typeof apiKey !== 'string' || apiKey.length <= 4) {
    return 'sk-****';
  }
  return `sk-***${apiKey.slice(-4)}`;
}

export function summarizeRecord(record: ProviderConfigRecord): ProviderConfigSummary {
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
    apiKeyMasked: maskApiKey(record.apiKey),
    hasKey: true,
  };
}

/**
 * isDefault 唯一性（纯函数）：多条 isDefault=true 时仅保留第一条，
 * 其余置 false；无 default 时保持原状（删除 default 记录后允许
 * 短暂没有 default——解析链此时回退内置 zai）。
 */
export function enforceDefaultUniqueness(
  records: ProviderConfigRecord[],
): ProviderConfigRecord[] {
  let seen = false;
  return records.map((record) => {
    if (record.isDefault && !seen) {
      seen = true;
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
    typeof r.apiKey === 'string' &&
    typeof r.model === 'string'
  );
}

export class ConfigStore {
  constructor(private readonly filePath: string) {}

  /**
   * 读取记录。文件缺失 / 损坏（非法 JSON、records 非数组）→ 空列表，
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
    return records.filter(isRecordLike).map((record) => ({
      ...record,
      kind: 'openai-compatible' as const,
      modality: 'text' as const,
      enabled: record.enabled === true,
      isDefault: record.isDefault === true,
    }));
  }

  /**
   * 原子写：tmp 文件 + rename（对齐参考仓库 config-store 纪律）。
   * 写入前执行 isDefault 唯一性归一；返回归一化后的记录列表。
   */
  async save(records: ProviderConfigRecord[]): Promise<ProviderConfigRecord[]> {
    const normalized = enforceDefaultUniqueness(records);
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify({ records: normalized }, null, 2)}\n`, 'utf8');
    try {
      await rename(tmp, this.filePath);
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined); // 不留 tmp 残余
      throw error;
    }
    return normalized;
  }
}

/** 服务端单例存储路径：<mini-service>/data/config.json（运行时生成）。 */
export function defaultStorePath(): string {
  return join(import.meta.dir, '..', 'data', 'config.json');
}

export const configStore = new ConfigStore(defaultStorePath());
