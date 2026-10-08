import { test } from "node:test";
import assert from "node:assert/strict";
import { imageCostUsd, imageDimensions, openaiImagePrices, pickImageSize, supportsCustomImageSize, transcribeUsdPerMinute } from "../shared/openaiImages.ts";
import { openaiImageEdit, openaiTranscribe } from "../server/openaiMedia.ts";
import { OpenAIHttpError } from "../server/openai.ts";

function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
function jpeg(w: number, h: number): Uint8Array {
  // SOI, an APP0 segment (length 16), then SOF0 with the size
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof = [0xff, 0xc0, 0x00, 0x11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof]);
}
function webpX(w: number, h: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0]);
  const wm = w - 1;
  const hm = h - 1;
  b.set([wm & 255, (wm >> 8) & 255, (wm >> 16) & 255, hm & 255, (hm >> 8) & 255, (hm >> 16) & 255], 24);
  return b;
}

test("imageDimensions reads PNG / JPEG / WebP sizes straight from the bytes", () => {
  assert.deepEqual(imageDimensions(png(800, 1000)), { w: 800, h: 1000 });
  assert.deepEqual(imageDimensions(jpeg(750, 1000)), { w: 750, h: 1000 });
  assert.deepEqual(imageDimensions(webpX(1200, 630)), { w: 1200, h: 630 });
  assert.equal(imageDimensions(new Uint8Array([1, 2, 3])), null);
});

test("pickImageSize keeps the source aspect, multiples of 16, within the model's limits", () => {
  const ok = (s: string) => {
    const [w, h] = s.split("x").map(Number);
    return w % 16 === 0 && h % 16 === 0 && w * h >= 655_360 && w * h <= 8_294_400 && w / h <= 3 && h / w <= 3;
  };
  for (const [w, h] of [[800, 800], [750, 1000], [1200, 630], [3000, 3000], [400, 300], [100, 900], [4000, 500]]) {
    const s = pickImageSize("gpt-image-2.5-sunburst", w, h);
    assert.ok(ok(s), `${w}x${h} -> ${s}`);
  }
  // a small square photo is lifted just enough to meet the minimum pixel count, not blown up
  assert.equal(pickImageSize("gpt-image-2.5-flare", 800, 800), "816x816");
  // a portrait photo stays portrait
  const [pw, ph] = pickImageSize("gpt-image-2", 750, 1000).split("x").map(Number);
  assert.ok(ph > pw && Math.abs(pw / ph - 0.75) < 0.03);
  // old models only take the three presets
  assert.equal(pickImageSize("gpt-image-1", 750, 1000), "1024x1536");
  assert.equal(pickImageSize("gpt-image-1", 1200, 630), "1536x1024");
  assert.equal(pickImageSize("gpt-image-1-mini", 800, 800), "1024x1024");
  assert.ok(supportsCustomImageSize("gpt-image-2.5-flare") && !supportsCustomImageSize("gpt-image-1.5"));
});

test("image and transcription prices follow the published rates", () => {
  assert.deepEqual(openaiImagePrices("gpt-image-2.5-sunburst"), { textIn: 5, imageIn: 8, imageOut: 30 });
  assert.deepEqual(openaiImagePrices("gpt-image-1-mini"), { textIn: 2, imageIn: 2.5, imageOut: 8 });
  assert.equal(openaiImagePrices("gpt-image-1.5").imageOut, 32);
  assert.equal(openaiImagePrices("gpt-image-1").imageOut, 40);
  // 1k text + 2k image in, 4k image out on gpt-image-2.x = 0.005 + 0.016 + 0.12
  assert.ok(Math.abs(imageCostUsd("gpt-image-2", { textIn: 1000, imageIn: 2000, out: 4000 }) - 0.141) < 1e-9);
  assert.equal(transcribeUsdPerMinute("gpt-transcribe"), 0.0045);
  assert.equal(transcribeUsdPerMinute("gpt-4o-mini-transcribe"), 0.003);
});

function mockFetch(handler: (url: string, init: any) => Response) {
  const real = globalThis.fetch;
  globalThis.fetch = ((url: any, init: any) => Promise.resolve(handler(String(url), init))) as any;
  return () => {
    globalThis.fetch = real;
  };
}

