import { NextResponse } from "next/server";
import { z } from "zod";
import { q, q1 } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  LEGACY_SESSION_COOKIE,
  newSessionToken,
  devSignInEnabled,
} from "@/lib/session";
import { burnVerify, hashPhone, normalisePhone, verifyPassword } from "@/lib/password";

// Online guessing against a four-digit-ish temp password is the attack this
// actually faces. Lock the account, not the IP: a village shares one tower and
// the whole block can come from a single address.
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type Candidate = {
  id: string;
  password_hash: string | null;
  must_change_password: boolean;
  pv: string;
  locked: boolean;
};

function back(req: Request, error: string) {
  const url = new URL("/signin", req.url);
  url.searchParams.set("e", error);
  // 303 so the browser turns the POST into a GET and Back does not resubmit.
  return NextResponse.redirect(url, { status: 303 });
}

function issue(req: Request, to: string, token: string) {
  const res = NextResponse.redirect(new URL(to, req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  // Nothing reads the old unsigned cookie any more; clear it so a stale one is
  // not left sitting in the browser.
  res.cookies.delete(LEGACY_SESSION_COOKIE);
  return res;
}

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  if (!fd) return back(req, "credentials");

  // ── Dev picker: no credential at all, so it only exists where it is enabled ──
  const pickedId = fd.get("id");
  if (typeof pickedId === "string" && pickedId) {
    if (!devSignInEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });

    const id = z.uuid().safeParse(pickedId);
    if (!id.success) return back(req, "credentials");

    const user = await q1<Candidate>(
      `SELECT id, password_hash, must_change_password,
              COALESCE(extract(epoch FROM password_set_at) * 1000000, 0)::bigint::text AS pv,
              false AS locked
         FROM users WHERE id = $1 AND active`,
      [id.data]
    );
    if (!user) return back(req, "credentials");

    await q(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
    // The picker proves nothing, so it never satisfies a pending password change.
    return issue(
      req,
      user.must_change_password ? "/password" : "/",
      newSessionToken(user.id, Number(user.pv), user.must_change_password)
    );
  }

  // ── Password sign-in ──────────────────────────────────────────────────────
  const phone = normalisePhone(String(fd.get("phone") ?? ""));
  const password = String(fd.get("password") ?? "");
  if (!phone || !password) return back(req, "missing");

  const rows = await q<Candidate>(
    `SELECT id, password_hash, must_change_password,
            COALESCE(extract(epoch FROM password_set_at) * 1000000, 0)::bigint::text AS pv,
            (locked_until IS NOT NULL AND locked_until > now()) AS locked
       FROM users WHERE phone_hash = $1 AND active`,
    [hashPhone(phone)]
  );

  // An unknown number has to cost what a known one costs, or the response time
  // answers "is this person in the system" for anybody who asks.
  if (rows.length === 0) {
    await burnVerify(password);
    return back(req, "credentials");
  }
  if (rows.every((r) => r.locked)) return back(req, "locked");

  for (const row of rows) {
    if (row.locked || !row.password_hash) continue;
    if (!(await verifyPassword(password, row.password_hash))) continue;

    await q(
      `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now()
        WHERE id = $1`,
      [row.id]
    );
    return issue(
      req,
      row.must_change_password ? "/password" : "/",
      newSessionToken(row.id, Number(row.pv), row.must_change_password)
    );
  }

  // No match. Count it against every account on that number.
  const locked = await q1<{ locked: boolean }>(
    // A lock that has run its course starts the count again, otherwise the
    // first wrong try after waiting out fifteen minutes buys another fifteen.
    `WITH next AS (
       SELECT id, CASE WHEN locked_until IS NOT NULL AND locked_until <= now()
                       THEN 1 ELSE failed_attempts + 1 END AS n
         FROM users WHERE phone_hash = $1 AND active
     )
     UPDATE users u
        SET failed_attempts = next.n,
            locked_until = CASE WHEN next.n >= $2
                                THEN now() + make_interval(mins => $3) END
       FROM next
      WHERE u.id = next.id
      RETURNING (u.locked_until IS NOT NULL) AS locked`,
    [hashPhone(phone), MAX_ATTEMPTS, LOCK_MINUTES]
  );
  // A user with no password set lands here too — they are told to ask their
  // coordinator rather than being told the account exists.
  return back(req, locked?.locked ? "locked" : "credentials");
}
