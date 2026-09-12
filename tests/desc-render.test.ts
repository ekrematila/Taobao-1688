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

test("the bare-text fallback card's mobile 'Product Details' panel is never permanently empty", () => {
  // Reproduces a real bug: when the model writes only plain semantic HTML
  // (no <style> block), renderDescBody falls back to renderBmSticky(), which
  // used to gate the whole content panel behind a checkbox + a
  // grid-template-rows:0fr→1fr CSS animation trick on mobile. On at least
  // some real mobile browsers that never applied the 1fr state — tapping the
  // "Product Details" bar did nothing, and the panel stayed permanently
  // empty (0-height, opacity:0), with no way to ever see the content.
  const plainHtml =
    "<p>A genuinely great product with several standout features that make it worth buying today.</p>" +
    "<ul><li>Feature one really shines here</li><li>Feature two also works great</li></ul>";
  const out = renderDescriptionHtml("stacked-plain", plainHtml, imgs);
  // uses the native <details> disclosure now, not a checkbox
  assert.ok(!/class="bm-toggle"/.test(out), "no more checkbox-driven toggle");
  assert.ok(/<details class="bm-acc" open>/.test(out), "fallback panel is a native <details>, open by default");
  assert.ok(/<summary class="bm-bar">/.test(out), "the tap target is a real <summary>");
  // content must never be zero-height/invisible by default (no JS/CSS gate to fail)
  const flat = out.replace(/\s+/g, "");
  assert.ok(!/grid-template-rows:0fr[;}]/.test(flat), "no more 0fr-collapsed panel that can get stuck");
  assert.ok(out.includes("Specifications"), "real content is present in the output");
});

test("the main .bm example's mobile 'Product Details' panel is a real, working native <details> toggle", () => {
  // The BIGGER version of the earlier bug: the golden reference example
  // itself (what the model is told to copy near-verbatim into every real
  // generation, not just the rare bare-text fallback) used to ship a
  // checkbox + grid-template-rows:0fr->1fr mobile collapse trick, gating the
  // ENTIRE info panel (hero, highlights, specs, FAQ, CTA) behind it. That
  // trick could silently fail to reach 1fr on a real mobile browser, leaving
  // the panel permanently collapsed and empty with no way to open it —
  // exactly what a user screenshot showed. It's now a native
  // <details class="bm-acc" open>/<summary class="bm-bar"> disclosure, which
  // needs no CSS to show/hide correctly — the browser handles that itself.
  // The one remaining gap: the summary bar is hidden on desktop (mobile-only
  // affordance), so if the model ever wrote the <details> WITHOUT `open`, a
  // desktop shopper would have no bar to click and see nothing. Guarantee
  // desktop always shows the panel regardless of the [open] attribute.
  const out = renderDescriptionHtml("stacked-plain", STACKED_DESC_EXAMPLE, imgs);
  assert.ok(/<details class="bm-acc" open>/.test(out), "info panel is wrapped in a native, open-by-default <details>");
  assert.ok(/<summary class="bm-bar">/.test(out), "the tap target is a real <summary>, not a checkbox+label");
  assert.ok(!/class="bm-toggle"/.test(out), "no more checkbox-driven toggle");
  const flat = out.replace(/\s+/g, "");
  assert.ok(/min-width:900px\)\{[\s\S]*?\.bm\.bm-acc>summary\{display:none!important\}/.test(flat), "desktop hides the mobile-only bar");
  assert.ok(/min-width:900px\)\{[\s\S]*?\.bm\.bm-acc>\.bm-c1\{display:block!important\}/.test(flat), "desktop force-shows the info panel regardless of [open]");
  assert.ok(/min-width:900px\)\{[\s\S]*?\.bm\.bm-acc>\.bm-grid\{display:grid!important\}/.test(flat), "desktop force-shows the grid regardless of [open]");
  assert.ok(out.includes("querySelectorAll('.bm .bm-acc')") && out.includes("setAttribute('open',''"), "script defensively re-adds open if the model forgot it");
});

