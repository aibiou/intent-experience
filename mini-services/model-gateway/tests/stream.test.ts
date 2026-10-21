/// <reference types="bun-types" />
import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'bun:test';
import { streamOpenAICompatible } from '../src/providers/stream';
import { EmptyContentError, UpstreamHttpError, UpstreamNetworkError } from '../src/retry';
import type { ProviderConfigRecord } from '../src/config-store';

/**
 * 网关侧流式调用（SSE 增量）。
 *
 * 注意：本文件需要 `NO_PROXY=127.0.0.1` 才能跑（Bun 的 fetch 会把
 * 127.0.0.1 也交给 HTTP_PROXY）。`package.json` 的 `test:gateway`
 * 脚本已带上该变量——这不是产品的直连逻辑（网关对上游 provider
 * 本来就该按用户代理出网），只是让测试的 mock server 可达。
 */

const servers: Server[] = [];

function startServer(handler: Parameters<typeof createServer>[1]): Promise<string> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    servers.push(server);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve(`http://127.0.0.1:${port}/v1`);
    });
  });
}

afterAll(() => {
  for (const server of servers) server.close();
});

function makeRecord(baseUrl: string): ProviderConfigRecord {
  return {
    id: 'pc_test',
    name: 'mock',
    kind: 'openai-compatible',
    baseUrl,
    apiKey: 'sk-test',
    model: 'mock-model',
    modality: 'text',
    enabled: true,
    isDefault: false,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  } as ProviderConfigRecord;
}

function sseChunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`;
}

describe('网关流式调用（SSE）', () => {
  it('逐块回调并返回完整文本', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sseChunk('傍晚'));
      setTimeout(() => {
        res.write(sseChunk('的风'));
        res.write('data: [DONE]\n\n');
        res.end();
      }, 30);
    });

    const deltas: string[] = [];
    const full = await streamOpenAICompatible(makeRecord(base), [{ role: 'user', content: 'hi' }], (d) =>
      deltas.push(d)
    );
    expect(full).toBe('傍晚的风');
    expect(deltas).toEqual(['傍晚', '的风']);
  });

  it('SSE 行被网络块切断也能正确拼接（半行缓冲）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const payload = sseChunk('完整的一句话');
      // 故意从中间切断：JSON 被拆到两个 TCP 块里
      res.write(payload.slice(0, 20));
      setTimeout(() => {
        res.write(payload.slice(20));
        res.write('data: [DONE]\n\n');
        res.end();
      }, 30);
    });

    const deltas: string[] = [];
    const full = await streamOpenAICompatible(makeRecord(base), [{ role: 'user', content: 'hi' }], (d) =>
      deltas.push(d)
    );
    expect(full).toBe('完整的一句话');
    expect(deltas).toEqual(['完整的一句话']);
  });

  it('非 2xx → UpstreamHttpError（保留上游错误消息）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'rate limited' } }));
    });

    let caught: unknown = null;
    try {
      await streamOpenAICompatible(makeRecord(base), [{ role: 'user', content: 'hi' }], () => undefined);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UpstreamHttpError);
    expect((caught as UpstreamHttpError).status).toBe(429);
    expect((caught as UpstreamHttpError).message).toContain('rate limited');
  });

  it('全程没有内容 → EmptyContentError（与非流式一致）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    let caught: unknown = null;
    try {
      await streamOpenAICompatible(makeRecord(base), [{ role: 'user', content: 'hi' }], () => undefined);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EmptyContentError);
  });

  it('首字迟迟不来 → UpstreamNetworkError（首字超时，不是无限等待）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // 一直不写数据
    });
    let caught: unknown = null;
    try {
      await streamOpenAICompatible(makeRecord(base), [{ role: 'user', content: 'hi' }], () => undefined, {
        firstTokenTimeoutMs: 150,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UpstreamNetworkError);
    expect((caught as UpstreamNetworkError).message).toContain('首个字');
  });

  it('流中途断开 → UpstreamNetworkError（不伪装成完整回答）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sseChunk('说到一半'));
      setTimeout(() => res.destroy(), 30);
    });
    let caught: unknown = null;
    try {
      await streamOpenAICompatible(makeRecord(base), [{ role: 'user', content: 'hi' }], () => undefined, {
        firstTokenTimeoutMs: 2_000,
        idleTimeoutMs: 2_000,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UpstreamNetworkError);
  });
});
