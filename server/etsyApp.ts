// Bridge to the "Etsy Command Center" companion app.
//
// One click in the Delivery studio (Etsy channel) sends the draft there as a
// LOCAL draft — the other app never auto-publishes to Etsy. That app already
// ships a purpose-built reader for our exact `{ product, listing }` shape
// (`server/src/services/productstudio.js` over there), so all we do is POST it.
//
// Nothing Shopify-specific is sent: the Etsy `GeneratedListing` carries only
// Etsy fields (title / title_alt / description plain-text / tags), and the
// receiver ignores `descHtml`. `tags_pool` (up to 50 CANDIDATE tags, kept
// only for this app's own chip picker) is stripped before it ever leaves —
// it has no purpose on the receiving end and risks the companion app using
// it instead of the operator's actual, capped `tags` selection.

import { env } from "./env.ts";
import { getSetting, setSetting } from "./db.ts";
import { cleanTag } from "@shared/listingFormat.ts";
import type { GeneratedListing, NormalisedProduct } from "@shared/types.ts";

const PATH = "/api/integrations/product-studio";

/**
 * Etsy hard-caps a listing at 13 tags, 20 chars each. `tags` is normally
 * already exactly the operator's top-13 pick (finalizeEtsyTags() in
 * listingFormat.ts caps it at generation time, and the chip-picker enforces
 * the cap on every toggle) — but the field is also a free-text `<input>` in
 * the editor with NO enforcement on manual typing, so a hand-edit can drift
 * past 13, carry duplicates, or an over-length tag. Clamp defensively here
 * so whatever reaches the companion app is exactly what Etsy itself accepts.
 */
function sanitizeEtsyTags(raw: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw || "").split(/[,\n]/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.length > 20 ? cleanTag(t) || t.slice(0, 20).trim() : t);
    if (out.length >= 13) break;
  }
  return out.join(", ");
}

/** Drop Shopify-only / UI-only fields and clamp `tags` before the draft
 *  crosses to the companion app — see module header + sanitizeEtsyTags(). */
export function withCleanEtsyFields(listing: GeneratedListing): GeneratedListing {
  return {
    ...listing,
    fields: listing.fields
      .filter((f) => f.key !== "seo_description" && f.key !== "tags_pool")
      .map((f) => (f.key === "tags" ? { ...f, value: sanitizeEtsyTags(f.value) } : f)),
  };
}

/**
 * The companion app is a SEPARATE service — it can only ever load an image by
 * fetching a real https URL, never our app-relative `/api/media/...` path
 * (that's only reachable within THIS server's own request handling, e.g. the
 * Visual Workspace running in the same origin). An operator's local edit
 * (crop / erase / translate / logo) is saved under exactly that relative
 * path, so sending the draft as-is silently drops every edited image — the
 * Etsy app just can't reach it. Made absolute against our own public origin
 * (which really does serve /api/media/* publicly), the same bytes the
 * operator is looking at become fetchable from anywhere.
 */
