import type { Client } from "@libsql/client";
import { sentencePinyin } from "./pinyin";
import { SEED_WORDS } from "./seed-data";

/** Inserts the starter deck the very first time the database is used. */
export async function seedIfEmpty(db: Client) {
  const res = await db.execute("SELECT COUNT(*) AS n FROM cards");
  if (Number(res.rows[0].n) > 0) return;
  const seeded = await db.execute("SELECT value FROM settings WHERE key = '__seeded'");
  if (seeded.rows.length) return; // user deleted everything on purpose
  const base = Date.now();
  const tx = await db.transaction("write");
  try {
    for (const [i, w] of SEED_WORDS.entries()) {
      const r = await tx.execute({
        sql: `INSERT INTO cards (hanzi, pinyin, english, emoji, notes, source, created_at)
              VALUES (?, ?, ?, ?, ?, 'seed', ?)`,
        args: [w.hanzi, w.pinyin, w.english, w.emoji, w.notes, base + i],
      });
      for (const [hanzi, english] of w.sentences) {
        await tx.execute({
          sql: "INSERT INTO sentences (card_id, hanzi, pinyin, english) VALUES (?, ?, ?, ?)",
          args: [Number(r.lastInsertRowid), hanzi, sentencePinyin(hanzi), english],
        });
      }
    }
    await tx.execute("INSERT INTO settings (key, value) VALUES ('__seeded', 'true')");
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
