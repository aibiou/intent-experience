/// <reference types="bun-types" />
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import sharp from 'sharp';
import {
  latestImageRecord,
  selectedImageRecord,
  toReferenceDataUri,
  validateReferenceImages,
} from '../../src/lib/experience/media-gateway';
import type { MediaArtifactRecord } from '../../src/lib/experience/media-gateway';

/**
 * 参考图校验与适配（media-gateway.ts）——
 * 官方 extra_body.image 契约（dataURI 白名单：仅 data:image/、
 * 解码后 ≤1.5MB、至多 3 张；非法项静默丢弃）。
 * 契约依据：参考实现 src/experience/http.ts（G2-5 创作闭环——
 * 图生图；CR-61 尺寸纪律：按 base64 负载 ×3/4 估算解码字节，
 * 避免大图被字符串长度误杀导致图生图退化为纯文生）。
 * toReferenceDataUri：提供方 2K 产物系统性超限（实测 Agnes
 * 2K PNG ~1.56MB）——超限产物 JPEG q80 重编码 / 等比缩小适配，
 * 图生图不因产物体积退化为纯文生（e2e 实证：月光猫 1.56MB
 * 产物经适配后参考图成功到达上游）。
 */

const prefix = 'data:image/png;base64,';

describe('参考图校验（官方 extra_body.image 契约）', () => {
  it('合法 dataURI 通过', () => {
    const refs = [`${prefix}aGVsbG8=`];
    expect(validateReferenceImages(refs)).toEqual(refs);
  });

  it('非 data:image/ 前缀丢弃（URL / 纯文本 / 其它 MIME）', () => {
    const out = validateReferenceImages([
      'https://example.com/cat.png',
      '一只猫',
      'data:application/pdf;base64,aGk=',
    ]);
    expect(out).toEqual([]);
  });

  it('无逗号元数据丢弃', () => {
    expect(validateReferenceImages(['data:image/png'])).toEqual([]);
  });

  it('空负载丢弃（逗号后无内容）', () => {
    expect(validateReferenceImages([`${prefix}`])).toEqual([]);
  });

  it('解码后 >1.5MB 丢弃（CR-61 尺寸纪律——payload×3/4 超限）', () => {
    const oversized = `${prefix}${'a'.repeat(2_000_001)}`; // 1_500_000.75 字节
    expect(validateReferenceImages([oversized])).toEqual([]);
  });

  it('恰好 1.5MB 边界通过（≤1.5MB 不误杀）', () => {
    const boundary = `${prefix}${'a'.repeat(2_000_000)}`; // 恰好 1_500_000 字节
    expect(validateReferenceImages([boundary])).toEqual([boundary]);
  });

  it('至多 3 张（多余项截断）', () => {
    const refs = [1, 2, 3, 4, 5].map((n) => `${prefix}${String(n).repeat(8)}`);
    expect(validateReferenceImages(refs)).toEqual(refs.slice(0, 3));
  });

  it('混合输入仅保留合法项（顺序不变）', () => {
    const good1 = `${prefix}Y2F0`;
    const good2 = `${prefix}ZG9n`;
    expect(
      validateReferenceImages(['text', good1, 'data:text/plain;base64,xxx', good2]),
    ).toEqual([good1, good2]);
  });

  it('空输入返回空数组', () => {
    expect(validateReferenceImages([])).toEqual([]);
  });
});

