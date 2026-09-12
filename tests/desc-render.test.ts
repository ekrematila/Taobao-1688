import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDescriptionHtml, renderImportBody } from "../shared/descLayouts.ts";
import { STACKED_DESC_EXAMPLE, OTHER_DESC_EXAMPLE } from "../shared/exampleData.ts";

const imgs = [
  { url: "https://cdn.test/a.jpg", alt: "a" },
  { url: "https://cdn.test/b.jpg", alt: "b" },
  { url: "https://cdn.test/c.jpg", alt: "c" },
];

test("the .bm example keeps its full body (a <script> token in a CSS comment must not eat it)", () => {
  const out = renderDescriptionHtml("stacked-plain", STACKED_DESC_EXAMPLE, imgs);
  // the rendered block is never shorter than the raw example minus a little trim
  assert.ok(out.length > STACKED_DESC_EXAMPLE.length * 0.9, `too short: ${out.length}`);
  assert.ok(out.includes("Compatible Layouts"));
  assert.ok(out.includes("Specifications"));
  assert.ok(/<div class="bm-cta">/.test(out));
});

test("the .bm block gets BM_SCRIPT (not PD_SCRIPT) and its CTA hook", () => {
  const out = renderDescriptionHtml("stacked-plain", STACKED_DESC_EXAMPLE, imgs);
  assert.ok(out.includes("__bmInit"), "BM_SCRIPT present");
  assert.ok(!out.includes("__pdInit"), "PD_SCRIPT must NOT be added to a .bm block");
  assert.ok(out.includes("data-bm-goto-atc"), "CTA hook present");
  assert.equal((out.match(/<script/g) || []).length, 1, "exactly one script tag");
});

test("the .pd example gets PD_SCRIPT and native <details> FAQ", () => {
  const out = renderDescriptionHtml("grid-2", OTHER_DESC_EXAMPLE, imgs);
  assert.ok(out.includes("__pdInit"), "PD_SCRIPT present");
  assert.ok(!out.includes("__bmInit"), "BM_SCRIPT must NOT be added to a .pd block");
  assert.ok(/<details class="pd-faq-item"/.test(out), "FAQ is native <details>");
});

