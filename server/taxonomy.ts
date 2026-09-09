import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./env.ts";
import type { NormalisedProduct } from "@shared/types.ts";
import { shopifyCategoryFor } from "@shared/shopifyCategories.ts";
import { cleanPropsRecord } from "@shared/specs.ts";
import { detectProfiles } from "@shared/keycaps.ts";

export interface TaxNode {
  gid: string;
  path: string;
}

/**
 * The COMPLETE official Shopify Standard Product Taxonomy, bundled in the repo
 * (`shared/shopify-taxonomy.txt`, ~14.6k categories, from
 * https://shopify.github.io/product-taxonomy/). Parsed once at startup.
 */
export const TAXONOMY: TaxNode[] = (() => {
  try {
    const txt = readFileSync(join(ROOT, "shared", "shopify-taxonomy.txt"), "utf8");
    const out: TaxNode[] = [];
    for (const line of txt.split(/\r?\n/)) {
      const m = /^(gid:\/\/shopify\/TaxonomyCategory\/[a-z0-9-]+)\s*:\s*(.+?)\s*$/i.exec(line);
      if (m) out.push({ gid: m[1], path: m[2] });
    }
    return out;
  } catch {
    return [];
  }
})();

export const TAXONOMY_PATHS: string[] = TAXONOMY.map((n) => n.path);

const byPathLc = new Map(TAXONOMY.map((n) => [n.path.toLowerCase(), n]));
const byLeafLc = new Map<string, TaxNode>();
for (const n of TAXONOMY) {
  const leaf = n.path.split(" > ").pop()!.toLowerCase();
  if (!byLeafLc.has(leaf)) byLeafLc.set(leaf, n); // first (shallowest) wins
}

/** Exact-path or exact-leaf lookup (for when the operator typed / picked one). */
export function findTaxonomy(query: string): TaxNode | null {
  const q = (query || "").trim().toLowerCase();
  if (!q) return null;
  return byPathLc.get(q) || byLeafLc.get(q) || byLeafLc.get(q.replace(/s$/, "")) || byLeafLc.get(q + "s") || null;
}

const STOP = new Set(["the", "a", "an", "and", "or", "for", "with", "of", "in", "to", "set", "sets", "kit"]);

/**
 * Best full taxonomy path for a product. The curated keyboard-hobby classifier
 * wins (fast, hand-tuned for this store); otherwise a keyword score over the
 * WHOLE taxonomy, preferring deeper (more specific) leaves.
 */
