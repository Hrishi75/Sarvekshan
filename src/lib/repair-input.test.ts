import assert from "node:assert/strict";
import { test } from "node:test";
import { repairInput } from "./repair-input";

const plan = {
  revision: "123", work_type_key: "water_handpump", status: "planned",
  description: "", materials: "", assigned_to_id: "", performed_by_id: "",
  target_date: "", done_on: "", est_cost: "", actual_cost: "",
};

test("money preserves paise, distinguishes unknown from zero, and rejects malformed amounts", () => {
  for (const [input, expected] of [["", null], ["0", "0"], ["12.29", "1229"], [" 500.5 ", "50050"]]) {
    assert.equal(repairInput.parse({ ...plan, actual_cost: input }).actual_cost, expected);
  }
  for (const amount of ["-1", "1.234", "1e4", "NaN", "Infinity", "999999999999999999999"]) {
    assert.equal(repairInput.safeParse({ ...plan, actual_cost: amount }).success, false, amount);
  }
});

test("starting needs an owner; completing needs performer, date, and actual cost", () => {
  assert.equal(repairInput.safeParse({ ...plan, status: "in_progress" }).success, false);
  const complete = { ...plan, status: "done", actual_cost: "0", done_on: "2026-09-09", performed_by_id: "ab385038-05d2-4f0d-8851-9c506895d223" };
  assert.equal(repairInput.safeParse(complete).success, true);
  for (const key of ["actual_cost", "done_on", "performed_by_id"]) {
    assert.equal(repairInput.safeParse({ ...complete, [key]: "" }).success, false, key);
  }
});

test("invalid dates, unknown statuses, and oversized notes are rejected", () => {
  for (const change of [{ target_date: "2026-02-30" }, { status: "cancelled" }, { description: "a".repeat(2001) }, { assigned_to_id: "someone" }]) {
    assert.equal(repairInput.safeParse({ ...plan, ...change }).success, false);
  }
});
