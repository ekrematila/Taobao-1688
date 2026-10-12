// Variant names without any AI: a Taobao/1688 option label ("颜色分类:粉色;套餐类型:基础套装")
// becomes a short channel-ready English name ("Pink / Base Kit") from a keycap-aware
// glossary, is shortened to the channel limit at a word boundary, and made unique.
// Whatever the glossary can't read is reported back so the caller can use machine
// translation for just those labels — and a name is NEVER left empty.

import { applyKeycapGlossary } from "./keycaps.ts";
import type { ProductVariant } from "./types.ts";

const CJK = /[㐀-鿿豈-﫿＀-￯]/;
const CJK_ALL = /[㐀-鿿豈-﫿＀-￯]/g;
export const hasCjk = (s: string) => CJK.test(s);
export const stripCjk = (s: string) => s.replace(CJK_ALL, " ").replace(/\s{2,}/g, " ").trim();

/** longest terms first — "浅蓝色" must win over "蓝色" */
const TERMS: [RegExp, string][] = [
  // option headings that only say what the next part is
  [/(颜色分类|颜色|套餐类型|套餐|规格|款式|版本|型号|尺码|尺寸|分类|选项)\s*[:：]/g, ""],
  [/【[^】]*(现货|预售|发货|包邮|赠|送)[^】]*】/g, ""],
  [/[【】\[\]（）()]/g, " "],
  [/(现货|包邮|当天发货|顺丰)/g, ""],
  [/预售|定制|团购/g, "Pre-order"],
  // keycap kits
  [/官方标配|官方款|标配/g, "Standard Kit"],
  [/基础套装|基础款|基础键|基础/g, "Base Kit"],
  [/全套装?|全键|全部|完整套装/g, "Full Set"],
  [/(?:个性化?|创意)\s*套装|个性化?键?|创意键?|特殊键|特别版/g, "Novelty Kit"],
  [/数字小键盘|小键盘|数字键/g, "Numpad Kit"],
  [/空格键|长空格|空格/g, "Spacebar"],
  [/方向键/g, "Arrow Keys"],
  [/扩展包|扩展套装|扩展|补充包|补充/g, "Extension Kit"],
  [/ISO\s*套装|ISO\s*套件|ISO\s*版/gi, "ISO Kit"],
  [/ANSI\s*套装|ANSI\s*套件|ANSI\s*版/gi, "ANSI Kit"],
  [/单个键帽|单键帽|单个|单键/g, "Single Key"],
  [/套装|一套/g, "Set"],
  [/(\d+)\s*[键鍵](?!帽)/g, "$1 Keys"],
  [/键帽/g, "Keycaps"],
  [/(\d+)\s*(?:个|颗|粒|pcs)/gi, "$1 pcs"],
  [/(\d+)\s*套/g, "$1 Sets"],
  // materials / process
  [/PBT\s*材质|PBT\s*料/gi, "PBT"],
  [/ABS\s*材质/gi, "ABS"],
  [/(五面)?热升华/g, "Dye-Sub"],
  [/双色注塑|双色/g, "Double-shot"],
  [/透光/g, "Shine-through"],
  // colours (longest first)
  [/樱花粉|樱花/g, "Sakura Pink"],
  [/薄荷绿|薄荷/g, "Mint Green"],
  [/抹茶绿|抹茶/g, "Matcha"],
  [/薰衣草紫|薰衣草/g, "Lavender"],
  [/奶油色|奶油白|奶白色?|奶油/g, "Cream"],
  [/浅蓝色?|天蓝色?|淡蓝色?/g, "Light Blue"],
  [/深蓝色?|藏蓝色?|海军蓝/g, "Navy"],
  [/浅绿色?|淡绿色?/g, "Light Green"],
  [/深绿色?|墨绿色?/g, "Dark Green"],
  [/浅粉色?|淡粉色?/g, "Light Pink"],
  [/玫红色?|玫瑰色?/g, "Rose"],
  [/粉蓝色?/g, "Pink & Blue"],
  [/粉色?|粉红色?/g, "Pink"],
  [/白色?/g, "White"],
  [/黑色?/g, "Black"],
  [/红色?/g, "Red"],
  [/橙色?|橘色?|橘黄色?/g, "Orange"],
  [/黄色?/g, "Yellow"],
  [/绿色?/g, "Green"],
  [/蓝色?/g, "Blue"],
  [/青色?/g, "Cyan"],
  [/紫色?/g, "Purple"],
  [/灰色?/g, "Gray"],
  [/米色|米白色?|杏色?/g, "Beige"],
  [/咖啡色?|棕色?|褐色?/g, "Brown"],
  [/金色?/g, "Gold"],
  [/银色?/g, "Silver"],
  [/透明/g, "Clear"],
  [/彩色|多色|混色/g, "Multicolor"],
  [/男款|男士/g, "Men"],
  [/女款|女士/g, "Women"],
  [/加厚/g, "Thick"],
  [/默认|默认款|标准版?|标准/g, "Standard"],
];

