import { NextResponse } from "next/server";
import { q1, tx } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role === "volunteer") {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }

  const fd = await req.formData();
  const observationId = String(fd.get("observation_id") ?? "");
  const action = String(fd.get("action") ?? "");
  if (!observationId) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const obs = await q1<{ school_id: string; facility_key: string; note_text: string | null }>(
    `SELECT school_id, facility_key, note_text FROM observations
      WHERE id=$1 AND org_id=$2`,
    [observationId, user.org_id]
  );
  if (!obs) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "dismiss") {
    await q1(
      `UPDATE observations SET triaged_at=now(), dismissed_reason='dismissed at triage'
        WHERE id=$1 AND org_id=$2`,
      [observationId, user.org_id]
    );
  } else if (action === "create_work") {
    await tx(async (c) => {
      const { rows } = await c.query<{ key: string }>(
        `SELECT key FROM work_types WHERE facility_key=$1 ORDER BY sort_order LIMIT 1`,
        [obs.facility_key]
      );
      const workTypeKey = rows[0]?.key ?? "classroom_repair";
      const { rows: w } = await c.query<{ id: string }>(
        `INSERT INTO works (org_id, school_id, facility_key, work_type_key, description,
                            status, client_uuid)
         VALUES ($1,$2,$3,$4,$5,'planned', gen_random_uuid())
         RETURNING id`,
        [user.org_id, obs.school_id, obs.facility_key, workTypeKey, obs.note_text]
      );
      await c.query(
        `INSERT INTO work_observations (work_id, observation_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [w[0].id, observationId]
      );
      await c.query(`UPDATE observations SET triaged_at=now() WHERE id=$1`, [observationId]);
    });
  }

  return NextResponse.redirect(new URL("/inbox", req.url), { status: 303 });
}
