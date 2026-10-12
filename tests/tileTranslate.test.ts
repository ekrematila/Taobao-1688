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

test("a hard seam between two pictures beats a flat spot inside a picture", async () => {
  const { chooseCuts } = await import("../server/tileTranslate.ts");
  const W = 300, H = 1400;
  // three smooth "photos" (diagonal gradients) meeting at rows 470 and 940; a flat band sits inside the 2nd one at 700
  const gray = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const strip = y < 470 ? 0 : y < 940 ? 1 : 2;
    const base = strip === 0 ? 40 : strip === 1 ? 170 : 90;
    gray[y * W + x] = y >= 690 && y < 720 ? 128 : Math.min(255, base + ((x + y) % 60));
  }
  const cuts = chooseCuts(gray, W, H);
  assert.equal(cuts.length, 2);
  assert.ok(Math.abs(cuts[0] - 470) <= 2 && Math.abs(cuts[1] - 940) <= 2, `cuts ${cuts} sit on the seams 470 / 940`);
});

test("a translated piece that was cropped, zoomed or shifted is rejected; a faithful one passes", async () => {
  const sharp = (await import("sharp")).default;
  const { tileAlignment } = await import("../server/tileTranslate.ts");
  const { persistBuffer, mediaPath } = await import("../server/imagestore.ts");
  const W = 400, H = 600;
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const blob = Math.hypot(x - 120, y - 200) < 70 || Math.hypot(x - 280, y - 420) < 90;
    const v = blob ? 235 : 40 + ((x * 0.3 + y * 0.2) % 60);
    px[i] = v; px[i + 1] = v * 0.8; px[i + 2] = v * 0.6;
  }
  const png = (b: Buffer) => persistBuffer(b, "image/png");
  const src = png(await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer());
  const f = (u: string) => mediaPath(u.slice("/api/media/".length));
  // "translation": same layout + a bit of lettering
  const lettered = png(await sharp(px, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="60" y="40" width="200" height="22" fill="#fff"/></svg>`), left: 0, top: 0 }]).png().toBuffer());
  assert.ok((await tileAlignment(f(src), f(lettered))).ok, "lettering changes alone are fine");
  const zoom = png(await sharp(px, { raw: { width: W, height: H, channels: 3 } }).extract({ left: 50, top: 80, width: 300, height: 450 }).resize(W, H, { fit: "fill" }).png().toBuffer());
  assert.equal((await tileAlignment(f(src), f(zoom))).ok, false, "zoomed/cropped");
  const shifted = png(await sharp(px, { raw: { width: W, height: H, channels: 3 } }).extract({ left: 0, top: 70, width: W, height: H - 70 }).extend({ bottom: 70, background: "#000" }).png().toBuffer());
  assert.equal((await tileAlignment(f(src), f(shifted))).ok, false, "shifted");
});
