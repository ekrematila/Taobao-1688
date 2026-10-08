// The operator's REAL shop policies (shipping, processing, returns…) per store.
//
// Facts here were read from the live stores themselves (their own policy pages / Etsy shop
// policy sections), not invented. They are the ONLY source the app may use for any
// shipping / returns / processing statement on a product page — the AI is told not to write
// those itself, and the page gets a verified "Shipping & Returns" block built from this data.
//
// Editable in Settings → "Mağaza politikaları" (saved as the `store_profiles` setting).

export interface StoreLink {
  label: string;
  url: string;
  /** lower-case words; the link is suggested on a product page when any of them appears in the product text */
  keywords: string[];
}

export interface StoreProfile {
  id: string;
  name: string;
  kind: "shopify" | "etsy";
  url: string;
  /** "Orders are processed within …" */
  processing: string;
  /** delivery-time / shipping-cost / tracking lines (customer-facing, English) */
  shipping: string[];
  /** returns / refunds / cancellations lines (customer-facing, English) */
  returns: string[];
  /** customs / payment / other customer-facing lines */
  extra: string[];
  contact: string;
  /** the store's own full policy pages — the product page links to these (no policy text on the page itself) */
  shippingUrl?: string;
  returnsUrl?: string;
  links: StoreLink[];
  /** operator-only remarks (conflicts found on the live store, things to double check) — never shown to customers */
  notes: string;
  /** when the facts were read from the live store (ISO date) */
  fetchedAt: string;
  sources: string[];
}

const KEY_LINKS: StoreLink[] = [
  { label: "Cute keycap sets", url: "https://keyartisan.net/collections/cute-keycaps/keycap-set+keycaps-set+key-cap-set+key-caps-set", keywords: ["cute", "kawaii", "pastel", "sweet", "milk"] },
  { label: "Anime keycap sets", url: "https://keyartisan.net/collections/anime-keycaps/keycap-set+keycaps-set+key-cap-set+key-caps-set", keywords: ["anime", "manga", "character"] },
  { label: "PBT keycap sets", url: "https://keyartisan.net/collections/pbt-keycaps/keycap-set+keycaps-set+key-cap-set+key-caps-set", keywords: ["pbt", "dye-sub", "dye-sublimation", "sublimation"] },
  { label: "Cherry profile keycaps", url: "https://keyartisan.net/collections/cherry-profile", keywords: ["cherry"] },
  { label: "MOA profile keycaps", url: "https://keyartisan.net/collections/moa-profile", keywords: ["moa"] },
  { label: "XDA profile keycaps", url: "https://keyartisan.net/collections/xda-profile", keywords: ["xda"] },
  { label: "OEM profile keycaps", url: "https://keyartisan.net/collections/oem-profile", keywords: ["oem"] },
  { label: "SOA profile keycaps", url: "https://keyartisan.net/collections/soa-profile", keywords: ["soa"] },
  { label: "Backlit keycaps", url: "https://keyartisan.net/collections/backlit-keycaps/keycap-set+keycaps-set+key-cap-set+key-caps-set", keywords: ["backlit", "shine-through", "rgb"] },
  { label: "Retro keycaps", url: "https://keyartisan.net/collections/retro-keycaps", keywords: ["retro", "vintage"] },
  { label: "Japanese keycaps", url: "https://keyartisan.net/collections/japanese-keycaps", keywords: ["japanese", "japan"] },
  { label: "Artisan keycaps", url: "https://keyartisan.net/collections/artisan-keycaps", keywords: ["artisan", "resin"] },
  { label: "All keycap sets", url: "https://keyartisan.net/collections/keycap-set", keywords: ["keycap"] },
];

