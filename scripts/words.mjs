#!/usr/bin/env node
/**
 * Turns words from the site's waiting list into flashcards.
 * Meant to be run by Claude in a Claude Code session (see .claude/skills/new-words).
 *
 *   npm run words -- list                    show waiting words (+ CC-CEDICT hints)
 *   npm run words -- import cards.json       validate and save cards, remove them from the list
 *   npm run words -- import cards.json --dry-run
 *
 * Database: the site's Turso database by default, reached through the logged-in
 * `turso` CLI. Which one is set in `.env.words` (git-ignored):
 *   TURSO_ORG=<org slug>   TURSO_DB=<database name>
 * Or set TURSO_DATABASE_URL/TURSO_AUTH_TOKEN directly, or use --local for local.db.
 *
 * cards.json is an array of:
 *   { "hanzi": "螺旋", "pinyin": "luóxuán", "english": "spiral; helix", "emoji": "🌀",
 *     "notes": "…", "sentences": [["中文句子。", "English sentence."], …] }
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { gunzipSync } from "node:zlib";
import { createClient } from "@libsql/client";
import { sentencePinyin } from "../src/lib/pinyin.ts";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const [cmd, file] = args.filter((a) => !a.startsWith("--"));
const ROOT = new URL("..", import.meta.url).pathname;

function connect() {
  if (flag("--local")) return { client: createClient({ url: `file:${ROOT}local.db` }), where: "local.db" };
  if (process.env.TURSO_DATABASE_URL)
    return {
      client: createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }),
      where: process.env.TURSO_DATABASE_URL,
    };
  const bin = existsSync(`${homedir()}/.turso/turso`) ? `${homedir()}/.turso/turso` : "turso";
  const { TURSO_DB: db, TURSO_ORG: org } = process.env;
  if (!db) {
    console.error("Set TURSO_DB (and TURSO_ORG) in .env.words to the database the site uses (see Vercel → Storage).");
    process.exit(1);
  }
  const turso = (...a) => execFileSync(bin, a, { encoding: "utf8" }).trim();
  // The turso CLI has no per-command org flag, so switch org for the lookup and switch back.
  let previousOrg;
  try {
    if (org) {
      previousOrg = turso("org", "list").split("\n").find((l) => l.includes("(current)"))?.trim().split(/\s+/)[1];
      if (previousOrg !== org) turso("org", "switch", org);
    }
    const url = turso("db", "show", db, "--url");
    const authToken = turso("db", "tokens", "create", db, "--expiration", "1d"); // short-lived, never printed
    return { client: createClient({ url, authToken }), where: `${db} (${url})` };
  } catch (e) {
    console.error(`Could not reach the Turso database "${db}"${org ? ` in org "${org}"` : ""}: ${e.message.split("\n")[0]}`);
    console.error(`If you're logged out, run \`${bin} auth login\` in your own terminal.`);
    process.exit(1);
  } finally {
    if (org && previousOrg && previousOrg !== org) {
      try { turso("org", "switch", previousOrg); } catch { /* best effort */ }
    }
  }
}

// ---------- CC-CEDICT hints and pinyin cross-check ----------

let dict;
function cedict(word) {
  if (!dict) {
    dict = new Map();
    const text = gunzipSync(readFileSync(`${ROOT}data/cedict.txt.gz`)).toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^(\S+) (\S+) \[([^\]]+)\] \/(.+)\/$/);
      if (!m) continue;
      for (const key of new Set([m[1], m[2]])) {
        if (!dict.has(key)) dict.set(key, []);
        dict.get(key).push({ pinyin: m[3], defs: m[4].split("/") });
      }
    }
  }
  return (dict.get(word) ?? []).filter((e) => !e.defs.every((d) => /^(old )?variant of/.test(d)));
}

const MARKS = { "\u0304": 1, "\u0301": 2, "\u030c": 3, "\u0300": 4 };
/** "luóxuán" → { letters: "luoxuan", tones: "24" } ; "luo2 xuan2" → same. Neutral tones are ignored. */
function pinyinKey(p) {
  const nfd = p.normalize("NFD").toLowerCase().replace(/u:/g, "u").replace(/v/g, "u");
  let tones = "";
  for (const ch of nfd) if (MARKS[ch]) tones += MARKS[ch];
  for (const d of nfd.match(/[1-4]/g) ?? []) tones += d;
  return { letters: nfd.replace(/[^a-z]/g, ""), tones };
}
const samePinyin = (a, b) => {
  const x = pinyinKey(a), y = pinyinKey(b);
  return x.letters === y.letters && x.tones === y.tones;
};

// ---------- commands ----------

async function list(db) {
  const res = await db.execute("SELECT hanzi, emoji, note, created_at FROM pending ORDER BY created_at, id");
  const words = res.rows.map((r) => ({
    hanzi: String(r.hanzi),
    emoji: String(r.emoji) || undefined,
    note: String(r.note) || undefined,
    added: new Date(Number(r.created_at)).toISOString().slice(0, 10),
    cedict: cedict(String(r.hanzi)).slice(0, 5).map((e) => `[${e.pinyin}] ${e.defs.slice(0, 6).join("; ")}`),
  }));
  console.log(JSON.stringify(words, null, 2));
  console.error(`\n${words.length} word(s) waiting.`);
}

