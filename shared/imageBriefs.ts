// Detailed, research-backed creative briefs for the AI image / ad studio.
// Each preset is a complete standalone art-direction brief handed to Manus as
// the instruction. They mandate product accuracy and forbid the dropshipping /
// generic-marketplace / AliExpress-Temu look. `buildStudioPrompt()` grounds a
// brief in the ACTUAL product data + photos and fits it to a chosen length band.

export interface ProductLike {
  title?: string;
  titleTranslated?: string;
  props?: Record<string, string>;
  descHtml?: string;
}

const NO_DROPSHIP =
  "ABSOLUTE DON'TS: no dropshipping / AliExpress / Temu / Wish / generic-marketplace aesthetic of any kind — " +
  "that means no cluttered multi-photo collages, no rainbow or neon gradient backdrops, no fake discount " +
  "starbursts, price tags, 'SALE'/'50% OFF' badges, arrows, checkmark bullet call-outs or red circles, no " +
  "watermarks or stock-site logos, no lens-flare kitsch, no plastic-looking HDR, no crushed blacks or blown " +
  "highlights, no over-sharpening halos, no cheap drop-shadowed cut-outs floating on white, no random emoji, " +
  "no stacked text banners, no beauty-retouch plastic skin on hands, no mismatched fake reflections. Keep it " +
  "restrained, expensive-looking and believable. Never invent a different product, never add logos, brand " +
  "names, certifications, prices or claims that are not in the source photos. Any text you render must be in " +
  "English, minimal, correctly spelled and kerned — never Chinese characters. Preserve the product's true " +
  "geometry, proportions, materials, finish and colours exactly as in the source images.";

const NO_DROPSHIP_SHORT =
  "No dropshipping / marketplace look: no collages, gradient/neon backdrops, discount badges, arrows, " +
  "watermarks or HDR. Product stays EXACTLY as photographed — real geometry, materials and colour. English " +
  "text only, minimal. Restrained, premium, believable.";

const ADAPT =
  "ADAPT TO THIS PRODUCT. Everything above is the standard; tune it to the specific item and photos supplied " +
  "below — its real category, materials, finish, scale and theme. Pull the palette, surface and prop choices " +
  "from the product itself. If the product is small, shoot closer; if it is reflective, control the light for " +
  "it; if it has a strong theme, let the set echo it subtly without turning into a costume. When in doubt, do " +
  "less and keep the product honest.";

