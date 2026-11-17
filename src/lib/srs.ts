/**
 * Spaced-repetition core.
 *
 * Memory model: FSRS (Free Spaced Repetition Scheduler, via ts-fsrs) — it
 * models each card's *stability* (how many days until recall probability
 * drops to 90%) and *difficulty*, updated after every answer. Each card has
 * two independent memory states: recognition (汉字 → English) and recall
 * (English → 汉字), because they are genuinely different skills.
 *
 * Swipe → FSRS grade:
 *   swipe left                     → Again (comes back in ~1 min, same session)
 *   swipe right after flipping     → Good
 *   swipe right without flipping   → Easy (you were sure without checking)
 * Quiz: correct → Good, wrong → Again.
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
} from "ts-fsrs";
import type {
  Direction,
  DirectionMode,
  Mastery,
  Settings,
  SrsState,
} from "./types";

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 365 * 3,
    enable_fuzz: true,
    enable_short_term: true,
  }),
);

export const GRADE = {
  again: Rating.Again as Grade,
  good: Rating.Good as Grade,
  easy: Rating.Easy as Grade,
};

function toFsrs(s: SrsState | null | undefined, now: Date): FsrsCard {
  if (!s) return createEmptyCard(now);
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: 0,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.lastReview ? new Date(s.lastReview) : undefined,
  } as FsrsCard;
}

function fromFsrs(c: FsrsCard): SrsState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ? c.last_review.getTime() : null,
  };
}

export function applyGrade(
  prev: SrsState | null | undefined,
  grade: Grade,
  now = new Date(),
): SrsState {
  const { card } = scheduler.next(toFsrs(prev, now), now, grade);
  return fromFsrs(card);
}

/** Probability (0..1) that you'd recall this right now. */
export function retrievability(s: SrsState | null | undefined, now = new Date()) {
  if (!s || s.state === State.New) return null;
  return scheduler.retrievability(toFsrs(s, now), now) as number;
}

export function masteryOf(
  states: (SrsState | undefined)[],
  recentAccuracy: number | null,
  now = new Date(),
): Mastery {
  const studied = states.filter((s): s is SrsState => !!s && s.state !== 0);
  if (studied.length === 0) return "new";
  const minR = Math.min(...studied.map((s) => retrievability(s, now) ?? 1));
  const lapses = studied.reduce((a, s) => a + s.lapses, 0);
  if ((lapses >= 3 && (recentAccuracy ?? 1) < 0.6) || minR < 0.6)
    return "struggling";
  if (studied.some((s) => s.state === State.Learning || s.state === State.Relearning))
    return "learning";
  // A word is only known once it's validated both ways: recognition (汉→EN) AND
  // recall (EN→汉). Until both directions have graduated, it stays "learning".
  if (studied.length < states.length) return "learning";
  const minStability = Math.min(...studied.map((s) => s.stability));
  return minStability >= 21 ? "mature" : "young";
}

// ---------------------------------------------------------------------------
// Session builder: balances overdue reviews, in-progress learning, and new
// cards. The rules, in order:
//   1. Learning/relearning cards that are due come first (short-term memory
//      is fragile), then reviews sorted by lowest recall probability.
//   2. New cards are interleaved evenly. Their number is capped by the daily
//      new-card limit, and automatically throttled when you're struggling
//      (recent accuracy < 75% halves it) or behind (big review backlog → only
//      a trickle of 2), so the pile of reviews can't snowball.
//   3. At most one direction of a card per session (no giving away answers).
//   4. In "both" mode a word is first introduced as recognition (汉字→EN);
//      recall (EN→汉字) unlocks once recognition has graduated.
//   5. If nothing is due, you can opt into "extra practice": the cards with
//      the lowest predicted recall, even if not due yet.
// ---------------------------------------------------------------------------

export interface DeckEntry {
  cardId: number;
  createdAt: number;
  srs: Partial<Record<Direction, SrsState>>;
}

export interface PlannedItem {
  cardId: number;
  direction: Direction;
  kind: "new" | "review" | "learning" | "extra";
}

export interface SessionPlan {
  items: PlannedItem[];
  stats: {
    dueCount: number;
    newAvailable: number;
    newAllowed: number;
    newIntroducedToday: number;
    throttled: "struggling" | "backlog" | null;
  };
}

// "Again" cards (due in ~1 min) can come back right away; "Good" learning
// cards (due in ~10 min) wait for a later session.
const LEARN_AHEAD_MS = 5 * 60 * 1000;

