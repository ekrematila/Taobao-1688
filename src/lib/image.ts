import { proxied } from "../api";

export interface CropPreset {
  id: string;
  label: string;
  ratio: number | null; // w/h; null = keep original
  maxEdge?: number; // longest side after resize
}

export const CROP_PRESETS: CropPreset[] = [
  { id: "orig", label: "Orijinal", ratio: null, maxEdge: 2000 },
  { id: "etsy", label: "Etsy 2000²", ratio: 1, maxEdge: 2000 },
  { id: "shopify45", label: "Shopify 4:5", ratio: 4 / 5, maxEdge: 1600 },
  { id: "square1600", label: "Kare 1600", ratio: 1, maxEdge: 1600 },
  { id: "wide169", label: "Geniş 16:9", ratio: 16 / 9, maxEdge: 1920 },
  { id: "story916", label: "Dikey 9:16", ratio: 9 / 16, maxEdge: 1920 },
];

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi: " + url));
    img.src = proxied(url);
  });
}

export interface Adjust {
  brightness: number; // %  (40..180, 100 = neutral)
  contrast: number; // %  (40..200)
  saturate: number; // %  (0..220)
  exposure?: number; // -100..100  multiplicative light
  warmth?: number; // -100..100  warm (+) / cool (-)
  tint?: number; // -100..100  magenta (+) / green (-)
  sharpen?: number; // 0..100  unsharp-mask amount
  vignette?: number; // 0..100  dark corners
  blur?: number; // 0..12 px  softening
}
export const NEUTRAL_ADJUST: Adjust = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  exposure: 0,
  warmth: 0,
  tint: 0,
  sharpen: 0,
  vignette: 0,
  blur: 0,
};

export interface AdjustPreset {
  id: string;
  tr: string;
  en: string;
  adjust: Partial<Adjust>;
}

/** 15 ready-made looks for product photos. Applied on top of NEUTRAL_ADJUST. */
export const ADJUST_PRESETS: AdjustPreset[] = [
  { id: "neutral", tr: "Orijinal", en: "Original", adjust: {} },
  { id: "ecom-pop", tr: "E-ticaret Pop", en: "E-commerce Pop", adjust: { brightness: 108, contrast: 114, saturate: 122, sharpen: 45 } },
  { id: "studio-white", tr: "Stüdyo Beyaz", en: "Studio White", adjust: { brightness: 114, contrast: 106, saturate: 98, warmth: -8, sharpen: 30, exposure: 8 } },
  { id: "bright-crisp", tr: "Parlak & Net", en: "Bright & Crisp", adjust: { brightness: 110, contrast: 108, sharpen: 55 } },
  { id: "vivid", tr: "Canlı Renkler", en: "Vivid", adjust: { contrast: 112, saturate: 140, sharpen: 25 } },
  { id: "high-contrast", tr: "Yüksek Kontrast", en: "High Contrast", adjust: { contrast: 145, saturate: 110, sharpen: 20 } },
  { id: "soft", tr: "Yumuşak", en: "Soft", adjust: { brightness: 106, contrast: 92, saturate: 96, blur: 0.6 } },
  { id: "flat", tr: "Düz / Dengeli", en: "Flat / Balanced", adjust: { contrast: 84, saturate: 92, exposure: 6 } },
  { id: "warm", tr: "Sıcak Ton", en: "Warm", adjust: { warmth: 40, saturate: 108, brightness: 103 } },
  { id: "cool", tr: "Soğuk Ton", en: "Cool", adjust: { warmth: -38, saturate: 104, brightness: 102 } },
  { id: "pastel", tr: "Pastel", en: "Pastel", adjust: { brightness: 112, contrast: 90, saturate: 78, warmth: 10 } },
  { id: "dramatic", tr: "Dramatik", en: "Dramatic", adjust: { contrast: 150, saturate: 118, vignette: 45, sharpen: 30 } },
  { id: "vintage", tr: "Vintage", en: "Vintage", adjust: { contrast: 92, saturate: 62, warmth: 45, vignette: 35, brightness: 104 } },
  { id: "sharp-detail", tr: "Keskin Detay", en: "Sharp Detail", adjust: { contrast: 116, sharpen: 90, saturate: 106 } },
  { id: "bw", tr: "Siyah-Beyaz", en: "Black & White", adjust: { saturate: 0, contrast: 122, sharpen: 35 } },
];

