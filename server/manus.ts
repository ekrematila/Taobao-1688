import { readFileSync } from "node:fs";
import { env } from "./env.ts";
import { getSetting } from "./db.ts";
import { mediaPath } from "./imagestore.ts";
import { CHERRY_PROFILE_DIRECTIVE } from "@shared/keycaps.ts";
import { dropCJK, stripCJK } from "@shared/listingFormat.ts";
import { pickImageAttachment, saidNoChange } from "@shared/manusResult.ts";

const NO_CJK_DIRECTIVE = "The output must contain ZERO Chinese / CJK characters — none at all.";
import type { JobCtx } from "./jobs.ts";

export class ManusError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** Settings-page value wins over .env. */
export function activeManusKey(): string {
  return getSetting("manus_key") || env.manusKey;
}

export function manusConfigured(): boolean {
  return Boolean(activeManusKey());
}

/** Manus v2 accepts an API key (`x-manus-api-key`) OR an OAuth token (`Authorization: Bearer`). */
export type ManusAuthMode = "apikey" | "bearer";
let cachedAuthMode: ManusAuthMode | null = null;

export function manusAuthHeaders(key: string, mode: ManusAuthMode): Record<string, string> {
  return mode === "bearer" ? { Authorization: `Bearer ${key}` } : { "x-manus-api-key": key };
}

/** True for auth failures ("api key has been deleted or does not exist", permission_denied, 401). */
function isAuthFail(status: number, json: any): boolean {
  const m = String(json?.error?.message || json?.error?.code || "").toLowerCase();
  return status === 401 || status === 403 || /api key|permission_denied|unauthor|does not exist|deleted/.test(m);
}

/** True for Manus throttling ("Your rate limit has been exceeded", HTTP 429). Retryable. */
function isRateLimit(status: number, json: any): boolean {
  const m = String(json?.error?.message || json?.error?.code || "").toLowerCase();
  return status === 429 || /rate limit|rate_limit|too many request|throttl/.test(m);
}
/** Back-off waits before retrying a rate-limited Manus call (free tier is very tight). */
const RATE_LIMIT_BACKOFF_MS = [5000, 15000, 40000];

/**
 * Minimum spacing between `task.create` calls. A batch of image translations can
 * ask for 10+ tasks "at once" — we still let them all run, but the actual create
 * calls are released one every `MANUS_TASK_SPAWN_GAP_MS` so Manus's per-minute
 * limit isn't tripped. Default 600ms keeps a 9-image batch starting essentially
 * together (~5s spread) on a paid plan; the 429 back-off below is the real
 * safety net. Raise it (e.g. 3500) if on the very tight free tier; 0 disables.
 */
const TASK_SPAWN_GAP_MS = Math.max(0, Number(process.env.MANUS_TASK_SPAWN_GAP_MS) || 600);
let spawnChain: Promise<void> = Promise.resolve();
let lastSpawnAt = 0;
/** Serialise + space out task.create calls across all concurrent jobs. */
function throttleTaskSpawn(): Promise<void> {
  if (!TASK_SPAWN_GAP_MS) return Promise.resolve();
  spawnChain = spawnChain.then(async () => {
    const wait = lastSpawnAt + TASK_SPAWN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSpawnAt = Date.now();
  });
  return spawnChain;
}

