import { resetCard } from "@/lib/repo";
import type { NextRequest } from "next/server";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/cards/[id]/reset">) {
  await resetCard(Number((await ctx.params).id));
  return Response.json({ ok: true });
}
