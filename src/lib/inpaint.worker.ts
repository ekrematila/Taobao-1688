/// <reference lib="webworker" />
// Fully local generative-style erase: a Telea-style Fast Marching Method
// inpainter. No network, no model, no API — runs entirely in this worker.

const KNOWN = 0;
const BAND = 1;
const INSIDE = 2;
const INF = 1e6;

interface InpaintMsg {
  width: number;
  height: number;
  rgba: ArrayBuffer; // Uint8ClampedArray of the source image
  mask: ArrayBuffer; // Uint8Array, 255 = erase / reconstruct, 0 = keep
  radius?: number; // sample window radius (px)
  grain?: number; // 0..1 synthetic noise fallback (kept tiny by default)
  dilate?: number; // px to grow the mask (covers anti-aliased object edges)
  texture?: boolean; // copy real high-frequency detail from the best-matching area
}

/* --------------------------------- min-heap -------------------------------- */
class Heap {
  private t: Float64Array;
  private v: Int32Array;
  private n = 0;
  constructor(cap: number) {
    this.t = new Float64Array(cap);
    this.v = new Int32Array(cap);
  }
  push(t: number, v: number) {
    if (this.n >= this.t.length) {
      const nt = new Float64Array(this.t.length * 2);
      const nv = new Int32Array(this.v.length * 2);
      nt.set(this.t);
      nv.set(this.v);
      this.t = nt;
      this.v = nv;
    }
    let i = this.n++;
    this.t[i] = t;
    this.v[i] = v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.t[p] <= this.t[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.v[0];
    this.n--;
    if (this.n > 0) {
      this.t[0] = this.t[this.n];
      this.v[0] = this.v[this.n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < this.n && this.t[l] < this.t[s]) s = l;
        if (r < this.n && this.t[r] < this.t[s]) s = r;
        if (s === i) break;
        this.swap(i, s);
        i = s;
      }
    }
    return top;
  }
  get size() {
    return this.n;
  }
  private swap(a: number, b: number) {
    const tt = this.t[a];
    this.t[a] = this.t[b];
    this.t[b] = tt;
    const vv = this.v[a];
    this.v[a] = this.v[b];
    this.v[b] = vv;
  }
}

