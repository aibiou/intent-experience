/**
 * 创作域归档端到端验证（真实链路，不使用 mock）。
 *
 * 前置：Next 应用 :3000 已启动；模型网关 :3031 可用。
 * 用法：node tools/diagnose/e2e-creation-archive.mjs
 *
 * 为什么用 node 而不是 bun：Bun 的 fetch 会读 HTTP_PROXY 且不豁免
 * 127.0.0.1（DEFECT-LOCAL-PROXY-001），在带代理的机器上这个脚本会
 * 拿到代理的 502，测不到产品。
 *
 * 验证目标（DEFECT-CREATION-001 §4.1）：
 *   用户换作品时，旧创作域必须归档进 creationHistory，而不是被静默丢弃。
 *
 * 判据：
 *   A. 第二次「做成一个小游戏」触发取代后，creationHistory 长度 = 1 → PASS
 *   B. 归档域保留 contentHistory（版本内容不丢） → PASS
 *   C. 归档域 endedReason = superseded_by_create → PASS
 */

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

async function sse(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const raw = await res.text();
  const events = [];
  for (const block of raw.split('\n\n')) {
    const line = block.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    const payload = line.slice(6);
    if (payload === '[DONE]') continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      /* 心跳等非 JSON 块 */
    }
  }
  return events;
}

function summarize(events) {
  const out = { sessionId: null, stateVersion: 0, trace: null, errors: [], content: null, state: null };
  for (const event of events) {
    if (event.type === 'session') out.sessionId = event.sessionId;
    if (event.type === 'trace') out.trace = { semanticAction: event.semanticAction, policyAction: event.policyAction };
    if (event.type === 'content') out.content = { kind: event.kind, text: String(event.text ?? '').slice(0, 60) };
    if (event.type === 'state') {
      out.stateVersion = event.stateVersion;
      out.state = event.state;
    }
    if (event.type === 'error') out.errors.push({ code: event.code, message: event.message });
  }
  return out;
}

function creationSnapshot(state) {
  return {
    active: state?.creation?.active ?? null,
    version: state?.creation?.creation?.version ?? null,
    goal: state?.creation?.creation?.concept?.goal ?? null,
    versions: state?.creation?.contentHistory?.length ?? null,
    archived: (state?.creationHistory ?? []).length,
  };
}

console.log('=== 创作域归档端到端验证（真实 LLM） ===\n');

const start = summarize(await sse('/api/experience/start', { freeText: '讲讲傍晚海边风怎么形成的' }));
if (!start.sessionId) {
  console.error('未能建立会话：', JSON.stringify(start).slice(0, 400));
  process.exit(1);
}
console.log(`会话 ${start.sessionId}`);
console.log(`轮1 讲讲傍晚海边风怎么形成的 → ${start.trace?.semanticAction}/${start.trace?.policyAction} v${start.stateVersion}`);

let version = start.stateVersion;
let last = null;

for (const text of ['做成一个小游戏', '做成一个小游戏']) {
  const result = summarize(
    await sse('/api/experience/message', { sessionId: start.sessionId, text, expectedStateVersion: version }),
  );
  version = result.stateVersion || version;
  const snap = creationSnapshot(result.state);
  last = { text, trace: result.trace, snap, errors: result.errors, content: result.content };
  console.log(
    `轮${snap ? '' : ''} ${text} → ${result.trace?.semanticAction}/${result.trace?.policyAction}` +
      ` v${version} | creation.v=${snap.version} 归档=${snap.archived} 版本内容=${snap.versions}` +
      (result.errors.length ? ` | 错误=${result.errors.map((e) => e.code).join(',')}` : ''),
  );
}

// 以服务端最终状态为准（SSE 的 state 事件与库内一致，但这里再读一次以排除时序错觉）
const sessionRes = await fetch(`${BASE}/api/experience/session?id=${start.sessionId}`);
const session = await sessionRes.json();
const finalState = session?.session?.state ?? session?.state;
const finalSnap = creationSnapshot(finalState);
const history = finalState?.creationHistory ?? [];

console.log('\n=== 最终状态 ===');
console.log(`当前创作: v${finalSnap.version} active=${finalSnap.active} 目标=${finalSnap.goal}`);
console.log(`归档数量: ${history.length}`);
for (const [index, domain] of history.entries()) {
  console.log(
    `  归档${index + 1}: ${domain.creation?.creationId} v${domain.creation?.version}` +
      ` 版本内容=${domain.contentHistory?.length ?? 0} 结束原因=${domain.endedReason ?? '-'}`,
  );
}

const violations = [];
if (history.length < 1) violations.push('判据 A：换作品后 creationHistory 为空——旧创作被丢弃');
if (history.some((domain) => (domain.contentHistory?.length ?? 0) === 0)) {
  violations.push('判据 B：归档域没有保留 contentHistory');
}
if (history.some((domain) => domain.endedReason !== 'superseded_by_create')) {
  violations.push('判据 C：归档域 endedReason 不是 superseded_by_create');
}
if (last?.errors?.length) {
  violations.push(`生成失败：${last.errors.map((e) => e.code).join(',')}（不是归档缺陷，但本轮未能验证）`);
}

console.log('');
if (violations.length === 0) {
  console.log('判决：PASS —— 取代后旧创作连同版本内容被归档，未被丢弃');
} else {
  console.log('判决：FAIL');
  for (const violation of violations) console.log('  × ' + violation);
  process.exitCode = 1;
}
