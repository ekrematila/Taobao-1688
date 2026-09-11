import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseItem } from "../server/normalize.ts";

// Regression: a photo reused as BOTH a main gallery shot (item_imgs) and a
// variant/colour swatch (prop_imgs / sku_pic) must appear in BOTH zones, never
// just one — "aynı görsel olsa bile doğru yerlere gelmeli" (the same image
// still goes to every place it belongs). The old logic deduped by URL across
// roles, so an overlapping photo silently dropped out of the main gallery
// (variant always won), undercounting it below the source data's real total.
test("a photo shared between the main gallery and a variant appears in both roles", () => {
  const item = {
    num_iid: "1068134878419",
    title: "键帽测试产品",
    pic_url: "//img.alicdn.com/a1.jpg",
    item_imgs: [{ url: "//img.alicdn.com/a2.jpg" }, { url: "//img.alicdn.com/a3.jpg" }, { url: "//img.alicdn.com/a4.jpg" }],
    skus: {
      sku: [
        { sku_id: "s1", price: 89, properties_name: "1:2:颜色分类:原厂高度A", sku_pic: "//img.alicdn.com/a1.jpg" },
        { sku_id: "s2", price: 89, properties_name: "1:3:颜色分类:原厂高度B", sku_pic: "//img.alicdn.com/v2.jpg" },
        { sku_id: "s3", price: 89, properties_name: "1:4:颜色分类:无图款", sku_pic: "" },
      ],
    },
  };

  const out = normaliseItem({ item }, "taobao", "1068134878419");
  assert.ok(out);
  const gallery = out!.images.filter((im) => im.role === "gallery").map((im) => im.url);
  const variant = out!.images.filter((im) => im.role === "variant").map((im) => im.url);

  assert.equal(gallery.length, 4, "all 4 main photos stay in the gallery, even the one reused as a swatch");
  assert.ok(gallery.includes("https://img.alicdn.com/a1.jpg"));
  assert.equal(variant.length, 2, "both variant photos present, including the one shared with the gallery");
  assert.ok(variant.includes("https://img.alicdn.com/a1.jpg"));
  assert.ok(variant.includes("https://img.alicdn.com/v2.jpg"));

  // the 3rd SKU genuinely has no photo of its own — must stay unset, not
  // fall back to some other image
  const noPicVariant = out!.variants.find((v) => v.name.includes("无图"));
  assert.ok(noPicVariant);
  assert.equal(noPicVariant!.imageUrl, undefined);
});

test("a description photo already claimed by gallery/variant doesn't get a duplicate 3rd tile", () => {
  const item = {
    num_iid: "1",
    title: "t",
    pic_url: "//img.alicdn.com/g1.jpg",
    desc: `<div><img src="//img.alicdn.com/g1.jpg"><img src="//img.alicdn.com/d1.jpg"></div>`,
  };
  const out = normaliseItem({ item }, "taobao", "1");
  assert.ok(out);
  const urls = out!.images.map((im) => `${im.role}:${im.url}`);
  assert.equal(urls.filter((u) => u.endsWith("g1.jpg")).length, 1, "g1.jpg appears once (gallery), not also in description");
  assert.ok(urls.includes("description:https://img.alicdn.com/d1.jpg"));
});
