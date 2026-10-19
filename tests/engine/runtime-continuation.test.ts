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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// 模块顶层 import 会在 env 设置前构造 PrismaClient——
// 全部引擎模块经动态 import 加载。
const tmpDir = mkdtempSync(join(tmpdir(), 'exp-continuation-'));
process.env.DATABASE_URL = `file:${join(tmpDir, 'test.db').replace(/\\/g, '/')}`;

// 类型导入经 ts 擦除——不触发模块加载，env 设置顺序安全。
import type { StartInput } from '../../src/lib/experience/runtime';
import type { MediaGateway } from '../../src/lib/experience/media-gateway';
import type { TurnEvent } from '../../src/lib/experience/types';

const { ExperienceRuntime } = await import('../../src/lib/experience/runtime');
const { MediaJobStore } = await import('../../src/lib/experience/media-job-store');
const store = await import('../../src/lib/experience/store');

type SessionEvent = Extract<TurnEvent, { type: 'session' }>;
type DoneEvent = Extract<TurnEvent, { type: 'done' }>;
type ErrorEvent = Extract<TurnEvent, { type: 'error' }>;

/** 记录图像生成调用（参考图断言的核心证据）。 */
interface ImageCall {
  prompt: string;
  referenceImages: string[] | undefined;
}

/** 记录视频生成调用（G1.1 图像→视频上下文接续的证据）。 */
interface VideoCall {
  prompt: string;
  referenceImages: string[] | undefined;
}

