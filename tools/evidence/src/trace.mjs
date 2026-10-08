// trace.mjs — append-only trace capture (E5 §4 Evidence / §7 traces/).
// Each event carries an ISO-8601 timestamp; events are never rewritten.

import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export class TraceWriter {
  constructor(tracesDir, caseId) {
    this.tracesDir = tracesDir;
    this.caseId = caseId;
    this.filePath = path.join(tracesDir, `${caseId}.jsonl`);
    this.startedAt = null;
    this._initialized = false;
  }

  async _ensureDir() {
    if (!this._initialized) {
      await mkdir(this.tracesDir, { recursive: true });
      this._initialized = true;
    }
  }

  async start(payload = {}) {
    this.startedAt = new Date().toISOString();
    await this._ensureDir();
    await this.emit('trace_started', payload);
  }

  async emit(event, payload = {}) {
    await this._ensureDir();
    const record = {
      caseId: this.caseId,
      event,
      at: new Date().toISOString(),
      ...payload,
    };
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }

  async complete(payload = {}) {
    await this.emit('trace_completed', {
      startedAt: this.startedAt,
      durationMs: this.startedAt
        ? Date.now() - Date.parse(this.startedAt)
        : null,
      ...payload,
    });
  }
}