export function inpaintBuffer(msg: InpaintMsg): ArrayBuffer {
  const { width: W, height: H } = msg;
  const img = new Uint8ClampedArray(msg.rgba);
  const mask = new Uint8Array(msg.mask);
  const R = Math.max(3, Math.min(msg.radius ?? 5, 8));
  const grain = Math.max(0, Math.min(msg.grain ?? 0.03, 1));
  const dilate = Math.max(0, Math.min(msg.dilate ?? 2, 12));
  const wantTexture = msg.texture !== false;
  const N = W * H;

  const idx = (x: number, y: number) => y * W + x;
  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  // grow the mask a little so anti-aliased object edges are fully covered
  if (dilate > 0) {
    for (let pass = 0; pass < dilate; pass++) {
      const add: number[] = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = idx(x, y);
          if (mask[p] > 127) continue;
          if (
            (inB(x - 1, y) && mask[idx(x - 1, y)] > 127) ||
            (inB(x + 1, y) && mask[idx(x + 1, y)] > 127) ||
            (inB(x, y - 1) && mask[idx(x, y - 1)] > 127) ||
            (inB(x, y + 1) && mask[idx(x, y + 1)] > 127)
          )
            add.push(p);
        }
      }
      for (const p of add) mask[p] = 255;
    }
  }

  const flags = new Uint8Array(N);
  const T = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (mask[i] > 127) {
      flags[i] = INSIDE;
      T[i] = INF;
    } else {
      flags[i] = KNOWN;
      T[i] = 0;
    }
  }

  const heap = new Heap(Math.max(1024, Math.floor(N * 0.1)));
  // narrow band = INSIDE pixels touching a KNOWN pixel
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = idx(x, y);
      if (flags[p] !== INSIDE) continue;
      if (
        (inB(x - 1, y) && flags[idx(x - 1, y)] === KNOWN) ||
        (inB(x + 1, y) && flags[idx(x + 1, y)] === KNOWN) ||
        (inB(x, y - 1) && flags[idx(x, y - 1)] === KNOWN) ||
        (inB(x, y + 1) && flags[idx(x, y + 1)] === KNOWN)
      ) {
        flags[p] = BAND;
        T[p] = 0;
        heap.push(0, p);
      }
    }
  }

  const solve = (x1: number, y1: number, x2: number, y2: number): number => {
    let sol = INF;
    const p1 = inB(x1, y1) ? idx(x1, y1) : -1;
    const p2 = inB(x2, y2) ? idx(x2, y2) : -1;
    const k1 = p1 >= 0 && flags[p1] !== INSIDE;
    const k2 = p2 >= 0 && flags[p2] !== INSIDE;
    if (k1 && k2) {
      const t1 = T[p1];
      const t2 = T[p2];
      const d = 2 - (t1 - t2) * (t1 - t2);
      if (d > 0) {
        const r = Math.sqrt(d);
        let s = (t1 + t2 - r) / 2;
        if (s >= t1 && s >= t2) sol = s;
        else {
          s = (t1 + t2 + r) / 2;
          if (s >= t1 && s >= t2) sol = s;
          else sol = 1 + Math.min(t1, t2);
        }
      } else sol = 1 + Math.min(t1, t2);
    } else if (k1) sol = 1 + T[p1];
    else if (k2) sol = 1 + T[p2];
    return sol;
  };

  const gradT = (x: number, y: number): [number, number] => {
    const px = inB(x + 1, y) ? idx(x + 1, y) : -1;
    const mx = inB(x - 1, y) ? idx(x - 1, y) : -1;
    const py = inB(x, y + 1) ? idx(x, y + 1) : -1;
    const my = inB(x, y - 1) ? idx(x, y - 1) : -1;
    let gx = 0;
    let gy = 0;
    if (px >= 0 && mx >= 0 && flags[px] !== INSIDE && flags[mx] !== INSIDE) gx = (T[px] - T[mx]) * 0.5;
    else if (px >= 0 && flags[px] !== INSIDE) gx = T[px] - T[idx(x, y)];
    else if (mx >= 0 && flags[mx] !== INSIDE) gx = T[idx(x, y)] - T[mx];
    if (py >= 0 && my >= 0 && flags[py] !== INSIDE && flags[my] !== INSIDE) gy = (T[py] - T[my]) * 0.5;
    else if (py >= 0 && flags[py] !== INSIDE) gy = T[py] - T[idx(x, y)];
    else if (my >= 0 && flags[my] !== INSIDE) gy = T[idx(x, y)] - T[my];
    return [gx, gy];
  };

  // Telea colour estimate for a band pixel: weighted average of nearby KNOWN
  // pixels (directional * geometric-distance * level-set-distance weighting).
  const paint = (x: number, y: number) => {
    const [gx, gy] = gradT(x, y);
    const tHere = T[idx(x, y)];
    let r = 0;
    let g = 0;
    let b = 0;
    let wsum = 0;
    for (let dy = -R; dy <= R; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      for (let dx = -R; dx <= R; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= W) continue;
        const dist2 = dx * dx + dy * dy;
        if (dist2 === 0 || dist2 > R * R) continue;
        const q = idx(nx, ny);
        if (flags[q] === INSIDE) continue;
        const len = Math.sqrt(dist2);
        let dir = Math.abs((dx * gx + dy * gy) / len);
        if (dir < 1e-6) dir = 1e-6;
        const dst = 1 / dist2;
        const lev = 1 / (1 + Math.abs(T[q] - tHere));
        const w = dir * dst * lev;
        const o = q * 4;
        r += w * img[o];
        g += w * img[o + 1];
        b += w * img[o + 2];
        wsum += w;
      }
    }
    const o = idx(x, y) * 4;
    if (wsum > 0) {
      img[o] = r / wsum;
      img[o + 1] = g / wsum;
      img[o + 2] = b / wsum;
      img[o + 3] = 255;
    }
  };

  const maskedList: number[] = [];
  for (let i = 0; i < N; i++) if (mask[i] > 127) maskedList.push(i);

  let guard = N * 4;
  while (heap.size > 0 && guard-- > 0) {
    const p = heap.pop();
    if (flags[p] === KNOWN) continue; // stale entry
    flags[p] = KNOWN;
    const x = p % W;
    const y = (p / W) | 0;
    const nb = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of nb) {
      if (!inB(nx, ny)) continue;
      const q = idx(nx, ny);
      if (flags[q] === KNOWN) continue;
      if (flags[q] === INSIDE) {
        flags[q] = BAND;
        paint(nx, ny);
      }
      const tq = Math.min(
        solve(nx - 1, ny, nx, ny - 1),
        solve(nx + 1, ny, nx, ny - 1),
        solve(nx - 1, ny, nx, ny + 1),
        solve(nx + 1, ny, nx, ny + 1),
      );
      T[q] = tq;
      heap.push(tq, q);
    }
  }

  // ---- structural fill --------------------------------------------------
  // The FMM seed above smears on wide holes over a graded background. Instead,
  // fit a low-order surface  P(x,y) = a + b·u + c·v + d·u² + e·v² + f·uv  to the
  // ring of real pixels around the hole (per channel, least squares), then solve
  // Laplace only on the RESIDUAL  (img − P)  inside the hole. For a smooth /
  // graded background the boundary residual is ~0, so the hole is filled with the
  // fitted surface itself — the background simply "continues", no streaks. For a
  // curved or textured background the residual membrane carries the low-freq
  // correction. This replaces the old plain-harmonic membrane.
  let bx0 = W,
    by0 = H,
    bx1 = 0,
    by1 = 0;
  for (const p of maskedList) {
    const x = p % W;
    const y = (p / W) | 0;
    if (x < bx0) bx0 = x;
    if (x > bx1) bx1 = x;
    if (y < by0) by0 = y;
    if (y > by1) by1 = y;
  }
  const bw = bx1 - bx0 + 1;
  const bh = by1 - by0 + 1;
  const cX = (bx0 + bx1) / 2;
  const cY = (by0 + by1) / 2;
  const nX = 2 / Math.max(1, bw);
  const nY = 2 / Math.max(1, bh);

  // boundary band = KNOWN pixels within `band` px of the hole (grow the mask)
  const band = Math.max(4, Math.min(Math.round(Math.min(bw, bh) * 0.6), 26));
  const bandPix: number[] = [];
  {
    const grow = new Uint8Array(N);
    for (const p of maskedList) grow[p] = 1;
    const gx0 = Math.max(1, bx0 - band - 1);
    const gx1 = Math.min(W - 2, bx1 + band + 1);
    const gy0 = Math.max(1, by0 - band - 1);
    const gy1 = Math.min(H - 2, by1 + band + 1);
    for (let pass = 0; pass < band; pass++) {
      const add: number[] = [];
      for (let y = gy0; y <= gy1; y++) {
        for (let x = gx0; x <= gx1; x++) {
          const p = idx(x, y);
          if (grow[p]) continue;
          if (grow[p - 1] || grow[p + 1] || grow[p - W] || grow[p + W]) add.push(p);
        }
      }
      for (const p of add) grow[p] = 1;
    }
    for (let y = Math.max(0, by0 - band); y <= Math.min(H - 1, by1 + band); y++) {
      for (let x = Math.max(0, bx0 - band); x <= Math.min(W - 1, bx1 + band); x++) {
        const p = idx(x, y);
        if (grow[p] && mask[p] <= 127) bandPix.push(p);
      }
    }
  }

  // surface degree from how much boundary evidence we have
  const M = bandPix.length >= 24 ? 6 : bandPix.length >= 10 ? 3 : 1;
  const basis = (u: number, v: number, f: Float64Array) => {
    f[0] = 1;
    if (M >= 3) {
      f[1] = u;
      f[2] = v;
    }
    if (M >= 6) {
      f[3] = u * u;
      f[4] = v * v;
      f[5] = u * v;
    }
  };
  const coef: Float64Array[] = [new Float64Array(M), new Float64Array(M), new Float64Array(M)];
  {
    const A = new Float64Array(M * M);
    const rhsC: Float64Array[] = [new Float64Array(M), new Float64Array(M), new Float64Array(M)];
    const f = new Float64Array(M);
    for (const p of bandPix) {
      const x = p % W;
      const y = (p / W) | 0;
      basis((x - cX) * nX, (y - cY) * nY, f);
      const o = p << 2;
      for (let i = 0; i < M; i++) {
        for (let j = 0; j < M; j++) A[i * M + j] += f[i] * f[j];
        rhsC[0][i] += f[i] * img[o];
        rhsC[1][i] += f[i] * img[o + 1];
        rhsC[2][i] += f[i] * img[o + 2];
      }
    }
    let maxDiag = 1e-9;
    for (let i = 0; i < M; i++) if (A[i * M + i] > maxDiag) maxDiag = A[i * M + i];
    for (let i = 0; i < M; i++) A[i * M + i] += 1e-4 * maxDiag + 1e-6; // ridge
    for (let c = 0; c < 3; c++) {
      const m = A.slice();
      const r = rhsC[c].slice();
      for (let col = 0; col < M; col++) {
        let piv = col;
        for (let rr = col + 1; rr < M; rr++)
          if (Math.abs(m[rr * M + col]) > Math.abs(m[piv * M + col])) piv = rr;
        if (piv !== col) {
          for (let k = 0; k < M; k++) {
            const t = m[col * M + k];
            m[col * M + k] = m[piv * M + k];
            m[piv * M + k] = t;
          }
          const t = r[col];
          r[col] = r[piv];
          r[piv] = t;
        }
        const d = m[col * M + col] || 1e-9;
        for (let rr = 0; rr < M; rr++) {
          if (rr === col) continue;
          const fac = m[rr * M + col] / d;
          if (!fac) continue;
          for (let k = 0; k < M; k++) m[rr * M + k] -= fac * m[col * M + k];
          r[rr] -= fac * r[col];
        }
      }
      for (let i = 0; i < M; i++) coef[c][i] = r[i] / (m[i * M + i] || 1e-9);
    }
  }

  // rasterise P over the hole bbox + 1px margin (covers every masked px + nbrs)
  const rx0 = Math.max(0, bx0 - 1);
  const rx1 = Math.min(W - 1, bx1 + 1);
  const ry0 = Math.max(0, by0 - 1);
  const ry1 = Math.min(H - 1, by1 + 1);
  const rW = rx1 - rx0 + 1;
  const polyReg = new Float32Array(rW * (ry1 - ry0 + 1) * 3);
  {
    const f = new Float64Array(M);
    for (let y = ry0; y <= ry1; y++) {
      for (let x = rx0; x <= rx1; x++) {
        basis((x - cX) * nX, (y - cY) * nY, f);
        const ri = ((y - ry0) * rW + (x - rx0)) * 3;
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let i = 0; i < M; i++) s += coef[c][i] * f[i];
          polyReg[ri + c] = s;
        }
      }
    }
  }
  const polyAt = (p: number, c: number): number => {
    const x = p % W;
    const y = (p / W) | 0;
    return polyReg[((y - ry0) * rW + (x - rx0)) * 3 + c];
  };

  // residual membrane: Laplace(u)=0 in the hole, u = img−P on the boundary
  {
    const omega = 1.9;
    const maxIters = 800;
    const u = new Float32Array(maskedList.length * 3); // residual, init 0
    const at = new Int32Array(N).fill(-1);
    for (let m = 0; m < maskedList.length; m++) at[maskedList[m]] = m;
    const uval = (p: number, c: number): number =>
      at[p] >= 0 ? u[at[p] * 3 + c] : img[(p << 2) + c] - polyAt(p, c);
    for (let it = 0; it < maxIters; it++) {
      let maxDelta = 0;
      for (let m = 0; m < maskedList.length; m++) {
        const p = maskedList[m];
        const x = p % W;
        const y = (p / W) | 0;
        const pU = y > 0 ? p - W : p;
        const pD = y < H - 1 ? p + W : p;
        const pL = x > 0 ? p - 1 : p;
        const pR = x < W - 1 ? p + 1 : p;
        for (let c = 0; c < 3; c++) {
          const avg = (uval(pU, c) + uval(pD, c) + uval(pL, c) + uval(pR, c)) * 0.25;
          const cur = u[m * 3 + c];
          const next = cur + omega * (avg - cur);
          const d = Math.abs(next - cur);
          if (d > maxDelta) maxDelta = d;
          u[m * 3 + c] = next;
        }
      }
      if (maxDelta < 0.02) break;
    }
    for (let m = 0; m < maskedList.length; m++) {
      const p = maskedList[m];
      const o = p << 2;
      for (let c = 0; c < 3; c++) {
        const vv = polyAt(p, c) + u[m * 3 + c];
        img[o + c] = vv < 0 ? 0 : vv > 255 ? 255 : vv;
      }
      img[o + 3] = 255;
    }
  }

  // how textured is the surrounding background? (mean |detail| on the band)
  let hfSum = 0;
  let hfN = 0;
  for (let bi = 0; bi < bandPix.length; bi += 2) {
    const p = bandPix[bi];
    const x = p % W;
    const y = (p / W) | 0;
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
    const o = p << 2;
    const lc = 0.299 * img[o] + 0.587 * img[o + 1] + 0.114 * img[o + 2];
    let s = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const q = idx(x + dx, y + dy) << 2;
        s += 0.299 * img[q] + 0.587 * img[q + 1] + 0.114 * img[q + 2];
      }
    hfSum += Math.abs(lc - s / 9);
    hfN++;
  }
  const hfEnergy = hfN ? hfSum / hfN : 0;
  const smoothBg = hfEnergy < 2.2; // graded / out-of-focus product backdrop

  // ---- texture transfer: graft REAL high-frequency detail from the best-
  // matching nearby background so a textured patch reads as untouched. Skipped
  // entirely when the background is smooth/graded — there the fitted surface IS
  // the answer and any grafted "detail" would just re-introduce a visible seam. --
  if (wantTexture && !smoothBg && maskedList.length > 16) {
    // scoring ring: real pixels touching the hole
    const ring: number[] = [];
    for (let y = Math.max(0, by0 - 4); y <= Math.min(H - 1, by1 + 4); y++) {
      for (let x = Math.max(0, bx0 - 4); x <= Math.min(W - 1, bx1 + 4); x++) {
        const p = idx(x, y);
        if (mask[p] > 127) continue;
        if (
          (inB(x - 1, y) && mask[idx(x - 1, y)] > 127) ||
          (inB(x + 1, y) && mask[idx(x + 1, y)] > 127) ||
          (inB(x, y - 1) && mask[idx(x, y - 1)] > 127) ||
          (inB(x, y + 1) && mask[idx(x, y + 1)] > 127)
        )
          ring.push(p);
      }
    }
    const span = Math.min(160, Math.max(bw, bh) + 40);
    let bestOff = 0;
    let bestScore = Infinity;
    for (let oy = -span; oy <= span; oy += 3) {
      for (let ox = -span; ox <= span; ox += 3) {
        if (ox === 0 && oy === 0) continue;
        if (Math.abs(ox) < 4 && Math.abs(oy) < 4) continue;
        let score = 0;
        let n = 0;
        for (let r = 0; r < ring.length; r += 2) {
          const p = ring[r];
          const sx = (p % W) + ox;
          const sy = ((p / W) | 0) + oy;
          if (!inB(sx, sy) || mask[idx(sx, sy)] > 127) {
            score += 4000;
            n++;
            continue;
          }
          const a = p << 2;
          const b = idx(sx, sy) << 2;
          const dr = img[a] - img[b];
          const dg = img[a + 1] - img[b + 1];
          const db = img[a + 2] - img[b + 2];
          score += dr * dr + dg * dg + db * db;
          n++;
        }
        if (n > 0) {
          score /= n;
          if (score < bestScore) {
            bestScore = score;
            bestOff = oy * W + ox;
          }
        }
      }
    }
    // only graft when the match is genuinely good
    if (bestOff !== 0 && bestScore < 900) {
      const hipass = (px: number, py: number, c: number): number => {
        let s = 0;
        let cnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (!inB(px + dx, py + dy)) continue;
            s += img[(idx(px + dx, py + dy) << 2) + c];
            cnt++;
          }
        }
        return img[(idx(px, py) << 2) + c] - (cnt ? s / cnt : 0);
      };
      for (const p of maskedList) {
        const sp = p + bestOff;
        if (sp < 0 || sp >= N || mask[sp] > 127) continue;
        const sx = sp % W;
        const sy = (sp / W) | 0;
        const o = p << 2;
        for (let c = 0; c < 3; c++) {
          const vv = img[o + c] + hipass(sx, sy, c) * 0.85;
          img[o + c] = vv < 0 ? 0 : vv > 255 ? 255 : vv;
        }
      }
    }
  }

  // ---- synthetic grain: white-noise dither matched to the local sensor noise.
  // Auto-scaled by how textured the background is, so a smooth backdrop gets
  // essentially none (avoids a "sprayed" look on a clean gradient). ----
  const grainScale = Math.min(1, hfEnergy / 3);
  if (grain > 0 && grainScale > 0.03) {
    const hash = (k: number): number => {
      k = (k ^ 61) ^ (k >>> 16);
      k = k + (k << 3);
      k = k ^ (k >>> 4);
      k = Math.imul(k, 0x27d4eb2d);
      k = k ^ (k >>> 15);
      return (k >>> 0) / 4294967296;
    };
    for (const p of maskedList) {
      const x = p % W;
      const y = (p / W) | 0;
      let sum = 0;
      let sumSq = 0;
      let cnt = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!inB(x + dx, y + dy)) continue;
          const o = idx(x + dx, y + dy) << 2;
          const lum = 0.299 * img[o] + 0.587 * img[o + 1] + 0.114 * img[o + 2];
          sum += lum;
          sumSq += lum * lum;
          cnt++;
        }
      }
      if (cnt < 6) continue;
      const mean = sum / cnt;
      const sd = Math.sqrt(Math.max(0, sumSq / cnt - mean * mean)) * grain * grainScale;
      if (sd < 0.35) continue;
      const g = (hash(p * 2 + 1) * 2 - 1) * sd;
      const o = p << 2;
      img[o] += g;
      img[o + 1] += g;
      img[o + 2] += g;
    }
  }

  // ---- feather the 2px mask rim toward its local average (which includes the
  // real surrounding background) so there is no hard seam and no ghost. ----
  {
    const depthArr = new Int8Array(N).fill(-1);
    let front: number[] = [];
    for (const p of maskedList) {
      const x = p % W;
      const y = (p / W) | 0;
      if (
        (inB(x - 1, y) && mask[idx(x - 1, y)] <= 127) ||
        (inB(x + 1, y) && mask[idx(x + 1, y)] <= 127) ||
        (inB(x, y - 1) && mask[idx(x, y - 1)] <= 127) ||
        (inB(x, y + 1) && mask[idx(x, y + 1)] <= 127)
      ) {
        depthArr[p] = 0;
        front.push(p);
      }
    }
    for (let d = 0; d < 1; d++) {
      const nxt: number[] = [];
      for (const p of front) {
        const x = p % W;
        const y = (p / W) | 0;
        const nb = [inB(x - 1, y) ? p - 1 : -1, inB(x + 1, y) ? p + 1 : -1, inB(x, y - 1) ? p - W : -1, inB(x, y + 1) ? p + W : -1];
        for (const q of nb) {
          if (q < 0) continue;
          if (mask[q] > 127 && depthArr[q] < 0) {
            depthArr[q] = d + 1;
            nxt.push(q);
          }
        }
      }
      front = nxt;
    }
    const blendAt = [0.4, 0.18];
    for (const p of maskedList) {
      const d = depthArr[p];
      if (d < 0) continue;
      const x = p % W;
      const y = (p / W) | 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      const nb = [inB(x - 1, y) ? p - 1 : -1, inB(x + 1, y) ? p + 1 : -1, inB(x, y - 1) ? p - W : -1, inB(x, y + 1) ? p + W : -1];
      for (const q of nb) {
        if (q < 0) continue;
        const qo = q << 2;
        r += img[qo];
        g += img[qo + 1];
        b += img[qo + 2];
        n++;
      }
      if (!n) continue;
      const a = blendAt[d];
      const o = p << 2;
      img[o] = img[o] * (1 - a) + (r / n) * a;
      img[o + 1] = img[o + 1] * (1 - a) + (g / n) * a;
      img[o + 2] = img[o + 2] * (1 - a) + (b / n) * a;
    }
  }

  return img.buffer;
}

// Worker entry (guarded so this file can also be imported in Node for tests).
declare const self: any;
if (typeof self !== "undefined" && typeof self.postMessage === "function" && !("window" in self)) {
  self.onmessage = (e: MessageEvent<InpaintMsg>) => {
    try {
      const out = inpaintBuffer(e.data);
      self.postMessage({ ok: true, rgba: out }, [out]);
    } catch (err) {
      self.postMessage({ ok: false, error: (err as Error).message });
    }
  };
}
