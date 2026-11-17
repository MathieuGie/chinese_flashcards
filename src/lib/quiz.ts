import "server-only";
import { containsWord, findWord } from "./hanzi";
import { numberedToMarks } from "./cedict";
import { retrievability } from "./srs";
import type { CardSummary, Direction } from "./types";

/**
 * Evaluation mode. Questions are picked by weighted sampling that favours
 * words you are likely to have forgotten (low predicted recall, many lapses),
 * while still sampling everything you've studied. Every answer is fed back
 * into the same memory model as the flashcards.
 */

export type QuestionType = "meaning" | "hanzi" | "cloze" | "pinyin";

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  cardId: number;
  direction: Direction;
  prompt: { hanzi?: string; pinyin?: string; english?: string; emoji?: string; sentence?: string; sentenceEnglish?: string };
  options: string[];
  answer: number;
  explanation: { hanzi: string; pinyin: string; english: string; emoji: string };
}

const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

function weightedSample<T>(items: T[], weight: (t: T) => number, n: number): T[] {
  const pool = items.map((t) => ({ t, w: Math.max(0.01, weight(t)) }));
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((a, p) => a + p.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    out.push(pool[idx].t);
    pool.splice(idx, 1);
  }
  return out;
}

function pickDistractors(card: CardSummary, all: CardSummary[], key: (c: CardSummary) => string, n = 3) {
  const target = key(card);
  const len = Array.from(card.hanzi).length;
  const candidates = shuffle(all.filter((c) => c.id !== card.id && key(c) && key(c) !== target));
  // prefer words of the same length: harder to guess by shape
  candidates.sort(
    (a, b) => Math.abs(Array.from(a.hanzi).length - len) - Math.abs(Array.from(b.hanzi).length - len),
  );
  const seen = new Set([target]);
  const out: string[] = [];
  for (const c of candidates) {
    const v = key(c);
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length === n) break;
  }
  return out;
}

const TONE_OF: Record<string, [string, number]> = {};
for (const [base, marks] of Object.entries({
  a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", ü: "ǖǘǚǜ",
})) {
  Array.from(marks).forEach((m, t) => (TONE_OF[m] = [base, t + 1]));
}

/** "zhǎngwò" → ["zhang3","wo4"] (best-effort syllable split for joined pinyin). */
function toNumbered(p: string): string[] {
  const syllables = p
    .toLowerCase()
    .replace(/[^a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü' ]/g, " ")
    .split(/[\s']+/)
    .filter(Boolean)
    .flatMap(splitSyllables);
  return syllables.map((s) => {
    let tone = 5;
    let plain = "";
    for (const ch of s) {
      if (TONE_OF[ch]) {
        plain += TONE_OF[ch][0];
        tone = TONE_OF[ch][1];
      } else plain += ch;
    }
    return plain + tone;
  });
}

// Each syllable has exactly one marked vowel (except neutral tone); split a
// joined word like "luóxuán" before each initial consonant that follows a
// complete final.
function splitSyllables(word: string): string[] {
  const re = /(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?[aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+(?:ng|n(?![aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ])|r(?![aeiouü]))?/g;
  const m = word.match(re);
  return m && m.join("") === word ? m : [word];
}

function toneVariants(p: string, n = 3): string[] {
  const syl = toNumbered(p);
  if (syl.length === 0) return [];
  const joined = !/\s/.test(p.trim());
  const render = (s: string[]) => {
    const marked = numberedToMarks(s.join(" "));
    return joined ? marked.replace(/ /g, "") : marked;
  };
  const original = render(syl);
  const out = new Set<string>();
  for (let tries = 0; tries < 60 && out.size < n; tries++) {
    const copy = [...syl];
    const changes = syl.length > 1 && Math.random() < 0.4 ? 2 : 1;
    for (let c = 0; c < changes; c++) {
      const i = Math.floor(Math.random() * copy.length);
      const base = copy[i].slice(0, -1);
      copy[i] = base + (1 + Math.floor(Math.random() * 4));
    }
    const r = render(copy);
    if (r !== original && r !== p) out.add(r);
  }
  return [...out];
}

export function buildQuiz(all: CardSummary[], count: number): QuizQuestion[] {
  if (all.length < 4) return [];
  const now = new Date();
  const picked = weightedSample(
    all,
    (c) => {
      const studied = Object.values(c.srs).filter((s) => s && s.state !== 0);
      if (studied.length === 0) return 0.25;
      const r = Math.min(...studied.map((s) => retrievability(s, now) ?? 1));
      const lapses = studied.reduce((a, s) => a + (s?.lapses ?? 0), 0);
      return 1 - r + 0.2 + lapses * 0.15 + (c.mastery === "struggling" ? 0.5 : 0);
    },
    Math.min(count, all.length),
  );

  return picked.map((card, i) => {
    const explanation = { hanzi: card.hanzi, pinyin: card.pinyin, english: card.english, emoji: card.emoji };
    const types: QuestionType[] = ["meaning", "hanzi", "pinyin"];
    const clozeSentences = card.sentences.filter((s) => containsWord(s.hanzi, card.hanzi));
    if (clozeSentences.length) types.push("cloze", "cloze");
    let type = types[Math.floor(Math.random() * types.length)];

    let options: string[] = [];
    let correct = "";
    let prompt: QuizQuestion["prompt"] = {};
    let direction: Direction = "zh2en";

    if (type === "pinyin") {
      const variants = toneVariants(card.pinyin);
      if (variants.length < 3) type = "meaning";
      else {
        correct = card.pinyin;
        options = [correct, ...variants.slice(0, 3)];
        prompt = { hanzi: card.hanzi };
      }
    }
    if (type === "meaning") {
      correct = card.english;
      options = [correct, ...pickDistractors(card, all, (c) => c.english)];
      prompt = { hanzi: card.hanzi, pinyin: card.pinyin };
    } else if (type === "hanzi") {
      direction = "en2zh";
      correct = card.hanzi;
      options = [correct, ...pickDistractors(card, all, (c) => c.hanzi)];
      prompt = { english: card.english, emoji: card.emoji };
    } else if (type === "cloze") {
      direction = "en2zh";
      const s = clozeSentences[Math.floor(Math.random() * clozeSentences.length)];
      correct = card.hanzi;
      options = [correct, ...pickDistractors(card, all, (c) => c.hanzi)];
      prompt = {
        sentence: blankOut(s.hanzi, card.hanzi),
        sentenceEnglish: s.english,
      };
    }

    const shuffled = shuffle(options);
    return {
      id: `${Date.now()}-${i}`,
      type,
      cardId: card.id,
      direction,
      prompt,
      options: shuffled,
      answer: shuffled.indexOf(correct),
      explanation,
    };
  });
}

/** Replaces the entry (every part of a pattern like 以…为…) with blanks, one per character. */
function blankOut(sentence: string, hanzi: string) {
  let out = "";
  let at = 0;
  for (const [a, b] of findWord(sentence, hanzi) ?? []) {
    out += sentence.slice(at, a) + "＿".repeat(Array.from(sentence.slice(a, b)).length);
    at = b;
  }
  return out + sentence.slice(at);
}
