import Link from "next/link";
import { q, q1 } from "@/lib/db";
import { survivalByWorkType } from "@/lib/survival";
import { findingsFor } from "@/lib/findings";
import { SurvivalChart } from "@/components/SurvivalChart";
import { DistrictMap, type MapSchool } from "@/components/DistrictMap";
import { Tag, rupees, relativeDays, scoreColor, scoreBg } from "@/components/ui";
import { IconSchool, IconSearch } from "@/components/icons";

/**
 * The public board — the whole register, open, before anyone signs in.
 *
 * Every school appears: there is no publication gate, because a school left off a
 * transparency page is exactly the school a reader would most want to see. The
 * grant reconciliation is here too, released against verified-on-site, and so are
 * our own overdue follow-ups — a page that publishes a school's failures and hides
 * the surveyor's is not a transparency page.
 *
 * What is not here is anyone's name and any photograph. Nothing on this page
 * identifies a child, a teacher, or a field worker.
 *
 * It has no session, so it has no org to scope to: the aggregates pass null and
 * span every org in the register.
 */

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
  facility_component: string | null;
  grant_component: string | null;
  followup_component: string | null;
  reversions: string | null;
  overdue_checks: string | null;
  released_paise: string | null;
  verified_paise: string | null;
  last_visit_days: string | null;
  visits: string;
  repairs_done: string;
  repairs_open: string;
  spend: string | null;
};

type Facility = {
  school_id: string;
  label: string;
  state: "working" | "partial" | "broken";
  seen_days: string | null;
};

const STATE_WORD = { working: "working", partial: "part working", broken: "broken" } as const;
const STATE_DOT = { working: "bg-good", partial: "bg-warn", broken: "bg-bad" } as const;
const STATE_TEXT = { working: "text-good", partial: "text-warn", broken: "text-bad" } as const;

