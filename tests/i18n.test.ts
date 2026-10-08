import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// A missing key renders as the raw "settings.some.key" text in the UI (it happened once with
// settings.openaiWhy.bestForEditing). Every statically-referenced t("…") key must exist in
// both the Turkish and the English dictionary.
const src = join(import.meta.dirname, "..", "src");
const i18n = readFileSync(join(src, "i18n.ts"), "utf8");
const marker = i18n.indexOf("\n};");
const tr = i18n.slice(0, marker);
const en = i18n.slice(marker);
const keysIn = (text: string) => new Set([...text.matchAll(/^\s{2}"([a-zA-Z0-9_.]+)":/gm)].map((m) => m[1]));
const trKeys = keysIn(tr);
const enKeys = keysIn(en);

function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|ts)$/.test(f) && f !== "i18n.ts") yield p;
  }
}

test("every t('…') key used by the UI exists in both languages", () => {
  const used = new Map<string, string>();
  for (const file of walk(src))
    for (const m of readFileSync(file, "utf8").matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) used.set(m[1], file.replace(src, ""));
  const missing = [...used].filter(([k]) => !trKeys.has(k) || !enKeys.has(k)).map(([k, f]) => `${k} (${f})`);
  assert.deepEqual(missing, []);
});

test("the two dictionaries define the same keys", () => {
  const onlyTr = [...trKeys].filter((k) => !enKeys.has(k));
  const onlyEn = [...enKeys].filter((k) => !trKeys.has(k));
  assert.deepEqual({ onlyTr, onlyEn }, { onlyTr: [], onlyEn: [] });
});

test("the scan really sees the keys (not vacuous)", () => {
  assert.ok(trKeys.size > 500 && enKeys.size > 500, `${trKeys.size}/${enKeys.size}`);
});

// keys built from a variable (t(`settings.openaiCat.${cat}`)) can't be found statically — check each family by hand
test("dynamically-built key families are complete in both languages", async () => {
  const { OPENAI_CATEGORIES } = await import("../shared/openaiModels.ts");
  const need: string[] = [];
  for (const c of OPENAI_CATEGORIES) {
    need.push(`settings.openaiCat.${c}`);
    if (c !== "video") need.push(`settings.openaiUse.${c}`); // video shows the shutdown note instead
  }
  for (const w of ["bestValue", "cheapest", "newest", "bestForEditing"]) need.push(`settings.openaiWhy.${w}`);
  for (const f of ["title", "title_alt", "description", "tags"]) need.push(`delivery.field.${f}`);
  assert.deepEqual(need.filter((k) => !trKeys.has(k) || !enKeys.has(k)), []);
});
