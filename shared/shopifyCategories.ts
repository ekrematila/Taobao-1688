import type { NormalisedProduct } from "./types";

/**
 * The slice of the official Shopify Standard Product Taxonomy
 * (https://shopify.github.io/product-taxonomy/) that covers this store's
 * catalogue — mechanical-keyboard hobby goods + a few adjacent items.
 * Every string is the EXACT full path Shopify's CSV importer and admin
 * "Category" picker accept. `gid` is the taxonomy id for reference.
 */
export interface ShopifyCategory {
  gid: string;
  path: string;
}

export const SHOPIFY_CATEGORIES: Record<string, ShopifyCategory> = {
  keycapSet: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-11-3-1-2",
    path: "Electronics > Electronics Accessories > Computer Components > Input Device Accessories > Keyboard Keys & Caps > Keyboard Keys > Keyboard Keycap Sets",
  },
  artisanKeycap: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-11-3-1-1",
    path: "Electronics > Electronics Accessories > Computer Components > Input Device Accessories > Keyboard Keys & Caps > Keyboard Keys > Artisan Keycaps",
  },
  keycaps: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-11-3-2",
    path: "Electronics > Electronics Accessories > Computer Components > Input Device Accessories > Keyboard Keys & Caps > Keyboard Keycaps",
  },
  keyboardKeys: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-11-3-1",
    path: "Electronics > Electronics Accessories > Computer Components > Input Device Accessories > Keyboard Keys & Caps > Keyboard Keys",
  },
  keyboard: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-12-8",
    path: "Electronics > Electronics Accessories > Computer Components > Input Devices > Keyboards",
  },
  keyboardKit: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-12-8-2",
    path: "Electronics > Electronics Accessories > Computer Components > Input Devices > Keyboards > Keyboard Kits",
  },
  barebonesKeyboard: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-12-8-1",
    path: "Electronics > Electronics Accessories > Computer Components > Input Devices > Keyboards > Barebones Keyboards",
  },
  numericKeypad: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-12-12",
    path: "Electronics > Electronics Accessories > Computer Components > Input Devices > Numeric Keypads",
  },
  keyboardMouseSet: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-12-15",
    path: "Electronics > Electronics Accessories > Computer Components > Input Devices > Keyboard & Mouse Sets",
  },
  switches: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-11-5",
    path: "Electronics > Electronics Accessories > Computer Components > Input Device Accessories > Keyboard Switches",
  },
  stabilizers: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-11-8",
    path: "Electronics > Electronics Accessories > Computer Components > Input Device Accessories > Keyboard Stabilizers",
  },
  keyboardPcb: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-11-7",
    path: "Electronics > Electronics Accessories > Computer Components > Input Device Accessories > Keyboard PCBs",
  },
  keyboardStickers: {
    gid: "gid://shopify/TaxonomyCategory/el-7-8-13",
    path: "Electronics > Electronics Accessories > Computer Accessories > Keyboard Stickers & Decals",
  },
  keyboardTray: {
    gid: "gid://shopify/TaxonomyCategory/el-7-8-6",
    path: "Electronics > Electronics Accessories > Computer Accessories > Keyboard Trays & Platforms",
  },
  keyboardProtector: {
    gid: "gid://shopify/TaxonomyCategory/el-7-11-3",
    path: "Electronics > Electronics Accessories > Electronics Films & Shields > Keyboard Protectors",
  },
  wristRest: {
    gid: "gid://shopify/TaxonomyCategory/el-7-8-5",
    path: "Electronics > Electronics Accessories > Computer Accessories > Keyboard & Mouse Wrist Rests",
  },
  mouse: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-12-11",
    path: "Electronics > Electronics Accessories > Computer Components > Input Devices > Mice & Trackballs",
  },
  mousePad: {
    gid: "gid://shopify/TaxonomyCategory/el-7-8-8",
    path: "Electronics > Electronics Accessories > Computer Accessories > Mouse Pads",
  },
  usbCable: {
    gid: "gid://shopify/TaxonomyCategory/el-7-7-5-2",
    path: "Electronics > Electronics Accessories > Cables > Storage & Data Transfer Cables > USB Cables",
  },
  gamingPad: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-12-5-3",
    path: "Electronics > Electronics Accessories > Computer Components > Input Devices > Game Controllers > Gaming Pads",
  },
  usbFlashDrive: {
    gid: "gid://shopify/TaxonomyCategory/el-7-9-14-8",
    path: "Electronics > Electronics Accessories > Computer Components > Storage Devices > USB Flash Drives",
  },
  deskPad: {
    gid: "gid://shopify/TaxonomyCategory/os-2",
    path: "Office Supplies > Desk Pads & Blotters",
  },
  handbag: {
    gid: "gid://shopify/TaxonomyCategory/aa-5-4",
    path: "Apparel & Accessories > Handbags, Wallets & Cases > Handbags",
  },
  crossbodyBag: {
    gid: "gid://shopify/TaxonomyCategory/aa-5-4-7",
    path: "Apparel & Accessories > Handbags, Wallets & Cases > Handbags > Cross Body Bags",
  },
  backpackHandbag: {
    gid: "gid://shopify/TaxonomyCategory/aa-5-4-23",
    path: "Apparel & Accessories > Handbags, Wallets & Cases > Handbags > Backpack Handbags",
  },
};