test("a model that ignores the <details> instruction and writes the old checkbox toggle is rewritten anyway", () => {
  // Reproduces a REAL failure, found by testing a live regeneration on the
  // actual product store: even right after the reference example and prompt
  // were updated to the native <details>/<summary> form, Claude's own output
  // still wrote the legacy `<input class="bm-toggle">…<label class="bm-bar">`
  // markup — the same "prompt wording isn't enough for a structural change"
  // lesson as forceCtaOnclick. This must be corrected in code regardless of
  // what the model wrote, the same way forceCtaOnclick corrects the onclick.
  const legacyToggle = STACKED_DESC_EXAMPLE.replace(
    /<details class="bm-acc" open>\s*<summary class="bm-bar">([\s\S]*?)<\/summary>/,
    '<input class="bm-toggle" type="checkbox" id="bmDetails"> <label class="bm-bar" for="bmDetails">$1</label>',
  ).replace(/<\/details>\n<script>/, "\n<script>");
  // sanity: the input fixture actually reproduces the legacy pattern, not a no-op
  assert.ok(legacyToggle.includes('<input class="bm-toggle"'), "fixture setup: legacy checkbox present");
  assert.ok(!legacyToggle.includes('<details class="bm-acc"'), "fixture setup: no <details> element left to trivially pass");

  const out = renderDescriptionHtml("stacked-plain", legacyToggle, imgs);
  assert.ok(/<details class="bm-acc" open><summary class="bm-bar">/.test(out), "rewritten into a native, open-by-default <details>/<summary>");
  assert.ok(!out.includes('class="bm-toggle"'), "legacy checkbox is gone");
  assert.ok(!/<label\b[^>]*class="bm-bar"/.test(out), "legacy <label> tag is gone (now a <summary>)");
  assert.ok(out.includes("Product Details"), "the bar's own text survives the rewrite");
  // the rewritten <details> must actually wrap the real content (specs, FAQ,
  // CTA), not just the hero — i.e. it closes after .bm-grid, not right after .bm-c1
  const accIdx = out.indexOf("bm-acc");
  const closeIdx = out.indexOf("</details>", accIdx);
  const gridIdx = out.indexOf('class="bm-grid"', accIdx);
  assert.ok(gridIdx > accIdx && closeIdx > gridIdx, "<details> wraps both .bm-c1 AND .bm-grid, not just the hero");
  assert.ok(out.slice(gridIdx, closeIdx).includes("Specifications"), "Specifications lives inside the rewritten <details>");
});

