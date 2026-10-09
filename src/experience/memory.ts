/**
 * 记忆域（S2a F-5；S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施）。
 *
 * Minimal Memory（授权 §2(4)；PD-23）：
 * - 仅短期记忆——跨会话主题 / 意图信号 + 用户显式纠正 / 撤回记录；
 *   长期记忆（偏好画像）禁用，写入路径不存在（负向不变式）。
 * - 六类数据状态区分纪律（07 §2–§6）：记忆记录为轴外持久对象
 *   （D-01 选项 A——切片内本地持久化记忆记录存储，model on F-2 创作
 *   对象 / F-4 分支记录纪律；生产形态存储治理按隐私六要素已批准方向
 *   执行，属生产部署治理、不属本切片实施范围）。
 * - 信号措辞纪律（07 §4）："最近产生过较高兴趣" ≠ "用户喜欢 X"。
 *
 * 生命周期状态机（轴外，体验阶段轴不变——D-02 选项 A / 冻结文本 §4）：
 *   状态 {REMEMBERED, IN_USE, DECAYING, EXPIRED}
 *   操作 {CREATE（→REMEMBERED，经 Runtime 单一写入者）,
 *         RECALL（REMEMBERED→IN_USE，只读、不发事件）,
 *         DECAY（IN_USE→DECAYING，时间衰减驱动，内部置信度更新、
 *               不逐点发事件）,
 *         EXPIRE（→EXPIRED，自动，发出 memory_expired + 删除审计）,
 *         CORRECT（内容更正 + 留痕，→REMEMBERED，发出 memory_corrected）,
 *         WITHDRAW（→EXPIRED + 撤回留痕 + 删除审计，发出 memory_withdrawn）}
 *
 * 作用面纪律（D-03 选项 A）：记忆仅作为 Context Builder 的 L5 相关短期
 * 记忆信号注入（07 §20——以当前意图为检索键，只取相关记录，不全量塞入）；
 * L2 Current Intent 覆盖 L5（07 §12 不变式）；检索不改变体验、不触发
 * 任何产品动作（07 §22）。
 *
 * 保留与删除（D-04 选项 A；隐私要素 1/5）：默认保留期自最后更新时间起算
 * 6 个月，到期自动删除 + 删除审计记录（删除时间 / 记录范围 / 验证信息）。
 *
 * 写入纪律（D-05 选项 A；GS-06 / CC02 H01/H05）：写入仅经 Runtime 内部
 * 写入方法（单一写入者）；模型输出不得直接写记忆（Validator 拒绝
 * state_update 类提案——validator.ts 既有覆盖）；写入侧执行 07 §7
 * 不默认长期记住清单过滤。
 */

/** 记忆生命周期状态（D-02 选项 A——轴外记忆子状态机四态）。 */
export type MemoryLifecycle = 'REMEMBERED' | 'IN_USE' | 'DECAYING' | 'EXPIRED';

/** 记忆来源分量（07 §8 类型层——Fact / Inference / Preference 的切片内承载）。 */
export type MemorySource = 'session_observation' | 'user_correction';

/**
 * 删除审计记录（隐私要素 5——到期自动删除 + 删除审计记录：
 * 删除时间 / 记录范围 / 验证信息，"删除可验证"）。
 */
export interface MemoryDeletionAudit {
  deletedAt: string;
  /** 记录范围（recordId + 主题）。 */
  scope: string;
  reason: 'withdrawn' | 'decay_threshold' | 'retention_expired';
  verification: string;
}

/**
 * 记忆记录（D-02 选项 A——五分量：record_id / 内容分量（主题 + 意图信号，
 * 07 §4 形态）/ 生命周期状态 / 创建与更新时间戳 / 来源与置信度分量
 * （+ interestSignal——07 §4 兴趣信号分量））。
 */
