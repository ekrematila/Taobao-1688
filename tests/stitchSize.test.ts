import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("same-width strips merge pixel-for-pixel: nothing is scaled, heights just add up", async () => {
  const { stitchPlan, canvasFits } = await import("../src/lib/stitch.ts");
  const p = stitchPlan([{ w: 790, h: 600 }, { w: 790, h: 1200 }, { w: 790, h: 300 }], "v", "max");
  assert.deepEqual([p.width, p.height, p.scaled], [790, 2100, false]);
  const q = stitchPlan([{ w: 790, h: 600 }, { w: 395, h: 300 }], "v", "max");
  assert.equal(q.scaled, true);
  assert.deepEqual(q.along, [600, 600]);
  assert.ok(canvasFits(790, 9000));
  assert.ok(!canvasFits(790, 40000));
});

test("an AI result comes back at EXACTLY the source's size (same shape) or at its width (other shape)", async () => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "ps-"));
  const sharp = (await import("sharp")).default;
  const { matchSourceSize, mediaPath, localImageSize } = await import("../server/imagestore.ts");
  const { createHash } = await import("node:crypto");
  const save = async (w: number, h: number) => {
    const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 80 } } }).png().toBuffer();
    const name = createHash("sha1").update(buf).digest("hex").slice(0, 24) + ".png";
    writeFileSync(mediaPath(name), buf);
    return `/api/media/${name}`;
  };
  // the model answered 1520x3040 for a 790x1580 source (multiples of 16 → slightly off, same shape)
  const ai = await save(1520, 3040);
  const out = await matchSourceSize(ai, { w: 790, h: 1580 });
  assert.deepEqual(await localImageSize(out), { w: 790, h: 1580 });
  // a result with a different shape is never stretched: only the width is matched
  const odd = await save(1000, 1000);
  const out2 = await matchSourceSize(odd, { w: 790, h: 1580 });
  assert.deepEqual(await localImageSize(out2), { w: 790, h: 790 });
  // already the right size → untouched
  const same = await save(790, 1580);
  assert.equal(await matchSourceSize(same, { w: 790, h: 1580 }), same);
  assert.ok(readFileSync(mediaPath(out.slice("/api/media/".length))).length > 0);
});

test("a result parked inside flat side bars (Manus 1:3 frame) is cut out and brought back to the source's exact size", async () => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "ps-"));
  const sharp = (await import("sharp")).default;
  const { matchSourceSize, mediaPath, localImageSize, persistDataUrl } = await import("../server/imagestore.ts");
  // a 100x400 "picture" (varied content) centred in a 150x400 black frame → pillarbox
  const W = 100, H = 400;
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; px[i] = (x * 5 + y) % 256; px[i + 1] = (y * 3) % 256; px[i + 2] = 120 + ((x + y) % 100); }
  const pic = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  const framed = await sharp({ create: { width: 150, height: 400, channels: 3, background: "#000" } }).composite([{ input: pic, left: 25, top: 0 }]).png().toBuffer();
  const url = persistDataUrl("data:image/png;base64," + framed.toString("base64"));
  const out = await matchSourceSize(url, { w: 200, h: 800 }); // source ratio 1:4 = the picture's ratio
  assert.deepEqual(await localImageSize(out), { w: 200, h: 800 });
  const { data } = await sharp(mediaPath(out.slice("/api/media/".length))).raw().toBuffer({ resolveWithObject: true });
  const edge = data[0] + data[1] + data[2]; // first pixel is picture content, not black bar
  assert.ok(edge > 30, "the black bar is gone");
});
