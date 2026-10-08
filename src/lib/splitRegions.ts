// Finds the separate PICTURES inside one long / merged image, without ML.
//
// Taobao description strips are one tall image sliced into pieces, and a "merged" strip
// holds several different shots stacked together with thin white lines, black side bars,
// text banners… This cuts such an image back into the individual pictures:
//   - flat bands  : rows/columns that are one flat colour (white gutters, black bars,
//                   plain studio backdrops) are cut away;
//   - hard seams  : a row where the picture changes abruptly across (nearly) the whole
//                   width is a cut even when there's no gutter (two photos butted together);
//   - recursion   : XY-cut — split by rows, then each part by columns, and so on, so grids
//                   and mixed layouts work;
//   - continuity  : slices of ONE photo have no seam, so they come out as one piece.
// Pure functions on RGBA pixel data (no DOM) so they are unit-testable.

export interface Pixels {
  data: ArrayLike<number>; // RGBA
  width: number;
  height: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Piece extends Rect {
  /** share of the piece covered by its single most common colour (0..1) */
  flatShare: number;
  /** probably a text banner / blank slide rather than a picture */
  suspect: boolean;
}
export interface SplitOptions {
  /** 0..100 (default 50): higher = cuts more eagerly; from 65 up it also cuts hard seams with no gutter */
  sensitivity?: number;
  /** smallest piece side as a fraction of the image's shorter side (default 0.1) */
  minPiece?: number;
}

type Axis = "rows" | "cols";

const MAX_PIECES = 60;

function lumAt(d: ArrayLike<number>, i: number): number {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

interface Profile {
  mean: Float32Array; // per line: mean luminance
  std: Float32Array; // per line: luminance std across the line
  grad: Float32Array; // per line: mean |pixel-to-pixel| luminance change along the line (a gutter has ~none)
  diff: Float32Array; // per line: mean abs colour diff against the previous line (0 for the first)
  frac: Float32Array; // per line: share of samples that differ strongly from the previous line
}

/** Per-line statistics of `r` along `axis` (a "line" is a row for axis=rows, a column for axis=cols). */
function profile(img: Pixels, r: Rect, axis: Axis): Profile {
  const { data, width } = img;
  const lines = axis === "rows" ? r.h : r.w;
  const across = axis === "rows" ? r.w : r.h;
  const step = Math.max(1, Math.floor(across / 320));
  const mean = new Float32Array(lines);
  const std = new Float32Array(lines);
  const grad = new Float32Array(lines);
  const diff = new Float32Array(lines);
  const frac = new Float32Array(lines);
  const px = (line: number, k: number) => {
    const x = axis === "rows" ? r.x + k : r.x + line;
    const y = axis === "rows" ? r.y + line : r.y + k;
    return (y * width + x) * 4;
  };
  for (let l = 0; l < lines; l++) {
    let s = 0;
    let s2 = 0;
    let n = 0;
    let dsum = 0;
    let strong = 0;
    let g = 0;
    for (let k = 0; k < across; k += step) {
      const i = px(l, k);
      const v = lumAt(data, i);
      s += v;
      s2 += v * v;
      n++;
      if (k + 1 < across) g += Math.abs(v - lumAt(data, px(l, k + 1)));
      if (l > 0) {
        const j = px(l - 1, k);
        const d = (Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2])) / 3;
        dsum += d;
        if (d > 28) strong++;
      }
    }
    const m = s / n;
    mean[l] = m;
    std[l] = Math.sqrt(Math.max(0, s2 / n - m * m));
    grad[l] = g / n;
    if (l > 0) {
      diff[l] = dsum / n;
      frac[l] = strong / n;
    }
  }
  return { mean, std, grad, diff, frac };
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0;
}

/**
 * Share of columns (for axis=rows; rows for axis=cols) that carry real content in the lines
 * [from, to) next to a cut: content = differs from the band colour `against` (a gutter), or,
 * when there is no band (`against` null, a hard seam), simply isn't flat across those lines.
 * A picture that runs edge to edge scores ~1; a product sitting on a plain backdrop scores low.
 */
