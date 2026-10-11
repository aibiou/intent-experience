'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  BranchIcon,
  DatabaseIcon,
  SendIcon,
} from './icons';
import { RefreshIcon } from './icons';
import { StageRail } from './stage-rail';
import type { RecentEntry } from './home-screen';
import { creationId, type CreationEntry } from './creations';

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
}

const GENERATION_MODALITY_LABELS: Record<GenerationState['modality'], string> = {
  image: '图像',
  video: '视频',
  voice: '语音',
};

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

interface ExperienceScreenProps {
  session: SessionState;
  initialInput?: string;
  resume?: boolean;
  mode: 'synthetic' | 'provider';
  providerLabel?: string;
  onSessionUpdate: (session: SessionState) => void;
  onRecent: (entry: RecentEntry) => void;
  onExit: () => void;
  /** 生成完成回调——作品持久化（首页作品墙）。 */
  onCreation?: (entry: CreationEntry) => void;
}

export function ExperienceScreen({
  session,
  initialInput,
  resume,
  mode,
  providerLabel,
  onSessionUpdate,
  onRecent,
  onExit,
  onCreation,
}: ExperienceScreenProps) {
  const [sessionState, setSessionState] = useState<SessionState>(session);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [branchPanelOpen, setBranchPanelOpen] = useState(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [roundCount, setRoundCount] = useState(0);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryInfo[]>([]);
  const [generations, setGenerations] = useState<GenerationState[]>([]);

  const sessionRef = useRef(session);
  const idCounter = useRef(0);
  const sendingRef = useRef(false);
  const startedRef = useRef(false);
  // 各模态本轮生成的提示词——完成事件不携带
  // 提示词，作品持久化需要它（started 时记录）。
  const pendingPromptRef = useRef(new Map<string, string>());
  const conversationRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  const nextId = () => (idCounter.current += 1);

  const applyGenerationEvent = useCallback((event: Record<string, unknown>) => {
    const status = String(event.status ?? '');
    const modality = String(event.modality ?? '') as GenerationState['modality'];
    if (status === 'started') {
      pendingPromptRef.current.set(modality, String(event.prompt ?? ''));
      setGenerations((prev) => [
        ...prev,
        {
          id: nextId(),
          modality,
          status: 'pending',
          prompt: String(event.prompt ?? ''),
        },
      ]);
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
    },
    [onSessionUpdate],
  );

  const resyncState = useCallback(async () => {
    const experienceId = sessionRef.current.experienceId;
    if (!experienceId) return;
    try {
      const response = await fetch(`/api/experience/${experienceId}/state`);
      if (!response.ok) return;
      const data = await response.json();
      applySession({
        ...sessionRef.current,
        stateVersion: data.state_version,
        status: data.state?.status ?? sessionRef.current.status,
        stage: data.state?.stage ?? sessionRef.current.stage,
      });
    } catch {
      // 状态同步失败时保持本地状态——下次提交携带本地版本
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

      try {
        const response = await fetch('/api/experience/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok || !response.body) {
          let errorMessage = `出错了（HTTP ${response.status}）`;
          try {
            const data = (await response.json()) as Record<string, unknown>;
            if (data.code === 'INVALID_ACTION') {
              errorMessage = '这个问题我还不确定怎么接——换个说法，或选一个方向。';
            } else if (
              typeof data.message === 'string' &&
              data.message.startsWith('unknown session')
            ) {
              // dev 服务器完整重启后内存会话清空（热重载已由
              // globalThis 单例挡住——此条仅兜底完整重启）。
              errorMessage = '服务刚重启过，这段体验的会话已失效——返回首页重新开始即可。';
            } else if (typeof data.message === 'string') {
              errorMessage = data.message;
            }
          } catch {
            // 非 JSON 错误体——使用默认文案
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
                if (isFirst) {
                  onRecent({
                    experienceId: String(event.experience_id),
                    sessionId: sessionRef.current.sessionId,
                    stateVersion: Number(event.state_version),
                    topic: rawInput.slice(0, 40),
                    at: new Date().toISOString(),
                  });
                }
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
            }
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'system', text: '连接中断了——请再试一次。' },
        ]);
      } finally {
        sendingRef.current = false;
        setPending(false);
      }
    },
    [applySession, onRecent, resyncState, refreshPanels],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialInput) {
      void send(initialInput, true);
    } else if (resume) {
      void send('继续');
    }
  }, [initialInput, resume, send]);

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
  }, [messages]);

  const branchActive = currentBranchId !== null;

  const dockActions = useMemo<DockAction[]>(() => {
    const list: DockAction[] = [];
    if (sessionState.stage === 'CREATION') {
      list.push({ label: '简化', input: '简化' });
      list.push({ label: '换角度', input: '换角度' });
      list.push({ label: '做个小游戏', input: '做个小游戏' });
    } else {
      list.push({ label: '为什么', input: '为什么' });
      list.push({ label: '如果…会怎样', input: '如果会怎样' });
      list.push({ label: '深入一点', input: '深入一点' });
    }
    if (branchActive) {
      branches
        .filter((branch) => branch.lifecycle === 'ACTIVE')
        .slice(0, 3)
        .forEach((branch) => {
          list.push({
            label: `采用分支${branch.ordinal}`,
            input: `如果采用分支${branch.ordinal}`,
          });
        });
      list.push({ label: '返回主线', input: '如果返回主线' });
    }
    list.push({ label: '换一个', input: '换一个' });
    list.push({ label: '继续', input: '继续' });
    list.push({ label: '重复上一条', input: '重复上一条' });
    list.push({ label: '好了', input: '好了' });
    return list;
  }, [sessionState.stage, branchActive, branches]);

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
        <StageRail stage={sessionState.stage} branchActive={branchActive} />
        <span className={`mode-badge mode-${mode}`}>
          {mode === 'provider' ? `模型 ${providerLabel ?? ''}` : '合成演示'}
        </span>
      </header>

      <div
        ref={conversationRef}
        className="conversation"
        onScroll={handleConversationScroll}
      >
        {messages.length === 0 && !pending && (
          <p className="conversation-empty">开始你的探索。</p>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`message message-${message.role}`}>
            {message.role === 'assistant' && message.semanticAction && (
              <span className="message-tag">
                {ACTION_LABELS[message.semanticAction] ?? message.semanticAction}
              </span>
            )}
            <span className={`message-text${message.streaming ? ' is-streaming' : ''}`}>
              {message.text}
              {message.streaming && <span className="stream-cursor" aria-hidden="true" />}
            </span>
          </div>
        ))}
      </div>

      {generations.length > 0 && (
        <section className="generations">
          <h2 className="generations-title">生成物</h2>
          <div className="generations-row">
            {generations.map((item) => (
              <article
                key={item.id}
                className={`gen-card gen-${item.modality} gen-${item.status}`}
              >
                {item.status === 'pending' && (
                  <div className="gen-pending">
                    <span className="gen-pending-dot" aria-hidden="true" />
                    <span>{GENERATION_MODALITY_LABELS[item.modality]}生成中…</span>
                    {typeof item.progress === 'number' && item.progress > 0 && (
                      <span className="gen-progress">
                        <span className="gen-progress-bar">
                          <span
                            className="gen-progress-fill"
                            style={{ width: `${item.progress}%` }}
                          />
                        </span>
                        <span className="gen-progress-num">
                          {item.progress}%
                        </span>
                      </span>
                    )}
                    {typeof item.progress === 'number' && item.progress === 0 && (
                      <span className="gen-queued">排队中</span>
                    )}
                  </div>
                )}
                {item.status === 'completed' &&
                  (item.url !== undefined || item.dataUri !== undefined) &&
                  (item.modality === 'voice' ? (
                    <audio className="gen-audio" controls src={item.dataUri ?? item.url} />
                  ) : item.modality === 'video' ? (
                    <video className="gen-media" controls src={item.dataUri ?? item.url} />
                  ) : (
                    <img className="gen-media" src={item.dataUri ?? item.url} alt={item.prompt} />
                  ))}
                {(item.status === 'unconfigured' || item.status === 'failed') && (
                  <p className="gen-message">{item.message}</p>
                )}
                <footer className="gen-foot">
                  <span className={`gen-tag gen-tag-${item.modality}`}>
                    {GENERATION_MODALITY_LABELS[item.modality]}
                  </span>
                  <span className="gen-prompt" title={item.prompt}>
                    {item.prompt}
                  </span>
                  {item.status === 'completed' && (
                    <button
                      type="button"
                      className="gen-regen"
                      onClick={() => void send(item.prompt)}
                      title="同一提示词再生成一次"
                    >
                      <RefreshIcon size={13} />
                      <span>再来一次</span>
                    </button>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="panels">
        <button
          type="button"
          className={`panel-toggle${branchPanelOpen ? ' is-open' : ''}`}
          onClick={() => {
            const next = !branchPanelOpen;
            setBranchPanelOpen(next);
            if (next) void refreshSimulation();
          }}
        >
          <BranchIcon size={14} /> 分支模拟 {roundCount > 0 ? `· ${roundCount} 轮` : ''}
        </button>
        <button
          type="button"
          className={`panel-toggle${memoryPanelOpen ? ' is-open' : ''}`}
          onClick={() => {
            const next = !memoryPanelOpen;
            setMemoryPanelOpen(next);
            if (next) void refreshMemory();
          }}
        >
          <DatabaseIcon size={14} /> 记忆 {memories.length > 0 ? `· ${memories.length}` : ''}
        </button>
      </div>

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
          <span className="free-entry-hint">{pending ? '生成中…' : '随时退出：好了'}</span>
          <button
            type="button"
            className="send-button"
            onClick={submit}
            disabled={draft.trim().length === 0 || pending}
            aria-label="发送"
          >
            <SendIcon size={16} />
          </button>
        </div>
      </div>
    </main>
  );
}
