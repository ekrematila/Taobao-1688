// 100% local, deterministic, NO-AI alternatives for the advice / category-research
// / listing-generation steps. Not as nuanced as the model, but free and instant —
// a genuine fallback the operator can lean on.

import { buildLocalListing } from "@shared/listingFormat.ts";
import { detectKeyboardLayout } from "@shared/keycaps.ts";
import type {
  AdviceResult,
  CategoryResearchResult,
  ChannelId,
  GenerateListingInput,
  GeneratedListing,
  NormalisedProduct,
} from "@shared/types.ts";

const NO_USAGE = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

function niche(p: NormalisedProduct): string {
  const t = `${p.titleTranslated || p.title} ${Object.values(p.props).join(" ")}`.toLowerCase();
  if (/keycap|键帽|keyboard|klavye/.test(t)) return "keycaps";
  if (/mug|cup|kupa|tumbler|bottle|şişe/.test(t)) return "drinkware";
  if (/hoodie|shirt|tee|tişört|sweat|apparel|giyim/.test(t)) return "apparel";
  if (/bag|tote|çanta|backpack|sırt/.test(t)) return "bags";
  if (/necklace|ring|earring|bracelet|kolye|yüzük|küpe|takı/.test(t)) return "jewelry";
  if (/sticker|çıkartma|decal/.test(t)) return "stickers";
  if (/lamp|light|led|lamba|ışık|neon/.test(t)) return "lighting";
  if (/poster|print|wall art|tablo|baskı/.test(t)) return "wall-art";
  return "generic";
}

const NICHE_NOTES: Record<string, string[]> = {
  keycaps: [
    "Profiles: OEM, Cherry, SA, XDA, MOA, DSA — state the exact one; Cherry ≠ OEM.",
    "Legends: dye-sublimation (PBT, durable), double-shot (crisp, shine-through), UV-print (cheapest, wears).",
    "Material: PBT (textured, fade-resistant) vs ABS (smooth, shines over time).",
    "Compatibility: MX-style stems; note whether a full set covers 60/65/75/TKL/100% and ISO/ANSI, plus extra novelty keys.",
    "Kit contents: how many keys, which sizes of spacebars, stepped Caps Lock, ISO Enter?",
  ],
  drinkware: [
    "Material: ceramic, stoneware, stainless (double-wall vacuum?), glass — dishwasher/microwave safe?",
    "Capacity in ml/oz, height & diameter, weight.",
    "Print method: sublimation (needs poly-coat), screen-print, decal, laser-engrave.",
    "Care: hand-wash to protect print; not for open flame.",
  ],
  apparel: [
    "Fabric: cotton/poly blend %, GSM weight, ring-spun vs open-end.",
    "Fit: unisex vs fitted, run small/true/large; give a full size chart (chest width + body length).",
    "Print: DTG, screen-print, DTF, embroidery — wash inside-out, cold, no tumble dry.",
    "Sizing tolerance ±2 cm is normal.",
  ],
  bags: [
    "Material: canvas oz weight, cotton, nylon, PU — lining? water-resistant?",
    "Dimensions (W×H×D), strap drop length, closure (zip, magnetic, open).",
    "Capacity and what it fits (A4, 13\"/15\" laptop).",
    "Print method + care (spot-clean).",
  ],
  jewelry: [
    "Material: 925 silver, stainless 316L, gold-plated (micron thickness), brass — nickel-free / hypoallergenic?",
    "Chain length + extender, pendant size, weight.",
    "Care: keep dry, avoid perfume/chlorine, store separately.",
  ],
  stickers: [
    "Material: vinyl (matte/gloss), holographic, clear, paper — laminated? UV & water resistant?",
    "Size(s), die-cut vs kiss-cut vs sheet, indoor/outdoor rating (years).",
    "Application surface guidance (clean, dry, non-porous).",
  ],
  lighting: [
    "Power: USB 5V, battery, or mains adapter (included?); wattage; cable length.",
    "Light: colour temperature / RGB, brightness, remote or app control, dimmable?",
    "Material of base & shade, dimensions, mounting (freestanding, wall, desk clamp).",
  ],
  "wall-art": [
    "Substrate: matte/satin poster paper GSM, canvas, framed vs unframed, aluminium.",
    "Available sizes (cm + in), aspect ratio, borderless?",
    "Ink: pigment/giclée archival rating; ships rolled in a tube.",
  ],
  generic: [
    "State exact materials, dimensions (metric + imperial) and weight.",
    "Describe the manufacturing / print method and its durability.",
    "List what's in the box and any compatibility or sizing rules.",
    "Add care instructions and a short accuracy/'为display only' style disclaimer if props show accessories.",
  ],
};