test("openaiImageEdit sends a multipart edit with every source image and reads b64 + token usage", async () => {
  let seen: any;
  const restore = mockFetch((url, init) => {
    seen = { url, auth: init.headers.Authorization, form: init.body as FormData };
    return new Response(
      JSON.stringify({ data: [{ b64_json: "UE5H" }], usage: { input_tokens: 1500, output_tokens: 4000, input_tokens_details: { text_tokens: 500, image_tokens: 1000 } } }),
      { status: 200 },
    );
  });
  try {
    const r = await openaiImageEdit(
      {
        model: "gpt-image-2.5-sunburst",
        prompt: "translate the text",
        images: [{ data: Buffer.from("aaa").toString("base64"), mime: "image/png" }, { data: Buffer.from("bbb").toString("base64"), mime: "image/jpeg" }],
        size: "816x816",
        quality: "high",
      },
      "sk-test",
    );
    assert.match(seen.url, /\/images\/edits$/);
    assert.equal(seen.auth, "Bearer sk-test");
    assert.equal(seen.form.get("model"), "gpt-image-2.5-sunburst");
    assert.equal(seen.form.get("size"), "816x816");
    assert.equal(seen.form.get("quality"), "high");
    assert.equal(seen.form.get("output_format"), "png");
    assert.equal(seen.form.get("input_fidelity"), null, "2.x models reject input_fidelity");
    assert.equal(seen.form.getAll("image[]").length, 2);
    assert.equal(r.b64, "UE5H");
    assert.deepEqual(r.usage, { textIn: 500, imageIn: 1000, out: 4000 });
    assert.ok(Math.abs(r.costUsd - (500 * 5 + 1000 * 8 + 4000 * 30) / 1e6) < 1e-9);
  } finally {
    restore();
  }
});

test("openaiImageEdit sends input_fidelity only to the models that accept it, and explains a moderation block", async () => {
  let fidelity: any = "unset";
  let restore = mockFetch((_u, init) => {
    fidelity = (init.body as FormData).get("input_fidelity");
    return new Response(JSON.stringify({ data: [{ b64_json: "x" }] }), { status: 200 });
  });
  await openaiImageEdit({ model: "gpt-image-1.5", prompt: "p", images: [{ data: "AA", mime: "image/png" }], size: "1024x1024", quality: "auto" }, "k");
  assert.equal(fidelity, "high");
  restore();

  restore = mockFetch(() => new Response(JSON.stringify({ error: { code: "moderation_blocked", message: "blocked" } }), { status: 400 }));
  try {
    await assert.rejects(
      () => openaiImageEdit({ model: "gpt-image-2", prompt: "p", images: [{ data: "AA", mime: "image/png" }], size: "816x816", quality: "auto" }, "k"),
      (e: any) => e instanceof OpenAIHttpError && e.status === 400 && /moderation_blocked/.test(e.message),
    );
  } finally {
    restore();
  }
});

test("openaiTranscribe uploads the file, returns text + cost, and refuses files over 25 MB before calling OpenAI", async () => {
  let seen: any;
  const restore = mockFetch((url, init) => {
    seen = { url, form: init.body as FormData };
    return new Response(JSON.stringify({ text: " 你好 hello ", usage: { type: "duration", seconds: 120 } }), { status: 200 });
  });
  try {
    const r = await openaiTranscribe({ model: "gpt-transcribe", file: Buffer.from("abc"), filename: "v.mp4", mime: "video/mp4" }, "k");
    assert.match(seen.url, /\/audio\/transcriptions$/);
    assert.equal(seen.form.get("model"), "gpt-transcribe");
    assert.equal(seen.form.get("response_format"), "json");
    assert.equal((seen.form.get("file") as File).name, "v.mp4");
    assert.equal(r.text, "你好 hello");
    assert.equal(r.seconds, 120);
    assert.ok(Math.abs(r.costUsd - 2 * 0.0045) < 1e-9);
    assert.equal(r.estimated, false);
    await assert.rejects(
      () => openaiTranscribe({ model: "gpt-transcribe", file: Buffer.alloc(26 * 1024 * 1024), filename: "big.mp4", mime: "video/mp4" }, "k"),
      /25 MB/,
    );
  } finally {
    restore();
  }
});