/** All paths, for a manual-pick datalist. */
export const SHOPIFY_CATEGORY_PATHS: string[] = Object.values(SHOPIFY_CATEGORIES).map((c) => c.path);

function hay(p?: Pick<NormalisedProduct, "title" | "titleTranslated" | "props" | "descHtml">): string {
  if (!p) return "";
  return [
    p.title || "",
    p.titleTranslated || "",
    Object.keys(p.props || {}).join(" "),
    (p.descHtml || "").replace(/<[^>]+>/g, " ").slice(0, 600),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Best Shopify taxonomy entry for the product, from its type + ZH/EN text.
 * Defaults to "Keyboard Keycap Sets" — this is a keycap-first store.
 */
export function shopifyCategoryFor(
  productType: string | undefined,
  product?: Pick<NormalisedProduct, "title" | "titleTranslated" | "props" | "descHtml">,
): ShopifyCategory {
  const s = (productType || "").toLowerCase() + " " + hay(product);
  const C = SHOPIFY_CATEGORIES;

  if (/artisan\s*key\s?cap|异形键帽|手工键帽/.test(s)) return C.artisanKeycap;
  if (/key\s?cap\s*set|keycap\s*kit|键帽套装|键帽\s*套件/.test(s)) return C.keycapSet;
  if (/key\s?cap|键帽/.test(s)) return C.keycapSet; // sets are the norm for this store
  if (/keyboard\s*kit|套件键盘|客制化套件/.test(s)) return C.keyboardKit;
  if (/barebones|准成品|无轴无键帽/.test(s)) return C.barebonesKeyboard;
  if (/numeric\s*keypad|数字小键盘|小键盘/.test(s)) return C.numericKeypad;
  if (/keyboard\s*(and|&|\+)\s*mouse|键鼠套装/.test(s)) return C.keyboardMouseSet;
  if (/\bswitch(es)?\b|轴体|机械轴|linear|tactile|clicky|静音轴/.test(s) && !/keyboard|键盘/.test(s)) return C.switches;
  if (/stabiliz|卫星轴|平衡杆/.test(s)) return C.stabilizers;
  if (/\bpcb\b|电路板|热插拔pcb/.test(s)) return C.keyboardPcb;
  if (/keyboard\s*(sticker|decal)|键盘贴/.test(s)) return C.keyboardStickers;
  if (/keyboard\s*tray|键盘托架/.test(s)) return C.keyboardTray;
  if (/keyboard\s*protector|键盘膜|防尘罩/.test(s)) return C.keyboardProtector;
  if (/wrist\s*rest|palm\s*rest|掌托|手托/.test(s)) return C.wristRest;
  if (/keyboard|键盘/.test(s)) return C.keyboard;
  if (/desk\s?mat|desk\s*pad|桌垫|大鼠标垫/.test(s)) return C.deskPad;
  if (/mouse\s?pad|mousepad|鼠标垫/.test(s)) return C.mousePad;
  if (/\bmouse\b|鼠标/.test(s)) return C.mouse;
  if (/coiled|\bcable\b|数据线|键盘线|type-?c\s*线/.test(s)) return C.usbCable;
  if (/gaming\s*pad|方向键盘|游戏手柄键盘/.test(s)) return C.gamingPad;
  if (/u\s?disk|flash\s*drive|u盘/.test(s)) return C.usbFlashDrive;
  if (/backpack|双肩包|背包/.test(s)) return C.backpackHandbag;
  if (/cross\s*body|斜挎|单肩/.test(s)) return C.crossbodyBag;
  if (/\bbag\b|ita\s?bag|handbag|包包|手提包|痛包/.test(s)) return C.handbag;
  return C.keycapSet;
}

/** Convenience: just the full path string. */
export function categoryFor(
  productType: string | undefined,
  product?: Pick<NormalisedProduct, "title" | "titleTranslated" | "props" | "descHtml">,
): string {
  return shopifyCategoryFor(productType, product).path;
}