export async function PublicBoard({ search, block }: { search: string; block: string }) {
  const [rows, facilities, summary, funnel, breakdown, blocks, survival, findings] =
    await Promise.all([
      q<Row>(
        `SELECT s.id, s.name, s.udise_code, s.village, s.block, s.enrolment, s.lat, s.lng,
                sc.score::text, sc.facility_component::text, sc.grant_component::text,
                sc.followup_component::text, sc.reversions::text, sc.overdue_checks::text,
                sc.released_paise::text, sc.verified_paise::text,
                (SELECT min(EXTRACT(day FROM now() - v.occurred_at))::int::text
                   FROM visits v WHERE v.school_id = s.id)              AS last_visit_days,
                (SELECT count(*)::text FROM visits v
                  WHERE v.school_id = s.id)                             AS visits,
                (SELECT count(*)::text FROM works w
                  WHERE w.school_id = s.id AND w.status = 'done')       AS repairs_done,
                (SELECT count(*)::text FROM works w
                  WHERE w.school_id = s.id
                    AND w.status IN ('planned','in_progress'))          AS repairs_open,
                (SELECT sum(w.actual_cost_paise)::text FROM works w
                  WHERE w.school_id = s.id AND w.status = 'done')       AS spend
           FROM schools s
           LEFT JOIN school_scores sc ON sc.school_id = s.id
          WHERE ($1::text IS NULL OR s.block = $1)
            AND ($2::text IS NULL OR s.name ILIKE '%'||$2||'%' OR s.udise_code ILIKE '%'||$2||'%'
                 OR s.village ILIKE '%'||$2||'%' OR s.block ILIKE '%'||$2||'%')
          ORDER BY sc.score ASC NULLS LAST, s.name`,
        [block || null, search || null]
      ),

      // one query for every school's facilities, grouped in memory
      q<Facility>(
        `SELECT fs.school_id, ft.label_en AS label, fs.state,
                EXTRACT(day FROM now() - fs.at)::int::text AS seen_days
           FROM school_facility_state fs
           JOIN facility_types ft ON ft.key = fs.facility_key
          ORDER BY CASE fs.state WHEN 'broken' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,
                   ft.sort_order`
      ),

      // the unfiltered denominators — "3 of 12" only means something against these
      q1<{
        schools: string; visited: string; avg_score: string | null; pupils: string | null;
        working: string; partial: string; broken: string; reversions: string;
        repairs_done: string; spend: string | null; checks_done: string; checks_missed: string;
        visits: string; latest_visit_days: string | null; districts: string | null;
        band_good: string; band_warn: string; band_bad: string;
      }>(
        `SELECT count(*)::text                                        AS schools,
                count(*) FILTER (WHERE sc.score IS NOT NULL)::text     AS visited,
                count(*) FILTER (WHERE sc.score >= 70)::text           AS band_good,
                count(*) FILTER (WHERE sc.score >= 50
                                   AND sc.score <  70)::text           AS band_warn,
                count(*) FILTER (WHERE sc.score <  50)::text           AS band_bad,
                round(avg(sc.score))::text                             AS avg_score,
                sum(s.enrolment)::text                                 AS pupils,
                COALESCE(sum(sc.working), 0)::text                     AS working,
                COALESCE(sum(sc.partial), 0)::text                     AS partial,
                COALESCE(sum(sc.broken), 0)::text                      AS broken,
                COALESCE(sum(sc.reversions), 0)::text                  AS reversions,
                (SELECT count(*)::text FROM works WHERE status='done')  AS repairs_done,
                (SELECT sum(actual_cost_paise)::text FROM works
                  WHERE status='done')                                 AS spend,
                (SELECT count(*)::text FROM checks WHERE state='done')  AS checks_done,
                (SELECT count(*)::text FROM checks
                  WHERE state='missed')                                AS checks_missed,
                (SELECT count(*)::text FROM visits)                     AS visits,
                (SELECT min(EXTRACT(day FROM now() - occurred_at))::int::text
                   FROM visits)                                        AS latest_visit_days,
                (SELECT string_agg(DISTINCT district, ' · ') FROM schools
                  WHERE district IS NOT NULL)                          AS districts
           FROM schools s LEFT JOIN school_scores sc ON sc.school_id = s.id`
      ),

      q1<{ sanctioned: string; released: string; accounted: string; verified: string }>(
        `SELECT COALESCE(sum(amount_sanctioned_paise), 0)::text AS sanctioned,
                COALESCE(sum(amount_released_paise), 0)::text   AS released,
                COALESCE(sum(amount_accounted_paise), 0)::text  AS accounted,
                COALESCE(sum(amount_verified_paise), 0)::text   AS verified
           FROM grants`
      ),

      q<{ key: string; label: string; working: string; partial: string; broken: string }>(
        `SELECT ft.key, ft.label_en AS label,
                count(fs.school_id) FILTER (WHERE fs.state='working')::text AS working,
                count(fs.school_id) FILTER (WHERE fs.state='partial')::text AS partial,
                count(fs.school_id) FILTER (WHERE fs.state='broken')::text  AS broken
           FROM facility_types ft
           LEFT JOIN school_facility_state fs ON fs.facility_key = ft.key
          GROUP BY ft.key, ft.label_en, ft.sort_order
          ORDER BY ft.sort_order`
      ),

      q<{ block: string; n: string; avg_score: string | null; visited: string }>(
        `SELECT s.block, count(*)::text AS n, round(avg(sc.score))::text AS avg_score,
                count(*) FILTER (WHERE sc.score IS NOT NULL)::text AS visited
           FROM schools s LEFT JOIN school_scores sc ON sc.school_id = s.id
          WHERE s.block IS NOT NULL
          GROUP BY s.block ORDER BY s.block`
      ),

      survivalByWorkType(null),
      findingsFor(null, 40),
    ]);

  // findingsFor ranks whole kinds against each other, so a run of reversions would
  // fill the panel and a reader would never learn the other kinds exist. Take a
  // few of each instead: the point of this list is the shape of what is wrong.
  const perKind = new Map<string, number>();
  const shownFindings = findings.filter((f) => {
    const n = perKind.get(f.kind) ?? 0;
    if (n >= 3) return false;
    perKind.set(f.kind, n + 1);
    return true;
  });

  const bySchool = new Map<string, Facility[]>();
  for (const f of facilities) {
    const list = bySchool.get(f.school_id);
    if (list) list.push(f);
    else bySchool.set(f.school_id, [f]);
  }

  const total = Number(summary?.schools ?? 0);
  const visited = Number(summary?.visited ?? 0);
  const neverVisited = total - visited;
  const broken = Number(summary?.broken ?? 0);
  const partial = Number(summary?.partial ?? 0);
  const working = Number(summary?.working ?? 0);
  const observed = broken + partial + working;
  const latest = summary?.latest_visit_days == null ? null : Number(summary.latest_visit_days);
  const sanctioned = Number(funnel?.sanctioned ?? 0);
  const released = Number(funnel?.released ?? 0);
  const verified = Number(funnel?.verified ?? 0);
  const filtered = Boolean(search || block);
  const worstSeries = survival[0];

  // Ranked by how many schools it has actually been seen broken at — never by the
  // broken *rate*, which would put a facility observed once and broken once above
  // one broken at five schools. The denominator here is always every school, so
  // the ordering matches the bar the reader is looking at.
  const ranked = breakdown
    .map((b) => {
      const w = Number(b.working);
      const p = Number(b.partial);
      const br = Number(b.broken);
      return { ...b, w, p, br, seen: w + p + br };
    })
    .sort((a, b) => {
      if ((a.seen === 0) !== (b.seen === 0)) return a.seen === 0 ? 1 : -1;
      return b.br - a.br || b.p - a.p || a.label.localeCompare(b.label);
    });

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
      last_audit_days: r.last_visit_days == null ? null : Number(r.last_visit_days),
    }));

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-hair bg-surface">
        <div className="mx-auto flex h-[56px] max-w-[1160px] items-center gap-3 px-4 sm:px-7">
          <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-[7px] bg-brand text-white">
            <IconSchool size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold tracking-[-0.015em]">Sarvekshan</span>
            <span className="hidden text-[11.5px] leading-[1.2] text-mute sm:block">
              Public school condition record
            </span>
          </span>

          <nav aria-label="Sections" className="ml-5 hidden items-center gap-[3px] lg:flex">
            {[
              ["#district", "District"],
              ["#facilities", "Facilities"],
              ["#map", "Map"],
              ["#survival", "What lasts"],
              ["#money", "Money"],
              ["#schools", "Schools"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-[6px] px-[9px] py-[6px] text-[12.5px] font-medium text-mute hover:bg-surface-2 hover:text-ink"
              >
                {label}
              </a>
            ))}
          </nav>

          <span className="grow" />
          <Link
            href="/platform"
            className="inline-flex min-h-10 shrink-0 items-center px-1 text-[12.5px] font-medium text-body hover:text-ink sm:px-2"
          >
            How it works
          </Link>
          <a
            href="/signin"
            className="inline-flex min-h-10 shrink-0 items-center rounded-[7px] bg-brand px-[15px] text-[13px] font-semibold text-white"
          >
            Sign in
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[1160px] px-4 pb-20 sm:px-7">
        {/* ── hero ─────────────────────────────────────────────────────── */}
        <section className="border-b border-hair py-9 sm:py-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
            <div>
              <span className="eyebrow">{summary?.districts ?? "The register"}</span>
              <h1 className="mt-[10px] max-w-[660px] text-[30px] font-semibold leading-[1.12] tracking-[-0.03em] sm:text-[40px]">
                What the buildings actually look like
              </h1>
              <p className="mt-[14px] max-w-[600px] text-[14.5px] leading-[1.62] text-body">
                Every condition on this page was recorded by somebody standing at the school, on the
                day it says. Nothing here is copied from a form filled in at a desk — and where
                nobody has been yet, the page says so rather than guessing.
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 lg:block lg:space-y-4">
              <Headline label="Schools in the register" value={String(total)} />
              <Headline
                label="Pupils at those schools"
                value={summary?.pupils ? Number(summary.pupils).toLocaleString("en-IN") : "—"}
              />
              <Headline
                label="Public money tracked"
                value={rupees(released, true)}
                note={`${rupees(released - verified, true)} not yet verified on site`}
              />
            </dl>
          </div>
        </section>

        {/* ── the district ─────────────────────────────────────────────── */}
        <Section
          id="district"
          title="The district at a glance"
          lead="Counted across every school in the register, visited or not."
        >
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[9px] border border-hair bg-hair sm:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Average score"
              value={summary?.avg_score ?? "—"}
              note={`over ${visited} visited`}
            />
            <Stat
              label="Visited on site"
              value={String(visited)}
              tone={neverVisited > 0 ? "text-warn" : "text-good"}
              note={neverVisited > 0 ? `${neverVisited} never visited` : "all of them"}
            />
            <Stat
              label="Facilities broken"
              value={String(broken)}
              tone="text-bad"
              note={`of ${observed} observed`}
            />
            <Stat label="Part working" value={String(partial)} tone="text-warn" />
            <Stat
              label="Repairs completed"
              value={summary?.repairs_done ?? "0"}
              note={`${rupees(Number(summary?.spend ?? 0), true)} spent`}
            />
            <Stat
              label="Broke again after"
              value={summary?.reversions ?? "0"}
              tone="text-bad"
              note="fixed, then failed"
            />
          </div>

          {/* items-start: one block is one row, and a short panel should read as
              short rather than be stretched into an empty box */}
          <div className="mt-3 grid items-start gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <Panel
              title="Follow-up checks"
              sub="Somebody goes back months later to see whether the repair held."
            >
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
                <Figure value={summary?.checks_done ?? "0"} label="completed" />
                <Figure value={summary?.checks_missed ?? "0"} label="missed" tone="text-warn" />
                <Figure value={summary?.visits ?? "0"} label="visits on record" />
              </div>
              <p className="mt-[13px] border-t border-hair-soft pt-[11px] text-[12.5px] leading-[1.55] text-mute">
                A missed check is left out of every rate on this page. It is not counted as a pass —
                nobody looked, so nobody knows.
              </p>
            </Panel>

            <Panel title="How the scores fall" sub="Every school in the register, banded.">
              <ul className="space-y-[9px]">
                <Band label="70 and over" n={Number(summary?.band_good ?? 0)} total={total} className="bg-good" />
                <Band label="50 to 69" n={Number(summary?.band_warn ?? 0)} total={total} className="bg-warn" />
                <Band label="Under 50" n={Number(summary?.band_bad ?? 0)} total={total} className="bg-bad" />
                <Band label="No site evidence" n={neverVisited} total={total} className="bg-hair" muted />
              </ul>
            </Panel>

            <Panel title="By block" sub="How far the register currently reaches.">
              {blocks.length === 0 ? (
                <p className="text-[13px] text-mute">No blocks recorded.</p>
              ) : (
                <ul className="divide-y divide-hair-soft">
                  {blocks.map((b) => {
                    const avg = b.avg_score == null ? null : Number(b.avg_score);
                    return (
                      <li
                        key={b.block}
                        className="flex items-center gap-3 py-[9px] first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0 grow truncate text-[13px] font-medium">
                          {b.block}
                        </span>
                        <span className="num shrink-0 text-[12px] text-mute">
                          {b.visited}/{b.n} visited
                        </span>
                        <span className="h-[5px] w-[54px] shrink-0 overflow-hidden rounded-full bg-hair-soft">
                          <span
                            className={`block h-full rounded-full ${scoreBg(avg)}`}
                            style={{ width: `${avg ?? 0}%` }}
                          />
                        </span>
                        <span
                          className={`num w-[26px] shrink-0 text-right text-[13px] font-semibold ${scoreColor(avg)}`}
                        >
                          {avg ?? "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </Section>

        {/* ── facilities ───────────────────────────────────────────────── */}
        <Section
          id="facilities"
          title="What is broken, across the whole district"
          lead={`Ordered by how many of the ${total} schools it has been seen broken at. Each bar is all ${total}; the pale remainder is the share nobody has looked at — a gap, not a pass.`}
        >
          <div className="rounded-[9px] border border-hair bg-surface p-[18px]">
            <ul className="space-y-[13px]">
              {ranked.map((b) => (
                <li key={b.key} className="flex flex-wrap items-center gap-x-4 gap-y-[6px]">
                  <span className="w-[122px] shrink-0 text-[13px] font-medium">{b.label}</span>
                  <span className="flex h-[10px] min-w-[160px] grow overflow-hidden rounded-[3px] bg-hair-soft">
                    <Seg n={b.br} total={total} className="bg-bad" />
                    <Seg n={b.p} total={total} className="bg-warn" />
                    <Seg n={b.w} total={total} className="bg-good" />
                  </span>
                  <span className="num w-[266px] shrink-0 whitespace-nowrap text-right text-[12px] text-mute">
                    {b.seen === 0 ? (
                      <span className="text-faint">never observed anywhere</span>
                    ) : (
                      <>
                        <span className="font-semibold text-bad">{b.br}</span> broken ·{" "}
                        <span className="text-warn">{b.p}</span> part ·{" "}
                        <span className="text-good">{b.w}</span> ok ·{" "}
                        <span className="text-faint">{total - b.seen} unseen</span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-[15px] border-t border-hair-soft pt-[12px] text-[12.5px] leading-[1.55] text-mute">
              A facility with no bar at all has never been observed at any school in the register.
              That is a hole in the survey, and it is shown as one.
            </p>
          </div>
        </Section>

        {/* ── map ──────────────────────────────────────────────────────── */}
        <Section
          id="map"
          title="Where the schools are"
          lead="Circle size is enrolment and colour is the score. A hollow circle is a school nobody has visited. Click one to jump to its record."
        >
          {pins.length === 0 ? (
            <EmptyNote>No school in this view has map coordinates recorded.</EmptyNote>
          ) : (
            <div className="rounded-[9px] border border-hair bg-surface p-[18px]">
              <DistrictMap schools={pins} target="anchor" />
              <p className="num mt-3 text-[12px] text-mute">
                {pins.length} of {rows.length} schools in view have coordinates.
              </p>
            </div>
          )}
        </Section>

        {/* ── survival ─────────────────────────────────────────────────── */}
        <Section
          id="survival"
          title="What survives after we leave"
          lead="The only question that matters a year later: is the repair still working? Share still functional, by days since it was done."
        >
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="min-w-0 rounded-[9px] border border-hair bg-surface p-[18px]">
              <SurvivalChart series={survival} />
              {worstSeries && (
                <p className="mt-1 border-t border-hair-soft pt-[11px] text-[12.5px] leading-[1.55] text-body">
                  <strong className="font-semibold text-ink">{worstSeries.label}</strong> is the
                  weakest line here. Checks nobody completed are excluded from the denominator
                  rather than counted as still working, so every curve is drawn over what was
                  actually looked at.
                </p>
              )}
            </div>

            <div className="min-w-0 rounded-[9px] border border-hair bg-surface">
              <div className="eyebrow flex items-center px-[16px] pb-[8px] pt-[15px]">
                <span className="grow">Repair type</span>
                <span className="w-[42px] text-right">Done</span>
                <span className="w-[92px] text-right">Per lasting</span>
              </div>
              {survival.length === 0 ? (
                <p className="px-[16px] pb-[15px] text-[12.5px] text-mute">
                  No completed follow-up checks yet.
                </p>
              ) : (
                survival.map((s) => (
                  <div
                    key={s.work_type_key}
                    className="flex items-center border-t border-hair-soft px-[16px] py-[10px]"
                  >
                    <span className="min-w-0 grow truncate text-[12.5px] font-medium">
                      {s.label}
                    </span>
                    <span className="num w-[42px] text-right text-[12.5px] text-body">
                      {s.n_works}
                    </span>
                    <span className="num w-[92px] text-right text-[12.5px]">
                      {s.none_survived ? (
                        <span className="font-semibold text-bad">none lasted</span>
                      ) : s.lasting_paise == null ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <span className="font-semibold">{rupees(s.lasting_paise, true)}</span>
                      )}
                    </span>
                  </div>
                ))
              )}
              <p className="border-t border-hair-soft px-[16px] py-[11px] text-[12px] leading-[1.5] text-mute">
                Cost per lasting outcome: what was spent, divided by how much of it was still working
                at the last checkpoint with real data behind it.
              </p>
            </div>
          </div>
        </Section>

        {/* ── money ────────────────────────────────────────────────────── */}
        <Section
          id="money"
          title="The money, and how far it has been checked"
          lead="A grant moves through four stages. Only the last one means somebody saw the thing it paid for."
        >
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="rounded-[9px] border border-hair bg-surface p-[18px]">
              <ul className="space-y-[14px]">
                <Money label="Sanctioned" caption="approved on paper" paise={sanctioned} of={sanctioned} className="bg-hair" />
                <Money label="Released" caption="money actually sent" paise={released} of={sanctioned} className="bg-brand" />
                <Money label="Accounted" caption="paperwork filed for it" paise={Number(funnel?.accounted ?? 0)} of={sanctioned} className="bg-warn" />
                <Money label="Verified on site" caption="somebody saw what it bought" paise={verified} of={sanctioned} className="bg-good" />
              </ul>
              <p className="mt-[16px] border-t border-hair-soft pt-[12px] text-[13px] leading-[1.6] text-body">
                <span className="num font-semibold text-bad">{rupees(released - verified)}</span> of
                what was released has not yet been matched to anything visible at a school. That is a
                gap in our checking, not a claim about anybody&apos;s honesty — it stays on this page
                because leaving it off would be the dishonest choice.
              </p>
            </div>

            <div className="min-w-0 rounded-[9px] border border-hair bg-surface">
              <div className="flex items-center justify-between px-[16px] pb-[9px] pt-[15px]">
                <span className="text-[14px] font-semibold tracking-[-0.01em]">
                  What we are chasing
                </span>
                <span className="num text-[11px] text-faint">{shownFindings.length} of {findings.length}</span>
              </div>
              {shownFindings.length === 0 ? (
                <p className="px-[16px] pb-[15px] text-[12.5px] text-mute">Nothing outstanding.</p>
              ) : (
                shownFindings.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-[10px] border-t border-hair-soft px-[16px] py-[10px]"
                  >
                    <span
                      className={`mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full ${
                        f.tone === "bad" ? "bg-bad" : "bg-warn"
                      }`}
                    />
                    <span className="min-w-0 grow">
                      <span className="block truncate text-[12.5px] font-medium">
                        {f.school_name}
                      </span>
                      <span className="mt-px block text-[12px] leading-[1.45] text-mute">
                        {f.detail}
                      </span>
                    </span>
                    <Tag tone={f.tone === "bad" ? "bad" : "warn"}>{f.kind}</Tag>
                  </div>
                ))
              )}
              <p className="border-t border-hair-soft px-[16px] py-[11px] text-[12px] leading-[1.5] text-mute">
                An overdue follow-up on this list is our failure, not the school&apos;s. It is
                published for the same reason as everything else here.
              </p>
            </div>
          </div>
        </Section>

        {/* ── every school ─────────────────────────────────────────────── */}
        <Section
          id="schools"
          title="Every school, worst condition first"
          lead="The full register. Find yours by name, village, block, or UDISE code."
        >
          <form action="/" className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[8px] border border-hair bg-surface px-3 focus-within:border-brand sm:max-w-[330px]">
              <IconSearch size={16} className="shrink-0 text-mute" />
              <input
                name="q"
                aria-label="Search schools"
                defaultValue={search}
                placeholder="Name, village, block or UDISE code"
                maxLength={200}
                className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-faint"
              />
            </div>
            <select
              name="block"
              aria-label="Filter by block"
              defaultValue={block}
              className="min-h-11 max-w-full rounded-[7px] border border-hair bg-surface px-3 text-[13px]"
            >
              <option value="">All blocks</option>
              {block && !blocks.some((b) => b.block === block) && (
                <option value={block}>{block}</option>
              )}
              {blocks.map((b) => (
                <option key={b.block} value={b.block}>
                  {b.block}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="min-h-11 rounded-[7px] border border-hair bg-surface px-4 text-[13px] font-medium text-body"
            >
              Search
            </button>
            {filtered && (
              <Link
                href="/#schools"
                className="inline-flex min-h-11 items-center px-2 text-[12px] font-medium text-brand"
              >
                Clear
              </Link>
            )}
            <span role="status" className="num ml-auto text-[12px] text-mute">
              {filtered ? `${rows.length} of ${total}` : `${total} schools`}
            </span>
          </form>

          {rows.length === 0 ? (
            <EmptyNote>
              {filtered
                ? "No school matches that search. Try a village name, or clear the filters."
                : "No schools in the register yet — which is different from every school being fine."}
            </EmptyNote>
          ) : (
            <ul className="grid gap-[10px]">
              {rows.map((r) => (
                <SchoolCard key={r.id} row={r} facilities={bySchool.get(r.id) ?? []} />
              ))}
            </ul>
          )}
        </Section>

        {/* ── method ───────────────────────────────────────────────────── */}
        <Section id="method" title="How to read this page" lead={null}>
          <div className="grid gap-3 md:grid-cols-3">
            <Panel title="The score" sub={null}>
              <p className="text-[12.5px] leading-[1.6] text-body">
                Weighted from three things: the facilities the team saw on site, how much of the
                released grant they could verify in person, and whether past repairs were still
                working when somebody went back. Repairs that failed again, and overdue checks,
                subtract from it. Each component is printed on the school&apos;s own card, so the
                number can always be taken apart.
              </p>
            </Panel>
            <Panel title="Absent evidence" sub={null}>
              <p className="text-[12.5px] leading-[1.6] text-body">
                A school nobody has visited has no score at all. A follow-up nobody completed is
                dropped from the denominator rather than counted as a pass. Every rate here is over
                what was actually checked — and where that is nothing, the page says nothing.
              </p>
            </Panel>
            <Panel title="What is left out" sub={null}>
              <p className="text-[12.5px] leading-[1.6] text-body">
                No names — not a child&apos;s, a teacher&apos;s, or a field worker&apos;s — and no
                photographs. Nothing on this page identifies anybody. The record of who reported what
                stays inside the register, behind a sign-in.
              </p>
            </Panel>
          </div>

          <p className="num mt-4 text-[12px] text-faint">
            {latest != null
              ? `Most recent visit ${relativeDays(latest)}.`
              : "No visits on record yet."}
          </p>
        </Section>
      </main>
    </div>
  );
}

/* ── layout pieces ──────────────────────────────────────────────────────── */

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead: string | null;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-[64px] border-b border-hair py-8 last:border-0 sm:py-10">
      <h2 className="text-[19px] font-semibold tracking-[-0.02em] sm:text-[21px]">{title}</h2>
      {lead ? (
        <p className="mb-5 mt-[5px] max-w-[660px] text-[13.5px] leading-[1.55] text-mute">{lead}</p>
      ) : (
        <div className="h-4" />
      )}
      {children}
    </section>
  );
}

function Headline({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-mute">{label}</dt>
      <dd className="num mt-[3px] text-[26px] font-semibold tracking-[-0.025em]">{value}</dd>
      {note && <dd className="mt-[2px] text-[11.5px] text-faint">{note}</dd>}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="bg-surface px-[15px] py-[13px]">
      <div className="text-[12px] font-medium text-mute">{label}</div>
      <div className={`num mt-[6px] text-[23px] font-semibold tracking-[-0.02em] ${tone}`}>
        {value}
      </div>
      {note && <div className="mt-[4px] text-[11.5px] text-faint">{note}</div>}
    </div>
  );
}

function Figure({ value, label, tone = "" }: { value: string; label: string; tone?: string }) {
  return (
    <div>
      <div className={`num text-[23px] font-semibold tracking-[-0.02em] ${tone}`}>{value}</div>
      <div className="mt-[2px] text-[12px] text-mute">{label}</div>
    </div>
  );
}

function Panel({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[9px] border border-hair bg-surface p-[17px]">
      <div className="text-[14px] font-semibold tracking-[-0.01em]">{title}</div>
      {sub ? (
        <p className="mb-[13px] mt-[2px] text-[12.5px] text-mute">{sub}</p>
      ) : (
        <div className="h-[11px]" />
      )}
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[9px] border border-dashed border-hair px-4 py-12 text-center text-[13px] leading-[1.6] text-mute">
      {children}
    </div>
  );
}

function Band({
  label,
  n,
  total,
  className,
  muted = false,
}: {
  label: string;
  n: number;
  total: number;
  className: string;
  muted?: boolean;
}) {
  return (
    <li className="flex items-center gap-[10px]">
      <span className={`w-[112px] shrink-0 text-[12.5px] ${muted ? "text-mute" : "font-medium"}`}>
        {label}
      </span>
      <span className="h-[7px] grow overflow-hidden rounded-[3px] bg-hair-soft">
        <span
          className={`block h-full ${className}`}
          style={{ width: total > 0 ? `${(n / total) * 100}%` : "0%" }}
        />
      </span>
      <span className="num w-[18px] shrink-0 text-right text-[12.5px] font-semibold">{n}</span>
    </li>
  );
}

function Seg({ n, total, className }: { n: number; total: number; className: string }) {
  if (n === 0 || total === 0) return null;
  return <span className={className} style={{ width: `${(n / total) * 100}%` }} />;
}

function Money({
  label,
  caption,
  paise,
  of,
  className,
}: {
  label: string;
  caption: string;
  paise: number;
  of: number;
  className: string;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium">
          {label} <span className="font-normal text-mute">— {caption}</span>
        </span>
        <span className="num shrink-0 text-[13.5px] font-semibold">{rupees(paise)}</span>
      </div>
      <span className="mt-[6px] flex h-[9px] overflow-hidden rounded-[3px] bg-hair-soft">
        <span className={className} style={{ width: of > 0 ? `${(paise / of) * 100}%` : "0%" }} />
      </span>
    </li>
  );
}

/* ── the school card ────────────────────────────────────────────────────── */

function SchoolCard({ row, facilities }: { row: Row; facilities: Facility[] }) {
  const score = row.score == null ? null : Number(row.score);
  const visitDays = row.last_visit_days == null ? null : Number(row.last_visit_days);
  const released = row.released_paise == null ? null : Number(row.released_paise);
  const verified = Number(row.verified_paise ?? 0);
  const repairs = Number(row.repairs_done);
  const open = Number(row.repairs_open);
  const reverted = Number(row.reversions ?? 0);
  const overdue = Number(row.overdue_checks ?? 0);
  const place =
    [row.village, row.block && `${row.block} block`].filter(Boolean).join(" · ") ||
    "Location not recorded";

  const components: { label: string; value: string }[] = [
    { label: "Facilities seen", value: row.facility_component },
    { label: "Grant verified", value: row.grant_component },
    { label: "Follow-ups passed", value: row.followup_component },
  ].filter((c): c is { label: string; value: string } => c.value != null);

  return (
    <li
      id={`school-${row.id}`}
      className="scroll-mt-[70px] rounded-[9px] border border-hair bg-surface p-4 sm:px-[18px]"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[15.5px] font-semibold tracking-[-0.012em]">{row.name}</h3>
          <p className="mt-[2px] text-[12.5px] text-mute">{place}</p>
          <p className="num mt-[2px] text-[11px] text-faint">
            UDISE {row.udise_code ?? "not recorded"}
            {row.enrolment != null && ` · ${row.enrolment} pupils`}
          </p>
        </div>

        {score == null ? (
          <span className="shrink-0 rounded-[6px] border border-dashed border-hair px-[10px] py-[6px] text-[12px] font-medium text-mute">
            Not visited yet
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-[10px]">
            <span className="h-[5px] w-[64px] overflow-hidden rounded-full bg-hair-soft">
              <span
                className={`block h-full rounded-full ${scoreBg(score)}`}
                style={{ width: `${score}%` }}
              />
            </span>
            <span
              className={`num text-[21px] font-semibold tracking-[-0.02em] ${scoreColor(score)}`}
            >
              {score}
            </span>
            <span className="num text-[11px] text-faint">/100</span>
          </div>
        )}
      </div>

      {/* the score taken apart, so the number is never merely asserted */}
      {components.length > 0 && (
        <div className="mt-[11px] flex flex-wrap gap-x-5 gap-y-1 border-t border-hair-soft pt-[10px]">
          {components.map((c) => (
            <span key={c.label} className="text-[12px] text-mute">
              {c.label} <span className="num font-semibold text-body">{c.value}</span>
            </span>
          ))}
        </div>
      )}

      {facilities.length === 0 ? (
        <p className="mt-[11px] border-t border-hair-soft pt-[11px] text-[12.5px] leading-[1.55] text-mute">
          Nobody has been to this school, so there is nothing on record about its condition. That is
          a gap in the survey, not a clean bill of health.
        </p>
      ) : (
        <ul className="mt-[11px] flex flex-wrap gap-[6px] border-t border-hair-soft pt-[11px]">
          {facilities.map((f, i) => (
            <li
              key={i}
              className="inline-flex items-center gap-[7px] rounded-[6px] border border-hair bg-surface-2 py-[5px] pl-[9px] pr-[10px] text-[12px]"
            >
              <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${STATE_DOT[f.state]}`} />
              <span className="font-medium">{f.label}</span>
              <span className={STATE_TEXT[f.state]}>{STATE_WORD[f.state]}</span>
              {/* when it was seen is part of the claim — "broken" three months ago
                  is not the same statement as "broken" yesterday */}
              {f.seen_days != null && (
                <span className="text-[11px] text-faint">{relativeDays(Number(f.seen_days))}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-[12px] grid grid-cols-2 gap-x-5 gap-y-[9px] border-t border-hair-soft pt-[11px] text-[12px] sm:grid-cols-4">
        <Cell
          label="Last visit"
          value={visitDays == null ? "never" : relativeDays(visitDays)}
          muted={visitDays == null}
        />
        <Cell
          label="Repairs"
          value={`${repairs} done${open > 0 ? ` · ${open} open` : ""}`}
          muted={repairs === 0 && open === 0}
        />
        <Cell
          label="Grant released"
          value={released == null ? "none recorded" : rupees(released)}
          muted={released == null}
          note={
            released != null && released > verified
              ? `${rupees(released - verified)} unverified`
              : undefined
          }
          noteTone="text-bad"
        />
        <Cell
          label="Repairs that failed"
          value={reverted === 0 ? "none" : String(reverted)}
          muted={reverted === 0}
          tone={reverted > 0 ? "text-bad" : ""}
          note={overdue > 0 ? `${overdue} check${overdue === 1 ? "" : "s"} overdue` : undefined}
          noteTone="text-warn"
        />
      </dl>
    </li>
  );
}

function Cell({
  label,
  value,
  note,
  muted = false,
  tone = "",
  noteTone = "text-faint",
}: {
  label: string;
  value: string;
  note?: string;
  muted?: boolean;
  tone?: string;
  noteTone?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-mute">{label}</dt>
      <dd className={`num mt-[2px] font-medium ${tone || (muted ? "text-faint" : "text-body")}`}>
        {value}
      </dd>
      {note && <dd className={`num mt-[1px] text-[11px] ${noteTone}`}>{note}</dd>}
    </div>
  );
}
