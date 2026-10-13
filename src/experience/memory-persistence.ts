/**
 * 记忆记录持久化（轴外持久对象——D-01 选项 A「切片内本地
 * 持久化记忆记录存储」的本机实现；CR-52——记忆跨进程重启保留）。
 *
 * - 索引：data/memory/index.json（原子写——tmp + rename，
 *   同 works-store / config-store 纪律——崩溃不产生半份文件）
 * - data/ 经 .gitignore 排除（绝不提交——隐私六要素存储
 *   位置「本机开发形态为本地 data/ 目录」纪律）
 * - 记忆记录仅含偏好内容分量、不含凭据——要素 4 加密针对
 *   API key，不触发（config-store 密文纪律不适用）；生产
 *   形态存储治理按隐私六要素已批准方向执行（memory.ts
 *   头注——属生产部署治理、不属本切片实施范围）
 * - 写队列：单进程内串行化（避免并发变更互相覆盖）；
 *   写失败仅丢当次持久化——内存态仍为运行时准（不静默
 *   损坏已提交状态）
 * - 进程内证据形态不经过本模块（server-runtime 注入缝外
 *   不构造——黄金回归不变式）
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MemoryRecord } from './memory';

const MEMORY_DIR = join(process.cwd(), 'data', 'memory');
const INDEX_PATH = join(MEMORY_DIR, 'index.json');

/**
 * 索引读（同步仅用于小索引文件——几十条记录，无性能面；
 * 文件缺失 / 损坏 → 空数组——不静默损坏运行时，
 * 同 works-store readIndexSync 容错纪律）。
 */
export function readMemoryIndexSync(): MemoryRecord[] {
  if (!existsSync(INDEX_PATH)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as MemoryRecord[]) : [];
  } catch {
    return [];
  }
}

// 索引写队列（单进程内串行化——避免并发保存互相覆盖）。
let indexQueue: Promise<unknown> = Promise.resolve();

/** 索引原子写（tmp + rename；返回的 Promise 拒绝时队列不中断）。 */
export function writeMemoryIndex(records: MemoryRecord[]): Promise<void> {
  const run = async (): Promise<void> => {
    await mkdir(MEMORY_DIR, { recursive: true });
    const tmpPath = `${INDEX_PATH}.tmp`;
    await writeFile(tmpPath, JSON.stringify(records, null, 2), 'utf8');
    await rename(tmpPath, INDEX_PATH);
  };
  const result = indexQueue.then(run, run);
  indexQueue = result.catch(() => undefined);
  return result;
}
