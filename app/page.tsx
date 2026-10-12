'use client';

import { useCallback, useEffect, useState } from 'react';
import { HomeScreen, type RecentEntry } from './_components/home-screen';
import {
  loadCreations,
  saveCreations,
  type CreationEntry,
} from './_components/creations';
import {
  ExperienceScreen,
  type SessionState,
} from './_components/experience-screen';
import { EntranceScreen } from './_components/entrance-screen';
import type { ExperienceSeed } from '../src/experience/catalog';

const RECENTS_KEY = 'intent-experience.recents';
// 服务端作品库（/api/works）落地后——展示上限放开；
// localStorage 降级为缓存（saveCreations 内部仍限 12 条）。
const CREATIONS_MAX = 60;
// localStorage 缓存条数（容量纪律——语音 dataUri 约 100KB 级）。
const CREATIONS_CACHE_MAX = 12;

/** 服务端作品记录 → 展示条目（资产经 /api/works/{id}/asset
 * 提供——远程提供方 URL 失效免疫；workId 支撑删除同步）。 */
function workEntries(works: Array<Record<string, unknown>>): CreationEntry[] {
  return works
    .filter(
      (work) =>
        typeof work.id === 'string' &&
        (work.modality === 'image' || work.modality === 'voice' || work.modality === 'video') &&
        typeof work.assetUrl === 'string',
    )
    .map((work) => ({
      id: String(work.id),
      workId: String(work.id),
      modality: work.modality as CreationEntry['modality'],
      prompt: typeof work.prompt === 'string' ? work.prompt : '',
      url: String(work.assetUrl),
      ...(typeof work.mime === 'string' ? { mime: work.mime } : {}),
      at: typeof work.createdAt === 'string' ? work.createdAt : new Date().toISOString(),
    }));
}

async function postWork(entry: CreationEntry): Promise<string | null> {
  try {
    const response = await fetch('/api/works', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modality: entry.modality,
        prompt: entry.prompt,
        ...(entry.url !== undefined && !entry.url.startsWith('/api/works/') ? { url: entry.url } : {}),
        ...(entry.dataUri !== undefined ? { dataUri: entry.dataUri } : {}),
        ...(entry.mime !== undefined ? { mime: entry.mime } : {}),
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { work?: { id?: unknown } };
    return typeof data.work?.id === 'string' ? data.work.id : null;
  } catch {
    return null;
  }
}

function loadRecents(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecents(recents: RecentEntry[]) {
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, 5)));
  } catch {
    // 本地存储不可用时跳过最近探索
  }
}

