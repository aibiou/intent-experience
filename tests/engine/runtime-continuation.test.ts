/// <reference types="bun-types" />
/**
 * G2-7 完成后续作——runtime 集成测试。
 *
 * 真实 store（临时 DB 副本——DATABASE_URL 在 PrismaClient
 * 构造前重定向）+ 假 LLM / 媒体网关。验证续作启动的
 * 核心契约：
 * - 主题继承（「原主题·续作」）
 * - 首轮图生图意图的参考图回落到种子会话最新产物
 *   （一致性来源——完成后续作的存在意义）
 * - 负面对照：普通新会话无种子、无产物 → 文生图（无参考）
 * - 输入校验（会话不存在 / 缺续作输入）
 */
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// 模块顶层 import 会在 env 设置前构造 PrismaClient——
// 全部引擎模块经动态 import 加载。
const tmpDir = mkdtempSync(join(tmpdir(), 'exp-continuation-'));
process.env.DATABASE_URL = `file:${join(tmpDir, 'test.db').replace(/\\/g, '/')}`;
copyFileSync(
  join(import.meta.dir, '..', '..', 'prisma', 'dev.db'),
  join(tmpDir, 'test.db')
);

// 类型导入经 ts 擦除——不触发模块加载，env 设置顺序安全。
import type { StartInput } from '../../src/lib/experience/runtime';
import type { MediaGateway } from '../../src/lib/experience/media-gateway';
import type { TurnEvent } from '../../src/lib/experience/types';

const { ExperienceRuntime } = await import('../../src/lib/experience/runtime');
const store = await import('../../src/lib/experience/store');

type SessionEvent = Extract<TurnEvent, { type: 'session' }>;
type DoneEvent = Extract<TurnEvent, { type: 'done' }>;
type ErrorEvent = Extract<TurnEvent, { type: 'error' }>;

/** 记录图像生成调用（参考图断言的核心证据）。 */
interface ImageCall {
  prompt: string;
  referenceImages: string[] | undefined;
}

/** 假媒体网关：参考图按会话映射，图像调用全记录。 */
function makeFakeMedia(refs: Map<string, string>, calls: ImageCall[]) {
  return {
    async loadSessionImageReference(sessionId: string): Promise<string | null> {
      return refs.get(sessionId) ?? null;
    },
    async generateImage(
      prompt: string,
      options: { sessionId: string; turn: number; referenceImages?: string[] }
    ) {
      calls.push({ prompt, referenceImages: options.referenceImages });
      return {
        id: `fake-img-${calls.length}`,
        sessionId: options.sessionId,
        turn: options.turn,
        modality: 'image' as const,
        file: 'fake.png',
        mime: 'image/png',
        promptUsed: prompt,
        at: new Date().toISOString(),
      };
    },
    async generateVoice(): Promise<never> {
      throw new Error('语音生成不在本测试预期内');
    },
    async generateVideo(): Promise<never> {
      throw new Error('视频生成不在本测试预期内');
    },
  };
}

/** 假 LLM 网关：确定性回答。 */
const fakeLlm = {
  name: 'fake-llm-gateway',
  async generate(): Promise<{ text: string }> {
    return { text: '（测试回答：一只打盹的猫）' };
  },
};

const signal = new AbortController().signal;

async function collect(startInput: StartInput): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of runtime.start(startInput, signal)) {
    events.push(event);
  }
  return events;
}

let runtime: InstanceType<typeof ExperienceRuntime>;
let refs: Map<string, string>;
let imageCalls: ImageCall[];
let priorSessionId: string;

