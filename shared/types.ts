// Shared contract between the API server and the web client.

export type ChannelId = "shopify" | "etsy";

export type OneboundPlatform = "taobao" | "1688";

export interface OneboundEndpoint {
  id: string;
  label: string;
  summary: string;
  /** which input the call needs */
  input: "id" | "keyword" | "none";
  /** whether a successful response can seed the visual workspace */
  seedsWorkspace?: boolean;
}

/** The fixed allow-list of OneBound endpoints the proxy will call. */
export const ONEBOUND_ENDPOINTS: OneboundEndpoint[] = [
  { id: "item_get_pro", label: "item_get_pro", summary: "Advanced product details", input: "id", seedsWorkspace: true },
  { id: "item_get", label: "item_get", summary: "Standard product info", input: "id", seedsWorkspace: true },
  { id: "item_get_desc", label: "item_get_desc", summary: "Description & media data", input: "id" },
  { id: "item_get_title", label: "item_get_title", summary: "Short product title", input: "id" },
  { id: "item_review", label: "item_review", summary: "Reviews & ratings", input: "id" },
  { id: "item_review_show", label: "item_review_show", summary: "Buyer photos from reviews", input: "id" },
  { id: "item_get_sales", label: "item_get_sales", summary: "Sales performance", input: "id" },
  { id: "item_search", label: "item_search", summary: "Keyword search", input: "keyword" },
  { id: "item_search_img", label: "item_search_img", summary: "Image-URL search", input: "keyword" },
  { id: "item_link", label: "item_link", summary: "Product link conversion", input: "id" },
  { id: "seller_info", label: "seller_info", summary: "Seller & shop data", input: "id" },
];

export interface ApiCallInput {
  platform: OneboundPlatform;
  endpoint: string;
  /** raw id or full product url; server extracts num_iid */
  query: string;
  lang?: string;
  noCache?: boolean;
  page?: number;
}

export interface ApiCallResult {
  requestUrl: string; // key/secret redacted
  status: number;
  ms: number;
  json: unknown;
  /** normalised product, present when the endpoint seeds the workspace */
  product?: NormalisedProduct;
}

/** What was actually done to an image, in the order applied. */
export type ImageOp = "translate" | "erase" | "edit" | "logo" | "format";

export interface ProductImage {
  url: string;
  /** "unused" is legacy — coerced to "description" on load; no zone renders it anymore */
  role: "gallery" | "variant" | "description" | "unused";
  /** AI generated alt text, if any */
  alt?: string;
  /** operations performed on this image (translate / erase / edit / logo / format) */
  ops?: ImageOp[];
  /** the very first pre-edit url, so before/after stays available across edits */
  originalUrl?: string;
  /** the ORIGINAL public source URL (from the marketplace) — set once at import,
   *  never overwritten by an edit/translate. The permanent fallback for exports
   *  when the working `url` is a local /api/media file with no public host. */
  srcUrl?: string;
  /** if this image is a Manus translation of another, the original url */
  translatedFrom?: string;
  /** manus task url for auditing the translation */
  taskUrl?: string;
  /** the generator's own public CDN URL (Manus manuscdn presigned link) — usable
   *  in a Shopify/Woo CSV, but it EXPIRES (~48h). Local copy at `url` is the archive. */
  remoteUrl?: string;
  /** non-destructive display crop for the HTML DESCRIPTION only (CSS aspect-ratio +
   *  object-fit:cover + object-position). Does not touch the source file. */
  descCrop?: DescImageCrop;
}

export interface DescImageCrop {
  /** CSS aspect-ratio value, e.g. "16/9", "30/7". Empty/undefined = natural. */
  aspect?: string;
  /** object-position, 0–100 (% from left / % from top). Default 50/50. */
  posX?: number;
  posY?: number;
  /** display width cap in px (image never grows past this in the description). */
  maxW?: number;
}

