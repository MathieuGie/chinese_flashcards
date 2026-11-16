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
- **Adding words**: paste a list (emoji after a word is kept as its memory hook). Pinyin + definitions come from
  CC-CEDICT; with `ANTHROPIC_API_KEY` set, Claude picks the sense, emoji and writes 6 example sentences,
  cross-checked against the dictionary. Without a key, sentences come from Tatoeba. Everything is editable before saving.

## Deploy to Vercel

1. Create a Turso database (`turso db create hanzi`, `turso db tokens create hanzi`) and set
   `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in Vercel. (Vercel's filesystem isn't persistent, so `local.db` won't work there.)
2. Set `APP_PASSWORD` so only you can use it, and `ANTHROPIC_API_KEY` for AI lookups.

Dictionary data: CC-CEDICT (CC BY-SA 4.0). Example sentences in fallback mode: Tatoeba (CC BY 2.0 FR).
