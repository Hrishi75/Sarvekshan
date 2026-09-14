import assert from "node:assert/strict";
import { test } from "node:test";
import { schoolInput } from "./school-input";

const school = {
  client_uuid: "ab385038-05d2-4f0d-8851-9c506895d223", name: "  Primary School  ",
  udise_code: "", village: "", block: "", district: "", state: "", enrolment: "", lat: "", lng: "",
};

test("a school only needs a name; unknown values remain unknown", () => {
  const parsed = schoolInput.parse(school);
  assert.equal(parsed.name, "Primary School");
  assert.equal(parsed.enrolment, null);
  assert.equal(parsed.udise_code, null);
  assert.equal(parsed.lat, null);
  assert.equal(parsed.lng, null);
  assert.equal(schoolInput.safeParse({ ...school, name: "   " }).success, false);
});

test("UDISE leading zeros are preserved and pupil counts must be non-negative whole numbers", () => {
  assert.equal(schoolInput.parse({ ...school, udise_code: "00123456789", enrolment: "0" }).udise_code, "00123456789");
  assert.equal(schoolInput.parse({ ...school, enrolment: "0" }).enrolment, 0);
  for (const enrolment of ["-1", "1.5", "1e3", "2147483648", "abc"]) {
    assert.equal(schoolInput.safeParse({ ...school, enrolment }).success, false);
  }
});

test("map coordinates must be a complete, valid pair; zero is a real coordinate", () => {
  assert.equal(schoolInput.parse({ ...school, lat: "0", lng: "0" }).lat, 0);
  for (const coordinates of [{ lat: "26", lng: "" }, { lat: "", lng: "80" }, { lat: "91", lng: "80" }, { lat: "26", lng: "181" }, { lat: "NaN", lng: "80" }]) {
    assert.equal(schoolInput.safeParse({ ...school, ...coordinates }).success, false);
  }
});
