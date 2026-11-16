import { enrichWords, enrichmentMode, parseWordList } from "@/lib/enrich";
import { findByHanzi } from "@/lib/repo";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { text } = (await req.json()) as { text: string };
  const words = parseWordList(text ?? "").slice(0, 40);
  if (words.length === 0)
    return Response.json({ error: "No Chinese characters found." }, { status: 400 });
  const existing = await findByHanzi(words.map((w) => w.hanzi));
  const drafts = await enrichWords(words);
  for (const d of drafts) {
    const dup = existing.get(d.hanzi);
    if (dup) {
      d.duplicateOf = dup;
      d.warnings.unshift("Already in your deck.");
    }
  }
  return Response.json({ drafts, mode: enrichmentMode() });
}
