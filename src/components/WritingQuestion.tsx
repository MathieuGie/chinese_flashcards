"use client";
import { useEffect, useRef, useState } from "react";
import type HanziWriter from "hanzi-writer";

/**
 * Handwriting recall: the learner draws each character of the word, one at a time,
 * and every stroke is checked as it's drawn (Hanzi Writer). The answer counts as
 * remembered only if no character needed a hint or a "show me".
 */

export interface WritingResult {
  correct: boolean;
  mistakes: number;
  needed: string[]; // characters that needed help
  skipped: boolean; // stroke data unavailable — don't grade
}

type CharResult = { char: string; mistakes: number; helped: boolean; skipped?: boolean };

const MAX_MISTAKES_PER_CHAR = 2;

export function WritingQuestion({ chars, onDone }: { chars: string[]; onDone: (r: WritingResult) => void }) {
  const [results, setResults] = useState<CharResult[]>([]);
  const idx = results.length;
  const done = idx >= chars.length;

  const finishChar = (r: CharResult) => {
    const next = [...results, r];
    setResults(next);
    if (next.length === chars.length) {
      const mistakes = next.reduce((a, c) => a + c.mistakes, 0);
      const needed = next.filter((c) => c.helped || c.mistakes > MAX_MISTAKES_PER_CHAR).map((c) => c.char);
      onDone({ correct: needed.length === 0, mistakes, needed, skipped: next.some((c) => c.skipped) });
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {chars.length > 1 && (
        <div className="flex gap-2">
          {chars.map((c, i) => {
            const r = results[i];
            const cls = !r
              ? i === idx
                ? "border-seal text-seal"
                : "border-line text-ink-soft/40"
              : r.helped || r.mistakes > MAX_MISTAKES_PER_CHAR
                ? "border-seal/40 bg-seal/10"
                : "border-jade/40 bg-jade/10";
            return (
              <div key={i} className={`w-11 h-11 rounded-lg border-2 grid place-items-center font-hanzi text-2xl ${cls}`}>
                {r ? c : i === idx ? "✎" : "?"}
              </div>
            );
          })}
        </div>
      )}
      {!done && <CharPad key={idx} char={chars[idx]} onComplete={finishChar} />}
    </div>
  );
}

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback;
}

function CharPad({ char, onComplete }: { char: string; onComplete: (r: CharResult) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const helped = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mistakes, setMistakes] = useState(0);
  const [size, setSize] = useState(260);
  const report = useRef(onComplete);
  useEffect(() => {
    report.current = onComplete;
  }, [onComplete]);

  const startQuiz = (w: HanziWriter) =>
    w.quiz({
      showHintAfterMisses: 3,
      highlightOnComplete: true,
      onMistake: (s) => {
        setMistakes(s.totalMistakes);
        if (s.mistakesOnStroke >= 3) helped.current = true; // the hint stroke was shown
      },
      onComplete: (s) => {
        window.setTimeout(() => report.current({ char, mistakes: s.totalMistakes, helped: helped.current }), 700);
      },
    });

  useEffect(() => {
    let cancelled = false;
    const el = box.current;
    if (!el) return;
    const px = Math.min(280, Math.max(200, (el.parentElement?.clientWidth ?? 280) - 16));
    setSize(px);
    import("hanzi-writer").then(({ default: HW }) => {
      if (cancelled || !box.current) return;
      const w = HW.create(box.current, char, {
        width: px,
        height: px,
        padding: 12,
        showCharacter: false,
        showOutline: false,
        strokeColor: cssVar("--ink", "#1f1a17"),
        outlineColor: cssVar("--line", "#e4dccf"),
        drawingColor: cssVar("--seal", "#c8372d"),
        highlightColor: cssVar("--gold", "#c99a2e"),
        highlightCompleteColor: cssVar("--jade", "#2f8f6b"),
        drawingWidth: 10,
        onLoadCharDataSuccess: () => !cancelled && setStatus("ready"),
        onLoadCharDataError: () => !cancelled && setStatus("error"),
      });
      writer.current = w;
      startQuiz(w);
    });
    return () => {
      cancelled = true;
      writer.current?.cancelQuiz();
      writer.current = null;
      if (el) el.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char]);

  /** Gave up: animate the strokes, then let the learner trace it over the outline. */
  const showMe = () => {
    const w = writer.current;
    if (!w) return;
    helped.current = true;
    w.cancelQuiz();
    w.showOutline();
    w.animateCharacter({
      onComplete: () => {
        w.hideCharacter();
        startQuiz(w);
      },
    });
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative rounded-2xl border border-line bg-card" style={{ width: size, height: size, touchAction: "none" }}>
        {/* 米字格 practice grid */}
        <svg className="absolute inset-0 text-line pointer-events-none" width={size} height={size} aria-hidden>
          <g stroke="currentColor" strokeWidth="1" strokeDasharray="4 4">
            <line x1={size / 2} y1="0" x2={size / 2} y2={size} />
            <line x1="0" y1={size / 2} x2={size} y2={size / 2} />
            <line x1="0" y1="0" x2={size} y2={size} />
            <line x1={size} y1="0" x2="0" y2={size} />
          </g>
        </svg>
        <div ref={box} className="absolute inset-0" />
        {status === "loading" && <div className="absolute inset-0 grid place-items-center text-ink-soft text-sm">Loading strokes…</div>}
        {status === "error" && (
          <div className="absolute inset-0 grid place-items-center text-center p-4 text-sm text-seal">
            Couldn&apos;t load stroke data for {char}.
            <button className="btn-ghost mt-2" onClick={() => report.current({ char, mistakes: 0, helped: false, skipped: true })}>
              Skip this character
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-ink-soft">
          {mistakes === 0 ? "Draw the strokes in order" : `${mistakes} mistake${mistakes === 1 ? "" : "s"}`}
        </span>
        {status === "ready" && (
          <button className="text-seal underline" onClick={showMe}>
            Show me
          </button>
        )}
      </div>
    </div>
  );
}
