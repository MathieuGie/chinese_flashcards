import { activity, getSettings, listCardSummaries, listPending, loadDeck, newIntroducedSince, recentAccuracy } from "@/lib/repo";
import { planSession } from "@/lib/srs";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const tz = Number(req.nextUrl.searchParams.get("tz") ?? 0);
  const now = new Date();
  const localNow = now.getTime() - tz * 60_000;
  const midnight = localNow - (localNow % 86400_000) + tz * 60_000;
  const [settings, cards, deck, newToday, acc, days, pending] = await Promise.all([
    getSettings(),
    listCardSummaries(),
    loadDeck(),
    newIntroducedSince(midnight),
    recentAccuracy(),
    activity(7 * 18, tz),
    listPending(),
  ]);
  const plan = planSession(deck, {
    settings,
    mode: settings.direction,
    newIntroducedToday: newToday,
    recentAccuracy: acc.accuracy,
    recentCount: acc.count,
    extra: false,
    now,
  });
  const mastery = { new: 0, learning: 0, young: 0, mature: 0, struggling: 0 };
  for (const c of cards) mastery[c.mastery]++;
  const today = Math.floor(localNow / 86400_000);
  // streak: consecutive days with ≥1 review, ending today (or yesterday)
  const active = new Set(days.map((d) => d.day));
  let streak = 0;
  for (let d = active.has(today) ? today : today - 1; active.has(d); d--) streak++;
  const reviewedToday = days.find((d) => d.day === today)?.count ?? 0;
  const struggling = cards
    .filter((c) => c.mastery === "struggling")
    .slice(0, 8)
    .map((c) => ({ id: c.id, hanzi: c.hanzi, english: c.english }));
  return Response.json({
    pendingCount: pending.length,
    settings,
    total: cards.length,
    mastery,
    session: plan.stats,
    sessionSize: plan.items.length,
    recentAccuracy: acc.accuracy,
    streak,
    reviewedToday,
    today,
    activity: days,
    struggling,
  });
}
