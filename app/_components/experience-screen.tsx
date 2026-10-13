'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BranchIcon,
  CopyIcon,
  DatabaseIcon,
  DownloadIcon,
  MicIcon,
  SendIcon,
  SparklesIcon,
  VideoIcon,
  XIcon,
} from './icons';
import { RefreshIcon } from './icons';
import type { RecentEntry } from './home-screen';
import { creationId, type CreationEntry } from './creations';
import { splitGenerationDetail, downloadFileName } from './generation-text';
import {
  EXPERIENCE_CATALOG,
  CATEGORY_LABELS,
  type ExperienceSeed,
  type ExperienceCategory,
} from '../../src/experience/catalog';

export interface SessionState {
  sessionId: string;
  experienceId: string | null;
  stateVersion: number;
  status: string;
  stage: string;
}

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  semanticAction?: string;
  streaming?: boolean;
}

interface BranchInfo {
  ordinal: number;
  branchId: string;
  lifecycle: string;
  adopted: boolean;
  rounds: number;
}

interface MemoryInfo {
  topic: string;
  intentSignal: string;
  memoryClass: string;
  confidence: number;
  lifecycle: string;
}

interface DockAction {
  label: string;
  input: string;
}

interface GenerationState {
  id: number;
  modality: 'image' | 'video' | 'voice';
  status: 'pending' | 'completed' | 'unconfigured' | 'failed';
  prompt: string;
  url?: string;
  dataUri?: string;
  mime?: string;
  message?: string;
  /** 生成进度（0–100——视频异步任务轮询透传）。 */
  progress?: number;
  /** 锚定消息 id（内联渲染在产生它的那条回答下方——
   * 问答与产物同一滚动流，可持续查看）。 */
  anchor?: number;
  /** 系列标签（如「第1集·标题」——系列创作的有序查看）。 */
  label?: string;
  /** 蒸馏提示词（实际发送给图像模型的提示词——可解释性）。 */
  distilled?: string;
}

/** 系列创作规划（series_plan 事件——角色设定 + 分集）。 */
interface SeriesPlanState {
  title: string;
  characters: Array<{ name: string; design: string }>;
  episodes: Array<{ title: string; prompt: string }>;
}

const GENERATION_MODALITY_LABELS: Record<GenerationState['modality'], string> = {
  image: '图像',
  video: '视频',
  voice: '语音',
};

/**
 * 助手回复轻量 Markdown 渲染——提供方输出普遍带
 * 标题/加粗/列表记号，裸吐记号是体验硬伤。仅覆盖
 * 常见形态（井号标题、双星加粗、反引号行内码、
 * 星号/连字符/数字列表），不引第三方库；
 * 用户与系统消息保持原样。
 */
/**
 * AI 回答 Markdown 渲染（2026-10-11 全视角审计 P0——此前
 * 自研 formatRichText 不支持表格 / 引用 / 分隔线，模型输出
 * 的 GFM 表格以裸管道符呈现）。react-markdown 默认转义
 * HTML——无注入面；流式期间随文本增长重解析。
 *
 * 内联 HTML 剥离（实测排版缺陷——模型偶发输出 <b> / <br>
 * 等内联标签，react-markdown 跳过 HTML 节点，未闭合标签
 * 会使其后的正文整段消失——句中截断丢字）。渲染前白名单
 * 剥离：换行类标签转换行，其余移除标签保留文本——不引入
 * rehype-raw 注入面。
 */
function stripInlineHtml(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/?(b|i|u|em|strong|sub|sup|span|p|div|font|small|big|hr|center|mark)[^<>]*>/gi,
      '',
    );
}

// 流式性能关键：Markdown 解析是重操作——text 不变时跳过
// 重解析（每 chunk 只应重渲正在流式的那条消息）。
const MarkdownContent = memo(function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
      }}
    >
      {stripInlineHtml(text)}
    </ReactMarkdown>
  );
});

const ACTION_LABELS: Record<string, string> = {
  DIRECT_ANSWER: '回应',
  WHY: '为什么',
  WHAT_IF: '如果',
  DEEPEN: '深入',
  SIMPLIFY: '简化',
  REFRAME: '换角度',
  CREATE: '创作',
  CORRECTION: '纠正',
  CHANGE_DIRECTION: '换一个',
  CONTINUE: '继续',
  REPEAT: '重复',
  STOP: '完成',
};

/**
 * Screen 04 会话阶段轨道（① 项）——把 runtime 的隐形 stage/status
 * 呈现为可见的"体验旅程"进度，兑现"控制感 / 从看见到参与"。
 * 五段：开始 → 理解 → 深入 → 创作 → 完成。当前段高亮 + 下一步可做什么。
 * 映射依据状态机语义（status 与 stage 的复合定位）。
 */
const STAGE_RAIL = [
  { key: 'start', label: '开始', hint: '进入这个体验' },
  { key: 'understand', label: '理解', hint: '正在理解你的方向' },
  { key: 'deepen', label: '深入', hint: '现在可以深入、换角度或模拟' },
  { key: 'create', label: '创作', hint: '把灵感做成作品' },
  { key: 'done', label: '完成', hint: '收尾并沉淀这次体验' },
];

function stageRailIndex(status: string, stage: string): number {
  if (status === 'COMPLETED' || stage === 'COMPLETION') return 4;
  if (stage === 'CREATION') return 3;
  if (stage === 'SIMULATION' || status === 'WAITING') return 2;
  if (status === 'ENTERING' || stage === 'CURIOSITY') return 0;
  return 1; // READY/ACTIVE + UNDERSTANDING → 理解
}

function StageRail({ status, stage }: { status: string; stage: string }) {
  const index = stageRailIndex(status, stage);
  return (
    <div className="stage-rail" aria-label="体验阶段">
      <div className="stage-rail-track">
        {STAGE_RAIL.map((segment, segmentIndex) => (
          <div
            key={segment.key}
            className={`stage-rail-seg${
              segmentIndex <= index ? ' is-reached' : ''
            }${segmentIndex === index ? ' is-current' : ''}`}
          >
            <span className="stage-rail-dot" />
            <span className="stage-rail-label">{segment.label}</span>
          </div>
        ))}
      </div>
      <p className="stage-rail-hint">
        <span className="stage-rail-now">{STAGE_RAIL[index].label}阶段</span>
        · {STAGE_RAIL[index].hint}
      </p>
    </div>
  );
}

/**
 * 单条消息流（气泡 + 产物引用）——memo 化的流式性能关键：
 * chunk 更新只变更正在流式的那条消息对象引用，其余行引用
 * 不变即整行跳过重渲染（Markdown 重解析是最大开销点）。
 */
interface MessageFlowProps {
  message: Message;
  items: GenerationState[] | undefined;
  onStage: number | null;
  pending: boolean;
  onSelectStage: (id: number) => void;
  onRegen: (prompt: string) => void;
}

