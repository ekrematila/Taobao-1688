import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// isolated data dir: the engine reads sources from / stores results under data/media and logs usage in the DB
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "img-engine-"));

const { env } = await import("../server/env.ts");
const { db } = await import("../server/db.ts");
const { mediaPath } = await import("../server/imagestore.ts");
const { openaiEditImage, openaiComposeImages } = await import("../server/openaiImageEngine.ts");

function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

test("OpenAI image edit: reads the source, asks for a source-shaped size, stores the result under /api/media and logs token cost as provider openai", async () => {
  env.openaiKey = "sk-test";
  writeFileSync(mediaPath("src.png"), png(750, 1000));
  const real = globalThis.fetch;
  let form!: FormData;
  globalThis.fetch = (async (_u: any, init: any) => {
    form = init.body as FormData;
    return new Response(
      JSON.stringify({ data: [{ b64_json: Buffer.from("RESULT-BYTES").toString("base64") }], usage: { input_tokens: 1300, output_tokens: 3000, input_tokens_details: { text_tokens: 300, image_tokens: 1000 } } }),
      { status: 200 },
    );
  }) as any;
  try {
    const r = await openaiEditImage({ imageUrl: "/api/media/src.png", instruction: "make the background white", model: "gpt-image-2.5-sunburst", quality: "high", draftId: "d1" });
    assert.equal(r.changed, true);
    assert.match(r.resultUrl!, /^\/api\/media\/[0-9a-f]{24}\.png$/);
    assert.ok(existsSync(mediaPath(r.resultUrl!.slice("/api/media/".length))));
    assert.equal(readFileSync(mediaPath(r.resultUrl!.slice("/api/media/".length))).toString(), "RESULT-BYTES");
    // portrait source -> portrait output, multiple of 16
    const [w, h] = String(form.get("size")).split("x").map(Number);
    assert.ok(h > w && w % 16 === 0 && h % 16 === 0, String(form.get("size")));
    assert.equal(form.get("quality"), "high");
    assert.match(String(form.get("prompt")), /make the background white/);
    const row = db.prepare("SELECT kind, model, provider, input_tokens, output_tokens, cost_usd, draft_id FROM usage_log ORDER BY id DESC LIMIT 1").get() as any;
    assert.deepEqual([row.kind, row.model, row.provider, row.input_tokens, row.output_tokens, row.draft_id], ["edit-image", "gpt-image-2.5-sunburst", "openai", 1300, 3000, "d1"]);
    assert.ok(Math.abs(row.cost_usd - (300 * 5 + 1000 * 8 + 3000 * 30) / 1e6) < 1e-9);
  } finally {
    globalThis.fetch = real;
    env.openaiKey = "";
  }
});

test("OpenAI compose sends every source photo (up to 16) and the xhigh quality is downgraded on models that lack it", async () => {
  env.openaiKey = "sk-test";
  for (let i = 0; i < 3; i++) writeFileSync(mediaPath(`c${i}.png`), png(1000, 1000));
  const real = globalThis.fetch;
  let form!: FormData;
  globalThis.fetch = (async (_u: any, init: any) => {
    form = init.body as FormData;
    return new Response(JSON.stringify({ data: [{ b64_json: "QQ==" }] }), { status: 200 });
  }) as any;
  try {
    await openaiComposeImages({ imageUrls: ["/api/media/c0.png", "/api/media/c1.png", "/api/media/c2.png"], instruction: "lifestyle shot", model: "gpt-image-1.5", quality: "xhigh" });
    assert.equal(form.getAll("image[]").length, 3);
    assert.equal(form.get("quality"), "high", "xhigh only exists on gpt-image-2.5-*");
    assert.equal(form.get("size"), "1024x1024", "old models take the preset closest to the source");
  } finally {
    globalThis.fetch = real;
    env.openaiKey = "";
  }
});

test("OpenAI image jobs refuse to run without a key instead of calling out", async () => {
  env.openaiKey = "";
  await assert.rejects(() => openaiEditImage({ imageUrl: "/api/media/src.png", instruction: "x" }), /anahtar/i);
});
