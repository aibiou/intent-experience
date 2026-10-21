/**
 * 本机 HTTP 客户端（直连，不经系统代理）。
 *
 * 为什么不用 fetch / node:http：Bun 运行时（产品 `start` 脚本即
 * `bun .next/standalone/server.js`）会把 **HTTP_PROXY / HTTPS_PROXY**
 * 应用到 fetch 与 node:http 兼容层，且对 127.0.0.1 不自动豁免
 * （2026-10-20 实测：`request({host:'127.0.0.1',port:1})` 返回代理的
 * 502 `upstream connect failed`，而不是 ECONNREFUSED；`NO_PROXY` 只在
 * 进程启动时生效，运行时写入无效）。
 *
 * 后果：用户在带代理的机器上（公司网络、抓包工具、科学上网工具都很常见）
 * 运行产品时，主应用调用本机模型网关（127.0.0.1:3031）会全部失败，
 * 表现为「模型网关不可达」的假故障——而网关其实活得好好的。
 *
 * 因此本机网关调用一律走 `node:net` 裸连接，自己拼 HTTP/1.1 报文：
 * socket 层不读代理环境变量，行为在 Node 与 Bun 下一致。
 *
 * 只面向本机网关这一种用法：JSON 请求 / JSON 响应 / 无压缩 / 无重定向。
 * 不做通用 HTTP 客户端——需要通用能力的地方请继续用 fetch。
 */

import net from 'node:net';

export type LocalHttpErrorCode = 'unreachable' | 'timeout' | 'aborted' | 'malformed';

export class LocalHttpError extends Error {
  constructor(
    message: string,
    public readonly code: LocalHttpErrorCode
  ) {
    super(message);
    this.name = 'LocalHttpError';
  }
}

export interface LocalHttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface LocalHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** 头部结束标记与最大响应体（防止异常响应吃满内存；媒体产物走文件而非内联）。 */
const HEADER_END = Buffer.from('\r\n\r\n', 'latin1');
const MAX_BODY_BYTES = 32 * 1024 * 1024;

/**
 * 解析 chunked 编码的响应体。
 * @returns 完整则返回 body；数据不足返回 null（继续等下一批）。
 */
function decodeChunked(buffer: Buffer): Buffer | null {
  const parts: Buffer[] = [];
  let offset = 0;
  for (;;) {
    const lineEnd = buffer.indexOf('\r\n', offset);
    if (lineEnd === -1) return null;
    const sizeLine = buffer.subarray(offset, lineEnd).toString('latin1').split(';')[0].trim();
    const size = Number.parseInt(sizeLine, 16);
    if (!Number.isFinite(size) || size < 0) return null;
    offset = lineEnd + 2;
    if (size === 0) {
      // 末尾可能有 trailers，读到空行为止；数据不够就等
      const trailerEnd = buffer.indexOf('\r\n', offset);
      if (trailerEnd === -1) return null;
      if (trailerEnd === offset) return Buffer.concat(parts);
      // 跳过 trailers（容忍多行）
      let cursor = offset;
      for (;;) {
        const end = buffer.indexOf('\r\n', cursor);
        if (end === -1) return null;
        if (end === cursor) return Buffer.concat(parts);
        cursor = end + 2;
      }
    }
    if (buffer.length < offset + size + 2) return null;
    parts.push(buffer.subarray(offset, offset + size));
    offset += size + 2;
  }
}

function parseHead(head: string): { status: number; headers: Record<string, string> } {
  const lines = head.split('\r\n');
  const statusMatch = /^HTTP\/\d\.\d\s+(\d{3})/.exec(lines[0] ?? '');
  if (!statusMatch) {
    throw new LocalHttpError('本机网关响应格式非法（缺少状态行）', 'malformed');
  }
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return { status: Number(statusMatch[1]), headers };
}

/**
 * 向本机地址发起一次 HTTP/1.1 请求（socket 直连，绕过代理）。
 *
 * 超时窗口只由调用方 `timeoutMs` 决定——长耗时媒体任务（分钟级才写出
 * 响应头）不会被运行时默认的 300s 头部超时截断。
 */
