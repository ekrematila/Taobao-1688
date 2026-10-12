import { loadImage } from "./image";

export type StitchDir = "v" | "h";
/** How to normalise the cross-axis (width for vertical, height for horizontal). */
export type StitchFit = "max" | "min" | "first";

export interface StitchOpts {
  dir?: StitchDir;
  fit?: StitchFit;
  /** cap the long edge of the result (px); the whole canvas is scaled to fit */
  maxEdge?: number;
}

export interface StitchPlan {
  /** size of the merged picture (px) at full resolution */
  width: number;
  height: number;
  /** per-piece size along the stacking axis after the cross-axis match */
  along: number[];
  /** some source had to be scaled to the common width/height (a source already at that size is never touched) */
  scaled: boolean;
}

/** Pure layout: where each piece goes and how big the merged picture is — no drawing. */
export function stitchPlan(dims: { w: number; h: number }[], dir: StitchDir = "v", fit: StitchFit = "max"): StitchPlan {
  const crossOf = (d: { w: number; h: number }) => (dir === "v" ? d.w : d.h);
  const crosses = dims.map(crossOf);
  const cross = fit === "min" ? Math.min(...crosses) : fit === "first" ? crosses[0] : Math.max(...crosses);
  const along = dims.map((d) => Math.max(1, Math.round((dir === "v" ? d.h : d.w) * (cross / crossOf(d)))));
  const total = along.reduce((s, n) => s + n, 0);
  return { width: dir === "v" ? cross : total, height: dir === "v" ? total : cross, along, scaled: crosses.some((c) => c !== cross) };
}

/** a browser canvas can't be arbitrarily large (Chrome ≈ 65 535 px a side, ≈ 268 MP; Safari far less) */
export const CANVAS_MAX_SIDE = 32_000;
export const CANVAS_MAX_AREA = 150_000_000;
export const canvasFits = (w: number, h: number) => w <= CANVAS_MAX_SIDE && h <= CANVAS_MAX_SIDE && w * h <= CANVAS_MAX_AREA;

/**
 * Stitch N images into ONE, edge-to-edge with NO gap. Vertical stacks top→bottom
 * (Taobao description strips); horizontal places left→right. Every piece is
 * scaled so the cross-axis matches (`fit`), and offsets are integer-tiled so
 * there is never a seam line or a 1px gap.
 */
export async function stitchImages(urls: string[], opts: StitchOpts = {}): Promise<HTMLCanvasElement> {
  const dir = opts.dir ?? "v";
  const fit = opts.fit ?? "max";
  if (!urls.length) throw new Error("Birleştirmek için en az 1 görsel gerekli.");

  const imgs = await Promise.all(urls.map((u) => loadImage(u.split("#dup-")[0])));
  const dims = imgs.map((im) => ({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height }));

  const plan = stitchPlan(dims, dir, fit);
  const along = plan.along;
  const cross = dir === "v" ? plan.width : plan.height;
  const totalAlong = dir === "v" ? plan.height : plan.width;

  // optional downscale so the long edge fits maxEdge
  const longEdge = Math.max(cross, totalAlong);
  const sc = opts.maxEdge && longEdge > opts.maxEdge ? opts.maxEdge / longEdge : 1;

  // integer tiled offsets → seamless
  const offs: number[] = [0];
  for (const a of along) offs.push(offs[offs.length - 1] + Math.max(1, Math.round(a * sc)));
  const crossPx = Math.max(1, Math.round(cross * sc));

  const cw = dir === "v" ? crossPx : offs[offs.length - 1];
  const ch = dir === "v" ? offs[offs.length - 1] : crossPx;
  if (!canvasFits(cw, ch)) throw new Error(`Birleşik görsel ${cw}×${ch} px — tarayıcı sınırını aşıyor. Daha az görsel birleştir.`);
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (let i = 0; i < imgs.length; i++) {
    const a0 = offs[i];
    const a1 = offs[i + 1];
    if (dir === "v") ctx.drawImage(imgs[i], 0, a0, crossPx, a1 - a0);
    else ctx.drawImage(imgs[i], a0, 0, a1 - a0, crossPx);
  }
  return c;
}
