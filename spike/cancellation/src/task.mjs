// ADR-0002 S-1（进程内形态）：可中止生成任务。
// abort 信号到达后，下一个 tick 即终止；终止后不再写出任何 chunk（确定性取消）。

export class GenerationTask {
  constructor({ chunks, intervalMs, onChunk, onEvent }) {
    this.chunks = chunks;
    this.intervalMs = intervalMs;
    this.onChunk = onChunk;
    this.onEvent = onEvent;
  }

  start(signal) {
    return new Promise((resolve) => {
      let written = 0;
      const finish = (reason) => {
        const terminatedAt = new Date().toISOString();
        this.onEvent({ event: reason, chunks_written: written, at: terminatedAt });
        resolve({ aborted: reason === 'task_terminated', chunksWritten: written, terminatedAt });
      };
      const timer = setInterval(() => {
        if (signal.aborted) {
          clearInterval(timer);
          finish('task_terminated');
          return;
        }
        written += 1;
        this.onChunk(written);
        this.onEvent({ event: 'chunk_written', index: written, at: new Date().toISOString() });
        if (written >= this.chunks) {
          clearInterval(timer);
          finish('task_complete');
        }
      }, this.intervalMs);
      if (signal.aborted) {
        clearInterval(timer);
        finish('task_terminated');
      }
    });
  }
}
