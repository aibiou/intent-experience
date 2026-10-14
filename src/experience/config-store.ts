/**
 * 提供方配置存储（S5B；S5B-CONFIG-SURFACE-PROPOSAL-01 裁决选项
 * A——产品负责人指令 2026-10-10：API key 用户自己在页面添加、
 * 可能配置多个不同提供商的对应模型、D-5 隐私再确认不写死任何
 * 提供方）。
 *
 * 存储纪律（隐私六要素 P3-S1-PRIVACY-SIX-01 v0.4.2）：
 * - 要素 4（加密）：API key 仅以密文持久化（AES-256-GCM，
 *   静态加密）；加密密钥与密文分离——加密密钥经环境变量
 *   EXPERIENCE_CONFIG_ENCRYPTION_KEY 注入（32 字节 hex），
 *   不随数据同处存储；key 明文仅运行期内存持有，不进日志、
 *   不进证据产物、不进 git。
 * - 要素 2（存储位置）：生产形态 = 中国大陆（cn）/ 阿里云 /
 *   云存储；本机开发形态为本地 data/ 目录（.gitignore 排除，
 *   绝不提交）。
 * - D-3 多记录配置模型：每提供方一条配置（provider / model /
 *   endpoint / key 密文引用），可多条并存；单条启用（用户经
 *   页面选择）。
 * - D-5 隐私再确认：确认记录经通用模板签署（模板
 *   PRIVACY-RECONFIRM-GENERIC/V1——提供方名称于签署时填写，
 *   不写死任何提供方——S5A-SEMANTIC-FREEZE-01 v1.1.0）；
 *   确认人 = 产品负责人 + 安全负责人双重身份；未确认提供方
 *   的配置不得启用。
 * - 提供方配置双形态（S5B-SEMANTIC-FREEZE-01 v1.1.0——产品
 *   负责人指令 2026-10-10：取消提供方准入登记）：任何
 *   chat-completions 兼容提供方由用户自定义配置（端点 +
 *   模型 + API key），无需登记；PROVIDER_PROFILES 仅作预设
 *   （缺省端点 / 温度 / 系统提示词回退），非准入清单。
 *
 * 治理约束：读操作（list / 查询）永不返回 key 明文或密文——
 * 仅 hasKey 标记；密文解密仅服务于运行期网关构造。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { join } from 'node:path';
import {
  DEFAULT_PROVIDER_SYSTEM_PROMPT,
  DEFAULT_PROVIDER_TEMPERATURE,
  PROVIDER_PROFILES,
} from './llm-gateway';

export type ProviderModality = 'text' | 'voice' | 'image' | 'video';

export const PROVIDER_MODALITIES: readonly ProviderModality[] = [
  'text',
  'voice',
  'image',
  'video',
];

export const MODALITY_LABELS: Record<ProviderModality, string> = {
  text: '文本',
  voice: '语音',
  image: '图像',
  video: '视频',
};

function normalizeModality(value: unknown): ProviderModality {
  return value === 'voice' || value === 'image' || value === 'video'
    ? value
    : 'text';
}

/** 配置记录（key 仅存密文引用——内存与持久化形态均不含明文）。 */
export interface ProviderConfigRecord {
  id: string;
  provider: string;
  model: string;
  /** chat-completions 兼容端点（用户自定义——预设提供方缺省回退）。 */
  endpoint: string;
  /** 生成模态（文本 / 语音 / 图像 / 视频——产品负责人
   * 指令 2026-10-10：模型按模态分类，每模态至多一条
   * 启用）。默认 text（既有记录迁移）。 */
  modality: ProviderModality;
  /** AES-256-GCM 密文引用：base64(iv).base64(ciphertext).base64(tag)。 */
  keyCiphertext: string;
  createdAt: string;
  updatedAt: string;
  /** 启用时间（null = 未启用；同时至多一条启用）。 */
  enabledAt: string | null;
}

/** 配置摘要（API 读形态——无 key 任何形态，hasKey 仅标记存在）。 */
export interface ProviderConfigSummary {
  id: string;
  provider: string;
  model: string;
  endpoint: string;
  modality: ProviderModality;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
  providerConfirmed: boolean;
  hasKey: true;
}

/** 隐私再确认记录（通用模板——提供方名称于签署时填写）。 */
export interface PrivacyConfirmationRecord {
  provider: string;
  template: string;
  confirmedBy: string;
  statement: string;
  confirmedAt: string;
}

