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

const RECENTS_KEY = 'intent-experience.recents';
const CREATIONS_MAX = 12;

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
  const [phase, setPhase] = useState<'home' | 'experience'>('home');
  const [session, setSession] = useState<SessionState | null>(null);
  const [initialInput, setInitialInput] = useState<string | undefined>();
  const [resume, setResume] = useState(false);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [creations, setCreations] = useState<CreationEntry[]>([]);
  const [mode, setMode] = useState<'synthetic' | 'provider'>('synthetic');
  const [providerLabel, setProviderLabel] = useState<string | undefined>();

  useEffect(() => {
    setRecents(loadRecents());
    setCreations(loadCreations());
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
      setResume(false);
      setPhase('experience');
    } catch {
      // 启动失败时留在首页
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
      const next = [entry, ...prev.filter((item) => item.experienceId !== entry.experienceId)].slice(0, 5);
      saveRecents(next);
      return next;
    });
  }, []);

  if (phase === 'experience' && session) {
    return (
      <ExperienceScreen
        session={session}
        initialInput={initialInput}
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
      onResume={resumeRecent}
    />
  );
}
