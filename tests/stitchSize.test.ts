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