async function callManus(path: string, init: RequestInit, key: string, mode: ManusAuthMode) {
  const res = await fetch(`${env.manusBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...manusAuthHeaders(key, mode), ...(init.headers || {}) },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ManusError(`Manus JSON olmayan yanıt döndürdü (${res.status}).`);
  }
  return { res, json };
}

async function mfetch(path: string, init: RequestInit = {}): Promise<any> {
  const key = activeManusKey();
  if (!key) throw new ManusError("MANUS_API_KEY ayarlı değil.", 400);

  let last: { res: Response; json: any } | null = null;

  // Retry the whole call a few times when Manus rate-limits us (429 / "rate limit
  // exceeded"). The free tier throttles hard, so a batch of image tasks would
  // otherwise fail wholesale.
  for (let attempt = 0; ; attempt++) {
    const tryOrder: ManusAuthMode[] = cachedAuthMode
      ? [cachedAuthMode, cachedAuthMode === "apikey" ? "bearer" : "apikey"]
      : ["apikey", "bearer"];

    let rateLimited = false;
    for (const mode of tryOrder) {
      const out = await callManus(path, init, key, mode);
      last = out;
      if (out.res.ok && out.json?.ok !== false) {
        cachedAuthMode = mode; // remember what worked
        return out.json;
      }
      if (isRateLimit(out.res.status, out.json)) {
        rateLimited = true;
        break;
      }
      if (!isAuthFail(out.res.status, out.json)) break; // real error, don't keep trying auth modes
    }

    if (rateLimited && attempt < RATE_LIMIT_BACKOFF_MS.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS[attempt]));
      continue;
    }
    break;
  }

  const j = last!.json;
  const msg = j?.error?.message || j?.error?.code || `HTTP ${last!.res.status}`;
  const hint = isAuthFail(last!.res.status, j)
    ? " — anahtar geçersiz/silinmiş. manus.im → Settings → API keys'ten YENİ bir API anahtarı üretin (OAuth uygulaması token'ı değil)."
    : isRateLimit(last!.res.status, j)
      ? " — Manus hız sınırı (ücretsiz pakette çok düşük). Daha az görseli aynı anda çevirin, birkaç dakika bekleyin veya ücretsiz OCR çevirisini kullanın."
      : "";
  throw new ManusError(`Manus: ${msg}${hint}`, last!.res.status >= 400 && last!.res.status < 500 ? last!.res.status : 502);
}

export interface ManusAttachment {
  type: "image" | "file" | "voice" | "slides" | "video";
  filename: string;
  url: string;
  content_type: string;
}


export interface ManusResult {
  taskId: string;
  taskUrl: string;
  text: string;
  attachments: ManusAttachment[];
  structured?: unknown;
  creditsUsed: number;
  creditsEstimated: boolean;
}

interface ContentPart {
  type: "text" | "file";
  text?: string;
  file_data?: string;
  file_url?: string;
  filename?: string;
  mime_type?: string;
}

/** Fetch a remote (possibly hotlink-protected) image and return base64 + mime. */
export async function fetchImageBase64(url: string): Promise<{ data: string; mime: string }> {
  const res = await fetch(url, { headers: { Referer: "https://www.taobao.com/" } });
  if (!res.ok) throw new ManusError(`Kaynak görsel indirilemedi (${res.status}).`);
  const mime = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 19 * 1024 * 1024) throw new ManusError("Görsel 19MB sınırını aşıyor.");
  return { data: buf.toString("base64"), mime };
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};

/** Like fetchImageBase64 but also resolves our own `/api/media/...` (read from disk)
 *  and `/api/image-proxy?url=...` (unwrap) URLs, and strips the `#dup-` marker. */
export async function imageToBase64(url: string): Promise<{ data: string; mime: string }> {
  const clean = String(url).split("#dup-")[0];
  if (clean.startsWith("/api/media/")) {
    const name = clean.slice("/api/media/".length);
    const buf = readFileSync(mediaPath(name));
    if (buf.byteLength > 19 * 1024 * 1024) throw new ManusError("Görsel 19MB sınırını aşıyor.");
    const ext = (name.split(".").pop() || "").toLowerCase();
    return { data: buf.toString("base64"), mime: MIME_BY_EXT[ext] || "image/jpeg" };
  }
  if (clean.startsWith("/api/image-proxy")) {
    const inner = new URL(clean, "http://x").searchParams.get("url");
    if (inner) return fetchImageBase64(inner);
  }
  return fetchImageBase64(clean);
}

/** Any binary (video included). Resolves our own /api/media, otherwise fetches. 100MB cap. */
export async function fetchFileBase64(url: string): Promise<{ data: string; mime: string }> {
  const clean = String(url).split("#dup-")[0];
  let buf: Buffer;
  let mime = "application/octet-stream";
  if (clean.startsWith("/api/media/")) {
    buf = readFileSync(mediaPath(clean.slice("/api/media/".length)));
    const ext = (clean.split(".").pop() || "").toLowerCase();
    mime = MIME_BY_EXT[ext] || (ext === "mp4" ? "video/mp4" : ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : mime);
  } else {
    const res = await fetch(clean, { headers: { Referer: "https://www.taobao.com/" } });
    if (!res.ok) throw new ManusError(`Video indirilemedi (${res.status}).`);
    mime = res.headers.get("content-type") || "video/mp4";
    buf = Buffer.from(await res.arrayBuffer());
  }
  if (buf.byteLength > 100 * 1024 * 1024) throw new ManusError("Video 100MB sınırını aşıyor.");
  return { data: buf.toString("base64"), mime };
}

export interface VideoEditOut {
  resultUrl: string | null;
  changed: boolean;
  taskId: string;
  taskUrl: string;
  creditsUsed: number;
  creditsEstimated: boolean;
}

/** Free-form video edit via Manus. Returns the edited video file URL (or null). */
export async function editVideoManus(opts: {
  videoUrl: string;
  instruction: string;
  productContext?: string;
  logoDataUrl?: string;
  speed?: ManusSpeed;
  agentProfile?: string;
  ctx?: JobCtx;
}): Promise<VideoEditOut> {
  const { videoUrl, instruction, productContext, logoDataUrl, speed, agentProfile, ctx } = opts;
  const { data, mime } = await fetchFileBase64(videoUrl);
  const spd = speedConfig(speed, agentProfile);
  const ext = mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : "mp4";

  const prompt = [
    "You are a precise product-video editor. Apply EXACTLY this edit to the attached product video and return the edited video as a file attachment (MP4 preferred):",
    `"${instruction.slice(0, 900)}"`,
    productContext ? `Product context: ${productContext.slice(0, 300)}.` : "",
    "Do NOT touch the product itself, the background, framing, motion, timing, colours or audio unless the instruction explicitly says so.",
    `Any text that must stay/appear in the video must be English — ${CHERRY_PROFILE_DIRECTIVE} Never leave or add Chinese characters.`,
    logoDataUrl ? "A brand logo image is attached — composite it as instructed (bottom-left by default), keep it subtle and consistent across the whole clip." : "",
    "Keep the output resolution and duration the same as the source.",
    spd.hint,
    "If the edit genuinely cannot be applied, reply exactly with: NO_CHANGE_NEEDED",
  ]
    .filter(Boolean)
    .join("\n");

  const parts: any[] = [
    { type: "text", text: prompt },
    { type: "file", file_data: `data:${mime};base64,${data}`, filename: `source.${ext}`, mime_type: mime },
  ];
  if (logoDataUrl?.startsWith("data:")) {
    const lm = logoDataUrl.slice(5, logoDataUrl.indexOf(";")) || "image/png";
    parts.push({ type: "file", file_data: logoDataUrl, filename: "logo.png", mime_type: lm });
  }

  ctx?.setStatus("Video düzenleniyor…");
  const res = await runManusTask(parts, { ctx, locale: "en", timeoutMs: 12 * 60 * 1000, agentProfile: spd.profile });
  const noChange = /NO_CHANGE_NEEDED/i.test(res.text);
  const vid = [...res.attachments]
    .reverse()
    .find((a) => a.type === "video" || a.content_type?.startsWith("video/") || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(a.url || ""));
  return {
    resultUrl: noChange || !vid ? null : vid.url,
    changed: !noChange && !!vid,
    taskId: res.taskId,
    taskUrl: res.taskUrl,
    creditsUsed: res.creditsUsed,
    creditsEstimated: res.creditsEstimated,
  };
}

/** Manus watches the product video and writes a concise English alt text (≤ 200 chars, no CJK). */
export async function videoAltManus(opts: {
  videoUrl: string;
  productContext?: string;
  targetLanguage?: string;
  agentProfile?: string;
  ctx?: JobCtx;
}): Promise<{ alt: string; taskId: string; taskUrl: string; creditsUsed: number; creditsEstimated: boolean }> {
  const { videoUrl, productContext, targetLanguage, agentProfile, ctx } = opts;
  const { data, mime } = await fetchFileBase64(videoUrl);
  const ext = mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : "mp4";
  const prompt = [
    `Watch the attached product video and write ONE concise alt text in ${targetLanguage || "English"} for an e-commerce listing.`,
    productContext ? `Product context: ${productContext.slice(0, 300)}.` : "",
    "Describe what is shown and demonstrated (angles, in-use, key details). 1 sentence, ≤ 200 characters, no marketing fluff.",
    NO_CJK_DIRECTIVE,
    "Reply with ONLY the alt text, nothing else.",
  ]
    .filter(Boolean)
    .join("\n");
  ctx?.setStatus("Video inceleniyor…");
  const res = await runManusTask(
    [
      { type: "text", text: prompt },
      { type: "file", file_data: `data:${mime};base64,${data}`, filename: `source.${ext}`, mime_type: mime },
    ],
    { ctx, locale: "en", timeoutMs: 8 * 60 * 1000, agentProfile },
  );
  let alt = stripCJK(res.text.trim().replace(/^["'`]+|["'`]+$/g, "")).slice(0, 240).trim();
  return { alt, taskId: res.taskId, taskUrl: res.taskUrl, creditsUsed: res.creditsUsed, creditsEstimated: res.creditsEstimated };
}

/** Pull the spendable balance. Manus v2: `data.total_credits` is the source of truth. */
function readCredits(j: any): number | null {
  const d = j?.data ?? j ?? {};
  const v = d.total_credits ?? d.available_credits ?? d.credits ?? d.balance;
  return typeof v === "number" ? v : null;
}

async function availableCredits(): Promise<number | null> {
  try {
    return readCredits(await mfetch("/v2/usage.availableCredits", { method: "GET" }));
  } catch {
    return null;
  }
}

/**
 * The REAL credits Manus billed for ONE task, from its own ledger
 * (`/v2/usage.list`). This is the only correct number when several tasks run
 * concurrently — a global before/after balance delta double-counts overlap.
 * Retries because the ledger entry can lag the task finishing by a few seconds.
 */
async function taskCreditCost(taskId: string): Promise<number | null> {
  if (!taskId) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 3500));
    try {
      const j = await mfetch(`/v2/usage.list?${new URLSearchParams({ limit: "100" })}`, { method: "GET" });
      let sum = 0;
      let found = false;
      for (const e of j.data || []) {
        if (String(e.task_id ?? "") !== taskId) continue;
        found = true;
        const c = Math.abs(Number(e.credits) || 0);
        sum += String(e.type) === "refund" ? -c : c;
      }
      if (found) return Math.max(0, Math.round(sum));
    } catch {
      /* transient — retry */
    }
  }
  return null;
}

export interface ManusBalance {
  total: number | null;
  free: number | null;
  periodic: number | null;
  addon: number | null;
  nextRefresh: number | null; // unix seconds
  periodEnd: number | null; // unix seconds
}

/** Full balance breakdown for the cost dashboard. */
export async function manusBalance(): Promise<ManusBalance | null> {
  if (!activeManusKey()) return null;
  try {
    const j = await mfetch("/v2/usage.availableCredits", { method: "GET" });
    const d = j?.data ?? j ?? {};
    return {
      total: readCredits(j),
      free: typeof d.free_credits === "number" ? d.free_credits : null,
      periodic: typeof d.periodic_credits === "number" ? d.periodic_credits : null,
      addon: typeof d.addon_credits === "number" ? d.addon_credits : null,
      nextRefresh: typeof d.next_refresh_time === "number" ? d.next_refresh_time : null,
      periodEnd: typeof d.current_period_end === "number" ? d.current_period_end : null,
    };
  } catch {
    return null;
  }
}

export interface ManusUsageRow {
  taskId: string;
  title: string;
  credits: number;
  createdAt: string; // ISO
  type: "cost" | "refund" | "grant" | string;
}

/**
 * Manus's own credit-change history (`GET /v2/usage.list`) — per-task granularity,
 * newest first. This is the authoritative record of what Manus billed us.
 */
export async function manusUsageList(maxPages = 6): Promise<{ rows: ManusUsageRow[]; truncated: boolean }> {
  if (!activeManusKey()) return { rows: [], truncated: false };
  const rows: ManusUsageRow[] = [];
  let cursor: string | undefined;
  let pages = 0;
  while (pages < maxPages) {
    pages++;
    const q = new URLSearchParams({ limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const j = await mfetch(`/v2/usage.list?${q.toString()}`, { method: "GET" });
    for (const e of j.data || []) {
      const secs = Number(e.created_at) || 0;
      rows.push({
        taskId: String(e.task_id ?? ""),
        title: String(e.title ?? ""),
        credits: Number(e.credits) || 0,
        createdAt: new Date(secs > 1e12 ? secs : secs * 1000).toISOString(),
        type: String(e.type ?? "cost"),
      });
    }
    if (j.has_more && j.next_cursor) cursor = j.next_cursor;
    else return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** Public balance lookup for the settings/usage screens. */
export function manusCredits(): Promise<number | null> {
  if (!activeManusKey()) return Promise.resolve(null);
  return availableCredits();
}

/** Auth headers for fetching Manus-hosted result files (uses the mode that worked). */
export function manusFileAuthHeaders(): Record<string, string> {
  const key = activeManusKey();
  return key ? manusAuthHeaders(key, cachedAuthMode ?? "apikey") : {};
}

/**
 * Live verification for the Settings page — proves the key works.
 * `overrideKey` lets the UI test a key that has been typed but not saved yet.
 */
export async function verifyManus(overrideKey?: string): Promise<{
  ok: boolean;
  credits: number | null;
  base: string;
  authMode: ManusAuthMode | null;
  agentProfiles: string[];
  note: string;
  error?: string;
}> {
  const base = env.manusBase;
  const key = overrideKey || activeManusKey();
  const agentProfiles = ["manus-1.6", "manus-1.6-lite", "manus-1.6-max"];
  const note =
    "Sürüm/kapasite seçimi tek resmî parametre: agent_profile (manus-1.6 / -lite / -max). " +
    "Görsel modeli (Nano Banana Pro / GPT Image) için API'de parametre yoktur; ajan kendi seçer.";
  const fail = (error: string) => ({ ok: false, credits: null, base, authMode: null, agentProfiles, note, error });
  if (!key) return fail("MANUS_API_KEY ayarlı değil.");

  let last: { status: number; msg: string } | null = null;
  for (const mode of ["apikey", "bearer"] as ManusAuthMode[]) {
    try {
      const res = await fetch(`${base}/v2/usage.availableCredits`, {
        headers: { "Content-Type": "application/json", ...manusAuthHeaders(key, mode) },
      });
      const j = await res.json().catch(() => ({}) as any);
      if (res.ok && j.ok !== false) {
        cachedAuthMode = mode;
        const credits = readCredits(j);
        return {
          ok: true,
          credits: typeof credits === "number" ? credits : null,
          base,
          authMode: mode,
          agentProfiles,
          note,
        };
      }
      last = { status: res.status, msg: j?.error?.message || j?.error?.code || `HTTP ${res.status}` };
      if (!isAuthFail(res.status, j)) break;
    } catch (e) {
      return fail((e as Error).message);
    }
  }
  return fail(
    `Manus: ${last?.msg || "bilinmeyen hata"} — anahtar geçersiz/silinmiş. manus.im → Settings → API keys'ten YENİ bir API anahtarı üretin.`,
  );
}

/**
 * Run a Manus agent task to completion.
 * `parts` is the message content; poll listMessages until agent_status is terminal.
 */
const AGENT_PROFILES = new Set(["manus-1.6-lite", "manus-1.6", "manus-1.6-max"]);

export async function runManusTask(
  parts: ContentPart[],
  opts: {
    ctx?: JobCtx;
    structuredSchema?: object;
    locale?: string;
    pollMs?: number;
    timeoutMs?: number;
    /** overrides the default env agent_profile for this task */
    agentProfile?: string;
  } = {},
): Promise<ManusResult> {
  const { ctx, structuredSchema, locale, pollMs = 3000, timeoutMs = 6 * 60 * 1000 } = opts;
  const profile = opts.agentProfile && AGENT_PROFILES.has(opts.agentProfile) ? opts.agentProfile : env.manusAgentProfile;

  // a sliced emoji in the source data can leave a lone UTF-16 surrogate, which
  // makes strict JSON body parsers 400 — scrub text parts before sending.
  for (const p of parts) {
    if (p && (p as any).type === "text" && typeof (p as any).text === "string") {
      (p as any).text = (p as any).text.replace(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
        "",
      );
    }
  }

  // space this task out from every other concurrent one (rate-limit guard)
  await throttleTaskSpawn();
  ctx?.throwIfCancelled();

  const before = await availableCredits();

  const created = await mfetch("/v2/task.create", {
    method: "POST",
    body: JSON.stringify({
      message: { content: parts },
      agent_profile: profile,
      hide_in_task_list: true,
      locale,
      structured_output_schema: structuredSchema,
    }),
  });
  const taskId: string = created.task_id;
  const taskUrl: string = created.task_url || "";
  ctx?.bindManusTask(taskId);

  const started = Date.now();
  let cursor: string | undefined;
  const attachments: ManusAttachment[] = [];
  const seenAtt = new Set<string>();
  const seenText = new Set<string>();
  let text = "";
  let structured: unknown;

  while (true) {
    ctx?.throwIfCancelled();
    if (Date.now() - started > timeoutMs) {
      await stopManusTask(taskId).catch(() => {});
      throw new ManusError("Manus görevi zaman aşımına uğradı.");
    }
    // jitter so many concurrent tasks don't poll listMessages in lockstep
    await new Promise((r) => setTimeout(r, pollMs + Math.floor(Math.random() * 1200)));

    const q = new URLSearchParams({ task_id: taskId, order: "asc", limit: "200" });
    if (cursor) q.set("cursor", cursor);
    const page = await mfetch(`/v2/task.listMessages?${q.toString()}`, { method: "GET" });
    // Manus returns messages under `messages` (v2); tolerate `data`/`events` too.
    const evs: any[] = page.messages || page.data || page.events || [];

    let terminal: string | null = null;
    for (const ev of evs) {
      if (ev.type === "assistant_message") {
        const am = ev.assistant_message || ev;
        const content: string = am.content || am.text || "";
        if (content && !seenText.has(content)) {
          seenText.add(content);
          text += (text ? "\n" : "") + content;
        }
        for (const a of am.attachments || ev.attachments || []) {
          const key = a?.url || a?.filename || JSON.stringify(a);
          if (a && !seenAtt.has(key)) {
            seenAtt.add(key);
            attachments.push(a);
          }
        }
      } else if (ev.type === "error_message") {
        throw new ManusError(`Manus görevi hata verdi: ${ev.error_message?.content || ev.error_message || "?"}`);
      } else if (ev.type === "structured_output_result") {
        if (ev.structured_output_result?.success) structured = ev.structured_output_result.value;
      } else if (ev.type === "status_update") {
        const st = ev.status_update?.agent_status;
        const brief = ev.status_update?.brief;
        if (brief && ctx) ctx.setStatus(brief);
        if (st === "stopped" || st === "error") terminal = st;
        else if (st === "waiting") {
          // non-interactive mode: nothing to answer -> stop and use what we have
          terminal = "stopped";
        }
      }
    }
    // Always resume after the last message we've seen — `has_more` is only set on
    // a FULL page, so gating the cursor on it would re-read the same tail forever
    // and we'd never catch the terminal status_update (→ 6-min timeout → skip).
    if (page.next_cursor) cursor = page.next_cursor;
    if (terminal) break;
  }

  // Prefer Manus's authoritative per-task cost. A global before/after balance
  // delta is only trustworthy when nothing else ran concurrently, so it is a
  // last-resort ESTIMATE (kept flagged) rather than the reported figure.
  let creditsUsed = 0;
  let creditsEstimated = true;
  const billed = await taskCreditCost(taskId);
  if (billed != null) {
    creditsUsed = billed;
    creditsEstimated = false;
  } else {
    const after = await availableCredits();
    if (before != null && after != null && before - after >= 0) {
      creditsUsed = Math.round(before - after);
    }
  }

  return { taskId, taskUrl, text, attachments, structured, creditsUsed, creditsEstimated };
}

export async function stopManusTask(taskId: string): Promise<void> {
  await mfetch("/v2/task.stop", { method: "POST", body: JSON.stringify({ task_id: taskId }) });
}

export type ManusSpeed = "fast" | "medium" | "slow";
/** Map a speed knob to an agent_profile + a prompt directive. Explicit profile wins. */
function speedConfig(speed?: ManusSpeed, explicitProfile?: string): { profile?: string; hint: string } {
  const p = explicitProfile && AGENT_PROFILES.has(explicitProfile) ? explicitProfile : undefined;
  if (speed === "fast")
    return { profile: p ?? "manus-1.6-lite", hint: "Prioritize SPEED over everything: a fast, acceptable result is fine; do not over-refine." };
  if (speed === "slow")
    return { profile: p ?? "manus-1.6-max", hint: "Prioritize MAXIMUM fidelity and quality: take the time needed, match fonts/colours/edges precisely." };
  return { profile: p ?? "manus-1.6", hint: "Balance speed and quality." };
}

const KEYCAP_GLOSSARY =
  '"原厂高度"/"原厂"/"original height"/"original factory"/"factory profile"/"factory height" = "Cherry Profile" (EXACTLY, capital P). ' +
  'BUT "OEM"/"OEM Profile"/"OEM高度" is a DIFFERENT, taller profile — render it "OEM Profile", NEVER "Cherry". ' +
  'Keep whatever profile the source actually states; do not substitute one profile for another. ' +
  '"球帽"/"SA高度" = "SA profile"; ' +
  '"热升华"/"五面热升华" = "dye-sublimation"; "PBT材质" = "PBT"; "透光" = "shine-through"; ' +
  '"客制化" = "custom / bespoke"; "轴体" = "switch"; "键帽" = "keycap". ' +
  'A big L-shaped Enter key means the set is an ISO layout.';

export interface ImageTranslateOut {
  sourceUrl: string;
  resultUrl: string | null; // null => no change needed / skipped
  changed: boolean;
  taskId: string;
  taskUrl: string;
  creditsUsed: number;
  creditsEstimated: boolean;
  /** which image model the prompt asked Manus to render with */
  model: string;
}

/**
 * Pick the image-generation model for a Manus render by credit head-room.
 * Manus's task API has NO model parameter — the only lever is asking the agent
 * in the prompt — so we choose here and inject a directive.
 *   • plenty of credits, or a large/detailed source → "Nano Banana Pro"
 *   • tight on credits (or balance unknown)         → "GPT Image 2" (cheaper)
 * `MANUS_BANANA_MIN_CREDITS` (default 250) sets the threshold.
 */
async function pickImageModel(sourceBytes: number): Promise<"Nano Banana Pro" | "GPT Image 2"> {
  const min = Number(process.env.MANUS_BANANA_MIN_CREDITS) || 250;
  const credits = await availableCredits();
  if (credits == null) return "GPT Image 2";
  const detailed = sourceBytes > 900 * 1024;
  if (credits >= min || (detailed && credits >= min / 2)) return "Nano Banana Pro";
  return "GPT Image 2";
}

/**
 * Translate ONLY the Chinese overlay/annotation text baked into a product image
 * into `targetLanguage`, leaving the product, its own printed markings, and the
 * background completely untouched. Domain-aware.
 */
export async function translateImage(opts: {
  imageUrl: string;
  targetLanguage: string; // "English", "Türkçe", ...
  productContext?: string; // e.g. normalised title + category props
  instruction?: string; // optional extra user command
  imageSpec?: string; // e.g. "~1500x1500 px, high quality"
  speed?: ManusSpeed;
  agentProfile?: string;
  ctx?: JobCtx;
}): Promise<ImageTranslateOut> {
  const { imageUrl, targetLanguage, productContext, instruction, imageSpec, speed, agentProfile, ctx } = opts;
  const { data, mime } = await imageToBase64(imageUrl);
  const spd = speedConfig(speed, agentProfile);
  const sourceBytes = Math.round((data.length * 3) / 4);
  const model = await pickImageModel(sourceBytes);

  const prompt = [
    `This is a SURGICAL TEXT-LAYER edit of a finished product image, NOT a redesign. You will return the EXACT same image with only the Chinese overlay text swapped for its ${targetLanguage} translation (and seller watermarks/off-topic marks erased). Treat every non-text pixel as locked.`,
    `IMAGE MODEL — prefer the "${model}" image model for this render if you have it; if not, use your best available image-editing model. Either way you MUST still return the edited image.`,
    "",
    "ABSOLUTE RULES — breaking any one of these fails the job:",
    "  • Do NOT move, resize, rotate, recolor, relight, restyle, redraw or 'improve' the product by even one pixel. It stays byte-for-byte where it is.",
    "  • Do NOT redraw or restyle icons, illustrations, badges, banners, boxes, brackets, lines, arrows or any decorative element. Their shape, size, position and style are fixed.",
    "  • Do NOT change the background, gradient, texture, colors, lighting, shadows, composition, layout, framing, canvas size or aspect ratio.",
    "  • Do NOT re-crop, un-crop, re-center, zoom, pan or add/remove margin. If the source image is cropped or cut off at an edge, the output is cropped or cut off IDENTICALLY at the same edge, the same amount.",
    "  • Do NOT re-flow, re-wrap or rearrange the layout of text blocks. Each block stays in its exact box.",
    "",
    "WHAT YOU MAY CHANGE — nothing else:",
    "STEP 1 — Identify the niche" +
      (productContext ? ` (seller context: ${productContext.slice(0, 400)})` : "") +
      " — only so you pick the right terminology.",
    "STEP 2 — Find every Chinese OVERLAY text block added on top of the photo (headlines, sub-headlines, callouts, spec labels, banner text, arrow captions, comparison captions, badge text).",
    `STEP 3 — Translate that overlay text into ${targetLanguage} ONLY (never any other language) with correct niche terminology. Glossary you MUST honour: ${KEYCAP_GLOSSARY} Never translate these literally. Keep it tight and natural.`,
    `STEP 4 — TYPOGRAPHIC RE-SETTING, not a plain-text paste. Replace each Chinese block IN PLACE so it looks like the ORIGINAL designer set that block in ${targetLanguage} from the start. Reproduce ALL of it: the same typeface CHARACTER (serif / geometric sans / rounded / condensed / handwritten-brush / display / pixel), the same weight, the same UPPER/lower case treatment, the same italic/oblique, the same letter-spacing and line-spacing, the same fill COLOR or gradient, the same outline/stroke, drop shadow, glow, bevel/3D, texture or knockout, the same alignment (left/center/right) and the same baseline. Match the original font SIZE. Only if the translation is physically too long for the exact original box, reduce the font size in small steps until it fits that SAME box — do not enlarge the box, do not move it, do not push other elements, do not re-wrap onto a different number of lines than the original unless the original box's width forces it. If the ORIGINAL text was itself clipped / cut off at an edge or box border, let the translation be clipped the SAME way in the SAME place — do not 'fix' it. A flat, default-font, style-stripped result is a FAILED job.`,
    "STEP 4b — REMOVE these overlaid marks (they are not the product), reconstructing exactly what was behind them so it looks untouched — no ghosting, blur patch or smear:",
    "  • Seller / shop name text and shop-type tags (\"…店\", \"旗舰店\", \"专卖店\", \"官方\", \"授权店\", personal seller names like \"徐老师…\") and the seller's own logo / wordmark / avatar badge.",
    "  • Watermarks: a single mark, a semi-transparent stamp, OR a repeating tiled pattern — sparse or dense, all of it.",
    "  • Off-topic text: URLs, WeChat/QQ/phone numbers, social handles, marketplace names (Taobao/Tmall/1688/Pinduoduo), 'scan to buy' / QR codes, anti-copy notices.",
    "  • KEEP the product's own real printed characters (Tab, Shift, key legends…), its genuine sculpted/printed design, and any manufacturer marking that is physically part of the product. Do NOT add a new brand.",
    `STEP 5 — No Chinese characters may remain in any overlay/caption text. ${NO_CJK_DIRECTIVE}`,
    "STEP 6 — In ALMOST every case you must RETURN THE EDITED IMAGE as a file attachment. Only if the image is genuinely free of BOTH Chinese overlay text AND any watermark/seller mark, reply with the single token NO_CHANGE_NEEDED ON ITS OWN as the very last line and attach nothing. If ANY Chinese overlay text is present you MUST translate it and return the image — never skip, and when unsure, translate. Do NOT write the token NO_CHANGE_NEEDED anywhere else in your reply.",
    instruction ? `\nAdditional instruction from the operator (still obey the ABSOLUTE RULES above): ${instruction}` : "",
    "\nRender at the EXACT same pixel dimensions and aspect ratio as the source — never resize, never pad, never crop differently." +
      (imageSpec ? ` (Operator hint, apply only if it does not change framing: ${imageSpec}.)` : ""),
    `\n${spd.hint}`,
    "\nReturn the final image as a file attachment.",
  ].join("\n");

  ctx?.setStatus(`Görsel çevriliyor (${model})…`);
  const res = await runManusTask(
    [
      { type: "text", text: prompt },
      { type: "file", file_data: `data:${mime};base64,${data}`, filename: "source.jpg", mime_type: mime },
    ],
    { ctx, locale: "en", timeoutMs: 12 * 60 * 1000, agentProfile: spd.profile },
  );

  // An actual returned image ALWAYS wins — only treat it as "nothing to do" when
  // there is no image AND the agent's final line was the NO_CHANGE token.
  const image = pickImageAttachment(res.attachments);
  const noChange = !image && saidNoChange(res.text);

  if (!image && !noChange) {
    // task finished but gave us neither an image nor a clean "nothing to do" —
    // surface it so the batch worker logs a real reason instead of silently skipping.
    throw new ManusError(
      `Manus çeviri görevi görsel döndürmedi (task ${res.taskId}). Yanıt: ${(res.text || "(boş)").slice(-300)}`,
    );
  }

  return {
    sourceUrl: imageUrl,
    resultUrl: image ? image.url : null,
    changed: !!image,
    taskId: res.taskId,
    taskUrl: res.taskUrl,
    creditsUsed: res.creditsUsed,
    creditsEstimated: res.creditsEstimated,
    model,
  };
}

export interface AltTextOut {
  sourceUrl: string;
  alt: string;
  taskId: string;
  taskUrl: string;
  creditsUsed: number;
  creditsEstimated: boolean;
}

/**
 * Manus, vision-based, DETAILED alt text for one product image — describes the
 * subject, camera angle/viewpoint, framing & position, background, lighting,
 * colours, materials and any visible text/props. Used for image SEO everywhere
 * (gallery, Shopify description embeds, Etsy per-image alt text).
 */
export async function altTextManus(opts: {
  imageUrl: string;
  productContext?: string;
  targetLanguage: string; // "English", "Türkçe", ...
  instruction?: string; // optional extra operator direction
  maxChars?: number; // Etsy caps alt text at 500
  ctx?: JobCtx;
}): Promise<AltTextOut> {
  const { imageUrl, productContext, targetLanguage, instruction, maxChars = 480, ctx } = opts;
  const { data, mime } = await imageToBase64(imageUrl);

  const prompt = [
    `Write ONE detailed alt-text sentence (max ${maxChars} characters) in ${targetLanguage} for this e-commerce product photo.`,
    productContext ? `Seller/product context: ${productContext.slice(0, 400)}` : "",
    instruction?.trim() ? `Operator direction (follow this): ${instruction.trim().slice(0, 500)}` : "",
    "Describe, naturally woven into a single flowing sentence:",
    "- the product/subject and what it is,",
    "- the camera angle / viewpoint (front, three-quarter, top-down / flat-lay, side, close-up macro, in-hand, on-body),",
    "- framing & where the product sits in the frame (centered, left third, filling the frame, with negative space),",
    "- the background / surface it is on,",
    "- lighting (soft daylight, studio, warm, high-contrast) and dominant colours,",
    "- key materials / finish, and any visible text, badge, prop or scale reference.",
    "Do NOT start with \"image of\", \"photo of\", \"a picture showing\". No line breaks, no lists, no quotes. Just the sentence.",
    NO_CJK_DIRECTIVE + " If the image has Chinese text, describe it in English (e.g. \"a spec label\"), never copy the characters.",
    "Reply with ONLY the alt text.",
  ]
    .filter(Boolean)
    .join("\n");

  ctx?.setStatus("Detaylı alt metin yazılıyor…");
  const res = await runManusTask(
    [
      { type: "text", text: prompt },
      { type: "file", file_data: `data:${mime};base64,${data}`, filename: "image.jpg", mime_type: mime },
    ],
    { ctx, locale: "en", timeoutMs: 4 * 60 * 1000 },
  );

  let alt = stripCJK(res.text.trim().replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s*\n\s*/g, " "));
  if (alt.length > maxChars) alt = alt.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";

  return {
    sourceUrl: imageUrl,
    alt,
    taskId: res.taskId,
    taskUrl: res.taskUrl,
    creditsUsed: res.creditsUsed,
    creditsEstimated: res.creditsEstimated,
  };
}

export interface ManusResearchOut {
  research: string;
  taskId: string;
  taskUrl: string;
  creditsUsed: number;
  creditsEstimated: boolean;
}

/**
 * Deep research of a product's CATEGORY via Manus (the agent can browse), returned
 * as structured markdown. Not this specific listing — the category in general.
 */
export async function researchCategoryManus(opts: {
  productTitle: string;
  props: Record<string, string>;
  question?: string;
  targetLanguage?: string; // "English", "Türkçe", ...
  speed?: ManusSpeed;
  agentProfile?: string;
  ctx?: JobCtx;
}): Promise<ManusResearchOut> {
  const { productTitle, props, question, targetLanguage = "English", speed, agentProfile, ctx } = opts;
  const spd = speedConfig(speed, agentProfile);
  const propLines = Object.entries(props)
    .slice(0, 16)
    .map(([k, v]) => `- ${k}: ${String(v).slice(0, 100)}`)
    .join("\n");

  const prompt = [
    `Research the PRODUCT CATEGORY of the item below (not this exact listing — the category in general). Output language: ${targetLanguage}.`,
    "",
    `PRODUCT: ${productTitle.slice(0, 300)}`,
    propLines ? `KNOWN PROPERTIES:\n${propLines}` : "",
    question?.trim() ? `\nFOCUS QUESTION: ${question.trim()}` : "",
    "",
    "Cover, as markdown sections with short bullets, whichever apply to this category:",
    "- Types / profiles / variants that exist and how they differ",
    "- Materials, finishes and how they wear over time",
    "- Manufacturing / printing methods and their durability",
    "- Size & compatibility rules (e.g. which keys/layouts a keyboard needs, sizing conventions)",
    "- Care / handling instructions",
    "- Common mistakes sellers make",
    "- Typical buyer questions and quality indicators",
    "Use correct standard terminology. If unsure, say 'varies'. No invented specs.",
    CHERRY_PROFILE_DIRECTIVE,
    NO_CJK_DIRECTIVE,
    "If this is a keycap set: a big L-shaped Enter key = ISO layout; a straight Enter = ANSI. If the listing offers both, say it varies by variant.",
    spd.hint,
    "Reply with ONLY the markdown research.",
  ]
    .filter(Boolean)
    .join("\n");

  ctx?.setStatus("Kategori araştırılıyor (Manus)…");
  const res = await runManusTask([{ type: "text", text: prompt }], {
    ctx,
    locale: "en",
    timeoutMs: 8 * 60 * 1000,
    agentProfile: spd.profile,
  });

  return {
    research: dropCJK(res.text.trim()),
    taskId: res.taskId,
    taskUrl: res.taskUrl,
    creditsUsed: res.creditsUsed,
    creditsEstimated: res.creditsEstimated,
  };
}

export interface ImageEditOut {
  sourceUrl: string;
  resultUrl: string | null;
  changed: boolean;
  taskId: string;
  taskUrl: string;
  creditsUsed: number;
  creditsEstimated: boolean;
}

/**
 * Free-form (NOT translation) image edit via Manus — applies an arbitrary
 * operator instruction to a product image and returns the edited image.
 */
export async function editImageManus(opts: {
  imageUrl: string;
  instruction: string;
  productContext?: string;
  imageSpec?: string;
  speed?: ManusSpeed;
  agentProfile?: string;
  ctx?: JobCtx;
}): Promise<ImageEditOut> {
  const { imageUrl, instruction, productContext, imageSpec, speed, agentProfile, ctx } = opts;
  const { data, mime } = await imageToBase64(imageUrl);
  const spd = speedConfig(speed, agentProfile);

  const prompt = [
    "You are a precise product-image editor. Apply EXACTLY this edit to the attached image and return the edited image as a file attachment:",
    `"${instruction.slice(0, 800)}"`,
    productContext ? `Product context: ${productContext.slice(0, 300)}.` : "",
    "Keep everything else unchanged unless the instruction explicitly says otherwise. Do NOT add watermarks, logos or extra text. Preserve the product's real proportions and colours unless asked.",
    `If the edit involves any text, ${CHERRY_PROFILE_DIRECTIVE} Any text in the result must be English — never leave or add Chinese characters.`,
    imageSpec ? `Output target: ${imageSpec}.` : "",
    spd.hint,
    "If the instruction genuinely cannot be applied, reply exactly with: NO_CHANGE_NEEDED",
  ]
    .filter(Boolean)
    .join("\n");

  ctx?.setStatus("Görsel düzenleniyor…");
  const res = await runManusTask(
    [
      { type: "text", text: prompt },
      { type: "file", file_data: `data:${mime};base64,${data}`, filename: "source.jpg", mime_type: mime },
    ],
    { ctx, locale: "en", timeoutMs: 6 * 60 * 1000, agentProfile: spd.profile },
  );

  const image = pickImageAttachment(res.attachments);
  const noChange = !image && saidNoChange(res.text);
  return {
    sourceUrl: imageUrl,
    resultUrl: noChange || !image ? null : image.url,
    changed: !noChange && !!image,
    taskId: res.taskId,
    taskUrl: res.taskUrl,
    creditsUsed: res.creditsUsed,
    creditsEstimated: res.creditsEstimated,
  };
}

export interface BrandResearchOut {
  brief: string;
  taskId: string;
  taskUrl: string;
  creditsUsed: number;
  creditsEstimated: boolean;
}

/**
 * Manus browses the brand's own website and returns a concise ART-DIRECTION
 * brief for on-brand product imagery. Hard rule: NEVER a dropshipping /
 * marketplace / AliExpress-Temu aesthetic — match the brand's real positioning.
 */
export async function researchBrandManus(opts: {
  brandUrl: string;
  productTitle?: string;
  targetLanguage?: string;
  speed?: ManusSpeed;
  agentProfile?: string;
  ctx?: JobCtx;
}): Promise<BrandResearchOut> {
  const { brandUrl, productTitle, targetLanguage = "English", speed, agentProfile, ctx } = opts;
  const spd = speedConfig(speed, agentProfile);

  const prompt = [
    `Visit and DEEPLY study this brand's own website: ${brandUrl.trim()}`,
    "Look at multiple pages — home, a collection / shop page, 2–3 product pages, the about / story page,",
    "and the footer. Study their real photography, not just the copy.",
    productTitle ? `The product we will be creating imagery for: ${productTitle.slice(0, 200)}.` : "",
    "",
    "Produce a DETAILED, SPECIFIC CREATIVE / ART-DIRECTION BRIEF an art director would follow to generate",
    "on-brand product imagery. Use these markdown sections, each with concrete detail (not vague adjectives):",
    "- BRAND POSITIONING: what the brand is, price tier, category, the exact target customer, how it differs from rivals.",
    "- VISUAL IDENTITY: logo treatment, the full colour palette with HEX values where readable, primary/secondary",
    "  typography (serif/sans, weight, feel), graphic motifs, use of whitespace.",
    "- PHOTOGRAPHY STYLE: describe their actual shots — background materials & colours, surfaces, prop vocabulary,",
    "  styling density, lighting (direction, hardness, colour temperature), typical camera angles & crops,",
    "  depth of field, colour grading / contrast / saturation, shadow treatment, and how much negative space.",
    "- SCENES & CONTEXTS: the real environments/settings they place products in (with 3–5 examples).",
    "- TONE & MOOD: the feeling every image should convey, in the brand's own words if visible.",
    "- DO: 6–8 concrete, checkable things imagery for this brand SHOULD do.",
    "- DON'T: 6–8 concrete things it must avoid.",
    "- ONE-LINE SUMMARY the model can prepend to any image prompt.",
    "",
    "HARD RULES:",
    "- This is a real, independent, design-led brand. It is NOT a dropshipping store, NOT an AliExpress / Temu /",
    "  Wish / generic-marketplace seller. NEVER describe, recommend or imply that aesthetic: no cluttered photo",
    "  collages, rainbow/neon gradients, fake discount starbursts, price tags, 'SALE' badges, arrow call-outs,",
    "  checkmark bullet graphics, red circles, stock watermarks, lens-flare kitsch, plastic HDR, cheap",
    "  drop-shadow cut-outs on white, or over-saturated 'infographic' packshots.",
    "- If the site cannot be reached, say so in one line, then infer a thorough, premium-leaning brief from the",
    "  product itself and category best practice — still hit the length below.",
    `- Output ${targetLanguage} markdown, AT LEAST 500 words (aim 550–800), thorough and specific. No Chinese characters anywhere.`,
    spd.hint,
    "Reply with ONLY the brief.",
  ]
    .filter(Boolean)
    .join("\n");

  ctx?.setStatus("Marka sitesi araştırılıyor…");
  const res = await runManusTask([{ type: "text", text: prompt }], {
    ctx,
    locale: "en",
    timeoutMs: 8 * 60 * 1000,
    agentProfile: spd.profile,
  });

  return {
    brief: dropCJK(res.text.trim()),
    taskId: res.taskId,
    taskUrl: res.taskUrl,
    creditsUsed: res.creditsUsed,
    creditsEstimated: res.creditsEstimated,
  };
}

export interface ImageComposeOut {
  resultUrl: string | null;
  changed: boolean;
  taskId: string;
  taskUrl: string;
  creditsUsed: number;
  creditsEstimated: boolean;
}

/**
 * AI-generate ONE brand-new image (ad banner, lifestyle scene, collage, clean
 * studio shot, background swap…) from 1–20 source product photos via Manus.
 * The product itself must stay accurate; only the composition/scene is new.
 */
export async function composeImagesManus(opts: {
  imageUrls: string[];
  instruction: string;
  productContext?: string;
  brandBrief?: string;
  imageSpec?: string;
  speed?: ManusSpeed;
  agentProfile?: string;
  ctx?: JobCtx;
}): Promise<ImageComposeOut> {
  const { imageUrls, instruction, productContext, brandBrief, imageSpec, speed, agentProfile, ctx } = opts;
  const spd = speedConfig(speed, agentProfile);
  const srcs = imageUrls.slice(0, 20);

  const prompt = [
    "You are a senior e-commerce creative director. Using ONLY the attached product photo(s) as source",
    "material, create ONE brand-new, professionally designed image and return it as a file attachment.",
    "",
    `BRIEF:\n${instruction.slice(0, 6000)}`,
    "",
    brandBrief?.trim()
      ? `BRAND BRIEF (match this brand's identity exactly — positioning, palette, lighting, styling, tone):\n${brandBrief.trim().slice(0, 6000)}`
      : "",
    productContext ? `Product context: ${productContext.slice(0, 300)}.` : "",
    `${srcs.length} source image(s) attached.`,
    "RULES:",
    "- The real product must stay accurate: same shape, colours, proportions, textures and any real printed markings.",
    "- Do NOT invent a different product, and do NOT add fake logos, brand names, prices or claims.",
    "- Clean, balanced, modern composition. If you add text, keep it minimal, in English, correctly spelled — never any Chinese characters.",
    "- This is a real independent premium brand: NEVER a dropshipping / AliExpress / Temu / generic-marketplace look — no cluttered collages, rainbow gradients, discount badges, arrows, checkmark call-outs, stock watermarks or plastic HDR.",
    CHERRY_PROFILE_DIRECTIVE,
    imageSpec ? `Output target: ${imageSpec}.` : "Output a high-resolution square image (at least 1500×1500).",
    spd.hint,
    "Return only the finished image.",
  ]
    .filter(Boolean)
    .join("\n");

  const parts: ContentPart[] = [{ type: "text", text: prompt }];
  for (let i = 0; i < srcs.length; i++) {
    ctx?.throwIfCancelled();
    ctx?.setStatus(`Kaynak görsel ${i + 1}/${srcs.length} yükleniyor…`);
    const { data, mime } = await imageToBase64(srcs[i]);
    parts.push({ type: "file", file_data: `data:${mime};base64,${data}`, filename: `src${i + 1}.jpg`, mime_type: mime });
  }

  ctx?.setStatus("Yeni görsel oluşturuluyor…");
  const res = await runManusTask(parts, { ctx, locale: "en", timeoutMs: 9 * 60 * 1000, agentProfile: spd.profile });
  const image = pickImageAttachment(res.attachments);
  return {
    resultUrl: image?.url ?? null,
    changed: !!image,
    taskId: res.taskId,
    taskUrl: res.taskUrl,
    creditsUsed: res.creditsUsed,
    creditsEstimated: res.creditsEstimated,
  };
}

