import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { hashPhone, legacyHashPhone, normalisePhone, phoneHashCandidates } from "./password";

test("phone numbers use a keyed digest with a legacy migration candidate", () => {
  const previous = process.env.FR_PHONE_PEPPER;
  process.env.FR_PHONE_PEPPER = "test-phone-pepper-with-at-least-32-characters";
  try {
    const phone = "+91 98765 43210";
    const normalised = normalisePhone(phone);
    const unkeyed = createHash("sha256").update(normalised).digest("hex");

    assert.notEqual(hashPhone(phone), unkeyed);
    assert.equal(legacyHashPhone(phone), unkeyed);
    assert.deepEqual(phoneHashCandidates(phone), [hashPhone(phone), unkeyed]);
  } finally {
    if (previous === undefined) delete process.env.FR_PHONE_PEPPER;
    else process.env.FR_PHONE_PEPPER = previous;
  }
});
