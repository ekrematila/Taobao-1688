// Tall pictures lose their detail when an image model sees them in ONE frame: the model answers in a fixed
// frame (Manus: 1:3, OpenAI: ≤ 3:1 and ≤ 3840 px) so a 790×3228 strip comes back at ~two thirds of its
// resolution and the products go soft. The fix is to give the model pieces it can hold at full size:
//   planTiles   → cut rows at the QUIETEST places (flat gutters between pictures, never through text / products)
//   cutTiles    → each piece (with a small overlap above/below) stored as its own picture
//   assembleTiles → the translated pieces are put back with a short cross-fade over the overlaps, giving
//                   EXACTLY the source's width × height.

import { mediaPath, persistBuffer } from "./imagestore.ts";

/** taller than 1 : TALL_RATIO is cut into pieces */
export const TALL_RATIO = 2.2;
/** pixels of shared picture above/below each cut, cross-faded when the pieces are put back */
export const OVERLAP = 24;

export interface Tile {
  /** the piece's own rows: [y0, y1) */
  y0: number;
  y1: number;
  /** the rows actually cut out (own rows + overlap): [top, bottom) */
  top: number;
  bottom: number;
}
export interface TilePlan {
  w: number;
  h: number;
  tiles: Tile[];
}

/** per-row "busyness": horizontal + vertical change. Flat gutters ≈ 0, text and products are high. */
function rowActivity(gray: Uint8Array, W: number, H: number): Float64Array {
  const act = new Float64Array(H);
  const step = Math.max(1, Math.floor(W / 400));
  for (let y = 0; y < H; y++) {
    let s = 0;
    let n = 0;
    for (let x = step; x < W; x += step) {
      s += Math.abs(gray[y * W + x] - gray[y * W + x - step]);
      if (y > 0) s += Math.abs(gray[y * W + x] - gray[(y - 1) * W + x]);
      n++;
    }
    act[y] = s / Math.max(1, n);
  }
  // a cut must be quiet in its NEIGHBOURHOOD too (text sits just above / below a gap)
  const out = new Float64Array(H);
  const R = 6;
  for (let y = 0; y < H; y++) {
    let m = 0;
    for (let k = Math.max(0, y - R); k <= Math.min(H - 1, y + R); k++) if (act[k] > m) m = act[k];
    out[y] = m;
  }
  return out;
}

/**
 * Rows where one picture ends and the next begins: a hard edge across (almost) the WHOLE width, with calm rows on
 * both sides. A photo's own edges never span the full width, text rows are busy on both sides.
 */
export function seamRows(gray: Uint8Array, W: number, H: number): Set<number> {
  const step = Math.max(1, Math.floor(W / 300));
  const frac = new Float64Array(H);
  for (let y = 1; y < H; y++) {
    let hit = 0;
    let n = 0;
    for (let x = 0; x < W; x += step) {
      if (Math.abs(gray[y * W + x] - gray[(y - 1) * W + x]) >= 12) hit++;
      n++;
    }
    frac[y] = hit / Math.max(1, n);
  }
  const out = new Set<number>();
  for (let y = 4; y < H - 4; y++) {
    if (frac[y] >= 0.8 && frac[y - 3] < 0.5 && frac[y + 3] < 0.5) out.add(y);
  }
  return out;
}

/** middle rows of flat runs (gutters between pictures) */
function gutterRows(act: Float64Array): number[] {
  const mids: number[] = [];
  let start = -1;
  for (let y = 0; y <= act.length; y++) {
    const flat = y < act.length && act[y] < 2;
    if (flat && start < 0) start = y;
    if (!flat && start >= 0) {
      if (y - start >= 8) mids.push(Math.round((start + y - 1) / 2));
      start = -1;
    }
  }
  return mids;
}

/**
 * Choose the cut rows for an image `W×H` — pure, testable on raw grayscale.
 * Order of preference: a real SEAM between two pictures → the middle of a flat GUTTER → the quietest row.
 * A cut must never slice through a product or a line of text, so the first two get a wide search window.
 */
