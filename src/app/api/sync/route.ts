import { NextResponse } from "next/server";
import { z } from "zod";
import { tx } from "@/lib/db";
import { currentUser } from "@/lib/session";

const Visit = z.object({
  client_uuid: z.uuid(),
  school_id: z.uuid(),
  occurred_at: z.string(),
});

const Observation = z.object({
  client_uuid: z.uuid(),
  visit_client_uuid: z.uuid(),
  school_id: z.uuid(),
  facility_key: z.string().min(1),
  state: z.enum(["working", "problem", "broken"]),
  note_text: z.string().max(1000).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const Check = z.object({
  client_uuid: z.uuid(),
  check_id: z.uuid(),
  result: z.enum(["functional", "degraded", "failed", "inaccessible"]),
  note_text: z.string().max(1000).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  completed_at: z.string(),
});

const Body = z.object({
  visits: z.array(Visit).default([]),
  observations: z.array(Observation).default([]),
  checks: z.array(Check).default([]),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "bad payload", detail: parsed.error.issues }, { status: 400 });
  }
  const { visits, observations, checks } = parsed.data;

  await tx(async (c) => {
    // Every insert is ON CONFLICT (org_id, client_uuid) DO NOTHING.
    // Retrying the same payload after a dropped connection is a no-op.
    for (const v of visits) {
      // school_id arrives from the device: select it back through the org before
      // writing, so a client cannot file a visit against another org's school.
      await c.query(
        `INSERT INTO visits (org_id, school_id, by_user_id, source, occurred_at, client_uuid)
         SELECT $1::uuid, s.id, $3::uuid, 'app', $4::timestamptz, $5::uuid
           FROM schools s
          WHERE s.id = $2::uuid AND s.org_id = $1::uuid
         ON CONFLICT (org_id, client_uuid) DO NOTHING`,
        [user.org_id, v.school_id, user.id, v.occurred_at, v.client_uuid]
      );
    }

    for (const o of observations) {
      await c.query(
        `INSERT INTO observations
           (org_id, visit_id, school_id, facility_key, state, note_text, id)
         SELECT $1::uuid, v.id, s.id, $3::text, $4::facility_state, $5::text, $6::uuid
           FROM visits v
           JOIN schools s ON s.id = $2::uuid AND s.org_id = $1::uuid
          WHERE v.org_id = $1::uuid AND v.client_uuid = $7::uuid
         ON CONFLICT (id) DO NOTHING`,
        [
          user.org_id,
          o.school_id,
          o.facility_key,
          o.state,
          o.note_text ?? null,
          o.client_uuid,
          o.visit_client_uuid,
        ]
      );
    }

    for (const ck of checks) {
      // completing a check never creates one — the trigger owns creation
      await c.query(
        `UPDATE checks
            SET result = $1::check_result,
                note_text = COALESCE($2, note_text),
                by_user_id = $3,
                state = 'done',
                completed_at = $4,
                client_uuid = COALESCE(client_uuid, $5)
          WHERE id = $6 AND org_id = $7 AND state <> 'done'`,
        [
          ck.result,
          ck.note_text ?? null,
          user.id,
          ck.completed_at,
          ck.client_uuid,
          ck.check_id,
          user.org_id,
        ]
      );
    }
  });

  return NextResponse.json({
    ok: true,
    accepted: visits.length + observations.length + checks.length,
  });
}
