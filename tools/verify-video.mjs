#!/usr/bin/env node
/**
 * 视频生成端到端验证脚本（走产品真实链路，对齐 2026-10 当前 API）。
 *
 * 轮 1：POST /api/experience/start（freeText 提问 → 首轮 ANSWER）
 * 轮 2：POST /api/experience/message「用视频展现刚才的内容」
 *       ——useContext 视频路径：重放 + LLM 蒸馏提示词 + 网关 /v1/videos
 *       （Agnes 异步任务：创建 + 轮询，免费档排队可达数分钟）
 *
 * SSE 事件：session → trace → content → state → generation(started|completed|failed) → done。
 * 生成在 done 之前随流完成（media 生成同步阻塞流——等待流关闭即等待生成终态）。
 *
 * 客户端用 node:http 而非 fetch：undici 内置 headersTimeout/bodyTimeout
 * 默认 300s，上游排队/轮询期间流静默 >300s 会被客户端误杀
 * （2026-10-16 实测 305s 假阴性）；http 模块无此限制，总时限自持。
 */
import { request } from 'node:http';

const BASE = 'http://localhost:3000';

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

/** POST 一条 SSE 流（data 行 JSON 载荷含 type 字段，无需解析 event: 行）。 */
function postSSE(path, body, deadlineMs, label) {
  return new Promise((resolve) => {
    log(`--- ${label}`);
    const result = {
      session: null,
      stateVersion: null,
      trace: [],
      generations: [],
      content: 0,
      error: null,
    };
    const req = request(
      {
        host: 'localhost',
        port: 3000,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.on('data', () => {});
          res.on('end', () => {
            result.error = { code: 'HTTP_ERROR', message: `HTTP ${res.statusCode}` };
            resolve(result);
          });
          return;
        }
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          let index;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            for (const line of block.split('\n')) {
              const dataLine = line.startsWith('data: ') ? line.slice(6) : null;
              if (!dataLine) continue;
              let event;
              try {
                event = JSON.parse(dataLine);
              } catch {
                log('  [unparseable]', dataLine.slice(0, 120));
                continue;
              }
              if (event.type === 'session') {
                result.session = event.sessionId;
                result.stateVersion = event.stateVersion;
                log(`  session=${event.sessionId} ver=${event.stateVersion} topic=${event.topic}`);
              } else if (event.type === 'trace') {
                result.trace.push(event);
                log(`  trace turn=${event.turn} semantic=${event.semanticAction} policy=${event.policyAction}`);
              } else if (event.type === 'content') {
                result.content += 1;
                result.stateVersion = event.stateVersion;
              } else if (event.type === 'state') {
                result.stateVersion = event.stateVersion;
              } else if (event.type === 'generation') {
                const desc =
                  event.status === 'started'
                    ? `started prompt="${String(event.prompt).slice(0, 80)}…"`
                    : `${event.status}${event.url ? ` url=${event.url}` : ''}${event.message ? ` message=${String(event.message).slice(0, 300)}` : ''}`;
                log(`  [generation] ${desc}`);
                result.generations.push(event);
              } else if (event.type === 'error') {
                result.error = event;
                log(`  [error] ${event.code}: ${event.message}`);
              } else if (event.type === 'done') {
                log(`  done ended=${event.ended} ver=${event.stateVersion}`);
              }
            }
          }
        });
        res.on('end', () => resolve(result));
        res.on('error', (e) => {
          result.error = { code: 'STREAM_ERROR', message: String(e.message) };
          resolve(result);
        });
      },
    );
    req.on('error', (e) => {
      result.error = { code: 'REQUEST_ERROR', message: String(e.message) };
      resolve(result);
    });
    const timer = setTimeout(() => {
      result.error = { code: 'TIMEOUT_OR_ABORT', message: `deadline ${deadlineMs}ms` };
      log(`  stream aborted: ${result.error.message}`);
      req.destroy();
      resolve(result);
    }, deadlineMs);
    req.on('close', () => clearTimeout(timer));
    req.end(JSON.stringify(body));
  });
}

// 轮 1：建会话 + 首轮回答（120s 内 LLM 响应）
const round1 = await postSSE(
  '/api/experience/start',
  { entry: 'home', freeText: '深海动物为什么会发光' },
  120_000,
  'ROUND 1 start（freeText 提问）',
);
if (round1.error?.code === 'HTTP_ERROR') {
  console.log('RESULT: FAILED — start HTTP error', round1.error.message);
  process.exit(1);
}
if (!round1.session) {
  console.log('RESULT: INCONCLUSIVE — 未拿到 sessionId', round1.error?.message ?? '');
  process.exit(2);
}
log(`  content events=${round1.content} ver=${round1.stateVersion}`);

// 轮 2：视频方式展现（useContext——重放 + 蒸馏 + 网关 /v1/videos，最长等 15 分钟）
const round2 = await postSSE(
  '/api/experience/message',
  {
    sessionId: round1.session,
    text: '用视频展现刚才的内容',
    expectedStateVersion: round1.stateVersion,
  },
  900_000,
  'ROUND 2 用视频展现刚才的内容（含排队退避 + 任务轮询）',
);
if (round2.error?.code === 'VERSION_CONFLICT') {
  console.log('RESULT: INCONCLUSIVE — VERSION_CONFLICT', round2.error.message);
  process.exit(2);
}
if (round2.error?.code === 'TIMEOUT_OR_ABORT') {
  console.log('RESULT: INCONCLUSIVE — 15 分钟时限内未到终态（排队仍超 15 分钟或上游挂起）');
  process.exit(2);
}

const terminal = [...round2.generations].reverse().find((g) => g.status === 'completed' || g.status === 'failed');
if (!terminal) {
  console.log('RESULT: INCONCLUSIVE — 无 generation 终态事件', round2.error?.message ?? '（检查 trace 路由）');
  process.exit(2);
}
if (terminal.status === 'completed') {
  console.log('RESULT: SUCCESS');
  console.log('  modality:', terminal.modality);
  console.log('  url:', terminal.url);
  console.log('  promptUsed:', terminal.promptUsed?.slice(0, 120));
  console.log('  mime:', terminal.mime);
  process.exit(0);
}
console.log('RESULT: FAILED');
console.log('  message:', terminal.message);
process.exit(1);
