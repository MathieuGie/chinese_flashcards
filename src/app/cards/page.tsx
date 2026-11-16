"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MasteryBadge, RecallBar } from "@/components/Mastery";
import { api, relativeTime } from "@/lib/client";
import type { CardSummary, Mastery } from "@/lib/types";

const FILTERS: (Mastery | "all")[] = ["all", "new", "learning", "struggling", "young", "mature"];
const SORTS = { recent: "Recently added", weakest: "Weakest first", due: "Next due", az: "Pinyin A–Z" } as const;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "");

export default function CardsPage() {
  const [cards, setCards] = useState<CardSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [sort, setSort] = useState<keyof typeof SORTS>("recent");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ cards: CardSummary[] }>("/api/cards")
      .then((r) => setCards(r.cards))
      .catch((e) => setError((e as Error).message));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: cards?.length ?? 0 };
    for (const card of cards ?? []) c[card.mastery] = (c[card.mastery] ?? 0) + 1;
    return c;
  }, [cards]);

  const shown = useMemo(() => {
    if (!cards) return [];
    const q = fold(query);
    const nextDue = (c: CardSummary) => {
      const dues = Object.values(c.srs).map((s) => s!.due);
      return dues.length ? Math.min(...dues) : Infinity;
    };
    return cards
      .filter((c) => filter === "all" || c.mastery === filter)
      .filter(
        (c) => !q || c.hanzi.includes(query.trim()) || fold(c.pinyin).includes(q) || fold(c.english).includes(q),
      )
      .sort((a, b) => {
        if (sort === "weakest") return (a.retrievability ?? 2) - (b.retrievability ?? 2);
        if (sort === "due") return nextDue(a) - nextDue(b);
        if (sort === "az") return fold(a.pinyin).localeCompare(fold(b.pinyin));
        return b.createdAt - a.createdAt;
      });
  }, [cards, query, filter, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your cards</h1>
        <Link href="/add" className="btn-primary text-sm py-2">+ Add</Link>
      </div>
      <input
        className="input"
        placeholder="Search 汉字, pinyin (tones optional) or English…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex gap-2 flex-wrap items-center">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm border capitalize ${filter === f ? "border-seal bg-seal/10 text-seal" : "border-line text-ink-soft"}`}
          >
            {f} <span className="opacity-60">{counts[f] ?? 0}</span>
          </button>
        ))}
        <select
          className="ml-auto input w-auto py-1 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}
        >
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-xl bg-seal/10 text-seal px-3 py-2 text-sm">{error}</div>}
      {!cards && !error && <div className="text-ink-soft">Loading…</div>}

      <ul className="flex flex-col gap-2">
        {shown.map((c) => {
          const dues = Object.values(c.srs).map((s) => s!.due);
          return (
            <li key={c.id}>
              <Link href={`/cards/${c.id}`} className="panel px-4 py-3 flex items-center gap-3 hover:border-seal/40 transition">
                <span className="text-2xl w-8 text-center">{c.emoji || "💭"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-hanzi text-2xl font-semibold">{c.hanzi}</span>
                    <span className="text-sm text-ink-soft truncate">{c.pinyin}</span>
                  </div>
                  <div className="text-sm truncate">{c.english}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 w-28">
                  <MasteryBadge mastery={c.mastery} />
                  <RecallBar value={c.retrievability} />
                  <span className="text-[11px] text-ink-soft">
                    {dues.length ? `due ${relativeTime(Math.min(...dues))}` : "not studied"}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {cards && shown.length === 0 && <div className="text-center text-ink-soft py-8">No cards match.</div>}
    </div>
  );
}
