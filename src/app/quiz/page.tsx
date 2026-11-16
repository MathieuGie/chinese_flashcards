"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Highlight } from "@/components/CardFaces";
import { api, speak } from "@/lib/client";
import type { QuizQuestion } from "@/lib/quiz";

const TYPE_LABEL: Record<QuizQuestion["type"], string> = {
  meaning: "What does this mean?",
  hanzi: "Which word is it?",
  cloze: "Fill in the blank",
  pinyin: "Pick the right pronunciation",
};

export default function QuizPage() {
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ questions: QuizQuestion[] }>(`/api/quiz?count=${count}`);
      setQuestions(res.questions);
      setIndex(0);
      setChosen(null);
      setResults([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const q = questions?.[index];

  const choose = (i: number) => {
    if (!q || chosen !== null) return;
    setChosen(i);
    const correct = i === q.answer;
    setResults((r) => [...r, correct]);
    if (q.type !== "meaning" || correct) speak(q.explanation.hanzi);
    api("/api/review", {
      method: "POST",
      json: { cardId: q.cardId, direction: q.direction, grade: correct ? "good" : "again", source: "quiz", flipped: true },
    }).catch((e) => setError(`Couldn't save: ${(e as Error).message}`));
  };

  const nextQ = () => {
    setChosen(null);
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return;
      if (chosen === null && ["1", "2", "3", "4"].includes(e.key)) choose(Number(e.key) - 1);
      else if (chosen !== null && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        nextQ();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!questions) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Quiz</h1>
        <div className="panel p-6 flex flex-col gap-5">
          <p className="text-ink-soft">
            A mixed test: meanings, characters, fill-in-the-blank sentences and tones. It focuses on the words you
            are most likely to have forgotten, and every answer updates that word&apos;s memory schedule.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-ink-soft mr-1">Questions:</span>
            {[5, 10, 20, 30].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`px-3 py-1.5 rounded-lg border text-sm ${count === n ? "border-seal bg-seal/10 text-seal font-medium" : "border-line"}`}
              >
                {n}
              </button>
            ))}
          </div>
          {error && <div className="rounded-xl bg-seal/10 text-seal px-3 py-2 text-sm">{error}</div>}
          <button className="btn-primary self-start" onClick={start} disabled={loading}>
            {loading ? "Preparing…" : "Start quiz"}
          </button>
        </div>
      </div>
    );
  }

  if (!q) {
    const score = results.filter(Boolean).length;
    const pct = Math.round((score / Math.max(1, results.length)) * 100);
    const missed = questions.filter((_, i) => results[i] === false);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Quiz results</h1>
        <div className="panel p-8 text-center flex flex-col items-center gap-3">
          <div className="text-6xl">{pct >= 90 ? "🏆" : pct >= 70 ? "👏" : pct >= 50 ? "💪" : "📖"}</div>
          <div className="text-4xl font-bold">
            {score}/{results.length}
          </div>
          <div className="text-ink-soft">{pct}% correct</div>
          <div className="flex gap-3 mt-2">
            <button className="btn-primary" onClick={start}>New quiz</button>
            <Link href="/study" className="btn-ghost">Study cards</Link>
          </div>
        </div>
        {missed.length > 0 && (
          <div className="panel p-4">
            <h2 className="font-semibold mb-3">Words to review</h2>
            <ul className="divide-y divide-line">
              {[...new Map(missed.map((m) => [m.cardId, m])).values()].map((m) => (
                <li key={m.cardId}>
                  <Link href={`/cards/${m.cardId}`} className="flex items-center gap-3 py-2 hover:bg-paper-2 rounded-lg px-2">
                    <span className="text-2xl">{m.explanation.emoji}</span>
                    <span className="font-hanzi text-2xl">{m.explanation.hanzi}</span>
                    <span className="text-ink-soft">{m.explanation.pinyin}</span>
                    <span className="ml-auto text-sm">{m.explanation.english}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quiz</h1>
        <span className="text-sm text-ink-soft">
          {index + 1} / {questions.length}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-paper-2 overflow-hidden">
        <div className="h-full bg-seal transition-all" style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>

      <div className="panel p-6 flex flex-col items-center gap-3 text-center min-h-56 justify-center">
        <div className="text-xs uppercase tracking-widest text-ink-soft/70">{TYPE_LABEL[q.type]}</div>
        {q.prompt.hanzi && <div className="font-hanzi text-6xl font-bold">{q.prompt.hanzi}</div>}
        {q.prompt.pinyin && <div className="text-xl text-ink-soft">{q.prompt.pinyin}</div>}
        {q.prompt.emoji && <div className="text-6xl">{q.prompt.emoji}</div>}
        {q.prompt.english && <div className="text-2xl font-semibold">{q.prompt.english}</div>}
        {q.prompt.sentence && (
          <>
            <div className="font-hanzi text-2xl leading-relaxed">{q.prompt.sentence}</div>
            {q.prompt.sentenceEnglish && <div className="text-sm text-ink-soft italic">{q.prompt.sentenceEnglish}</div>}
          </>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer;
          const state =
            chosen === null ? "idle" : isAnswer ? "correct" : chosen === i ? "wrong" : "dim";
          const hanziOpt = q.type === "hanzi" || q.type === "cloze";
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={chosen !== null}
              className={`text-left rounded-xl border px-4 py-3 transition flex items-center gap-3 ${
                state === "correct"
                  ? "border-jade bg-jade/10"
                  : state === "wrong"
                    ? "border-seal bg-seal/10"
                    : state === "dim"
                      ? "border-line opacity-50"
                      : "border-line bg-card hover:border-seal/50 hover:bg-paper-2"
              }`}
            >
              <span className="text-xs text-ink-soft w-4">{i + 1}</span>
              <span className={hanziOpt ? "font-hanzi text-2xl" : "text-base"}>{opt}</span>
              {state === "correct" && <span className="ml-auto">✓</span>}
              {state === "wrong" && <span className="ml-auto">✗</span>}
            </button>
          );
        })}
      </div>

      {chosen !== null && (
        <div className={`panel p-4 flex items-center gap-4 ${chosen === q.answer ? "border-jade/50" : "border-seal/50"}`}>
          <span className="text-4xl">{q.explanation.emoji}</span>
          <div className="flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-hanzi text-2xl font-semibold">{q.explanation.hanzi}</span>
              <span className="text-ink-soft">{q.explanation.pinyin}</span>
            </div>
            <div className="text-sm">{q.explanation.english}</div>
            {q.type === "cloze" && q.prompt.sentence && (
              <div className="font-hanzi text-sm text-ink-soft mt-1">
                <Highlight
                  text={q.prompt.sentence.replace(/＿+/g, q.explanation.hanzi)}
                  word={q.explanation.hanzi}
                />
              </div>
            )}
          </div>
          <button className="btn-primary" onClick={nextQ}>
            Next
          </button>
        </div>
      )}
      {error && <div className="rounded-xl bg-seal/10 text-seal px-3 py-2 text-sm">{error}</div>}
    </div>
  );
}
