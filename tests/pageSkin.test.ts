import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPageSkin, buildPageSkinCss, contrast, luminance, parseHex, readBmVars, skinInputFrom } from "../shared/pageSkin.ts";
import { injectPageBlocks, keycapCountOf, layoutsFor, layoutsSectionHtml } from "../shared/pageBlocks.ts";
import { renderImportBody } from "../shared/descLayouts.ts";
import { pageBlocksFor } from "../shared/listingFormat.ts";
import { DEFAULT_STORE_PROFILES } from "../shared/storeProfiles.ts";
import type { NormalisedProduct } from "../shared/types.ts";

const PAGE = (extra = "") =>
  `<style>.bm{--ink:#2f4f4a;--head:#2f4f4a;--gold:#4aa88c;--gold2:#bfe6d8;--lav:#eef8f4;--fh:'Fredoka';--fb:'Nunito';${extra}--acc-rgb:74,168,140}</style><div class="bm"><div class="bm-cta"><button data-bm-goto-atc>x</button></div></div>`;

test("readBmVars / skinInputFrom read the model's palette, fonts and characters", () => {
  const v = readBmVars(PAGE("--deco:'🐻 ☃️ 🔥 🍵';--fall:'❄ ❅ ❆';--mood:cute;"));
  assert.equal(v["gold"], "#4aa88c");
  const k = skinInputFrom(PAGE("--deco:'🐻 ☃️ 🔥 🍵';--fall:'❄ ❅ ❆';--mood:cute;"))!;
  assert.deepEqual(k.deco, ["🐻", "☃️", "🔥", "🍵"]);
  assert.deepEqual(k.fall, ["❄", "❅", "❆"]);
  assert.equal(k.mood, "cute");
  assert.equal(k.fh, "Fredoka");
  assert.equal(skinInputFrom("<div>no card</div>"), null);
  assert.equal(skinInputFrom('<style>.bm{--x:1}</style><div class="bm"></div>'), null, "no usable palette → the store theme is left alone");
});

