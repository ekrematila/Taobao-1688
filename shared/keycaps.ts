// Keycap-domain rules shared by every path (free MT, Manus image translation,
// LLM prompts, the NO-AI template builder, the UI).
//
//  1. "原厂高度" (and its OEM / "original height" mistranslations) is ALWAYS
//     rendered as exactly "Cherry Profile".
//  2. A keycap set with a big L-shaped Enter key is an ISO layout. Some listings
//     offer both — then it varies by variant and must be called out.

import type { NormalisedProduct, ProductVariant } from "./types.ts";

/* --------------------------- 原厂高度 → Cherry Profile --------------------------- */
//
// IMPORTANT: "原厂高度" (yuánchǎng gāodù, "original factory height") IS the Chinese
// calque for Cherry profile and folds to it. But a LATIN "OEM" is its own, taller
// profile — sellers who write "OEM" / "OEM Profile" / "OEM高度" mean the OEM
// profile, NOT Cherry. We must not silently rewrite OEM → Cherry.

const CHERRY_RULES: [RegExp, string][] = [
  [/原\s*厂\s*高\s*度/gi, "Cherry Profile"],
  [/原厂\s*(高度|profile)/gi, "Cherry Profile"],
  // "original factory" (with or without a trailing height/profile word) is another
  // calque of 原厂高度 — must fold to Cherry too, before the generic rule below.
  [/\boriginal\s+factory(?:\s+(?:height|profile))?\b/gi, "Cherry Profile"],
  // common MT output for 原厂高度
  [/\b(original|factory|stock)\s+(height|profile)\b/gi, "Cherry Profile"],
  [/\bCherry\s+profile\b/g, "Cherry Profile"],
];

/** Force every spelling of 原厂高度 to "Cherry Profile"; normalise a bare "OEM" height to "OEM Profile". */
export function applyKeycapGlossary(s: string): string {
  let t = String(s ?? "");
  for (const [re, en] of CHERRY_RULES) t = t.replace(re, en);
  // keep OEM as OEM (its own profile) — just tidy the wording
  t = t.replace(/\bOEM\s*(?:高度|height)/gi, "OEM Profile").replace(/\bOEM\s+profile\b/gi, "OEM Profile");
  return t;
}

/** Human-readable directive for prompts (Manus + Claude). */
export const CHERRY_PROFILE_DIRECTIVE =
  'GLOSSARY (mandatory, applies to overlay text, spec tables, variant labels, tags, anywhere): ' +
  'render "原厂高度" / "原厂" / "original height" / "original factory" / "factory profile" as exactly "Cherry Profile". ' +
  'But "OEM" / "OEM Profile" / "OEM高度" is a DIFFERENT (taller) profile — render it as "OEM Profile", never "Cherry".';

/* ------------------------------- ISO vs ANSI ------------------------------- */

export type Layout = "ISO" | "ANSI" | "mixed" | "unknown";

export interface KeyboardLayout {
  isKeycapSet: boolean;
  /** overall verdict (mixed = differs between variants) */
  layout: Layout;
  /** the SET ships Enter keys for BOTH layouts — "ANSI & ISO compatible" */
  bothLayouts: boolean;
  /** per-variant verdict, only for variants that carry a signal */
  perVariant: { index: number; name: string; layout: "ISO" | "ANSI" }[];
  evidence: string[];
}

/** Marketing phrases for a set that includes both ANSI and ISO Enter keys. */
export const LAYOUT_COMPAT = {
  /** short — tags / badges */
  tag: "ansi iso compatible",
  /** title chunk */
  title: "ANSI & ISO Layout",
  line_en:
    "Includes the Enter keys for BOTH ANSI and ISO layouts — build your board either way, no extra kit needed.",
  line_tr:
    "Hem ANSI hem ISO düzeni için Enter tuşlarını içerir — klavyeni istediğin düzende kurabilirsin.",
};

const KEYCAP_RE = /key\s*caps?|键\s*帽|keycap set|artisan keycap/i;

