import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import {
  INVITATION_MAX_ATTEMPTS,
  hashInvitationCode,
  isValidInvitationCode,
} from "@/lib/invitation";
import { hashPassword, hashPhone, isValidPhone, normalisePhone, passwordProblem, phoneHashCandidates } from "@/lib/password";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, newSessionToken } from "@/lib/session";

function back(req: Request, error: string) {
  const url = new URL("/signup", req.url);
  url.searchParams.set("e", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return back(req, "missing");

  const phoneInput = String(form.get("phone") ?? "");
  const code = String(form.get("code") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!phoneInput || !code || !password || !confirm) return back(req, "missing");
  if (!isValidPhone(phoneInput) || !isValidInvitationCode(code)) return back(req, "invalid");
  if (password !== confirm) return back(req, "mismatch");
  if (passwordProblem(password)) return back(req, "weak");

  const phoneHash = hashPhone(normalisePhone(phoneInput));
  const codeHash = hashInvitationCode(code);
  const passwordHash = await hashPassword(password);

  const activated = await q1<{ id: string; pv: string }>(
    `UPDATE users
        SET phone_hash = $4, password_hash = $3, password_set_at = clock_timestamp(), must_change_password = false,
            failed_attempts = 0, locked_until = NULL, activated_at = now(),
            invitation_code_hash = NULL, invitation_expires_at = NULL,
            invitation_attempts = 0, invitation_locked_until = NULL
      WHERE phone_hash = ANY($1::text[]) AND invitation_code_hash = $2 AND active
        AND invitation_expires_at > now()
        AND (invitation_locked_until IS NULL OR invitation_locked_until <= now())
      RETURNING id, (extract(epoch FROM password_set_at) * 1000000)::bigint::text AS pv`,
    [phoneHashCandidates(phoneInput), codeHash, passwordHash, phoneHash]
  );

  if (!activated) {
    await q1(
      `WITH next AS (
         SELECT id, invitation_attempts + 1 AS attempts
           FROM users
          WHERE phone_hash = ANY($1::text[]) AND active AND invitation_code_hash IS NOT NULL
            AND invitation_expires_at > now()
       )
       UPDATE users u
          SET invitation_attempts = next.attempts,
              invitation_locked_until = CASE WHEN next.attempts >= $2
                 THEN now() + interval '15 minutes' ELSE u.invitation_locked_until END
         FROM next WHERE u.id = next.id RETURNING u.id`,
      [phoneHashCandidates(phoneInput), INVITATION_MAX_ATTEMPTS]
    );
    return back(req, "invalid");
  }

  const response = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  response.cookies.set(
    SESSION_COOKIE,
    newSessionToken(activated.id, Number(activated.pv), false),
    SESSION_COOKIE_OPTIONS
  );
  return response;
}
