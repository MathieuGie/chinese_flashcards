import { enrichWords, enrichmentMode, parseWordList } from "@/lib/enrich";
import { findByHanzi } from "@/lib/repo";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { text } = (await req.json()) as { text: string };
  const words = parseWordList(text ?? "").slice(0, 40);
  if (words.length === 0)
    return Response.json({ error: "No Chinese characters found." }, { status: 400 });

  // Words already in the deck are not looked up again — they're just reported back.
  const found = await findByHanzi(words.map((w) => w.hanzi));
  const existing = words.filter((w) => found.has(w.hanzi)).map((w) => ({ id: found.get(w.hanzi)!, hanzi: w.hanzi }));
  const fresh = words.filter((w) => !found.has(w.hanzi));

  const drafts = fresh.length ? await enrichWords(fresh) : [];
  return Response.json({ drafts, existing, mode: enrichmentMode() });
}
