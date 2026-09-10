import type { PoolClient } from "pg";
import { editableRepair, type RepairInput } from "./repair-input";
import type { SessionUser, WorkStatus } from "./types";

export class RepairError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Call inside a transaction. The existing database trigger owns all check scheduling. */
export async function updateRepair(c: PoolClient, user: SessionUser, id: string, input: RepairInput) {
  if (user.role === "volunteer") throw new RepairError("Only a coordinator can update repairs.", 403);
  const { rows: [work] } = await c.query<{
    status: WorkStatus; facility_key: string; revision: string; today: string;
  }>(
    `SELECT status, facility_key, xmin::text AS revision, current_date::text AS today
       FROM works WHERE id=$1 AND org_id=$2 FOR UPDATE`, [id, user.org_id]
  );
  if (!work) throw new RepairError("Repair not found.", 404);
  if (!editableRepair(work.status)) throw new RepairError("This repair is already closed. Reload to see its final record.", 409);
  if (work.revision !== input.revision) throw new RepairError("Someone updated this repair. Reload the latest record before saving.", 409);
  if (input.status === "done" && input.done_on! > work.today) throw new RepairError("The completion date cannot be in the future.");

  const { rowCount: validType } = await c.query(
    `SELECT key FROM work_types WHERE key=$1
      AND (facility_key=$2 OR ($2='toilet_boys' AND facility_key='toilet_girls'))`,
    [input.work_type_key, work.facility_key]
  );
  if (!validType) throw new RepairError("Choose a repair type that matches this facility.");
  const people = [...new Set([input.assigned_to_id, input.status === "done" ? input.performed_by_id : null].filter(Boolean))];
  if (people.length) {
    const { rowCount } = await c.query(`SELECT id FROM users WHERE id=ANY($1::uuid[]) AND org_id=$2 AND active FOR SHARE`, [people, user.org_id]);
    if (rowCount !== people.length) throw new RepairError("Choose active team members from your organisation.");
  }

  await c.query(
    `UPDATE works SET work_type_key=$3, description=$4, materials=$5, assigned_to_id=$6,
       target_date=$7, est_cost_paise=$8, actual_cost_paise=$9, performed_by_id=$10,
       performed_by_org_id=$11, done_on=$12, status=$13
     WHERE id=$1 AND org_id=$2`,
    [id, user.org_id, input.work_type_key, input.description || null, input.materials || null,
      input.assigned_to_id, input.target_date, input.est_cost, input.actual_cost,
      input.status === "done" ? input.performed_by_id : null,
      input.status === "done" ? user.org_id : null,
      input.status === "done" ? input.done_on : null, input.status]
  );
}

/** Lock the report so retries or two coordinators cannot create duplicate work. */
export async function triageObservation(c: PoolClient, user: SessionUser, id: string, action: "create_work" | "dismiss") {
  if (user.role === "volunteer") throw new RepairError("Only a coordinator can triage reports.", 403);
  const { rows: [obs] } = await c.query<{
    school_id: string; facility_key: string; note_text: string | null; triaged_at: string | null; state: string;
  }>(`SELECT school_id, facility_key, note_text, triaged_at, state FROM observations WHERE id=$1 AND org_id=$2 FOR UPDATE`, [id, user.org_id]);
  if (!obs) throw new RepairError("Report not found.", 404);
  const { rows: [existing] } = await c.query<{ work_id: string }>(
    `SELECT wo.work_id FROM work_observations wo JOIN works w ON w.id=wo.work_id
      WHERE wo.observation_id=$1 AND w.org_id=$2 ORDER BY w.created_at LIMIT 1`, [id, user.org_id]
  );
  if (existing) return existing.work_id;
  if (obs.triaged_at) return null;
  if (action === "dismiss") {
    await c.query(`UPDATE observations SET triaged_at=now(), dismissed_reason='dismissed at triage' WHERE id=$1`, [id]);
    return null;
  }
  if (obs.state === "working") throw new RepairError("This report describes a working facility.");
  const { rows: [type] } = await c.query<{ key: string }>(
    `SELECT key FROM work_types WHERE facility_key=$1 OR ($1='toilet_boys' AND facility_key='toilet_girls')
      ORDER BY sort_order LIMIT 1`, [obs.facility_key]
  );
  if (!type) throw new RepairError("No repair type is configured for this facility yet.");
  const { rows: [work] } = await c.query<{ id: string }>(
    `INSERT INTO works (org_id, school_id, facility_key, work_type_key, description, status, client_uuid)
     VALUES ($1,$2,$3,$4,$5,'planned',gen_random_uuid()) RETURNING id`,
    [user.org_id, obs.school_id, obs.facility_key, type.key, obs.note_text]
  );
  await c.query(`INSERT INTO work_observations (work_id, observation_id) VALUES ($1,$2)`, [work.id, id]);
  await c.query(`UPDATE observations SET triaged_at=now() WHERE id=$1`, [id]);
  return work.id;
}
