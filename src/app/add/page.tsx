"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CardEditor } from "@/components/CardEditor";
import { api } from "@/lib/client";
import type { DraftCard, PendingWord } from "@/lib/types";

type Draft = DraftCard & { include: boolean; open: boolean };
type Known = { id: number; hanzi: string };
type Notice =
  | { kind: "queued"; added: string[]; alreadyQueued: string[] }
  | { kind: "saved"; added: number; skipped: number };

export default function AddPage() {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<PendingWord[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [mode, setMode] = useState<"ai" | "dictionary" | null>(null);
  const [busy, setBusy] = useState<"queue" | "lookup" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [existing, setExisting] = useState<Known[]>([]);

  useEffect(() => {
    api<{ pending: PendingWord[] }>("/api/pending")
      .then((r) => setPending(r.pending))
      .catch((e) => setError((e as Error).message));
  }, []);

  const start = (what: NonNullable<typeof busy>) => {
    setBusy(what);
    setError(null);
    setNotice(null);
    setExisting([]);
  };

  /** Main path: put the words on the waiting list for Claude. */
  const queue = async () => {
    start("queue");
    try {
      const res = await api<{ added: string[]; existing: Known[]; alreadyQueued: string[]; pending: PendingWord[] }>(
        "/api/pending",
        { method: "POST", json: { text, note } },
      );
      setPending(res.pending);
      setExisting(res.existing);
      setNotice({ kind: "queued", added: res.added, alreadyQueued: res.alreadyQueued });
      setText("");
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const unqueue = async (id: number) => {
    try {
      const res = await api<{ pending: PendingWord[] }>("/api/pending", { method: "DELETE", json: { id } });
      setPending(res.pending);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** Secondary path: make cards immediately from the free dictionary. */
  const lookup = async () => {
    start("lookup");
    try {
      const res = await api<{ drafts: DraftCard[]; existing: Known[]; mode: "ai" | "dictionary" }>("/api/enrich", {
        method: "POST",
        json: { text },
      });
      setMode(res.mode);
      setExisting(res.existing);
      if (res.drafts.length === 0) {
        setDrafts(null);
        setText("");
        return;
      }
      setDrafts(res.drafts.map((d) => ({ ...d, include: !!d.english, open: false })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!drafts) return;
    start("save");
    try {
      const chosen = drafts.filter((d) => d.include);
      const res = await api<{ ids: number[]; skipped: number }>("/api/cards", {
        method: "POST",
        json: { cards: chosen },
      });
      setNotice({ kind: "saved", added: res.ids.length, skipped: res.skipped });
      setDrafts(null);
      setText("");
      // Saving a card also removes it from the waiting list.
      api<{ pending: PendingWord[] }>("/api/pending").then((r) => setPending(r.pending), () => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds && ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const included = drafts?.filter((d) => d.include).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Add words</h1>

      {notice?.kind === "saved" && (
        <div className="rounded-xl bg-jade/10 text-jade px-4 py-3 flex items-center justify-between">
          <span>
            Added {notice.added} card{notice.added === 1 ? "" : "s"} to your deck.
            {notice.skipped > 0 && ` (${notice.skipped} already there, skipped.)`}
          </span>
          <Link href="/study" className="underline font-medium">Study now →</Link>
        </div>
      )}
      {notice?.kind === "queued" && (notice.added.length > 0 || notice.alreadyQueued.length > 0) && (
        <div className="rounded-xl bg-jade/10 text-jade px-4 py-3 text-sm">
          {notice.added.length > 0 && (
            <div>
              Added to the waiting list: <span className="font-hanzi text-base">{notice.added.join("、")}</span>
            </div>
          )}
          {notice.alreadyQueued.length > 0 && (
            <div className="text-ink-soft">
              Already waiting: <span className="font-hanzi text-base">{notice.alreadyQueued.join("、")}</span>
            </div>
          )}
        </div>
      )}

      {existing.length > 0 && (
        <div className="rounded-xl bg-paper-2 px-4 py-3 text-sm">
          <span className="text-ink-soft">Already in your deck, so not added again: </span>
          {existing.map((e, i) => (
            <span key={e.id}>
              {i > 0 && "、"}
              <Link href={`/cards/${e.id}`} className="font-hanzi text-base text-seal underline">{e.hanzi}</Link>
            </span>
          ))}
        </div>
      )}

      {error && <div className="rounded-xl bg-seal/10 text-seal px-3 py-2 text-sm">{error}</div>}

      {!drafts && (
        <div className="panel p-4 flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            One entry per line. Add an emoji (like <span className="font-hanzi">螺旋🌀</span>) to choose the memory
            hook. Pinyin or English on the line is kept as a hint for which reading and meaning you want. Several
            words on one line stay together: <span className="font-hanzi">以…为…</span> becomes a grammar pattern,{" "}
            <span className="font-hanzi">浓 淡</span> a pair. Words go on a waiting list, and Claude writes their cards
            the next time you ask it to.
          </p>
          <textarea
            className="input font-hanzi text-lg min-h-40"
            placeholder={"螺旋🌀\n盛 shèng\n以…为…\n浓 淡"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <input
            className="input text-sm"
            placeholder="Optional note for all these words — e.g. where you saw them"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={queue} disabled={!text.trim() || busy !== null}>
              {busy === "queue" ? "Adding…" : "Add to waiting list"}
            </button>
            <button className="text-sm text-ink-soft underline" onClick={lookup} disabled={!text.trim() || busy !== null}>
              {busy === "lookup" ? "Looking up…" : "or make cards now from the dictionary"}
            </button>
          </div>
        </div>
      )}

      {!drafts && pending && pending.length > 0 && (
        <section className="panel p-4 flex flex-col gap-3">
          <div>
            <h2 className="font-semibold">Waiting for Claude ({pending.length})</h2>
            <p className="text-xs text-ink-soft mt-1">
              Open Claude Code in this project and say <em>“make cards for my new words”</em>. They&apos;ll then appear
              in your study sessions.
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-1.5 rounded-xl border border-line bg-card pl-3 pr-1 py-1"
                title={p.note || undefined}
              >
                {p.emoji && <span>{p.emoji}</span>}
                <span className="font-hanzi text-lg">{p.hanzi}</span>
                {p.note && <span className="text-xs text-ink-soft">✎</span>}
                <button
                  className="w-7 h-7 rounded-lg text-ink-soft hover:text-seal hover:bg-seal/10"
                  onClick={() => unqueue(p.id)}
                  aria-label={`Remove ${p.hanzi} from the waiting list`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {drafts && (
        <>
          {mode === "dictionary" && (
            <div className="rounded-xl bg-gold/10 text-ink px-4 py-3 text-sm">
              <strong>Dictionary mode:</strong> meanings come from CC-CEDICT and example sentences from Tatoeba. For
              better cards, go back and use the waiting list instead.
            </div>
          )}
          <div className="flex flex-col gap-3">
            {drafts.map((d, i) => (
              <div key={i} className={`panel p-4 ${d.include ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-2 w-5 h-5 accent-[var(--seal)]"
                    checked={d.include}
                    onChange={(e) => update(i, { include: e.target.checked })}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-3xl">{d.emoji || "💭"}</span>
                      <span className="font-hanzi text-3xl font-bold">{d.hanzi}</span>
                      <span className="text-ink-soft">{d.pinyin}</span>
                      <span className="text-xs rounded-full px-2 py-0.5 bg-paper-2 text-ink-soft">{d.source}</span>
                    </div>
                    <div className="mt-1">{d.english || <span className="text-seal">(no translation)</span>}</div>
                    {d.warnings.map((w, k) => (
                      <div key={k} className="text-xs text-gold mt-1">⚠ {w}</div>
                    ))}
                    {!d.open && d.sentences[0] && (
                      <div className="mt-2 text-sm text-ink-soft font-hanzi truncate">
                        {d.sentences[0].hanzi} <span className="font-sans">· +{d.sentences.length - 1} more</span>
                      </div>
                    )}
                    <button className="text-sm text-seal mt-2" onClick={() => update(i, { open: !d.open })}>
                      {d.open ? "Close editor" : "Review / edit"}
                    </button>
                    {d.open && (
                      <div className="mt-3">
                        <CardEditor value={d} onChange={(v) => update(i, v)} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="sticky bottom-20 sm:bottom-4 z-10 panel p-3 flex items-center gap-3 shadow-lg">
            <span className="text-sm text-ink-soft flex-1">
              {included} of {drafts.length} selected
            </span>
            <button className="btn-ghost" onClick={() => setDrafts(null)}>Back</button>
            <button className="btn-primary" onClick={save} disabled={included === 0 || busy !== null}>
              {busy === "save" ? "Saving…" : `Save ${included} card${included === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
