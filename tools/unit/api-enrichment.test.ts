/**
 * API 丰富化验证测试——拦截 fetch 验证请求体格式。
 *
 * 验证项：
 * - 图像：size 档位 + ratio + extra_body.response_format
 * - 视频 keyframe：first_frame / last_frame + mode
 * - 视频 reference：images + audios + mode
 * - 视频 seed 参数透传
 * - 文本：max_tokens / top_p / enableThinking
 * - 文本：多模态 imageUrls content 格式
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateImage, generateVideo, type GenerationOptions } from '../../src/experience/generation-gateway';
import { ProviderLlmGateway, type ProviderLlmConfig } from '../../src/experience/llm-gateway';
import type { EnabledProviderConfig } from '../../src/experience/config-store';

// 捕获 fetch 请求体的辅助工具
let lastFetchUrl: string;
let lastFetchBody: Record<string, unknown>;

function mockFetch(responseBody: unknown, status = 200) {
  return vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
    lastFetchUrl = url;
    lastFetchBody = JSON.parse(init.body as string);
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

const baseImageConfig: EnabledProviderConfig = {
  provider: 'agnes',
  model: 'agnes-image-2.5-flash',
  endpoint: 'https://apihub.agnes-ai.com/v1',
  modality: 'image',
  temperature: 0.7,
  systemPrompt: '',
  apiKey: 'test-key',
};

const baseVideoConfig: EnabledProviderConfig = {
  provider: 'agnes',
  model: 'agnes-video-2.5-flash',
  endpoint: 'https://apihub.agnes-ai.com/v1',
  modality: 'video',
  temperature: 0.7,
  systemPrompt: '',
  apiKey: 'test-key',
};

const baseTextConfig: ProviderLlmConfig = {
  provider: 'agnes',
  endpoint: 'https://apihub.agnes-ai.com/v1',
  model: 'agnes-3.0-flash',
  temperature: 0.7,
  apiKey: 'test-key',
  systemPrompt: 'test system prompt',
};

describe('API 丰富化验证', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    lastFetchUrl = '';
    lastFetchBody = {};
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ─── 图像 API ──────────────────────────────────────────

  it('图像：size 用档位 2K + ratio 16:9 + extra_body.response_format', async () => {
    globalThis.fetch = mockFetch({
      data: [{ url: 'https://example.com/image.png' }],
    });

    await generateImage(baseImageConfig, 'test prompt', undefined, {
      aspectRatio: '16:9',
    });

    expect(lastFetchBody.size).toBe('2K');
    expect(lastFetchBody.ratio).toBe('16:9');
    expect(lastFetchBody.extra_body).toBeDefined();
    expect(lastFetchBody.extra_body.response_format).toBe('url');
  });

  it('图像：自定义档位 4K + ratio 9:16', async () => {
    globalThis.fetch = mockFetch({
      data: [{ url: 'https://example.com/image.png' }],
    });

    await generateImage(baseImageConfig, 'test prompt', undefined, {
      aspectRatio: '9:16',
      imageTier: '4K',
    });

    expect(lastFetchBody.size).toBe('4K');
    expect(lastFetchBody.ratio).toBe('9:16');
  });

  it('图像：扩展 ratio 3:4 透传', async () => {
    globalThis.fetch = mockFetch({
      data: [{ url: 'https://example.com/image.png' }],
    });

    await generateImage(baseImageConfig, 'test prompt', undefined, {
      aspectRatio: '3:4',
    });

    expect(lastFetchBody.ratio).toBe('3:4');
    expect(lastFetchBody.size).toBe('2K');
  });

  it('图像：21:9 ratio 透传', async () => {
    globalThis.fetch = mockFetch({
      data: [{ url: 'https://example.com/image.png' }],
    });

    await generateImage(baseImageConfig, 'test prompt', undefined, {
      aspectRatio: '21:9',
    });

    expect(lastFetchBody.ratio).toBe('21:9');
  });

  it('图像：参考图 + response_format 同时在 extra_body', async () => {
    globalThis.fetch = mockFetch({
      data: [{ url: 'https://example.com/image.png' }],
    });

    await generateImage(baseImageConfig, 'test prompt', undefined, {
      aspectRatio: '1:1',
      referenceImages: ['data:image/png;base64,abc'],
    });

    expect(lastFetchBody.extra_body.response_format).toBe('url');
    expect(Array.isArray(lastFetchBody.extra_body.image)).toBe(true);
    expect(lastFetchBody.extra_body.image).toHaveLength(1);
  });

  it('图像：无 aspectRatio 时不传 size 和 ratio', async () => {
    globalThis.fetch = mockFetch({
      data: [{ url: 'https://example.com/image.png' }],
    });

    await generateImage(baseImageConfig, 'test prompt');

    expect(lastFetchBody.size).toBeUndefined();
    expect(lastFetchBody.ratio).toBeUndefined();
    // extra_body 仍然有 response_format
    expect(lastFetchBody.extra_body.response_format).toBe('url');
  });

  // ─── 视频 keyframe 模式 ──────────────────────────────────

  it('视频 keyframe：first_frame + last_frame + mode=keyframe', async () => {
    // 视频创建返回异步任务 ID
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('/videos') && init.method === 'POST') {
        lastFetchUrl = url;
        lastFetchBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ video_id: 'vid_test_123', status: 'queued' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // 轮询返回 completed
      return new Response(
        JSON.stringify({ status: 'completed', url: 'https://example.com/video.mp4' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const options: GenerationOptions = {
      firstFrame: 'https://example.com/first.png',
      lastFrame: 'https://example.com/last.png',
    };

    // 跳过轮询等待——用极短超时
    await generateVideo(baseVideoConfig, 'test', undefined, options).catch(() => {
      // 轮询可能超时，但我们只验证创建请求体
    });

    expect(lastFetchBody.mode).toBe('keyframe');
    expect(lastFetchBody.first_frame).toBe('https://example.com/first.png');
    expect(lastFetchBody.last_frame).toBe('https://example.com/last.png');
    expect(lastFetchBody.size).toBe('720P');
  });

  // ─── 视频 reference 模式 ────────────────────────────────

  it('视频 reference：images + audios + mode=reference', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('/videos') && init.method === 'POST') {
        lastFetchUrl = url;
        lastFetchBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ video_id: 'vid_test_456', status: 'queued' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ status: 'completed', url: 'https://example.com/video.mp4' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const options: GenerationOptions = {
      referenceImages: ['https://example.com/ref1.png', 'https://example.com/ref2.png'],
      referenceAudios: ['https://example.com/audio1.mp3'],
    };

    await generateVideo(baseVideoConfig, 'test', undefined, options).catch(() => {});

    expect(lastFetchBody.mode).toBe('reference');
    expect(Array.isArray(lastFetchBody.images)).toBe(true);
    expect(lastFetchBody.images).toHaveLength(2);
    expect(Array.isArray(lastFetchBody.audios)).toBe(true);
    expect(lastFetchBody.audios).toHaveLength(1);
  });

  // ─── 视频 seed 参数 ─────────────────────────────────────

  it('视频 seed 透传', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('/videos') && init.method === 'POST') {
        lastFetchBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ video_id: 'vid_test_789', status: 'queued' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ status: 'completed', url: 'https://example.com/video.mp4' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    await generateVideo(baseVideoConfig, 'test', undefined, {
      seed: 42,
    }).catch(() => {});

    expect(lastFetchBody.seed).toBe(42);
  });

  it('视频无 seed 时不传 seed 字段', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('/videos') && init.method === 'POST') {
        lastFetchBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ video_id: 'vid_test_000', status: 'queued' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ status: 'completed', url: 'https://example.com/video.mp4' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    await generateVideo(baseVideoConfig, 'test').catch(() => {});

    expect(lastFetchBody.seed).toBeUndefined();
  });

  // ─── 文本模型参数 ───────────────────────────────────────

  it('文本：max_tokens / top_p / enableThinking 透传到 propose', async () => {
    globalThis.fetch = mockFetch({
      choices: [{ message: { content: 'test response' } }],
    });

    const config: ProviderLlmConfig = {
      ...baseTextConfig,
      maxTokens: 1024,
      topP: 0.9,
      enableThinking: true,
    };

    const gateway = new ProviderLlmGateway(config);
    await gateway.propose({
      request_id: 'req_1',
      session_id: 'sess_1',
      experience_id: 'exp_1',
      intent: {},
      experience_state: {},
      semantic_action: 'DIRECT_ANSWER' as never,
      allowed_action: 'RESPOND' as never,
      context: { raw_input: 'hello' },
    });

    expect(lastFetchBody.max_tokens).toBe(1024);
    expect(lastFetchBody.top_p).toBe(0.9);
    expect(lastFetchBody.chat_template_kwargs).toEqual({ enable_thinking: true });
  });

  it('文本：无可选参数时不传 max_tokens / top_p / chat_template_kwargs', async () => {
    globalThis.fetch = mockFetch({
      choices: [{ message: { content: 'test response' } }],
    });

    const gateway = new ProviderLlmGateway(baseTextConfig);
    await gateway.propose({
      request_id: 'req_2',
      session_id: 'sess_2',
      experience_id: 'exp_2',
      intent: {},
      experience_state: {},
      semantic_action: 'DIRECT_ANSWER' as never,
      allowed_action: 'RESPOND' as never,
      context: { raw_input: 'hello' },
    });

    expect(lastFetchBody.max_tokens).toBeUndefined();
    expect(lastFetchBody.top_p).toBeUndefined();
    expect(lastFetchBody.chat_template_kwargs).toBeUndefined();
  });

  // ─── 文本多模态 imageUrls ───────────────────────────────

  it('文本：imageUrls → user content 为数组格式（text + image_url）', async () => {
    globalThis.fetch = mockFetch({
      choices: [{ message: { content: 'test response' } }],
    });

    const gateway = new ProviderLlmGateway(baseTextConfig);
    await gateway.propose({
      request_id: 'req_3',
      session_id: 'sess_3',
      experience_id: 'exp_3',
      intent: {},
      experience_state: {},
      semantic_action: 'DIRECT_ANSWER' as never,
      allowed_action: 'RESPOND' as never,
      context: { raw_input: 'describe this image' },
      imageUrls: ['https://example.com/photo.jpg'],
    });

    // messages[1] (user) content 应为数组
    const userMessage = (lastFetchBody.messages as unknown[])[1] as {
      role: string;
      content: unknown;
    };
    expect(userMessage.role).toBe('user');
    expect(Array.isArray(userMessage.content)).toBe(true);
    const content = userMessage.content as Array<Record<string, unknown>>;
    expect(content[0].type).toBe('text');
    expect(content[1].type).toBe('image_url');
    expect((content[1].image_url as { url: string }).url).toBe(
      'https://example.com/photo.jpg',
    );
  });

  it('文本：无 imageUrls 时 user content 仍为字符串', async () => {
    globalThis.fetch = mockFetch({
      choices: [{ message: { content: 'test response' } }],
    });

    const gateway = new ProviderLlmGateway(baseTextConfig);
    await gateway.propose({
      request_id: 'req_4',
      session_id: 'sess_4',
      experience_id: 'exp_4',
      intent: {},
      experience_state: {},
      semantic_action: 'DIRECT_ANSWER' as never,
      allowed_action: 'RESPOND' as never,
      context: { raw_input: 'hello' },
    });

    const userMessage = (lastFetchBody.messages as unknown[])[1] as {
      role: string;
      content: unknown;
    };
    expect(typeof userMessage.content).toBe('string');
  });

  // ─── 视频 keyframe 降级 ─────────────────────────────────

  it('视频 keyframe 降级：被 400 拒绝后回退 text 模式', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('/videos') && init.method === 'POST') {
        callCount += 1;
        lastFetchBody = JSON.parse(init.body as string);
        if (callCount === 1) {
          // 首次：keyframe 被 400 拒绝
          return new Response(
            JSON.stringify({ detail: 'keyframe not supported' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }
        // 降级后：text 模式成功
        return new Response(
          JSON.stringify({ video_id: 'vid_test', status: 'queued' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ status: 'completed', url: 'https://example.com/video.mp4' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    await generateVideo(baseVideoConfig, 'test', undefined, {
      firstFrame: 'https://example.com/first.png',
    }).catch(() => {});

    // 第二次调用应该是 text 模式
    expect(lastFetchBody.mode).toBe('text');
    expect(lastFetchBody.first_frame).toBeUndefined();
  });
});
