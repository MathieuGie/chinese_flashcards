import { recordReview } from "@/lib/repo";
import { GRADE } from "@/lib/srs";
import type { Direction } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    cardId: number;
    direction: Direction;
    grade: keyof typeof GRADE;
    source?: "study" | "quiz" | "write";
    flipped?: boolean;
    elapsedMs?: number;
  };
  if (!(body.grade in GRADE) || !["zh2en", "en2zh"].includes(body.direction))
    return Response.json({ error: "Bad request" }, { status: 400 });
  const srs = await recordReview({
    cardId: Number(body.cardId),
    direction: body.direction,
    grade: GRADE[body.grade],
    source: body.source === "quiz" || body.source === "write" ? body.source : "study",
    flipped: !!body.flipped,
    elapsedMs: typeof body.elapsedMs === "number" ? Math.round(body.elapsedMs) : null,
  });
  return Response.json({ srs });
}
