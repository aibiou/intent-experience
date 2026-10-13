'use client';

import { useState } from 'react';
import { ArrowLeftIcon, SendIcon, SparklesIcon } from './icons';
import { CATEGORY_LABELS, type ExperienceSeed } from '../../src/experience/catalog';

/**
 * Screen 03｜第一体验入口屏
 *
 * 产品意图（个人体验引擎 V1）：把用户即将进入的体验，先呈现为
 * "一个值得进入的问题"，而不是直接丢给 runtime 生成内容。
 *
 * 体验把控：
 *  - 不是一个内容页——不展示完整答案，只展示 Curiosity（hook）
 *    + 一小段第一理解（context，不解释完、留探索空间）。
 *  - 秒级好奇：静态呈现、零等待；用户 10–20s 内产生
 *    "有点意思 / 想知道答案 / 想试试看"。
 *  - 控制感：用户从 1–3 个入口角度（entries）中选方向，
 *    也可自由开口；不强迫。
 *  - 轻：视觉比首页更收敛，不叠第二个信息流。
 */
interface EntranceScreenProps {
  seed: ExperienceSeed;
  onPick: (prompt: string) => void;
  onBack: () => void;
}

export function EntranceScreen({ seed, onPick, onBack }: EntranceScreenProps) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const input = draft.trim();
    if (input.length === 0) return;
    onPick(input);
  };

  return (
    <main className="entrance">
      <nav className="topbar">
        <button type="button" className="back-button" onClick={onBack}>
          <ArrowLeftIcon size={16} /> 返回
        </button>
        <span className="brand">
          <SparklesIcon size={15} />
          <span className="wordmark">个人体验引擎</span>
        </span>
      </nav>

      <div className="entrance-body">
        <div className="entrance-kicker">
          <span className="tag tag-category">{CATEGORY_LABELS[seed.category]}</span>
          <span className="entrance-title">{seed.title}</span>
        </div>

        {/* Curiosity：一个值得进入的问题 */}
        <h1 className="entrance-hook">{seed.hook}</h1>

        {/* 第一理解：不解释完，留探索空间 */}
        {seed.context && <p className="entrance-context">{seed.context}</p>}

        {/* 低门槛参与：1–3 个入口角度 */}
        <div className="entrance-entries">
          {seed.entries.map((entry) => (
            <button
              key={entry.label}
              type="button"
              className="entrance-entry"
              onClick={() => onPick(entry.prompt)}
            >
              <span>{entry.label}</span>
              <ArrowLeftIcon size={15} className="entrance-entry-arrow" />
            </button>
          ))}
        </div>

        <div className="entrance-divider">
          <span>或者，你自己开口</span>
        </div>

        <div className="entrance-free">
          <input
            className="entrance-free-input"
            type="text"
            placeholder="想问点什么，就从这里开始……"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="button"
            className="send-button"
            onClick={submit}
            disabled={draft.trim().length === 0}
            aria-label="开始探索"
          >
            <SendIcon size={16} />
          </button>
        </div>
      </div>
    </main>
  );
}
