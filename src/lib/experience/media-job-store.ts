/**
 * 媒体任务账本——长耗时生成的可恢复事实源。
 *
 * 账本只记录“发起了什么、现在怎样、产物在哪”，不解释业务状态；
 * 会话状态仍由 ExperienceRuntime 唯一写入。JSON 落盘覆盖服务重启，
 * 原子替换避免读到半截任务。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GenerationModality } from './generation-intent';

export type MediaJobStatus = 'running' | 'completed' | 'failed' | 'canceled';

export interface MediaJob {
  id: string;
  ownerId: string;
  sessionId: string;
  turn: number;
  modality: GenerationModality;
  prompt: string;
  idempotencyKey: string;
  status: MediaJobStatus;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  artifactFiles: string[];
}

export interface CreateMediaJobInput {
  sessionId: string;
  turn: number;
  modality: GenerationModality;
  prompt: string;
  idempotencyKey: string;
}

export class MediaJobStore {
  /** 进程内串行化，防止并发事件读写覆盖账本。 */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file = path.join(process.cwd(), 'data', 'media', 'jobs.json'),
    private readonly ownerId = processOwnerId,
  ) {}

  async create(input: CreateMediaJobInput): Promise<MediaJob> {
    return this.enqueue(async () => {
      const jobs = await this.read();
      const reusable = [...jobs]
        .reverse()
        .find((job) => job.idempotencyKey === input.idempotencyKey && (job.status === 'running' || job.status === 'completed'));
      if (reusable) return reusable;

      const now = new Date().toISOString();
      const job: MediaJob = {
        id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        ownerId: this.ownerId,
        ...input,
        status: 'running',
        startedAt: now,
        updatedAt: now,
        completedAt: null,
        error: null,
        artifactFiles: [],
      };
      jobs.push(job);
      await this.write(jobs);
      return job;
    });
  }

  async complete(id: string, artifactFiles: readonly string[]): Promise<MediaJob | null> {
    return this.update(id, (job) => ({
      ...job,
      status: 'completed',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: null,
      artifactFiles: [...artifactFiles],
    }));
  }

  async fail(id: string, error: string): Promise<MediaJob | null> {
    return this.update(id, (job) => ({
      ...job,
      status: 'failed',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: error || '生成失败',
    }));
  }

  async listBySession(sessionId: string): Promise<MediaJob[]> {
    const jobs = await this.read();
    return jobs.filter((job) => job.sessionId === sessionId);
  }

  async markForeignRunning(ownerId: string): Promise<MediaJob[]> {
    return this.enqueue(async () => {
      const jobs = await this.read();
      const changed: MediaJob[] = [];
      const now = new Date().toISOString();
      for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index]!;
        if (job.status !== 'running' || job.ownerId === ownerId) continue;
        const next: MediaJob = {
          ...job,
          status: 'failed',
          updatedAt: now,
          completedAt: now,
          error: '服务已重启，这次后台任务被中断，请重新发起',
        };
        jobs[index] = next;
        changed.push(next);
      }
      if (changed.length > 0) await this.write(jobs);
      return changed;
    });
  }

  private async update(id: string, patch: (job: MediaJob) => MediaJob): Promise<MediaJob | null> {
    return this.enqueue(async () => {
      const jobs = await this.read();
      const index = jobs.findIndex((job) => job.id === id);
      if (index === -1) return null;
      const next = patch(jobs[index]!);
      jobs[index] = next;
      await this.write(jobs);
      return next;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async read(): Promise<MediaJob[]> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as MediaJob[]) : [];
    } catch {
      return [];
    }
  }

  private async write(jobs: readonly MediaJob[]): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temp, JSON.stringify(jobs, null, 1), 'utf8');
    await rename(temp, this.file);
  }
}

let mediaJobStoreInstance: MediaJobStore | null = null;

/** 同一进程内的 running 才可能仍在执行；属主变了就是重启遗留。 */
const processOwnerId = randomUUID();

export function getMediaJobStore(): MediaJobStore {
  if (!mediaJobStoreInstance) {
    mediaJobStoreInstance = new MediaJobStore();
  }
  return mediaJobStoreInstance;
}

export function getMediaJobProcessOwnerId(): string {
  return processOwnerId;
}