// Big / L-shaped Enter ⇒ ISO. "大回车" = big enter, "异形回车" = odd-shaped enter.
const ISO_RE = /\bISO\b|ISO[\s-]*enter|异形(大)?回车|[LＬ][\s]*[型形][\s]*回车|大回车|欧规|欧洲布局|北欧布局|德式布局/i;
// Straight / horizontal Enter ⇒ ANSI.
const ANSI_RE = /\bANSI\b|ANSI[\s-]*enter|一字回车|横回车|美规|美式布局|标准(美式)?回车/i;

function scan(text: string): "ISO" | "ANSI" | null {
  const iso = ISO_RE.test(text);
  const ansi = ANSI_RE.test(text);
  if (iso && !ansi) return "ISO";
  if (ansi && !iso) return "ANSI";
  return null;
}

function variantText(v: ProductVariant): string {
  return `${v.name || ""} ${v.nameTranslated || ""}`;
}

/**
 * Decide whether the product is a keycap set and, if so, whether it is ISO,
 * ANSI, or varies per variant. Text-based: checks title, description, props and
 * every variant name (both languages).
 */
export function detectKeyboardLayout(product: NormalisedProduct): KeyboardLayout {
  const propStr = Object.entries(product.props || {})
    .map(([k, v]) => `${k} ${v}`)
    .join(" ");
  const head = `${product.title || ""} ${product.titleTranslated || ""} ${propStr}`;
  const body = (product.descHtml || "").replace(/<[^>]+>/g, " ");
  const isKeycapSet = KEYCAP_RE.test(head) || KEYCAP_RE.test(body);

  const evidence: string[] = [];
  const perVariant: KeyboardLayout["perVariant"] = [];
  for (let i = 0; i < (product.variants || []).length; i++) {
    const hit = scan(variantText(product.variants[i]));
    if (hit) {
      perVariant.push({ index: i, name: product.variants[i].nameTranslated || product.variants[i].name, layout: hit });
      evidence.push(`variant "${product.variants[i].name}" → ${hit}`);
    }
  }

  const full = `${head} ${body} ${(product.variants || []).map(variantText).join(" ")}`;
  const productHit = scan(`${head} ${body}`);
  if (productHit) evidence.push(`product text → ${productHit}`);

  // the set ships BOTH enter keys (image/desc/props mention both, or variants split both ways)
  const vset0 = new Set(perVariant.map((p) => p.layout));
  const bothLayouts =
    isKeycapSet && ((ISO_RE.test(full) && ANSI_RE.test(full)) || (vset0.has("ISO") && vset0.has("ANSI")));
  if (bothLayouts) evidence.push("set includes BOTH ANSI & ISO enter keys");

  let layout: Layout = "unknown";
  const vset = new Set(perVariant.map((p) => p.layout));
  if (vset.size > 1) layout = "mixed";
  else if (vset.size === 1) layout = [...vset][0];
  else if (productHit) layout = productHit;

  return { isKeycapSet, layout, bothLayouts, perVariant, evidence };
}

/* --------------------------- keycap profiles --------------------------- */

// Known keycap profile / height names. "原厂高度"/"original height" → Cherry; a
// Latin "OEM" is its OWN profile and stays "OEM".
const PROFILE_TOKENS = [
  "cherry", "oem", "sa", "xda", "dsa", "mda", "moa", "mao", "kat", "kam", "asa",
  "soa", "xoa", "foa", "mog", "dma", "kca", "xvx", "dss", "kdsa", "ldsa",
];
const PROFILE_RE = new RegExp(`\\b(${PROFILE_TOKENS.join("|")})\\b(?:\\s*(?:profile|height))?`, "gi");

/**
 * Every keycap profile the product data mentions (title, props, description,
 * variants). Order = first appearance. "原厂高度" / "original height" → "Cherry";
 * "OEM" stays "OEM" (a distinct, taller profile — never silently → Cherry).
 * Names are Title-cased ("Cherry", "Oem"→"OEM") except acronyms which stay UPPER.
 */
