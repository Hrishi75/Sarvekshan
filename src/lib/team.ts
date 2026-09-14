import type { PoolClient } from "pg";
import type { SessionUser, UserRole } from "./types";
import { canManageMember, type TeamInput, type TeamMember, type TeamResult } from "./team-input";
import { generateInvitationCode, hashInvitationCode, INVITATION_TTL_DAYS } from "./invitation";
import { generateTempPassword, hashPassword, hashPhone, phoneHashCandidates } from "./password";

export class TeamError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// Recheck the actor inside the transaction. A stale page is not authority to
// administer accounts after the coordinator has been deactivated or reset.
async function authorise(c: PoolClient, user: SessionUser) {
  if (user.role === "volunteer") throw new TeamError("Only coordinators and admins can manage the team.", 403);
  const { rows: [actor] } = await c.query<{ id: string; role: UserRole; must_change_password: boolean }>(
    `SELECT id, role, must_change_password FROM users
      WHERE id=$1 AND org_id=$2 AND active FOR SHARE`, [user.id, user.org_id]
  );
  if (!actor || actor.role === "volunteer" || actor.must_change_password) {
    throw new TeamError("Sign in with your own password before managing the team.", 403);
  }
  return actor;
}

/** Run inside a transaction. Return only the roster fields the page needs. */
export async function listTeam(c: PoolClient, user: SessionUser): Promise<TeamMember[]> {
  await authorise(c, user);
  const { rows } = await c.query<TeamMember>(
    `SELECT u.id, u.name, u.role, u.block, u.phone_last4, u.is_local_checker, u.active,
            (u.password_hash IS NOT NULL) AS has_password, u.xmin::text AS revision,
            u.invitation_expires_at::text, u.last_login_at::text,
            CASE WHEN NOT u.active THEN 'inactive'
                 WHEN u.password_hash IS NULL THEN
                   CASE WHEN u.invitation_code_hash IS NULL THEN 'not_activated'
                        WHEN u.invitation_expires_at IS NULL OR u.invitation_expires_at <= now() THEN 'expired'
                        WHEN u.invitation_locked_until > now() THEN 'invitation_locked'
                        ELSE 'invited' END
                 WHEN u.locked_until > now() THEN 'locked'
                 WHEN u.must_change_password THEN 'temporary'
                 ELSE 'active' END AS status,
            (SELECT count(*)::int FROM works w WHERE w.org_id=u.org_id AND w.assigned_to_id=u.id
               AND w.status IN ('planned','in_progress')) AS open_repairs,
            (SELECT count(*)::int FROM checks c WHERE c.org_id=u.org_id AND c.assigned_to_id=u.id
               AND c.state IN ('pending','sent')) AS pending_checks
       FROM users u WHERE u.org_id=$1 ORDER BY u.active DESC, lower(u.name), u.id`, [user.org_id]
  );
  return rows;
}

/** Caller supplies a transaction; credentials are returned only after it commits. */
export async function manageTeam(c: PoolClient, user: SessionUser, input: TeamInput): Promise<TeamResult> {
  // Serialise team administration per organisation, including duplicate invites.
  // Take this lock before actor/target locks to keep simultaneous requests ordered.
  await c.query(`SELECT id FROM orgs WHERE id=$1 FOR UPDATE`, [user.org_id]);
  const actor = await authorise(c, user);

  if (input.action === "invite") {
    if (input.role === "coordinator" && actor.role !== "admin") {
      throw new TeamError("Only an admin can invite coordinators.", 403);
    }
    const { rowCount: duplicate } = await c.query(
      `SELECT id FROM users WHERE org_id=$1 AND (phone_hash=ANY($2::text[]) OR id=$3)`,
      [user.org_id, phoneHashCandidates(input.phone), input.client_uuid]
    );
    if (duplicate) throw new TeamError("This person is already in your team. Reload the list to renew their invitation or restore access.", 409);

    const code = generateInvitationCode();
    const { rows: [created] } = await c.query<{ id: string; name: string }>(
      `INSERT INTO users (id, org_id, name, phone_hash, phone_last4, role, block, is_local_checker,
                          invitation_code_hash, invitation_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp() + ($10::int * interval '1 day'))
       ON CONFLICT DO NOTHING RETURNING id, name`,
      [input.client_uuid, user.org_id, input.name, hashPhone(input.phone), input.phone.slice(-4),
        input.role, input.block, input.is_local_checker, hashInvitationCode(code), INVITATION_TTL_DAYS]
    );
    if (!created) throw new TeamError("Could not create this invitation. Reload the list and try again.", 409);
    return { ...created, message: "Invitation created. Share the code directly with this person.", credential: { kind: "invitation", value: code } };
  }

  const { rows: [target] } = await c.query<{
    id: string; name: string; role: UserRole; active: boolean; has_password: boolean; revision: string;
  }>(
    `SELECT id, name, role, active, password_hash IS NOT NULL AS has_password, xmin::text AS revision
       FROM users WHERE id=$1 AND org_id=$2 FOR UPDATE`, [input.id, user.org_id]
  );
  if (!target) throw new TeamError("Team member not found.", 404);
  if (!canManageMember(actor, target)) throw new TeamError("You cannot manage this account. Coordinators manage volunteers; admins also manage coordinators.", 403);
  if (input.revision !== target.revision) throw new TeamError("This account changed. Reload the team list before trying again.", 409);
  if (input.action === "reactivate" ? target.active : !target.active) {
    throw new TeamError(input.action === "reactivate" ? "This account is already active." : "Reactivate this account before changing its access.", 409);
  }

  if (input.action === "deactivate") {
    // Keep attribution and assigned work. Bump the session version so old
    // cookies cannot become valid again if the account is later reactivated.
    await c.query(
      `UPDATE users SET active=false,
         password_set_at=GREATEST(clock_timestamp(), password_set_at + interval '1 microsecond'),
         invitation_code_hash=NULL, invitation_expires_at=NULL,
         invitation_attempts=0, invitation_locked_until=NULL WHERE id=$1 AND org_id=$2`,
      [target.id, user.org_id]
    );
    return { id: target.id, name: target.name, message: "Account deactivated. Existing records and assignments are preserved. Review any open work." };
  }

  if (input.action === "renew" && target.has_password) throw new TeamError("This account is already activated. Use a temporary password for recovery.", 409);
  if (input.action === "recover" && !target.has_password) throw new TeamError("This person has not activated their account. Renew their invitation instead.", 409);

  const useInvitation = !target.has_password;
  const value = useInvitation ? generateInvitationCode() : generateTempPassword();
  await c.query(
    `UPDATE users SET active=true, password_hash=$3,
       password_set_at=GREATEST(clock_timestamp(), password_set_at + interval '1 microsecond'),
       must_change_password=$4, failed_attempts=0, locked_until=NULL,
       invitation_code_hash=$5,
       invitation_expires_at=CASE WHEN $5::text IS NULL THEN NULL
         ELSE clock_timestamp() + ($6::int * interval '1 day') END,
       invitation_attempts=0, invitation_locked_until=NULL
     WHERE id=$1 AND org_id=$2`,
    [target.id, user.org_id, useInvitation ? null : await hashPassword(value), !useInvitation,
      useInvitation ? hashInvitationCode(value) : null, INVITATION_TTL_DAYS]
  );
  return {
    id: target.id, name: target.name,
    message: useInvitation ? "New invitation created. The previous code no longer works." : "Temporary password created. All previous sessions are signed out.",
    credential: { kind: useInvitation ? "invitation" : "password", value },
  };
}
