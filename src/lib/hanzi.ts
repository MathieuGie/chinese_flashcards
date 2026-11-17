/**
 * A card's "hanzi" is usually one word (螺旋), but can also be
 *  - a grammar pattern, parts joined by "…":   以…为…   越…越…
 *  - a pair (synonyms / opposites), joined by " / ":   浓 / 淡
 * These helpers find such entries inside sentences. Shared by the app and scripts/words.mjs.
 */

export const HAN_RUN = /[㐀-䶿一-鿿豈-﫿\u{20000}-\u{2fa1f}]+/gu;
const ELLIPSIS = /…|\.{2,}|⋯|～|~/;

export const hanziParts = (hanzi: string): string[] => hanzi.match(HAN_RUN) ?? [];

export const isPattern = (hanzi: string) => hanziParts(hanzi).length > 1 && ELLIPSIS.test(hanzi);

/** Identity used for duplicate detection: 以…为… and 以 / 为 are the same entry, 以为 is not. */
export const wordKey = (hanzi: string) => hanziParts(hanzi).join(" ");

/**
 * Character ranges [start, end) where the entry occurs in a sentence, or null if it doesn't.
 * Single word: every occurrence. Pattern: all parts, in order. Pair: every occurrence of any part.
 */
export function findWord(sentence: string, hanzi: string): [number, number][] | null {
  const parts = hanziParts(hanzi);
  if (parts.length === 0) return null;
  const ranges: [number, number][] = [];
  if (parts.length > 1 && isPattern(hanzi)) {
    // Each part must follow the previous one with something in between, so 以…为…
    // doesn't match the word 以为. Try every start position for the first part.
    for (let start = sentence.indexOf(parts[0]); start >= 0; start = sentence.indexOf(parts[0], start + 1)) {
      const found: [number, number][] = [[start, start + parts[0].length]];
      let from = start + parts[0].length + 1;
      for (const p of parts.slice(1)) {
        const i = sentence.indexOf(p, from);
        if (i < 0) break;
        found.push([i, i + p.length]);
        from = i + p.length + 1;
      }
      if (found.length === parts.length) return found;
    }
    return null;
  }
  for (const p of parts) {
    for (let i = sentence.indexOf(p); i >= 0; i = sentence.indexOf(p, i + p.length)) ranges.push([i, i + p.length]);
  }
  if (ranges.length === 0) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  // drop overlaps (e.g. a part that contains another)
  const kept: [number, number][] = [];
  for (const r of ranges) if (!kept.length || r[0] >= kept[kept.length - 1][1]) kept.push(r);
  return kept;
}

export const containsWord = (sentence: string, hanzi: string) => findWord(sentence, hanzi) !== null;

// ---------- Parsing what the user pastes on the Add page ----------

const EMOJI = /\p{Extended_Pictographic}(\u{FE0F}|\u{200D}\p{Extended_Pictographic})*/gu;

export interface ParsedWord {
  hanzi: string;
  emoji?: string;
  /** The rest of the line (e.g. pinyin or English the user typed) — a hint for the card writer. */
  note?: string;
}

/**
 * One entry per line. Several groups of characters on the same line stay one entry:
 * separated by "…" / "..." / "～" they form a grammar pattern (以…为…), otherwise a
 * pair of related words (浓 / 淡). An emoji is kept as the memory hook, and anything
 * else on the line (pinyin, English…) is kept as a note.
 */
export function parseWordList(text: string): ParsedWord[] {
  const out: ParsedWord[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const runs = raw.match(HAN_RUN);
    if (!runs) continue;
    const emoji = raw.match(EMOJI)?.join("") || undefined;
    const line = raw.replace(EMOJI, "").replace(/\s+/g, " ").trim();
    let hanzi = runs[0];
    if (runs.length > 1) {
      // Only look at what sits between/after the characters, not at a trailing translation.
      const afterLast = line.slice(line.lastIndexOf(runs[runs.length - 1]) + runs[runs.length - 1].length);
      const span = line.slice(line.indexOf(runs[0]), line.lastIndexOf(runs[runs.length - 1])) + afterLast.slice(0, 3);
      hanzi = /…|\.{2,}|⋯|～|~/.test(span)
        ? runs.join("…") + (/^\s*(…|\.{2,}|⋯|～|~)/.test(afterLast) ? "…" : "")
        : runs.join(" / ");
    }
    const key = wordKey(hanzi);
    if (seen.has(key)) continue;
    seen.add(key);
    // Anything beyond the characters and separators (letters, digits…) makes the line worth keeping.
    const extra = line.replace(HAN_RUN, "").replace(/[\s…⋯～~./,，、;；:：|()（）\-–—]+/g, "");
    out.push({ hanzi, emoji, note: extra ? line.slice(0, 300) : undefined });
  }
  return out;
}

