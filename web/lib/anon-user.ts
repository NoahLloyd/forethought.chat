import { cookies } from "next/headers";

/**
 * Cookie-based anonymous identity for chat history.
 *
 * We don't run real auth; instead we issue a random ID on first request
 * and persist it as a long-lived httpOnly cookie. All chat rows in
 * Supabase are scoped by this ID, so a user keeps their history as long
 * as the cookie survives. Clearing cookies = anonymous reset.
 */

const COOKIE_NAME = "ftc_uid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function randomId(): string {
  // crypto.randomUUID is available in Node ≥ 19 and the Edge runtime.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback: 20 random hex chars. Good enough for an anonymous id.
  return Array.from({ length: 5 }, () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0"),
  ).join("");
}

/** Read or create the anonymous user ID for this request. */
export async function getOrCreateUserId(): Promise<{
  id: string;
  fresh: boolean;
}> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  if (existing && existing.length >= 12 && existing.length <= 64) {
    return { id: existing, fresh: false };
  }
  const id = randomId();
  jar.set({
    name: COOKIE_NAME,
    value: id,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return { id, fresh: true };
}
