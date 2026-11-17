"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DirectionPicker } from "@/components/DirectionPicker";
import { Heatmap } from "@/components/Heatmap";
import { api, tz } from "@/lib/client";
import type { DirectionMode, Mastery, Settings } from "@/lib/types";

interface Stats {
  settings: Settings;
  total: number;
  mastery: Record<Mastery, number>;
  session: { dueCount: number; newAvailable: number; newAllowed: number; newIntroducedToday: number; throttled: string | null };
  sessionSize: number;
  recentAccuracy: number | null;
  streak: number;
  reviewedToday: number;
  today: number;
  activity: { day: number; count: number; correct: number }[];
  struggling: { id: number; hanzi: string; english: string }[];
  pendingCount: number;
}

const MASTERY_ORDER: { key: Mastery; label: string; cls: string }[] = [
  { key: "mature", label: "Mature", cls: "bg-jade" },
  { key: "young", label: "Young", cls: "bg-jade/50" },
  { key: "learning", label: "Learning", cls: "bg-gold" },
  { key: "struggling", label: "Struggling", cls: "bg-seal" },
  { key: "new", label: "New", cls: "bg-line" },
];

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<Stats>(`/api/stats?tz=${tz()}`)
      .then(setStats)
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    load();
  }, []);

  const saveSetting = async (patch: Partial<Settings>) => {
    await api("/api/settings", { method: "PATCH", json: patch });
    load();
  };

  if (error) return <div className="text-seal">{error}</div>;
  if (!stats) return <div className="text-ink-soft">Loading…</div>;

  const newToday = Math.min(stats.session.newAllowed, stats.session.newAvailable);

  return (
    <div className="flex flex-col gap-5">
      <section className="panel p-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex-1">
          <div className="font-hanzi text-3xl font-bold text-seal mb-1">字卡</div>
          <p className="text-ink-soft text-sm">
            {stats.session.dueCount > 0 || newToday > 0 ? (
              <>
                <strong className="text-ink">{stats.session.dueCount}</strong> review{stats.session.dueCount === 1 ? "" : "s"} due ·{" "}
                <strong className="text-ink">{newToday}</strong> new word{newToday === 1 ? "" : "s"} ready
              </>
            ) : (
              <>All caught up for now 🍵</>
            )}
          </p>
          {stats.pendingCount > 0 && (
            <p className="text-xs text-ink-soft mt-1">
              <Link href="/add" className="underline">{stats.pendingCount} word{stats.pendingCount === 1 ? "" : "s"}</Link> waiting
              for Claude to write their cards.
            </p>
          )}
          {stats.session.throttled === "struggling" && (
            <p className="text-xs text-gold mt-1">Recent accuracy is low — new words are slowed down so reviews can catch up.</p>
          )}
          {stats.session.throttled === "backlog" && (
            <p className="text-xs text-gold mt-1">Review backlog — new words are paused until you catch up.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/study" className="btn-primary px-6">Study{stats.sessionSize ? ` (${stats.sessionSize})` : ""}</Link>
          <Link href="/quiz" className="btn-ghost">Quiz</Link>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Words" value={stats.total} />
        <Tile label="Reviewed today" value={stats.reviewedToday} />
        <Tile label="Streak" value={`${stats.streak} day${stats.streak === 1 ? "" : "s"}`} />
        <Tile label="Recent accuracy" value={stats.recentAccuracy == null ? "—" : `${Math.round(stats.recentAccuracy * 100)}%`} />
      </section>

      <section className="panel p-4">
        <h2 className="font-semibold mb-3">Deck mastery</h2>
        <div className="flex h-3 rounded-full overflow-hidden gap-[2px] bg-card">
          {MASTERY_ORDER.filter((m) => stats.mastery[m.key] > 0).map((m) => (
            <div key={m.key} className={m.cls} style={{ flexGrow: stats.mastery[m.key] }} title={`${m.label}: ${stats.mastery[m.key]}`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-ink-soft">
          {MASTERY_ORDER.map((m) => (
            <span key={m.key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${m.cls}`} /> {m.label} <span className="text-ink">{stats.mastery[m.key]}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="font-semibold mb-3">Activity</h2>
        <Heatmap activity={stats.activity} today={stats.today} weeks={18} />
      </section>

      {stats.struggling.length > 0 && (
        <section className="panel p-4">
          <h2 className="font-semibold mb-2">Words you&apos;re struggling with</h2>
          <div className="flex flex-wrap gap-2">
            {stats.struggling.map((s) => (
              <Link key={s.id} href={`/cards/${s.id}`} className="rounded-xl border border-seal/30 bg-seal/5 px-3 py-1.5" title={s.english}>
                <span className="font-hanzi text-lg">{s.hanzi}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel p-4 flex flex-col gap-4">
        <h2 className="font-semibold">Settings</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-soft w-40">Card direction</span>
          <DirectionPicker value={stats.settings.direction} onChange={(v: DirectionMode) => saveSetting({ direction: v })} />
        </div>
        <NumberSetting key={`n${stats.settings.newPerDay}`} label="New words per day" value={stats.settings.newPerDay} min={0} max={100} onSave={(v) => saveSetting({ newPerDay: v })} />
        <NumberSetting key={`s${stats.settings.sessionSize}`} label="Cards per session" value={stats.settings.sessionSize} min={5} max={100} onSave={(v) => saveSetting({ sessionSize: v })} />
        <div className="flex gap-3 text-sm">
          <a href="/api/export" className="text-seal underline">Download backup (JSON)</a>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel p-4">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function NumberSetting({ label, value, min, max, onSave }: { label: string; value: number; min: number; max: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-ink-soft w-40">{label}</span>
      <input
        type="number"
        className="input w-24"
        min={min}
        max={max}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => Number(v) !== value && v !== "" && onSave(Number(v))}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}
