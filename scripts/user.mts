/**
 * Credential admin. The one way to put a person into a deployment and the one
 * way to get them back in when they forget.
 *
 *   npm run user list
 *   npm run user add -- --phone 9876543210 --name "Anita Verma" --role coordinator --block Rampur
 *   npm run user password -- --phone 9876543210
 *   npm run user password -- --phone 9876543210 --set "a password you chose"
 *   npm run user lock -- --phone 9876543210 --clear
 *
 * A generated password is temporary by construction: it lands with
 * must_change_password set, so the first thing it buys is the change form.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { generateTempPassword, hashPassword, hashPhone, isValidPhone, normalisePhone } from "@/lib/password";
import { passwordProblem } from "@/lib/password-rules";

// .env.local for a laptop; real environment variables everywhere else.
function connectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => l.split(/=([\s\S]*)/).slice(0, 2))
    );
    if (env.DATABASE_URL) return env.DATABASE_URL;
  } catch {
    /* no .env.local — that is normal in production */
  }
  throw new Error("DATABASE_URL is not set and .env.local has no DATABASE_URL.");
}

const argv = process.argv.slice(2);
const verb = argv[0];
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name: string) => argv.includes(`--${name}`);

const pool = new Pool({ connectionString: connectionString() });
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

async function list() {
  const { rows } = await pool.query(
    `SELECT u.name, u.role, u.block, u.phone_last4, u.is_local_checker, o.name AS org,
            (u.password_hash IS NOT NULL) AS has_password, u.must_change_password,
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
      ? "no password set"
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
  let orgId = flag("org");
  if (!orgId) {
    const { rows } = await pool.query(`SELECT id, name FROM orgs ORDER BY name`);
    if (rows.length === 0) die("No orgs exist yet. Run npm run seed, or insert one.");
    if (rows.length > 1) {
      die(`More than one org — pass --org:\n  ${rows.map((r) => `${r.id}  ${r.name}`).join("\n  ")}`);
    }
    orgId = rows[0].id;
  }

  const password = flag("set") ?? generateTempPassword();
  const temp = !flag("set");
  const problem = passwordProblem(password);
  if (problem) die(problem);

  const { rows } = await pool.query(
    `INSERT INTO users (org_id, phone_hash, phone_last4, name, role, block, is_local_checker,
                        password_hash, password_set_at, must_change_password)
     VALUES ($1,$2,$3,$4,$5::user_role,$6,$7,$8,now(),$9)
     ON CONFLICT (org_id, phone_hash) DO NOTHING
     RETURNING name`,
    [orgId, hashPhone(phone), phone.slice(-4), name, role, block, has("local-checker"),
     await hashPassword(password), temp]
  );
  if (rows.length === 0) die("Somebody in that org already uses that number.");

  banner(`${name} — ${role}`, phone, password, temp);
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
        SET password_hash = $2, password_set_at = now(), must_change_password = $3,
            failed_attempts = 0, locked_until = NULL, phone_last4 = $4
      WHERE phone_hash = $1 AND active
      RETURNING name, role`,
    [hashPhone(phone), await hashPassword(value), temp, phone.slice(-4)]
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
      ? `UPDATE users SET failed_attempts = 0, locked_until = NULL
          WHERE phone_hash = $1 AND active RETURNING name`
      : `UPDATE users SET locked_until = now() + interval '100 years'
          WHERE phone_hash = $1 AND active RETURNING name`,
    [hashPhone(phone)]
  );
  if (rows.length === 0) die("No active user has that number.");
  console.log(`\n  ${rows.map((r) => r.name).join(", ")} — ${clear ? "unlocked" : "locked out"}.\n`);
}

const VERBS: Record<string, () => Promise<void>> = { list, add, password, lock };

try {
  const run = verb ? VERBS[verb] : undefined;
  if (!run) {
    console.log(`
  npm run user list
  npm run user add      -- --phone 9876543210 --name "Anita Verma" --role coordinator [--block Rampur] [--local-checker]
  npm run user password -- --phone 9876543210 [--set "chosen password"] [--force-change | --no-force-change]
  npm run user lock     -- --phone 9876543210 [--clear]
`);
    process.exit(verb ? 1 : 0);
  }
  await run();
} finally {
  await pool.end();
}
