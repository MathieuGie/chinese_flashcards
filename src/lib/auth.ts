// Optional single-user protection: set APP_PASSWORD to require a login.
export const AUTH_COOKIE = "hanzi_auth";

export async function authToken(password: string) {
  const data = new TextEncoder().encode(`hanzi-deck:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
