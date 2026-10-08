import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPageBlocks, ensureGlanceCss, evidenceText, findUnsupportedClaims, htmlToText, injectPageBlocks, pickRelatedLinks, shipBlockHtml } from "../shared/pageBlocks.ts";
import { DEFAULT_STORE_PROFILES, normalizeStoreProfiles, pickStoreProfile } from "../shared/storeProfiles.ts";
import { renderImportBody } from "../shared/descLayouts.ts";
import { pageBlocksFor } from "../shared/listingFormat.ts";
import type { NormalisedProduct } from "../shared/types.ts";

const product = (o: Partial<NormalisedProduct> = {}): NormalisedProduct => ({
  numIid: "1",
  platform: "taobao",
  sourceUrl: "",
  title: "呜咚小铺原创日常百搭手提透明小食量二次元痛包女",
  priceOriginal: 10,
  currencyOriginal: "CNY",
  descHtml: "",
  images: [],
  variants: [],
  props: { 款式名称: "云朵包", 闭合方式: "拉链", 风格: "甜美淑女" },
  originCountry: "CN",
  fetchedAt: "",
  ...o,
});

const shopify = (id: string) => DEFAULT_STORE_PROFILES.find((p) => p.id === id)!;

test("the bundled store policies carry the facts read from the live stores (and never a conflicting free-shipping figure for cuteitabags)", () => {
  const key = shopify("keyartisan-net");
  assert.match(key.shipping.join(" "), /\$8 under \$50/);
  assert.match(key.returns.join(" "), /60 days/);
  const bags = shopify("cuteitabags");
  assert.match(bags.returns.join(" "), /30 calendar days/);
  // the live site contradicts itself on the free-shipping threshold ($49+ banner vs $100 policy) → no figure is promised
  assert.doesNotMatch(bags.shipping.join(" "), /\$49|\$100|free from/i);
  assert.match(bags.notes, /CONFLICT/);
  assert.equal(DEFAULT_STORE_PROFILES.filter((p) => p.kind === "etsy").length, 3);
});

test("pickStoreProfile: keyboard things → keyartisan.net, bags and everything else → cuteitabags, Etsy → first Etsy shop, an explicit choice wins", () => {
  assert.equal(pickStoreProfile(DEFAULT_STORE_PROFILES, { channel: "shopify", productText: "PBT keycap set cherry", isKeycapSet: true })?.id, "keyartisan-net");
  assert.equal(pickStoreProfile(DEFAULT_STORE_PROFILES, { channel: "shopify", productText: "Clear Window Ita Bag Handbag" })?.id, "cuteitabags");
  assert.equal(pickStoreProfile(DEFAULT_STORE_PROFILES, { channel: "shopify", productText: "plush keychain" })?.id, "cuteitabags");
  assert.equal(pickStoreProfile(DEFAULT_STORE_PROFILES, { channel: "etsy", productText: "anything" })?.kind, "etsy");
  assert.equal(pickStoreProfile(DEFAULT_STORE_PROFILES, { channel: "shopify", productText: "bag", preferId: "keyartisan-net" })?.id, "keyartisan-net");
});

test("normalizeStoreProfiles repairs junk and falls back to the defaults when nothing usable is saved", () => {
  assert.equal(normalizeStoreProfiles("nope"), DEFAULT_STORE_PROFILES);
  assert.equal(normalizeStoreProfiles([{ id: "", name: "" }]), DEFAULT_STORE_PROFILES);
  const out = normalizeStoreProfiles([{ id: "My Shop!", name: "Mine", kind: "etsy", shipping: ["a", "", "b"], links: [{ label: "x", url: "javascript:alert(1)", keywords: ["A"] }, { label: "ok", url: "https://x.com/c", keywords: ["Kw"] }] }]);
  assert.equal(out[0].id, "my-shop-");
  assert.deepEqual(out[0].shipping, ["a", "b"]);
  assert.deepEqual(out[0].links, [{ label: "ok", url: "https://x.com/c", keywords: ["kw"] }]);
});