test("both examples use a native <details> FAQ and an inline-onclick CTA (survives <script> stripping)", () => {
  for (const [layout, ex] of [
    ["stacked-plain", STACKED_DESC_EXAMPLE],
    ["grid-2", OTHER_DESC_EXAMPLE],
  ] as const) {
    const out = renderDescriptionHtml(layout, ex, imgs);
    assert.equal((out.match(/<details class="(?:bm|pd)-faq-item"/g) || []).length, 6);
    assert.equal((out.match(/faq-item"[^>]* open>/g) || []).length, 1, "first FAQ item open");
    assert.equal((out.match(/<details class="(?:bm|pd)-faq-item"[^>]*name="(?:bm|pd)-faq"/g) || []).length, 6, "details use name= for native single-open");
    assert.ok(/data-(?:bm|pd)-goto-atc onclick="/.test(out), "CTA carries an inline onclick fallback");
    assert.ok(!/<button[^>]*class="[^"]*faq-q/.test(out), "no legacy <button> FAQ toggle");
  }
});

test("the Add-to-Cart finder never targets a Shop Pay / dynamic-checkout button", () => {
  for (const [layout, ex] of [
    ["stacked-plain", STACKED_DESC_EXAMPLE],
    ["grid-2", OTHER_DESC_EXAMPLE],
  ] as const) {
    const out = renderDescriptionHtml(layout, ex, imgs);
    // it must exclude .shopify-payment-button, and must NOT fall back to targeting it
    assert.ok(out.includes("closest('.shopify-payment-button')"), "excludes the payment-button subtree");
    assert.ok(
      !/querySelector\(\s*'\.shopify-payment-button/.test(out),
      "never selects .shopify-payment-button(__button) as a target",
    );
    assert.ok(/indexOf\('buy now'\)|indexOf\("buy now"\)/i.test(out), "filters out 'Buy now' by text");
    // the delegated script and the inline onclick both carry the finder
    assert.ok(out.includes("function findAtc()"), "delegated findAtc present");
    assert.ok(/data-(?:bm|pd)-goto-atc onclick="\(function\(\)\{function bad\(/.test(out), "inline onclick carries the same filter");
  }
});

test("a model-authored onclick with broken syntax is replaced, not trusted", () => {
  // Reproduces a real failure: Claude sometimes writes its own shorter CTA
  // onclick instead of copying the example's verbatim, and drops the `()`
  // after `function` (`function{` instead of `function(){}`) — a silent
  // syntax error that makes the browser refuse to parse the attribute at
  // all, so clicking Add to Cart does literally nothing and nothing is ever
  // logged. The system must force its own known-valid onclick regardless of
  // what the model wrote.
  const broken = STACKED_DESC_EXAMPLE.replace(
    /onclick="[^"]*"/,
    // deliberately malformed: `function{` three times, `glow;` (not called),
    // and no trailing `()` invoking the outer IIFE.
    `onclick="(function{var atc=document.querySelector('button[name=add]');if(!atc)return;var glow=function{atc.classList.add('bm-atc-glow');};setTimeout(function{glow;},650);})"`,
  );
  for (const [layout, ex] of [
    ["stacked-plain", broken],
    ["grid-2", OTHER_DESC_EXAMPLE.replace(/onclick="[^"]*"/, `onclick="(function{return true;})"`)],
  ] as const) {
    const out = renderDescriptionHtml(layout, ex, imgs);
    const m = out.match(/data-(?:bm|pd)-goto-atc onclick="([^"]*)"/);
    assert.ok(m, "CTA still carries an onclick attribute");
    // must NOT contain the broken `function{` pattern — the forced replacement won
    assert.ok(!/function\{/.test(m![1]), "broken function{ syntax was not carried through");
    // the forced-in onclick must be syntactically valid JavaScript
    assert.doesNotThrow(() => new Function(m![1]), "forced onclick parses as valid JS");
    assert.ok(m![1].includes("findAtc") || m![1].includes("function bad("), "carries the real ban-list finder, not the model's broken one");
  }
});

test("FAQ open/close has a timeout fallback so it can never get stuck (transitionend not guaranteed to fire)", () => {
  for (const [layout, ex] of [
    ["stacked-plain", STACKED_DESC_EXAMPLE],
    ["grid-2", OTHER_DESC_EXAMPLE],
  ] as const) {
    const out = renderDescriptionHtml(layout, ex, imgs);
    const js = (out.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
    // relying SOLELY on transitionend is exactly the bug that left a FAQ item
    // stuck open/closed forever if the transition never actually ran — every
    // open/close path needs a setTimeout fallback that finishes the state
    // change regardless of whether the CSS transition fired.
    assert.equal((js.match(/setTimeout\(finish,\s*450\)/g) || []).length, 2, "both closeFaq and openFaq have a timeout fallback");
  }
});

test("the Add-to-Cart glow colour is synced from the product's own accent, not hardcoded", () => {
  for (const [layout, ex] of [
    ["stacked-plain", STACKED_DESC_EXAMPLE],
    ["grid-2", OTHER_DESC_EXAMPLE],
  ] as const) {
    const out = renderDescriptionHtml(layout, ex, imgs);
    const js = (out.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
    assert.ok(js.includes("function syncAccentColor()"), "accent-sync function present");
    assert.ok(/syncAccentColor\(\);\s*\n/.test(js) || js.includes("syncAccentColor();"), "accent-sync is actually called at load");
    assert.ok(out.includes("rgba(var(--acc-rgb,63,140,217)"), "glow keyframe reads the synced accent variable, not a bare literal");
  }
});

test("Specifications always gets a bordered/hoverable card, even if the model shipped bare rows", () => {
  // Reproduces a real complaint: the model sometimes drops the .bm-spec card
  // look entirely (no border, no background, no row hover) and ships plain
  // unstyled text rows instead. The card look must be forced regardless.
  const bare = STACKED_DESC_EXAMPLE.replace(
    /\.bm-spec\{[^}]*\}/,
    ".bm-spec{display:block}", // model "forgot" the border/background/radius
  );
  const out = renderDescriptionHtml("stacked-plain", bare, imgs);
  const flat = out.replace(/\s+/g, "");
  assert.ok(/\.bm-spec\{[^}]*border:1pxsolid/.test(flat), "spec card border is forced");
  assert.ok(/\.bm-spec\{[^}]*background:var\(--milk/.test(flat), "spec card background is forced");
  assert.ok(/\.bm-spec\.bm-r:hover\{background:var\(--sky/.test(flat), "spec row hover is forced");
});

test("Specifications group sub-headers get a real pill style, even with no CSS for .bm-sub at all", () => {
  // Reproduces a real complaint: the model wrote grouped <span class="bm-sub">
  // markup but never gave it any CSS, so it rendered as bare unstyled text
  // breaking up the card instead of a proper section header.
  const noSubCss = STACKED_DESC_EXAMPLE.replace(/\.bm-spec \.bm-sub\{[^}]*\}/g, "");
  const out = renderDescriptionHtml("stacked-plain", noSubCss, imgs);
  const flat = out.replace(/\s+/g, "");
  assert.ok(/\.bm-spec\.bm-sub\{[^}]*background:var\(--sky/.test(flat), "sub-header pill background is forced");
  assert.ok(/\.bm-spec\.bm-sub\{[^}]*text-transform:uppercase/.test(flat), "sub-header label styling is forced");
});

test("FAQ questions always carry a visible +/- indicator, even if the model's own icon markup fails", () => {
  const out = renderDescriptionHtml("stacked-plain", STACKED_DESC_EXAMPLE, imgs);
  const flat = out.replace(/\s+/g, "");
  assert.ok(/summary\.bm-faq-q::after,summary\.pd-faq-q::after\{content:"\+"/.test(flat), "closed state shows +");
  assert.ok(
    /details\.bm-faq-item\[open\]>summary\.bm-faq-q::after,details\.pd-faq-item\[open\]>summary\.pd-faq-q::after\{content:"\\2212"/.test(flat),
    "open state shows the minus sign",
  );
});

test("badge hover never uses transform/box-shadow (the row scrolls horizontally and would clip it)", () => {
  const out = renderDescriptionHtml("stacked-plain", STACKED_DESC_EXAMPLE, imgs);
  const m = out.match(/\.bm-badges span:hover\{[^}]*\}/);
  assert.ok(m, "badge hover rule present");
  assert.ok(!/transform|box-shadow/.test(m![0]), "no transform/box-shadow on badge hover");
  assert.ok(/flex-wrap:nowrap/.test(out.replace(/\s+/g, "")), "badge row never wraps to a 2nd line");
});

test("the readable render keeps the CSS/JS parseable and the import render is one line", () => {
  for (const [layout, ex] of [
    ["stacked-plain", STACKED_DESC_EXAMPLE],
    ["grid-2", OTHER_DESC_EXAMPLE],
  ] as const) {
    const pretty = renderDescriptionHtml(layout, ex, imgs);
    const oneLine = renderImportBody(layout, ex, imgs);
    assert.ok(pretty.split("\n").length > 50, "preview render is multi-line / readable");
    assert.equal(oneLine.split("\n").length, 1, "import render is exactly one physical line");
    for (const src of [pretty, oneLine]) {
      const js = (src.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
      assert.doesNotThrow(() => new Function(js), "embedded script parses");
    }
  }
});

test("v4 layout + glow + palette + Enter-word rules hold in the .bm render", () => {
  const out = renderDescriptionHtml("stacked-plain", STACKED_DESC_EXAMPLE, imgs);
  const flat = out.replace(/\s+/g, "");
  // desktop: images left / text right; mobile: images first
  assert.ok(/\.bm\.bm-media\{grid-column:1!important/.test(flat), "media locked to column 1");
  assert.ok(/\.bm\.bm-c2\{grid-column:2!important/.test(flat), "text locked to column 2");
  assert.ok(/max-width:899px\)\{[\s\S]*?\.bm\.bm-media\{grid-column:1!important;grid-row:1!important/.test(flat), "mobile: images first");
  // glow: box-shadow + scale only, never a shape property
  assert.ok(!/\.(?:bm|pd)-atc-glow\{[^}]*(?:border-radius|padding|width|height|font-size|background)/.test(flat), "glow never changes the button shape");
  assert.ok(/@keyframes\s+bmAtcGlow/.test(out) && !out.includes("tpsAtcGlow"), "single glow keyframe");
  // palette: no leftover amber literals, accent var is present
  assert.ok(!/#7a5a12|#c98a1f|#fff3d6|rgba\(201,138,31/.test(out), "no hardcoded amber theme left");
  // no 'Enter key' / 'Enter keycap' / bare ' Enter '
  assert.ok(!/Enter key|Enter keycap| Enter /.test(out), "no 'Enter' wording");
  // real keyboard examples per size
  assert.equal((out.match(/class="bm-eg"/g) || []).length, 6, "3-keyboard examples for each of 6 sizes");
  // FAQ single-open + JS height animation
  assert.ok(out.includes("function openFaq") && out.includes("function closeFaq"), "FAQ height animation script");
});

test("no country-flag emoji and no literal 'ISO Enter' phrase in the examples", () => {
  for (const [layout, ex] of [
    ["stacked-plain", STACKED_DESC_EXAMPLE],
    ["grid-2", OTHER_DESC_EXAMPLE],
  ] as const) {
    const out = renderDescriptionHtml(layout, ex, imgs);
    assert.ok(!/[\uD83C][\uDDE6-\uDDFF]/.test(out), "no regional-indicator flag emoji");
    assert.ok(!/ISO Enter\b/.test(out), "phrase 'ISO Enter' avoided");
  }
});
