/// <reference types="bun-types" />
import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'bun:test';
import { LocalHttpError, localHttpStream } from '../../src/lib/experience/loopback-http';

/**
 * 本机流式客户端（SSE 增量）。
 *
 * 这条链路是「首字延迟」的最后一公里：网关逐块吐、主应用逐块收、
 * runtime 逐块转成 content_delta。任何一处等完整响应，流式就白做了。
 * 因此这里锁定的是「边到边给」而不是「最后一次性拿到」。
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

describe('本机流式客户端（增量响应体）', () => {
  it('chunked 响应：数据到达即回调，不是等结束后一次性给', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: 第一块\n\n');
      setTimeout(() => {
        res.write('data: 第二块\n\n');
        res.end();
      }, 120);
    });

    const arrivals: Array<{ at: number; text: string }> = [];
    const started = Date.now();
    await localHttpStream(
      { url: `${base}/v1/chat/completions`, method: 'POST', body: { stream: true }, idleTimeoutMs: 3_000 },
      (text) => arrivals.push({ at: Date.now() - started, text })
    );

    expect(arrivals.length).toBeGreaterThanOrEqual(2);
    expect(arrivals.map((item) => item.text).join('')).toBe('data: 第一块\n\ndata: 第二块\n\n');
    // 关键：第一块必须在结束之前就到了（差值 >= 第二块的延迟）
    expect(arrivals[0]!.at).toBeLessThan(100);
  });

  it('content-length 响应同样逐块投递', async () => {
    const body = 'data: a\n\ndata: b\n\n';
    const base = await startServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Content-Length': Buffer.byteLength(body),
      });
      res.write('data: a\n\n');
      setTimeout(() => res.end('data: b\n\n'), 40);
    });

    const chunks: string[] = [];
    await localHttpStream(
      { url: `${base}/x`, method: 'POST', body: {}, idleTimeoutMs: 3_000 },
      (text) => chunks.push(text)
    );
    expect(chunks.join('')).toBe(body);
  });

  it('中文跨块不被切坏（流式 UTF-8 解码）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // 一个完整的中文块分两次写：多字节字符可能落在两个网络块之间
      const encoded = Buffer.from('傍晚的风', 'utf8');
      res.write(encoded.subarray(0, 4));
      setTimeout(() => {
        res.write(encoded.subarray(4));
        res.end();
      }, 40);
    });

    const chunks: string[] = [];
    await localHttpStream(
      { url: `${base}/x`, method: 'POST', body: {}, idleTimeoutMs: 3_000 },
      (text) => chunks.push(text)
    );
    expect(chunks.join('')).toBe('傍晚的风');
  });

  it('空闲超时：两次数据之间太久 → timeout（而不是整体时长上限）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: 开头\n\n');
      // 之后一直不写
    });

    let caught: unknown = null;
    try {
      await localHttpStream(
        { url: `${base}/x`, method: 'POST', body: {}, idleTimeoutMs: 250 },
        () => undefined
      );
    } catch (error) {
      caught = error;
    }
    expect((caught as LocalHttpError).code).toBe('timeout');
    expect((caught as LocalHttpError).message).toContain('没有收到新内容');
  });

  it('外部取消 → aborted（用户切走不算网关故障）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: 开头\n\n');
    });
    const controller = new AbortController();
    const pending = localHttpStream(
      { url: `${base}/x`, method: 'POST', body: {}, idleTimeoutMs: 5_000, signal: controller.signal },
      () => undefined
    );
    controller.abort();
    let caught: unknown = null;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }
    expect((caught as LocalHttpError).code).toBe('aborted');
  });

  it('连接被拒 → unreachable（代理环境下也直连本机）', async () => {
    let caught: unknown = null;
    try {
      await localHttpStream({ url: 'http://127.0.0.1:1/x', method: 'POST', body: {}, idleTimeoutMs: 1_000 }, () => undefined);
    } catch (error) {
      caught = error;
    }
    expect((caught as LocalHttpError).code).toBe('unreachable');
  });

  it('响应头可被调用方读到（用于区分 2xx 与错误体）', async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: '上游队列饱和' } }));
    });
    let status = 0;
    const chunks: string[] = [];
    await localHttpStream(
      {
        url: `${base}/x`,
        method: 'POST',
        body: {},
        idleTimeoutMs: 3_000,
        onHead: (head) => {
          status = head.status;
        },
      },
      (text) => chunks.push(text)
    );
    expect(status).toBe(502);
    expect(chunks.join('')).toContain('上游队列饱和');
  });
});
