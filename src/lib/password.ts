import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

// scrypt rather than a dependency: it ships with Node, it is memory-hard, and
// this project deploys to whatever the programme can afford to run.
const N = 16384, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

/** `scrypt$N$r$p$salt$key`, all base64. Self-describing so the cost can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  let key: Buffer;
  try {
    key = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: n, r, p, maxmem: 128 * n * r * 2,
    });
  } catch {
    return false;
  }
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// A wrong phone must cost the same as a wrong password, or the response time
// tells an attacker which numbers are real users.
const DUMMY = hashPassword(randomBytes(24).toString("hex"));
export async function burnVerify(password: string): Promise<false> {
  await verifyPassword(password, await DUMMY);
  return false;
}

function phonePepper(): string {
  const pepper = process.env.FR_PHONE_PEPPER;
  if (pepper && pepper.length >= 32) return pepper;
  if (process.env.NODE_ENV === "production") {
    throw new Error("FR_PHONE_PEPPER must be set to at least 32 characters in production.");
  }
  if (pepper) throw new Error("FR_PHONE_PEPPER is set but shorter than 32 characters.");
  return "dev-only-phone-pepper-not-for-deployment";
}

/** A keyed digest keeps phone numbers impractical to recover from a database leak. */
export function hashPhone(phone: string): string {
  return createHmac("sha256", phonePepper()).update(normalisePhone(phone)).digest("hex");
}

/**
 * Existing deployments used an unkeyed digest. Accept it only while locating an
 * account, then replace it with hashPhone() after the user proves the number.
 */
export function legacyHashPhone(phone: string): string {
  return createHash("sha256").update(normalisePhone(phone)).digest("hex");
}

export function phoneHashCandidates(phone: string): string[] {
  return [hashPhone(phone), legacyHashPhone(phone)];
}

/**
 * Field workers type this on a phone keypad, read it off a slip of paper, and
 * say it out loud. Take the digits and nothing else; a leading +91, spaces and
 * dashes all mean the same number.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.length > 10 && digits.startsWith("91") ? digits.slice(-10) : digits;
}

export function isValidPhone(input: string): boolean {
  return /^[6-9]\d{9}$/.test(normalisePhone(input));
}

// Read aloud over a bad line and typed with a thumb: no letters that collide
// with digits, no words that sound like each other.
const WORDS = [
  "amber", "anchor", "basil", "bridge", "cactus", "candle", "canvas", "cedar",
  "cobalt", "copper", "cotton", "delta", "ember", "fable", "falcon", "forest",
  "garnet", "harbor", "indigo", "island", "jasmine", "kernel", "lantern", "linen",
  "mango", "marble", "meadow", "mosaic", "neem", "nutmeg",
  "orchid", "pebble", "pepper", "quartz", "ribbon", "saffron", "sandal", "signal",
  "silver", "summit", "tamarind", "temple", "thistle", "tulip", "velvet", "walnut",
  "willow", "zenith",
];

/**
 * A temp password is spoken down a phone line and typed once. Two words and four
 * digits is ~31 bits — weak to keep forever, which is why it always lands with
 * must_change_password set and an expiry on the account lockout behind it.
 */
export function generateTempPassword(): string {
  const a = WORDS[randomInt(WORDS.length)];
  let b = WORDS[randomInt(WORDS.length)];
  while (b === a) b = WORDS[randomInt(WORDS.length)];
  return `${a}-${b}-${String(randomInt(1000, 10000))}`;
}

// The length rule lives apart from the crypto so the change form can import it.
export { MIN_PASSWORD_LENGTH, passwordProblem } from "./password-rules";
