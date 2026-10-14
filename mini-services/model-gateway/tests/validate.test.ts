/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { validateProviderInput } from '../src/validate';
import type { ProviderConfigRecord } from '../src/config-store';

/** POST /api/providers 输入校验（validate.ts）——中文错误消息，HTTP 层映射 400。 */

function makeRecord(
  overrides: Partial<ProviderConfigRecord> = {},
): ProviderConfigRecord {
  return {
    id: 'p1',
    name: '现有提供方',
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

const VALID_INPUT = {
  name: '新提供方',
  baseUrl: 'https://api.new.example.com/v1',
  apiKey: '',
  model: 'new-model',
  modality: 'text',
  enabled: true,
  isDefault: false,
};

describe('validateProviderInput 校验', () => {
  it('合法输入 → ok，缺省值：enabled=true、isDefault=false、modality=text', () => {
    const result = validateProviderInput(
      { name: '新提供方', baseUrl: 'https://api.example.com/v1', apiKey: '', model: 'm' },
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.enabled).toBe(true);
      expect(result.value.isDefault).toBe(false);
      expect(result.value.modality).toBe('text');
      expect(result.value.apiKey).toBe('');
    }
  });

  it('字段修剪：name/baseUrl/model 去首尾空白', () => {
    const result = validateProviderInput(
      {
        ...VALID_INPUT,
        name: '  新提供方  ',
        baseUrl: '  https://api.example.com/v1  ',
        model: '  m  ',
      },
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('新提供方');
      expect(result.value.baseUrl).toBe('https://api.example.com/v1');
      expect(result.value.model).toBe('m');
    }
  });

  it('非对象输入（null/数组/字符串）→ 请求体必须是 JSON 对象', () => {
    for (const bad of [null, [], 'x', 42]) {
      const result = validateProviderInput(bad, []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toBe('请求体必须是 JSON 对象');
    }
  });

  it('name 缺失/空串/纯空白 → 必填错误', () => {
    for (const name of [undefined, '', '   ']) {
      const result = validateProviderInput({ ...VALID_INPUT, name }, []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/name 不能为空/);
    }
  });

  it('baseUrl 缺失/空串 → 必填错误', () => {
    for (const baseUrl of [undefined, '', '   ']) {
      const result = validateProviderInput({ ...VALID_INPUT, baseUrl }, []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/baseUrl 不能为空/);
    }
  });

  it('baseUrl 非 http(s) 开头 → 协议错误', () => {
    for (const baseUrl of ['ftp://x.example.com', 'example.com/v1', 'https:/漏斜杠']) {
      const result = validateProviderInput({ ...VALID_INPUT, baseUrl }, []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/必须以 http:\/\/ 或 https:\/\//);
    }
  });

  it('model 缺失/空串 → 必填错误', () => {
    for (const model of [undefined, '', '   ']) {
      const result = validateProviderInput({ ...VALID_INPUT, model }, []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/model 不能为空/);
    }
  });

  it('apiKey 非字符串 → 类型错误（密钥分离：允许空串，不允许其它类型）', () => {
    const result = validateProviderInput({ ...VALID_INPUT, apiKey: 123 }, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('apiKey 必须是字符串');
  });

  it('apiKey 可省略（新增时暂无私钥）→ 归一为空串', () => {
    const { apiKey: _omit, ...input } = VALID_INPUT;
    const result = validateProviderInput(input, []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.apiKey).toBe('');
  });

  it('modality 非法值 → 明确列出合法值', () => {
    const result = validateProviderInput({ ...VALID_INPUT, modality: 'bogus' }, []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/modality 必须是 text \/ image \/ video \/ voice 之一/);
      expect(result.message).toMatch(/bogus/);
    }
  });

  it('四种模态均合法', () => {
    for (const modality of ['text', 'image', 'video', 'voice'] as const) {
      const result = validateProviderInput({ ...VALID_INPUT, modality }, []);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.modality).toBe(modality);
    }
  });

  it('名称与现有记录重复 → 拒绝（更新自身除外由调用方排除）', () => {
    const existing = [makeRecord({ name: '现有提供方' })];
    const result = validateProviderInput(
      { ...VALID_INPUT, name: '现有提供方' },
      existing,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/名称已存在：现有提供方/);
  });

  it('名称比较用修剪后的值（" 现有提供方 " 也算重复）', () => {
    const existing = [makeRecord({ name: '现有提供方' })];
    const result = validateProviderInput(
      { ...VALID_INPUT, name: '  现有提供方  ' },
      existing,
    );
    expect(result.ok).toBe(false);
  });

  it('enabled / isDefault 非布尔 → 类型错误', () => {
    for (const field of ['enabled', 'isDefault'] as const) {
      const result = validateProviderInput({ ...VALID_INPUT, [field]: 'yes' }, []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(new RegExp(`${field} 必须是布尔值`));
    }
  });

  it('完整合法输入（含模态/标志位）→ 原样保留', () => {
    const result = validateProviderInput(
      {
        ...VALID_INPUT,
        modality: 'voice',
        enabled: false,
        isDefault: true,
        apiKey: 'sk-1234567890',
      },
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.modality).toBe('voice');
      expect(result.value.enabled).toBe(false);
      expect(result.value.isDefault).toBe(true);
      expect(result.value.apiKey).toBe('sk-1234567890');
    }
  });
});
