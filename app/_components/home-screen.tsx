import { useEffect, useMemo, useState } from 'react';
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
  FlameIcon,
  ClockIcon,
  SparklesIcon,
  HistoryIcon,
  ImageIcon,
  VideoIcon,
} from './icons';
import { creationSrc, timeAgo, type CreationEntry } from './creations';
import { ExperienceCover } from './experience-cover';
import {
  EXPERIENCE_CATALOG,
  CATEGORY_LABELS,
  type ExperienceSeed,
  type ExperienceCategory,
} from '../../src/experience/catalog';

export interface RecentEntry {
  experienceId: string;
  sessionId: string;
  stateVersion: number;
  topic: string;
  at: string;

}

type FeedTab = 'featured' | 'hot' | 'fresh';

// 状态入口（Screen 01 低成本选择——用户只回答「我现在比较像哪一种」）。
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

const TABS: { id: FeedTab; label: string }[] = [
  { id: 'featured', label: '推荐' },
  { id: 'hot', label: '热门' },
  { id: 'fresh', label: '最新' },
];

// 「此刻」脉搏：让首页读起来像有活的社区在运转。
const PULSE_VERBS = ['正在探索', '刚刚进入', '正在深入'];

function dayBucket(): number {
  return Math.floor(Date.now() / 86400000);
}

function rotate<T>(list: T[], offset: number): T[] {
  if (list.length === 0) return list;
  const shift = ((offset % list.length) + list.length) % list.length;
  return [...list.slice(shift), ...list.slice(0, shift)];
}

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
  onResume: (recent: RecentEntry) => void;
}

const CREATION_MODALITY_LABELS: Record<CreationEntry['modality'], string> = {
  image: '图像',
  voice: '语音',
  video: '视频',
};

// 自由输入框轮播提示——多模态能力
// 一目了然，每 4 秒换一条。
const ENTRY_HINTS: readonly string[] = [
  '做个清晨森林的视频……',
  '画一张赛博朋克城市插画……',
  '读一段睡前故事……',
  '写一首关于地铁的诗……',
  '做个极简像素头像……',
];

