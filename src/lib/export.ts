import JSZip from "jszip";
import type { GeneratedListing, NormalisedProduct, ProductImage } from "@shared/types.ts";
import { flattenHtmlForImport, renderDescriptionHtml, renderImportBody } from "@shared/descLayouts.ts";
import { descBodyImages, isEtsyTag, outputVariants, publicImageUrl, sortListingImages } from "@shared/listingFormat.ts";
import { categoryFor } from "@shared/shopifyCategories.ts";
import { proxied } from "../api";
import { downloadBlob, slugify } from "./image";

/** How many Etsy photos we PREPARE (Etsy's live cap is ~10, but we hand over all
 *  of them so the operator can pick — the ZIP includes every image). */
export const ETSY_MAX_PHOTOS = 60;

function field(l: GeneratedListing, key: string): string {
  return l.fields.find((f) => f.key === key)?.value ?? "";
}

/** Strip the "#dup-…" uniqueness marker we add when an image is copied into a 2nd zone. */
export function cleanImgUrl(u: string): string {
  return u.split("#dup-")[0];
}
function withClean<T extends ProductImage>(list: T[]): T[] {
  return list.map((i) => (i.url.includes("#dup-") ? { ...i, url: cleanImgUrl(i.url) } : i));
}

/** One row per unique file. A photo can legitimately carry BOTH the gallery
 *  and variant role (the same image belongs in two workspace zones), which
 *  would otherwise put it in the export twice — a real Shopify/Etsy listing
 *  only wants it once. */
function dedupeByUrl<T extends ProductImage>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}

