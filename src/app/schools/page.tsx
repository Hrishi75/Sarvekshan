import Link from "next/link";
import { redirect } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { DistrictMap, type MapSchool } from "@/components/DistrictMap";
import { Empty, rupees, relativeDays, scoreColor, scoreBg } from "@/components/ui";
import { IconSearch, IconChevron, IconGrid, IconMap } from "@/components/icons";

type Row = {
  id: string;
  name: string;
  udise_code: string | null;
  village: string | null;
  block: string | null;
  enrolment: number | null;
  lat: number | null;
  lng: number | null;
  score: string | null;
  released: string | null;
  facility_states: string[] | null;
  last_audit_days: string | null;
};

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ block?: string; q?: string; view?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const sp = await searchParams;
  const search = sp.q?.trim().slice(0, 200) || "";
  const block = sp.block?.trim().slice(0, 150) || "";
  const mapView = sp.view === "map";

  const rows = await q<Row>(
    `SELECT s.id, s.name, s.udise_code, s.village, s.block, s.enrolment, s.lat, s.lng,
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
        AND ($3::text IS NULL OR s.name ILIKE '%'||$3||'%' OR s.udise_code ILIKE '%'||$3||'%'
             OR s.village ILIKE '%'||$3||'%' OR s.block ILIKE '%'||$3||'%')
      ORDER BY sc.score ASC NULLS LAST, s.name`,
    [user.org_id, block || null, search || null]
  );

  // the unfiltered denominator, so "8 of 12" means something
  const all = await q1<{ n: string }>(
    `SELECT count(*)::text AS n FROM schools WHERE org_id = $1`,
    [user.org_id]
  );
  const total = Number(all?.n ?? rows.length);
  const filtered = Boolean(block || search);

  const href = (view: "table" | "map") => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (block) p.set("block", block);
    if (view === "map") p.set("view", "map");
    const s = p.toString();
    return `/schools${s ? `?${s}` : ""}`;
  };

  const clearFilters = mapView ? "/schools?view=map" : "/schools";
  const blocks = await q<{ block: string }>(
    `SELECT DISTINCT block FROM schools WHERE org_id=$1 AND block IS NOT NULL ORDER BY block`, [user.org_id]
  );

  // a school with no score has no site evidence at all — the map draws it hollow
  const neverAudited = rows.filter((r) => r.score == null).slice(0, 8);
  const stalest = rows
    .filter((r) => r.last_audit_days != null)
    .sort((a, b) => Number(b.last_audit_days) - Number(a.last_audit_days))
    .slice(0, 5);

  const pins: MapSchool[] = rows
    .filter((r): r is Row & { lat: number; lng: number } => r.lat != null && r.lng != null)
    .map((r) => ({
      id: r.id,
      name: r.name,
      village: r.village,
      block: r.block,
      lat: Number(r.lat),
      lng: Number(r.lng),
      enrolment: r.enrolment,
      score: r.score == null ? null : Number(r.score),
      last_audit_days: r.last_audit_days == null ? null : Number(r.last_audit_days),
    }));

  return (
    <AppShell user={user}>
      <div className="border-b border-hair bg-surface px-4 pb-4 pt-5 sm:px-7 xl:pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mb-1 text-[24px] font-semibold tracking-[-0.025em]">Schools</h1>
            <p className="text-[13.5px] text-mute">Browse your school register, then open a school to see its visits, repairs, and follow-ups.</p>
          </div>
          {user.role !== "volunteer" && <Link href="/schools/new" className="inline-flex min-h-11 shrink-0 items-center rounded-[7px] bg-brand px-4 text-[13px] font-semibold text-white">Add school</Link>}
        </div>
        <form className="mt-4 flex flex-wrap items-center gap-2" action="/schools">
          <div className="flex min-h-11 min-w-0 w-full items-center gap-2 rounded-[8px] border border-hair bg-canvas px-3 focus-within:border-brand sm:max-w-[360px]">
            <IconSearch size={16} className="shrink-0 text-mute" />
            <input name="q" aria-label="Search schools" defaultValue={search} placeholder="Name, UDISE code, village or block" maxLength={200} className="min-w-0 w-full bg-transparent text-[13px] outline-none placeholder:text-faint" />
          </div>
          <select name="block" aria-label="Filter by block" defaultValue={block} className="min-h-11 max-w-full rounded-[7px] border border-hair bg-surface px-3 text-[13px]">
            <option value="">All blocks</option>
            {block && !blocks.some((row) => row.block === block) && <option value={block}>{block}</option>}
            {blocks.map((row) => <option key={row.block} value={row.block}>{row.block}</option>)}
          </select>
          {mapView && <input type="hidden" name="view" value="map" />}
          <button type="submit" className="min-h-11 rounded-[7px] border border-hair bg-surface px-4 text-[13px] font-medium text-body">Search</button>
          {filtered && <Link href={clearFilters} className="inline-flex min-h-11 items-center px-2 text-[12px] font-medium text-brand">Clear filters</Link>}
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span role="status" className="num text-[12px] text-mute">{filtered ? `${rows.length} of ${total} schools` : `${total} schools`}</span>
          <nav aria-label="School views" className="flex items-center gap-px rounded-[7px] border border-hair p-[2px]">
            <Toggle href={href("table")} on={!mapView} icon={<IconGrid size={13} />} label="List" />
            <Toggle href={href("map")} on={mapView} icon={<IconMap size={13} />} label="Map" />
          </nav>
        </div>

        {mapView ? (
          <div className="h-[18px]" />
        ) : (
          <div className="eyebrow hidden items-center pb-[9px] pt-[18px] xl:flex">
            <span className="min-w-0 grow">School</span>
            <span className="w-[74px] text-right">Pupils</span>
            <span className="w-[118px] text-right text-ink">Score ▼</span>
            <span className="w-[128px] text-center">Facilities</span>
            <span className="w-[104px] text-right">Grant</span>
            <span className="w-[104px] text-right">Audited</span>
            <span className="w-[22px]" />
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="p-6">
          <Empty>{filtered ? "No schools match these filters. Try a different search or clear the filters." : "No schools in the register yet. A coordinator can add the first school."}</Empty>
        </div>
      ) : mapView ? (
        <div className="grid gap-[14px] p-4 sm:p-7 xl:grid-cols-[minmax(0,1fr)_268px]">
          <div className="min-w-0 rounded-[9px] border border-hair bg-surface p-[18px]">
            <DistrictMap schools={pins} />
            <p className="mt-3 text-[12px] text-mute"><span className="num">{pins.length} of {rows.length}</span> schools have map coordinates.</p>
          </div>

          {/* the map shows where the gaps are; this column names them */}
          <div className="flex min-w-0 flex-col gap-[14px]">
            <div className="rounded-[9px] border border-hair bg-surface">
              <div className="flex items-baseline justify-between px-[15px] pb-[9px] pt-[13px]">
                <span className="text-[13.5px] font-semibold tracking-[-0.01em]">
                  No site evidence
                </span>
                <span className="num text-[11px] text-faint">{neverAudited.length}</span>
              </div>
              {neverAudited.length === 0 ? (
                <p className="px-[15px] pb-[13px] text-[12.5px] text-mute">
                  Every school shown has facility observations.
                </p>
              ) : (
                neverAudited.map((r) => (
                  <Link
                    key={r.id}
                    href={`/schools/${r.id}`}
                    className="flex items-center gap-[9px] border-t border-hair-soft px-[15px] py-[9px] hover:bg-surface-2"
                  >
                    <span className="h-[9px] w-[9px] shrink-0 rounded-full border-[1.5px] border-dashed border-faint" />
                    <span className="min-w-0 grow truncate text-[12.5px] font-medium">
                      {r.name}
                    </span>
                    <span className="num shrink-0 text-[11px] text-faint">
                      {r.enrolment ?? "—"}
                    </span>
                  </Link>
                ))
              )}
            </div>

            <div className="rounded-[9px] border border-hair bg-surface">
              <div className="px-[15px] pb-[9px] pt-[13px] text-[13.5px] font-semibold tracking-[-0.01em]">
                Longest since a visit
              </div>
              {stalest.length === 0 ? (
                <p className="px-[15px] pb-[13px] text-[12.5px] text-mute">No visits on record.</p>
              ) : (
                stalest.map((r) => (
                  <Link
                    key={r.id}
                    href={`/schools/${r.id}`}
                    className="flex items-center gap-[9px] border-t border-hair-soft px-[15px] py-[9px] hover:bg-surface-2"
                  >
                    <span className="min-w-0 grow truncate text-[12.5px] font-medium">
                      {r.name}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-mute">
                      {relativeDays(Number(r.last_audit_days))}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (<>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-7 xl:hidden">
          {rows.map((school) => {
            const score = school.score === null ? null : Number(school.score);
            return <Link key={school.id} href={`/schools/${school.id}`} className="min-w-0 rounded-[9px] border border-hair bg-surface p-4 hover:border-brand">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[14px] font-semibold">{school.name}</h2>
                <IconChevron size={15} className="mt-1 shrink-0 text-faint" />
              </div>
              <p className="mt-1 text-[12px] text-mute">{[school.village, school.block && `${school.block} block`].filter(Boolean).join(" · ") || "Location not recorded"}</p>
              <p className="num mt-1 text-[11px] text-faint">UDISE {school.udise_code ?? "not recorded"}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-hair-soft pt-3 text-[12px]">
                <div><dt className="text-mute">Score</dt><dd className={`num mt-1 font-semibold ${scoreColor(score)}`}>{score === null ? "No site evidence" : `${score}/100`}</dd></div>
                <div><dt className="text-mute">Pupils</dt><dd className="num mt-1 text-body">{school.enrolment ?? "Not recorded"}</dd></div>
                <div><dt className="text-mute">Grant released</dt><dd className="num mt-1 text-body">{rupees(school.released === null ? null : Number(school.released))}</dd></div>
                <div><dt className="text-mute">Last visit</dt><dd className="mt-1 text-body">{school.last_audit_days === null ? "No visits yet" : relativeDays(Number(school.last_audit_days))}</dd></div>
              </dl>
            </Link>;
          })}
        </div>
        <div className="hidden xl:block">
        {rows.map((r) => {
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
        })}
        </div>
      </>)}
    </AppShell>
  );
}

function Toggle({
  href,
  on,
  icon,
  label,
}: {
  href: string;
  on: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`inline-flex min-h-10 items-center gap-[6px] rounded-[5px] px-[10px] text-[12.5px] ${
        on ? "bg-brand-soft font-semibold text-brand" : "font-medium text-mute hover:bg-surface-2"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
