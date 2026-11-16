"use client";
import { useState } from "react";
import { speak } from "@/lib/client";
import type { Card, Sentence } from "@/lib/types";

export function Highlight({ text, word }: { text: string; word: string }) {
  if (!word || !text.includes(word)) return <>{text}</>;
  const parts = text.split(word);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="text-seal font-semibold">{word}</span>}
        </span>
      ))}
    </>
  );
}

function SpeakButton({ text, className = "" }: { text: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Listen"
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`rounded-full w-9 h-9 grid place-items-center text-base bg-paper-2 hover:bg-line/60 transition ${className}`}
    >
      🔊
    </button>
  );
}

/** 汉字 side: characters, pinyin and one example sentence. */
export function ZhFace({
  card,
  sentence,
  isAnswer,
}: {
  card: Card;
  sentence: Sentence | null;
  isAnswer: boolean;
}) {
  const [showPinyin, setShowPinyin] = useState(false);
  const len = Array.from(card.hanzi).length;
  const size = len <= 2 ? "text-7xl sm:text-8xl" : len <= 3 ? "text-6xl sm:text-7xl" : "text-5xl sm:text-6xl";
  return (
    <div className="h-full flex flex-col items-center justify-between p-6 text-center">
      <div className="text-xs uppercase tracking-widest text-ink-soft/70">{isAnswer ? "answer" : "汉字 → English"}</div>
      <div className="flex flex-col items-center gap-3">
        <div className={`font-hanzi font-bold leading-tight ${size}`}>{card.hanzi}</div>
        <div className="flex items-center gap-2">
          <span className="text-xl text-ink-soft">{card.pinyin}</span>
          <SpeakButton text={card.hanzi} />
        </div>
      </div>
      <div className="w-full min-h-24">
        {sentence ? (
          <div className="rounded-2xl bg-paper-2/70 px-4 py-3">
            <div className="font-hanzi text-xl leading-relaxed">
              <Highlight text={sentence.hanzi} word={card.hanzi} />
            </div>
            {showPinyin && sentence.pinyin && (
              <div className="mt-1 text-sm text-ink-soft">{sentence.pinyin}</div>
            )}
            {isAnswer && sentence.english && (
              <div className="mt-1 text-sm text-ink-soft italic">{sentence.english}</div>
            )}
            <div className="mt-2 flex justify-center gap-2">
              <SpeakButton text={sentence.hanzi} className="w-8 h-8 text-sm" />
              {sentence.pinyin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPinyin((v) => !v);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="rounded-full px-3 h-8 text-xs bg-card border border-line text-ink-soft"
                >
                  {showPinyin ? "hide pinyin" : "pinyin"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-ink-soft/70">No example sentence yet</div>
        )}
      </div>
    </div>
  );
}

/** English side: translation and an emoji memory hook. */
export function EnFace({
  card,
  sentence,
  isAnswer,
}: {
  card: Card;
  sentence: Sentence | null;
  isAnswer: boolean;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-between p-6 text-center">
      <div className="text-xs uppercase tracking-widest text-ink-soft/70">{isAnswer ? "answer" : "English → 汉字"}</div>
      <div className="flex flex-col items-center gap-4">
        <div className="text-7xl sm:text-8xl leading-none">{card.emoji || "💭"}</div>
        <div className="text-2xl sm:text-3xl font-semibold leading-snug max-w-sm">{card.english}</div>
      </div>
      <div className="w-full min-h-24 flex flex-col justify-end gap-2">
        {isAnswer && card.notes && <div className="text-sm text-ink-soft leading-relaxed">{card.notes}</div>}
        {isAnswer && sentence?.english && (
          <div className="rounded-2xl bg-paper-2/70 px-4 py-3 text-sm">
            <div className="font-hanzi text-base">
              <Highlight text={sentence.hanzi} word={card.hanzi} />
            </div>
            <div className="text-ink-soft italic mt-0.5">{sentence.english}</div>
          </div>
        )}
        {!isAnswer && <div className="text-sm text-ink-soft/70">Can you write or say it?</div>}
      </div>
    </div>
  );
}