const BAG_LINKS: StoreLink[] = [
  { label: "Clear window ita bags", url: "https://cuteitabags.com/collections/clear-window-bags", keywords: ["clear window", "transparent", "window", "display pocket"] },
  { label: "Mini ita bags", url: "https://cuteitabags.com/collections/mini-ita-bags", keywords: ["mini", "small", "compact"] },
  { label: "Ita backpacks", url: "https://cuteitabags.com/collections/ita-backpacks", keywords: ["backpack", "rucksack"] },
  { label: "Ita crossbody bags", url: "https://cuteitabags.com/collections/ita-crossbody-bags", keywords: ["crossbody", "cross-body"] },
  { label: "Ita shoulder bags", url: "https://cuteitabags.com/collections/ita-shoulder-bags", keywords: ["shoulder"] },
  { label: "Ita tote bags", url: "https://cuteitabags.com/collections/ita-tote-bags", keywords: ["tote"] },
  { label: "Plush display bags", url: "https://cuteitabags.com/collections/plush-display-bags", keywords: ["plush"] },
  { label: "Anime lover collection", url: "https://cuteitabags.com/collections/anime-lover-collection", keywords: ["anime", "character", "manga"] },
  { label: "Pastel color collection", url: "https://cuteitabags.com/collections/pastel-color-collection", keywords: ["pastel", "soft blue", "light blue"] },
  { label: "Pen bags & pencil cases", url: "https://cuteitabags.com/collections/pen-bags-pencil-cases", keywords: ["pencil", "pen case", "pen bag"] },
  { label: "Wallets & pouches", url: "https://cuteitabags.com/collections/wallets-pouches", keywords: ["wallet", "pouch", "coin purse"] },
  { label: "All ita bags", url: "https://cuteitabags.com/collections/ita-bags", keywords: ["ita bag", "ita"] },
];

const FETCHED = "2026-10-08";