export interface ProductVariant {
  name: string;
  nameTranslated?: string;
  price: number | null;
  /** "compare at" / was-price shown struck-through (Shopify compare_at_price). */
  compareAtPrice?: number | null;
  sku?: string;
  /** the product image bound to this variant (auto-picked, operator can change). */
  imageUrl?: string;
  stock?: number | null;
  /** true when the operator added this variant by hand (not from the source listing). */
  manual?: boolean;
  /** per-variant shipping/customs overrides (fall back to the product-level value) */
  weightKg?: number | null;
  hsCode?: string;
  /** ISO-3166-1 alpha-2 (e.g. "CN") or a country name */
  countryOfOrigin?: string;
}

/** one chosen Shopify taxonomy attribute (value GIDs + human names for display/CSV). */
export interface ProductAttrPick {
  attrGid: string;
  attrName: string;
  valueGids: string[];
  valueNames: string[];
}

/** a taxonomy attribute + its selectable values, as served to the Attributes picker. */
export interface TaxonomyAttribute {
  id: string;
  gid: string;
  handle: string;
  name: string;
  values: { id: string; gid: string; name: string }[];
}

export interface TaxonomyAttributesResult {
  categoryGid: string;
  categoryPath: string;
  attributes: TaxonomyAttribute[];
  /** data-based (no-AI) suggested picks, keyed by attribute handle */
  suggested: Record<string, ProductAttrPick>;
}

export interface NormalisedProduct {
  numIid: string;
  platform: OneboundPlatform;
  sourceUrl: string;
  title: string;
  titleTranslated?: string;
  priceOriginal: number | null;
  currencyOriginal: string;
  descHtml: string;
  images: ProductImage[];
  variants: ProductVariant[];
  props: Record<string, string>;
  videoUrl?: string;
  /** the source video before any AI edit (for revert) */
  videoUrlOriginal?: string;
  /** alt text for the listing video */
  videoAlt?: string;
  /** ops applied to the video, for the badge / delivery notes */
  videoOps?: ImageOp[];
  /** operator's non-AI video delivery instructions (trim / mute) */
  videoDelivery?: { trimStart?: number; trimEnd?: number; mute?: boolean };
  /** Shopify "Type" / product_type (e.g. "Keycap Set", "Mechanical Keyboard") */
  shopType?: string;
  /** Shopify product taxonomy / "Category" (free-text path, e.g. "Electronics > … > Keyboards") */
  category?: string;
  /** resolved Shopify taxonomy category GID (e.g. "gid://shopify/TaxonomyCategory/el-7-9-11-3-1-2") */
  categoryGid?: string;
  /** chosen Shopify taxonomy attribute values, keyed by attribute handle (e.g. "keycap-material") */
  attributes?: Record<string, ProductAttrPick>;
  /** default country/region of origin — ISO-2 (e.g. "CN") or a name; variants may override */
  originCountry?: string;
  /** default 6-digit Harmonized System (HS) code; variants may override */
  hsCode?: string;
  /** default product weight in kilograms; variants may override */
  weightKg?: number | null;
  fetchedAt: string;
}

export interface GeneratedField {
  key: "title" | "title_alt" | "description" | "tags" | "tags_pool" | "seo_title" | "seo_description";
  value: string;
}

/** Shopify description-body image layout id (see shared/descLayouts.ts DESC_LAYOUTS). */
export type DescriptionLayout = string;

export interface GenerateListingInput {
  draftId: string;
  channel: ChannelId;
  productType: string;
  /** per-field example text + rules */
  fields: {
    key: GeneratedField["key"];
    examples?: string;
    rules?: string;
  }[];
  globalRules?: string;
  targetLanguage: string; // e.g. "en", "tr"
  descriptionLayout?: DescriptionLayout;
  /** Etsy: appended to the title as " – Brand®" */
  brand?: string;
  /** Shopify HTML description target range, e.g. "400-500". Interpreted per `htmlLengthUnit`.
   *  IGNORED for self-contained "stacked images" layouts (they have no length limit). */
  htmlLengthBand?: string;
  /** whether `htmlLengthBand` counts LINES (default) or CHARACTERS */
  htmlLengthUnit?: "line" | "char";
  /** cost/length budget — scales the AUTO-sized description target + token budget.
   *  "full" (classic) · "lean" (-25% tokens) · "min" (-50% tokens) */
  htmlBudget?: "full" | "lean" | "min";
  /** override the global effort / thinking for THIS generation */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  thinking?: "adaptive" | "off";
  /** optional: a DIFFERENT Claude model for the HTML description only (2nd pass).
   *  Empty / same as `model` → single pass, no extra call. */
  descModel?: string;
  /** who writes the HTML description: "claude" (default) or "manus" (agent task). */
  descProvider?: "claude" | "manus";
  /** Manus agent profile when descProvider === "manus" */
  descManusProfile?: string;
  /** effort / thinking for the description 2nd pass (Claude) */
  descEffort?: "low" | "medium" | "high" | "xhigh" | "max";
  descThinking?: "adaptive" | "off";
  /** description tone/style key from DESC_STYLES */
  descStyle?: string;
  /** the step-2 AI advice text, applied when the operator opted in */
  advice?: string;
  /** on-demand product-category research, applied when the operator opted in */
  categoryResearch?: string;
  /** free-text product details the operator typed in themselves; honoured verbatim */
  productNote?: string;
}

