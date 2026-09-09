import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./env.ts";

const DIR = join(ROOT, "shared", "examples");

type Ch = "etsy" | "shopify";
type Key = "title" | "title_alt" | "description" | "tags";

const FILE: Record<Ch, Partial<Record<Key, string>>> = {
  etsy: { title: "etsy-titles.txt", title_alt: "etsy-titles.txt", description: "etsy-descriptions.txt", tags: "etsy-tags.txt" },
  shopify: { title: "shopify-titles.txt", description: "shopify-descriptions.txt", tags: "shopify-tags.txt" },
};

const cache = new Map<string, string>();

function raw(file: string): string {
  if (cache.has(file)) return cache.get(file)!;
  const p = join(DIR, file);
  let s = existsSync(p) ? readFileSync(p, "utf8") : "";
  cache.set(file, s);
  return s;
}

/**
 * The operator's real reference example for a channel + field, read from
 * `shared/examples/`. Etsy descriptions get ❌ → ⚠️. The Shopify description
 * example file (`shared/examples/shopify-descriptions.txt` — the operator's
 * `Shopify Aciklamalar.txt`, 5 full bespoke HTML product blocks) is returned
 * VERBATIM AND IN FULL: every block, every character, no slicing, no cap
 * (operator: "her bir harfi detayı kullanılsın").
 */
export function readExample(channel: string, key: string): string {
  const ch = channel === "etsy" ? "etsy" : "shopify";
  const file = FILE[ch][key as Key];
  if (!file) return "";
  let s = raw(file).replace(/\r\n/g, "\n").trim();
  if (ch === "etsy" && key === "description") s = s.replace(/❌/g, "⚠️");
  // Shopify description: whole file, all product blocks, untouched.
  return s;
}

/** All six examples in one object — for the Delivery editor. */
export function allExamples() {
  return {
    etsy: {
      title: readExample("etsy", "title"),
      title_alt: readExample("etsy", "title_alt"),
      description: readExample("etsy", "description"),
      tags: readExample("etsy", "tags"),
    },
    shopify: {
      title: readExample("shopify", "title"),
      description: readExample("shopify", "description"),
      tags: readExample("shopify", "tags"),
    },
  };
}
