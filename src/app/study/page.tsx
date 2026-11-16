"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DirectionPicker } from "@/components/DirectionPicker";
import { SwipeCard, type SwipeCardHandle, type SwipeDir } from "@/components/SwipeCard";
import { api, tz } from "@/lib/client";
import type { DirectionMode, Sentence, Settings, StudyItem } from "@/lib/types";

interface SessionResponse {
  items: StudyItem[];
  mode: DirectionMode;
  stats: {
    dueCount: number;
    newAvailable: number;
    newAllowed: number;
    newIntroducedToday: number;
    throttled: "struggling" | "backlog" | null;
  };
}

type QueueItem = StudyItem & { key: string; sentence: Sentence | null; again: number };

const pickSentence = (item: StudyItem): Sentence | null =>
  item.card.sentences.length
    ? item.card.sentences[Math.floor(Math.random() * item.card.sentences.length)]
    : null;

const KIND_BADGE: Record<StudyItem["kind"], string | undefined> = {
  new: "new",
  learning: "learning",
  review: undefined,
  extra: "extra practice",
};

function fetchSession(m: DirectionMode | null, extra: boolean) {
  const q = new URLSearchParams({ tz: String(tz()) });
  if (m) q.set("mode", m);
  if (extra) q.set("extra", "1");
  return api<SessionResponse>(`/api/study?${q}`);
}

export default function StudyPage() {
  const [mode, setMode] = useState<DirectionMode | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<SessionResponse["stats"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ right: 0, left: 0 });
  const [isExtra, setIsExtra] = useState(false);
  const shownAt = useRef(0);
  const cardRef = useRef<SwipeCardHandle>(null);

  const apply = useCallback((res: SessionResponse, extra: boolean) => {
    setMode(res.mode);
    setStats(res.stats);
    setIsExtra(extra);
    setQueue(
      res.items.map((it, i) => ({ ...it, key: `${it.card.id}-${it.direction}-${i}-${Date.now()}`, sentence: pickSentence(it), again: 0 })),
    );
    setFlipped(false);
    setLoading(false);
    shownAt.current = Date.now();
  }, []);

  const fail = (e: unknown) => {
    setError((e as Error).message);
    setLoading(false);
  };

  const load = useCallback(
    (m: DirectionMode | null, extra = false) => {
      setLoading(true);
      setError(null);
      fetchSession(m, extra).then((r) => apply(r, extra), fail);
    },
    [apply],
  );

  useEffect(() => {
    fetchSession(null, false).then((r) => apply(r, false), fail);
  }, [apply]);

  const current = queue[0];
  const next = queue[1];

  const onSwiped = useCallback(
    (dir: SwipeDir) => {
      if (!current) return;
      const grade = dir === "left" ? "again" : flipped ? "good" : "easy";
      api("/api/review", {
        method: "POST",
        json: {
          cardId: current.card.id,
          direction: current.direction,
          grade,
          flipped,
          elapsedMs: Date.now() - shownAt.current,
          source: "study",
        },
      }).catch((e) => setError(`Couldn't save that answer: ${(e as Error).message}`));

      setTally((t) => ({ ...t, [dir]: t[dir] + 1 }));
      setQueue((q) => {
        const [head, ...rest] = q;
        if (dir === "right") return rest;
        // Swiped left: bring it back a few cards later (sooner if the queue is short),
        // with a different example sentence.
        const pos = Math.min(rest.length, 3 + Math.floor(Math.random() * 3));
        const again: QueueItem = {
          ...head,
          key: `${head.key}-a${head.again + 1}`,
          kind: "learning",
          again: head.again + 1,
          sentence: pickSentence(head),
        };
        return [...rest.slice(0, pos), again, ...rest.slice(pos)];
      });
      setFlipped(false);
      shownAt.current = Date.now();
    },
    [current, flipped],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") cardRef.current?.swipe("left");
      else if (e.key === "ArrowRight") cardRef.current?.swipe("right");
      else if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current]);

  const changeMode = async (m: DirectionMode) => {
    setMode(m);
    await api<Settings>("/api/settings", { method: "PATCH", json: { direction: m } });
    load(m);
  };

  const remaining = useMemo(() => new Set(queue.map((q) => `${q.card.id}-${q.direction}`)).size, [queue]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Study</h1>
        {mode && <DirectionPicker value={mode} onChange={changeMode} />}
      </div>

      {error && <div className="rounded-xl bg-seal/10 text-seal px-3 py-2 text-sm">{error}</div>}

      {loading ? (
        <div className="h-[30rem] grid place-items-center text-ink-soft">Shuffling your deck…</div>
      ) : current ? (
        <>
          <div className="flex items-center justify-between text-sm text-ink-soft">
            <span>{remaining} left</span>
            <span>
              <span className="text-jade">✓ {tally.right}</span>
              <span className="mx-2">·</span>
              <span className="text-seal">↺ {tally.left}</span>
            </span>
          </div>
          <div className="relative h-[30rem] sm:h-[32rem]">
            {next && (
              <div className="absolute inset-0 translate-y-3 scale-[0.96] rounded-3xl border border-line bg-card/70" />
            )}
            <SwipeCard
              key={current.key}
              ref={cardRef}
              card={current.card}
              direction={current.direction}
              sentence={current.sentence}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              onSwiped={onSwiped}
              badge={KIND_BADGE[current.kind]}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button className="btn-ghost text-seal" onClick={() => cardRef.current?.swipe("left")}>
              ← Again
            </button>
            <button className="btn-ghost" onClick={() => setFlipped((f) => !f)}>
              {flipped ? "Unflip" : "Flip"}
            </button>
            <button className="btn-ghost text-jade" onClick={() => cardRef.current?.swipe("right")}>
              {flipped ? "Got it →" : "Easy →"}
            </button>
          </div>
          <p className="text-center text-xs text-ink-soft/80">
            Tap to flip · swipe right if you knew it, left if not · swiping right <em>without</em> flipping
            counts as “easy” · keyboard: ← → and space
          </p>
        </>
      ) : (
        <SessionDone
          tally={tally}
          stats={stats}
          isExtra={isExtra}
          onMore={() => load(mode)}
          onExtra={() => load(mode, true)}
        />
      )}
    </div>
  );
}