export type ConfigStoreErrorCode =
  | 'CONFIG_ENCRYPTION_KEY_MISSING'
  | 'CONFIG_ENCRYPTION_KEY_INVALID'
  | 'CONFIG_STORE_CORRUPT'
  | 'CONFIG_CONFIRMATION_STORE_CORRUPT'
  | 'CONFIG_CIPHERTEXT_INVALID'
  | 'CONFIG_DECRYPT_FAILED'
  | 'CONFIG_NOT_FOUND'
  | 'PROVIDER_REQUIRED'
  | 'PROVIDER_NOT_CONFIRMED'
  | 'CONFIG_ENDPOINT_REQUIRED'
  | 'CONFIG_ENDPOINT_INVALID'
  | 'MODEL_REQUIRED'
  | 'API_KEY_REQUIRED';

// 字段显式声明（不用构造函数 parameter property——Node 原生
// 类型剥离（strip-only）不支持该语法，进程内证据执行器经
// module.registerHooks 直接加载本源字节）
export class ConfigStoreError extends Error {
  public readonly code: ConfigStoreErrorCode;

  constructor(code: ConfigStoreErrorCode, message: string) {
    super(message);
    this.name = 'ConfigStoreError';
    this.code = code;
  }
}

const CONFIRMATION_TEMPLATE = 'PRIVACY-RECONFIRM-GENERIC/V1';
const CONFIRMER_IDENTITY = 'product-owner+security-owner';

// ---------------------------------------------------------------------------
// 加密（AES-256-GCM；密钥分离——加密密钥经环境变量注入，不随密文存储）
// ---------------------------------------------------------------------------

