'use client';

import { useState } from 'react';
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
} from './icons';

export interface RecentEntry {
  experienceId: string;
  sessionId: string;
  stateVersion: number;
  topic: string;
  at: string;
}

interface Choice {
  icon: ComponentType<{ size?: number }>;
  label: string;
  seed: string;
}

// Screen 01 低成本选择（逐屏原型规格 V1——状态入口，
 // 不是兴趣分类：用户只回答「我现在比较像哪一种」）。
const CHOICES: Choice[] = [
  {
    icon: MoonIcon,
    label: '放松一下',
    seed: '我想放松一下，有什么轻松的话题吗？',
  },
  {
    icon: CompassIcon,
    label: '发现点东西',
    seed: '帮我发现点新东西，有什么值得看的？',
  },
  {
    icon: SearchIcon,
    label: '深入一个问题',
    seed: '云为什么是白色的？',
  },
  {
    icon: EditIcon,
    label: '做点什么',
    seed: '我想做个小游戏',
  },
  {
    icon: ShuffleIcon,
    label: '随便看看',
    seed: '随便看看，现在有什么值得探索的？',
  },
];

interface HomeScreenProps {
  recents: RecentEntry[];
  onStart: (input: string) => void;
  onResume: (recent: RecentEntry) => void;
}

export function HomeScreen({ recents, onStart, onResume }: HomeScreenProps) {
  const [draft, setDraft] = useState('');
  const latest = recents[0];

  const submit = () => {
    const input = draft.trim();
    if (input.length === 0) return;
    setDraft('');
    onStart(input);
  };

  return (
    <main className="home">
      <p className="wordmark">个人体验引擎</p>
      <h1 className="home-title">现在想要什么？</h1>
      <p className="home-sub">不用想太多——选一个像你现在的样子。</p>

      <div className="choice-list">
        {CHOICES.map((choice) => (
          <button
            key={choice.label}
            type="button"
            className="choice"
            onClick={() => onStart(choice.seed)}
          >
            <choice.icon size={20} />
            <span>{choice.label}</span>
          </button>
        ))}
      </div>

      <p className="home-divider">或</p>

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

      <footer className="home-footer">
        {latest ? (
          <button
            type="button"
            className="recent"
            onClick={() => onResume(latest)}
          >
            <span className="recent-label">最近</span>
            <span className="recent-topic">昨天停在：{latest.topic}</span>
            <span className="recent-resume">
              继续探索 <ArrowRightIcon size={14} />
            </span>
          </button>
        ) : (
          <span className="recent-empty">第一次来——从上面任意一个开始。</span>
        )}
        <a className="config-link" href="/config">
          <SettingsIcon size={14} /> 模型配置
        </a>
      </footer>
    </main>
  );
}
