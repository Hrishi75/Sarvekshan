import { cookies } from "next/headers";
import { q1 } from "./db";
import type { SessionUser } from "./types";

const COOKIE = "fr_uid";

/**
 * The dev sign-in trusts a posted user id with no credential of any kind, and the
 * picker lists every user in every org. That is fine on a laptop and a full
 * authentication bypass anywhere else, so it is off in production unless someone
 * opts in deliberately for a staging demo. P1 replaces it with phone OTP.
 */
export function devSignInEnabled(): boolean {
  if (process.env.FR_ALLOW_DEV_SIGNIN === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Dev-stage session: a signed-in user id in a cookie.
 * P1 replaces this with phone OTP — the shape of SessionUser does not change.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  return q1<SessionUser>(
    `SELECT id, org_id, name, role, block, is_local_checker
       FROM users WHERE id = $1 AND active`,
    [id]
  );
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new Error("Not signed in");
  return u;
}

export const SESSION_COOKIE = COOKIE;
