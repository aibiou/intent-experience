/**
 * 豆包本机桥接（Doubao Bridge）
 *
 * 通过豆包桌面端的 CDP 在隐藏页面中生成图像 / 视频 / 音乐。
 * 稳定性纪律：不切换用户会话、不抢焦点；同一时间只运行一个任务；
 * 任务结束、失败或桥接重启时都清理带标记的隐藏页。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import CDP from 'chrome-remote-interface';

const PORT = Number(process.env.DOUBAO_BRIDGE_PORT ?? 3220);
const CDP_PORT = Number(process.env.DOUBAO_CDP_PORT ?? 9333);
const DOUBAO_APP = '/Applications/Doubao.app';
const CHAT_URL = 'chrome://doubao-chat/chat';
const BODY_MAX_BYTES = 64 * 1024;
const BRIDGE_CHAT_STATE = join(
  homedir(),
  'Library/Application Support/DoubaoBridge/bridge-chat.txt',
);

type Modality = 'image' | 'video' | 'audio';

const TIMEOUTS: Record<Modality, number> = {
  image: 150_000,
  video: 900_000,
  audio: 300_000,
};

const PROMPT_PREFIX: Record<Modality, string> = {
  image: '生成一张图片：',
  video: '生成一段视频：',
  audio: '生成一段音乐：',
};

interface CDPTarget {
  id: string;
  url: string;
  type: string;
}

interface Artifact {
  url: string;
  mime: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

interface PageArtifacts {
  images?: Array<{ src: string; width: number; height: number }>;
  videos?: Array<{
    src: string;
    width: number;
    height: number;
    duration: number;
  }>;
  audios?: Array<{ src: string }>;
}

type CDPClient = import('chrome-remote-interface').Client;
interface AttachedPage {
  browser: CDPClient;
  sessionId: string;
  networkUrls: Set<string>;
}

let busy = false;
let lastError = '';
let activeJobs = 0;
let bridgeChatUrl = process.env.DOUBAO_BRIDGE_CHAT_URL ?? '';

async function loadBridgeChatUrl(): Promise<string> {
  if (bridgeChatUrl) return bridgeChatUrl;
  try {
    const saved = (await readFile(BRIDGE_CHAT_STATE, 'utf8')).trim();
    if (/^(doubao|chrome):\/\/doubao-chat\/chat\/[^/?#]+$/.test(saved)) {
      bridgeChatUrl = saved;
    }
  } catch {
    // First run has no dedicated conversation yet.
  }
  return bridgeChatUrl;
}

async function saveBridgeChatUrl(url: string): Promise<void> {
  if (!/^(doubao|chrome):\/\/doubao-chat\/chat\/[^/?#]+$/.test(url)) return;
  bridgeChatUrl = url;
  await mkdir(join(BRIDGE_CHAT_STATE, '..'), { recursive: true });
  await writeFile(BRIDGE_CHAT_STATE, `${url}\n`, 'utf8');
}

async function cdpTargets(): Promise<CDPTarget[]> {
  return (await CDP.List({ port: CDP_PORT })) as CDPTarget[];
}

async function isDoubaoReady(): Promise<boolean> {
  try {
    const targets = await cdpTargets();
    return targets.some(
      (target) => target.type === 'page' && target.url.includes('doubao-chat'),
    );
  } catch {
    return false;
  }
}

async function withBrowser<T>(
  run: (browser: CDPClient) => Promise<T>,
): Promise<T> {
  const version = await CDP.Version({ port: CDP_PORT });
  const browser = await CDP({
    port: CDP_PORT,
    target: version.webSocketDebuggerUrl,
  });
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}

async function ensureDoubaoReady(): Promise<void> {
  if (await isDoubaoReady()) return;
  if (process.env.DOUBAO_AUTO_START === 'false') {
    throw new Error('豆包未运行（自动启动已关闭）');
  }

  // open -gj 保持后台启动，避免从用户正在使用的窗口抢焦点。
  const child = spawn(
    '/usr/bin/open',
    ['-gj', '-a', DOUBAO_APP, '--args', `--remote-debugging-port=${CDP_PORT}`],
    { stdio: 'ignore', detached: true },
  );
  child.unref();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await isDoubaoReady()) return;
  }
  throw new Error('豆包 CDP 未就绪（30s 超时）');
}

async function findChatTargetId(): Promise<string> {
  const targets = await cdpTargets();
  const target = targets.find(
    (candidate) =>
      candidate.type === 'page' &&
      /^doubao:\/\/doubao-chat\/chat|^chrome:\/\/doubao-chat\/chat/.test(candidate.url),
  );
  if (!target) throw new Error('未找到豆包聊天页');
  return target.id;
}

async function attachPage(
  browser: CDPClient,
  targetId: string,
): Promise<AttachedPage> {
  let sessionId = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const attached = await browser.send('Target.attachToTarget', {
        targetId,
        flatten: true,
      });
      sessionId = attached.sessionId;
      break;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!sessionId) throw new Error('豆包聊天页挂载失败');

  const networkUrls = new Set<string>();
  await browser.send('Network.enable', {}, sessionId);
  browser.on('Network.responseReceived', (params: {
    response?: { url?: unknown };
  }, eventSessionId?: string) => {
    if (eventSessionId !== sessionId) return;
    const url = params.response?.url;
    if (typeof url === 'string') networkUrls.add(url);
  });
  return { browser, sessionId, networkUrls };
}

async function evaluatePage<T>(
  page: AttachedPage,
  expression: string,
): Promise<T> {
  const response = (await page.browser.send(
    'Runtime.evaluate',
    {
      expression,
      returnByValue: true,
      awaitPromise: true,
    },
    page.sessionId,
  )) as { result?: { value?: T } };
  return response.result?.value as T;
}

async function waitForEditor(page: AttachedPage): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const ready = await evaluatePage<boolean>(
        page,
        '!!document.querySelector(\'[contenteditable="true"]\')',
      );
      if (ready) {
        return;
      }
      // 新聊天路由有时先渲染启动页；只点页面里的“新对话”入口。
      await evaluatePage<boolean>(
        page,
        `(() => {
          const entry = [...document.querySelectorAll('a,[role="button"],button,div,span')]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .find((el) => (el.textContent || '').trim() === '新对话');
          if (!entry) return false;
          entry.click();
          return true;
        })()`,
      );
      if (attempt % 10 === 9) {
        console.log(
          `[doubao-bridge] waiting for hidden editor: attempt=${attempt + 1}`,
        );
      }
      lastError = '豆包聊天页输入框未就绪';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${lastError}（90s 超时）`);
}

async function sendPrompt(page: AttachedPage, prompt: string): Promise<void> {
  // Escape closes settings / popovers that can cover or steal editor focus.
  await page.browser.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  }, page.sessionId);
  await page.browser.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  }, page.sessionId);
  await new Promise((resolve) => setTimeout(resolve, 150));

  const focused = await evaluatePage<boolean>(
    page,
    `(() => {
      const editor = document.querySelector('[contenteditable="true"]');
      if (!editor) return false;
      editor.focus();
      return document.activeElement === editor;
    })()`,
  );
  if (!focused) throw new Error('豆包聊天页输入框无法聚焦');

  await page.browser.send(
    'Input.insertText',
    { text: prompt },
    page.sessionId,
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
  await page.browser.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    text: '\r',
  }, page.sessionId);
  await page.browser.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  }, page.sessionId);
}

async function confirmVideoTask(page: AttachedPage): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await sendPrompt(page, '确认');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

async function inspectPage(
  page: AttachedPage,
  modality: Modality,
): Promise<PageArtifacts> {
  if (modality === 'image') {
    return evaluatePage<PageArtifacts>(
      page,
      `JSON.stringify({
        images: [...document.querySelectorAll('img')]
          .filter((img) => String(img.src).includes('cgen_wm0'))
          .map((img) => ({
            src: img.src,
            width: img.naturalWidth,
            height: img.naturalHeight,
          })),
      })`,
    );
  }

  if (modality === 'video') {
    return evaluatePage<PageArtifacts>(
      page,
      `JSON.stringify({
        videos: [...document.querySelectorAll('video, video source')]
          .map((video) => ({
            src: video.currentSrc || video.src,
            width: video.videoWidth || 0,
            height: video.videoHeight || 0,
            duration: Number.isFinite(video.duration) ? video.duration : 0,
          }))
          .filter((video) => String(video.src).includes('unwatermarked')),
      })`,
    );
  }

  return evaluatePage<PageArtifacts>(
    page,
    `JSON.stringify({
      audios: [...document.querySelectorAll('audio, audio source')]
        .map((audio) => ({ src: audio.currentSrc || audio.src }))
        .filter((audio) => /^https?:\\/\\//.test(String(audio.src))),
    })`,
  );
}

async function pollArtifacts(
  page: AttachedPage,
  modality: Modality,
  baseline: Set<string>,
): Promise<Artifact[]> {
  const deadline = Date.now() + TIMEOUTS[modality];

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const networkUrl = [...page.networkUrls]
        .reverse()
        .find((url) => {
          if (modality === 'image') return url.includes('cgen_wm0');
          if (modality === 'video') return url.includes('unwatermarked');
          return /\.(mp3|wav)(?:$|\?)/.test(url);
        });
      if (networkUrl && !baseline.has(networkUrl)) {
        if (modality === 'image') {
          const dimensions = await evaluatePage<{ width: number; height: number }>(
            page,
            `fetch(${JSON.stringify(networkUrl)})
              .then((response) => response.blob())
              .then((blob) => createImageBitmap(blob))
              .then((bitmap) => ({ width: bitmap.width, height: bitmap.height }))`,
          ).catch(() => ({ width: undefined, height: undefined }));
          return [{
            url: networkUrl,
            mime: 'image/png',
            width: dimensions.width || undefined,
            height: dimensions.height || undefined,
          }];
        }
        if (modality === 'video') {
          return [{ url: networkUrl, mime: 'video/mp4' }];
        }
        return [{
          url: networkUrl,
          mime: /\.(wav)(?:$|\?)/.test(networkUrl) ? 'audio/wav' : 'audio/mpeg',
        }];
      }

      const found = await inspectPage(page, modality);
      if (modality === 'image' && found.images?.length) {
        const fresh = found.images.filter((item) => !baseline.has(item.src));
        if (fresh.length) {
          return fresh.map((item) => ({
            url: item.src,
            mime: 'image/png',
            width: item.width,
            height: item.height,
          }));
        }
      }
      if (modality === 'video' && found.videos?.length) {
        const video = found.videos[0];
        if (!baseline.has(video.src)) {
          return [{
            url: video.src,
            mime: 'video/mp4',
            width: video.width || undefined,
            height: video.height || undefined,
            durationSec: video.duration ? Math.round(video.duration) : undefined,
          }];
        }
      }
      if (modality === 'audio' && found.audios?.length) {
        const source = found.audios[0].src;
        if (!baseline.has(source)) {
          return [{
            url: source,
            mime: /\.(wav)(?:$|\?)/.test(source) ? 'audio/wav' : 'audio/mpeg',
          }];
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`生成超时（${Math.round(TIMEOUTS[modality] / 1000)}s）`);
}

function artifactUrl(url: string, modality: Modality): boolean {
  if (modality === 'image') return url.includes('cgen_wm0');
  if (modality === 'video') return url.includes('unwatermarked');
  return /\.(mp3|wav)(?:$|\?)/.test(url);
}

async function generate(
  modality: Modality,
  prompt: string,
): Promise<Artifact[]> {
  await ensureDoubaoReady();

  const targetId = await findChatTargetId();
  const version = await CDP.Version({ port: CDP_PORT });
  const browser = await CDP({
    port: CDP_PORT,
    target: version.webSocketDebuggerUrl,
  });
  const page = await attachPage(browser, targetId);
  const userState = await evaluatePage<string>(page, 'location.href').catch(
    () => '',
  );
  const baselineArtifacts = await inspectPage(page, modality).catch(
    (): PageArtifacts => ({}),
  );
  const baseline = new Set<string>([
    ...(baselineArtifacts.images ?? []).map((item) => item.src),
    ...(baselineArtifacts.videos ?? []).map((item) => item.src),
    ...(baselineArtifacts.audios ?? []).map((item) => item.src),
  ]);

  try {
    activeJobs += 1;
    const rememberedChat = await loadBridgeChatUrl();
    await evaluatePage(
      page,
      `location.href = ${JSON.stringify(rememberedChat || CHAT_URL)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 800));
    await waitForEditor(page);
    // Reopening the dedicated conversation can replay older media over the
    // network. Treat everything observed before this prompt as baseline.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const reopenedArtifacts = await inspectPage(page, modality).catch(
      (): PageArtifacts => ({}),
    );
    for (const item of reopenedArtifacts.images ?? []) baseline.add(item.src);
    for (const item of reopenedArtifacts.videos ?? []) baseline.add(item.src);
    for (const item of reopenedArtifacts.audios ?? []) baseline.add(item.src);
    for (const url of page.networkUrls) {
      if (artifactUrl(url, modality)) baseline.add(url);
    }

    await sendPrompt(page, `${PROMPT_PREFIX[modality]}${prompt}`);
    const conversationUrl = await evaluatePage<string>(
      page,
      'location.href',
    ).catch(() => '');
    if (conversationUrl) await saveBridgeChatUrl(conversationUrl);
    if (modality === 'video') await confirmVideoTask(page);
    return await pollArtifacts(page, modality, baseline);
  } finally {
    activeJobs -= 1;
    if (userState) {
      await evaluatePage(
        page,
        `location.href = ${JSON.stringify(userState)}`,
      ).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await browser.close();
  }
}

async function readJsonBody(
  request: import('node:http').IncomingMessage,
): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += piece.byteLength;
    if (size > BODY_MAX_BYTES) throw new Error('请求体过大');
    chunks.push(piece);
  }
  return JSON.parse(
    Buffer.concat(chunks).toString('utf8'),
  ) as Record<string, unknown>;
}

const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`).pathname;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3031');

  const reply = (data: unknown, status = 200) => {
    response.statusCode = status;
    response.end(JSON.stringify(data));
  };
  const fail = (message: string, status = 500) =>
    reply({ error: { message } }, status);

  if (request.method === 'GET' && path === '/health') {
    reply({
      ok: true,
      cdpReady: await isDoubaoReady(),
      busy,
      activeJobs,
      lastError: lastError || undefined,
    });
    return;
  }

  const modality = path === '/v1/images/generations'
    ? 'image'
    : path === '/v1/videos/generations'
      ? 'video'
      : path === '/v1/audio/generations'
        ? 'audio'
        : null;

  if (modality && request.method === 'POST') {
    if (busy) {
      fail('另一个生成任务正在运行', 429);
      return;
    }

    busy = true;
    try {
      const parsed = await readJsonBody(request);
      const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';
      if (!prompt) {
        fail('缺少 prompt', 400);
        return;
      }
      const artifacts = await generate(modality, prompt);
      reply({
        created: Math.floor(Date.now() / 1000),
        data: artifacts,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      fail(lastError);
    } finally {
      busy = false;
    }
    return;
  }

  fail('Not Found', 404);
});

server.on('error', (error) => {
  console.error('[doubao-bridge] server error:', error);
  process.exitCode = 1;
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`[doubao-bridge] http://127.0.0.1:${PORT}`);
});

async function shutdown(): Promise<void> {
  server.close();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
