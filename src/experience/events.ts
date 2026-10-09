/**
 * 事件管道（S1-13；C6 事件与数据分析契约 §6/§7/§8/§25/§27）。
 *
 * 事件是不可变事实（C6 §5），不是命令——Analytics 不得通过事件直接改变
 * Runtime（S1 §24）。事件来源只能记录自己真正知道的事实（C6 §8）。
 *
 * 信封结构（C6 §7）：
 *   event_id / event_type / event_version / timestamp /
 *   identity{user_id, session_id} / context{experience_id, intent_id,
 *   state_version, request_id, decision_id} / source{layer, component} /
 *   properties / sequence_number
 *
 * 顺序（C6 §25）：同一 Experience Runtime 内状态相关事件具有确定逻辑顺序
 * （sequence_number 每体验单调递增）。
 * 幂等（C6 §27）：event_id 去重——相同 event_id 不得产生两条逻辑事实。
 *
 * 命名调和（S1 §23 最低事件集 → C6 权威事件名，见迭代记录 P3-S1-IMPL-ITER-002
 * §4 的名称调和表，pending 非作者复核）：
 *   intent_created → intent_received（C6 §12）
 *   user_action → 按 C6 §14 交互事件具体名（question_asked 等）
 *   semantic_action_detected → intent_parsed 携带 semantic_action 属性
 *   version_conflict → state_version_conflict（C6 §21）
 */

import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** C6 §7 source.layer（§7 枚举与 §8 来源规则表的并集）。 */
export type EventLayer =
  | 'frontend'
  | 'input'
  | 'runtime'
  | 'policy'
  | 'llm'
  | 'tool'
  | 'memory'
  | 'analytics';

export interface EventIdentity {
  user_id: string;
  session_id: string;
}

export interface EventContext {
  experience_id: string | null;
  intent_id: string | null;
  state_version: number | null;
  request_id: string | null;
  decision_id: string | null;
}

export interface EventSource {
  layer: EventLayer;
  component: string;
}

export interface ExperienceEvent {
  event_id: string;
  event_type: string;
  event_version: string;
  timestamp: string;
  identity: EventIdentity;
  context: EventContext;
  source: EventSource;
  properties: Record<string, unknown>;
  sequence_number: number;
}

export type EventSink = (event: ExperienceEvent) => void | Promise<void>;

/** 事件版本（C6 §26：V1 事件统一 event_version 1.0.0）。 */
export const EVENT_VERSION = '1.0.0';

/**
 * 纠正域事件词表（S2A-F3；D-05 选项 A；C6 §14 命名模式
 * <domain>_<past_participle>——同 creation_patch_applied /
 * creation_completed 先例；event_version 1.0.0 不变——词表扩展
 * 经 C6 §14 派生）。
 */
export const CORRECTION_APPLIED_EVENT = 'correction_applied';
export const CORRECTION_RESTORED_EVENT = 'correction_restored';

/**
 * 模拟域事件词表（S2a F-4；D-05 选项 A；C6 §14 命名模式
 * <domain>_<past_participle>——同 correction_applied 先例；
 * event_version 1.0.0 不变——词表扩展经 C6 §14 派生）。
 * properties 含 fact / inference / hypothesis / simulation 四元
 * 分离字段（E8-G2-CC07 字段化承载）+ 源输入摘要；模拟结果
 * 不得表现为事实（separation_invariant 互斥注记）。
 */
export const SIMULATION_RECORDED_EVENT = 'simulation_recorded';

const EVENT_ID_PATTERN = /^evt_[a-z0-9]+$/i;
const ISO8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_LAYERS: ReadonlySet<string> = new Set<EventLayer>([
  'frontend',
  'input',
  'runtime',
  'policy',
  'llm',
  'tool',
  'memory',
  'analytics',
]);

/**
 * 信封契约校验（C6 §7 必填字段与格式）。
 * 记录器在写入前强制校验——使"每个事件符合信封"由构造保证而非事后检查。
 */
