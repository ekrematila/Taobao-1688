import { readFileSync, existsSync } from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env.ts";
import { getSetting, setSetting } from "./db.ts";
import type { GeneratedListing, NormalisedProduct, ProductImage } from "@shared/types.ts";
import { renderImportBody } from "@shared/descLayouts.ts";
import { descBodyImages, outputVariants, publicImageUrl } from "@shared/listingFormat.ts";
import { mediaPath } from "./imagestore.ts";
import { resolveCategory, findTaxonomy, TAXONOMY } from "./taxonomy.ts";

/** Shopify store creds — DB setting wins over .env (same pattern as the other keys). */
export const activeShopifyDomain = (): string => normShop(getSetting("shopify_domain") || env.shopifyDomain || "");
export const activeShopifyToken = (): string => (getSetting("shopify_token") || env.shopifyToken || "").trim();
export const activeShopifyClientId = (): string => (getSetting("shopify_client_id") || env.shopifyClientId || "").trim();
export const activeShopifyClientSecret = (): string =>
  (getSetting("shopify_client_secret") || env.shopifyClientSecret || "").trim();

/** normalise a store domain input → "<name>.myshopify.com" or "" if not one. */
export function normShop(input: string): string {
  const s = String(input || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase();
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) return s;
  if (/^[a-z0-9][a-z0-9-]*$/.test(s)) return `${s}.myshopify.com`; // bare handle
  return "";
}

/** Scopes we ask for. write_inventory covers the HS-code / country-of-origin PUTs. */
export const SHOPIFY_SCOPES =
  "write_products,read_products,write_inventory,read_inventory,read_customers,read_orders,read_all_orders";

// OAuth CSRF state — persisted in the DB so it survives a tsx-watch restart
// between the authorize redirect and the callback.
const getOAuthState = () => getSetting("shopify_oauth_state") || "";
const setOAuthState = (v: string) => setSetting("shopify_oauth_state", v);

/** Build the Shopify OAuth authorize URL. `redirectUri` must also be in the app's
 *  Allowed redirection URL(s). */
