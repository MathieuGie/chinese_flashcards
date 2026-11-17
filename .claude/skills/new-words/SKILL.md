---
name: new-words
description: Write flashcards for the words waiting on the site's waiting list (added via the Add page) and save them to the live deck. Use when the user asks to make, write, process or look up cards for their new / pending / waiting words.
---

# Make cards for waiting words

The user adds Chinese words on the site's **Add** page. They land in the `pending`
table of the live Turso database. Your job: write a high-quality card for each and
import it with `scripts/words.mjs`, which validates the cards, generates sentence
pinyin, saves them and removes them from the waiting list.

## 1. Read the waiting list

```bash
npm run -s words -- list
```

This connects to the site's database through the logged-in `turso` CLI. Which
database is set in `.env.words` (git-ignored: `TURSO_ORG=…`, `TURSO_DB=…`). The site
uses the database Vercel's Turso integration created, which lives in its own Turso
org (`vercel-icfg-…`), not the personal one. The first line of output names the
database; the script refuses databases without a `cards` table.

If `.env.words` is missing, find the database with `npx vercel integration list`
(the Turso resource name) and `~/.turso/turso org list`, then recreate the file.
If it can't reach the database, ask the user to run `~/.turso/turso auth login` in
their own terminal. Never ask for or print tokens.

Each entry has `hanzi`, an optional `emoji` the user chose (keep it), an optional
`note` and `cedict` hints with numbered pinyin. If nothing is waiting, say so and stop.

- **`note`** is usually the user's whole pasted line, e.g. `盛 shèng flourishing`. Use
  any pinyin/English in it only to pick the intended reading and sense — still write
  the whole card yourself, from scratch.
- **Words listed on the same line.** The user writes one entry per line. Several words
  on one line (synonyms, opposites, related words) arrive as **separate entries that
  share the same `note`** (the whole line) — make **separate cards**, and use the
  other word(s) in `notes` (e.g. "Opposite: 淡 dàn").
- **Grammar patterns stay one card.** Parts joined by `…` arrive as one entry
  (`以…为…`, `越…越…`); every sentence must contain all parts, in order, not adjacent.
  If separate entries are clearly one pattern (e.g. 以 and 为 with the note
  `以 yǐ 为 wéi to regard as`), write a single card `"hanzi": "以…为…"` with
  `"replaces": ["以", "为"]` so both waiting entries are cleared.

## 2. Write the cards

Write a JSON array to a file in your scratchpad, one object per word, in exactly
this shape. Match the style of the starter deck in `src/lib/seed-data.ts` — read a
few entries there first.

```json
{
  "hanzi": "熬夜",
  "pinyin": "áoyè",
  "english": "to stay up late; to pull an all-nighter",
  "emoji": "🦉",
  "notes": "熬 = to endure / simmer slowly. 熬了一夜 stayed up all night; 熬通宵 pull an all-nighter.",
  "sentences": [["我昨天熬夜看球赛，今天特别困。", "I stayed up late watching the match, so I'm really sleepy today."]]
}
```

- **pinyin**: tone marks, syllables of one word joined (`luóxuán`); idioms and longer
  phrases spaced naturally (`yúfū yúfù`, `miù yǐ qiān lǐ`). Must agree with CC-CEDICT
  for the sense you chose.
- **english**: the 1–3 most useful senses, separated by `;`, concise. Pick the
  everyday sense first; follow the user's note if there is one.
- **emoji**: the user's emoji if given, otherwise one vivid emoji that works as a
  memory hook.
- **notes**: one or two short lines — common collocations, character breakdown, a
  register warning (formal/literary), or a confusable word. Optional but preferred.
- **sentences**: exactly **6** pairs. Each must contain the word exactly as written.
  Natural modern Mandarin, mostly HSK 3–5 vocabulary, 8–25 characters, varied
  contexts and grammar positions, ending with Chinese punctuation (。！？). English
  is a natural translation, not word-for-word.
- Single characters (e.g. 雍, 措) that rarely stand alone: give the meaning, and
  use sentences with the common words containing it, noted in `notes`.

## 3. Check, then import

```bash
npm run -s words -- import <file> --dry-run   # validate only
npm run -s words -- import <file>             # save to the live deck
```

Fix every ✗ error. For a ⚠ pinyin warning, re-check: if CC-CEDICT lists another
reading for a different sense, your choice may be right — keep it only if you're
sure. Words already in the deck are skipped automatically.

Use `--local` to work on `local.db` instead of the live deck (for testing).

## 4. Report

Tell the user which words were added (hanzi, pinyin, meaning, emoji), anything
skipped or uncertain, and that the new cards will appear in study sessions —
oldest-added first, within their daily new-word limit.
