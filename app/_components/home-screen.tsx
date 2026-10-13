import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import {
  ArrowRightIcon,
  CompassIcon,
  EditIcon,
  MicIcon,
  MoonIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  ShuffleIcon,
  SparklesIcon,
  HistoryIcon,
  ImageIcon,
  VideoIcon,
  TrashIcon,
  XIcon,
  LogoMark,
} from './icons';
import { creationSrc, timeAgo, type CreationEntry } from './creations';
import {
  EXPERIENCE_CATALOG,
  type ExperienceSeed,
  type ExperienceCategory,
} from '../../src/experience/catalog';

export interface RecentEntry {
  experienceId: string;
  sessionId: string;
  stateVersion: number;
  topic: string;
  at: string;
  /** 上次会话停驻的阶段（续讲感知——chip 显示「上次停在哪」）。 */
  stage?: string;
}

// 状态入口（Screen 01 低成本选择——用户只回答「我现在比较像哪一种」，
// 点击即进入该类别的一个体验：不用费脑子）。
const STATE_CHOICES: {
  icon: ComponentType<{ size?: number }>;
  label: string;
  category: ExperienceCategory;
}[] = [
  { icon: MoonIcon, label: '放松一下', category: 'relax' },
  { icon: CompassIcon, label: '发现点东西', category: 'discover' },
  { icon: SearchIcon, label: '深入一个问题', category: 'deep' },
  { icon: EditIcon, label: '做点什么', category: 'create' },
  { icon: ShuffleIcon, label: '随便看看', category: 'wild' },
];

// 续讲感知：会话阶段 → 中文短标签（「上次停在 X」）。
const STAGE_LABELS: Record<string, string> = {
  CURIOSITY: '好奇',
  UNDERSTANDING: '理解',
  SIMULATION: '模拟',
  CREATION: '创作',
  COMPLETION: '完成',
  READY: '准备',
  ACTIVE: '进行中',
  ENTERING: '进入',
  WAITING: '等待',
};

// 「此刻」脉搏已按 V1.1 移除（首页不做社交暗示、其他全部弱化）。

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

interface HomeScreenProps {
  recents: RecentEntry[];
  creations: CreationEntry[];
  onStart: (input: string) => void;
  /** 有策展的体验入口（点卡片 / 今日精选 / 惊喜）→ 先进第一体验入口屏（Screen 03）。 */
  onEnter: (seed: ExperienceSeed) => void;
  onResume: (recent: RecentEntry) => void;
  onDeleteCreation: (entry: CreationEntry) => void;
  onContinueCreation: (entry: CreationEntry) => void;
}

const CREATION_MODALITY_LABELS: Record<CreationEntry['modality'], string> = {
  image: '图像',
  voice: '语音',
  video: '视频',
};

// 作品墙分页粒度。
const WALL_PAGE_SIZE = 12;

// 自由入口（V1.1 §1.5）：不要像搜索框——「把脑子里现在想到的东西扔给我」。
const COMPOSER_PLACEHOLDER = '直接告诉我，现在脑子里在想什么？';

interface LightboxState {
  src: string;
  modality: CreationEntry['modality'];
  prompt: string;
  caption?: string;
}

