import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateImage,
  GenerationError,
  humanizeGenerationFailure,
} from '../../src/experience/generation-gateway';
import type { EnabledProviderConfig } from '../../src/experience/config-store';

/**
 * 生成网关瞬态自动重试（callProvider——2026-10-12 体验修复：
 * 用户实测图像生成遇到「出了点问题」，间歇性失败未在产品内消化）：
 * 网络波动 / 限速 / 队列满 / 服务端临时错误——等待 2s 重试一次；
 * 两次仍失败才向上抛（网络失败也标记 retryable，文案指向
 * 「稍后再试」而非「换说法」——输入没错，不该让用户绕圈）。
 * 非瞬态（400 参数类）不重试，保持既有降级语义。
 */

const CONFIG: EnabledProviderConfig = {
  provider: 'newapi',
  model: 'agnes-image-2.5-flash',
  endpoint: 'http://localhost:13000/v1',
  modality: 'image',
  temperature: 1,
  systemPrompt: '',
  apiKey: 'probe-key',
};

const okImage = (url: string) =>
  new Response(JSON.stringify({ data: [{ url }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
const errJson = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('generation transient auto-retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('首次成功 → 单次调用，无重试', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okImage('https://x.example/ok.png'));
    vi.stubGlobal('fetch', fetchMock);
    const artifact = await generateImage(CONFIG, 'prompt');
    expect(artifact.url).toBe('https://x.example/ok.png');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('瞬态 503 → 等待 2s 重试一次并成功（用户无感）', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errJson(503, 'image queue is full, please retry later'))
      .mockResolvedValueOnce(okImage('https://x.example/retry.png'));
    vi.stubGlobal('fetch', fetchMock);
    const promise = generateImage(CONFIG, 'prompt');
    await vi.advanceTimersByTimeAsync(2_000);
    const artifact = await promise;
    expect(artifact.url).toBe('https://x.example/retry.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('限速 429 → 等待 60s（官方指引）后重试并成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errJson(429, 'rate limit exceeded, RPM 20'))
      .mockResolvedValueOnce(okImage('https://x.example/after-429.png'));
    vi.stubGlobal('fetch', fetchMock);
    const promise = generateImage(CONFIG, 'prompt');
    // 官方错误码指引：429 免费档 RPM 20——等待 1 分钟后重试。
    await vi.advanceTimersByTimeAsync(60_000);
    const artifact = await promise;
    expect(artifact.url).toBe('https://x.example/after-429.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('两次 429 → 等待 60s 后抛 retryable=true（不消耗第三次请求）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errJson(429, 'rate limit exceeded'));
    vi.stubGlobal('fetch', fetchMock);
    const promise = generateImage(CONFIG, 'prompt');
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'GenerationError',
      retryable: true,
      status: 429,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('网络失败一次（fetch 抛错）→ 重试一次并成功', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okImage('https://x.example/net.png'));
    vi.stubGlobal('fetch', fetchMock);
    const promise = generateImage(CONFIG, 'prompt');
    await vi.advanceTimersByTimeAsync(2_000);
    const artifact = await promise;
    expect(artifact.url).toBe('https://x.example/net.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('两次瞬态 503 → 抛 GenerationError 且 retryable=true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errJson(503, 'queue full'));
    vi.stubGlobal('fetch', fetchMock);
    const promise = generateImage(CONFIG, 'prompt');
    // 先挂断言再推进计时器——避免 rejection 在 handler 挂载前发生
    // （unhandled rejection 告警）。
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'GenerationError',
      retryable: true,
      status: 503,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('两次网络失败 → retryable=true（文案指向重试而非换说法）', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    const promise = generateImage(CONFIG, 'prompt');
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'GenerationError',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('非瞬态 400 → 不重试，立即抛 status=400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errJson(400, 'invalid size'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateImage(CONFIG, 'prompt')).rejects.toMatchObject({
      name: 'GenerationError',
      status: 400,
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('humanizeGenerationFailure：retryable 网络失败 → 中文重试指引（非「换说法」）', () => {
    const error = new GenerationError(
      'generation provider network failure (provider=newapi, modality=image)',
      'image',
      true,
    );
    expect(
      humanizeGenerationFailure(error, 'image'),
    ).toMatch(/图像生成服务暂时繁忙（排队或网络波动）——稍等片刻再说一次即可重试/);
  });
});
