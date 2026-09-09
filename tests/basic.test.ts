import { test } from "node:test";
import assert from "node:assert/strict";
import { ONEBOUND_ENDPOINTS } from "../shared/types.ts";

test("endpoint allow-list is well formed", () => {
  assert.ok(ONEBOUND_ENDPOINTS.length >= 10);
  for (const e of ONEBOUND_ENDPOINTS) {
    assert.equal(typeof e.id, "string");
    assert.ok(["id", "keyword", "none"].includes(e.input));
  }
  assert.ok(ONEBOUND_ENDPOINTS.some((e) => e.seedsWorkspace));
});
