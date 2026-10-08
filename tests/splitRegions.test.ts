import { test } from "node:test";
import assert from "node:assert/strict";
import { coverCrop, padRects, splitRegions, type Pixels, type Rect } from "../src/lib/splitRegions.ts";

function canvas(w: number, h: number, bg: [number, number, number] = [255, 255, 255]): Pixels & { data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([bg[0], bg[1], bg[2], 255], i * 4);
  return { data, width: w, height: h };
}
const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
/** a busy "photo": smooth colour waves + per-pixel noise, different for every seed */
function photo(p: Pixels & { data: Uint8ClampedArray }, r: Rect, seed: number) {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = (y * p.width + x) * 4;
      const n = hash(x, y, seed) * 16 - 8; // light sensor noise, like a real photo
      p.data[i] = 120 + 90 * Math.sin(x * 0.05 + seed) + n;
      p.data[i + 1] = 110 + 80 * Math.cos(y * 0.04 + seed * 2) + n;
      p.data[i + 2] = 100 + 70 * Math.sin((x + y) * 0.03 + seed * 3) + n;
    }
}
function solid(p: Pixels & { data: Uint8ClampedArray }, r: Rect, c: [number, number, number]) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) p.data.set([c[0], c[1], c[2], 255], (y * p.width + x) * 4);
}
const near = (a: Rect, b: Rect, tol = 3) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;

test("three photos with thin white gutters and black side bars come apart as three pieces (bars and gutters dropped)", () => {
  const p = canvas(300, 1000, [255, 255, 255]);
  solid(p, { x: 0, y: 0, w: 30, h: 1000 }, [0, 0, 0]); // black bars
  solid(p, { x: 270, y: 0, w: 30, h: 1000 }, [0, 0, 0]);
  const photos: Rect[] = [
    { x: 30, y: 0, w: 240, h: 320 },
    { x: 30, y: 324, w: 240, h: 330 },
    { x: 30, y: 658, w: 240, h: 342 },
  ];
  photos.forEach((r, i) => photo(p, r, i + 1));
  const out = splitRegions(p);
  assert.equal(out.length, 3, JSON.stringify(out));
  photos.forEach((r, i) => assert.ok(near(out[i], r, 3), `piece ${i}: ${JSON.stringify(out[i])} vs ${JSON.stringify(r)}`));
});

test("two different photos butted together with NO gutter are separated at the seam only when seams are switched on", () => {
  const p = canvas(240, 600);
  photo(p, { x: 0, y: 0, w: 240, h: 280 }, 1);
  photo(p, { x: 0, y: 280, w: 240, h: 320 }, 7);
  assert.equal(splitRegions(p).length, 1, "by default only gutters cut — a seam alone could be an edge inside one photo");
  const out = splitRegions(p, { seams: true });
  assert.equal(out.length, 2, JSON.stringify(out));
  assert.ok(Math.abs(out[0].h - 280) <= 2 && Math.abs(out[1].y - 280) <= 2);
  assert.equal(splitRegions(p, { sensitivity: 80, seams: false }).length, 1, "an explicit off wins over high sensitivity");
});

test("slices of ONE continuous photo stay one piece (no false seam)", () => {
  const p = canvas(240, 900);
  photo(p, { x: 0, y: 0, w: 240, h: 900 }, 4); // one photo; the "slice" boundaries are invisible
  const out = splitRegions(p);
  assert.equal(out.length, 1);
  assert.ok(near(out[0], { x: 0, y: 0, w: 240, h: 900 }));
});

test("a 2x2 grid of photos separated by gutters gives four pieces in reading order", () => {
  const p = canvas(500, 500);
  const cells: Rect[] = [
    { x: 0, y: 0, w: 246, h: 246 },
    { x: 254, y: 0, w: 246, h: 246 },
    { x: 0, y: 254, w: 246, h: 246 },
    { x: 254, y: 254, w: 246, h: 246 },
  ];
  cells.forEach((r, i) => photo(p, r, i + 10));
  const out = splitRegions(p);
  assert.equal(out.length, 4);
  cells.forEach((r, i) => assert.ok(near(out[i], r, 3), `cell ${i}: ${JSON.stringify(out[i])}`));
});

