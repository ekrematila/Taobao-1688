import { createHash } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./env.ts";

const DIR = join(ROOT, "data", "media");
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

/** Store a `data:image/...;base64,...` URL (edited image from the browser). */
export function persistDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) throw new Error("Geçersiz data URL");
  return persist(Buffer.from(m[2], "base64"), m[1]);
}