test("the skin themes the WHOLE page: announcement bar, header, title/price, Add to Cart, footer — all scoped to this product's page", () => {
  const css = buildPageSkinCss(PAGE("--deco:'🐻 ☃️';--fall:'❄ ❅';"));
  assert.match(css, /data-ps-skin/);
  for (const sel of ["announcement-bar", "sticky-header-mobile", ".productView-title", "#product-add-to-cart", "footer.footer .footer__content-top", "shopify-payment-button__button--unbranded"])
    assert.ok(css.includes(sel), sel);
  // nothing outside a page that carries the card
  const unscoped = css.replace(/<\/?style[^>]*>/g, "").split("\n").filter((l) => /\{/.test(l) && !/^@(keyframes|media)/.test(l) && !l.startsWith("body:has(.bm)") && !l.startsWith("@"));
  assert.deepEqual(unscoped, [], "every top-level rule is scoped with body:has(.bm)");
  assert.match(css, /'Fredoka',-apple-system/);
  assert.match(css, /content:"🐻  ☃️  🐻/, "characters become the footer strip");
  assert.match(css, /@keyframes skFall/);
  assert.match(css, /@media \(max-width:749px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("readable by construction: button text and footer text always contrast with their background", () => {
  for (const gold of ["#4aa88c", "#f5d76e", "#1a2b6e", "#e84393", "#ffffff"]) {
    const css = buildPageSkinCss(PAGE().replace("#4aa88c", gold));
    const onAcc = css.match(/--sk-on-acc:(#[0-9a-f]{6})/)![1];
    assert.ok(contrast(parseHex(onAcc)!, parseHex(gold)!) >= 3, `button text on ${gold}`);
    const deep = css.match(/--sk-deep:(#[0-9a-f]{6})/)![1];
    assert.ok(luminance(parseHex(deep)!) < 0.2, `footer ground is deep for ${gold}`);
  }
});

test("falling characters only when the model asked for them; without characters there is no strip", () => {
  const plain = buildPageSkinCss(PAGE());
  assert.doesNotMatch(plain, /body:has\(\.bm\)::before/);
  assert.doesNotMatch(plain, /footer\.footer::before/);
  const fall = buildPageSkinCss(PAGE("--fall:'♡ ✿';"));
  assert.match(fall, /body:has\(\.bm\)::before,body:has\(\.bm\)::after\{content:/);
});

test("model-supplied characters cannot break out of the stylesheet", () => {
  const css = buildPageSkinCss(PAGE("--deco:'🐻\";}body{display:none}/*';"));
  assert.doesNotMatch(css, /display:none\}\/\*/);
  assert.doesNotMatch(css, /body\{display:none/);
});

test("applyPageSkin adds the skin once, and the renderer lets the operator switch it off", () => {
  const once = applyPageSkin(PAGE());
  assert.equal((once.match(/data-ps-skin/g) || []).length, 1);
  assert.equal(applyPageSkin(once), once);
  const on = renderImportBody("stacked-plain", PAGE(), []);
  assert.match(on, /data-ps-skin/);
  const off = renderImportBody("stacked-plain", PAGE(), [], { skin: false });
  assert.doesNotMatch(off, /data-ps-skin/);
});

const product = (props: Record<string, string>, title = "x"): NormalisedProduct => ({
  numIid: "1", platform: "taobao", sourceUrl: "", title, priceOriginal: 1, currencyOriginal: "CNY", descHtml: "", images: [], variants: [], props, originCountry: "CN", fetchedAt: "",
});

test("compatible layouts: 130+ pieces list EVERY standard layout (more than 8), smaller kits only what they cover", () => {
  assert.equal(keycapCountOf(product({ 颗数: "140" })), 140);
  assert.equal(keycapCountOf(product({}, "Cute 138 keys keycap set")), 138);
  assert.equal(keycapCountOf(product({}, "no count here")), null);
  const big = layoutsFor(140).map((l) => l.label);
  assert.ok(big.length > 8, big.join(","));
  for (const need of ["60%", "65%", "75%", "TKL", "96%", "100%", "Alice", "HHKB", "40%"]) assert.ok(big.includes(need), need);
  const mid = layoutsFor(110).map((l) => l.label);
  assert.ok(mid.includes("100%") && !mid.includes("Alice") && !mid.includes("40%"), mid.join(","));
  assert.deepEqual(layoutsFor(87).map((l) => l.label), ["60%", "65%", "75%", "TKL"]);
  const html = layoutsSectionHtml(140);
  assert.match(html, /<h3>Compatible Layouts<\/h3>/);
  assert.match(html, /examples for reference only, not endorsements/);
  assert.match(html, /Keychron Q8/);
  assert.doesNotMatch(html, /oriented/i);
  assert.equal(layoutsSectionHtml(null), "");
});

test("the complete layouts section replaces the model's own (or is added before Specifications), once", () => {
  const sec = layoutsSectionHtml(140);
  const own = '<div class="bm-info"><h3>Highlights</h3><ul></ul><h3>Compatible Layouts</h3><div class="bm-layouts"><span>TKL</span></div><p class="bm-layouts-note">long paragraph</p><h3>Specifications</h3><div class="bm-spec"></div></div>';
  const out = injectPageBlocks(own, { layouts: sec });
  assert.match(out, /data-ps="layouts"/);
  assert.doesNotMatch(out, /long paragraph/);
  assert.match(out, /<h3>Specifications<\/h3>/);
  assert.equal(injectPageBlocks(out, { layouts: sec }), out);
  const none = injectPageBlocks('<div class="bm-info"><h3>Highlights</h3><h3>Specifications</h3></div>', { layouts: sec });
  assert.ok(none.indexOf('data-ps="layouts"') < none.indexOf("Specifications"));
});

test("pageBlocksFor builds the layouts section for keycap sets only", () => {
  const kc = { ...product({ 键帽材质: "PBT", 颗数: "140", 品牌: "糖包" }, "键帽 keycap set"), titleTranslated: "Winter Keycap Set" };
  assert.match(pageBlocksFor(kc, null, DEFAULT_STORE_PROFILES)!.layouts, /Alice/);
  const bag = { ...product({ 款式名称: "云朵包" }, "Ita bag"), titleTranslated: "Clear Window Ita Bag" };
  assert.equal(pageBlocksFor(bag, null, DEFAULT_STORE_PROFILES)!.layouts, "");
});
