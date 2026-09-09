import type { ImageOp, ProductImage } from "@shared/types.ts";

export const OP_ORDER: ImageOp[] = ["translate", "erase", "edit", "logo", "format"];

/** Single-letter badge shown on a thumbnail (Turkish initials, stable across locales). */
export const OP_LETTER: Record<ImageOp, string> = {
  translate: "Ç",
  erase: "S",
  edit: "E",
  logo: "L",
  format: "F",
};

/** i18n key for the full operation name (used in tooltips). */
export const OP_KEY: Record<ImageOp, string> = {
  translate: "ws.opTranslate",
  erase: "ws.opErase",
  edit: "ws.opEdit",
  logo: "ws.opLogo",
  format: "ws.opFormat",
};

export function mergeOps(a: ImageOp[] = [], b: ImageOp[] = []): ImageOp[] {
  const s = new Set<ImageOp>([...a, ...b]);
  return OP_ORDER.filter((o) => s.has(o));
}

/** Effective op list for an image — folds legacy `translatedFrom` into "translate". */
export function opsOf(im: ProductImage): ImageOp[] {
  const s = new Set<ImageOp>(im.ops ?? []);
  if (im.translatedFrom) s.add("translate");
  return OP_ORDER.filter((o) => s.has(o));
}
