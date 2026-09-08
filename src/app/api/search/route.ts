import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";

export type SearchHit = {
  id: string;
  name: string;
  udise_code: string | null;
  village: string | null;
  block: string | null;
  score: number | null;
  open_findings: number;
};

/**
 * Backs the ⌘K palette. Scoped to the caller's org like every other read —
 * a school the user cannot open must never appear in a result list either.
 *
 * An empty term is a valid query: the palette opens showing the schools that
 * most need attention, so it is useful before a single key is pressed.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const term = (new URL(req.url).searchParams.get("q") ?? "").trim();

  const rows = await q<{
    id: string;
    name: string;
    udise_code: string | null;
    village: string | null;
    block: string | null;
    score: string | null;
    open_findings: string;
  }>(
    `SELECT s.id, s.name, s.udise_code, s.village, s.block,
            sc.score::text,
            (COALESCE(sc.reversions, 0) + COALESCE(sc.overdue_checks, 0))::text
              AS open_findings
       FROM schools s
       LEFT JOIN school_scores sc ON sc.school_id = s.id
      WHERE s.org_id = $1
        AND ($2::text = '' OR s.name ILIKE '%'||$2||'%'
                           OR s.udise_code ILIKE '%'||$2||'%'
                           OR s.village ILIKE '%'||$2||'%'
                           OR s.block ILIKE '%'||$2||'%')
      ORDER BY
        -- an exact-ish name match outranks everything; otherwise worst score first,
        -- because the school you are looking for is usually the one in trouble
        CASE WHEN $2 <> '' AND s.name ILIKE $2||'%' THEN 0 ELSE 1 END,
        sc.score ASC NULLS LAST,
        s.name
      LIMIT 8`,
    [user.org_id, term]
  );

  return NextResponse.json({
    schools: rows.map((r) => ({
      id: r.id,
      name: r.name,
      udise_code: r.udise_code,
      village: r.village,
      block: r.block,
      score: r.score == null ? null : Number(r.score),
      open_findings: Number(r.open_findings),
    })) satisfies SearchHit[],
  });
}