test("badges wrap (never clip mid-word) and the decorative hero emoji shrinks on mobile", () => {
  // Reproduces a real screenshot: on a narrow phone, the badge row's
  // desktop-only nowrap+horizontal-scroll styling read as truncated text
  // ("140 Key", "PBT Dye-S…") because there was no visible/discoverable way
  // to scroll it, and the large floating decorative emoji sat visually on
  // top of the last badge.
  const out = renderDescriptionHtml("stacked-plain", STACKED_DESC_EXAMPLE, imgs);
  const flat = out.replace(/\s+/g, "");
  assert.ok(/max-width:899px\)\{[\s\S]*?\.bm-badges\{flex-wrap:wrap!important/.test(flat), "badges wrap on mobile instead of clipping");
  assert.ok(/max-width:899px\)\{[\s\S]*?\.bm-hero::before,\.bm-hero::after\{font-size:26px!important/.test(flat), "decorative hero emoji shrinks on mobile");
  assert.ok(/max-width:899px\)\{[\s\S]*?\.bm-comparetd:first-child\{white-space:normal!important/.test(flat), "compare table's first column can wrap on mobile instead of squeezing the other columns off-screen");
  // dropping first-column nowrap alone wasn't enough: an HTML <table> with no
  // table-layout:fixed still sizes columns to fit its widest content and can
  // overflow its container regardless of any single cell's white-space —
  // verified live: the table pushed ~64px past the card edge on a real phone
  // width even after this rule alone.
  assert.ok(/max-width:899px\)\{[\s\S]*?\.bm-compare\{table-layout:fixed!important/.test(flat), "compare table is forced to table-layout:fixed on mobile so columns can't overflow the card");
});

test("both examples use a native <details> FAQ and an inline-onclick CTA (survives <script> stripping)", () => {
  for (const [layout, ex, faqCount] of [
    ["stacked-plain", STACKED_DESC_EXAMPLE, 7],
    ["grid-2", OTHER_DESC_EXAMPLE, 6],
  ] as const) {
    const out = renderDescriptionHtml(layout, ex, imgs);
    assert.equal((out.match(/<details class="(?:bm|pd)-faq-item"/g) || []).length, faqCount);
    assert.equal((out.match(/faq-item"[^>]* open>/g) || []).length, 1, "first FAQ item open");
    assert.equal((out.match(/<details class="(?:bm|pd)-faq-item"[^>]*name="(?:bm|pd)-faq"/g) || []).length, faqCount, "details use name= for native single-open");
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

test("the 'Tap to zoom' tag is never invisible, even if the model writes a compound selector typo", () => {
  // Reproduces a real bug found on a live regeneration: `.bm-media` sets
  // font-size:0 (removes whitespace gaps between stacked inline-block
  // images), and the reference example overrides it back for the zoom tag
  // with the DESCENDANT combinator `.bm-media .bm-zoomtag{font-size:11.5px}`.
  // The model regenerated this as `.bm-media.bm-zoomtag` (no space = a
  // compound selector requiring ONE element with both classes, which never
  // exists since .bm-zoomtag is a descendant of .bm-media) — a silently dead
  // rule that left the "🔍 Tap to zoom" label's text at 0 font-size.
  const brokenSelector = STACKED_DESC_EXAMPLE.replace(
    ".bm-media .bm-zoomtag{",
    ".bm-media.bm-zoomtag{", // the exact typo observed in production
  );
  assert.notEqual(brokenSelector, STACKED_DESC_EXAMPLE, "fixture setup: the typo was actually introduced");
  const out = renderDescriptionHtml("stacked-plain", brokenSelector, imgs);
  const flat = out.replace(/\s+/g, "");
  assert.ok(/\.bm-zoomtag\{font-size:11\.5px!important\}/.test(flat), "zoom tag font-size forced regardless of the model's selector");
});

test("Add-to-Cart glow waits long enough for a long-page smooth scroll to truly finish", () => {
  // The old 1600ms/2000ms safety caps could fire while the page was still
  // actively scrolling on a long description, starting the glow mid-flight —
  // looks like it "cuts off" as the target keeps moving under it.
  for (const [layout, ex] of [
    ["stacked-plain", STACKED_DESC_EXAMPLE],
    ["grid-2", OTHER_DESC_EXAMPLE],
  ] as const) {
    const out = renderDescriptionHtml(layout, ex, imgs);
    const js = (out.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
    assert.ok(js.includes("setTimeout(fire, 4000)"), "scrollend safety cap extended to 4000ms");
    assert.ok(js.includes("clearInterval(iv); fire(); }, 4000)"), "polling hard-stop extended to 4000ms");
    assert.ok(!js.includes("setTimeout(fire, 1600)"), "old too-short scrollend cap is gone");
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

test("Compatible Layouts example rows always get a real gap, even if the model's CSS dropped it", () => {
  // Reproduces a real bug: the model's own regenerated `.bm-compat-eg .bm-eg`
  // CSS sometimes drops `gap`, gluing the bold size label directly to the
  // keyboard-model list ("60%Anne Pro 2 · Ducky One 3 Mini · RK61").
  const strippedGap = STACKED_DESC_EXAMPLE.replace(
    /\.bm-compat-eg \.bm-eg\{[^}]*\}/,
    ".bm-compat-eg .bm-eg{display:flex}",
  );
  const out = renderDescriptionHtml("stacked-plain", strippedGap, imgs);
  const flat = out.replace(/\s+/g, "");
  assert.ok(/\.bm-compat-eg\.bm-eg\{display:flex!important[^}]*gap:8px!important/.test(flat), "gap forced even with model's gap-less rule");
});

test("trust badges always get a hover affordance, even if the model's CSS forgot one", () => {
  const noHover = STACKED_DESC_EXAMPLE.replace(/\.bm-trust span:hover\{[^}]*\}/, "");
  const out = renderDescriptionHtml("stacked-plain", noHover, imgs);
  const flat = out.replace(/\s+/g, "");
  assert.ok(/\.bm-trustspan:hover\{transform:translateY\(-2px\)!important/.test(flat), "trust badge hover forced");
});

test("forceCtaOnclick isn't truncated by a `>` inside the existing onclick it's replacing", () => {
  // Reproduces a real bug: the tag-matching regex used to be a naive `[^>]*`,
  // which stops at the FIRST literal `>` it sees — and the onclick it's about
  // to replace (both the model's own and the reference example's) always
  // contains `indexOf(...)>-1` comparisons. That truncated the "tag" match
  // mid-attribute and corrupted the button markup instead of swapping the
  // onclick cleanly. The forced onclick must always be the FULL canonical
  // string, unbroken by any `>` in what it's replacing.
  for (const [layout, ex, initFlag] of [
    ["stacked-plain", STACKED_DESC_EXAMPLE, "__bmInit"],
    ["grid-2", OTHER_DESC_EXAMPLE, "__pdInit"],
  ] as const) {
    const out = renderDescriptionHtml(layout, ex, imgs);
    const m = out.match(/data-(?:bm|pd)-goto-atc onclick="([^"]*)"/);
    assert.ok(m, "CTA carries an onclick");
    assert.ok(m![1].length > 1000, `onclick must be the full canonical string, not truncated (got ${m![1].length} chars)`);
    assert.ok(m![1].includes(initFlag), "full onclick includes the init guard");
    assert.doesNotThrow(() => new Function(m![1]), "forced onclick parses as valid JS");
    assert.ok(!out.slice(m!.index! + m![0].length, m!.index! + m![0].length + 30).includes("onclick="), "no leftover duplicated onclick text after the tag");
  }
});

test("the Add-to-Cart inline onclick steps aside once BM_SCRIPT/PD_SCRIPT has run (no double-fire glow reset)", () => {
  // Reproduces a real bug: the inline onclick and the script's own delegated
  // [data-*-goto-atc] click listener used to BOTH run on every click, each
  // scheduling its own scroll+glow — the second call reset (removed/re-added)
  // the glow class mid-animation, which read as the glow "cutting off".
  for (const [layout, ex, initFlag] of [
    ["stacked-plain", STACKED_DESC_EXAMPLE, "__bmInit"],
    ["grid-2", OTHER_DESC_EXAMPLE, "__pdInit"],
  ] as const) {
    const out = renderDescriptionHtml(layout, ex, imgs);
    const m = out.match(/data-(?:bm|pd)-goto-atc onclick="([^"]*)"/);
    assert.ok(m, "CTA carries an onclick");
    assert.ok(m![1].includes(`if(window.${initFlag})return false`), "inline onclick defers to the script once it has initialised");
  }
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
