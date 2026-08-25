import { notFound, redirect } from "next/navigation";
import { q1 } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Tag } from "@/components/ui";
import { FieldShell } from "@/components/FieldShell";
import { CheckForm } from "./CheckForm";

export default async function CheckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const { id } = await params;

  const row = await q1<{
    id: string;
    school_name: string;
    facility_label: string;
    work_label: string;
    work_description: string | null;
    offset_days: number;
    due_on: string;
    days_late: number;
    landmark_note: string | null;
    done_on: string | null;
    performed_by: string | null;
    would_be_self: boolean;
  }>(
    `SELECT c.id, s.name AS school_name, f.label_en AS facility_label,
            wt.label_en AS work_label, w.description AS work_description,
            c.offset_days, c.due_on::text, (current_date - c.due_on) AS days_late,
            pp.landmark_note, w.done_on::text,
            pu.name AS performed_by,
            (w.performed_by_id = $2) AS would_be_self
       FROM checks c
       JOIN schools s ON s.id=c.school_id
       JOIN facility_types f ON f.key=c.facility_key
       JOIN works w ON w.id=c.work_id
       JOIN work_types wt ON wt.key=w.work_type_key
       LEFT JOIN users pu ON pu.id=w.performed_by_id
       LEFT JOIN photo_points pp ON pp.id=c.photo_point_id
      WHERE c.id=$1 AND c.org_id=$3`,
    [id, user.id, user.org_id]
  );
  if (!row) notFound();

  return (
    <FieldShell title={row.facility_label} subtitle={row.school_name} back="/checks">
      <div className="flex flex-col gap-4">
        <div className="rounded border border-hair bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.65rem] uppercase tracking-wider text-mute">
              Day {row.offset_days} check
            </span>
            <Tag tone={row.days_late > 0 ? "bad" : "brand"}>
              {row.days_late > 0 ? `${row.days_late} days late` : `due ${row.due_on}`}
            </Tag>
          </div>
          <p className="mt-2 text-sm">
            <strong>{row.work_label}</strong>
            {row.work_description ? ` — ${row.work_description}` : ""}
          </p>
          <p className="mt-1 text-xs text-mute">
            Done on {row.done_on ?? "—"}
            {row.performed_by ? ` by ${row.performed_by}` : ""}
          </p>
        </div>

        {row.landmark_note && (
          <div className="rounded border-l-2 border-brand bg-brand-soft px-4 py-3">
            <span className="font-mono text-[0.62rem] uppercase tracking-wider text-brand">
              Stand here
            </span>
            <p className="mt-1 text-sm">{row.landmark_note}</p>
          </div>
        )}

        {row.would_be_self && (
          <div className="rounded border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
            You did this work yourself. Your check will be recorded and shown as
            <strong> self-reported</strong>, which carries no weight in the survival figures.
            If someone local can look instead, that is worth far more.
          </div>
        )}

        <CheckForm checkId={row.id} />
      </div>
    </FieldShell>
  );
}
