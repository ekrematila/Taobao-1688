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
    assert.equal((out.match(/faq-item" open>/g) || []).length, 1, "first FAQ item open");
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