test("the shipping block says what the policy says, escapes it, and always names the contact", () => {
  const html = shipBlockHtml({ ...shopify("keyartisan-net"), returns: ["Returns <b>60</b> days"] });
  assert.match(html, /data-ps="ship"/);
  assert.match(html, /Returns &lt;b&gt;60&lt;\/b&gt; days/);
  assert.match(html, /mailto:hello@keyartisan\.net/);
  assert.match(html, /Processing &amp; delivery/);
});

test("related links: only the store's own collections whose keywords appear in the product text, best first", () => {
  const bags = shopify("cuteitabags");
  const got = pickRelatedLinks(bags, "Clear Window Ita Bag Handbag mini pastel blue", 3).map((l) => l.label);
  assert.ok(got.includes("Clear window ita bags"));
  assert.ok(got.length <= 3);
  assert.deepEqual(pickRelatedLinks(bags, "completely unrelated gadget"), []);
});

test("blocks go in just above the page's own call-to-action, once, and survive the renderer", () => {
  const html = '<div class="bm"><div class="bm-info"><p>x</p><div class="bm-cta"><button>Add</button></div></div></div>';
  const blocks = { ship: '<div data-ps="ship">S</div>', related: "", swatches: "" };
  const out = injectPageBlocks(html, blocks);
  assert.ok(out.indexOf('data-ps="ship"') < out.indexOf("bm-cta"));
  assert.equal(injectPageBlocks(out, blocks), out, "a page that already carries the block is left alone");
  // models often write single-quoted attributes
  const sq = injectPageBlocks("<div class='bm'><div class='bm-info'></div><div class='bm-cta'>x</div></div>", blocks);
  assert.ok(sq.indexOf('data-ps="ship"') < sq.indexOf("bm-cta"));
  assert.match(ensureGlanceCss("<div class='bm-glance'><ul></ul></div>"), /\.bm-glance\{/);
  // no CTA → end of the wrapper
  assert.match(injectPageBlocks("<div>plain</div>", blocks), /plain<div data-ps="ship">S<\/div><\/div>$/);

  const body = renderImportBody("stacked-plain", "<style>.bm{--x:1}</style><div class=\"bm\"><div class=\"bm-cta\"></div></div>", [], { blocks });
  assert.match(body, /data-ps="ship"/);
});

test("the AI's At-a-glance box gets its CSS from the system (once)", () => {
  const html = '<style>.bm{--a:1}</style><div class="bm"><div class="bm-glance"><ul><li>x</li></ul></div></div>';
  const out = ensureGlanceCss(html);
  assert.match(out, /\.bm-glance\{/);
  assert.equal(ensureGlanceCss(out), out);
  assert.equal(ensureGlanceCss("<div>nothing</div>"), "<div>nothing</div>");
});

test("claim checker: strap / care / size claims the source never made are flagged; backed-up ones are not", () => {
  const p = product();
  const evidence = evidenceText(p);
  const flagged = findUnsupportedClaims(htmlToText("<p>Wear it crossbody with the side rings. Wipe with a soft damp cloth. It measures 20 x 12 cm and fits a phone.</p>"), evidence).map((c) => c.rule);
  for (const r of ["strap", "care", "size", "capacity"]) assert.ok(flagged.includes(r), `${r} should be flagged: ${flagged}`);
  // the same words are fine when the source says so (Chinese included) or the operator wrote it
  const backed = evidenceText(p, "Has a detachable shoulder strap, 20 x 12 cm, wipe clean with a damp cloth, fits a phone");
  assert.deepEqual(findUnsupportedClaims("Wear it crossbody. Wipe with a soft damp cloth. It measures 20 x 12 cm and fits a phone.", backed), []);
  assert.deepEqual(findUnsupportedClaims("Comes with a 肩带 strap.", evidenceText(product({ props: { 配件: "肩带" } }))), []);
  // shipping promises and data-speak are always defects
  const policy = findUnsupportedClaims("Free shipping and 30-day returns. The supplied product details do not say.", evidence).map((c) => c.rule);
  assert.ok(policy.includes("policy") && policy.includes("datalang"));
});

test("pageBlocksFor builds the verified blocks from the saved profile; option thumbnails need ≥2 variants with a picture", () => {
  const p = product({
    images: [
      { url: "/api/media/a.png", role: "variant", srcUrl: "https://img.alicdn.com/a.jpg" },
      { url: "/api/media/b.png", role: "variant", srcUrl: "https://img.alicdn.com/b.jpg" },
    ],
    variants: [
      { name: "白色", nameTranslated: "White", price: 1, imageUrl: "/api/media/a.png" },
      { name: "黑色", nameTranslated: "Black", price: 1, imageUrl: "/api/media/b.png" },
    ],
  });
  const blocks = pageBlocksFor(p, { fields: [{ key: "title", value: "Clear Window Ita Bag" }] }, DEFAULT_STORE_PROFILES)!;
  assert.match(blocks.ship, /Shipping &amp; Returns/);
  assert.match(blocks.swatches, /data-ps="swatches"/);
  assert.match(blocks.swatches, /https:\/\/img\.alicdn\.com\/a\.jpg/, "a locally edited picture falls back to its public source for the placeholder");
  assert.match(blocks.related, /Clear window ita bags/);
  const one = pageBlocksFor({ ...p, variants: [p.variants[0]] }, null, DEFAULT_STORE_PROFILES)!;
  assert.equal(one.swatches, "");
  assert.equal(pageBlocksFor(p, null, []), undefined);
  const noProfile = buildPageBlocks({ product: p, variantImageUrl: () => null });
  assert.equal(noProfile.ship, "");
});

test("description pictures: nothing opens, no 'Tap to zoom', no zoom on hover — only a small brightness lift", () => {
  // a page stored before this rule: zoom cursor + zoom tag + lightbox node + zoom hooks, as the old template produced
  const old =
    "<style>.bm{--ink:#222}.bm-media img{cursor:zoom-in}.bm-media img:hover{transform:scale(1.2)}.bm-lightbox{display:none}.bm-reveal{opacity:1}</style>" +
    '<div class="bm"><div class="bm-grid"><div class="bm-media"><div class="bm-stage" data-bm-zoom><img src="x" data-bm-zoom><span class="bm-zoomtag">🔍 Tap to zoom</span></div></div>' +
    '<div class="bm-c2"><div class="bm-cta"><button data-bm-goto-atc>Add</button></div></div></div>' +
    '<div class="bm-lightbox" data-bm-lightbox><button class="bm-close" data-bm-close>✕</button><img src="" data-bm-lightbox-img></div></div>';
  const out = renderImportBody("stacked-plain", old, [{ url: "https://img.example.com/a.jpg", alt: "a" }, { url: "https://img.example.com/b.jpg", alt: "b" }]);
  assert.doesNotMatch(out, /Tap to zoom/);
  assert.doesNotMatch(out, /<div[^>]*data-bm-lightbox/);
  assert.doesNotMatch(out, /<span[^>]*bm-zoomtag/);
  assert.doesNotMatch(out, / data-bm-zoom/);
  assert.doesNotMatch(out, /data-bm-lightbox-img/);
  assert.match(out, /<img src="https:\/\/img\.example\.com\/a\.jpg"/, "the pictures are still there");
  const flat = out.replace(/\s+/g, "");
  assert.match(flat, /\.bm-mediaimg:hover,\.pd-mediaimg:hover\{transform:none!important;filter:brightness\(1\.06\)!important\}/);
  assert.match(flat, /\.bm-mediaimg,\.bm-media\.bm-stage,\.pd-mediaimg\{cursor:default!important\}/);
  assert.match(flat, /\.bm-zoomtag,\.bm-lightbox,\[data-bm-lightbox\]\{display:none!important\}/);
  // the runtime no longer opens anything
  assert.doesNotMatch(out, /data-bm-zoom\]|bm-lightbox\.is-open/);
});
