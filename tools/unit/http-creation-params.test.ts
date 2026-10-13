import { describe, expect, it } from 'vitest';
import { extractCreationParams } from '../../src/experience/http';

/** 1.2MB PNG 的 dataURI（base64 膨胀 ≈1.33× → 字符串约 1.7M
 * 字符——CR-61 前按字符串长度 ≤1.5M 被误杀，参考图从未到达
 * 生成网关）。 */
function dataUriOfBytes(bytes: number): string {
  const payloadLength = Math.ceil((bytes * 4) / 3);
  return `data:image/png;base64,${'A'.repeat(payloadLength)}`;
}

describe('extractCreationParams 参考图过滤（CR-61）', () => {
  it('1.2MB PNG 的 dataURI 通过（解码字节 ≤1.5MB——不再按字符串长度误杀）', () => {
    const out = extractCreationParams({
      reference_images: [dataUriOfBytes(1_200_000)],
    });
    expect(out.referenceImages?.length).toBe(1);
  });

  it('1.5MB 边界内通过', () => {
    const out = extractCreationParams({
      reference_images: [dataUriOfBytes(1_400_000)],
    });
    expect(out.referenceImages?.length).toBe(1);
  });

  it('超过 1.5MB 解码字节被拒', () => {
    const out = extractCreationParams({
      reference_images: [dataUriOfBytes(2_000_000)],
    });
    expect(out.referenceImages).toBeUndefined();
  });

  it('非 data:image/ 前缀被拒', () => {
    const out = extractCreationParams({
      reference_images: ['data:text/plain;base64,AAAA'],
    });
    expect(out.referenceImages).toBeUndefined();
  });

  it('至多 3 张', () => {
    const refs = Array.from({ length: 5 }, () => dataUriOfBytes(100_000));
    const out = extractCreationParams({ reference_images: refs });
    expect(out.referenceImages?.length).toBe(3);
  });
});
