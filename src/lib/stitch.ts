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

  const crossOf = (d: { w: number; h: number }) => (dir === "v" ? d.w : d.h);
  const crosses = dims.map(crossOf);
  const cross =
    fit === "min" ? Math.min(...crosses) : fit === "first" ? crosses[0] : Math.max(...crosses);

  // per-piece size along the stacking axis, after scaling the cross-axis to `cross`
  const along = dims.map((d) => {
    const k = cross / crossOf(d);
    return Math.max(1, Math.round((dir === "v" ? d.h : d.w) * k));
  });
  const totalAlong = along.reduce((s, n) => s + n, 0);

  // optional downscale so the long edge fits maxEdge
  const longEdge = Math.max(cross, totalAlong);
  const sc = opts.maxEdge && longEdge > opts.maxEdge ? opts.maxEdge / longEdge : 1;

  // integer tiled offsets → seamless
  const offs: number[] = [0];
  for (const a of along) offs.push(offs[offs.length - 1] + Math.max(1, Math.round(a * sc)));
  const crossPx = Math.max(1, Math.round(cross * sc));

  const c = document.createElement("canvas");
  c.width = dir === "v" ? crossPx : offs[offs.length - 1];
  c.height = dir === "v" ? offs[offs.length - 1] : crossPx;
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
