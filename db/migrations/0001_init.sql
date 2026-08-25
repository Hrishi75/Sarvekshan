-- Field Register — initial schema
-- Four objects: SCHOOL -> VISIT -> WORK -> CHECK
-- Everything carries org_id so a second NGO can use this later without a rewrite.

CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── enums ────────────────────────────────────────────────────────────────────
CREATE TYPE user_role       AS ENUM ('volunteer','coordinator','admin');
CREATE TYPE facility_state  AS ENUM ('working','problem','broken');
CREATE TYPE visit_source    AS ENUM ('app','whatsapp','import');
CREATE TYPE work_status     AS ENUM ('planned','in_progress','done','cancelled');
CREATE TYPE check_state     AS ENUM ('pending','sent','done','missed','escalated');
CREATE TYPE check_result    AS ENUM ('functional','degraded','failed','inaccessible');
CREATE TYPE independence    AS ENUM ('independent','affiliated','self');
CREATE TYPE media_kind      AS ENUM ('condition','completion','bill','voice','reference');

-- ── orgs & users ─────────────────────────────────────────────────────────────
CREATE TABLE orgs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  -- phone is stored hashed and kept separable from anything they report
  phone_hash  text NOT NULL,
  phone_last4 text,
  name        text NOT NULL,
  role        user_role NOT NULL DEFAULT 'volunteer',
  block       text,
  -- a local checker is a resident, not part of the team that does the work
  is_local_checker boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone_hash)
);
CREATE INDEX users_org_role_idx ON users (org_id, role) WHERE active;

-- ── 1. SCHOOL — the permanent record ─────────────────────────────────────────
CREATE TABLE schools (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  udise_code  text,
  name        text NOT NULL,
  village     text,
  block       text,
  district    text,
  state       text,
  lat         double precision,
  lng         double precision,
  enrolment   integer,
  -- public share page is off by default; the team opts a school in deliberately
  is_public   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, udise_code)
);
-- GiST index over earth coordinates: powers "which school am I standing in?"
CREATE INDEX schools_earth_idx ON schools
  USING gist (ll_to_earth(lat, lng)) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX schools_org_idx ON schools (org_id);

-- ── facilities we track (stable keys — every survival curve groups by these) ──
CREATE TABLE facility_types (
  key         text PRIMARY KEY,
  label_en    text NOT NULL,
  label_hi    text NOT NULL,
  sort_order  integer NOT NULL
);

-- ── photo points: the fixed standing position, reused for years ───────────────
CREATE TABLE photo_points (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  facility_key  text NOT NULL REFERENCES facility_types(key),
  lat           double precision,
  lng           double precision,
  -- the baseline image is what actually makes repeat photos comparable
  reference_media_id uuid,
  -- the note is what still works when a different person does the check next year
  landmark_note text,
  bearing_deg   numeric(5,2),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, facility_key)
);

-- ── 2. VISIT — someone went and looked ───────────────────────────────────────
CREATE TABLE visits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  source      visit_source NOT NULL DEFAULT 'app',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- device-generated: makes retries over a flapping rural uplink idempotent
  client_uuid uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, client_uuid)
);
CREATE INDEX visits_school_idx ON visits (school_id, occurred_at DESC);

CREATE TABLE observations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  visit_id      uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  facility_key  text NOT NULL REFERENCES facility_types(key),
  state         facility_state NOT NULL,
  note_text     text,
  -- the voice note is worth more than every text field combined
  voice_media_id uuid,
  transcript    text,
  -- triage: coordinator clears this when it becomes work or is dismissed
  triaged_at    timestamptz,
  dismissed_reason text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX observations_triage_idx ON observations (org_id, state, created_at DESC)
  WHERE triaged_at IS NULL;
CREATE INDEX observations_school_idx ON observations (school_id, facility_key, created_at DESC);