export interface LogoSpec {
  src: string; // data URL or /api/media path
  anchor: number; // 0..8 in a 3x3 grid (6 = bottom-left, 7 = bottom-center)
  heightPx: number; // at a 1000px reference width
  offsetPx: number; // at a 1000px reference width
  opacity: number; // %
  /** freeform placement — CENTRE of the logo box, 0..100 % of the frame; overrides anchor when set */
  xPct?: number;
  yPct?: number;
}
/** Placement a logo gets the moment it is added (operator can still tweak). */
export const DEFAULT_LOGO: Omit<LogoSpec, "src"> = { anchor: 6, heightPx: 65, offsetPx: 10, opacity: 100 };
const REF_WIDTH = 1000;

/** Logo box in device px for a given frame + logo image aspect (anchor or freeform). */
export function computeLogoRect(
  logo: LogoSpec,
  iw: number,
  ih: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const k = w / REF_WIDTH;
  const lh = logo.heightPx * k;
  const lw = (iw / ih || 1) * lh;
  let x: number;
  let y: number;
  if (logo.xPct != null && logo.yPct != null) {
    x = (logo.xPct / 100) * w - lw / 2;
    y = (logo.yPct / 100) * h - lh / 2;
  } else {
    const off = logo.offsetPx * k;
    const col = logo.anchor % 3;
    const rowi = Math.floor(logo.anchor / 3);
    x = col === 0 ? off : col === 1 ? (w - lw) / 2 : w - lw - off;
    y = rowi === 0 ? off : rowi === 1 ? (h - lh) / 2 : h - lh - off;
  }
  x = Math.max(0, Math.min(x, Math.max(0, w - lw)));
  y = Math.max(0, Math.min(y, Math.max(0, h - lh)));
  return { x, y, w: lw, h: lh };
}

export interface RenderOpts {
  preset: CropPreset;
  watermark?: string;
  adjust?: Adjust;
  logo?: LogoSpec | null;
  logoImg?: HTMLImageElement | null; // preloaded <img> for the logo
  bg?: string; // fill for letterboxed area
}

