/**
 * 记忆域（S2a 切片 F-5）——S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结语义的
 * Minimal Memory 真实 LLM 会话适配版（语义权威源：intent-experience 仓库
 * src/experience/memory.ts；07 号契约 §4/§7/§11/§13/§17/§20/§22）。
 *
 * - 生命周期状态机（轴外——D-02 选项 A；体验阶段轴不变）：
 *   状态 { REMEMBERED, IN_USE, DECAYING, EXPIRED }；
 *   操作 { CREATE（→REMEMBERED，经 Runtime 单一写入者）,
 *         RECALL（REMEMBERED→IN_USE，只读、不发事件）,
 *         DECAY（IN_USE→DECAYING，时间驱动、内部置信度更新、不逐点发事件）,
 *         EXPIRE（→EXPIRED，自动 + 删除审计）,
 *         CORRECT（内容更正 + 留痕，→REMEMBERED）,
 *         WITHDRAW（→EXPIRED + 撤回留痕 + 删除审计）}。
 * - 写入纪律（D-05 选项 A；07 §7 不默认长期记住清单）：六类负向过滤——
 *   临时情绪 / 一次性兴趣 / 一次性任务 / 当前环境 / 单次拒绝 / 推测人格不得写入；
 *   同一主题的再次主动探索为再探索（interest +0.15、上限 1、updatedAt 刷新——
 *   活跃记忆不因持续使用而意外过期，D-04 选项 A）。
 * - 保留与删除（D-04 选项 A；隐私要素 1/5）：默认保留期自最后更新时间起算
 *   180 天，到期自动删除 + 删除审计记录（删除时间 / 记录范围 / 验证信息）。
 * - 衰减（07 §11 规范参数）：Day 0 锚点 0.90、Day 3 ≈ 0.63 推导衰减率 k；
 *   IN_USE 且有效兴趣 < 0.5 → DECAYING（时间驱动迁移不刷新 updatedAt——衰减
 *   时钟连续，updatedAt 仅用户驱动事件刷新）；DECAYING 且有效兴趣 < 0.1 →
 *   EXPIRED（+ 删除审计 decay_threshold）。
 * - 检索纪律（07 §20 / §22）：以当前意图为检索键只取相关记录（2 字滑窗交集
 *   为实现细节），检索不改变体验、不触发产品动作；命中 REMEMBERED 记录执行
 *   RECALL 迁移（不发事件）；EXPIRED 记录不返回；读取时先执行懒到期检查。
 *
 * S2a 边界（诚实声明）：仅短期记忆（跨会话主题 / 意图信号 + 用户显式纠正 /
 * 撤回记录）；不含 S3a 的长期记忆（memoryClass / 'explicit' 来源 /
 * candidateLongTerm 候选标记）——参考实现中的对应分支不在本切片范围。
 *
 * 纯逻辑纪律（本切片）：零 DB / 零网络 / 零 Prisma import；全部函数
 * records 数组 → 新数组（幂等无变更路径原样返回入参数组引用），绝不 mutate
 * 入参；跨会话持久化由 runtime 单一写入者 + Prisma 记忆表负责（Task 6-c 接线）。
 */

/** 记忆生命周期状态（D-02 选项 A——轴外记忆子状态机四态）。 */
export type MemoryLifecycle = 'REMEMBERED' | 'IN_USE' | 'DECAYING' | 'EXPIRED';

/** 记忆来源（07 §8 类型层——session_observation / user_correction）。 */
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

/** 记忆信号（检索返回面——读取时点的有效兴趣与迁移后生命周期）。 */
export interface MemorySignal {
  recordId: string;
  topic: string;
  intentSignal: string;
  /** 读取时点的有效兴趣（衰减后——07 §11；RECALL 迁移前的衰减值）。 */
  interestSignal: number;
  lifecycle: MemoryLifecycle;
}

/** 记忆操作结果（recall / correct / withdraw 共用返回面）。 */
export type MemoryMutationResult =
  | { ok: true; records: MemoryRecord[]; record: MemoryRecord }
  | { ok: false; code: 'MEMORY_NOT_FOUND' | 'MEMORY_EXPIRED' };

