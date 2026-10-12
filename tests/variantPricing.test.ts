import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAutoPrices, channelPrice, endAt, pricedForChannel, snapPrice, unpricedCount } from "../shared/variantPricing.ts";
import { outputVariants } from "../shared/listingFormat.ts";
import type { ProductVariant } from "../shared/types.ts";

const V = (name: string, price: number | null, extra: Partial<ProductVariant> = {}): ProductVariant => ({ name, price, ...extra });

test("¥100 → Etsy $109.99, Shopify was $109.90 now $76.90", () => {
  assert.deepEqual(channelPrice(100, "etsy"), { price: 109.99, compareAt: null });
  assert.deepEqual(channelPrice(100, "shopify"), { price: 76.9, compareAt: 109.9 });
});

test("every Etsy price ends in .99 and every Shopify price in .90, whatever the yuan price", () => {
  for (const cny of [1, 7.5, 18, 33.3, 59, 100, 209, 349.9, 1200]) {
    const e = channelPrice(cny, "etsy")!;
    assert.equal(Math.round((e.price % 1) * 100), 99, `etsy ${cny} → ${e.price}`);
    const s = channelPrice(cny, "shopify")!;
    assert.equal(Math.round((s.price % 1) * 100), 90, `shopify ${cny} → ${s.price}`);
    if (s.compareAt != null) {
      assert.equal(Math.round((s.compareAt % 1) * 100), 90);
      assert.ok(s.compareAt > s.price, "the was-price is higher than the sale price");
    }
  }
});

test("endAt snaps to the nearest price with that ending and never goes below it", () => {
  assert.equal(endAt(110, 0.99), 109.99);
  assert.equal(endAt(76.93, 0.9), 76.9);
  assert.equal(endAt(0.2, 0.99), 0.99);
  assert.equal(endAt(0, 0.99), null);
  assert.equal(endAt(NaN, 0.99), null);
  assert.equal(snapPrice(120, "etsy"), 119.99);
  assert.equal(snapPrice(null, "etsy"), null);
});

test("Etsy: ONE price for all variants, from the cheapest by default; the yuan source is kept", () => {
  const { variants, info } = applyAutoPrices([V("A", 100), V("B", 100), V("C", 150)], "etsy");
  assert.deepEqual(variants.map((v) => v.price), [109.99, 109.99, 109.99]);
  assert.deepEqual(variants.map((v) => v.priceCny), [100, 100, 150]);
  assert.ok(variants.every((v) => v.compareAtPrice == null && v.pricedFor === "etsy"));
  assert.equal(info.differs, true);
  const hi = applyAutoPrices([V("A", 100), V("C", 150)], "etsy", { etsyBase: "max" }).variants;
  assert.deepEqual(hi.map((v) => v.price), [164.99, 164.99]);
});

test("Shopify: each variant gets its own compare-at + sale price", () => {
  const { variants } = applyAutoPrices([V("A", 100), V("B", 200)], "shopify");
  assert.deepEqual(variants.map((v) => [v.compareAtPrice, v.price]), [[109.9, 76.9], [219.9, 153.9]]);
});

test("pricing twice never compounds (the yuan source, not the dollar price, is the base)", () => {
  const once = applyAutoPrices([V("A", 100)], "shopify").variants;
  const twice = applyAutoPrices(once, "shopify").variants;
  assert.deepEqual(twice, once);
  const toEtsy = applyAutoPrices(once, "etsy").variants;
  assert.equal(toEtsy[0].price, 109.99);
  assert.equal(toEtsy[0].priceCny, 100);
});

test("a hand-typed dollar price is never mistaken for yuan", () => {
  const typed = V("A", 80, { pricedFor: "manual" });
  const r = applyAutoPrices([typed], "shopify", { fallbackCny: null }).variants;
  assert.equal(r[0].price, 80, "nothing to compute from → left alone");
  const withFallback = applyAutoPrices([typed], "etsy", { fallbackCny: 100 }).variants;
  assert.equal(withFallback[0].price, 109.99);
});

test("a variant without a price falls back to the product price", () => {
  const r = applyAutoPrices([V("A", null)], "etsy", { fallbackCny: 100 }).variants;
  assert.equal(r[0].price, 109.99);
});

test("unpricedCount: raw imports count, auto-priced and hand-priced do not", () => {
  const vs = [V("raw", 209), V("auto", 109.99, { pricedFor: "etsy", priceCny: 100 }), V("hand", 50, { pricedFor: "manual" }), V("other", 76.9, { pricedFor: "shopify", priceCny: 100 })];
  assert.equal(unpricedCount(vs, "etsy"), 2); // raw + the one priced for Shopify
  assert.equal(unpricedCount(vs, "shopify"), 2);
});

test("a set priced for the other channel leaves the app re-priced for this one", () => {
  const forShopify = applyAutoPrices([V("A", 100), V("B", 100)], "shopify").variants;
  const out = pricedForChannel(forShopify, "etsy");
  assert.deepEqual(out.map((v) => [v.price, v.compareAtPrice]), [[109.99, null], [109.99, null]]);
  assert.equal(pricedForChannel(forShopify, "shopify"), forShopify, "nothing to do for the same channel");
});

test("a hand-typed price keeps its value but takes the channel's ending on the way out", () => {
  const out = pricedForChannel([V("A", 120, { pricedFor: "manual", compareAtPrice: 150 })], "shopify");
  assert.deepEqual([out[0].price, out[0].compareAtPrice], [119.9, 149.9]);
});

test("outputVariants: Etsy has no compare-at, one price; names fit 20 chars and stay unique", () => {
  const vs = [
    V("Pink Base Kit Extended Edition Very Long", 76.9, { nameTranslated: "Pink Base Kit Extended Edition Very Long", pricedFor: "shopify", priceCny: 100, compareAtPrice: 109.9 }),
    V("Pink Base Kit Extended Special", 76.9, { nameTranslated: "Pink Base Kit Extended Special", pricedFor: "shopify", priceCny: 100, compareAtPrice: 109.9 }),
  ];
  const out = outputVariants({ variants: vs }, { variants: [], channel: "etsy" });
  assert.ok(out.every((v) => v.price === 109.99 && v.compareAtPrice == null));
  assert.ok(out.every((v) => v.nameTranslated!.length <= 20), out.map((v) => v.nameTranslated).join("|"));
  assert.equal(new Set(out.map((v) => v.nameTranslated!.toLowerCase())).size, 2, "no duplicate option values");
  const shop = outputVariants({ variants: vs }, { variants: [], channel: "shopify" });
  assert.deepEqual(shop.map((v) => [v.compareAtPrice, v.price]), [[109.9, 76.9], [109.9, 76.9]]);
});