export function localHttpRequest(request: LocalHttpRequest): Promise<LocalHttpResponse> {
  const { url, method = 'GET', body, timeoutMs, signal } = request;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Promise.reject(new LocalHttpError(`非法地址：${url}`, 'malformed'));
  }
  if (target.protocol !== 'http:') {
    return Promise.reject(new LocalHttpError(`仅支持 http 本机地址：${url}`, 'malformed'));
  }

  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
  const host = target.hostname;
  const port = Number(target.port || 80);
  const path = `${target.pathname}${target.search}`;

  return new Promise<LocalHttpResponse>((resolve, reject) => {
    let settled = false;
    let connected = false;
    const chunks: Buffer[] = [];
    let head: { status: number; headers: Record<string, string> } | null = null;
    let headerBytes = 0;

    const finish = (error: Error | null, response?: LocalHttpResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      if (error) reject(error);
      else resolve(response!);
    };

    const socket = net.connect({ host, port });
    socket.setNoDelay(true);

    const timer = setTimeout(() => {
      finish(
        new LocalHttpError(
          `模型网关不可达（${host}:${port}）：等待网关响应超过 ${Math.round(timeoutMs / 1000)}s`,
          'timeout'
        )
      );
    }, timeoutMs);

    const onAbort = () => {
      finish(new LocalHttpError('请求已取消', 'aborted'));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    socket.on('connect', () => {
      connected = true;
      const headLines = [
        `${method} ${path} HTTP/1.1`,
        `Host: ${host}:${port}`,
        'Accept: application/json',
        'Connection: close',
      ];
      if (payload) {
        headLines.push('Content-Type: application/json');
        headLines.push(`Content-Length: ${payload.byteLength}`);
      }
      socket.write(`${headLines.join('\r\n')}\r\n\r\n`);
      if (payload) socket.write(payload);
    });

    socket.on('data', (chunk: Buffer) => {
      if (settled) return;
      if (!head) {
        chunks.push(chunk);
        headerBytes += chunk.length;
        const joined = Buffer.concat(chunks);
        const headEnd = joined.indexOf(HEADER_END);
        if (headEnd === -1) {
          if (headerBytes > 1024 * 1024) {
            finish(new LocalHttpError('本机网关响应头过大', 'malformed'));
          }
          return;
        }
        try {
          head = parseHead(joined.subarray(0, headEnd).toString('latin1'));
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        const rest = joined.subarray(headEnd + HEADER_END.length);
        chunks.length = 0;
        if (rest.length > 0) chunks.push(rest);
      } else {
        chunks.push(chunk);
      }

      const raw = Buffer.concat(chunks);
      if (raw.length > MAX_BODY_BYTES) {
        finish(new LocalHttpError('本机网关响应体过大', 'malformed'));
        return;
      }

      const encoding = head.headers['transfer-encoding']?.toLowerCase();
      if (encoding === 'chunked') {
        const decoded = decodeChunked(raw);
        if (decoded) finish(null, { ...head, body: decoded.toString('utf8') });
        return;
      }
      const lengthHeader = head.headers['content-length'];
      if (lengthHeader !== undefined) {
        const expected = Number.parseInt(lengthHeader, 10);
        if (Number.isFinite(expected) && raw.length >= expected) {
          finish(null, { ...head, body: raw.subarray(0, expected).toString('utf8') });
        }
      }
    });

    // 无 content-length / chunked 的响应（网关 keep-alive 关闭时）以关闭为结束。
    socket.on('end', () => {
      if (settled || !head) return;
      finish(null, { ...head, body: Buffer.concat(chunks).toString('utf8') });
    });

    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      const reason = error.code === 'ECONNREFUSED' ? '连接被拒绝（服务未启动）' : error.message;
      finish(
        new LocalHttpError(
          `${connected ? '本机网关连接中断' : '模型网关不可达'}（${host}:${port}）：${reason}`,
          'unreachable'
        )
      );
    });

    socket.on('close', () => {
      if (settled || !head) return;
      finish(null, { ...head, body: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

/** 便捷方法：POST JSON 并解析 JSON（解析失败抛出 malformed）。 */
export async function postJsonLocal(
  url: string,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ status: number; headers: Record<string, string>; parsed: unknown; body: string }> {
  const response = await localHttpRequest({ url, method: 'POST', body, timeoutMs, signal });
  try {
    return { ...response, parsed: JSON.parse(response.body) as unknown };
  } catch {
    throw new LocalHttpError(`本机网关响应无法解析（HTTP ${response.status}）`, 'malformed');
  }
}

/**
 * 为子进程注入「本机地址不走代理」的环境变量。
 *
 * 模型网关（mini-service）内部用 fetch 调本机桥（元宝 3210 / 豆包 3220），
 * Bun 的 fetch 同样会被 HTTP_PROXY 劫持；而 Bun 只在进程启动时读取
 * NO_PROXY（运行时写入无效），所以只能由拉起方在 spawn 时注入。
 * 只追加回环地址——外部提供方（Agnes 等）仍按用户代理配置出网。
 */
export function localNoProxyEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const hosts = ['127.0.0.1', 'localhost', '::1'];
  const next: NodeJS.ProcessEnv = { ...base };
  for (const key of ['NO_PROXY', 'no_proxy'] as const) {
    const parts = (base[key] ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const missing = hosts.filter((host) => !parts.includes(host));
    if (missing.length > 0) next[key] = [...parts, ...missing].join(',');
  }
  return next;
}

// ---------------------------------------------------------------------------
// 流式请求（SSE / 增量响应体）
// ---------------------------------------------------------------------------

export interface LocalHttpStreamRequest {
  url: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  /**
   * 空闲超时：**两次收到数据之间**的最长等待，而不是整个请求的总时长。
   * 流式响应本来就可能持续几十秒（长回答），用总时长做上限会把正常
   * 生成误判为超时。
   */
  idleTimeoutMs: number;
  signal?: AbortSignal;
  /** 响应头（可用于判断 2xx / content-type）。 */
  onHead?: (head: { status: number; headers: Record<string, string> }) => void;
}

/**
 * 逐块接收响应体（socket 直连，绕过代理）。
 *
 * 与 `localHttpRequest` 的区别只有一处：不等完整 body，解析出一块就回调一块。
 * 支持 chunked 与 content-length 两种长度声明；UTF-8 多字节跨块用流式
 * decoder 处理（否则中文会被切成乱码）。
 */
export function localHttpStream(
  request: LocalHttpStreamRequest,
  onChunk: (text: string) => void
): Promise<void> {
  const { url, method = 'POST', body, idleTimeoutMs, signal, onHead } = request;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Promise.reject(new LocalHttpError(`非法地址：${url}`, 'malformed'));
  }
  if (target.protocol !== 'http:') {
    return Promise.reject(new LocalHttpError(`仅支持 http 本机地址：${url}`, 'malformed'));
  }

  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
  const host = target.hostname;
  const port = Number(target.port || 80);
  const path = `${target.pathname}${target.search}`;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let head: { status: number; headers: Record<string, string> } | null = null;
    let headerBuffer = Buffer.alloc(0);
    let chunkBuffer = Buffer.alloc(0);
    let streamEnded = false;
    const decoder = new TextDecoder('utf-8');

    const socket = net.connect({ host, port });
    socket.setNoDelay(true);

    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    const bumpIdleTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        finish(
          new LocalHttpError(
            `模型网关不可达（${host}:${port}）：${Math.round(idleTimeoutMs / 1000)}s 内没有收到新内容`,
            'timeout'
          )
        );
      }, idleTimeoutMs);
    };

    let timer = setTimeout(() => {
      finish(
        new LocalHttpError(
          `模型网关不可达（${host}:${port}）：${Math.round(idleTimeoutMs / 1000)}s 内没有收到新内容`,
          'timeout'
        )
      );
    }, idleTimeoutMs);

    const onAbort = () => finish(new LocalHttpError('请求已取消', 'aborted'));
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    /** 解析 chunked 缓冲区里所有完整块；返回是否已读到终止块。 */
    const drainChunked = (): boolean => {
      for (;;) {
        const lineEnd = chunkBuffer.indexOf('\r\n');
        if (lineEnd === -1) return false;
        const sizeLine = chunkBuffer.subarray(0, lineEnd).toString('latin1').split(';')[0].trim();
        const size = Number.parseInt(sizeLine, 16);
        if (!Number.isFinite(size) || size < 0) {
          finish(new LocalHttpError('本机网关的流式响应格式非法（chunk 长度）', 'malformed'));
          return true;
        }
        if (size === 0) {
          return true; // 终止块
        }
        if (chunkBuffer.length < lineEnd + 2 + size + 2) return false;
        const data = chunkBuffer.subarray(lineEnd + 2, lineEnd + 2 + size);
        chunkBuffer = chunkBuffer.subarray(lineEnd + 2 + size + 2);
        const text = decoder.decode(data, { stream: true });
        if (text.length > 0) onChunk(text);
      }
    };

    socket.on('connect', () => {
      const headLines = [
        `${method} ${path} HTTP/1.1`,
        `Host: ${host}:${port}`,
        'Accept: text/event-stream, application/json',
        'Connection: close',
      ];
      if (payload) {
        headLines.push('Content-Type: application/json');
        headLines.push(`Content-Length: ${payload.byteLength}`);
      }
      socket.write(`${headLines.join('\r\n')}\r\n\r\n`);
      if (payload) socket.write(payload);
    });

    socket.on('data', (chunk: Buffer) => {
      if (settled) return;
      bumpIdleTimer();

      if (!head) {
        headerBuffer = Buffer.concat([headerBuffer, chunk]);
        const headEnd = headerBuffer.indexOf(HEADER_END);
        if (headEnd === -1) {
          if (headerBuffer.length > 1024 * 1024) {
            finish(new LocalHttpError('本机网关响应头过大', 'malformed'));
          }
          return;
        }
        try {
          head = parseHead(headerBuffer.subarray(0, headEnd).toString('latin1'));
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        onHead?.(head);
        chunkBuffer = headerBuffer.subarray(headEnd + HEADER_END.length);
        headerBuffer = Buffer.alloc(0);
      } else {
        chunkBuffer = Buffer.concat([chunkBuffer, chunk]);
      }

      const encoding = head.headers['transfer-encoding']?.toLowerCase();
      if (encoding === 'chunked') {
        if (drainChunked()) {
          const tail = decoder.decode();
          if (tail.length > 0) onChunk(tail);
          finish(null);
        }
        return;
      }

      // 非 chunked：直接按到达块投递（content-length 由 socket 关闭收口）
      const text = decoder.decode(chunkBuffer, { stream: true });
      chunkBuffer = Buffer.alloc(0);
      if (text.length > 0) onChunk(text);
    });

    socket.on('end', () => {
      if (settled) return;
      streamEnded = true;
      const tail = decoder.decode();
      if (tail.length > 0) onChunk(tail);
      finish(null);
    });

    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      const reason = error.code === 'ECONNREFUSED' ? '连接被拒绝（服务未启动）' : error.message;
      finish(new LocalHttpError(`模型网关不可达（${host}:${port}）：${reason}`, 'unreachable'));
    });

    socket.on('close', () => {
      if (settled) return;
      if (!head) {
        finish(new LocalHttpError(`模型网关不可达（${host}:${port}）：连接在响应前关闭`, 'unreachable'));
        return;
      }
      if (!streamEnded) {
        const tail = decoder.decode();
        if (tail.length > 0) onChunk(tail);
      }
      finish(null);
    });
  });
}