export function resolveCategory(
  productType: string | undefined,
  product?: Pick<NormalisedProduct, "title" | "titleTranslated" | "props" | "descHtml">,
): TaxNode {
  const typed = findTaxonomy(productType || "");
  if (typed) return typed;

  const hay = `${productType || ""} ${product?.titleTranslated || ""} ${product?.title || ""} ${Object.keys(product?.props || {}).join(" ")}`
    .toLowerCase();

  // curated domain classifier — trust it ONLY when the product itself is a
  // keyboard-hobby item (not just because the classifier's default is keycaps).
  const curated = shopifyCategoryFor(productType, product);
  const curatedNode = byPathLc.get(curated.path.toLowerCase()) || null;
  if (
    curatedNode &&
    /key\s?cap|键帽|keyboard|键盘|keypad|小键盘|\bswitch|轴体|机械轴|stabil|卫星轴|\bpcb\b|电路板|artisan|deskmat|desk\s?pad|desk\s?mat|桌垫|鼠标垫|mouse\s?pad|mousepad|\bmouse\b|鼠标|wrist\s?rest|palm\s?rest|掌托|手托|\bbag\b|ita\s?bag|痛包|斜挎|单肩|双肩|背包|handbag|backpack|cross\s?body|\bcable\b|coiled|键盘线|数据线|type-?c\s*线|u\s?disk|u盘|flash\s?drive|numpad/i.test(
      hay,
    )
  ) {
    return curatedNode;
  }
  const fallback = curatedNode || TAXONOMY.find((n) => n.path.endsWith("Keyboard Keycap Sets")) || TAXONOMY[0];
  const words = [...new Set(hay.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)))];
  if (words.length < 1) return fallback;

  // WHOLE-word matches only (so "phone" ≠ "saxophone", "cat" ≠ "catheter").
  const wb = words.map((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i"));
  let best = fallback;
  let bestScore = 0;
  for (const n of TAXONOMY) {
    const segs = n.path.split(" > ");
    const leaf = segs[segs.length - 1];
    let score = 0;
    for (const re of wb) {
      if (re.test(leaf)) score += 5;
      else if (re.test(n.path)) score += 1.5;
    }
    if (score < 5) continue; // need at least one solid leaf-word hit
    score += Math.min(segs.length, 6) * 0.25; // mild preference for specificity
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return bestScore >= 5 ? best : fallback;
}

/* ============================ Taxonomy Attributes ============================ */

export interface TaxAttrValue {
  id: string;
  gid: string;
  name: string;
}
export interface TaxAttr {
  id: string;
  gid: string;
  handle: string;
  name: string;
  values: TaxAttrValue[];
}

/** `shared/shopify-attributes.txt` — `id|handle|name|valId=valName;valId=valName…`
 *  (all 8,240 taxonomy attributes + their values, release 2026-08). */
const ATTR_BY_ID: Map<string, TaxAttr> = (() => {
  const m = new Map<string, TaxAttr>();
  try {
    const txt = readFileSync(join(ROOT, "shared", "shopify-attributes.txt"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      if (!line || line[0] === "#") continue;
      const parts = line.split("|");
      const id = parts[0]?.trim();
      const handle = parts[1]?.trim();
      const name = parts[2]?.trim();
      if (!id || !handle) continue;
      const values: TaxAttrValue[] = (parts[3] || "")
        .split(";")
        .filter(Boolean)
        .map((s) => {
          const eq = s.indexOf("=");
          const vid = eq < 0 ? s : s.slice(0, eq);
          const vname = eq < 0 ? s : s.slice(eq + 1);
          return { id: vid, gid: `gid://shopify/TaxonomyValue/${vid}`, name: vname };
        });
      m.set(id, { id, gid: `gid://shopify/TaxonomyAttribute/${id}`, handle, name: name || handle, values });
    }
  } catch {
    /* file missing → attributes feature simply returns nothing */
  }
  return m;
})();

/** `shared/shopify-category-attributes.txt` — `categorySlug:attrId,attrId,…`
 *  (14,454 categories → the attribute ids Shopify shows for that category). */
const CAT_ATTRS: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  try {
    const txt = readFileSync(join(ROOT, "shared", "shopify-category-attributes.txt"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const c = line.indexOf(":");
      if (c < 1) continue;
      const slug = line.slice(0, c).trim();
      const ids = line.slice(c + 1).split(",").map((s) => s.trim()).filter(Boolean);
      if (slug && ids.length) m.set(slug, ids);
    }
  } catch {
    /* ignore */
  }
  return m;
})();

export const TAXONOMY_ATTR_COUNT = ATTR_BY_ID.size;

const slugOf = (categoryGid: string) => (categoryGid || "").split("/").pop() || "";

/** The taxonomy attributes Shopify shows for a category (walks up ancestors if the
 *  exact node has none of its own). */
export function attributesForCategory(categoryGid: string): TaxAttr[] {
  let slug = slugOf(categoryGid);
  while (slug) {
    const ids = CAT_ATTRS.get(slug);
    if (ids) return ids.map((id) => ATTR_BY_ID.get(id)).filter((a): a is TaxAttr => !!a);
    const cut = slug.lastIndexOf("-");
    if (cut < 0) break;
    slug = slug.slice(0, cut);
  }
  return [];
}

export function attributeByHandle(handle: string): TaxAttr | null {
  for (const a of ATTR_BY_ID.values()) if (a.handle === handle) return a;
  return null;
}

export type AttrPick = { attrGid: string; attrName: string; valueGids: string[]; valueNames: string[] };

/** whole-word, case/'-'/space-insensitive test that `needle` occurs in `hay`. */
function hasWord(hay: string, needle: string): boolean {
  const n = needle.toLowerCase().replace(/[()]/g, "").trim();
  if (n.length < 2) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]*");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(hay);
}

/**
 * DATA-BASED (no AI) attribute picks for a product: for every attribute Shopify
 * shows for the category, pick the value(s) whose name the product data clearly
 * supports. Keycap/keyboard-specific handles get hand-tuned signal extraction;
 * everything else falls back to a whole-word value-name match. Only confident
 * matches are returned.
 */
export function resolveAttributes(categoryGid: string, product: NormalisedProduct): Record<string, AttrPick> {
  const attrs = attributesForCategory(categoryGid);
  if (!attrs.length) return {};

  const specs = cleanPropsRecord(product.props, 24);
  const hay = [
    product.title || "",
    product.titleTranslated || "",
    Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join("  "),
    (product.descHtml || "").replace(/<[^>]+>/g, " "),
    (product.variants || []).map((v) => `${v.name || ""} ${v.nameTranslated || ""}`).join(" "),
  ]
    .join("  ")
    .toLowerCase();

  const profiles = detectProfiles(product).map((p) => p.toLowerCase()); // ["oem"], ["cherry","sa"]…
  const out: Record<string, AttrPick> = {};
  const put = (a: TaxAttr, vals: TaxAttrValue[]) => {
    const uniq = [...new Map(vals.map((v) => [v.id, v])).values()];
    if (uniq.length)
      out[a.handle] = {
        attrGid: a.gid,
        attrName: a.name,
        valueGids: uniq.map((v) => v.gid),
        valueNames: uniq.map((v) => v.name),
      };
  };
  const find = (a: TaxAttr, names: string[]) =>
    a.values.filter((v) => names.some((n) => n.toLowerCase() === v.name.toLowerCase()));

  for (const a of attrs) {
    const V = a.values;
    switch (a.handle) {
      case "keycap-profile": {
        const hit = V.filter((v) => profiles.includes(v.name.toLowerCase()));
        if (hit.length) put(a, hit);
        break;
      }
      case "keycap-material":
      case "material": {
        const order = [
          "Dye-sublimated PBT",
          "Double-shot ABS",
          "Polycarbonate (PC)",
          "PBT",
          "ABS",
          "POM",
          "Aluminum",
          "PPS",
          "PVC",
        ];
        const picks: TaxAttrValue[] = [];
        for (const name of order) {
          const v = V.find((x) => x.name.toLowerCase() === name.toLowerCase());
          if (!v) continue;
          const probe =
            name === "PBT"
              ? /\bpbt\b/i
              : name === "ABS"
                ? /\babs\b/i
                : name === "PC" || name === "Polycarbonate (PC)"
                  ? /polycarbonate|\bpc plastic\b/i
                  : new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]*"), "i");
          if (probe.test(hay)) picks.push(v);
        }
        // keep the single most specific (first in `order`)
        if (picks.length) put(a, [picks[0]]);
        break;
      }
      case "keycap-legend-printing-method": {
        const map: [RegExp, string][] = [
          [/reverse dye[\s-]*sub/i, "Reverse dye-sublimated"],
          [/dye[\s-]*sub|dye[\s-]*sublimat|thermal sublimation|热升华|五面热升华/i, "Dye-sublimated"],
          [/double[\s-]*shot|doubleshot|二色|双色/i, "Double-shot"],
          [/front[\s-]*print|正面印|前面印/i, "Front-printed"],
          [/side[\s-]*print|侧印|侧面印/i, "Side-printed"],
          [/laser[\s-]*(etch|engrav)|激光/i, "Laser-etched"],
          [/pad[\s-]*print|移印|丝印/i, "Pad printed"],
          [/uv[\s-]*print|uv印/i, "UV printed"],
          [/\bengrav/i, "Engraved"],
          [/blank|无字符|无刻/i, "Blank (no legends)"],
        ];
        const picks: TaxAttrValue[] = [];
        for (const [re, name] of map) {
          if (re.test(hay)) {
            const v = V.find((x) => x.name.toLowerCase() === name.toLowerCase());
            if (v) {
              picks.push(v);
              break;
            }
          }
        }
        if (picks.length) put(a, picks);
        break;
      }
      case "switch-stem-compatibility": {
        const picks: TaxAttrValue[] = [];
        if (/cherry\s*mx|mx[\s-]*(stem|style|compatible|轴)|\+ ?cross|十字轴|mx结构/i.test(hay))
          picks.push(...find(a, ["Cherry MX"]));
        if (/kailh\s*box/i.test(hay)) picks.push(...find(a, ["Kailh BOX"]));
        if (/kailh\s*choc|choc\b|low[\s-]*profile/i.test(hay)) picks.push(...find(a, ["Kailh Choc (low-profile)"]));
        if (/\balps\b/i.test(hay)) picks.push(...find(a, ["Alps"]));
        if (/outemu/i.test(hay)) picks.push(...find(a, ["Outemu"]));
        if (picks.length) put(a, picks);
        break;
      }
      case "keyboard-switch-type": {
        const picks: TaxAttrValue[] = [];
        if (/\blinear\b|线性/i.test(hay)) picks.push(...find(a, ["Linear"]));
        if (/\btactile\b|段落/i.test(hay)) picks.push(...find(a, ["Tactile"]));
        if (/\bclicky\b|click\b|青轴/i.test(hay)) picks.push(...find(a, ["Clicky"]));
        if (picks.length) put(a, picks);
        break;
      }
      case "color": {
        const picks = V.filter((v) => v.name !== "Multicolor" && hasWord(hay, v.name));
        if (picks.length >= 3) {
          const mc = V.find((v) => v.name === "Multicolor");
          put(a, mc ? [mc, ...picks.slice(0, 3)] : picks.slice(0, 4));
        } else if (picks.length) {
          put(a, picks);
        }
        break;
      }
      case "keyboard-backlight-type": {
        if (/\brgb\b|背光|backlit|backlight/i.test(hay)) {
          if (/per[\s-]*key/i.test(hay)) put(a, find(a, ["Per-key RGB"]));
          else if (/south[\s-]*facing|north[\s-]*facing|shine[\s-]*through/i.test(hay))
            put(a, find(a, ["RGB"]));
          else put(a, find(a, ["RGB"]));
        }
        break;
      }
      default: {
        // generic: a value whose full name is present as a whole word in the data
        const picks = V.filter((v) => v.name.length >= 3 && v.name !== "Other" && hasWord(hay, v.name));
        if (picks.length && picks.length <= 3) put(a, picks);
      }
    }
  }
  return out;
}
