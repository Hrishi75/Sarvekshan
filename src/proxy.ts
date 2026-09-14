import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

/**
 * One job: a session issued against a temporary password does not get to wander
 * around the app. It reads the signed cookie and nothing else — no database, no
 * pg pool — because the proxy runs in front of the app on every request.
 *
 * This is the optimistic check. currentUser() is still the authority: it
 * re-reads the row on every page and every route, and a cookie whose password
 * version no longer matches is not a session at all.
 */
export function proxy(req: NextRequest) {
  const token = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!token?.mc) return NextResponse.next();

  const path = req.nextUrl.pathname;
  // /password is where they are going.
  //
  // /signin has to stay reachable even though the cookie says must-change: if
  // that cookie is also stale — the password was reset from the CLI while they
  // were away — /password bounces them to /signin, and sending /signin back to
  // /password is an infinite redirect between the two.
  //
  // The API is left alone. The session is valid, only the password is
  // provisional, and a queued upload from the field must not be lost over it.
  if (path === "/password" || path === "/signin" || path.startsWith("/api/")) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/password", req.url));
}

export const config = {
  // Everything the user navigates to; nothing the browser fetches on its own.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)",
  ],
};
