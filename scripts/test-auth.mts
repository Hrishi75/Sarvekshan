import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { test } from "node:test";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

function request(path: string, fields: Record<string, string>) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}

function redirectError(response: Response): string | null {
  return new URL(response.headers.get("location") ?? "", "http://localhost").searchParams.get("e");
}

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(/(?:^|,\s*)fr_session=([^;]+)/);
  assert.ok(match, "response should issue the signed session cookie");
  return decodeURIComponent(match[1]);
}

test("invitation activation and password sign-in against PostgreSQL", async (t) => {
  const [{ closePool, q, q1 }, password, invitation, session, signup, signin, signout] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/password"),
    import("../src/lib/invitation"),
    import("../src/lib/session-token"),
    import("../src/app/api/signup/route"),
    import("../src/app/api/signin/route"),
    import("../src/app/api/signout/route"),
  ]);

  const orgId = randomUUID();
  const userId = randomUUID();
  const phone = String(randomInt(6000000000, 10000000000));
  const code = invitation.generateInvitationCode();
  const wrongCode = `${code[0] === "A" ? "B" : "A"}${code.slice(1)}`;
  const chosenPassword = "field-test-password";

  try {
    await q(`INSERT INTO orgs (id, name) VALUES ($1, 'Authentication test')`, [orgId]);
    await q(
      `INSERT INTO users
         (id, org_id, phone_hash, phone_last4, name, role,
          invitation_code_hash, invitation_expires_at)
       VALUES ($1, $2, $3, $4, 'Authentication test user', 'volunteer', $5,
               now() + interval '1 hour')`,
      [
        userId,
        orgId,
        password.hashPhone(phone),
        phone.slice(-4),
        invitation.hashInvitationCode(code),
      ]
    );

    await t.test("a wrong invitation is rejected and counted", async () => {
      const response = await signup.POST(
        request("/api/signup", {
          phone,
          code: wrongCode,
          password: chosenPassword,
          confirm: chosenPassword,
        })
      );
      assert.equal(response.status, 303);
      assert.equal(redirectError(response), "invalid");
      assert.equal(
        (await q1<{ invitation_attempts: number }>(
          `SELECT invitation_attempts FROM users WHERE id = $1`,
          [userId]
        ))?.invitation_attempts,
        1
      );
    });

    let activatedToken = "";
    await t.test("a valid invitation activates once and signs the user in", async () => {
      const response = await signup.POST(
        request("/api/signup", {
          phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
          code: code.toLowerCase(),
          password: chosenPassword,
          confirm: chosenPassword,
        })
      );
      assert.equal(response.status, 303);
      assert.equal(new URL(response.headers.get("location")!).pathname, "/");
      assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/i);
      assert.match(response.headers.get("set-cookie") ?? "", /SameSite=Lax/i);

      activatedToken = sessionCookie(response);
      const token = session.verifySessionToken(activatedToken);
      assert.equal(token?.uid, userId);
      assert.equal(token?.mc, false);

      const row = await q1<{
        password_hash: string;
        invitation_code_hash: string | null;
        activated: boolean;
      }>(
        `SELECT password_hash, invitation_code_hash, activated_at IS NOT NULL AS activated
           FROM users WHERE id = $1`,
        [userId]
      );
      assert.equal(row?.activated, true);
      assert.equal(row?.invitation_code_hash, null);
      assert.equal(await password.verifyPassword(chosenPassword, row?.password_hash ?? ""), true);
    });

    await t.test("an invitation cannot be reused", async () => {
      const response = await signup.POST(
        request("/api/signup", {
          phone,
          code,
          password: "another-field-password",
          confirm: "another-field-password",
        })
      );
      assert.equal(response.status, 303);
      assert.equal(redirectError(response), "invalid");
    });

    await t.test("wrong passwords are counted and the right password signs in", async () => {
      const wrong = await signin.POST(
        request("/api/signin", { phone, password: "definitely-wrong" })
      );
      assert.equal(wrong.status, 303);
      assert.equal(redirectError(wrong), "credentials");
      assert.equal(
        (await q1<{ failed_attempts: number }>(
          `SELECT failed_attempts FROM users WHERE id = $1`,
          [userId]
        ))?.failed_attempts,
        1
      );

      const response = await signin.POST(
        request("/api/signin", { phone, password: chosenPassword })
      );
      assert.equal(response.status, 303);
      assert.equal(new URL(response.headers.get("location")!).pathname, "/");
      const token = session.verifySessionToken(sessionCookie(response));
      assert.equal(token?.uid, userId);
      assert.equal(token?.mc, false);
      assert.equal(
        (await q1<{ failed_attempts: number }>(
          `SELECT failed_attempts FROM users WHERE id = $1`,
          [userId]
        ))?.failed_attempts,
        0
      );
    });

    await t.test("tampering invalidates a session and sign-out clears it", async () => {
      const signatureStart = activatedToken.lastIndexOf(".") + 1;
      const firstSignatureCharacter = activatedToken[signatureStart];
      const tampered =
        activatedToken.slice(0, signatureStart) +
        (firstSignatureCharacter === "a" ? "b" : "a") +
        activatedToken.slice(signatureStart + 1);
      assert.equal(session.verifySessionToken(tampered), null);

      const response = await signout.POST(new Request("http://localhost/api/signout", { method: "POST" }));
      assert.equal(response.status, 303);
      assert.equal(redirectError(response), "signedout");
      assert.match(response.headers.get("set-cookie") ?? "", /fr_session=;/);
      assert.match(
        response.headers.get("set-cookie") ?? "",
        /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i
      );
    });
  } finally {
    try {
      await q(`DELETE FROM orgs WHERE id = $1`, [orgId]);
    } finally {
      await closePool();
    }
  }
});
