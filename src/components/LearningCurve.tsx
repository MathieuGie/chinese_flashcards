"use client";
import { useState } from "react";
import type { Direction, ReviewRecord } from "@/lib/types";

/**
 * Memory stability (days until recall drops to 90%) after each answer.
 * One line per direction (solid = 汉→EN, dashed = EN→汉); markers show the
 * answer: filled dot = remembered, cross = forgot. Log y-axis because
 * stability grows multiplicatively.
 */
const W = 420;
const H = 200;
const PAD = { l: 38, r: 12, t: 12, b: 26 };

const DIR_LABEL: Record<Direction, string> = { zh2en: "汉→EN", en2zh: "EN→汉" };

export function LearningCurve({ history }: { history: ReviewRecord[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = history.filter((h) => h.stabilityAfter != null);
  if (pts.length === 0)
    return <div className="text-sm text-ink-soft py-6 text-center">No reviews yet — the curve appears after your first answer.</div>;

  const maxS = Math.max(1, ...pts.map((p) => p.stabilityAfter!));
  const minS = 5 / 1440;
  const yMax = Math.pow(10, Math.ceil(Math.log10(maxS * 1.2)));
  const y = (s: number) => {
    const v = Math.log10(Math.max(minS, s));
    const lo = Math.log10(minS);
    const hi = Math.log10(yMax);
    return PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  };
  const x = (i: number) => PAD.l + (pts.length === 1 ? 0.5 : i / (pts.length - 1)) * (W - PAD.l - PAD.r);
  const TICKS: [number, string][] = [[10 / 1440, "10m"], [1 / 24, "1h"], [1, "1d"], [7, "1w"], [30, "1mo"], [365, "1y"]];
  const ticks = TICKS.filter(([t]) => t <= yMax);

  const dirs = (["zh2en", "en2zh"] as Direction[]).filter((d) => pts.some((p) => p.direction === d));
  const hp = hover != null ? pts[hover] : null;

  return (
    <div className="relative">
      <div className="flex gap-4 text-xs text-ink-soft mb-1 flex-wrap">
        {dirs.map((d) => (
          <span key={d} className="flex items-center gap-1.5">
            <svg width="22" height="6">
              <line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray={d === "en2zh" ? "4 3" : undefined} />
            </svg>
            {DIR_LABEL[d]}
          </span>
        ))}
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-jade" /> remembered</span>
        <span className="flex items-center gap-1"><span className="text-seal font-bold leading-none">✕</span> forgot</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Memory stability after each review">
        {ticks.map(([t, label]) => (
          <g key={label}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--ink-soft)">
              {label}
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} fontSize="12" fill="var(--ink-soft)">first review</text>
        <text x={W - PAD.r} y={H - 6} fontSize="12" fill="var(--ink-soft)" textAnchor="end">latest</text>
        {dirs.map((d) => {
          const line = pts
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.direction === d)
            .map(({ p, i }, k) => `${k ? "L" : "M"}${x(i)},${y(p.stabilityAfter!)}`)
            .join(" ");
          return (
            <path key={d} d={line} fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinejoin="round"
              strokeDasharray={d === "en2zh" ? "5 4" : undefined} />
          );
        })}
        {pts.map((p, i) => {
          const cx = x(i);
          const cy = y(p.stabilityAfter!);
          return (
            <g key={p.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
              <circle cx={cx} cy={cy} r="12" fill="transparent" />
              {p.correct ? (
                <circle cx={cx} cy={cy} r="4.5" fill="var(--jade)" stroke="var(--card)" strokeWidth="2" />
              ) : (
                <g stroke="var(--seal)" strokeWidth="2.5" strokeLinecap="round">
                  <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy + 4} />
                  <line x1={cx - 4} y1={cy + 4} x2={cx + 4} y2={cy - 4} />
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {hp && (
        <div
          className="absolute pointer-events-none panel px-3 py-2 text-xs shadow-lg whitespace-nowrap"
          style={{ left: `${(x(hover!) / W) * 100}%`, top: 24, transform: `translateX(${hover! > pts.length / 2 ? "-105%" : "5%"})` }}
        >
          <div className="font-medium">{new Date(hp.reviewedAt).toLocaleString()}</div>
          <div className="text-ink-soft">
            {DIR_LABEL[hp.direction]} · {hp.source} · {hp.correct ? "remembered" : "forgot"}
          </div>
          <div>Stability: {fmtDays(hp.stabilityAfter!)}</div>
        </div>
      )}
    </div>
  );
}

export function fmtDays(d: number) {
  if (d < 1 / 24) return `${Math.round(d * 1440)} min`;
  if (d < 1) return `${Math.round(d * 24)} h`;
  if (d < 60) return `${d.toFixed(d < 10 ? 1 : 0)} days`;
  if (d < 365) return `${Math.round(d / 30)} months`;
  return `${(d / 365).toFixed(1)} years`;
}
