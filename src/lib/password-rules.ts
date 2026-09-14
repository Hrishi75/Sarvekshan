/**
 * The parts of the password policy with no crypto in them, so the form can
 * import the same numbers the server enforces. Everything in src/lib/password.ts
 * pulls in node:crypto and can never reach a client component.
 */

/** Long enough to survive online guessing, short enough to type outdoors. */
export const MIN_PASSWORD_LENGTH = 10;

export function passwordProblem(password: string): string | null {
  const p = password.normalize("NFKC");
  if (p.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (p.length > 200) return "That is too long.";
  if (!/\S/.test(p)) return "Use at least one non-space character.";
  return null;
}