export const IMAGE_BRIEFS: Record<string, string> = {
  ad:
    "OBJECTIVE. Produce ONE premium e-commerce hero / advertising key-visual that could headline a product " +
    "landing page, a paid social ad or an email banner for an independent, design-led brand. The single job of " +
    "this image is to make the product look desirable, well-made and worth its price in under two seconds.\n\n" +
    "COMPOSITION & LAYOUT. Use a confident, asymmetric layout built on a clear focal point. Place the product " +
    "along a rule-of-thirds line or slightly off-centre, occupying roughly 45–60% of the frame, with generous, " +
    "deliberate negative space on the opposite side so a headline could later be added by the brand (do not add " +
    "the headline yourself unless asked). Give the product room to breathe; nothing should touch the frame edges " +
    "awkwardly. Establish depth with a foreground element slightly out of focus and a clean, uncluttered " +
    "background plane. Horizon and product baselines must be level.\n\n" +
    "PRODUCT TREATMENT. The product is the hero and must be rendered with total fidelity to the source photos — " +
    "same shape, scale relationships, seams, textures, printed markings and colour. Show it from its most " +
    "flattering, information-rich angle (typically a three-quarter view) so a customer understands what it is " +
    "and how it is built.\n\n" +
    "SET, SURFACE & PROPS. Choose ONE tasteful, material-led surface: honed stone, warm matte plaster, brushed " +
    "aluminium, pale oak, linen or seamless painted paper. One or two restrained supporting props at most, only " +
    "if they clarify scale or use; they must never compete with the product. Everything in shot should feel " +
    "chosen by a stylist, not gathered from a bargain bin.\n\n" +
    "LIGHTING. Single-source, directional soft light (large softbox or north-facing window) from about 35–45° " +
    "with a subtle gradient fall-off across the background, plus a gentle fill or bounce so shadows stay open and " +
    "readable (key-to-fill about 3:1). One crisp specular highlight is welcome to describe the material; avoid " +
    "flat, shadowless lighting and avoid harsh multi-shadow chaos.\n\n" +
    "COLOUR & MOOD. Calm, cohesive palette of two or three analogous tones drawn from the product itself, plus a " +
    "neutral. Natural, accurate white balance. Contrast medium-high but never clipped. The finished frame should " +
    "read as understated, modern and premium.\n\n" +
    "CAMERA & FINISH. Full-frame look, ~50–85mm equivalent, aperture around f/5.6 so the product is sharp front " +
    "to back while the background softens gracefully. Subtle, filmic grade; true-to-life retouching only.\n\n" +
    "RESEARCH NOTES. High-performing DTC hero shots share: one subject, one light, one surface; ~40% of the " +
    "frame kept quiet for a future headline; the product's hero angle at eye level or 5–10° above; a real " +
    "contact shadow for weight; palette limited to 3 hues; export at least 2000px on the long edge, sRGB. " +
    "Ad platforms crop to 1:1 and 4:5 — keep the product and any breathing room safe inside a centred 4:5.\n\n" +
    ADAPT + "\n\n" +
    "OUTPUT. High-resolution, sharp, no compression artefacts, colour-managed. " +
    NO_DROPSHIP,

  life:
    "OBJECTIVE. Produce ONE natural, editorial lifestyle photograph that shows the product living in a real, " +
    "aspirational everyday setting for a discerning customer — the kind of image a well-run independent brand " +
    "would publish on its homepage or Instagram grid. It should feel captured, not staged.\n\n" +
    "SCENE & CONTEXT. Build a believable environment appropriate to what the product actually is (for example a " +
    "sunlit desk and keyboard setup, a calm kitchen counter, a linen-dressed bedside table, a studio workbench, " +
    "a reading nook). The space should look lived-in but curated: a few authentic supporting objects with " +
    "genuine wear and personality, arranged loosely rather than in a perfect grid. Include a hint of human " +
    "presence — a hand mid-gesture, a worn notebook, a cup with a real coffee ring — without a full portrait " +
    "unless requested.\n\n" +
    "PRODUCT TREATMENT. The product remains the clear subject and stays 100% faithful to the source photos in " +
    "form, materials, markings and colour. Position it where the eye lands first, in use or ready to be used, at " +
    "a natural angle a person would actually see. It can be partially overlapped by a prop, but its key features " +
    "must stay legible.\n\n" +
    "LIGHTING. Soft, directional natural daylight raking across the scene from a window just out of frame, with " +
    "warm late-morning or golden-hour character and gentle, believable shadows. Allow a little atmosphere — dust " +
    "in a light beam, a soft highlight bloom — but keep it subtle. No obvious artificial or coloured gels.\n\n" +
    "COMPOSITION. Shallow depth of field (~f/2 to f/2.8) with the product tack-sharp and the surroundings " +
    "melting softly. Use leading lines from the environment (a table edge, a cable run, a window frame) to guide " +
    "the eye to the product. Layer foreground, mid-ground and background for depth. Keep the frame calm; every " +
    "object earns its place.\n\n" +
    "COLOUR & MOOD. Warm, muted, cohesive palette — creamy neutrals, soft woods, desaturated accents that echo " +
    "the product. Relaxed, human, slightly imperfect. Natural white balance with a gentle warm bias is fine.\n\n" +
    "CAMERA & FINISH. 35–50mm equivalent, eye-level or a slight top-down for surface scenes. Filmic, low-clarity " +
    "grade with soft roll-off in the highlights and a touch of grain; realistic retouching only — keep real " +
    "textures, skin and imperfections.\n\n" +
    "RESEARCH NOTES. Lifestyle images convert when the setting is plausible for the buyer's own life, the " +
    "product is unmistakably the subject (largest, sharpest, best-lit element), and there is one human cue for " +
    "relatability. Golden-hour or soft window light, ~f/2.8, a three-layer depth stack, and a warm muted grade " +
    "read as 'brand', not 'stock'. Shoot loose enough to crop to 1:1, 4:5 and 9:16.\n\n" +
    ADAPT + "\n\n" +
    "OUTPUT. High-resolution, natural, print-quality. " +
    NO_DROPSHIP,

  collage:
    "OBJECTIVE. Produce ONE refined multi-image composition (a considered montage, not a marketplace collage) " +
    "that presents several views or details of the product together in a single, gallery-quality frame — " +
    "suitable for a lookbook spread, an about page or a considered social carousel cover.\n\n" +
    "LAYOUT SYSTEM. Work to an invisible modular grid with consistent, generous gutters and precise alignment. " +
    "Two to four panels maximum, in varied but harmonious proportions (for example one large establishing image " +
    "plus two supporting detail crops). Panels may sit edge to edge with hairline separation, or float on a " +
    "shared background with equal margins. Every edge and baseline must line up; nothing tilted, nothing " +
    "overlapping haphazardly, no torn-paper or sticker effects.\n\n" +
    "CONTENT OF EACH PANEL. Use the supplied product photos as the source of truth. One panel establishes the " +
    "whole product from a flattering three-quarter angle; the others isolate meaningful details — texture, a " +
    "join, a mechanism, the finish, scale in hand. Keep the product identical across panels: same colour, same " +
    "materials, same markings. If a panel needs a fresh background it must match the others in tone and light.\n\n" +
    "BACKGROUND & SURFACE. A single quiet material palette across the whole piece — seamless paper, plaster, " +
    "stone or pale timber in one or two neutral tones. The composition, not the backdrop, provides the interest." +
    "\n\nLIGHTING. Consistent soft directional light and shadow direction in every panel so the set reads as one " +
    "shoot, not a patchwork. Even exposure across panels; matched white balance; gentle, describing highlights " +
    "on the material.\n\n" +
    "COLOUR & MOOD. Restrained, cohesive, premium. Two or three product-derived tones plus a neutral. Medium " +
    "contrast, accurate colour, no oversaturation. The overall impression is that of a design studio's case " +
    "study, not a discount flyer.\n\n" +
    "TYPOGRAPHY. None, unless explicitly requested; if a caption is unavoidable keep it to one small, perfectly " +
    "kerned English label in a neutral sans-serif.\n\n" +
    "CAMERA & FINISH. Product shots at ~50–85mm equivalent, f/5.6–f/8 for full detail. Subtle unified grade " +
    "across the whole frame; realistic retouching.\n\n" +
    "RESEARCH NOTES. A montage works when it looks art-directed: 2–4 panels on one grid, one establishing shot " +
    "plus detail crops, identical light direction and white balance in every panel, hairline or equal-margin " +
    "gutters, and a single neutral surface. It fails the moment it gains rotation, stickers, borders of " +
    "different weights, or panels lit from different sides.\n\n" +
    ADAPT + "\n\n" +
    "OUTPUT. High-resolution, crisp, perfectly aligned, colour-managed. " +
    NO_DROPSHIP,

  white:
    "OBJECTIVE. Produce ONE flawless studio pack-shot on a clean, near-white background — the catalogue / PDP " +
    "primary image standard used by premium retailers and marketplaces that care about craft. It must look " +
    "physically photographed in a real studio, not cut out or composited.\n\n" +
    "BACKGROUND. Seamless sweep in a very light neutral — bright white to the faintest warm or cool grey (never " +
    "pure #FFFFFF blown flat, never a hard vignette). A soft, natural gradient from slightly brighter behind the " +
    "product to marginally darker at the edges gives dimension. No visible seam line, no paper texture, no " +
    "coloured cast.\n\n" +
    "PRODUCT & ANGLE. The product is centred or on a gentle rule-of-thirds offset, filling roughly 70–85% of the " +
    "frame with even margins on all sides. Show the single most representative angle — usually a clean " +
    "three-quarter hero that reveals form, depth and key features — perfectly level, no keystoning. Absolute " +
    "fidelity to the source photos: identical proportions, materials, seams, printed marks, hardware and colour." +
    "\n\nCONTACT SHADOW. A soft, true-to-physics contact shadow or a subtle mirror reflection directly beneath " +
    "the product to ground it. The shadow is gentle and diffuse, matching the light direction; no drop-shadow " +
    "gimmick, no floating object.\n\n" +
    "LIGHTING. Broad, even, wraparound studio light: a large key softbox at ~30–45°, a fill on the opposite " +
    "side, and a soft top or rim light to separate the product from the background and describe edges. Highlights " +
    "are controlled and shaped, not hot; shadows are open and detailed. The material should read clearly — matte " +
    "reads matte, gloss shows a soft gradient highlight, metal shows a clean specular roll.\n\n" +
    "COLOUR & FINISH. Neutral, accurate white balance and true colour — this image is a colour reference. " +
    "Medium contrast, full detail retained in both highlights and shadows. Tasteful cleanup of dust and " +
    "fingerprints only; do not smooth away real texture or reshape the product.\n\n" +
    "CAMERA. ~85–100mm equivalent to avoid distortion, f/8–f/11 for edge-to-edge sharpness, tripod-steady.\n\n" +
    "RESEARCH NOTES. Premium marketplace primary images: product fills 70–85% of a square frame, centred, level, " +
    "on a 240–255 near-white sweep with a soft floor gradient; one diffuse contact shadow; ~85mm, f/8–f/11; " +
    "neutral white balance so the photo doubles as a colour reference; retouch dust only. Avoid true 255 white, " +
    "hard cut-outs and fake shadows — they read as composited.\n\n" +
    ADAPT + "\n\n" +
    "OUTPUT. High-resolution, ultra-sharp, artefact-free, colour-managed, ready for a premium product page. " +
    NO_DROPSHIP,

  cover:
    "OBJECTIVE. Produce ONE scroll-stopping social cover / thumbnail (works as a square or vertical) for an " +
    "independent brand's channel — Instagram, Pinterest, YouTube or a newsletter header. It must communicate the " +
    "product and a premium mood instantly at small size, and leave clean room for the brand to drop in a short " +
    "headline later.\n\n" +
    "COMPOSITION. Strong, simple, poster-like. Place the product hero on one side (typically the right or lower " +
    "two-thirds), sized large and confident, and reserve a generous, uncluttered zone on the opposite side " +
    "(usually top-left) with a calm, low-detail background so overlaid text would stay legible. Do NOT add the " +
    "headline text yourself unless explicitly asked — just protect the space for it. Keep critical detail away " +
    "from the outer 8% safe margin so nothing important is cropped by platform UI.\n\n" +
    "PRODUCT TREATMENT. Faithful to the source photos in every respect — form, materials, markings, colour. " +
    "Present it at a bold, legible angle; a slight low camera position can add presence. It should still be " +
    "recognisable as a thumbnail 200px wide.\n\n" +
    "BACKGROUND & STYLING. One clean environment or seamless surface with a smooth tonal gradient; a single " +
    "restrained prop or a soft cast shadow for interest is enough. The text-safe area stays quiet.\n\n" +
    "LIGHTING. Directional soft key with a clear but gentle shadow and a subtle rim to lift the product off the " +
    "background. Slightly punchier contrast than a catalogue shot so it survives compression and small sizes, " +
    "but never clipped, never plastic.\n\n" +
    "COLOUR & MOOD. Bold yet tasteful: a tight palette of two or three tones pulled from the product plus one " +
    "neutral, with enough contrast between the product and the text-safe zone. Modern, premium, editorial — not " +
    "loud, not salesy.\n\n" +
    "CAMERA & FINISH. ~35–50mm equivalent, f/4–f/5.6. Crisp, contemporary grade; realistic retouching; a light " +
    "vignette only if it helps focus.\n\n" +
    "RESEARCH NOTES. Thumbnails that stop the scroll use one big subject, one idea, high figure/ground contrast " +
    "and a quiet third of the frame reserved for text. Design for legibility at 200px: test in greyscale, keep " +
    "detail out of the outer 8%, and lift contrast ~10% over a catalogue shot to survive JPEG compression. " +
    "Deliver a 1:1 and a 9:16 crop from the same setup.\n\n" +
    ADAPT + "\n\n" +
    "OUTPUT. High-resolution, sharp at large size and readable when scaled down, colour-managed. " +
    NO_DROPSHIP,

  bg:
    "OBJECTIVE. Keep the supplied product EXACTLY as photographed and replace ONLY its background / environment " +
    "with a clean, modern, premium studio backdrop. This is a background swap, not a redesign of the product.\n\n" +
    "WHAT MUST NOT CHANGE. The product's silhouette, geometry, proportions, perspective, materials, finish, " +
    "printed markings, hardware and colour are locked to the source image. Do not rotate, rescale, straighten, " +
    "retouch, recolour, relight the product body, add parts, remove parts, or clone details. Preserve its " +
    "original edge quality — no halo, no cut-out fringe, no obvious masking line.\n\n" +
    "NEW BACKGROUND OPTIONS. Choose ONE and commit: (a) a seamless near-white to soft-grey studio sweep with a " +
    "gentle gradient; (b) a smooth two-tone brand-neutral gradient (e.g. warm sand to bone, or cool mist to " +
    "pale slate); (c) a subtle real material plane — honed stone, matte plaster, brushed metal, pale oak — shot " +
    "soft and out of focus. The backdrop must be quiet, even and free of pattern, logos or clutter.\n\n" +
    "INTEGRATION. Re-ground the product believably: add or rebuild a soft, physically plausible contact shadow " +
    "and, if the surface warrants it, a faint reflection, both matching the ORIGINAL light direction and " +
    "softness in the product photo. Match colour temperature and ambient bounce between product and new " +
    "background so it looks shot in place, not pasted. A very light, natural fall-off of light across the " +
    "backdrop is welcome; keep it subtle.\n\n" +
    "COLOUR & FINISH. Neutral, accurate white balance. The new background should flatter, not fight, the " +
    "product's own colours — pull the backdrop tones from a muted neighbour of the product palette. Medium " +
    "contrast, full detail, no oversaturation, no HDR crunch.\n\n" +
    "RESEARCH NOTES. A convincing background swap keeps the original product pixels untouched, rebuilds a " +
    "contact shadow that matches the source light angle and softness, and colour-matches ambient bounce so the " +
    "edge disappears. The tells of a bad swap: a crisp haloed outline, a shadow going the wrong way, a " +
    "temperature mismatch, or the product suddenly sharper than its new surroundings.\n\n" +
    ADAPT + "\n\n" +
    "OUTPUT. High-resolution, sharp, seamless composite with an invisible product edge, colour-managed. " +
    NO_DROPSHIP,
};