export default function HomePage() {
  const [phase, setPhase] = useState<'home' | 'entrance' | 'experience'>('home');
  // Screen 03 第一体验入口屏：暂存的策展体验种子（点卡片 / 惊喜进入）。
  const [entranceSeed, setEntranceSeed] = useState<ExperienceSeed | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [initialInput, setInitialInput] = useState<string | undefined>();
  const [initialRefs, setInitialRefs] = useState<string[] | undefined>();
  const [resume, setResume] = useState(false);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [creations, setCreations] = useState<CreationEntry[]>([]);
  const [mode, setMode] = useState<'synthetic' | 'provider'>('synthetic');
  const [providerLabel, setProviderLabel] = useState<string | undefined>();

  useEffect(() => {
    setRecents(loadRecents());
    setCreations(loadCreations());
    // 服务端作品库同步（平台能力——作品持久化不再依赖
    // 浏览器）：服务端有记录以其为准；服务端为空且本地
    // 有缓存时一次性迁移上传；服务端不可达保持本地。
    void (async () => {
      try {
        const response = await fetch('/api/works');
        if (!response.ok) return;
        const data = (await response.json()) as { works?: unknown };
        const works = Array.isArray(data.works) ? (data.works as Array<Record<string, unknown>>) : [];
        if (works.length > 0) {
          const entries = workEntries(works);
          setCreations(entries);
          saveCreations(entries.slice(0, CREATIONS_CACHE_MAX));
          return;
        }
        const local = loadCreations();
        if (local.length === 0) return;
        await Promise.allSettled(local.map((entry) => postWork(entry)));
        const again = await fetch('/api/works');
        if (!again.ok) return;
        const retry = (await again.json()) as { works?: unknown };
        const retryWorks = Array.isArray(retry.works)
          ? (retry.works as Array<Record<string, unknown>>)
          : [];
        if (retryWorks.length > 0) {
          const entries = workEntries(retryWorks);
          setCreations(entries);
          saveCreations(entries.slice(0, CREATIONS_CACHE_MAX));
        }
      } catch {
        // 服务端不可达——保持本地缓存展示
      }
    })();
    fetch('/api/config/status')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return;
        setMode(data.mode === 'provider' ? 'provider' : 'synthetic');
        setProviderLabel(
          typeof data.provider === 'string' && typeof data.model === 'string'
            ? `${data.provider} · ${data.model}`
            : undefined,
        );
      })
      .catch(() => undefined);
  }, []);

  const handleCreation = useCallback((entry: CreationEntry) => {
    setCreations((prev) => {
      // 同模态同产物去重（重试不重复入库），新作品在前。
      const fingerprint = `${entry.modality}:${entry.dataUri ?? entry.url}`;
      const next = [
        entry,
        ...prev.filter(
          (item) =>
            `${item.modality}:${item.dataUri ?? item.url}` !== fingerprint,
        ),
      ].slice(0, CREATIONS_MAX);
      saveCreations(next);
      return next;
    });
    // 服务端持久化（平台能力——产物字节落盘，提供方 URL
    // 失效免疫）：成功后回填 workId 供删除同步。
    void postWork(entry).then((workId) => {
      if (workId === null) return;
      setCreations((prev) =>
        prev.map((item) => (item.id === entry.id ? { ...item, workId } : item)),
      );
    });
  }, []);

  const handleDeleteCreation = useCallback((entry: CreationEntry) => {
    setCreations((prev) => {
      const next = prev.filter((item) => item.id !== entry.id);
      saveCreations(next);
      return next;
    });
    // 服务端记录同步删除（纯本地缓存条目无 workId——跳过）。
    if (entry.workId !== undefined) {
      void fetch(`/api/works/${entry.workId}`, { method: 'DELETE' }).catch(
        () => undefined,
      );
    }
  }, []);

  // 有策展的体验入口 → 先进入口屏（Screen 03：制造好奇 → 选方向）。
  const handleEnter = useCallback((seed: ExperienceSeed) => {
    setEntranceSeed(seed);
    setPhase('entrance');
  }, []);

  const start = useCallback(async (input: string) => {
    try {
      const response = await fetch('/api/session/start', { method: 'POST' });
      const data = await response.json();
      setSession({
        sessionId: data.session_id,
        experienceId: null,
        stateVersion: 0,
        status: data.state,
        stage: 'CURIOSITY',
      });
      setInitialInput(input);
      setInitialRefs(undefined);
      setResume(false);
      setPhase('experience');
    } catch {
      // 启动失败时留在首页
    }
  }, []);

  // 作品墙「续作」：以该作品为参考图开启新体验——
  // 回看与再创作连通（作品→参考→续作闭环的最后一块）。
  const handleContinueCreation = useCallback(async (entry: CreationEntry) => {
    try {
      const src = entry.dataUri ?? entry.url;
      if (!src) return;
      let dataUri = entry.dataUri;
      if (!dataUri && !src.startsWith('data:')) {
        const blob = await fetch(src).then((r) => {
          if (!r.ok) throw new Error('asset fetch failed');
          return r.blob();
        });
        dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('encode failed'));
          reader.readAsDataURL(blob);
        });
      }
      if (!dataUri) return;
      const response = await fetch('/api/session/start', { method: 'POST' });
      const data = await response.json();
      setSession({
        sessionId: data.session_id,
        experienceId: null,
        stateVersion: 0,
        status: data.state,
        stage: 'CURIOSITY',
      });
      setInitialInput(`以这张图为参考继续创作：${entry.prompt}`);
      setInitialRefs([dataUri]);
      setResume(false);
      setPhase('experience');
    } catch {
      // 参考图转换失败——留在首页（不阻塞入口）。
    }
  }, []);

  const resumeRecent = useCallback((recent: RecentEntry) => {
    setSession({
      sessionId: recent.sessionId,
      experienceId: recent.experienceId,
      stateVersion: recent.stateVersion,
      status: 'ACTIVE',
      stage: 'CURIOSITY',
    });
    setInitialInput(undefined);
    setResume(true);
    setPhase('experience');
  }, []);

  const handleRecent = useCallback((entry: RecentEntry) => {
    setRecents((prev) => {
      // 去重双维度：同一会话去重（续聊不堆叠）+ 同主题去重
      // （不同会话聊同一话题只保留最新——重复 chip 无用户价值）。
      const next = [
        entry,
        ...prev.filter(
          (item) =>
            item.experienceId !== entry.experienceId &&
            item.topic.trim() !== entry.topic.trim(),
        ),
      ].slice(0, 5);
      saveRecents(next);
      return next;
    });
  }, []);

  if (phase === 'entrance' && entranceSeed) {
    return (
      <EntranceScreen
        seed={entranceSeed}
        onPick={(prompt) => void start(prompt)}
        onBack={() => setPhase('home')}
      />
    );
  }

  if (phase === 'experience' && session) {
    return (
      <ExperienceScreen
        session={session}
        initialInput={initialInput}
        initialRefs={initialRefs}
        resume={resume}
        mode={mode}
        providerLabel={providerLabel}
        onSessionUpdate={setSession}
        onRecent={handleRecent}
        onExit={() => setPhase('home')}
        onCreation={handleCreation}
      />
    );
  }

  return (
    <HomeScreen
      recents={recents}
      creations={creations}
      onStart={start}
      onEnter={handleEnter}
      onResume={resumeRecent}
      onDeleteCreation={handleDeleteCreation}
      onContinueCreation={handleContinueCreation}
    />
  );
}
