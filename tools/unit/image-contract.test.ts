import { describe, expect, it } from 'vitest';
import {
  buildHunyuanImageRequest,
  hunyuanImageSize,
  imageProviderOf,
  isHunyuanImage35,
  parseHunyuanImageUrl,
} from '../../src/experience/image-contract';
import {
  buildHunyuanImageRequest as buildGatewayRequest,
  imageProviderOf as gatewayProviderOf,
  parseHunyuanImageUrl as parseGatewayUrl,
} from '../../mini-services/model-gateway/src/providers/image-contract';

/**
 * 图像契约（多提供方适配层）——纯函数单测。
 *
 * 覆盖两条链路各自持有的契约副本：主应用
 * src/experience/image-contract.ts 与模型网关
 * mini-services/model-gateway/src/providers/image-contract.ts。
 * 两份必须同源同行为（移植纪律），任一漂移都会在此暴露。
 */

describe('imageProviderOf', () => {
  it('元宝本机桥接 → openai 兼容（不得误入混元自有路径）', () => {
    expect(
      imageProviderOf({
        provider: '元宝本机',
        model: 'yuanbao-app-local',
        endpoint: 'http://127.0.0.1:3210/v1',
      }),
    ).toBe('openai');
    expect(
      gatewayProviderOf({
        name: '元宝本机',
        model: 'yuanbao-app-local',
        baseUrl: 'http://127.0.0.1:3210/v1',
      }),
    ).toBe('openai');
  });

  it('混元生图模型名 → hunyuan', () => {
    expect(
      imageProviderOf({
        provider: '元宝生图',
        model: 'hy-image-v3.5-preview',
        endpoint: 'https://tokenhub.tencentmaas.com/v1',
      }),
    ).toBe('hunyuan');
    expect(
      imageProviderOf({
        provider: 'hunyuan',
        model: 'hy-image-v3',
        endpoint: 'https://tokenhub.tencentmaas.com/v1',
      }),
    ).toBe('hunyuan');
  });

  it('混元端点兜底（模型名被改写时仍走混元契约）', () => {
    expect(
      imageProviderOf({
        provider: 'custom',
        model: 'my-image-alias',
        endpoint: 'https://tokenhub.tencentmaas.com/v1',
      }),
    ).toBe('hunyuan');
    expect(
      imageProviderOf({
        provider: 'custom',
        model: 'my-image-alias',
        endpoint: 'https://example.com/wand/hunyuan-image',
      }),
    ).toBe('hunyuan');
  });

  it('非混元 → openai（Agnes / 未知提供方）', () => {
    expect(
      imageProviderOf({
        provider: 'agnes-com',
        model: 'agnes-image-2.5-flash',
        endpoint: 'https://apihub.agnes-ai.com/v1',
      }),
    ).toBe('openai');
    expect(
      imageProviderOf({
        provider: 'other',
        model: 'foo',
        endpoint: 'https://example.com/v1',
      }),
    ).toBe('openai');
  });
});

describe('isHunyuanImage35', () => {
  it('3.5 与 3.0 分流', () => {
    expect(isHunyuanImage35('hy-image-v3.5-preview')).toBe(true);
    expect(isHunyuanImage35('hy-image-v3')).toBe(false);
  });
});

describe('hunyuanImageSize', () => {
  it('3.5：精确比例 + 2K 档位（面积 ≤ 4M，宽高 ∈ [256,8192]）', () => {
    expect(hunyuanImageSize('16:9', 'hy-image-v3.5-preview')).toBe('2560x1440');
    expect(hunyuanImageSize('1:1', 'hy-image-v3.5-preview')).toBe('2048x2048');
    expect(hunyuanImageSize('21:9', 'hy-image-v3.5-preview')).toBe('3360x1440');
  });
  it('3.0：精确比例 + 1M 面积上限（宽高 ∈ [512,2048]）', () => {
    expect(hunyuanImageSize('16:9', 'hy-image-v3')).toBe('1280x720');
    expect(hunyuanImageSize('1:1', 'hy-image-v3')).toBe('1024x1024');
    expect(hunyuanImageSize('21:9', 'hy-image-v3')).toBe('1512x648');
  });
  it('尺寸全部落在官方约束内', () => {
    const ratios = ['16:9', '9:16', '1:1', '3:4', '4:3', '2:3', '3:2', '21:9'] as const;
    for (const model of ['hy-image-v3.5-preview', 'hy-image-v3']) {
      const is35 = isHunyuanImage35(model);
      const maxArea = is35 ? 16_777_216 : 1024 * 1024;
      const minSide = is35 ? 256 : 512;
      const maxSide = is35 ? 8192 : 2048;
      for (const ratio of ratios) {
        const [w, h] = hunyuanImageSize(ratio, model).split('x').map(Number);
        expect(w).toBeGreaterThanOrEqual(minSide);
        expect(h).toBeGreaterThanOrEqual(minSide);
        expect(w).toBeLessThanOrEqual(maxSide);
        expect(h).toBeLessThanOrEqual(maxSide);
        expect(w * h).toBeLessThanOrEqual(maxArea);
      }
    }
  });
});

