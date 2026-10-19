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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from '@/hooks/use-toast';
import { getSeed } from '@/lib/experience/catalog';
import { ContinuationScreen } from '@/components/experience/continuation-screen';
import { EntranceScreen } from '@/components/experience/entrance-screen';
import { ExperienceScreen } from '@/components/experience/experience-screen';
import { HomeScreen } from '@/components/experience/home-screen';
import { MottoFooter } from '@/components/experience/motto-footer';
import { WorkViewer } from '@/components/experience/work-viewer';
import {
  useExperienceSession,
  type LoadedSession,
} from '@/components/experience/use-experience-session';
import type {
  CatalogResponse,
  CatalogSeed,
  ClientCategory,
  RecentSessionSummary,
  WorkSummary,
  WorksResponse,
} from '@/components/experience/client-types';

type Phase = 'home' | 'entrance' | 'experience';

const PHASE_MOTION = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
};

const STILL_PHASE_MOTION = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 1 },
  transition: { duration: 0 },
};

export default function Page() {
  const [phase, setPhase] = useState<Phase>('home');
  const [seeds, setSeeds] = useState<CatalogSeed[]>([]);
  const [recent, setRecent] = useState<RecentSessionSummary[]>([]);
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [entranceSeed, setEntranceSeed] = useState<CatalogSeed | null>(null);
  /** 完成后续作待输入态（G2-7）：种子会话 + 主题。 */
  const [continuationOf, setContinuationOf] = useState<{
    sessionId: string;
    topic: string;
  } | null>(null);
  /** 孤儿作品兜底查看（会话已不存在但媒体仍在——历史残留语音/图像）。 */
  const [viewingWork, setViewingWork] = useState<WorkSummary | null>(null);
  const reduceMotion = useReducedMotion();

  const sessionApi = useExperienceSession({
    onDirectionChanged: () => {
      sessionApi.reset();
      setContinuationOf(null);
      setPhase('home');
    },
    onStartFailed: (origin) => {
      setContinuationOf(null);
      setPhase(origin === 'seed' && entranceSeed ? 'entrance' : 'home');
    },
  });

  // 首页可能滚到很深才恢复会话。切换屏幕时回到视口顶部，
  // 避免入口标题和体验主题被旧页面的滚动位置裁掉。
  const screenKey =
    phase !== 'experience'
      ? phase
      : continuationOf
        ? `continuation:${continuationOf.sessionId}`
        : sessionApi.session
          ? `session:${sessionApi.session.sessionId}`
          : 'experience-pending';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);

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
    // 作品墙独立加载：失败同样保持安静（有旧数据则保留）
    try {
      const res = await fetch('/api/experience/works');
      if (res.ok) {
        const data = (await res.json()) as WorksResponse;
        setWorks(data.works);
      }
    } catch {
      // 同上
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

  /** 作品完成 / 回看完成作品 → 以此续作：记住种子会话，
   *  进入续作输入态（首轮输入即续作表达）。 */
  const handleContinueCreation = useCallback(() => {
    const current = sessionApi.session;
    if (!current) return;
    const seed = { sessionId: current.sessionId, topic: current.topic };
    sessionApi.reset();
    setContinuationOf(seed);
  }, [sessionApi]);

  /** 续作输入提交：以种子会话最新图像产物为参考图建立新会话。 */
  const handleContinuationSubmit = useCallback(
    (text: string) => {
      const pending = continuationOf;
      if (!pending) return;
      sessionApi.start(
        { continueSessionId: pending.sessionId, freeText: text },
        {
          topic: `${pending.topic}·续作`,
          origin: 'continuation',
          firstUserText: text,
        }
      );
      setContinuationOf(null);
    },
    [continuationOf, sessionApi]
  );

  /** 最近探索 / 作品墙 → 只读恢复历史轮次，继续当前会话（含媒体产物挂回）。
   *  作品墙点击若会话已不存在（孤儿媒体），兜底为作品本体查看而非 toast 拒绝。 */
  const handleOpenRecent = useCallback(
    async (id: string, fallbackWork?: WorkSummary) => {
      try {
        const res = await fetch(`/api/experience/session?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error('session failed');
        const data = (await res.json()) as { session: LoadedSession; media?: LoadedSession['media'] };
        sessionApi.restore({ ...data.session, media: data.media });
        setPhase('experience');
      } catch {
        if (fallbackWork) {
          setViewingWork(fallbackWork);
          return;
        }
        toast({ description: '这个会话暂时打不开，稍后再试试。' });
      }
    },
    [sessionApi]
  );

  const handleBackHome = useCallback(() => {
    sessionApi.reset();
    setContinuationOf(null);
    setPhase('home');
  }, [sessionApi]);

  return (
    <div
      className={`flex min-h-dvh flex-col bg-experience-canvas text-stone-900 ${
        phase === 'experience' && sessionApi.session ? 'h-dvh overflow-hidden' : ''
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'home' ? (
          <motion.div
            key="phase-home"
            {...(reduceMotion ? STILL_PHASE_MOTION : PHASE_MOTION)}
            className="flex flex-1 flex-col"
          >
            <HomeScreen
              seeds={seeds}
              recent={recent}
              works={works}
              loading={loading}
              onPickState={handlePickState}
              onWild={handleWild}
              onSubmitFreeText={handleFreeText}
              onOpenRecent={handleOpenRecent}
            />
          </motion.div>
        ) : phase === 'entrance' && entranceSeed ? (
          <motion.div
            key="phase-entrance"
            {...(reduceMotion ? STILL_PHASE_MOTION : PHASE_MOTION)}
            className="flex flex-1 flex-col"
          >
            <EntranceScreen
              seed={entranceSeed}
              onStart={handleEntranceStart}
              onChange={handleEntranceChange}
              onBackHome={handleBackHome}
              onSubmitFreeText={handleFreeText}
            />
          </motion.div>
        ) : phase === 'experience' && continuationOf && !sessionApi.session ? (
          <motion.div
            key="phase-continuation"
            {...(reduceMotion ? STILL_PHASE_MOTION : PHASE_MOTION)}
            className="flex flex-1 flex-col"
          >
            <ContinuationScreen
              topic={continuationOf.topic}
              onSubmit={handleContinuationSubmit}
              onCancel={handleBackHome}
            />
          </motion.div>
        ) : phase === 'experience' && sessionApi.session ? (
          <motion.div
            key="phase-experience"
            {...(reduceMotion ? STILL_PHASE_MOTION : PHASE_MOTION)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <ExperienceScreen
              session={sessionApi.session}
              onSend={sessionApi.send}
              onRetry={sessionApi.retry}
              onBackHome={handleBackHome}
              onContinueCreation={handleContinueCreation}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <MottoFooter />
      <AnimatePresence>
        {viewingWork ? (
          <WorkViewer work={viewingWork} onClose={() => setViewingWork(null)} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
