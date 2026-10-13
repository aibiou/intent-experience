/**
 * 作品资产存储（平台能力——作品服务端持久化）。
 *
 * 此前作品仅存浏览器 localStorage（上限 12 条、清缓存即失、
 * 远程提供方 URL 失效即丢）——本模块把产物字节落到服务端：
 * - 资产文件：data/works/assets/<id>.<ext>（.gitignore 排除，
 *   与 config-store 同一存储位置纪律）
 * - 索引：data/works/index.json（原子写——tmp + rename）
 * - 来源双形态：提供方 URL → 服务端抓取落地（URL 失效免疫）；
 *   内联 dataUri（语音）→ 解码落地（localStorage 容量免疫）
 * - 抓取失败降级：记录 remoteUrl，资产路由 302 回源
 *   （字节暂不可得时作品记录仍不丢）
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type WorkModality = 'image' | 'voice' | 'video';

export interface WorkRecord {
  id: string;
  modality: WorkModality;
  prompt: string;
  /** 画面语义标题（实际生成用的蒸馏提示词 / 安全兜底词——CR-60；
   * 旧记录无此字段 → 展示回退 prompt）。 */
  caption?: string;
  mime: string;
  /** 资产字节数（0 = 未落地，仅 remoteUrl 回源）。 */
  bytes: number;
  /** 资产来源（url = 提供方托管；inline = 内联 dataUri 解码）。 */
  source: 'url' | 'inline';
  /** 资产文件名（保存时固化——删除按记录删，避免
   * MIME 映射变更导致孤儿文件）。 */
  assetFile?: string;
  /** 未落地时的回源地址（抓取失败降级形态）。 */
  remoteUrl?: string;
  createdAt: string;
}

export interface SaveWorkInput {
  modality: WorkModality;
  prompt: string;
  caption?: unknown;
  mime?: unknown;
  url?: unknown;
  dataUri?: unknown;
}

const WORKS_DIR = join(process.cwd(), 'data', 'works');
const ASSETS_DIR = join(WORKS_DIR, 'assets');
const INDEX_PATH = join(WORKS_DIR, 'index.json');

// 资产大小上限（50MB——4s 720P 视频与语音远小于此）。
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/opus': 'opus',
  'audio/ogg': 'ogg',
};

function extensionFor(mime: string): string {
  return MIME_EXTENSIONS[mime] ?? 'bin';
}

function normalizeModality(value: unknown): WorkModality {
  return value === 'voice' || value === 'video' ? value : 'image';
}

// 索引写队列（单进程内串行化——避免并发保存互相覆盖）。
let indexQueue: Promise<unknown> = Promise.resolve();