/* -------------------- picker metadata + prompt builder -------------------- */

export interface BriefMeta {
  key: string;
  tr: string;
  en: string;
  /** one-line "what the research says" shown in the picker */
  research: string;
  /** ~1–3 sentence essence, used when the chosen length band is very short */
  core: string;
}

export const BRIEF_META: BriefMeta[] = [
  {
    key: "ad",
    tr: "Reklam / hero görsel",
    en: "Ad / hero visual",
    research:
      "Tek özne, tek ışık, tek yüzey; karenin ~%40'ı başlık için boş; ürünün en iyi açısı; gerçek temas gölgesi; 3 renk. 1:1 ve 4:5 kırpımına göre güvenli kur.",
    core:
      "One premium hero shot of the product on a single material surface, three-quarter hero angle, one soft directional light with a real contact shadow, ~40% negative space on one side for a future headline, tight 3-tone palette, level horizon, sharp at f/5.6.",
  },
  {
    key: "life",
    tr: "Yaşam tarzı / editorial",
    en: "Lifestyle / editorial",
    research:
      "Alıcının hayatına uygun, inandırıcı sahne; ürün açıkça özne (en büyük/net/iyi ışıklı); tek insan ipucu; altın saat / pencere ışığı; ~f/2.8; sıcak-mat grade.",
    core:
      "One captured-not-staged lifestyle photo: the product clearly the subject in a believable real setting for its buyer, soft golden window light, shallow depth of field (~f/2.8), one subtle human cue, warm muted cohesive palette, room to crop 1:1 / 4:5 / 9:16.",
  },
  {
    key: "collage",
    tr: "Montaj / lookbook",
    en: "Montage / lookbook",
    research:
      "Sanat yönetimli 2–4 panel, tek ızgara; bir kurucu çekim + detay kırpımları; her panelde aynı ışık yönü ve beyaz dengesi; ince/eşit boşluklar; tek nötr zemin.",
    core:
      "One gallery-quality montage on an invisible grid: 2–4 aligned panels (one establishing three-quarter shot plus detail crops), identical light direction and white balance across panels, hairline or equal-margin gutters, one neutral surface, no tilt or stickers.",
  },
  {
    key: "white",
    tr: "Stüdyo beyaz pack-shot",
    en: "Studio white pack-shot",
    research:
      "Ürün karenin %70–85'i, ortada, düz; 240–255 beyaza yakın sweep + yumuşak zemin degrade; tek difüz temas gölgesi; ~85mm f/8–f/11; nötr beyaz denge (renk referansı).",
    core:
      "One flawless studio pack-shot on a seamless near-white sweep (not pure 255), product filling 70–85% of a square frame, centred and level, one soft physical contact shadow, wraparound key+fill+rim light, ~85–100mm at f/8–f/11, neutral accurate colour, dust cleanup only.",
  },
  {
    key: "cover",
    tr: "Sosyal kapak / thumbnail",
    en: "Social cover / thumbnail",
    research:
      "Tek büyük özne, tek fikir, yüksek figür/zemin kontrastı; metin için sessiz bir üçte bir; 200px'te okunur (griye çevirip test et); dış %8 güvenli; ~%10 fazla kontrast.",
    core:
      "One poster-like social cover/thumbnail: product hero large on one side, a calm low-detail zone on the other for a future headline, high figure/ground contrast, readable at 200px, critical detail inside the safe area, slightly punchier contrast, deliver 1:1 and 9:16.",
  },
  {
    key: "bg",
    tr: "Arka planı değiştir",
    en: "Background swap",
    research:
      "Orijinal ürün pikselleri dokunulmaz; kaynak ışık açısına uygun temas gölgesi yeniden kurulur; ortam rengi eşlenir ki kenar kaybolsun. Halo / ters gölge / sıcaklık uyuşmazlığı = kötü swap.",
    core:
      "Keep the supplied product pixels EXACTLY as photographed and replace only the background with one quiet premium studio backdrop (near-white sweep, soft two-tone gradient, or out-of-focus material plane); rebuild a contact shadow matching the source light angle and softness; colour-match ambient bounce so the edge is invisible.",
  },
];

