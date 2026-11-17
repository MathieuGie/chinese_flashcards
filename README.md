# 字卡 · Hanzi Deck

Personal Chinese flashcards with spaced repetition, swipe-to-grade, a quiz mode,
and automatic lookup of pinyin / translation / example sentences.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev                  # http://localhost:3000
```

Data lives in `./local.db` (SQLite), created and seeded with the starter deck on first request.
To start over, stop the server and delete `local.db`.

## How it works

- **Study**: tap a card to flip, swipe right if you knew it, left if not (← → / space on a keyboard).
  Left → the card comes back a few cards later. Right without flipping counts as *easy*.
- **Directions**: 汉→EN (recognition), EN→汉 (recall) or both. Each direction has its own memory state;
  in “both”, recall unlocks once recognition has graduated.
- **Scheduling**: [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) models each card's stability and
  difficulty from your full answer history. Sessions put due learning cards first, then reviews with the lowest
  predicted recall, with new cards interleaved, capped per day, and throttled if your recent accuracy drops
  below 75% or a review backlog builds up (`src/lib/srs.ts`).
- **Quiz**: meaning / characters / fill-in-the-blank / tones, weighted towards weak words; answers update the same
  schedule.
- **Adding words**: paste a list on the Add page (an emoji after a word is kept as its memory hook, and an
  optional note tells Claude which sense you mean). Words go on a **waiting list**; words already in the deck or
  already waiting are skipped.
- **Writing the cards**: open Claude Code in this folder and say *"make cards for my new words"*. The
  `new-words` skill (`.claude/skills/new-words`) reads the waiting list from the live database, writes pinyin,
  meaning, emoji, notes and 6 example sentences per word, and imports them with `npm run words -- import`, which
  validates each card (pinyin vs CC-CEDICT, every sentence contains the word) before saving. Needs the `turso` CLI
  logged in (`~/.turso/turso auth login`).
- **Instant fallback**: "make cards now from the dictionary" on the Add page builds cards straight away from
  CC-CEDICT + Tatoeba sentences (or via the Claude API if `ANTHROPIC_API_KEY` is set), editable before saving.

## Deploy to Vercel

1. Create a Turso database (`turso db create hanzi`, `turso db tokens create hanzi`) and set
   `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in Vercel. (Vercel's filesystem isn't persistent, so `local.db` won't work there.)
2. Set `APP_PASSWORD` so only you can use it. (`ANTHROPIC_API_KEY` is optional — only used by the instant fallback.)

Dictionary data: CC-CEDICT (CC BY-SA 4.0). Example sentences in fallback mode: Tatoeba (CC BY 2.0 FR).
