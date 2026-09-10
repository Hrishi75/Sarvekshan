import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { q, q1 } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { editableRepair, REPAIR_STATUS } from "@/lib/repair-input";
import type { WorkStatus } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { Card, Tag, rupees } from "@/components/ui";
import { RepairForm, type RepairValues } from "./RepairForm";

type Work = Omit<RepairValues, "status"> & {
  status: WorkStatus; school_id: string; school_name: string; facility_key: string;
  facility_label: string; work_label: string; assigned_name: string | null;
  performed_name: string | null; today: string;
};

export default async function RepairPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const work = await q1<Work>(
    `SELECT w.id, w.xmin::text AS revision, w.status, w.school_id, w.facility_key, w.work_type_key,
       w.description, w.materials, w.assigned_to_id, w.performed_by_id,
       w.target_date::text, w.done_on::text, w.est_cost_paise::text, w.actual_cost_paise::text,
       s.name AS school_name, ft.label_en AS facility_label, wt.label_en AS work_label,
       a.name AS assigned_name, p.name AS performed_name, current_date::text AS today
     FROM works w JOIN schools s ON s.id=w.school_id
     JOIN facility_types ft ON ft.key=w.facility_key JOIN work_types wt ON wt.key=w.work_type_key
     LEFT JOIN users a ON a.id=w.assigned_to_id LEFT JOIN users p ON p.id=w.performed_by_id
     WHERE w.id=$1 AND w.org_id=$2`, [id, user.org_id]
  );
  if (!work) notFound();
  const canEdit = user.role !== "volunteer" && editableRepair(work.status);
  const [people, types, reports, checks] = await Promise.all([
    canEdit ? q<{ id: string; name: string; active: boolean }>(
      `SELECT id, name, active FROM users WHERE org_id=$1 AND (active OR id=$2) ORDER BY name`,
      [user.org_id, work.assigned_to_id]
    ) : [],
    canEdit ? q<{ key: string; label_en: string }>(
      `SELECT key, label_en FROM work_types WHERE facility_key=$1
        OR ($1='toilet_boys' AND facility_key='toilet_girls') ORDER BY sort_order`, [work.facility_key]
    ) : [],
    q<{ id: string; state: string; note_text: string | null; transcript: string | null; reported_on: string; by_name: string | null }>(
      `SELECT o.id, o.state, o.note_text, o.transcript, o.created_at::date::text AS reported_on, u.name AS by_name
       FROM work_observations wo JOIN observations o ON o.id=wo.observation_id
       LEFT JOIN visits v ON v.id=o.visit_id LEFT JOIN users u ON u.id=v.by_user_id
       WHERE wo.work_id=$1 AND o.org_id=$2 ORDER BY o.created_at`, [id, user.org_id]
    ),
    q<{ id: string; offset_days: number; due_on: string; state: string; result: string | null; assigned_name: string | null; days_late: number }>(
      `SELECT c.id, c.offset_days, c.due_on::text, c.state, c.result, u.name AS assigned_name,
         current_date-c.due_on AS days_late FROM checks c LEFT JOIN users u ON u.id=c.assigned_to_id
       WHERE c.work_id=$1 AND c.org_id=$2 ORDER BY c.offset_days`, [id, user.org_id]
    ),
  ]);
  const { saved } = await searchParams;

  return <AppShell user={user}>
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-2 text-[13px] text-mute">
        <Link href="/repairs" className="hover:text-brand">Repairs</Link><span aria-hidden> / </span>
        <Link href={`/schools/${work.school_id}`} className="hover:text-brand">{work.school_name}</Link>
      </nav>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-[24px] font-semibold tracking-[-0.025em]">{work.work_label}</h1><p className="mt-1 text-[13.5px] text-mute">{work.school_name} · {work.facility_label}</p></div>
        <Tag tone={REPAIR_STATUS[work.status].tone}>{REPAIR_STATUS[work.status].label}</Tag>
      </div>
      {saved === "1" && <p role="status" className="mb-4 rounded-[7px] border border-good/20 bg-good-soft px-4 py-3 text-[13px] text-good">Repair saved.{work.status === "done" ? ` ${checks.length} follow-up checks on record.` : " The team can now see the updated plan."}</p>}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="!p-5">
          {canEdit ? <RepairForm key={work.revision} work={{ ...work, status: work.status as "planned" | "in_progress" }} people={people} types={types} today={work.today} /> : <>
            <h2 className="mb-4 text-[15px] font-semibold">Repair record</h2>
            <dl className="grid grid-cols-2 gap-5 text-[13px]">
              {[
                ["Responsible person", work.assigned_name ?? "Not assigned"],
                ["Target date", work.target_date ?? "Not recorded"],
                ["Performed by", work.performed_name ?? "Not recorded"],
                ["Completed on", work.done_on ?? "Not recorded"],
                ["Estimated cost", rupees(work.est_cost_paise == null ? null : Number(work.est_cost_paise))],
                ["Final cost", rupees(work.actual_cost_paise == null ? null : Number(work.actual_cost_paise))],
              ].map(([label, value]) => <div key={label}><dt className="mb-1 text-mute">{label}</dt><dd className="font-medium">{value}</dd></div>)}
            </dl>
            <div className="mt-5 space-y-4 border-t border-hair-soft pt-4 text-[13px]">
              <div><h3 className="font-medium">Scope of work</h3><p className="mt-1 whitespace-pre-wrap text-body">{work.description || "No description recorded."}</p></div>
              <div><h3 className="font-medium">Materials and repair notes</h3><p className="mt-1 whitespace-pre-wrap text-body">{work.materials || "No materials or notes recorded."}</p></div>
            </div>
            {user.role === "volunteer" && editableRepair(work.status) && <p className="mt-5 rounded-[7px] bg-canvas p-3 text-[12px] text-mute">Your coordinator manages the repair plan. You can record site conditions with a new audit.</p>}
          </>}
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="text-[14px] font-semibold">Follow-through</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-body">A completed repair starts a year of follow-up. Its effect on the school’s condition comes from what someone observes on site.</p>
            {checks.length ? <ol className="mt-4 space-y-3">{checks.map((check) => {
              const pending = check.state === "pending" || check.state === "sent";
              return <li key={check.id} className="border-t border-hair-soft pt-3">
                <div className="flex items-center justify-between gap-2"><span className="num text-[12px] font-semibold">Day {check.offset_days}</span><Tag tone={check.result === "functional" ? "good" : check.result === "failed" ? "bad" : check.result === "degraded" || (pending && check.days_late > 0) ? "warn" : "plain"}>{check.result ?? (pending && check.days_late > 0 ? "Overdue" : check.state)}</Tag></div>
                <p className="num mt-2 text-[12px] text-body">{check.due_on}</p>
                <p className={`mt-1 text-[12px] ${check.assigned_name ? "text-mute" : "text-warn"}`}>{check.assigned_name ?? "No local checker assigned"}</p>
                {pending && <Link href={`/checks/${check.id}`} className="mt-2 inline-block py-1 text-[12px] font-medium text-brand">Open check →</Link>}
              </li>;
            })}</ol> : <div className="mt-4 rounded-[7px] border border-dashed border-hair p-3 text-[12px] leading-relaxed text-mute">{editableRepair(work.status) ? "Checks at day 7, 90, 180 and 365 will be scheduled when this repair is completed." : "No follow-up checks on record."}</div>}
          </Card>
          <Card>
            <h2 className="text-[14px] font-semibold">Original reports</h2>
            {reports.length ? reports.map((report) => <div key={report.id} className="mt-3 border-t border-hair-soft pt-3">
              <div className="flex items-center justify-between gap-2"><span className="num text-[11px] text-mute">{report.reported_on}</span><Tag tone={report.state === "broken" ? "bad" : report.state === "working" ? "good" : "warn"}>{report.state}</Tag></div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] text-body">{report.transcript || report.note_text || "Condition reported without a written note."}</p>
              <p className="mt-2 text-[12px] text-mute">{report.by_name ?? "Reporter not recorded"}</p>
            </div>) : <p className="mt-2 text-[13px] text-mute">No report linked to this repair.</p>}
            <Link href={`/schools/${work.school_id}`} className="mt-4 inline-block text-[12.5px] font-medium text-brand">View the full school record →</Link>
          </Card>
        </div>
      </div>
    </div>
  </AppShell>;
}
