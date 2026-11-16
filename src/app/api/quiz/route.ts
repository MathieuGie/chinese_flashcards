import { buildQuiz } from "@/lib/quiz";
import { listCardSummaries } from "@/lib/repo";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const count = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("count") ?? 10)));
  const cards = await listCardSummaries();
  if (cards.length < 4)
    return Response.json({ error: "Add at least 4 cards to use the quiz." }, { status: 400 });
  return Response.json({ questions: buildQuiz(cards, count) });
}
