import { NextResponse } from "next/server";
import { SESSION_COOKIE, LEGACY_SESSION_COOKIE } from "@/lib/session";

/**
 * POST only. A GET sign-out gets fired by link prefetchers and image tags and
 * logs people out of a form they were halfway through filling.
 *
 * No CSRF token: the session cookie is SameSite=Lax, so a cross-site POST does
 * not carry it, and a request without the cookie has nothing to sign out.
 */
export async function POST(req: Request) {
  const url = new URL("/signin", req.url);
  url.searchParams.set("e", "signedout");
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(LEGACY_SESSION_COOKIE);
  return res;
}
