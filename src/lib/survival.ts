import { q } from "./db";

export type SurvivalPoint = { offset_days: number; n: number; pct: number | null };
export type SurvivalSeries = {
  work_type_key: string;
  label: string;
  points: SurvivalPoint[];
  n_works: number;
  spend_paise: number;
  /** cost per unit still functional at `lasting_at_days`; null when not yet measurable */
  lasting_paise: number | null;
  /** which checkpoint `lasting_paise` was computed at */
  lasting_at_days: number | null;
  /** true when the last checkpoint with data shows nothing survived */
  none_survived: boolean;
};

const OFFSETS = [7, 90, 180, 365];

/**
 * Survival = share of completed work still fully functional at each checkpoint.
 * Only checks that were actually done count; a missed check is excluded from the
 * denominator rather than assumed good — an unchecked school is a gap, not a pass.
 *
 * `orgId` null means every org, which is what the public board asks for: it is not
 * signed in, so it has no org to scope to. Every signed-in caller passes its own.
 */
export async function survivalByWorkType(orgId: string | null): Promise<SurvivalSeries[]> {
  const rows = await q<{
    work_type_key: string;
    label_en: string;
    offset_days: number;
    n: string;
    n_functional: string;
  }>(
    `SELECT w.work_type_key, wt.label_en, c.offset_days,
            count(*)                                        AS n,
            count(*) FILTER (WHERE c.result = 'functional')  AS n_functional
       FROM checks c
       JOIN works w      ON w.id = c.work_id
       JOIN work_types wt ON wt.key = w.work_type_key
      WHERE ($1::uuid IS NULL OR c.org_id = $1)
        AND c.state = 'done' AND c.result IS NOT NULL
      GROUP BY 1,2,3
      ORDER BY 1,3`,
    [orgId]
  );

  const totals = await q<{
    work_type_key: string;
    n_works: string;
    spend: string | null;
  }>(
    `SELECT work_type_key, count(*) AS n_works, sum(actual_cost_paise) AS spend
       FROM works WHERE ($1::uuid IS NULL OR org_id = $1) AND status = 'done'
      GROUP BY 1`,
    [orgId]
  );
  const totalBy = new Map(totals.map((t) => [t.work_type_key, t]));

  const byType = new Map<string, SurvivalSeries>();
  for (const r of rows) {
    let s = byType.get(r.work_type_key);
    if (!s) {
      const t = totalBy.get(r.work_type_key);
      s = {
        work_type_key: r.work_type_key,
        label: r.label_en,
        points: OFFSETS.map((o) => ({ offset_days: o, n: 0, pct: null })),
        n_works: Number(t?.n_works ?? 0),
        spend_paise: Number(t?.spend ?? 0),
        lasting_paise: null,
        lasting_at_days: null,
        none_survived: false,
      };
      byType.set(r.work_type_key, s);
    }
    const p = s.points.find((x) => x.offset_days === r.offset_days);
    if (p) {
      p.n = Number(r.n);
      p.pct = p.n > 0 ? (100 * Number(r.n_functional)) / p.n : null;
    }
  }

  // Cost per lasting outcome: total spend divided by what is still working at the
  // last checkpoint we actually have data for.
  //
  // A survival rate of zero is NOT a missing value — it is the most severe finding
  // the system can produce, and the cost per lasting outcome is undefined because
  // nothing lasted. Flag it explicitly rather than letting the row render blank.
  for (const s of byType.values()) {
    const last = [...s.points].reverse().find((p) => p.n > 0 && p.pct != null);
    if (!last || last.pct == null || s.n_works === 0) continue;
    s.lasting_at_days = last.offset_days;
    if (last.pct === 0) {
      s.none_survived = true;
      continue;
    }
    const stillWorking = (s.n_works * last.pct) / 100;
    s.lasting_paise = Math.round(s.spend_paise / stillWorking);
  }

  return [...byType.values()].sort((a, b) => {
    const al = a.points.findLast((p) => p.pct != null)?.pct ?? 101;
    const bl = b.points.findLast((p) => p.pct != null)?.pct ?? 101;
    return al - bl;
  });
}
