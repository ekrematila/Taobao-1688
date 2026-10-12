// "Fill the variants for me": detect them from the product, name them (free glossary + machine
// translation, or the AI) and price them by the channel's rule. Names and prices never fail
// silently — an unreadable label becomes "Option N", a missing price stays as the operator left it.

import type { ChannelId, NormalisedProduct, ProductVariant } from "@shared/types.ts";
import { applyAutoPrices, type PriceInfo } from "@shared/variantPricing.ts";
import { detectVariantNames, finalizeNames, hasCjk, ruleBasedVariantName } from "@shared/variantNames.ts";
import { freeTranslate } from "./translate.ts";
import { nameVariantsForChannel } from "./llm.ts";

export interface AutoVariantOptions {
  channel: ChannelId;
  targetLanguage: string;
  mode: "free" | "ai";
  /** also (re)price from the yuan price */
  prices: boolean;
  /** keep a name the variant already has (after a generation) instead of renaming everything */
  keepNames?: boolean;
  etsyBase?: "min" | "max";
  model?: string;
  signal?: AbortSignal;
  draftId?: string;
}

export interface AutoVariantResult {
  variants: ProductVariant[];
  /** variants created from the product's own option attributes */
  detected: number;
  /** how many names came out of the glossary alone / needed machine translation */
  glossary: number;
  translated: number;
  priceInfo?: PriceInfo;
}

const capOf = (channel: ChannelId) => (channel === "etsy" ? 20 : 40);

/** names without any paid AI: keycap glossary first, free machine translation only for what it could not read */
export async function nameVariantsFree(
  variants: ProductVariant[],
  channel: ChannelId,
  targetLanguage: string,
  keepNames = false,
): Promise<{ names: string[]; glossary: number; translated: number }> {
  const cap = capOf(channel);
  const to = (targetLanguage || "en").slice(0, 2);
  const english = to === "en";
  const src = variants.map((v) => (hasCjk(v.name) ? v.name : v.nameTranslated || v.name || ""));
  const names: string[] = [];
  const mtCache = new Map<string, string>();
  let glossary = 0;
  let translated = 0;
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    // a variant the operator added and named by hand keeps its name
    if ((v.manual || keepNames) && v.nameTranslated?.trim()) {
      names.push(v.nameTranslated.trim());
      continue;
    }
    const rule = english ? ruleBasedVariantName(src[i]) : { text: "", complete: false };
    if (rule.complete && rule.text) {
      glossary++;
      names.push(rule.text);
      continue;
    }
    // part of the label is outside the glossary → free machine translation of the whole label
    let mt = mtCache.get(src[i]);
    if (mt === undefined) {
      const { results } = await freeTranslate([src[i]], to, "zh");
      mt = results[0] ?? "";
      mtCache.set(src[i], mt);
    }
    if (mt && !hasCjk(mt)) {
      translated++;
      names.push(english ? ruleBasedVariantName(mt).text || mt : mt);
    } else {
      names.push(rule.text); // whatever the glossary did read (maybe empty → "Option N" below)
    }
  }
  return { names: finalizeNames(names, cap), glossary, translated };
}

/** a short description of the product for the AI naming prompt */
function productContext(p: NormalisedProduct): string {
  const t = p.titleTranslated || p.title || "";
  const props = Object.entries(p.props ?? {})
    .slice(0, 8)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
  return [t, props].filter(Boolean).join(" | ").slice(0, 600);
}

export async function autoFillVariants(product: NormalisedProduct, opts: AutoVariantOptions): Promise<AutoVariantResult> {
  let variants = product.variants ?? [];

  // 1. a product whose source listed no real options, but whose attributes name several
  const found = detectVariantNames(product.props, variants);
  const detected = found.length;
  if (found.length) {
    variants = found.map((name) => ({ name, price: product.priceOriginal ?? null, priceCny: product.priceOriginal ?? null }));
  }

  // 2. names
  let glossary = 0;
  let translated = 0;
  if (variants.length) {
    if (opts.mode === "ai") {
      const keep = variants.map((v) => (v.manual || opts.keepNames) && v.nameTranslated?.trim());
      const named = (
        await nameVariantsForChannel(variants, opts.channel, opts.targetLanguage || "en", {
          model: opts.model,
          signal: opts.signal,
          draftId: opts.draftId,
          context: productContext(product),
        })
      ).variants;
      variants = named.map((v, i) => (keep[i] ? { ...v, nameTranslated: variants[i].nameTranslated } : v));
    } else {
      const r = await nameVariantsFree(variants, opts.channel, opts.targetLanguage || "en", opts.keepNames);
      glossary = r.glossary;
      translated = r.translated;
      variants = variants.map((v, i) => ({ ...v, nameTranslated: r.names[i] }));
    }
  }

  // 3. prices — a fixed rule from the yuan price, no AI
  let priceInfo: PriceInfo | undefined;
  if (opts.prices && variants.length) {
    const r = applyAutoPrices(variants, opts.channel, { etsyBase: opts.etsyBase, fallbackCny: product.priceOriginal });
    variants = r.variants;
    priceInfo = r.info;
  }
  return { variants, detected, glossary, translated, priceInfo };
}
