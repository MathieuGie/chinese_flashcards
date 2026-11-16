import { getSettings, saveSettings } from "@/lib/repo";
import type { Settings } from "@/lib/types";

export async function GET() {
  return Response.json(await getSettings());
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as Partial<Settings>;
  const patch: Partial<Settings> = {};
  if (body.newPerDay != null) patch.newPerDay = Math.max(0, Math.min(100, Math.round(body.newPerDay)));
  if (body.sessionSize != null) patch.sessionSize = Math.max(5, Math.min(100, Math.round(body.sessionSize)));
  if (body.direction && ["zh2en", "en2zh", "both"].includes(body.direction)) patch.direction = body.direction;
  return Response.json(await saveSettings(patch));
}