function sideCoverage(img: Pixels, r: Rect, axis: Axis, from: number, to: number, against: number | null): number {
  const lines = axis === "rows" ? r.h : r.w;
  const across = axis === "rows" ? r.w : r.h;
  from = Math.max(0, from);
  to = Math.min(lines, to);
  if (to - from < 1) return 0;
  const step = Math.max(1, Math.floor(across / 200));
  let hit = 0;
  let n = 0;
  let leftHit = false;
  let rightHit = false;
  for (let k = 0; k < across; k += step) {
    let mn = 255;
    let mx = 0;
    let sum = 0;
    for (let l = from; l < to; l++) {
      const x = axis === "rows" ? r.x + k : r.x + l;
      const y = axis === "rows" ? r.y + l : r.y + k;
      const v = lumAt(img.data, (y * img.width + x) * 4);
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      sum += v;
    }
    const content = against == null ? mx - mn > 5 : Math.abs(sum / (to - from) - against) > 24 || mx - mn > 24;
    if (content) {
      hit++;
      if (k < across * 0.04) leftHit = true;
      if (k >= across * 0.96 - step) rightHit = true;
    }
    n++;
  }
  // a row of small parts or a product with white margins never touches both borders — not a picture
  if (!leftHit || !rightHit) return 0;
  return n ? hit / n : 0;
}

/**
 * Cut `r` along `axis`. Returns the surviving segments (flat bands removed, seams split);
 * a single segment equal to `r` means "nothing to cut here".
 *
 * Deliberately conservative — a product sitting on a plain white backdrop, or a photo with a
 * smooth sky, must NOT be shredded just because some rows are flat:
 *   - a band only counts if it is uniform AND at least one side is a picture that runs edge to
 *     edge (a gutter between pictures), and it isn't a big chunk of the picture itself;
 *   - bands on the outer border are trimmed only when they look like a frame: dark bars up to
 *     12 %, thin light lines up to 3 %;
 *   - a hard seam (only at high sensitivity) needs edge-to-edge content on BOTH sides.
 */
function cutAxis(img: Pixels, r: Rect, axis: Axis, sens: number, minLen: number): Rect[] {
  const lines = axis === "rows" ? r.h : r.w;
  const cross = axis === "rows" ? r.w : r.h;
  if (lines < minLen * 2) return [r]; // can't hold two real pieces — cutting further would only shred it
  const p = profile(img, r, axis);

  const flatThr = 1.5 + 3.5 * (sens / 100); // luminance std below this = a flat line (gutters are solid; smooth photo areas aren't)
  // a seam is a SPIKE in line-to-line difference relative to its surroundings (absolute levels
  // differ wildly between photos, so compare against the local baseline, not a fixed number)
  const seamMinDiff = 14 - 6 * (sens / 100);
  const seamScore = 3.2 - 1.4 * (sens / 100);
  const minBand = Math.max(2, Math.round(cross * 0.002));
  const SIDE = 6; // lines inspected on each side of a cut
  const COVER = 0.8;

  const gradThr = 0.6 + 2.4 * (sens / 100);
  const pureStd = 0.8 + 2.2 * (sens / 100);
  const pureGrad = 0.4 + 1.6 * (sens / 100);
  const flat = Array.from(p.std, (v, l) => v < flatThr && p.grad[l] < gradThr);
  const cuts: [number, number][] = [];
  for (let i = 0; i < lines; ) {
    if (!flat[i]) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < lines && flat[j] && Math.abs(p.mean[j] - p.mean[j - 1]) <= 10) j++;
    if (j - i >= minBand) {
      const thick = j - i;
      let lo = Infinity;
      let hi = -Infinity;
      let sum = 0;
      for (let k = i; k < j; k++) {
        lo = Math.min(lo, p.mean[k]);
        hi = Math.max(hi, p.mean[k]);
        sum += p.mean[k];
      }
      const bandLum = sum / thick;
      const gutterColour = bandLum > 225 || bandLum < 45;
      const outerBand = i === 0 || j === lines;
      // a real gutter is SOLID (only compression noise); the smooth part of a photo (sky, water,
      // a studio backdrop) always has a little more texture — outer frame bars may be looser
      let solid = true;
      for (let k = i; k < j && solid; k++) if (p.std[k] >= pureStd || p.grad[k] >= pureGrad) solid = false;
      // …but a hairline between two full pictures (a 1–3 px white border, often blurred by
      // scaling or JPEG) only has to be flat, as long as BOTH neighbours run edge to edge
      const hairline = thick <= Math.max(6, 0.01 * cross);
      if (hi - lo <= 10 && gutterColour) {
        const before = i > 0 ? sideCoverage(img, r, axis, i - SIDE, i, bandLum) : -1;
        const after = j < lines ? sideCoverage(img, r, axis, j, j + SIDE, bandLum) : -1;
        let ok: boolean;
        if (outerBand) {
          const dark = bandLum < 60;
          ok = thick <= (dark ? 0.12 : 0.03) * cross && Math.max(before, after) >= COVER;
        } else if (hairline && before >= COVER && after >= COVER) {
          ok = true;
        } else if (solid) {
          ok = (thick <= 0.2 * cross && Math.max(before, after) >= COVER) || (before >= COVER && after >= COVER);
        } else {
          ok = false;
        }
        if (ok) cuts.push([i, j]);
      }
    }
    i = j;
  }
  // Hard seams (two pictures butted with no gutter) are opt-in via a high sensitivity: a strong
  // edge across a single photo (horizon, table edge) looks the same, so by default only gutters cut.
  for (let i = 1; sens >= 65 && i < lines; i++) {
    if (flat[i] || flat[i - 1]) continue;
    const around: number[] = [];
    for (let k = Math.max(1, i - 6); k <= Math.min(lines - 1, i + 6); k++) if (k !== i) around.push(p.diff[k]);
    const base = median(around);
    if (p.diff[i] >= seamMinDiff && p.frac[i] >= 0.1 && p.diff[i] / (base + 2) >= seamScore) {
      if (sideCoverage(img, r, axis, i - SIDE, i, null) >= 0.85 && sideCoverage(img, r, axis, i, i + SIDE, null) >= 0.85) cuts.push([i, i]);
    }
  }
  if (!cuts.length) return [r];
  cuts.sort((a, b) => a[0] - b[0]);

  // A cut that leaves a sliver thinner than the smallest piece (a caption, a text line, a bit of
  // noise) would only shred the picture: undo the weaker of the two cuts around it so the
  // sliver rejoins its neighbour. Slivers that are themselves flat (a bar) are fine — they get
  // dropped later.
  for (let pass = 0; pass < 8; pass++) {
    let at = 0;
    let undo = -1;
    for (let k = 0; k <= cuts.length && undo < 0; k++) {
      const a = at;
      const b = k < cuts.length ? cuts[k][0] : lines;
      if (k < cuts.length) at = Math.max(at, cuts[k][1]);
      const len = b - a;
      if (len <= 0 || len >= minLen) continue;
      let flatN = 0;
      for (let l = a; l < b; l++) if (flat[l]) flatN++;
      if (flatN / len >= 0.8) continue;
      const left = k - 1 >= 0 ? k - 1 : -1;
      const right = k < cuts.length ? k : -1;
      undo = left < 0 ? right : right < 0 ? left : cuts[left][1] - cuts[left][0] < cuts[right][1] - cuts[right][0] ? left : right;
    }
    if (undo < 0) break;
    cuts.splice(undo, 1);
  }
  if (!cuts.length) return [r];

  const segs: Rect[] = [];
  let at = 0;
  const push = (s: number, e: number) => {
    if (e - s < 1) return;
    segs.push(axis === "rows" ? { x: r.x, y: r.y + s, w: r.w, h: e - s } : { x: r.x + s, y: r.y, w: e - s, h: r.h });
  };
  for (const [s, e] of cuts) {
    push(at, s);
    at = Math.max(at, e);
  }
  push(at, lines);
  return segs;
}

