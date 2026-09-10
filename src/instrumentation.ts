/**
 * Startup checks. `register` runs once before the server takes its first
 * request, which is the last moment a misconfiguration is cheap.
 *
 * Without this, a deployment missing FR_SESSION_SECRET looks completely healthy
 * — every page renders, because a request with no cookie never needs the
 * signing key — right up until the first person tries to sign in and gets a 500
 * with no idea why. Fail at boot instead, where the operator is watching.
 */
export function register() {
  // `next build` boots this too; a build machine has no business holding
  // runtime secrets, so only a real server start is checked.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;

  const problems: string[] = [];

  const secret = process.env.FR_SESSION_SECRET;
  if (!secret) {
    problems.push(
      "FR_SESSION_SECRET is not set. Sessions are signed with it, and there is\n" +
        "  no safe default — a predictable key lets anyone mint a session for\n" +
        "  anyone. Generate one:  openssl rand -base64 48"
    );
  } else if (secret.length < 32) {
    problems.push(
      `FR_SESSION_SECRET is ${secret.length} characters. Use at least 32:  openssl rand -base64 48`
    );
  }

  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL is not set. Nothing can be read or written without it.");
  }

  if (!process.env.FR_MEDIA_ROOT) {
    problems.push(
      "FR_MEDIA_ROOT is not set. Uploaded evidence needs a durable directory mounted into the server."
    );
  }

  if (process.env.FR_ALLOW_DEV_SIGNIN === "1") {
    problems.push(
      "FR_ALLOW_DEV_SIGNIN cannot be enabled in production because it bypasses every credential."
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `\n\nSarvekshan cannot start:\n\n${problems.map((p) => `- ${p}`).join("\n\n")}\n`
    );
  }

}
