import "server-only";
import type { Row } from "@libsql/client";
import { getDb } from "./db";
import { wordKey } from "./hanzi";
import { applyGrade, masteryOf, retrievability, type DeckEntry } from "./srs";
import type { Grade } from "ts-fsrs";
import {
  DEFAULT_SETTINGS,
  type Card,
  type CardSummary,
  type Direction,
  type DraftCard,
  type PendingWord,
  type ReviewRecord,
  type Sentence,
  type Settings,
  type SrsState,
} from "./types";

const num = (v: unknown) => Number(v);

function rowToSrs(r: Row): SrsState {
  return {
    due: num(r.due),
    stability: num(r.stability),
    difficulty: num(r.difficulty),
    scheduledDays: num(r.scheduled_days),
    learningSteps: num(r.learning_steps),
    reps: num(r.reps),
    lapses: num(r.lapses),
    state: num(r.state),
    lastReview: r.last_review == null ? null : num(r.last_review),
  };
}

function rowToCard(r: Row, sentences: Sentence[]): Card {
  return {
    id: num(r.id),
    hanzi: String(r.hanzi),
    pinyin: String(r.pinyin),
    english: String(r.english),
    emoji: String(r.emoji ?? ""),
    notes: String(r.notes ?? ""),
    createdAt: num(r.created_at),
    sentences,
  };
}

