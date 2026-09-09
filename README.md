# Field Register

An operations tool for a team doing repair work in village government schools.
It records what a school needed, what was fixed, what it cost — and it is the only
part of the process that finds out whether the repair was still working a year later.

Built around one rule: **if it is slower than WhatsApp, it is dead.** The capture
flow targets under sixty seconds, needs no typing, and completes with the network off.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL and FR_SESSION_SECRET
npm run db:migrate           # applies db/migrations/*.sql
npm run seed                 # 12 schools, 44 works, a year of follow-up checks
npm run dev                  # http://localhost:3000
```

Requires a PostgreSQL 16+ database with the `cube` and `earthdistance` extensions
available (both ship with a standard Postgres install). Point `DATABASE_URL` in
`.env.local` at it. `docker-compose.yml` is provided as an alternative to a local server.

`npm run seed` prints the phone numbers and the one shared password for the demo
roster. Sign in at `/signin` with any of them.

## Signing in

The identifier is the **phone number** — what a field worker already knows, and what
phone OTP will use when it replaces the password. Nothing downstream of `SessionUser`
changes when that happens.

```bash
npm run user list                                     # who exists, and their credential state
npm run user add -- --phone 9876543210 --name "Anita Verma" --role coordinator --block Rampur
npm run user password -- --phone 9876543210           # issue a temporary password
npm run user password -- --phone 9876543210 --set "one you chose"
npm run user lock -- --phone 9876543210 [--clear]
```

`add` and `password` print the credential once, to be read down a phone line. A
**generated** password is temporary by construction: it arrives with
`must_change_password` set, and `src/proxy.ts` holds that session on `/password`
until the person has chosen their own. A password you pass with `--set` is treated
as deliberate and forces nothing.

Four things worth knowing:

- **The session cookie is signed** (HMAC-SHA256, `FR_SESSION_SECRET`). It used to be
  the bare user id, which any client could set to any uuid. Cookies minted under the
  old format stopped working the moment that changed.
- **`password_set_at` is the session version.** Every cookie carries the value it had
  when it was signed, so changing or resetting a password signs out every device that
  person was logged in on — which is what makes `npm run user password` a real recovery
  path for a lost handset.
- **Five wrong attempts locks the account for fifteen minutes.** The account, not the
  IP: a village shares one tower.
- **Passwords are scrypt.** No dependency — `node:crypto` has it, and it is memory-hard.

The development picker at `/signin` — sign in as anyone, no password — is still there
and still one click. It is off in production unless `FR_ALLOW_DEV_SIGNIN=1`.

## Deploying

`DATABASE_URL` and `FR_SESSION_SECRET` must both be set; `src/instrumentation.ts`
refuses to start the server without them rather than letting a deployment look healthy
until the first person tries to sign in. Generate the secret with
`openssl rand -base64 48`. Changing it later signs everybody out, which is the blunt
way to revoke every session at once.

Then create the first real account:

```bash
npm run user add -- --phone <coordinator's number> --name "..." --role coordinator
```

## The four objects

```
SCHOOL          the permanent record, one per school forever
 └─ VISIT       someone went and looked
     └─ WORK    we decided to fix something — cost, materials, who did it
         └─ CHECK   did it survive? +7 / +90 / +180 / +365 days
```

Resist adding a fifth.

## Why the follow-up engine is a database trigger

`works_schedule_checks` (see `db/migrations/0002_followup_engine.sql`) writes four
future checks the moment work is marked done, and assigns them to a **local resident
checker who did not do the work**. It is a trigger rather than application code so
that no code path — an import, a bulk edit, a future API — can quietly skip it.

`checks_derive_independence` computes `independent` / `affiliated` / `self` from who
did the work versus who checked it. It is derived, never hand-entered. Self-checks are
recorded and displayed rather than blocked — sometimes the volunteer is the only person
in the village with a smartphone — but they carry no weight in the survival figures.

## Offline is the baseline, not a feature

A check that fails to upload is a check that never happened, and the volunteer will
not attempt it twice. So:

- Every capture is written to IndexedDB (`src/lib/offline.ts`) before anything else.
  The UI says **saved**, never *uploaded*.
- Photos are compressed to ~250 KB on-device before they enter the queue.
- Every record carries a device-generated `client_uuid`, and the server upserts on it.
  Retrying the same payload after a dropped connection is a verified no-op.
- Media uploads go one at a time so a single failed photo cannot block the batch.

## Survival, and cost per lasting outcome

`/survival` is what the whole system exists to produce. For each work type it shows the
share still functional at each checkpoint, then divides total spend by how much is still
working — the true cost, typically several times the headline figure.

Two deliberate choices in `src/lib/survival.ts`:

- **A missed check is excluded from the denominator, never counted as working.** An
  unchecked school is a gap in the record, not a pass.
- **Zero survival is a finding, not a missing value.** When nothing survived to the last
  checkpoint, the row says so explicitly instead of rendering blank.

## What is not built yet

- Phone OTP (password sign-in is in place; see **Signing in** above)
- Self-service password recovery — today a coordinator issues a new one with
  `npm run user password`, which is the right shape for a programme this size
  but does not scale past one
- WhatsApp reminders and the intake bot — start the Business API application early,
  template approval is slow and sits on the critical path
- The ghost-overlay camera for repeat photography (`photo_points` schema is in place;
  the capture UI currently takes a plain photo)
- Work-order editing, bill OCR, the auto-assembled donor report
- The public per-school share page (`schools.is_public` exists, off by default)
- Server-side face blur on ingest

## Layout

```
db/migrations/     schema and the follow-up engine
scripts/seed.mjs   demo data with a realistic survival profile
scripts/user.mts   accounts and credentials — the only way in for a real person
src/proxy.ts       holds a temporary-password session on /password
src/lib/           db, session, passwords, offline queue, survival maths, storage
src/app/visit/     the sixty-second capture flow — the screen it all depends on
src/app/checks/    follow-up checks, and completing one
src/app/inbox/     coordinator triage
src/app/survival/  what is still working
```