export function chooseCuts(gray: Uint8Array, W: number, H: number): number[] {
  const n = Math.max(2, Math.round(H / (W * 1.5)));
  const act = rowActivity(gray, W, H);
  const seams = [...seamRows(gray, W, H)];
  const gutters = gutterRows(act);
  const span = H / n;
  const wide = Math.floor(span * 0.35);
  const win = Math.floor(span * 0.2);
  const cuts: number[] = [];
  for (let k = 1; k < n; k++) {
    const nominal = Math.round(span * k);
    const prev = cuts[cuts.length - 1] ?? 0;
    const lo = Math.max(prev + Math.round(span * 0.5), nominal - wide);
    const hi = Math.min(H - Math.round(span * 0.5), nominal + wide);
    const nearest = (rows: number[]) => rows.filter((y) => y >= lo && y <= hi).sort((x, y) => Math.abs(x - nominal) - Math.abs(y - nominal))[0];
    const hard = nearest(seams) ?? nearest(gutters);
    if (hard !== undefined) {
      cuts.push(hard);
      continue;
    }
    // no seam or gutter in reach → the quietest row near the even split
    const lo2 = Math.max(prev + Math.round(span * 0.5), nominal - win);
    const hi2 = Math.min(H - Math.round(span * 0.5), nominal + win);
    let best = Math.min(Math.max(nominal, lo2), hi2);
    let bestScore = Infinity;
    for (let y = lo2; y <= hi2; y++) {
      const score = act[y] + Math.abs(y - nominal) * 0.002;
      if (score < bestScore) {
        bestScore = score;
        best = y;
      }
    }
    cuts.push(best);
  }
  return cuts;
}

export function plan(W: number, H: number, cuts: number[]): TilePlan {
  const edges = [0, ...cuts, H];
  const tiles: Tile[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const y0 = edges[i];
    const y1 = edges[i + 1];
    tiles.push({ y0, y1, top: i === 0 ? 0 : Math.max(0, y0 - OVERLAP), bottom: i === edges.length - 2 ? H : Math.min(H, y1 + OVERLAP) });
  }
  return { w: W, h: H, tiles };
}

/** null when the picture is not tall enough to need cutting */
export async function planTiles(mediaUrl: string): Promise<TilePlan | null> {
  if (!mediaUrl.startsWith("/api/media/")) return null;
  const file = mediaPath(mediaUrl.slice("/api/media/".length));
  const sharp = (await import("sharp")).default;
  const meta = await sharp(file).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H || H <= W * TALL_RATIO) return null;
  const { data } = await sharp(file).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  return plan(W, H, chooseCuts(data, W, H));
}

/** store each piece as its own picture; returns their `/api/media/...` urls in order */
export async function cutTiles(mediaUrl: string, p: TilePlan): Promise<string[]> {
  const sharp = (await import("sharp")).default;
  const file = mediaPath(mediaUrl.slice("/api/media/".length));
  const out: string[] = [];
  for (const t of p.tiles) {
    const buf = await sharp(file).removeAlpha().extract({ left: 0, top: t.top, width: p.w, height: t.bottom - t.top }).png().toBuffer();
    out.push(persistBuffer(buf, "image/png"));
  }
  return out;
}

/**
 * Put the pieces back. `tileUrls[i]` is piece i at EXACTLY its cut size (a translated piece that was matched to it,
 * or the untouched cut when nothing needed translating). Over each overlap the two neighbours cross-fade, so a
 * slight tone difference between two answers never shows as a line. Returns the stored `/api/media/...` PNG.
 */
