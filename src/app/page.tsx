'use client';

/**
 * 个人体验引擎——单路由客户端状态机。
 *
 * phase: home（Screen 01）→ entrance（Screen 03，种子路径）
 *      → experience（Screen 04/05，SSE 流式体验）
 *
 * 铁律：人决定方向，AI 降低成本。
 * - 自由输入不经过入口屏（低摩擦，直接进入体验）
 * - 换方向 = 会话结束（direction_changed → 回到首页）
 * - 停止是成功路径（user_stop → 干净的结束层，零推荐）
 */

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from '@/hooks/use-toast';
import { getSeed } from '@/lib/experience/catalog';
import { EntranceScreen } from '@/components/experience/entrance-screen';
import { ExperienceScreen } from '@/components/experience/experience-screen';
import { HomeScreen } from '@/components/experience/home-screen';
import { MottoFooter } from '@/components/experience/motto-footer';
import {
  useExperienceSession,
  type LoadedSession,
} from '@/components/experience/use-experience-session';
import type {
  CatalogResponse,
  CatalogSeed,
  ClientCategory,
  RecentSessionSummary,
} from '@/components/experience/client-types';

type Phase = 'home' | 'entrance' | 'experience';

const PHASE_MOTION = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
};

export default function Page() {
  const [phase, setPhase] = useState<Phase>('home');
  const [seeds, setSeeds] = useState<CatalogSeed[]>([]);
  const [recent, setRecent] = useState<RecentSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [entranceSeed, setEntranceSeed] = useState<CatalogSeed | null>(null);

  const sessionApi = useExperienceSession({
    onDirectionChanged: () => {
      sessionApi.reset();
      setPhase('home');
    },
    onStartFailed: (origin) => {
      setPhase(origin === 'seed' && entranceSeed ? 'entrance' : 'home');
    },
  });

  const refreshCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/experience/catalog');
      if (!res.ok) throw new Error('catalog failed');
      const data = (await res.json()) as CatalogResponse;
      setSeeds(data.seeds);
      setRecent(data.recent);
    } catch {
      // 目录失败保持安静：保留旧数据/空态，不打扰首页
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次进入与每次回到首页时，静默刷新目录 + 最近探索
  useEffect(() => {
    if (phase === 'home') void refreshCatalog();
  }, [phase, refreshCatalog]);

  /** 从某状态类别随机挑一条种子（排除指定 id；候选空则退回非 wild 池）。 */
  const pickSeed = useCallback(
    (category: ClientCategory, excludeId?: string): CatalogSeed | null => {
      const pool = seeds.filter((s) => s.category === category && s.id !== excludeId);
      const fallback = seeds.filter((s) => s.category !== 'wild' && s.id !== excludeId);
      const source = pool.length > 0 ? pool : fallback;
      return source[Math.floor(Math.random() * source.length)] ?? null;
    },
    [seeds]
  );

  const handlePickState = useCallback(
    (category: 'relax' | 'discover' | 'deep' | 'create') => {
      const seed = pickSeed(category);
      if (!seed) return;
      setEntranceSeed(seed);
      setPhase('entrance');
    },
    [pickSeed]
  );

  const handleWild = useCallback(() => {
    const pool = seeds.filter((s) => s.category !== 'wild');
    const seed = pool[Math.floor(Math.random() * pool.length)] ?? null;
    if (!seed) return;
    setEntranceSeed(seed);
    setPhase('entrance');
  }, [seeds]);

  const handleEntranceStart = useCallback(
    (entry: string | null) => {
      if (!entranceSeed) return;
      sessionApi.start(
        entry
          ? { seedId: entranceSeed.id, entry }
          : { seedId: entranceSeed.id },
        {
          topic: entranceSeed.hook,
          origin: 'seed',
          // 无角度时后端以 seed.prompt 作为首轮输入——呈现层同步这个文本
          firstUserText: entry ?? getSeed(entranceSeed.id)?.prompt ?? null,
        }
      );
      setPhase('experience');
    },
    [entranceSeed, sessionApi]
  );

  /** 换一个：留在入口屏，换一条种子（优先同状态类别）。 */
  const handleEntranceChange = useCallback(() => {
    if (!entranceSeed) return;
    const next = pickSeed(entranceSeed.category, entranceSeed.id);
    if (next) setEntranceSeed(next);
  }, [entranceSeed, pickSeed]);

  /** 自由输入：低摩擦，不经过入口屏，直接进入体验。 */
  const handleFreeText = useCallback(
    (text: string) => {
      sessionApi.start({ freeText: text }, { topic: text, origin: 'free', firstUserText: text });
      setPhase('experience');
    },
    [sessionApi]
  );

  /** 最近探索 → 只读恢复历史轮次，继续当前会话。 */
  const handleOpenRecent = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/experience/session?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error('session failed');
        const data = (await res.json()) as { session: LoadedSession };
        sessionApi.restore(data.session);
        setPhase('experience');
      } catch {
        toast({ description: '这个会话暂时打不开，稍后再试试。' });
      }
    },
    [sessionApi]
  );

  const handleBackHome = useCallback(() => {
    sessionApi.reset();
    setPhase('home');
  }, [sessionApi]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#faf9f7] text-stone-900">
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'home' ? (
          <motion.div key="phase-home" {...PHASE_MOTION} className="flex flex-1 flex-col">
            <HomeScreen
              seeds={seeds}
              recent={recent}
              loading={loading}
              onPickState={handlePickState}
              onWild={handleWild}
              onSubmitFreeText={handleFreeText}
              onOpenRecent={handleOpenRecent}
            />
          </motion.div>
        ) : phase === 'entrance' && entranceSeed ? (
          <motion.div key="phase-entrance" {...PHASE_MOTION} className="flex flex-1 flex-col">
            <EntranceScreen
              seed={entranceSeed}
              onStart={handleEntranceStart}
              onChange={handleEntranceChange}
              onSubmitFreeText={handleFreeText}
            />
          </motion.div>
        ) : phase === 'experience' && sessionApi.session ? (
          <motion.div key="phase-experience" {...PHASE_MOTION} className="flex flex-1 flex-col">
            <ExperienceScreen
              session={sessionApi.session}
              onSend={sessionApi.send}
              onRetry={sessionApi.retry}
              onBackHome={handleBackHome}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <MottoFooter />
    </div>
  );
}