-- ── 3. WORK — we decided to fix something ────────────────────────────────────
CREATE TABLE work_types (
  key         text PRIMARY KEY,
  label_en    text NOT NULL,
  facility_key text REFERENCES facility_types(key),
  sort_order  integer NOT NULL
);

CREATE TABLE works (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  facility_key  text NOT NULL REFERENCES facility_types(key),
  work_type_key text NOT NULL REFERENCES work_types(key),
  description   text,
  status        work_status NOT NULL DEFAULT 'planned',
  est_cost_paise   bigint,
  actual_cost_paise bigint,
  materials     text,
  assigned_to_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- who physically did it: drives the independence check on follow-ups
  performed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  performed_by_org_id uuid REFERENCES orgs(id) ON DELETE SET NULL,
  target_date   date,
  done_on       date,
  client_uuid   uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, client_uuid)
);
CREATE INDEX works_school_idx ON works (school_id, created_at DESC);
CREATE INDEX works_open_idx ON works (org_id, status) WHERE status IN ('planned','in_progress');

-- which observations this work answers (keeps the link back to the original photo)
CREATE TABLE work_observations (
  work_id        uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  PRIMARY KEY (work_id, observation_id)
);

-- ── 4. CHECK — written by the system, never requested by a human ─────────────
CREATE TABLE checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  work_id       uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  facility_key  text NOT NULL REFERENCES facility_types(key),
  photo_point_id uuid REFERENCES photo_points(id) ON DELETE SET NULL,
  offset_days   integer NOT NULL,           -- 7 | 90 | 180 | 365
  due_on        date NOT NULL,
  assigned_to_id uuid REFERENCES users(id) ON DELETE SET NULL,
  state         check_state NOT NULL DEFAULT 'pending',
  reminded_at   timestamptz[] NOT NULL DEFAULT '{}',
  -- filled in when the check is actually done
  result        check_result,
  note_text     text,
  voice_media_id uuid,
  by_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  independence  independence,
  completed_at  timestamptz,
  geo_distance_m integer,
  client_uuid   uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, offset_days),
  UNIQUE (org_id, client_uuid)
);
CREATE INDEX checks_due_idx ON checks (due_on, state) WHERE state IN ('pending','sent');
CREATE INDEX checks_assignee_idx ON checks (assigned_to_id, state);
CREATE INDEX checks_work_idx ON checks (work_id, offset_days);

-- ── media ────────────────────────────────────────────────────────────────────
CREATE TABLE media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  storage_key   text NOT NULL,
  kind          media_kind NOT NULL,
  mime          text,
  bytes         integer,
  phash         text,
  captured_at   timestamptz,
  lat           double precision,
  lng           double precision,
  blur_applied  boolean NOT NULL DEFAULT false,
  -- polymorphic owner: one of these is set
  visit_id      uuid REFERENCES visits(id) ON DELETE CASCADE,
  observation_id uuid REFERENCES observations(id) ON DELETE CASCADE,
  work_id       uuid REFERENCES works(id) ON DELETE CASCADE,
  check_id      uuid REFERENCES checks(id) ON DELETE CASCADE,
  photo_point_id uuid REFERENCES photo_points(id) ON DELETE CASCADE,
  client_uuid   uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, client_uuid)
);
CREATE INDEX media_observation_idx ON media (observation_id);
CREATE INDEX media_check_idx ON media (check_id);
CREATE INDEX media_phash_idx ON media (org_id, phash) WHERE phash IS NOT NULL;

ALTER TABLE photo_points ADD CONSTRAINT photo_points_reference_fk
  FOREIGN KEY (reference_media_id) REFERENCES media(id) ON DELETE SET NULL;

-- ── survival rollup — materialised nightly so last night's curve stays stable ─
CREATE TABLE survival (
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  work_type_key text NOT NULL REFERENCES work_types(key),
  block         text,
  offset_days   integer NOT NULL,
  n_total       integer NOT NULL,
  n_functional  integer NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, work_type_key, block, offset_days)
);