export function validateEventEnvelope(event: unknown): { ok: true } | { ok: false; violations: string[] } {
  const violations: string[] = [];
  if (typeof event !== 'object' || event === null) {
    return { ok: false, violations: ['event must be an object'] };
  }
  const candidate = event as Partial<ExperienceEvent> & Record<string, unknown>;
  if (typeof candidate.event_id !== 'string' || !EVENT_ID_PATTERN.test(candidate.event_id)) {
    violations.push('event_id must match ^evt_[a-z0-9]+$');
  }
  if (typeof candidate.event_type !== 'string' || candidate.event_type.length === 0) {
    violations.push('event_type must be a non-empty string');
  }
  if (candidate.event_version !== EVENT_VERSION) {
    violations.push(`event_version must be ${EVENT_VERSION}`);
  }
  if (typeof candidate.timestamp !== 'string' || !ISO8601_PATTERN.test(candidate.timestamp)) {
    violations.push('timestamp must be ISO-8601');
  }
  const identity = candidate.identity as Partial<EventIdentity> | undefined;
  if (
    typeof identity?.user_id !== 'string' ||
    typeof identity?.session_id !== 'string'
  ) {
    violations.push('identity.user_id and identity.session_id are required strings');
  }
  const context = candidate.context as Partial<EventContext> | undefined;
  if (
    !context ||
    !('experience_id' in context) ||
    !('intent_id' in context) ||
    !('state_version' in context) ||
    !('request_id' in context) ||
    !('decision_id' in context)
  ) {
    violations.push('context requires experience_id, intent_id, state_version, request_id, decision_id');
  }
  const source = candidate.source as Partial<EventSource> | undefined;
  if (
    typeof source?.layer !== 'string' ||
    !ALLOWED_LAYERS.has(source.layer as EventLayer) ||
    typeof source?.component !== 'string'
  ) {
    violations.push('source.layer must be a C6 §7/§8 layer and source.component a non-empty string');
  }
  if (typeof candidate.properties !== 'object' || candidate.properties === null) {
    violations.push('properties must be an object');
  }
  if (
    typeof candidate.sequence_number !== 'number' ||
    !Number.isInteger(candidate.sequence_number) ||
    candidate.sequence_number < 1
  ) {
    violations.push('sequence_number must be a positive integer');
  }
  if (violations.length > 0) {
    return { ok: false, violations };
  }
  return { ok: true };
}

/**
 * 事件记录器：分配 event_id 与每体验 sequence_number，
 * 信封校验后写入注入的事件汇；按 event_id 幂等去重（C6 §27）。
 */
export class EventRecorder {
  private readonly sequenceByExperience = new Map<string, number>();
  private readonly recordedEventIds = new Set<string>();
  private eventCounter = 0;
  private readonly sink: EventSink;

  constructor(sink: EventSink) {
    this.sink = sink;
  }

  /** 构造一个待记录事件（自动分配 event_id 与 sequence_number）。 */
  build(
    eventType: string,
    fields: {
      identity: EventIdentity;
      context: Omit<EventContext, 'decision_id'> & { decision_id?: string | null };
      source: EventSource;
      properties?: Record<string, unknown>;
      /** 显式指定 event_id（幂等重放场景）；缺省自动生成。 */
      eventId?: string;
    },
  ): ExperienceEvent {
    this.eventCounter += 1;
    const eventId =
      fields.eventId ??
      `evt_${String(this.eventCounter).padStart(6, '0')}${Math.random().toString(16).slice(2, 8)}`;
    const sequenceKey = fields.context.experience_id ?? `session:${fields.identity.session_id}`;
    const nextSequence = (this.sequenceByExperience.get(sequenceKey) ?? 0) + 1;
    this.sequenceByExperience.set(sequenceKey, nextSequence);
    return {
      event_id: eventId,
      event_type: eventType,
      event_version: EVENT_VERSION,
      timestamp: new Date().toISOString(),
      identity: fields.identity,
      context: {
        experience_id: fields.context.experience_id,
        intent_id: fields.context.intent_id,
        state_version: fields.context.state_version,
        request_id: fields.context.request_id,
        decision_id: fields.context.decision_id ?? null,
      },
      source: fields.source,
      properties: fields.properties ?? {},
      sequence_number: nextSequence,
    };
  }

  /**
   * 记录事件：信封校验失败或 event_id 重复时拒绝写入
   * （返回失败原因，由调用方决定升级策略）。
   */
  async record(event: ExperienceEvent): Promise<{ ok: true } | { ok: false; reason: string }> {
    const envelope = validateEventEnvelope(event);
    if (!envelope.ok) {
      return { ok: false, reason: `event envelope violation: ${envelope.violations.join('; ')}` };
    }
    if (this.recordedEventIds.has(event.event_id)) {
      // C6 §27：相同 event_id 不得产生两条逻辑事实（幂等去重）。
      return { ok: false, reason: `duplicate event_id: ${event.event_id}` };
    }
    this.recordedEventIds.add(event.event_id);
    await this.sink(event);
    return { ok: true };
  }

  /** 幂等性自检（C6 §27 证据用）：event_id 是否已记录。 */
  hasRecorded(eventId: string): boolean {
    return this.recordedEventIds.has(eventId);
  }
}

/**
 * 服务端事件汇（追加只写 NDJSON）。
 * 路径经环境变量注入；未设置时为无操作（进程内形态由调用方注入内存汇）。
 * 汇失败被吞掉——事件管道不得中断运行时（证据执行器独立校验文件内容）。
 */
export function createServerEventSink(logPath: string | undefined): EventSink {
  if (!logPath) {
    return () => undefined;
  }
  const dir = path.dirname(logPath);
  let ensured = false;
  return async (event: ExperienceEvent): Promise<void> => {
    try {
      if (!ensured) {
        await mkdir(dir, { recursive: true });
        ensured = true;
      }
      await appendFile(logPath, `${JSON.stringify(event)}\n`, 'utf8');
    } catch {
      // 事件汇失败不得中断运行时；证据执行器独立校验文件内容。
    }
  };
}

export function serverEventLogPath(): string | undefined {
  const value = process.env.EXPERIENCE_EVENT_LOG;
  return value && value.length > 0 ? value : undefined;
}
