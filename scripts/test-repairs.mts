import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { repairInput } from "../src/lib/repair-input";
import { RepairError, triageObservation, updateRepair } from "../src/lib/repairs";
import type { SessionUser } from "../src/lib/types";

nextEnv.loadEnvConfig(process.cwd());

test("repair workflow against PostgreSQL (all fixtures rolled back)", async (t) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const org = randomUUID(), otherOrg = randomUUID(), school = randomUUID();
    const coordinator = randomUUID(), performer = randomUUID(), checker = randomUUID(), outsider = randomUUID();
    await c.query(`INSERT INTO orgs (id,name) VALUES ($1,'Repair test'),($2,'Other repair test')`, [org, otherOrg]);
    await c.query(`INSERT INTO schools (id,org_id,name,block) VALUES ($1,$2,'Test school','Test block')`, [school, org]);
    for (const [id, orgId, role, local] of [[coordinator, org, "coordinator", false], [performer, org, "volunteer", true], [checker, org, "volunteer", true], [outsider, otherOrg, "coordinator", false]]) {
      await c.query(`INSERT INTO users (id,org_id,name,phone_hash,role,block,is_local_checker) VALUES ($1,$2,'Test person',$5,$3,'Test block',$4)`, [id, orgId, role, local, id]);
    }
    const user: SessionUser = { id: coordinator, org_id: org, name: "Test", role: "coordinator", block: "Test block", is_local_checker: false };
    const observation = async (facility = "drinking_water") => {
      const id = randomUUID();
      const visit = randomUUID();
      await c.query(`INSERT INTO visits (id,org_id,school_id,by_user_id,client_uuid) VALUES ($1,$2,$3,$4,$1)`, [visit, org, school, performer]);
      await c.query(`INSERT INTO observations (id,org_id,visit_id,school_id,facility_key,state) VALUES ($1,$2,$3,$4,$5,'broken')`, [id, org, visit, school, facility]);
      return id;
    };
    const report = await observation();
    const workId = (await triageObservation(c, user, report, "create_work"))!;
    const { rows: [work] } = await c.query<{ revision: string; today: string }>(`SELECT xmin::text AS revision, current_date::text AS today FROM works WHERE id=$1`, [workId]);
    const input = repairInput.parse({
      revision: work.revision, work_type_key: "water_handpump", status: "planned", description: "Replace seal",
      materials: "Rubber seal", assigned_to_id: performer, performed_by_id: "", target_date: work.today,
      done_on: "", est_cost: "1500.25", actual_cost: "",
    });
    const fails = (status: number) => (error: unknown) => error instanceof RepairError && error.status === status;

    await t.test("retrying triage returns one linked repair", async () => {
      assert.equal(await triageObservation(c, user, report, "create_work"), workId);
      assert.equal((await c.query(`SELECT count(*)::int AS n FROM work_observations WHERE observation_id=$1`, [report])).rows[0].n, 1);
    });
    await t.test("boys' toilet reports use the shared toilet taxonomy", async () => {
      const id = await triageObservation(c, user, await observation("toilet_boys"), "create_work");
      assert.equal((await c.query(`SELECT work_type_key FROM works WHERE id=$1`, [id])).rows[0].work_type_key, "toilet_repair");
    });
    await t.test("dismissed reports stay dismissed on retry", async () => {
      const id = await observation();
      assert.equal(await triageObservation(c, user, id, "dismiss"), null);
      assert.equal(await triageObservation(c, user, id, "create_work"), null);
    });
    await t.test("volunteers and other organisations cannot mutate work or triage reports", async () => {
      await assert.rejects(updateRepair(c, { ...user, role: "volunteer" }, workId, input), fails(403));
      await assert.rejects(updateRepair(c, { ...user, org_id: otherOrg }, workId, input), fails(404));
      await assert.rejects(triageObservation(c, { ...user, role: "volunteer" }, report, "create_work"), fails(403));
      await assert.rejects(triageObservation(c, { ...user, org_id: otherOrg }, report, "create_work"), fails(404));
    });
    await t.test("stale edits, unrelated repair types, outside assignees and future completion dates are rejected", async () => {
      await assert.rejects(updateRepair(c, user, workId, { ...input, revision: "0" }), fails(409));
      await assert.rejects(updateRepair(c, user, workId, { ...input, work_type_key: "paint" }), fails(400));
      await assert.rejects(updateRepair(c, user, workId, { ...input, assigned_to_id: outsider }), fails(400));
      await assert.rejects(updateRepair(c, user, workId, { ...input, status: "done", done_on: "9999-01-01", actual_cost: "0", performed_by_id: performer }), fails(400));
    });
    await t.test("saving the plan and starting work preserve costs without scheduling checks", async () => {
      await updateRepair(c, user, workId, { ...input, status: "in_progress" });
      const row = (await c.query(`SELECT status, est_cost_paise::text, actual_cost_paise FROM works WHERE id=$1`, [workId])).rows[0];
      assert.deepEqual(row, { status: "in_progress", est_cost_paise: "150025", actual_cost_paise: null });
      assert.equal((await c.query(`SELECT count(*)::int AS n FROM checks WHERE work_id=$1`, [workId])).rows[0].n, 0);
    });
    await t.test("completion triggers exactly four dated checks, assigned to someone other than the performer", async () => {
      const complete = { ...input, status: "done" as const, actual_cost: "0", performed_by_id: performer, done_on: work.today };
      await updateRepair(c, user, workId, complete);
      const checks = (await c.query(`SELECT offset_days, due_on-$2::date AS days, assigned_to_id FROM checks WHERE work_id=$1 ORDER BY offset_days`, [workId, work.today])).rows;
      assert.deepEqual(checks.map((check) => check.offset_days), [7, 90, 180, 365]);
      assert.ok(checks.every((check) => check.offset_days === check.days && check.assigned_to_id === checker));
      await assert.rejects(updateRepair(c, user, workId, complete), fails(409));
      assert.equal((await c.query(`SELECT count(*)::int AS n FROM checks WHERE work_id=$1`, [workId])).rows[0].n, 4);
      assert.equal((await c.query(`SELECT state FROM school_facility_state WHERE school_id=$1 AND facility_key='drinking_water'`, [school])).rows[0].state, "broken");
    });
  } finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
  }
});