async function sentencesByCard(cardIds?: number[]) {
  const db = await getDb();
  const res = cardIds
    ? await db.execute({
        sql: `SELECT * FROM sentences WHERE card_id IN (${cardIds.map(() => "?").join(",") || "NULL"}) ORDER BY id`,
        args: cardIds,
      })
    : await db.execute("SELECT * FROM sentences ORDER BY id");
  const map = new Map<number, Sentence[]>();
  for (const r of res.rows) {
    const id = num(r.card_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push({
      id: num(r.id),
      hanzi: String(r.hanzi),
      pinyin: String(r.pinyin),
      english: String(r.english),
    });
  }
  return map;
}

async function srsByCard() {
  const db = await getDb();
  const res = await db.execute("SELECT * FROM srs");
  const map = new Map<number, Partial<Record<Direction, SrsState>>>();
  for (const r of res.rows) {
    const id = num(r.card_id);
    if (!map.has(id)) map.set(id, {});
    map.get(id)![String(r.direction) as Direction] = rowToSrs(r);
  }
  return map;
}

export async function getCards(ids: number[]): Promise<Card[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT * FROM cards WHERE id IN (${ids.map(() => "?").join(",")})`,
    args: ids,
  });
  const sents = await sentencesByCard(ids);
  const byId = new Map(res.rows.map((r) => [num(r.id), rowToCard(r, sents.get(num(r.id)) ?? [])]));
  return ids.map((id) => byId.get(id)).filter((c): c is Card => !!c);
}

export async function getCard(id: number) {
  return (await getCards([id]))[0] ?? null;
}

export async function listCardSummaries(): Promise<CardSummary[]> {
  const db = await getDb();
  const [cards, sents, srs, counts] = await Promise.all([
    db.execute("SELECT * FROM cards ORDER BY created_at DESC, id DESC"),
    sentencesByCard(),
    srsByCard(),
    db.execute(`SELECT card_id, COUNT(*) AS n, SUM(correct) AS ok,
      -- accuracy over the last 8 answers for this card
      (SELECT AVG(correct) FROM (SELECT correct FROM reviews r2 WHERE r2.card_id = reviews.card_id ORDER BY reviewed_at DESC LIMIT 8)) AS recent
      FROM reviews GROUP BY card_id`),
  ]);
  const countMap = new Map(counts.rows.map((r) => [num(r.card_id), r]));
  const now = new Date();
  return cards.rows.map((r) => {
    const id = num(r.id);
    const s = srs.get(id) ?? {};
    const c = countMap.get(id);
    const rs = (["zh2en", "en2zh"] as Direction[])
      .map((d) => retrievability(s[d], now))
      .filter((x): x is number => x != null);
    return {
      ...rowToCard(r, sents.get(id) ?? []),
      srs: s,
      mastery: masteryOf([s.zh2en, s.en2zh], c?.recent == null ? null : num(c.recent), now),
      retrievability: rs.length ? Math.min(...rs) : null,
      reviewCount: c ? num(c.n) : 0,
      correctCount: c ? num(c.ok) : 0,
    };
  });
}

export async function loadDeck(): Promise<DeckEntry[]> {
  const db = await getDb();
  const [cards, srs] = await Promise.all([
    db.execute("SELECT id, created_at FROM cards"),
    srsByCard(),
  ]);
  return cards.rows.map((r) => ({
    cardId: num(r.id),
    createdAt: num(r.created_at),
    srs: srs.get(num(r.id)) ?? {},
  }));
}

/**
 * Looks up which of these entries are already in the deck → Map(given hanzi → card id).
 * Matches on wordKey, so 以…为… and "以 / 为" are the same entry (but 以为 is not).
 */
export async function findByHanzi(hanzi: string[]) {
  if (hanzi.length === 0) return new Map<string, number>();
  const db = await getDb();
  const res = await db.execute("SELECT id, hanzi FROM cards");
  const byKey = new Map(res.rows.map((r) => [wordKey(String(r.hanzi)), num(r.id)]));
  const out = new Map<string, number>();
  for (const h of hanzi) {
    const id = byKey.get(wordKey(h));
    if (id !== undefined) out.set(h, id);
  }
  return out;
}

export async function createCards(drafts: DraftCard[]): Promise<number[]> {
  const db = await getDb();
  const ids: number[] = [];
  const now = Date.now();
  for (const [i, d] of drafts.entries()) {
    const tx = await db.transaction("write");
    try {
      const res = await tx.execute({
        sql: `INSERT INTO cards (hanzi, pinyin, english, emoji, notes, source, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        // +i keeps the paste order stable for "oldest first" introduction
        args: [d.hanzi.trim(), d.pinyin.trim(), d.english.trim(), d.emoji, d.notes, d.source, now + i],
      });
      const id = num(res.lastInsertRowid);
      for (const s of d.sentences) {
        if (!s.hanzi.trim()) continue;
        await tx.execute({
          sql: "INSERT INTO sentences (card_id, hanzi, pinyin, english) VALUES (?, ?, ?, ?)",
          args: [id, s.hanzi.trim(), s.pinyin.trim(), s.english.trim()],
        });
      }
      await tx.commit();
      ids.push(id);
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.close();
    }
  }
  return ids;
}

