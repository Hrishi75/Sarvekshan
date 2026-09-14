/**
 * Credential admin. The one way to put a person into a deployment and the one
 * way to get them back in when they forget.
 *
 *   npm run user list
 *   npm run user add -- --phone 9876543210 --name "Anita Verma" --role coordinator --block Rampur
 *   npm run user invite -- --phone 9876543210
 *   npm run user password -- --phone 9876543210
 *   npm run user password -- --phone 9876543210 --set "a password you chose"
 *   npm run user lock -- --phone 9876543210 --clear
 *
 * A generated password is temporary by construction: it lands with
 * must_change_password set, so the first thing it buys is the change form.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import {
  generateTempPassword,
  hashPassword,
  hashPhone,
  isValidPhone,
  normalisePhone,
  phoneHashCandidates,
} from "@/lib/password";
import { passwordProblem } from "@/lib/password-rules";
import {
  generateInvitationCode,
  hashInvitationCode,
  INVITATION_TTL_DAYS,
} from "@/lib/invitation";

// Load the values this CLI uses from .env.local on a laptop. Runtime
// variables win in deployment and are never printed.
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
} catch {
  /* no .env.local — normal in production */
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const argv = process.argv.slice(2);
const verb = argv[0];
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const rule = "─".repeat(64);

function die(msg: string): never {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

function banner(name: string, phone: string, password: string, temp: boolean) {
  console.log(`\n${rule}`);
  console.log(`  ${name}`);
  console.log(`  phone     ${phone}`);
  console.log(`  password  ${password}`);
  console.log(
    temp
      ? "  This is a temporary password. They will be asked to choose their own\n  the first time they sign in."
      : "  Set deliberately — no password change will be forced."
  );
  console.log(`${rule}\n`);
}

function invitationBanner(name: string, phone: string, code: string) {
  console.log(`\n${rule}`);
  console.log(`  ${name}`);
  console.log(`  phone       ${phone}`);
  console.log(`  invite code ${code}`);
  console.log(`  open        /signup`);
  console.log(`  Expires in ${INVITATION_TTL_DAYS} days and can be used once.`);
  console.log(`${rule}\n`);
}

async function list() {
  const { rows } = await pool.query(
    `SELECT u.name, u.role, u.block, u.phone_last4, u.is_local_checker, o.name AS org,
            (u.password_hash IS NOT NULL) AS has_password, u.must_change_password,
            (u.invitation_code_hash IS NOT NULL AND u.invitation_expires_at > now()) AS invited,
            (u.locked_until IS NOT NULL AND u.locked_until > now()) AS locked,
            u.last_login_at, u.active
       FROM users u JOIN orgs o ON o.id = u.org_id
      ORDER BY o.name, CASE u.role WHEN 'admin' THEN 0 WHEN 'coordinator' THEN 1 ELSE 2 END, u.name`
  );
  if (rows.length === 0) return console.log("\n  No users yet.\n");

  console.log(`\n  ${"NAME".padEnd(18)}${"ROLE".padEnd(13)}${"PHONE".padEnd(9)}CREDENTIAL`);
  console.log(`  ${rule}`);
  for (const r of rows) {
    const state = !r.has_password
      ? r.invited ? "invited · awaiting activation" : "not activated"
      : r.locked
        ? "LOCKED"
        : r.must_change_password
          ? "temporary — must change"
          : r.last_login_at
            ? `active · last in ${new Date(r.last_login_at).toISOString().slice(0, 10)}`
            : "active · never signed in";
    console.log(
      `  ${String(r.name).padEnd(18)}${String(r.role).padEnd(13)}${`••${r.phone_last4 ?? "????"}`.padEnd(9)}${state}` +
        `${r.active ? "" : "  (deactivated)"}${r.is_local_checker ? "  · local checker" : ""}`
    );
  }
  console.log("");
}

async function add() {
  const phoneIn = flag("phone") ?? die("add needs --phone");
  const name = flag("name") ?? die("add needs --name");
  const role = flag("role") ?? "volunteer";
  const block = flag("block") ?? null;
  if (!isValidPhone(phoneIn)) die(`"${phoneIn}" is not a ten-digit Indian mobile number.`);
  if (!["admin", "coordinator", "volunteer"].includes(role)) {
    die(`--role must be admin, coordinator or volunteer.`);
  }

  const phone = normalisePhone(phoneIn);
  const phoneHashes = phoneHashCandidates(phone);
  let orgId = flag("org");
  if (!orgId) {
    const { rows } = await pool.query(`SELECT id, name FROM orgs ORDER BY name`);
    if (rows.length === 0) die("No orgs exist yet. Run npm run seed, or insert one.");
    if (rows.length > 1) {
      die(`More than one org — pass --org:\n  ${rows.map((r) => `${r.id}  ${r.name}`).join("\n  ")}`);
    }
    orgId = rows[0].id;
  }

  const chosenPassword = flag("set");
  if (chosenPassword) {
    const problem = passwordProblem(chosenPassword);
    if (problem) die(problem);
  }
  const invitation = chosenPassword ? null : generateInvitationCode();

  const { rows: existing } = await pool.query(
    `SELECT id FROM users WHERE org_id=$1 AND phone_hash=ANY($2::text[])`,
    [orgId, phoneHashes]
  );
  if (existing.length > 0) die("Somebody in that org already uses that number.");

  const { rows } = await pool.query(
    `INSERT INTO users (org_id, phone_hash, phone_last4, name, role, block, is_local_checker,
                        password_hash, password_set_at, must_change_password, activated_at,
                        invitation_code_hash, invitation_expires_at)
     VALUES ($1,$2,$3,$4,$5::user_role,$6,$7,$8,
             CASE WHEN $8::text IS NULL THEN NULL ELSE now() END, false,
             CASE WHEN $8::text IS NULL THEN NULL ELSE now() END,
             $9, CASE WHEN $9::text IS NULL THEN NULL ELSE now() + ($10::int * interval '1 day') END)
     ON CONFLICT (org_id, phone_hash) DO NOTHING
     RETURNING name`,
    [orgId, phoneHashes[0], phone.slice(-4), name, role, block, has("local-checker"),
     chosenPassword ? await hashPassword(chosenPassword) : null,
     invitation ? hashInvitationCode(invitation) : null, INVITATION_TTL_DAYS]
  );
  if (rows.length === 0) die("Somebody in that org already uses that number.");

  if (invitation) invitationBanner(`${name} — ${role}`, phone, invitation);
  else banner(`${name} — ${role}`, phone, chosenPassword!, false);
}

async function invite() {
  const phoneIn = flag("phone") ?? die("invite needs --phone");
  if (!isValidPhone(phoneIn)) die(`"${phoneIn}" is not a ten-digit Indian mobile number.`);
  const phone = normalisePhone(phoneIn);
  const orgId = flag("org");
  const { rows: candidates } = await pool.query(
    `SELECT u.id, u.name, u.role, o.name AS org
       FROM users u JOIN orgs o ON o.id=u.org_id
      WHERE u.phone_hash=ANY($1::text[]) AND u.active AND u.password_hash IS NULL
        AND ($2::uuid IS NULL OR u.org_id=$2)`,
    [phoneHashCandidates(phone), orgId ?? null]
  );
  if (candidates.length === 0) {
    die("No inactive account has that number. Add the user first, or use the password command for recovery.");
  }
  if (candidates.length > 1) {
    die(`That number belongs to more than one organisation. Pass --org:\n  ${candidates.map((row) => `${row.id}  ${row.org}`).join("\n  ")}`);
  }

  const code = generateInvitationCode();
  const { rows } = await pool.query(
    `UPDATE users
        SET phone_hash = $4, invitation_code_hash = $2,
            invitation_expires_at = now() + ($3::int * interval '1 day'),
            invitation_attempts = 0, invitation_locked_until = NULL
      WHERE id = $1
      RETURNING name, role`,
    [candidates[0].id, hashInvitationCode(code), INVITATION_TTL_DAYS, hashPhone(phone)]
  );
  for (const row of rows) invitationBanner(`${row.name} — ${row.role}`, phone, code);
}

async function password() {
  const phoneIn = flag("phone") ?? die("password needs --phone");
  if (!isValidPhone(phoneIn)) die(`"${phoneIn}" is not a ten-digit Indian mobile number.`);
  const phone = normalisePhone(phoneIn);

  const chosen = flag("set");
  const value = chosen ?? generateTempPassword();
  // Generated means temporary. Chosen means the person chose it, unless asked.
  const temp = has("force-change") ? true : has("no-force-change") ? false : !chosen;
  const problem = passwordProblem(value);
  if (problem) die(problem);

  // Resetting a password bumps password_set_at, which is the session version —
  // every device that was signed in as this person is signed out by this.
  const { rows } = await pool.query(
    `UPDATE users
        SET phone_hash = $5, password_hash = $2, password_set_at = now(), must_change_password = $3,
            failed_attempts = 0, locked_until = NULL, phone_last4 = $4,
            activated_at = CASE WHEN $3 THEN activated_at ELSE COALESCE(activated_at, now()) END,
            invitation_code_hash = NULL, invitation_expires_at = NULL,
            invitation_attempts = 0, invitation_locked_until = NULL
      WHERE phone_hash = ANY($1::text[]) AND active
      RETURNING name, role`,
    [phoneHashCandidates(phone), await hashPassword(value), temp, phone.slice(-4), hashPhone(phone)]
  );
  if (rows.length === 0) die("No active user has that number. Try: npm run user list");

  for (const r of rows) banner(`${r.name} — ${r.role}`, phone, value, temp);
  console.log("  Any device that was signed in as them has been signed out.\n");
}

async function lock() {
  const phoneIn = flag("phone") ?? die("lock needs --phone");
  const phone = normalisePhone(phoneIn);
  const clear = has("clear");
  const { rows } = await pool.query(
    clear
      ? `UPDATE users SET phone_hash = $2, failed_attempts = 0, locked_until = NULL
          WHERE phone_hash = ANY($1::text[]) AND active RETURNING name`
      : `UPDATE users SET phone_hash = $2, locked_until = now() + interval '100 years'
          WHERE phone_hash = ANY($1::text[]) AND active RETURNING name`,
    [phoneHashCandidates(phone), hashPhone(phone)]
  );
  if (rows.length === 0) die("No active user has that number.");
  console.log(`\n  ${rows.map((r) => r.name).join(", ")} — ${clear ? "unlocked" : "locked out"}.\n`);
}

const VERBS: Record<string, () => Promise<void>> = { list, add, invite, password, lock };

try {
  const run = verb ? VERBS[verb] : undefined;
  if (!run) {
    console.log(`
  npm run user list
  npm run user add      -- --phone 9876543210 --name "Anita Verma" --role coordinator [--block Rampur] [--local-checker]
  npm run user invite   -- --phone 9876543210 [--org uuid]
  npm run user password -- --phone 9876543210 [--set "chosen password"] [--force-change | --no-force-change]
  npm run user lock     -- --phone 9876543210 [--clear]
`);
    process.exit(verb ? 1 : 0);
  }
  await run();
} finally {
  await pool.end();
}
