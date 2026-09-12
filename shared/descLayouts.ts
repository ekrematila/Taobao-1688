// Shopify description-body layout templates. Pure string generators — shared by
// the server (export / push) and the client (live preview). No DOM.

import { cleanSpecs } from "./specs";
import type { DescImageCrop } from "./types";

/** a description image with its optional non-destructive display crop. */
export interface DescImg {
  url: string;
  alt?: string;
  crop?: DescImageCrop;
}

/** CSS for a cropped description image: fixed aspect, cover-fit, focal position,
 *  optional max width. Returns "" when no crop is set. */
function cropWrapStyle(c?: DescImageCrop): string {
  if (!c || (!c.aspect && c.posX == null && c.posY == null && !c.maxW)) return "";
  const parts = ["display:block", "overflow:hidden", "margin:0 auto", "line-height:0"];
  if (c.aspect) parts.push(`aspect-ratio:${c.aspect}`);
  if (c.maxW) parts.push(`max-width:${Math.round(c.maxW)}px`);
  return parts.join(";");
}
function cropImgStyle(c?: DescImageCrop): string {
  if (!c || (!c.aspect && c.posX == null && c.posY == null)) return "";
  const x = c.posX == null ? 50 : c.posX;
  const y = c.posY == null ? 50 : c.posY;
  return `width:100%;height:100%;object-fit:cover;object-position:${x}% ${y}%;display:block`;
}

export interface DescLayout {
  id: string;
  tr: string;
  en: string;
  /** tiny inline-SVG wireframe for the picker */
  wire: string;
  /** does the model itself prepend a styled header block for this layout? */
  themedHeader?: boolean;
}

const box = (rects: string) =>
  `<svg viewBox="0 0 40 30" xmlns="http://www.w3.org/2000/svg" fill="currentColor" opacity=".55">${rects}</svg>`;

export const DESC_LAYOUTS: DescLayout[] = [
  { id: "none", tr: "Kural yok (AI serbest)", en: "No rules (AI decides)", wire: box('<rect x="4" y="5" width="32" height="3"/><rect x="4" y="11" width="32" height="3"/><rect x="4" y="17" width="24" height="3"/>') },
  { id: "stacked-plain", tr: "Alt alta görselli HTML", en: "Stacked-image HTML", wire: box('<rect x="3" y="3" width="34" height="5" rx="1"/><rect x="3" y="10" width="19" height="17"/><rect x="24" y="10" width="13" height="12" rx="1"/>') },
  { id: "stacked-alt", tr: "Alt alta + alt metin", en: "Stacked + captions", wire: box('<rect x="6" y="3" width="28" height="6"/><rect x="6" y="10" width="18" height="2"/><rect x="6" y="15" width="28" height="6"/><rect x="6" y="22" width="18" height="2"/>') },
  { id: "themed-header", tr: "Temalı başlık + görseller", en: "Themed header + images", wire: box('<rect x="4" y="3" width="32" height="8" rx="2"/><rect x="6" y="14" width="28" height="6"/><rect x="6" y="22" width="28" height="5"/>') },
  { id: "grid-2", tr: "2\'li ızgara", en: "2-up grid", wire: box('<rect x="4" y="4" width="15" height="10"/><rect x="21" y="4" width="15" height="10"/><rect x="4" y="16" width="15" height="10"/><rect x="21" y="16" width="15" height="10"/>') },
  { id: "grid-3", tr: "3\'lü ızgara", en: "3-up grid", wire: box('<rect x="3" y="5" width="10" height="9"/><rect x="15" y="5" width="10" height="9"/><rect x="27" y="5" width="10" height="9"/><rect x="3" y="16" width="10" height="9"/><rect x="15" y="16" width="10" height="9"/><rect x="27" y="16" width="10" height="9"/>') },
  { id: "hero-grid", tr: "Kahraman + ızgara", en: "Hero + grid", wire: box('<rect x="4" y="3" width="32" height="12"/><rect x="4" y="17" width="15" height="9"/><rect x="21" y="17" width="15" height="9"/>') },
  { id: "alternating", tr: "Zikzak (görsel + metin)", en: "Zigzag (image + text)", wire: box('<rect x="4" y="4" width="16" height="8"/><rect x="22" y="5" width="14" height="2"/><rect x="22" y="9" width="12" height="2"/><rect x="20" y="16" width="16" height="8"/><rect x="4" y="17" width="14" height="2"/><rect x="4" y="21" width="12" height="2"/>') },
  { id: "cards", tr: "Kartlar", en: "Cards", wire: box('<rect x="5" y="3" width="30" height="10" rx="2"/><rect x="5" y="15" width="30" height="10" rx="2"/>') },
  { id: "full-bleed", tr: "Tam genişlik (boşluksuz)", en: "Full-bleed", wire: box('<rect x="2" y="2" width="36" height="9"/><rect x="2" y="11" width="36" height="9"/><rect x="2" y="20" width="36" height="8"/>') },

  { id: "feature-split", tr: "Özellik blokları", en: "Feature blocks", wire: box('<rect x="4" y="3" width="32" height="8"/><rect x="11" y="12" width="18" height="2"/><rect x="13" y="15" width="14" height="1.5"/><rect x="4" y="19" width="32" height="8"/>') },
  { id: "filmstrip", tr: "Film şeridi + yığın", en: "Filmstrip + stack", wire: box('<rect x="3" y="3" width="7" height="6"/><rect x="12" y="3" width="7" height="6"/><rect x="21" y="3" width="7" height="6"/><rect x="30" y="3" width="7" height="6"/><rect x="4" y="12" width="32" height="7"/><rect x="4" y="21" width="32" height="6"/>') },
  { id: "magazine", tr: "Dergi (metin sarmalı)", en: "Magazine (text wrap)", wire: box('<rect x="4" y="4" width="14" height="12"/><rect x="20" y="5" width="16" height="2"/><rect x="20" y="9" width="16" height="2"/><rect x="20" y="13" width="12" height="2"/><rect x="4" y="19" width="32" height="8"/>') },
  { id: "quote-blocks", tr: "Görsel + fayda kutusu", en: "Image + benefit box", wire: box('<rect x="4" y="3" width="32" height="8"/><rect x="4" y="12" width="32" height="4" rx="2"/><rect x="4" y="18" width="32" height="8"/>') },
  { id: "numbered-steps", tr: "Numaralı adımlar", en: "Numbered steps", wire: box('<circle cx="7" cy="6" r="3"/><rect x="12" y="5" width="18" height="2"/><rect x="4" y="9" width="32" height="7"/><circle cx="7" cy="20" r="3"/><rect x="12" y="19" width="18" height="2"/><rect x="4" y="23" width="32" height="5"/>') },
  { id: "polaroid", tr: "Polaroid kartlar", en: "Polaroid cards", wire: box('<rect x="6" y="4" width="16" height="15" rx="1"/><rect x="20" y="11" width="16" height="15" rx="1"/>') },
  { id: "minimal-center", tr: "Minimal / ortalı", en: "Minimal / centered", wire: box('<rect x="10" y="4" width="20" height="8"/><rect x="14" y="13" width="12" height="1.5"/><rect x="10" y="18" width="20" height="8"/>') },
  { id: "masonry", tr: "Masonry (2 sütun)", en: "Masonry (2 col)", wire: box('<rect x="4" y="3" width="15" height="10"/><rect x="21" y="3" width="15" height="7"/><rect x="21" y="12" width="15" height="10"/><rect x="4" y="15" width="15" height="8"/>') },
  { id: "fullbleed-caption", tr: "Tam genişlik + alt bant", en: "Full-bleed + caption bar", wire: box('<rect x="2" y="3" width="36" height="10"/><rect x="2" y="10" width="36" height="3" opacity=".85"/><rect x="2" y="16" width="36" height="10"/><rect x="2" y="23" width="36" height="3" opacity=".85"/>') },
  { id: "spec-rhythm", tr: "Editoryal ritim", en: "Editorial rhythm", wire: box('<rect x="4" y="3" width="32" height="8"/><rect x="4" y="13" width="32" height="1"/><rect x="8" y="15" width="16" height="1.5"/><rect x="4" y="19" width="32" height="8"/>') },
];

export const isThemedHeaderLayout = (id?: string) => id === "themed-header";
/** Layouts where the template emits the whole block (images included) itself. */
export const isSelfContainedLayout = (id?: string) => id === "stacked-plain" || id === "bm-sticky";

const esc = (s: string) => String(s ?? "").replace(/"/g, "&quot;");
const escT = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const img = (u: string, alt: string, style = "", crop?: DescImageCrop) => {
  const wrapS = cropWrapStyle(crop);
  const inner = `<img src="${u}" alt="${esc(alt)}" loading="lazy" style="${
    wrapS ? cropImgStyle(crop) : `max-width:100%;height:auto;display:block;${style}`
  }">`;
  return wrapS ? `<span style="${wrapS}${style ? ";" + style : ""}">${inner}</span>` : inner;
};

export interface DescMeta {
  /** customer-facing product name (h2 in the card) */
  name?: string;
  /** spec label → value map (from the normalised product) */
  props?: Record<string, unknown>;
  /** short "in the box / before you order / care" note; falls back to a generic one */
  note?: string;
}

/**
 * Wrap the model's text body with the description images per template.
 * `imgs` = the description-role images (already url-cleaned) with alt text.
 * `meta` supplies the product name / spec map used by richer templates.
 */
/** Shopify description bodies always carry images — up to this many. */
export const MAX_DESC_IMAGES = 20;

/** İ→I, ı→i — a stray Turkish letter from the prompt looks broken in an English listing. */
const deTr = (s: string) => s.replace(/İ/g, "I").replace(/ı/g, "i");

export function renderDescriptionHtml(
  layoutId: string | undefined,
  baseHtml: string,
  imgsIn: DescImg[],
  meta?: DescMeta,
): string {
  // `lang="en"` pins CSS `text-transform:uppercase` to English casing — without
  // it, a page (or Shopify theme) with lang="tr" turns "Highlights" into
  // "HİGHLİGHTS" (dotted capital I) at render time, which deTr can't catch
  // because the source string is plain ASCII.
  return `<div lang="en">${deTr(renderDescBody(layoutId, baseHtml, imgsIn, meta))}</div>`;
}

/**
 * Make an HTML body safe for a Shopify/Woo IMPORT:
 *  - ONE physical line — Shopify's product CSV importer chokes on a quoted
 *    `Body (HTML)` cell with literal line breaks (symptom: the "Update column
 *    headings" dialog opens with every dropdown blank / "a product title column
 *    is required").
 *  - drop `<style>` / `<script>` / comments (Shopify's sanitiser strips them and
 *    their CSS braces/quotes/commas are what trip a lenient CSV parser).
 *  - drop `<input>` / `<label>` / `<button>` (Shopify strips form elements — the
 *    self-contained layout's CSS-only toggle can't survive import) and every
 *    `class=` attribute (the classes do nothing once `<style>` is gone).
 *  - drop now-empty structural wrappers so the text isn't buried in bare divs.
 */
export function flattenHtmlForImport(html: string): string {
  let s = String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>(?:(?!<\/?script\b)[\s\S])*?<\/script\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(?:input|label|button)\b[^>]*>/gi, "")
    .replace(/\s+class="[^"]*"/gi, "")
    .replace(/\s+class='[^']*'/gi, "")
    .replace(/\r\n?|\n/g, " ")
    .replace(/>\s{2,}</g, "> <")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  // collapse empty wrappers left behind (a few passes for nesting)
  for (let i = 0; i < 4; i++) s = s.replace(/<(div|span|section|i)\b[^>]*>\s*<\/\1>/gi, "");
  return s.replace(/[ \t]{2,}/g, " ").trim();
}

