/// <reference types="bun-types" />
import { describe, expect, it } from 'bun:test';
import {
  classifyProviderError,
  generateVideo,
  isLocalBridgeRouteUnavailable,
  isLocalBridgeVideoContract,
  MediaProviderError,
  resolveVideoReferencePlan,
} from '../src/providers/media';
import type { ProviderConfigRecord } from '../src/config-store';

/** 本机桥接视频契约判定（media.ts）——纯函数单测。
 * 豆包 App 桥接（tools/doubao-bridge）只实现 OpenAI 兼容
 * /videos/generations（同步产物）；落到 Agnes 契约会被桥接
 * 未知路径兜底拒成 404（实测 2026-10-16）。 */

function makeRecord(
  overrides: Partial<ProviderConfigRecord> = {},
): ProviderConfigRecord {
  return {
    id: 'p1',
    name: '测试提供方',
    kind: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model',
    modality: 'video',
    enabled: true,
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isLocalBridgeVideoContract', () => {
  it('桥接端点（127.0.0.1:3220）→ true（真实记录形态）', () => {
    expect(
      isLocalBridgeVideoContract(
        makeRecord({ name: '豆包本机视频', model: 'doubao-app-local-video', baseUrl: 'http://127.0.0.1:3220/v1' }),
      ),
    ).toBe(true);
  });
  it('桥接模型名（doubao-app-local）→ true（端点端口可变时兜底）', () => {
    expect(
      isLocalBridgeVideoContract(
        makeRecord({ model: 'doubao-app-local-video', baseUrl: 'http://127.0.0.1:9999/v1' }),
      ),
    ).toBe(true);
  });
  it('agnes 端点 → false', () => {
    expect(
      isLocalBridgeVideoContract(
        makeRecord({ model: 'agnes-video-2.5-flash', baseUrl: 'https://apihub.agnes-ai.com/v1' }),
      ),
    ).toBe(false);
  });
  it('seedance 端点 → false（仍归 Seedance 契约判定管）', () => {
    expect(
      isLocalBridgeVideoContract(
        makeRecord({ model: 'doubao-seedance-1-0', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' }),
      ),
    ).toBe(false);
  });
});

describe('isLocalBridgeRouteUnavailable', () => {
  it('元宝 AX 路由丢失 → 阻断故障转移', () => {
    expect(
      isLocalBridgeRouteUnavailable(
        new MediaProviderError('提供方错误：无法切换到 ai 分组', true, 502),
      ),
    ).toBe(true);
  });

  it('上游生成失败 → 仍可按既有策略故障转移', () => {
    expect(
      isLocalBridgeRouteUnavailable(
        new MediaProviderError('提供方错误：等待生成图超时', true, 502),
      ),
    ).toBe(false);
  });

  it('无水印原图取回不足 → 属于本机桥局部失败，阻断故障转移', () => {
    expect(
      isLocalBridgeRouteUnavailable(
        new MediaProviderError('提供方错误：无水印 IndexedDB 原图不足（至少需要 4，得到 0）', true, 502),
      ),
    ).toBe(true);
  });
});

describe('resolveVideoReferencePlan（G1.1 图像→视频参考图消费判定）', () => {
  it('Agnes 契约 + http 参考 → 消费（applied true，images 挂载）', () => {
    const plan = resolveVideoReferencePlan(
      makeRecord({ model: 'agnes-video-2.5-flash', baseUrl: 'https://apihub.agnes-ai.com/v1' }),
      ['https://example.com/cat.png'],
    );
    expect(plan.requested).toBe(true);
    expect(plan.applied).toBe(true);
    expect(plan.images).toEqual(['https://example.com/cat.png']);
  });

  it('Agnes 契约 + 仅 dataURI 参考 → 不消费（applied false——本地图不假装生效）', () => {
    const plan = resolveVideoReferencePlan(
      makeRecord({ model: 'agnes-video-2.5-flash', baseUrl: 'https://apihub.agnes-ai.com/v1' }),
      ['data:image/png;base64,aGVsbG8='],
    );
    expect(plan.requested).toBe(true);
    expect(plan.applied).toBe(false);
    expect(plan.images).toEqual([]);
  });

  it('本机桥接契约 + http 参考 → 消费', () => {
    const plan = resolveVideoReferencePlan(
      makeRecord({ model: 'doubao-app-local-video', baseUrl: 'http://127.0.0.1:3220/v1' }),
      ['https://example.com/cat.png'],
    );
    expect(plan.applied).toBe(true);
  });

  it('Seedance 契约 → 不消费参考（契约未实现图像输入）', () => {
    const plan = resolveVideoReferencePlan(
      makeRecord({ model: 'doubao-seedance-1-0', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' }),
      ['https://example.com/cat.png'],
    );
    expect(plan.requested).toBe(true);
    expect(plan.applied).toBe(false);
    expect(plan.images).toEqual([]);
  });

  it('无参考 → requested false（不产生误导标记）', () => {
    const plan = resolveVideoReferencePlan(
      makeRecord({ model: 'agnes-video-2.5-flash' }),
      undefined,
    );
    expect(plan.requested).toBe(false);
    expect(plan.applied).toBe(false);
  });
});

describe('classifyProviderError（队列满识别——「满了不再反复试」的前提）', () => {
  const queueFullBody = {
    error: { message: 'video queue is full, please retry later (request id: 20261019072121748022681xM66I3Zn)' },
  };

  it('503 + 队列满文案（Agnes 真实形态）→ queueFull true', () => {
    const detail = classifyProviderError(503, queueFullBody);
    expect(detail.queueFull).toBe(true);
    expect(detail.retryable).toBe(true);
    expect(detail.message).toContain('video queue is full');
  });

  it('503 + code video_queue_full → queueFull true（无文案也识别）', () => {
    const detail = classifyProviderError(503, { code: 'video_queue_full' });
    expect(detail.queueFull).toBe(true);
  });

  it('顶层 message 形态的队列满文案 → queueFull true', () => {
    const detail = classifyProviderError(503, {
      message: 'video queue is full, please retry later',
    });
    expect(detail.queueFull).toBe(true);
  });

  it('普通 503（无队列满信号）→ queueFull false，retryable 保持 true', () => {
    const detail = classifyProviderError(503, { message: 'upstream temporarily unavailable' });
    expect(detail.queueFull).toBe(false);
    expect(detail.retryable).toBe(true);
  });

  it('400 参数拒绝 → 两者皆 false（立即报错不重试）', () => {
    const detail = classifyProviderError(400, { message: 'invalid prompt' });
    expect(detail.queueFull).toBe(false);
    expect(detail.retryable).toBe(false);
  });

  it('MediaProviderError 携带 queueFull 标记（同提供方不再排队的判据）', () => {
    const error = new MediaProviderError('提供方「Agnes-com」队列已满', true, 503, false, true);
    expect(error.queueFull).toBe(true);
    const plain = new MediaProviderError('其他错误');
    expect(plain.queueFull).toBe(false);
  });
});

describe('generateVideo 队列满行为（mock fetch：满了不重投）', () => {
  it('Agnes 创建 503 队列满 → 仅提交一次（含创建退避轮与内部重试全跳过）', async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          error: { message: 'video queue is full, please retry later (request id: test-queue)' },
        }),
        { status: 503 },
      );
    }) as typeof fetch;
    try {
      const record = makeRecord({
        model: 'agnes-video-2.5-flash',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
        apiKey: 'test-key',
      });
      await expect(generateVideo(record, '镜头缓缓推进')).rejects.toThrow(/队列已满/);
      expect(calls.length).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
