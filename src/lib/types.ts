// Shared types between server and client.

export type Direction = "zh2en" | "en2zh";
export type DirectionMode = Direction | "both";

export interface Sentence {
  id?: number;
  hanzi: string;
  pinyin: string;
  english: string;
}

export interface Card {
  id: number;
  hanzi: string;
  pinyin: string;
  english: string;
  emoji: string;
  notes: string;
  createdAt: number;
  sentences: Sentence[];
}

/** FSRS memory state for one direction of a card, as stored. */
export interface SrsState {
  due: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number; // 0 New, 1 Learning, 2 Review, 3 Relearning
  lastReview: number | null;
}

export type Mastery = "new" | "learning" | "young" | "mature" | "struggling";

export interface CardSummary extends Card {
  srs: Partial<Record<Direction, SrsState>>;
  mastery: Mastery;
  /** 0..1, current probability of recall (min across studied directions). */
  retrievability: number | null;
  reviewCount: number;
  correctCount: number;
}

export interface StudyItem {
  card: Card;
  direction: Direction;
  kind: "new" | "review" | "learning" | "extra";
}

export interface ReviewRecord {
  id: number;
  direction: Direction;
  grade: number;
  correct: boolean;
  source: "study" | "quiz" | "write";
  flipped: boolean;
  elapsedMs: number | null;
  stateBefore: number;
  stabilityAfter: number | null;
  reviewedAt: number;
}

export interface Settings {
  newPerDay: number;
  sessionSize: number;
  direction: DirectionMode;
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  sessionSize: 20,
  direction: "both",
};

/** What the "add words" lookup returns before the user saves. */
export interface DraftCard {
  hanzi: string;
  pinyin: string;
  english: string;
  emoji: string;
  notes: string;
  sentences: Sentence[];
  source: "ai" | "dictionary" | "manual" | "claude";
  warnings: string[];
}

export interface PendingWord {
  id: number;
  hanzi: string;
  emoji: string;
  note: string;
  createdAt: number;
}
