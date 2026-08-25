import Link from "next/link";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { Empty, rupees, relativeDays, scoreColor, scoreBg } from "@/components/ui";
import { IconSearch, IconChevron } from "@/components/icons";

type Row = {
  id: string;
  name: string;
  udise_code: string | null;
  village: string | null;
  block: string | null;
  enrolment: number | null;
  score: string | null;
  released: string | null;
  facility_states: string[] | null;
  last_audit_days: string | null;
};

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ block?: string; q?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const sp = await searchParams;

  const rows = await q<Row>(
    `SELECT s.id, s.name, s.udise_code, s.village, s.block, s.enrolment,
            sc.score::text,
            (SELECT sum(amount_released_paise)::text FROM grants g
              WHERE g.school_id = s.id)                             AS released,
            (SELECT array_agg(fs.state ORDER BY ft.sort_order)
               FROM school_facility_state fs
               JOIN facility_types ft ON ft.key = fs.facility_key
              WHERE fs.school_id = s.id)                            AS facility_states,
            (SELECT min(EXTRACT(day FROM now() - v.occurred_at))::int::text
               FROM visits v WHERE v.school_id = s.id)              AS last_audit_days
       FROM schools s
       LEFT JOIN school_scores sc ON sc.school_id = s.id
      WHERE s.org_id = $1
        AND ($2::text IS NULL OR s.block = $2)
        AND ($3::text IS NULL OR s.name ILIKE '%'||$3||'%' OR s.udise_code ILIKE '%'||$3||'%')
      ORDER BY sc.score ASC NULLS LAST, s.name`,
    [user.org_id, sp.block ?? null, sp.q ?? null]
  );

  const total = rows.length;

  return (
    <AppShell user={user}>
      {/* search-led header — the public-database pattern */}
      <div className="border-b border-hair bg-surface px-7 pt-[22px]">
        <h1 className="mb-[3px] text-[24px] font-semibold tracking-[-0.025em]">Schools</h1>
        <p className="text-[13.5px] text-mute">
          Every government school in the district, whether or not we have worked there.
        </p>

        <form className="mt-4 flex items-center gap-[10px]" action="/schools">
          <div className="flex h-[38px] w-full max-w-[480px] items-center gap-[9px] rounded-[8px] border border-hair bg-canvas px-3 focus-within:border-brand">
            <IconSearch size={16} className="text-mute" />
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search by name or UDISE code"
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-faint"
            />
          </div>
          {sp.block && <input type="hidden" name="block" value={sp.block} />}
          {sp.block && (
            <Link
              href="/schools"
              className="inline-flex h-[34px] items-center gap-[6px] rounded-[7px] border border-brand-soft bg-brand-soft px-3 text-[13px] font-medium text-brand"
            >
              {sp.block}
              <span aria-hidden>×</span>
            </Link>
          )}
          <div className="grow" />
          <span className="num text-[12px] text-mute">
            {total} {sp.block || sp.q ? `of ${total}` : "schools"}
          </span>
        </form>

        <div className="eyebrow flex items-center pb-[9px] pt-[18px]">
          <span className="min-w-0 grow">School</span>
          <span className="w-[74px] text-right">Pupils</span>
          <span className="w-[118px] text-right text-ink">Score ▼</span>
          <span className="w-[128px] text-center">Facilities</span>
          <span className="w-[104px] text-right">Grant</span>
          <span className="w-[104px] text-right">Audited</span>
          <span className="w-[22px]" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-6">
          <Empty>No schools match that search.</Empty>
        </div>
      ) : (
        rows.map((r) => {
          const score = r.score == null ? null : Number(r.score);
          const audited = r.last_audit_days == null ? null : Number(r.last_audit_days);
          const unaudited = score == null;
          return (
            <Link
              key={r.id}
              href={`/schools/${r.id}`}
              className={`flex h-[56px] items-center border-b border-hair-soft px-7 hover:bg-surface-2 ${
                unaudited ? "bg-surface-2/60" : "bg-surface"
              }`}
            >
              <div className="min-w-0 grow">
                <div
                  className={`text-[13.5px] font-medium tracking-[-0.005em] ${unaudited ? "text-mute" : ""}`}
                >
                  {r.name}
                </div>
                <div className="num mt-px text-[11px] text-faint">
                  {r.udise_code ?? "—"} · {r.village ?? r.block}
                </div>
              </div>

              <span className={`num w-[74px] text-right text-[12.5px] ${unaudited ? "text-faint" : "text-body"}`}>
                {r.enrolment ?? "—"}
              </span>

              <div className="flex w-[118px] items-center justify-end gap-[9px]">
                {score == null ? (
                  <span className="num text-[11px] text-faint">not audited</span>
                ) : (
                  <>
                    <span className="h-[5px] w-[46px] overflow-hidden rounded-full bg-hair-soft">
                      <span
                        className={`block h-full rounded-full ${scoreBg(score)}`}
                        style={{ width: `${score}%` }}
                      />
                    </span>
                    <span className={`num w-[20px] text-right text-[13px] font-semibold ${scoreColor(score)}`}>
                      {score}
                    </span>
                  </>
                )}
              </div>

              <div className="flex w-[128px] items-center justify-center gap-[4px]">
                {(r.facility_states ?? []).slice(0, 5).map((s, i) => (
                  <span
                    key={i}
                    title={s}
                    className={`h-[5px] w-[15px] rounded-[2px] ${
                      s === "working" ? "bg-good" : s === "partial" ? "bg-warn" : "bg-bad"
                    }`}
                  />
                ))}
                {Array.from({ length: Math.max(0, 5 - (r.facility_states?.length ?? 0)) }).map((_, i) => (
                  <span key={`e${i}`} className="h-[5px] w-[15px] rounded-[2px] bg-hair" />
                ))}
              </div>

              <span className={`num w-[104px] text-right text-[12.5px] ${unaudited ? "text-faint" : "text-body"}`}>
                {r.released ? rupees(Number(r.released)) : "—"}
              </span>

              <span className={`w-[104px] text-right text-[12.5px] ${unaudited ? "text-faint" : "text-mute"}`}>
                {relativeDays(audited)}
              </span>

              <span className="flex w-[22px] justify-end text-faint">
                <IconChevron size={14} />
              </span>
            </Link>
          );
        })
      )}
    </AppShell>
  );
}
