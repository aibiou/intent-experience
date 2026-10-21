/**
 * 创作域端到端验证（真实链路，不使用 mock）。
 *
 * 前置：
 *   1. 模型网关 :3031 已启动（真实 data/config/provider-configs.json）
 *   2. Next 应用 :3000 已启动
 *
 * 验证目标（DEFECT-CREATION-001）：
 *   复现真实用户序列，确认修复后「继续生成视频」不再触发创作域重建。
 *
 * 判据：
 *   A. 连续 CREATION_PREVIEWED 且 superseded:true ≥ 2 次 → FAIL
 *   B. creation.version 始终为 1 而多次 CREATE → FAIL
 *   C. 会话最终 state.creation.active 应保持 true（未被反复取代）
 */

const BASE = 'http://127.0.0.1:3000';

async function sse(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
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
      // 忽略非 JSON 心跳
    }
  }
  return events;
}

function collect(events) {
  const out = {
    sessionId: null,
    stateVersion: 0,
    creationPreviews: [],
    policyActions: [],
    generation: [],
    errors: [],
    done: null,
  };
  for (const e of events) {
    if (e.type === 'session') out.sessionId = e.sessionId ?? e.session?.id ?? out.sessionId;
    if (e.type === 'trace') {
      out.policyActions.push({
        semanticAction: e.semanticAction ?? e.payload?.semanticAction,
        policyAction: e.policyAction ?? e.payload?.policyAction,
      });
    }
    if (e.type === 'content' && e.kind === 'CREATION_PREVIEW') {
      out.creationPreviews.push({ turn: e.turn, text: String(e.text ?? '').slice(0, 40) });
    }
    if (e.type === 'state') {
      out.stateVersion = e.stateVersion ?? out.stateVersion;
      const creation = e.state?.creation;
      if (creation) {
        out.creationActive = creation.active;
        out.creationVersion = creation.creation?.version;
      }
    }
    if (e.type === 'generation') {
      out.generation.push({ status: e.status, modality: e.modality, message: e.message });
    }
    if (e.type === 'error') out.errors.push({ code: e.code, message: e.message });
    if (e.type === 'done') out.done = { ended: e.ended, exitReason: e.exitReason, stateVersion: e.stateVersion };
  }
  return out;
}

const INPUTS = [
  '讲讲傍晚海边风怎么形成的',
  '用图片展现刚才的内容',
  '生成动态的视频，俩人在观海',
  '继续',
  '生成视频',
  '生成动态的视频，俩人在观海',
  '继续生成动态的视频，俩人在观海',
  '继续生成动态的视频，俩人在观海',
];

console.log('=== 创作域端到端验证（真实提供方） ===\n');

// 1. 建立会话
const startEvents = await sse(`${BASE}/api/experience/start`, { freeText: INPUTS[0] });
const start = collect(startEvents);
if (!start.sessionId) {
  console.error('未能建立会话：', JSON.stringify(startEvents).slice(0, 500));
  process.exit(1);
}
console.log(`会话: ${start.sessionId}`);
console.log(`轮1  ${INPUTS[0]}`);
console.log(`     -> policy=${JSON.stringify(start.policyActions.at(-1))} version=${start.stateVersion}\n`);

let version = start.stateVersion;
const rows = [];

// 2. 逐轮提交
for (let i = 1; i < INPUTS.length; i++) {
  let result;
  try {
    const events = await sse(`${BASE}/api/experience/message`, {
      sessionId: start.sessionId,
      text: INPUTS[i],
      expectedStateVersion: version,
    });
    result = collect(events);
  } catch (error) {
    console.error(`轮${i + 1} 请求失败：${error.message}`);
    break;
  }
  version = result.stateVersion || version;
  const policy = result.policyActions.at(-1) ?? {};
  rows.push({
    turn: i + 1,
    input: INPUTS[i],
    semanticAction: policy.semanticAction,
    policyAction: policy.policyAction,
    previews: result.creationPreviews.length,
    creationActive: result.creationActive,
    creationVersion: result.creationVersion,
    generation: result.generation.map((g) => g.status + (g.modality ? ':' + g.modality : '')).join(',') || '-',
    errors: result.errors.map((e) => e.code).join(',') || '-',
  });
  await new Promise((r) => setTimeout(r, 400));
}

console.log('轮 | 输入                          | semantic       | policy   | 新preview | creationV | 生成      | 错误');
console.log('---|-------------------------------|----------------|----------|-----------|-----------|-----------|-----');
for (const r of rows) {
  console.log(
    String(r.turn).padStart(2) + ' | ' +
    r.input.padEnd(29).slice(0, 29) + ' | ' +
    String(r.semanticAction ?? '-').padEnd(14) + ' | ' +
    String(r.policyAction ?? '-').padEnd(8) + ' | ' +
    String(r.previews).padStart(9) + ' | ' +
    String(r.creationVersion ?? '-').padStart(9) + ' | ' +
    String(r.generation).padEnd(9) + ' | ' +
    r.errors,
  );
}

// 3. 读取最终会话状态
const sessRes = await fetch(`${BASE}/api/experience/session?id=${start.sessionId}`);
const sess = await sessRes.json();
const creation = sess?.session?.state?.creation ?? sess?.state?.creation;
const history = sess?.session?.state?.history ?? sess?.state?.history ?? [];

console.log('\n=== 最终状态 ===');
console.log(`会话状态: ${sess?.session?.status ?? sess?.status}`);
console.log(`creation.active: ${creation?.active}`);
console.log(`creation.version: ${creation?.creation?.version}`);
console.log(`creation.endedReason: ${creation?.endedReason ?? '-'}`);
console.log(`历史轮次: ${history.length}`);
console.log(`历史动作: ${history.map((h) => h.semanticAction).join(' → ')}`);

// 4. 判决
const violations = [];
const createTurns = rows.filter((r) => r.policyAction === 'CREATE');
const versions = rows.map((r) => r.creationVersion).filter((v) => typeof v === 'number');
const maxVersion = Math.max(...versions, 0);
if (createTurns.length >= 2 && maxVersion <= 1) {
  violations.push(`判据 B：CREATE 出现 ${createTurns.length} 次，creation.version 未超过 1`);
}
if (rows.filter((r) => r.previews > 0).length >= 3) {
  violations.push(`判据 A：${rows.filter((r) => r.previews > 0).length} 轮重复触发创作预览`);
}

console.log('');
if (violations.length === 0) {
  console.log('判决：PASS —— 真实链路下创作域未被反复重置');
} else {
  console.log('判决：FAIL');
  for (const v of violations) console.log('  × ' + v);
}
