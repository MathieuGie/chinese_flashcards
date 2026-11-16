"use client";
import Link from "next/link";
import { useState } from "react";
import { CardEditor } from "@/components/CardEditor";
import { api } from "@/lib/client";
import type { DraftCard } from "@/lib/types";

type Draft = DraftCard & { include: boolean; open: boolean };

export default function AddPage() {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [mode, setMode] = useState<"ai" | "dictionary" | null>(null);
  const [busy, setBusy] = useState<"lookup" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ added: number; skipped: number } | null>(null);
  const [existing, setExisting] = useState<{ id: number; hanzi: string }[]>([]);

  const lookup = async () => {
    setBusy("lookup");
    setError(null);
    setSaved(null);
    setExisting([]);
    try {
      const res = await api<{ drafts: DraftCard[]; existing: { id: number; hanzi: string }[]; mode: "ai" | "dictionary" }>(
        "/api/enrich",
        { method: "POST", json: { text } },
      );
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
    setBusy("save");
    setError(null);
    try {
      const chosen = drafts.filter((d) => d.include);
      const res = await api<{ ids: number[]; skipped: number }>("/api/cards", {
        method: "POST",
        json: { cards: chosen },
      });
      setSaved({ added: res.ids.length, skipped: res.skipped });
      setExisting([]);
      setDrafts(null);
      setText("");
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

      {saved !== null && (
        <div className="rounded-xl bg-jade/10 text-jade px-4 py-3 flex items-center justify-between">
          <span>
            Added {saved.added} card{saved.added === 1 ? "" : "s"} to your deck.
            {saved.skipped > 0 && ` (${saved.skipped} already there, skipped.)`}
          </span>
          <Link href="/study" className="underline font-medium">Study now →</Link>
        </div>
      )}

      {!drafts && (
        <div className="panel p-4 flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            Paste one or many words — one per line, or separated by commas. You can add an emoji after a word
            (like <span className="font-hanzi">螺旋🌀</span>) to use it as the memory hook. Pinyin, translation and
            example sentences are looked up for you, and you can review everything before saving.
          </p>
          <textarea
            className="input font-hanzi text-lg min-h-40"
            placeholder={"螺旋🌀\n跨\n顺滑"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn-primary self-start" onClick={lookup} disabled={!text.trim() || busy !== null}>
            {busy === "lookup" ? "Looking up… (can take a few seconds per word)" : "Look up"}
          </button>
        </div>
      )}

      {error && <div className="rounded-xl bg-seal/10 text-seal px-3 py-2 text-sm">{error}</div>}

      {existing.length > 0 && (
        <div className="rounded-xl bg-paper-2 px-4 py-3 text-sm">
          <span className="text-ink-soft">
            {drafts ? "Already in your deck, so not added again: " : existing.length === 1 ? "Already in your deck: " : `All ${existing.length} words are already in your deck: `}
          </span>
          {existing.map((e, i) => (
            <span key={e.id}>
              {i > 0 && "、"}
              <Link href={`/cards/${e.id}`} className="font-hanzi text-base text-seal underline">{e.hanzi}</Link>
            </span>
          ))}
        </div>
      )}

      {drafts && (
        <>
          {mode === "dictionary" && (
            <div className="rounded-xl bg-gold/10 text-ink px-4 py-3 text-sm">
              <strong>Dictionary mode:</strong> meanings come from CC-CEDICT and example sentences from Tatoeba.
              Set <code className="px-1 rounded bg-paper-2">ANTHROPIC_API_KEY</code> to have Claude pick the best sense,
              choose an emoji and write 6 tailored sentences per word.
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
