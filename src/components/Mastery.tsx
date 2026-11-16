import type { Mastery } from "@/lib/types";

const STYLE: Record<Mastery, { label: string; cls: string }> = {
  new: { label: "new", cls: "bg-paper-2 text-ink-soft" },
  learning: { label: "learning", cls: "bg-gold/15 text-gold" },
  struggling: { label: "struggling", cls: "bg-seal/12 text-seal" },
  young: { label: "young", cls: "bg-jade/10 text-jade" },
  mature: { label: "mature", cls: "bg-jade/20 text-jade font-semibold" },
};

export function MasteryBadge({ mastery }: { mastery: Mastery }) {
  const s = STYLE[mastery];
  return <span className={`text-[11px] rounded-full px-2 py-0.5 ${s.cls}`}>{s.label}</span>;
}

/** Predicted probability of recalling the card right now. */
export function RecallBar({ value }: { value: number | null }) {
  if (value == null) return <div className="h-1.5 w-full rounded-full bg-paper-2" title="Not studied yet" />;
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? "bg-jade" : value >= 0.7 ? "bg-gold" : "bg-seal";
  return (
    <div className="h-1.5 w-full rounded-full bg-paper-2 overflow-hidden" title={`${pct}% predicted recall`}>
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
