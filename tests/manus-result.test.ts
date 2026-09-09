import { test } from "node:test";
import assert from "node:assert/strict";
import { pickImageAttachment, saidNoChange } from "../shared/manusResult.ts";

test("pickImageAttachment finds the result image across Manus's attachment shapes", () => {
  // tagged type:"image"
  assert.ok(pickImageAttachment([{ type: "image", url: "https://m/a", content_type: "image/png", filename: "a" }]));
  // only an image/* content-type (type says "file")
  assert.ok(pickImageAttachment([{ type: "file", url: "https://m/b", content_type: "image/webp", filename: "b" }]));
  // only a filename extension
  assert.ok(pickImageAttachment([{ type: "file", url: "https://m/c", content_type: "", filename: "out.png" }]));
  // only a URL extension (with query)
  assert.ok(pickImageAttachment([{ type: "file", url: "https://m/d.jpeg?token=x", filename: "" }]));

  // last (result) wins over the first (source)
  const got = pickImageAttachment([
    { type: "image", url: "https://m/source.jpg", filename: "source.jpg" },
    { type: "image", url: "https://m/result.png", filename: "result.png" },
  ]);
  assert.equal(got?.url, "https://m/result.png");

  // nothing image-like, or no url → undefined
  assert.equal(pickImageAttachment([{ type: "file", url: "https://m/notes.txt", filename: "notes.txt" }]), undefined);
  assert.equal(pickImageAttachment([{ type: "image", filename: "a.png" }]), undefined);
  assert.equal(pickImageAttachment([]), undefined);
  assert.equal(pickImageAttachment(undefined), undefined);
});

test("saidNoChange only fires on a clean final verdict", () => {
  assert.equal(saidNoChange("NO_CHANGE_NEEDED"), true);
  assert.equal(saidNoChange("no_change_needed"), true);
  assert.equal(saidNoChange("I checked every block.\nNO_CHANGE_NEEDED"), true);
  assert.equal(saidNoChange("Done.\n\nNO CHANGE NEEDED."), true);

  // mid-reasoning mentions must NOT count — a real translation would be discarded
  assert.equal(saidNoChange("There is Chinese text, so this is not a NO_CHANGE_NEEDED case. I translated it."), false);
  assert.equal(saidNoChange("The rule says reply NO_CHANGE_NEEDED only when empty; here it is not."), false);
  assert.equal(saidNoChange("Translated 4 blocks and removed the watermark."), false);
  assert.equal(saidNoChange(""), false);
});
