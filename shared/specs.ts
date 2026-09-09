import { applyKeycapGlossary } from "./keycaps";

/** CJK ranges (kept in sync with listingFormat's CJK_RE, minus math-bold headers). */
const CJK_RE = /[⺀-⿿　-〿぀-ヿ㄀-ㄯ㆐-㆟ㆠ-ㆿ㇀-㇯㈀-鿿豈-﫿︰-﹏＀-￯]|[\u{20000}-\u{2FA1F}]/gu;
const noCJK = (s: unknown) =>
  applyKeycapGlossary(String(s ?? ""))
    .replace(CJK_RE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

/** Chinese / common spec keys → a clean customer-facing English label. */
const SPEC_LABELS: Record<string, string> = {
  材质: "Material", 键帽材质: "Keycap Material", 主体材质: "Material", 面料: "Material",
  工艺: "Technique", 字符工艺: "Legend Process", 印刷工艺: "Printing", 制作工艺: "Technique",
  高度: "Profile", 原厂高度: "Profile", 键帽高度: "Profile",
  主题: "Theme", 题材: "Theme", 系列: "Series",
  兼容: "Compatibility", 适用: "Compatibility", 适配: "Compatibility", 适用键盘: "Compatibility",
  颜色: "Color", 色系: "Color",
  尺寸: "Size", 规格: "Spec", 大小: "Size",
  风格: "Style", 图案: "Pattern", 花色: "Pattern",
  品牌: "Brand", 重量: "Weight", 净重: "Weight", 毛重: "Weight",
  类型: "Type", 款式: "Type", 产地: "Origin", 包装: "Packaging", 包装方式: "Packaging",
  型号: "Model", 货号: "Model",
  颗数: "Key Count", 键数: "Key Count", 键位数: "Key Count", 数量: "Count", 套件: "Set",
  是否透光: "Backlight", 透光: "Backlight", 侧刻: "Legend Position", 正刻: "Legend Position",
  轴体: "Switch", 轴: "Switch", 接口: "Connection", 连接方式: "Connection",
  灯效: "Lighting", 背光: "Lighting", 键位: "Layout", 布局: "Layout", 配列: "Layout",
  功能: "Features", 特性: "Features", 用途: "Use",
};

/**
 * Keys that are marketplace metadata, NOT a product spec. Matched (case-insensitive)
 * as a substring against the raw key AND its de-CJK'd form. Covers ZH / EN / TR.
 */
const SPEC_BLOCK =
  /(运费|邮费|包邮|物流|快递|发货|运送|配送|shipping|postage|freight|delivery\b|kargo|gönderi|teslimat|nakliye)|(销量|月销|周销|总销|成交|付款人数|人付款|回头率|复购|人气|sold\b|\bsales\b|orders?\b|satış|satıldı|sipari[sş])|(评价|评论|好评|中评|差评|晒图|买家秀|\breviews?\b|\bratings?\b|değerlendirme|yorum|puanlama)|(库存|现货|备货|余货|\bstock\b|\binventory\b|stok)|(宝贝id|商品id|itemid|item.?id|商品编号|链接|\burl\b|\bspu\b|\bsku.?id)|(上架时间|上市时间|上新|发布时间|listing.?date|date.?added|yayın.?tarih)|(发货地|所在地|ship.?from|kargo.?çıkış)|(价格|售价|优惠|折扣|促销|活动价|\bprice\b|\bdiscount\b|\bpromo\b|indirim|fiyat)|(店铺|卖家|旗舰店|\bshop\b|\bseller\b|\bstore\b|mağaza|satıcı)|(收藏|加购|想要|\bfavou?rites?\b|\bwishlist\b|favori)|(颜色分类|尺码|规格分类|套餐|选择|classification|variant|option)/i;

/** Value is only punctuation / fill chars / empty → not a real spec value. */
const VALUE_JUNK = /^[\s.,;:·、。…‥„""''*×\-–—_/|<>()\[\]{}~•·°'"´`^]*$/;

/** Labels for which a bare number is legitimate. */
const NUMERIC_OK = new Set(["Key Count", "Count", "Weight", "Size", "Set"]);

export interface Spec {
  label: string;
  value: string;
}

function labelFor(rawKey: string): string | null {
  const k = String(rawKey || "").trim();
  if (SPEC_LABELS[k]) return SPEC_LABELS[k];
  for (const [zh, en] of Object.entries(SPEC_LABELS)) if (k.includes(zh)) return en;
  const ascii = noCJK(k);
  if (ascii && /[a-zçğıöşü]/i.test(ascii)) {
    return ascii.replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);
  }
  return null;
}

/**
 * Turn a raw product `props` map into clean, customer-facing specification rows:
 * marketplace stats (sales / shipping / reviews / stock / listing date …) are
 * dropped, CJK is stripped from values, junk / empty / URL values are dropped,
 * keys are given readable English labels, and rows are de-duplicated by label.
 */
export function cleanSpecs(props: Record<string, unknown> | undefined | null, max = 12): Spec[] {
  if (!props) return [];
  const out: Spec[] = [];
  const seen = new Set<string>();
  const seenVal = new Set<string>();
  for (const [rawK, rawV] of Object.entries(props)) {
    const rawKeyStr = String(rawK || "");
    if (SPEC_BLOCK.test(rawKeyStr) || SPEC_BLOCK.test(noCJK(rawKeyStr))) continue;
    const label = labelFor(rawKeyStr);
    if (!label || SPEC_BLOCK.test(label)) continue;

    let value = noCJK(rawV).replace(/^[\s.,;:·、。…‥„""''*\-–—_/|]+|[\s.,;:·、。…‥„""''*\-–—_/|]+$/g, "").trim();
    if (!value || VALUE_JUNK.test(value)) continue;
    if (/^https?:\/\//i.test(value)) continue;
    // a dumped variant / SKU list, not a spec value: many separators, or a repeated token
    const seps = (value.match(/[,，、|/]/g) || []).length;
    if (seps >= 3 || (seps >= 1 && value.length > 44)) continue;
    if (/(.{6,}?)\1{2,}/.test(value.replace(/\s+/g, ""))) continue; // same chunk repeated 3+ times
    if (value.length > 90) value = value.slice(0, 88).trim() + "…";
    if (/^\d[\d.,]*$/.test(value) && !NUMERIC_OK.has(label)) continue; // bare count on an unknown label

    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    // drop a row whose value already appeared under another label — e.g. a raw
    // props map carrying both "品牌: SOULcat" (→ Brand) and a stray "Marka: SOULcat"
    const vkey = value.toLowerCase();
    if (value.length <= 24 && seenVal.has(vkey)) continue;
    seen.add(key);
    seenVal.add(vkey);
    out.push({ label, value });
    if (out.length >= max) break;
  }
  return out;
}

/** Same filtering, returned as a plain `{label: value}` object (for JSON / LLM prompts). */
export function cleanPropsRecord(props: Record<string, unknown> | undefined | null, max = 14): Record<string, string> {
  return Object.fromEntries(cleanSpecs(props, max).map((s) => [s.label, s.value]));
}