export const DEFAULT_STORE_PROFILES: StoreProfile[] = [
  {
    id: "keyartisan-net",
    name: "keyartisan.net",
    kind: "shopify",
    url: "https://keyartisan.net",
    processing: "Orders are processed within 2–5 business days (before shipping time starts).",
    shipping: [
      "Standard delivery after dispatch: USA 6–12 business days, Canada 8–15, UK / Germany / France / Italy 6–10, Australia 5–10, Japan 4–5. Other countries are shown at checkout.",
      "Shipping cost: $8 under $50 · $10 for $50–$99 · free from $100.",
      "A tracking number is emailed once your order ships (allow 24–48 hours for tracking to update).",
      "Most orders ship from our warehouse in Shenzhen, China; some items ship from our USA or Türkiye stock, which can shorten delivery.",
    ],
    returns: [
      "Returns & exchanges within 60 days of receiving your order — the item must be unused, in its original condition and packaging, with proof of purchase. A 15% return fee applies and return shipping is paid by the buyer.",
      "Damaged, defective or incorrect item? Email us with photos and we will make it right.",
      "Refunds are issued within 10 business days of approval (your bank may need a little longer).",
      "Orders can be cancelled within 6 hours of purchase, if they have not been processed or shipped yet.",
    ],
    extra: ["Customs delays can affect delivery time for international orders."],
    contact: "hello@keyartisan.net",
    shippingUrl: "https://keyartisan.net/policies/shipping-policy",
    returnsUrl: "https://keyartisan.net/policies/refund-policy",
    links: KEY_LINKS,
    notes:
      "Read from keyartisan.net/policies/shipping-policy and refund-policy. Express shipping is listed on the policy page as 'will be added in the future', so it is NOT promised. The policy does not say whether the 15% fee also applies inside the 60-day window — check with the policy owner.",
    fetchedAt: FETCHED,
    sources: ["https://keyartisan.net/policies/shipping-policy", "https://keyartisan.net/policies/refund-policy"],
  },
  {
    id: "cuteitabags",
    name: "cuteitabags.com",
    kind: "shopify",
    url: "https://cuteitabags.com",
    processing: "Orders are processed in about 2–5 business days (an estimate; special items can take longer).",
    shipping: [
      "Delivery after dispatch: USA 7–13 days, Canada 8–16, Europe 8–12, Australia 5–10, New Zealand 6–10, Japan 4–7, South Korea / Singapore 6–9.",
      "Shipping cost and any free-shipping offer are shown at checkout.",
      "Tracking is provided when the carrier makes it available; it can take a little while to activate.",
      "Items from different warehouses (China / Hong Kong) may arrive in separate packages.",
    ],
    returns: [
      "30 calendar days from delivery to request a return — the item must be unused, with original tags and packaging, and proof of purchase. Return shipping is paid by the buyer; a 15% restocking fee applies (not for a confirmed damaged, defective or incorrect item).",
      "Damaged, defective or incorrect item? Email us with your order number and photos.",
      "Refunds are issued within up to 10 business days after approval (your bank may need 3–5 more).",
      "Orders can be cancelled within 24 hours of purchase if they have not shipped yet.",
    ],
    extra: [
      "International orders may go through customs review, which can add time.",
      "We accept Visa, Mastercard, American Express, PayPal, Apple Pay, Google Pay and Shop Pay.",
    ],
    contact: "hello@cuteitabags.com",
    shippingUrl: "https://cuteitabags.com/policies/shipping-policy",
    returnsUrl: "https://cuteitabags.com/policies/refund-policy",
    links: BAG_LINKS,
    notes:
      "Read from cuteitabags.com/policies/shipping-policy and refund-policy. CONFLICT on the live store: the homepage banners say 'free shipping on orders $49+' / 'over $50' while the shipping policy page says $8 under $50 · $10 for $50–$99 · free from $100. Customer-facing text therefore does not state a free-shipping threshold or shipping prices — fix the banner or the policy, then add the right line here. The homepage also says 'Full Tracking With Every Order' while the policy says tracking when available; the policy wording is used.",
    fetchedAt: FETCHED,
    sources: ["https://cuteitabags.com/policies/shipping-policy", "https://cuteitabags.com/policies/refund-policy"],
  },
  {
    id: "etsy-keyartisanus",
    name: "Etsy · KeyArtisanUS",
    kind: "etsy",
    url: "https://www.etsy.com/shop/KeyArtisanUS",
    processing: "Orders are processed in 2–5 business days; delivery depends on your location and the shipping method chosen at checkout.",
    shipping: ["We ship worldwide — costs and delivery times depend on your location.", "Customs fees may apply in some countries."],
    returns: [
      "Returns, refunds or exchanges are accepted only for defective or incorrect items — contact us within 14 days of delivery.",
      "Cancellations: request within 6 hours of purchase.",
    ],
    extra: ["No custom orders at the moment."],
    contact: "Etsy Messages",
    links: [],
    notes: "Read from the shop's policy page on Etsy (shipping / return details are set per listing).",
    fetchedAt: FETCHED,
    sources: ["https://www.etsy.com/shop/KeyArtisanUS"],
  },
  {
    id: "etsy-keyartisann",
    name: "Etsy · KeyArtisann",
    kind: "etsy",
    url: "https://www.etsy.com/shop/KeyArtisann",
    processing: "Orders are typically processed within 2–5 business days; delivery depends on your location and the shipping method chosen at checkout.",
    shipping: ["We offer international shipping — costs and delivery times vary by location.", "Customs fees may apply for some countries."],
    returns: [
      "Refunds, returns or exchanges are accepted only for defective or incorrect items — contact us within 14 days of receiving your order.",
      "Cancellations: request within 24 hours of purchase.",
    ],
    extra: ["No custom orders at the moment."],
    contact: "Etsy Messages",
    links: [],
    notes: "Read from the shop's policy page on Etsy.",
    fetchedAt: FETCHED,
    sources: ["https://www.etsy.com/shop/KeyArtisann"],
  },
  {
    id: "etsy-cutiegiftsus",
    name: "Etsy · CutieGiftsUS",
    kind: "etsy",
    url: "https://www.etsy.com/shop/CutieGiftsUS",
    processing: "Shipping origin is shown on each listing — most items ship directly from our Hong Kong warehouse.",
    shipping: [
      "We ship to most European Union countries; delivery times vary with your location, customs processing and local postal services.",
      "Tracking information is provided whenever available.",
    ],
    returns: [
      "If something is wrong with your order, please contact us before opening a case or leaving a review — we will find a fair solution. Return and exchange eligibility depends on the product and the reason; see the shop policies.",
      "Cancellations: request within 12 hours of purchase.",
    ],
    extra: ["In most cases you will not pay extra customs duties or import taxes; if you do, contact us after the item reaches your country."],
    contact: "Etsy Messages",
    links: [],
    notes: "Read from the shop's policy page on Etsy (processing time is not stated there — only the shipping origin).",
    fetchedAt: FETCHED,
    sources: ["https://www.etsy.com/shop/CutieGiftsUS"],
  },
];

