import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDescValue } from "../shared/descLayouts.ts";

const BS = String.fromCharCode(92); // a single backslash

test("cleanDescValue leaves a clean styled block untouched", () => {
  const good = "<style>\n.bm{color:#000}\n</style>\n<div class=\"bm\"><h2>Hi</h2></div>";
  assert.equal(cleanDescValue(good), good);
});

test("cleanDescValue pulls description out of a leaked JSON wrapper", () => {
  const inner = "<style>.x{}</style><div class=" + BS + '"x' + BS + '">Body</div>';
  const leaked = '{"fields":[{"key":"title","value":"T"},{"key":"description","value":"' + inner + '"}]}';
  const out = cleanDescValue(leaked);
  assert.ok(out.startsWith("<style>"), out.slice(0, 40));
  assert.ok(out.includes('<div class="x">Body</div>'));
  assert.ok(!out.includes('"fields"'));
});

test("cleanDescValue un-escapes a double-escaped body", () => {
  // a body where newlines and quotes arrived as literal backslash sequences
  const dbl = "<style>" + BS + "n.a{}" + BS + "n</style>" + BS + "n<div class=" + BS + '"a' + BS + '">x</div>';
  assert.ok(dbl.includes(BS + "n"), "precondition: input has a literal backslash-n");
  const out = cleanDescValue(dbl);
  assert.ok(out.includes("\n"), "has real newlines");
  assert.ok(!out.includes(BS + "n"), "no literal backslash-n left");
  assert.ok(out.includes('<div class="a">'), "quotes un-escaped");
});

test("cleanDescValue strips a leading blank run and a stray <input>", () => {
  const messy = "\n\n\n  <input type=\"text\"><style>.q{}</style><div class=\"q\">ok</div>";
  const out = cleanDescValue(messy);
  assert.ok(out.startsWith("<style>"), out.slice(0, 30));
  assert.ok(!/<input/i.test(out));
});

test("cleanDescValue keeps a real .bm-toggle checkbox", () => {
  const withToggle = "<style>.bm{}</style><div class=\"bm\"><input class=\"bm-toggle\" type=\"checkbox\"><label>x</label></div>";
  assert.ok(cleanDescValue(withToggle).includes('class="bm-toggle"'));
});

test("cleanDescValue strips country-flag emoji but keeps other emoji", () => {
  const withFlag = "<style>.bm{}</style><p class=\"bm\">🐹 Fun fact 🇳🇱 from the Netherlands</p>";
  const out = cleanDescValue(withFlag);
  assert.ok(!/[\uD83C][\uDDE6-\uDDFF]/.test(out), "no regional-indicator letters left");
  assert.ok(out.includes("🐹"), "hamster emoji kept");
  assert.ok(out.includes("Fun fact"));
});
