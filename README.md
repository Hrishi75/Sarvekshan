# Sarvekshan

A public evidence and operations platform for teams repairing village government
schools. It connects what somebody sees on site, the work the team decides to do,
what that work costs, and whether the repair still functions months later.

Built around one rule: **if it is slower than WhatsApp, it is dead.** The capture
flow targets under sixty seconds, needs no typing, and completes with the network off.

The complete product contract — users, records, workflow, evidence rules, measures,
and boundaries — is in [`docs/platform-definition.md`](docs/platform-definition.md).

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL and FR_SESSION_SECRET
npm run db:migrate           # applies db/migrations/*.sql
npm run seed                 # 12 schools, a year of completed work, and an open repair queue
npm run dev                  # http://localhost:3000
```

Requires a PostgreSQL 16+ database with the `cube` and `earthdistance` extensions
available (both ship with a standard Postgres install). Point `DATABASE_URL` in
`.env.local` at it. `docker-compose.yml` is provided as an alternative to a local server.

`npm run seed` prints the phone numbers and the one shared password for the demo
roster. Sign in at `/signin` with any of them.

## The public board

`/` is public. Signed out, it is the whole register in the open — which school is in
what condition, the facilities somebody actually saw on site, when they last saw
them, and how many past repairs have already broken again. **Sign in** is a button in
the top right, and the same URL renders the desk dashboard once you are signed in.

**Everything in the register is on it**, in seven sections: the district totals, a
facility-by-facility breakdown of what is broken and where, the map, the survival
curves and cost per lasting outcome, the grant reconciliation from sanctioned down
to verified-on-site, the findings the team is chasing, and then every school with a
search box over it. There is no publication gate: a school left off a transparency
page is exactly the school a reader would most want to see. `schools.is_public`
still exists in the schema and is deliberately unread — put the filter back in
`PublicBoard.tsx` if this deployment ever needs per-school opt-in.

Two things are held back, and only two: **names and photographs**. Nothing on the
page identifies a child, a teacher, or a field worker, and the record of who
reported what stays inside the register. The money is not held back — "released but
not yet verified on site" is published as a gap in the team's own checking, next to
its own overdue follow-ups, because publishing a school's failures while hiding the
surveyor's would not be transparency.

The page has no session, so it has no org to scope to: `survivalByWorkType(null)`
and `findingsFor(null)` mean *every org in the register*. Every signed-in caller
still passes its own org id and is unaffected.

Absent evidence stays absent. A school nobody has visited has no score and reads
"not visited yet"; a facility never observed anywhere draws no bar at all; a missed
check is dropped from the denominator rather than counted as a pass.

Everything else — `/schools`, `/findings`, `/api/export` — is unchanged and still
requires a session.

## Signing in

The identifier is the **phone number** — what a field worker already knows, and what
phone OTP will use when it replaces the password. Nothing downstream of `SessionUser`
changes when that happens.

New accounts use an invitation instead of a temporary password. A coordinator adds
the person, reads them the one-time code, and they open `/signup` to choose their own
password. The code expires after seven days, locks after five wrong attempts, and is
deleted as soon as it is used.

```bash
npm run user list                                     # who exists, and their credential state
npm run user add -- --phone 9876543210 --name "Anita Verma" --role coordinator --block Rampur
npm run user invite -- --phone 9876543210             # replace an expired, unused invitation
npm run user password -- --phone 9876543210           # issue a temporary password
npm run user password -- --phone 9876543210 --set "one you chose"
npm run user lock -- --phone 9876543210 [--clear]
```

`add` prints an activation code once. `password` is the recovery path for an existing
account and prints its credential once, to be read down a phone line. A **generated**
recovery password is temporary by construction: it arrives with
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
and still one click outside production. Production refuses to start if the bypass flag
is enabled. Set `FR_ALLOW_DEV_SIGNIN=0` locally to test the real account flow.

## Deploying

`DATABASE_URL`, `FR_SESSION_SECRET`, and `FR_MEDIA_ROOT` must be set;
`src/instrumentation.ts` refuses to start the server without them rather than letting
a misconfigured deployment look healthy. `FR_MEDIA_ROOT` must point at durable storage
because it holds uploaded field evidence. Generate the session secret with
`openssl rand -base64 48`. Changing it later signs everybody out, which is the blunt
way to revoke every session at once. `/api/health` checks database readiness for a
load balancer without returning operational data.

The repository includes a multi-stage `Dockerfile`. Build and start it with a durable
media volume and the runtime variables:

```bash
docker build -t sarvekshan .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgres://..." \
  -e FR_SESSION_SECRET="..." \
  -v sarvekshan_media:/app/data \
  sarvekshan