export function localCategoryResearch(
  product: NormalisedProduct,
  question: string,
  lang = "en",
): CategoryResearchResult {
  const n = niche(product);
  const kb = detectKeyboardLayout(product);
  const facts = Object.entries(product.props)
    .slice(0, 16)
    .map(([k, v]) => `- ${k}: ${String(v).slice(0, 80)}`);
  const kbSection =
    kb.isKeycapSet && kb.layout !== "unknown"
      ? [
          "",
          "## Keyboard layout (ISO vs ANSI)",
          kb.layout === "mixed"
            ? `- This listing offers BOTH — it varies by variant: ${kb.perVariant.map((p) => `${p.name} → ${p.layout}`).join(", ")}. Call the layout out per variant.`
            : `- Detected: **${kb.layout}**. ${kb.layout === "ISO" ? "It has the tall L-shaped Enter key (a big/L-shaped Enter always means ISO)." : "It has the wide straight Enter key."}`,
          "- A big L-shaped Enter key ⇒ ISO. Straight/horizontal Enter ⇒ ANSI. Also affects the left-Shift and the key above Enter.",
          `- Evidence: ${kb.evidence.join("; ") || "product text"}.`,
        ]
      : [];
  const body = [
    `# Category research — ${n} (offline / template)`,
    "",
    "## Standard reference points for this category",
    ...NICHE_NOTES[n].map((s) => `- ${s}`),
    ...kbSection,
    "",
    "## What THIS product's data already tells us",
    facts.length ? facts.join("\n") : "- (no structured properties returned by the source)",
    "",
    "## Buyer questions you should answer in the listing",
    "- Exact dimensions / capacity / size chart?",
    "- Material and finish, and how it wears over time?",
    "- Compatibility or fit rules (what it does and does NOT fit)?",
    "- What is included vs shown for display only?",
    "- Care / washing / handling instructions?",
    question?.trim() ? `\n## Focus question\n> ${question.trim()}\n\nUse the points above plus the product data to answer it explicitly in the copy.` : "",
    "",
    "_Generated locally without AI — verify anything marked as a category norm against the actual product._",
  ].join("\n");
  return { research: body, model: "local-template", usage: NO_USAGE };
}

export function localAdvice(product: NormalisedProduct, channel: ChannelId, lang = "en"): AdviceResult {
  const n = niche(product);
  const kb = detectKeyboardLayout(product);
  const title = product.titleTranslated || product.title;
  const nProps = Object.keys(product.props).length;
  const kbAdvice =
    kb.isKeycapSet && kb.layout !== "unknown"
      ? kb.layout === "mixed"
        ? `- **Layout varies by variant** (${kb.perVariant.map((p) => `${p.name}: ${p.layout}`).join(", ")}) — state ISO/ANSI on every variant name and in the description; a big L-shaped Enter = ISO.`
        : `- **This set is ${kb.layout}** (${kb.layout === "ISO" ? "L-shaped big Enter" : "straight Enter"}) — put "${kb.layout}" in the title, a tag, and the description.`
      : "";
  const md = [
    `## Product & niche`,
    `- Reads as **${n}**: "${title.slice(0, 90)}". ${nProps} properties available, ${product.images.length} images, ${product.variants.length} variants.`,
    "",
    `## Title`,
    "**Etsy** — 120 chars, front-load the exact product noun in the first ~40 chars, then \" | \" and a keyword variant, then comma phrases (theme, material, profile/size, compatibility), brand \" – Brand®\" last. No \"gift\". No repeated word.",
    "**Shopify** — 35–50 chars, Title Case, one clean keyword phrase containing the product noun; this doubles as the URL handle and SEO title.",
    "",
    `## Description`,
    channel === "shopify"
      ? "**Shopify (HTML)** — ~1,200–1,800 visible characters, roughly 18–30 short lines: `<h2>` hook, one `<p>` intro, `<h3>` + `<ul><li>` feature list, `<h3>` what's included. Use section icons/emoji like other pro stores."
      : "**Etsy (plain text)** — ~900–1,600 characters. First line: a short catchy question. Echo the pre-\" | \" title phrase inside the first 160 characters. Fancy-unicode section headers (𝐇𝐢𝐠𝐡𝐥𝐢𝐠𝐡𝐭 𝐅𝐞𝐚𝐭𝐮𝐫𝐞𝐬 …), blank line between short paragraphs, a compatibility note, a warm closing line.",
    "",
    `## Tags`,
    channel === "shopify"
      ? "At least 40 comma tags, lower-case, ≤20 chars, all directly product-relevant (theme, style, material, profile, colour, use, compatibility, gift searches, synonyms, long-tail). No chopped 'part' fragments like \"138 key keycap set\" or \"104 keys\"."
      : "13 live tags + a 20-tag pool, ≤20 chars AND ≤3 words (never a 4-word tag), each ending on the product noun (long & short form); first 4 are the adjective × noun cross-product; rest cover theme / material / profile / compatibility. No number+unit fragments (\"138 key keycap set\").",
    "",
    `## Images`,
    `- Main gallery: 6–10 (front, three-quarter, top-down, in-use, scale reference, detail macro). ${product.images.some((i) => i.role === "description") ? "Description strips exist — translate any Chinese overlay text." : "Add at least one informational/description image."}`,
    "",
    `## Risks for this category`,
    ...(kbAdvice ? [kbAdvice] : []),
    ...NICHE_NOTES[n].slice(0, 4).map((s) => `- ${s}`),
    "",
    "_Generated locally without AI._",
  ].join("\n");
  return { channel, advice: md, model: "local-template", usage: NO_USAGE };
}

export function localListing(product: NormalisedProduct, input: GenerateListingInput): GeneratedListing {
  const { fields, layout, meta } = buildLocalListing(product, input);
  return {
    channel: input.channel,
    fields,
    variants: product.variants,
    layout,
    meta: meta as GeneratedListing["meta"],
    model: "local-template",
    usage: NO_USAGE,
  };
}