/** 记忆写入结果（recordMemory——07 §7 过滤纪律承载）。 */
export type MemoryWriteResult =
  | { ok: true; records: MemoryRecord[]; record: MemoryRecord; reexploration: boolean }
  | { ok: false; reason: 'write_filter' };

/** 记忆操作识别结果（确定性规则词表——D-05 选项 A）。 */
export interface MemoryOperationRecognition {
  memoryIntent: 'withdraw' | 'correct';
}

/** 衰减扫描结果（DECAY 为内部置信度更新、不发事件；EXPIRE 附删除审计）。 */
export interface MemoryDecayResult {
  records: MemoryRecord[];
  decayed: MemoryRecord[];
  expired: MemoryRecord[];
}

// ---------------------------------------------------------------------------
// 规范参数（D-04 选项 A——07 §11 示例形态采纳为规范参数）
// ---------------------------------------------------------------------------

/** Day 0 兴趣锚点（07 §11 示例：Day 0 = 0.90）。 */
export const MEMORY_INTEREST_ANCHOR = 0.9;
/** 指数衰减率 k = ln(0.90/0.63)/3 ≈ 0.1189 / 天（Day 0→Day 3 锚点对推导）。 */
export const MEMORY_DECAY_K = Math.log(0.9 / 0.63) / 3;
/** DECAYING 迁移阈值（IN_USE→DECAYING；实现细节——冻结文本未规定数值）。 */
export const MEMORY_DECAY_THRESHOLD = 0.5;
/** EXPIRED 迁移阈值（DECAYING→EXPIRED；D-04 选项 A——衰减至阈值以下驱动迁移）。 */
export const MEMORY_EXPIRE_THRESHOLD = 0.1;
/** 默认保留期：6 个月（自最后更新时间起算——D-04 选项 A；隐私要素 1）。 */
export const MEMORY_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
/** 再次主动探索的兴趣增量（07 §11——用户再次主动探索时 interest 重新获得证据）。 */
const REEXPLORATION_BOOST = 0.15;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return 0;
  }
  return Math.max(0, (toMs - fromMs) / DAY_MS);
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
const MEMORY_WITHDRAW_PATTERNS: ReadonlyArray<RegExp> = [
  /别再给我/,
  /别再推荐/,
  /别再出现/,
  /不要再给我/,
  /不要再推荐/,
];

/** CORRECT 词表（07 §17 Memory Correction——用户显式纠正）。 */
const MEMORY_CORRECT_PATTERNS: ReadonlyArray<RegExp> = [
  /记忆纠正/,
  /纠正记忆/,
  /记忆有误/,
  /记忆记错/,
];

/**
 * 记忆操作识别（确定性规则词表）。优先级 WITHDRAW > CORRECT（撤回为用户主权
 * 更强信号——GS-04；词表优先级为实现细节）。仅分类器在所有既有优先级层未命中
 * 后调用（不改变 STOP > … > DIRECT_ANSWER 优先级层）。
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

/** 纠正内容提取（"记忆纠正：X" → X，去前导标点空白；无显式内容 → null——纯留痕纠正）。 */
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
// 记忆域操作（纯函数——records 数组 → 新数组，绝不 mutate）
// ---------------------------------------------------------------------------

/** 默认 recordId 生成（memory_ 四位补零，序号 = 数组长度 + 1；冲突时递增去重）。 */
function nextRecordId(records: MemoryRecord[]): string {
  let n = records.length + 1;
  while (records.some((entry) => entry.recordId === `memory_${String(n).padStart(4, '0')}`)) {
    n += 1;
  }
  return `memory_${String(n).padStart(4, '0')}`;
}

/**
 * CREATE（记住，→REMEMBERED——经 Runtime 单一写入者）。
 * - 写入侧执行 07 §7 过滤（命中 → 不记录，{ ok: false, reason: 'write_filter' }）；
 * - 同一主题的活跃（非 EXPIRED）记录存在 → 再探索：interestSignal = min(1, 旧值+0.15)、
 *   updatedAt 刷新（活跃记忆不因持续使用而意外过期——D-04 选项 A），不新建记录；
 * - 新记录：confidence = source==='user_correction' ? 0.95 : 0.7；
 *   interestSignal = Day 0 锚点 0.9；
 * - recordId：入参提供（runtime 生成、可测注入）或默认 memory_ 四位补零（去重）。
 */
