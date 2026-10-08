// Product-page blocks that are built from VERIFIED data instead of being written by the AI:
//   · "Shipping & Returns" — from the operator's real store policy (shared/storeProfiles.ts)
//   · "You may also like"  — links into the store's own collections that fit the product
//   · "Available colors"   — one thumbnail + name per variant that has a picture
// They are added when the page is RENDERED (preview, export, Shopify push all use the same
// renderer), so a policy change in Settings reaches every product without regenerating it.
//
// This file also holds the fact-guard prompt text and a deterministic "claim checker" that
// spots statements the source data does not support (strap, size, material, care, shipping…).

import type { NormalisedProduct } from "./types";
import { profileText, type StoreProfile } from "./storeProfiles";

const escH = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------ block HTML ------------------------------ */

const BOX =
  "margin:18px 0;padding:16px 18px;border:1px solid var(--line2,#e4e4e7);border-radius:var(--r,14px);background:var(--milk,#fafafa);color:var(--body,#3f3f46);font-size:14px;line-height:1.6;text-align:left";
const H = "margin:0 0 8px;font-size:15px;line-height:1.3;color:var(--head,var(--ink,#18181b))";
const SUB = "margin:10px 0 4px;font-size:13px;font-weight:700;letter-spacing:.02em;color:var(--head,var(--ink,#18181b))";
const UL = "margin:0;padding-left:18px";

const li = (s: string) => `<li style="margin:2px 0">${escH(s)}</li>`;

export function shipBlockHtml(p: StoreProfile): string {
  const ship = [p.processing, ...p.shipping].filter(Boolean);
  const ret = p.returns.filter(Boolean);
  const more = p.extra.filter(Boolean);
  if (!ship.length && !ret.length) return "";
  const contact = p.contact ? `<p style="margin:10px 0 0;font-size:13px">Questions? ${/@/.test(p.contact) ? `Email <a href="mailto:${escH(p.contact)}" style="color:inherit;text-decoration:underline">${escH(p.contact)}</a>` : `Message us via ${escH(p.contact)}`} — we are happy to help.</p>` : "";
  return (
    `<div data-ps="ship" style="${BOX}">` +
    `<h3 style="${H}">🚚 Shipping &amp; Returns</h3>` +
    (ship.length ? `<p style="${SUB}">Processing &amp; delivery</p><ul style="${UL}">${ship.map(li).join("")}</ul>` : "") +
    (ret.length ? `<p style="${SUB}">Returns &amp; cancellations</p><ul style="${UL}">${ret.map(li).join("")}</ul>` : "") +
    (more.length ? `<p style="${SUB}">Good to know</p><ul style="${UL}">${more.map(li).join("")}</ul>` : "") +
    contact +
    `</div>`
  );
}

