import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { sentencePinyin, wordPinyin } from "./pinyin";
import { z } from "zod";
import { lookup, lookupChars, type CedictEntry } from "./cedict";
import type { DraftCard, Sentence } from "./types";

/**
 * Turns a raw word into a full card draft:
 *   1. CC-CEDICT gives authoritative pinyin + definitions (when the word is
 *      in the dictionary).
 *   2. Claude (if ANTHROPIC_API_KEY is set) picks the most useful sense,
 *      writes a concise English gloss, a memory-trigger emoji, usage notes,
 *      and 6 natural example sentences — grounded on the dictionary entry.
 *   3. Without an API key we fall back to dictionary + real sentences from
 *      Tatoeba (tatoeba.org, CC BY 2.0), and pinyin-pro for pinyin.
 * Everything is returned as an editable draft; nothing is saved until the
 * user confirms.
 */

const HAN = /[㐀-䶿一-鿿豈-﫿\u{20000}-\u{2fa1f}]/u;
const HAN_RUN = /[㐀-䶿一-鿿豈-﫿\u{20000}-\u{2fa1f}]+/gu;
const EMOJI = /\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu;

export interface ParsedWord {
  hanzi: string;
  emoji?: string;
}

/** Accepts anything pasted: one word per line, commas, spaces, emojis… */
export function parseWordList(text: string): ParsedWord[] {
  const out: ParsedWord[] = [];
  const seen = new Set<string>();
  for (const chunk of text.split(/[\n,，;；、|]+/)) {
    const runs = chunk.match(HAN_RUN);
    if (!runs) continue;
    const emoji = chunk.match(EMOJI)?.join("");
    // "螺旋 🌀" → one word; "跨 顺滑" on one line → two words
    for (const hanzi of runs) {
      if (seen.has(hanzi)) continue;
      seen.add(hanzi);
      out.push({ hanzi, emoji: runs.length === 1 ? emoji : undefined });
    }
  }
  return out;
}

/** Joins syllables for short words ("luó xuán" → "luóxuán"), keeps idioms spaced. */
function displayPinyin(p: string, hanzi: string) {
  return Array.from(hanzi).length <= 3 ? p.replace(/ /g, "") : p;
}

function hasApiKey() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function enrichmentMode() {
  return hasApiKey() ? "ai" : "dictionary";
}

// ---------------------------------------------------------------------------
// AI enrichment
// ---------------------------------------------------------------------------

const AiCard = z.object({
  pinyin: z.string().describe("Tone-marked pinyin of the word, e.g. luóxuán"),
  english: z
    .string()
    .describe("Concise English gloss, max ~6 words; separate 2 senses with '; '"),
  emoji: z.string().describe("1 or 2 emoji that evoke the meaning, as a memory hook"),
  notes: z
    .string()
    .describe("1-2 short sentences: usage, register, collocations, or idiom origin"),
  sentences: z
    .array(
      z.object({
        hanzi: z.string().describe("Sentence in simplified Chinese containing the exact word"),
        pinyin: z.string().describe("Tone-marked pinyin of the whole sentence"),
        english: z.string().describe("Natural English translation"),
      }),
    )
    .describe("Exactly 6 example sentences"),
});

const SYSTEM = `You are an expert teacher of Mandarin Chinese building flashcards for an intermediate learner (around HSK 4-5) who collects words met in videos and books.

For the word given, produce:
- The correct tone-marked pinyin for the sense you choose (use the dictionary entries provided when present; they are authoritative). Write pinyin without spaces for words of 1-3 characters, and with spaces between syllables for longer words/idioms. Apply 一/不 tone sandhi as spoken.
- A concise English gloss of the most common modern sense (add a second sense after "; " only if it is very common).
- 1-2 emoji that make a vivid memory hook for the meaning.
- A short usage note (register, typical collocations, grammar pattern, or the origin/full form of an idiom).
- Exactly 6 example sentences in simplified Chinese. Each must contain the exact word as written. Make them natural, everyday, varied in context and structure, 8-25 characters, using vocabulary simpler than the target word where possible. If the word has several common senses, cover them. If the word is literary or a fragment of a longer idiom, show how it is actually used today.`;

