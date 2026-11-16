"use client";
import type { DirectionMode } from "@/lib/types";

const OPTIONS: { value: DirectionMode; label: string; title: string }[] = [
  { value: "zh2en", label: "汉→EN", title: "See the characters, guess the meaning" },
  { value: "en2zh", label: "EN→汉", title: "See the English, recall the characters" },
  { value: "both", label: "Both", title: "Mix both directions" },
];

export function DirectionPicker({
  value,
  onChange,
}: {
  value: DirectionMode;
  onChange: (v: DirectionMode) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-card p-1 text-sm">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg transition ${value === o.value ? "bg-seal text-white font-medium" : "text-ink-soft hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