describe('参考图适配（toReferenceDataUri——CR-61 尺寸硬约束）', () => {
  it('≤1.5MB 产物原样透传（同 mime 同字节）', async () => {
    const small = Buffer.from('一只月光下的猫');
    const uri = await toReferenceDataUri(small, 'image/png');
    expect(uri).toBe(`data:image/png;base64,${small.toString('base64')}`);
  });

  it('超限产物压缩至 ≤1.5MB（JPEG 重编码——2K 产物系统性超限的修复）', async () => {
    // 噪声内容（最难压缩形态）构造必然超限的产物：
    // 1600×1600×3 随机像素 → PNG 数 MB（前置条件即断言）。
    const noise = randomBytes(1600 * 1600 * 3);
    const bigPng = await sharp(noise, {
      raw: { width: 1600, height: 1600, channels: 3 },
    })
      .png()
      .toBuffer();
    expect(bigPng.byteLength).toBeGreaterThan(1_500_000);
    const uri = await toReferenceDataUri(bigPng, 'image/png');
    expect(uri).not.toBeNull();
    expect(uri?.startsWith('data:image/jpeg;base64,')).toBe(true);
    const decoded = Buffer.from(uri!.slice(uri!.indexOf(',') + 1), 'base64');
    expect(decoded.byteLength).toBeLessThanOrEqual(1_500_000);
    // 端到端不变量：适配结果能通过契约校验层
    expect(validateReferenceImages([uri!])).toEqual([uri!]);
  });

  it('损坏产物 → null（降级文生图——不阻断生成）', async () => {
    // 超限 + 非图像格式（小件垃圾走原样透传——上限
    // 是契约闸门而非格式闸门；此处触发 sharp 解码失败）
    const garbage = randomBytes(2_000_000);
    const uri = await toReferenceDataUri(garbage, 'image/png');
    expect(uri).toBeNull();
  });
});

describe('会话最新图像产物（latestImageRecord——多轮链的选择核心）', () => {
  const record = (
    turn: number,
    sessionId = 's1',
    modality: 'image' | 'voice' = 'image',
  ): MediaArtifactRecord => ({
    id: `g${turn}`,
    sessionId,
    turn,
    modality,
    file: `f${turn}.png`,
    mime: 'image/png',
    promptUsed: `p${turn}`,
    at: '',
  });

  it('取末条（追加序即时间序——第 N 轮再生成引用第 N-1 轮产物）', () => {
    const records = [record(1), record(2), record(3)];
    expect(latestImageRecord(records, 's1')?.turn).toBe(3);
  });

  it('会话隔离（它会话产物不参与——参考图不串会话）', () => {
    const records = [record(1), record(2, 's2'), record(3)];
    expect(latestImageRecord(records, 's1')?.turn).toBe(3);
    expect(latestImageRecord(records, 's2')?.turn).toBe(2);
  });

  it('模态过滤（语音产物不作图像参考）', () => {
    const records = [record(1), record(2, 's1', 'voice')];
    expect(latestImageRecord(records, 's1')?.turn).toBe(1);
  });

  it('空索引 / 无该会话图像产物 → null（降级文生图）', () => {
    expect(latestImageRecord([], 's1')).toBeNull();
    expect(latestImageRecord([record(1, 's2')], 's1')).toBeNull();
  });
});

describe('用户选中图像产物（selectedImageRecord——G1.1 目标 4）', () => {
  const record = (
    turn: number,
    sessionId = 's1',
    selected?: boolean,
  ): MediaArtifactRecord => ({
    id: `g${turn}`,
    sessionId,
    turn,
    modality: 'image',
    file: `f${turn}.png`,
    mime: 'image/png',
    promptUsed: `p${turn}`,
    at: '',
    ...(selected ? { selected: true } : {}),
  });

  it('有选中时优先取选中（不再隐式取末条）', () => {
    const records = [record(1, 's1', false), record(2, 's1', true)];
    expect(selectedImageRecord(records, 's1')?.turn).toBe(2);
  });

  it('无选中时兜底取末条（兼容旧行为）', () => {
    const records = [record(1, 's1', false), record(2, 's1', false)];
    expect(selectedImageRecord(records, 's1')?.turn).toBe(2);
  });

  it('选中的是第 1 张时（末条是第 3 张）仍取选中', () => {
    const records = [record(1, 's1', true), record(2), record(3)];
    expect(selectedImageRecord(records, 's1')?.turn).toBe(1);
  });

  it('会话隔离', () => {
    const records = [record(1, 's2', true), record(2, 's1')];
    expect(selectedImageRecord(records, 's2')?.turn).toBe(1);
    expect(selectedImageRecord(records, 's1')?.turn).toBe(2);
  });
});
