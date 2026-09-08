import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { findingsFor } from "@/lib/findings";
import { survivalByWorkType } from "@/lib/survival";
import { rupees } from "@/lib/format";

/** RFC 4180 quoting. A school name with a comma in it must not shift a column. */
function csv(rows: (string | number | null)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          if (cell == null) return "";
          const s = String(cell);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
}

/**
 * Everything on screen, downloadable. Nothing here is a new number — each
 * dataset is the same view the page renders, so an exported figure and a
 * displayed figure can never disagree.
 *
 * Money is exported in rupees AND paise: the rupee column is for the person
 * opening this in a spreadsheet, the paise column is the value of record.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset") ?? "schools";
  const schoolId = url.searchParams.get("id");

  let rows: (string | number | null)[][];
  let name: string;

  switch (dataset) {
    case "grants": {
      const g = await q<Record<string, string | null>>(
        `SELECT s.name AS school, s.udise_code, g.ay, g.head,
                g.amount_sanctioned_paise::text AS sanctioned,
                g.amount_released_paise::text   AS released,
                g.amount_accounted_paise::text  AS accounted,
                g.amount_verified_paise::text   AS verified,
                g.released_on::text
           FROM grants g JOIN schools s ON s.id = g.school_id
          WHERE g.org_id = $1
          ORDER BY (g.amount_released_paise - COALESCE(g.amount_verified_paise,0)) DESC`,
        [user.org_id]
      );
      rows = [
        ["school", "udise_code", "academic_year", "head", "sanctioned_paise",
         "released_paise", "accounted_paise", "verified_paise", "unverified_paise",
         "released_on"],
        ...g.map((r) => [
          r.school, r.udise_code, r.ay, r.head, r.sanctioned, r.released,
          r.accounted, r.verified,
          String(Number(r.released ?? 0) - Number(r.verified ?? 0)),
          r.released_on,
        ]),
      ];
      name = "grants";
      break;
    }

    case "findings": {
      const f = await findingsFor(user.org_id, 500);
      rows = [
        ["school", "school_id", "kind", "severity", "detail"],
        ...f.map((x) => [x.school_name, x.school_id, x.kind, x.tone, x.detail]),
      ];
      name = "findings";
      break;
    }

    case "survival": {
      const s = await survivalByWorkType(user.org_id);
      rows = [
        ["work_type", "works_done", "spend_paise", "spend_rupees",
         "pct_day_7", "n_day_7", "pct_day_90", "n_day_90",
         "pct_day_180", "n_day_180", "pct_day_365", "n_day_365",
         "measured_at_days", "cost_per_lasting_paise", "none_survived"],
        ...s.map((x) => [
          x.label, x.n_works, x.spend_paise, rupees(x.spend_paise),
          ...x.points.flatMap((p) => [p.pct == null ? "" : Math.round(p.pct), p.n]),
          x.lasting_at_days, x.lasting_paise, x.none_survived ? "yes" : "no",
        ]),
      ];
      name = "survival";
      break;
    }

    case "school": {
      if (!schoolId) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      // org-scoped: a school outside the caller's org must 404, not export
      const f = await q<Record<string, string | null>>(
        `SELECT s.name AS school, s.udise_code, ft.label_en AS facility,
                fs.state, fs.at::text AS observed_at, fs.source,
                (SELECT max(w.done_on)::text FROM works w
                  WHERE w.school_id = s.id AND w.facility_key = fs.facility_key
                    AND w.status = 'done') AS last_repaired
           FROM schools s
           JOIN school_facility_state fs ON fs.school_id = s.id
           JOIN facility_types ft ON ft.key = fs.facility_key
          WHERE s.id = $1 AND s.org_id = $2
          ORDER BY ft.sort_order`,
        [schoolId, user.org_id]
      );
      if (f.length === 0) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      rows = [
        ["school", "udise_code", "facility", "state", "observed_at", "source",
         "last_repaired"],
        ...f.map((r) => [
          r.school, r.udise_code, r.facility, r.state, r.observed_at, r.source,
          r.last_repaired,
        ]),
      ];
      name = `school-${schoolId.slice(0, 8)}`;
      break;
    }

    default: {
      const s = await q<Record<string, string | null>>(
        `SELECT s.name, s.udise_code, s.village, s.block, s.district,
                s.enrolment::text, sc.score::text,
                sc.facility_component::text, sc.grant_component::text,
                sc.followup_component::text,
                sc.reversions::text, sc.overdue_checks::text,
                sc.released_paise::text, sc.verified_paise::text,
                (SELECT min(EXTRACT(day FROM now() - v.occurred_at))::int::text
                   FROM visits v WHERE v.school_id = s.id) AS days_since_audit
           FROM schools s LEFT JOIN school_scores sc ON sc.school_id = s.id
          WHERE s.org_id = $1
          ORDER BY sc.score ASC NULLS LAST, s.name`,
        [user.org_id]
      );
      rows = [
        ["school", "udise_code", "village", "block", "district", "enrolment",
         "score", "facility_component", "grant_component", "followup_component",
         "reversions", "overdue_checks", "released_paise", "verified_paise",
         "days_since_audit"],
        ...s.map((r) => [
          r.name, r.udise_code, r.village, r.block, r.district, r.enrolment,
          // an unaudited school exports as blank, never as a zero — a zero here
          // would read as "we looked and found nothing working"
          r.score, r.facility_component, r.grant_component, r.followup_component,
          r.reversions, r.overdue_checks, r.released_paise, r.verified_paise,
          r.days_since_audit,
        ]),
      ];
      name = "schools";
      break;
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sarvekshan-${name}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