function encryptionKey(): Buffer {
  const raw = process.env.EXPERIENCE_CONFIG_ENCRYPTION_KEY ?? '';
  if (raw.length === 0) {
    throw new ConfigStoreError(
      'CONFIG_ENCRYPTION_KEY_MISSING',
      'EXPERIENCE_CONFIG_ENCRYPTION_KEY is required to persist provider API keys (key separation: the encryption key is injected via env var and never stored alongside the ciphertext)',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new ConfigStoreError(
      'CONFIG_ENCRYPTION_KEY_INVALID',
      'EXPERIENCE_CONFIG_ENCRYPTION_KEY must be 32 bytes hex-encoded (64 hex characters)',
    );
  }
  return Buffer.from(raw, 'hex');
}

function encryptApiKey(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${ciphertext.toString('base64')}.${tag.toString('base64')}`;
}

function decryptApiKey(ref: string): string {
  const key = encryptionKey();
  const parts = ref.split('.');
  if (parts.length !== 3) {
    throw new ConfigStoreError('CONFIG_CIPHERTEXT_INVALID', 'malformed API key ciphertext reference');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  try {
    return Buffer.concat([decipher.update(Buffer.from(parts[1], 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new ConfigStoreError('CONFIG_DECRYPT_FAILED', 'API key decryption failed (wrong encryption key or corrupted ciphertext)');
  }
}

// ---------------------------------------------------------------------------
// 持久化（原子写：临时文件 + rename；进程内内存缓存，变更即失效）
// ---------------------------------------------------------------------------

interface StoreData {
  records: ProviderConfigRecord[];
}

interface ConfirmationData {
  confirmations: PrivacyConfirmationRecord[];
}

function storePath(): string {
  return (
    process.env.EXPERIENCE_CONFIG_STORE_PATH ??
    join(process.cwd(), 'data/config/provider-configs.json')
  );
}

function confirmationPath(): string {
  return (
    process.env.EXPERIENCE_CONFIG_CONFIRMATION_PATH ??
    join(process.cwd(), 'data/config/privacy-confirmations.json')
  );
}

async function loadStore(): Promise<StoreData> {
  try {
    const parsed = JSON.parse(await readFile(storePath(), 'utf8')) as StoreData;
    if (!Array.isArray(parsed.records)) throw new Error('records must be an array');
    for (const record of parsed.records) {
      if (!record.modality) record.modality = 'text';
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { records: [] };
    }
    throw new ConfigStoreError('CONFIG_STORE_CORRUPT', `provider config store is unreadable: ${(error as Error).message}`);
  }
}

async function persistStore(data: StoreData): Promise<void> {
  const target = storePath();
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}

async function loadConfirmations(): Promise<ConfirmationData> {
  try {
    const parsed = JSON.parse(await readFile(confirmationPath(), 'utf8')) as ConfirmationData;
    if (!Array.isArray(parsed.confirmations)) throw new Error('confirmations must be an array');
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { confirmations: [] };
    }
    throw new ConfigStoreError(
      'CONFIG_CONFIRMATION_STORE_CORRUPT',
      `privacy confirmation store is unreadable: ${(error as Error).message}`,
    );
  }
}

async function persistConfirmations(data: ConfirmationData): Promise<void> {
  const target = confirmationPath();
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}

function newId(): string {
  return `pc_${randomBytes(8).toString('hex')}`;
}

function confirmedProviders(confirmations: PrivacyConfirmationRecord[]): Set<string> {
  return new Set(confirmations.map((record) => record.provider));
}

function summarize(record: ProviderConfigRecord, isConfirmed: boolean): ProviderConfigSummary {
  return {
    id: record.id,
    provider: record.provider,
    model: record.model,
    endpoint: record.endpoint,
    modality: record.modality,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    enabled: record.enabledAt !== null,
    providerConfirmed: isConfirmed,
    hasKey: true,
  };
}

// ---------------------------------------------------------------------------
// 运行期网关注入（S5B——server-runtime 委托网关消费；解密仅此一处）
// ---------------------------------------------------------------------------

/** 端点解析（S5B v1.1.0——记录端点优先，预设缺省回退；均无则拒绝）。 */
function resolveEndpoint(record: ProviderConfigRecord): string {
  const endpoint = record.endpoint ?? PROVIDER_PROFILES[record.provider]?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new ConfigStoreError(
      'CONFIG_ENDPOINT_REQUIRED',
      `provider '${record.provider}' has no endpoint — custom providers require a chat-completions-compatible endpoint (S5B-SEMANTIC-FREEZE-01 v1.1.0)`,
    );
  }
  return endpoint;
}

/** 运行期内部：已启用配置（含解密 key——仅供网关构造，永不外泄）。 */
export interface EnabledProviderConfig {
  provider: string;
  model: string;
  endpoint: string;
  modality: ProviderModality;
  temperature: number;
  systemPrompt: string;
  apiKey: string;
  /** 最大输出 Token 数（官方 max_tokens——可选）。 */
  maxTokens?: number;
  /** 核采样参数（官方 top_p——可选）。 */
  topP?: number;
  /** Thinking 模式（官方 chat_template_kwargs.enable_thinking——可选）。 */
  enableThinking?: boolean;
}

function toEnabledConfig(record: ProviderConfigRecord): EnabledProviderConfig {
  const profile = PROVIDER_PROFILES[record.provider];
  return {
    provider: record.provider,
    model: record.model,
    endpoint: resolveEndpoint(record),
    modality: record.modality,
    temperature: profile?.temperature ?? DEFAULT_PROVIDER_TEMPERATURE,
    systemPrompt: profile?.systemPrompt ?? DEFAULT_PROVIDER_SYSTEM_PROMPT,
    apiKey: decryptApiKey(record.keyCiphertext),
  };
}

/**
 * 运行期内部：按模态加载已启用配置（含解密 key——仅供
 * 生成网关构造，key 任何形态不外泄）。文本模态即对话
 * 模型（S5B 委托网关消费路径——行为零变化）。
 */
export async function getEnabledProviderConfigForModality(
  modality: ProviderModality,
): Promise<EnabledProviderConfig | null> {
  const store = await loadStore();
  const enabled = store.records.find(
    (record) => record.modality === modality && record.enabledAt !== null,
  );
  if (!enabled) return null;
  return toEnabledConfig(enabled);
}

export async function getEnabledProviderConfig(): Promise<EnabledProviderConfig | null> {
  const store = await loadStore();
  // 文本模态（S5B 委托网关——对话模型路径仅消费
  // 文本模态的启用记录；生成模态经
  // getEnabledProviderConfigForModality 解析）。
  const enabled = store.records.find(
    (record) => record.modality === 'text' && record.enabledAt !== null,
  );
  if (!enabled) return null;
  return toEnabledConfig(enabled);
}

/** 运行期内部：按 id 加载配置（含解密 key——仅供模型识别等运行期用途，
 * key 任何形态不返回客户端；S5B-SEMANTIC-FREEZE-01 v1.3.0）。 */
export async function getProviderConfigById(id: string): Promise<EnabledProviderConfig | null> {
  const store = await loadStore();
  const record = store.records.find((candidate) => candidate.id === id);
  if (!record) return null;
  return toEnabledConfig(record);
}

/**
 * 启动期同步判定（server-runtime 配置解析优先级用——进程启动时
 * 调用一次）：是否存在已启用的页面持久化配置。存储损坏时拒绝
 * 启动（不静默回退——与 S5 环境变量形态同一纪律）。
 */
export function hasEnabledPersistedConfigSync(): boolean {
  try {
    if (!existsSync(storePath())) return false;
    const parsed = JSON.parse(readFileSync(storePath(), 'utf8')) as StoreData;
    // 仅文本模态（对话模型路径）——生成模态的启用
    // 不改变对话网关解析（合成 / 环境变量形态不变）。
    return Array.isArray(parsed.records) && parsed.records.some(
      (record) => (record.modality ?? 'text') === 'text' && record.enabledAt !== null,
    );
  } catch (error) {
    throw new ConfigStoreError(
      'CONFIG_STORE_CORRUPT',
      `provider config store is unreadable: ${(error as Error).message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 配置面 API（S5B D-4——读操作永不返回 key 任何形态）
// ---------------------------------------------------------------------------

/** 已验证提供方预设（S5B v1.1.0——预设非准入：自定义配置无需登记）。 */
export function registeredProviders(): string[] {
  return Object.keys(PROVIDER_PROFILES);
}

export function providerDefaultModel(provider: string): string | undefined {
  return PROVIDER_PROFILES[provider]?.defaultModel;
}

/** 预设缺省端点（表单自动填充——S5B v1.1.0）。 */
export function providerPresetEndpoint(provider: string): string | undefined {
  return PROVIDER_PROFILES[provider]?.endpoint;
}

export async function listProviderConfigs(): Promise<ProviderConfigSummary[]> {
  const store = await loadStore();
  const confirmed = confirmedProviders((await loadConfirmations()).confirmations);
  return store.records.map((record) => summarize(record, confirmed.has(record.provider)));
}

export async function listPrivacyConfirmations(): Promise<PrivacyConfirmationRecord[]> {
  return (await loadConfirmations()).confirmations;
}

async function requireRecord(id: string): Promise<{ record: ProviderConfigRecord; store: StoreData }> {
  const store = await loadStore();
  const record = store.records.find((candidate) => candidate.id === id);
  if (!record) {
    throw new ConfigStoreError('CONFIG_NOT_FOUND', `provider config '${id}' not found`);
  }
  return { record, store };
}

/** 端点校验（chat-completions 兼容——http(s) URL；S5B-SEMANTIC-FREEZE-01 v1.1.0）。 */
function validateEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (trimmed.length === 0) {
    throw new ConfigStoreError(
      'CONFIG_ENDPOINT_REQUIRED',
      'chat-completions-compatible endpoint URL is required for custom providers (preset providers fill it automatically)',
    );
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('protocol');
    }
  } catch {
    throw new ConfigStoreError(
      'CONFIG_ENDPOINT_INVALID',
      `endpoint must be a valid http(s) URL (chat-completions compatible endpoint), got: ${trimmed}`,
    );
  }
  return trimmed;
}

export async function createProviderConfig(input: {
  provider: string;
  model: string;
  apiKey: string;
  endpoint?: string;
  modality?: ProviderModality;
}): Promise<ProviderConfigSummary> {
  const provider = input.provider.trim();
  if (provider.length === 0) {
    throw new ConfigStoreError('PROVIDER_REQUIRED', 'provider name is required');
  }
  const model = input.model.trim();
  if (model.length === 0) {
    throw new ConfigStoreError('MODEL_REQUIRED', 'model name is required');
  }
  const modality = normalizeModality(input.modality);
  if (typeof input.apiKey !== 'string' || input.apiKey.length === 0) {
    throw new ConfigStoreError('API_KEY_REQUIRED', 'API key is required — it is persisted only as AES-256-GCM ciphertext');
  }
  // 端点解析：用户自定义端点优先；未提供时回退预设缺省（S5B v1.1.0）。
  const endpoint = validateEndpoint(
    typeof input.endpoint === 'string' && input.endpoint.trim().length > 0
      ? input.endpoint
      : (PROVIDER_PROFILES[provider]?.endpoint ?? ''),
  );
  const store = await loadStore();
  const now = new Date().toISOString();
  const record: ProviderConfigRecord = {
    id: newId(),
    provider,
    model,
    endpoint,
    modality,
    keyCiphertext: encryptApiKey(input.apiKey),
    createdAt: now,
    updatedAt: now,
    enabledAt: null,
  };
  store.records.push(record);
  await persistStore(store);
  const confirmed = confirmedProviders((await loadConfirmations()).confirmations);
  return summarize(record, confirmed.has(record.provider));
}

export async function updateProviderConfig(
  id: string,
  input: { model?: string; apiKey?: string; endpoint?: string },
): Promise<ProviderConfigSummary> {
  const { record, store } = await requireRecord(id);
  const model = input.model?.trim();
  if (input.model !== undefined && (model === undefined || model.length === 0)) {
    throw new ConfigStoreError('MODEL_REQUIRED', 'model name is required');
  }
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length === 0)) {
    throw new ConfigStoreError('API_KEY_REQUIRED', 'API key must be a non-empty string when provided');
  }
  record.model = model ?? record.model;
  if (typeof input.endpoint === 'string') {
    record.endpoint = validateEndpoint(input.endpoint);
  }
  if (input.apiKey) {
    record.keyCiphertext = encryptApiKey(input.apiKey);
  }
  record.updatedAt = new Date().toISOString();
  await persistStore(store);
  const confirmed = confirmedProviders((await loadConfirmations()).confirmations);
  return summarize(record, confirmed.has(record.provider));
}

