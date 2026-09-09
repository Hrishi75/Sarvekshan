import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The session cookie used to be the bare user id. Any client could set it to any
 * uuid and be signed in as that user, which is survivable on a laptop and an
 * authentication bypass on a deployment. It is now a signed token.
 *
 * Nothing here touches the database, so `proxy.ts` can import it without
 * dragging the pg pool into the proxy bundle.
 */

// Renamed from fr_uid deliberately: every cookie minted under the old unsigned
// format stops being read the moment this ships, which is the point.
export const SESSION_COOKIE = "fr_session";
export const LEGACY_SESSION_COOKIE = "fr_uid";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // seconds

export type SessionToken = {
  /** user id */
  uid: string;
  /** issued at, epoch seconds */
  iat: number;
  /**
   * password version — `password_set_at` in epoch MICROseconds, 0 if never set.
   * currentUser() compares it against the row, so changing or resetting a
   * password drops every session signed before it.
   *
   * Microseconds rather than seconds because a reset and the change it forces
   * land within the same second often enough to matter, and at second
   * granularity the second one would leave the first one's sessions alive.
   * ~1.8e15 fits exactly in a double, so it survives the JSON round trip.
   */
  pv: number;
  /** signed in on a temp password and has not chosen one yet */
  mc: boolean;
};

function secret(): string {
  const s = process.env.FR_SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    // Fail closed. A predictable signing key is the same hole the signature was
    // added to close, and a deployment that silently fell back to one would
    // look exactly like a working deployment.
    throw new Error(
      "FR_SESSION_SECRET must be set to at least 32 characters in production. " +
        "Generate one with: openssl rand -base64 48"
    );
  }
  if (s) {
    throw new Error("FR_SESSION_SECRET is set but shorter than 32 characters.");
  }
  return "dev-only-insecure-session-secret-not-for-deployment";
}

function mac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signSessionToken(t: SessionToken): string {
  const payload = Buffer.from(
    JSON.stringify({ u: t.uid, i: t.iat, p: t.pv, m: t.mc ? 1 : 0 })
  ).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

/** Returns null for anything that is not a currently valid, correctly signed token. */
export function verifySessionToken(raw: string | undefined | null): SessionToken | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1), "base64url");
  const want = Buffer.from(mac(payload), "base64url");
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const o = parsed as Record<string, unknown>;
  if (typeof o.u !== "string" || typeof o.i !== "number" || typeof o.p !== "number") {
    return null;
  }

  // A signature that never expires is a credential that never expires.
  const age = Math.floor(Date.now() / 1000) - o.i;
  if (age < -60 || age > SESSION_MAX_AGE) return null;

  return { uid: o.u, iat: o.i, pv: o.p, mc: o.m === 1 };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
} as const;

/** Mint a token for a user who has just proved who they are. */
export function newSessionToken(uid: string, pv: number, mc: boolean): string {
  return signSessionToken({ uid, iat: Math.floor(Date.now() / 1000), pv, mc });
}
