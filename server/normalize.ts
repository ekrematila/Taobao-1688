import type {
  NormalisedProduct,
  OneboundPlatform,
  ProductImage,
  ProductVariant,
} from "@shared/types.ts";
import { declaredWeightKg } from "@shared/weight.ts";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(/,/g, "");
  // range like "10.00-25.00" -> take the low end
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function fixUrl(u: string): string {
  let s = String(u || "").trim();
  if (!s) return "";
  if (s.startsWith("//")) s = "https:" + s;
  s = s.replace(/^http:\/\//, "https://");
  return /^https:\/\//.test(s) ? s : "";
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

type ImgSource = "main" | "variant" | "description";

/**
 * Collect every image with a suggested workspace role:
 *  - main   -> gallery (pic_url + item_imgs)
 *  - variant-> variant (prop_imgs / sku pics)
 *  - description -> description (imgs pulled from the desc HTML)
 * First-seen source wins, so a gallery photo reused in the description stays gallery.
 */
function collectImages(item: any): { url: string; source: ImgSource }[] {
  const seen = new Map<string, ImgSource>();
  const norm = (v: unknown): string => {
    let url = "";
    if (typeof v === "string") url = v;
    else if (v && typeof v === "object" && "url" in (v as any)) url = (v as any).url;
    return fixUrl(url);
  };

  // 1) Variant / SKU images first. These ALWAYS belong in the variant zone even
  // when the same file also shows up in item_imgs — otherwise the "first-seen
  // wins" rule below drops them into the main gallery (the bug users hit).
  const variantUrls = new Set<string>();
  for (const im of item.prop_imgs?.prop_img || item.prop_imgs || []) {
    const u = norm(im);
    if (u) variantUrls.add(u);
  }
  for (const s of item.skus?.sku || item.sku || []) {
    const u = norm(s?.sku_pic || s?.pic || "");
    if (u) variantUrls.add(u);
  }
  for (const u of variantUrls) seen.set(u, "variant");

  const add = (v: unknown, source: ImgSource) => {
    const url = norm(v);
    if (!url) return;
    if (source !== "variant" && variantUrls.has(url)) return; // variant wins
    if (!seen.has(url)) seen.set(url, source);
  };

  add(item.pic_url, "main");
  add(item.mainImage, "main");
  add(item.main_image, "main");
  for (const im of item.item_imgs || item.images || item.mainImages || []) add(im, "main");

  const desc: string = firstString(item.desc, item.description, item.desc_short, item.detail);
  for (const m of desc.matchAll(/<img[^>]+src=["']?([^"' >]+)/gi)) add(m[1], "description");
  for (const m of desc.matchAll(/(https?:)?\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi)) add(m[0], "description");

  return [...seen].map(([url, source]) => ({ url, source }));
}

function variantNameFromSku(s: any): string {
  // OneBound: properties_name = "pid:vid:propName:valueName;..." OR "propName:valueName;..."
  const raw = firstString(s.properties_name, s.propertiesName, s.properties, s.spec, s.sku_name);
  if (!raw) return "";
  return raw
    .split(";")
    .map((part: string) => {
      const bits = part.split(":").filter(Boolean);
      return bits.length ? bits[bits.length - 1] : part;
    })
    .filter(Boolean)
    .join(" / ")
    .trim();
}

function collectVariants(item: any): ProductVariant[] {
  const skus: any[] =
    item.skus?.sku ||
    item.sku ||
    (Array.isArray(item.skus) ? item.skus : []) ||
    item.quantity_prices ||
    [];

  const list: ProductVariant[] = [];
  for (const s of skus) {
    if (!s) continue;
    list.push({
      name: variantNameFromSku(s) || "Varsayılan",
      price: num(s.price) ?? num(s.total_price) ?? num(s.orginal_price) ?? num(s.sku_price),
      sku: firstString(s.sku_id, s.skuId, s.id) || undefined,
      imageUrl: fixUrl(s.sku_pic || s.pic || "") || undefined,
      stock: num(s.quantity ?? s.stock ?? s.can_book_count),
    });
  }

  // 1688 tiered price_range -> synthesise "min qty" variants
  if (list.length === 0 && Array.isArray(item.price_range)) {
    for (const tier of item.price_range) {
      if (Array.isArray(tier) && tier.length >= 2) {
        list.push({ name: `≥ ${tier[0]} adet`, price: num(tier[1]) });
      }
    }
  }

  if (list.length === 0) {
    list.push({
      name: "Varsayılan",
      price: num(item.price) ?? num(item.orginal_price) ?? num(item.price_info?.price),
    });
  }
  return list;
}

function collectProps(item: any): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: unknown, v: unknown) => {
    const key = String(k ?? "").trim();
    const val = String(v ?? "").trim();
    if (key && val && !out[key]) out[key] = val;
  };

  for (const p of item.props || item.item_params || item.productFeatureList || []) {
    set(p?.name ?? p?.attributeName ?? p?.key, p?.value ?? p?.attributeValue ?? p?.val);
  }
  const pl = item.props_list || {};
  for (const key of Object.keys(pl)) {
    const [k, ...rest] = String(pl[key]).split(":");
    set(k, rest.join(":"));
  }
  set("Marka", item.brand ?? item.brandName);
  set("Konum", item.location ?? item.location_info?.city ?? item.area);
  set("Malzeme", item.material);
  set("Min. sipariş", item.min_num ?? item.minOrderQuantity);
  set("Birim", item.unit);
  set("Kargo", item.post_fee);
  set("Toplam satış", item.total_sold ?? item.sales ?? item.sold_quantity);
  return out;
}

export function normaliseItem(
  json: any,
  platform: OneboundPlatform,
  fallbackId: string,
): NormalisedProduct | undefined {
  const item = json?.item ?? json?.items?.item ?? json;
  if (!item || typeof item !== "object") return undefined;

  const numIid = firstString(item.num_iid, item.numIid, item.offerId, item.id, fallbackId);
  const roleFor: Record<string, ProductImage["role"]> = {
    main: "gallery",
    variant: "variant",
    description: "description",
  };
  const raw = collectImages(item);
  // `srcUrl` = the immutable original public URL — kept as the export fallback
  // when the working `url` later becomes a local /api/media edit.
  const images: ProductImage[] = raw.map(({ url, source }) => ({ url, srcUrl: url, role: roleFor[source] }));
  // Never leave the gallery empty: if the source data had no "main" images,
  // promote the first available image so the workspace is usable out of the box.
  if (images.length && !images.some((im) => im.role === "gallery")) images[0].role = "gallery";
  const variants = collectVariants(item);
  const prices = variants.map((v) => v.price).filter((n): n is number => n != null && n > 0);

  const detailUrl =
    fixUrl(firstString(item.detail_url, item.detailUrl, item.product_url)) ||
    (numIid
      ? platform === "1688"
        ? `https://detail.1688.com/offer/${numIid}.html`
        : `https://item.taobao.com/item.htm?id=${numIid}`
      : "");

  const title = firstString(item.title, item.subject, item.product_title, item.name);
  const descHtml = firstString(item.desc, item.description, item.desc_short, item.detail);
  const props = collectProps(item);
  const declaredKg = declaredWeightKg({ title, titleTranslated: "", descHtml, props });

  return {
    numIid: numIid || fallbackId,
    platform,
    sourceUrl: detailUrl,
    title,
    priceOriginal:
      (prices.length ? Math.min(...prices) : null) ??
      num(item.price) ??
      num(item.orginal_price) ??
      num(item.price_info?.price),
    currencyOriginal: "CNY",
    descHtml,
    images,
    variants,
    props,
    videoUrl: fixUrl(firstString(item.video, item.video_url, item.videos?.[0]?.url)) || undefined,
    // customs/shipping defaults — these are Chinese-marketplace products
    originCountry: "CN",
    weightKg: declaredKg ?? undefined,
    fetchedAt: new Date().toISOString(),
  };
}