test("a product on a plain white backdrop is NOT shredded: the picture stays whole, backdrop included", () => {
  const p = canvas(400, 900);
  // two objects far apart on white, plus rows of small parts — lots of flat rows, but no edge-to-edge picture
  photo(p, { x: 120, y: 100, w: 160, h: 200 }, 2);
  photo(p, { x: 100, y: 560, w: 200, h: 180 }, 3);
  for (let k = 0; k < 4; k++) photo(p, { x: 90 + k * 60, y: 780, w: 40, h: 60 }, 20 + k);
  const out = splitRegions(p);
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.deepEqual([out[0].x, out[0].y, out[0].w, out[0].h], [0, 0, 400, 900]);
});

test("a photo with a smooth dark sky is not cut at the sky (thick outer band, not a frame)", () => {
  const p = canvas(300, 400, [20, 25, 40]);
  for (let y = 0; y < 150; y++) for (let x = 0; x < 300; x++) p.data.set([20 + y * 0.05, 25 + y * 0.05, 40 + y * 0.1, 255], (y * 300 + x) * 4); // smooth gradient sky
  photo(p, { x: 0, y: 150, w: 300, h: 250 }, 8);
  const out = splitRegions(p);
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.deepEqual([out[0].x, out[0].y, out[0].w, out[0].h], [0, 0, 300, 400]);
});

test("letterbox bars (thin dark bars at the border) are trimmed off a full-bleed photo", () => {
  const p = canvas(300, 420, [0, 0, 0]);
  photo(p, { x: 0, y: 30, w: 300, h: 360 }, 9); // 30px black bars top and bottom
  const out = splitRegions(p);
  assert.equal(out.length, 1);
  assert.ok(near(out[0], { x: 0, y: 30, w: 300, h: 360 }, 3), JSON.stringify(out[0]));
});

test("padding hands margin back to a piece without ever swallowing the neighbouring picture", () => {
  const p = canvas(300, 700);
  const a: Rect = { x: 0, y: 0, w: 300, h: 300 };
  const b: Rect = { x: 0, y: 330, w: 300, h: 300 };
  photo(p, a, 2);
  photo(p, b, 3);
  const out = splitRegions(p);
  assert.equal(out.length, 2);
  const padded = padRects(out, 100, p);
  const gap = out[1].y - (out[0].y + out[0].h);
  assert.ok(padded[0].y + padded[0].h <= out[0].y + out[0].h + gap / 2, "each side takes at most half the gap");
  assert.ok(padded[1].y >= out[0].y + out[0].h + gap / 2 - 1);
  assert.ok(padded[0].x >= 0 && padded[1].y + padded[1].h <= p.height, "never off the canvas");
  assert.deepEqual(padRects(out, 0, p).map((r) => [r.x, r.y, r.w, r.h]), out.map((r) => [r.x, r.y, r.w, r.h]));
});

test("a photo above a text banner is split from it; the banner piece is flagged as probably-not-a-picture", () => {
  const p = canvas(300, 700);
  photo(p, { x: 0, y: 0, w: 300, h: 300 }, 5);
  for (let k = 0; k < 4; k++) solid(p, { x: 20, y: 340 + k * 24, w: 200 - k * 30, h: 8 }, [20, 20, 20]); // "text lines"
  photo(p, { x: 0, y: 460, w: 300, h: 240 }, 6);
  const out = splitRegions(p);
  assert.equal(out.length, 3, JSON.stringify(out));
  assert.equal(out[0].suspect, false);
  assert.equal(out[1].suspect, true, "the text zone");
  assert.equal(out[2].suspect, false);
});

test("blank slides are skipped, and the sensitivity knob changes how eagerly it cuts", () => {
  const p = canvas(300, 800);
  photo(p, { x: 0, y: 0, w: 300, h: 250 }, 1);
  solid(p, { x: 0, y: 250, w: 300, h: 300 }, [250, 250, 250]); // a blank near-white slide
  photo(p, { x: 0, y: 550, w: 300, h: 250 }, 2);
  assert.equal(splitRegions(p).length, 2);
});

test("coverCrop cuts a piece to the requested ratio around its detail, staying inside the piece", () => {
  const p = canvas(400, 300);
  photo(p, { x: 250, y: 60, w: 120, h: 180 }, 3); // all the detail sits on the right
  const piece: Rect = { x: 0, y: 0, w: 400, h: 300 };
  const c = coverCrop(p, piece, 3 / 4);
  assert.equal(c.h, 300);
  assert.equal(c.w, 225);
  assert.ok(c.x >= 0 && c.x + c.w <= 400);
  assert.ok(c.x > 150, `crop follows the detail: x=${c.x}`);
  assert.deepEqual(coverCrop(p, { x: 0, y: 0, w: 300, h: 400 }, 3 / 4), { x: 0, y: 0, w: 300, h: 400 }, "already the right ratio");
});
