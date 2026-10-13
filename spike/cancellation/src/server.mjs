import http from 'node:http';

// ADR-0002 S-1（服务形态）：常驻 Node.js 服务上的流式生成端点。
// 客户端断开 / 中止后，服务端生成循环在下一个 tick 确定性停止，不再写出新 chunk。

export function startGenerationServer({ chunks = 10, intervalMs = 40, onEvent }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/health') {
      res.writeHead(200);
      res.end('ok');
      return;
    }
    if (url.pathname !== '/generate') {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const total = Math.max(1, Number(url.searchParams.get('chunks') || chunks));
    const iv = Math.max(1, Number(url.searchParams.get('interval') || intervalMs));
    let written = 0;
    let stopped = false;
    const stop = (reason) => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      res.end();
      onEvent({ event: 'generation_stopped', reason, chunks_written: written, at: new Date().toISOString() });
    };
    const timer = setInterval(() => {
      if (stopped) return;
      if (written >= total) {
        clearInterval(timer);
        res.end();
        onEvent({ event: 'generation_complete', chunks_written: written, at: new Date().toISOString() });
        return;
      }
      written += 1;
      res.write(`chunk-${written}\n`);
      onEvent({ event: 'chunk_written', index: written, at: new Date().toISOString() });
    }, iv);
    req.on('close', () => stop('request_closed'));
    res.on('close', () => stop('response_closed'));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}
