/// <reference types="bun-types" />
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'bun:test';
import { MediaJobStore } from '../../src/lib/experience/media-job-store';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'media-jobs-'));
});

function createStore(): MediaJobStore {
  return new MediaJobStore(path.join(workDir, 'jobs.json'));
}

describe('媒体任务账本', () => {
  it('创建即持久化为 running，并支持按会话查询', async () => {
    const store = createStore();
    const job = await store.create({
      sessionId: 'session-1',
      turn: 3,
      modality: 'video',
      prompt: '傍晚海边的风',
      idempotencyKey: 'session-1:3:video:prompt',
    });

    expect(job.status).toBe('running');
    expect(job.artifactFiles).toEqual([]);
    expect(job.ownerId).toBeString();

    const reopened = createStore();
    const jobs = await reopened.listBySession('session-1');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe(job.id);
    expect(jobs[0]?.modality).toBe('video');
  });

  it('完成时登记产物并持久化', async () => {
    const store = createStore();
    const job = await store.create({
      sessionId: 'session-1',
      turn: 1,
      modality: 'image',
      prompt: '湖边帆船',
      idempotencyKey: 'image-key',
    });

    const completed = await store.complete(job.id, ['a.png', 'b.png']);
    expect(completed?.status).toBe('completed');
    expect(completed?.artifactFiles).toEqual(['a.png', 'b.png']);
    expect(completed?.completedAt).toBeString();
    expect((await createStore().listBySession('session-1'))[0]?.status).toBe('completed');
  });

  it('失败保留可读原因，同 key 失败后允许重试新任务', async () => {
    const store = createStore();
    const first = await store.create({
      sessionId: 'session-1',
      turn: 2,
      modality: 'video',
      prompt: '清晨山间木屋',
      idempotencyKey: 'video-key',
    });
    await store.fail(first.id, '上游排队超时');

    const retry = await store.create({
      sessionId: 'session-1',
      turn: 2,
      modality: 'video',
      prompt: '清晨山间木屋',
      idempotencyKey: 'video-key',
    });

    expect(retry.id).not.toBe(first.id);
    expect(retry.status).toBe('running');
    expect((await store.listBySession('session-1')).map((job) => job.status)).toEqual([
      'failed',
      'running',
    ]);
  });

  it('同一 key 的 running / completed 任务不会被重复创建', async () => {
    const store = createStore();
    const input = {
      sessionId: 'session-1',
      turn: 4,
      modality: 'image' as const,
      prompt: '黄昏湖边帆船',
      idempotencyKey: 'stable-key',
    };
    const first = await store.create(input);
    const runningAgain = await store.create(input);

    await store.complete(first.id, ['selected.png']);
    const completedAgain = await store.create(input);

    expect(runningAgain.id).toBe(first.id);
    expect(completedAgain.id).toBe(first.id);
    expect(await store.listBySession('session-1')).toHaveLength(1);
  });

  it('服务重启后旧进程遗留的 running 任务转为可读失败', async () => {
    const store = createStore();
    const job = await store.create({
      sessionId: 'session-1',
      turn: 5,
      modality: 'video',
      prompt: '海风形成动画',
      idempotencyKey: 'restart-key',
    });

    const reopenedOwnerId = randomUUID();
    const reopened = await new MediaJobStore(
      path.join(workDir, 'jobs.json'),
      reopenedOwnerId
    ).markForeignRunning(reopenedOwnerId);
    expect(reopened.map((item) => item.id)).toEqual([job.id]);
    const [failed] = await store.listBySession('session-1');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('服务已重启');
  });
});
