/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  ProviderResolveError,
  resolveProvider,
  resolveProviderChain,
} from '../src/resolve';
import type { ProviderConfigRecord } from '../src/config-store';

/** 解析链（resolve.ts）——网关路由的核心，全部纯函数。 */

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

describe('resolveProvider 解析链', () => {
  it('链 1：显式 id（启用且模态匹配）→ 该记录', () => {
    const record = makeRecord({ id: 'p1', modality: 'image' });
    const result = resolveProvider([record], 'p1', 'image');
    expect(result).toEqual({ kind: 'record', record });
  });

  it('链 1：显式 id 带空白 → 修剪后匹配', () => {
    const record = makeRecord({ id: 'p1' });
    const result = resolveProvider([record], '  p1  ', 'text');
    expect(result).toEqual({ kind: 'record', record });
  });

  it('链 1：未知 id → PROVIDER_NOT_FOUND', () => {
    try {
      resolveProvider([makeRecord()], 'nope', 'text');
      throw new Error('不应到达');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderResolveError);
      expect((error as ProviderResolveError).code).toBe('PROVIDER_NOT_FOUND');
    }
  });

  it('链 1：已停用记录 → 明确报错', () => {
    const record = makeRecord({ id: 'p1', enabled: false });
    expect(() => resolveProvider([record], 'p1', 'text')).toThrow(/已禁用/);
  });

  it('链 1：模态不匹配（图像记录用于文本）→ PROVIDER_MODALITY_MISMATCH', () => {
    const record = makeRecord({ id: 'p1', modality: 'image' });
    try {
      resolveProvider([record], 'p1', 'text');
      throw new Error('不应到达');
    } catch (error) {
      expect((error as ProviderResolveError).code).toBe(
        'PROVIDER_MODALITY_MISMATCH',
      );
    }
  });

  it('链 1：模态不匹配（文本记录用于语音）→ PROVIDER_MODALITY_MISMATCH', () => {
    const record = makeRecord({ id: 'p1', modality: 'text' });
    expect(() => resolveProvider([record], 'p1', 'voice')).toThrow(
      ProviderResolveError,
    );
  });

  it('链 2：未指定 → 该模态默认且启用的记录', () => {
    const fallback = makeRecord({ id: 'p1', name: '回退' });
    const def = makeRecord({ id: 'p2', name: '默认', isDefault: true });
    const result = resolveProvider([fallback, def], undefined, 'text');
    expect(result).toEqual({ kind: 'record', record: def });
  });

  it('链 2→2b：默认记录已停用 → 回退到第一条启用记录', () => {
    const first = makeRecord({ id: 'p1', name: '第一条' });
    const disabledDefault = makeRecord({
      id: 'p2',
      name: '停用的默认',
      isDefault: true,
      enabled: false,
    });
    const result = resolveProvider([first, disabledDefault], undefined, 'text');
    expect(result).toEqual({ kind: 'record', record: first });
  });

  it('链 2b：无默认 → 该模态第一条启用记录（数组顺序）', () => {
    const first = makeRecord({ id: 'p1', name: '第一' });
    const second = makeRecord({ id: 'p2', name: '第二' });
    const result = resolveProvider([first, second], undefined, 'text');
    expect(result).toEqual({ kind: 'record', record: first });
  });

  it('链 2：同模态多条默认 → 第一条生效（find 语义）', () => {
    const first = makeRecord({ id: 'p1', name: '先', isDefault: true });
    const second = makeRecord({ id: 'p2', name: '后', isDefault: true });
    const result = resolveProvider([first, second], undefined, 'text');
    expect(result).toEqual({ kind: 'record', record: first });
  });

  it('空串/纯空白请求视为未指定（走默认链）', () => {
    const def = makeRecord({ id: 'p1', isDefault: true });
    expect(resolveProvider([def], '', 'text')).toEqual({
      kind: 'record',
      record: def,
    });
    expect(resolveProvider([def], '   ', 'text')).toEqual({
      kind: 'record',
      record: def,
    });
  });

  it('链 3：text 模态无任何记录 → MEDIA_PROVIDER_MISSING（不兜底）', () => {
    try {
      resolveProvider([], undefined, 'text');
      throw new Error('不应到达');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderResolveError);
      expect((error as ProviderResolveError).code).toBe(
        'MEDIA_PROVIDER_MISSING',
      );
      expect((error as ProviderResolveError).message).toMatch(/未配置文本/);
    }
  });

  it('链 3：媒体模态无任何记录 → MEDIA_PROVIDER_MISSING（中文指引）', () => {
    for (const modality of ['image', 'video', 'voice'] as const) {
      try {
        resolveProvider([], undefined, modality);
        throw new Error('不应到达');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderResolveError);
        expect((error as ProviderResolveError).code).toBe(
          'MEDIA_PROVIDER_MISSING',
        );
      }
    }
  });

  it('链 3：模态有记录但全停用 → MEDIA_PROVIDER_MISSING（不伪装）', () => {
    const records = [makeRecord({ modality: 'image', enabled: false })];
    expect(() => resolveProvider(records, undefined, 'image')).toThrow(
      /未配置图像/,
    );
  });

  it('模态隔离：图像记录不参与文本默认链（文本无记录 → 明确报错）', () => {
    const imageOnly = makeRecord({ id: 'p1', modality: 'image', isDefault: true });
    expect(() => resolveProvider([imageOnly], undefined, 'text')).toThrow(
      ProviderResolveError,
    );
  });
});

