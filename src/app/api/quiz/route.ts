import { buildQuiz, canWrite, type WritingMode } from "@/lib/quiz";
import { listCardSummaries } from "@/lib/repo";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const count = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("count") ?? 10)));
  const cards = await listCardSummaries();
  if (cards.length < 4)
    return Response.json({ error: "Add at least 4 cards to use the quiz." }, { status: 400 });
  if (!cards.some((c) => c.mastery !== "new"))
    return Response.json({ error: "The quiz checks words you've already studied — do a study session first." }, { status: 400 });
  const w = req.nextUrl.searchParams.get("writing");
  const writing: WritingMode = w === "only" || w === "off" ? w : "mixed";
  if (writing === "only" && !cards.some(canWrite))
    return Response.json(
      { error: "No words to write yet — handwriting covers words you've started studying but not mastered." },
      { status: 400 },
    );
  return Response.json({ questions: buildQuiz(cards, count, writing) });
}
