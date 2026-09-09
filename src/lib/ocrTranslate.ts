// 100% local / free image-text translation — NO paid AI.
//   OCR (Tesseract.js, Chinese) → free MT (server /api/translate/free)
//   → local inpaint over the text boxes → re-render the translation in place.
// The product and background are never touched — only the detected text boxes.
//
// Capability upgrades:
//   • upscales small images and applies a grayscale + contrast stretch before OCR
//   • PSM 6 (uniform block) + interword spacing, lower confidence gate
//   • merges fragments that sit on the same text line
//   • ocrRegion(): OCR just a user-drawn rectangle (so the operator can point at
//     text the auto pass missed) — single-line PSM, heavy upscale

import { createWorker, type Worker } from "tesseract.js";
import { localInpaint } from "./inpaint";
import { applyKeycapGlossary } from "@shared/keycaps.ts";

export interface OcrBlock {
  text: string; // original (Chinese)
  translated: string; // filled by translate()
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string; // sampled text colour  "rgb(r,g,b)"
  bg: string; // sampled background colour
  conf: number;
  manual?: boolean; // drawn by the operator
}

const CJK = /[㐀-鿿豈-﫿]/;

let workerP: Promise<Worker> | null = null;
async function getWorker(onLog?: (s: string) => void): Promise<Worker> {
  if (!workerP) {
    workerP = (async () => {
      // Use the LSTM "best" trained data (chi_sim ~30MB, chi_tra ~20MB, +vertical)
      // instead of the tiny "fast" models — far higher recognition accuracy on
      // stylised e-commerce Chinese. ~50MB, downloaded once and cached in IndexedDB.
      const w = await createWorker(["chi_sim", "chi_tra", "chi_sim_vert"], 1, {
        langPath: "https://tessdata.projectnaptha.com/4.0.0_best",
        logger: (m: any) => {
          if (onLog && m?.status) onLog(`${m.status} ${Math.round((m.progress ?? 0) * 100)}%`);
        },
      });
      try {
        await w.setParameters({
          tessedit_pageseg_mode: "6" as any, // assume a single uniform block of text
          preserve_interword_spaces: "1",
        });
      } catch {
        /* older tesseract.js — ignore */
      }
      return w;
    })();
  }
  return workerP;
}
export async function disposeOcr() {
  if (workerP) {
    try {
      (await workerP).terminate();
    } catch {
      /* ignore */
    }
    workerP = null;
  }
}

/** Upscaled, grayscale + contrast-stretched copy for OCR. Returns the scale used. */
function prep(src: CanvasImageSource, w: number, h: number, minSide = 1500, maxSide = 3200): { work: HTMLCanvasElement; scale: number } {
  let scale = 1;
  const small = Math.min(w, h);
  const big = Math.max(w, h);
  if (small < minSide) scale = minSide / small;
  if (big * scale > maxSide) scale = maxSide / big;
  scale = Math.max(1, Math.min(scale, 4));

  const work = document.createElement("canvas");
  work.width = Math.round(w * scale);
  work.height = Math.round(h * scale);
  const ctx = work.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, work.width, work.height);

  // grayscale + mild contrast stretch (2%–98% percentiles → 0–255)
  const img = ctx.getImageData(0, 0, work.width, work.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    hist[l]++;
  }
  const px = work.width * work.height;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc > px * 0.02) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc > px * 0.02) {
      hi = v;
      break;
    }
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    let l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] - lo) * (255 / span);
    l = l < 0 ? 0 : l > 255 ? 255 : l;
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  ctx.putImageData(img, 0, 0);
  return { work, scale };
}

function sampleColors(data: Uint8ClampedArray, W: number, b: { x0: number; y0: number; x1: number; y1: number }) {
  let sum = 0;
  let n = 0;
  const px: number[] = [];
  for (let y = Math.max(0, b.y0); y < b.y1; y += 2) {
    for (let x = Math.max(0, b.x0); x < b.x1; x += 2) {
      const o = (y * W + x) * 4;
      const l = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      sum += l;
      n++;
      px.push(o);
    }
  }
  const mean = n ? sum / n : 128;
  let bg = [0, 0, 0];
  let bgN = 0;
  let tx = [0, 0, 0];
  let txN = 0;
  for (const o of px) {
    const l = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    if (Math.abs(l - mean) < 40) {
      bg[0] += data[o];
      bg[1] += data[o + 1];
      bg[2] += data[o + 2];
      bgN++;
    } else {
      tx[0] += data[o];
      tx[1] += data[o + 1];
      tx[2] += data[o + 2];
      txN++;
    }
  }
  const rgb = (a: number[], k: number) =>
    k ? `rgb(${Math.round(a[0] / k)},${Math.round(a[1] / k)},${Math.round(a[2] / k)})` : mean > 128 ? "rgb(20,20,20)" : "rgb(240,240,240)";
  return { bg: rgb(bg, bgN), color: rgb(tx, txN) };
}

/** Merge boxes that overlap vertically a lot and are close horizontally (same line). */
function mergeLine(blocks: OcrBlock[]): OcrBlock[] {
  const out: OcrBlock[] = [];
  const used = new Set<number>();
  for (let i = 0; i < blocks.length; i++) {
    if (used.has(i)) continue;
    let a = { ...blocks[i] };
    for (let j = i + 1; j < blocks.length; j++) {
      if (used.has(j)) continue;
      const b = blocks[j];
      const vOverlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      const minH = Math.min(a.y1 - a.y0, b.y1 - b.y0);
      const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      if (vOverlap > minH * 0.6 && gap < minH * 1.2) {
        a = {
          ...a,
          text: a.x0 <= b.x0 ? a.text + b.text : b.text + a.text,
          x0: Math.min(a.x0, b.x0),
          y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1),
          y1: Math.max(a.y1, b.y1),
          conf: Math.min(a.conf, b.conf),
        };
        used.add(j);
      }
    }
    out.push(a);
  }
  return out;
}