export function recordMemory(
  records: MemoryRecord[],
  input: { topic: string; intentSignal: string; source: MemorySource; now: string; recordId?: string },
): MemoryWriteResult {
  if (!passesMemoryWriteFilter(input.topic, input.intentSignal)) {
    return { ok: false, reason: 'write_filter' };
  }
  const existingIndex = records.findIndex(
    (entry) => entry.topic === input.topic && entry.lifecycle !== 'EXPIRED',
  );
  if (existingIndex >= 0) {
    const existing = records[existingIndex];
    const updated: MemoryRecord = {
      ...existing,
      interestSignal: Math.min(1, existing.interestSignal + REEXPLORATION_BOOST),
      updatedAt: input.now,
    };
    return {
      ok: true,
      records: records.map((entry, index) => (index === existingIndex ? updated : entry)),
      record: updated,
      reexploration: true,
    };
  }
  const record: MemoryRecord = {
    recordId: input.recordId ?? nextRecordId(records),
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
  return { ok: true, records: [...records, record], record, reexploration: false };
}

/**
 * RECALL（暂时使用，REMEMBERED→IN_USE——只读纪律针对体验轴，07 §22）：
 * REMEMBERED → IN_USE + lastRecalledAt + updatedAt 刷新；IN_USE / DECAYING
 * 已为使用中形态——幂等（不迁移、不刷新，原样返回入参数组引用）；
 * EXPIRED → 拒绝；不存在 → MEMORY_NOT_FOUND。
 */
export function recallMemory(records: MemoryRecord[], recordId: string, now: string): MemoryMutationResult {
  const index = records.findIndex((entry) => entry.recordId === recordId);
  if (index < 0) {
    return { ok: false, code: 'MEMORY_NOT_FOUND' };
  }
  const record = records[index];
  if (record.lifecycle === 'EXPIRED') {
    return { ok: false, code: 'MEMORY_EXPIRED' };
  }
  if (record.lifecycle !== 'REMEMBERED') {
    return { ok: true, records, record };
  }
  const updated: MemoryRecord = { ...record, lifecycle: 'IN_USE', updatedAt: now, lastRecalledAt: now };
  return {
    ok: true,
    records: records.map((entry, position) => (position === index ? updated : entry)),
    record: updated,
  };
}

/**
 * CORRECT（被用户纠正：内容更正 + 留痕，→REMEMBERED——D-02 选项 A）。
 * 纠正计数 + 1；兴趣重新获得证据（重置 Day 0 锚点——07 §11，用户主动纠正是
 * 强相关信号）；来源分量更新为用户纠正、confidence 0.95；
 * correctedTopic 为 null / 空 → 保留原主题（纯留痕纠正）。
 * EXPIRED / 不存在 → 拒绝。
 */
export function correctMemory(
  records: MemoryRecord[],
  recordId: string,
  input: { correctedTopic: string | null; now: string },
): MemoryMutationResult {
  const index = records.findIndex((entry) => entry.recordId === recordId);
  if (index < 0) {
    return { ok: false, code: 'MEMORY_NOT_FOUND' };
  }
  const record = records[index];
  if (record.lifecycle === 'EXPIRED') {
    return { ok: false, code: 'MEMORY_EXPIRED' };
  }
  const updated: MemoryRecord = {
    ...record,
    topic: input.correctedTopic || record.topic,
    corrections: record.corrections + 1,
    lifecycle: 'REMEMBERED',
    interestSignal: MEMORY_INTEREST_ANCHOR,
    updatedAt: input.now,
    source: 'user_correction',
    confidence: 0.95,
  };
  return {
    ok: true,
    records: records.map((entry, position) => (position === index ? updated : entry)),
    record: updated,
  };
}

/**
 * WITHDRAW（被用户撤回：→EXPIRED + 撤回留痕 + 删除审计——D-02 选项 A）。
 * 已 EXPIRED 记录 → 幂等拒绝（重复撤回不重复留痕）；不存在 → MEMORY_NOT_FOUND。
 */
export function withdrawMemory(records: MemoryRecord[], recordId: string, now: string): MemoryMutationResult {
  const index = records.findIndex((entry) => entry.recordId === recordId);
  if (index < 0) {
    return { ok: false, code: 'MEMORY_NOT_FOUND' };
  }
  const record = records[index];
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
  return {
    ok: true,
    records: records.map((entry, position) => (position === index ? updated : entry)),
    record: updated,
  };
}

/** 到期删除（→EXPIRED + 删除审计——隐私要素 1/5；不占用撤回留痕字段）。 */
function expireRecord(record: MemoryRecord, now: string, reason: MemoryDeletionAudit['reason']): MemoryRecord {
  return {
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
}

/**
 * 时间衰减扫描（DECAY / EXPIRE——时间驱动；纯函数，返回变更后的完整数组）：
 * - 任何活跃记录超过保留期（自 updatedAt 起算 180 天）→ EXPIRED + 审计
 *   reason='retention_expired'（隐私优先——先于衰减阈值判定）；
 * - DECAYING 且有效兴趣 < 0.1 → EXPIRED + 审计 'decay_threshold'；
 * - IN_USE 且有效兴趣 < 0.5 → DECAYING（内部置信度更新，不逐点发事件语义：
 *   本函数只返回变更后数组；不刷新 updatedAt——衰减时钟连续，07 §11"短期兴趣
 *   必须衰减"单调纪律，updatedAt 仅由用户驱动事件刷新）。
 */
export function applyMemoryDecay(records: MemoryRecord[], now: string): MemoryDecayResult {
  const decayed: MemoryRecord[] = [];
  const expired: MemoryRecord[] = [];
  const nextRecords = records.map((record) => {
    if (record.lifecycle === 'EXPIRED') {
      return record;
    }
    if (daysBetween(record.updatedAt, now) * DAY_MS >= MEMORY_RETENTION_MS) {
      const updated = expireRecord(record, now, 'retention_expired');
      expired.push(updated);
      return updated;
    }
    const interest = effectiveInterest(record, now);
    if (record.lifecycle === 'DECAYING' && interest < MEMORY_EXPIRE_THRESHOLD) {
      const updated = expireRecord(record, now, 'decay_threshold');
      expired.push(updated);
      return updated;
    }
    if (record.lifecycle === 'IN_USE' && interest < MEMORY_DECAY_THRESHOLD) {
      const updated: MemoryRecord = { ...record, lifecycle: 'DECAYING' };
      decayed.push(updated);
      return updated;
    }
    return record;
  });
  return { records: nextRecords, decayed, expired };
}

// ---------------------------------------------------------------------------
// 相关记忆检索（07 §20——以当前意图为检索键，只取相关记录）
// ---------------------------------------------------------------------------

/** 相关性判定（07 §20 检索纪律；2 字滑窗交集为实现细节）。 */
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
 * 检索相关记忆（07 §20 / §22；读取时驱动懒到期检查）：
 * - 先执行 applyMemoryDecay（超保留期 / 衰减到期记录先到期）；
 * - EXPIRED 记录不返回；不相关（2 字滑窗无交集）不返回；
 * - 命中 REMEMBERED 记录执行 RECALL 迁移（REMEMBERED→IN_USE + 刷新
 *   lastRecalledAt / updatedAt，不发事件）；
 * - signals.interestSignal 为读取时点的有效兴趣（RECALL 迁移前的衰减值——
 *   读时快照）；返回 records 为含全部迁移后的完整新数组（调用方持久化）。
 */
export function retrieveRelevant(
  records: MemoryRecord[],
  rawInput: string,
  now: string,
): { records: MemoryRecord[]; signals: MemorySignal[] } {
  const afterDecay = applyMemoryDecay(records, now);
  let working = afterDecay.records;
  const signals: MemorySignal[] = [];
  for (const record of afterDecay.records) {
    if (record.lifecycle === 'EXPIRED') {
      continue;
    }
    if (!sharesSignal(rawInput, `${record.topic}\n${record.intentSignal}`)) {
      continue;
    }
    let lifecycle: MemoryLifecycle = record.lifecycle;
    if (record.lifecycle === 'REMEMBERED') {
      const recalled = recallMemory(working, record.recordId, now);
      if (recalled.ok) {
        working = recalled.records;
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
  return { records: working, signals };
}
