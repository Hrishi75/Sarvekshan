import assert from "node:assert/strict";
import test from "node:test";
import { isSameOriginRequest } from "./request-origin";

test("origin checks use the browser-facing host, including port and proxy protocol", () => {
  assert.equal(isSameOriginRequest(new Request("http://localhost:3111/api/team", {
    headers: { host: "127.0.0.1:3111", origin: "http://127.0.0.1:3111" },
  })), true);
  assert.equal(isSameOriginRequest(new Request("http://internal:3000/api/team", {
    headers: { host: "internal:3000", "x-forwarded-host": "schools.example", "x-forwarded-proto": "https", origin: "https://schools.example" },
  })), true);
});

test("missing, malformed, cross-origin, and downgraded origins fail closed", () => {
  for (const origin of ["", "null", "not a url", "https://other.example", "https://schools.example:8443", "http://schools.example", "https://schools.example/path", "https://user@schools.example"]) {
    assert.equal(isSameOriginRequest(new Request("http://internal:3000/api/team", {
      headers: { host: "internal:3000", "x-forwarded-host": "schools.example", "x-forwarded-proto": "https", origin },
    })), false, origin);
  }
});