/** 30 WORD-count bands: "0-100", "100-200", … "2900-3000" (words, not characters). */
export const IMAGE_LENGTH_BANDS: string[] = Array.from({ length: 30 }, (_, i) => `${i * 100}-${(i + 1) * 100}`);

function bandCap(band?: string): number {
  if (!band) return Infinity;
  const m = /^(\d+)-(\d+)$/.exec(band.trim());
  return m ? Number(m[2]) : Infinity;
}

/** Split on whitespace into words (drops empties). */
function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}
export function wordCount(text: string): number {
  return words(text).length;
}

/** Trim text to <= maxWords words, cutting at a sentence boundary when close. */
function fitWords(text: string, maxWords: number): string {
  const w = words(text);
  if (w.length <= maxWords) return text;
  const cut = w.slice(0, Math.max(1, maxWords)).join(" ");
  const dot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  if (dot > cut.length * 0.5) return cut.slice(0, dot + 1);
  return cut.replace(/[\s,;:–-]+$/, "") + "…";
}

/** One "THIS SPECIFIC PRODUCT" grounding block from the real product + photos. */
export function productGrounding(
  p: ProductLike | null | undefined,
  imageCount = 0,
  theme?: string,
  compact = false,
): string {
  const name = (p?.titleTranslated || p?.title || "the product").replace(/\s+/g, " ").trim();
  const props = Object.entries(p?.props || {})
    .filter(([k, v]) => k && v && String(v).trim())
    .slice(0, compact ? 6 : 12)
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("; ");
  if (compact) {
    return [
      `THIS SPECIFIC PRODUCT: "${name}".`,
      props ? `Honour: ${props}.` : "",
      theme && !/theme/i.test(props) ? `Theme: ${theme}.` : "",
      "The attached photo(s) are the only source of truth for shape, materials and colour — never invent a different product.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const descBit = (p?.descHtml || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return [
    `THIS SPECIFIC PRODUCT — build the image around it and nothing else: "${name}".`,
    props ? `Known attributes (honour every one): ${props}.` : "",
    theme ? `Theme / vibe to echo subtly: ${theme}.` : "",
    descBit ? `Extra context: ${descBit}` : "",
    imageCount
      ? `${imageCount} product photo(s) are attached — treat them as the single source of truth for shape, scale, materials, finish, printed markings and colour. Do NOT invent a different product or add anything not visible in them.`
      : "Use the attached product photo(s) as the single source of truth; never invent a different product.",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface BuildStudioPromptOpts {
  typeKey: string;
  band?: string;
  product?: ProductLike | null;
  imageCount?: number;
  theme?: string;
  /** operator's own extra sentence(s), appended verbatim */
  extra?: string;
}

/**
 * The final art-direction prompt handed to the studio: always product-grounded,
 * fitted to the requested WORD-count band. Short bands use the compact `core`
 * essence; longer bands use the full researched brief, trimmed on a word boundary.
 */
export function buildStudioPrompt(opts: BuildStudioPromptOpts): string {
  const meta = BRIEF_META.find((m) => m.key === opts.typeKey) || BRIEF_META[0];
  const cap = bandCap(opts.band); // word cap, e.g. 100/200/…/3000, or Infinity for "full"
  const compact = cap !== Infinity && cap < 150;
  const grounding = productGrounding(opts.product, opts.imageCount || 0, opts.theme, compact);
  const extra = opts.extra?.trim() || "";
  const groundingWords = wordCount(grounding);
  const extraWords = extra ? wordCount(extra) : 0;

  const bodyBudget = cap === Infinity ? Infinity : Math.max(15, cap - groundingWords - extraWords - 1);

  let body: string;
  if (cap !== Infinity && cap <= 120) {
    body = fitWords(`${meta.core} ${NO_DROPSHIP_SHORT}`, Math.max(20, bodyBudget));
  } else {
    const full = IMAGE_BRIEFS[meta.key] || meta.core;
    body = wordCount(full) <= bodyBudget ? full : fitWords(full, bodyBudget) + "\n\n" + NO_DROPSHIP_SHORT;
  }

  let out = [grounding, body, extra].filter(Boolean).join("\n\n");
  // final safety trim so the total roughly honours the requested band
  if (cap !== Infinity && wordCount(out) > cap + 25) out = fitWords(out, cap + 8);
  return out;
}