const BAGGY = /\b(bag|bags|backpack|rucksack|tote|wallet|pouch|purse|handbag|crossbody|ita)\b|包|背包|痛包/i;
const KEYBOARDY = /keycap|keyboard|switch|key\s*set|键帽|键盘|轴/i;

/** Which profile fits this product + channel: keyboard stuff → keyartisan.net, everything else → cuteitabags.com (Shopify); first Etsy shop for Etsy. */
export function pickStoreProfile(
  profiles: StoreProfile[],
  opts: { channel: "shopify" | "etsy"; productText?: string; isKeycapSet?: boolean; preferId?: string },
): StoreProfile | undefined {
  const pool = profiles.filter((p) => p.kind === opts.channel);
  if (!pool.length) return undefined;
  const wanted = opts.preferId && pool.find((p) => p.id === opts.preferId);
  if (wanted) return wanted;
  if (opts.channel === "etsy") return pool[0];
  const text = opts.productText || "";
  const keyboardish = opts.isKeycapSet || KEYBOARDY.test(text);
  const bag = BAGGY.test(text);
  const byUrl = (frag: string) => pool.find((p) => p.url.includes(frag));
  if (keyboardish && !bag) return byUrl("keyartisan.net") ?? pool[0];
  return byUrl("cuteitabags") ?? pool[0];
}

/** Tolerant parse of the saved `store_profiles` setting — anything malformed falls back to the defaults. */
export function normalizeStoreProfiles(raw: unknown): StoreProfile[] {
  const arr = Array.isArray(raw) ? raw : [];
  const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
  const out: StoreProfile[] = [];
  for (const r of arr as any[]) {
    if (!r || typeof r !== "object") continue;
    const id = String(r.id || "").trim().replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const name = String(r.name || "").trim();
    if (!id || !name) continue;
    out.push({
      id,
      name,
      kind: r.kind === "etsy" ? "etsy" : "shopify",
      url: String(r.url || "").trim(),
      processing: String(r.processing || "").trim(),
      shipping: strs(r.shipping),
      returns: strs(r.returns),
      extra: strs(r.extra),
      contact: String(r.contact || "").trim(),
      shippingUrl: /^https?:\/\//i.test(String(r.shippingUrl || "").trim()) ? String(r.shippingUrl).trim() : undefined,
      returnsUrl: /^https?:\/\//i.test(String(r.returnsUrl || "").trim()) ? String(r.returnsUrl).trim() : undefined,
      links: (Array.isArray(r.links) ? r.links : [])
        .map((l: any) => ({ label: String(l?.label || "").trim(), url: String(l?.url || "").trim(), keywords: strs(l?.keywords).map((k) => k.toLowerCase()) }))
        .filter((l: StoreLink) => l.label && /^https?:\/\//i.test(l.url)),
      notes: String(r.notes || "").trim(),
      fetchedAt: String(r.fetchedAt || "").trim(),
      sources: strs(r.sources),
    });
  }
  return out.length ? out : DEFAULT_STORE_PROFILES;
}

/** Everything a profile says, as plain text — the evidence the claim checker allows. */
export function profileText(p?: StoreProfile): string {
  if (!p) return "";
  return [p.processing, ...p.shipping, ...p.returns, ...p.extra, p.contact].join(" ");
}
