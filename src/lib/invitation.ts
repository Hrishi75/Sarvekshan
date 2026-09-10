import { createHmac, randomInt } from "node:crypto";

// Easy to read over a phone call and hard to confuse on a small screen.
// Eight symbols from a 32-character alphabet provides 40 bits of entropy.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const INVITATION_CODE_LENGTH = 8;
export const INVITATION_TTL_DAYS = 7;
export const INVITATION_MAX_ATTEMPTS = 5;

export function normaliseInvitationCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidInvitationCode(input: string): boolean {
  const code = normaliseInvitationCode(input);
  return code.length === INVITATION_CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c));
}

export function generateInvitationCode(): string {
  let code = "";
  for (let i = 0; i < INVITATION_CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function hashInvitationCode(input: string): string {
  const secret = process.env.FR_SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
    throw new Error("FR_SESSION_SECRET is required to protect invitation codes in production.");
  }
  return createHmac(
    "sha256",
    secret ?? "dev-only-invitation-secret-not-for-deployment"
  ).update(normaliseInvitationCode(input)).digest("hex");
}
