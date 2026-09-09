// Model catalogue shared by server (pricing / validation) and client (dropdowns).

export interface ClaudeModel {
  id: string;
  label: string;
  /** USD per 1M tokens */
  inPer1M: number;
  outPer1M: number;
  tier: "opus" | "sonnet" | "haiku" | "fable";
}

// Cached from the Anthropic pricing table. Any id here is selectable in the UI.
export const CLAUDE_MODELS: ClaudeModel[] = [
  { id: "claude-opus-5", label: "Opus 5 · most capable", inPer1M: 5, outPer1M: 25, tier: "opus" },
  { id: "claude-opus-4-8", label: "Opus 4.8", inPer1M: 5, outPer1M: 25, tier: "opus" },
  { id: "claude-opus-4-7", label: "Opus 4.7", inPer1M: 5, outPer1M: 25, tier: "opus" },
  { id: "claude-opus-4-6", label: "Opus 4.6", inPer1M: 5, outPer1M: 25, tier: "opus" },
  { id: "claude-sonnet-5", label: "Sonnet 5 · balanced (default)", inPer1M: 2, outPer1M: 10, tier: "sonnet" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", inPer1M: 3, outPer1M: 15, tier: "sonnet" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 · cheapest", inPer1M: 1, outPer1M: 5, tier: "haiku" },
  { id: "claude-fable-5", label: "Fable 5 · top tier", inPer1M: 10, outPer1M: 50, tier: "fable" },
];

export function claudePricing(id: string): { inPer1M: number; outPer1M: number } {
  return CLAUDE_MODELS.find((m) => m.id === id) ?? { inPer1M: 2, outPer1M: 10 };
}

export const MANUS_AGENT_PROFILES = ["manus-1.6-lite", "manus-1.6", "manus-1.6-max"] as const;
export type ManusAgentProfile = (typeof MANUS_AGENT_PROFILES)[number];

/** Claude effort: "faster" (low) -> "smarter" (max). GA, no beta header. */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];
export const EFFORT_LABEL: Record<Effort, string> = {
  low: "low · en hızlı",
  medium: "medium",
  high: "high · dengeli",
  xhigh: "xhigh",
  max: "max · en zeki",
};
/** Fast mode (2.5x output speed, premium price) — research preview, these models only. */
export const FAST_MODELS = ["claude-opus-5", "claude-opus-4-8"];

/* --------------------------- listing generation --------------------------- */

/** Built-in "Ürün türü" presets; the operator can save more (Settings.productTypes). */
export const DEFAULT_PRODUCT_TYPES = ["keycap set", "keyboard", "ita bag", "bag", "mouse", "deskmat"];

/**
 * Shopify HTML description target length, measured in LINES of rendered HTML
 * (a line ≈ 45 characters). 100-line bands from 100 to 2000.
 */
export const HTML_LENGTH_BANDS: string[] = Array.from({ length: 20 }, (_, i) => `${(i + 1) * 100}-${(i + 2) * 100}`);
/** Rough characters-per-line used to convert the line band into a char budget. */
export const CHARS_PER_LINE = 45;

/**
 * Shopify HTML description target measured in CHARACTERS (spaces + all symbols
 * included). Calibrated against real listings: ~850 lines of HTML ≈ 30,000–38,000
 * characters. Used when the operator picks "Karakter" as the length unit.
 */
export const HTML_CHAR_BANDS: string[] = [
  "6000-10000",
  "10000-16000",
  "16000-22000",
  "22000-30000",
  "30000-38000",
  "38000-48000",
  "48000-60000",
];

export type HtmlLengthUnit = "line" | "char";

/**
 * HTML description "cost / length" budget. The generator sizes the description
 * automatically from the product (how many description images, how many specs,
 * how long the source copy, how many variants) — then this factor scales that
 * auto target AND the generation token budget so the operator can trade richness
 * for cost.
 */
export type HtmlBudget = "full" | "lean" | "min";
export const HTML_BUDGETS: { key: HtmlBudget; factor: number; tr: string; en: string }[] = [
  { key: "full", factor: 1, tr: "Klasik", en: "Classic" },
  { key: "lean", factor: 0.75, tr: "%25 az token", en: "25% fewer tokens" },
  { key: "min", factor: 0.5, tr: "%50 az token", en: "50% fewer tokens" },
];
export const htmlBudgetFactor = (b?: string): number =>
  HTML_BUDGETS.find((x) => x.key === b)?.factor ?? 1;

