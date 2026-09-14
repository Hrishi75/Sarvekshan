import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, currentUser, newSessionToken } from "@/lib/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

function back(req: Request, error: string) {
  const url = new URL("/password", req.url);
  url.searchParams.set("e", error);
  return NextResponse.redirect(url, { status: 303 });
}

/**
 * Change a password. SameSite=Lax on the session cookie is the CSRF control —
 * a cross-site POST arrives without it and fails the check below.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/signin", req.url), { status: 303 });
  }

  const fd = await req.formData().catch(() => null);
  if (!fd) return back(req, "weak");

  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  const row = await q1<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1 AND active`,
    [user.id]
  );
  if (!row) return NextResponse.redirect(new URL("/signin", req.url), { status: 303 });

  // Somebody who has never had a password has nothing to prove — that is the
  // dev picker, which is a bypass wherever it is switched on anyway.
  if (row.password_hash && !(await verifyPassword(current, row.password_hash))) {
    return back(req, "wrong-current");
  }

  const problem = passwordProblem(next);
  if (problem) return back(req, "weak");
  if (next !== confirm) return back(req, "mismatch");
  if (row.password_hash && (await verifyPassword(next, row.password_hash))) {
    return back(req, "same");
  }

  const hash = await hashPassword(next);
  const saved = await q1<{ pv: string }>(
    `UPDATE users
        SET password_hash = $2,
            password_set_at = GREATEST(clock_timestamp(), password_set_at + interval '1 microsecond'),
            must_change_password = false,
            failed_attempts = 0, locked_until = NULL,
            activated_at = COALESCE(activated_at, now()),
            invitation_code_hash = NULL, invitation_expires_at = NULL,
            invitation_attempts = 0, invitation_locked_until = NULL
      WHERE id = $1 AND active AND password_hash IS NOT DISTINCT FROM $3
      RETURNING (extract(epoch FROM password_set_at) * 1000000)::bigint::text AS pv`,
    [user.id, hash, row.password_hash]
  );
  // A coordinator may have reset or deactivated this account while password
  // verification was running. Never overwrite that newer credential decision.
  if (!saved) return NextResponse.redirect(new URL("/signin", req.url), { status: 303 });

  // password_set_at is the session version, so every cookie signed before this
  // moment is now dead — including the one this request arrived on. Re-issue it.
  const url = new URL("/password", req.url);
  url.searchParams.set("e", "changed");
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(SESSION_COOKIE, newSessionToken(user.id, Number(saved.pv), false), SESSION_COOKIE_OPTIONS);
  return res;
}
