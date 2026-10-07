import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// isolated DB so the discovery cache never touches the dev database
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "models-test-"));

const { CLAUDE_MODELS, claudePricing, providerOf, supportsFast, registerDiscovered } = await import("../shared/models.ts");
const { env } = await import("../server/env.ts");
const { modelCatalog } = await import("../server/modelCatalog.ts");

test("the newest Claude releases are in the priced catalogue, newest first, with their real prices", () => {
  const ids = CLAUDE_MODELS.map((m) => m.id);
  assert.ok(ids.includes("claude-opus-5-5") && ids.includes("claude-sonnet-5-5") && ids.includes("claude-fable-5-1"));
  assert.equal(claudePricing("claude-opus-5-5").inPer1M, 4);
  assert.equal(claudePricing("claude-opus-5-5").outPer1M, 20);
  assert.equal(claudePricing("claude-sonnet-5-5").outPer1M, 10);
  assert.ok(ids.indexOf("claude-opus-5-5") < ids.indexOf("claude-opus-5"), "5.5 is listed before 5");
  assert.ok(supportsFast("claude-opus-5-5"), "Opus 5.5 supports fast mode");
  assert.ok(!supportsFast("claude-sonnet-5-5"));
});

test("a gpt-* id the catalogue has never seen still routes to OpenAI and supports fast", () => {
  assert.equal(providerOf("gpt-9.9-sol"), "openai");
  assert.ok(supportsFast("gpt-9.9-sol"));
});

test("registerDiscovered makes a new id priceable and is idempotent", () => {
  const m = { id: "claude-test-9", label: "t", inPer1M: 7, outPer1M: 9, tier: "opus" as const, isNew: true, priceKnown: false };
  registerDiscovered([m]);
  registerDiscovered([m]);
  assert.equal(CLAUDE_MODELS.filter((x) => x.id === "claude-test-9").length, 1);
  assert.equal(claudePricing("claude-test-9").inPer1M, 7);
});

test("live discovery adds only genuinely newer chat models, with a family price estimate", async () => {
  env.openaiKey = "sk-test";
  const real = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: [
          { id: "gpt-6.1-sol", created: 100 }, // known
          { id: "gpt-6.2-sol", created: 200 }, // new
          { id: "gpt-6.3-luna", created: 150 }, // new
          { id: "gpt-6.2-sol-2026-10-01", created: 210 }, // dated snapshot
          { id: "gpt-image-2", created: 220 }, // not a chat model
          { id: "text-embedding-4", created: 230 },
          { id: "gpt-4o", created: 50 }, // old family
          { id: "gpt-5.2-sol", created: 40 }, // older than the newest known model
        ],
      }),
      { status: 200 },
    )) as any;
  try {
    const c = await modelCatalog(true);
    assert.deepEqual(c.discovered, ["gpt-6.2-sol", "gpt-6.3-luna"]);
    const sol = c.models.find((m) => m.id === "gpt-6.2-sol")!;
    assert.equal(sol.isNew, true);
    assert.equal(sol.priceKnown, false);
    assert.equal(sol.inPer1M, 2); // estimated from the newest priced -sol model
    assert.equal(c.models.find((m) => m.id === "gpt-6.3-luna")!.inPer1M, 0.1); // from -luna
    assert.equal(providerOf("gpt-6.2-sol"), "openai");
  } finally {
    globalThis.fetch = real;
    env.openaiKey = "";
  }
});