beforeAll(async () => {
  refs = new Map();
  imageCalls = [];
  const fakeMedia = makeFakeMedia(refs, imageCalls);
  // 媒体网关为类（名义类型）——结构等价对象经断言转型。
  runtime = new ExperienceRuntime(
    fakeLlm,
    fakeMedia as unknown as MediaGateway
  );
  // 种子会话：已完成创作的「月光下的猫」（最新图像产物为参考来源）。
  const prior = await store.createSession({
    seedId: 'moon-cat',
    topic: '月光下的猫',
    experienceId: 'moon-cat',
  });
  priorSessionId = prior.id;
  refs.set(prior.id, 'data:image/png;base64,QUJDREVG');
});

afterAll(async () => {
  // 先断开 Prisma 连接——Windows 下 SQLite 文件锁随客户端存活。
  const { db } = await import('../../src/lib/db');
  await db.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('G2-7 完成后续作：续作启动', () => {
  it('主题继承为「原主题·续作」，首轮图生图参考图回落到种子会话最新产物', async () => {
    const events = await collect({
      continueSessionId: priorSessionId,
      freeText: '再换一张图，猫在打盹',
    });

    // 会话建立：主题 = 原主题·续作，且是新会话
    const sessionEvent = events.find(
      (e): e is SessionEvent => e.type === 'session'
    );
    expect(sessionEvent).toBeDefined();
    expect(sessionEvent?.topic).toBe('月光下的猫·续作');
    expect(sessionEvent?.sessionId).not.toBe(priorSessionId);

    // 首轮即再生成表达（regen）：图像生成携带提示词「猫在打盹」
    // （短输入确定性增富——prompt 以前缀包含约束原文）
    expect(imageCalls.length).toBe(1);
    expect(imageCalls[0]?.prompt).toContain('猫在打盹');

    // 核心契约：新会话无自有产物 → 回落种子会话最新图像产物
    expect(imageCalls[0]?.referenceImages).toEqual([
      'data:image/png;base64,QUJDREVG',
    ]);

    // 流程完整收束（done 且未结束）
    const done = events.find((e): e is DoneEvent => e.type === 'done');
    expect(done).toBeDefined();
    expect(done?.ended).toBe(false);
  });

  it('续作可重复：再次从同一种子会话续作（无状态泄漏）', async () => {
    const events = await collect({
      continueSessionId: priorSessionId,
      freeText: '再换一张图，窗台上晒太阳',
    });

    expect(imageCalls.length).toBe(2);
    expect(imageCalls[1]?.referenceImages).toEqual([
      'data:image/png;base64,QUJDREVG',
    ]);
    const sessionEvent = events.find(
      (e): e is SessionEvent => e.type === 'session'
    );
    expect(sessionEvent?.topic).toBe('月光下的猫·续作');
  });

  it('负面对照：种子会话无图像产物 → 文生图（诚实降级，不阻断生成）', async () => {
    // 纯文本会话（无任何图像产物）——续作它时参考图回落无果
    const textOnly = await store.createSession({
      seedId: null,
      topic: '纯文本会话',
      experienceId: 'custom',
    });
    const before = imageCalls.length;
    const events = await collect({
      continueSessionId: textOnly.id,
      freeText: '再换一张图，荒野上的猫',
    });
    expect(imageCalls.length).toBe(before + 1);
    expect(imageCalls[before]?.referenceImages).toBeUndefined();

    const done = events.find((e): e is DoneEvent => e.type === 'done');
    expect(done?.ended).toBe(false);
  });

  it('输入校验：种子会话不存在 → 如实报错', async () => {
    const events = await collect({
      continueSessionId: '不存在的会话',
      freeText: '再换一张图，猫在打盹',
    });
    const error = events.find((e): e is ErrorEvent => e.type === 'error');
    expect(error).toBeDefined();
    expect(error?.message).toBe('未找到该会话');
  });

  it('输入校验：缺少续作输入 → 如实报错', async () => {
    const events = await collect({
      continueSessionId: priorSessionId,
    });
    const error = events.find((e): e is ErrorEvent => e.type === 'error');
    expect(error).toBeDefined();
    expect(error?.message).toBe('缺少续作输入');
  });
});