/** 假媒体网关：参考图按会话映射，图像 / 视频调用全记录。 */
function makeFakeMedia(
  refs: Map<string, string>,
  calls: ImageCall[],
  videoCalls: VideoCall[] = [],
  imagePrompts: Map<string, string> = new Map()
) {
  return {
    async loadSessionImageReference(sessionId: string): Promise<string | null> {
      return refs.get(sessionId) ?? null;
    },
    async loadSessionImageContext(
      sessionId: string
    ): Promise<{ reference: string; promptUsed: string; file: string } | null> {
      const reference = refs.get(sessionId);
      if (!reference) return null;
      return { reference, promptUsed: imagePrompts.get(sessionId) ?? '上一张图的画面描述', file: 'fake.png' };
    },
    async generateImages(
      prompt: string,
      options: { sessionId: string; turn: number; referenceImages?: string[] }
    ) {
      calls.push({ prompt, referenceImages: options.referenceImages });
      return [
        {
          id: `fake-img-${calls.length}`,
          sessionId: options.sessionId,
          turn: options.turn,
          modality: 'image' as const,
          file: 'fake.png',
          mime: 'image/png',
          promptUsed: prompt,
          at: new Date().toISOString(),
        },
      ];
    },
    async generateVoice(): Promise<never> {
      throw new Error('语音生成不在本测试预期内');
    },
    async generateVideo(
      prompt: string,
      options: { sessionId: string; turn: number; referenceImages?: string[] }
    ) {
      videoCalls.push({ prompt, referenceImages: options.referenceImages });
      return {
        id: `fake-video-${videoCalls.length}`,
        sessionId: options.sessionId,
        turn: options.turn,
        modality: 'video' as const,
        file: 'fake.mp4',
        mime: 'video/mp4',
        promptUsed: prompt,
        at: new Date().toISOString(),
        referenceRequested: (options.referenceImages?.length ?? 0) > 0,
        referenceApplied: false,
      };
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
let videoCalls: VideoCall[];
let imagePrompts: Map<string, string>;
let priorSessionId: string;

beforeAll(async () => {
  const { db } = await import('../../src/lib/db');
  await db.$executeRawUnsafe(`CREATE TABLE "ExperienceSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seedId" TEXT,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "exitReason" TEXT,
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`);
  await db.$executeRawUnsafe(`CREATE TABLE "ExperienceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "stateVersion" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("sessionId") REFERENCES "ExperienceSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await db.$executeRawUnsafe(
    'CREATE UNIQUE INDEX "ExperienceEvent_sessionId_seq_key" ON "ExperienceEvent"("sessionId", "seq")',
  );
  await db.$executeRawUnsafe(`CREATE TABLE "MemoryRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "intentSignal" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "interestSignal" REAL NOT NULL,
    "corrections" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRecalledAt" DATETIME,
    "withdrawnAt" DATETIME,
    "expiredAt" DATETIME,
    "deletionAudit" JSONB
  )`);
  refs = new Map();
  imageCalls = [];
  videoCalls = [];
  imagePrompts = new Map();
  const fakeMedia = makeFakeMedia(refs, imageCalls, videoCalls, imagePrompts);
  // 媒体网关为类（名义类型）——结构等价对象经断言转型。
  runtime = new ExperienceRuntime(
    fakeLlm,
    fakeMedia as unknown as MediaGateway,
    new MediaJobStore(join(tmpDir, 'media-jobs.json'))
  );
  // 种子会话：已完成创作的「月光下的猫」（最新图像产物为参考来源）。
  const prior = await store.createSession({
    seedId: 'moon-cat',
    topic: '月光下的猫',
    experienceId: 'moon-cat',
  });
  priorSessionId = prior.id;
  refs.set(prior.id, 'data:image/png;base64,QUJDREVG');
  imagePrompts.set(prior.id, '月光下的猫蜷缩在窗台，宁静夜色，画面温馨自然');
});

afterAll(async () => {
  // 先断开 Prisma 连接——Windows 下 SQLite 文件锁随客户端存活。
  const { db } = await import('../../src/lib/db');
  await db.$disconnect();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('G2-7 完成后续作：续作启动', () => {
  it('自由叙事指令不再触发 UNKNOWN 边界，而是作为普通回答承接', async () => {
    const events = await collect({
      freeText: '带我走一圈宇宙，从房间到太阳系边缘再回来',
    });
    const content = events.find((e): e is Extract<TurnEvent, { type: 'content' }> => e.type === 'content');
    const done = events.find((e): e is DoneEvent => e.type === 'done');
    expect(content?.kind).toBe('FIRST_LAYER');
    expect(content?.text).toContain('（测试回答');
    expect(events.some((event) => event.kind === 'BOUNDARY_NOTICE')).toBe(false);
    expect(done?.ended).toBe(false);
  });

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

  it('“根据选中图重新生成”越过修正澄清，直接进入图生图', async () => {
    const before = imageCalls.length;
    const events = await collect({
      continueSessionId: priorSessionId,
      freeText: '根据刚才选中的那张图重新生成一张：把邮局换成红砖小火车站',
    });

    // 通用修正词表会命中“换成”；若运行时路由错误，这里会先
    // 追加 CREATION_ASK 澄清轮，而不是发起媒体生成。
    expect(events.some((event) => event.type === 'content' && event.kind === 'CREATION_ASK')).toBe(false);
    expect(imageCalls.length).toBe(before + 1);
    expect(imageCalls[before]?.prompt).toBe(
      '把邮局换成红砖小火车站，画面温馨自然，细节丰富。严格遵循上述画面中的主体、数量、时间、天气、季节、光线、场景、材质、动作、位置和保留对象；不得替换成相反的时间、天气或场景，不得增删关键限定物，不得加入水印或文字签名。',
    );
    expect(imageCalls[before]?.referenceImages).toEqual([
      'data:image/png;base64,QUJDREVG',
    ]);
  });

  it('G1.1：把已有图像做成视频时，参考图与画面描述都进入视频生成', async () => {
    const before = videoCalls.length;
    const events = await collect({
      continueSessionId: priorSessionId,
      freeText: '把它做成视频，镜头缓缓推进',
    });

    expect(videoCalls.length).toBe(before + 1);
    const call = videoCalls[before];
    expect(call?.referenceImages).toEqual(['data:image/png;base64,QUJDREVG']);
    // 视频提示词来自所选图像的画面描述 + 用户新约束，
    // 而不是把「把它做成视频」当成画面主体。
    expect(call?.prompt).toContain('月光下的猫蜷缩在窗台');
    expect(call?.prompt).toContain('镜头缓缓推进');
    expect(call?.prompt).not.toContain('把它做成视频');

    const completed = events.find(
      (event): event is Extract<TurnEvent, { type: 'generation'; status: 'completed' }> =>
        event.type === 'generation' && event.status === 'completed'
    );
    expect(completed?.referenceRequested).toBe(true);
    expect(completed?.referenceApplied).toBe(false);

    // 等待态也要能如实显示来源（「将基于已选图像接续生成」）。
    const started = events.find(
      (event): event is Extract<TurnEvent, { type: 'generation'; status: 'started' }> =>
        event.type === 'generation' && event.status === 'started'
    );
    expect(started?.referenceSource).toBe('月光下的猫蜷缩在窗台，宁静夜色，画面温馨自然');
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
