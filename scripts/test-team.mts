import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { listTeam, manageTeam, TeamError } from "../src/lib/team";
import { teamInput, type TeamInput } from "../src/lib/team-input";
import { hashInvitationCode } from "../src/lib/invitation";
import { hashPassword, hashPhone, legacyHashPhone, verifyPassword } from "../src/lib/password";
import type { SessionUser, UserRole } from "../src/lib/types";

nextEnv.loadEnvConfig(process.cwd());

test("team administration against PostgreSQL (all fixtures rolled back)", async (t) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  const org = randomUUID(), otherOrg = randomUUID();
  const adminId = randomUUID(), coordinatorId = randomUUID(), peerId = randomUUID();
  const volunteerId = randomUUID(), outsiderId = randomUUID();
  const originalPassword = "original-test-password";
  const fails = (status: number) => (error: unknown) => error instanceof TeamError && error.status === status;
  const actor = (id: string, role: UserRole, orgId = org): SessionUser => ({
    id, role, org_id: orgId, name: "Test actor", block: null, is_local_checker: false,
  });
  const admin = actor(adminId, "admin"), coordinator = actor(coordinatorId, "coordinator");
  const invite = (phone: string, role: "volunteer" | "coordinator" = "volunteer") => teamInput.parse({
    action: "invite", client_uuid: randomUUID(), name: "Invited person", phone,
    role, block: "Rampur", is_local_checker: true,
  });
  const action = async (id: string, kind: "renew" | "recover" | "deactivate" | "reactivate"): Promise<TeamInput> => ({
    action: kind, id, revision: (await c.query(`SELECT xmin::text AS revision FROM users WHERE id=$1`, [id])).rows[0].revision,
  });
  const state = async (id: string) => (await c.query(
    `SELECT active, password_hash, must_change_password, invitation_code_hash,
       invitation_attempts, invitation_locked_until, failed_attempts, locked_until,
       phone_hash, phone_last4, block, is_local_checker,
       (extract(epoch FROM password_set_at)*1000000)::bigint::text AS pv,
       invitation_expires_at > now() AS invitation_valid FROM users WHERE id=$1`, [id]
  )).rows[0];

  try {
    await c.query("BEGIN");
    await c.query(`INSERT INTO orgs (id,name) VALUES ($1,'Team test'),($2,'Other team test')`, [org, otherOrg]);
    const hash = await hashPassword(originalPassword);
    for (const [id, orgId, role] of [
      [adminId, org, "admin"], [coordinatorId, org, "coordinator"], [peerId, org, "coordinator"],
      [volunteerId, org, "volunteer"], [outsiderId, otherOrg, "volunteer"],
    ]) await c.query(
      `INSERT INTO users (id,org_id,name,role,phone_hash,phone_last4,password_hash,password_set_at)
       VALUES ($1,$2,'Test member',$3,$4,'1234',$5,clock_timestamp() - interval '1 day')`,
      [id, orgId, role, id, hash]
    );

    await t.test("rosters are organisation-scoped and omit credentials", async () => {
      const members = await listTeam(c, coordinator);
      assert.equal(members.length, 4);
      assert.ok(members.every((member) => member.id !== outsiderId));
      assert.ok(members.every((member) => !Object.keys(member).some((key) => ["phone_hash", "password_hash", "invitation_code_hash"].includes(key))));
      await assert.rejects(listTeam(c, actor(volunteerId, "volunteer")), fails(403));
      await assert.rejects(listTeam(c, actor(outsiderId, "coordinator")), fails(403));
    });

    let invitedId: string;
    await t.test("coordinators invite volunteers with one-time, expiring codes", async () => {
      const input = invite("9876543210");
      const result = await manageTeam(c, coordinator, input);
      invitedId = result.id;
      const row = await state(result.id);
      assert.equal(row.password_hash, null);
      assert.equal(row.phone_hash, hashPhone("9876543210"));
      assert.equal(row.phone_last4, "3210");
      assert.equal(row.block, "Rampur");
      assert.equal(row.is_local_checker, true);
      assert.equal(row.invitation_valid, true);
      assert.equal(row.invitation_code_hash, hashInvitationCode(result.credential!.value));
      assert.equal(result.credential?.kind, "invitation");
      await assert.rejects(manageTeam(c, coordinator, input), fails(409));
      await assert.rejects(manageTeam(c, coordinator, invite("+91 98765 43210")), fails(409));
    });

    await t.test("legacy phone hashes are checked for duplicate invitations", async () => {
      await c.query(`INSERT INTO users (org_id,name,phone_hash) VALUES ($1,'Legacy',$2)`, [org, legacyHashPhone("9876543211")]);
      await assert.rejects(manageTeam(c, coordinator, invite("9876543211")), fails(409));
    });

    await t.test("only admins can invite or recover coordinator accounts", async () => {
      await assert.rejects(manageTeam(c, coordinator, invite("9876543212", "coordinator")), fails(403));
      assert.ok((await manageTeam(c, admin, invite("9876543212", "coordinator"))).credential);
      await assert.rejects(manageTeam(c, coordinator, await action(peerId, "recover")), fails(403));
      assert.equal((await manageTeam(c, admin, await action(peerId, "recover"))).credential?.kind, "password");
    });

    await t.test("self, admin, volunteer, and cross-organisation mutations are blocked", async () => {
      await assert.rejects(manageTeam(c, coordinator, await action(coordinatorId, "deactivate")), fails(403));
      await assert.rejects(manageTeam(c, coordinator, await action(adminId, "recover")), fails(403));
      await assert.rejects(manageTeam(c, admin, await action(adminId, "deactivate")), fails(403));
      await assert.rejects(manageTeam(c, coordinator, await action(outsiderId, "recover")), fails(404));
      await assert.rejects(manageTeam(c, actor(volunteerId, "volunteer"), invite("9876543213")), fails(403));
      // Even a forged caller role cannot override the row in the database.
      await assert.rejects(manageTeam(c, actor(volunteerId, "admin"), invite("9876543213")), fails(403));
    });

    await t.test("renewal unlocks invitations, invalidates the old code, and refuses activated users", async () => {
      const before = await state(invitedId);
      await c.query(`UPDATE users SET invitation_attempts=5, invitation_locked_until=now()+interval '1 day', invitation_expires_at=now()-interval '1 day' WHERE id=$1`, [invitedId]);
      const result = await manageTeam(c, coordinator, await action(invitedId, "renew"));
      const after = await state(invitedId);
      assert.equal(after.invitation_attempts, 0);
      assert.equal(after.invitation_locked_until, null);
      assert.equal(after.invitation_valid, true);
      assert.notEqual(after.invitation_code_hash, before.invitation_code_hash);
      assert.equal(after.invitation_code_hash, hashInvitationCode(result.credential!.value));
      await assert.rejects(manageTeam(c, coordinator, await action(volunteerId, "renew")), fails(409));
      await assert.rejects(manageTeam(c, coordinator, await action(invitedId, "recover")), fails(409));
    });

    await t.test("recovery forces password change and revokes the old session version", async () => {
      const before = await state(volunteerId);
      await c.query(`UPDATE users SET failed_attempts=5, locked_until=now()+interval '1 day' WHERE id=$1`, [volunteerId]);
      const result = await manageTeam(c, coordinator, await action(volunteerId, "recover"));
      const after = await state(volunteerId);
      assert.equal(result.credential?.kind, "password");
      assert.equal(await verifyPassword(result.credential!.value, after.password_hash), true);
      assert.equal(await verifyPassword(originalPassword, after.password_hash), false);
      assert.equal(after.must_change_password, true);
      assert.ok(BigInt(after.pv) > BigInt(before.pv));
      assert.equal(after.failed_attempts, 0);
      assert.equal(after.locked_until, null);
      assert.equal(after.invitation_code_hash, null);
      assert.equal((await state(outsiderId)).password_hash, hash);
    });

    await t.test("stale actions are rejected before replacing credentials", async () => {
      const before = await state(volunteerId);
      await assert.rejects(manageTeam(c, coordinator, { action: "recover", id: volunteerId, revision: "0" }), fails(409));
      assert.equal((await state(volunteerId)).password_hash, before.password_hash);
    });

    await t.test("deactivation preserves evidence and reactivation never revives old credentials", async () => {
      const school = randomUUID(), visit = randomUUID();
      await c.query(`INSERT INTO schools (id,org_id,name) VALUES ($1,$2,'Team test school')`, [school, org]);
      await c.query(`INSERT INTO visits (id,org_id,school_id,by_user_id,client_uuid) VALUES ($1,$2,$3,$4,$1)`, [visit, org, school, volunteerId]);
      const before = await state(volunteerId);
      await manageTeam(c, coordinator, await action(volunteerId, "deactivate"));
      const disabled = await state(volunteerId);
      assert.equal(disabled.active, false);
      assert.ok(BigInt(disabled.pv) > BigInt(before.pv));
      assert.equal((await c.query(`SELECT by_user_id FROM visits WHERE id=$1`, [visit])).rows[0].by_user_id, volunteerId);
      await assert.rejects(manageTeam(c, coordinator, await action(volunteerId, "recover")), fails(409));
      const result = await manageTeam(c, coordinator, await action(volunteerId, "reactivate"));
      const restored = await state(volunteerId);
      assert.equal(restored.active, true);
      assert.equal(restored.must_change_password, true);
      assert.notEqual(restored.password_hash, before.password_hash);
      assert.ok(BigInt(restored.pv) > BigInt(disabled.pv));
      assert.equal(await verifyPassword(result.credential!.value, restored.password_hash), true);

      await manageTeam(c, coordinator, await action(invitedId, "deactivate"));
      assert.equal((await state(invitedId)).invitation_code_hash, null);
      const invitation = await manageTeam(c, coordinator, await action(invitedId, "reactivate"));
      assert.equal(invitation.credential?.kind, "invitation");
      assert.equal((await state(invitedId)).password_hash, null);
    });

    await t.test("a deactivated or temporary-password actor loses management access", async () => {
      await c.query(`UPDATE users SET must_change_password=true WHERE id=$1`, [coordinatorId]);
      await assert.rejects(manageTeam(c, coordinator, invite("9876543214")), fails(403));
      await c.query(`UPDATE users SET must_change_password=false, active=false WHERE id=$1`, [coordinatorId]);
      await assert.rejects(manageTeam(c, coordinator, invite("9876543214")), fails(403));
      await assert.rejects(listTeam(c, coordinator), fails(403));
    });
  } finally {
    await c.query("ROLLBACK"); c.release(); await pool.end();
  }
});
