/// <reference types="bun-types" />
import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'bun:test';
import { requestGatewayJson } from '../../src/lib/experience/media-gateway';

/**
 * 真实 E2E 暴露的回归：Node（undici）全局 fetch 的默认
 * headersTimeout 为 300s——视频这类「几分钟后才写出响应头」的
 * 网关调用会在 5 分钟处被系统级中断（fetch failed），
 * 与 VIDEO_TIMEOUT_MS(16 分钟) 的契约不一致。
 * 网关调用改用 node:http，整体等待窗口只由调用方 timeoutMs 决定。
 */

const servers: Server[] = [];

function startServer(
  handler: Parameters<typeof createServer>[1],
): Promise<string> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    servers.push(server);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

afterAll(() => {
  for (const server of servers) server.close();
});

describe('网关媒体调用（长等待窗口由调用方决定）', () => {
  it('响应头晚到（模拟数分钟级生成）仍能取回 JSON', async () => {
    const base = await startServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, url: 'http://x/video.mp4', mime: 'video/mp4' }));
      }, 1_200);
    });
    const { status, parsed } = await requestGatewayJson(
      `${base}/v1/videos`,
      { prompt: 'x' },
      10_000,
    );
    expect(status).toBe(200);
    expect(parsed.ok).toBe(true);
    expect(parsed.url).toBe('http://x/video.mp4');
  });

  it('非 2xx 的 JSON 错误体照常取回（状态与错误交由调用方归一）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { message: '上游队列饱和', code: 'x' } }));
    });
    const { status, parsed } = await requestGatewayJson(`${base}/v1/videos`, {}, 5_000);
    expect(status).toBe(502);
    expect(parsed.error?.message).toBe('上游队列饱和');
  });

  it('超过调用方给定的窗口 → 明确的不可达错误（可重试）', async () => {
    const base = await startServer(() => {
      // 永不响应——等待调用方窗口耗尽
    });
    let message = '';
    try {
      await requestGatewayJson(`${base}/v1/videos`, { prompt: 'x' }, 300);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('模型网关不可达');
  });

  it('非 JSON 响应 → 响应无法解析（携带 HTTP 状态）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('bad gateway');
    });
    let message = '';
    try {
      await requestGatewayJson(`${base}/v1/videos`, { prompt: 'x' }, 5_000);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('模型网关响应无法解析（HTTP 502）');
  });

  it('连接被拒 → 不可达错误（与旧 fetch 语义一致）', async () => {
    let message = '';
    try {
      await requestGatewayJson('http://127.0.0.1:1/v1/videos', { prompt: 'x' }, 2_000);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('模型网关不可达');
  });
});