```

Run `npm run db:migrate` as a release step before starting the new image. The server
also sends clickjacking, MIME-sniffing, referrer, permissions, and HSTS headers, and
removes the framework identification header.

Then create the first real account:

```bash
npm run user add -- --phone <coordinator's number> --name "..." --role coordinator
```

Open `/signup` and use the code printed by that command.

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

## School register

All signed-in users can browse `/schools`, search by school name, UDISE code,
village, or block, and filter by block. The list uses cards on phones and a table
on larger screens; the map shows schools with coordinates. Field screens link
directly to the register, and **New audit** on a school record selects that school.

Coordinators and admins can choose **Add school**. Only the name is required;
UDISE code, location, enrolment, and coordinates can be left unknown. A new school
has no score until there is site evidence. Repeated saves reuse the same record,
and an existing UDISE code links back to its school instead of creating a duplicate.

## Managing repairs

Review a report in `/inbox` and choose **Plan repair**. The linked repair opens at
`/repairs/[id]`, where a coordinator can select the repair type, assign an owner,
set a target date, and record estimates, final costs, and materials. `/repairs`
shows the open queue, overdue targets, and unassigned work, with search and status filters.
Each school record also links to its repairs.

Completing a repair requires the actual cost (zero is allowed), completion date,
and the person who performed it. The existing database trigger schedules the four
follow-ups and chooses a different local checker where available. Completed records
are read-only to protect their follow-up history. Editing requires a connection;
failed saves retain the form entries. Site observations still use offline capture.

Repeated triage submissions reuse the original repair. Concurrent edits are rejected
with a prompt to load the latest record, so one coordinator cannot silently overwrite another.
Migration `0006_notice_board_work_type.sql` adds the previously missing notice-board repair type.

Run `npm test` for input validation and `npm run test:repairs` for the repair lifecycle
against your migrated PostgreSQL database. The database tests use isolated fixtures in a
transaction and roll them back, covering permissions, duplicate triage, stale edits,
costs, completion, and automatic follow-ups.

`npm run seed` builds an open queue to work through: fourteen repairs across planned and
in progress, some past their target date, some with no owner, some not yet estimated. Every
one is linked to the report it came from, so a record shows where it started. The mix is
written out rather than randomised — a random draw can produce nothing overdue and nothing
unassigned, and then the queue looks empty for whoever seeds it next. None of them schedule
a check: `works_schedule_checks()` returns early on anything short of completed, and the
survival figures count only completed work.

## What is not built yet

- Phone OTP (password sign-in is in place; see **Signing in** above)
- Self-service password recovery — today a coordinator issues a new one with
  `npm run user password`, which is the right shape for a programme this size
  but does not scale past one
- WhatsApp reminders and the intake bot — start the Business API application early,
  template approval is slow and sits on the critical path
- The ghost-overlay camera for repeat photography (`photo_points` schema is in place;
  the capture UI currently takes a plain photo)
- Bill OCR, the auto-assembled donor report
- The public per-school share page (`schools.is_public` exists, off by default)
- Server-side face blur on ingest

## Layout

```
db/migrations/     schema and the follow-up engine
scripts/seed.mjs   demo data with a realistic survival profile
scripts/user.mts   accounts, invitations, and credential recovery
src/proxy.ts       holds a temporary-password session on /password
src/app/signup/    one-time invitation activation and password setup
src/app/platform/  public explanation of the product and evidence model
src/app/PublicBoard.tsx  the signed-out landing page: school conditions, opt-in per school
docs/platform-definition.md  product scope, users, workflow, measures, and boundaries
src/lib/           db, session, passwords, offline queue, survival maths, storage
src/app/visit/     the sixty-second capture flow — the screen it all depends on
src/app/checks/    follow-up checks, and completing one
src/app/inbox/     coordinator triage
src/app/repairs/   repair assignment, costs, completion, and follow-up history
src/app/survival/  what is still working
```
