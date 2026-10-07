import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeManusProfile, MANUS_PROFILES } from "../shared/models.ts";

// Manus 2.0: the API takes stable agent_profile values and ignores any version
// segment, so the app speaks those values and maps everything older onto them.
test("normalizeManusProfile maps legacy / versioned spellings onto the stable profiles", () => {
  assert.equal(normalizeManusProfile("manus-1.6"), "standard");
  assert.equal(normalizeManusProfile("manus-1.6-lite"), "lite");
  assert.equal(normalizeManusProfile("manus-1.6-max"), "max");
  assert.equal(normalizeManusProfile("2.0-max-ultra"), "max-ultra");
  assert.equal(normalizeManusProfile("manus-2.0"), "standard");
  assert.equal(normalizeManusProfile("  Standard "), "standard");
  for (const p of MANUS_PROFILES) assert.equal(normalizeManusProfile(p), p);
});

test("normalizeManusProfile rejects junk instead of sending it to Manus", () => {
  assert.equal(normalizeManusProfile(""), undefined);
  assert.equal(normalizeManusProfile(undefined), undefined);
  assert.equal(normalizeManusProfile("manus-1.6-turbo"), undefined);
  assert.equal(normalizeManusProfile("max-insane"), undefined);
});

test("all seven documented profiles are offered", () => {
  assert.deepEqual([...MANUS_PROFILES], ["standard", "lite", "max", "max-medium", "max-high", "max-extra", "max-ultra"]);
});
