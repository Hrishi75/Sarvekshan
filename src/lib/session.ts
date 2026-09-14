import { cookies } from "next/headers";
import { q1 } from "./db";
import type { SessionUser } from "./types";
import { SESSION_COOKIE, verifySessionToken } from "./session-token";

export {
  SESSION_COOKIE,
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE,
  newSessionToken,
  verifySessionToken,
} from "./session-token";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The dev sign-in skips the password entirely and the picker lists every user in
 * every org. That is convenient on a laptop and a full authentication bypass
 * anywhere else, so production can never enable it. Password sign-in is always
 * available.
 */
export function devSignInEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.FR_ALLOW_DEV_SIGNIN !== "0";
}

/**
 * The session: an HMAC-signed token naming a user, checked against the row on
 * every request. P1 replaces the password with phone OTP — the shape of
 * SessionUser does not change, and neither does anything downstream of it.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!token || !UUID.test(token.uid)) return null;

  const row = await q1<SessionUser & { pv: string }>(
    `SELECT id, org_id, name, role, block, is_local_checker,
            COALESCE(extract(epoch FROM password_set_at) * 1000000, 0)::bigint::text AS pv
       FROM users WHERE id = $1 AND active`,
    [token.uid]
  );
  if (!row) return null;

  // A password change or reset re-versions the user, which drops every session
  // signed before it — including the one the change was made from, which is
  // re-issued by /api/password.
  if (Number(row.pv) !== token.pv) return null;

  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    role: row.role,
    block: row.block,
    is_local_checker: row.is_local_checker,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}

/** True when the signed-in user is still on the temp password they were given. */
export async function sessionMustChangePassword(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value)?.mc ?? false;
}