export function detectProfiles(
  product: NormalisedProduct,
  opts: { trustLiteral?: boolean } = {},
): string[] {
  const raw = [
    product.title || "",
    product.titleTranslated || "",
    Object.entries(product.props || {}).map(([k, v]) => `${k} ${v}`).join(" "),
    (product.descHtml || "").replace(/<[^>]+>/g, " "),
    (product.variants || []).map((v) => `${v.name || ""} ${v.nameTranslated || ""}`).join(" "),
  ].join("  ");
  // Run the Cherry glossary so Taobao's "原厂高度" / "original height" MT artifacts
  // collapse to "Cherry Profile" (glossary keeps OEM as OEM). `trustLiteral`
  // (operator typed it) skips the glossary entirely.
  const text = opts.trustLiteral ? raw : applyKeycapGlossary(raw);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(PROFILE_RE)) {
    const p = m[1].toUpperCase();
    const nice = p === "CHERRY" ? "Cherry" : p; // "OEM", "SA", "MOA", … stay upper
    if (!seen.has(nice)) {
      seen.add(nice);
      out.push(nice);
    }
  }
  // "Cherry Profile" from the glossary is a strong signal even without a bare token
  if (!out.length && /cherry profile/i.test(text)) out.push("Cherry");
  return out;
}

/** "Cherry Profile" · "Cherry & MOA Profile" · "Cherry, MOA & SA Profile" · "". */
export function profilePhrase(profiles: string[]): string {
  const p = profiles.slice(0, 3);
  if (!p.length) return "";
  if (p.length === 1) return `${p[0]} Profile`;
  if (p.length === 2) return `${p[0]} & ${p[1]} Profile`;
  return `${p[0]}, ${p[1]} & ${p[2]} Profile`;
}

/** One-line note for prompts / research / advice / UI. Empty when nothing to say. */
export function layoutNote(k: KeyboardLayout, lang: "tr" | "en" = "en"): string {
  if (!k.isKeycapSet) return "";
  if (k.bothLayouts) {
    return lang === "tr"
      ? `KLAVYE DÜZENİ: bu set HEM ANSI HEM ISO uyumlu (iki Enter tuşunu da içeriyor). Başlıkta "${LAYOUT_COMPAT.title}", etikette "${LAYOUT_COMPAT.tag}", açıklamada tam cümle: "${LAYOUT_COMPAT.line_en}"`
      : `KEYBOARD LAYOUT: this set is ANSI & ISO compatible (ships both Enter keys). Put "${LAYOUT_COMPAT.title}" in the title, "${LAYOUT_COMPAT.tag}" as a tag, and this line in the description: "${LAYOUT_COMPAT.line_en}"`;
  }
  if (k.layout === "unknown") return "";
  if (lang === "tr") {
    if (k.layout === "mixed") {
      const parts = k.perVariant.map((p) => `${p.name}: ${p.layout}`).join(", ");
      return `KLAVYE DÜZENİ: varyanta göre değişiyor — ${parts}. Her varyantın ISO/ANSI durumunu doğru belirt; L şeklinde (büyük) Enter = ISO.`;
    }
    return `KLAVYE DÜZENİ: bu keycap set ${k.layout}. ${k.layout === "ISO" ? "L şeklinde büyük Enter tuşu var." : "Düz/yatay Enter tuşu."} Başlık, etiket ve açıklamada bunu belirt.`;
  }
  if (k.layout === "mixed") {
    const parts = k.perVariant.map((p) => `${p.name}: ${p.layout}`).join(", ");
    return `KEYBOARD LAYOUT: varies by variant — ${parts}. State ISO/ANSI correctly per variant; an L-shaped (big) Enter = ISO.`;
  }
  return `KEYBOARD LAYOUT: this keycap set is ${k.layout}. ${
    k.layout === "ISO" ? "It has the L-shaped big Enter key." : "It has the straight/horizontal Enter key."
  } Mention this in the title, tags and description.`;
}
