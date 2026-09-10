import Link from "next/link";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { REPAIR_STATUS } from "@/lib/repair-input";
import type { WorkStatus } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { Card, Empty, Tag, rupees } from "@/components/ui";
import { IconChevron, IconSearch } from "@/components/icons";

type Row = {
  id: string; school_name: string; village: string | null; block: string | null;
  work_label: string; facility_label: string; status: WorkStatus; assigned_name: string | null;
  target_date: string | null; done_on: string | null; days_late: number | null;
  est_cost: string | null; actual_cost: string | null;
};
const FILTERS = [
  ["open", "Open repairs"], ["planned", "Planned"], ["in_progress", "In progress"], ["done", "Completed"], ["all", "All"],
] as const;

export default async function RepairsPage({ searchParams }: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const sp = await searchParams;
  const status = FILTERS.some(([key]) => key === sp.status) ? sp.status! : "open";
  const search = sp.q?.trim().slice(0, 200) ?? "";
  const rows = await q<Row>(
    `SELECT w.id, s.name AS school_name, s.village, s.block, wt.label_en AS work_label,
            ft.label_en AS facility_label, w.status, u.name AS assigned_name,
            w.target_date::text, w.done_on::text, current_date-w.target_date AS days_late,
            w.est_cost_paise::text AS est_cost, w.actual_cost_paise::text AS actual_cost
       FROM works w JOIN schools s ON s.id=w.school_id
       JOIN work_types wt ON wt.key=w.work_type_key JOIN facility_types ft ON ft.key=w.facility_key
       LEFT JOIN users u ON u.id=w.assigned_to_id
      WHERE w.org_id=$1
        AND ($2='all' OR ($2='open' AND w.status IN ('planned','in_progress')) OR w.status::text=$2)
        AND ($3='' OR s.name ILIKE '%'||$3||'%' OR s.village ILIKE '%'||$3||'%'
             OR wt.label_en ILIKE '%'||$3||'%' OR u.name ILIKE '%'||$3||'%')
      ORDER BY CASE WHEN w.status IN ('planned','in_progress') THEN 0 ELSE 1 END,
               w.target_date ASC NULLS LAST, w.created_at DESC`,
    [user.org_id, status, search]
  );
  const [counts] = await q<{ open: string; overdue: string; unassigned: string; done: string }>(
    `SELECT count(*) FILTER (WHERE status IN ('planned','in_progress')) AS open,
       count(*) FILTER (WHERE status IN ('planned','in_progress') AND target_date<current_date) AS overdue,
       count(*) FILTER (WHERE status IN ('planned','in_progress') AND assigned_to_id IS NULL) AS unassigned,
       count(*) FILTER (WHERE status='done') AS done FROM works WHERE org_id=$1`, [user.org_id]
  );

  return <AppShell user={user}>
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="page-kicker">Repair pipeline</p>
          <h1 className="text-[28px] font-semibold tracking-[-0.035em]">Repairs</h1>
          <p className="mt-1 text-[13.5px] text-mute">From a reported problem to a repair that lasts.</p>
        </div>
        {user.role !== "volunteer" && <Link href="/inbox" className="inline-flex min-h-11 items-center rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white hover:opacity-90">Review new reports →</Link>}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Open repairs", value: counts.open, hint: "planned or in progress", tone: "text-ink" },
          { label: "Past target date", value: counts.overdue, hint: "need a progress update", tone: Number(counts.overdue) ? "text-bad" : "text-ink" },
          { label: "Without an owner", value: counts.unassigned, hint: "waiting to be assigned", tone: Number(counts.unassigned) ? "text-warn" : "text-ink" },
          { label: "Completed", value: counts.done, hint: "follow-up history on each repair", tone: "text-ink" },
        ].map((stat) => <Card key={stat.label} className="relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-brand">
          <p className="text-[12px] font-medium text-mute">{stat.label}</p>
          <p className={`num mt-2 text-[27px] font-semibold ${stat.tone}`}>{stat.value}</p>
          <p className="mt-2 text-[12px] text-mute">{stat.hint}</p>
        </Card>)}
      </div>
      <Card pad={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair bg-surface-2/60 px-4 py-3">
          <nav aria-label="Filter repairs" className="flex flex-wrap gap-1 rounded-[8px] border border-hair bg-surface p-[2px]">
            {FILTERS.map(([key, label]) => <Link key={key} href={`/repairs?${new URLSearchParams({ status: key, ...(search ? { q: search } : {}) })}`} aria-current={status === key ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-[6px] px-3 text-[12.5px] ${status === key ? "bg-brand-soft font-semibold text-brand" : "text-body hover:bg-surface-2"}`}>{label}</Link>)}
          </nav>
          <form action="/repairs" className="flex w-full items-center gap-2 sm:w-auto">
            <input type="hidden" name="status" value={status} />
            <div className="flex min-h-10 min-w-0 grow items-center gap-2 rounded-[7px] border border-hair bg-surface px-3 focus-within:border-brand">
              <IconSearch size={15} className="shrink-0 text-mute" />
              <input name="q" aria-label="Search repairs" defaultValue={search} placeholder="School, repair or person" className="w-full min-w-0 bg-transparent text-[13px] outline-none" />
            </div>
            <button className="min-h-10 rounded-[7px] border border-hair bg-surface px-3 text-[12px] font-medium hover:border-faint hover:bg-canvas">Search</button>
          </form>
        </div>
        <div className="flex items-center justify-between border-b border-hair-soft px-5 py-3 text-[12px] text-mute">
          <span><span className="num">{rows.length}</span> {rows.length === 1 ? "repair" : "repairs"}{search ? ` matching “${search}”` : ""}</span>
          <span>Earliest target first</span>
        </div>
        {rows.length === 0 ? <div className="p-5"><Empty>
          {search ? <>No repairs match this search. <Link href={`/repairs?status=${status}`} className="text-brand underline">Clear search</Link></> : status === "open" ? <>No open repairs. Review new reports to plan the next repair.</> : "No repairs in this view yet."}
        </Empty></div> : rows.map((row) => {
          const open = row.status === "planned" || row.status === "in_progress";
          const cost = row.status === "done" ? row.actual_cost : row.est_cost;
          return <Link key={row.id} href={`/repairs/${row.id}`} className="group grid grid-cols-2 gap-3 border-b border-hair-soft px-5 py-4 last:border-b-0 hover:bg-brand-soft/35 xl:grid-cols-[minmax(0,1fr)_150px_130px_100px_16px] xl:items-center">
            <div className="col-span-2 min-w-0 xl:col-span-1">
              <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold">{row.work_label}</span><Tag tone={REPAIR_STATUS[row.status].tone}>{REPAIR_STATUS[row.status].label}</Tag></div>
              <p className="mt-1 text-[13px] text-body">{row.school_name} · {row.facility_label}</p>
              <p className="mt-1 text-[12px] text-mute">{[row.village, row.block && `${row.block} block`].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="text-[13px]"><p className="mb-1 text-[11px] text-mute">Responsible person</p><span className={open && !row.assigned_name ? "text-warn" : "text-body"}>{row.assigned_name ?? "Unassigned"}</span></div>
            <div className="text-[12px]"><p className="mb-1 text-[11px] text-mute">{row.status === "done" ? "Completed" : "Target date"}</p><span className="num text-body">{row.status === "done" ? row.done_on ?? "Not recorded" : row.target_date ?? "Not set"}</span>{open && row.days_late != null && row.days_late > 0 && <p className="num mt-1 text-bad">{row.days_late}d overdue</p>}</div>
            <div><p className="mb-1 text-[11px] text-mute">{row.status === "done" ? "Final cost" : "Estimate"}</p><span className="num text-[13px] text-body">{cost === null ? "Not recorded" : rupees(Number(cost))}</span></div>
            <IconChevron size={15} className="hidden text-faint group-hover:text-brand xl:block" />
          </Link>;
        })}
      </Card>
    </div>
  </AppShell>;
}
