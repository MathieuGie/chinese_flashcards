"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CardEditor, type EditableCard } from "@/components/CardEditor";
import { EnFace, ZhFace } from "@/components/CardFaces";
import { fmtDays, LearningCurve } from "@/components/LearningCurve";
import { RecallBar } from "@/components/Mastery";
import { api, relativeTime } from "@/lib/client";
import type { Card, Direction, DraftCard, ReviewRecord, SrsState } from "@/lib/types";

interface Detail {
  card: Card;
  srs: Partial<Record<Direction, SrsState>>;
  retrievability: Record<Direction, number | null>;
  history: ReviewRecord[];
}

const STATE = ["New", "Learning", "Review", "Relearning"];
const DIR_LABEL: Record<Direction, string> = { zh2en: "Recognition · 汉→EN", en2zh: "Recall · EN→汉" };

export function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [edit, setEdit] = useState<EditableCard | null>(null);
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Detail>(`/api/cards/${id}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [id]);
  useEffect(load, [load]);

  if (error && !data) return <div className="text-seal">{error}</div>;
  if (!data) return <div className="text-ink-soft">Loading…</div>;
  const { card, srs, history } = data;
  const sentence = card.sentences[sentenceIdx % Math.max(1, card.sentences.length)] ?? null;
  const correct = history.filter((h) => h.correct).length;

  const save = async () => {
    if (!edit) return;
    setBusy("save");
    try {
      await api(`/api/cards/${id}`, { method: "PATCH", json: edit });
      setEdit(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    if (!edit) return;
    setBusy("regen");
    setError(null);
    try {
      const res = await api<{ drafts: DraftCard[] }>("/api/enrich", { method: "POST", json: { text: edit.hanzi } });
      const d = res.drafts[0];
      if (d) {
        setEdit({ ...edit, sentences: d.sentences.length ? d.sentences : edit.sentences, emoji: edit.emoji || d.emoji, notes: edit.notes || d.notes });
        if (d.warnings.length) setError(d.warnings.filter((w) => w !== "Already in your deck.").join(" ") || null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${card.hanzi} and its history?`)) return;
    await api(`/api/cards/${id}`, { method: "DELETE" });
    router.push("/cards");
  };

  const reset = async () => {
    if (!window.confirm(`Reset learning progress for ${card.hanzi}? It will become a new card again.`)) return;
    await api(`/api/cards/${id}/reset`, { method: "POST" });
    load();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link href="/cards" className="text-ink-soft hover:text-ink">← Cards</Link>
        <div className="ml-auto flex gap-2">
          {!edit && (
            <button className="btn-ghost text-sm py-1.5" onClick={() => setEdit({ ...card })}>
              Edit
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-xl bg-seal/10 text-seal px-3 py-2 text-sm">{error}</div>}

      {edit ? (
        <div className="panel p-4 flex flex-col gap-4">
          <CardEditor value={edit} onChange={setEdit} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={save} disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            <button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn-ghost" onClick={regenerate} disabled={busy !== null}>
              {busy === "regen" ? "Generating…" : "↻ Regenerate sentences"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="panel h-[26rem]">
              <ZhFace card={card} sentence={sentence} isAnswer />
            </div>
            <div className="panel h-[26rem]">
              <EnFace card={card} sentence={sentence} isAnswer />
            </div>
          </div>
          {card.sentences.length > 0 && (
            <div className="panel p-4">
              <h2 className="font-semibold mb-2">Example sentences</h2>
              <ol className="flex flex-col gap-2">
                {card.sentences.map((s, i) => (
                  <li key={s.id ?? i}>
                    <button
                      className={`text-left w-full rounded-xl px-3 py-2 transition ${i === sentenceIdx ? "bg-paper-2" : "hover:bg-paper-2/60"}`}
                      onClick={() => setSentenceIdx(i)}
                    >
                      <div className="font-hanzi text-lg">{s.hanzi}</div>
                      {s.pinyin && <div className="text-xs text-ink-soft">{s.pinyin}</div>}
                      <div className="text-sm text-ink-soft italic">{s.english}</div>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      <div className="panel p-4">
        <h2 className="font-semibold mb-3">Memory</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {(["zh2en", "en2zh"] as Direction[]).map((d) => {
            const s = srs[d];
            const r = data.retrievability[d];
            return (
              <div key={d} className="rounded-xl border border-line p-3 text-sm flex flex-col gap-1.5">
                <div className="font-medium">{DIR_LABEL[d]}</div>
                {s && s.state !== 0 ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-ink-soft w-24">Recall now</span>
                      <div className="flex-1"><RecallBar value={r} /></div>
                      <span className="w-10 text-right">{r != null ? `${Math.round(r * 100)}%` : "—"}</span>
                    </div>
                    <Row k="State" v={STATE[s.state]} />
                    <Row k="Next review" v={`${relativeTime(s.due)} (${new Date(s.due).toLocaleDateString()})`} />
                    <Row k="Stability" v={fmtDays(s.stability)} />
                    <Row k="Difficulty" v={`${s.difficulty.toFixed(1)} / 10`} />
                    <Row k="Reviews · lapses" v={`${s.reps} · ${s.lapses}`} />
                  </>
                ) : (
                  <div className="text-ink-soft">Not studied yet</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-semibold">Learning curve</h2>
          <span className="text-sm text-ink-soft">
            {history.length} answers · {history.length ? Math.round((correct / history.length) * 100) : 0}% correct
          </span>
        </div>
        <LearningCurve history={history} />
        {history.length > 0 && (
          <details className="mt-3">
            <summary className="text-sm text-ink-soft cursor-pointer">Full history (table)</summary>
            <table className="w-full text-sm mt-2">
              <thead className="text-left text-ink-soft text-xs">
                <tr><th className="py-1">When</th><th>Direction</th><th>Mode</th><th>Answer</th><th className="text-right">Stability</th></tr>
              </thead>
              <tbody>
                {[...history].reverse().map((h) => (
                  <tr key={h.id} className="border-t border-line">
                    <td className="py-1.5">{new Date(h.reviewedAt).toLocaleString()}</td>
                    <td>{h.direction === "zh2en" ? "汉→EN" : "EN→汉"}</td>
                    <td>{h.source}</td>
                    <td className={h.correct ? "text-jade" : "text-seal"}>
                      {h.correct ? (h.grade === 4 ? "✓ easy" : "✓ knew it") : "✕ again"}
                    </td>
                    <td className="text-right">{h.stabilityAfter != null ? fmtDays(h.stabilityAfter) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button className="btn-ghost text-sm" onClick={reset}>Reset progress</button>
        <button className="btn-ghost text-sm text-seal" onClick={remove}>Delete card</button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-ink-soft w-24 shrink-0">{k}</span>
      <span>{v}</span>
    </div>
  );
}