export async function deleteProviderConfig(id: string): Promise<void> {
  const { store } = await requireRecord(id);
  store.records = store.records.filter((record) => record.id !== id);
  await persistStore(store);
}

/**
 * 按模态克隆（产品负责人指令 2026-10-10：一次
 * 配置、多模态选用——复制源记录的端点与 key
 * 密文引用（不经明文——克隆路径不接触明文），
 * 仅模态与模型不同）。
 */
export async function cloneConfigForModality(
  id: string,
  input: { modality: ProviderModality; model: string },
): Promise<ProviderConfigSummary> {
  const { record, store } = await requireRecord(id);
  const modality = normalizeModality(input.modality);
  const model = input.model.trim();
  if (model.length === 0) {
    throw new ConfigStoreError(
      'MODEL_REQUIRED',
      'model name is required',
    );
  }
  // 幂等（产品负责人指令 2026-10-11：对应模型要选中——
  // 同一提供方 + 模态 + 模型已存在时直接返回既有记录，
  // 重复点选不产生重复配置）。
  const existing = store.records.find(
    (candidate) =>
      candidate.provider === record.provider &&
      candidate.modality === modality &&
      candidate.model === model,
  );
  if (existing) {
    const confirmed = confirmedProviders(
      (await loadConfirmations()).confirmations,
    );
    return summarize(existing, confirmed.has(existing.provider));
  }
  const now = new Date().toISOString();
  const clone: ProviderConfigRecord = {
    id: newId(),
    provider: record.provider,
    model,
    endpoint: record.endpoint,
    modality,
    keyCiphertext: record.keyCiphertext,
    createdAt: now,
    updatedAt: now,
    enabledAt: null,
  };
  store.records.push(clone);
  await persistStore(store);
  const confirmed = confirmedProviders(
    (await loadConfirmations()).confirmations,
  );
  return summarize(clone, confirmed.has(clone.provider));
}

