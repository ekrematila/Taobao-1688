// Pure listing text formatters — shared by the AI path (server/llm.ts) and the
// NO-AI template path (server/localContent.ts). Zero I/O, zero AI.

import { DESC_STYLES, TITLE_VOCAB } from "./models.ts";
import { applyKeycapGlossary, detectKeyboardLayout, detectProfiles, LAYOUT_COMPAT, profilePhrase } from "./keycaps.ts";
import { cleanSpecs } from "./specs.ts";
import { ETSY_TAG_VOCAB, ETSY_SEARCH_ADJ } from "./exampleData.ts";
import type {
  GeneratedField,
  GeneratedListing,
  GenerateListingInput,
  NormalisedProduct,
  ProductImage,
  ProductVariant,
} from "./types.ts";

/* ---------------------- public image URLs (exports/push) ---------------------- */

const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/i;

function toPublicUrl(u?: string): string | null {
  if (!u) return null;
  let s = String(u).split("#dup-")[0].trim();
  if (s.startsWith("//")) s = "https:" + s;
  if (!/^https?:\/\//i.test(s)) return null; // app-relative /api/media — not public
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (LOCALHOST_RE.test(url.hostname) || !url.hostname.includes(".")) return null;
  if (url.protocol === "http:") url.protocol = "https:"; // image hosts serve https
  return url.toString();
}

/**
 * Best publicly-fetchable https URL for a product image — falls back through the
 * pre-edit / pre-translation source. Returns null when nothing public exists
 * (e.g. a locally-edited image on a dev host); callers should drop those so a
 * Shopify / Woo import doesn't fail with "Image URL is invalid".
 */
export function publicImageUrl(
  im: Pick<ProductImage, "url" | "originalUrl" | "translatedFrom" | "remoteUrl" | "srcUrl">,
): string | null {
  // remoteUrl (generator CDN, e.g. manuscdn) first — it's a real https link a
  // store can fetch. It expires (~48h) but Shopify copies the image on import.
  // Then the working url if it's public; then the immutable original source
  // (`srcUrl`) so an edited image that only lives at /api/media still exports
  // *something* (the pre-edit original) until the operator hosts the edits.
  return (
    toPublicUrl(im.remoteUrl) ??
    toPublicUrl(im.url) ??
    toPublicUrl(im.srcUrl) ??
    toPublicUrl(im.originalUrl) ??
    toPublicUrl(im.translatedFrom) ??
    null
  );
}

/**
 * Order listing images for a good storefront flow: keep the given order, but push
 * close-up "detail / macro / texture" shots to the very end, and place the
 * "all keys / full set / layout" overview shot just before them. Best-effort,
 * driven by the alt text / url.
 */
export function sortListingImages<T extends { url: string; alt?: string }>(imgs: T[]): T[] {
  const tag = (im: T) => `${im.alt || ""} ${im.url || ""}`.toLowerCase();
  const isDetail = (im: T) => /\b(detail|details|close ?up|closeup|macro|texture|zoom|legend close)\b/.test(tag(im));
  const isAllKeys = (im: T) =>
    /\b(all keys|every key|full set|full kit|complete set|whole set|kit contents|what'?s included|layout overview|all keycaps|entire set)\b/.test(
      tag(im),
    );
  const details: T[] = [];
  const allKeys: T[] = [];
  const rest: T[] = [];
  for (const im of imgs) {
    if (isDetail(im)) details.push(im);
    else if (isAllKeys(im)) allKeys.push(im);
    else rest.push(im);
  }
  return [...rest, ...allKeys, ...details];
}

/**
 * Images to lay into a Shopify HTML description body — ONLY the "Açıklama
 * görselleri" (description-role) strips the operator put there. Gallery ("Ana
 * galeri") and variant photos are NEVER embedded in the description; if the
 * operator wants a photo in the description they move it to that zone. An
 * image-less description is fine — the gallery still carries the product shots.
 */
/**
 * A "same photo, different render" key: strips the query string (CDN resize
 * params) and a trailing `_WxH` / `_WxHqNN` size suffix right before the
 * extension, so e.g. `...i3/abc_800x800.jpg` and `...i3/abc_400x400q90.jpg?x-oss-
 * process=...` collapse to the same key. Cheap, URL-only — catches the common
 * "same shot re-exported at another size" duplicate without needing vision.
 */
function sameShotKey(url: string): string {
  const noQuery = (url || "").split("#dup-")[0].split("?")[0];
  return noQuery.replace(/_\d{2,4}x\d{2,4}(q\d{1,3})?(?=\.\w+$)/i, "");
}

export function descBodyImages(images: ProductImage[], max = 20): ProductImage[] {
  const roleOf = (im: ProductImage) => (im.role === "unused" || !im.role ? "description" : im.role);
  const ordered = images.filter((im) => roleOf(im) === "description");
  const seen = new Set<string>();
  const out: ProductImage[] = [];
  for (const im of ordered) {
    const key = sameShotKey(im.url || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(im);
    if (out.length >= max) break;
  }
  return sortListingImages(out); // details last, "all keys" shot just before them
}

/**
 * The variant list to actually export: the operator-edited `product.variants`
 * wins over the generation-time `listing.variants` snapshot. Names are stripped
 * of CJK (the product output must never contain Chinese), and every variant gets
 * a usable display name.
 */
export function outputVariants(
  product: Pick<NormalisedProduct, "variants">,
  listing?: Pick<GeneratedListing, "variants"> | null,
): ProductVariant[] {
  const src = product.variants?.length ? product.variants : listing?.variants ?? [];
  return src.map((v, i) => {
    const clean = (s?: string) => stripCJK(applyKeycapGlossary(String(s ?? ""))).replace(/\s{2,}/g, " ").trim();
    const nameTranslated = clean(v.nameTranslated) || clean(v.name);
    return {
      ...v,
      name: clean(v.name) || nameTranslated || `Variant ${i + 1}`,
      nameTranslated: nameTranslated || `Variant ${i + 1}`,
      price: v.price ?? null,
      compareAtPrice: v.compareAtPrice ?? null,
    };
  });
}

/* ------------------------------ small utils ------------------------------ */

/** Lower-case, allowed chars only, ≤ 20 chars — but NEVER chop a word in half. */
export const cleanTag = (s: string) => {
  let t = String(s || "").toLowerCase().replace(/[^a-z0-9 &+\-]/g, "").replace(/\s+/g, " ").trim();
  if (t.length <= 20) return t;
  // trim to the last whole word that fits in 20 chars
  const words = t.split(" ");
  while (words.length > 1 && words.join(" ").length > 20) words.pop();
  t = words.join(" ").trim();
  return t.length <= 20 ? t : t.slice(0, 20).replace(/\s+\S*$/, "").trim();
};

/**
 * Etsy tag must be 2–3 whole words, ≤ 20 chars, end on a complete word, and
 * NEVER contain the shop/brand name (e.g. "keyartisan").
 */
export const isEtsyTag = (t: string) => {
  const s = t.trim();
  if (/\bkeyartisan\b|\bkey artisan\b/i.test(s)) return false;
  if (/[a-z]\s*$/i.test(s) && s.replace(/[^a-z]/gi, "").length < 4) return false; // stray letter
  const w = s.split(/\s+/).filter(Boolean);
  return w.length >= 2 && w.length <= 3 && w.every((x) => x.length >= 2 || /^(&|\+)$/.test(x));
};

const KEEP_UPPER = /^(PBT|ABS|MX|SA|MOA|OEM|XDA|DSA|ISO|ANSI|RGB|LED|USB|3D|2K|4K|TKL|PU|PVC|EVA|TPU)$/;
export function titleCase(s: string): string {
  return s
    .split(/(\s+)/)
    .map((w) => {
      if (/^\s+$/.test(w) || !w) return w;
      if (KEEP_UPPER.test(w)) return w;
      const lw = w.toLowerCase();
      if (/^(and|or|the|a|an|of|for|with|in|on|to)$/.test(lw)) return lw;
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join("")
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

/** Mathematical-bold unicode (𝐀-𝐳, 𝟎-𝟗) for Etsy plain-text section headers. */
export function fancyBold(str: string): string {
  let out = "";
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    if (c >= 65 && c <= 90) out += String.fromCodePoint(0x1d400 + (c - 65));
    else if (c >= 97 && c <= 122) out += String.fromCodePoint(0x1d41a + (c - 97));
    else if (c >= 48 && c <= 57) out += String.fromCodePoint(0x1d7ce + (c - 48));
    else out += ch;
  }
  return out;
}

/** True if the string already contains Mathematical-bold letters. */
const isFancy = (s: string) => /[\u{1D400}-\u{1D7FF}]/u.test(s);

/**
 * Etsy is plain text, so section headers get styled with fancy unicode. Walk the
 * lines and bold anything that reads like a heading: short, no trailing
 * punctuation, 1–6 words, not a bullet/list line, not already fancy. Idempotent.
 */
export function fancyEtsyHeaders(text: string): string {
  const lines = String(text ?? "").split("\n");
  const out = lines.map((raw, i) => {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t || isFancy(t)) return raw;
    if (/^[•\-*#>\d]/.test(t)) return raw; // bullet / list / markdown
    if (t.length > 46) return raw;
    if (/[.:;!?,]$/.test(t)) return raw; // ends like a sentence
    if (/\S:\s+\S/.test(t)) return raw; // "key: value" spec line, not a header
    const words = t.split(/\s+/);
    if (words.length < 1 || words.length > 6) return raw;
    // header-ish: Title Case, ALL CAPS, or has an "&"/"|" separator
    const titleish = words.every((w) => /^[("'“]?[A-Z0-9]/.test(w) || /^(&|\||and|of|the|for|to|with|in|on|a|an)$/i.test(w));
    const next = (lines[i + 1] ?? "").trim();
    const prev = (lines[i - 1] ?? "").trim();
    const surroundedByBlank = prev === "" || next === "" || /^[•\-*]/.test(next);
    if (!titleish || !surroundedByBlank) return raw;
    const lead = line.slice(0, line.length - line.trimStart().length);
    return lead + fancyBold(t);
  });
  return out.join("\n");
}

/* ------------------------------ Etsy title ------------------------------ */

export function ensureBrandSuffix(title: string, brand?: string): string {
  if (!brand?.trim()) return title;
  const b = brand.trim().replace(/®+\s*$/, "");
  const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = title
    .replace(new RegExp(`\\s*[–-]\\s*${esc}\\s*®?\\s*$`, "i"), "")
    .replace(/[\s,|–-]+$/, "")
    .trim();
  return `${stripped} – ${b}®`;
}

/** Opinion / taste words that Etsy suggests moving OUT of the title. */
export const SUBJECTIVE_WORDS = new Set([
  "cute", "adorable", "lovely", "pretty", "beautiful", "gorgeous", "stunning", "cool",
  "awesome", "amazing", "charming", "delightful", "wonderful", "dreamy", "magical",
  "whimsical", "kawaii", "aesthetic", "chic", "trendy", "stylish", "elegant", "fancy",
  "unique", "perfect", "best", "premium", "luxury", "luxurious", "exquisite", "fabulous",
  "cozy", "comfy", "funky", "quirky", "playful", "sweet", "vibrant", "eye-catching",
]);

/**
 * Etsy ALTERNATE title: subjective/opinion words removed (Etsy suggests those
 * belong in the description) and the whole title kept to `maxWords` words —
 * the " – Brand®" suffix is preserved.
 */
export function etsyAltTitle(title: string, brand?: string, maxWords = 14): string {
  const b = (brand || "").trim().replace(/®+\s*$/, "");
  let core = String(title || "").trim();
  let suffix = "";
  if (b) {
    const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = core.match(new RegExp(`\\s*[–-]\\s*${esc}\\s*®?\\s*$`, "i"));
    if (m) {
      suffix = ` – ${b}®`;
      core = core.slice(0, m.index).trim();
    }
  }
  const isWord = (t: string) => /[a-z0-9]/i.test(t);
  // drop subjective words, then tidy separators back to " | " / ", "
  core = core
    .split(/(\s+|[|,])/)
    .filter((tok) => {
      const w = tok.trim().toLowerCase().replace(/[^a-z-]/g, "");
      return !w || !SUBJECTIVE_WORDS.has(w);
    })
    .join("")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/([|,])\s*(?=[|,])/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,|]+|[\s,|]+$/g, "")
    .trim();

  // cap REAL words (separators like | & , – don't count) at maxWords incl. suffix
  const suffixWordCount = suffix.split(/\s+/).filter(isWord).length;
  const budget = Math.max(3, maxWords - suffixWordCount);
  const kept: string[] = [];
  let n = 0;
  for (const tok of core.split(/\s+/)) {
    if (isWord(tok)) {
      if (n >= budget) break;
      n++;
    }
    kept.push(tok);
  }
  core = kept.join(" ").replace(/[\s,|&–-]+$/, "").trim();
  return (core + suffix).replace(/\s{2,}/g, " ").trim();
}

/**
 * Etsy title rules enforced here:
 *  - " | " and ", " spacing normalised.
 *  - the segment BEFORE " | " is ≤ 40 chars (the single space right before "|"
 *    is not counted). Trimmed on a word boundary, aiming for 36–40.
 *  - whole title ≤ 140 chars, cut on a word/comma boundary, brand suffix kept.
 */
export function clampEtsyTitle(title: string, brand?: string): string {
  const b = brand?.trim().replace(/®+\s*$/, "");
  const suffix = b ? ` – ${b}®` : "";
  let v = String(title || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
  if (suffix && v.endsWith(suffix)) v = v.slice(0, -suffix.length).replace(/[\s,|–-]+$/, "");

  // --- pre-"|" segment ≤ 40 chars ---
  const bar = v.indexOf(" | ");
  if (bar !== -1) {
    let pre = v.slice(0, bar); // chars before " | " (space before "|" excluded)
    let rest = v.slice(bar + 3);
    if (pre.length > 40) {
      const words = pre.split(" ");
      while (words.length > 1 && words.join(" ").length > 40) words.pop();
      pre = words.join(" ").replace(/[\s,|–-]+$/, "");
      if (pre.length > 40) pre = pre.slice(0, 40).replace(/\s+\S*$/, ""); // safety
    }
    v = `${pre} | ${rest}`;
  }

  // --- whole title ≤ 140 ---
  const budget = 140 - suffix.length;
  if (v.length > budget) {
    const cut = v.slice(0, budget);
    const bnd = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf(" "));
    v = (bnd > 55 ? cut.slice(0, bnd) : cut).replace(/[\s,|–-]+$/, "");
  }
  return v + suffix;
}

/** Chars in the pre-"|" segment, NOT counting the space just before "|". */
export function etsyPreBarLen(title: string): number {
  const v = String(title || "").replace(/\s*\|\s*/g, " | ");
  const bar = v.indexOf(" | ");
  return (bar === -1 ? v : v.slice(0, bar)).length;
}

export function clampShopifyTitle(title: string, min = 35, max = 50): string {
  let t = title.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > min ? cut.slice(0, lastSpace) : cut).trim();
}

const PROFILE_TOKENS = "cherry|oem|sa|xda|dsa|moa|mda|mao|kat|asa|kam|dss|kca|kdsa|xvx|ldsa|foa|soa|xoa|mog|dma";
/**
 * Keycap profile / key-height terms must NOT appear in the Shopify title — the
 * operator wants the product's THEME to carry the title instead. Strips
 * "Cherry Profile", "OEM height", a bare profile word, and tidies leftovers.
 * (Profile info stays in the description and tags.)
 */
export function stripKeycapProfileFromTitle(title: string): string {
  return String(title || "")
    .replace(new RegExp(`\\b(${PROFILE_TOKENS})\\s*(profile|height)\\b`, "gi"), " ")
    .replace(/\b(original|factory|stock)\s+(profile|height)\b/gi, " ")
    .replace(/\bcherry\b/gi, " ") // the bare profile word, not a theme
    .replace(/\bprofile\b/gi, " ")
    .replace(/\s*([|,])\s*(?=[|,]|$)/g, "") // "A |  | B" -> "A | B", drop trailing sep
    .replace(/^\s*[|,]\s*|\s*[|,]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Etsy paired-keyword tags from the title: {adj1,adj2} × {noun1,noun2}, ≤20 chars. */
export function etsyPairedTags(title: string): string[] {
  const pre = title.split(" | ")[0].trim();
  const after = (title.split(" | ")[1] || "").split(",")[0].trim();
  if (!pre || !after) return [];
  const w = (s: string) => s.split(/\s+/).filter(Boolean);
  const pw = w(pre);
  const aw = w(after);
  const noun1 = pw.slice(-2).join(" ");
  const noun2 = aw.slice(-1).join(" ");
  const adj1 = pw.slice(0, -2).join(" ");
  const adj2 = aw.slice(0, -1).join(" ");
  const out = new Set<string>();
  for (const adj of [adj1, adj2]) {
    for (const noun of [noun1, noun2]) {
      const tag = `${adj} ${noun}`.toLowerCase().replace(/\s+/g, " ").trim();
      if (tag && tag.length <= 20 && tag.includes(" ")) out.add(tag);
    }
  }
  return [...out];
}

const NOUN_STOP = new Set(["set", "kit", "pack", "bundle", "the", "a", "an", "for", "with", "and", "of"]);

const ETSY_VOCAB_SET = new Set(ETSY_TAG_VOCAB);
/** Tags a keycap/keyboard listing can carry regardless of theme — every one still
 *  carries a real qualifier (artisan / pbt / …); NO bare "keycap set" / "keycaps". */
const UNIVERSAL_ETSY_TAGS = [
  "mechanical keyboard", "pbt keycaps", "artisan keycaps", "artisan keycap set",
  "gaming keycaps", "aesthetic keycaps",
];

/** Words that read like a specific product/color, NOT a search term Etsy buyers use. */
const NON_SEARCH_ADJ = new Set([
  "cream", "mocha", "latte", "shadow", "carved", "crystal", "jelly", "layered",
  "double", "translucent", "semi", "glossy", "matte", "brushed", "engraved",
]);

/**
 * Turn a raw candidate list into the final Etsy tags: keep only real 2–3 word
 * search phrases (no shop name, no "dye-sub keycaps", no color/product-name
 * adjectives), rank vocab / universal tags first, then split into the live 13
 * and the pool — BOTH sorted alphabetically.
 */
export function finalizeEtsyTags(
  candidates: string[],
  ctx: { title?: string; productWords?: string[]; noun?: string } = {},
): { chosen: string[]; pool: string[] } {
  const productWords = new Set((ctx.productWords || []).map((w) => w.toLowerCase()));
  const bad = /(dye[\s-]?sub|dye[\s-]?sublimation|shadow[\s-]?carved|keyartisan|key artisan)/i;
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of candidates) {
    const t = cleanTag(raw);
    if (!t || seen.has(t) || !isEtsyTag(t) || bad.test(t)) continue;
    // NEVER a bare category tag ("keycap set", "keycaps", "keyboard keycaps"…) —
    // it makes the operator's "cute keycap set" style tags redundant.
    if (isNounOnlyTag(t, ctx.noun)) continue;
    const words = t.split(" ");
    const lead = words[0];
    // hyphen INSIDE a word ("shadow-carved") = not a real search term (unless vocab)
    if (/\w-\w/.test(t) && !ETSY_VOCAB_SET.has(t)) continue;
    // reject color/product-name leads unless the vocab explicitly has this phrase
    if (NON_SEARCH_ADJ.has(lead) && !ETSY_VOCAB_SET.has(t)) continue;
    // reject compound "<adj1> <adj2> <noun>" (e.g. "cute cat keycaps") — split style is preferred
    if (words.length === 3 && ETSY_SEARCH_ADJ.has(words[0]) && ETSY_SEARCH_ADJ.has(words[1]) && !ETSY_VOCAB_SET.has(t)) {
      continue;
    }
    seen.add(t);
    clean.push(t);
  }
  const score = (t: string) => {
    let s = 0;
    if (ETSY_VOCAB_SET.has(t)) s += 6;
    if (UNIVERSAL_ETSY_TAGS.includes(t)) s += 4;
    if (ETSY_SEARCH_ADJ.has(t.split(" ")[0])) s += 3;
    for (const w of t.split(" ")) if (productWords.has(w)) s += 1;
    if (t.endsWith(" keycaps") || t.endsWith(" keycap set")) s += 1;
    return s;
  };
  const ranked = [...clean].sort((a, b) => score(b) - score(a));
  const alpha = (a: string, b: string) => a.localeCompare(b);
  const chosen = ranked.slice(0, 13).sort(alpha);
  const chosenSet = new Set(chosen);
  const rest = ranked.filter((t) => !chosenSet.has(t)).sort(alpha);
  // pool = chosen (alpha) first, then the rest (alpha); up to 50 shown
  return { chosen, pool: [...chosen, ...rest].slice(0, 50) };
}

/** "keycap set" → { long:"keycap set", short:"keycaps" }; "deskmat" → { long, short:"deskmats" }. */
export function nounForms(noun: string): { long: string; short: string } {
  const n = String(noun || "").toLowerCase().replace(/\s+/g, " ").trim();
  const m = n.match(/^(.*?)\s+(set|kit|pack|bundle)$/);
  if (m) {
    const head = m[1].trim();
    return { long: n, short: /s$/.test(head) ? head : `${head}s` };
  }
  return { long: n, short: /s$/.test(n) ? n : `${n}s` };
}

/**
 * The operator's preferred Etsy tag style: ONE theme word + the product noun,
 * in both the long ("cute keycap set") and short ("cute keycaps") form — never
 * two theme words stuffed together ("cute cat keycaps"). These rank first.
 */
export function etsySplitTags(title: string, noun?: string): string[] {
  const pre = String(title || "").split(" | ")[0].trim();
  const n = (noun && noun.trim()) || pre.split(/\s+/).slice(-2).join(" ") || "set";
  const { long, short } = nounForms(n);
  const nounWords = new Set([...long.split(/\s+/), ...short.split(/\s+/)]);
  const themeWords = [
    ...new Set(
      pre
        .toLowerCase()
        .replace(/[^a-z0-9 &+\-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !STOP.has(w) && !NOUN_STOP.has(w) && !nounWords.has(w)),
    ),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    const c = cleanTag(t);
    if (c && c.split(" ").length <= 3 && c.length <= 20 && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  };
  for (const w of themeWords) {
    add(`${w} ${long}`);
    add(`${w} ${short}`);
  }
  // NOTE: the bare noun ("keycap set" / "keycaps") is deliberately NOT added — a
  // standalone category tag is wasted when "cute keycap set" etc. already cover it.
  return out;
}

/** Bare category phrases that must never stand alone as an Etsy tag. */
const NOUN_ONLY_TAGS = new Set([
  "keycap", "keycaps", "keycap set", "keycap sets", "keycaps set", "keyset", "key set",
  "key cap", "key caps", "key cap set", "keyboard keycaps", "keycaps keyboard",
  "keyboard set", "keyboard keycap", "keycap keyboard", "keyboard keys", "keys set",
]);

/** True when a tag is just the product noun with no theme / style / use qualifier. */
export function isNounOnlyTag(t: string, noun?: string): boolean {
  const c = String(t || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!c) return false;
  if (NOUN_ONLY_TAGS.has(c)) return true;
  const n = (noun || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (n) {
    const { long, short } = nounForms(n);
    if (c === n || c === long || c === short) return true;
    // "custom keycap set" / "keyboard keycap set" style — filler words + THIS noun only
    const FILLER = new Set(["custom", "keyboard", "mechanical", "the", "a", "set", "kit", "new"]);
    const words = c.split(" ");
    const nounWords = new Set([...long.split(" "), ...short.split(" "), ...n.split(" ")]);
    if (words.every((w) => FILLER.has(w) || nounWords.has(w)) && words.some((w) => nounWords.has(w))) return true;
  }
  return false;
}

/* --------------------------- NO-AI local listing --------------------------- */

const STOP = new Set([
  "the", "and", "for", "with", "set", "of", "a", "an", "to", "in", "on", "cm", "mm",
  "pcs", "pc", "pack", "new", "hot", "sale", "free", "shipping",
]);

const CJK_RE = /[⺀-⻿　-〿぀-ヿ㄀-ㄯㆠ-㇯㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]|[𠀀-𯨟]/gu;
/** Remove every CJK character, collapse the gaps, trim. Single-line use. */
export const stripCJK = (s: string) =>
  String(s ?? "").replace(CJK_RE, " ").replace(/\s{2,}/g, " ").replace(/^[\s,;:·\-–]+|[\s,;:·\-–]+$/g, "").trim();

/** Same, but keeps line breaks — for multi-line output (descriptions, advice…). */
export const dropCJK = (s: string) =>
  String(s ?? "")
    .replace(CJK_RE, "")
    // a Chinese header like "套餐说明/PACKAGE DESCRIPTION" leaves a leading
    // "/ ｜ · :" right after a tag once the CJK is gone — trim that orphan only
    // when an ASCII word follows immediately (so real "MX / Cherry" text is safe)
    .replace(/(>)\s*[\/｜|·・:：]+\s*(?=[A-Za-z])/g, "$1")
    .replace(/(^|\n)\s*[\/｜|·・:：]+\s*(?=[A-Za-z])/g, "$1")
    .replace(/[（(]\s*[)）]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** True if the string still contains any CJK character. */
export const hasCJK = (s: string) => {
  CJK_RE.lastIndex = 0;
  return CJK_RE.test(String(s ?? ""));
};

const TR_ASCII: Record<string, string> = {
  "İ": "I", "ı": "i", "Ş": "S", "ş": "s", "Ğ": "G", "ğ": "g",
  "Ç": "C", "ç": "c", "Ö": "O", "ö": "o", "Ü": "U", "ü": "u",
};
/** Fold Turkish-specific letters to ASCII (İ→I, ı→i, ş→s …) — for NON-Turkish
 *  output where a stray Turkish word from the (Turkish) prompt would look broken. */
export const deTurkish = (s: string) =>
  String(s ?? "").replace(/[İıŞşĞğÇçÖöÜü]/g, (c) => TR_ASCII[c] || c);

/**
 * When the operator has filled the "product details" note, THAT is the source of
 * truth for spec detection (profile / material / theme / key count / layout).
 * The source listing may still describe variants/options the operator REMOVED in
 * the final step, so we hand the detectors a product whose `descHtml` is the note
 * and whose source `props` are dropped. `variants` is kept — it already reflects
 * the operator's removals.
 */
export interface SpecView {
  product: NormalisedProduct;
  /** true when the note is driving spec detection */
  noteMode: boolean;
  /** the note split into clean, human phrases (for the spec list / highlights) */
  noteBullets: string[];
  /** true when there are 0-1 variants → single configuration, no "comes in X/Y/Z" language */
  singleConfig: boolean;
}
export function productForSpecs(p: NormalisedProduct, note?: string): SpecView {
  const n = deTurkish(String(note || "").trim());
  const singleConfig = (p.variants?.length ?? 0) <= 1;
  if (!n) return { product: p, noteMode: false, noteBullets: [], singleConfig };
  const noteBullets = n
    .split(/[,;\n•·]+|\s{2,}/)
    .map((s) => s.trim().replace(/^[-–*]\s*/, ""))
    .filter((s) => s.length >= 2)
    .slice(0, 14);
  return {
    product: { ...p, descHtml: n, props: {} },
    noteMode: true,
    noteBullets,
    singleConfig,
  };
}

/** Keycap glossary FIRST (catches 原厂高度 → "Cherry Profile"), then strip the rest of the CJK. */
const cleanVal = (s: unknown) => stripCJK(applyKeycapGlossary(String(s ?? "")));
/** Same, but WITHOUT the OEM→Cherry glossary fold — for operator-typed note bullets. */
const cleanValLiteral = (s: unknown) => stripCJK(String(s ?? "")).replace(/\s{2,}/g, " ").trim();

const PROP_KEY_MAP: Record<string, string> = {
  材质: "Material", 工艺: "Technique", 高度: "Profile", 主题: "Theme", 兼容: "Compatibility",
  颜色: "Color", 尺寸: "Size", 风格: "Style", 图案: "Pattern", 品牌: "Brand", 重量: "Weight",
  适用: "For", 类型: "Type", 规格: "Spec", 产地: "Origin", 包装: "Packaging",
};
function propKeyLabel(k: string): string | null {
  if (PROP_KEY_MAP[k]) return PROP_KEY_MAP[k];
  const clean = stripCJK(k);
  return clean && /[a-z]/i.test(clean) ? titleCase(clean) : null;
}

function textPool(p: NormalisedProduct): string {
  return [
    p.titleTranslated || "",
    p.title || "",
    Object.entries(p.props).map(([k, v]) => `${k} ${v}`).join(" "),
    p.descHtml.replace(/<[^>]+>/g, " "),
    p.variants.map((v) => v.nameTranslated || v.name).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

/** Adjectives from TITLE_VOCAB that actually occur in the product text. */
function themeAdjectives(p: NormalisedProduct, limit = 3): string[] {
  const pool = textPool(p);
  const hits = TITLE_VOCAB.filter((w) => pool.includes(w.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    const k = h.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(h);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** Best guess at the product noun ("keycap set", "tote bag", …). */
function productNoun(p: NormalisedProduct, productType?: string): string {
  if (productType?.trim()) return productType.trim().toLowerCase();
  const t = (p.titleTranslated || p.title || "").toLowerCase();
  const m = t.match(/[a-z][a-z\- ]*\b(set|kit|bag|case|cover|mat|stand|holder|lamp|light|bottle|mug|cup|keycap|keycaps|sticker|stickers|print|poster|pin|charm|necklace|ring|earrings|hoodie|shirt|tee|socks|blanket|pillow|figure|toy|deck|cable)\b/);
  if (m) return m[0].replace(/\s+/g, " ").trim().split(" ").slice(-2).join(" ");
  return "set";
}

/** Short "adjective noun" phrases from the product props (material, colour, …). */
function propPhrases(p: NormalisedProduct, noun: string, max = 6): string[] {
  const wanted = /malzeme|material|profil|profile|renk|colou?r|tema|theme|boyut|size|uyum|compat|style|stil|pattern|desen|finish|kaplama/i;
  const out: string[] = [];
  for (const [k, v] of Object.entries(p.props)) {
    if (!wanted.test(k) && !PROP_KEY_MAP[k]) continue;
    const val = cleanVal(v);
    if (!val || val.length > 28) continue;
    out.push(val);
    if (out.length >= max) break;
  }
  // de-dupe, drop values already implied by the noun
  return [...new Set(out)].filter((x) => !noun.includes(x.toLowerCase()));
}

function keywordTags(p: NormalisedProduct, noun: string): string[] {
  const pool = textPool(p)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  const freq = new Map<string, number>();
  for (const w of pool) freq.set(w, (freq.get(w) || 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const nounShort = noun.split(" ").slice(-1)[0];
  const out = new Set<string>();
  for (const w of ranked) {
    const tag = cleanTag(`${w} ${nounShort}`);
    if (tag.includes(" ") && tag.length <= 20) out.add(tag);
    if (out.size >= 20) break;
  }
  return [...out];
}

/**
 * A tag that is just a chopped spec/part fragment rather than a real buyer
 * search phrase — e.g. "138 key keycap set", "104 keys", "126 pcs keycap".
 * A leading raw count + a keys/pieces unit is the tell. Legit patterns like
 * "60 percent keyboard" or "65% keyboard" are kept.
 */
export function isFragmentTag(tag: string): boolean {
  const t = String(tag || "").toLowerCase().trim();
  if (!t) return true;
  if (/^\d{1,4}\s*%|\bpercent\b/.test(t)) return false;
  if (/^\d{1,4}\s*-?\s*(keys?|keycaps?|pcs?|pieces?|buttons?|count|key ?sets?)\b/.test(t)) return true;
  if (/^\d{1,4}\s+\w+\s+(keycap ?set|keycaps|button ?set|key ?set)$/.test(t)) return true;
  return false;
}

/**
 * A large de-duped pool of genuine buyer-search tags for a product: paired
 * title keywords, theme×noun, prop phrases, frequency keywords, theme×prop
 * combos. Fragment tags (see isFragmentTag) are excluded. Shared by the local
 * template and the AI post-processor (Shopify wants ≥40, Etsy 13 + a 20 pool).
 */
export function buildTagCandidates(p: NormalisedProduct, title: string, productType?: string): string[] {
  const noun = productNoun(p, productType);
  const nounShort = noun.split(" ").slice(-1)[0];
  const out: string[] = [];
  const push = (s: string) => {
    const c = cleanTag(s);
    if (c && c.length >= 3 && c.length <= 20 && !isFragmentTag(c)) out.push(c);
  };
  // preferred split style first: one theme word + noun (long & short)
  etsySplitTags(title, productType || noun).forEach(push);
  etsyPairedTags(title).forEach(push);
  const { long: nounLong, short: nounShortForm } = nounForms(noun);
  for (const a of themeAdjectives(p, 8)) {
    push(`${a} ${nounLong}`);
    push(`${a} ${nounShortForm}`);
    push(`${a} ${noun}`);
    push(`${a} ${nounShort}`);
  }
  propPhrases(p, noun, 12).forEach((ph) => {
    push(ph);
    push(`${ph} ${nounShort}`);
  });
  keywordTags(p, noun).forEach(push);
  const adjs = themeAdjectives(p, 4);
  const phs = propPhrases(p, noun, 5);
  for (const a of adjs) for (const ph of phs) push(`${a} ${ph}`);
  // real Etsy search vocabulary that overlaps this product's words / theme
  const words = new Set(textPool(p).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  for (const v of ETSY_TAG_VOCAB) {
    if (UNIVERSAL_ETSY_TAGS.includes(v) || v.split(" ").some((w) => words.has(w))) push(v);
  }
  return [...new Set(out)];
}

/**
 * Build a complete listing WITHOUT any AI: title / description / tags derived
 * from the normalised product + the same knobs the AI path takes. Deterministic.
 */
export function buildLocalListing(
  product: NormalisedProduct,
  input: GenerateListingInput,
): { fields: GeneratedField[]; layout?: string; meta: Record<string, unknown> } {
  const isShopify = input.channel === "shopify";
  const style = DESC_STYLES.find((s) => s.key === input.descStyle) ?? DESC_STYLES[0];
  const emojiOk = !["simple", "minimal", "professional", "clean", "premium", "elegant"].includes(style.key);

  // The operator's "product details" note (if any) is authoritative — read specs
  // from it, not from the source listing that still describes removed variants.
  const { product: P, noteMode, noteBullets, singleConfig } = productForSpecs(product, input.productNote);

  const noun = productNoun(P, input.productType);
  const adjs = themeAdjectives(P, 3);
  const phrases = noteMode ? noteBullets.slice(0, 6) : propPhrases(P, noun, 6);
  const kb = detectKeyboardLayout(P);
  const kbTag = kb.isKeycapSet && (kb.layout === "ISO" || kb.layout === "ANSI") ? kb.layout : "";
  const kbCompat = kb.isKeycapSet && kb.bothLayouts; // ships both ANSI & ISO enter keys
  // one config (0-1 variants) or an explicit note → at most ONE profile, verbatim
  const profs = kb.isKeycapSet
    ? detectProfiles(P, { trustLiteral: noteMode }).slice(0, noteMode || singleConfig ? 1 : 3)
    : [];
  const profPhrase = profilePhrase(profs); // "" | "OEM Profile" | "Cherry & MOA Profile"
  const lead = adjs.slice(0, 2).join(" ") || "Themed";
  const usedInLead = new Set(lead.toLowerCase().split(/\s+/));
  const FALLBACK_ADJ = ["Aesthetic", "Themed", "Novelty", "Statement"];
  const seg2adj =
    adjs.find((a) => !usedInLead.has(a.toLowerCase())) ||
    FALLBACK_ADJ.find((a) => !usedInLead.has(a.toLowerCase())) ||
    "Aesthetic";

  /* ---- title ---- */
  let title: string;
  if (isShopify) {
    // keycap set → keep the profile OUT of the Shopify title; let the theme lead
    const shopPhrases = kb.isKeycapSet
      ? phrases.filter((p) => p && stripKeycapProfileFromTitle(p).trim() === p.trim())
      : phrases;
    let base = titleCase(`${lead} ${noun} ${shopPhrases[0] ?? ""}`.replace(/\s+/g, " ").trim());
    if (base.length < 34 && shopPhrases[1]) base = titleCase(`${base} ${shopPhrases[1]}`);
    if (kbCompat && base.length + LAYOUT_COMPAT.title.length + 1 <= 50) base = `${base} ${LAYOUT_COMPAT.title}`;
    else if (kbTag && base.length + 4 <= 50) base = `${base} ${kbTag}`;
    title = clampShopifyTitle(base).replace(/\bgifts?\b/gi, "").trim();
    if (kb.isKeycapSet) title = clampShopifyTitle(stripKeycapProfileFromTitle(title)).trim();
  } else {
    const nounAlt = /s$/.test(noun) ? noun.replace(/s$/, "") : `${noun}s`;
    const seg1 = titleCase(`${lead} ${noun}`);
    const seg2 = titleCase(`${seg2adj} ${nounAlt}`);
    // specs after " | " separated by commas: profile(s), material, ...
    const restParts: string[] = [];
    if (profPhrase) restParts.push(profPhrase); // "Cherry & MOA Profile"
    restParts.push(...phrases.filter((p) => !/profile|cherry|oem|\bsa\b|xda|dsa|mda|moa|mao/i.test(p)).slice(0, 3));
    if (kbCompat) restParts.push(LAYOUT_COMPAT.title);
    else if (kbTag) restParts.push(`${kbTag} Layout`);
    const rest = restParts.filter(Boolean).join(", ");
    title = `${seg1} | ${seg2}${rest ? ", " + rest : ""}`.replace(/\bgifts?\b/gi, "").replace(/\s{2,}/g, " ").trim();
    title = ensureBrandSuffix(title, input.brand);
    title = clampEtsyTitle(title, input.brand);
  }

  /* ---- tags ---- */
  // preferred style FIRST: one theme word + noun, long & short form (never compound)
  const split = etsySplitTags(title, input.productType || noun);
  const paired = etsyPairedTags(title).map(cleanTag).filter(Boolean);
  const nounShort = noun.split(" ").slice(-1)[0];
  const kbTags = kbCompat
    ? [cleanTag(LAYOUT_COMPAT.tag), cleanTag("ansi iso keycaps"), cleanTag(`iso ${nounShort}`), cleanTag(`ansi ${nounShort}`)].filter(Boolean)
    : kbTag
      ? [cleanTag(`${kbTag} ${nounShort}`), cleanTag(`${kbTag} layout`)].filter((x) => x.includes(" ") && x.length <= 20)
      : [];
  const candidates = buildTagCandidates(product, title, input.productType).filter((t) => !isFragmentTag(t));
  const uniq = (a: string[]) => {
    const s = new Set<string>();
    return a.filter((x) => x && !isFragmentTag(x) && !s.has(x) && (s.add(x), true));
  };
  // Shopify: no hard cap — aim for ≥40 product-relevant tags.
  // Etsy: 13 live + up to 50 pool, search-vocab ranked, chosen & pool alpha-sorted.
  const all = uniq([...split, ...paired, ...kbTags, ...candidates]);
  let chosen: string[];
  let pool: string[];
  if (isShopify) {
    chosen = all.slice(0, 48);
    pool = [];
  } else {
    const pw = textPool(product).split(/[^a-z0-9]+/i).filter(Boolean);
    const fin = finalizeEtsyTags(all, { title, productWords: pw, noun: input.productType || noun });
    chosen = fin.chosen;
    pool = fin.pool;
  }

  /* ---- description ---- */
  const feat = fancyBold("Highlight Features");
  const matl = fancyBold("Material & Build");
  const spec = fancyBold("Specifications");
  const note = fancyBold("Note");
  const preBar = title.split(" | ")[0].trim();
  const kbSpec = kbCompat
    ? `Layout: ${LAYOUT_COMPAT.title} — includes both Enter keys`
    : kb.isKeycapSet && kb.layout === "mixed"
      ? `Layout: ISO or ANSI — choose your version per variant (${kb.perVariant.map((p) => `${p.name}: ${p.layout}`).join(", ")})`
      : kbTag
        ? `Layout: ${kbTag}${kbTag === "ISO" ? " (L-shaped big Enter key)" : " (straight Enter key)"}`
        : "";
  const specLines = [
    kbSpec,
    // in note-mode the operator's details ARE the specs; otherwise clean the source props
    ...(noteMode
      ? noteBullets
      : cleanSpecs(product.props, 9).map((s) => `${s.label}: ${s.value.slice(0, 60)}`)),
  ]
    .filter(Boolean)
    .slice(0, 9);
  const bullets = (phrases.length ? phrases : specLines.map((l) => l.split(": ")[1] || l))
    .map(noteMode ? cleanValLiteral : cleanVal)
    .filter(Boolean)
    .slice(0, 6);

  const featBullets = bullets.length ? bullets : ["Premium build", "Theme-accurate design", "Everyday-ready finish"];
  const kbNote = kbCompat
    ? LAYOUT_COMPAT.line_en
    : kb.isKeycapSet && kb.layout === "mixed"
      ? "This set comes in both ISO and ANSI — pick the version that matches your keyboard's Enter key (L-shaped = ISO)."
      : kbTag === "ISO"
        ? "This set is for ISO keyboards — the ones with the tall L-shaped Enter key."
        : kbTag === "ANSI"
          ? "This set is for ANSI keyboards — the ones with the wide straight Enter key."
          : "";

  let description: string;
  if (isShopify) {
    const ic = (s: string) => (emojiOk ? s : "");
    description = [
      `<h2>${ic("✨ ")}${titleCase(`${lead} ${noun}`)}</h2>`,
      `<p>${preBar} — crafted to bring a ${style.en.toLowerCase()} feel to your space. Designed around the theme, built to last.</p>`,
      `<h3>${ic("🔧 ")}Key features</h3>`,
      "<ul>",
      ...featBullets.map((b) => `  <li>${ic("✅ ")}${titleCase(b)}</li>`),
      "</ul>",
      specLines.length ? `<h3>${ic("📐 ")}Specifications</h3>\n<ul>\n${specLines.map((l) => `  <li>${l}</li>`).join("\n")}\n</ul>` : "",
      kbNote ? `<p>${ic("⌨️ ")}${kbNote}</p>` : "",
      `<h3>${ic("📦 ")}What's included</h3>`,
      `<p>Complete ${noun}, carefully packaged for safe delivery.</p>`,
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    const opener = emojiOk ? "✨ " : "";
    description = [
      `${opener}Looking for ${lead.toLowerCase()} ${noun} that actually stands out?`,
      "",
      `${preBar} — every detail is chosen to match the theme, from the finish to the smallest accent.`,
      "",
      feat,
      ...featBullets.map((b) => `• ${titleCase(b)}`),
      "",
      matl,
      `Quality materials and a durable finish built for everyday use.`,
      "",
      ...(specLines.length ? [spec, ...specLines, ""] : []),
      note,
      ...(kbNote ? [kbNote] : []),
      `Please check the compatibility details above before ordering. Message us any time — we usually reply within 24 hours.`,
      "",
      `Thanks for stopping by — we hope this ${noun} finds a good home on your desk. ${emojiOk ? "💖" : ""}`.trim(),
    ].join("\n");
  }

  // operator-typed product details: appended verbatim as an extra section — but
  // only when it's prose. When it's a terse spec list it already drives the specs
  // above (note-mode with a short bullet count), so don't repeat it.
  const opNote = (input.productNote || "").trim();
  if (opNote && !(noteMode && noteBullets.length && opNote.length < 200)) {
    description += isShopify
      ? `\n<h3>${emojiOk ? "📝 " : ""}More details</h3>\n` +
        opNote
          .split(/\n{2,}/)
          .map((p) => `<p>${p.trim().replace(/\n/g, "<br>")}</p>`)
          .join("\n")
      : `\n\n${fancyBold("More Details")}\n${opNote}`;
  }

  const fields: GeneratedField[] = [
    { key: "title", value: title },
    { key: "description", value: isShopify ? description : fancyEtsyHeaders(description) },
    { key: "tags", value: chosen.join(", ") },
  ];
  if (isShopify) {
    fields.push({ key: "seo_title", value: title });
    fields.push({ key: "seo_description", value: title });
  } else {
    fields.push({ key: "title_alt", value: etsyAltTitle(title, input.brand, 14) });
    fields.push({ key: "tags_pool", value: pool.join(", ") });
  }

  return {
    fields,
    layout: isShopify ? input.descriptionLayout : undefined,
    meta: { brand: input.brand?.trim() || undefined, htmlLengthBand: input.htmlLengthBand, descStyle: input.descStyle, engine: "local-template" },
  };
}
