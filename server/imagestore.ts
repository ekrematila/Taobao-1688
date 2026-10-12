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
 * Give an AI result the SAME pixel size as the picture it was made from, at full quality.
 * Image models answer at their own size (a multiple of 16, a capped long edge…), so a translated
 * picture came back smaller or slightly off. When the aspect ratios agree (within 4%) the result is
 * resampled to exactly `src` w×h (Lanczos, lossless PNG / near-lossless JPEG); when they don't, only the
 * WIDTH is matched and the AI's own proportions are kept — never a stretched picture.
 * Returns the (possibly new) `/api/media/...` url; unchanged when sharp is unavailable or the size
 * already matches.
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
    const sameShape = Math.abs(w / h / (src.w / src.h) - 1) <= 0.04;
    const outW = src.w;
    const outH = sameShape ? src.h : Math.max(1, Math.round((h * src.w) / w));
    const png = meta.format === "png";
    const pipe = sharp(file).resize(outW, outH, { fit: "fill", kernel: "lanczos3" });
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