function csvCell(v: unknown): string {
  // normalise line endings inside a cell so a quoted field never mixes bare LF
  // with the file's CRLF row separator (that desyncs strict CSV parsers — it's
  // what made Shopify's importer fail to recognise the columns).
  const s = String(v ?? "").replace(/\r\n?/g, "\n");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csv(rows: (string | number)[][]): string {
  // UTF-8 BOM — Shopify's product importer (and Excel) expect it.
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Collapse an HTML string to one line (safe for CSV cells — HTML/CSS ignore
 *  newlines and indentation; inter-tag spaces are kept as a single space). */
export function oneLineHtml(html: string): string {
  return html.replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/** photos for a listing: gallery + variant + description-role images */
function photoImgs(p: NormalisedProduct): ProductImage[] {
  return dedupeByUrl(withClean(p.images.filter((i) => i.role === "gallery" || i.role === "variant" || i.role === "description")));
}
/** the main product-card photos only (no in-description images) */
function mainImgs(p: NormalisedProduct): ProductImage[] {
  return dedupeByUrl(withClean(p.images.filter((i) => i.role === "gallery" || i.role === "variant")));
}
/** images for the Shopify HTML body — always visual: description strips, then gallery, capped 20 */
function descImgs(p: NormalisedProduct): ProductImage[] {
  return withClean(descBodyImages(p.images, 20));
}

/** Etsy / plain-text: no tags, no markdown, no image markup, tidy blank lines. */
export function plainText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/^\s*[#>*-]\s+/gm, "")
    .replace(/[*_`]{1,3}/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bodyImgPairs(p: NormalisedProduct): import("@shared/descLayouts.ts").DescImg[] {
  const out: import("@shared/descLayouts.ts").DescImg[] = [];
  for (const im of descImgs(p)) {
    const url = publicImageUrl(im);
    if (url) out.push({ url, alt: im.alt || "", crop: im.descCrop });
  }
  return out;
}

/** Shopify body HTML — the STYLED render, for the live preview and the
 *  standalone `.html` download. Kept human-readable (indented, one tag/rule per
 *  line) so it can be copied out and debugged. NOT for CSV/API import — that
 *  path (`importBodyHtml`) stays on one physical line for the CSV parser. */
export function shopifyBodyHtml(p: NormalisedProduct, l: GeneratedListing): string {
  return renderDescriptionHtml(l.layout, field(l, "description"), bodyImgPairs(p), {
    name: field(l, "title") || p.titleTranslated || p.title,
    props: p.props,
  });
}

/** Sanitiser-safe Body (HTML) for a Shopify/Woo import (shared with the API push). */
export function importBodyHtml(p: NormalisedProduct, l: GeneratedListing): string {
  return renderImportBody(l.layout, field(l, "description"), bodyImgPairs(p), {
    name: field(l, "title") || p.titleTranslated || p.title,
    props: p.props,
  });
}

/**
 * EXACTLY `importBodyHtml`, only with every `<img src>` routed through the image
 * proxy — for on-screen previews (raw marketplace CDNs block hotlinking; the real
 * API push re-hosts the images on Shopify's CDN). The storefront preview and the
 * "HTML sent to Shopify" block both render this, so they are byte-identical.
 */
export function importBodyHtmlPreview(p: NormalisedProduct, l: GeneratedListing): string {
  return importBodyHtml(p, l).replace(
    /(<img\b[^>]*\bsrc=")([^"]+)(")/gi,
    (_m, a: string, u: string, c: string) => a + proxied(u.replace(/&amp;/g, "&")) + c,
  );
}

/**
 * Shopify product CSV — the EXACT columns of Shopify's current product import
 * template, in order. Only the columns relevant to a fresh listing are filled;
 * the rest are left blank on purpose. Country of Origin and HS code are NOT part
 * of Shopify's product CSV — they ship in the companion `-customs.txt` (and are
 * applied on API push).
 */
export const SHOPIFY_CSV_HEADER = [
  "Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published",
  "Option1 Name", "Option1 Value", "Option1 Linked To",
  "Option2 Name", "Option2 Value", "Option2 Linked To",
  "Option3 Name", "Option3 Value", "Option3 Linked To",
  "Variant SKU", "Variant Grams", "Variant Inventory Tracker", "Variant Inventory Qty",
  "Variant Inventory Policy", "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price",
  "Variant Requires Shipping", "Variant Taxable",
  "Unit Price Total Measure", "Unit Price Total Measure Unit", "Unit Price Base Measure", "Unit Price Base Measure Unit",
  "Variant Barcode", "Image Src", "Image Position", "Image Alt Text", "Gift Card", "SEO Title", "SEO Description",
] as const;

export function shopifyCsv(p: NormalisedProduct, l: GeneratedListing): string {
  const handle = slugify(field(l, "title") || p.title, 60);
  const title = field(l, "title") || p.titleTranslated || p.title;
  // sanitiser-safe, one physical line, no <style>/<input>/class — Shopify's CSV
  // importer mis-parses multi-line quoted Body (HTML) cells (→ "a product title
  // column is required") and its description sanitiser strips the sticky-card CSS.
  const body = importBodyHtml(p, l);
  const tags = field(l, "tags");
  const vendor = l.meta?.brand?.trim() || "";
  // Category + Type must ALWAYS be filled — fall back to the taxonomy classifier
  // if the operator never ran "Bilgileri doldur".
  const category = p.category?.trim() || categoryFor(p.shopType || "", p);
  const shopType = p.shopType?.trim() || category.split(" > ").pop() || "";
  // product-card photos only — public https URLs Shopify can fetch (locally-edited
  // images that have no public source are dropped so the import doesn't fail).
  const imgPairs = mainImgs(p)
    .map((im) => ({ src: publicImageUrl(im), alt: im.alt || "" }))
    .filter((x): x is { src: string; alt: string } => !!x.src);
  const imgs = imgPairs.map((x) => x.src);
  const variants = outputVariants(p, l).length
    ? outputVariants(p, l)
    : [{ name: "Default Title", nameTranslated: "Default Title", price: p.priceOriginal, compareAtPrice: null } as ReturnType<typeof outputVariants>[number]];
  const single = variants.length <= 1;

  const splitName = (v: (typeof variants)[number]) =>
    (v.nameTranslated || v.name || "Default Title").split(/\s*\/\s*/).slice(0, 3);
  const axes = single ? 1 : Math.max(1, ...variants.map((v) => splitName(v).length));

  const header = [...SHOPIFY_CSV_HEADER] as string[];
  const IMG_SRC = header.indexOf("Image Src");
  const rows: (string | number)[][] = [header];
  const altOf = (i: number) => imgPairs[i]?.alt || "";
  const wKg = (v: (typeof variants)[number]) => (v.weightKg ?? p.weightKg ?? null);
  const grams = (v: (typeof variants)[number]) => (wKg(v) != null ? Math.round((wKg(v) as number) * 1000) : "");

  variants.forEach((v, i) => {
    const parts = splitName(v);
    const first = i === 0;
    rows.push([
      handle,                                              // Handle
      first ? title : "",                                  // Title
      first ? body : "",                                   // Body (HTML)
      first ? vendor : "",                                 // Vendor
      first ? category : "",                               // Product Category
      first ? shopType : "",                               // Type
      first ? tags : "",                                   // Tags
      first ? "FALSE" : "",                                // Published (import as draft — publish after review)
      single ? "Title" : "Option 1",                       // Option1 Name
      single ? "Default Title" : parts[0] || "-",          // Option1 Value
      "",                                                  // Option1 Linked To
      axes > 1 ? "Option 2" : "",                          // Option2 Name
      axes > 1 ? parts[1] || "-" : "",                     // Option2 Value
      "",                                                  // Option2 Linked To
      axes > 2 ? "Option 3" : "",                          // Option3 Name
      axes > 2 ? parts[2] || "-" : "",                     // Option3 Value
      "",                                                  // Option3 Linked To
      v.sku || "",                                         // Variant SKU
      grams(v),                                            // Variant Grams
      "shopify",                                           // Variant Inventory Tracker
      0,                                                   // Variant Inventory Qty
      "deny",                                              // Variant Inventory Policy
      "manual",                                            // Variant Fulfillment Service
      v.price != null ? v.price : "",                      // Variant Price
      v.compareAtPrice != null ? v.compareAtPrice : "",    // Variant Compare At Price
      "TRUE",                                              // Variant Requires Shipping
      "TRUE",                                              // Variant Taxable
      "", "", "", "",                                      // Unit Price * (EU unit pricing — n/a)
      "",                                                  // Variant Barcode
      imgs[i] || "",                                       // Image Src
      imgs[i] ? i + 1 : "",                                // Image Position
      imgs[i] ? altOf(i) : "",                             // Image Alt Text
      first ? "FALSE" : "",                                // Gift Card
      first ? field(l, "seo_title") : "",                  // SEO Title
      first ? field(l, "seo_description") : "",            // SEO Description
    ]);
  });
  // any remaining product photos as image-only rows (Handle + Image columns)
  for (let i = variants.length; i < imgs.length; i++) {
    const r = new Array(header.length).fill("");
    r[0] = handle;
    r[IMG_SRC] = imgs[i];
    r[IMG_SRC + 1] = i + 1;
    r[IMG_SRC + 2] = altOf(i);
    rows.push(r);
  }
  return csv(rows);
}

/** WooCommerce product CSV (Woo renders HTML in descriptions). */
export function wooCsv(p: NormalisedProduct, l: GeneratedListing): string {
  const header = ["Type", "SKU", "Name", "Published", "Description", "Tags", "Regular price", "Images"];
  const imgs = photoImgs(p)
    .map(publicImageUrl)
    .filter((u): u is string => !!u)
    .join(" | ");
  const wv = outputVariants(p, l);
  const price = wv[0]?.price ?? p.priceOriginal ?? "";
  return csv([
    header,
    [
      wv.length > 1 ? "variable" : "simple",
      p.numIid,
      field(l, "title") || p.title,
      0,
      l.channel === "shopify" ? importBodyHtml(p, l) : flattenHtmlForImport(field(l, "description")),
      field(l, "tags"),
      price as any,
      imgs,
    ],
  ]);
}

export function listingJson(p: NormalisedProduct, l: GeneratedListing): string {
  return JSON.stringify(
    {
      source: { platform: p.platform, numIid: p.numIid, url: p.sourceUrl, priceOriginal: p.priceOriginal },
      channel: l.channel,
      shipping: {
        type: p.shopType || "",
        category: p.category || "",
        countryOfOrigin: p.originCountry || "",
        hsCode: p.hsCode || "",
        weightKg: p.weightKg ?? null,
      },
      fields: Object.fromEntries(l.fields.map((f) => [f.key, f.value])),
      descriptionPlain: plainText(field(l, "description")),
      video: p.videoUrl
        ? {
            url: p.videoUrl,
            alt: p.videoAlt || "",
            trimStart: p.videoDelivery?.trimStart || 0,
            trimEnd: p.videoDelivery?.trimEnd || 0,
            mute: !!p.videoDelivery?.mute,
          }
        : null,
      variants: outputVariants(p, l),
      photos: photoImgs(p).map((i, n) => ({ position: n + 1, url: i.url, alt: i.alt || "", role: i.role })),
      layout: l.layout,
      model: l.model,
    },
    null,
    2,
  );
}

/**
 * Etsy delivery ZIP. One folder:
 *  - `<name40>.txt`               — ALL text data (title, description, tags, tag
 *                                   pool, variations, photo list, video notes).
 *  - `title and description/`     — listing photos, named `<name40>-1.jpg`, `-2`…
 *  - `variant/`                   — one image per variant, named after the variant.
 *  - `<name40>-video.mp4`         — the product video (if any).
 * `<name40>` = the title's first 40 chars, slugified. Description is PLAIN TEXT
 * (Etsy renders no HTML), tags ≤ 20 chars & ≤ 3 words.
 */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function etsyZip(p: NormalisedProduct, l: GeneratedListing): Promise<void> {
  const zip = new JSZip();
  const titleStr = field(l, "title") || p.titleTranslated || p.title;
  const dir = slugify(titleStr, 50);
  const folder = zip.folder(dir)!;
  // product-relevant base name = first 40 chars of the title, slugified
  const base40 = slugify(titleStr.slice(0, 40), 40) || "listing";

  const description = plainText(field(l, "description"));
  const tags = field(l, "tags")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tg) => tg.slice(0, 20))
    .filter(isEtsyTag) // Etsy: never a 4-word tag
    .slice(0, 13);
  const pool = field(l, "tags_pool")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tg) => tg.slice(0, 20))
    .filter(isEtsyTag)
    .slice(0, 50);

  const vlist = outputVariants(p, l);

  // ---- images: two folders ----
  // "title and description" = ALL listing photos (gallery + description strips),
  // even if there are more than Etsy's live cap — ordered details-last.
  const listingImgs = sortListingImages(
    withClean(p.images.filter((i) => i.role === "gallery" || i.role === "description")),
  ).slice(0, 120);
  const tdDir = folder.folder("title and description")!;
  const tdLines: string[] = [];
  const usedTd = new Set<string>();
  for (let i = 0; i < listingImgs.length; i++) {
    const im = listingImgs[i];
    let name = `${base40}-${i + 1}`;
    while (usedTd.has(name)) name += "_";
    usedTd.add(name);
    let file = `${name}.jpg`;
    try {
      const res = await fetch(proxied(cleanImgUrl(im.url)));
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      file = `${name}.${EXT_BY_MIME[blob.type] || "jpg"}`;
      tdDir.file(file, blob);
    } catch {
      file = `${name}-DOWNLOAD-FAILED.txt`;
      tdDir.file(file, `Could not download:\n${im.url}`);
    }
    tdLines.push(`${i + 1}. ${file}${im.alt ? `  —  ${(im.alt || "").slice(0, 500)}` : ""}`);
  }

  // "variant" = one image per variant, named after the variant
  const varDir = folder.folder("variant")!;
  const varLines: string[] = [];
  const usedVar = new Set<string>();
  for (const v of vlist) {
    if (!v.imageUrl) continue;
    let name = slugify(v.nameTranslated || v.name, 40) || "variant";
    while (usedVar.has(name)) name += "_2";
    usedVar.add(name);
    let file = `${name}.jpg`;
    try {
      const res = await fetch(proxied(cleanImgUrl(v.imageUrl)));
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      file = `${name}.${EXT_BY_MIME[blob.type] || "jpg"}`;
      varDir.file(file, blob);
    } catch {
      file = `${name}-DOWNLOAD-FAILED.txt`;
      varDir.file(file, `Could not download:\n${v.imageUrl}`);
    }
    varLines.push(`${v.nameTranslated || v.name}  ->  variant/${file}`);
  }

  // ---- product video (binary; notes go in the single txt) ----
  let videoNote = "";
  if (p.videoUrl) {
    let vfile = "";
    try {
      const vres = await fetch(proxied(cleanImgUrl(p.videoUrl)));
      if (!vres.ok) throw new Error(String(vres.status));
      const vblob = await vres.blob();
      const vext = vblob.type.includes("webm") ? "webm" : vblob.type.includes("quicktime") ? "mov" : "mp4";
      vfile = `${base40}-video.${vext}`;
      folder.file(vfile, vblob);
    } catch {
      folder.file(`${base40}-video-DOWNLOAD-FAILED.txt`, `Could not download:\n${p.videoUrl}`);
    }
    videoNote = [
      "",
      "",
      "===============  VIDEO  ===============",
      "",
      vfile ? `File: ${vfile}` : `Source URL: ${p.videoUrl}`,
      `Alt text: ${p.videoAlt || "(none)"}`,
      p.videoDelivery?.trimStart || p.videoDelivery?.trimEnd
        ? `Trim on upload: ${p.videoDelivery?.trimStart ?? 0}s -> ${p.videoDelivery?.trimEnd ?? "end"}s`
        : "Trim: none",
      p.videoDelivery?.mute ? "Audio: mute on upload" : "Audio: keep",
      "Etsy: 1 listing video, mp4/mov, ~5-15s.",
    ].join("\n");
  }

  // ---- the ONLY text file: everything text lives here ----
  folder.file(
    `${base40}.txt`,
    [
      "================  TITLE  ================",
      "",
      titleStr,
      ...(field(l, "title_alt")
        ? [
            "",
            `--------  TITLE (alt · ${field(l, "title_alt").split(/\s+/).filter(Boolean).length} words, no subjective words)  --------`,
            "",
            field(l, "title_alt"),
          ]
        : []),
      "",
      "",
      "=============  DESCRIPTION  =============",
      "",
      description,
      "",
      "",
      `===========  TAGS (${tags.length}/13)  ===========`,
      "",
      tags.join(", "),
      ...(pool.length ? ["", "", `--------  TAG POOL (${pool.length})  --------`, "", pool.join(", ")] : []),
      ...(vlist.length
        ? [
            "",
            "",
            `===========  VARIATIONS (${vlist.length})  ===========`,
            "",
            ...vlist.map((v, i) => {
              const pr = v.price != null ? `$${v.price}` : "—";
              const cmp = v.compareAtPrice != null ? `  (was $${v.compareAtPrice})` : "";
              const sku = v.sku ? `  · SKU ${v.sku}` : "";
              return `${i + 1}. ${v.nameTranslated || v.name}  —  ${pr}${cmp}${sku}`;
            }),
          ]
        : []),
      ...(tdLines.length ? ["", "", "=====  PHOTOS (title and description/)  =====", "", ...tdLines] : []),
      ...(varLines.length ? ["", "", "======  VARIANT PHOTOS (variant/)  ======", "", ...varLines] : []),
      videoNote,
      "",
    ].join("\n"),
  );

  downloadBlob(await zip.generateAsync({ type: "blob" }), `${dir}-etsy.zip`);
}

export { downloadBlob };
