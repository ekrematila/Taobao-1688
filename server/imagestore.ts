import { createHash } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DATA_DIR } from "./env.ts";

const pExecFile = promisify(execFile);

const DIR = join(DATA_DIR, "media");
mkdirSync(DIR, { recursive: true });

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
  "video/ogg": "ogv",
  "video/mpeg": "mpg",
};

export function mediaPath(file: string): string {
  return join(DIR, file.replace(/[^a-zA-Z0-9._-]/g, ""));
}

function persist(buf: Buffer, mime: string): string {
  const ext = EXT[mime] || "bin";
  const name = createHash("sha1").update(buf).digest("hex").slice(0, 24) + "." + ext;
  const p = mediaPath(name);
  if (!existsSync(p)) writeFileSync(p, buf);
  return `/api/media/${name}`;
}

/** Download a remote (possibly expiring / auth-gated) image and keep a local copy. */
export async function persistFromUrl(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Görsel indirilemedi (${res.status})`);
  const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  return persist(Buffer.from(await res.arrayBuffer()), mime);
}

/** Download a remote video/file (best effort) and keep a local copy under /api/media. */
export async function persistFileFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Dosya indirilemedi (${res.status})`);
  const mime = (res.headers.get("content-type") || "").split(";")[0].trim() || guessMimeFromUrl(url);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 200 * 1024 * 1024) throw new Error("Dosya 200MB sınırını aşıyor.");
  return persist(buf, mime);
}

function guessMimeFromUrl(u: string): string {
  const ext = (u.split(/[?#]/)[0].split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v", ogv: "video/ogg", mpg: "video/mpeg", mpeg: "video/mpeg" };
  return map[ext] || "application/octet-stream";
}

/**
 * Normalise a locally-stored `/api/media/...` image so its SHORTEST side is
 * within [minEdge, maxEdge] px, keeping aspect ratio, at high quality. Used for
 * translated images (operator rule: shortest edge always 800–1000 px, high
 * quality, no other size constraint). No-op if ffmpeg is missing or the image is
 * already in range. Returns the (possibly new) `/api/media/...` url.
 */
export async function normaliseShortestEdge(
  mediaUrl: string,
  { minEdge = 800, maxEdge = 1000, target = 900 }: { minEdge?: number; maxEdge?: number; target?: number } = {},
): Promise<string> {
  if (!mediaUrl.startsWith("/api/media/")) return mediaUrl;
  const src = mediaPath(mediaUrl.slice("/api/media/".length));
  if (!existsSync(src)) return mediaUrl;
  try {
    const { stdout } = await pExecFile(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", src],
      { timeout: 20000 },
    );
    const [w, h] = stdout.trim().split(/[,x]/).map((n) => parseInt(n, 10));
    if (!w || !h) return mediaUrl;
    const shortest = Math.min(w, h);
    if (shortest >= minEdge && shortest <= maxEdge) return mediaUrl; // already fine
    const landscape = w >= h;
    // scale the SHORT side to `target`, the long side auto (even number)
    const vf = landscape
      ? `scale=-2:${target}:flags=lanczos`
      : `scale=${target}:-2:flags=lanczos`;
    const isPng = /\.png$/i.test(src);
    const outBuf = mediaPath("__resize_tmp." + (isPng ? "png" : "jpg"));
    const args = isPng
      ? ["-y", "-i", src, "-vf", vf, "-pred", "mixed", outBuf]
      : ["-y", "-i", src, "-vf", vf, "-q:v", "2", outBuf];
    await pExecFile("ffmpeg", args, { timeout: 40000 });
    if (!existsSync(outBuf)) return mediaUrl;
    return persist(readFileSync(outBuf), isPng ? "image/png" : "image/jpeg");
  } catch {
    return mediaUrl; // ffmpeg not available / probe failed → leave as-is
  }
}

/** Store a `data:image/...;base64,...` URL (edited image from the browser). */
export function persistDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) throw new Error("Geçersiz data URL");
  return persist(Buffer.from(m[2], "base64"), m[1]);
}

/**
 * Image models answer in their own frame (Manus: a 1:3 canvas for a tall strip) and park the picture inside it
 * with flat bars — the picture itself keeps the source's proportions. Find those bars (flat near-black / near-white
 * edge rows and columns); returns the picture's box, or null when there are no bars to remove.
 */
export async function findContentBox(
  file: string,
  srcRatio: number,
): Promise<{ left: number; top: number; width: number; height: number } | null> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const sx = Math.max(1, Math.floor(W / 300));
  const sy = Math.max(1, Math.floor(H / 300));
  const flat = (vals: { mean: number; range: number }) => vals.range < 24 && (vals.mean < 22 || vals.mean > 233);
  const col = (x: number) => {
    let sum = 0, n = 0, lo = 255, hi = 0;
    for (let y = 0; y < H; y += sy) for (let c = 0; c < C; c++) { const v = data[(y * W + x) * C + c]; sum += v; n++; if (v < lo) lo = v; if (v > hi) hi = v; }
    return { mean: sum / n, range: hi - lo };
  };
  const row = (y: number) => {
    let sum = 0, n = 0, lo = 255, hi = 0;
    for (let x = 0; x < W; x += sx) for (let c = 0; c < C; c++) { const v = data[(y * W + x) * C + c]; sum += v; n++; if (v < lo) lo = v; if (v > hi) hi = v; }
    return { mean: sum / n, range: hi - lo };
  };
  let l = 0, r = W - 1, t = 0, b = H - 1;
  while (l < r && flat(col(l))) l++;
  while (r > l && flat(col(r))) r--;
  while (t < b && flat(row(t))) t++;
  while (b > t && flat(row(b))) b--;
  const pad = 1; // the bar's anti-aliased edge
  if (l > 0) l += pad;
  if (r < W - 1) r -= pad;
  if (t > 0) t += pad;
  if (b < H - 1) b -= pad;
  const width = r - l + 1;
  const height = b - t + 1;
  const trimmed = l > 0 || t > 0 || r < W - 1 || b < H - 1;
  if (!trimmed || width < W * 0.2 || height < H * 0.2) return null;
  // only a real letterbox: what is left must have the source's proportions
  if (Math.abs(width / height / srcRatio - 1) > 0.04) return null;
  return { left: l, top: t, width, height };
}

