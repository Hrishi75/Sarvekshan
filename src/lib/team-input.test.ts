import assert from "node:assert/strict";
import test from "node:test";
import { canManageMember, teamInput } from "./team-input";

const invite = {
  action: "invite", client_uuid: "184b318f-91ed-4f02-9bf4-f64ade725fd5", name: " Anita ",
  phone: "+91 98765 43210", role: "volunteer", block: " ", is_local_checker: true,
};

test("team invitations normalise phone numbers and leave unknown blocks empty", () => {
  const result = teamInput.parse(invite);
  assert.equal(result.action, "invite");
  if (result.action !== "invite") return;
  assert.equal(result.name, "Anita");
  assert.equal(result.phone, "9876543210");
  assert.equal(result.block, null);
  for (const phone of ["9876543210", "91-98765-43210", "+91 (98765) 43210"]) {
    assert.equal(teamInput.safeParse({ ...invite, phone }).success, true);
  }
});

test("invitation payloads cannot grant admin access or choose another organisation", () => {
  for (const change of [
    { role: "admin" }, { org_id: invite.client_uuid }, { must_change_password: false },
    { phone: "91919876543210" }, { phone: "letters9876543210" }, { name: " " },
    { is_local_checker: "false" }, { client_uuid: "invalid" },
  ]) assert.equal(teamInput.safeParse({ ...invite, ...change }).success, false);
  assert.equal(teamInput.safeParse({ action: "deactivate", id: invite.client_uuid, revision: "0" }).success, true);
  assert.equal(teamInput.safeParse({ action: "deactivate", id: invite.client_uuid }).success, false);
});

test("team permission policy protects peers, admins, and the current account", () => {
  const coordinator = { id: "coordinator", role: "coordinator" as const };
  const admin = { id: "admin", role: "admin" as const };
  const volunteer = { id: "volunteer", role: "volunteer" as const };
  assert.equal(canManageMember(coordinator, volunteer), true);
  assert.equal(canManageMember(admin, coordinator), true);
  assert.equal(canManageMember(coordinator, { ...coordinator, id: "peer" }), false);
  assert.equal(canManageMember(volunteer, coordinator), false);
  assert.equal(canManageMember(admin, { ...admin, id: "another-admin" }), false);
  assert.equal(canManageMember(coordinator, coordinator), false);
});
