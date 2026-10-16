/* eslint-disable no-console */
/**
 * 产品主路径自动化冒烟——真实服务 + 真实模型。
 *
 * 覆盖模拟用户第一分钟体验的核心断言：
 *   1. 自由输入 → 新会话 topic = 用户原话（不被种子吸附/吞旧会话）
 *   2. 首轮内容生成（content 事件有非空文本）
 *   3. 体验内继续（message 再出内容）
 *   4. 图像闭环（「画成图片」→ generation completed → 媒体 URL 真实可访问）
 *
 * 用法：node tools/smoke-api.cjs
 *   前置：dev server (localhost:3000) 与模型网关 (3031) 运行中，真实模型已配置。
 * 退出码：0 = 全部 PASS；1 = 任一断言失败 / 超时 / 网络错误。
 * 说明：脚本会创建真实测试会话（写入 DB），结束时会打印其 sessionId 便于清理。
 */

const BASE = 'http://localhost:3000';
const INPUT = '帮我画一只在雨里跑的小狗';
const STEP_TIMEOUT_MS = 240_000; // 与上游图像超时上限一致

const startedAt = Date.now();
function elapsed() {
  return `${Math.round((Date.now() - startedAt) / 1000)}s`;
}

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

/** POST 并完整解析 SSE 事件流（与前端 sse.ts 同语义：data: JSON 行）。 */
async function postSSE(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);
  const events = [];
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        try {
          events.push(JSON.parse(data));
        } catch {
          /* 非 JSON 行忽略（如注释行） */
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return events;
}

/** 从事件流提取最新状态版本（session/state/done 事件都可能携带）。 */
function latestVersion(events, fallback = 0) {
  let v = fallback;
  for (const e of events) {
    if (typeof e.stateVersion === 'number' && e.stateVersion > v) v = e.stateVersion;
  }
  return v;
}

async function main() {
  console.log(`\n冒烟开始 — ${new Date().toISOString()}`);
  console.log(`目标 ${BASE} / 输入「${INPUT}」\n`);

  // ── 1. start：自由输入 → 新会话 ──
  console.log('[1/4] start：自由输入开新会话');
  const startEvents = await postSSE('/api/experience/start', { freeText: INPUT });
  const sessionEvt = startEvents.find((e) => e.type === 'session');
  check('收到 session 事件', Boolean(sessionEvt));
  check('topic = 用户原话（不被种子覆盖）', sessionEvt?.topic === INPUT, `实际="${sessionEvt?.topic}"`);
  const contentEvt = startEvents.find((e) => e.type === 'content');
  check('首轮生成内容非空', Boolean(contentEvt?.text && contentEvt.text.length > 10), `len=${contentEvt?.text?.length ?? 0}`);
  check('收到 done 事件（非 ended）', startEvents.some((e) => e.type === 'done'));
  const errEvt = startEvents.find((e) => e.type === 'error');
  check('无 error 事件', !errEvt, errEvt ? `${errEvt.code} ${errEvt.message}` : '');

  const sessionId = sessionEvt?.sessionId;
  const stateVersion = latestVersion(startEvents, sessionEvt?.stateVersion ?? 0);
  if (!sessionId) {
    console.log('\n冒烟中止：未获得 sessionId（服务或模型不可用）');
    process.exit(1);
  }
  console.log(`  sessionId=${sessionId} stateVersion=${stateVersion}\n`);

  // ── 2. message：体验内继续 ──
  console.log('[2/4] message：体验内继续');
  const msgEvents = await postSSE('/api/experience/message', {
    sessionId,
    text: '继续',
    expectedStateVersion: stateVersion,
  });
  const msgContent = msgEvents.find((e) => e.type === 'content');
  check('继续后收到内容', Boolean(msgContent?.text && msgContent.text.length > 10), `len=${msgContent?.text?.length ?? 0}`);
  const msgErr = msgEvents.find((e) => e.type === 'error');
  check('继续无 error 事件', !msgErr, msgErr ? `${msgErr.code} ${msgErr.message}` : '');
  const msgVersion = latestVersion(msgEvents, stateVersion);
  console.log('');

  // ── 3. 图像闭环（含瞬态重试——上游 Agnes 图像队列饱和时可返回
  //      503「image queue is full」，真实用户手动再试通常即可成功；
  //      冒烟模拟该行为：最多 3 次尝试，任一次成功即 PASS）──
  console.log(`[3/4] 图像闭环：画成图片（${elapsed()}，最多 3 次尝试）`);
  let imgSuccess = false;
  let mediaUrl = '';
  let genStartedPrompt = '';
  let imgVersion = latestVersion(msgEvents, msgVersion);
  for (let attempt = 1; attempt <= 3 && !imgSuccess; attempt += 1) {
    if (attempt > 1) {
      console.log(`  重试 #${attempt}（上游队列瞬态，等待 30s）…`);
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
    const imgEvents = await postSSE('/api/experience/message', {
      sessionId,
      text: '用图片展现刚才的内容',
      expectedStateVersion: imgVersion,
    });
    imgVersion = latestVersion(imgEvents, imgVersion);
    const genDone = imgEvents.find((e) => e.type === 'generation' && e.status === 'completed');
    genStartedPrompt = imgEvents.find((e) => e.type === 'generation' && e.status === 'started')?.prompt ?? '';
    if (genDone) {
      imgSuccess = true;
      mediaUrl = genDone.url ?? '';
      break;
    }
    const genFailed = imgEvents.find((e) => e.type === 'generation' && e.status === 'failed');
    console.log(`  尝试 #${attempt} 失败：${genFailed?.message ?? '未收到 completed'}`);
  }
  check('收到 generation completed 事件', imgSuccess, '');
  check('图像 URL 非空', imgSuccess && mediaUrl.length > 0, `url=${mediaUrl ?? ''}`);
  if (!imgSuccess && genStartedPrompt) {
    // 当场对比：用同一提示词直连网关，区分「产品缺陷」与「上游瞬态」
    console.log('  对照：用同一提示词直连网关…');
    try {
      const gRes = await fetch('http://localhost:3031/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: genStartedPrompt }),
        signal: AbortSignal.timeout(240_000),
      });
      const gBody = await gRes.text();
      console.log(`  直连结果：HTTP ${gRes.status} ${gBody.slice(0, 200)}`);
    } catch (error) {
      console.log(`  直连异常：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log('');

  // ── 4. 媒体真实可访问 ──
  console.log('[4/4] 媒体 URL 真实可访问');
  if (mediaUrl) {
    try {
      const url = mediaUrl.startsWith('http') ? mediaUrl : `${BASE}${mediaUrl}`;
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(60_000) });
      const body = await res.arrayBuffer();
      const isImage = (res.headers.get('content-type') || '').includes('image');
      check(`HTTP ${res.status}（图像）`, res.ok && isImage, `content-type=${res.headers.get('content-type')}`);
      check('图片体量有效（>10KB）', body.byteLength > 10_240, `${body.byteLength} bytes`);
    } catch (error) {
      check('媒体访问', false, error instanceof Error ? error.message : String(error));
    }
  } else {
    check('媒体访问（跳过）', false, '无 URL');
  }
  console.log('');

  // ── 汇总 ──
  console.log(`结果：${passed} PASS / ${failed} FAIL（会话 ${sessionId}，可清理）`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('冒烟异常中断：', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