/** fillers that can go when a name has to fit the channel limit */
const FILLER = /\b(keycaps?|edition|series|the|and|for)\b/gi;

const NUM: Record<string, string> = { 一: "1", 二: "2", 两: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10" };

const tidy = (s: string) =>
  s
    .replace(/\s*[;；]\s*/g, " / ")
    .replace(/\s*\/\s*(\/\s*)+/g, " / ")
    .replace(/^[\s/,:：-]+|[\s/,:：-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

export interface RuleName {
  /** the English name the glossary produced (CJK it could not read is already removed) */
  text: string;
  /** every Chinese part was understood */
  complete: boolean;
}

/** one label → English through the glossary alone */
export function ruleBasedVariantName(raw: string): RuleName {
  let t = String(raw ?? "");
  // "套餐三" / "方案2" → Bundle 3 / Plan 2
  t = t.replace(/(套餐|方案)\s*([一二两三四五六七八九十\d]{1,3})/g, (_m, kind: string, n: string) => ` ${kind === "方案" ? "Plan" : "Bundle"} ${NUM[n] ?? n} `);
  for (const [re, en] of TERMS) t = t.replace(re, (...m) => " " + (en.includes("$1") ? en.replace("$1", String(m[1])) : en) + " ");
  t = applyKeycapGlossary(t);
  const complete = !hasCjk(t);
  return { text: tidy(stripCjk(t)), complete };
}

/** cut to `cap` characters: drop filler words first, then stop at a word boundary — never mid-word */
export function shortenVariantName(name: string, cap: number): string {
  let t = tidy(String(name ?? ""));
  if (t.length <= cap) return t;
  const lean = tidy(t.replace(FILLER, " "));
  if (lean) t = lean;
  if (t.length <= cap) return t;
  const compact = t.replace(/\s*\/\s*/g, "/");
  if (compact.length <= cap) return compact;
  const words = compact.split(/(?<=[\s/])/);
  let out = "";
  for (const w of words) {
    if ((out + w).trim().length > cap) break;
    out += w;
  }
  out = out.replace(/[\s/]+$/, "");
  return out || compact.slice(0, cap).trim();
}

/** make sure no two variants end up with the same name ("Pink", "Pink 2", …) within the limit */
export function uniqueNames(names: string[], cap: number): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    if (k === 0) return n;
    const suffix = ` ${k + 1}`;
    return `${n.slice(0, Math.max(1, cap - suffix.length)).trim()}${suffix}`;
  });
}

/** a final name for every variant: shortened, never empty, unique */
export function finalizeNames(names: string[], cap: number): string[] {
  const filled = names.map((n, i) => shortenVariantName(stripCjk(n || ""), cap) || `Option ${i + 1}`);
  return uniqueNames(filled, cap);
}

const DEFAULT_NAME = /^(default( title)?|varsay[ıi]lan|默认|standard)$/i;
export const isPlaceholderVariant = (v: Pick<ProductVariant, "name" | "nameTranslated">) =>
  DEFAULT_NAME.test((v.nameTranslated || v.name || "").trim());

const OPTION_KEY = /颜色分类|颜色|套餐类型|套餐|款式|版本|规格|型号|分类|colou?r|style|kit|edition|version/i;

/**
 * A product whose source gave NO real options (a single "default" variant) but whose
 * attributes list several ("颜色分类: 粉色、蓝色") — turn those into variants.
 * Pure detection from the product's own data; returns [] when there is nothing to find.
 */
export function detectVariantNames(props: Record<string, string> | undefined, existing: ProductVariant[]): string[] {
  if (existing.length > 1 || (existing.length === 1 && !isPlaceholderVariant(existing[0]))) return [];
  for (const [k, val] of Object.entries(props ?? {})) {
    if (!OPTION_KEY.test(k)) continue;
    const parts = String(val)
      .split(/[,，、;；|/]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 30);
    const uniq = [...new Set(parts)];
    if (uniq.length >= 2 && uniq.length <= 40) return uniq;
  }
  return [];
}
