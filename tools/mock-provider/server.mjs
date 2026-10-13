// 本地 Mock 提供方（验证用——OpenAI 兼容形态）：
// - POST /v1/chat/completions（SSE 流式）
// - POST /v1/images/generations（返回托管 SVG URL）
// - POST /v1/audio/speech（返回 WAV 字节流）
// - POST /v1/videos（返回托管产物 URL）
//
// 仅服务于本地端到端验证——不是产品代码。

import { createServer } from 'node:http';

const PORT = 4011;
const artifacts = new Map();
// 异步视频任务（模拟 Agnes 视频接口——
// 创建返回 video_id，轮询 /agnesapi 直至
// completed，progress 每查询 +30）。
const videoTasks = new Map();
let artifactSeq = 0;

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
    });
  });
}

function chatStream(model, prompt) {
  const text = `（mock ${model}）已收到：「${prompt}」。这是本地验证提供方的流式回应。`;
  const lines = [];
  let i = 0;
  while (i < text.length) {
    const next = Math.min(i + 6, text.length);
    lines.push(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, next) } }] })}\n\n`);
    i = next;
  }
  lines.push('data: [DONE]\n\n');
  return lines.join('');
}

function makeSvg(prompt, hue) {
  const safe = prompt.replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 82%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 60) % 360} 65% 60%)"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="768" fill="url(#g)"/>
  <circle cx="${200 + (hue * 7) % 600}" cy="${180 + (hue * 11) % 400}" r="140" fill="hsla(${(hue + 180) % 360} 80% 70% / 0.5)"/>
  <circle cx="${700 - (hue * 5) % 300}" cy="${500 - (hue * 3) % 200}" r="90" fill="hsla(${(hue + 300) % 360} 75% 65% / 0.55)"/>
  <text x="512" y="700" font-family="sans-serif" font-size="34" fill="#1d1b18" text-anchor="middle">${safe.slice(0, 60)}</text>
</svg>`;
}

function makeWav(seconds = 1.6) {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * seconds);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * 440 * t) * 0.25 * Math.sin((Math.PI * t) / seconds);
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + i * 2);
  }
  return buffer;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // CORS / 内容头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    const body = await readBody(req);
    const prompt = String(body.messages?.[1]?.content ?? body.messages?.[0]?.content ?? '');
    const text = `（mock ${String(body.model || 'mock-chat')}）已收到：「${prompt}」。这是本地验证提供方的回应。`;
    if (body.stream) {
      const lines = [];
      let i = 0;
      while (i < text.length) {
        const next = Math.min(i + 6, text.length);
        lines.push(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, next) } }] })}\n\n`);
        i = next;
      }
      lines.push('data: [DONE]\n\n');
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(lines.join(''));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/images/generations') {
    const body = await readBody(req);
    const prompt = String(body.prompt || '');
    const hue = (prompt.length * 47) % 360;
    artifactSeq += 1;
    const id = `img-${artifactSeq}`;
    artifacts.set(id, { kind: 'image/svg+xml', body: makeSvg(prompt, hue) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ created: Date.now(), data: [{ url: `http://localhost:${PORT}/artifacts/${id}` }] }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/audio/speech') {
    res.writeHead(200, { 'Content-Type': 'audio/wav' });
    res.end(makeWav());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/videos') {
    // 异步任务形态（与 Agnes 视频接口一致——
    // 创建后轮询查询，而非同步返回产物）。
    const body = await readBody(req);
    const prompt = String(body.prompt || '');
    const hue = (prompt.length * 31) % 360;
    artifactSeq += 1;
    const id = `vid-${artifactSeq}`;
    videoTasks.set(id, { progress: 0, hue, prompt });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id,
      video_id: id,
      task_id: id,
      object: 'video',
      model: String(body.model || 'mock-video'),
      status: 'queued',
      progress: 0,
      created_at: Math.floor(Date.now() / 1000),
      seconds: String(body.seconds || '5'),
      size: '720P',
      quality: 'standard',
    }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/agnesapi') {
    // 任务查询端点（Agnes 视频轮询规范——
    // GET /agnesapi?video_id=...&model_name=...）。
    const videoId = url.searchParams.get('video_id');
    const task = videoTasks.get(videoId);
    if (!task) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'task not found' }));
      return;
    }
    task.progress = Math.min(100, task.progress + 30);
    if (task.progress >= 100) {
      artifacts.set(videoId, {
        kind: 'image/svg+xml',
        body: makeSvg(`视频：${task.prompt}`, task.hue),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: videoId,
        object: 'video',
        status: 'completed',
        progress: 100,
        url: `http://localhost:${PORT}/artifacts/${videoId}`,
        completed_at: Math.floor(Date.now() / 1000),
      }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: videoId,
      object: 'video',
      status: 'in_progress',
      progress: task.progress,
    }));
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/artifacts/')) {
    const item = artifacts.get(url.pathname.slice('/artifacts/'.length));
    if (!item) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': item.kind, 'Cache-Control': 'no-store' });
    res.end(item.body);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [
      { id: 'mock-chat' }, { id: 'mock-tts' }, { id: 'mock-image' }, { id: 'mock-video' },
    ] }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found', path: url.pathname }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock provider listening on http://127.0.0.1:${PORT}`);
});
