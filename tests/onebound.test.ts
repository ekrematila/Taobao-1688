import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseItem } from "../server/normalize.ts";

// Regression for a real bug: OneBound answers a provider-side failure with
// `item: { format_check: "fail" }` (a non-empty, truthy OBJECT) alongside
// `error_code: "5000"`. The old "does `item` exist" check treated that as a
// successful payload and built a draft with no real data — its title fell
// back to the raw pasted URL/ID instead of the actual product name.
const ONEBOUND_FAILURE_SENTINEL = {
  item: { format_check: "fail" },
  error: "data error",
  translate_status: "",
  translate_time: 0,
  language: { default_lang: "cn", current_lang: "cn" },
  reason: "data error 接口文档：https://open.onebound.cn/help/api/taobao.item_get.html",
  error_code: "5000",
};

test("normaliseItem rejects OneBound's own failure sentinel (format_check: fail)", () => {
  const out = normaliseItem(ONEBOUND_FAILURE_SENTINEL, "taobao", "1068134878419");
  assert.equal(out, undefined, "a failed lookup must never become a draft");
});

test("normaliseItem still accepts a real, minimal item", () => {
  const out = normaliseItem(
    { item: { num_iid: "123456789", title: "Test Product", price: "19.90" } },
    "taobao",
    "123456789",
  );
  assert.ok(out);
  assert.equal(out!.title, "Test Product");
  assert.equal(out!.numIid, "123456789");
});
