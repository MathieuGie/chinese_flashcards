import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

/**
 * CC-CEDICT (https://cc-cedict.org, CC BY-SA 4.0) — an open, community
 * maintained Chinese-English dictionary with ~120k entries. Used as ground
 * truth for pinyin and definitions; the AI step uses it as context.
 */

export interface CedictEntry {
  traditional: string;
  simplified: string;
  pinyin: string; // tone marks, e.g. "luó xuán"
  definitions: string[];
}

let dict: Promise<Map<string, CedictEntry[]>> | null = null;

function load() {
  if (!dict) {
    dict = (async () => {
      const file = path.join(process.cwd(), "data", "cedict.txt.gz");
      const text = gunzipSync(await readFile(file)).toString("utf8");
      const map = new Map<string, CedictEntry[]>();
      const re = /^(\S+) (\S+) \[([^\]]+)\] \/(.+)\/$/;
      for (const line of text.split("\n")) {
        if (!line || line.startsWith("#")) continue;
        const m = re.exec(line.trimEnd());
        if (!m) continue;
        const entry: CedictEntry = {
          traditional: m[1],
          simplified: m[2],
          pinyin: numberedToMarks(m[3]),
          definitions: m[4].split("/").filter(Boolean),
        };
        for (const key of new Set([entry.simplified, entry.traditional])) {
          const list = map.get(key);
          if (list) list.push(entry);
          else map.set(key, [entry]);
        }
      }
      return map;
    })().catch((e) => {
      dict = null;
      throw e;
    });
  }
  return dict;
}

export async function lookup(word: string): Promise<CedictEntry[]> {
  const map = await load();
  const entries = map.get(word) ?? [];
  // Proper-noun entries (capitalised pinyin, e.g. surnames) last; skip
  // "variant of" stubs when a real entry exists.
  const real = entries.filter((e) => !e.definitions.every((d) => /^(old |archaic )?variant of/.test(d)));
  return (real.length ? real : entries).sort(
    (a, b) => Number(/^[A-Z]/.test(a.pinyin)) - Number(/^[A-Z]/.test(b.pinyin)),
  );
}

/** Per-character fallback for idioms/compounds missing from the dictionary. */
export async function lookupChars(word: string) {
  const out: { char: string; entry: CedictEntry | null }[] = [];
  for (const ch of Array.from(word)) {
    out.push({ char: ch, entry: (await lookup(ch))[0] ?? null });
  }
  return out;
}

const TONES: Record<string, string[]> = {
  a: ["ā", "á", "ǎ", "à", "a"],
  e: ["ē", "é", "ě", "è", "e"],
  i: ["ī", "í", "ǐ", "ì", "i"],
  o: ["ō", "ó", "ǒ", "ò", "o"],
  u: ["ū", "ú", "ǔ", "ù", "u"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ", "ü"],
};

export function numberedToMarks(s: string) {
  return s
    .split(" ")
    .map((syl) => {
      const m = /^([a-zA-Z:üÜ]+)([1-5])$/.exec(syl);
      if (!m) return syl.replace(/u:/g, "ü");
      let base = m[1].replace(/u:/g, "ü").replace(/U:/g, "Ü");
      const tone = Number(m[2]) - 1;
      const lower = base.toLowerCase();
      let idx = lower.search(/[ae]/);
      if (idx < 0) idx = lower.indexOf("ou");
      if (idx < 0) {
        for (let i = lower.length - 1; i >= 0; i--) {
          if ("iouü".includes(lower[i])) {
            idx = i;
            break;
          }
        }
      }
      if (idx < 0) return base;
      const v = lower[idx];
      let marked = TONES[v][tone];
      if (base[idx] !== v) marked = marked.toUpperCase();
      base = base.slice(0, idx) + marked + base.slice(idx + 1);
      return base;
    })
    .join(" ");
}