describe('buildHunyuanImageRequest', () => {
  it('3.5 → messages 协议 + v35 路径（未给画幅时用面积档位）', () => {
    const { path, body } = buildHunyuanImageRequest('hy-image-v3.5-preview', '一只猫');
    expect(path).toBe('/wand/hunyuan-image/v35-generation');
    expect(body.model).toBe('hy-image-v3.5-preview');
    expect(body.generate_max_pixels).toBe(4_194_304);
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: '一只猫' }] },
    ]);
    expect(body.size).toBeUndefined();
  });

  it('3.5 参考图 → content 追加 image_url 元素', () => {
    const { body } = buildHunyuanImageRequest('hy-image-v3.5-preview', '同款风格', {
      aspectRatio: '9:16',
      referenceImages: ['data:image/png;base64,AAAA'],
    });
    expect(body.size).toBe('1440x2560');
    expect(body.generate_max_pixels).toBeUndefined();
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: '同款风格' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ],
      },
    ]);
  });

  it('3.0 → prompt 协议 + v3 路径（参考图 ≤ 3 张）', () => {
    const { path, body } = buildHunyuanImageRequest('hy-image-v3', '窗台上的猫', {
      aspectRatio: '1:1',
      referenceImages: ['a', 'b', 'c', 'd'],
    });
    expect(path).toBe('/wand/hunyuan-image/v3-generation');
    expect(body.prompt).toBe('窗台上的猫');
    expect(body.size).toBe('1024x1024');
    expect(body.images).toEqual(['a', 'b', 'c']);
  });

  it('seed 仅透传正整数（0 / 负数 / 小数 / 缺省均不发）', () => {
    expect(buildHunyuanImageRequest('hy-image-v3', 'x', { seed: 42 }).body.seed).toBe(42);
    expect(buildHunyuanImageRequest('hy-image-v3', 'x', { seed: 0 }).body.seed).toBeUndefined();
    expect(buildHunyuanImageRequest('hy-image-v3', 'x', { seed: -1 }).body.seed).toBeUndefined();
    expect(buildHunyuanImageRequest('hy-image-v3', 'x', { seed: 1.5 }).body.seed).toBeUndefined();
  });
});

describe('parseHunyuanImageUrl', () => {
  it('3.5 单帧 JSON → choices[0].delta.image.url', () => {
    const raw = JSON.stringify({
      object: 'image.chat.completion.chunk',
      choices: [{ index: 0, delta: { type: 'image', image: { url: 'https://cdn.example/a.png' } }, finish_reason: null }],
    });
    expect(parseHunyuanImageUrl(raw)).toBe('https://cdn.example/a.png');
  });

  it('3.0 单帧 JSON → data[0].url', () => {
    const raw = JSON.stringify({ data: [{ url: 'https://cdn.example/b.png', revised_prompt: 'p' }] });
    expect(parseHunyuanImageUrl(raw)).toBe('https://cdn.example/b.png');
  });

  it('SSE 文本兜底 → 取最后一条含图帧', () => {
    const raw = [
      'data: {"choices":[{"delta":{"type":"text"}}]}',
      '',
      'data: {"choices":[{"delta":{"image":{"url":"https://cdn.example/first.png"}}}]}',
      '',
      'data: {"choices":[{"delta":{"image":{"url":"https://cdn.example/last.png"}}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    expect(parseHunyuanImageUrl(raw)).toBe('https://cdn.example/last.png');
  });

  it('无图 / 空体 / 非 JSON → undefined', () => {
    expect(parseHunyuanImageUrl('')).toBeUndefined();
    expect(parseHunyuanImageUrl('   ')).toBeUndefined();
    expect(parseHunyuanImageUrl('{"choices":[{"delta":{}}]}')).toBeUndefined();
    expect(parseHunyuanImageUrl('not json at all')).toBeUndefined();
    expect(
      parseHunyuanImageUrl('{"choices":[{"delta":{},"finish_reason":"error"}]}'),
    ).toBeUndefined();
  });
});

describe('模型网关副本与主应用同源', () => {
  it('provider 判定一致', () => {
    expect(
      gatewayProviderOf({
        name: '元宝生图',
        model: 'hy-image-v3.5-preview',
        baseUrl: 'https://tokenhub.tencentmaas.com/v1',
      }),
    ).toBe('hunyuan');
    expect(
      gatewayProviderOf({
        name: 'other',
        model: 'agnes-image-2.5-flash',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
      }),
    ).toBe('openai');
  });
  it('请求体构造一致', () => {
    expect(buildGatewayRequest('hy-image-v3.5-preview', '一只猫', { aspectRatio: '16:9' })).toEqual(
      buildHunyuanImageRequest('hy-image-v3.5-preview', '一只猫', { aspectRatio: '16:9' }),
    );
    expect(buildGatewayRequest('hy-image-v3', '一只猫')).toEqual(
      buildHunyuanImageRequest('hy-image-v3', '一只猫'),
    );
  });
  it('响应解析一致', () => {
    const raw = JSON.stringify({
      choices: [{ delta: { image: { url: 'https://cdn.example/x.png' } } }],
    });
    expect(parseGatewayUrl(raw)).toBe(parseHunyuanImageUrl(raw));
  });
});
