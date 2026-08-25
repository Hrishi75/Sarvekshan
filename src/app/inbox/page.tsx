import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Card, Empty, Tag } from "@/components/ui";
import { FieldShell } from "@/components/FieldShell";

type Row = {
  id: string;
  school_id: string;
  school_name: string;
  facility_label: string;
  state: string;
  note_text: string | null;
  transcript: string | null;
  reported_by: string | null;
  age_days: number;
  has_photo: boolean;
  has_voice: boolean;
};

export default async function InboxPage() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (user.role === "volunteer") redirect("/");

  const rows = await q<Row>(
    `SELECT o.id, o.school_id, s.name AS school_name, f.label_en AS facility_label,
            o.state::text, o.note_text, o.transcript,
            u.name AS reported_by,
            EXTRACT(day FROM now() - o.created_at)::int AS age_days,
            EXISTS (SELECT 1 FROM media m WHERE m.observation_id=o.id AND m.kind='condition') AS has_photo,
            EXISTS (SELECT 1 FROM media m WHERE m.observation_id=o.id AND m.kind='voice')     AS has_voice
       FROM observations o
       JOIN schools s ON s.id=o.school_id
       JOIN facility_types f ON f.key=o.facility_key
       LEFT JOIN visits v ON v.id=o.visit_id
       LEFT JOIN users u ON u.id=v.by_user_id
      WHERE o.org_id=$1 AND o.triaged_at IS NULL AND o.state <> 'working'
      ORDER BY CASE o.state WHEN 'broken' THEN 0 ELSE 1 END, o.created_at
      LIMIT 60`,
    [user.org_id]
  );

  return (
    <FieldShell title="Triage inbox" subtitle={`${rows.length} waiting`} back="/">
      {rows.length === 0 ? (
        <Empty>Nothing waiting. Everything reported has been acted on.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block truncate font-semibold leading-tight">
                      {r.facility_label}
                    </span>
                    <span className="block truncate text-xs text-mute">{r.school_name}</span>
                  </div>
                  <Tag tone={r.state === "broken" ? "bad" : "warn"}>{r.state}</Tag>
                </div>

                {(r.note_text || r.transcript) && (
                  <p className="mt-2 text-sm text-body">{r.transcript ?? r.note_text}</p>
                )}

                <div className="mt-2 flex items-center gap-3 font-mono text-[0.65rem] text-mute">
                  {r.has_photo && <span>photo</span>}
                  {r.has_voice && <span>voice</span>}
                  <span>{r.reported_by ?? "unknown"}</span>
                  <span>{r.age_days}d ago</span>
                </div>

                <form action="/api/triage" method="post" className="mt-3 flex gap-2">
                  <input type="hidden" name="observation_id" value={r.id} />
                  <button
                    name="action"
                    value="create_work"
                    className="tap flex-1 rounded bg-brand px-3 text-sm font-semibold text-white"
                  >
                    Make it work
                  </button>
                  <button
                    name="action"
                    value="dismiss"
                    className="tap rounded border border-hair px-4 text-sm text-body"
                  >
                    Dismiss
                  </button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </FieldShell>
  );
}
