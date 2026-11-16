"use client";
// Browser-side helpers.

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const tz = () => new Date().getTimezoneOffset();

let voice: SpeechSynthesisVoice | null | undefined;
/** Reads Chinese text aloud with the browser's built-in speech synthesis. */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  if (voice === undefined) {
    const voices = synth.getVoices();
    voice = voices.find((v) => /zh[-_]CN/i.test(v.lang)) ?? voices.find((v) => /^zh/i.test(v.lang)) ?? null;
  }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = 0.85;
  if (voice) u.voice = voice;
  synth.speak(u);
}

export function relativeTime(ms: number, now = Date.now()) {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [365 * 86400_000, "y"],
    [30 * 86400_000, "mo"],
    [86400_000, "d"],
    [3600_000, "h"],
    [60_000, "min"],
  ];
  for (const [size, label] of units) {
    if (abs >= size) {
      const v = Math.round(abs / size);
      return diff >= 0 ? `in ${v}${label}` : `${v}${label} ago`;
    }
  }
  return diff >= 0 ? "now" : "just now";
}