describe('resolveProviderChain 候选链（G2-6 多提供方容灾）', () => {
  it('未指定 → 默认优先，其余按数组顺序', () => {
    const first = makeRecord({ id: 'p1', name: '首条' });
    const def = makeRecord({ id: 'p2', name: '默认', isDefault: true });
    const second = makeRecord({ id: 'p3', name: '次条' });
    expect(
      resolveProviderChain([first, def, second], undefined, 'text').map((r) => r.id),
    ).toEqual(['p2', 'p1', 'p3']);
  });

  it('多条默认 → 全部入链（默认之间按数组顺序）', () => {
    const d1 = makeRecord({ id: 'p1', isDefault: true });
    const d2 = makeRecord({ id: 'p2', isDefault: true });
    const plain = makeRecord({ id: 'p3' });
    expect(
      resolveProviderChain([d1, d2, plain], undefined, 'text').map((r) => r.id),
    ).toEqual(['p1', 'p2', 'p3']);
  });

  it('停用记录不进入候选链', () => {
    const off = makeRecord({ id: 'p1', enabled: false });
    const on = makeRecord({ id: 'p2' });
    expect(
      resolveProviderChain([off, on], undefined, 'text').map((r) => r.id),
    ).toEqual(['p2']);
  });

  it('停用的默认不抢占——回退到启用记录', () => {
    const on = makeRecord({ id: 'p1', name: '启用' });
    const offDef = makeRecord({
      id: 'p2',
      name: '停用默认',
      isDefault: true,
      enabled: false,
    });
    expect(
      resolveProviderChain([on, offDef], undefined, 'text').map((r) => r.id),
    ).toEqual(['p1']);
  });

  it('该模态无启用记录 → MEDIA_PROVIDER_MISSING（与单解析同语义）', () => {
    expect(() => resolveProviderChain([], undefined, 'text')).toThrow(
      ProviderResolveError,
    );
    try {
      resolveProviderChain([makeRecord({ modality: 'image' })], undefined, 'text');
      throw new Error('不应到达');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderResolveError);
      expect((error as ProviderResolveError).code).toBe('MEDIA_PROVIDER_MISSING');
      expect((error as ProviderResolveError).message).toMatch(/未配置文本/);
    }
  });

  it('模态隔离：图像记录不进入文本候选链', () => {
    const imageOnly = makeRecord({ id: 'p1', modality: 'image', isDefault: true });
    expect(() => resolveProviderChain([imageOnly], undefined, 'text')).toThrow(
      /未配置文本/,
    );
  });

  it('显式指定 → 单候选（确定性选择，不故障转移）', () => {
    const a = makeRecord({ id: 'p1' });
    const b = makeRecord({ id: 'p2' });
    expect(
      resolveProviderChain([a, b], 'p2', 'text').map((r) => r.id),
    ).toEqual(['p2']);
    // 显式 id 不存在 → PROVIDER_NOT_FOUND（同 resolveProvider）
    try {
      resolveProviderChain([a], 'nope', 'text');
      throw new Error('不应到达');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderResolveError);
      expect((error as ProviderResolveError).code).toBe('PROVIDER_NOT_FOUND');
    }
  });

  it('显式指定带空白 → 修剪后匹配', () => {
    const record = makeRecord({ id: 'p1' });
    expect(
      resolveProviderChain([record], '  p1  ', 'text').map((r) => r.id),
    ).toEqual(['p1']);
  });

  it('空串/纯空白视为未指定（走默认链）', () => {
    const def = makeRecord({ id: 'p1', isDefault: true });
    expect(resolveProviderChain([def], '', 'text').map((r) => r.id)).toEqual(['p1']);
    expect(
      resolveProviderChain([def], '   ', 'text').map((r) => r.id),
    ).toEqual(['p1']);
  });
});