const MessageFlow = memo(function MessageFlow({
  message,
  items,
  onStage,
  pending,
  onSelectStage,
  onRegen,
}: MessageFlowProps) {
  // 文本产物带走（A 项——多媒体已在产物舞台可下载；纯文本
  // 回答补「复制 / 下载 .md」闭环，创作型产品最常带走的形态）。
  const [copied, setCopied] = useState(false);
  const handleCopy = (text: string): void => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        })
        .catch(() => {});
    }
  };
  const handleDownload = (text: string): void => {
    try {
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const base = text.slice(0, 16).replace(/[\\/:*?"<>|#\s]+/g, '-');
      const name = `${base.length > 0 ? base : 'experience'}.md`;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      // 下载不可用——静默（不打断对话）。
    }
  };
  return (
    <div className="message-flow">
      <div className={`message message-${message.role}`}>
        {message.role === 'assistant' && message.semanticAction && (
          <span className="message-tag">
            {ACTION_LABELS[message.semanticAction] ?? message.semanticAction}
          </span>
        )}
        {message.role === 'assistant' ? (
          <div
            className={`message-text is-rich message-md${
              message.streaming ? ' is-streaming' : ''
            }`}
          >
            <MarkdownContent text={message.text} />
            {message.streaming && <span className="stream-cursor" aria-hidden="true" />}
          </div>
        ) : (
          <span className="message-text">
            {message.text}
            {message.streaming && <span className="stream-cursor" aria-hidden="true" />}
          </span>
        )}
      </div>
      {message.role === 'assistant' && !message.streaming && message.text.length > 0 && (
        <div className="message-tools">
          <button
            type="button"
            className="message-tool"
            onClick={() => handleCopy(message.text)}
          >
            <CopyIcon size={12} />
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          <button
            type="button"
            className="message-tool"
            onClick={() => handleDownload(message.text)}
          >
            <DownloadIcon size={12} />
            <span>下载 .md</span>
          </button>
        </div>
      )}
      {items?.map((item) =>
        item.status === 'completed' &&
        (item.url !== undefined || item.dataUri !== undefined) ? (
          <button
            key={item.id}
            type="button"
            className={`gen-ref${onStage === item.id ? ' is-on-stage' : ''}`}
            onClick={() => onSelectStage(item.id)}
            title="在右侧舞台查看"
          >
            <span className={`gen-tag gen-tag-${item.modality}`}>
              {GENERATION_MODALITY_LABELS[item.modality]}
            </span>
            <span className="gen-ref-text">{item.label ?? item.prompt}</span>
            <span className="gen-ref-hint">舞台查看</span>
          </button>
        ) : item.status === 'pending' ? (
          <div key={item.id} className="gen-ref-pending">
            <span className="gen-pending-dot" aria-hidden="true" />
            <span>{GENERATION_MODALITY_LABELS[item.modality]}生成中</span>
            {typeof item.progress === 'number' && item.progress > 0 ? (
              <span className="gen-progress">
                <span className="gen-progress-bar">
                  <span
                    className="gen-progress-fill"
                    style={{ width: `${item.progress}%` }}
                  />
                </span>
                <span className="gen-progress-num">{item.progress}%</span>
              </span>
            ) : (
              <span className="gen-queued">排队中</span>
            )}
          </div>
        ) : (
          <div key={item.id} className="gen-ref-fail">
            <p className="gen-message">{splitGenerationDetail(item.message).main}</p>
            {splitGenerationDetail(item.message).detail !== null && (
              <p
                className="gen-detail"
                title={splitGenerationDetail(item.message).detail ?? undefined}
              >
                {splitGenerationDetail(item.message).detail}
              </p>
            )}
            <button
              type="button"
              className="gen-regen"
              onClick={() => onRegen(item.prompt)}
              disabled={pending}
            >
              <RefreshIcon size={12} />
              <span>重试</span>
            </button>
          </div>
        ),
      )}
    </div>
  );
});