function SessionDone({
  tally,
  stats,
  isExtra,
  onMore,
  onExtra,
}: {
  tally: { right: number; left: number };
  stats: SessionResponse["stats"] | null;
  isExtra: boolean;
  onMore: () => void;
  onExtra: () => void;
}) {
  const studied = tally.right + tally.left > 0;
  const hasMore = !!stats && (stats.dueCount > 0 || (stats.newAllowed > 0 && stats.newAvailable > 0));
  return (
    <div className="panel p-8 text-center flex flex-col items-center gap-4">
      <div className="text-6xl">{studied ? "🎉" : "🍵"}</div>
      <h2 className="text-2xl font-semibold">{studied ? "Session complete!" : "Nothing due right now"}</h2>
      {studied && (
        <p className="text-ink-soft">
          {tally.right} remembered · {tally.left} to practise again
        </p>
      )}
      {stats?.throttled === "struggling" && (
        <p className="text-sm text-ink-soft max-w-sm">
          Your recent accuracy is a bit low, so fewer new words are being introduced until reviews feel easier.
        </p>
      )}
      {stats?.throttled === "backlog" && (
        <p className="text-sm text-ink-soft max-w-sm">You have a review backlog — new words are paused to let you catch up.</p>
      )}
      {!hasMore && stats && stats.newAvailable > 0 && stats.newAllowed === 0 && (
        <p className="text-sm text-ink-soft max-w-sm">
          Daily new-word limit reached ({stats.newIntroducedToday} today). {stats.newAvailable} new word(s) wait for tomorrow.
        </p>
      )}
      <div className="flex flex-wrap gap-3 justify-center">
        {studied && <button className="btn-primary" onClick={onMore}>Continue</button>}
        {!studied && !isExtra && (
          <button className="btn-primary" onClick={onExtra}>Extra practice (weakest words)</button>
        )}
        {studied && <button className="btn-ghost" onClick={onExtra}>Extra practice</button>}
        <Link href="/quiz" className="btn-ghost">Take a quiz</Link>
        <Link href="/add" className="btn-ghost">Add words</Link>
      </div>
    </div>
  );
}