export async function updateCard(
  id: number,
  patch: Partial<Pick<Card, "hanzi" | "pinyin" | "english" | "emoji" | "notes">> & {
    sentences?: Sentence[];
  },
) {
  const db = await getDb();
  const tx = await db.transaction("write");
  try {
    const fields = (["hanzi", "pinyin", "english", "emoji", "notes"] as const).filter(
      (k) => patch[k] !== undefined,
    );
    if (fields.length) {
      await tx.execute({
        sql: `UPDATE cards SET ${fields.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`,
        args: [...fields.map((f) => String(patch[f]).trim()), id],
      });
    }
    if (patch.sentences) {
      await tx.execute({ sql: "DELETE FROM sentences WHERE card_id = ?", args: [id] });
      for (const s of patch.sentences) {
        if (!s.hanzi.trim()) continue;
        await tx.execute({
          sql: "INSERT INTO sentences (card_id, hanzi, pinyin, english) VALUES (?, ?, ?, ?)",
          args: [id, s.hanzi.trim(), s.pinyin.trim(), s.english.trim()],
        });
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}

export async function deleteCard(id: number) {
  const db = await getDb();
  // Explicit child deletes: FK cascades aren't guaranteed on every libSQL host.
  await db.batch(
    [
      { sql: "DELETE FROM reviews WHERE card_id = ?", args: [id] },
      { sql: "DELETE FROM srs WHERE card_id = ?", args: [id] },
      { sql: "DELETE FROM sentences WHERE card_id = ?", args: [id] },
      { sql: "DELETE FROM cards WHERE id = ?", args: [id] },
    ],
    "write",
  );
}

/** Resets learning progress for a card (keeps the card itself). */
export async function resetCard(id: number) {
  const db = await getDb();
  await db.batch(
    [
      { sql: "DELETE FROM reviews WHERE card_id = ?", args: [id] },
      { sql: "DELETE FROM srs WHERE card_id = ?", args: [id] },
    ],
    "write",
  );
}

export async function recordReview(input: {
  cardId: number;
  direction: Direction;
  grade: Grade;
  source: "study" | "quiz" | "write";
  flipped: boolean;
  elapsedMs: number | null;
}) {
  const db = await getDb();
  const prevRes = await db.execute({
    sql: "SELECT * FROM srs WHERE card_id = ? AND direction = ?",
    args: [input.cardId, input.direction],
  });
  const prev = prevRes.rows[0] ? rowToSrs(prevRes.rows[0]) : null;
  const now = new Date();
  const next = applyGrade(prev, input.grade, now);
  await db.batch(
    [
      {
        sql: `INSERT INTO srs (card_id, direction, due, stability, difficulty, scheduled_days,
                learning_steps, reps, lapses, state, last_review)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(card_id, direction) DO UPDATE SET
                due = excluded.due, stability = excluded.stability, difficulty = excluded.difficulty,
                scheduled_days = excluded.scheduled_days, learning_steps = excluded.learning_steps,
                reps = excluded.reps, lapses = excluded.lapses, state = excluded.state,
                last_review = excluded.last_review`,
        args: [
          input.cardId, input.direction, next.due, next.stability, next.difficulty,
          next.scheduledDays, next.learningSteps, next.reps, next.lapses, next.state,
          next.lastReview,
        ],
      },
      {
        sql: `INSERT INTO reviews (card_id, direction, grade, correct, source, flipped,
                elapsed_ms, state_before, stability_after, reviewed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          input.cardId, input.direction, input.grade, input.grade > 1 ? 1 : 0, input.source,
          input.flipped ? 1 : 0, input.elapsedMs, prev?.state ?? 0, next.stability, now.getTime(),
        ],
      },
    ],
    "write",
  );
  return next;
}

export async function getHistory(cardId: number): Promise<ReviewRecord[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM reviews WHERE card_id = ? ORDER BY reviewed_at ASC",
    args: [cardId],
  });
  return res.rows.map((r) => ({
    id: num(r.id),
    direction: String(r.direction) as Direction,
    grade: num(r.grade),
    correct: num(r.correct) === 1,
    source: String(r.source) as "study" | "quiz" | "write",
    flipped: num(r.flipped) === 1,
    elapsedMs: r.elapsed_ms == null ? null : num(r.elapsed_ms),
    stateBefore: num(r.state_before),
    stabilityAfter: r.stability_after == null ? null : num(r.stability_after),
    reviewedAt: num(r.reviewed_at),
  }));
}

export async function getSrs(cardId: number) {
  const db = await getDb();
  const res = await db.execute({ sql: "SELECT * FROM srs WHERE card_id = ?", args: [cardId] });
  const out: Partial<Record<Direction, SrsState>> = {};
  for (const r of res.rows) out[String(r.direction) as Direction] = rowToSrs(r);
  return out;
}

/** Counts new (card, direction) introductions since `since` (ms). */
export async function newIntroducedSince(since: number) {
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM (
            SELECT DISTINCT card_id, direction FROM reviews
            WHERE state_before = 0 AND reviewed_at >= ? AND source = 'study')`,
    args: [since],
  });
  return num(res.rows[0].n);
}

export async function recentAccuracy(limit = 40) {
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT AVG(correct) AS acc, COUNT(*) AS n FROM
            (SELECT correct FROM reviews ORDER BY reviewed_at DESC LIMIT ?)`,
    args: [limit],
  });
  const n = num(res.rows[0].n);
  return { accuracy: n ? num(res.rows[0].acc) : null, count: n };
}

/** Reviews per day (keyed by local day offset from `tzOffsetMin`). */
export async function activity(days: number, tzOffsetMin: number) {
  const db = await getDb();
  const since = Date.now() - days * 86400_000;
  const res = await db.execute({
    sql: `SELECT CAST((reviewed_at - ?) / 86400000 AS INTEGER) AS day,
            COUNT(*) AS n, SUM(correct) AS ok
          FROM reviews WHERE reviewed_at >= ? GROUP BY day ORDER BY day`,
    args: [tzOffsetMin * 60_000, since],
  });
  return res.rows.map((r) => ({ day: num(r.day), count: num(r.n), correct: num(r.ok) }));
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const res = await db.execute("SELECT key, value FROM settings");
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const r of res.rows) {
    const k = String(r.key) as keyof Settings;
    if (k in s) {
      try {
        (s as unknown as Record<string, unknown>)[k] = JSON.parse(String(r.value));
      } catch {}
    }
  }
  return s;
}

export async function saveSettings(patch: Partial<Settings>) {
  const db = await getDb();
  const stmts = Object.entries(patch)
    .filter(([k]) => k in DEFAULT_SETTINGS)
    .map(([k, v]) => ({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [k, JSON.stringify(v)],
    }));
  if (stmts.length) await db.batch(stmts, "write");
  return getSettings();
}

// ---------- Waiting list: words added on the site, cards written later by Claude ----------

export async function listPending(): Promise<PendingWord[]> {
  const db = await getDb();
  const res = await db.execute("SELECT id, hanzi, emoji, note, created_at FROM pending ORDER BY created_at, id");
  return res.rows.map((r) => ({
    id: num(r.id),
    hanzi: String(r.hanzi),
    emoji: String(r.emoji),
    note: String(r.note),
    createdAt: num(r.created_at),
  }));
}

/** Queues words, skipping any already in the deck or already waiting. */
export async function addPending(words: { hanzi: string; emoji?: string; note?: string }[]) {
  const db = await getDb();
  const inDeck = await findByHanzi(words.map((w) => w.hanzi));
  const queued = new Set((await listPending()).map((p) => wordKey(p.hanzi)));
  const existing: { id: number; hanzi: string }[] = [];
  const alreadyQueued: string[] = [];
  const added: string[] = [];
  const now = Date.now();
  const stmts = [];
  for (const w of words) {
    if (inDeck.has(w.hanzi)) existing.push({ id: inDeck.get(w.hanzi)!, hanzi: w.hanzi });
    else if (queued.has(wordKey(w.hanzi))) alreadyQueued.push(w.hanzi);
    else {
      queued.add(wordKey(w.hanzi));
      added.push(w.hanzi);
      stmts.push({
        sql: "INSERT INTO pending (hanzi, emoji, note, created_at) VALUES (?, ?, ?, ?)",
        args: [w.hanzi, w.emoji ?? "", w.note?.trim() ?? "", now + stmts.length],
      });
    }
  }
  if (stmts.length) await db.batch(stmts, "write");
  return { added, existing, alreadyQueued };
}

export async function deletePending(id: number) {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM pending WHERE id = ?", args: [id] });
}

/** Removes words from the waiting list once they have become cards. */
export async function clearPending(hanzi: string[]) {
  if (hanzi.length === 0) return;
  const keys = new Set(hanzi.map(wordKey));
  const ids = (await listPending()).filter((p) => keys.has(wordKey(p.hanzi))).map((p) => p.id);
  if (ids.length === 0) return;
  const db = await getDb();
  await db.execute({ sql: `DELETE FROM pending WHERE id IN (${ids.map(() => "?").join(",")})`, args: ids });
}