export async function assembleTiles(p: TilePlan, tileUrls: string[]): Promise<string> {
  const sharp = (await import("sharp")).default;
  const raws: Buffer[] = [];
  for (let i = 0; i < p.tiles.length; i++) {
    const t = p.tiles[i];
    const h = t.bottom - t.top;
    const file = mediaPath(tileUrls[i].slice("/api/media/".length));
    // flatten onto white, force the exact size (a piece that is off by a pixel must never shift the rows below it)
    const buf = await sharp(file).flatten({ background: "#ffffff" }).removeAlpha().resize(p.w, h, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer();
    raws.push(buf);
  }
  const out = Buffer.alloc(p.w * p.h * 3);
  const rowOf = (k: number, y: number) => raws[k].subarray((y - p.tiles[k].top) * p.w * 3, (y - p.tiles[k].top + 1) * p.w * 3);
  for (let y = 0; y < p.h; y++) {
    // which piece owns this row
    let k = p.tiles.findIndex((t) => y >= t.y0 && y < t.y1);
    if (k < 0) k = p.tiles.length - 1;
    let a = rowOf(k, y);
    let weightB = 0;
    let b: Buffer | null = null;
    const t = p.tiles[k];
    if (k + 1 < p.tiles.length && y >= t.y1 - OVERLAP) {
      b = rowOf(k + 1, y);
      weightB = (y - (t.y1 - OVERLAP) + 0.5) / (2 * OVERLAP);
    } else if (k > 0 && y < t.y0 + OVERLAP) {
      b = a;
      a = rowOf(k - 1, y);
      weightB = (y - (t.y0 - OVERLAP) + 0.5) / (2 * OVERLAP);
    }
    const dst = out.subarray(y * p.w * 3, (y + 1) * p.w * 3);
    if (!b) a.copy(dst);
    else for (let i = 0; i < dst.length; i++) dst[i] = Math.round(a[i] * (1 - weightB) + b[i] * weightB);
  }
  const png = await sharp(out, { raw: { width: p.w, height: p.h, channels: 3 } }).png({ compressionLevel: 6 }).toBuffer();
  return persistBuffer(png, "image/png");
}

/** a small blurred grayscale copy, for comparing "is this the same picture" */
async function lowres(file: string | Buffer, w = 48): Promise<{ data: Uint8Array; w: number; h: number }> {
  const sharp = (await import("sharp")).default;
  const m = await sharp(file).metadata();
  const h = Math.max(8, Math.round((w * (m.height ?? 1)) / (m.width ?? 1)));
  const { data } = await sharp(file).removeAlpha().greyscale().resize(w, h, { fit: "fill", kernel: "lanczos3" }).blur(1).raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), w, h };
}

function pearson(a: Uint8Array, b: Uint8Array, w: number, h: number, shift: number): number {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = 0; y < h; y++) {
    const yb = y + shift;
    if (yb < 0 || yb >= h) continue;
    for (let x = 0; x < w; x++) {
      const va = a[y * w + x];
      const vb = b[yb * w + x];
      n++; sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
    }
  }
  if (n < 8) return 0;
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2;
  const vb = sbb / n - (sb / n) ** 2;
  return cov / Math.sqrt(Math.max(1e-9, va * vb));
}

export interface Alignment {
  /** similarity of the two layouts, same position (≈ 0.99 for a faithful translation) */
  corr: number;
  /** vertical offset (low-res rows) at which they match best */
  shift: number;
  ok: boolean;
}

/**
 * Is the translated piece still the SAME picture — same framing, nothing cropped, zoomed, shifted or re-composed?
 * Translating only changes lettering, so the coarse layout of the two must match. Calibrated on real Manus output:
 * faithful ≈ 0.99, a 12 % zoom/crop ≈ 0.76, a 60 px vertical shift peaks at a non-zero offset.
 */
export async function tileAlignment(srcFile: string | Buffer, resFile: string | Buffer): Promise<Alignment> {
  const a = await lowres(srcFile);
  const b = await lowres(resFile);
  const h = Math.min(a.h, b.h);
  const at0 = pearson(a.data, b.data, a.w, h, 0);
  let best = at0;
  let shift = 0;
  for (const sh of [-3, -2, -1, 1, 2, 3]) {
    const c = pearson(a.data, b.data, a.w, h, sh);
    if (c > best) {
      best = c;
      shift = sh;
    }
  }
  return { corr: at0, shift, ok: at0 >= 0.9 && best - at0 < 0.05 };
}