export interface AdviceResult {
  channel: ChannelId;
  /** markdown-ish guidance text (how it SHOULD be, not the actual content) */
  advice: string;
  model: string;
  usage: LlmUsage;
}

export interface CategoryResearchResult {
  research: string;
  model: string;
  usage: LlmUsage;
}

export interface GeneratedListing {
  channel: ChannelId;
  fields: GeneratedField[];
  variants: ProductVariant[];
  /** Shopify only — how description images are laid into the body HTML */
  layout?: DescriptionLayout;
  /** echo of the generation knobs, for the preview + re-generation */
  meta?: {
    brand?: string;
    htmlLengthBand?: string;
    htmlLengthUnit?: "line" | "char";
    htmlBudget?: "full" | "lean" | "min";
    descStyle?: string;
  };
  model: string;
  usage: LlmUsage;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface DraftSummary {
  id: string;
  numIid: string;
  platform: OneboundPlatform;
  title: string;
  channel: ChannelId | null;
  step: number;
  updatedAt: string;
  revisionCount: number;
}

export interface DraftRevision {
  id: number;
  draftId: string;
  label: string;
  createdAt: string;
}

export type KeySource = "env" | "ui" | "none";

export interface Settings {
  // masked hints only; real values live server-side
  oneboundKeyHint: string;
  oneboundSecretHint: string;
  oneboundBase: string;
  llmModel: string;
  hasLlmKey: boolean;
  llmKeyHint: string;
  llmKeySource: KeySource;
  llmEffort: "low" | "medium" | "high" | "xhigh" | "max";
  llmThinking: "adaptive" | "off";
  llmFast: boolean;
  llmEffortLevels: string[];
  llmFastModels: string[];
  hasManusKey: boolean;
  manusKeyHint: string;
  manusKeySource: KeySource;
  manusAgentProfile: string;
  manusBase: string;
  manusUsdPerCredit: number;
  manusCredits: number | null;
  /** manually entered Anthropic prepaid balance in USD (no API for it); 0 = unset */
  anthropicBalanceUsd: number;
  hasShopify: boolean;
  shopifyDomain: string;
  shopifyTokenHint: string;
  shopifySource: "ui" | "env" | "none";
  shopifyClientIdHint: string;
  shopifyHasSecret: boolean;
  shopifyRedirectUri: string;
  shopifyApiVersion: string;
  autoPushShopify: boolean;
  /** base URL of the "Etsy Command Center" companion app */
  etsyAppUrl: string;
  /** true once paired (url + key both known) */
  etsyAppConnected: boolean;
  previewReferenceUrl: string;
  uiLang: "tr" | "en";
  /** researched once, kept fixed — the operator's own brand */
  brandUrl: string;
  brandBrief: string;
  /** saved product-type presets for the Delivery "Ürün türü" field (built-ins + operator-added) */
  productTypes: string[];
}

export interface SettingsPatch {
  oneboundKey?: string;
  oneboundSecret?: string;
  anthropicKey?: string;
  manusKey?: string;
  clearAnthropicKey?: boolean;
  clearManusKey?: boolean;
  shopifyDomain?: string;
  shopifyToken?: string;
  shopifyClientId?: string;
  shopifyClientSecret?: string;
  clearShopify?: boolean;
  etsyAppUrl?: string;
  etsyAppKey?: string;
  clearEtsyApp?: boolean;
  llmModel?: string;
  llmEffort?: string;
  llmThinking?: "adaptive" | "off";
  llmFast?: boolean;
  manusAgentProfile?: string;
  manusUsdPerCredit?: number;
  anthropicBalanceUsd?: number;
  autoPushShopify?: boolean;
  uiLang?: "tr" | "en";
  brandUrl?: string;
  brandBrief?: string;
  /** full replacement list of operator-added product-type presets */
  productTypes?: string[];
}

export interface VerifyClaudeResult {
  ok: boolean;
  models: string[];
  activeModel: string;
  effort: string;
  thinking: string;
  fast: boolean;
  fastModels: string[];
  error?: string;
}
export interface VerifyManusResult {
  ok: boolean;
  credits: number | null;
  base: string;
  authMode: "apikey" | "bearer" | null;
  agentProfiles: string[];
  note: string;
  error?: string;
}
export interface VerifyShopifyResult {
  ok: boolean;
  shop?: string;
  plan?: string;
  error?: string;
}

export interface UsageDashboard {
  /** echo of the applied date filter (ISO), if any */
  from: string | null;
  to: string | null;
  totalCostUsd: number;
  claudeCostUsd: number;
  manusCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalManusCredits: number;
  manusUsdPerCredit: number;
  callCount: number;
  /** all-time (unfiltered) app spend, for balance-remaining math */
  claudeSpentAllUsd: number;
  manusSpentAllUsd: number;
  /** manually entered Anthropic prepaid balance in USD; 0 = unset */
  claudeBalanceUsd: number;
  activeClaudeModel: string;
  claudeInPer1M: number;
  claudeOutPer1M: number;
  perDraft: { draftId: string | null; title: string; claudeUsd: number; manusUsd: number; manusCredits: number }[];
  calls: {
    at: string;
    kind: string;
    provider: "claude" | "manus";
    model: string;
    inputTokens: number;
    outputTokens: number;
    credits: number;
    estimated: boolean;
    costUsd: number;
    draftId: string | null;
    /** Operation output: a string (generated text/HTML) or a small object
     *  ({from,to,taskUrl} for image ops, {text} for research, {alt} for alt text). */
    result?: unknown;
  }[];
}

export interface ManusUsageEntry {
  taskId: string;
  /** Manus's own task title when reconciled, else our internal kind */
  title: string;
  /** our internal operation kind: "translate-image" | "alt-text-manus" | … */
  kind: string;
  draftId: string | null;
  draftTitle: string;
  credits: number;
  type: "cost" | "refund" | "grant" | string;
  /** true when we couldn't match Manus's authoritative amount yet */
  estimated: boolean;
  createdAt: string; // ISO
}

/**
 * Manus spend for THIS APP only — the app's own calls, each reconciled against
 * Manus's authoritative /v2/usage.list by task_id. Manual manus.im tasks excluded.
 */
export interface ManusAccountUsage {
  configured: boolean;
  /** account spendable balance = data.total_credits (account-wide, informational) */
  available: number | null;
  /** estimated USD value of `available` = available × usdPerCredit */
  availableUsd: number | null;
  balance: {
    total: number | null;
    free: number | null;
    periodic: number | null;
    addon: number | null;
    nextRefresh: number | null;
    periodEnd: number | null;
  } | null;
  usdPerCredit: number;
  from: string | null;
  to: string | null;
  entries: ManusUsageEntry[];
  entryCount: number;
  costCredits: number;
  refundCredits: number;
  grantCredits: number;
  costUsd: number;
  byDay: { date: string; credits: number }[];
  byDraft: { draftId: string | null; title: string; credits: number; costUsd: number }[];
  /** how many app entries matched Manus's authoritative record */
  reconciled: number;
  /** app entries not yet in Manus's usage.list (billing lag or beyond paging) */
  pending: number;
  truncated: boolean;
  error?: string;
}

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";
export interface JobStep {
  label: string;
  state: "pending" | "active" | "done" | "skipped";
}
export interface JobView {
  id: string;
  kind: string;
  status: JobStatus;
  statusText: string;
  steps: JobStep[];
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImageTranslateItemResult {
  sourceUrl: string;
  resultUrl: string | null; // null => no change needed
  changed: boolean;
  taskUrl: string;
  creditsUsed: number;
  creditsEstimated: boolean;
  /** which image model the render was asked to use ("Nano Banana Pro" / "GPT Image 2") */
  model?: string;
  /** set when this image failed (rate limit, network, Manus error…) */
  error?: string;
}
export interface ImageTranslateJobResult {
  items: ImageTranslateItemResult[];
  totalCredits: number;
  /** how many gallery images were actually swapped for a translated version */
  replaced?: number;
  /** per-image failure messages (rate limit, no image returned, …) */
  errors?: string[];
}

export interface ArchiveEntry {
  id: string;
  draftId: string;
  channel: ChannelId;
  title: string;
  createdAt: string;
  format: string;
}

/* ------------------------------- blog ------------------------------- */

export type BlogKind = "product" | "category";

/** One outbound link the blog should weave in (backlinks to our own sites). */
export interface BlogBacklink {
  url: string;
  /** what the link is about — used as/near the anchor text */
  label?: string;
}

/** Operator-chosen generation settings. `"product"` = derive from the product. */
export interface BlogConfig {
  layout: string; // BLOG_LAYOUTS id | "product"
  theme: string; // BLOG_THEMES id | "product"
  voice: string; // BLOG_VOICES id | "product"
  /** rough word count target for the body */
  words: number;
  /** primary site the backlinks point to (asked from the operator) */
  siteUrl: string;
  /** extra backlink targets */
  backlinks: BlogBacklink[];
  /** category name (category blogs only) */
  category?: string;
  /** focus keyword / phrase the operator wants to rank for (optional) */
  focusKeyword?: string;
  /** free-form extra instructions */
  notes?: string;
  /** embed the product video when present */
  includeVideo: boolean;
  /** HTML feature switches — all default on */
  html: {
    jsonLd: boolean;
    faq: boolean;
    toc: boolean;
    meta: boolean;
    breadcrumbs: boolean;
    lazyImages: boolean;
  };
}

export interface BlogSection {
  heading: string;
  /** paragraphs / list — raw text, one entry per <p>; a leading "- " marks a bullet */
  body: string[];
  /** which backlink URLs to place in this section (by index into config.backlinks or siteUrl) */
  linkUrls?: string[];
  /** optional image url to illustrate this section */
  image?: string;
}

export interface BlogFaq {
  q: string;
  a: string;
}

/** The generated article, structured so the renderer can lay it out any way. */
export interface BlogDoc {
  title: string;
  /** URL slug */
  slug: string;
  /** <meta name="description"> — ≤ 160 chars */
  metaDescription: string;
  /** <title> tag / OG title — ≤ 60 chars ideally */
  seoTitle: string;
  excerpt: string;
  keywords: string[];
  /** short intro before the first heading */
  intro: string[];
  sections: BlogSection[];
  faq: BlogFaq[];
  /** closing call-to-action paragraph (links to the site) */
  cta: string;
  /** hero image url */
  hero?: string;
  /** product video url to embed */
  video?: string;
  /** internal-link ideas the model suggests (anchor + target) */
  internalLinks?: { anchor: string; note: string }[];
  model?: string;
}

export interface BlogSeo {
  /** keyword clusters with rough intent */
  clusters: { name: string; keywords: string[]; intent: string }[];
  /** recommended H2/H3 outline */
  outline: string[];
  /** angles competitors miss */
  gaps: string[];
  /** meta title / description guidance */
  metaTitle: string;
  metaDescription: string;
  /** recommended word count */
  words: number;
  /** any extra notes */
  notes: string;
  model?: string;
}

export interface BlogRecord {
  id: string;
  kind: BlogKind;
  draftId: string | null;
  title: string;
  config: BlogConfig;
  seo: BlogSeo | null;
  doc: BlogDoc | null;
  /** last rendered standalone HTML */
  html: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface BlogSummary {
  id: string;
  kind: BlogKind;
  draftId: string | null;
  title: string;
  hasDoc: boolean;
  updatedAt: string;
}