function readIndexSync(): WorkRecord[] {
  if (!existsSync(INDEX_PATH)) return [];
  try {
    // 同步读仅用于小索引文件（几十条记录），无性能面。
    const parsed = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeIndex(records: WorkRecord[]): Promise<void> {
  await mkdir(WORKS_DIR, { recursive: true });
  const tmpPath = `${INDEX_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(records, null, 2), 'utf8');
  await rename(tmpPath, INDEX_PATH);
}

function newWorkId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `w_${Date.now().toString(36)}_${random}`;
}

/** dataUri 解码（data:<mime>;base64,<payload>）。 */
function decodeDataUri(
  dataUri: string,
): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+)?;base64,(.+)$/s.exec(dataUri);
  if (match === null) return null;
  const mime = match[1] ?? 'application/octet-stream';
  try {
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.byteLength === 0) return null;
    return { mime, bytes: new Uint8Array(buffer) };
  } catch {
    return null;
  }
}

export async function saveWork(input: SaveWorkInput): Promise<WorkRecord> {
  const modality = normalizeModality(input.modality);
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  // 画面语义标题（trim 非空才存——空 / 非字符串不落盘）。
  const caption =
    typeof input.caption === 'string' && input.caption.trim().length > 0
      ? input.caption.trim()
      : undefined;
  const run = async (): Promise<WorkRecord> => {
    const records = readIndexSync();
    const id = newWorkId();
    const createdAt = new Date().toISOString();

    // 形态一：内联 dataUri（语音 / b64 图像）——解码落地。
    if (typeof input.dataUri === 'string' && input.dataUri.startsWith('data:')) {
      const decoded = decodeDataUri(input.dataUri);
      if (decoded !== null) {
        const mime =
          typeof input.mime === 'string' && input.mime.length > 0
            ? input.mime
            : decoded.mime;
        const assetFile = `${id}.${extensionFor(mime)}`;
        const assetPath = join(ASSETS_DIR, assetFile);
        await mkdir(ASSETS_DIR, { recursive: true });
        const tmpPath = `${assetPath}.tmp`;
        await writeFile(tmpPath, decoded.bytes);
        await rename(tmpPath, assetPath);
        const record: WorkRecord = {
          id,
          modality,
          prompt,
          ...(caption !== undefined ? { caption } : {}),
          mime,
          bytes: decoded.bytes.byteLength,
          source: 'inline',
          assetFile,
          createdAt,
        };
        await writeIndex([record, ...records]);
        return record;
      }
    }

    // 形态二：提供方 URL——服务端抓取落地（URL 失效免疫）。
    if (typeof input.url === 'string' && /^https?:\/\//.test(input.url)) {
      let bytes: Uint8Array | null = null;
      let mime = typeof input.mime === 'string' ? input.mime : '';
      try {
        const response = await fetch(input.url, {
          signal: AbortSignal.timeout(60_000),
        });
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > 0 && buffer.byteLength <= MAX_ASSET_BYTES) {
            bytes = new Uint8Array(buffer);
            if (mime.length === 0) {
              mime = response.headers.get('content-type')?.split(';')[0].trim() ?? '';
            }
          }
        }
      } catch {
        // 抓取失败——降级为 remoteUrl 回源（记录不丢）。
      }
      if (mime.length === 0) {
        mime = modality === 'video' ? 'video/mp4' : modality === 'voice' ? 'audio/mpeg' : 'image/png';
      }
      if (bytes !== null) {
        const assetFile = `${id}.${extensionFor(mime)}`;
        const assetPath = join(ASSETS_DIR, assetFile);
        await mkdir(ASSETS_DIR, { recursive: true });
        const tmpPath = `${assetPath}.tmp`;
        await writeFile(tmpPath, bytes);
        await rename(tmpPath, assetPath);
        const record: WorkRecord = {
          id,
          modality,
          prompt,
          ...(caption !== undefined ? { caption } : {}),
          mime,
          bytes: bytes.byteLength,
          source: 'url',
          assetFile,
          createdAt,
        };
        await writeIndex([record, ...records]);
        return record;
      }
      const record: WorkRecord = {
        id,
        modality,
        prompt,
        ...(caption !== undefined ? { caption } : {}),
        mime,
        bytes: 0,
        source: 'url',
        remoteUrl: input.url,
        createdAt,
      };
      await writeIndex([record, ...records]);
      return record;
    }

    throw new Error('work requires url or dataUri');
  };
  const result = indexQueue.then(run, run);
  indexQueue = result.catch(() => undefined);
  return result;
}

export function listWorks(): WorkRecord[] {
  return readIndexSync();
}

export function getWork(id: string): WorkRecord | null {
  return readIndexSync().find((record) => record.id === id) ?? null;
}

/** 资产文件路径（未落地返回 null——调用方 302 回源）。
 * 文件名优先取保存时固化的 assetFile（记录为旧形态时
 * 回退按当前 MIME 映射推导）。 */
export function workAssetPath(record: WorkRecord): string | null {
  if (record.bytes === 0) return null;
  const fileName = record.assetFile ?? `${record.id}.${extensionFor(record.mime)}`;
  const assetPath = join(ASSETS_DIR, fileName);
  return existsSync(assetPath) ? assetPath : null;
}

export async function deleteWork(id: string): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    const records = readIndexSync();
    const target = records.find((record) => record.id === id);
    if (target === undefined) return false;
    const next = records.filter((record) => record.id !== id);
    await writeIndex(next);
    if (target.bytes > 0) {
      const fileName =
        target.assetFile ?? `${target.id}.${extensionFor(target.mime)}`;
      await rm(join(ASSETS_DIR, fileName), { force: true });
    }
    return true;
  };
  const result = indexQueue.then(run, run);
  indexQueue = result.catch(() => false);
  return result;
}
