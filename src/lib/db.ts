import "server-only";
import { createClient, type Client, type InStatement } from "@libsql/client";
import { connection } from "next/server";

/**
 * Database access.
 *
 * Locally this is a SQLite file (`local.db`). On Vercel the filesystem is
 * read-only/ephemeral, so set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN to point
 * at a hosted libSQL (Turso) database — the code is identical.
 */

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hanzi TEXT NOT NULL UNIQUE,
    pinyin TEXT NOT NULL,
    english TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sentences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    hanzi TEXT NOT NULL,
    pinyin TEXT NOT NULL DEFAULT '',
    english TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sentences_card ON sentences(card_id)`,
  // One FSRS memory state per (card, direction). A missing row == "new".
  `CREATE TABLE IF NOT EXISTS srs (
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,
    due INTEGER NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL,
    scheduled_days INTEGER NOT NULL,
    learning_steps INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    lapses INTEGER NOT NULL,
    state INTEGER NOT NULL,
    last_review INTEGER,
    PRIMARY KEY (card_id, direction)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_srs_due ON srs(due)`,
  // Full history: every swipe and every quiz answer.
  `CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,
    grade INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    source TEXT NOT NULL,
    flipped INTEGER NOT NULL DEFAULT 0,
    elapsed_ms INTEGER,
    state_before INTEGER NOT NULL,
    stability_after REAL,
    reviewed_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_card ON reviews(card_id, reviewed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_time ON reviews(reviewed_at)`,
  // Words added on the site, waiting for Claude (in a Claude Code session) to
  // write their cards. See scripts/words.mjs and .claude/skills/new-words.
  `CREATE TABLE IF NOT EXISTS pending (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hanzi TEXT NOT NULL UNIQUE,
    emoji TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

const globalForDb = globalThis as unknown as {
  __db?: Client;
  __dbReady?: Promise<void>;
};

function client(): Client {
  if (!globalForDb.__db) {
    const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
    globalForDb.__db = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return globalForDb.__db;
}

async function init() {
  const db = client();
  await db.execute("PRAGMA foreign_keys = ON");
  await db.batch(SCHEMA, "write");
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(db);
}

/** Returns a ready-to-use client (schema created, starter deck seeded). */
export async function getDb(): Promise<Client> {
  // DB results are per-request data: never prerender them.
  await connection();
  if (!globalForDb.__dbReady) {
    globalForDb.__dbReady = init().catch((e) => {
      globalForDb.__dbReady = undefined;
      throw e;
    });
  }
  await globalForDb.__dbReady;
  return client();
}

export async function batch(stmts: InStatement[]) {
  const db = await getDb();
  return db.batch(stmts, "write");
}