async function aiEnrich(word: ParsedWord, entries: CedictEntry[]): Promise<Omit<DraftCard, "warnings">> {
  const client = new Anthropic();
  const dictText = entries.length
    ? entries
        .slice(0, 4)
        .map((e) => `- ${e.simplified} [${e.pinyin}]: ${e.definitions.join("; ")}`)
        .join("\n")
    : "(not found in CC-CEDICT — rely on your own knowledge; it may be an idiom, a compound, or a fragment)";

  const response = await client.beta.messages.parse({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(AiCard) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Word: ${word.hanzi}\n\nCC-CEDICT entries:\n${dictText}`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`AI could not generate this card (stop_reason: ${response.stop_reason})`);
  }
  const out = response.parsed_output;
  return {
    hanzi: word.hanzi,
    pinyin: out.pinyin.trim(),
    english: out.english.trim(),
    emoji: word.emoji || out.emoji.trim(),
    notes: out.notes.trim(),
    sentences: out.sentences.map((s) => ({
      hanzi: s.hanzi.trim(),
      pinyin: s.pinyin.trim() || sentencePinyin(s.hanzi),
      english: s.english.trim(),
    })),
    source: "ai",
  };
}

// ---------------------------------------------------------------------------
// Offline-ish fallback: dictionary + Tatoeba
// ---------------------------------------------------------------------------

async function tatoebaSentences(word: string, limit = 6): Promise<Sentence[]> {
  const exact = await tatoebaQuery(word, `="${word}"`, limit);
  if (exact.length >= 3) return exact;
  // exact-phrase search misses some idioms/compounds: retry as a plain search
  const loose = await tatoebaQuery(word, word, limit);
  const seen = new Set(exact.map((s) => s.hanzi));
  return [...exact, ...loose.filter((s) => !seen.has(s.hanzi))].slice(0, limit);
}

async function tatoebaQuery(word: string, q: string, limit: number): Promise<Sentence[]> {
  const url = new URL("https://api.tatoeba.org/unstable/sentences");
  url.searchParams.set("lang", "cmn");
  url.searchParams.set("q", q);
  url.searchParams.set("trans:lang", "eng");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("limit", "30");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data: { text: string; script?: string; translations?: unknown[] }[];
    };
    const out: Sentence[] = [];
    for (const s of data.data ?? []) {
      if (s.script === "Hant" || !s.text.includes(word)) continue;
      const tr = (s.translations ?? [])
        .flat()
        .find((t): t is { text: string; lang: string } =>
          typeof t === "object" && t !== null && (t as { lang?: string }).lang === "eng",
        );
      if (!tr) continue;
      // prefer short, learner-friendly sentences
      if (Array.from(s.text).length > 30) continue;
      out.push({ hanzi: s.text, pinyin: sentencePinyin(s.text), english: tr.text });
    }
    return out.sort((a, b) => a.hanzi.length - b.hanzi.length).slice(0, limit);
  } catch {
    return [];
  }
}

async function dictionaryEnrich(word: ParsedWord, entries: CedictEntry[]): Promise<DraftCard> {
  const warnings: string[] = [];
  let english: string;
  let pinyin: string;
  let notes = "";
  if (entries.length) {
    const main = entries[0];
    pinyin = displayPinyin(main.pinyin, word.hanzi);
    english = main.definitions
      .filter((d) => !/^(CL|variant of|see )/.test(d))
      .slice(0, 3)
      .join("; ");
    if (entries.length > 1)
      notes = entries
        .slice(1, 3)
        .map((e) => `${e.pinyin}: ${e.definitions.slice(0, 2).join("; ")}`)
        .join(" · ");
  } else {
    pinyin = displayPinyin(wordPinyin(word.hanzi), word.hanzi);
    const chars = await lookupChars(word.hanzi);
    english = "";
    notes = chars
      .map((c) => `${c.char} = ${c.entry ? c.entry.definitions.slice(0, 2).join(", ") : "?"}`)
      .join(" · ");
    warnings.push("Not in the dictionary — please write the English meaning.");
  }
  const sentences = await tatoebaSentences(word.hanzi);
  if (sentences.length < 3)
    warnings.push(`Only ${sentences.length} example sentence(s) found — add some or set ANTHROPIC_API_KEY.`);
  return {
    hanzi: word.hanzi,
    pinyin,
    english,
    emoji: word.emoji ?? "",
    notes,
    sentences,
    source: "dictionary",
    warnings,
  };
}

// ---------------------------------------------------------------------------

export async function enrichWord(word: ParsedWord): Promise<DraftCard> {
  const entries = await lookup(word.hanzi);
  if (!hasApiKey()) return dictionaryEnrich(word, entries);
  try {
    const card = await aiEnrich(word, entries);
    const warnings: string[] = [];
    // Validate the AI output against the dictionary + itself.
    const valid = card.sentences.filter((s) => s.hanzi.includes(word.hanzi) && HAN.test(s.hanzi));
    if (valid.length < card.sentences.length)
      warnings.push(`${card.sentences.length - valid.length} sentence(s) didn't contain the word and were dropped.`);
    card.sentences = valid;
    if (entries.length) {
      const strip = (p: string) => p.normalize("NFD").replace(/[̀-ͯ\s]/g, "").toLowerCase();
      const dictPinyins = entries.map((e) => strip(e.pinyin));
      if (!dictPinyins.includes(strip(card.pinyin)))
        warnings.push(`Pinyin differs from the dictionary (${entries.map((e) => e.pinyin).join(" / ")}) — double-check.`);
    }
    return { ...card, warnings };
  } catch (e) {
    const fallback = await dictionaryEnrich(word, entries);
    fallback.warnings.unshift(`AI generation failed (${(e as Error).message}); used dictionary instead.`);
    return fallback;
  }
}

export async function enrichWords(words: ParsedWord[], concurrency = 4): Promise<DraftCard[]> {
  const results: DraftCard[] = new Array(words.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, words.length) }, async () => {
      while (i < words.length) {
        const idx = i++;
        results[idx] = await enrichWord(words[idx]);
      }
    }),
  );
  return results;
}
