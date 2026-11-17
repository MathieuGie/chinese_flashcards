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

This connects to the live database through the logged-in `turso` CLI. If it says
it can't reach the database, ask the user to run `~/.turso/turso auth login` in
their own terminal. Never ask for or print tokens.

Each entry has `hanzi`, an optional `emoji` the user chose (keep it), an optional
`note` (use it to pick the intended sense) and `cedict` hints with numbered pinyin.
If nothing is waiting, say so and stop.

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
