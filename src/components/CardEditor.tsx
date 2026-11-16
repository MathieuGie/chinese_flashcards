"use client";
import type { Sentence } from "@/lib/types";

export interface EditableCard {
  hanzi: string;
  pinyin: string;
  english: string;
  emoji: string;
  notes: string;
  sentences: Sentence[];
}

export function CardEditor<T extends EditableCard>({
  value,
  onChange,
}: {
  value: T;
  onChange: (v: T) => void;
}) {
  const set = <K extends keyof EditableCard>(k: K, v: EditableCard[K]) => onChange({ ...value, [k]: v });
  const setSentence = (i: number, patch: Partial<Sentence>) =>
    set(
      "sentences",
      value.sentences.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[5rem_1fr] sm:grid-cols-[5rem_1fr_1fr] gap-2">
        <Field label="Emoji">
          <input className="input text-center text-2xl" value={value.emoji} onChange={(e) => set("emoji", e.target.value)} />
        </Field>
        <Field label="汉字">
          <input className="input font-hanzi text-xl" value={value.hanzi} onChange={(e) => set("hanzi", e.target.value)} />
        </Field>
        <Field label="Pinyin" className="col-span-2 sm:col-span-1">
          <input className="input" value={value.pinyin} onChange={(e) => set("pinyin", e.target.value)} />
        </Field>
      </div>
      <Field label="English">
        <input className="input" value={value.english} onChange={(e) => set("english", e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea className="input min-h-16" value={value.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div>
        <div className="text-xs font-medium text-ink-soft mb-1.5">Example sentences ({value.sentences.length})</div>
        <div className="flex flex-col gap-2">
          {value.sentences.map((s, i) => (
            <div key={i} className="rounded-xl border border-line p-2 flex flex-col gap-1.5 bg-paper/50">
              <div className="flex gap-2">
                <input
                  className="input font-hanzi"
                  value={s.hanzi}
                  placeholder="中文句子"
                  onChange={(e) => setSentence(i, { hanzi: e.target.value })}
                />
                <button
                  type="button"
                  className="btn-ghost px-3 text-seal"
                  aria-label="Remove sentence"
                  onClick={() => set("sentences", value.sentences.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
              <input
                className="input text-sm"
                value={s.pinyin}
                placeholder="pinyin (optional)"
                onChange={(e) => setSentence(i, { pinyin: e.target.value })}
              />
              <input
                className="input text-sm"
                value={s.english}
                placeholder="English translation"
                onChange={(e) => setSentence(i, { english: e.target.value })}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost self-start text-sm"
            onClick={() => set("sentences", [...value.sentences, { hanzi: "", pinyin: "", english: "" }])}
          >
            + Add sentence
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