export interface MemoryRecord {
  recordId: string;
  sessionId: string;
  experienceId: string | null;
  topic: string;
  intentSignal: string;
  lifecycle: MemoryLifecycle;
  createdAt: string;
  updatedAt: string;
  source: MemorySource;
  confidence: number;
  /** 兴趣信号（07 §11 衰减基数；Day 0 锚点 0.90——D-04 选项 A）。 */
  interestSignal: number;
  /** 纠正次数（纠正留痕计数——07 §17）。 */
  corrections: number;
  lastRecalledAt: string | null;
  withdrawnAt: string | null;
  expiredAt: string | null;
  deletionAudit: MemoryDeletionAudit | null;
}

/** L5 记忆信号（注入 Context Builder 的相关短期记忆信号——D-03 选项 A）。 */
export interface MemorySignal {
  recordId: string;
  topic: string;
  intentSignal: string;
  /** 读取时点的有效兴趣（衰减后——07 §11）。 */
  interestSignal: number;
  lifecycle: MemoryLifecycle;
}

/** 记忆域快照（证据 / 审计查询入口——E5 进程内形态取证）。 */
export interface MemorySnapshot {
  records: MemoryRecord[];
}

/** 记忆操作结果（resolveIntent 返回面——D-05 选项 A 路由执行结果）。 */
export interface MemoryOperationResult {
  kind: 'withdraw' | 'correct';
  executed: boolean;
  reason: string | null;
  recordId: string | null;
  lifecycle: MemoryLifecycle | null;
}

/** 记忆写入结果（recordMemory——07 §7 过滤纪律承载）。 */
export type MemoryWriteResult =
  | { recorded: true; record: MemoryRecord; reexploration: boolean; previousLifecycle: MemoryLifecycle | null }
  | { recorded: false; reason: 'write_filter' };

/** 记忆域操作识别结果（确定性规则词表——D-05 选项 A）。 */
export type MemoryIntentMarker = 'withdraw' | 'correct';

export interface MemoryOperationRecognition {
  memoryIntent: MemoryIntentMarker;
}

/** 衰减扫描结果（DECAY 为内部置信度更新、不发事件；EXPIRE 发 memory_expired）。 */
export interface MemoryDecayResult {
  decayed: MemoryRecord[];
  expired: MemoryRecord[];
}

// ---------------------------------------------------------------------------
// 规范参数（D-04 选项 A——07 §11 示例形态采纳为规范参数）
// ---------------------------------------------------------------------------

/** Day 0 兴趣锚点（07 §11 示例：Day 0 = 0.90）。 */
export const MEMORY_INTEREST_ANCHOR = 0.9;
/**
 * 指数衰减率 k = ln(0.90/0.63)/3 ≈ 0.1189 / 天（Day 0→Day 3 锚点对
 * 推导；Day 14 / Day 30 锚点为示例近似值——07 §11 示例形态）。
 */
export const MEMORY_DECAY_K = Math.log(0.9 / 0.63) / 3;
/** DECAYING 迁移阈值（IN_USE→DECAYING；实现细节——冻结文本未规定数值）。 */
export const MEMORY_DECAY_THRESHOLD = 0.5;
/** EXPIRED 迁移阈值（DECAYING→EXPIRED；D-04 选项 A——衰减至阈值以下驱动迁移）。 */
export const MEMORY_EXPIRE_THRESHOLD = 0.1;
/** 默认保留期：6 个月（自最后更新时间起算——D-04 选项 A；隐私要素 1）。 */
export const MEMORY_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
/** 再次主动探索的兴趣增量（07 §11——用户再次主动探索时 interest 重新获得证据）。 */
const REEXPLORATION_BOOST = 0.15;

function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return 0;
  }
  return Math.max(0, (toMs - fromMs) / (24 * 60 * 60 * 1000));
}

/** 有效兴趣（指数衰减——07 §11 规范参数；D-04 选项 A）。 */
export function effectiveInterest(record: MemoryRecord, now: string): number {
  return record.interestSignal * Math.exp(-MEMORY_DECAY_K * daysBetween(record.updatedAt, now));
}

