# Field Register

An operations tool for a team doing repair work in village government schools.
It records what a school needed, what was fixed, what it cost — and it is the only
part of the process that finds out whether the repair was still working a year later.

Built around one rule: **if it is slower than WhatsApp, it is dead.** The capture
flow targets under sixty seconds, needs no typing, and completes with the network off.

## Run it

```bash
npm install
npm run db:migrate     # applies db/migrations/*.sql
npm run seed           # 12 schools, 44 works, a year of follow-up checks
npm run dev            # http://localhost:3000
```

Requires a PostgreSQL 16+ database with the `cube` and `earthdistance` extensions
available (both ship with a standard Postgres install). Point `DATABASE_URL` in
`.env.local` at it. `docker-compose.yml` is provided as an alternative to a local server.

Sign-in is a development stub at `/signin` — pick any seeded user. Phone OTP replaces
it without changing anything downstream; every page reads the same `SessionUser` shape.

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

- Phone OTP auth (stub at `/signin`)
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
src/lib/           db, session, offline queue, survival maths, storage
src/app/visit/     the sixty-second capture flow — the screen it all depends on
src/app/checks/    follow-up checks, and completing one
src/app/inbox/     coordinator triage
src/app/survival/  what is still working
```
