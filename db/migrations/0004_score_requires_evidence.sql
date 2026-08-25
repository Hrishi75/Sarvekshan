-- A score is an AUDIT score. Without site evidence there is no audit, however
-- much paperwork exists — so a school nobody has visited scores NULL and renders
-- as a visible gap, rather than being handed a number derived from a grant PDF.

CREATE OR REPLACE VIEW school_scores AS
WITH facilities AS (
  SELECT school_id, org_id,
         count(*)                                  AS tracked,
         count(*) FILTER (WHERE state = 'working')  AS working,
         count(*) FILTER (WHERE state = 'partial')  AS partial,
         count(*) FILTER (WHERE state = 'broken')   AS broken
    FROM school_facility_state GROUP BY 1,2
),
money AS (
  SELECT school_id, org_id,
         sum(amount_released_paise) AS released,
         sum(amount_verified_paise) AS verified
    FROM grants GROUP BY 1,2
),
followups AS (
  SELECT school_id, org_id,
         count(*) FILTER (WHERE state = 'done')                           AS done,
         count(*) FILTER (WHERE state = 'done' AND result = 'functional')  AS passed,
         count(*) FILTER (WHERE state IN ('pending','sent')
                            AND due_on < current_date)                     AS overdue
    FROM checks GROUP BY 1,2
),
rev AS (
  SELECT school_id, count(*) AS n FROM reversions GROUP BY 1
)
SELECT s.id AS school_id, s.org_id,
       f.tracked, f.working, f.partial, f.broken,
       COALESCE(r.n, 0)        AS reversions,
       COALESCE(fu.overdue, 0) AS overdue_checks,
       m.released              AS released_paise,
       m.verified              AS verified_paise,
       CASE WHEN f.tracked > 0
            THEN round(100.0 * (f.working + 0.5 * f.partial) / f.tracked) END AS facility_component,
       CASE WHEN m.released > 0
            THEN round(100.0 * LEAST(m.verified, m.released) / m.released) END AS grant_component,
       CASE WHEN fu.done > 0
            THEN round(100.0 * fu.passed / fu.done) END                        AS followup_component,
       -- the gate: no facility evidence, no score
       CASE WHEN COALESCE(f.tracked, 0) = 0 THEN NULL
       ELSE GREATEST(0, LEAST(100, round(
              ( COALESCE(0.55 * (100.0 * (f.working + 0.5*f.partial) / NULLIF(f.tracked,0)), 0)
              + COALESCE(0.25 * (100.0 * LEAST(m.verified,m.released) / NULLIF(m.released,0)), 0)
              + COALESCE(0.20 * (100.0 * fu.passed / NULLIF(fu.done,0)), 0)
              ) / NULLIF(
                  COALESCE(CASE WHEN f.tracked  > 0 THEN 0.55 END, 0)
                + COALESCE(CASE WHEN m.released > 0 THEN 0.25 END, 0)
                + COALESCE(CASE WHEN fu.done    > 0 THEN 0.20 END, 0), 0)
              - 4 * COALESCE(r.n, 0)
              - 2 * COALESCE(fu.overdue, 0)
            ))) END AS score
  FROM schools s
  LEFT JOIN facilities f  ON f.school_id  = s.id
  LEFT JOIN money      m  ON m.school_id  = s.id
  LEFT JOIN followups  fu ON fu.school_id = s.id
  LEFT JOIN rev        r  ON r.school_id  = s.id;