// ---------------------------------------------------------------------------
// 写入侧过滤（07 §7 不默认长期记住清单——D-05 选项 A）
// ---------------------------------------------------------------------------

/**
 * 07 §7 不默认长期记住清单（写入侧负向过滤）：临时情绪 / 一次性兴趣 /
 * 一次性任务 / 当前环境 / 单次拒绝 / 推测人格不得写入。
 * 标记词表为实现细节（同分类器纪律）。
 */
const NOT_PERSIST_MARKERS: ReadonlyArray<RegExp> = [
  // 临时情绪
  /临时情绪/, /一时情绪/, /情绪一时/,
  // 一次性兴趣
  /一次性兴趣/, /一次性/, /单次兴趣/, /就这一次/, /就本次/,
  // 一次性任务
  /一次性任务/, /单次任务/,
  // 当前环境
  /当前环境/, /本次环境/, /当前会话/, /这个环境/,
  // 单次拒绝
  /单次拒绝/,
  // 推测人格
  /推测人格/, /推测/, /猜测/,
];

/** 07 §7 写入过滤：命中不默认长期记住清单任一标记 → 不得写入。 */
export function passesMemoryWriteFilter(topic: string, intentSignal: string): boolean {
  const text = `${topic}\n${intentSignal}`;
  return !NOT_PERSIST_MARKERS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// 记忆操作识别（确定性规则词表——D-05 选项 A，model on F-4 D-03 纪律）
// ---------------------------------------------------------------------------

/** WITHDRAW 词表（07 §13"别再给我这个"——用户显式撤回）。 */
export const MEMORY_WITHDRAW_PATTERNS: ReadonlyArray<RegExp> = [
  /别再给我/,
  /别再推荐/,
  /别再出现/,
  /不要再给我/,
  /不要再推荐/,
];

/** CORRECT 词表（07 §17 Memory Correction——用户显式纠正）。 */
export const MEMORY_CORRECT_PATTERNS: ReadonlyArray<RegExp> = [
  /记忆纠正/,
  /纠正记忆/,
  /记忆有误/,
  /记忆记错/,
];

/**
 * 记忆操作识别（确定性规则词表）。优先级 WITHDRAW > CORRECT（撤回为
 * 用户主权更强信号——GS-04；词表优先级为实现细节）。
 * 仅分类器在所有既有优先级层未命中后调用（仅认领会成为 UNKNOWN 的
 * 输入——不改变 STOP > CHANGE_DIRECTION > CORRECTION > CREATE > WHY >
 * WHAT_IF > DIRECT_ANSWER 优先级层）。
 */
export function recognizeMemoryOperation(rawInput: string): MemoryOperationRecognition | null {
  if (MEMORY_WITHDRAW_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { memoryIntent: 'withdraw' };
  }
  if (MEMORY_CORRECT_PATTERNS.some((pattern) => pattern.test(rawInput))) {
    return { memoryIntent: 'correct' };
  }
  return null;
}

/** 纠正内容提取（"记忆纠正：X" → X；无显式内容 → null——纯留痕纠正）。 */
export function extractCorrectedTopic(rawInput: string): string | null {
  for (const pattern of MEMORY_CORRECT_PATTERNS) {
    const match = pattern.exec(rawInput);
    if (match) {
      const remainder = rawInput
        .slice(match.index + match[0].length)
        .replace(/^[：:，,。.\s]+/, '')
        .trim();
      return remainder.length > 0 ? remainder : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 记忆记录存储（轴外持久对象——D-01 选项 A；单一写入者纪律）
// ---------------------------------------------------------------------------

/** 相关性判定（07 §20 检索纪律——以当前意图为检索键；2 字窗口交集为实现细节）。 */
function sharesSignal(rawInput: string, text: string): boolean {
  const windows = new Set<string>();
  for (let i = 0; i + 1 < rawInput.length; i += 1) {
    windows.add(rawInput.slice(i, i + 2));
  }
  for (let i = 0; i + 1 < text.length; i += 1) {
    if (windows.has(text.slice(i, i + 2))) {
      return true;
    }
  }
  return false;
}

/**
 * 记忆记录存储（切片内本地持久化记忆记录存储——D-01 选项 A）。
 * 进程内形态（model on F-2 创作对象 / F-4 分支记录轴外持久对象纪律）；
 * 所有写操作经本类方法（Runtime 单一写入者——CC02 H01）。
 */
export class MemoryStore {
  private readonly records = new Map<string, MemoryRecord>();
  /** 主题 → 活跃记录索引（同一主题的再次探索为再探索而非新记录）。 */
  private readonly byTopic = new Map<string, string>();
  private recordCounter = 0;

  /**
   * CREATE（记住，→REMEMBERED——经 Runtime 单一写入者）。
   * 写入侧执行 07 §7 过滤（命中 → 不记录）；同一主题的再次主动探索
   * 为再探索（07 §11——interest 重新获得证据 + 刷新最后更新时间，
   * 活跃记忆不因持续使用而意外过期——D-04 选项 A）。
   */
  recordMemory(input: {
    sessionId: string;
    experienceId?: string | null;
    topic: string;
    intentSignal: string;
    source: MemorySource;
    now: string;
  }): MemoryWriteResult {
    if (!passesMemoryWriteFilter(input.topic, input.intentSignal)) {
      return { recorded: false, reason: 'write_filter' };
    }
    const existingId = this.byTopic.get(input.topic);
    const existing = existingId ? this.records.get(existingId) : undefined;
    if (existing && existing.lifecycle !== 'EXPIRED') {
      const updated: MemoryRecord = {
        ...existing,
        interestSignal: Math.min(1, existing.interestSignal + REEXPLORATION_BOOST),
        updatedAt: input.now,
        experienceId: input.experienceId ?? existing.experienceId,
      };
      this.records.set(existing.recordId, updated);
      return { recorded: true, record: updated, reexploration: true, previousLifecycle: existing.lifecycle };
    }
    this.recordCounter += 1;
    const recordId = `memory_synthetic_${String(this.recordCounter).padStart(4, '0')}`;
    const record: MemoryRecord = {
      recordId,
      sessionId: input.sessionId,
      experienceId: input.experienceId ?? null,
      topic: input.topic,
      intentSignal: input.intentSignal,
      lifecycle: 'REMEMBERED',
      createdAt: input.now,
      updatedAt: input.now,
      source: input.source,
      confidence: input.source === 'user_correction' ? 0.95 : 0.7,
      interestSignal: MEMORY_INTEREST_ANCHOR,
      corrections: 0,
      lastRecalledAt: null,
      withdrawnAt: null,
      expiredAt: null,
      deletionAudit: null,
    };
    this.records.set(recordId, record);
    this.byTopic.set(input.topic, recordId);
    return { recorded: true, record, reexploration: false, previousLifecycle: null };
  }

  /**
   * RECALL（暂时使用，REMEMBERED→IN_USE）。只读纪律针对体验轴
   * （07 §22——检索不改变体验、不触发产品动作）；记忆域自身生命周期
   * 按定义迁移，不发事件（D-02 选项 A）。刷新最后更新时间（活跃记忆
   * 不因持续使用而意外过期——D-04 选项 A）；IN_USE / DECAYING 已为
   * 使用中形态——幂等（不迁移、不刷新）。
   */
  recallMemory(recordId: string, now: string):
    | { ok: true; record: MemoryRecord }
    | { ok: false; code: 'MEMORY_NOT_FOUND' | 'MEMORY_NOT_REMEMBERED' | 'MEMORY_EXPIRED' } {
    const record = this.records.get(recordId);
    if (!record) {
      return { ok: false, code: 'MEMORY_NOT_FOUND' };
    }
    if (record.lifecycle === 'EXPIRED') {
      return { ok: false, code: 'MEMORY_EXPIRED' };
    }
    if (record.lifecycle !== 'REMEMBERED') {
      return { ok: true, record };
    }
    const updated: MemoryRecord = { ...record, lifecycle: 'IN_USE', updatedAt: now, lastRecalledAt: now };
    this.records.set(recordId, updated);
    return { ok: true, record: updated };
  }

  /**
   * CORRECT（被用户纠正：内容更正 + 留痕，→REMEMBERED——D-02 选项 A）。
   * 纠正计数 + 1；兴趣重新获得证据（07 §11——用户主动纠正是强相关信号）；
   * 来源分量更新为用户纠正。
   */
  correctMemory(
    recordId: string,
    input: { correctedTopic: string | null; now: string },
  ):
    | { ok: true; record: MemoryRecord; previousLifecycle: MemoryLifecycle }
    | { ok: false; code: 'MEMORY_NOT_FOUND' | 'MEMORY_EXPIRED' } {
    const record = this.records.get(recordId);
    if (!record) {
      return { ok: false, code: 'MEMORY_NOT_FOUND' };
    }
    if (record.lifecycle === 'EXPIRED') {
      return { ok: false, code: 'MEMORY_EXPIRED' };
    }
    const topic = input.correctedTopic ?? record.topic;
    const updated: MemoryRecord = {
      ...record,
      topic,
      corrections: record.corrections + 1,
      lifecycle: 'REMEMBERED',
      interestSignal: MEMORY_INTEREST_ANCHOR,
      updatedAt: input.now,
      source: 'user_correction',
      confidence: 0.95,
    };
    this.records.set(recordId, updated);
    if (topic !== record.topic) {
      this.byTopic.delete(record.topic);
      this.byTopic.set(topic, recordId);
    }
    return { ok: true, record: updated, previousLifecycle: record.lifecycle };
  }

  /**
   * WITHDRAW（被用户撤回：→EXPIRED + 撤回留痕 + 删除审计——D-02 选项 A）。
   * 已 EXPIRED 记录 → 幂等拒绝（重复撤回不重复留痕）。
   */
  withdrawMemory(
    recordId: string,
    now: string,
  ):
    | { ok: true; record: MemoryRecord; previousLifecycle: MemoryLifecycle }
    | { ok: false; code: 'MEMORY_NOT_FOUND' | 'MEMORY_EXPIRED' } {
    const record = this.records.get(recordId);
    if (!record) {
      return { ok: false, code: 'MEMORY_NOT_FOUND' };
    }
    if (record.lifecycle === 'EXPIRED') {
      return { ok: false, code: 'MEMORY_EXPIRED' };
    }
    const updated: MemoryRecord = {
      ...record,
      lifecycle: 'EXPIRED',
      withdrawnAt: now,
      updatedAt: now,
      deletionAudit: {
        deletedAt: now,
        scope: `record ${record.recordId} (topic: ${record.topic})`,
        reason: 'withdrawn',
        verification: `withdrawal acknowledged at ${now}; record marked EXPIRED and excluded from retrieval`,
      },
    };
    this.records.set(recordId, updated);
    if (this.byTopic.get(record.topic) === recordId) {
      this.byTopic.delete(record.topic);
    }
    return { ok: true, record: updated, previousLifecycle: record.lifecycle };
  }

  /**
   * 时间衰减扫描（DECAY / EXPIRE——时间驱动）。
   * - IN_USE 且有效兴趣 < DECAY_THRESHOLD → DECAYING（内部置信度更新，
   *   不发事件——D-02 选项 A）；
   * - DECAYING 且有效兴趣 < EXPIRE_THRESHOLD → EXPIRED（自动，发出
   *   memory_expired + 删除审计——D-04 选项 A）；
   * - 任何活跃记录超过保留期（自最后更新时间起算 6 个月）→ EXPIRED
   *   （到期自动删除 + 删除审计记录——隐私要素 1/5）。
   */
  applyDecay(now: string): MemoryDecayResult {
    const decayed: MemoryRecord[] = [];
    const expired: MemoryRecord[] = [];
    for (const record of Array.from(this.records.values())) {
      if (record.lifecycle === 'EXPIRED') {
        continue;
      }
      const elapsedMs = daysBetween(record.updatedAt, now) * 24 * 60 * 60 * 1000;
      if (elapsedMs >= MEMORY_RETENTION_MS) {
        expired.push(this.expireRecord(record, now, 'retention_expired'));
        continue;
      }
      const interest = effectiveInterest(record, now);
      if (record.lifecycle === 'DECAYING' && interest < MEMORY_EXPIRE_THRESHOLD) {
        expired.push(this.expireRecord(record, now, 'decay_threshold'));
        continue;
      }
      if (record.lifecycle === 'IN_USE' && interest < MEMORY_DECAY_THRESHOLD) {
        const updated: MemoryRecord = { ...record, lifecycle: 'DECAYING', updatedAt: now };
        this.records.set(record.recordId, updated);
        decayed.push(updated);
      }
    }
    return { decayed, expired };
  }

  private expireRecord(record: MemoryRecord, now: string, reason: MemoryDeletionAudit['reason']): MemoryRecord {
    const updated: MemoryRecord = {
      ...record,
      lifecycle: 'EXPIRED',
      expiredAt: now,
      updatedAt: now,
      deletionAudit: {
        deletedAt: now,
        scope: `record ${record.recordId} (topic: ${record.topic})`,
        reason,
        verification: `automatic deletion at ${now}; record marked EXPIRED and excluded from retrieval`,
      },
    };
    this.records.set(record.recordId, updated);
    if (this.byTopic.get(record.topic) === record.recordId) {
      this.byTopic.delete(record.topic);
    }
    return updated;
  }

  /**
   * 检索相关短期记忆（07 §20 纪律——以当前意图为检索键，只取相关记录；
   * 读取时驱动懒到期检查）。命中 REMEMBERED 记录执行 RECALL
   * （REMEMBERED→IN_USE，不发事件）；EXPIRED 记录不返回。
   */
  retrieveRelevant(rawInput: string, now: string): MemorySignal[] {
    this.applyDecay(now);
    const signals: MemorySignal[] = [];
    for (const record of Array.from(this.records.values())) {
      if (record.lifecycle === 'EXPIRED') {
        continue;
      }
      if (!sharesSignal(rawInput, `${record.topic}\n${record.intentSignal}`)) {
        continue;
      }
      let lifecycle: MemoryLifecycle = record.lifecycle;
      if (record.lifecycle === 'REMEMBERED') {
        const recalled = this.recallMemory(record.recordId, now);
        if (recalled.ok) {
          lifecycle = recalled.record.lifecycle;
        }
      }
      signals.push({
        recordId: record.recordId,
        topic: record.topic,
        intentSignal: record.intentSignal,
        interestSignal: effectiveInterest(record, now),
        lifecycle,
      });
    }
    return signals;
  }

  /** 按主题查找活跃记录（记忆操作目标派生——当前探索主题）。 */
  findByTopic(topic: string): MemoryRecord | undefined {
    const id = this.byTopic.get(topic);
    return id ? this.records.get(id) : undefined;
  }

  /** 最近更新的活跃记录（记忆操作目标派生兜底）。 */
  mostRecentActive(): MemoryRecord | null {
    let best: MemoryRecord | null = null;
    for (const record of this.records.values()) {
      if (record.lifecycle === 'EXPIRED') {
        continue;
      }
      if (!best || record.updatedAt > best.updatedAt) {
        best = record;
      }
    }
    return best;
  }

  /** 快照（证据 / 审计查询入口）。 */
  getSnapshot(): MemorySnapshot {
    return { records: Array.from(this.records.values()) };
  }
}