/**
 * Give an AI result the SAME pixel size as the picture it was made from, at full quality.
 * Image models answer at their own size / in their own frame, so a translated picture came back smaller, slightly
 * off, or parked inside flat bars. Bars are cut away first; then, when the aspect ratios agree (within 4%), the
 * picture is resampled to exactly `src` w×h (Lanczos, lossless PNG / near-lossless JPEG); when they don't, only the
 * WIDTH is matched and the AI's own proportions are kept — never a stretched picture.
 * Returns the (possibly new) `/api/media/...` url; unchanged when sharp is unavailable or the size already matches.
 */
export async function matchSourceSize(mediaUrl: string, src: { w: number; h: number }): Promise<string> {
  if (!mediaUrl.startsWith("/api/media/") || !src.w || !src.h) return mediaUrl;
  const file = mediaPath(mediaUrl.slice("/api/media/".length));
  if (!existsSync(file)) return mediaUrl;
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(file).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h || (w === src.w && h === src.h)) return mediaUrl;
    const box = await findContentBox(file, src.w / src.h);
    const cw = box?.width ?? w;
    const ch = box?.height ?? h;
    const sameShape = Math.abs(cw / ch / (src.w / src.h) - 1) <= 0.04;
    const outW = src.w;
    const outH = sameShape ? src.h : Math.max(1, Math.round((ch * src.w) / cw));
    const png = meta.format === "png";
    let pipe = sharp(file);
    if (box) pipe = pipe.extract(box);
    pipe = pipe.resize(outW, outH, { fit: "fill", kernel: "lanczos3" });
    const buf = png ? await pipe.png({ compressionLevel: 6 }).toBuffer() : await pipe.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
    return persist(buf, png ? "image/png" : "image/jpeg");
  } catch {
    return mediaUrl; // sharp missing / unreadable → leave the AI's own result
  }
}

/** Pixel size of a locally stored `/api/media/...` picture, read from its header (null for anything else). */
export async function localImageSize(url: string): Promise<{ w: number; h: number } | null> {
  const clean = String(url).split("#dup-")[0];
  if (!clean.startsWith("/api/media/")) return null;
  const file = mediaPath(clean.slice("/api/media/".length));
  if (!existsSync(file)) return null;
  try {
    const sharp = (await import("sharp")).default;
    const m = await sharp(file).metadata();
    return m.width && m.height ? { w: m.width, h: m.height } : null;
  } catch {
    return null;
  }
}
