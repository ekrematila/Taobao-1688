import type { NormalisedProduct } from "./types";
import { detectKeyboardLayout } from "./keycaps";

export type KbSize =
  | "fullsize"
  | "n1800"
  | "tkl"
  | "n75"
  | "n65"
  | "n60"
  | "compact"
  | "alice"
  | null;

/** Rough weights (kg) the operator asked for; used only when the source has none. */
const SIZE_KG: Record<Exclude<KbSize, null>, number> = {
  fullsize: 2.2,
  n1800: 2.0,
  tkl: 1.8,
  n75: 1.5,
  n65: 1.5,
  n60: 1.5,
  compact: 1.5,
  alice: 3.0,
};

const KEYCAP_SET_KG = 0.6;

/**
 * A safe default HS (Harmonized System) code by product type — the operator's
 * known values. Anything else returns null (enter manually or research with AI).
 * Format: 6 digits with a dot, which Shopify accepts.
 */
export function defaultHsCode(productType: string | undefined, product?: NormalisedProduct): string | null {
  const pt = (productType || "").toLowerCase();
  const s = product ? haystack(product) : "";
  if (/keycap|键帽/.test(pt) || (!/keyboard|键盘/.test(pt) && /keycap|键帽/.test(s))) return "8473.30";
  if (/keyboard|键盘/.test(pt) || /keyboard|机械键盘|客制化键盘/.test(s)) return "8471.60";
  return null;
}

function haystack(p: Pick<NormalisedProduct, "title" | "titleTranslated" | "descHtml" | "props">): string {
  return [
    p.title || "",
    p.titleTranslated || "",
    Object.entries(p.props || {})
      .map(([k, v]) => `${k} ${v}`)
      .join(" "),
    (p.descHtml || "").replace(/<[^>]+>/g, " "),
  ]
    .join("  ")
    .toLowerCase();
}

/** Board size from the product text (EN + common CN keywords). */
export function detectKbSize(
  p: Pick<NormalisedProduct, "title" | "titleTranslated" | "descHtml" | "props">,
): KbSize {
  const s = haystack(p);
  if (/\balice\b|阿丽?丝|阿利斯|ergo.?alice/.test(s)) return "alice";
  if (/full.?size|全尺寸|\b1[08]4\s?键|\b1[08]4\b|\b108\b|\b100%\b/.test(s)) return "fullsize";
  if (/\b1800\b|\b96%\b|\b98\s?键|\b100\s?键|\b98\b|\b99\b|\b100\b(?!\s?%)/.test(s)) return "n1800";
  if (/tenkeyless|\btkl\b|\b80%\b|\b8[78]\s?键|\b8[78]\b|\b88\b/.test(s)) return "tkl";
  if (/\b75%\b|\b8[124]\s?键|\b8[124]\b|\b83\b/.test(s)) return "n75";
  if (/\b65%\b|\b6[678]\s?键|\b6[678]\b/.test(s)) return "n65";
  if (/\b60%\b|\b6[14]\s?键|\b6[14]\b/.test(s)) return "n60";
  if (/compact|mini|便携|紧凑|\b40%\b/.test(s)) return "compact";
  return null;
}

const KB_SIZE_LABEL: Record<Exclude<KbSize, null>, { tr: string; en: string }> = {
  fullsize: { tr: "full-size klavye", en: "full-size keyboard" },
  n1800: { tr: "1800 / 96% klavye", en: "1800 / 96% keyboard" },
  tkl: { tr: "TKL (80%) klavye", en: "TKL (80%) keyboard" },
  n75: { tr: "75% klavye", en: "75% keyboard" },
  n65: { tr: "65% klavye", en: "65% keyboard" },
  n60: { tr: "60% klavye", en: "60% keyboard" },
  compact: { tr: "kompakt klavye", en: "compact keyboard" },
  alice: { tr: "Alice klavye", en: "Alice keyboard" },
};

/** Pull an explicitly stated weight (kg) out of the product text, if any. */
export function declaredWeightKg(
  p: Pick<NormalisedProduct, "title" | "titleTranslated" | "descHtml" | "props">,
): number | null {
  const s = haystack(p);
  // number + unit, optionally right after a "weight" word
  const re =
    /(?:重量|净重|毛重|gross\s*weight|net\s*weight|weight|wt)?\s*[:：]?\s*(\d{1,4}(?:[.,]\d{1,3})?)\s*(kgs?|公斤|千克|克|grams?|g|斤)(?![a-z])/gi;
  let m: RegExpExecArray | null;
  const cands: number[] = [];
  while ((m = re.exec(s))) {
    const n = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(n)) continue;
    const u = m[2].toLowerCase();
    let kg: number;
    if (/kg|公斤|千克/.test(u)) kg = n;
    else if (/斤/.test(u)) kg = n * 0.5;
    else kg = n / 1000; // g / 克 / grams
    if (kg >= 0.03 && kg <= 30) cands.push(Math.round(kg * 1000) / 1000);
  }
  if (!cands.length) return null;
  // if several, the largest is usually the gross/shipping weight
  return Math.max(...cands);
}

export interface WeightGuess {
  kg: number | null;
  source: "declared" | "estimate" | "none";
  /** short human note for the UI, e.g. "üründe yazıyor: 0.65 kg" */
  tr: string;
  en: string;
}

/**
 * Best weight (kg) for a product: an explicitly stated weight wins; otherwise a
 * rough estimate from the item type / keyboard size. Returns `null` kg when we
 * have no basis (operator fills it in).
 */
export function estimateWeightKg(
  product: NormalisedProduct,
  productType?: string,
): WeightGuess {
  const declared = declaredWeightKg(product);
  if (declared != null) {
    return { kg: declared, source: "declared", tr: `üründe yazıyor: ${declared} kg`, en: `stated on the listing: ${declared} kg` };
  }

  const kb = detectKeyboardLayout(product);
  const pt = (productType || "").toLowerCase();
  const isKeycap = kb.isKeycapSet || /keycap|键帽|kap set/.test(pt) || /keycap|键帽/.test(haystack(product));
  const isKeyboard = !isKeycap && (/keyboard|键盘/.test(pt) || /keyboard|机械键盘|客制化键盘|\b键盘\b/.test(haystack(product)));

  if (isKeycap) {
    return { kg: KEYCAP_SET_KG, source: "estimate", tr: `tahmin: klasik keycap set ≈ ${KEYCAP_SET_KG} kg`, en: `estimate: a classic keycap set ≈ ${KEYCAP_SET_KG} kg` };
  }
  if (isKeyboard) {
    const size = detectKbSize(product) ?? "tkl";
    const kg = SIZE_KG[size];
    return {
      kg,
      source: "estimate",
      tr: `tahmin: ${KB_SIZE_LABEL[size].tr} ≈ ${kg} kg`,
      en: `estimate: ${KB_SIZE_LABEL[size].en} ≈ ${kg} kg`,
    };
  }
  return { kg: null, source: "none", tr: "ürün türünden ağırlık tahmin edilemedi — elle gir", en: "no weight basis for this item type — enter it manually" };
}
