import assert from "node:assert/strict";
import test from "node:test";
import {
  generateInvitationCode,
  hashInvitationCode,
  isValidInvitationCode,
  normaliseInvitationCode,
} from "./invitation";

test("invitation codes survive spaces, dashes, and letter case", () => {
  const code = generateInvitationCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(isValidInvitationCode(code.toLowerCase()), true);
  assert.equal(normaliseInvitationCode(` ${code.slice(0, 4)} ${code.slice(5)} `), code.replace("-", ""));
});

test("invitation hashes use the canonical code and reject ambiguous symbols", () => {
  assert.equal(hashInvitationCode("ABCD-EFGH"), hashInvitationCode("abcd efgh"));
  assert.equal(isValidInvitationCode("ABCI-EFGH"), false);
  assert.equal(isValidInvitationCode("ABCO-EFGH"), false);
  assert.equal(isValidInvitationCode("ABC-123"), false);
});
