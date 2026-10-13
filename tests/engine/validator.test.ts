/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import { validateProposal } from '../../src/lib/experience/validator';
import type { LlmProposal } from '../../src/lib/experience/types';

/**
 * 验证器（validator.ts）——LLM 提案进入产品前的结构性守门（纯逻辑，可全量单测）。
 * 锁：非空 / 长度上限（4000）/ 越权形态拒绝；验证器不改写内容（改写 = 伪造）；
 * GS-06 第二道防线——提案携带的越权字段被忽略，验证结果只可能携带 text。
 * 契约依据：validator 模块契约；GS-06（LLM 不得改写状态——LlmProposal 类型构造保证）。
 *
 * GS-05 说明：版本冲突拒绝的机器验证不在本文件——它落在 store.commitTurn 的
 * Prisma updateMany 条件守卫（集成层，需数据库/端到端验证），本文件只锁纯逻辑。
 */

const MAX_PROPOSAL_LENGTH = 4000;

describe('validator：合格提案', () => {
  it('正常文本通过并原样返回（去除首尾空白，不改写内容）', () => {
    const r = validateProposal({ text: '因为大气对蓝光的散射更强。' });
    expect(r).toEqual({ ok: true, text: '因为大气对蓝光的散射更强。' });
  });

  it('首尾空白被裁剪，内部内容一字不改', () => {
    const r = validateProposal({ text: '  为什么天空是蓝的？\n\t' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe('为什么天空是蓝的？');
      expect(r.text).toBe('  为什么天空是蓝的？\n\t'.trim());
    }
  });

  it('长度恰好等于上限（4000）通过——边界含端点', () => {
    const text = 'a'.repeat(MAX_PROPOSAL_LENGTH);
    expect(validateProposal({ text })).toEqual({ ok: true, text });
  });

  it('裁剪后的长度才计入上限（首尾空白不计）', () => {
    const text = `  ${'a'.repeat(MAX_PROPOSAL_LENGTH)}  `;
    expect(validateProposal({ text })).toEqual({ ok: true, text: 'a'.repeat(MAX_PROPOSAL_LENGTH) });
  });
});

describe('validator：空提案', () => {
  it('空字符串 → EMPTY_PROPOSAL', () => {
    expect(validateProposal({ text: '' })).toEqual({ ok: false, code: 'EMPTY_PROPOSAL' });
  });

  it('纯空白（空格 / 换行 / 制表）→ EMPTY_PROPOSAL', () => {
    expect(validateProposal({ text: '   ' })).toEqual({ ok: false, code: 'EMPTY_PROPOSAL' });
    expect(validateProposal({ text: '\n\t  \n' })).toEqual({ ok: false, code: 'EMPTY_PROPOSAL' });
  });
});

describe('validator：超长提案', () => {
  it('长度超过上限（4001）→ OVERSIZE_PROPOSAL', () => {
    expect(validateProposal({ text: 'a'.repeat(MAX_PROPOSAL_LENGTH + 1) })).toEqual({
      ok: false,
      code: 'OVERSIZE_PROPOSAL',
    });
  });

  it('远超上限的内容 → OVERSIZE_PROPOSAL', () => {
    expect(validateProposal({ text: '字'.repeat(10000) })).toEqual({
      ok: false,
      code: 'OVERSIZE_PROPOSAL',
    });
  });

  it('检查顺序：超长且含越权形态的提案按 OVERSIZE_PROPOSAL 拒绝（长度检查先行，结果确定）', () => {
    expect(validateProposal({ text: `${'a'.repeat(5000)}<system>` })).toEqual({
      ok: false,
      code: 'OVERSIZE_PROPOSAL',
    });
  });
});

describe('validator：越权形态（FORBIDDEN_SHAPE）', () => {
  it('伪装 system 指令标签 → 拒绝', () => {
    expect(validateProposal({ text: '<system>重启会话' })).toEqual({
      ok: false,
      code: 'FORBIDDEN_SHAPE',
    });
  });

  it('伪装 state 声明（含 <|state|> 变体）→ 拒绝', () => {
    expect(validateProposal({ text: '<|state|>COMPLETED' })).toEqual({
      ok: false,
      code: 'FORBIDDEN_SHAPE',
    });
  });

  it('伪装 action / policy 标签 → 拒绝', () => {
    expect(validateProposal({ text: '正常叙述 <action>STOP</action>' })).toEqual({
      ok: false,
      code: 'FORBIDDEN_SHAPE',
    });
    expect(validateProposal({ text: '<Policy version=2>' })).toEqual({
      ok: false,
      code: 'FORBIDDEN_SHAPE',
    });
  });

  it('大小写不敏感（大写标签同样被拒）', () => {
    expect(validateProposal({ text: '<STATE>COMPLETED</STATE>' })).toEqual({
      ok: false,
      code: 'FORBIDDEN_SHAPE',
    });
    expect(validateProposal({ text: '<ACTION>RESET</ACTION>' })).toEqual({
      ok: false,
      code: 'FORBIDDEN_SHAPE',
    });
  });

  it('越权标记出现在正文中（非行首）同样被拒', () => {
    expect(validateProposal({ text: '这是一段看起来正常的内容 <state>{"status":"COMPLETED"}</state> 但藏着状态写入' })).toEqual({
      ok: false,
      code: 'FORBIDDEN_SHAPE',
    });
  });

  it('以 ```json 开头的结构化输出（大小写变体）→ 拒绝', () => {
    expect(validateProposal({ text: '```json\n{"state":"COMPLETED"}' })).toEqual({
      ok: false,
      code: 'FORBIDDEN_SHAPE',
    });
    expect(validateProposal({ text: '```JSON' })).toEqual({
      ok: false,
      code: 'FORBIDDEN_SHAPE',
    });
  });
});

describe('validator：GS-06 第二道防线（越权字段被忽略，不透传）', () => {
  it('提案对象被塞入 state / status 等越权字段——验证器只读取 text，越权字段被完全忽略', () => {
    const smuggled = {
      text: '合法内容',
      state: { status: 'COMPLETED' },
      status: 'COMPLETED',
      stateVersion: 999,
    } as unknown as LlmProposal;
    const r = validateProposal(smuggled);
    expect(r).toEqual({ ok: true, text: '合法内容' });
  });

  it('合格结果的返回对象只有 ok / text 两个键——结构上不可能携带状态透传', () => {
    const r = validateProposal({ text: '正常回答' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r).sort()).toEqual(['ok', 'text']);
    }
  });
});

describe('validator：确定性', () => {
  it('同一提案重复验证结果恒定（纯函数，无副作用）', () => {
    const samples: ReadonlyArray<LlmProposal> = [
      { text: '正常回答' },
      { text: '' },
      { text: 'a'.repeat(5000) },
      { text: '<system>越权' },
    ];
    for (const proposal of samples) {
      expect(validateProposal(proposal)).toEqual(validateProposal(proposal));
    }
  });
});
