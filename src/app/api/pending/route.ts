import { parseWordList } from "@/lib/enrich";
import { addPending, deletePending, listPending } from "@/lib/repo";

/** Words waiting for Claude to write their cards. */
export async function GET() {
  return Response.json({ pending: await listPending() });
}

export async function POST(req: Request) {
  const { text, note } = (await req.json()) as { text?: string; note?: string };
  const words = parseWordList(text ?? "").slice(0, 200);
  if (words.length === 0) return Response.json({ error: "No Chinese characters found." }, { status: 400 });
  const result = await addPending(words.map((w) => ({ ...w, note: note?.slice(0, 300) })));
  return Response.json({ ...result, pending: await listPending() });
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id: number };
  await deletePending(Number(id));
  return Response.json({ pending: await listPending() });
}
