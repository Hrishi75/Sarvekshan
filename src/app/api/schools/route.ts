import { currentUser } from "@/lib/session";
import { q1, tx } from "@/lib/db";
import { schoolInput } from "@/lib/school-input";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in before adding a school." }, { status: 401 });
  if (user.role === "volunteer") return Response.json({ error: "Only coordinators can add schools." }, { status: 403 });
  const parsed = schoolInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const school = parsed.data;

  try {
    // Use the form's stable UUID as the school ID: a retried save cannot add it twice.
    const saved = await tx(async (client) => {
      const { rows: [created] } = await client.query<{ id: string }>(
        `INSERT INTO schools (id,org_id,name,udise_code,village,block,district,state,enrolment,lat,lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [school.client_uuid, user.org_id, school.name, school.udise_code, school.village,
          school.block, school.district, school.state, school.enrolment, school.lat, school.lng]
      );
      if (created) return { id: created.id, created: true };
      const { rows: [existing] } = await client.query<{ id: string }>(
        `SELECT id FROM schools WHERE id=$1 AND org_id=$2`, [school.client_uuid, user.org_id]
      );
      return existing ? { id: existing.id, created: false } : null;
    });
    if (!saved) return Response.json({ error: "Could not save this school. Reload the form and try again." }, { status: 409 });
    return Response.json({ id: saved.id }, { status: saved.created ? 201 : 200 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505" && school.udise_code) {
      const existing = await q1<{ id: string }>(`SELECT id FROM schools WHERE org_id=$1 AND udise_code=$2`, [user.org_id, school.udise_code]);
      if (existing) return Response.json({ error: "A school with this UDISE code is already in your register.", school_id: existing.id }, { status: 409 });
    }
    console.error("School creation failed", error);
    return Response.json({ error: "Could not save the school. Your entries are still here; try again." }, { status: 500 });
  }
}
