"use client";
import { useState } from "react";

/** Reviews per day, GitHub-style. Columns = weeks (Mon→Sun), one hue light→dark. */
export function Heatmap({
  activity,
  today,
  weeks,
}: {
  activity: { day: number; count: number; correct: number }[];
  today: number; // local epoch day
  weeks: number;
}) {
  const [hover, setHover] = useState<{ day: number; count: number; correct: number } | null>(null);
  const byDay = new Map(activity.map((a) => [a.day, a]));
  const dow = (d: number) => (d + 3) % 7; // epoch day 0 was a Thursday; Monday = 0
  const lastCol = today - dow(today); // Monday of this week
  const start = lastCol - (weeks - 1) * 7;
  const max = Math.max(1, ...activity.map((a) => a.count));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const fill = ["var(--paper-2)", "color-mix(in oklab, var(--jade) 30%, var(--card))", "color-mix(in oklab, var(--jade) 55%, var(--card))", "color-mix(in oklab, var(--jade) 80%, var(--card))", "var(--jade)"];
  const C = 13;
  const G = 2;
  const dateOf = (d: number) => new Date(d * 86400_000).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

  return (
    <div>
      <div className="overflow-x-auto">
        <svg width={weeks * (C + G) + 24} height={7 * (C + G) + 2} role="img" aria-label="Reviews per day">
          {["M", "", "W", "", "F", "", ""].map((l, i) => (
            <text key={i} x="0" y={i * (C + G) + C - 2} fontSize="9" fill="var(--ink-soft)">{l}</text>
          ))}
          {Array.from({ length: weeks * 7 }, (_, k) => {
            const day = start + k;
            if (day > today) return null;
            const a = byDay.get(day) ?? { day, count: 0, correct: 0 };
            const col = Math.floor(k / 7);
            return (
              <rect
                key={day}
                x={16 + col * (C + G)}
                y={dow(day) * (C + G)}
                width={C}
                height={C}
                rx="3"
                fill={fill[level(a.count)]}
                stroke={day === today ? "var(--ink-soft)" : "none"}
                onMouseEnter={() => setHover(a)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(a)}
              >
                <title>{`${dateOf(day)}: ${a.count} reviews`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-ink-soft h-4">
        <span>
          {hover
            ? `${dateOf(hover.day)} · ${hover.count} review${hover.count === 1 ? "" : "s"}${hover.count ? ` · ${Math.round((hover.correct / hover.count) * 100)}% correct` : ""}`
            : "Hover a day for details"}
        </span>
        <span className="flex items-center gap-1">
          less {fill.map((f, i) => <span key={i} className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: f }} />)} more
        </span>
      </div>
    </div>
  );
}
