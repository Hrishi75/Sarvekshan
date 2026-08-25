import { q } from "./db";
import { rupees } from "./format";

export type Finding = {
  school_id: string;
  school_name: string;
  kind: "REVERT" | "GRANT" | "LATE" | "DISCL";
  detail: string;
  tone: "bad" | "warn";
  sort: number;
};

/**
 * Findings are derived, never stored — each one is a live query against evidence.
 * Money is formatted here, in the app, never in SQL.
 */
export async function findingsFor(orgId: string, limit = 40): Promise<Finding[]> {
  const [reverts, grants, late, noBoard] = await Promise.all([
    q<{ school_id: string; school_name: string; facility: string; days: string; reporters: string }>(
      `SELECT r.school_id, s.name AS school_name, f.label_en AS facility,
              EXTRACT(day FROM now() - r.failed_at)::int::text AS days,
              r.independent_reporters::text AS reporters
         FROM reversions r
         JOIN schools s ON s.id = r.school_id
         JOIN facility_types f ON f.key = r.facility_key
        WHERE s.org_id = $1
        ORDER BY r.failed_at DESC LIMIT 20`,
      [orgId]
    ),
    q<{ school_id: string; school_name: string; released: string; verified: string | null }>(
      `SELECT g.school_id, s.name AS school_name,
              g.amount_released_paise::text AS released,
              g.amount_verified_paise::text AS verified
         FROM grants g JOIN schools s ON s.id = g.school_id
        WHERE s.org_id = $1
          AND g.amount_released_paise > 0
          AND COALESCE(g.amount_verified_paise, 0) < g.amount_released_paise * 0.25
        ORDER BY g.amount_released_paise DESC LIMIT 12`,
      [orgId]
    ),
    q<{ school_id: string; school_name: string; facility: string; offset_days: number; late: string }>(
      `SELECT c.school_id, s.name AS school_name, f.label_en AS facility,
              c.offset_days, (current_date - c.due_on)::text AS late
         FROM checks c
         JOIN schools s ON s.id = c.school_id
         JOIN facility_types f ON f.key = c.facility_key
        WHERE s.org_id = $1 AND c.state IN ('pending','sent') AND c.due_on < current_date
        ORDER BY c.due_on LIMIT 12`,
      [orgId]
    ),
    q<{ school_id: string; school_name: string }>(
      `SELECT s.id AS school_id, s.name AS school_name
         FROM schools s
        WHERE s.org_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM observations o
             WHERE o.school_id = s.id AND o.facility_key = 'notice_board')
        ORDER BY s.name LIMIT 8`,
      [orgId]
    ),
  ]);

  const out: Finding[] = [
    ...reverts.map((r) => ({
      school_id: r.school_id,
      school_name: r.school_name,
      kind: "REVERT" as const,
      detail: `${r.facility} failed again ${r.days} days after the repair${
        Number(r.reporters) > 0 ? ` · ${r.reporters} independent` : ""
      }`,
      tone: "bad" as const,
      sort: 0,
    })),
    ...grants.map((g) => ({
      school_id: g.school_id,
      school_name: g.school_name,
      kind: "GRANT" as const,
      detail: `${rupees(Number(g.released))} released, ${rupees(
        Number(g.released) - Number(g.verified ?? 0)
      )} unverified on site`,
      tone: "bad" as const,
      sort: 1,
    })),
    ...late.map((l) => ({
      school_id: l.school_id,
      school_name: l.school_name,
      kind: "LATE" as const,
      detail: `${l.facility} day-${l.offset_days} check is ${l.late} days overdue`,
      tone: "warn" as const,
      sort: 2,
    })),
    ...noBoard.map((n) => ({
      school_id: n.school_id,
      school_name: n.school_name,
      kind: "DISCL" as const,
      detail: "No expenditure board photographed — a disclosure the school already owes",
      tone: "warn" as const,
      sort: 3,
    })),
  ];

  return out.sort((a, b) => a.sort - b.sort).slice(0, limit);
}