// 创作参数（专业生产能力——画幅 / 视频时长随请求透传
// 生成网关；「自动」不发送参数，保持提供方默认行为）。
const ASPECT_CHOICES = [
  { value: 'auto', label: '自动' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
] as const;

const DURATION_CHOICES = [
  { value: 'auto', label: '自动' },
  { value: '8', label: '8s' },
  { value: '12', label: '12s' },
] as const;

interface ExperienceScreenProps {
  session: SessionState;
  initialInput?: string;
  /** 初始参考图（dataURI——作品墙「续作」入口注入）。 */
  initialRefs?: string[];
  resume?: boolean;
  mode: 'synthetic' | 'provider';
  providerLabel?: string;
  onSessionUpdate: (session: SessionState) => void;
  onRecent: (entry: RecentEntry) => void;
  onExit: () => void;
  /** 生成完成回调——作品持久化（首页作品墙）。 */
  onCreation?: (entry: CreationEntry) => void;
  /** 体验收尾——继续探索关联体验（④ 项）：进入新体验入口屏。 */
  onExploreMore?: (seed: ExperienceSeed) => void;
}

export function ExperienceScreen({
  session,
  initialInput,
  initialRefs,
  resume,
  mode,
  providerLabel,
  onSessionUpdate,
  onRecent,
  onExit,
  onCreation,
  onExploreMore,
}: ExperienceScreenProps) {
  const [sessionState, setSessionState] = useState<SessionState>(session);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [branchPanelOpen, setBranchPanelOpen] = useState(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  // 创作参数弹层（画幅 / 时长——低频设置，不常驻占位）。
  const [paramsOpen, setParamsOpen] = useState(false);
  // 参考图（图生图——随下一条消息发送，≤3 张；可由作品墙
  // 「续作」入口预注入）。
  const [pendingRefs, setPendingRefs] = useState<string[]>(initialRefs ?? []);
  const refInputRef = useRef<HTMLInputElement>(null);
  // 系列创作规划（series_plan 事件——角色 + 分集 + 逐集生成）。
  const [seriesPlan, setSeriesPlan] = useState<SeriesPlanState | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [roundCount, setRoundCount] = useState(0);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryInfo[]>([]);
  const [generations, setGenerations] = useState<GenerationState[]>([]);
  // 创作参数（画幅 / 视频时长——「自动」= 不发送，跟随提供方默认）。
  const [aspect, setAspect] = useState<(typeof ASPECT_CHOICES)[number]['value']>('auto');
  const [duration, setDuration] = useState<(typeof DURATION_CHOICES)[number]['value']>('auto');

  const sessionRef = useRef(session);
  const idCounter = useRef(0);
  const sendingRef = useRef(false);
  const startedRef = useRef(false);
  // 在途流的中止控制器——视频等长生成（重试退避可达数分钟）
  // 期间用户必须能停止，否则整个对话被锁死。
  const abortRef = useRef<AbortController | null>(null);
  // 各模态本轮生成的提示词——完成事件不携带
  // 提示词，作品持久化需要它（started 时记录）。
  const pendingPromptRef = useRef(new Map<string, string>());
  // 当前轮助手消息 id——generation started 事件的
  // 内联锚点（产物挂在引发它的那条回答下面）。
  const lastAssistantIdRef = useRef<number | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  const nextId = () => (idCounter.current += 1);

  const applyGenerationEvent = useCallback((event: Record<string, unknown>) => {
    const status = String(event.status ?? '');
    const modality = String(event.modality ?? '') as GenerationState['modality'];
    if (status === 'started') {
      pendingPromptRef.current.set(modality, String(event.prompt ?? ''));
      setGenerations((prev) => {
        // 去重防护：同锚点同模态仍有 pending 卡片时替换
        // 而非叠加（事件重复 / 重放不产生双卡）。
        const duplicateIndex = prev.findIndex(
          (item) =>
            item.status === 'pending' &&
            item.modality === modality &&
            item.anchor === lastAssistantIdRef.current,
        );
        const card = {
          id: duplicateIndex !== -1 ? prev[duplicateIndex].id : nextId(),
          modality,
          status: 'pending' as const,
          prompt: String(event.prompt ?? ''),
          anchor: lastAssistantIdRef.current ?? undefined,
          ...(typeof event.distilledPrompt === 'string'
            ? { distilled: event.distilledPrompt }
            : {}),
        };
        if (duplicateIndex === -1) return [...prev, card];
        const next = [...prev];
        next[duplicateIndex] = card;
        return next;
      });
      return;
    }
    if (status === 'progress') {
      // 更新该模态最近一条待完成产物的进度。
      setGenerations((prev) => {
        for (let i = prev.length - 1; i >= 0; i -= 1) {
          if (prev[i].status === 'pending' && prev[i].modality === modality) {
            const next = [...prev];
            next[i] = {
              ...next[i],
              progress:
                typeof event.progress === 'number' ? event.progress : undefined,
            };
            return next;
          }
        }
        return prev;
      });
      return;
    }
    const completed = status === 'completed';
    const prompt = pendingPromptRef.current.get(modality) ?? '';
    if (completed) {
      pendingPromptRef.current.delete(modality);
    }
    // 生成完成 → 上报作品（持久化到首页
    // 作品墙）。完成事件自身携带产物
    // 字段——副作用放在状态更新器之外，
    // 更新器保持纯净（渲染期不得触发
    // 其他组件的 setState）。
    if (
      completed &&
      onCreation &&
      (typeof event.url === 'string' || typeof event.dataUri === 'string')
    ) {
      onCreation({
        id: creationId(),
        modality,
        prompt,
        // 画面语义标题 = 实际生成用的提示词（蒸馏词 / 安全兜底词）。
        // 缺省回退主题句（旧事件 / 直接创作路径无 promptUsed 时
        // 作品墙展示仍不空白——CR-60）。
        ...(typeof event.promptUsed === 'string' && event.promptUsed.length > 0
          ? { caption: event.promptUsed }
          : {}),
        ...(typeof event.url === 'string' ? { url: event.url } : {}),
        ...(typeof event.dataUri === 'string' ? { dataUri: event.dataUri } : {}),
        ...(typeof event.mime === 'string' ? { mime: event.mime } : {}),
        at: new Date().toISOString(),
      });
    }
    setGenerations((prev) => {
      // 匹配该模态最近一条待完成产物（同一轮只生成一次）。
      let index = -1;
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        if (prev[i].status === 'pending' && prev[i].modality === modality) {
          index = i;
          break;
        }
      }
      if (index === -1) return prev;
      const next: GenerationState = {
        ...prev[index],
        status: completed
          ? 'completed'
          : status === 'unconfigured'
            ? 'unconfigured'
            : 'failed',
        ...(typeof event.url === 'string' ? { url: event.url } : {}),
        ...(typeof event.dataUri === 'string' ? { dataUri: event.dataUri } : {}),
        ...(typeof event.mime === 'string' ? { mime: event.mime } : {}),
        ...(typeof event.message === 'string' ? { message: event.message } : {}),
      };
      return [...prev.slice(0, index), next, ...prev.slice(index + 1)];
    });
  }, [onCreation]);

  const applySession = useCallback(
    (next: SessionState) => {
      sessionRef.current = next;
      setSessionState(next);
      onSessionUpdate(next);
      // 「继续探索」最近条目兜底刷新：任何会话状态同步（含恢复会话
      // resyncState / 流 state_updated）都以最新 stage 更新 chip——
      // topic 传空串由 page 层继承旧主题（首条流的主题由 send 侧携带）。
      if (next.experienceId) {
        onRecent({
          experienceId: next.experienceId,
          sessionId: next.sessionId,
          stateVersion: next.stateVersion,
          topic: '',
          stage: next.stage,
          at: new Date().toISOString(),
        });
      }
    },
    [onSessionUpdate, onRecent],
  );

  const resyncState = useCallback(async (): Promise<boolean> => {
    const experienceId = sessionRef.current.experienceId;
    if (!experienceId) return false;
    try {
      const response = await fetch(`/api/experience/${experienceId}/state`);
      if (!response.ok) return false;
      const data = await response.json();
      applySession({
        ...sessionRef.current,
        stateVersion: data.state_version,
        status: data.state?.status ?? sessionRef.current.status,
        stage: data.state?.stage ?? sessionRef.current.stage,
      });
      return true;
    } catch {
      // 状态同步失败时保持本地状态——下次提交携带本地版本
      return false;
    }
  }, [applySession]);

  const refreshSimulation = useCallback(async () => {
    const experienceId = sessionRef.current.experienceId;
    if (!experienceId) return;
    try {
      const response = await fetch(`/api/experience/${experienceId}/simulation`);
      if (!response.ok) return;
      const data = await response.json();
      setCurrentBranchId(data.current_branch_id ?? null);
      setRoundCount(Array.isArray(data.rounds) ? data.rounds.length : 0);
      setBranches(
        (Array.isArray(data.branches) ? data.branches : []).map(
          (branch: Record<string, unknown>, index: number) => ({
            ordinal: index + 1,
            branchId: String(branch.branch_id),
            lifecycle: String(branch.lifecycle),
            adopted: Boolean(branch.adopted),
            rounds: Number(branch.rounds),
          }),
        ),
      );
    } catch {
      // 面板刷新失败不中断体验
    }
  }, []);

  const refreshMemory = useCallback(async () => {
    try {
      const response = await fetch('/api/memory');
      if (!response.ok) return;
      const data = await response.json();
      setMemories(
        (Array.isArray(data.records) ? data.records : []).map(
          (record: Record<string, unknown>) => ({
            topic: String(record.topic ?? ''),
            intentSignal: String(record.intent_signal ?? ''),
            memoryClass: String(record.memory_class ?? ''),
            confidence: Number(record.confidence ?? 0),
            lifecycle: String(record.lifecycle ?? ''),
          }),
        ),
      );
    } catch {
      // 面板刷新失败不中断体验
    }
  }, []);

  const refreshPanels = useCallback(() => {
    void refreshSimulation();
    void refreshMemory();
  }, [refreshSimulation, refreshMemory]);

  const send = useCallback(
    async (rawInput: string, isFirst = false) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      setPending(true);
      setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: rawInput }]);
      setDraft('');

      const body: Record<string, unknown> = {
        request_id: `web_${crypto.randomUUID()}`,
        session_id: sessionRef.current.sessionId,
        user_input: rawInput,
      };
      if (sessionRef.current.experienceId && sessionRef.current.stateVersion > 0) {
        body.experience_id = sessionRef.current.experienceId;
        body.state_version = sessionRef.current.stateVersion;
      }
      // 创作参数透传（仅非「自动」时携带——后端白名单校验）。
      if (aspect !== 'auto') body.aspect_ratio = aspect;
      if (duration !== 'auto') body.seconds = duration;
      // 参考图（图生图——随消息透传，发送即清空附件栏）。
      if (pendingRefs.length > 0) {
        body.reference_images = pendingRefs;
        setPendingRefs([]);
      }

      try {
        const response = await fetch('/api/experience/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(body),
        });

        if (!response.ok || !response.body) {
          let errorMessage = `出错了（HTTP ${response.status}）`;
          try {
            const data = (await response.json()) as Record<string, unknown>;
            if (data.code === 'INVALID_ACTION') {
              errorMessage = '这个问题我还不确定怎么接——换个说法，或选一个方向。';
            } else if (data.code === 'INVALID_STATE_TRANSITION') {
              // 状态机拒绝（如创作会话内换方向）——中文可行动指引，
              // 不裸吐内部英文。
              errorMessage = '这一步和当前阶段接不上——试试「继续」，或从下面的方向里选一个。';
            } else if (
              typeof data.message === 'string' &&
              (data.message.startsWith('unknown experience') ||
                data.message === 'experience/session mismatch')
            ) {
              errorMessage = '这段体验的服务端会话已失效（服务可能重启过）——返回首页重新开始即可。';
            } else if (
              typeof data.message === 'string' &&
              (data.message.startsWith('unknown session') ||
                data.message.startsWith('session ') && data.message.includes('rejects'))
            ) {
              // dev 服务器完整重启后内存会话清空（热重载已由
              // globalThis 单例挡住——此条仅兜底完整重启）。
              errorMessage = '服务刚重启过，这段体验的会话已失效——返回首页重新开始即可。';
            } else if (typeof data.message === 'string') {
              // 提供方 / 内部错误原文可能是英文——无中文时换
              // 通用可行动文案，不裸吐。这类失败多为服务瞬时
              // 繁忙 / 网络波动——指引重试而非「换说法」（输入
              // 本身没错，归因放错会让用户反复绕圈）。
              errorMessage = /[\u4e00-\u9fff]/.test(data.message)
                ? data.message
                : '服务暂时繁忙或连接中断——稍等片刻再试一次。';
            }
          } catch {
            // 非 JSON 错误体（网络层失败）——同服务繁忙指引，
            // 重试即可恢复，不归因用户输入。
            errorMessage = '服务暂时繁忙或连接中断——稍等片刻再试一次。';
          }
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'system', text: errorMessage },
          ]);
          await resyncState();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantId: number | null = null;
        let firstHeader = true;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf('\n');
            if (line.length === 0) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line) as Record<string, unknown>;
            } catch {
              continue;
            }

            if (event.type === 'submission') {
              assistantId = nextId();
              lastAssistantIdRef.current = assistantId;
              const semanticAction =
                typeof event.policy_decision === 'object' && event.policy_decision !== null
                  ? String((event.policy_decision as Record<string, unknown>).semantic_action)
                  : undefined;
              setMessages((prev) => [
                ...prev,
                {
                  id: assistantId as number,
                  role: 'assistant',
                  text: '',
                  semanticAction,
                  streaming: true,
                },
              ]);
              if (firstHeader) {
                firstHeader = false;
                const state = (event.state ?? {}) as Record<string, unknown>;
                applySession({
                  ...sessionRef.current,
                  experienceId: String(event.experience_id),
                  stateVersion: Number(event.state_version),
                  status: String(state.status ?? sessionRef.current.status),
                  stage: String(state.stage ?? sessionRef.current.stage),
                });
                // 每次流提交都刷新「继续探索」最近条目：stage/at 取最新
                // （会话深入/创作/完成会推进 stage，chip 不再冻结在「理解」）；
                // topic 仅首条携带真实主题，后续轮传空串由 page 层继承旧主题
                // （避免「画成图片/好了」等指令词覆盖会话主题）。
                onRecent({
                  experienceId: String(event.experience_id),
                  sessionId: sessionRef.current.sessionId,
                  stateVersion: Number(event.state_version),
                  topic: isFirst ? rawInput.slice(0, 40) : '',
                  stage: String(state.stage ?? sessionRef.current.stage),
                  at: new Date().toISOString(),
                });
              }
            } else if (event.type === 'chunk') {
              const content = typeof event.content === 'string' ? event.content : '';
              const targetId = assistantId;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === targetId ? { ...message, text: message.text + content } : message,
                ),
              );
            } else if (event.type === 'state_updated') {
              const state = (event.state ?? {}) as Record<string, unknown>;
              applySession({
                ...sessionRef.current,
                stateVersion: Number(event.state_version),
                status: String(state.status ?? sessionRef.current.status),
                stage: String(state.stage ?? sessionRef.current.stage),
              });
            } else if (event.type === 'done') {
              const targetId = assistantId;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === targetId ? { ...message, streaming: false } : message,
                ),
              );
              refreshPanels();
            } else if (event.type === 'generation') {
              applyGenerationEvent(event);
            } else if (event.type === 'stopped') {
              const targetId = assistantId;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === targetId
                    ? { ...message, text: `${message.text}\n\n（体验已停止）`, streaming: false }
                    : message,
                ),
              );
            } else if (event.type === 'cancelled') {
              const targetId = assistantId;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === targetId
                    ? { ...message, text: `${message.text}\n\n（已取消）`, streaming: false }
                    : message,
                ),
              );
            } else if (event.type === 'series_plan') {
              // 系列创作规划落地（结构化角色 + 分集——舞台
              // 面板逐集生成与有序查看的数据源）。
              const plan = event.plan as {
                title?: unknown;
                characters?: unknown;
                episodes?: unknown;
              } | null;
              if (
                plan &&
                typeof plan.title === 'string' &&
                Array.isArray(plan.episodes)
              ) {
                setSeriesPlan({
                  title: plan.title,
                  characters: Array.isArray(plan.characters)
                    ? (plan.characters as Array<{ name?: unknown; design?: unknown }>)
                        .filter(
                          (c): c is { name: string; design: string } =>
                            typeof c.name === 'string' &&
                            typeof c.design === 'string',
                        )
                        .map((c) => ({ name: c.name, design: c.design }))
                    : [],
                  episodes: (plan.episodes as Array<{ title?: unknown; prompt?: unknown }>)
                    .filter(
                      (e): e is { title: string; prompt: string } =>
                        typeof e.title === 'string' &&
                        typeof e.prompt === 'string',
                    )
                    .map((e) => ({ title: e.title, prompt: e.prompt })),
                });
              }
            }
          }
        }
      } catch {
        // 主动停止（用户点击停止按钮）：流在途中止，服务端
        // 经 request.signal 传播取消（不产出后续分块）；区别
        // 于网络故障文案。中止时收尾在途的流式消息——已有一
        // 定内容的保留原样（真实产物），空骨架直接移除（不
        // 留空气泡）。
        setMessages((prev) => {
          const cleaned = prev.filter(
            (message) =>
              !(
                message.role === 'assistant' &&
                message.streaming &&
                message.text.length === 0
              ),
          );
          return [
            ...cleaned.map((message) =>
              message.streaming ? { ...message, streaming: false } : message,
            ),
            {
              id: nextId(),
              role: 'system',
              text: controller.signal.aborted
                ? '已停止这一轮生成——随时继续。'
                : '连接中断了——请再试一次。',
            },
          ];
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        sendingRef.current = false;
        setPending(false);
      }
    },
    [applySession, onRecent, resyncState, refreshPanels, aspect, duration, pendingRefs],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // 参考图文件 → 压缩 dataURI（≤1024px JPEG——控制上传与
  // 存档体积）；非图片忽略，至多 3 张。
  const handleReferenceFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, 3 - pendingRefs.length);
    for (const file of picked) {
      try {
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const image = new Image();
            image.onload = () => {
              const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round(image.width * scale));
              canvas.height = Math.max(1, Math.round(image.height * scale));
              const context = canvas.getContext('2d');
              if (!context) {
                resolve(String(reader.result));
                return;
              }
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            image.onerror = () => reject(new Error('image decode failed'));
            image.src = String(reader.result);
          };
          reader.onerror = () => reject(new Error('file read failed'));
          reader.readAsDataURL(file);
        });
        setPendingRefs((prev) => [...prev, dataUri].slice(0, 3));
      } catch {
        // 单张失败不影响其余——静默跳过。
      }
    }
  }, [pendingRefs.length]);

  // 系列分集生成（走直接生成路由——逐集异步、互不阻塞；
  // 产物带系列标签回流舞台与总览，角色设定注入保证一致性）。
  const [videoSeriesRunning, setVideoSeriesRunning] = useState(false);
  const generateVideoSeries = useCallback(async () => {
    if (videoSeriesRunning) return;
    setVideoSeriesRunning(true);
    try {
      // 驱动源：作品墙的图像作品（最新在前）——按叙事顺序
      // 倒排为剧集顺序；每集以上一集画面为参考（reference
      // 模式——角色与场景跨集一致）。
      const works = await fetch('/api/works')
        .then((r) => (r.ok ? r.json() : { works: [] }))
        .catch(() => ({ works: [] }));
      const imageWorks = (works.works ?? [])
        .filter((w: { modality?: string }) => w.modality === 'image')
        .slice(0, 5) as Array<{ id: string; prompt: string; assetUrl: string }>;
      const ordered = [...imageWorks].reverse();
      for (const [index, work] of ordered.entries()) {
        const genId = nextId();
        const label = `第${index + 1}幕·动画`;
        const motionPrompt = `${work.prompt}。以参考图为该场景的起点，让画面自然动起来：雪花缓缓飘落，灯光光晕轻晃，人物缓缓前行，镜头缓慢推进，电影感氛围。`;
        const videoGen: GenerationState = {
          id: genId,
          modality: 'video',
          status: 'pending',
          prompt: motionPrompt,
          label,
        };
        setGenerations((prev) => [...prev, videoGen]);
        setStageGenId(genId);
        try {
          const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              request_id: `web_${crypto.randomUUID()}`,
              modality: 'video',
              prompt: motionPrompt,
              reference_images: [work.assetUrl],
            }),
          });
          if (!response.ok || response.body === null) {
            setGenerations((prev) =>
              prev.map((item) =>
                item.id === genId
                  ? { ...item, status: 'failed', message: '生成服务不可用' }
                  : item,
              ),
            );
            continue;
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (line.length === 0) continue;
              let evt: Record<string, unknown>;
              try {
                evt = JSON.parse(line) as Record<string, unknown>;
              } catch {
                continue;
              }
              if (evt.type === 'completed') {
                const completedGen: GenerationState = {
                  ...videoGen,
                  status: 'completed',
                  ...(typeof evt.url === 'string' ? { url: evt.url } : {}),
                  ...(typeof evt.dataUri === 'string'
                    ? { dataUri: evt.dataUri }
                    : {}),
                  mime: typeof evt.mime === 'string' ? evt.mime : 'video/mp4',
                };
                setGenerations((prev) =>
                  prev.map((item) => (item.id === genId ? completedGen : item)),
                );
                setStageGenId(genId);
              } else if (evt.type === 'failed' || evt.type === 'unconfigured') {
                setGenerations((prev) =>
                  prev.map((item) =>
                    item.id === genId
                      ? {
                          ...item,
                          status: 'failed',
                          message: String(evt.message ?? '生成失败'),
                        }
                      : item,
                  ),
                );
              } else if (evt.type === 'progress') {
                const progress =
                  typeof evt.progress === 'number' ? evt.progress : undefined;
                setGenerations((prev) =>
                  prev.map((item) =>
                    item.id === genId ? { ...item, progress } : item,
                  ),
                );
              }
            }
          }
        } catch {
          setGenerations((prev) =>
            prev.map((item) =>
              item.id === genId
                ? { ...item, status: 'failed', message: '网络中断' }
                : item,
            ),
          );
        }
      }
    } finally {
      setVideoSeriesRunning(false);
    }
  }, [videoSeriesRunning]);
  const generateEpisode = useCallback(async (index: number) => {
    if (seriesPlan === null) return;
    const episode = seriesPlan.episodes[index];
    if (!episode) return;
    const existing = generations.find(
      (item) => item.label?.startsWith(`第${index + 1}集`),
    );
    if (existing && existing.status !== 'failed') return;
    const genId = nextId();
    const characterNote =
      seriesPlan.characters.length > 0
        ? `。角色一致性：${seriesPlan.characters
            .map((c) => `${c.name}（${c.design}）`)
            .join('；')}`
        : '';
    const fullPrompt = `系列「${seriesPlan.title}」第${index + 1}集「${episode.title}」：${episode.prompt}${characterNote}`;
    const genCard: GenerationState = {
      id: genId,
      modality: 'image',
      status: 'pending',
      prompt: fullPrompt,
      label: `第${index + 1}集·${episode.title}`,
      anchor: lastAssistantIdRef.current ?? undefined,
    };
    setGenerations((prev) => [...prev, genCard]);
    setStageGenId(genId);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: `web_${crypto.randomUUID()}`,
          modality: 'image',
          prompt: fullPrompt,
        }),
      });
      if (!response.ok || response.body === null) {
        setGenerations((prev) =>
          prev.map((item) =>
            item.id === genId
              ? { ...item, status: 'failed', message: '生成服务不可用' }
              : item,
          ),
        );
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.length === 0) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (evt.type === 'completed') {
            const completedGen: GenerationState = {
              ...genCard,
              status: 'completed',
              ...(typeof evt.url === 'string' ? { url: evt.url } : {}),
              ...(typeof evt.dataUri === 'string' ? { dataUri: evt.dataUri } : {}),
              ...(typeof evt.mime === 'string' ? { mime: evt.mime } : {}),
            };
            setGenerations((prev) =>
              prev.map((item) => (item.id === genId ? completedGen : item)),
            );
            setStageGenId(genId);
          } else if (evt.type === 'failed' || evt.type === 'unconfigured') {
            setGenerations((prev) =>
              prev.map((item) =>
                item.id === genId
                  ? {
                      ...item,
                      status: 'failed',
                      message: String(evt.message ?? '生成失败'),
                    }
                  : item,
              ),
            );
          }
        }
      }
    } catch {
      setGenerations((prev) =>
        prev.map((item) =>
          item.id === genId
            ? { ...item, status: 'failed', message: '网络中断' }
            : item,
        ),
      );
    }
  }, [seriesPlan, generations]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialInput) {
      void send(initialInput, true);
    } else if (resume) {
      // 恢复会话（T14 修复 + 存活探测 + 对话继续）：先取回
      // 刷新前留在本地的对话与产物（sessionStorage 按
      // 体验 id 存档——离开再进来不打断上下文），再重同步
      // 服务端状态；服务端会话不存在（dev 重启清内存态）
      // 时仍给出明确指引而非盲目提交。
      void (async () => {
        const experienceId = sessionRef.current.experienceId;
        if (experienceId) {
          try {
            const raw = sessionStorage.getItem(
              `intent-experience.exp.${experienceId}`,
            );
            if (raw) {
              const saved = JSON.parse(raw) as {
                messages?: Message[];
                generations?: GenerationState[];
                seriesPlan?: SeriesPlanState | null;
              };
              if (Array.isArray(saved.messages) && saved.messages.length > 0) {
                setMessages(saved.messages);
                idCounter.current =
                  Math.max(...saved.messages.map((m) => m.id ?? 0)) + 1;
              }
              if (Array.isArray(saved.generations)) {
                setGenerations(saved.generations);
              }
              if (saved.seriesPlan) {
                setSeriesPlan(saved.seriesPlan);
              }
            }
          } catch {
            // 存档不可用——按空白会话继续（不阻断恢复）。
          }
        }
        const alive = await resyncState();
        if (!alive) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'system',
              text: '这段体验的服务端会话已失效（服务可能重启过）——返回首页重新开始即可。',
            },
          ]);
          return;
        }
        void send('接着往下讲');
      })();
    }
  }, [initialInput, resume, send]);

  // 会话视图存档（对话继续的另一半）：消息与产物随变化写入
  // sessionStorage（按体验 id）——刷新 / 返回再进时由上方恢复
  // 逻辑取回；配额满或不可用静默跳过（主流程不受影响）。
  useEffect(() => {
    const experienceId = sessionState.experienceId;
    if (!experienceId) return;
    try {
      sessionStorage.setItem(
        `intent-experience.exp.${experienceId}`,
        JSON.stringify({ messages, generations, seriesPlan }),
      );
    } catch {
      // 容量/可用性限制——跳过持久化。
    }
  }, [messages, generations, sessionState.experienceId, seriesPlan]);

  // 流式自动跟随：内容增长时滚动到底部——用户上滚
  // 查阅历史时（距底超过阈值）不打扰（不抢回滚动）。
  const handleConversationScroll = () => {
    const element = conversationRef.current;
    if (!element) return;
    followRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };

  useEffect(() => {
    const element = conversationRef.current;
    if (element && followRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, generations]);

  const branchActive = currentBranchId !== null;

  // 内联生成物索引：锚定消息 id → 该回答下方的产物引用
  // （对话列只承载过程态；产物正身常驻右侧舞台）。
  const generationsByAnchor = useMemo(() => {
    const map = new Map<number, GenerationState[]>();
    for (const item of generations) {
      if (item.anchor === undefined) continue;
      const list = map.get(item.anchor);
      if (list !== undefined) {
        list.push(item);
      } else {
        map.set(item.anchor, [item]);
      }
    }
    return map;
  }, [generations]);

  // 舞台产物（右侧常驻大幅展示）：会话内已完成产物集合；
  // stageGenId 为用户显式选择的产物，未选择时自动跟随最新。
  const [stageGenId, setStageGenId] = useState<number | null>(null);
  // 舞台视图：单幅（大图+导航）/ 总览（本会话作品网格）。
  const [stageView, setStageView] = useState<'single' | 'grid'>('single');
  const completedArtifacts = useMemo(
    () =>
      generations.filter(
        (item) =>
          item.status === 'completed' &&
          (item.url !== undefined || item.dataUri !== undefined),
      ),
    [generations],
  );
  const stageArtifact = useMemo(() => {
    if (completedArtifacts.length === 0) return null;
    const picked =
      stageGenId !== null
        ? completedArtifacts.find((item) => item.id === stageGenId)
        : undefined;
    return picked ?? completedArtifacts[completedArtifacts.length - 1];
  }, [completedArtifacts, stageGenId]);

  // 生成过程进度反馈：图像 / 语音无 progress 事件——用计时兜底，
  // 不让用户在空白舞台前干等；视频有 progress 事件直接透传。
  const pendingGeneration = useMemo(
    () => generations.find((item) => item.status === 'pending'),
    [generations],
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!pendingGeneration && !pending) {
      setElapsedSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pendingGeneration, pending]);

  // 作品来源：锚定消息（引发生成的回答）摘要——回答「哪个是
  // 哪个生成的」：作品说明是基于哪一段引导内容画出来的。
  // 回溯锚点的真实回答文本：REPEAT 收敛轮的回应仅一句引导语
  // （CR-56，无内容信息）——连续回溯【跳过 ≤60 字引导语链】，
  // 直到最近的真实回答（与蒸馏原料同源；曾只回溯一条，连续
  // 「画成图片」时命中相邻引导语——CR-58）。
  const resolveStageSourceText = useCallback(
    (anchorId: number | undefined): string | null => {
      if (anchorId === undefined) return null;
      const anchorIndex = messages.findIndex((item) => item.id === anchorId);
      if (anchorIndex < 0) return null;
      const anchorText = messages[anchorIndex]?.text?.trim();
      if (!anchorText) return null;
      if (anchorText.length > 60) return anchorText;
      for (let index = anchorIndex - 1; index >= 0; index -= 1) {
        const previous = messages[index];
        if (previous.role !== 'assistant') continue;
        const text = previous.text?.trim();
        if (text && text.length > 60) return text;
      }
      // 无真实回答可回溯：退回锚点自身（至少不留空）。
      return anchorText;
    },
    [messages],
  );
  const stageSource = useMemo(() => {
    const sourceText = resolveStageSourceText(stageArtifact?.anchor);
    if (!sourceText) return null;
    return sourceText.length > 24 ? `${sourceText.slice(0, 24)}…` : sourceText;
  }, [stageArtifact, resolveStageSourceText]);
  const stageIndex = stageArtifact
    ? completedArtifacts.findIndex((item) => item.id === stageArtifact.id)
    : -1;

  // 舞台键盘翻页（← / →——多轮作品回看不打断手位）。
  useEffect(() => {
    if (stageView !== 'single' || completedArtifacts.length < 2) return;
    const onStageKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
      ) {
        return;
      }
      event.preventDefault();
      const next =
        event.key === 'ArrowLeft' ? stageIndex - 1 : stageIndex + 1;
      if (next >= 0 && next < completedArtifacts.length) {
        setStageGenId(completedArtifacts[next].id);
      }
    };
    window.addEventListener('keydown', onStageKey);
    return () => window.removeEventListener('keydown', onStageKey);
  }, [stageView, stageIndex, completedArtifacts]);

  // 新产物落地即自动上舞台（新鲜产物第一时间可见）。
  const latestCompletedId =
    completedArtifacts.length > 0
      ? completedArtifacts[completedArtifacts.length - 1].id
      : null;
  useEffect(() => {
    if (latestCompletedId !== null) {
      setStageGenId(latestCompletedId);
    }
  }, [latestCompletedId]);

  // 情境建议（最多三个 + 完成信号）：动作坞曾是七钮墙——
  // 每一个都要用户理解，违背「不用想太多」的入口承诺。
  // 现在按会话阶段给最相关的三个，其余交给自由输入。
  const dockActions = useMemo<DockAction[]>(() => {
    // 「画成图片」在三态都提供——把本轮回答画出来是多轮
    // 表达最自然的下一步（REPEAT 链路——回答先呈现，流末
    // 以主题蒸馏成图）。叙事推进类输入（第N集…）不带生成
    // 动词时不触发，此 chip 即明确的补位入口。
    if (sessionState.stage === 'CREATION') {
      return [
        { label: '简化', input: '简化' },
        { label: '换角度', input: '换角度' },
        { label: '画成图片', input: '用图片展现刚才的内容' },
        { label: '好了', input: '好了' },
      ];
    }
    const list: DockAction[] = [];
    if (branchActive) {
      // 分支会话中：采用 / 返回是当前最有价值的动作。
      const activeBranch = branches.find(
        (branch) => branch.lifecycle === 'ACTIVE',
      );
      if (activeBranch) {
        list.push({
          label: `采用分支${activeBranch.ordinal}`,
          input: `如果采用分支${activeBranch.ordinal}`,
        });
      }
      list.push({ label: '返回主线', input: '如果返回主线' });
    } else {
      list.push({ label: '深入一点', input: '深入一点' });
      if (sessionState.status !== 'WAITING') {
        list.push({ label: '如果…会怎样', input: '如果会怎样' });
      }
    }
    list.push({ label: '画成图片', input: '用图片展现刚才的内容' });
    list.push({ label: '好了', input: '好了' });
    return list;
    // status 参与「如果…会怎样」可见性——依赖必须含 status。
  }, [sessionState.stage, sessionState.status, branchActive, branches]);

  // 详情面板互斥（同时至多开一个——头部入口不叠层）。
  const toggleBranchPanel = useCallback(() => {
    setBranchPanelOpen((open) => {
      if (!open) setMemoryPanelOpen(false);
      return !open;
    });
    void refreshSimulation();
  }, [refreshSimulation]);

  const toggleMemoryPanel = useCallback(() => {
    setMemoryPanelOpen((open) => {
      if (!open) setBranchPanelOpen(false);
      return !open;
    });
    void refreshMemory();
  }, [refreshMemory]);

  // ④ 连续体验：体验完成时推荐关联体验（同分类优先 → 同标签 → 其余）。
  const relatedExperiences = useMemo(() => {
    if (!onExploreMore) return [];
    const currentId = session.experienceId;
    const current = EXPERIENCE_CATALOG.find((seed) => seed.id === currentId);
    const candidates = EXPERIENCE_CATALOG.filter((seed) => seed.id !== currentId);
    const byCategory = current
      ? candidates.filter((seed) => seed.category === current.category)
      : [];
    const byTags = current
      ? candidates.filter((seed) =>
          seed.tags.some((tag) => current.tags.includes(tag)),
        )
      : [];
    const ranked = [...byCategory, ...byTags.filter((seed) => !byCategory.includes(seed))];
    const rest = candidates.filter((seed) => !ranked.includes(seed));
    return [...ranked, ...rest].slice(0, 3);
  }, [session.experienceId, onExploreMore]);

  const submit = () => {
    const input = draft.trim();
    if (input.length === 0) return;
    void send(input);
  };

  return (
    <main className="experience">
      <header className="experience-header">
        <button type="button" className="back-button" onClick={onExit}>
          <ArrowLeftIcon size={16} /> 返回
        </button>
        <div className="header-tools">
          <button
            type="button"
            className={`tool-button${branchPanelOpen ? ' is-open' : ''}`}
            onClick={toggleBranchPanel}
            title="分支模拟——问「如果…会怎样」产生分支"
          >
            <BranchIcon size={13} />
            <span>分支{roundCount > 0 ? ` · ${roundCount}` : ''}</span>
          </button>
          <button
            type="button"
            className={`tool-button${memoryPanelOpen ? ' is-open' : ''}`}
            onClick={toggleMemoryPanel}
            title="会话记忆"
          >
            <DatabaseIcon size={13} />
            <span>记忆{memories.length > 0 ? ` · ${memories.length}` : ''}</span>
          </button>
        </div>
      </header>

      <StageRail status={sessionState.status} stage={sessionState.stage} />

      <div className="experience-body">
        <section className="chat-column">
      <div
        ref={conversationRef}
        className="conversation"
        onScroll={handleConversationScroll}
      >
        {messages.length === 0 && !pending && (
          <p className="conversation-empty">开始你的探索。</p>
        )}
        {messages.map((message) => (
          <MessageFlow
            key={message.id}
            message={message}
            items={generationsByAnchor.get(message.id)}
            onStage={stageGenId}
            pending={pending}
            onSelectStage={setStageGenId}
            onRegen={(prompt) => void send(prompt)}
          />
        ))}

        {/* ② 体验收尾闭环 + ④ 连续体验：会话完成（STOP/好了）时收束，并推荐关联体验 */}
        {onExploreMore && sessionState.status === 'COMPLETED' && (
          <div className="wrapup">
            <p className="wrapup-title">这次探索告一段落</p>
            <p className="wrapup-note">想带走什么，或接着往哪走？</p>
            {relatedExperiences.length > 0 && (
              <div className="wrapup-more">
                <span className="wrapup-more-label">接下来，去看看</span>
                <div className="wrapup-more-list">
                  {relatedExperiences.map((seed) => (
                    <button
                      key={seed.id}
                      type="button"
                      className="wrapup-more-item"
                      onClick={() => onExploreMore(seed)}
                    >
                      <span className="wrapup-more-cat">
                        {CATEGORY_LABELS[seed.category]}
                      </span>
                      <span className="wrapup-more-title">{seed.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button type="button" className="wrapup-exit" onClick={onExit}>
              完成并返回首页
            </button>
          </div>
        )}
      </div>

      {(branchPanelOpen || memoryPanelOpen) && (
        <div className="panel-popover">
          {branchPanelOpen && (
            <section className="panel">
              {branches.length === 0 ? (
                <p className="panel-empty">还没有分支——问一句「如果…会怎样」开始模拟。</p>
              ) : (
                <ul className="branch-list">
                  {branches.map((branch) => (
                    <li key={branch.branchId} className="branch-item">
                      <span className="branch-name">分支{branch.ordinal}</span>
                      <span className="branch-meta">
                        {branch.lifecycle === 'ACTIVE' && (branch.adopted ? '已采用' : '进行中')}
                        {branch.lifecycle === 'RETURNED' ? '已返回主线' : ''}
                        {branch.lifecycle === 'ABANDONED' ? '已放弃' : ''}
                        {' · '}
                        {branch.rounds} 轮
                      </span>
                      {currentBranchId === branch.branchId && (
                        <span className="branch-current">当前</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {memoryPanelOpen && (
            <section className="panel">
              {memories.length === 0 ? (
                <p className="panel-empty">还没有记忆——探索中产生的显式表达会登记在这里。</p>
              ) : (
                <ul className="memory-list">
                  {memories.map((memory, index) => (
                    <li key={index} className="memory-item">
                      <span className="memory-topic">{memory.topic}</span>
                      <span className="memory-meta">
                        {memory.memoryClass === 'long_term' ? '长期' : '短期'} · 置信 {memory.confidence.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      <div className="dock">
        {dockActions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="dock-action"
            disabled={pending}
            onClick={() => void send(action.input)}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="free-entry">
        {paramsOpen && (
          <div className="params-popover">
            <div className="params-popover-row">
              <span className="creation-params-label">画幅</span>
              {ASPECT_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  className={`param-chip${aspect === choice.value ? ' is-active' : ''}`}
                  onClick={() => setAspect(choice.value)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <div className="params-popover-row">
              <span className="creation-params-label">时长</span>
              {DURATION_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  className={`param-chip${duration === choice.value ? ' is-active' : ''}`}
                  onClick={() => setDuration(choice.value)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="params-popover-hint">仅影响下一次图像 / 视频生成；「自动」跟随提供方默认。</p>
          </div>
        )}
        {initialRefs !== undefined && initialRefs.length > 0 && (
          <p className="ref-continue-banner">
            已带入 {initialRefs.length} 张参考图——正在基于它继续创作，可随时停止
          </p>
        )}
        {pendingRefs.length > 0 && (
          <div className="ref-thumbs">
            {pendingRefs.map((uri, index) => (
              <span key={index} className="ref-thumb">
                <img src={uri} alt={`参考图${index + 1}`} />
                <button
                  type="button"
                  className="ref-thumb-remove"
                  onClick={() =>
                    setPendingRefs((prev) => prev.filter((_, i) => i !== index))
                  }
                  aria-label="移除参考图"
                >
                  ×
                </button>
              </span>
            ))}
            <span className="ref-thumbs-hint">参考图——下一条消息生成将与其保持一致</span>
          </div>
        )}
        <textarea
          className="free-entry-input"
          rows={2}
          placeholder="直接告诉我……"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="free-entry-actions">
          <button
            type="button"
            className={`ref-attach${pendingRefs.length > 0 ? ' is-set' : ''}`}
            onClick={() => refInputRef.current?.click()}
            title="添加参考图（≤3 张，下一条消息生成与其保持一致）"
          >
            参考图{pendingRefs.length > 0 ? ` ${pendingRefs.length}` : ''}
          </button>
          <input
            ref={refInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              void handleReferenceFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className={`params-toggle${aspect !== 'auto' || duration !== 'auto' ? ' is-set' : ''}`}
            onClick={() => setParamsOpen((open) => !open)}
            title="画幅 / 时长（图像与视频生成参数）"
          >
            画幅 {aspect === 'auto' ? '自动' : aspect} · 时长{' '}
            {duration === 'auto' ? '自动' : `${duration}s`}
          </button>
          <span className="free-entry-hint">
            {pending ? '生成中…可随时停止' : '随时退出：好了'}
          </span>
          {pending ? (
            <button
              type="button"
              className="send-button send-button-stop"
              onClick={stopStreaming}
              disabled={!pending}
              aria-label="停止生成"
              title="停止这一轮生成"
            >
              <XIcon size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="send-button"
              onClick={submit}
              disabled={draft.trim().length === 0}
              aria-label="发送"
            >
              <SendIcon size={16} />
            </button>
          )}
        </div>
        </div>
        </section>

        <aside className="stage-pane" aria-label="产物舞台">
          {pendingGeneration || pending ? (
            <div className="stage-progress">
              <span className="gen-pending-dot" aria-hidden="true" />
              <span>
                {pendingGeneration
                  ? pendingGeneration.modality === 'video'
                    ? `正在生成视频${
                        pendingGeneration.progress != null
                          ? ` · ${Math.round(pendingGeneration.progress)}%`
                          : ''
                      }…`
                    : `正在生成${
                        GENERATION_MODALITY_LABELS[pendingGeneration.modality]
                      }…（已等待 ${elapsedSeconds} 秒）`
                  : `正在处理…（已等待 ${elapsedSeconds} 秒）`}
              </span>
            </div>
          ) : null}
          {stageArtifact ? (
            stageView === 'grid' ? (
              <>
                <div className="stage-toolbar">
                  <span className="stage-count">
                    作品集 · {completedArtifacts.length} 件
                  </span>
                  <button
                    type="button"
                    className="stage-nav-btn"
                    onClick={() => setStageView('single')}
                  >
                    返回单幅
                  </button>
                </div>
                <div className="stage-grid">
                  {completedArtifacts.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className="stage-grid-item"
                      onClick={() => {
                        setStageGenId(item.id);
                        setStageView('single');
                      }}
                      title={item.prompt}
                    >
                      {item.modality === 'image' ? (
                        <img src={item.dataUri ?? item.url} alt="" />
                      ) : item.modality === 'video' ? (
                        <VideoIcon size={20} />
                      ) : (
                        <MicIcon size={20} />
                      )}
                      <span className="stage-grid-badge">
                        {item.label ?? `第${index + 1}轮`}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="stage-toolbar">
                  <span className="stage-count">
                    作品 {stageIndex + 1} / {completedArtifacts.length}
                  </span>
                  <div className="stage-nav">
                    <button
                      type="button"
                      className="stage-nav-btn"
                      onClick={() =>
                        setStageGenId(
                          completedArtifacts[stageIndex - 1]?.id ?? stageGenId,
                        )
                      }
                      disabled={stageIndex <= 0}
                      title="上一件"
                    >
                      <ArrowLeftIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="stage-nav-btn"
                      onClick={() =>
                        setStageGenId(
                          completedArtifacts[stageIndex + 1]?.id ?? stageGenId,
                        )
                      }
                      disabled={stageIndex >= completedArtifacts.length - 1}
                      title="下一件"
                    >
                      <ArrowRightIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="stage-nav-btn"
                      onClick={() => void generateVideoSeries()}
                      disabled={videoSeriesRunning || pending}
                      title="把本会话的图像作品逐集生成动画——连续剧模式"
                    >
                      {videoSeriesRunning ? '生成中…' : '视频连续剧'}
                    </button>
                    <button
                      type="button"
                      className="stage-nav-btn"
                      onClick={() => setStageView('grid')}
                      title="本会话作品总览"
                    >
                      总览
                    </button>
                  </div>
                </div>
                <div className="stage-media">
                {stageArtifact.modality === 'voice' ? (
                  <div className="stage-voice">
                    <span className="gen-voice-chip" aria-hidden="true">
                      <MicIcon size={22} />
                    </span>
                    <audio
                      controls
                      src={stageArtifact.dataUri ?? stageArtifact.url}
                    />
                  </div>
                ) : stageArtifact.modality === 'video' ? (
                  <video
                    className="stage-media-el"
                    controls
                    src={stageArtifact.dataUri ?? stageArtifact.url}
                  />
                ) : (
                  <a
                    className="stage-media-link"
                    href={stageArtifact.dataUri ?? stageArtifact.url}
                    target="_blank"
                    rel="noreferrer"
                    title="点击查看原图"
                  >
                    <img
                      className="stage-media-el"
                      src={stageArtifact.dataUri ?? stageArtifact.url}
                      alt={stageArtifact.prompt}
                    />
                  </a>
                )}
              </div>
              <div className="stage-caption">
                <span className={`gen-tag gen-tag-${stageArtifact.modality}`}>
                  {GENERATION_MODALITY_LABELS[stageArtifact.modality]}
                </span>
                <span
                  className="stage-caption-text"
                  title={
                    stageArtifact.distilled
                      ? `用户意图：${stageArtifact.prompt}\n\n实际发送给模型的提示词：${stageArtifact.distilled}`
                      : stageArtifact.prompt
                  }
                >
                  {stageArtifact.distilled ??
                    stageArtifact.label ??
                    // 蒸馏失败兜底（CR-58）：用回溯的真实回答片段作
                    // caption——有画面语义，而非无信息的主题句。
                    (() => {
                      const source = resolveStageSourceText(
                        stageArtifact.anchor,
                      );
                      return source && source.length > 60
                        ? `${source.slice(0, 80)}…`
                        : source;
                    })() ??
                    stageArtifact.prompt}
                </span>
                {stageSource && (
                  <span className="stage-caption-source">
                    源自：{stageSource}
                  </span>
                )}
              </div>
              <div className="stage-actions">
                {stageArtifact.modality !== 'voice' && (
                  <a
                    className="gen-download"
                    href={stageArtifact.dataUri ?? stageArtifact.url}
                    download={downloadFileName(stageArtifact)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <DownloadIcon size={13} />
                    <span>
                      {stageArtifact.modality === 'video' ? '下载视频' : '下载图片'}
                    </span>
                  </a>
                )}
                <button
                  type="button"
                  className="gen-regen"
                  onClick={() => void send(stageArtifact.prompt)}
                  disabled={pending}
                  title="同一提示词再生成一次"
                >
                  <RefreshIcon size={13} />
                  <span>再来一次</span>
                </button>
              </div>
              {completedArtifacts.length > 1 && (
                <div className="filmstrip">
                  {completedArtifacts.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`filmstrip-item${stageArtifact.id === item.id ? ' is-active' : ''}`}
                      onClick={() => setStageGenId(item.id)}
                      title={`${item.label ?? `第${index + 1}轮`} · ${item.prompt}`}
                    >
                      {item.modality === 'image' ? (
                        <img src={item.dataUri ?? item.url} alt="" />
                      ) : item.modality === 'video' ? (
                        <VideoIcon size={16} />
                      ) : (
                        <MicIcon size={16} />
                      )}
                      <span className="filmstrip-badge">{index + 1}</span>
                    </button>
                  ))}
                </div>
              )}
              <a
                className="stage-wall-link"
                href="/"
                title="全部作品在首页作品墙——跨会话回看"
              >
                全部作品 · 首页作品墙
              </a>
              </>
            )
          ) : pendingGeneration ? (
            <div className="stage-empty">
              <SparklesIcon size={26} />
              <p className="stage-empty-title">
                {pendingGeneration.modality === 'video'
                  ? `正在生成视频${
                      pendingGeneration.progress != null
                        ? ` · ${Math.round(pendingGeneration.progress)}%`
                        : ''
                    }`
                  : `正在生成${
                      GENERATION_MODALITY_LABELS[pendingGeneration.modality]
                    }…`}
              </p>
              <p className="stage-empty-hint">
                {pendingGeneration.modality === 'video' &&
                pendingGeneration.progress != null
                  ? '生成完成会自动放到这里'
                  : `${
                      pendingGeneration.modality === 'image'
                        ? '图片生成通常需要 10~30 秒'
                        : '生成完成会自动放到这里'
                    }（已等待 ${elapsedSeconds} 秒）`}
              </p>
            </div>
          ) : pending ? (
            // 发送→generation started 之间的过渡：不显示空白空态。
            <div className="stage-empty">
              <SparklesIcon size={26} />
              <p className="stage-empty-title">正在处理…</p>
              <p className="stage-empty-hint">
                已等待 {elapsedSeconds} 秒，马上就好
              </p>
            </div>
          ) : (
            <div className="stage-empty">
              <SparklesIcon size={26} />
              <p className="stage-empty-title">产物舞台</p>
              <p className="stage-empty-hint">
                聊到这里，说「画一张……」或「用视频展现」——
                <br />
                生成的作品会出现在这里。
              </p>
            </div>
          )}
          {seriesPlan && (
            <div className="series-panel">
              <div className="series-panel-head">
                系列 · {seriesPlan.title}
              </div>
              {seriesPlan.characters.length > 0 && (
                <div className="series-characters">
                  {seriesPlan.characters.map((character) => (
                    <div key={character.name} className="series-character">
                      <span className="series-character-name">
                        {character.name}
                      </span>
                      <span className="series-character-design">
                        {character.design}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="series-episodes">
                {seriesPlan.episodes.map((episode, index) => {
                  const episodeGen = generations.find((item) =>
                    item.label?.startsWith(`第${index + 1}集`),
                  );
                  return (
                    <div key={index} className="series-episode">
                      <span className="series-episode-num">
                        第{index + 1}集
                      </span>
                      <span className="series-episode-title">
                        {episode.title}
                      </span>
                      {episodeGen?.status === 'pending' ? (
                        <span className="series-episode-state">
                          生成中…
                        </span>
                      ) : episodeGen?.status === 'completed' ? (
                        <button
                          type="button"
                          className="series-episode-view"
                          onClick={() => setStageGenId(episodeGen.id)}
                        >
                          查看
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="series-episode-gen"
                          onClick={() => void generateEpisode(index)}
                          disabled={pending}
                        >
                          {episodeGen?.status === 'failed'
                            ? '重生成'
                            : '生成本集'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
