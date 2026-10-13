#!/usr/bin/env node
/**
 * 视频生成端到端验证脚本 v2（走产品真实链路）。
 * v1 的流读取有孤儿 read 竞态（5s 超时 race 遗留 pending read，
 * 后续事件被吞）——v2 用 for-await 消费响应体，无读丢失；
 * 总时限经 AbortController 强制。
 */
const BASE = 'http://localhost:3000';

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

async function submit(body, label, deadlineMs) {
  log(`--- ${label}`);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error(`deadline ${deadlineMs}ms`)), deadlineMs);
  try {
    const response = await fetch(`${BASE}/api/experience/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    const result = { semantic: null, stateVersion: null, experienceId: null, generations: [], chunks: 0 };
    let lastEventAt = Date.now();
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      lastEventAt = Date.now();
      for (const line of decoder.decode(chunk, { stream: true }).split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        let event;
        try {
          event = JSON.parse(trimmed);
        } catch {
          log('  [unparseable]', trimmed.slice(0, 120));
          continue;
        }
        if (event.type === 'submission') {
          result.semantic = event.policy_decision?.semantic_action ?? null;
          result.experienceId = event.experience_id ?? null;
          result.stateVersion = event.state_version ?? null;
          log(`  submission accepted=${event.accepted} semantic=${result.semantic}`);
        } else if (event.type === 'state_updated') {
          result.stateVersion = event.state_version;
        } else if (event.type === 'chunk') {
          result.chunks += 1;
        } else if (event.type === 'generation') {
          const desc =
            event.status === 'progress'
              ? `progress ${event.progress}%`
              : event.status === 'started'
                ? `started prompt="${String(event.prompt).slice(0, 80)}…"`
                : `${event.status}${event.url ? ` url=${String(event.url).slice(0, 120)}` : ''}${event.message ? ` message=${String(event.message).slice(0, 200)}` : ''}`;
          log(`  [generation] ${desc}`);
          result.generations.push(event);
        } else if (event.type === 'done') {
          log('  done — waiting for generation tail…');
        }
      }
    }
    log(`  stream closed (${Math.round((Date.now() - (lastEventAt - 1)) / 1000)}s since last event)`);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

const sessionRes = await fetch(`${BASE}/api/session/start`, { method: 'POST' });
const { session_id: sessionId } = await sessionRes.json();
log('session:', sessionId);

const round1 = await submit(
  { request_id: `verify_r1_${Date.now()}`, session_id: sessionId, user_input: '深海动物为什么会发光' },
  'ROUND 1 提问',
  120_000,
);
log(`  chunks=${round1.chunks} experience=${round1.experienceId} ver=${round1.stateVersion}`);

const round2 = await submit(
  {
    request_id: `verify_r2_${Date.now()}`,
    session_id: sessionId,
    user_input: '视频方式展现',
    experience_id: round1.experienceId,
    state_version: round1.stateVersion,
  },
  'ROUND 2 视频方式展现（最长等 15 分钟——含排队退避 + 任务轮询）',
  900_000,
);

const finalGen = [...round2.generations].reverse().find((g) => ['completed', 'failed', 'unconfigured'].includes(g.status));
if (!finalGen) {
  console.log('RESULT: INCONCLUSIVE — no terminal generation event');
  process.exit(2);
}
if (finalGen.status === 'completed') {
  console.log('RESULT: SUCCESS');
  console.log('  url:', finalGen.url ?? finalGen.dataUri?.slice(0, 100));
  console.log('  mime:', finalGen.mime);
  process.exit(0);
}
console.log('RESULT: FAILED');
console.log('  message:', finalGen.message);
process.exit(1);
