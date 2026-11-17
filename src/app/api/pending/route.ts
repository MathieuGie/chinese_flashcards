import { parseWordList } from "@/lib/hanzi";
import { addPending, deletePending, listPending } from "@/lib/repo";

/** Words waiting for Claude to write their cards. */
export async function GET() {
  return Response.json({ pending: await listPending() });
}

export async function POST(req: Request) {
  const { text, note } = (await req.json()) as { text?: string; note?: string };
  const words = parseWordList(text ?? "").slice(0, 200);
  if (words.length === 0) return Response.json({ error: "No Chinese characters found." }, { status: 400 });
  // Each line's own extra text (pinyin, English…) plus the optional note for the whole batch.
  const result = await addPending(
    words.map((w) => ({ ...w, note: [w.note, note?.trim()].filter(Boolean).join(" — ").slice(0, 400) })),
  );
  return Response.json({ ...result, pending: await listPending() });
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id: number };
  await deletePending(Number(id));
  return Response.json({ pending: await listPending() });
}
