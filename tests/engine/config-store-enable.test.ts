/// <reference types="bun-types" />
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  ConfigStoreError,
  confirmProviderPrivacy,
  createProviderConfig,
  enableProviderConfig,
  getEnabledProviderConfigForModality,
  listProviderConfigs,
} from '../../src/experience/config-store';

/**
 * 启用语义（config-store.ts enableProviderConfig）——
 * G2-6 多提供方容灾前置（2026-10-14 修订 2026-10-10 单条启用指令）：
 * 启用 = 启用并提升为模态默认（记录前置到同模态之前）；
 * 同模态其余已启用记录保留启用态，成为故障转移候选链。
 * 默认归属由数组序推导（同模态第一条 enabled 记录为默认——
 * 主应用 getEnabledProviderConfigForModality 与网关
 * enforceDefaultUniqueness 同一规则）。
 *
 * 存储纪律：测试用临时目录 + 独立加密密钥，绝不触碰
 * 真实 data/config/provider-configs.json。
 */

const TEST_ENDPOINT = 'https://failover-test.invalid/v1';

let storeDir: string;
let storePath: string;

beforeAll(() => {
  storeDir = mkdtempSync(join(tmpdir(), 'exp-enable-semantics-'));
  storePath = join(storeDir, 'provider-configs.json');
  process.env.EXPERIENCE_CONFIG_STORE_PATH = storePath;
  process.env.EXPERIENCE_CONFIG_CONFIRMATION_PATH = join(
    storeDir,
    'privacy-confirmations.json',
  );
  process.env.EXPERIENCE_CONFIG_ENCRYPTION_KEY = randomBytes(32).toString('hex');
});

afterAll(() => {
  rmSync(storeDir, { recursive: true, force: true });
});

/** 原始持久化形态（数组序即默认推导序）。 */
function rawRecords(): Array<{ id: string; provider: string; modality: string; enabledAt: string | null }> {
  return JSON.parse(readFileSync(storePath, 'utf8')).records;
}

async function createConfirmed(
  provider: string,
  modality: 'text' | 'image' = 'text',
): Promise<string> {
  const summary = await createProviderConfig({
    provider,
    model: `test-model-${provider}`,
    endpoint: TEST_ENDPOINT,
    apiKey: `sk-test-${provider}`,
    modality,
  });
  await confirmProviderPrivacy(summary.id, `确认使用 ${provider}（测试）`);
  return summary.id;
}

describe('启用语义：启用即默认 + 同模态容灾链', () => {
  it('首条启用记录为默认（数组序首条 enabled）', async () => {
    const idA = await createConfirmed('enable-sem-a');
    await enableProviderConfig(idA);
    const raw = rawRecords();
    expect(raw.find((r) => r.id === idA)?.enabledAt).not.toBeNull();
    // 唯一启用记录即默认：运行期解析返回它
    const enabled = await getEnabledProviderConfigForModality('text');
    expect(enabled?.provider).toBe('enable-sem-a');
  });

  it('第二条启用后提升至首位（成为默认），前一条保留启用（容灾候选）', async () => {
    const idB = await createConfirmed('enable-sem-b');
    const idA = rawRecords().find((r) => r.provider === 'enable-sem-a')!.id;
    await enableProviderConfig(idB);
    const raw = rawRecords();
    // 提升：B 排在 A 之前（数组序推导默认归属）
    expect(raw.findIndex((r) => r.id === idB)).toBeLessThan(
      raw.findIndex((r) => r.id === idA),
    );
    // 同模态两条均启用（B 默认，A 容灾候选）
    expect(raw.find((r) => r.id === idA)?.enabledAt).not.toBeNull();
    expect(raw.find((r) => r.id === idB)?.enabledAt).not.toBeNull();
    // 运行期默认解析取首条 enabled = B
    const enabled = await getEnabledProviderConfigForModality('text');
    expect(enabled?.provider).toBe('enable-sem-b');
    // 摘要面：两条均报 enabled
    const summaries = await listProviderConfigs();
    expect(summaries.filter((s) => s.modality === 'text' && s.enabled)).toHaveLength(2);
  });

  it('跨模态启用不影响他模态（文本两条保持启用）', async () => {
    const idC = await createConfirmed('enable-sem-c', 'image');
    await enableProviderConfig(idC);
    const raw = rawRecords();
    expect(raw.find((r) => r.provider === 'enable-sem-c')?.enabledAt).not.toBeNull();
    // 文本模态两条仍启用、序不变（B 在 A 前）
    const textRecords = raw.filter((r) => r.modality === 'text');
    expect(textRecords).toHaveLength(2);
    expect(textRecords.every((r) => r.enabledAt !== null)).toBe(true);
    expect(textRecords[0].provider).toBe('enable-sem-b');
    // 图像模态默认 = C
    const imageEnabled = await getEnabledProviderConfigForModality('image');
    expect(imageEnabled?.provider).toBe('enable-sem-c');
  });

  it('未做隐私再确认的提供方不得启用（PROVIDER_NOT_CONFIRMED）', async () => {
    const summary = await createProviderConfig({
      provider: 'enable-sem-unconfirmed',
      model: 'test-model',
      endpoint: TEST_ENDPOINT,
      apiKey: 'sk-test',
      modality: 'text',
    });
    try {
      await enableProviderConfig(summary.id);
      throw new Error('应当抛出 PROVIDER_NOT_CONFIRMED');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigStoreError);
      expect((error as ConfigStoreError).code).toBe('PROVIDER_NOT_CONFIRMED');
    }
    // 未启用 → 记录保持未启用、位置不变
    expect(rawRecords().find((r) => r.id === summary.id)?.enabledAt).toBeNull();
  });
});