/** Draw a logo onto any 2D canvas context, anchored 3×3, sized at a 1000px ref width. */
export function drawLogo(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  logo: LogoSpec,
  logoImg: HTMLImageElement | HTMLCanvasElement,
): void {
  const iw = "naturalWidth" in logoImg ? logoImg.naturalWidth || logoImg.width : logoImg.width;
  const ih = "naturalHeight" in logoImg ? logoImg.naturalHeight || logoImg.height : logoImg.height;
  const r = computeLogoRect(logo, iw, ih, w, h);
  ctx.save();
  ctx.globalAlpha = logo.opacity / 100;
  ctx.drawImage(logoImg, r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** Center-crop + resize + adjustments + optional watermark + optional logo. */
export function renderImage(img: HTMLImageElement, opts: RenderOpts): HTMLCanvasElement {
  const { preset, watermark, adjust, logo, logoImg, bg = "#ffffff" } = opts;
  const srcRatio = img.width / img.height;
  const targetRatio = preset.ratio ?? srcRatio;

  // source crop rect (center crop to targetRatio)
  let sw = img.width;
  let sh = img.height;
  if (srcRatio > targetRatio) sw = Math.round(img.height * targetRatio);
  else sh = Math.round(img.width / targetRatio);
  const sx = Math.round((img.width - sw) / 2);
  const sy = Math.round((img.height - sh) / 2);

  // output size
  const maxEdge = preset.maxEdge ?? Math.max(sw, sh);
  let ow = sw;
  let oh = sh;
  if (Math.max(sw, sh) > maxEdge) {
    const k = maxEdge / Math.max(sw, sh);
    ow = Math.round(sw * k);
    oh = Math.round(sh * k);
  }

  const canvas = document.createElement("canvas");
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, ow, oh);
  ctx.imageSmoothingQuality = "high";
  const A: Adjust = { ...NEUTRAL_ADJUST, ...(adjust ?? {}) };
  const blurPx = Math.max(0, A.blur ?? 0);
  ctx.filter =
    `brightness(${A.brightness}%) contrast(${A.contrast}%) saturate(${A.saturate}%)` +
    (blurPx ? ` blur(${blurPx}px)` : "");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
  ctx.filter = "none";

  applyPixelAdjust(ctx, ow, oh, A);

  if (logo && logoImg) drawLogo(ctx, ow, oh, logo, logoImg);

  if (watermark?.trim()) {
    const fs = Math.max(14, Math.round(ow * 0.045));
    ctx.font = `700 ${fs}px Inter, sans-serif`;
    ctx.textBaseline = "bottom";
    const pad = Math.round(fs * 0.5);
    const tw = ctx.measureText(watermark).width;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(ow - tw - pad * 2, oh - fs - pad * 2, tw + pad * 2, fs + pad * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(watermark, ow - tw - pad, oh - pad);
  }
  return canvas;
}

/** exposure / warmth / tint / vignette + optional unsharp-mask, in place. */
/** CSS `filter` string for the parts the browser can do natively (fast). */
export function adjustFilter(a: Partial<Adjust>): string {
  const A = { ...NEUTRAL_ADJUST, ...a };
  const b = Math.max(0, A.blur ?? 0);
  return `brightness(${A.brightness}%) contrast(${A.contrast}%) saturate(${A.saturate}%)` + (b ? ` blur(${b}px)` : "");
}

export function applyPixelAdjust(ctx: CanvasRenderingContext2D, w: number, h: number, a: Adjust) {
  const exposure = a.exposure ?? 0;
  const warmth = a.warmth ?? 0;
  const tint = a.tint ?? 0;
  const vignette = a.vignette ?? 0;
  const sharpen = a.sharpen ?? 0;
  if (!exposure && !warmth && !tint && !vignette && !sharpen) return;

  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;

  if (exposure || warmth || tint || vignette) {
    const eMul = Math.pow(2, exposure / 100); // ±100 => ×2 / ×0.5
    const wr = 1 + (warmth / 100) * 0.28;
    const wb = 1 - (warmth / 100) * 0.28;
    const tg = 1 - (tint / 100) * 0.22;
    const tr = 1 + (tint / 100) * 0.11;
    const tb = 1 + (tint / 100) * 0.11;
    const vig = (vignette / 100) * 0.9;
    const cx = w / 2;
    const cy = h / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let r = d[i] * eMul * wr * tr;
        let g = d[i + 1] * eMul * tg;
        let b = d[i + 2] * eMul * wb * tb;
        if (vig) {
          const dd = Math.hypot(x - cx, y - cy) / maxD;
          const t = dd <= 0.55 ? 0 : (dd - 0.55) / 0.45; // smoothstep-ish edge
          const f = 1 - vig * (t * t * (3 - 2 * t));
          r *= f;
          g *= f;
          b *= f;
        }
        d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
  }

  if (sharpen) {
    const amt = (sharpen / 100) * 0.9;
    const src = new Uint8ClampedArray(d); // snapshot for the convolution
    const kC = 1 + 4 * amt;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const p = i + c;
          const v =
            src[p] * kC -
            amt * (src[p - 4] + src[p + 4] + src[p - w * 4] + src[p + w * 4]);
          d[p] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
    }
  }

  ctx.putImageData(id, 0, 0);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob başarısız"))), type, quality),
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function slugify(s: string, max = 48): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "image"
  );
}
