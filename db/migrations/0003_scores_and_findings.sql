-- Scores, grant reconciliation and findings.
-- Everything here is a VIEW so the numbers are always derived from evidence,
-- never stored and drifting. The score must be explainable on the school page.

-- ── grants: the four stages of the reconciliation ───────────────────────────
-- sanctioned -> released -> accounted (paperwork) -> verified (seen on site)
CREATE TABLE IF NOT EXISTS grants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  ay             text NOT NULL,
  head           text NOT NULL,
  amount_sanctioned_paise bigint,
  amount_released_paise   bigint,
  amount_accounted_paise  bigint,
  amount_verified_paise   bigint,
  released_on    date,
  -- a rule may earmark a share of the grant for a named purpose
  -- (Composite School Grant: minimum 10% to the Swachhta / WASH plan)
  earmark_share  numeric(4,3),
  earmark_label  text,
  source_url     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, ay, head)
);
CREATE INDEX IF NOT EXISTS grants_school_idx ON grants (school_id, ay);

-- ── latest known state of each facility, from whichever signal is newest ─────
CREATE OR REPLACE VIEW facility_signals AS
  SELECT o.org_id, o.school_id, o.facility_key, o.created_at AS at,
         o.state::text AS raw,
         CASE o.state WHEN 'working' THEN 'working'
                      WHEN 'problem' THEN 'partial'
                      ELSE 'broken' END AS state,
         'observation'::text AS source, NULL::uuid AS work_id
    FROM observations o
  UNION ALL
  SELECT c.org_id, c.school_id, c.facility_key, c.completed_at AS at,
         c.result::text AS raw,
         CASE c.result WHEN 'functional' THEN 'working'
                       WHEN 'degraded'   THEN 'partial'
                       WHEN 'failed'     THEN 'broken'
                       ELSE NULL END AS state,
         'check'::text AS source, c.work_id
    FROM checks c
   WHERE c.state = 'done' AND c.result IS NOT NULL;

CREATE OR REPLACE VIEW school_facility_state AS
  SELECT DISTINCT ON (school_id, facility_key)
         org_id, school_id, facility_key, state, at, source, work_id
    FROM facility_signals
   WHERE state IS NOT NULL
   ORDER BY school_id, facility_key, at DESC;

-- ── reversions: work was completed, and a later check found it broken ───────
CREATE OR REPLACE VIEW reversions AS
  SELECT c.org_id, c.school_id, c.facility_key, c.work_id,
         w.work_type_key, w.done_on,
         min(c.completed_at) AS failed_at,
         count(*)                                   AS failing_checks,
         count(DISTINCT c.by_user_id) FILTER (WHERE c.independence = 'independent')
                                                    AS independent_reporters
    FROM checks c
    JOIN works w ON w.id = c.work_id
   WHERE c.state = 'done' AND c.result = 'failed' AND w.done_on IS NOT NULL
   GROUP BY 1,2,3,4,5,6;

-- ── the score, with every component kept visible ────────────────────────────
CREATE OR REPLACE VIEW school_scores AS
WITH facilities AS (
  SELECT school_id, org_id,
         count(*)                                          AS tracked,
         count(*) FILTER (WHERE state = 'working')          AS working,
         count(*) FILTER (WHERE state = 'partial')          AS partial,
         count(*) FILTER (WHERE state = 'broken')           AS broken
    FROM school_facility_state GROUP BY 1,2
),
money AS (
  SELECT school_id, org_id,
         sum(amount_released_paise)  AS released,
         sum(amount_verified_paise)  AS verified
    FROM grants GROUP BY 1,2
),
followups AS (
  SELECT school_id, org_id,
         count(*) FILTER (WHERE state = 'done')                                AS done,
         count(*) FILTER (WHERE state = 'done' AND result = 'functional')      AS passed,
         count(*) FILTER (WHERE state IN ('pending','sent')
                            AND due_on < current_date)                          AS overdue
    FROM checks GROUP BY 1,2
),
rev AS (
  SELECT school_id, count(*) AS n FROM reversions GROUP BY 1
)
SELECT s.id AS school_id, s.org_id,
       f.tracked, f.working, f.partial, f.broken,
       COALESCE(r.n, 0)             AS reversions,
       COALESCE(fu.overdue, 0)      AS overdue_checks,
       m.released                   AS released_paise,
       m.verified                   AS verified_paise,
       -- components, each 0..100 and each individually inspectable
       CASE WHEN f.tracked > 0
            THEN round(100.0 * (f.working + 0.5 * f.partial) / f.tracked)
            END                                                AS facility_component,
       CASE WHEN m.released > 0
            THEN round(100.0 * LEAST(m.verified, m.released) / m.released)
            END                                                AS grant_component,
       CASE WHEN fu.done > 0
            THEN round(100.0 * fu.passed / fu.done)
            END                                                AS followup_component,
       -- weighted, renormalised over whichever components exist, then penalised
       CASE WHEN f.tracked IS NULL AND m.released IS NULL AND fu.done IS NULL THEN NULL
       ELSE GREATEST(0, LEAST(100, round(
              ( COALESCE(0.55 * (100.0 * (f.working + 0.5*f.partial) / NULLIF(f.tracked,0)), 0)
              + COALESCE(0.25 * (100.0 * LEAST(m.verified,m.released) / NULLIF(m.released,0)), 0)
              + COALESCE(0.20 * (100.0 * fu.passed / NULLIF(fu.done,0)), 0)
              ) / NULLIF(
                  COALESCE(CASE WHEN f.tracked   > 0 THEN 0.55 END, 0)
                + COALESCE(CASE WHEN m.released  > 0 THEN 0.25 END, 0)
                + COALESCE(CASE WHEN fu.done     > 0 THEN 0.20 END, 0), 0)
              - 4 * COALESCE(r.n, 0)          -- each reversion costs 4 points
              - 2 * COALESCE(fu.overdue, 0)   -- each overdue check costs 2
            ))) END                                            AS score
  FROM schools s
  LEFT JOIN facilities f  ON f.school_id  = s.id
  LEFT JOIN money      m  ON m.school_id  = s.id
  LEFT JOIN followups  fu ON fu.school_id = s.id
  LEFT JOIN rev        r  ON r.school_id  = s.id;
