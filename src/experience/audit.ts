/**
 * 服务端审计汇（追加只写）。
 *
 * HTTP 形态下用于证明取消在服务端生效：客户端断开后，
 * 生成循环观测到 AbortSignal 并在此留下 cancellation 事件（含取消时的分块下标），
 * 且之后不再有任何事件。路径经环境变量 EXPERIENCE_AUDIT_LOG 注入；
 * 未设置时审计汇为无操作（进程内形态由调用方注入内存汇）。
 */

import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type AuditEvent = object;

export type AuditSink = (event: AuditEvent) => void | Promise<void>;

export function createServerAuditSink(logPath: string | undefined): AuditSink {
  if (!logPath) {
    return () => undefined;
  }
  const dir = path.dirname(logPath);
  let ensured = false;
  return async (event: AuditEvent): Promise<void> => {
    try {
      if (!ensured) {
        await mkdir(dir, { recursive: true });
        ensured = true;
      }
      await appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8');
    } catch {
      // 审计汇失败不得中断流；证据执行器独立校验文件内容。
    }
  };
}

export function serverAuditLogPath(): string | undefined {
  const value = process.env.EXPERIENCE_AUDIT_LOG;
  return value && value.length > 0 ? value : undefined;
}
