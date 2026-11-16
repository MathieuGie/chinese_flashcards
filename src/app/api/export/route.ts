import { getDb } from "@/lib/db";

/** Full JSON backup of everything (cards, sentences, memory states, history). */
export async function GET() {
  const db = await getDb();
  const [cards, sentences, srs, reviews, settings] = await Promise.all(
    ["cards", "sentences", "srs", "reviews", "settings"].map((t) => db.execute(`SELECT * FROM ${t}`)),
  );
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      cards: cards.rows,
      sentences: sentences.rows,
      srs: srs.rows,
      reviews: reviews.rows,
      settings: settings.rows,
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="hanzi-deck-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
