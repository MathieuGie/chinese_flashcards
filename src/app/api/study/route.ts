import { getCards, getSettings, loadDeck, newIntroducedSince, recentAccuracy } from "@/lib/repo";
import { planSession } from "@/lib/srs";
import type { DirectionMode, StudyItem } from "@/lib/types";
import type { NextRequest } from "next/server";

/** Builds a balanced study session. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const settings = await getSettings();
  const mode = (q.get("mode") as DirectionMode) || settings.direction;
  const tz = Number(q.get("tz") ?? 0); // Date#getTimezoneOffset() of the client
  const exclude = new Set((q.get("exclude") ?? "").split(",").filter(Boolean));

  const now = new Date();
  // local midnight of the client
  const localNow = now.getTime() - tz * 60_000;
  const midnight = localNow - (localNow % 86400_000) + tz * 60_000;

  const [deck, newToday, acc] = await Promise.all([
    loadDeck(),
    newIntroducedSince(midnight),
    recentAccuracy(),
  ]);
  const plan = planSession(deck, {
    settings,
    mode,
    newIntroducedToday: newToday,
    recentAccuracy: acc.accuracy,
    recentCount: acc.count,
    extra: q.get("extra") === "1",
    exclude,
    now,
  });
  const cards = await getCards([...new Set(plan.items.map((i) => i.cardId))]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const items: StudyItem[] = plan.items
    .filter((i) => byId.has(i.cardId))
    .map((i) => ({ card: byId.get(i.cardId)!, direction: i.direction, kind: i.kind }));
  return Response.json({ items, stats: plan.stats, mode });
}
