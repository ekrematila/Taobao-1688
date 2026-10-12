import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "ps-"));

/** a tall picture: busy "text/photo" bands separated by flat gutters at known rows */
function tallImage(W: number, H: number, gutters: number[], gutterH = 30) {
  const px = Buffer.alloc(W * H * 3, 255);
  const inGutter = (y: number) => gutters.some((g) => y >= g && y < g + gutterH);
  for (let y = 0; y < H; y++) {
    if (inGutter(y)) continue;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const v = ((x * 7 + y * 13) ^ (x * y)) & 255; // noisy → "busy"
      px[i] = v; px[i + 1] = (v * 3) & 255; px[i + 2] = 255 - v;
    }
  }
  return px;
}

test("cuts fall in the flat gutters, never through the busy parts", async () => {
  const { chooseCuts } = await import("../server/tileTranslate.ts");
  const W = 300, H = 1300;
  const px = tallImage(W, H, [430, 880]);
  const gray = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) gray[i] = Math.round((px[i * 3] + px[i * 3 + 1] + px[i * 3 + 2]) / 3);
  const cuts = chooseCuts(gray, W, H);
  assert.equal(cuts.length, 2);
  for (const c of cuts) assert.ok([430, 880].some((g) => c >= g + 6 && c < g + 30 - 6), `cut ${c} is inside a gutter`);
});

test("a picture that is not tall is left alone", async () => {
  const sharp = (await import("sharp")).default;
  const { planTiles } = await import("../server/tileTranslate.ts");
  const { persistBuffer } = await import("../server/imagestore.ts");
  const url = persistBuffer(await sharp({ create: { width: 400, height: 600, channels: 3, background: "#888" } }).png().toBuffer(), "image/png");
  assert.equal(await planTiles(url), null);
});

test("cut → (untouched) → assemble gives back the same picture, exact size, no seams", async () => {
  const sharp = (await import("sharp")).default;
  const { planTiles, cutTiles, assembleTiles } = await import("../server/tileTranslate.ts");
  const { persistBuffer, localImageSize, mediaPath } = await import("../server/imagestore.ts");
  const W = 300, H = 1300;
  const px = tallImage(W, H, [430, 880]);
  const url = persistBuffer(await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), "image/png");
  const plan = await planTiles(url);
  assert.ok(plan && plan.tiles.length === 3);
  const tiles = await cutTiles(url, plan!);
  const back = await assembleTiles(plan!, tiles);
  assert.deepEqual(await localImageSize(back), { w: W, h: H });
  const a = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).raw().toBuffer();
  const b = await sharp(mediaPath(back.slice("/api/media/".length))).removeAlpha().raw().toBuffer();
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
  assert.equal(diff, 0, "identical tiles cross-fade to the identical picture");
});

test("two tiles with different tones blend smoothly over the overlap instead of showing a line", async () => {
  const sharp = (await import("sharp")).default;
  const { plan, assembleTiles, OVERLAP } = await import("../server/tileTranslate.ts");
  const { persistBuffer, mediaPath } = await import("../server/imagestore.ts");
  const W = 50, H = 400, cut = 200;
  const p = plan(W, H, [cut]);
  const solid = async (h: number, v: number) => persistBuffer(await sharp({ create: { width: W, height: h, channels: 3, background: { r: v, g: v, b: v } } }).png().toBuffer(), "image/png");
  const top = await solid(p.tiles[0].bottom - p.tiles[0].top, 100);
  const bottom = await solid(p.tiles[1].bottom - p.tiles[1].top, 120);
  const out = await assembleTiles(p, [top, bottom]);
  const raw = await sharp(mediaPath(out.slice("/api/media/".length))).removeAlpha().raw().toBuffer();
  const at = (y: number) => raw[(y * W) * 3];
  assert.equal(at(cut - OVERLAP - 2), 100);
  assert.equal(at(cut + OVERLAP + 2), 120);
  let maxStep = 0;
  for (let y = cut - OVERLAP; y < cut + OVERLAP; y++) maxStep = Math.max(maxStep, Math.abs(at(y + 1) - at(y)));
  assert.ok(maxStep <= 2, `the 20-level tone gap is spread over ${2 * OVERLAP} rows (max step ${maxStep})`);
});
