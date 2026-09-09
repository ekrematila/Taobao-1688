// Free / near-free machine translation — NO paid AI.
//
// Priority: domain glossary (exact) → LibreTranslate (self-host, unlimited, free
// if LIBRETRANSLATE_URL is set) → MyMemory public API (anonymous, free, ~5k
// words/day). Everything falls back gracefully to the glossary-processed text so
// this never throws for the caller.

import { getSetting } from "./db.ts";
import { applyKeycapGlossary } from "@shared/keycaps.ts";

/** Exact niche replacements applied before AND after MT so terms stay correct. */
const GLOSSARY: [RegExp, string][] = [
  [/原厂高度|OEM\s*高度|OEM原厂/gi, "Cherry Profile"],
  [/球帽|SA\s*高度/gi, "SA Profile"],
  [/(五面)?热升华/gi, "Dye-Sublimation"],
  [/PBT\s*材质|PBT料/gi, "PBT"],
  [/ABS\s*材质/gi, "ABS"],
  [/透光(键帽)?/gi, "Shine-through"],
  [/客制化/gi, "Custom"],
  [/轴体|机械轴/gi, "Switch"],
  [/键帽/gi, "Keycap"],
  [/机械键盘/gi, "Mechanical keyboard"],
  [/工厂直销|源头厂家/gi, "Factory direct"],
  [/正品(保证)?/gi, "Genuine"],
  [/包邮/gi, "Free shipping"],
  [/现货/gi, "In stock"],
  [/套装/gi, "Set"],
  [/适配/gi, "Compatible with"],
  [/尺寸/gi, "Size"],
  [/颜色/gi, "Color"],
  [/材质/gi, "Material"],
  [/数量/gi, "Quantity"],
  [/高度对比/gi, "Height comparison"],
  [/参数/gi, "Specs"],
];

function applyGlossary(s: string): string {
  let t = s;
  for (const [re, en] of GLOSSARY) t = t.replace(re, en);
  return applyKeycapGlossary(t); // hard rule: 原厂高度 / "original height" → "Cherry Profile"
}

const hasCJK = (s: string) => /[㐀-鿿豈-﫿]/.test(s);

async function libre(text: string, from: string, to: string, base: string): Promise<string | null> {
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: from, target: to, format: "text" }),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    return typeof j?.translatedText === "string" ? j.translatedText : null;
  } catch {
    return null;
  }
}

async function myMemory(text: string, from: string, to: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${from}|${to}`,
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    const mt = j?.responseData?.translatedText;
    if (typeof mt !== "string" || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(mt)) return null;
    return mt;
  } catch {
    return null;
  }
}

export interface FreeTranslateResult {
  results: string[];
  engine: "libretranslate" | "mymemory" | "glossary-only";
}

/**
 * Translate a batch of short strings for free. `from`/`to` are ISO-ish codes
 * ("zh", "en", "tr", ...). Never throws.
 */
export async function freeTranslate(texts: string[], to = "en", from = "zh"): Promise<FreeTranslateResult> {
  const base = getSetting("libretranslate_url") || process.env.LIBRETRANSLATE_URL || "";
  let engine: FreeTranslateResult["engine"] = "glossary-only";
  const results: string[] = [];

  for (const raw of texts) {
    const pre = applyGlossary(String(raw ?? "").trim());
    if (!pre || !hasCJK(pre)) {
      results.push(pre);
      continue;
    }
    let mt: string | null = null;
    if (base) {
      mt = await libre(pre, from, to, base);
      if (mt) engine = "libretranslate";
    }
    if (!mt) {
      mt = await myMemory(pre, from, to);
      if (mt) engine = "mymemory";
    }
    results.push(applyGlossary(mt ?? pre));
  }
  return { results, engine };
}