export function HomeScreen({
  recents,
  creations,
  onStart,
  onEnter,
  onResume,
  onDeleteCreation,
  onContinueCreation,
}: HomeScreenProps) {
  const [draft, setDraft] = useState('');
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  // 作品墙模态筛选 + 分页（专业作品库——服务端全量在手，
  // 展示按 12 件一页渐进加载）。
  const [wallFilter, setWallFilter] = useState<'all' | CreationEntry['modality']>('all');
  const [wallLimit, setWallLimit] = useState(WALL_PAGE_SIZE);
  // Screen 01 首屏：三层视觉层级常驻（当前状态 → 低成本选择 → 自由入口）。
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // ③ 记忆可见化：首页"我记得你"总览——把系统跨体验记住的理解
  // 呈现给用户看（信任增益，且可纠正）。数据来自 /api/memory（全局记忆）。
  const [globalMemories, setGlobalMemories] = useState<
    { topic: string; memory_class: string; confidence: number; source: string }[]
  >([]);
  const [memoryOpen, setMemoryOpen] = useState(false);

  // 拉取全局记忆快照（只读 Query 路由）。
  useEffect(() => {
    let cancelled = false;
    fetch('/api/memory')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.records)) {
          setGlobalMemories(data.records);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 老用户 = 有历史（最近探索或作品）→ 首页可带记忆/作品/最近探索；
  // 新用户聚焦三层首屏。
  const isReturning = recents.length > 0 || creations.length > 0;

  // Lightbox：Esc 关闭。
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const submit = () => {
    const input = draft.trim();
    if (input.length === 0) return;
    setDraft('');
    if (composerRef.current) composerRef.current.style.height = 'auto';
    onStart(input);
  };

  // 惊喜一下：随机挑一个体验立即进入入口屏——
  // 发现成本为零，liblib 式惊喜入口。
  const surprise = () => {
    const seed =
      EXPERIENCE_CATALOG[
        Math.floor(Math.random() * EXPERIENCE_CATALOG.length)
      ];
    onEnter(seed);
  };

  // 低成本选择：点状态入口 → 该类别随机一个体验直接进入
  // （V1.1：五种入口不同，但都不要求用户再选）。
  const enterCategory = (category: ExperienceCategory) => {
    const pool = EXPERIENCE_CATALOG.filter((seed) => seed.category === category);
    const candidates = pool.length > 0 ? pool : EXPERIENCE_CATALOG;
    onEnter(candidates[Math.floor(Math.random() * candidates.length)]);
  };

  const resizeComposer = () => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 96)}px`;
  };

  // 作品库：模态计数 + 筛选 + 分页切片。
  const modalityCounts = useMemo(() => {
    const counts: Record<'all' | CreationEntry['modality'], number> = {
      all: creations.length,
      image: 0,
      voice: 0,
      video: 0,
    };
    for (const creation of creations) counts[creation.modality] += 1;
    return counts;
  }, [creations]);

  const filteredCreations =
    wallFilter === 'all'
      ? creations
      : creations.filter((creation) => creation.modality === wallFilter);
  const visibleCreations = filteredCreations.slice(0, wallLimit);

  const openCreation = (creation: CreationEntry) => {
    const src = creationSrc(creation);
    if (src === undefined || creation.modality === 'voice') return;
    setLightbox({
      src,
      modality: creation.modality,
      prompt: creation.prompt,
      ...(creation.caption !== undefined ? { caption: creation.caption } : {}),
    });
  };

  return (
    <main className="home">
      <nav className="topbar">
        <span className="brand">
          <LogoMark size={22} />
          <span className="wordmark">个人体验引擎</span>
        </span>
        <a className="config-link" href="/config">
          <SettingsIcon size={14} /> 模型配置
        </a>
        <a className="config-link" href="/create">
          <VideoIcon size={14} /> 创作工作台
        </a>
      </nav>

      <header className="home-hero">
        <h1 className="home-title">
          {greeting()}，<span className="home-title-accent">现在想要什么？</span>
        </h1>
        <p className="home-sub">不用想太多——选一个像你现在的样子。</p>
        <div className="state-row">
          {STATE_CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              className="state-chip"
              onClick={() => enterCategory(choice.category)}
            >
              <choice.icon size={16} />
              <span>{choice.label}</span>
            </button>
          ))}
          <button
            type="button"
            className="surprise-button"
            onClick={surprise}
          >
            <SparklesIcon size={15} />
            <span>惊喜一下</span>
          </button>
        </div>
      </header>

      {isReturning && globalMemories.length > 0 && (
        <section className="memory-overview">
          <button
            type="button"
            className="memory-overview-trigger"
            onClick={() => setMemoryOpen((open) => !open)}
            aria-expanded={memoryOpen}
          >
            <span className="memory-overview-label">我记得你</span>
            <span className="memory-overview-count">
              {globalMemories.filter((m) => m.memory_class === 'long_term').length} 项长期理解
              · {globalMemories.length} 条记忆
            </span>
            <span className="memory-overview-caret">{memoryOpen ? '收起' : '展开'}</span>
          </button>
          {memoryOpen && (
            <div className="memory-overview-panel">
              <p className="memory-overview-note">
                这是我对你的理解——说一句，随时纠正或补充。
              </p>
              <ul className="memory-overview-list">
                {globalMemories.map((memory, index) => (
                  <li key={index} className="memory-overview-item">
                    <span className="memory-overview-topic">{memory.topic}</span>
                    <span className="memory-overview-meta">
                      {memory.memory_class === 'long_term' ? '长期' : '短期'}
                      {' · 置信 '}
                      {memory.confidence.toFixed(2)}
                      {' · '}
                      {memory.source === 'explicit'
                        ? '你告诉我的'
                        : memory.source === 'user_correction'
                          ? '你纠正的'
                          : '我观察的'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* V1.1：首页不做信息流——「推荐/热门/最新」与社交脉搏已移除，
          第一屏只保留三层视觉层级；体验入口即状态选择或自由输入。 */}

      {creations.length > 0 && (
        <section className="creations">
          <div className="creations-head">
            <h2 className="creations-title">
              我的作品
              <span className="creations-count">{creations.length}</span>
            </h2>
            <div className="wall-filters">
              {(
                [
                  { value: 'all', label: '全部' },
                  { value: 'image', label: '图像' },
                  { value: 'video', label: '视频' },
                  { value: 'voice', label: '语音' },
                ] as const
              )
                .filter((item) => item.value === 'all' || modalityCounts[item.value] > 0)
                .map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`param-chip${wallFilter === item.value ? ' is-active' : ''}`}
                    onClick={() => {
                      setWallFilter(item.value);
                      setWallLimit(WALL_PAGE_SIZE);
                    }}
                  >
                    {item.label}
                    <span className="param-chip-count">{modalityCounts[item.value]}</span>
                  </button>
                ))}
            </div>
          </div>
          <div className="creations-wall">
            {visibleCreations.map((creation) => {
              const src = creationSrc(creation);
              return (
                <article key={creation.id} className="creation-card">
                  {creation.modality === 'image' && src !== undefined && (
                    <button
                      type="button"
                      className="creation-media"
                      onClick={() => openCreation(creation)}
                      title="点击放大查看"
                    >
                      <img
                        src={src}
                        alt={creation.caption ?? creation.prompt}
                        loading="lazy"
                      />
                    </button>
                  )}
                  {creation.modality === 'video' && src !== undefined && (
                    <button
                      type="button"
                      className="creation-media"
                      onClick={() => openCreation(creation)}
                      title="点击播放"
                    >
                      <video muted playsInline preload="metadata" src={src} />
                      <span className="creation-play" aria-hidden="true">
                        <VideoIcon size={16} />
                      </span>
                    </button>
                  )}
                  {creation.modality === 'voice' && src !== undefined && (
                    <div className="creation-media creation-voice">
                      <MicIcon size={18} />
                      <audio controls src={src} />
                    </div>
                  )}
                  <div className="creation-hover">
                    <p
                      className="creation-prompt"
                      title={creation.caption !== undefined ? `${creation.prompt}\n（画面：${creation.caption}）` : creation.prompt}
                    >
                      {creation.caption ?? creation.prompt}
                    </p>
                    <div className="creation-meta">
                      <span className={`gen-tag gen-tag-${creation.modality}`}>
                        {CREATION_MODALITY_LABELS[creation.modality]}
                      </span>
                      <span className="creation-time">{timeAgo(creation.at)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="creation-continue"
                    title="以此为参考继续创作"
                    onClick={(event) => {
                      event.stopPropagation();
                      onContinueCreation(creation);
                    }}
                  >
                    <SparklesIcon size={12} />
                    <span>续作</span>
                  </button>
                  <button
                    type="button"
                    className="creation-delete"
                    aria-label="删除作品"
                    title="删除作品"
                    onClick={() => onDeleteCreation(creation)}
                  >
                    <TrashIcon size={13} />
                  </button>
                </article>
              );
            })}
          </div>
          {visibleCreations.length === 0 && (
            <p className="wall-empty">这个模态还没有作品——换个筛选，或直接创作一个。</p>
          )}
          {filteredCreations.length > wallLimit && (
            <div className="wall-more-row">
              <button
                type="button"
                className="wall-more"
                onClick={() => setWallLimit((limit) => limit + WALL_PAGE_SIZE)}
              >
                加载更多
                <span className="wall-more-count">
                  还有 {filteredCreations.length - wallLimit} 件
                </span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* 最近探索（V1.1 §1.4）：最多一条——「昨天停在：X 继续探索 →」。 */}
      {recents.length > 0 && (
        <section className="recents">
          <h2 className="recents-title">继续探索</h2>
          <button
            type="button"
            className="recent-chip recent-chip-last"
            onClick={() => onResume(recents[0])}
          >
            <HistoryIcon size={13} />
            <span className="recent-chip-main">
              <span className="recent-chip-text">{recents[0].topic}</span>
              {recents[0].stage && (
                <span className="recent-chip-sub">
                  上次停在 {STAGE_LABELS[recents[0].stage] ?? '途中'} · {timeAgo(recents[0].at) || '刚刚'}
                </span>
              )}
            </span>
            <span className="recent-chip-cta">
              继续探索 <ArrowRightIcon size={14} />
            </span>
          </button>
        </section>
      )}

      {/* 悬浮创作条——liblib 式永在入口，居中胶囊随滚动常驻。 */}
      <div className="composer-dock">
        <textarea
          ref={composerRef}
          className="composer-input"
          rows={1}
          placeholder={COMPOSER_PLACEHOLDER}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            resizeComposer();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          className="composer-send"
          onClick={submit}
          disabled={draft.trim().length === 0}
          aria-label="发送"
        >
          <SendIcon size={15} />
        </button>
      </div>

      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="作品查看"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="lightbox-close"
            aria-label="关闭"
            onClick={() => setLightbox(null)}
          >
            <XIcon size={18} />
          </button>
          <div
            className="lightbox-body"
            onClick={(event) => event.stopPropagation()}
          >
            {lightbox.modality === 'video' ? (
              <video controls autoPlay src={lightbox.src} />
            ) : (
              <img src={lightbox.src} alt={lightbox.caption ?? lightbox.prompt} />
            )}
            {lightbox.caption !== undefined && (
              <p className="lightbox-caption">{lightbox.caption}</p>
            )}
            <p className="lightbox-prompt">{lightbox.prompt}</p>
            <div
              className="lightbox-actions"
              onClick={(event) => event.stopPropagation()}
            >
              <a
                className="lightbox-action"
                href={lightbox.src}
                download={`creation.${lightbox.modality === 'video' ? 'mp4' : 'png'}`}
                target="_blank"
                rel="noreferrer"
              >
                下载
              </a>
              <button
                type="button"
                className="lightbox-action lightbox-action-primary"
                onClick={() => {
                  const prompt = lightbox.prompt;
                  setLightbox(null);
                  onStart(prompt);
                }}
              >
                再做一次
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