function sameRect(a: Rect, b: Rect) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function xyCut(img: Pixels, r: Rect, sens: number, minLen: number, depth: number, out: Rect[]) {
  if (out.length > MAX_PIECES * 3) return;
  if (depth < 10) {
    for (const axis of ["cols", "rows"] as Axis[]) {
      const segs = cutAxis(img, r, axis, sens, minLen);
      if (segs.length !== 1 || !sameRect(segs[0], r)) {
        for (const s of segs) xyCut(img, s, sens, minLen, depth + 1, out);
        return;
      }
    }
  }
  out.push(r);
}

/**
 * Share of `r` that is (nearly) one colour: find the most common colour (5-bit bins), then
 * count every pixel within ±12 per channel of it. Tolerance matters: a dark photo has all its
 * pixels in a couple of coarse bins yet is full of detail — counting exact bins would call it blank.
 */
function flatShareOf(img: Pixels, r: Rect): number {
  const bins = new Map<number, number>();
  const step = Math.max(1, Math.floor(Math.sqrt((r.w * r.h) / 20000)));
  const samples: number[] = [];
  for (let y = r.y; y < r.y + r.h; y += step)
    for (let x = r.x; x < r.x + r.w; x += step) {
      const i = (y * img.width + x) * 4;
      samples.push(i);
      const key = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
      bins.set(key, (bins.get(key) ?? 0) + 1);
    }
  if (!samples.length) return 1;
  let bestKey = 0;
  let best = -1;
  for (const [k, v] of bins) if (v > best) (best = v), (bestKey = k);
  const cr = ((bestKey >> 10) << 3) + 4;
  const cg = (((bestKey >> 5) & 31) << 3) + 4;
  const cb = ((bestKey & 31) << 3) + 4;
  let near = 0;
  for (const i of samples) if (Math.abs(img.data[i] - cr) <= 12 && Math.abs(img.data[i + 1] - cg) <= 12 && Math.abs(img.data[i + 2] - cb) <= 12) near++;
  return near / samples.length;
}