export function HomeScreen({
  recents,
  creations,
  onStart,
  onResume,
}: HomeScreenProps) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<FeedTab>('featured');
  const [category, setCategory] = useState<ExperienceCategory | null>(null);
  const [pulseIndex, setPulseIndex] = useState(0);
  const [hintIndex, setHintIndex] = useState(0);

  // 脉搏轮转：每 4 秒换一条，像社区的实时感。
  useEffect(() => {
    const timer = setInterval(() => {
      setPulseIndex((index) => index + 1);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // 输入框提示轮播。
  useEffect(() => {
    const timer = setInterval(() => {
      setHintIndex((index) => (index + 1) % ENTRY_HINTS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const catalog = useMemo(() => {
    const base = rotate(EXPERIENCE_CATALOG, dayBucket());
    let list = base;
    if (category) list = list.filter((seed) => seed.category === category);
    const normalized = query.trim().toLowerCase();
    if (normalized) {
      list = list.filter((seed) => {
        const haystack = [seed.title, seed.summary, ...seed.tags, CATEGORY_LABELS[seed.category]]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalized);
      });
    }
    if (tab === 'hot') {
      return [...list].sort((a, b) => b.hot - a.hot);
    }
    if (tab === 'fresh') {
      return [...list].reverse();
    }
    return list;
  }, [query, tab, category]);

  const featured = useMemo(
    () => EXPERIENCE_CATALOG.filter((seed) => seed.featured),
    [],
  );
  const featuredFirst = featured[0];

  const pulseSeed = EXPERIENCE_CATALOG[pulseIndex % EXPERIENCE_CATALOG.length];
  const pulseVerb = PULSE_VERBS[pulseIndex % PULSE_VERBS.length];
  const pulseCount = 2 + (pulseIndex % 5);

  const submit = () => {
    const input = draft.trim();
    if (input.length === 0) return;
    setDraft('');
    onStart(input);
  };

  // 惊喜一下：随机挑一个体验立即开始——
  // 发现成本为零，liblib 式惊喜入口。
  const surprise = () => {
    const seed =
      EXPERIENCE_CATALOG[
        Math.floor(Math.random() * EXPERIENCE_CATALOG.length)
      ];
    onStart(seed.prompt);
  };

  const gridSeeds: ExperienceSeed[] =
    tab === 'featured' && !query && !category
      ? catalog.filter((seed) => seed.id !== featuredFirst.id)
      : catalog;

  const pulseKey = `${pulseVerb}-${pulseSeed.id}-${pulseCount}`;

  return (
    <main className="home">
      <nav className="topbar">
        <span className="wordmark">个人体验引擎</span>
        <div className="searchbar">
          <SearchIcon size={15} />
          <input
            className="searchbar-input"
            type="search"
            placeholder="搜索体验……"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <a className="config-link" href="/config">
          <SettingsIcon size={14} /> 模型配置
        </a>
      </nav>

      <header className="home-hero">
        <h1 className="home-title">{greeting()}，现在想要什么？</h1>
        <p className="home-sub">不用想太多——选一个像你现在的样子。</p>
        <div className="state-row">
          {STATE_CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              className={`state-chip${category === choice.category ? ' is-active' : ''}`}
              onClick={() =>
                setCategory(category === choice.category ? null : choice.category)
              }
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

      <div className="pulse">
        <span className="pulse-dot" aria-hidden="true" />
        <p className="pulse-text" key={pulseKey}>
          此刻有 {pulseCount} 位探索者{pulseVerb}「{pulseSeed.title}」
        </p>
      </div>

      <section className="feed">
        <div className="feed-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`feed-tab${tab === item.id ? ' is-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.id === 'hot' && <FlameIcon size={13} />}
              {item.id === 'fresh' && <ClockIcon size={13} />}
              {item.id === 'featured' && <SparklesIcon size={13} />}
              {item.label}
            </button>
          ))}
          <span className="feed-count">{catalog.length} 个体验</span>
        </div>

        {tab === 'featured' && !query && !category && (
          <button
            type="button"
            className="card card-featured"
            onClick={() => onStart(featuredFirst.prompt)}
          >
            <ExperienceCover seed={featuredFirst} />
            <div className="card-body">
              <div className="card-title-row">
                <h3>{featuredFirst.title}</h3>
                <span className="hot-badge">
                  <FlameIcon size={12} /> {featuredFirst.hot}
                </span>
              </div>
              <p className="card-summary">{featuredFirst.summary}</p>
              <div className="card-tags">
                {featuredFirst.tags.map((tag) => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
                <span className="tag tag-category">
                  {CATEGORY_LABELS[featuredFirst.category]}
                </span>
              </div>
              <span className="card-cta">
                开始探索 <ArrowRightIcon size={14} />
              </span>
            </div>
          </button>
        )}

        <div className="card-grid">
          {gridSeeds.map((seed) => (
            <button
              key={seed.id}
              type="button"
              className="card"
              onClick={() => onStart(seed.prompt)}
            >
              <ExperienceCover seed={seed} />
              <div className="card-body">
                <div className="card-title-row">
                  <h3>{seed.title}</h3>
                  {seed.hot >= 60 && (
                    <span className="hot-badge">
                      <FlameIcon size={12} /> {seed.hot}
                    </span>
                  )}
                </div>
                <p className="card-summary">{seed.summary}</p>
                <div className="card-tags">
                  {seed.tags.map((tag) => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                  <span className="tag tag-category">{CATEGORY_LABELS[seed.category]}</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {catalog.length === 0 && (
          <p className="feed-empty">
            没有找到相关体验——换个关键词，或直接在下面开口。
          </p>
        )}
      </section>

      <p className="home-divider">或直接说</p>

      <div className="free-entry">
        <textarea
          className="free-entry-input"
          rows={2}
          placeholder={ENTRY_HINTS[hintIndex]}
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
          <span className="free-entry-hint">
            <MicIcon size={14} /> 也可以直接说
          </span>
          <button
            type="button"
            className="send-button"
            onClick={submit}
            disabled={draft.trim().length === 0}
            aria-label="发送"
          >
            <SendIcon size={16} />
          </button>
        </div>
      </div>

      {creations.length > 0 && (
        <section className="creations">
          <h2 className="creations-title">
            作品
            <span className="creations-count">{creations.length}</span>
          </h2>
          <div className="creations-row">
            {creations.map((creation) => {
              const src = creationSrc(creation);
              return (
                <article key={creation.id} className="creation-card">
                  {creation.modality === 'image' && src !== undefined && (
                    <button
                      type="button"
                      className="creation-media"
                      onClick={() => window.open(src, '_blank')}
                    >
                      <img src={src} alt={creation.prompt} />
                    </button>
                  )}
                  {creation.modality === 'video' && src !== undefined && (
                    <button
                      type="button"
                      className="creation-media"
                      onClick={() => window.open(src, '_blank')}
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
                  <div className="creation-body">
                    <span className={`gen-tag gen-tag-${creation.modality}`}>
                      {CREATION_MODALITY_LABELS[creation.modality]}
                    </span>
                    <p className="creation-prompt" title={creation.prompt}>
                      {creation.prompt}
                    </p>
                    <span className="creation-time">{timeAgo(creation.at)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {recents.length > 0 && (
        <section className="recents">
          <h2 className="recents-title">继续探索</h2>
          <div className="recents-row">
            {recents.map((recent) => (
              <button
                key={recent.experienceId}
                type="button"
                className="recent-chip"
                onClick={() => onResume(recent)}
              >
                <HistoryIcon size={13} />
                <span>{recent.topic}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
