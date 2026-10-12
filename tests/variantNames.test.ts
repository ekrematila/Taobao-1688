import { test } from "node:test";
import assert from "node:assert/strict";
import { detectVariantNames, finalizeNames, ruleBasedVariantName, shortenVariantName, uniqueNames } from "../shared/variantNames.ts";
import type { ProductVariant } from "../shared/types.ts";

test("keycap option labels read through the glossary, no AI", () => {
  const cases: [string, string][] = [
    ["粉色", "Pink"],
    ["颜色分类:薄荷绿", "Mint Green"],
    ["基础套装", "Base Kit"],
    ["粉色 / 基础套装", "Pink / Base Kit"],
    ["【现货】白色", "White"],
    ["个性化套装", "Novelty Kit"],
    ["空格键", "Spacebar"],
    ["104键", "104 Keys"],
    ["原厂高度 全套", "Cherry Profile Full Set"],
    ["套餐三", "Bundle 3"],
    ["套餐一", "Bundle 1"],
    ["官方标配", "Standard Kit"],
  ];
  for (const [src, want] of cases) {
    const r = ruleBasedVariantName(src);
    assert.equal(r.text, want, src);
    assert.ok(r.complete, `${src} is fully understood`);
  }
});

test("a label the glossary cannot read is flagged so machine translation can take it", () => {
  const r = ruleBasedVariantName("星空限定");
  assert.equal(r.complete, false);
  assert.ok(!/[㐀-鿿]/.test(r.text), "no Chinese characters ever stay in a name");
});

test("names are cut at a word boundary, never mid-word, and fit the limit", () => {
  const long = "Mint Green Base Kit Extended Edition Series";
  const s = shortenVariantName(long, 20);
  assert.ok(s.length <= 20, s);
  assert.ok(long.startsWith(s.replace(/\s*\/\s*/g, " ").slice(0, 4)), s);
  assert.equal(shortenVariantName("Pink", 20), "Pink");
  assert.ok(!/\s$/.test(shortenVariantName("Strawberry Milk Base Kit", 14)));
});

test("duplicates get a number and stay within the limit; an empty name becomes Option N", () => {
  assert.deepEqual(uniqueNames(["Pink", "Pink", "Blue", "pink"], 20), ["Pink", "Pink 2", "Blue", "pink 3"]);
  assert.deepEqual(finalizeNames(["Pink", "", "星空"], 20), ["Pink", "Option 2", "Option 3"]);
  const u = uniqueNames(["Mint Green Base Kit", "Mint Green Base Kit"], 19);
  assert.ok(u.every((n) => n.length <= 19), u.join("|"));
});

test("a product with one default variant but several colours in its attributes gets those variants", () => {
  const def: ProductVariant[] = [{ name: "Varsayılan", price: 10 }];
  assert.deepEqual(detectVariantNames({ "颜色分类": "粉色、蓝色、白色" }, def), ["粉色", "蓝色", "白色"]);
  assert.deepEqual(detectVariantNames({ "颜色分类": "粉色" }, def), [], "one value is not a choice");
  assert.deepEqual(detectVariantNames({ "品牌": "A、B" }, def), [], "only option-like attributes count");
  const real: ProductVariant[] = [{ name: "粉色", price: 10 }, { name: "蓝色", price: 10 }];
  assert.deepEqual(detectVariantNames({ "颜色分类": "粉色、蓝色、白色" }, real), [], "real SKUs are never replaced");
});
