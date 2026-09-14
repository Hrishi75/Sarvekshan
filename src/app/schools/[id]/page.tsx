import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { Card, Tag, Empty, scoreColor } from "@/components/ui";
import { rupees, relativeDays, grantSlab } from "@/lib/format";
import { IconChevron, IconExport, IconCamera, IconAlert, IconImage } from "@/components/icons";
import { REPAIR_STATUS } from "@/lib/repair-input";
import type { WorkStatus } from "@/lib/types";

const STATE_TONE = { working: "good", partial: "warn", broken: "bad" } as const;
const STATE_LABEL = { working: "GOOD", partial: "PARTIAL", broken: "BROKEN" } as const;

export default async function SchoolPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { id } = await params;

  const school = await q1<{
    id: string; name: string; udise_code: string | null; village: string | null;
    block: string | null; district: string | null; enrolment: number | null;
    score: string | null; facility_component: string | null; grant_component: string | null;
    followup_component: string | null; reversions: string; overdue_checks: string;
    last_audit_days: string | null;
  }>(
    `SELECT s.id, s.name, s.udise_code, s.village, s.block, s.district, s.enrolment,
            sc.score::text, sc.facility_component::text, sc.grant_component::text,
            sc.followup_component::text, sc.reversions::text, sc.overdue_checks::text,
            (SELECT min(EXTRACT(day FROM now()-v.occurred_at))::int::text
               FROM visits v WHERE v.school_id=s.id) AS last_audit_days
       FROM schools s LEFT JOIN school_scores sc ON sc.school_id=s.id
      WHERE s.id=$1 AND s.org_id=$2`,
    [id, user.org_id]
  );
  if (!school) notFound();

  const grant = await q1<{
    head: string; ay: string; sanctioned: string | null; released: string | null;
    accounted: string | null; verified: string | null; released_on: string | null;
    earmark_share: string | null; earmark_label: string | null;
  }>(
    `SELECT head, ay, amount_sanctioned_paise::text AS sanctioned,
            amount_released_paise::text AS released,
            amount_accounted_paise::text AS accounted,
            amount_verified_paise::text AS verified,
            released_on::text, earmark_share::text, earmark_label
       FROM grants WHERE school_id=$1 ORDER BY ay DESC LIMIT 1`,
    [id]
  );

  const facilities = await q<{
    facility_key: string; label: string; state: string; at: string;
    reports: string; last_repaired: string | null;
  }>(
    `SELECT fs.facility_key, ft.label_en AS label, fs.state, fs.at::text,
            (SELECT count(*)::text FROM facility_signals x
              WHERE x.school_id=fs.school_id AND x.facility_key=fs.facility_key) AS reports,
            (SELECT max(w.done_on)::text FROM works w
              WHERE w.school_id=fs.school_id AND w.facility_key=fs.facility_key
                AND w.status='done') AS last_repaired
       FROM school_facility_state fs
       JOIN facility_types ft ON ft.key=fs.facility_key
      WHERE fs.school_id=$1
      ORDER BY CASE fs.state WHEN 'broken' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,
               ft.sort_order`,
    [id]
  );

  const timeline = await q<{
    id: string; offset_days: number; due_on: string; state: string;
    result: string | null; by_name: string | null; independence: string | null;
    facility: string; work_label: string;
  }>(
    `SELECT c.id, c.offset_days, c.due_on::text, c.state::text, c.result::text,
            u.name AS by_name, c.independence::text, ft.label_en AS facility,
            wt.label_en AS work_label
       FROM checks c
       JOIN works w ON w.id=c.work_id
       JOIN work_types wt ON wt.key=w.work_type_key
       JOIN facility_types ft ON ft.key=c.facility_key
       LEFT JOIN users u ON u.id=c.by_user_id
      WHERE c.school_id=$1
      ORDER BY w.done_on DESC NULLS LAST, c.offset_days
      LIMIT 8`,
    [id]
  );

  const repairs = await q<{ id: string; label: string; status: WorkStatus; assigned_name: string | null; target_date: string | null }>(
    `SELECT w.id, wt.label_en AS label, w.status, u.name AS assigned_name, w.target_date::text
       FROM works w JOIN work_types wt ON wt.key=w.work_type_key
       LEFT JOIN users u ON u.id=w.assigned_to_id
      WHERE w.school_id=$1 AND w.org_id=$2
      ORDER BY CASE WHEN w.status IN ('planned','in_progress') THEN 0 ELSE 1 END, w.created_at DESC`,
    [id, user.org_id]
  );

  const score = school.score == null ? null : Number(school.score);
  const released = Number(grant?.released ?? 0);
  const verified = Number(grant?.verified ?? 0);
  const earmarkShare = grant?.earmark_share ? Number(grant.earmark_share) : null;
  const earmarkAmount = earmarkShare ? Math.round(released * earmarkShare) : null;
  const washBroken = facilities.some(
    (f) => ["toilet_girls", "toilet_boys", "drinking_water"].includes(f.facility_key) && f.state !== "working"
  );

  return (
    <AppShell user={user}>
      {/* entity header */}
      <div id="overview" className="scroll-mt-4 border-b border-hair bg-surface px-4 pt-4 sm:px-7">
        <nav className="mb-[10px] flex flex-wrap items-center gap-[6px] text-[12.5px] text-mute">
          <Link href="/schools" className="hover:text-ink">Schools</Link>
          <IconChevron size={13} className="text-faint" />
          <Link href={`/schools?block=${encodeURIComponent(school.block ?? "")}`} className="hover:text-ink">
            {school.block} block
          </Link>
          <IconChevron size={13} className="text-faint" />
          <span className="font-medium text-ink">{school.name}</span>
        </nav>

        <div className="flex flex-col items-start justify-between gap-4 xl:flex-row xl:gap-6">
          <div className="min-w-0">
            <h1 className="mb-[7px] text-[27px] font-semibold tracking-[-0.028em]">{school.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-mute">
              <span className="num">UDISE {school.udise_code ?? "—"}</span>
              <span className="h-[3px] w-[3px] rounded-full bg-faint" />
              <span>{school.enrolment ?? "—"} pupils</span>
              <span className="h-[3px] w-[3px] rounded-full bg-faint" />
              <span>{school.village}, {school.district}</span>
              <span className="h-[3px] w-[3px] rounded-full bg-faint" />
              <span>Audited {relativeDays(school.last_audit_days == null ? null : Number(school.last_audit_days))}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right">
              <div className="flex items-baseline justify-end gap-[5px]">
                <span className={`num text-[34px] font-semibold leading-none tracking-[-0.03em] ${scoreColor(score)}`}>
                  {score ?? "—"}
                </span>
                <span className="num text-[14px] text-faint">/100</span>
              </div>
              <div className="mt-[5px] flex items-center justify-end gap-[5px]">
                <Tag tone={score == null ? "plain" : score >= 70 ? "good" : score >= 50 ? "warn" : "bad"}>
                  {score == null ? "not audited" : score >= 70 ? "holding" : score >= 50 ? "at risk" : "failing"}
                </Tag>
              </div>
            </div>
            <span className="h-[42px] w-px bg-hair" />
            <div className="flex gap-2">
              <a
                href={`/api/export?dataset=school&id=${school.id}`}
                className="inline-flex min-h-11 items-center gap-[6px] rounded-[7px] border border-hair px-3 text-[13px] font-medium text-body hover:border-faint"
              >
                <IconExport size={14} />
                Report
              </a>
              <Link href={`/visit?school=${school.id}`} className="inline-flex min-h-11 items-center gap-[6px] rounded-[7px] bg-brand px-[13px] text-[13px] font-semibold text-white">
                <IconCamera size={14} />
                New audit
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-[18px] flex flex-wrap gap-x-4 gap-y-2">
          {[
            { label: "Overview", href: "#overview" },
            { label: "Grants", href: "#grants" },
            { label: "Facilities", href: "#facilities" },
            { label: "Repairs", href: "#repairs" },
            { label: "Score", href: "#score" },
            { label: "Evidence", href: "#evidence" },
          ].map((t, i) => (
            <a
              key={t.href}
              href={t.href}
              className={`pb-[11px] text-[13.5px] ${
                i === 0
                  ? "font-semibold text-ink shadow-[inset_0_-2px_0_0_var(--color-brand)]"
                  : "font-medium text-mute hover:text-ink"
              }`}
            >
              {t.label}
            </a>
          ))}
        </div>
      </div>

      {/* body */}
      <div className="grid gap-[14px] p-4 sm:p-7 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[14px]">
          <Card pad={false} className="scroll-mt-4 overflow-hidden" id="repairs">
            <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
              <h2 className="text-[14.5px] font-semibold">Repairs</h2>
              <span className="num text-[11px] text-mute">{repairs.length}</span>
            </div>
            {repairs.length === 0 ? <p className="px-[18px] pb-4 text-[13px] text-mute">No repairs recorded for this school yet.</p> : repairs.map((repair) => <Link key={repair.id} href={`/repairs/${repair.id}`} className="block border-t border-hair-soft px-[18px] py-3 hover:bg-surface-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[13px] font-medium">{repair.label}</span><Tag tone={REPAIR_STATUS[repair.status].tone}>{REPAIR_STATUS[repair.status].label}</Tag></div>
              <p className="mt-1 text-[12px] text-mute">{repair.assigned_name ?? "Unassigned"}{repair.target_date ? ` · Target ${repair.target_date}` : ""}</p>
            </Link>)}
          </Card>

          {/* grant reconciliation */}
          {grant ? (
            <Card className="scroll-mt-4 !p-[17px_19px]" id="grants">
              <div className="mb-[15px] flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14.5px] font-semibold tracking-[-0.01em]">
                  Composite School Grant — {grant.ay}
                </span>
                <span className="num text-[11px] text-mute">
                  {school.enrolment} pupils · slab {grantSlab(school.enrolment)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-px sm:grid-cols-4 overflow-hidden rounded-[7px] border border-hair bg-hair">
                <Stage label="Sanctioned" value={rupees(Number(grant.sanctioned ?? 0))} tone="good" />
                <Stage label="Released" value={rupees(released)} tone={released >= Number(grant.sanctioned ?? 0) ? "good" : "warn"} sub={grant.released_on ?? undefined} />
                <Stage label="Accounted" value={rupees(Number(grant.accounted ?? 0))} tone="warn" sub="paperwork" />
                <Stage label="Seen on site" value={rupees(verified)} tone="bad" sub="photo-confirmed" />
              </div>

              {earmarkAmount != null && washBroken && (
                <div className="mt-3 flex items-start gap-[10px] rounded-[7px] bg-bad-soft px-[14px] py-3">
                  <IconAlert size={16} className="mt-px shrink-0 text-bad" />
                  <p className="text-[13px] leading-[1.5] text-[#7A241A]">
                    <strong className="font-semibold text-[#5C1A13]">
                      The {grant.earmark_label} minimum was not met.
                    </strong>{" "}
                    Grant rules earmark at least {Math.round(earmarkShare! * 100)}% —{" "}
                    {rupees(earmarkAmount)} — for toilets and drinking water. Those facilities are
                    not fully functional.
                  </p>
                </div>
              )}
            </Card>
          ) : (
            <Card><Empty>No grant record for this school yet.</Empty></Card>
          )}

          {/* facilities */}
          <Card pad={false} className="scroll-mt-4 overflow-hidden" id="facilities">
            <div className="px-[19px] pb-3 pt-4 text-[14.5px] font-semibold tracking-[-0.01em]">
              Facilities
            </div>
            {facilities.length === 0 ? (
              <p className="px-[19px] pb-5 text-[13px] text-mute">Nothing observed here yet.</p>
            ) : (
              <>
                <div className="eyebrow flex border-b border-hair-soft px-[19px] pb-2">
                  <span className="grow">Facility</span>
                  <span className="hidden w-[130px] sm:block">Last repaired</span>
                  <span className="hidden w-[62px] sm:block text-right">Reports</span>
                  <span className="w-[92px] text-right">State</span>
                </div>
                {facilities.map((f) => (
                  <div key={f.facility_key} className="flex items-center border-b border-hair-soft/60 px-[19px] py-[11px] last:border-b-0">
                    <span className="grow text-[13.5px] font-medium">{f.label}</span>
                    <span className="hidden w-[130px] sm:block text-[12.5px] text-mute">{f.last_repaired ?? "Never"}</span>
                    <span className="num hidden w-[62px] sm:block text-right text-[12px] text-body">{f.reports}</span>
                    <span className="w-[92px] text-right">
                      <Tag tone={STATE_TONE[f.state as keyof typeof STATE_TONE]}>
                        {STATE_LABEL[f.state as keyof typeof STATE_LABEL]}
                      </Tag>
                    </span>
                  </div>
                ))}
              </>
            )}
          </Card>

          {/* how the score was reached — the working, shown */}
          <Card className="scroll-mt-4 !p-[17px_19px]" id="score">
            <div className="mb-3 text-[14.5px] font-semibold tracking-[-0.01em]">How this score was reached</div>
            <div className="flex flex-col gap-[9px]">
              <Component label="Facilities working" weight="55%" value={school.facility_component} />
              <Component label="Grant verified on site" weight="25%" value={school.grant_component} />
              <Component label="Follow-ups passing" weight="20%" value={school.followup_component} />
            </div>
            <p className="mt-3 border-t border-hair-soft pt-[11px] text-[12.5px] leading-[1.5] text-mute">
              Then −4 per reverted repair ({school.reversions}) and −2 per overdue check (
              {school.overdue_checks}). Missed checks are excluded from the denominator rather than
              counted as working.
            </p>
          </Card>
        </div>

        {/* evidence column */}
        <div className="flex min-w-0 flex-col gap-[14px]">
          <Card pad={false} className="scroll-mt-4 overflow-hidden" id="evidence">
            <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
              <span className="text-[14.5px] font-semibold tracking-[-0.01em]">Same spot, over time</span>
              <span className="num text-[11px] text-mute">{facilities[0]?.label ?? "—"}</span>
            </div>
            {facilities.length === 0 ? (
              <p className="px-[18px] pb-1 text-[13px] leading-[1.5] text-mute">
                No facility conditions have been recorded at this school yet. Record the first
                audit to start its evidence history and score.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-[9px] px-[18px]">
                  <PhotoSlot tone="good" date="Baseline" caption="ON RECORD" />
                  <PhotoSlot
                    tone={facilities[0].state === "working" ? "good" : "bad"}
                    date="Latest"
                    caption={
                      facilities[0].state === "working"
                        ? "OK"
                        : facilities[0].state === "partial"
                          ? "PARTIAL"
                          : "BROKEN"
                    }
                  />
                </div>
                <p className="mx-[18px] mt-[13px] rounded-[7px] bg-canvas px-[13px] py-[11px] text-[12.5px] leading-[1.5] text-body">
                  Photo points are set on the first visit and reused for years, so two pictures of
                  the same tap are actually comparable. Images are not wired into this view yet.
                </p>
              </>
            )}

            <div className="eyebrow px-[18px] pt-[17px]">Follow-up checks</div>
            <div className="flex flex-col px-[18px] pb-4 pt-[11px]">
              {timeline.length === 0 ? (
                <p className="text-[12.5px] text-mute">No follow-ups scheduled yet.</p>
              ) : (
                timeline.map((t, i) => (
                  <div key={t.id} className="flex gap-[11px]">
                    <div className="flex shrink-0 flex-col items-center">
                      <span
                        className={`h-[9px] w-[9px] rounded-full ${
                          t.result === "functional" ? "bg-good"
                            : t.result === "degraded" ? "bg-warn"
                            : t.result === "failed" ? "bg-bad"
                            : t.state === "missed" ? "bg-hair"
                            : "border-[1.5px] border-dashed border-faint bg-surface"
                        }`}
                      />
                      {i < timeline.length - 1 && <span className="min-h-[22px] w-[1.5px] grow bg-hair" />}
                    </div>
                    <div className="min-w-0 pb-[13px]">
                      <div className={`text-[12.5px] font-medium ${t.result === "failed" ? "text-bad" : t.state === "done" ? "" : "text-mute"}`}>
                        Day {t.offset_days} — {t.result ?? (t.state === "missed" ? "missed" : `due ${t.due_on}`)}
                      </div>
                      <div className="mt-px text-[11.5px] text-mute">
                        {t.by_name ? `${t.by_name} · ${t.independence}` : t.facility}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Stage({ label, value, tone, sub }: { label: string; value: string; tone: "good" | "warn" | "bad"; sub?: string }) {
  const color = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-bad";
  return (
    <div className="bg-surface px-[13px] py-3">
      <div className="eyebrow mb-[6px]">{label}</div>
      <div className={`num text-[18px] font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-[3px] text-[11px] text-mute">{sub}</div>}
    </div>
  );
}

function Component({ label, weight, value }: { label: string; weight: string; value: string | null }) {
  const v = value == null ? null : Number(value);
  return (
    <div className="flex items-center gap-3">
      <span className="w-[168px] shrink-0 text-[12.5px] text-body">{label}</span>
      <span className="num w-[36px] shrink-0 text-[11px] text-faint">{weight}</span>
      <span className="h-[5px] grow overflow-hidden rounded-full bg-hair-soft">
        <span
          className={`block h-full rounded-full ${v == null ? "bg-hair" : v >= 70 ? "bg-good" : v >= 50 ? "bg-warn" : "bg-bad"}`}
          style={{ width: `${v ?? 0}%` }}
        />
      </span>
      <span className="num w-[34px] shrink-0 text-right text-[12.5px] font-semibold">
        {v == null ? "—" : v}
      </span>
    </div>
  );
}

function PhotoSlot({ tone, date, caption }: { tone: "good" | "bad"; date: string; caption: string }) {
  const bg = tone === "good" ? "bg-good-soft border-good/25" : "bg-bad-soft border-bad/25";
  const fg = tone === "good" ? "text-good" : "text-bad";
  return (
    <div>
      <div className={`flex aspect-[4/3] items-center justify-center rounded-[7px] border ${bg}`}>
        <IconImage size={30} className={`${fg} opacity-55`} />
      </div>
      <div className="mt-[6px] flex items-center justify-between">
        <span className="text-[11.5px] font-medium">{date}</span>
        <span className={`num text-[9.5px] font-semibold ${fg}`}>{caption}</span>
      </div>
    </div>
  );
}
