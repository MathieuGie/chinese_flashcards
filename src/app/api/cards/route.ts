import { createCards, findByHanzi, listCardSummaries } from "@/lib/repo";
import type { DraftCard } from "@/lib/types";

export async function GET() {
  return Response.json({ cards: await listCardSummaries() });
}

export async function POST(req: Request) {
  const { cards } = (await req.json()) as { cards: DraftCard[] };
  const valid = (cards ?? []).filter((c) => c.hanzi?.trim() && c.english?.trim());
  const existing = await findByHanzi(valid.map((c) => c.hanzi.trim()));
  // Skip words already in the deck, and repeats within this batch.
  const seen = new Set<string>();
  const fresh = valid.filter((c) => {
    const h = c.hanzi.trim();
    if (existing.has(h) || seen.has(h)) return false;
    seen.add(h);
    return true;
  });
  const ids = await createCards(fresh);
  return Response.json({ ids, skipped: valid.length - fresh.length });
}