export function planSession(
  deck: DeckEntry[],
  opts: {
    settings: Settings;
    mode: DirectionMode;
    newIntroducedToday: number;
    recentAccuracy: number | null;
    recentCount: number;
    extra: boolean;
    exclude?: Set<string>;
    now?: Date;
  },
): SessionPlan {
  const now = opts.now ?? new Date();
  const t = now.getTime();
  const size = opts.settings.sessionSize;
  const dirs: Direction[] = opts.mode === "both" ? ["zh2en", "en2zh"] : [opts.mode];

  type Cand = PlannedItem & { prio: number };
  const due: Cand[] = [];
  const fresh: Cand[] = [];
  const ahead: Cand[] = [];

  for (const entry of deck) {
    let bestDue: Cand | null = null;
    let bestNew: Cand | null = null;
    let bestAhead: Cand | null = null;
    for (const d of dirs) {
      if (opts.exclude?.has(`${entry.cardId}:${d}`)) continue;
      const s = entry.srs[d];
      if (!s || s.state === State.New) {
        // Recall direction waits until recognition has graduated (both mode).
        if (opts.mode === "both" && d === "en2zh") {
          const rec = entry.srs.zh2en;
          if (!rec || rec.state !== State.Review) continue;
        }
        const c: Cand = { cardId: entry.cardId, direction: d, kind: "new", prio: entry.createdAt };
        if (!bestNew || c.prio < bestNew.prio) bestNew = c;
        continue;
      }
      const learning = s.state === State.Learning || s.state === State.Relearning;
      const isDue = s.due <= t || (learning && s.due <= t + LEARN_AHEAD_MS);
      const r = retrievability(s, now) ?? 1;
      if (isDue) {
        // learning cards first (prio < 0), then lowest retrievability
        const c: Cand = {
          cardId: entry.cardId,
          direction: d,
          kind: learning ? "learning" : "review",
          prio: learning ? -1 + (s.due - t) / 1e12 : r,
        };
        if (!bestDue || c.prio < bestDue.prio) bestDue = c;
      } else {
        const c: Cand = { cardId: entry.cardId, direction: d, kind: "extra", prio: r };
        if (!bestAhead || c.prio < bestAhead.prio) bestAhead = c;
      }
    }
    if (bestDue) due.push(bestDue);
    else if (bestNew) fresh.push(bestNew);
    if (!bestDue && bestAhead) ahead.push(bestAhead);
  }

  due.sort((a, b) => a.prio - b.prio);
  fresh.sort((a, b) => a.prio - b.prio);
  ahead.sort((a, b) => a.prio - b.prio);

  // --- how many new cards? ---
  let newAllowed = Math.max(0, opts.settings.newPerDay - opts.newIntroducedToday);
  let throttled: SessionPlan["stats"]["throttled"] = null;
  if (opts.recentCount >= 10 && (opts.recentAccuracy ?? 1) < 0.75) {
    newAllowed = Math.floor(newAllowed / 2);
    throttled = "struggling";
  }
  if (due.length > size * 2) {
    newAllowed = Math.min(newAllowed, 2);
    throttled = "backlog";
  }
  const reviewSlots = Math.min(due.length, size);
  // New cards get the free slots, but always at least ~25% of the session
  // (if allowed) so learning never stalls completely.
  const newSlots = Math.min(
    newAllowed,
    fresh.length,
    Math.max(size - reviewSlots, Math.ceil(size * 0.25)),
  );
  const reviews = due.slice(0, size - newSlots);
  const news = fresh.slice(0, newSlots);

  let items: PlannedItem[] = interleave(reviews, news);
  if (items.length === 0 && opts.extra) {
    items = ahead.slice(0, size);
  }

  return {
    items: items.map(({ cardId, direction, kind }) => ({ cardId, direction, kind })),
    stats: {
      dueCount: due.length,
      newAvailable: fresh.length,
      newAllowed,
      newIntroducedToday: opts.newIntroducedToday,
      throttled,
    },
  };
}

/** Spread `b` evenly through `a`. */
function interleave<T>(a: T[], b: T[]): T[] {
  if (b.length === 0) return a;
  if (a.length === 0) return b;
  const out: T[] = [];
  const step = (a.length + b.length) / b.length;
  let bi = 0;
  let next = Math.floor(step / 2);
  for (let i = 0, ai = 0; i < a.length + b.length; i++) {
    if (bi < b.length && (i >= next || ai >= a.length)) {
      out.push(b[bi++]);
      next = Math.floor(step * bi + step / 2);
    } else {
      out.push(a[ai++]);
    }
  }
  return out;
}
