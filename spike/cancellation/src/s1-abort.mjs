import { GenerationTask } from './task.mjs';
import { startGenerationServer } from './server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- S-1a 进程内中止传播 ----
export async function runInProcessAbort() {
  const events = [];
  const chunks = 10;
  const intervalMs = 25;
  const abortAfterMs = 3 * intervalMs + 10; // 约第 3–4 个 chunk 后中止
  const task = new GenerationTask({
    chunks,
    intervalMs,
    onChunk: () => {},
    onEvent: (e) => events.push(e)
  });
  const ac = new AbortController();
  const startedAt = Date.now();
  const resultPromise = task.start(ac.signal);
  setTimeout(() => ac.abort(), abortAfterMs);
  const result = await resultPromise;
  const elapsedMs = Date.now() - startedAt;

  const terminateIdx = events.findIndex((e) => e.event === 'task_terminated');
  const chunkEvents = events.filter((e) => e.event === 'chunk_written');
  const noChunkAfterTerminate =
    terminateIdx >= 0 && chunkEvents.every((e) => events.indexOf(e) < terminateIdx);

  const criteria = [
    { name: 'abort 后任务确定性终止（aborted=true）', pass: result.aborted === true },
    { name: '取消后无新 chunk 写出（终止事件前无 chunk，终止后零 chunk）', pass: noChunkAfterTerminate },
    { name: '提前终止（chunksWritten < 总 chunks）', pass: result.chunksWritten < chunks },
    { name: '生成已启动（chunksWritten >= 2）', pass: result.chunksWritten >= 2 },
    { name: '终止有日志与时间戳证据（task_terminated + ISO at）', pass: terminateIdx >= 0 && !!result.terminatedAt },
    { name: '耗时远小于完整生成（提前终止）', pass: elapsedMs < chunks * intervalMs }
  ];
  return {
    name: 'S-1a 进程内中止传播',
    pass: criteria.every((c) => c.pass),
    criteria,
    result,
    elapsedMs,
    events
  };
}

// ---- S-1b 常驻 HTTP 流式服务中止传播 ----
export async function runHttpAbort() {
  const serverEvents = [];
  const clientEvents = [];
  const { server, port } = await startGenerationServer({
    chunks: 10,
    intervalMs: 40,
    onEvent: (e) => serverEvents.push(e)
  });

  const controller = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/generate?chunks=10&interval=40`, {
    signal: controller.signal
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let receivedText = '';
  let reads = 0;
  while (reads < 2) {
    const { value } = await reader.read();
    if (value) {
      receivedText += decoder.decode(value, { stream: true });
      reads += 1;
    }
  }
  const abortAt = new Date().toISOString();
  controller.abort();
  clientEvents.push({ event: 'client_aborted', at: abortAt, chunks_received: reads });

  let postAbortReads = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        postAbortReads += 1;
        receivedText += decoder.decode(value, { stream: true });
      }
    }
  } catch (e) {
    clientEvents.push({ event: 'client_read_rejected', error: e.name, at: new Date().toISOString() });
  }

  await sleep(600); // 等待服务端检测断开并停止生成
  await new Promise((resolve) => server.close(resolve));

  const stopIdx = serverEvents.findIndex((e) => e.event === 'generation_stopped');
  const stopEvent = stopIdx >= 0 ? serverEvents[stopIdx] : null;
  const chunkEvents = serverEvents.filter((e) => e.event === 'chunk_written');
  const noChunkAfterStop =
    stopIdx >= 0 && chunkEvents.every((e) => serverEvents.indexOf(e) < stopIdx);
  const receivedLines = receivedText.split('\n').filter((l) => l.trim().length > 0);

  const criteria = [
    { name: '客户端中止后服务端生成确定性停止（generation_stopped 存在）', pass: !!stopEvent },
    { name: '停止原因为客户端断开（request_closed / response_closed）', pass: ['request_closed', 'response_closed'].includes(stopEvent?.reason) },
    { name: '取消后服务端无新 chunk 写出（停止事件后零 chunk）', pass: noChunkAfterStop },
    { name: '服务端提前终止（chunks_written < 总 chunks）', pass: !!stopEvent && stopEvent.chunks_written < 10 },
    { name: '客户端中止后至多收到 1 个在途 chunk（postAbortReads <= 1）', pass: postAbortReads <= 1 },
    { name: '客户端实际收到 >= 2 个 chunk（中止前流已进行）', pass: receivedLines.length >= 2 },
    { name: '终止有日志与时间戳证据（generation_stopped + ISO at）', pass: !!stopEvent?.at }
  ];
  return {
    name: 'S-1b 常驻 HTTP 流式服务中止传播',
    pass: criteria.every((c) => c.pass),
    criteria,
    stopEvent,
    postAbortReads,
    receivedChunks: receivedLines.length,
    serverEvents,
    clientEvents
  };
}
