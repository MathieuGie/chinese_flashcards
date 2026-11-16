import { deleteCard, getCard, getHistory, getSrs, updateCard } from "@/lib/repo";
import { retrievability } from "@/lib/srs";
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/cards/[id]">) {
  const id = Number((await ctx.params).id);
  const card = await getCard(id);
  if (!card) return Response.json({ error: "Not found" }, { status: 404 });
  const [srs, history] = await Promise.all([getSrs(id), getHistory(id)]);
  const now = new Date();
  return Response.json({
    card,
    srs,
    retrievability: {
      zh2en: retrievability(srs.zh2en, now),
      en2zh: retrievability(srs.en2zh, now),
    },
    history,
  });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/cards/[id]">) {
  const id = Number((await ctx.params).id);
  await updateCard(id, await req.json());
  return Response.json({ card: await getCard(id) });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/cards/[id]">) {
  await deleteCard(Number((await ctx.params).id));
  return Response.json({ ok: true });
}