/** Aspect-ratio presets for the per-image description crop. "" = natural / no crop. */
export const DESC_CROP_ASPECTS: { value: string; label: string }[] = [
  { value: "", label: "Orijinal" },
  { value: "1/1", label: "1:1" },
  { value: "4/3", label: "4:3" },
  { value: "3/2", label: "3:2" },
  { value: "16/9", label: "16:9" },
  { value: "5/3", label: "5:3" },
  { value: "5/2", label: "5:2" },
  { value: "10/3", label: "10:3" },
  { value: "30/7", label: "30:7" },
  { value: "3/4", label: "3:4 (dikey)" },
  { value: "2/3", label: "2:3 (dikey)" },
];

/** 3×3 focus grid → object-position % for the description crop. */
export const DESC_CROP_ANCHORS: { key: string; x: number; y: number; label: string }[] = [
  { key: "tl", x: 0, y: 0, label: "↖" },
  { key: "tc", x: 50, y: 0, label: "↑" },
  { key: "tr", x: 100, y: 0, label: "↗" },
  { key: "ml", x: 0, y: 50, label: "←" },
  { key: "mc", x: 50, y: 50, label: "•" },
  { key: "mr", x: 100, y: 50, label: "→" },
  { key: "bl", x: 0, y: 100, label: "↙" },
  { key: "bc", x: 50, y: 100, label: "↓" },
  { key: "br", x: 100, y: 100, label: "↘" },
];

export interface DescStyle {
  key: string;
  tr: string;
  en: string;
  /** one-line guidance handed to the model */
  guide: string;
}

/** 20 description tones/styles. "product" = read the product and match its own character. */
export const DESC_STYLES: DescStyle[] = [
  { key: "product", tr: "Ürün tarzında", en: "Product-led", guide: "Read the product itself and match its own character, audience and vibe." },
  { key: "simple", tr: "Basit", en: "Simple", guide: "Plain, direct, no fluff. Short sentences, everyday words." },
  { key: "cute", tr: "Sevimli", en: "Cute", guide: "Warm, sweet, playful; gentle emoji, endearing phrasing." },
  { key: "cool", tr: "Havalı", en: "Cool", guide: "Confident, effortless, trend-aware; punchy lines." },
  { key: "professional", tr: "Profesyonel", en: "Professional", guide: "Polished, precise, benefit-driven; no slang." },
  { key: "minimal", tr: "Minimal", en: "Minimal", guide: "Very sparse. A few essential lines, lots of whitespace." },
  { key: "premium", tr: "Premium", en: "Premium", guide: "Refined, quality-obsessed, understated confidence." },
  { key: "anime", tr: "Anime", en: "Anime", guide: "Fan-facing, energetic, references the theme/franchise vibe." },
  { key: "colorful", tr: "Renkli", en: "Colorful", guide: "Vivid, expressive, sensory; lean into colour and mood." },
  { key: "playful", tr: "Eğlenceli", en: "Playful", guide: "Fun, cheeky, light humour; keeps it lively." },
  { key: "elegant", tr: "Şık", en: "Elegant", guide: "Graceful, tasteful, calm; elevated but readable." },
  { key: "dark", tr: "Dark", en: "Dark", guide: "Moody, sleek, low-key dramatic; noir palette in words." },
  { key: "pastel", tr: "Pastel", en: "Pastel", guide: "Soft, airy, gentle; muted, soothing tone." },
  { key: "retro", tr: "Retro", en: "Retro", guide: "Nostalgic, vintage nods, warm throwback feel." },
  { key: "futuristic", tr: "Fütüristik", en: "Futuristic", guide: "Sleek, forward-looking, techy but human." },
  { key: "gaming", tr: "Gaming", en: "Gaming", guide: "Setup/rig oriented, performance language, gamer-native." },
  { key: "luxury", tr: "Luxury", en: "Luxury", guide: "Exclusive, crafted, aspirational; scarcity and detail." },
  { key: "clean", tr: "Clean", en: "Clean", guide: "Crisp, uncluttered, scannable; tidy structure." },
  { key: "bold", tr: "Bold", en: "Bold", guide: "Big claims, strong verbs, high contrast statements." },
  { key: "creative", tr: "Creative", en: "Creative", guide: "Imaginative, story-driven, unexpected angles." },
];

/** Keyword vocabulary the model may draw title adjectives from — per product, only if they fit. */
export const TITLE_VOCAB: string[] = [
  "Artisan", "Handmade", "Custom", "Themed", "Novelty", "Aesthetic", "Kawaii", "Cute",
  "Gradient", "Ombre", "Pastel", "Translucent", "Backlit", "Minimalist", "Retro", "Vintage",
  "Cyberpunk", "Futuristic", "Premium", "Luxury", "Cozy", "Gaming", "Anime", "Colorful",
  "Green", "Pink", "Black", "White", "Blue", "Purple", "Beige", "Wood-tone",
  "PBT", "Dye-Sub", "Cherry Profile", "MOA Profile", "SA Profile", "Hot-swap", "MX Compatible",
];
