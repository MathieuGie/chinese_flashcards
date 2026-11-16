import { cookies } from "next/headers";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = (await req.json()) as { password: string };
  const expected = process.env.APP_PASSWORD;
  if (!expected || password !== expected)
    return Response.json({ error: "Wrong password" }, { status: 401 });
  (await cookies()).set(AUTH_COOKIE, await authToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return Response.json({ ok: true });
}
