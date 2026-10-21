/// <reference types="bun-types" />
import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'bun:test';
import { LocalHttpError, localHttpRequest, postJsonLocal } from '../../src/lib/experience/loopback-http';

/**
 * 本机网关客户端回归（DEFECT-LOCAL-PROXY-001）。
 *
 * 背景：Bun 运行时把 HTTP_PROXY 应用到 fetch 与 node:http 兼容层，
 * 且不豁免 127.0.0.1——带代理的机器上产品调用本机网关会收到代理的
 * 502（表现为「模型网关不可达」的假故障）。本文件锁定的正是
 * 「本机地址必须直连」这一契约：这些用例在设置了代理的环境下也必须通过。
 */

const servers: Server[] = [];

function startServer(handler: Parameters<typeof createServer>[1]): Promise<string> {
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

describe('本机网关客户端（socket 直连，绕过系统代理）', () => {
  it('代理环境变量在场时仍直连本机：200 + JSON 正常取回', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, url: 'http://x/video.mp4' }));
    });
    // 前置断言：本进程确实带着代理配置（否则本用例失去意义）
    expect(process.env.HTTP_PROXY ?? process.env.http_proxy ?? '').not.toBe('');

    const { status, parsed } = await postJsonLocal(`${base}/v1/videos`, { prompt: 'x' }, 5_000);
    expect(status).toBe(200);
    expect((parsed as { url: string }).url).toBe('http://x/video.mp4');
  });

  it('非 2xx 的 JSON 错误体照常取回（状态与错误交由调用方归一）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { message: '上游队列饱和' } }));
    });
    const { status, parsed } = await postJsonLocal(`${base}/v1/videos`, {}, 5_000);
    expect(status).toBe(502);
    expect((parsed as { error: { message: string } }).error.message).toBe('上游队列饱和');
  });

  it('chunked 响应（无 content-length）完整拼接', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"ok":true,');
      setTimeout(() => {
        res.write('"parts":[1,2,3]}');
        res.end();
      }, 30);
    });
    const { parsed } = await postJsonLocal(`${base}/v1/x`, {}, 5_000);
    expect((parsed as { parts: number[] }).parts).toEqual([1, 2, 3]);
  });

  it('响应头晚到（模拟分钟级媒体任务）仍能取回，不被默认头部超时截断', async () => {
    const base = await startServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }, 1_200);
    });
    const started = Date.now();
    const { status } = await postJsonLocal(`${base}/v1/videos`, { prompt: 'x' }, 10_000);
    expect(status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_100);
  });

  it('连接被拒 → 不可达（不是代理返回的 502）', async () => {
    let caught: unknown = null;
    try {
      await postJsonLocal('http://127.0.0.1:1/v1/videos', { prompt: 'x' }, 2_000);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LocalHttpError);
    expect((caught as LocalHttpError).code).toBe('unreachable');
    expect((caught as LocalHttpError).message).toContain('模型网关不可达');
  });

  it('超过调用方给定窗口 → 明确的超时错误（可重试）', async () => {
    const base = await startServer(() => {
      // 故意不响应
    });
    let caught: unknown = null;
    try {
      await localHttpRequest({ url: `${base}/v1/videos`, method: 'POST', body: {}, timeoutMs: 250 });
    } catch (error) {
      caught = error;
    }
    expect((caught as LocalHttpError).code).toBe('timeout');
    expect((caught as LocalHttpError).message).toContain('超过');
  });

  it('外部取消 → aborted（不误报为网关故障）', async () => {
    const base = await startServer(() => {
      // 故意不响应
    });
    const controller = new AbortController();
    const pending = localHttpRequest({
      url: `${base}/v1/videos`,
      method: 'POST',
      body: {},
      timeoutMs: 10_000,
      signal: controller.signal,
    });
    controller.abort();
    let caught: unknown = null;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }
    expect((caught as LocalHttpError).code).toBe('aborted');
  });

  it('非 JSON 响应 → malformed（携带 HTTP 状态）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>not json</html>');
    });
    let caught: unknown = null;
    try {
      await postJsonLocal(`${base}/v1/x`, {}, 5_000);
    } catch (error) {
      caught = error;
    }
    expect((caught as LocalHttpError).code).toBe('malformed');
    expect((caught as LocalHttpError).message).toContain('HTTP 200');
  });
});