export function shopifyOAuthStart(shopInput: string, redirectUri: string): string {
  const shop = normShop(shopInput);
  if (!shop) throw new ShopifyError("Geçerli bir <isim>.myshopify.com adresi gir.", 400);
  const clientId = activeShopifyClientId();
  if (!clientId) throw new ShopifyError("Önce Client ID + Secret'ı Ayarlar'a kaydet.", 400);
  const state = randomBytes(16).toString("hex");
  setOAuthState(state);
  const q = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${q.toString()}`;
}

/**
 * Handle the OAuth callback: verify HMAC + state, exchange the code for an
 * OFFLINE access token, and persist token + shop. `rawQuery` is the URL's raw
 * query string (values still URL-encoded, as Shopify signed them).
 */
export async function shopifyOAuthCallback(rawQuery: string): Promise<{ shop: string; scope: string }> {
  const params = new URLSearchParams(rawQuery);
  const code = params.get("code") || "";
  const hmac = params.get("hmac") || "";
  const shop = normShop(params.get("shop") || "");
  const state = params.get("state") || "";
  if (!code || !hmac || !shop) throw new ShopifyError("OAuth: eksik parametre.", 400);

  const expectedState = getOAuthState();
  if (!expectedState || state !== expectedState) {
    throw new ShopifyError("OAuth: state uyuşmuyor (tekrar dene).", 400);
  }

  // HMAC: Shopify signs the RAW query string. Take the raw "key=value" pairs
  // verbatim (do NOT url-decode — the base64 `host` param would change),
  // drop hmac/signature, sort lexicographically, join with "&".
  const secret = activeShopifyClientSecret();
  if (!secret) throw new ShopifyError("OAuth: Client Secret kayıtlı değil.", 400);
  const msg = rawQuery
    .split("&")
    .filter((p) => p && !/^(hmac|signature)=/.test(p))
    .sort()
    .join("&");
  const digest = createHmac("sha256", secret).update(msg).digest("hex");
  const ok =
    digest.length === hmac.length && timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
  if (!ok) throw new ShopifyError("OAuth: HMAC doğrulanamadı.", 400);

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: activeShopifyClientId(), client_secret: secret, code }),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !j.access_token) {
    throw new ShopifyError(`OAuth token alınamadı (${res.status}): ${JSON.stringify(j).slice(0, 200)}`, 502);
  }
  setSetting("shopify_token", String(j.access_token));
  setSetting("shopify_domain", shop);
  setOAuthState("");
  return { shop, scope: String(j.scope || "") };
}

const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/** A locally-hosted /api/media image → { attachment } for Shopify to host it. */
function localImageAttachment(u: string): { attachment: string; filename: string } | null {
  const m = /^\/api\/media\/([a-zA-Z0-9._-]+)$/.exec(String(u || "").split("#")[0]);
  if (!m) return null;
  const p = mediaPath(m[1]);
  if (!existsSync(p)) return null;
  return { attachment: readFileSync(p).toString("base64"), filename: m[1] };
}

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export function shopifyConfigured(): boolean {
  return Boolean(activeShopifyDomain() && activeShopifyToken());
}

function field(listing: GeneratedListing, key: string): string {
  return listing.fields.find((f) => f.key === key)?.value ?? "";
}

/** Live check: does the token work against this store? Used by Settings → "Doğrula". */
export async function verifyShopify(
  overrideDomain?: string,
  overrideToken?: string,
): Promise<{ ok: boolean; shop?: string; plan?: string; error?: string }> {
  let domain = (overrideDomain || activeShopifyDomain())
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
  const token = (overrideToken || activeShopifyToken()).trim();
  if (!domain || !token) return { ok: false, error: "Mağaza adresi ve Admin API token gerekli." };
  if (/^shpss_/.test(token) || /^[0-9a-f]{32}$/.test(token) || /^prtapi_/.test(token))
    return {
      ok: false,
      error:
        "Bu bir Admin API access token DEĞİL (Client Secret / Client ID / Partner token). OAuth ile bağlanmak için 'Shopify'a bağlan' butonunu kullan, ya da bir custom app'ten 'shpat_…' token'ı gir.",
    };
  if (!/\.myshopify\.com$/.test(domain)) {
    return {
      ok: false,
      error:
        "Mağaza adresi '<isim>.myshopify.com' olmalı — özel alan adı (keyartisan.net) DEĞİL. admin.shopify.com/store/<isim> URL'sindeki <isim> + '.myshopify.com'.",
    };
  }
  try {
    const res = await fetch(`https://${domain}/admin/api/${env.shopifyApiVersion}/shop.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    const j = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) return { ok: false, error: `Shopify ${res.status}: ${JSON.stringify(j.errors || j).slice(0, 200)}` };
    return { ok: true, shop: j.shop?.myshopify_domain || domain, plan: j.shop?.plan_name };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Create a draft product in the configured Shopify store. Returns the admin URL. */
export async function pushToShopify(
  product: NormalisedProduct,
  listing: GeneratedListing,
): Promise<{ adminUrl: string; id: number }> {
  const shopToken = activeShopifyToken();
  if (!shopifyConfigured()) throw new ShopifyError("Shopify yapılandırılmamış (Ayarlar → Shopify).", 400);

  const domain = activeShopifyDomain();
  const url = `https://${domain}/admin/api/${env.shopifyApiVersion}/products.json`;

  // Build ONE ordered upload list: product-card photos (gallery + variant) first,
  // then the in-description images. Each entry carries the body_html placeholder
  // it corresponds to (`bodyKey`) so we can swap it for Shopify's CDN URL after
  // the create. A public https url is uploaded by `src`; a locally-edited
  // /api/media image is uploaded by base64 `attachment` (so nothing is dropped).
  type Up = { src?: string; attachment?: string; filename?: string; alt: string; bodyKey?: string };
  const uploads: Up[] = [];
  const seen = new Set<string>();
  const addUp = (
    im: Pick<ProductImage, "url" | "originalUrl" | "translatedFrom" | "remoteUrl" | "srcUrl" | "alt">,
    bodyKey?: string,
  ) => {
    // Prefer the operator's EDITED image: if it's a local /api/media file that
    // exists, upload its bytes. Only fall back to a public URL (the pre-edit
    // original via srcUrl) when there's no local file to upload.
    const local = localImageAttachment(im.url || "");
    const pub = local ? null : publicImageUrl(im);
    if (!pub && !local) return null;
    const key = pub || im.url;
    if (seen.has(key)) return uploads.find((u) => (u.src || `/api/media/${u.filename}`) === key) || null;
    seen.add(key);
    const u: Up = local ? { ...local, alt: im.alt || "", bodyKey } : { src: pub!, alt: im.alt || "", bodyKey };
    uploads.push(u);
    return u;
  };

  for (const im of product.images.filter((x) => x.role === "gallery" || x.role === "variant")) addUp(im);
  for (const v of product.variants ?? []) if (v.imageUrl) addUp({ url: v.imageUrl, alt: v.nameTranslated || v.name || "" });

  // Shopify description is always visual — every "Açıklama görselleri" strip goes
  // into body_html (up to 20, best-first). Local edits included via attachment.
  const descImgs = descBodyImages(product.images, 20);
  const descImages: { url: string; alt: string; crop?: (typeof descImgs)[number]["descCrop"] }[] = [];
  for (const im of descImgs) {
    const bodyKey = publicImageUrl(im) || im.url; // placeholder that renderImportBody will emit
    const u = addUp(im, bodyKey);
    if (u) descImages.push({ url: bodyKey, alt: im.alt || "", crop: im.descCrop });
  }

  // A product create with MANY base64 `attachment` images in one request can trip
  // a 413 (Payload Too Large) — Shopify/CDN cap the request body well under what
  // a handful of edited photos add up to. Only genuinely-remote (`src`) images go
  // in the CREATE payload; local edits are uploaded ONE BY ONE right after, each
  // its own small request, then the gallery order + body_html are fixed in a
  // single follow-up PUT.
  const remoteForCreate = uploads.filter((u) => u.src).map(({ bodyKey, ...rest }) => rest);
  const localUploads = uploads.filter((u) => u.attachment);

  // sanitiser-safe body — Shopify strips <style>/<input>/<label>/class from
  // body_html; same output as the CSV export (src/lib/export.ts importBodyHtml).
  let bodyHtml = renderImportBody(listing.layout, field(listing, "description"), descImages, {
    name: field(listing, "title") || product.titleTranslated || product.title,
    props: product.props,
  });

  const vlist = outputVariants(product, listing);
  const split = (v: (typeof vlist)[number]) =>
    (v.nameTranslated || v.name || "Default").split(/\s*\/\s*/).slice(0, 3);
  const axisCount = Math.max(1, ...vlist.map((v) => split(v).length));
  const options =
    vlist.length > 1
      ? Array.from({ length: axisCount }, (_, i) => ({ name: axisCount > 1 ? `Option ${i + 1}` : "Option" }))
      : undefined;
  const wKg = (v: (typeof vlist)[number]) => v.weightKg ?? product.weightKg ?? null;
  const variants = vlist.map((v) => {
    const parts = split(v);
    const w = wKg(v);
    return {
      option1: options ? parts[0] || "Default" : undefined,
      option2: options && axisCount > 1 ? parts[1] || "-" : undefined,
      option3: options && axisCount > 2 ? parts[2] || "-" : undefined,
      price: v.price != null ? String(v.price) : "0.00",
      compare_at_price: v.compareAtPrice != null ? String(v.compareAtPrice) : null,
      sku: v.sku,
      grams: w != null ? Math.round(w * 1000) : undefined,
      weight: w != null ? w : undefined,
      weight_unit: w != null ? "kg" : undefined,
      inventory_management: null,
    };
  });

  // Category: the operator's explicit pick wins (saved GID, then the free-text
  // path), else the auto-classifier over the FULL bundled taxonomy.
  const taxNode =
    (product.categoryGid && TAXONOMY.find((n) => n.gid === product.categoryGid)) ||
    findTaxonomy(product.category || "") ||
    resolveCategory(product.shopType || product.category || "", product);
  // Type = EXACTLY what the operator typed at the top of the app; only fall back
  // to the taxonomy leaf when they left it blank.
  const productType = product.shopType?.trim() || taxNode.path.split(" > ").pop() || undefined;

  // handle = slug of the final title (Shopify would auto-derive the same, but we
  // set it explicitly so it's stable / predictable).
  const finalTitle = field(listing, "title") || product.titleTranslated || product.title;
  const handle = finalTitle
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  // Shopify taxonomy attribute picks → one safe custom JSON metafield on create
  // (human-readable per-attribute text metafields are a best-effort follow-up).
  const attrPicks = product.attributes || {};
  const attrEntries = Object.entries(attrPicks).filter(([, p]) => p?.valueNames?.length);
  const attrMetafield =
    attrEntries.length > 0
      ? {
          namespace: "custom",
          key: "taxonomy_attributes",
          type: "json",
          value: JSON.stringify(
            Object.fromEntries(attrEntries.map(([h, p]) => [h, { name: p.attrName, values: p.valueNames }])),
          ),
        }
      : null;

  const body = {
    product: {
      title: finalTitle,
      handle: handle || undefined,
      body_html: bodyHtml,
      tags: field(listing, "tags"),
      product_type: productType,
      category: taxNode.gid || undefined,
      status: "draft",
      options,
      variants: variants.length ? variants : undefined,
      images: remoteForCreate.length ? remoteForCreate : undefined,
      metafields: attrMetafield ? [attrMetafield] : undefined,
      metafields_global_title_tag: field(listing, "seo_title") || undefined,
      metafields_global_description_tag: field(listing, "seo_description") || undefined,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": shopToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    if (res.status === 413) {
      throw new ShopifyError(
        `Shopify 413: İstek çok büyük. Ana/varyant görsel sayısı ya da boyutu fazla olabilir — ` +
          `bu istekte ${remoteForCreate.length} uzak görsel gönderildi (${localUploads.length} düzenlenmiş yerel görsel ayrı yüklenecekti, bu hata onlara ulaşılamadan oluştu). Görsel sayısını azaltıp tekrar dene.`,
        413,
      );
    }
    throw new ShopifyError(`Shopify ${res.status}: ${JSON.stringify(json.errors || json).slice(0, 300)}`);
  }
  const id = json.product?.id;

  // Map each ORIGINAL upload (in its intended display order) to its Shopify
  // image once created — remote ones came back with the create response
  // (aligned 1:1 with `remoteForCreate`); local ones are uploaded individually
  // next (small requests, immune to the 413 that a bundled create risked).
  const createdRemote: any[] = json.product?.images ?? [];
  const byUpload = new Map<Up, { id: number; src: string }>();
  let ri = 0;
  for (const u of uploads) {
    if (u.src) {
      const c = createdRemote[ri++];
      if (c) byUpload.set(u, { id: c.id, src: c.src });
    }
  }
  if (localUploads.length && id) {
    const results = await Promise.allSettled(
      localUploads.map((u) =>
        fetch(`https://${domain}/admin/api/${env.shopifyApiVersion}/products/${id}/images.json`, {
          method: "POST",
          headers: { "X-Shopify-Access-Token": shopToken, "Content-Type": "application/json" },
          body: JSON.stringify({ image: { attachment: u.attachment, filename: u.filename, alt: u.alt } }),
        }).then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => ({}))) as any })),
      ),
    );
    results.forEach((r, i) => {
      const u = localUploads[i];
      if (r.status === "fulfilled" && r.value.ok && r.value.j?.image) {
        byUpload.set(u, { id: r.value.j.image.id, src: r.value.j.image.src });
      }
    });
  }

  // Swap each body_html placeholder (alicdn / /api/media) for the permanent
  // Shopify CDN URL, and restore the operator's intended gallery order (local
  // uploads landed at the end of the list) — one combined follow-up PUT.
  let rewrote = false;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const u of uploads) {
    const created = byUpload.get(u);
    if (!u.bodyKey || !created) continue;
    for (const form of [u.bodyKey, esc(u.bodyKey)]) {
      if (bodyHtml.includes(form)) {
        bodyHtml = bodyHtml.split(form).join(created.src);
        rewrote = true;
      }
    }
  }
  const orderedImages = uploads
    .map((u) => byUpload.get(u))
    .filter((c): c is { id: number; src: string } => !!c)
    .map((c, i) => ({ id: c.id, position: i + 1 }));
  if (id && (rewrote || localUploads.length)) {
    await fetch(`https://${domain}/admin/api/${env.shopifyApiVersion}/products/${id}.json`, {
      method: "PUT",
      headers: { "X-Shopify-Access-Token": shopToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        product: {
          id,
          body_html: rewrote ? bodyHtml : undefined,
          images: orderedImages.length ? orderedImages : undefined,
        },
      }),
    }).catch(() => {});
  }

  // Human-readable per-attribute metafields (namespace "custom", key = the
  // taxonomy attribute handle with dashes → underscores). Best-effort: a failure
  // here never affects the created draft.
  if (attrEntries.length && id) {
    await Promise.allSettled(
      attrEntries.map(([h, p]) =>
        fetch(`https://${domain}/admin/api/${env.shopifyApiVersion}/products/${id}/metafields.json`, {
          method: "POST",
          headers: { "X-Shopify-Access-Token": shopToken, "Content-Type": "application/json" },
          body: JSON.stringify({
            metafield: {
              namespace: "custom",
              key: h.replace(/-/g, "_").slice(0, 30),
              type: p.valueNames.length > 1 ? "list.single_line_text_field" : "single_line_text_field",
              value:
                p.valueNames.length > 1 ? JSON.stringify(p.valueNames) : p.valueNames[0],
            },
          }),
        }),
      ),
    );
  }

  // HS code + country of origin live on the inventory item, not the variant —
  // best-effort follow-up PUTs (never fatal to the create).
  const created: any[] = json.product?.variants ?? [];
  const needCustoms = vlist.some(
    (v) => v.hsCode || product.hsCode || v.countryOfOrigin || product.originCountry,
  );
  if (needCustoms && created.length) {
    await Promise.allSettled(
      created.map((cv, i) => {
        const v = vlist[i] || {};
        const hs = v.hsCode || product.hsCode || "";
        const co = (v.countryOfOrigin || product.originCountry || "").toUpperCase().slice(0, 2);
        if (!hs && !co) return Promise.resolve();
        return fetch(
          `https://${domain}/admin/api/${env.shopifyApiVersion}/inventory_items/${cv.inventory_item_id}.json`,
          {
            method: "PUT",
            headers: { "X-Shopify-Access-Token": shopToken, "Content-Type": "application/json" },
            body: JSON.stringify({
              inventory_item: {
                id: cv.inventory_item_id,
                harmonized_system_code: hs || undefined,
                country_code_of_origin: /^[A-Z]{2}$/.test(co) ? co : undefined,
              },
            }),
          },
        );
      }),
    );
  }

  return { id, adminUrl: `https://${domain}/admin/products/${id}` };
}