/** collapse to a single physical line — Shopify's CSV importer chokes on literal
 *  line breaks in the quoted Body (HTML) cell. Safe for `<style>` (the templates
 *  use only `/* *​/` comments, never `//`). */
const oneLine = (s: string) => String(s || "").replace(/\r\n?|\n/g, " ").replace(/[ \t]{2,}/g, " ").trim();

/** did the model emit its own COMPLETE styled block (needs a real `<style>`)? */
const isPreStyled = (html: string) => /<style[\s>][\s\S]*?<\/style>/i.test(html);

/**
 * Repair a description value that a model mangled: a `{"fields":…}` / `{"description":…}`
 * JSON wrapper leaking in as text, a double-escaped body (literal `\n` / `\"` / `\t`),
 * a leading run of blank lines before the real markup, and any stray `<input>` /
 * `<label for>` the layout doesn't own. Idempotent — safe to run on a clean value.
 */
export function cleanDescValue(v: string): string {
  let s = String(v ?? "").trim();
  if (!s) return s;
  // 1) a JSON wrapper pasted in as text → pull the description string out
  if (s[0] === "{" || s[0] === "[") {
    const m = s.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) s = m[1];
    else {
      try {
        const o = JSON.parse(s);
        const d = o?.description ?? (Array.isArray(o?.fields) ? o.fields.find((f: any) => f?.key === "description")?.value : "");
        if (typeof d === "string" && d) s = d;
      } catch {
        /* leave it */
      }
    }
  }
  // 2) double-escaped body: literal \n \t \r \" \\ → real chars (only if it clearly is one)
  if (/\\n|\\"/.test(s) && !/\n/.test(s.slice(0, 400))) {
    s = s.replace(/\\r\\n|\\n|\\r/g, "\n").replace(/\\t/g, "  ").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  // 3) drop a leading blank run before the first tag
  s = s.replace(/^[\s﻿]+(?=<)/, "");
  // 4) neutralise a stray form control the templates don't use as a real toggle
  //    (a `.bm-toggle` / `.pd-*` checkbox is fine; a bare <input> is not)
  s = s.replace(/<input(?![^>]*\bclass\s*=\s*["'][^"']*\b(?:bm-toggle|pd-[\w-]*toggle)\b)[^>]*>/gi, "");
  // 5) drop country-flag emoji (regional-indicator letters + the ZWJ tag/pennant
  //    forms) — "🇳🇱 next to a fun fact" is meaningless noise on a product page.
  s = s
    .replace(/\uD83C[\uDDE6-\uDDFF](?:\uD83C[\uDDE6-\uDDFF])?/g, "")
    .replace(/🏴(?:\uDB40[\uDC00-\uDFFF])+/g, "")
    .replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

/** wrap bare text (no tags at all) into paragraphs so the body is NEVER plain text. */
const ensureHtml = (s: string) => {
  const t = String(s || "").trim();
  if (!t || /<[a-z!/]/i.test(t)) return t;
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${escT(p.trim())}</p>`)
    .join("");
};

/**
 * Body (HTML) for a Shopify / Woo IMPORT.
 * - The model produced a COMPLETE styled block (has a real `<style>` — every
 *   Shopify description does now) → ship it VERBATIM, one-lined, with the product
 *   images dropped into its `pd-media` / `bm-media` slots. NEVER flattened, never
 *   plain text.
 * - Self-contained layout with no `<style>` (fallback) → build the `.bm` card.
 * - A legacy semantic-only body → model HTML + `<h3>Specifications</h3>` +
 *   stacked images, sanitiser-safe for the CSV. Bare text is wrapped in `<p>`.
 */
export function renderImportBody(
  layoutId: string | undefined,
  baseHtml: string,
  imgsIn: DescImg[],
  meta?: DescMeta,
): string {
  const imgs = (imgsIn || []).filter((i) => i && i.url).slice(0, MAX_DESC_IMAGES);
  const base0 = cleanDescValue(baseHtml);
  if (isPreStyled(base0)) {
    return oneLine(`<div lang="en">${deTr(scaffoldPrestyled(fillMediaSlots(base0, imgs)))}</div>`);
  }
  if (isSelfContainedLayout(layoutId)) {
    return oneLine(renderDescriptionHtml(layoutId, baseHtml, imgs, meta));
  }
  const base = deTr(ensureHtml(base0));
  const attr = (s: string) => escT(s).replace(/"/g, "&quot;");
  const imgHtml = imgs
    .map((i) => {
      const ws = cropWrapStyle(i.crop);
      const im = `<img src="${attr(i.url)}" alt="${attr(i.alt || "")}"${ws ? ` style="${cropImgStyle(i.crop)}"` : ""}>`;
      return `<p>${ws ? `<span style="${ws}">${im}</span>` : im}</p>`;
    })
    .join("");
  const specs = cleanSpecs(meta?.props, 12);
  const specHtml =
    specs.length && !/\bspecification/i.test(base)
      ? `<h3>Specifications</h3><ul>${specs
          .map((s) => `<li><strong>${escT(s.label)}:</strong> ${escT(s.value)}</li>`)
          .join("")}</ul>`
      : "";
  return flattenHtmlForImport(`<div lang="en">${base}${specHtml}${imgHtml}</div>`);
}

/** The canonical `.bm` runtime — PROGRESSIVE ENHANCEMENT only. The block already
 *  works with no JS (reveals visible by default, FAQ is native `<details>`, the
 *  CTA also carries an inline `onclick`). This script upgrades image zoom and
 *  makes the CTA delegated + resilient to a theme re-rendering the description.
 *  `document`-delegated (never bound at run time) + a `window.__bmInit` guard so
 *  it is safe if injected more than once. No `//` comments (one-lined for CSV). */
/**
 * The Add-to-Cart glow's colour lives in the guaranteed stylesheet as
 * `var(--acc-rgb)` — but the REAL storefront button `findAtc()` locates is
 * essentially never a descendant of `.bm`/`.pd-*` (custom properties only
 * cascade down the DOM tree, and the button usually lives in the product
 * form, elsewhere on the page), so that variable would not resolve there on
 * its own. This copies whatever accent colour the model picked for THIS
 * product onto `:root` at load time, so the glow actually matches the
 * product instead of falling back to a hardcoded default everywhere.
 * `.bm` uses an R,G,B triplet (`--acc-rgb`) already; `.pd-*` uses a single
 * hex colour (`--pd-accent`), converted here to the same triplet form.
 */
const SYNC_ACCENT_FN = `
  function syncAccentColor(){
    try {
      var scope = document.querySelector('.bm') || document.querySelector('[class*="pd-"]');
      if(!scope) return;
      var cs = getComputedStyle(scope);
      var rgb = (cs.getPropertyValue('--acc-rgb') || '').trim();
      if(!rgb){
        var hex = (cs.getPropertyValue('--pd-accent') || '').trim();
        var m = hex && hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if(m) rgb = parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16);
      }
      if(rgb) document.documentElement.style.setProperty('--acc-rgb', rgb);
    } catch(e) {}
  }`;

/** Locate the storefront's REAL "Add to Cart" button. HARD rule: never a
 *  Shop Pay / dynamic-checkout / "Buy now" / "Buy with …" button. Ordered
 *  probe, then a text-based last resort; only returns null on a page that
 *  genuinely has no add-to-cart control. Shared by BM_SCRIPT and PD_SCRIPT. */
const FIND_ATC_FN = `
  function findAtc(){
    var list = [
      'form[action*="/cart/add"] button[name="add"]',
      'form[action*="/cart/add"] [type="submit"]',
      'button[name="add"]',
      '#AddToCart',
      '#ProductSubmitButton',
      '.product-form__submit',
      '.product-form__cart-submit',
      '.btn--add-to-cart',
      '.add-to-cart'
    ];
    function bad(el){
      if(!el) return true;
      if(el.closest && el.closest('.shopify-payment-button')) return true;
      var t = (el.textContent || '').trim().toLowerCase();
      return t.indexOf('shop pay') !== -1 || t.indexOf('buy now') !== -1 || t.indexOf('buy with') !== -1;
    }
    for(var i = 0; i < list.length; i++){
      var els = document.querySelectorAll(list[i]);
      for(var j = 0; j < els.length; j++){
        if(!bad(els[j])) return els[j];
      }
    }
    var all = document.querySelectorAll('button, [type="submit"], a');
    for(var k = 0; k < all.length; k++){
      var e2 = all[k];
      if(bad(e2)) continue;
      var t2 = (e2.textContent || '').trim().toLowerCase();
      if(t2.indexOf('add to cart') !== -1 || t2.indexOf('add to bag') !== -1) return e2;
    }
    return null;
  }`;

/**
 * Canonical, verified-syntactically-valid inline `onclick` for the Add-to-Cart
 * hook — forced onto `[data-bm-goto-atc]`/`[data-pd-goto-atc]` by
 * `forceCtaOnclick()` regardless of what the model wrote there.
 *
 * Why this exists: the model is told to copy the example's onclick VERBATIM,
 * but it doesn't reliably do that — observed in production it sometimes writes
 * its own shorter version and drops the `()` after `function` (`function{`
 * instead of `function(){`), which is a silent syntax error: the browser
 * can't parse the attribute at all, so the button does nothing on click and
 * nothing is ever logged anywhere. A model-authored `<script>` gets the same
 * treatment already (see `ensureBmScaffold`/`ensurePdScaffold`); this closes
 * the same hole for the inline attribute.
 */
const BM_CTA_ONCLICK =
  `(function(){function bad(el){if(!el)return true;if(el.closest&&el.closest('.shopify-payment-button'))return true;var x=(el.textContent||'').toLowerCase();return x.indexOf('shop pay')>-1||x.indexOf('buy now')>-1||x.indexOf('buy with')>-1;}var L=['form[action*=cart] button[name=add]','form[action*=cart] [type=submit]','button[name=add]','#AddToCart','#ProductSubmitButton','.product-form__submit','.product-form__cart-submit','.btn--add-to-cart','.add-to-cart'],a=null,i,n;for(i=0;i<L.length&&!a;i++){n=document.querySelectorAll(L[i]);for(var j=0;j<n.length;j++){if(!bad(n[j])){a=n[j];break;}}}if(!a){n=document.querySelectorAll('button,[type=submit],a');for(i=0;i<n.length;i++){if(bad(n[i]))continue;var y=(n[i].textContent||'').toLowerCase();if(y.indexOf('add to cart')>-1||y.indexOf('add to bag')>-1){a=n[i];break;}}}if(a){a.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(function(){a.classList.remove('bm-atc-glow');void a.offsetWidth;a.classList.add('bm-atc-glow');setTimeout(function(){a.classList.remove('bm-atc-glow');},2600);},650);}return false;})();`;
const PD_CTA_ONCLICK = BM_CTA_ONCLICK.replace(/bm-atc-glow/g, "pd-atc-glow");

/** Force the CTA hook's onclick to the canonical, known-valid string — replaces
 *  whatever the model wrote (or adds it, if the model left it off). */
function forceCtaOnclick(html: string, attr: "data-bm-goto-atc" | "data-pd-goto-atc", onclick: string): string {
  const re = new RegExp(`<(button|a)\\b([^>]*\\b${attr}\\b[^>]*)>`, "i");
  return html.replace(re, (_m, tag, attrs) => {
    const cleaned = attrs.replace(/\s+onclick\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
    return `<${tag}${cleaned} onclick="${onclick}">`;
  });
}

const BM_SCRIPT = `<script>
(function(){
  if(window.__bmInit) return; window.__bmInit = 1;
${SYNC_ACCENT_FN}
  syncAccentColor();
${FIND_ATC_FN}
  function glow(el){
    if(!el) return;
    el.classList.remove('bm-atc-glow'); void el.offsetWidth; el.classList.add('bm-atc-glow');
    setTimeout(function(){ el.classList.remove('bm-atc-glow'); }, 2600);
  }
  /* These descriptions can be long, so the real Add-to-Cart button can be a
     long smooth-scroll away -- the old 1600ms/2000ms safety caps could fire
     WHILE the page was still actively scrolling on a long page or a slower
     device, starting the glow mid-flight (looks like it "cuts off" as the
     page keeps moving under it). Longer caps cost nothing when scrollend (or
     the stillness check) fires on its own, which is the normal case -- they
     only matter as a fallback for the rare page where neither ever fires. */
  function afterScrollSettles(cb){
    var done = false;
    function fire(){ if(done) return; done = true; cb(); }
    if('onscrollend' in window){
      var cap = setTimeout(fire, 4000);
      window.addEventListener('scrollend', function h(){ window.removeEventListener('scrollend', h); clearTimeout(cap); fire(); }, {once:true});
      return;
    }
    var last = window.pageYOffset, still = 0;
    var iv = setInterval(function(){
      var y = window.pageYOffset;
      if(Math.abs(y - last) < 2){ still += 90; if(still >= 220){ clearInterval(iv); fire(); } }
      else { still = 0; last = y; }
    }, 90);
    setTimeout(function(){ clearInterval(iv); fire(); }, 4000);
  }
  /* FAQ: smooth height open/close + single-open accordion. Falls back to the
     native <details name> behaviour (still single-open) if this never runs.
     Each step ALSO has a setTimeout fallback alongside its transitionend
     listener — observed in production: if the model's own CSS doesn't carry
     a working \`transition\` on .bm-faq-a (or anything else stops the
     transition from firing, e.g. a collapsed ancestor), transitionend never
     fires, the open/close attribute never finishes updating, and the item
     gets stuck — it looks like it "won't open again" on the next click. The
     timeout guarantees the state always finishes settling either way. */
  function closeFaq(item){
    var b = item.querySelector('.bm-faq-a');
    if(!b){ item.removeAttribute('open'); return; }
    var done = false;
    function finish(){ if(done) return; done = true; item.removeAttribute('open'); b.style.height = ''; }
    b.style.height = b.scrollHeight + 'px'; void b.offsetHeight;
    b.style.transition = 'height .35s cubic-bezier(.25,.8,.3,1)'; b.style.overflow = 'hidden'; b.style.height = '0px';
    b.addEventListener('transitionend', function te(){ b.removeEventListener('transitionend', te); finish(); }, {once:true});
    setTimeout(finish, 450);
  }
  function openFaq(item){
    var group = item.closest('.bm-faq') || document;
    group.querySelectorAll('.bm-faq-item[open]').forEach(function(o){ if(o !== item) closeFaq(o); });
    item.setAttribute('open', '');
    var b = item.querySelector('.bm-faq-a');
    if(!b) return;
    var done = false;
    function finish(){ if(done) return; done = true; b.style.height = 'auto'; b.style.overflow = ''; }
    b.style.transition = 'height .35s cubic-bezier(.25,.8,.3,1)'; b.style.overflow = 'hidden'; b.style.height = '0px'; void b.offsetHeight;
    b.style.height = b.scrollHeight + 'px';
    b.addEventListener('transitionend', function te(){ b.removeEventListener('transitionend', te); finish(); }, {once:true});
    setTimeout(finish, 450);
  }
  document.addEventListener('click', function(e){
    var t = e.target;
    var q = t.closest && t.closest('.bm .bm-faq-q');
    if(q){
      var item = q.closest('.bm-faq-item'); if(!item) return;
      e.preventDefault();
      if(item.hasAttribute('open')) closeFaq(item); else openFaq(item);
      return;
    }
    var z = t.closest && t.closest('.bm [data-bm-zoom]');
    if(z){
      var im = z.tagName === 'IMG' ? z : z.querySelector('img');
      var lb = document.querySelector('.bm-lightbox');
      if(im && lb){ var li = lb.querySelector('[data-bm-lightbox-img]') || lb.querySelector('img'); if(li){ li.src = im.currentSrc || im.src; lb.classList.add('is-open'); } }
      return;
    }
    if((t.closest && t.closest('.bm-lightbox [data-bm-close]')) || (t.classList && t.classList.contains('bm-lightbox'))){
      var o = document.querySelector('.bm-lightbox.is-open'); if(o) o.classList.remove('is-open'); return;
    }
    var cta = t.closest && t.closest('[data-bm-goto-atc]');
    if(!cta) return;
    e.preventDefault();
    var atc = findAtc();
    if(!atc) return;
    atc.scrollIntoView({behavior:'smooth', block:'center'});
    afterScrollSettles(function(){ glow(atc); });
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ var o = document.querySelector('.bm-lightbox.is-open'); if(o) o.classList.remove('is-open'); }
  });
})();
</script>`;

/** No-JS guard: if Shopify strips the `<script>`, `.bm-reveal` would stay invisible. */
const BM_NOSCRIPT = `<noscript><style>.bm-reveal{opacity:1 !important;transform:none !important}</style></noscript>`;

/** Light readability pass for an injected `<style>…</style>` blob: one rule per
 *  line, declarations indented. Whitespace-only — CSS semantics are unchanged,
 *  and the CSV/import path re-collapses it via `oneLine()`. Used so the standalone
 *  `.html` download and preview source are human-readable, not one dense line. */
const fmtStyle = (block: string): string =>
  block.replace(/^(<style[^>]*>)([\s\S]*?)(<\/style>)$/i, (_m, o: string, css: string, c: string) => {
    const body = css
      .replace(/\s*\{\s*/g, " {\n")
      .replace(/;\s*/g, ";\n")
      .replace(/\s*\}\s*/g, "}\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (l.endsWith("{") || l === "}" ? l : "  " + l))
      .join("\n");
    return `${o}\n${body}\n${c}`;
  });

/** The v2-only `.bm` rules (reveal / zoom / lightbox / FAQ / CTA). Injected by
 *  `ensureBmScaffold` when the block's own `<style>` predates v2 (the fallback
 *  card, or an older model block). */
const BM_STYLE_EXTRA = fmtStyle(
  `<style>@media (prefers-reduced-motion:reduce){.bm *{animation-duration:.01ms!important;transition-duration:.01ms!important}}` +
  `.bm-reveal{opacity:1;transform:none;transition:opacity .55s ease,transform .55s ease}.bm-reveal.bm-show{opacity:1;transform:none}` +
  `.bm-media .bm-stage{position:relative;cursor:zoom-in}.bm-media img{transition:transform .5s cubic-bezier(.25,.8,.3,1);cursor:zoom-in;background:var(--sky,#eaeefc)}.bm-media img:hover{transform:scale(1.03)}` +
  `.bm-media .bm-zoomtag{position:absolute;right:10px;bottom:10px;z-index:2;font-size:11.5px;font-weight:700;color:var(--acc,#4f57c4);background:rgba(255,255,255,.92);border:1px solid var(--line,rgba(79,87,196,.16));padding:5px 10px;border-radius:99px;opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s;pointer-events:none}.bm-media .bm-stage:hover .bm-zoomtag{opacity:1;transform:translateY(0)}` +
  `.bm-lightbox{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:26px;background:rgba(24,26,48,.82)}.bm-lightbox.is-open{display:flex}.bm-lightbox img{max-width:min(92vw,900px);max-height:88vh;border-radius:12px}` +
  `.bm-lightbox .bm-close{position:absolute;top:18px;right:18px;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center}` +
  `.bm-faq{margin-top:6px;border:1px solid var(--line,rgba(79,87,196,.16));border-radius:12px;overflow:hidden}.bm-faq-item{border-bottom:1px solid var(--line,rgba(79,87,196,.16))}.bm-faq-item:last-child{border-bottom:0}` +
  `.bm-faq-q{list-style:none;cursor:pointer;width:100%;display:flex!important;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;background:#fff;border:0;text-align:left;font-size:13.4px;font-weight:700;color:var(--acc,#4f57c4)}.bm-faq-q::-webkit-details-marker{display:none}.bm-faq-q::marker{content:""}` +
  `.bm-faq-q .bm-plus{flex:0 0 auto;width:18px;height:18px;position:relative;transition:transform .3s}.bm-faq-q .bm-plus::before,.bm-faq-q .bm-plus::after{content:"";position:absolute;background:var(--acc,#4f57c4);border-radius:2px;transition:opacity .3s}.bm-faq-q .bm-plus::before{left:0;top:50%;width:100%;height:2px;transform:translateY(-50%)}.bm-faq-q .bm-plus::after{top:0;left:50%;width:2px;height:100%;transform:translateX(-50%)}.bm-faq-item[open] .bm-plus,.bm-faq-item.is-open .bm-plus{transform:rotate(90deg)}.bm-faq-item[open] .bm-plus::after,.bm-faq-item.is-open .bm-plus::after{opacity:0}` +
  `.bm-faq-a{overflow:hidden}.bm-faq-a p{padding:2px 13px 12px;margin:0;font-size:13px;color:var(--soft,#5b6172);line-height:1.55}.bm-faq-item[open] .bm-faq-a{animation:bmFaqIn .28s ease}@keyframes bmFaqIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}` +
  `.bm-cta{margin-top:18px;padding:16px;border-radius:14px;text-align:center;background:linear-gradient(135deg,var(--acc,#4f57c4),var(--acc2,#98a0ea))}.bm-cta p{color:#eef0ff;font-size:12.5px;margin:0 0 10px}.bm-cta button,.bm-cta a{display:inline-flex!important;align-items:center;gap:7px;background:#fff;color:var(--acc,#4f57c4);font-weight:700;font-size:13.5px;padding:10px 20px;border-radius:99px;border:0;text-decoration:none;cursor:pointer}` +
  // NOTE: no @keyframes for .bm-atc-glow here — its single definition lives in
  // FAQ_CTA_GUARANTEE (always appended), so there is never a duplicate/override.
  `</style>`,
);

const BM_LIGHTBOX =
  `<div class="bm-lightbox" data-bm-lightbox><button type="button" class="bm-close" data-bm-close aria-label="Close">✕</button>` +
  `<img src="" alt="Zoomed product image" data-bm-lightbox-img></div>`;

/** images for a `.bm-media` slot: first wrapped in `.bm-stage` (+ zoom hint), the
 *  rest plain — every one gets `data-bm-zoom` so the lightbox picks it up. A
 *  per-image `descCrop` becomes CSS aspect-ratio + cover-fit + object-position. */
function bmMediaInner(imgs: DescImg[]): string {
  return imgs
    .map((i, k) => {
      const ws = cropWrapStyle(i.crop);
      const tag = `<img src="${i.url}" alt="${esc(i.alt || "product photo")}" loading="${
        k === 0 ? "eager" : "lazy"
      }" decoding="async" data-bm-zoom${ws ? ` style="${cropImgStyle(i.crop)}"` : ""}>`;
      const cell = ws ? `<span class="bm-stage" data-bm-zoom style="${ws}">${tag}</span>` : tag;
      return k === 0 && !ws
        ? `<div class="bm-stage" data-bm-zoom>${tag}<span class="bm-zoomtag">🔍 Tap to zoom</span></div>`
        : cell;
    })
    .join("");
}

/** The canonical "Diğer HTML düzenler" runtime — FAQ accordion (class toggle
 *  only, no scrollHeight math: the model's own CSS defines the collapsed/open
 *  max-height) + "scroll to Add to Cart" with a `pd-atc-glow` class toggle (see
 *  `PD_STYLE_FALLBACK` for the actual glow look, so it's stylable/overridable —
 *  no inline-style fighting the theme). Delegated on `document` (not bound to
 *  the elements at script-run time) so it keeps working even if the theme moves
 *  or re-renders the description block after the page loads.
 *  We NEVER trust a model-authored `<script>` for this — see `ensurePdScaffold`. */
const PD_SCRIPT = `<script>
(function(){
  if(window.__pdInit) return; window.__pdInit = 1;
${SYNC_ACCENT_FN}
  syncAccentColor();
${FIND_ATC_FN}
  /* These descriptions can be long, so the real Add-to-Cart button can be a
     long smooth-scroll away -- the old 1600ms/2000ms safety caps could fire
     WHILE the page was still actively scrolling on a long page or a slower
     device, starting the glow mid-flight (looks like it "cuts off" as the
     page keeps moving under it). Longer caps cost nothing when scrollend (or
     the stillness check) fires on its own, which is the normal case -- they
     only matter as a fallback for the rare page where neither ever fires. */
  function afterScrollSettles(cb){
    var done = false;
    function fire(){ if(done) return; done = true; cb(); }
    if('onscrollend' in window){
      var cap = setTimeout(fire, 4000);
      window.addEventListener('scrollend', function h(){ window.removeEventListener('scrollend', h); clearTimeout(cap); fire(); }, {once:true});
      return;
    }
    var last = window.pageYOffset, still = 0;
    var iv = setInterval(function(){
      var y = window.pageYOffset;
      if(Math.abs(y - last) < 2){ still += 90; if(still >= 220){ clearInterval(iv); fire(); } }
      else { still = 0; last = y; }
    }, 90);
    setTimeout(function(){ clearInterval(iv); fire(); }, 4000);
  }
  function closeFaq(item){
    var b = item.querySelector('.pd-faq-a'); if(!b){ item.removeAttribute('open'); item.classList.remove('pd-open'); return; }
    var done = false;
    function finish(){ if(done) return; done = true; item.removeAttribute('open'); item.classList.remove('pd-open'); b.style.height = ''; }
    b.style.height = b.scrollHeight + 'px'; void b.offsetHeight;
    b.style.transition = 'height .34s cubic-bezier(.25,.8,.3,1)'; b.style.overflow = 'hidden'; b.style.height = '0px';
    b.addEventListener('transitionend', function te(){ b.removeEventListener('transitionend', te); finish(); }, {once:true});
    setTimeout(finish, 450);
  }
  function openFaq(item){
    var group = item.closest('.pd-ck__faq') || item.parentElement || document;
    group.querySelectorAll('.pd-faq-item[open], .pd-faq-item.pd-open').forEach(function(o){ if(o !== item) closeFaq(o); });
    item.setAttribute('open', ''); item.classList.add('pd-open');
    var b = item.querySelector('.pd-faq-a'); if(!b) return;
    var done = false;
    function finish(){ if(done) return; done = true; b.style.height = 'auto'; b.style.overflow = ''; }
    b.style.transition = 'height .34s cubic-bezier(.25,.8,.3,1)'; b.style.overflow = 'hidden'; b.style.height = '0px'; void b.offsetHeight;
    b.style.height = b.scrollHeight + 'px';
    b.addEventListener('transitionend', function te(){ b.removeEventListener('transitionend', te); finish(); }, {once:true});
    setTimeout(finish, 450);
  }
  document.addEventListener('click', function(e){
    var q = e.target && e.target.closest && e.target.closest('.pd-faq-q');
    if(q){
      var it = q.closest('.pd-faq-item'); if(!it) return;
      e.preventDefault();
      if(it.hasAttribute('open') || it.classList.contains('pd-open')) closeFaq(it); else openFaq(it);
      return;
    }
    var btn = e.target && e.target.closest && e.target.closest('[data-pd-goto-atc]');
    if(!btn) return;
    e.preventDefault();
    var atc = findAtc();
    if(!atc) return;
    atc.scrollIntoView({behavior:'smooth', block:'center'});
    afterScrollSettles(function(){
      atc.classList.remove('pd-atc-glow'); void atc.offsetWidth; atc.classList.add('pd-atc-glow');
      setTimeout(function(){ atc.classList.remove('pd-atc-glow'); }, 2600);
    });
  });
})();
</script>`;

/** Fallback CSS for the "Diğer" FAQ/CTA contract — inserted right after the
 *  block's OWN `<style>` opening tag, so any matching rule the model wrote
 *  later in the same stylesheet wins the cascade (same selector, later wins).
 *  This just guarantees the interaction never looks or feels broken even if
 *  the model forgot the transition or the glow entirely: a calm, non-abrupt
 *  FAQ collapse, and a subtle glow tinted by the model's own `--pd-accent` (a
 *  plain grey glow if the model didn't set one) so it reads as "this product's
 *  color", never a generic purple. */
/** The system's FAQ + Add-to-Cart-glow GUARANTEE — always injected for both the
 *  `.bm` and `.pd-*` layouts. `!important` on the open state + glow so a broken
 *  model rule (e.g. `.x.pd-open.pd-faq-a` missing the descendant space, or a
 *  `transition:max-height.45s` typo) cannot stop the accordion opening. Covers
 *  both toggle-class conventions: `.pd-open` (pd-*) and `.is-open` (.bm). */
const FAQ_CTA_GUARANTEE = fmtStyle(
  `<style>` +
  // 1) reveal blocks are ALWAYS visible — Shopify strips <script>, so a JS-gated
  //    opacity:0 reveal would leave the whole description invisible. Bulletproof.
  `.bm-reveal,.pd-reveal{opacity:1!important;transform:none!important}` +
  // 2) FAQ = native <details>/<summary>, ZERO JS. Hide the default disclosure
  //    triangle, make the row a pointer, smooth the open.
  `summary.bm-faq-q,summary.pd-faq-q{list-style:none!important;cursor:pointer!important;display:flex!important}` +
  `summary.bm-faq-q::-webkit-details-marker,summary.pd-faq-q::-webkit-details-marker{display:none}` +
  `summary.bm-faq-q::marker,summary.pd-faq-q::marker{content:""!important}` +
  `.bm-faq-q:hover,.pd-faq-q:hover{filter:brightness(.97)}` +
  `details.bm-faq-item[open]>.bm-faq-a,details.pd-faq-item[open]>.pd-faq-a{animation:tpsFaqIn .28s ease}` +
  `@keyframes tpsFaqIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}` +
  // 2c) a guaranteed +/- indicator on the question row itself, independent of
  //     whatever inner span/pseudo-element markup the model attempted for its
  //     own `.bm-plus` icon (observed in production: the model's own version
  //     sometimes doesn't render at all, leaving the row with no open/close
  //     affordance). Drawn with plain text content, not absolutely-positioned
  //     bars, so it can never fail to show up.
  `summary.bm-faq-q::after,summary.pd-faq-q::after{content:"+";margin-left:auto;padding-left:12px;flex:0 0 auto;font-size:1.2em;font-weight:300;line-height:1;transition:transform .35s cubic-bezier(.4,0,.2,1)}` +
  `details.bm-faq-item[open]>summary.bm-faq-q::after,details.pd-faq-item[open]>summary.pd-faq-q::after{content:"\\2212"}` +
  // 2b) legacy fallback: a model still emitting <div class="…-faq-item"> with a JS
  //     toggle class. Honour the toggle class if present; otherwise (no JS to set
  //     it) show the answer rather than trapping it closed forever.
  `div.bm-faq-item .bm-faq-a,div.pd-faq-item .pd-faq-a{overflow:hidden;transition:max-height .4s cubic-bezier(.4,0,.2,1)}` +
  `div.bm-faq-item.is-open>.bm-faq-a,div.pd-faq-item.pd-open>.pd-faq-a{max-height:1400px!important}` +
  // 3) Add-to-Cart glow — TWO pulses, 2.6s total (peaks at 25% & 75%). ONLY box-shadow
  //    + a tiny scale(): it must NEVER touch the store button's border-radius / padding
  //    / size / font / background, and the class is removed from the DOM after 2.6s so
  //    the button returns pixel-for-pixel to its pre-click look.
  // Kept soft on purpose: an earlier version used a solid 4px ring + a bright
  // 26px/.45-opacity blur, which read as a harsh neon halo rather than a
  // gentle pulse. A single soft blur at lower opacity, no hard ring, and a
  // smaller scale reads as smooth instead of sharp.
  // Colour: var(--acc-rgb) — set on :root by SYNC_ACCENT_FN at load time from
  // whatever accent colour the model actually picked for THIS product (see
  // that function's own comment for why it can't just cascade normally). The
  // literal 63,140,217 fallback only fires if that sync never ran at all.
  `@keyframes bmAtcGlow{` +
  `0%{box-shadow:0 0 0 0 rgba(var(--acc-rgb,63,140,217),0);transform:scale(1)}` +
  `25%{box-shadow:0 0 16px 4px rgba(var(--acc-rgb,63,140,217),.32);transform:scale(1.015)}` +
  `50%{box-shadow:0 0 0 0 rgba(var(--acc-rgb,63,140,217),0);transform:scale(1)}` +
  `75%{box-shadow:0 0 16px 4px rgba(var(--acc-rgb,63,140,217),.32);transform:scale(1.015)}` +
  `100%{box-shadow:0 0 0 0 rgba(var(--acc-rgb,63,140,217),0);transform:scale(1)}}` +
  `.pd-atc-glow,.bm-atc-glow{animation:bmAtcGlow 2.6s ease-in-out 1!important}` +
  `@media (prefers-reduced-motion:reduce){.pd-atc-glow,.bm-atc-glow{animation-duration:.01ms!important}}` +
  // 4) spec rows: force the clean two-column look + a real gap even if the model's
  //    nesting is off (the "MaterialPBT plastic" no-separator bug). Also force the
  //    card container itself (border/background/rounded corners) plus a per-row
  //    hover and a separator between rows — observed in production: the model
  //    sometimes drops the card look entirely and ships bare, unstyled text rows.
  `.bm-spec{border:1px solid var(--line,#e2e2e2)!important;border-radius:12px!important;overflow:hidden;background:var(--milk,#fafafa)!important}` +
  `.bm-spec .bm-r,.bm-spec>div:not(.bm-sub){display:flex!important;flex-wrap:wrap;justify-content:space-between!important;gap:6px 18px!important;align-items:baseline;padding:10px 14px;border-bottom:1px solid var(--line,#e2e2e2);transition:background .25s cubic-bezier(.4,0,.2,1)}` +
  `.bm-spec .bm-r:last-child,.bm-spec>div:not(.bm-sub):last-child{border-bottom:0}` +
  `.bm-spec .bm-r:hover,.bm-spec>div:not(.bm-sub):hover{background:var(--sky,#f2f6fb)}` +
  `.bm-spec .bm-k{flex:0 0 auto;max-width:44%;font-weight:500}` +
  `.bm-spec .bm-v{flex:1 1 auto;text-align:right;font-weight:600}` +
  // grouped sub-headers (optional — only present when the model grouped the
  // rows) get a real pill treatment too, not bare text: the model sometimes
  // writes the <span class="bm-sub"> markup but no CSS at all for it, which
  // renders as a plain unstyled line breaking up the card.
  `.bm-spec .bm-sub{display:flex;align-items:center;gap:8px;padding:10px 14px;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold,#3f8cd9);background:var(--sky,#eef6fc);border-bottom:1px solid var(--line2,#c9dcee)}` +
  `.bm-spec .bm-sub:not(:first-child){border-top:1px solid var(--line2,#c9dcee)}` +
  // 5) DESKTOP LAYOUT LOCK — images LEFT, text RIGHT, no matter what the model wrote.
  `.bm .bm-grid{display:grid!important;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)!important;gap:18px;align-items:start}` +
  `.bm .bm-media{grid-column:1!important;grid-row:1!important}` +
  `.bm .bm-c2{grid-column:2!important;grid-row:1!important}` +
  `@media (max-width:899px){` +
  `.bm .bm-grid{grid-template-columns:1fr!important}` +
  `.bm .bm-media{grid-column:1!important;grid-row:1!important}` +   // images first on mobile
  `.bm .bm-c2{grid-column:1!important;grid-row:2!important}` +
  `}` +
  `</style>`,
);

/** Guarantee a `.bm` styled block carries the no-JS guard, the lightbox node and
 *  the runtime `<script>`. We NEVER trust a model-authored `<script>` here either
 *  (same reason as `ensurePdScaffold`): strip whatever the model wrote and inject
 *  the tested canonical `BM_SCRIPT`. */
function ensureBmScaffold(html: string): string {
  if (!/class\s*=\s*["']bm["']/i.test(html)) return html;
  let out = html.replace(/<script\b[^>]*>(?:(?!<\/?script\b)[\s\S])*?<\/script\s*>/gi, "");
  out = forceCtaOnclick(out, "data-bm-goto-atc", BM_CTA_ONCLICK);
  // older `.bm` block (fallback card, pre-v2 model output) → add the v2-only CSS
  if (!/\.bm-lightbox\{/i.test(out)) {
    out = /<\/style>/i.test(out) ? out.replace(/<\/style>/i, `</style>${BM_STYLE_EXTRA}`) : BM_STYLE_EXTRA + out;
  }
  if (!/<noscript>[\s\S]*?bm-reveal/i.test(out)) {
    out = /<\/style>/i.test(out) ? out.replace(/<\/style>/i, `</style>${BM_NOSCRIPT}`) : BM_NOSCRIPT + out;
  }
  // close the .bm wrapper: the last </div> that belongs to it. We append before it.
  if (!/data-bm-lightbox/i.test(out)) {
    const last = out.lastIndexOf("</div>");
    if (last >= 0) out = out.slice(0, last) + BM_LIGHTBOX + out.slice(last);
    else out += BM_LIGHTBOX;
  }
  return out + FAQ_CTA_GUARANTEE + BM_SCRIPT;
}

/**
 * Guarantee a "Diğer HTML düzenler" block's FAQ + Add-to-Cart actually work.
 * A model-authored `<script>` is a common source of hard-to-catch syntax bugs
 * (e.g. `function{` instead of `function(){`) that silently kill EVERY
 * interaction on the page — so if the block carries our fixed hook classes
 * (`pd-faq-item`/`pd-faq-q` or `data-pd-goto-atc`), any `<script>` the model
 * wrote is stripped and replaced with the tested canonical one.
 */
function ensurePdScaffold(html: string): string {
  // Match the hook only when it is a real ELEMENT — not the `.pd-faq-item` text
  // inside FAQ_CTA_GUARANTEE's `<style>` (that false match used to make this run
  // on a `.bm` block and strip its BM_SCRIPT, killing the `.bm` CTA).
  if (!/<[a-z][a-z0-9]*\b[^>]*\bpd-faq-item\b/i.test(html) && !/\bdata-pd-goto-atc\b/i.test(html)) return html;
  let out = html.replace(/<script\b[^>]*>(?:(?!<\/?script\b)[\s\S])*?<\/script\s*>/gi, "");
  // a model-authored `<a href="#" data-pd-goto-atc>` would jump to the top of
  // the page on click before (or if) our delegated handler ever runs — strip
  // any href on the CTA element so the browser has nothing to navigate to.
  out = out.replace(/<a\b([^>]*\bdata-pd-goto-atc\b[^>]*)>/gi, (_m, attrs) =>
    `<a${attrs.replace(/\s+href\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")}>`,
  );
  out = forceCtaOnclick(out, "data-pd-goto-atc", PD_CTA_ONCLICK);
  // FAQ_CTA_GUARANTEE is its own `<style>` element — append it as a SIBLING at the
  // end (its `!important` rules win regardless of position); never nest it inside
  // the model's `<style>` (that produces `<style><style>` and the browser prints
  // the CSS as text).
  return out + FAQ_CTA_GUARANTEE + PD_SCRIPT;
}

/**
 * Add the runtime scaffold (guard styles, lightbox, canonical `<script>`) to a
 * model-authored pre-styled block. Dispatches by block TYPE: a `.bm` block gets
 * ONLY `ensureBmScaffold` (running `ensurePdScaffold` after it used to strip the
 * freshly-added BM_SCRIPT — because FAQ_CTA_GUARANTEE's CSS mentions
 * `.pd-faq-item` — leaving the `.bm` "scroll to Add to Cart" button with no
 * handler at all). Anything else goes through `ensurePdScaffold`.
 */
function scaffoldPrestyled(html: string): string {
  const isBm = /<div\b[^>]*class\s*=\s*["']bm["']/i.test(html) || /class\s*=\s*["']bm["']/i.test(html);
  return isBm ? ensureBmScaffold(html) : ensurePdScaffold(html);
}

/**
 * Drop the product images into a model-authored styled block.
 * - `.bm-media` (Alt alta görsel) is a single stacked-gallery slot → gets the
 *   whole zoomable image stack.
 * - `pd-media` (Diğer HTML düzenler) is a ONE-IMAGE-PER-SLOT placeholder — the
 *   model arranges several of them into grids/variant-cards/a wide cinematic
 *   crop with its own CSS; we never bundle multiple photos into one slot (that
 *   was the old "stacked inside a grid cell" bug). Extra images beyond the
 *   slot count get their own trailing single-image slots (never merged into
 *   one); a slot beyond the image count is dropped, not left empty.
 * - No slot at all → images are distributed at section boundaries so they
 *   never pile up at the bottom in one column.
 */
function fillMediaSlots(html: string, imgs: DescImg[]): string {
  if (!imgs.length) return html;
  const bmRe = /<div\b[^>]*class\s*=\s*["'][^"']*\bbm-media\b[^"']*["'][^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<\/div>/i;
  // a `.bm` block that forgot its media slot entirely → give it one just before
  // the wrapper closes, so the product photos still land (was: "görseller gelmemiş").
  if (
    !bmRe.test(html) &&
    !/\bpd-media\b/i.test(html) &&
    /class\s*=\s*["']bm["']/i.test(html) &&
    !/<img\b/i.test(html)
  ) {
    const cut = html.search(/<div\b[^>]*\bdata-bm-lightbox\b/i);
    const at = cut >= 0 ? cut : html.lastIndexOf("</div>");
    html = at >= 0 ? html.slice(0, at) + `<div class="bm-media"></div>` + html.slice(at) : html + `<div class="bm-media"></div>`;
  }
  if (bmRe.test(html)) {
    return html.replace(bmRe, (m) => `${m.slice(0, m.indexOf(">") + 1)}${bmMediaInner(imgs)}</div>`);
  }

  const single = (i: DescImg) => {
    const ws = cropWrapStyle(i.crop);
    const im = `<img src="${i.url}" alt="${esc(i.alt || "product photo")}" loading="lazy"${
      ws ? ` style="${cropImgStyle(i.crop)}"` : ` style="display:block;width:100%;height:auto"`
    }>`;
    return ws ? `<span style="${ws}">${im}</span>` : im;
  };

  const slotRe = /<div\b[^>]*class\s*=\s*["'][^"']*\bpd-media\b[^"']*["'][^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<\/div>/gi;
  let idx = 0;
  let filled = "";
  let cursor = 0;
  let lastSlotEnd = -1; // offset in `filled` right after the LAST pd-media match (filled or dropped)
  let m: RegExpExecArray | null;
  while ((m = slotRe.exec(html))) {
    filled += html.slice(cursor, m.index);
    if (idx < imgs.length) {
      const openTag = m[0].slice(0, m[0].indexOf(">") + 1); // keep the model's own classes/attrs (grid item, --wide modifier…)
      filled += `${openTag}${single(imgs[idx++])}</div>`;
    } // else: more slots than photos → drop the empty one, don't leave a broken box
    cursor = m.index + m[0].length;
    lastSlotEnd = filled.length;
  }
  filled += html.slice(cursor);
  if (lastSlotEnd >= 0) {
    if (idx >= imgs.length) return filled; // every photo placed
    // more photos than slots → give each leftover its OWN single-image slot,
    // inserted right after the LAST real media slot — never at the very end of
    // the whole document, which could land them after the FAQ/CTA section.
    const extra = imgs.slice(idx).map((im) => `<div class="pd-media">${single(im)}</div>`).join("");
    return filled.slice(0, lastSlotEnd) + extra + filled.slice(lastSlotEnd);
  }

  // No `pd-media` slot at all → distribute at section boundaries (`</h2>`/`</h3>`/
  // `</section>`) so photos land next to the copy they illustrate, never as one
  // pile at the bottom. Still one image per inserted slot, never a bundle.
  const bounds: number[] = [];
  const boundRe = /<\/(?:h2|h3|section)>|<\/p>\s*(?=<h[23]|<section)/gi;
  let bm: RegExpExecArray | null;
  while ((bm = boundRe.exec(html))) bounds.push(bm.index + bm[0].length);
  if (bounds.length >= 2) {
    const usable = bounds.slice(1);
    const n = Math.min(usable.length, imgs.length);
    const step = usable.length / n;
    let out = "";
    let cursor = 0;
    for (let g = 0; g < n; g++) {
      const at = usable[Math.min(usable.length - 1, Math.round((g + 1) * step) - 1)];
      out += html.slice(cursor, at) + `<div class="pd-media">${single(imgs[g])}</div>`;
      cursor = at;
    }
    // any remaining photos (more images than usable boundaries) go one-per-slot after the last boundary
    for (let g = n; g < imgs.length; g++) out += `<div class="pd-media">${single(imgs[g])}</div>`;
    return out + html.slice(cursor);
  }
  // truly no structure to hang them on → one slot per image, appended before the wrapper's close
  const media = imgs.map((im) => `<div class="pd-media">${single(im)}</div>`).join("");
  const last = html.lastIndexOf("</div>");
  return last >= 0 ? html.slice(0, last) + media + html.slice(last) : html + media;
}

function renderDescBody(
  layoutId: string | undefined,
  baseHtml: string,
  imgsIn: DescImg[],
  meta?: DescMeta,
): string {
  const base = cleanDescValue(baseHtml);
  const imgs = (imgsIn || []).filter((i) => i && i.url).slice(0, MAX_DESC_IMAGES);
  // The model is asked to emit a COMPLETE styled block for EVERY Shopify layout
  // (the `.bm` sticky card for "Alt alta görsel", or a bespoke block in the
  // spirit of the reference examples for "Diğer HTML düzenler"). If it did → just
  // drop the product images into its media slots and return it verbatim.
  if (isPreStyled(base)) return scaffoldPrestyled(fillMediaSlots(base, imgs));
  // fallback: model wrote only semantic HTML → build the `.bm` card from it.
  if (isSelfContainedLayout(layoutId)) return ensureBmScaffold(renderBmSticky(base, imgs, meta));
  if (layoutId === "none" || !imgs.length) return ensureHtml(base);

  const cap = (i: { alt?: string }, n: number, fb = "") => esc((i.alt || "").trim() || (fb ? `${fb} ${n}` : ""));
  const wrap = (inner: string, style = "margin-top:14px") => `${base}\n<div class="tps-desc-images" style="${style}">${inner}</div>`;

  switch (layoutId) {
    case "stacked-alt":
      return (
        base +
        `\n<div class="tps-desc-images">\n` +
        imgs
          .map((i) => `<figure style="margin:0 0 14px">${img(i.url, i.alt || "")}<figcaption style="font-size:13px;color:#666;margin-top:4px">${esc(i.alt || "")}</figcaption></figure>`)
          .join("\n") +
        `\n</div>`
      );
    case "grid-2":
    case "grid-3": {
      const cols = layoutId === "grid-2" ? 2 : 3;
      return (
        base +
        `\n<div class="tps-desc-images" style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;margin-top:12px">` +
        imgs.map((i) => img(i.url, i.alt || "", "border-radius:8px")).join("") +
        `</div>`
      );
    }
    case "hero-grid": {
      const [hero, ...rest] = imgs;
      return (
        base +
        `\n<div class="tps-desc-images" style="margin-top:12px">` +
        img(hero.url, hero.alt || "", "border-radius:10px;margin-bottom:10px") +
        (rest.length
          ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${rest.map((i) => img(i.url, i.alt || "", "border-radius:8px")).join("")}</div>`
          : "") +
        `</div>`
      );
    }
    case "alternating":
      return (
        base +
        `\n<div class="tps-desc-images" style="margin-top:12px">` +
        imgs
          .map(
            (i, k) =>
              `<div style="display:flex;gap:14px;align-items:center;margin-bottom:14px;flex-direction:${k % 2 ? "row-reverse" : "row"}">` +
              `<div style="flex:1 1 55%">${img(i.url, i.alt || "", "border-radius:8px")}</div>` +
              `<p style="flex:1 1 45%;font-size:14px;color:#444;margin:0">${esc(i.alt || "")}</p></div>`,
          )
          .join("") +
        `</div>`
      );
    case "cards":
      return (
        base +
        `\n<div class="tps-desc-images" style="margin-top:12px;display:flex;flex-direction:column;gap:12px">` +
        imgs
          .map(
            (i) =>
              `<div style="border:1px solid #e5e5e5;border-radius:12px;overflow:hidden">${img(i.url, i.alt || "")}` +
              (i.alt ? `<div style="padding:8px 12px;font-size:13px;color:#555">${esc(i.alt)}</div>` : "") +
              `</div>`,
          )
          .join("") +
        `</div>`
      );
    case "full-bleed":
      return (
        base +
        `\n<div class="tps-desc-images" style="margin-top:12px">` +
        imgs.map((i) => img(i.url, i.alt || "", "margin:0")).join("") +
        `</div>`
      );

    case "feature-split":
      return wrap(
        imgs
          .map((i, k) => {
            const c = cap(i, k + 1);
            return (
              `<section style="margin:0 0 22px;text-align:center;padding:${k % 2 ? "16px 0" : "0"};background:${k % 2 ? "#f7f7f9" : "transparent"};border-radius:12px">` +
              img(i.url, i.alt || "", "border-radius:10px") +
              (c ? `<h3 style="font:600 17px/1.3 sans-serif;color:#1f2430;margin:12px 0 4px">${c}</h3>` : "") +
              `</section>`
            );
          })
          .join(""),
      );

    case "filmstrip":
      return wrap(
        `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch">` +
          imgs.slice(0, 12).map((i) => img(i.url, i.alt || "", "height:110px;width:auto;border-radius:8px;flex:0 0 auto")).join("") +
          `</div>` +
          `<div style="margin-top:12px">${imgs.map((i) => `<p style="margin:0 0 10px">${img(i.url, i.alt || "")}</p>`).join("")}</div>`,
      );

    case "magazine": {
      const [first, ...rest] = imgs;
      return wrap(
        `<div style="overflow:hidden">` +
          `<div style="float:left;width:min(46%,360px);margin:0 16px 10px 0">${img(first.url, first.alt || "")}</div>` +
          `<p style="margin:0;font:15px/1.7 sans-serif;color:#3a4050">${escT((meta?.name || "") + " ")}${cap(first, 1)}</p>` +
          `</div>` +
          `<div style="clear:both;margin-top:14px">${rest.map((i) => `<p style="margin:0 0 12px">${img(i.url, i.alt || "")}</p>`).join("")}</div>`,
      );
    }

    case "quote-blocks":
      return wrap(
        imgs
          .map((i, k) => {
            const c = cap(i, k + 1);
            return (
              img(i.url, i.alt || "", "border-radius:10px") +
              (c
                ? `<div style="margin:8px 0 18px;padding:12px 14px;background:#f2f4ff;border-left:3px solid #5768d6;border-radius:0 10px 10px 0;font:15px/1.6 sans-serif;color:#333">💬 ${c}</div>`
                : `<div style="height:14px"></div>`)
            );
          })
          .join(""),
      );

    case "numbered-steps":
      return wrap(
        imgs
          .map((i, k) => {
            const c = cap(i, k + 1, "Step");
            return (
              `<div style="margin:0 0 20px">` +
              `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">` +
              `<span style="flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:#1f2430;color:#fff;font:700 14px/28px sans-serif;text-align:center">${k + 1}</span>` +
              (c ? `<h3 style="font:600 15px/1.3 sans-serif;color:#1f2430;margin:0">${c}</h3>` : "") +
              `</div>` +
              img(i.url, i.alt || "", "border-radius:10px") +
              `</div>`
            );
          })
          .join(""),
      );

    case "polaroid":
      return wrap(
        `<div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center">` +
          imgs
            .map((i, k) => {
              const c = cap(i, k + 1);
              return (
                `<figure style="margin:0;flex:1 1 240px;max-width:320px;background:#fff;border:1px solid #e6e6e6;border-radius:4px;padding:10px 10px 6px;box-shadow:0 2px 10px rgba(0,0,0,.08);transform:rotate(${k % 2 ? "1.4deg" : "-1.4deg"})">` +
                img(i.url, i.alt || "") +
                `<figcaption style="font:italic 13px/1.4 'Segoe Print',cursive,sans-serif;color:#555;text-align:center;padding:8px 2px 2px">${c || "&nbsp;"}</figcaption></figure>`
              );
            })
            .join("") +
          `</div>`,
      );

    case "minimal-center":
      return wrap(
        imgs
          .map((i, k) => {
            const c = cap(i, k + 1);
            return (
              `<div style="margin:0 0 34px">` +
              img(i.url, i.alt || "", "border-radius:2px") +
              (c ? `<p style="text-align:center;font:italic 13px/1.5 sans-serif;color:#888;margin:10px 0 0">${c}</p>` : "") +
              `</div>`
            );
          })
          .join(""),
        "margin:18px auto 0;max-width:620px",
      );

    case "masonry":
      return wrap(
        `<div style="column-count:2;column-gap:10px;column-fill:balance">` +
          imgs
            .map((i) => `<div style="break-inside:avoid;margin:0 0 10px">${img(i.url, i.alt || "", "border-radius:8px")}</div>`)
            .join("") +
          `</div>`,
      );

    case "fullbleed-caption":
      return wrap(
        imgs
          .map((i, k) => {
            const c = cap(i, k + 1);
            return (
              `<div style="position:relative;margin:0 0 4px;line-height:0">` +
              img(i.url, i.alt || "", "margin:0") +
              (c
                ? `<div style="position:absolute;left:0;right:0;bottom:0;padding:8px 12px;background:linear-gradient(transparent,rgba(0,0,0,.62));color:#fff;font:500 13px/1.4 sans-serif">${c}</div>`
                : "") +
              `</div>`
            );
          })
          .join(""),
        "margin-top:14px;border-radius:12px;overflow:hidden",
      );

    case "spec-rhythm":
      return wrap(
        imgs
          .map((i, k) => {
            const c = cap(i, k + 1);
            return (
              img(i.url, i.alt || "", "border-radius:8px") +
              `<div style="display:flex;align-items:center;gap:10px;margin:10px 0 18px">` +
              `<span style="flex:0 0 24px;height:1px;background:#ccc"></span>` +
              `<span style="font:600 12px/1 sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#888">${c || `0${k + 1}`.slice(-2)}</span>` +
              `<span style="flex:1;height:1px;background:#eee"></span></div>`
            );
          })
          .join(""),
      );

    case "themed-header":
    default:
      return (
        base +
        `\n<div class="tps-desc-images">\n` +
        imgs.map((i) => `<p style="margin:0 0 12px">${img(i.url, i.alt || "")}</p>`).join("\n") +
        `\n</div>`
      );
  }
}

/* ----------------------- bm-sticky (2-column card) ----------------------- */

const stripTags = (s: string) =>
  String(s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const paras = (html: string) =>
  stripTags(html)
    .split(/\n{1,}/)
    .map((s) => s.trim())
    .filter(Boolean);

const sentences = (text: string) =>
  String(text ?? "")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter(Boolean);

const liItems = (html: string) => {
  const out: string[] = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(stripTags(m[1]).trim());
  return out.filter(Boolean);
};

const HI_ICONS = ["✨", "🌟", "💠", "🧩", "🎯", "🛠️"];

// --- CJK guard: the product output must never contain Chinese anywhere ---
const CJK_CHARS = /[⺀-鿿豈-﫿＀-￯　-〿\u{20000}-\u{2FA1F}]/gu;
const noCJK = (s: unknown) => String(s ?? "").replace(CJK_CHARS, "").replace(/\s{2,}/g, " ").trim();
const hasCJKch = (s: unknown) => /[㐀-鿿豈-﫿]/.test(String(s ?? ""));

const SPEC_KEY_MAP: Record<string, string> = {
  材质: "Material", 键帽材质: "Keycap Material", 工艺: "Technique", 字符工艺: "Legend Process",
  高度: "Profile", 原厂高度: "Profile", 主题: "Theme", 兼容: "Compatibility", 适用: "Compatibility",
  颜色: "Color", 尺寸: "Size", 风格: "Style", 图案: "Pattern", 品牌: "Brand", 重量: "Weight",
  类型: "Type", 规格: "Spec", 产地: "Origin", 包装: "Packaging", 型号: "Model", 颗数: "Key Count",
  键数: "Key Count", 数量: "Count", 是否透光: "Backlight", 透光: "Backlight", 轴体: "Switch",
  接口: "Connection", 灯效: "Lighting", 键位: "Layout", 布局: "Layout",
};
/** Translate a (possibly Chinese) spec key to English, or null if it can't be made clean. */
function specKey(k: string): string | null {
  const t = String(k || "").trim();
  if (SPEC_KEY_MAP[t]) return SPEC_KEY_MAP[t];
  for (const [zh, en] of Object.entries(SPEC_KEY_MAP)) if (t.includes(zh)) return en;
  const ascii = noCJK(t);
  return ascii && /[a-z]/i.test(ascii) ? ascii.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

interface BmPalette {
  acc: string; acc2: string; lav: string; sky: string; line: string;
  head: string; body: string; heroGrad: string; barGrad: string; emoji: string;
}
/** pick an accent palette + emoji for the sticky card from the product's colour /
 *  theme words — so the fallback card isn't always the same indigo. */
function pickPalette(text: string): BmPalette | null {
  const h = ` ${String(text || "").toLowerCase()} `;
  const P: Record<string, BmPalette> = {
    purple: { acc: "#7c3aed", acc2: "#c4b5fd", lav: "#f3e8ff", sky: "#ede9fe", line: "rgba(124,58,237,.16)", head: "#4c1d95", body: "#5b21b6", heroGrad: "linear-gradient(165deg,#f5edff 0%,#efe7ff 55%,#fdfbff 100%)", barGrad: "linear-gradient(135deg,#f1e6ff,#efe7ff)", emoji: "💜" },
    pink: { acc: "#db2777", acc2: "#f9a8d4", lav: "#fce7f3", sky: "#fbe9f1", line: "rgba(219,39,119,.16)", head: "#9d174d", body: "#be185d", heroGrad: "linear-gradient(165deg,#ffe9f4 0%,#ffe7f0 55%,#fffafc 100%)", barGrad: "linear-gradient(135deg,#ffe1ef,#ffe7f0)", emoji: "🌸" },
    blue: { acc: "#2563eb", acc2: "#93c5fd", lav: "#e0ecff", sky: "#e7f0ff", line: "rgba(37,99,235,.16)", head: "#1e3a8a", body: "#1d4ed8", heroGrad: "linear-gradient(165deg,#e6f0ff 0%,#eaf1ff 55%,#fbfdff 100%)", barGrad: "linear-gradient(135deg,#e2edff,#eaf1ff)", emoji: "💙" },
    green: { acc: "#059669", acc2: "#6ee7b7", lav: "#d1fae5", sky: "#e3f7ee", line: "rgba(5,150,105,.16)", head: "#065f46", body: "#047857", heroGrad: "linear-gradient(165deg,#e4f7ee 0%,#e9f6f0 55%,#fbfefc 100%)", barGrad: "linear-gradient(135deg,#dcf5e8,#e9f6f0)", emoji: "🌿" },
    red: { acc: "#dc2626", acc2: "#fca5a5", lav: "#fee2e2", sky: "#fdeaea", line: "rgba(220,38,38,.16)", head: "#991b1b", body: "#b91c1c", heroGrad: "linear-gradient(165deg,#ffe9e9 0%,#ffecec 55%,#fffbfb 100%)", barGrad: "linear-gradient(135deg,#ffe1e1,#ffecec)", emoji: "❤️" },
    orange: { acc: "#ea580c", acc2: "#fdba74", lav: "#ffedd5", sky: "#fdeede", line: "rgba(234,88,12,.16)", head: "#9a3412", body: "#c2410c", heroGrad: "linear-gradient(165deg,#fff0e2 0%,#ffefe0 55%,#fffcf9 100%)", barGrad: "linear-gradient(135deg,#ffe7d0,#ffefe0)", emoji: "🧡" },
    yellow: { acc: "#ca8a04", acc2: "#fde047", lav: "#fef9c3", sky: "#fdf6d8", line: "rgba(202,138,4,.16)", head: "#854d0e", body: "#a16207", heroGrad: "linear-gradient(165deg,#fdf6d6 0%,#fbf5db 55%,#fffef6 100%)", barGrad: "linear-gradient(135deg,#fdf2c4,#fbf5db)", emoji: "⭐" },
    coffee: { acc: "#92400e", acc2: "#d6ac8a", lav: "#f0e5da", sky: "#f2e9df", line: "rgba(146,64,14,.16)", head: "#5c3111", body: "#78421a", heroGrad: "linear-gradient(165deg,#f3ebe1 0%,#f1e8dd 55%,#fdfbf8 100%)", barGrad: "linear-gradient(135deg,#eee2d3,#f1e8dd)", emoji: "☕" },
    teal: { acc: "#0d9488", acc2: "#5eead4", lav: "#ccfbf1", sky: "#dff6f2", line: "rgba(13,148,136,.16)", head: "#115e59", body: "#0f766e", heroGrad: "linear-gradient(165deg,#def6f2 0%,#e6f5f2 55%,#fafefd 100%)", barGrad: "linear-gradient(135deg,#d3f4ee,#e6f5f2)", emoji: "🩵" },
    mono: { acc: "#334155", acc2: "#94a3b8", lav: "#eef1f5", sky: "#eef1f5", line: "rgba(51,65,85,.18)", head: "#1e293b", body: "#334155", heroGrad: "linear-gradient(165deg,#eef1f5 0%,#f1f3f6 55%,#fdfdfe 100%)", barGrad: "linear-gradient(135deg,#e8ecf1,#f1f3f6)", emoji: "🖤" },
  };
  const has = (...w: string[]) => w.some((x) => h.includes(x));
  if (has(" purple", "lilac", "lavender", "violet", "grape", "taro")) return P.purple;
  if (has(" pink", "sakura", "rose", "blush", "peach pink", "kawaii pink", "strawberry")) return P.pink;
  if (has("coffee", "latte", "mocha", "caramel", " brown", "chocolate", "espresso", "wood")) return P.coffee;
  if (has("matcha", " green", "mint", "sage", "forest", "olive", "lime")) return P.green;
  if (has(" red ", "crimson", "scarlet", "cherry red", "ruby")) return P.red;
  if (has("orange", "amber", "tangerine", "sunset", "apricot")) return P.orange;
  if (has("yellow", "lemon", "gold ", "honey", "banana", "cream yellow")) return P.yellow;
  if (has("teal", "cyan", "aqua", "turquoise", "seafoam", "ocean")) return P.teal;
  if (has("blueberry", " blue", "navy", "sky", "cobalt", "denim")) return P.blue;
  if (has(" black", "dark ", "monochrome", "gunmetal", "graphite", "charcoal", "noir")) return P.mono;
  return null; // keep the default indigo
}

/**
 * Self-contained Shopify description: full-width hero + sticky 2-column card
 * (spec list + highlights) on the left of a zero-gap image stack, collapsing to
 * a single column with a "Product Details" toggle on mobile. No JS, no CDNs.
 * Content is mined from the model's text body + the product spec map; the CSS is
 * fixed and hardened against theme float/overflow/sticky conflicts. Used only as
 * the FALLBACK when the model didn't emit its own full styled block.
 */
function renderBmSticky(baseIn: string, imgs: DescImg[], meta?: DescMeta): string {
  const name = noCJK(meta?.name) || "This Product";
  // If the model echoed the reference template (with its <style>/wrapper divs),
  // strip that machinery so mining reads real copy, not CSS text.
  const base = String(baseIn || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>(?:(?!<\/?script\b)[\s\S])*?<\/script\s*>/gi, "")
    .replace(/<\/?(?:input|label)\b[^>]*>/gi, "")
    .replace(/<img\b[^>]*>/gi, "");

  // Clean, customer-facing specs only — marketplace stats (sales / shipping /
  // reviews / stock / listing date …), CJK-only and junk values are dropped.
  const props = cleanSpecs(meta?.props, 10).map((s) => [s.label, s.value] as [string, string]);
  const specs = props.slice(0, 6);
  // badges / sub-line: readable words only — dedupe (case-insensitive) and drop
  // bare numbers ("138" on its own tells a shopper nothing) and 1-char scraps.
  const seenBadge = new Set<string>();
  const badgeVals = props
    .map(([, v]) => v)
    .filter((v) => {
      const k = v.toLowerCase().trim();
      if (v.length > 22 || v.length < 2 || /^[\d.,]+$/.test(k) || seenBadge.has(k)) return false;
      seenBadge.add(k);
      return true;
    })
    .slice(0, 5);
  const subLine = badgeVals.slice(0, 4).join(" · ");

  const pList = paras(base).map(noCJK).filter(Boolean);
  const textAll = pList.join(" ").replace(/\s+/g, " ").trim();

  let lede = pList[0] || textAll;
  if (lede.length > 340) lede = sentences(lede).slice(0, 2).join(" ") || lede.slice(0, 320).trim() + "…";
  if (!lede) lede = `${name} — see the specifications and photos below.`;

  let hi = liItems(base).map(noCJK).filter(Boolean).slice(0, 4);
  if (hi.length < 2) {
    const ss = sentences(textAll).filter((s) => s.length > 24 && s.length < 170);
    if (ss.length >= 2) hi = ss.slice(0, 4);
  }
  if (hi.length < 2 && specs.length) hi = specs.slice(0, 4).map(([k, v]) => `${k}: ${v}`);

  const hiRows = hi
    .map((h, i) => {
      let title = h;
      let desc = "";
      const c = h.indexOf(":");
      if (c > 0 && c <= 40) {
        title = h.slice(0, c).trim();
        desc = h.slice(c + 1).trim();
      } else {
        const w = h.split(/\s+/);
        if (w.length > 9) {
          title = w.slice(0, 5).join(" ");
          desc = w.slice(5).join(" ");
        }
      }
      return (
        `<li><span class="ico">${HI_ICONS[i % HI_ICONS.length]}</span>` +
        `<span class="tx"><b>${escT(title)}</b>${desc ? `<span class="t">${escT(desc)}</span>` : ""}</span></li>`
      );
    })
    .join("");

  let note = (meta?.note || "").trim();
  if (!note) {
    note =
      pList.find((p) =>
        /in the box|not included|before you order|check your|compatib|care|wash|wipe|warranty|warning/i.test(p),
      ) || "";
  }
  const noteHtml = note
    ? escT(note)
    : `<b>📦 In the box:</b> the item shown. Anything else in the photos is for demonstration only.<br>` +
      `<b>💡 Before you order:</b> please check the specifications above against your own setup.<br>` +
      `<b>🧼 Care:</b> wipe gently with a soft, slightly damp cloth and let it dry fully.`;

  const specRows =
    specs.map(([k, v]) => `<div class="bm-r"><span class="bm-k">${escT(k)}</span><span class="bm-v">${escT(v)}</span></div>`).join("") ||
    `<div class="bm-r"><span class="bm-k">Details</span><span class="bm-v">See photos</span></div>`;
  const badges = badgeVals.map((v) => `<span>${escT(v)}</span>`).join("");
  const imgTags = bmMediaInner(imgs.map((i) => ({ url: i.url, alt: i.alt || name + " product photo" })));
  // a tiny generic FAQ so the fallback card matches the v2 shape
  const faqHtml =
    `<h3>Compatibility &amp; Care</h3><div class="bm-faq">` +
    `<div class="bm-faq-item is-open"><button type="button" class="bm-faq-q"><span>🧷 Will this fit my setup?</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>Check the specifications above and the compatibility photos against your own hardware before ordering.</p></div></div>` +
    `<div class="bm-faq-item"><button type="button" class="bm-faq-q"><span>🧼 How do I care for it?</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>Wipe gently with a soft, slightly damp cloth and let it dry fully. Avoid harsh solvents and hot water.</p></div></div>` +
    `<div class="bm-faq-item"><button type="button" class="bm-faq-q"><span>📦 What's included?</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>Only the item shown in the title. Anything else in the photos is for demonstration unless the listing says otherwise.</p></div></div>` +
    `</div>`;
  const ctaHtml = `<div class="bm-cta"><p>Ready to make it yours? ✨</p><button type="button" data-bm-goto-atc>🛒 Add to Cart</button></div>`;

  // per-product accent palette + toggle emoji (colour/theme words → palette)
  const pal = pickPalette(`${name} ${textAll} ${badgeVals.join(" ")} ${JSON.stringify(meta?.props || {})}`);
  const BM_EMOJI = pal?.emoji || "📋";

  const raw = `<div class="bm" lang="en">
<style>
/* ===== ${escT(name)} — product description ===== */
.bm{
  --ink:#242938; --soft:#5b6172; --acc:#4f57c4; --acc2:#98a0ea;
  --lav:#eef0fb; --sky:#eaeefc; --milk:#fcfcff; --line:rgba(79,87,196,.16);
  --top:20px;            /* sticky offset — raise to ~90px if your theme has a fixed header */
  --r:16px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--ink); line-height:1.62; text-align:left; overflow-wrap:break-word;
  width:100%; max-width:1160px; margin:0 auto; padding:0; -webkit-font-smoothing:antialiased;
}
.bm *{box-sizing:border-box; min-width:0; max-width:100%}
.bm p{margin:0 0 10px}
.bm div,.bm span,.bm ul,.bm li,.bm p,.bm h2,.bm h3{float:none !important}
.bm ul{list-style:none !important; padding:0 !important; margin:0 !important}

.bm-toggle{position:absolute; width:1px; height:1px; opacity:0; pointer-events:none}
.bm-bar{display:none}
.bm-c1,.bm-c2{display:block}
.bm-inner{display:block}

.bm-hero{
  text-align:center; padding:30px 20px 24px; margin:0 0 16px;
  border:1px solid var(--line); border-radius:var(--r);
  background:linear-gradient(165deg,#eef2ff 0%,#f1effb 55%,#fdfdff 100%);
}
.bm-eyebrow{
  display:inline-block; font-size:11px; letter-spacing:.18em; text-transform:uppercase;
  color:var(--acc); background:#fff; border:1px solid var(--line);
  padding:5px 12px; border-radius:99px; margin-bottom:12px;
}
.bm-hero h2{margin:0 0 8px; font-size:26px; line-height:1.25; color:#2b3170; font-weight:700}
.bm-hero .sub{margin:0 0 15px; font-size:14px; color:var(--soft)}
.bm-badges{display:flex; flex-wrap:wrap; gap:8px; justify-content:center}
.bm-badges span{
  font-size:12.5px; color:#3b4585; background:#fff; border:1px solid var(--line);
  padding:6px 12px; border-radius:99px; white-space:nowrap;
}

.bm-grid{
  display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);
  gap:18px; align-items:start; transition:gap .45s cubic-bezier(.25,.8,.3,1);
}
.bm-media{grid-column:1; grid-row:1}
.bm-c2{grid-column:2; grid-row:1; position:-webkit-sticky; position:sticky; top:var(--top); align-self:start}

.bm-media{
  font-size:0; line-height:0; border-radius:var(--r); overflow:hidden;
  border:1px solid var(--line); background:var(--milk);
}
.bm-media img{
  display:block !important; width:100% !important; height:auto;
  margin:0 !important; padding:0 !important; border:0 !important;
  vertical-align:top; border-radius:0 !important; max-width:100%;
}

.bm-info{
  padding:20px 18px; border:1px solid var(--line); border-radius:var(--r); background:var(--milk);
}
.bm-info h3{
  margin:0 0 10px; font-size:12.5px; font-weight:700; letter-spacing:.1em;
  text-transform:uppercase; color:var(--acc);
}
.bm-info h3:not(:first-child){margin-top:20px}
.bm-lede{font-size:14.5px; color:#3a4070; margin:0}
.bm-lede strong{color:#2b3170}

.bm-feat{margin:0 !important; padding:0 !important; list-style:none !important}
.bm-feat li{
  display:flex !important; gap:10px; align-items:flex-start;
  padding:9px 0; margin:0 !important; list-style:none !important; border-bottom:1px dashed var(--line);
}
.bm-feat li:last-child{border-bottom:0; padding-bottom:0}
.bm-feat .ico{
  flex:0 0 30px; width:30px; height:30px; border-radius:9px;
  display:flex !important; align-items:center; justify-content:center; font-size:15px; background:var(--sky);
}
.bm-feat .tx{flex:1 1 auto; min-width:0}
.bm-feat b{display:block; color:#2b3170; font-size:13.8px; margin-bottom:1px}
.bm-feat .t{display:block; color:var(--soft); font-size:13px; line-height:1.45}

.bm-spec{display:block !important; margin:0 !important; padding:0 !important; font-size:13.5px}
.bm-spec .bm-r{
  display:flex !important; flex-wrap:nowrap; align-items:baseline; justify-content:space-between;
  gap:12px; width:100%; margin:0 !important; padding:8px 0; border-bottom:1px solid var(--line);
}
.bm-spec .bm-r:last-child{border-bottom:0}
.bm-spec .bm-k{flex:0 0 auto; color:var(--soft); margin:0 !important}
.bm-spec .bm-v{
  flex:1 1 auto; min-width:0; text-align:right; color:#2b3170; font-weight:600;
  margin:0 !important; overflow-wrap:break-word;
}

.bm-note{
  margin:16px 0 0; padding:11px 13px; border-radius:12px;
  background:var(--lav); border:1px solid var(--line); font-size:12.8px; color:#3f4578; line-height:1.5;
}
.bm-note b{color:#2b3170}

@media (max-width:899px){
  .bm-bar{
    display:flex !important; align-items:center; justify-content:space-between; gap:12px;
    width:100%; margin:0; padding:15px 17px; cursor:pointer; user-select:none;
    -webkit-tap-highlight-color:transparent; border:1px solid var(--line); border-radius:14px;
    background:linear-gradient(135deg,#eaf0ff,#f1effb);
    font-size:15.5px; font-weight:700; color:#2b3170; line-height:1.2;
  }
  .bm-bar i{
    flex:0 0 auto; width:9px; height:9px; margin-right:4px;
    border-right:2px solid var(--acc); border-bottom:2px solid var(--acc);
    transform:rotate(45deg); transition:transform .35s cubic-bezier(.25,.8,.3,1);
  }
  .bm-toggle:checked ~ .bm-bar i{transform:rotate(-135deg)}
  .bm-toggle:focus-visible ~ .bm-bar{outline:2px solid var(--acc); outline-offset:2px}
  .bm-c1,.bm-c2{
    display:grid; grid-template-rows:0fr; transition:grid-template-rows .45s cubic-bezier(.25,.8,.3,1);
  }
  .bm-inner{overflow:hidden; min-height:0; opacity:0; transition:opacity .3s ease .05s}
  .bm-toggle:checked ~ .bm-c1,
  .bm-toggle:checked ~ .bm-grid .bm-c2{grid-template-rows:1fr}
  .bm-toggle:checked ~ .bm-c1 .bm-inner,
  .bm-toggle:checked ~ .bm-grid .bm-inner{opacity:1}
  .bm-c1 .bm-hero{margin:12px 0 0}
  .bm-grid{grid-template-columns:1fr; gap:0; margin-top:12px}
  .bm-toggle:checked ~ .bm-grid{gap:12px}
  .bm-c2{grid-column:1; grid-row:1; position:static; top:auto}
  .bm-media{grid-column:1; grid-row:2}
  .bm-info{max-height:none; overflow:visible; padding:18px 16px}
  .bm-hero{padding:22px 15px 18px}
  .bm-hero h2{font-size:21px}
  .bm-hero .sub{font-size:13px}
  .bm-badges span{font-size:11.5px; padding:5px 10px}
}
@media (max-width:420px){
  .bm-hero h2{font-size:19px}
  .bm-bar{font-size:14.5px; padding:14px 15px}
}
@media (max-width:380px){
  .bm-spec .bm-r{flex-direction:column; align-items:flex-start; gap:2px}
  .bm-spec .bm-v{text-align:left}
}
</style>

<input class="bm-toggle" type="checkbox" id="bmDetails">
<label class="bm-bar" for="bmDetails">${BM_EMOJI} Product Details <i></i></label>

<div class="bm-c1">
  <div class="bm-inner">
    <div class="bm-hero bm-reveal">
      <span class="bm-eyebrow">Product Details</span>
      <h2>${escT(name)}</h2>
      ${subLine ? `<p class="sub">${escT(subLine)}</p>` : ""}
      ${badges ? `<div class="bm-badges">${badges}</div>` : ""}
    </div>
  </div>
</div>

<div class="bm-grid">

  <div class="bm-c2">
    <div class="bm-inner">
      <div class="bm-info bm-reveal">
        <p class="bm-lede">${escT(lede)}</p>

        ${hiRows ? `<h3>Highlights</h3>\n        <ul class="bm-feat">${hiRows}</ul>` : ""}

        <h3>Specifications</h3>
        <div class="bm-spec">${specRows}</div>

        ${faqHtml}

        <div class="bm-note">${noteHtml}</div>

        ${ctaHtml}
      </div>
    </div>
  </div>

  <div class="bm-media">${imgTags}</div>

</div>
</div>`;
  // recolour to the product's palette (default indigo stays if pal is null)
  const out = pal
    ? raw
        .replace(/--acc:#4f57c4/g, `--acc:${pal.acc}`)
        .replace(/--acc2:#98a0ea/g, `--acc2:${pal.acc2}`)
        .replace(/--lav:#eef0fb/g, `--lav:${pal.lav}`)
        .replace(/--sky:#eaeefc/g, `--sky:${pal.sky}`)
        .replace(/--line:rgba\(79,87,196,\.16\)/g, `--line:${pal.line}`)
        .replace(/#3a4070/g, pal.body)
        .replace(/#3b4585/g, pal.head)
        .replace(/#2b3170/g, pal.head)
        .replace(/linear-gradient\(165deg,#eef2ff 0%,#f1effb 55%,#fdfdff 100%\)/g, pal.heroGrad)
        .replace(/linear-gradient\(135deg,#eaf0ff,#f1effb\)/g, pal.barGrad)
    : raw;
  // absolute guarantee: zero CJK anywhere in the emitted description
  return out.replace(CJK_CHARS, "");
}