/**
 * Split an image into the separate pictures it contains. Pieces are returned in reading
 * order; tiny ones and flat blanks are dropped.
 */
export function splitRegions(img: Pixels, opts: SplitOptions = {}): Piece[] {
  const sens = Math.max(0, Math.min(100, opts.sensitivity ?? 50));
  const minFrac = Math.max(0.02, Math.min(0.5, opts.minPiece ?? 0.1));
  const minSide = Math.max(24, Math.round(minFrac * Math.min(img.width, img.height)));
  const leaves: Rect[] = [];
  xyCut(img, { x: 0, y: 0, w: img.width, h: img.height }, sens, minSide, 0, leaves);
  const pieces: Piece[] = [];
  for (const r of leaves) {
    if (r.w < minSide || r.h < minSide) continue;
    const flatShare = flatShareOf(img, r);
    if (flatShare > 0.97) continue; // an empty slide
    pieces.push({ ...r, flatShare, suspect: flatShare > 0.75 });
  }
  pieces.sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) / 2 ? a.y - b.y : a.x - b.x));
  return pieces.slice(0, MAX_PIECES);
}

/**
 * Grow each rect by `pad` px on every side, but never past halfway into the gap to a
 * neighbouring piece (so padding can't swallow the next picture) or off the canvas.
 */
export function padRects<T extends Rect>(rects: T[], pad: number, canvas: { width: number; height: number }): T[] {
  if (pad <= 0) return rects.map((r) => ({ ...r }));
  return rects.map((r, i) => {
    let left = pad;
    let right = pad;
    let top = pad;
    let bottom = pad;
    left = Math.min(left, r.x);
    top = Math.min(top, r.y);
    right = Math.min(right, canvas.width - (r.x + r.w));
    bottom = Math.min(bottom, canvas.height - (r.y + r.h));
    rects.forEach((o, j) => {
      if (i === j) return;
      const overlapY = o.y < r.y + r.h && o.y + o.h > r.y;
      const overlapX = o.x < r.x + r.w && o.x + o.w > r.x;
      if (overlapY && o.x + o.w <= r.x) left = Math.min(left, Math.max(0, Math.floor((r.x - (o.x + o.w)) / 2)));
      if (overlapY && o.x >= r.x + r.w) right = Math.min(right, Math.max(0, Math.floor((o.x - (r.x + r.w)) / 2)));
      if (overlapX && o.y + o.h <= r.y) top = Math.min(top, Math.max(0, Math.floor((r.y - (o.y + o.h)) / 2)));
      if (overlapX && o.y >= r.y + r.h) bottom = Math.min(bottom, Math.max(0, Math.floor((o.y - (r.y + r.h)) / 2)));
    });
    return { ...r, x: r.x - left, y: r.y - top, w: r.w + left + right, h: r.h + top + bottom };
  });
}

/**
 * Crop `r` to aspect ratio `ratio` (w/h), keeping the part with the most detail (the
 * product, not the empty backdrop): the crop window is centred on the piece's
 * gradient-energy centroid, clamped inside the piece.
 */
export function coverCrop(img: Pixels, r: Rect, ratio: number): Rect {
  let w = r.w;
  let h = r.h;
  if (w / h > ratio) w = Math.round(h * ratio);
  else h = Math.round(w / ratio);
  if (w === r.w && h === r.h) return { ...r };
  const step = Math.max(1, Math.floor(Math.sqrt((r.w * r.h) / 40000)));
  let sx = 0;
  let sy = 0;
  let sum = 0;
  for (let y = r.y + step; y < r.y + r.h - step; y += step)
    for (let x = r.x + step; x < r.x + r.w - step; x += step) {
      const i = (y * img.width + x) * 4;
      const gx = Math.abs(lumAt(img.data, i + 4 * step) - lumAt(img.data, i - 4 * step));
      const gy = Math.abs(lumAt(img.data, i + 4 * step * img.width) - lumAt(img.data, i - 4 * step * img.width));
      const e = gx + gy;
      sx += e * x;
      sy += e * y;
      sum += e;
    }
  const cx = sum > 0 ? sx / sum : r.x + r.w / 2;
  const cy = sum > 0 ? sy / sum : r.y + r.h / 2;
  const x = Math.round(Math.max(r.x, Math.min(r.x + r.w - w, cx - w / 2)));
  const y = Math.round(Math.max(r.y, Math.min(r.y + r.h - h, cy - h / 2)));
  return { x, y, w, h };
}
