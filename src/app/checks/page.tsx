import Link from "next/link";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Empty, Tag } from "@/components/ui";
import { FieldShell } from "@/components/FieldShell";

type Row = {
  id: string;
  school_id: string;
  school_name: string;
  facility_label: string;
  work_label: string;
  offset_days: number;
  due_on: string;
  state: string;
  days_late: number;
  landmark_note: string | null;
};

export default async function ChecksPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const mine = user.role === "volunteer";
  const rows = await q<Row>(
    `SELECT c.id, c.school_id, s.name AS school_name,
            f.label_en AS facility_label, wt.label_en AS work_label,
            c.offset_days, c.due_on::text, c.state::text,
            (current_date - c.due_on) AS days_late,
            pp.landmark_note
       FROM checks c
       JOIN schools s   ON s.id = c.school_id
       JOIN facility_types f ON f.key = c.facility_key
       JOIN works w     ON w.id = c.work_id
       JOIN work_types wt ON wt.key = w.work_type_key
       LEFT JOIN photo_points pp ON pp.id = c.photo_point_id
      WHERE c.org_id = $1
        AND c.state IN ('pending','sent')
        AND ($2::uuid IS NULL OR c.assigned_to_id = $2)
        AND c.due_on <= current_date + 14
      ORDER BY c.due_on
      LIMIT 60`,
    [user.org_id, mine ? user.id : null]
  );

  return (
    <FieldShell
      title="Follow-up checks"
      subtitle={mine ? "Assigned to you" : "Across the block"}
      back="/"
    >
      {rows.length === 0 ? (
        <Empty>Nothing due in the next two weeks.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/checks/${r.id}`}>
                <div className="rounded-[9px] border border-hair bg-surface px-4 py-3 hover:border-brand">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block truncate font-semibold leading-tight">
                        {r.facility_label}
                      </span>
                      <span className="block truncate text-xs text-mute">
                        {r.school_name}
                      </span>
                    </div>
                    <Tag tone={r.days_late > 0 ? "bad" : "brand"}>
                      {r.days_late > 0 ? `${r.days_late}d late` : `day ${r.offset_days}`}
                    </Tag>
                  </div>
                  {r.landmark_note && (
                    <p className="mt-2 border-l-2 border-hair pl-2 text-xs italic text-body">
                      {r.landmark_note}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </FieldShell>
  );
}