/** up to `max` of the store's own collection links whose keywords appear in the product text */
export function pickRelatedLinks(p: StoreProfile, productText: string, max = 3): { label: string; url: string }[] {
  const text = ` ${productText.toLowerCase()} `;
  const scored = p.links
    .map((l, i) => ({ l, i, hits: l.keywords.filter((k) => k && text.includes(k.toLowerCase())).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.i - b.i);
  return scored.slice(0, max).map((x) => ({ label: x.l.label, url: x.l.url }));
}

export function relatedBlockHtml(links: { label: string; url: string }[]): string {
  if (!links.length) return "";
  const a = links
    .map(
      (l) =>
        `<a href="${escH(l.url)}" target="_blank" rel="noopener" style="display:inline-block;margin:4px 6px 0 0;padding:7px 13px;border:1px solid var(--line2,#d4d4d8);border-radius:999px;color:var(--head,var(--ink,#18181b));font-size:13px;text-decoration:none;background:var(--milk,#fff)">${escH(l.label)} →</a>`,
    )
    .join("");
  return `<div data-ps="related" style="${BOX}"><h3 style="${H}">💫 You may also like</h3><div>${a}</div></div>`;
}

export interface Swatch {
  name: string;
  url: string;
}

export function swatchBlockHtml(items: Swatch[]): string {
  if (items.length < 2) return "";
  const cells = items
    .slice(0, 12)
    .map(
      (s) =>
        `<figure style="margin:0;text-align:center;width:76px"><img src="${escH(s.url)}" alt="${escH(s.name)}" loading="lazy" style="width:68px;height:68px;object-fit:cover;border-radius:12px;border:1px solid var(--line2,#e4e4e7);display:block;margin:0 auto"><figcaption style="margin-top:4px;font-size:12px;line-height:1.25">${escH(s.name)}</figcaption></figure>`,
    )
    .join("");
  return `<div data-ps="swatches" style="${BOX}"><h3 style="${H}">🎨 Available options</h3><div style="display:flex;flex-wrap:wrap;gap:10px">${cells}</div></div>`;
}

export interface PageBlocks {
  swatches: string;
  ship: string;
  related: string;
}

/** words that describe the product, for matching related links */
export function productText(p: Pick<NormalisedProduct, "title" | "titleTranslated" | "props" | "variants" | "shopType">, listingTitle?: string): string {
  return [listingTitle, p.titleTranslated, p.shopType, ...(p.variants || []).map((v) => v.nameTranslated || v.name), ...Object.values(p.props || {}).map(String)]
    .filter(Boolean)
    .join(" ");
}

export function buildPageBlocks(args: {
  product: Pick<NormalisedProduct, "title" | "titleTranslated" | "props" | "variants" | "shopType">;
  profile?: StoreProfile;
  listingTitle?: string;
  /** public url of the picture for a variant (null = none) */
  variantImageUrl: (v: NormalisedProduct["variants"][number]) => string | null;
}): PageBlocks {
  const { product, profile } = args;
  const sw: Swatch[] = [];
  const seen = new Set<string>();
  for (const v of product.variants || []) {
    const url = args.variantImageUrl(v);
    const name = (v.nameTranslated || v.name || "").replace(/[㐀-鿿]+/g, "").trim();
    if (!url || !name || seen.has(url)) continue;
    seen.add(url);
    sw.push({ name, url });
  }
  return {
    swatches: swatchBlockHtml(sw),
    ship: profile ? shipBlockHtml(profile) : "",
    related: profile ? relatedBlockHtml(pickRelatedLinks(profile, productText(product, args.listingTitle))) : "",
  };
}

/**
 * Put the verified blocks into a finished page: just above the page's own call-to-action
 * (`bm-cta`) when it has one, otherwise at the very end of the wrapper. A page that already
 * carries a block of that kind (data-ps="…") is left alone.
 */
export function injectPageBlocks(html: string, blocks?: Partial<PageBlocks> | null): string {
  if (!blocks) return html;
  const add = (["swatches", "ship", "related"] as const)
    .filter((k) => blocks[k] && !html.includes(`data-ps="${k}"`))
    .map((k) => blocks[k])
    .join("");
  if (!add) return html;
  const cta = html.search(/<div\b[^>]*class=["'][^"']*\bbm-cta\b/i);
  if (cta >= 0) return html.slice(0, cta) + add + html.slice(cta);
  const end = html.lastIndexOf("</div>");
  return end >= 0 ? html.slice(0, end) + add + html.slice(end) : html + add;
}

/** the AI writes `.bm-glance` ("At a glance") but not its CSS — add it when the page has the block and no rule for it */
export const GLANCE_CSS =
  "<style>.bm-glance{margin:14px 0;padding:14px 16px;border:1px solid var(--line2,#e4e4e7);border-left:4px solid var(--gold,var(--acc,#a1a1aa));border-radius:var(--r,14px);background:var(--milk,#fafafa)}" +
  ".bm-glance-t{margin:0 0 6px;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--head,var(--ink,#18181b))}" +
  ".bm-glance ul{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:4px 16px}" +
  ".bm-glance li{margin:0;font-size:14px;line-height:1.5;color:var(--body,#3f3f46)}.bm-glance li b{color:var(--head,var(--ink,#18181b))}</style>";

export function ensureGlanceCss(html: string): string {
  if (!/class=["'][^"']*\bbm-glance\b/.test(html) || /\.bm-glance\s*\{/.test(html)) return html;
  const at = html.search(/<div\b[^>]*class=["'][^"']*\bbm-glance\b/);
  return at < 0 ? html : html.slice(0, at) + GLANCE_CSS + html.slice(at);
}

/* ------------------------------ prompt rules ------------------------------ */

/** Added to every description prompt: say only what the data (or a clearly visible photo detail) supports. */
export const FACT_GUARD_RULE = [
  "GERÇEKLİK KORUMASI — KESİN, İSTİSNASIZ (müşteri yanlış bilgiyle ürün alırsa iade/şikâyet olur):",
  "- Açıklamadaki HER iddia (özellik, işlev, malzeme, ölçü, ağırlık, kapasite, bakım, aksesuar, garanti) şunlardan EN AZ BİRİNDE bulunmak ZORUNDA: (a) kaynak başlık/özellik tablosu/açıklama metni/varyantlar, (b) OPERATÖR DETAYLARI, (c) verilen fotoğraflarda NET görünen bir şey (renk, donanım, pencere, desen). Hiçbirinde yoksa o cümleyi/satırı HİÇ YAZMA — uydurma, 'muhtemelen', 'genelde' ile yumuşatıp da yazma.",
  "- ÖZELLİKLE doğrulanmadıkça YAZMA: omuz/çapraz askı ve askı halkası, çıkarılabilir/ayarlanabilir kayış, çapraz çanta olarak kullanım, ölçü/boyut (cm/inç), ağırlık, kapasite ('telefon sığar' vb.), malzeme kompozisyonu (hakiki deri, pamuk, naylon…), su geçirmezlik, yıkama/silme/bakım talimatı, garanti, kutu içeriği (ekstra aksesuar), 'handmade/official/licensed'. Şüphede → çıkar. Ürün başlığı/etiketinde de bu doğrulanmamış iddialardan (ör. 'Crossbody') KULLANMA.",
  "- Bilgi yoksa 'belirtilmemiş / kaynakta yok' DİYE YAZMA, sadece konuyu atla. Boyut/uyum gibi müşterinin sorabileceği konularda tek cümle: 'please contact us for exact measurements' yeterli.",
  "- MÜŞTERİYE KONUŞ: 'source', 'supplied details', 'listing data', 'the information provided', 'not established', 'not specified' gibi iç/veri dili ASLA kullanma. Fotoğraflardan söz edersen 'pictured/shown' de, 'the photos show' değil.",
  "- Kargo, teslimat süresi, ücret, iade, işlem süresi, iptal, gümrük, ödeme yöntemi HAKKINDA HİÇBİR ŞEY YAZMA (SSS'de bile) — sayfaya sistem GERÇEK mağaza politikasından doğrulanmış bir 'Shipping & Returns' bloğu ekliyor. SSS'de bu konuda soru çıkarsa cevap: 'Please see the Shipping & Returns section below.' (kısa).",
  "- 'Ships worldwide', 'free shipping', 'N-day returns', 'money-back' gibi ifadeler YAZMA (bm-trust rozetlerinde bile: rozetler 'Secure checkout', 'Support before & after purchase', 'Carefully packed' gibi doğrulanabilir şeyler olsun).",
].join("\n");

/** Etsy (plain-text) listings: the same honesty rule, shorter. */
export const FACT_GUARD_ETSY = [
  "GERÇEKLİK KORUMASI — KESİN: açıklamadaki her iddia kaynak veride (başlık/özellikler/açıklama/varyantlar), OPERATÖR DETAYLARI'nda veya fotoğrafta NET görünen bir şeyde bulunmalı. Doğrulanmamış omuz/çapraz askı, ölçü, ağırlık, kapasite, malzeme kompozisyonu, su geçirmezlik, bakım talimatı, garanti, aksesuar YAZMA — şüphede çıkar; bilgi yoksa konuyu atla ('not specified' yazma). Başlık/etiketlerde de bu iddialardan KULLANMA.",
  "Müşteriye iç/veri dili kullanma ('source', 'supplied details', 'not established' vb. YASAK).",
].join("\n");

/** At-a-glance summary — mobile first, facts only. */
export const GLANCE_RULE = [
  "ÖZET KUTUSU (At a glance) — sayfanın EN ÜSTÜNDE kısa özet: `.bm-info` içinde `<p class=\"bm-lede\">` paragrafının HEMEN ÖNCESİNE şu bloğu koy (CSS'i sistem ekler, sen yazma): `<div class=\"bm-glance\"><p class=\"bm-glance-t\">At a glance</p><ul><li><b>Etiket:</b> değer</li>…</ul></div>`.",
  "3–6 madde; yalnızca DOĞRULANMIŞ olgular: ürün türü, boyut/ölçü (yalnızca kaynakta/operatör notunda varsa — sayıyla), ağırlık (varsa), malzeme (varsa), kapanış (varsa), renk/seçenek sayısı ve adları, stil/tema, ürüne has 1 öne çıkan özellik. Bilinmeyen bir etiketi ATLA — 'N/A', 'see photos', 'not specified' YAZMA. Maddeler tek satır, kısa.",
].join("\n");

/** "Adapt the current page to this product" mode. */
export function adaptRule(current: string, note?: string): string {
  return [
    "SAYFAYI ÜRÜNE GÖRE GÜNCELLE MODU — KESİN:",
    "Aşağıdaki MEVCUT SAYFA (HTML) başka bir üründen kalmış / şablon / eski bir sürüm olabilir. Görevin: bu sayfanın YAPISINI, `<style>` bloğunu ve sınıf adlarını AYNEN koruyarak, sayfadaki HER ÖĞEYİ (başlık bandı, rozetler, özet, lede, trivia, highlights, renk/seçenek çipleri, spesifikasyon satırları, karşılaştırma tablosu, SSS soru-cevapları, kutu içeriği, CTA metni, güven rozetleri, emojiler, renk paleti değişkenleri) BU ürünün GERÇEK verisine göre yeniden yazmak.",
    "Kurallar: (1) Başka ürüne ait her ad/özellik/iddia/ölçü/renk/emoji TEMİZLENİR. (2) Bu ürünün gerçekten sahip olduğu, kaynakta/fotoğrafta/operatör notunda DOĞRULANAN her şey sayfada yer alır — sayfada karşılığı olmayan gerçek bir özellik varsa uygun bölüme ekle. (3) Doğrulanamayan her satır/madde/SSS/rozet SİLİNİR (boş bırakma, bölümü de kaldır; sistem sınıflarını bozma). (4) Paletteki `--ink/--head/--body/--soft/--gold/--gold2/--acc-rgb/--lav/--sky/--milk/--line/--line2` değerlerini ürün FOTOĞRAFLARININ baskın renklerine göre güncelle. (5) Varyant/renk listesini gerçek varyantlarla eşle. (6) `onclick`/`data-*` kancalarını ve `<details>` SSS yapısını bozma. (7) Çıktı yine TAM HTML belgesidir.",
    note?.trim() ? `OPERATÖRÜN BU GÜNCELLEME İÇİN NOTU (öncelikli): ${note.trim().slice(0, 1500)}` : "",
    "",
    "MEVCUT SAYFA:",
    current.slice(0, 60000),
  ]
    .filter((x) => x !== undefined)
    .join("\n");
}

/** short store-policy facts handed to the model as context (it must NOT repeat them; the system block does) */
export function storeFactsLine(p?: StoreProfile): string {
  if (!p) return "";
  return `MAĞAZA (bilgi amaçlı — bunları açıklamaya YAZMA, sistem 'Shipping & Returns' bloğunu kendisi ekler): ${p.name}; ${p.processing}`;
}

/* ------------------------------ claim checker ------------------------------ */

export interface ClaimIssue {
  rule: string;
  snippet: string;
  /** Turkish explanation for the operator */
  why: string;
}

const TAGS = /<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi;
export const htmlToText = (h: string) =>
  String(h || "")
    .replace(TAGS, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** everything the source and the operator actually said about the product (Chinese included) */
export function evidenceText(
  p: Pick<NormalisedProduct, "title" | "titleTranslated" | "props" | "variants" | "descHtml">,
  operatorNote?: string,
): string {
  return [
    p.title,
    p.titleTranslated,
    ...Object.entries(p.props || {}).map(([k, v]) => `${k} ${v}`),
    ...(p.variants || []).map((v) => `${v.name} ${v.nameTranslated ?? ""}`),
    htmlToText(p.descHtml || ""),
    operatorNote,
  ]
    .filter(Boolean)
    .join(" \n ");
}

interface Rule {
  id: string;
  re: RegExp;
  /** evidence that backs the claim; the claim is flagged when NONE of this is found */
  ok: RegExp;
  why: string;
}

const RULES: Rule[] = [
  { id: "strap", re: /\b(cross-?body|shoulder strap|detachable strap|adjustable strap|long strap|strap rings?|side rings?|carry it as a (shoulder|crossbody))\b/i, ok: /斜挎|单肩|肩带|背带|挂带|斜跨|cross-?body|shoulder|strap/i, why: "Askı / çapraz kullanım kaynakta yok" },
  { id: "waterproof", re: /\b(water-?proof|water-?resistant|splash-?proof)\b/i, ok: /防水|泼水|waterproof|water.?resistant/i, why: "Su geçirmezlik kaynakta yok" },
  { id: "leather", re: /\b(genuine|real|full-grain|top-grain) leather\b/i, ok: /真皮|头层|牛皮|羊皮|genuine leather|real leather/i, why: "Hakiki deri kaynakta yok" },
  { id: "warranty", re: /\b(\d+[- ](year|month)s?[- ]warranty|lifetime (warranty|guarantee)|warranty)\b/i, ok: /保修|质保|warranty|guarantee/i, why: "Garanti kaynakta yok" },
  { id: "size", re: /\b\d+(\.\d+)?\s?(x|×)\s?\d+(\.\d+)?(\s?(x|×)\s?\d+(\.\d+)?)?\s?(cm|mm|in|inch(es)?)\b|\b\d+(\.\d+)?\s?(cm|mm|inch(es)?)\b/i, ok: /\d+(\.\d+)?\s?(cm|mm|厘米|公分|英寸|inch)|尺寸[^\n]{0,12}\d|长\s*\d|宽\s*\d|高\s*\d/i, why: "Ölçü kaynakta/operatör notunda yok" },
  { id: "weight", re: /\b\d+(\.\d+)?\s?(g|kg|grams|oz|lbs?)\b/i, ok: /\d+(\.\d+)?\s?(g|kg|克|千克|公斤|斤|oz|lb)\b|重量/i, why: "Ağırlık kaynakta yok" },
  { id: "care", re: /\b(machine[- ]wash(able)?|hand[- ]wash|wipe (it |the surface )?(gently |clean )?with|dry[- ]clean|do not (bleach|iron|soak))\b/i, ok: /洗|擦|清洁|保养|care|wash|clean/i, why: "Bakım/temizlik talimatı kaynakta yok" },
  { id: "cotton", re: /\b(cotton|linen)\b/i, ok: /棉|麻|cotton|linen/i, why: "Malzeme (pamuk/keten) kaynakta yok" },
  { id: "nylon", re: /\b(nylon|polyester)\b/i, ok: /尼龙|涤纶|聚酯|锦纶|nylon|polyester/i, why: "Malzeme (naylon/polyester) kaynakta yok" },
  { id: "canvas", re: /\bcanvas\b/i, ok: /帆布|canvas/i, why: "Malzeme (kanvas) kaynakta yok" },
  { id: "silicone", re: /\b(silicone|stainless steel|zinc alloy|brass)\b/i, ok: /硅胶|不锈钢|锌合金|黄铜|silicone|stainless|zinc|brass/i, why: "Malzeme kaynakta yok" },
  { id: "capacity", re: /\b(fits|holds|big enough for|room for) (a |an |your )?(phone|smartphone|ipad|tablet|laptop|water bottle|umbrella|wallet)\b/i, ok: /容量|可放|能装|可装|手机|phone|ipad|capacity|装/i, why: "Kapasite ('şunu alır') kaynakta yok" },
  { id: "claims", re: /\b(hypoallergenic|BPA[- ]free|non-toxic|food[- ]safe|eco-friendly|hand-?made|officially licensed|official merch|limited edition)\b/i, ok: /无毒|环保|手工|手作|正版|授权|限量|官方|hand-?made|licensed|official|limited|non-toxic|eco/i, why: "Bu iddia (hipoalerjenik/handmade/lisanslı vb.) kaynakta yok" },
  { id: "policy", re: /\b(free shipping|free returns?|hassle[- ]free returns?|money[- ]back|\d+[- ]day returns?|ships? within \d+|delivered in \d+)\b/i, ok: /(?!)/, why: "Kargo/iade iddiası AI tarafından yazılmış — sayfaya doğrulanmış mağaza bloğu otomatik ekleniyor" },
  { id: "datalang", re: /\b(supplied product details|the source (says|identifies|lists)|source listing|listing data|not established by|is not specified|not provided in)\b/i, ok: /(?!)/, why: "Müşteriye gösterilmemesi gereken iç/veri dili" },
];

/** statements in the generated page text that neither the source data nor the operator note back up */
export function findUnsupportedClaims(pageText: string, evidence: string): ClaimIssue[] {
  const out: ClaimIssue[] = [];
  const text = pageText;
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    // a size / weight that is itself spelled out in the evidence is fine
    if (r.ok.test(evidence)) continue;
    const i = m.index ?? 0;
    out.push({ rule: r.id, snippet: text.slice(Math.max(0, i - 50), i + m[0].length + 60).trim(), why: r.why });
  }
  return out;
}