function absolutizeMedia(u: string | undefined): string | undefined {
  const s = String(u ?? "").trim();
  if (!s || /^https?:\/\//i.test(s) || s.startsWith("//")) return u;
  if (s.startsWith("/")) return `${env.appPublicUrl}${s}`;
  return u;
}

export function withAbsoluteMedia(product: NormalisedProduct): NormalisedProduct {
  return {
    ...product,
    images: product.images.map((im) => ({ ...im, url: absolutizeMedia(im.url) ?? im.url })),
    variants: product.variants.map((v) => (v.imageUrl ? { ...v, imageUrl: absolutizeMedia(v.imageUrl) } : v)),
    videoUrl: absolutizeMedia(product.videoUrl),
  };
}

export class EtsyAppError extends Error {
  constructor(
    message: string,
    // NEVER 502/504/520-527 — Cloudflare silently replaces the response body
    // with its own HTML error page for those, so the client's JSON.parse()
    // blows up on "<!DOCTYPE..." instead of ever seeing our error message.
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Settings-page value wins over .env. Trailing slashes trimmed. */
export function etsyAppBaseUrl(): string {
  return (getSetting("etsy_app_url") || env.etsyAppUrl).replace(/\/+$/, "");
}
export function etsyAppKey(): string {
  return getSetting("etsy_app_key") || env.etsyAppKey;
}
export function etsyAppConfigured(): boolean {
  return Boolean(etsyAppBaseUrl() && etsyAppKey());
}

async function getJson(url: string, ms = 5000): Promise<{ ok: boolean; status: number; json: any }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    throw new EtsyAppError(`Etsy uygulamasına ulaşılamadı (${url.replace(PATH + "/product", "").replace(PATH, "")}). Açık mı?`, 400);
  }
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/**
 * Pair with the companion app. Its contract endpoint is unguarded and
 * same-machine only, so it hands back the pairing key — one click, no copy-paste.
 * Saves `etsy_app_url` + `etsy_app_key`.
 */
export async function pairEtsyApp(rawUrl?: string): Promise<{ url: string; connected: boolean }> {
  const base = (rawUrl || etsyAppBaseUrl()).replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) throw new EtsyAppError("Geçerli bir adres gir (ör. https://keyartisan.us/etsy-shopify).", 400);
  const { ok, status, json } = await getJson(`${base}${PATH}`);
  if (!ok) throw new EtsyAppError(`Etsy uygulaması ${status} döndü — adres doğru mu? (${base})`, 400);
  if (!json?.key) throw new EtsyAppError("Etsy uygulaması eşleşme anahtarı vermedi (sürümü güncel mi?).", 400);
  setSetting("etsy_app_url", base);
  setSetting("etsy_app_key", String(json.key));
  return { url: base, connected: true };
}

export interface EtsyAppShop {
  id: string;
  name: string;
}

/** The companion app's connected Etsy shops, for the "which shop?" picker —
 *  read off the same unguarded contract endpoint used for pairing. Multiple
 *  shops can be paired there now, so a push MUST name one explicitly instead
 *  of silently landing on "whichever shop happens to be active" over there. */
export async function etsyAppShops(): Promise<EtsyAppShop[]> {
  const base = etsyAppBaseUrl();
  let ok = false;
  let json: any = {};
  try {
    ({ ok, json } = await getJson(`${base}${PATH}`));
  } catch {
    return []; // companion app unreachable — an empty picker, not a crash
  }
  if (!ok || !Array.isArray(json?.shops)) return [];
  return json.shops
    .map((s: any) => ({
      id: String(s?.id ?? s?.shopId ?? s?.shop_id ?? "").trim(),
      name: String(s?.name ?? s?.shopName ?? s?.shop_name ?? s?.id ?? "").trim(),
    }))
    .filter((s: EtsyAppShop) => s.id);
}

/** Is the companion app reachable right now? */
export async function etsyAppStatus(): Promise<{ configured: boolean; url: string; reachable: boolean }> {
  const url = etsyAppBaseUrl();
  let reachable = false;
  try {
    const { ok } = await getJson(`${url}${PATH}`, 4000);
    reachable = ok;
  } catch {
    /* not reachable */
  }
  return { configured: etsyAppConfigured(), url, reachable };
}

/** Send one Etsy draft to the companion app as a local draft. */
export async function pushToEtsyApp(
  product: NormalisedProduct,
  listing: GeneratedListing,
  opts: { dryRun?: boolean; shopId?: string } = {},
): Promise<any> {
  const base = etsyAppBaseUrl();
  const key = etsyAppKey();
  if (!key) throw new EtsyAppError("Etsy uygulaması bağlı değil — önce Ayarlar'dan eşleştir.", 400);
  const shopId = String(opts.shopId || "").trim();
  if (!shopId) throw new EtsyAppError("Hangi mağazaya gönderileceği seçilmedi.", 400);

  let res: Response;
  try {
    res = await fetch(`${base}${PATH}/product${opts.dryRun ? "?dryRun=1" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Product-Studio-Key": key },
      body: JSON.stringify({ product: withAbsoluteMedia(product), listing: withCleanEtsyFields(listing), shopId }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new EtsyAppError(`Etsy uygulamasına ulaşılamadı (${base}). Açık mı?`, 400);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new EtsyAppError(json?.error || `Etsy uygulaması ${res.status} döndü.`, 400);
  }
  return json;
}
