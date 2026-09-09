import { test } from "node:test";
import assert from "node:assert/strict";
import { inpaintBuffer } from "../src/lib/inpaint.worker.ts";

// Build a smooth horizontal gradient, drop an opaque black block in the middle,
// mask the block, and check the inpainter rebuilds the gradient underneath.
test("local inpaint reconstructs the background under a masked block", () => {
  const W = 80;
  const H = 60;
  const rgba = new Uint8ClampedArray(W * H * 4);
  const bg = (x: number, y: number) => {
    // gradient: red follows x, green follows y, blue constant
    return [Math.round((x / W) * 255), Math.round((y / H) * 255), 90];
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const [r, g, b] = bg(x, y);
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }

  const mask = new Uint8Array(W * H);
  const x0 = 30,
    x1 = 50,
    y0 = 20,
    y1 = 40;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * W + x) * 4;
      rgba[o] = rgba[o + 1] = rgba[o + 2] = 0; // black block "on top"
      mask[y * W + x] = 255;
    }
  }

  const out = new Uint8ClampedArray(
    inpaintBuffer({ width: W, height: H, rgba: rgba.buffer, mask: mask.buffer, grain: 0 }),
  );

  // sample a few interior points and compare to the true gradient
  let maxErr = 0;
  for (const [sx, sy] of [
    [35, 25],
    [40, 30],
    [45, 35],
    [33, 38],
  ]) {
    const o = (sy * W + sx) * 4;
    const [tr, tg, tb] = bg(sx, sy);
    const err = Math.max(Math.abs(out[o] - tr), Math.abs(out[o + 1] - tg), Math.abs(out[o + 2] - tb));
    maxErr = Math.max(maxErr, err);
    assert.ok(out[o] > 10 || out[o + 1] > 10, `pixel ${sx},${sy} should not stay black`);
  }
  // SOR harmonic fill reproduces a linear gradient almost exactly
  assert.ok(maxErr < 6, `reconstruction error too high: ${maxErr}`);

  // pixels outside the mask must be untouched
  const o = (5 * W + 5) * 4;
  const [r, g] = bg(5, 5);
  assert.equal(out[o], r);
  assert.equal(out[o + 1], g);
});

// A curved *diagonal* gradient (like an out-of-focus product backdrop) with a
// wide erased block. The old plain-harmonic fill left horizontal smears here;
// the surface-fit fill should just continue the backdrop.
test("wide erase on a curved diagonal backdrop leaves no smear", () => {
  const W = 160;
  const H = 120;
  const rgba = new Uint8ClampedArray(W * H * 4);
  const noise = (x: number, y: number) => (((Math.sin((x * 7.1 + y * 3.7) * 12.9) % 1) + 1) % 1) * 4 - 2;
  const truth = (x: number, y: number) => {
    const base = 120 + 0.55 * x - 0.42 * y + 0.0016 * (x - 80) * (x - 80);
    return [
      Math.max(0, Math.min(255, base)),
      Math.max(0, Math.min(255, base * 0.9 + 12)),
      Math.max(0, Math.min(255, base * 0.7 + 30)),
    ];
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const [r, g, b] = truth(x, y);
      const nz = noise(x, y);
      rgba[o] = Math.round(r + nz);
      rgba[o + 1] = Math.round(g + nz);
      rgba[o + 2] = Math.round(b + nz);
      rgba[o + 3] = 255;
    }
  }
  const mask = new Uint8Array(W * H);
  const mx0 = 44,
    mx1 = 120,
    my0 = 40,
    my1 = 78; // wide, short hole — the shape that used to smear
  for (let y = my0; y < my1; y++) {
    for (let x = mx0; x < mx1; x++) {
      const o = (y * W + x) * 4;
      rgba[o] = rgba[o + 1] = rgba[o + 2] = 200;
      mask[y * W + x] = 255;
    }
  }

  const out = new Uint8ClampedArray(
    inpaintBuffer({ width: W, height: H, rgba: rgba.buffer, mask: mask.buffer, grain: 0 }),
  );

  let maxErr = 0;
  for (let y = my0 + 3; y < my1 - 3; y += 2) {
    for (let x = mx0 + 3; x < mx1 - 3; x += 2) {
      const o = (y * W + x) * 4;
      const [tr, tg, tb] = truth(x, y);
      maxErr = Math.max(
        maxErr,
        Math.abs(out[o] - tr),
        Math.abs(out[o + 1] - tg),
        Math.abs(out[o + 2] - tb),
      );
    }
  }
  // a smear would blow well past this; the surface fit tracks the true backdrop
  assert.ok(maxErr < 10, `reconstruction error too high: ${maxErr}`);
});
