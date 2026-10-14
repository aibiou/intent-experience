/// <reference types="bun-types" />
import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConfigStore,
  defaultStorePath,
  enforceDefaultUniqueness,
  maskApiKey,
  summarizeRecord,
  type ProviderConfigRecord,
  type ProviderModality,
} from '../src/config-store';

/**
 * 提供方配置持久化（config-store.ts）——统一配置源后的只读适配层。
 * 网关从主应用 data/config/provider-configs.json（AES-256-GCM 加密密钥）
 * 读取配置；不再直接写入，不再本地存密钥。
 */

/** 主应用配置记录格式（provider-configs.json 中的形态）。 */
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

function makeRecord(
  overrides: Partial<ProviderConfigRecord> = {},
): ProviderConfigRecord {
  return {
    id: 'p1',
    name: '测试提供方',
    kind: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model',
    modality: 'text',
    enabled: true,
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMainRecord(
  overrides: Partial<MainAppRecord> = {},
): MainAppRecord {
  return {
    id: 'p1',
    provider: '测试提供方',
    model: 'test-model',
    endpoint: 'https://api.example.com/v1',
    modality: 'text',
    keyCiphertext: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    enabledAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** 测试用加密密钥（32 字节 hex）与 AES-256-GCM 加密（对齐主应用密文格式）。 */
const TEST_KEY_HEX = randomBytes(32).toString('hex');

function encryptApiKey(plain: string): string {
  const key = Buffer.from(TEST_KEY_HEX, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${encrypted.toString('base64')}.${tag.toString('base64')}`;
}

describe('纯函数：掩码 / 摘要 / 默认推导', () => {
  it('maskApiKey：保留整个密钥串的后 4 位', () => {
    expect(maskApiKey('sk-abcdefgh')).toBe('sk-***efgh');
    expect(maskApiKey('sk-secret123')).toBe('sk-***t123');
  });

  it('maskApiKey：过短（<=4 位）/非字符串 → 完全掩蔽', () => {
    expect(maskApiKey('abcd')).toBe('sk-****');
    expect(maskApiKey('')).toBe('sk-****');
    expect(maskApiKey(undefined as unknown as string)).toBe('sk-****');
  });

  it('summarizeRecord：有密钥 → hasKey + 掩码；无密钥 → hasKey=false 全掩蔽', () => {
    const withKey = summarizeRecord(makeRecord({ apiKey: 'sk-secret123' }));
    expect(withKey.hasKey).toBe(true);
    expect(withKey.apiKeyMasked).toBe('sk-***t123');
    const withoutKey = summarizeRecord(makeRecord());
    expect(withoutKey.hasKey).toBe(false);
    expect(withoutKey.apiKeyMasked).toBe('sk-****');
  });

  it('enforceDefaultUniqueness：同模态多条启用 → 第一条推导为默认', () => {
    const first = makeRecord({ id: 'p1' });
    const second = makeRecord({ id: 'p2' });
    const [a, b] = enforceDefaultUniqueness([first, second]);
    expect(a.isDefault).toBe(true);
    expect(b.isDefault).toBe(false);
  });

  it('enforceDefaultUniqueness：不同模态的启用记录互不影响', () => {
    const textDef = makeRecord({ id: 'p1', modality: 'text' });
    const voiceDef = makeRecord({ id: 'p2', modality: 'voice' });
    const [a, b] = enforceDefaultUniqueness([textDef, voiceDef]);
    expect(a.isDefault).toBe(true);
    expect(b.isDefault).toBe(true);
  });

  it('enforceDefaultUniqueness：停用记录不参与默认推导', () => {
    const disabled = makeRecord({ id: 'p1', enabled: false });
    const enabled = makeRecord({ id: 'p2' });
    const [a, b] = enforceDefaultUniqueness([disabled, enabled]);
    expect(a.isDefault).toBe(false);
    expect(b.isDefault).toBe(true);
  });

  it('enforceDefaultUniqueness：全部停用 → 无默认', () => {
    const records = [
      makeRecord({ id: 'p1', enabled: false }),
      makeRecord({ id: 'p2', enabled: false }),
    ];
    expect(records.map((r) => r.isDefault)).toEqual([false, false]);
  });
});

describe('ConfigStore 主应用配置读取（只读）', () => {
  it('load：主应用记录 → 网关记录（字段映射 + enabledAt 推导）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-cfg-'));
    try {
      const path = join(dir, 'provider-configs.json');
      await writeFile(
        path,
        JSON.stringify({
          records: [
            makeMainRecord({ id: 'p1', provider: 'agnes', endpoint: 'https://agnes.example.com/v1' }),
          ],
        }),
        'utf8',
      );
      const [loaded] = await new ConfigStore(path).load();
      expect(loaded.name).toBe('agnes');
      expect(loaded.baseUrl).toBe('https://agnes.example.com/v1');
      expect(loaded.enabled).toBe(true);
      expect(loaded.isDefault).toBe(true); // 同模态第一条启用 → 推导为默认
      expect(loaded.kind).toBe('openai-compatible');
      expect(loaded.apiKey).toBeUndefined(); // 无密文 → 无密钥
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('load：文件缺失 / 损坏 JSON / records 非数组 → 空列表（不抛异常）', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-cfg-'));
    try {
      const missing = new ConfigStore(join(dir, 'nope.json'));
      expect(await missing.load()).toEqual([]);

      const corrupted = join(dir, 'corrupted.json');
      await writeFile(corrupted, '坏 JSON', 'utf8');
      expect(await new ConfigStore(corrupted).load()).toEqual([]);

      const notObject = join(dir, 'not-object.json');
      await writeFile(notObject, '[]', 'utf8');
      expect(await new ConfigStore(notObject).load()).toEqual([]);

      const badShape = join(dir, 'bad-shape.json');
      await writeFile(badShape, '{"records": "不是数组"}', 'utf8');
      expect(await new ConfigStore(badShape).load()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('load：垃圾行（缺关键字段 / 非法模态）被过滤', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-cfg-'));
    try {
      const path = join(dir, 'provider-configs.json');
      await writeFile(
        path,
        JSON.stringify({
          records: [
            makeMainRecord({ id: 'good' }),
            { provider: '缺 id', model: 'm', endpoint: 'e' },
            makeMainRecord({
              id: 'bad-modality',
              // 故意构造非法模态（磁盘上的垃圾行），绕过类型检查
              modality: 'bogus' as unknown as ProviderModality,
            }),
            makeMainRecord({ id: 'no-model', model: 42 as unknown as string }),
          ],
        }),
        'utf8',
      );
      const loaded = await new ConfigStore(path).load();
      expect(loaded.map((r) => r.id)).toEqual(['good']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('load：enabledAt 为 null → enabled=false 且不参与默认推导', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-cfg-'));
    try {
      const path = join(dir, 'provider-configs.json');
      await writeFile(
        path,
        JSON.stringify({
          records: [
            makeMainRecord({ id: 'p1', enabledAt: null }),
            makeMainRecord({ id: 'p2' }),
          ],
        }),
        'utf8',
      );
      const loaded = await new ConfigStore(path).load();
      expect(loaded[0].enabled).toBe(false);
      expect(loaded[0].isDefault).toBe(false);
      expect(loaded[1].enabled).toBe(true);
      expect(loaded[1].isDefault).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('load：密钥解密——合法密文 + 环境密钥 → 内存明文；无环境变量 → undefined', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-cfg-'));
    try {
      const path = join(dir, 'provider-configs.json');
      const ciphertext = encryptApiKey('sk-abcdefgh');
      await writeFile(
        path,
        JSON.stringify({
          records: [makeMainRecord({ id: 'p1', keyCiphertext: ciphertext })],
        }),
        'utf8',
      );

      // 无环境变量：记录仍加载，密钥为 undefined
      delete process.env.EXPERIENCE_CONFIG_ENCRYPTION_KEY;
      const [noKey] = await new ConfigStore(path).load();
      expect(noKey.name).toBe('测试提供方');
      expect(noKey.apiKey).toBeUndefined();

      // 有环境变量：解密为明文（仅内存持有）
      process.env.EXPERIENCE_CONFIG_ENCRYPTION_KEY = TEST_KEY_HEX;
      try {
        const [withKey] = await new ConfigStore(path).load();
        expect(withKey.apiKey).toBe('sk-abcdefgh');
      } finally {
        delete process.env.EXPERIENCE_CONFIG_ENCRYPTION_KEY;
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('load：损坏密文（段数不符）→ 密钥 undefined，记录不丢弃', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-cfg-'));
    try {
      const path = join(dir, 'provider-configs.json');
      await writeFile(
        path,
        JSON.stringify({
          records: [
            makeMainRecord({ id: 'p1', keyCiphertext: '不是合法密文' }),
          ],
        }),
        'utf8',
      );
      process.env.EXPERIENCE_CONFIG_ENCRYPTION_KEY = TEST_KEY_HEX;
      try {
        const [loaded] = await new ConfigStore(path).load();
        expect(loaded.id).toBe('p1');
        expect(loaded.apiKey).toBeUndefined();
      } finally {
        delete process.env.EXPERIENCE_CONFIG_ENCRYPTION_KEY;
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('save：统一配置源后只读 → 抛出明确错误', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-cfg-'));
    try {
      const store = new ConfigStore(join(dir, 'provider-configs.json'));
      await expect(store.save([makeRecord()])).rejects.toThrow(/read-only/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('defaultStorePath：环境变量 EXPERIENCE_CONFIG_STORE_PATH 覆盖默认路径', () => {
    const prev = process.env.EXPERIENCE_CONFIG_STORE_PATH;
    try {
      process.env.EXPERIENCE_CONFIG_STORE_PATH = '/tmp/custom-provider-configs.json';
      expect(defaultStorePath()).toBe('/tmp/custom-provider-configs.json');
    } finally {
      if (prev === undefined) delete process.env.EXPERIENCE_CONFIG_STORE_PATH;
      else process.env.EXPERIENCE_CONFIG_STORE_PATH = prev;
    }
  });
});