/** Recognise Chinese text lines and return their boxes + sampled colours. */
export async function ocrBlocks(canvas: HTMLCanvasElement, onLog?: (s: string) => void): Promise<OcrBlock[]> {
  const w = await getWorker(onLog);
  const { work, scale } = prep(canvas, canvas.width, canvas.height);
  const { data } = await w.recognize(work);
  const sctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const px = sctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const raw: OcrBlock[] = [];
  const lines: any[] = (data as any).lines || [];
  for (const ln of lines) {
    const text = String(ln.text || "").replace(/\s+/g, "").trim();
    if (!text || !CJK.test(text)) continue;
    if ((ln.confidence ?? 0) < 30) continue;
    const b = {
      x0: Math.round(ln.bbox.x0 / scale),
      y0: Math.round(ln.bbox.y0 / scale),
      x1: Math.round(ln.bbox.x1 / scale),
      y1: Math.round(ln.bbox.y1 / scale),
    };
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    if (bw < 10 || bh < 8 || bh > canvas.height * 0.6) continue;
    const { color, bg } = sampleColors(px, canvas.width, b);
    raw.push({ text, translated: "", ...b, color, bg, conf: ln.confidence ?? 0 });
  }
  return mergeLine(raw);
}

/**
 * OCR a single operator-drawn rectangle (source-pixel coords). Heavy upscale +
 * single-line PSM. Returns a block even at low confidence so the operator can
 * correct the text by hand.
 */
export async function ocrRegion(
  canvas: HTMLCanvasElement,
  rect: { x0: number; y0: number; x1: number; y1: number },
  onLog?: (s: string) => void,
): Promise<OcrBlock> {
  const x0 = Math.max(0, Math.min(rect.x0, rect.x1));
  const y0 = Math.max(0, Math.min(rect.y0, rect.y1));
  const x1 = Math.min(canvas.width, Math.max(rect.x0, rect.x1));
  const y1 = Math.min(canvas.height, Math.max(rect.y0, rect.y1));
  const rw = Math.max(1, x1 - x0);
  const rh = Math.max(1, y1 - y0);

  const crop = document.createElement("canvas");
  crop.width = rw;
  crop.height = rh;
  crop.getContext("2d")!.drawImage(canvas, x0, y0, rw, rh, 0, 0, rw, rh);

  const w = await getWorker(onLog);
  const { work } = prep(crop, rw, rh, 900, 2600);
  let text = "";
  try {
    await w.setParameters({ tessedit_pageseg_mode: "7" as any }); // single line
    const { data } = await w.recognize(work);
    text = String((data as any).text || "").replace(/\s+/g, "").trim();
  } finally {
    try {
      await w.setParameters({ tessedit_pageseg_mode: "6" as any });
    } catch {
      /* ignore */
    }
  }

  const sctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const px = sctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const { color, bg } = sampleColors(px, canvas.width, { x0, y0, x1, y1 });
  return { text, translated: "", x0, y0, x1, y1, color, bg, conf: text ? 60 : 0, manual: true };
}

/** Ask the free-MT endpoint to fill `translated` on each block. */
export async function translateBlocks(
  blocks: OcrBlock[],
  to: string,
  freeTranslate: (texts: string[], to: string, from: string) => Promise<{ results: string[] }>,
): Promise<OcrBlock[]> {
  if (!blocks.length) return blocks;
  const idx = blocks.map((b, i) => (b.text ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return blocks;
  const { results } = await freeTranslate(
    idx.map((i) => blocks[i].text),
    to,
    "zh",
  );
  const map = new Map(idx.map((bi, k) => [bi, applyKeycapGlossary((results[k] || blocks[bi].text).trim())]));
  return blocks.map((b, i) => (map.has(i) ? { ...b, translated: map.get(i)! } : b));
}

/** Inpaint the text boxes then draw the translations back, fitted to each box. */
export async function renderTranslated(src: HTMLCanvasElement, blocks: OcrBlock[]): Promise<HTMLCanvasElement> {
  const live = blocks.filter((b) => (b.translated || "").trim() || b.manual);
  if (!live.length) return src;
  const pad = Math.max(2, Math.round(src.height * 0.004));

  const mask = document.createElement("canvas");
  mask.width = src.width;
  mask.height = src.height;
  const mx = mask.getContext("2d")!;
  mx.fillStyle = "#fff";
  for (const b of live) {
    mx.fillRect(
      Math.max(0, b.x0 - pad),
      Math.max(0, b.y0 - pad),
      Math.min(src.width, b.x1 + pad) - Math.max(0, b.x0 - pad),
      Math.min(src.height, b.y1 + pad) - Math.max(0, b.y0 - pad),
    );
  }
  const cleaned = await localInpaint(src, mask, { grain: 0.02 });

  const ctx = cleaned.getContext("2d")!;
  ctx.textBaseline = "middle";
  for (const b of live) {
    const tval = (b.translated || "").trim();
    if (!tval) continue;
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    let size = Math.round(bh * 0.82);
    ctx.textAlign = "center";
    for (; size >= 8; size--) {
      ctx.font = `600 ${size}px Inter, "Noto Sans", Arial, sans-serif`;
      if (ctx.measureText(tval).width <= bw * 0.98) break;
    }
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, size * 0.14);
    ctx.strokeStyle = b.bg;
    ctx.strokeText(tval, cx, cy);
    ctx.fillStyle = b.color;
    ctx.fillText(tval, cx, cy);
    ctx.restore();
  }
  return cleaned;
}
