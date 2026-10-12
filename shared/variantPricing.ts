// Variant pricing from the Taobao/1688 price (CNY). One rule set shared by the
// editor, the CSV/ZIP exports and both pushes, so every place shows the same number.
//
//   Etsy    ¥100 → $109.99          ONE price for every variant, always ends in .99
//   Shopify ¥100 → was $109.90 → now $76.90   (compare-at ×1.1, sale price 70% of it), always ends in .90

import type { ChannelId, ProductVariant } from "./types.ts";

export interface PriceRules {
  /** CNY → the listed ("was") price */
  multiplier: number;
  /** Shopify only: the selling price as a share of the compare-at price */
  saleRatio: number;
}

export const DEFAULT_PRICE_RULES: PriceRules = { multiplier: 1.1, saleRatio: 0.7 };

/** the cents every price on a channel must end with */
export const PRICE_ENDING: Record<ChannelId, number> = { etsy: 0.99, shopify: 0.9 };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** the price ending in `.cents` that is closest to `value` (never below the ending itself) */
export function endAt(value: number, cents: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return r2(Math.max(0, Math.round(value - cents)) + cents);
}

/** snap a hand-typed price to the channel's ending (null stays null) */
export function snapPrice(value: number | null | undefined, channel: ChannelId): number | null {
  return value == null ? null : endAt(value, PRICE_ENDING[channel]);
}

/** the price(s) for one source price: Etsy = one price, Shopify = compare-at + sale price */
export function channelPrice(
  cny: number,
  channel: ChannelId,
  rules: PriceRules = DEFAULT_PRICE_RULES,
): { price: number; compareAt: number | null } | null {
  if (!Number.isFinite(cny) || cny <= 0) return null;
  if (channel === "etsy") {
    const price = endAt(cny * rules.multiplier, PRICE_ENDING.etsy);
    return price == null ? null : { price, compareAt: null };
  }
  const compare = endAt(cny * rules.multiplier, PRICE_ENDING.shopify);
  if (compare == null) return null;
  const sale = endAt(compare * rules.saleRatio, PRICE_ENDING.shopify);
  if (sale == null) return null;
  return sale >= compare ? { price: compare, compareAt: null } : { price: sale, compareAt: compare };
}

/** the CNY price a variant is computed from: the stored source, else a never-priced (still raw) price, else the fallback */
export function sourceCny(v: ProductVariant, fallback?: number | null): number | null {
  if (v.priceCny != null && v.priceCny > 0) return v.priceCny;
  if (!v.pricedFor && v.price != null && v.price > 0) return v.price; // imported value: still the yuan figure
  return fallback != null && fallback > 0 ? fallback : null;
}

export interface PriceInfo {
  /** lowest / highest source price among the variants */
  min: number | null;
  max: number | null;
  /** Etsy: the single price's source (CNY) */
  base: number | null;
  /** source prices differ between variants (matters for Etsy's single price) */
  differs: boolean;
}

export interface AutoPriceOptions {
  /** Etsy single price: base it on the cheapest (default) or the dearest variant */
  etsyBase?: "min" | "max";
  /** product-level price, used for a variant that has none */
  fallbackCny?: number | null;
  rules?: PriceRules;
  /** only these variants are (re)priced — the rest are kept as they are */
  only?: (v: ProductVariant) => boolean;
}

/** price every variant by the channel's rule; the source price is kept in `priceCny` so repeating this is safe */
export function applyAutoPrices(
  variants: ProductVariant[],
  channel: ChannelId,
  opts: AutoPriceOptions = {},
): { variants: ProductVariant[]; info: PriceInfo } {
  const rules = opts.rules ?? DEFAULT_PRICE_RULES;
  const pick = (v: ProductVariant) => !opts.only || opts.only(v);
  const srcs = variants.map((v) => (pick(v) ? sourceCny(v, opts.fallbackCny) : null));
  const known = srcs.filter((n): n is number => n != null);
  const min = known.length ? Math.min(...known) : null;
  const max = known.length ? Math.max(...known) : null;
  const base = channel === "etsy" ? (opts.etsyBase === "max" ? max : min) : null;
  const info: PriceInfo = { min, max, base, differs: min != null && max != null && Math.abs(max - min) > 0.005 };

  const out = variants.map((v, i) => {
    if (!pick(v)) return v;
    const src = srcs[i];
    if (src == null) return v; // nothing to compute from — leave the operator's value alone
    const p = channelPrice(channel === "etsy" ? (base ?? src) : src, channel, rules);
    if (!p) return v;
    return { ...v, priceCny: src, price: p.price, compareAtPrice: p.compareAt, pricedFor: channel };
  });
  return { variants: out, info };
}

/** how many variants are NOT yet priced by this channel's rule (a hand-typed price counts as done) */
export function unpricedCount(variants: ProductVariant[], channel: ChannelId): number {
  return variants.filter((v) => v.pricedFor !== channel && v.pricedFor !== "manual").length;
}

/**
 * The variants as they must leave the app for `channel`: a set auto-priced for the
 * OTHER channel is re-priced from its yuan source, and every price ends the way the
 * channel requires. Hand-typed prices keep their value (only the ending is enforced).
 */
export function pricedForChannel(variants: ProductVariant[], channel: ChannelId): ProductVariant[] {
  const stale = (v: ProductVariant) => (v.pricedFor === "etsy" || v.pricedFor === "shopify") && v.pricedFor !== channel && v.priceCny != null;
  let out = variants;
  if (variants.some(stale)) out = applyAutoPrices(variants, channel, { only: stale }).variants;
  if (out === variants && !variants.some((v) => v.pricedFor === "manual")) return variants;
  return out.map((v) => {
    if (v.pricedFor !== "manual") return v;
    const price = snapPrice(v.price, channel);
    const compareAtPrice = channel === "etsy" ? null : snapPrice(v.compareAtPrice, channel);
    return price === v.price && compareAtPrice === (v.compareAtPrice ?? null) ? v : { ...v, price, compareAtPrice };
  });
}
