// Classic (no-ML) "detect text / marks inside a rough selection".
// Given a coarse brush mask, shrink it to just the pixels that stand out from
// their local background — overlay text, logos, icons, badges, thin legends.

function boxBlur1D(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 1 : w;
  const lineStep = horizontal ? w : 1;
  const norm = 1 / (r * 2 + 1);
  for (let ln = 0; ln < lines; ln++) {
    const base = ln * lineStep;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[base + step * Math.max(0, Math.min(len - 1, i))];
    for (let i = 0; i < len; i++) {
      dst[base + step * i] = acc * norm;
      const add = base + step * Math.min(len - 1, i + r + 1);
      const sub = base + step * Math.max(0, i - r);
      acc += src[add] - src[sub];
    }
  }
}

/**
 * Refine `maskCanvas` (white = selected) in place: keep only the "marks" inside
 * the current selection, using `plateCanvas` (the photo). `sensitivity` 10..90 —
 * lower = stricter (only strongest text), higher = grabs fainter marks.
 * Returns true if it refined, false if it bailed out (kept the rough mask).
 */
export function refineMaskToMarks(
  plateCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  sensitivity = 45,
): boolean {
  const w = maskCanvas.width;
  const h = maskCanvas.height;
  if (!w || !h) return false;

  const mctx = maskCanvas.getContext("2d")!;
  const mask = mctx.getImageData(0, 0, w, h);
  const md = mask.data;

  // rough selection bbox
  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0,
    roughCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (md[(y * w + x) * 4 + 3] > 40) {
        roughCount++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (roughCount < 20) return false;

  // plate luminance + colour, sampled at mask resolution
  const pc = document.createElement("canvas");
  pc.width = w;
  pc.height = h;
  const pctx = pc.getContext("2d")!;
  pctx.imageSmoothingEnabled = false;
  pctx.drawImage(plateCanvas, 0, 0, w, h);
  const pd = pctx.getImageData(0, 0, w, h).data;

  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * pd[i * 4] + 0.587 * pd[i * 4 + 1] + 0.114 * pd[i * 4 + 2];
  }

  // local background = heavy box blur (radius ~ a few text heights)
  const bboxMin = Math.max(6, Math.min(x1 - x0, y1 - y0));
  const r = Math.max(8, Math.min(Math.round(bboxMin * 0.35), 48));
  const tmp = new Float32Array(w * h);
  const bg = new Float32Array(w * h);
  boxBlur1D(lum, tmp, w, h, r, true);
  boxBlur1D(tmp, bg, w, h, r, false);
  const bgR = new Float32Array(w * h),
    bgG = new Float32Array(w * h),
    bgB = new Float32Array(w * h);
  const chR = new Float32Array(w * h),
    chG = new Float32Array(w * h),
    chB = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    chR[i] = pd[i * 4];
    chG[i] = pd[i * 4 + 1];
    chB[i] = pd[i * 4 + 2];
  }
  boxBlur1D(chR, tmp, w, h, r, true);
  boxBlur1D(tmp, bgR, w, h, r, false);
  boxBlur1D(chG, tmp, w, h, r, true);
  boxBlur1D(tmp, bgG, w, h, r, false);
  boxBlur1D(chB, tmp, w, h, r, true);
  boxBlur1D(tmp, bgB, w, h, r, false);

  const s = Math.max(1, Math.min(sensitivity, 99));
  const tContrast = 70 - s * 0.55; // ~19..64 -> lower sensitivity = higher threshold
  const tColor = 90 - s * 0.7;
  const tGrad = 95 - s * 0.75;

  const keep = new Uint8Array(w * h);
  let kept = 0;
  const at = (x: number, y: number) => y * w + x;
  for (let y = Math.max(1, y0); y <= Math.min(h - 2, y1); y++) {
    for (let x = Math.max(1, x0); x <= Math.min(w - 2, x1); x++) {
      const p = at(x, y);
      if (md[p * 4 + 3] <= 40) continue; // outside the rough selection
      const contrast = Math.abs(lum[p] - bg[p]);
      const colDiff = Math.max(
        Math.abs(pd[p * 4] - bgR[p]),
        Math.abs(pd[p * 4 + 1] - bgG[p]),
        Math.abs(pd[p * 4 + 2] - bgB[p]),
      );
      // Sobel magnitude on luminance
      const gx =
        -lum[at(x - 1, y - 1)] - 2 * lum[at(x - 1, y)] - lum[at(x - 1, y + 1)] +
        lum[at(x + 1, y - 1)] + 2 * lum[at(x + 1, y)] + lum[at(x + 1, y + 1)];
      const gy =
        -lum[at(x - 1, y - 1)] - 2 * lum[at(x, y - 1)] - lum[at(x + 1, y - 1)] +
        lum[at(x - 1, y + 1)] + 2 * lum[at(x, y + 1)] + lum[at(x + 1, y + 1)];
      const grad = Math.sqrt(gx * gx + gy * gy) * 0.25;
      if (contrast > tContrast || colDiff > tColor || grad > tGrad) {
        keep[p] = 1;
        kept++;
      }
    }
  }
  // detection failed (nothing found, or basically everything) -> keep rough mask
  if (kept < 12 || kept > roughCount * 0.92) return false;

  // morphology: dilate to grab halos + fill glyph interiors (close)
  const dilate = (src: Uint8Array, passes: number) => {
    let cur = src;
    for (let k = 0; k < passes; k++) {
      const nxt = Uint8Array.from(cur);
      for (let y = Math.max(1, y0); y <= Math.min(h - 2, y1); y++) {
        for (let x = Math.max(1, x0); x <= Math.min(w - 2, x1); x++) {
          const p = at(x, y);
          if (cur[p]) continue;
          if (cur[p - 1] || cur[p + 1] || cur[p - w] || cur[p + w]) nxt[p] = 1;
        }
      }
      cur = nxt;
    }
    return cur;
  };
  const erode = (src: Uint8Array, passes: number) => {
    let cur = src;
    for (let k = 0; k < passes; k++) {
      const nxt = Uint8Array.from(cur);
      for (let y = Math.max(1, y0); y <= Math.min(h - 2, y1); y++) {
        for (let x = Math.max(1, x0); x <= Math.min(w - 2, x1); x++) {
          const p = at(x, y);
          if (!cur[p]) continue;
          if (!cur[p - 1] || !cur[p + 1] || !cur[p - w] || !cur[p + w]) nxt[p] = 0;
        }
      }
      cur = nxt;
    }
    return cur;
  };
  let refined = dilate(keep, 2);
  refined = erode(dilate(refined, 3), 3); // close
  refined = dilate(refined, 1); // small final halo

  // write back
  for (let i = 0; i < w * h; i++) {
    const on = refined[i] === 1;
    md[i * 4] = md[i * 4 + 1] = md[i * 4 + 2] = 255;
    md[i * 4 + 3] = on ? 255 : 0;
  }
  mctx.putImageData(mask, 0, 0);
  return true;
}
