import { test } from "node:test";
import assert from "node:assert/strict";
import { withAbsoluteMedia } from "../server/etsyApp.ts";
import { env } from "../server/env.ts";
import type { NormalisedProduct } from "../shared/types.ts";

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
