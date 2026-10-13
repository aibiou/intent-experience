/**
 * 提示词蒸馏引擎单元测试（node --experimental-strip-types 运行）：
 * 覆盖输出净化（前缀 / 引号 / 多行 / 超长 / 过短）、失败回退
 * （非 JSON / 5xx / 网络失败）、请求形状（模型 / 双消息 / 温度）、
 * 模态指令（图像 vs 视频系统提示词）、画幅 / 时长 / 系列上下文注入。
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { distillVisualPrompt } from '../src/experience/prompt-engine.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    failures.push(`${name}: ${(error as Error).message}`);
    console.log(`  ✗ ${name}`);
  }
}

function startMock(handler: (body: any, req: any) => { status?: number; body?: unknown }): Promise<{
  server: Server;
  port: number;
  lastBody: () => any;
}> {
  return new Promise((resolve) => {
    let lastBody: any = null;
    const server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        try {
          lastBody = JSON.parse(raw);
        } catch {
          lastBody = null;
        }
        const result = handler(lastBody, req);
        res.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body ?? {
          choices: [{ message: { content: '一只猫坐在窗台上，柔和光线，写实风格' } }],
        }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0, lastBody: () => lastBody });
    });
  });
}

function mockConfig(port: number) {
  return {
    provider: 'mock',
    model: 'mock-model-1',
    endpoint: `http://127.0.0.1:${port}/v1`,
    modality: 'text' as const,
    temperature: 0.7,
    systemPrompt: 'unused',
    apiKey: 'sk-mock-test',
  };
}

const ok = (content: string) => ({ choices: [{ message: { content } }] });

const serverPromise = startMock((body) => {
  const user = body?.messages?.[1]?.content ?? '';
  if (user.includes('FORCE_500')) return { status: 500, body: { error: 'boom' } };
  if (user.includes('BAD_JSON')) return { status: 200, body: { not: 'json-shape' } };
  return ok('一只橘猫坐在木质窗台上，午后阳光斜射，毛发细节丰富，景深虚化，写实插画风格，暖色调');
});

const { server, port, lastBody } = await serverPromise;
const config = mockConfig(port);

console.log('提示词蒸馏引擎单元测试');

await test('正常蒸馏：返回模型输出', async () => {
  const m = await withMock(ok('一只橘猫坐在木质窗台上，午后阳光斜射，毛发细节丰富，景深虚化，写实插画风格，暖色调'));
  const result = await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: '画一只猫' });
  assert.ok(result !== null && result.includes('橘猫'));
});

// 逐用例独立 mock（每个用例自己的服务器——互不串扰）
async function withMock(returnBody: unknown, status = 200): Promise<{ port: number; lastBody: () => any }> {
  return new Promise((resolve) => {
    let lastBody: any = null;
    const s = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        try { lastBody = JSON.parse(raw); } catch { lastBody = null; }
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(returnBody));
      });
    });
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      resolve({ port: typeof a === 'object' && a ? a.port : 0, lastBody: () => lastBody });
    });
  });
}

await test('净化：剥「提示词：」前缀', async () => {
  const m = await withMock(ok('提示词：一只白猫在雪地里，极简风格'));
  const result = await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: '画一只白猫' });
  assert.equal(result, '一只白猫在雪地里，极简风格');
});

await test('净化：剥成对引号', async () => {
  const m = await withMock(ok('「一只白猫在雪地里，极简风格」'));
  const result = await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: 'x' });
  assert.equal(result, '一只白猫在雪地里，极简风格');
});

await test('净化：多行取首个非空行', async () => {
  const m = await withMock(ok('一只白猫在雪地里\n解释：这是补充说明'));
  const result = await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: 'x' });
  assert.equal(result, '一只白猫在雪地里');
});

await test('净化：过短（<5 字）拒绝', async () => {
  const m = await withMock(ok('一只猫'));
  const result = await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: 'x' });
  assert.equal(result, null);
});

await test('净化：超长（>200 字）拒绝', async () => {
  const m = await withMock(ok('长'.repeat(201)));
  const result = await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: 'x' });
  assert.equal(result, null);
});

await test('回退：HTTP 500 → null', async () => {
  const m = await withMock({ error: 'boom' }, 500);
  const result = await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: 'x' });
  assert.equal(result, null);
});

await test('回退：响应体形状不符 → null', async () => {
  const m = await withMock({ not: 'json-shape' });
  const result = await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: 'x' });
  assert.equal(result, null);
});

await test('回退：网络失败（拒绝连接）→ null', async () => {
  const result = await distillVisualPrompt(mockConfig(9), { modality: 'image', intentPrompt: 'x' });
  assert.equal(result, null);
});

await test('请求形状：model / 双消息 / 温度 0.85 / Bearer 鉴权', async () => {
  const m = await withMock(ok('一只白猫在雪地里，极简风格'));
  await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: '画一只白猫' });
  const body = m.lastBody();
  assert.equal(body.model, 'mock-model-1');
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.temperature, 0.85);
  assert.ok(body.messages[1].content.includes('画一只白猫'));
});

await test('模态指令：视频走视频系统提示词（含镜头语言要求）', async () => {
  const m = await withMock(ok('云海翻涌，镜头缓慢推进，光影流动，大气磅礴'));
  await distillVisualPrompt(mockConfig(m.port), { modality: 'video', intentPrompt: '做一段云海的视频' });
  const sys = m.lastBody().messages[0].content;
  assert.ok(sys.includes('视频'), 'system 应为视频指令');
  assert.ok(sys.includes('镜头'), 'system 应含镜头语言要求');
});

await test('模态指令：图像走图像系统提示词（不含镜头要求）', async () => {
  const m = await withMock(ok('一只白猫在雪地里，极简风格'));
  await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: 'x' });
  const sys = m.lastBody().messages[0].content;
  assert.ok(sys.includes('图像生成'));
  assert.ok(!sys.includes('镜头语言'));
});

await test('画幅注入：9:16 → 竖版构图', async () => {
  const m = await withMock(ok('一只白猫在雪地里，竖版构图，极简风格'));
  await distillVisualPrompt(mockConfig(m.port), { modality: 'image', intentPrompt: 'x', aspectRatio: '9:16' });
  assert.ok(m.lastBody().messages[1].content.includes('竖版构图'));
});

await test('视频时长注入：8 秒', async () => {
  const m = await withMock(ok('云海翻涌，镜头缓慢推进'));
  await distillVisualPrompt(mockConfig(m.port), { modality: 'video', intentPrompt: 'x', seconds: '8' });
  assert.ok(m.lastBody().messages[1].content.includes('8 秒'));
});

await test('系列上下文注入：最终提示词入参', async () => {
  const m = await withMock(ok('一只白猫在雪地里，极简风格'));
  await distillVisualPrompt(mockConfig(m.port), {
    modality: 'image',
    intentPrompt: 'x',
    previousPrompts: ['第一幅的完整提示词', '第二幅的完整提示词'],
  });
  const user = m.lastBody().messages[1].content;
  assert.ok(user.includes('第一幅的完整提示词'));
  assert.ok(user.includes('明显不同'));
});

server.close();
console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
// mock 服务器句柄会挂住进程——显式退出（结果已输出）。
process.exit(failed > 0 ? 1 : 0);