/** D-5 隐私再确认（通用模板——提供方名称于签署时填写，不写死任何提供方）。 */
export async function confirmProviderPrivacy(
  id: string,
  statement: string,
): Promise<PrivacyConfirmationRecord> {
  const { record } = await requireRecord(id);
  const data = await loadConfirmations();
  const confirmation: PrivacyConfirmationRecord = {
    provider: record.provider,
    template: CONFIRMATION_TEMPLATE,
    confirmedBy: CONFIRMER_IDENTITY,
    statement,
    confirmedAt: new Date().toISOString(),
  };
  data.confirmations = data.confirmations.filter((entry) => entry.provider !== record.provider);
  data.confirmations.push(confirmation);
  await persistConfirmations(data);
  return confirmation;
}

export async function enableProviderConfig(id: string): Promise<ProviderConfigSummary> {
  const { record, store } = await requireRecord(id);
  const confirmed = confirmedProviders((await loadConfirmations()).confirmations);
  if (!confirmed.has(record.provider)) {
    throw new ConfigStoreError(
      'PROVIDER_NOT_CONFIRMED',
      `provider '${record.provider}' requires privacy re-confirmation before enabling (S5A-SEMANTIC-FREEZE-01 v1.1.0 D-5: unconfirmed providers cannot be enabled)`,
    );
  }
  // 按模态单条启用（D-3 修订——产品负责人指令 2026-10-10：
  // 模型按模态分类，每模态至多一条启用；其他模态的
  // 启用状态不受影响）。
  for (const candidate of store.records) {
    candidate.enabledAt =
      candidate.modality !== record.modality
        ? candidate.enabledAt
        : candidate.id === record.id
          ? new Date().toISOString()
          : null;
  }
  record.updatedAt = new Date().toISOString();
  await persistStore(store);
  return summarize(record, true);
}

export async function disableProviderConfig(id: string): Promise<ProviderConfigSummary> {
  const { record, store } = await requireRecord(id);
  record.enabledAt = null;
  record.updatedAt = new Date().toISOString();
  await persistStore(store);
  const confirmed = confirmedProviders((await loadConfirmations()).confirmations);
  return summarize(record, confirmed.has(record.provider));
}
