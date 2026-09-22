import { test } from "node:test";
import assert from "node:assert/strict";
import { withAbsoluteMedia, withCleanEtsyFields } from "../server/etsyApp.ts";
import { env } from "../server/env.ts";
import type { GeneratedListing, NormalisedProduct } from "../shared/types.ts";

function product(overrides: Partial<NormalisedProduct> = {}): NormalisedProduct {
  return {
    numIid: "1",
    platform: "taobao",
    sourceUrl: "",
    title: "t",
    priceOriginal: 10,
    currencyOriginal: "CNY",
    descHtml: "",
    images: [],
    variants: [],
    props: {},
    originCountry: "CN",
    fetchedAt: "",
    ...overrides,
  };
}

// Regression: the Etsy Command Center is a separate service and can only
// fetch an image by a real https URL — a locally-edited photo (crop/erase/
// translate) is saved under an app-relative /api/media/... path that only
// resolves inside THIS server's own origin, so sending it as-is silently
// dropped every edit from the pushed draft.
test("withAbsoluteMedia turns a local /api/media edit into a fetchable https URL", () => {
  const p = product({
    images: [
      { url: "/api/media/abc123.jpg", role: "gallery" },
      { url: "https://img.alicdn.com/original.jpg", role: "variant" },
    ],
    variants: [{ name: "Black", price: 10, imageUrl: "/api/media/def456.jpg" }],
    videoUrl: "/api/media/vid789.mp4",
  });
  const out = withAbsoluteMedia(p);
  assert.equal(out.images[0].url, `${env.appPublicUrl}/api/media/abc123.jpg`);
  // an already-public url is left untouched
  assert.equal(out.images[1].url, "https://img.alicdn.com/original.jpg");
  assert.equal(out.variants[0].imageUrl, `${env.appPublicUrl}/api/media/def456.jpg`);
  assert.equal(out.videoUrl, `${env.appPublicUrl}/api/media/vid789.mp4`);
});

test("withAbsoluteMedia leaves a variant with no image alone", () => {
  const p = product({ variants: [{ name: "No photo", price: 10 }] });
  const out = withAbsoluteMedia(p);
  assert.equal(out.variants[0].imageUrl, undefined);
});

function listing(fields: GeneratedListing["fields"]): GeneratedListing {
  return { channel: "etsy", fields, variants: [], model: "test", usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
}

// Regression: `tags_pool` (up to 50 CANDIDATE tags, chip-picker only) has no
// business reaching the Etsy Command Center — sending it alongside the real
// `tags` selection risked the companion app using the wrong, oversized list
// instead of the operator's actual 13 picks ("seçilen 13 etiket gitsin").
test("withCleanEtsyFields drops tags_pool and passes a clean tags selection through untouched", () => {
  const chosen13 = Array.from({ length: 13 }, (_, i) => `tag ${i}`).join(", ");
  const out = withCleanEtsyFields(
    listing([
      { key: "title", value: "t" },
      { key: "tags", value: chosen13 },
      { key: "tags_pool", value: chosen13 + ", extra candidate one, extra candidate two" },
    ]),
  );
  assert.equal(out.fields.find((f) => f.key === "tags_pool"), undefined);
  assert.equal(out.fields.find((f) => f.key === "tags")?.value, chosen13);
});

test("withCleanEtsyFields clamps a hand-edited tags field to 13 and dedupes case-insensitively", () => {
  const raw = Array.from({ length: 20 }, (_, i) => `tag ${i}`);
  raw.push("Tag 0"); // duplicate of "tag 0", different case
  const out = withCleanEtsyFields(listing([{ key: "tags", value: raw.join(", ") }]));
  const tags = out.fields.find((f) => f.key === "tags")!.value.split(", ");
  assert.equal(tags.length, 13);
  assert.deepEqual(tags, raw.slice(0, 13));
});

test("withCleanEtsyFields strips seo_description (Shopify-only field)", () => {
  const out = withCleanEtsyFields(listing([{ key: "seo_description", value: "x" }, { key: "title", value: "t" }]));
  assert.equal(out.fields.find((f) => f.key === "seo_description"), undefined);
  assert.equal(out.fields.length, 1);
});