function validate(c) {
  const errors = [];
  const warnings = [];
  if (!/^\p{Script=Han}+$/u.test(c.hanzi ?? "")) errors.push("hanzi must be Chinese characters only");
  if (!c.pinyin?.trim()) errors.push("missing pinyin");
  if (!c.english?.trim()) errors.push("missing english");
  if (!c.emoji?.trim()) errors.push("missing emoji");
  const s = Array.isArray(c.sentences) ? c.sentences : [];
  if (s.length < 4) errors.push(`only ${s.length} sentence(s), need 4–6`);
  const seen = new Set();
  for (const [i, pair] of s.entries()) {
    const [zh, en] = Array.isArray(pair) ? pair : [];
    if (!zh?.includes(c.hanzi)) errors.push(`sentence ${i + 1} doesn't contain ${c.hanzi}`);
    if (!en?.trim()) errors.push(`sentence ${i + 1} has no English`);
    if (zh && seen.has(zh)) errors.push(`sentence ${i + 1} is a duplicate`);
    seen.add(zh);
  }
  if (c.pinyin && c.hanzi) {
    const entries = cedict(c.hanzi);
    if (entries.length && !entries.some((e) => samePinyin(e.pinyin, c.pinyin)))
      warnings.push(`pinyin "${c.pinyin}" differs from CC-CEDICT: ${[...new Set(entries.map((e) => e.pinyin))].join(" | ")}`);
    if (!entries.length) warnings.push("not in CC-CEDICT — double-check pinyin");
  }
  return { errors, warnings };
}

async function importCards(db, path, dryRun) {
  const cards = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(cards)) throw new Error("cards file must be a JSON array");

  const hanzi = cards.map((c) => c.hanzi);
  const ph = hanzi.map(() => "?").join(",");
  const inDeck = new Set((await db.execute({ sql: `SELECT hanzi FROM cards WHERE hanzi IN (${ph})`, args: hanzi })).rows.map((r) => String(r.hanzi)));
  const queued = new Map(
    (await db.execute({ sql: `SELECT hanzi, created_at FROM pending WHERE hanzi IN (${ph})`, args: hanzi })).rows.map((r) => [String(r.hanzi), Number(r.created_at)]),
  );

  let ok = 0, failed = 0, skipped = 0;
  const now = Date.now();
  for (const [i, c] of cards.entries()) {
    if (inDeck.has(c.hanzi)) {
      console.log(`– ${c.hanzi}: already in the deck, skipped`);
      skipped++;
      continue;
    }
    const { errors, warnings } = validate(c);
    for (const w of warnings) console.log(`⚠ ${c.hanzi}: ${w}`);
    if (errors.length) {
      console.log(`✗ ${c.hanzi}: ${errors.join("; ")}`);
      failed++;
      continue;
    }
    if (dryRun) {
      console.log(`✓ ${c.hanzi} (${c.pinyin}) — ${c.english} — ${c.sentences.length} sentences [dry run]`);
      ok++;
      continue;
    }
    const tx = await db.transaction("write");
    try {
      const r = await tx.execute({
        sql: `INSERT INTO cards (hanzi, pinyin, english, emoji, notes, source, created_at) VALUES (?, ?, ?, ?, ?, 'claude', ?)`,
        // keep the order words were added in, so they're introduced oldest-first
        args: [c.hanzi, c.pinyin.trim(), c.english.trim(), c.emoji.trim(), (c.notes ?? "").trim(), queued.get(c.hanzi) ?? now + i],
      });
      for (const [zh, en] of c.sentences) {
        await tx.execute({
          sql: "INSERT INTO sentences (card_id, hanzi, pinyin, english) VALUES (?, ?, ?, ?)",
          args: [Number(r.lastInsertRowid), zh.trim(), sentencePinyin(zh.trim()), en.trim()],
        });
      }
      await tx.execute({ sql: "DELETE FROM pending WHERE hanzi = ?", args: [c.hanzi] });
      await tx.commit();
      console.log(`✓ ${c.hanzi} (${c.pinyin}) — ${c.english}`);
      ok++;
    } catch (e) {
      await tx.rollback();
      console.log(`✗ ${c.hanzi}: ${e.message}`);
      failed++;
    } finally {
      tx.close();
    }
  }
  const left = Number((await db.execute("SELECT COUNT(*) AS n FROM pending")).rows[0].n);
  console.log(`\n${dryRun ? "Would import" : "Imported"} ${ok}, failed ${failed}, skipped ${skipped}. ${left} word(s) still waiting.`);
  if (failed) process.exitCode = 1;
}

// ---------- main ----------

if (cmd !== "list" && cmd !== "import") {
  console.error("Usage: npm run words -- list | import <cards.json> [--dry-run] [--local]");
  process.exit(1);
}
const { client: db, where } = connect();
console.error(`Database: ${where}`);
try {
  // Guard against pointing at the wrong database: the site's has a populated cards table.
  const hasCards = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cards'")).rows.length;
  if (!hasCards && !flag("--local"))
    throw new Error("this database has no cards table — it isn't the one your site uses. Check .env.words.");
  // The site creates this table on first use; make sure it exists even before the next deploy.
  await db.execute(`CREATE TABLE IF NOT EXISTS pending (
    id INTEGER PRIMARY KEY AUTOINCREMENT, hanzi TEXT NOT NULL UNIQUE,
    emoji TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`);
  if (cmd === "list") await list(db);
  else {
    if (!file) throw new Error("import needs a cards.json path");
    await importCards(db, file, flag("--dry-run"));
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
