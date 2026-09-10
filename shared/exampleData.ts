// Baked-in reference examples so the operator doesn't re-paste them every time.
// Fed to the AI as the default `examples` for a field when the operator hasn't
// supplied their own. The tag vocabularies also seed / rank the tag candidates.

/* ------------------------------- Etsy ------------------------------- */

export const ETSY_TITLE_EXAMPLES = [
  "Cute White Crystal Jelly Cat Keycap Set for Mechanical Keyboard | Kawaii Artisan Keycaps, MAO Profile Design – KeyArtisan®",
  "One Piece Theme Anime Artisan Keycap Set | Pirate Adventure Keycaps, MOA & Cherry Profile, PBT Dye-Sub – KeyArtisan®",
  "Cozy Cafe Theme Coffee Latte Keycap Set for Mechanical Keyboard | Mocha & Plaid Design Keycaps – KeyArtisan®",
  "Cute Ita Bag Kawaii School Backpack with Clear Window | Anime Pin Plush Display Bag – CutieGiftsUS®",
].join("\n");

export const ETSY_DESC_EXAMPLE = [
  "✨ Ever wanted your mechanical keyboard to feel like a pirate adventure?",
  "",
  "The One Piece Anime Artisan Keycap Set brings colorful chibi characters, treasure motifs, and ocean-voyage vibes straight to your desk. Inspired by epic journeys and beloved crewmates, every key feels like a tiny scene from a grand adventure.",
  "",
  "With expressive character novelties, map details, barrels, ships, and iconic symbols, this set blends warm reds, sandy beiges, ocean blues, and wood-tone browns for a playful yet collectible look.",
  "",
  "💖 𝐇𝐢𝐠𝐡𝐥𝐢𝐠𝐡𝐭 𝐅𝐞𝐚𝐭𝐮𝐫𝐞𝐬",
  "",
  "Premium PBT Keycaps – Thick, durable, shine-resistant",
  "Dye-Sublimation Printing – Crisp, long-lasting artwork",
  "Anime Pirate Theme – Chibi characters, treasure, ships & maps",
  "Two Profile Options – MOA (soft & rounded) / Cherry (classic)",
  "Full 142-Key Set – Broad layout support for custom builds",
  "",
  "🧱 𝐌𝐚𝐭𝐞𝐫𝐢𝐚𝐥 & 𝐁𝐮𝐢𝐥𝐝",
  "",
  "High-quality PBT",
  "Dye-sublimated legends and novelties",
  "Designed for daily use and collectors alike",
  "",
  "⚙️ 𝐒𝐩𝐞𝐜𝐢𝐟𝐢𝐜𝐚𝐭𝐢𝐨𝐧𝐬 & 𝐂𝐨𝐦𝐩𝐚𝐭𝐢𝐛𝐢𝐥𝐢𝐭𝐲",
  "",
  "Profile Options: MOA / Cherry",
  "Key Count: 142 keys (both variations)",
  "Layout Compatibility: ANSI & ISO",
  "Supports most standard layouts (including full-size & customs)",
  "Switch Compatibility: MX-style (cross) mechanical switches",
  "⚠️ Not compatible with membrane or low-profile keyboards",
  "",
  "📦 𝐍𝐨𝐭𝐞",
  "This listing is for keycaps only.",
  "Keyboard and accessories shown in photos are for display purposes only.",
  "",
  "💬 Need help with compatibility?",
  "Message us anytime — we’re happy to help and typically reply within 24 hours.",
  "",
  "🌊 𝐒𝐞𝐭 𝐒𝐚𝐢𝐥 𝐟𝐨𝐫 𝐀𝐝𝐯𝐞𝐧𝐭𝐮𝐫𝐞",
  "Bold, playful, and full of adventure.",
  "The One Piece Theme Anime Artisan Keycap Set is perfect for anime fans, collectors, and mechanical keyboard lovers who want a fun, story-driven setup that stands out.",
].join("\n");

/** ~250 real Etsy tag phrases the operator uses — the search vocabulary. */
export const ETSY_TAG_VOCAB: string[] = `
artisan keycaps, artisan keycap set, cute keycaps, cute keycap set, kawaii keycaps, kawaii keycap set,
pastel keycaps, pastel keycap set, mechanical keyboard, custom keycaps, cozy keycaps, pbt keycaps,
pink keycap set, pink keycaps, keyboard keycaps, anime keycap set, anime keycaps, cool keycaps,
cozy keycap set, backlit keycaps, cherry keycaps, bear keycaps, cool keycap set, custom keycap set,
blue keycaps, cat keycap set, red keycaps, bear keycap set, blue keycap set, moa keycap set,
cat keycaps, gothic keycaps, moa keycaps, red keycap set, 65 keyboard, barebones keyboard,
cafe keycaps, compact keyboard, custom keyboard, cute keyboard, green keycaps, kawaii keyboard,
keycap set, rgb keyboard, tri mode keyboard, bunny keycaps, gothic keycap set, pastel keyboard,
pink keyboard, white keycaps, iso keycaps, pbt keycap set, keyboard caps, mda keycaps,
gamer girl gift, key cap set, backlit keycap set, iso keycap set, purple keycap set, cherry keycap set,
japanese keycaps, purple keycaps, cartoon keycaps, colorful keycaps, gamer gifts, gradient keycap set,
green keycap set, black keycaps, chiikawa keycaps, graffiti keycap set, iso keycap, japanese keycap set,
keyboard keycap, matcha keycap set, matcha keycaps, clear window bag, kawaii ita bag, cute ita bag,
anime ita bag, display ita bag, cute display bag, anime display bag, kawaii display bag, pin display bag,
cute shoulder bag, display anime bag, cute backpack, kawaii school bag, kawaii backpack,
kawaii shoulder bag, plush display bag, anime backpack, cute school bag, school ita bag,
cute crossbody bag, display backpack, ita backpack, ita shoulder bag, anime pin bag, cute anime bag,
cute school backpack, anime school bag, crossbody ita bag, photo card bag, shoulder ita bag,
star ita bag, cute ita backpack, display shoulder bag, ita crossbody bag, mini ita bag, plush ita bag,
school backpack, heart ita bag, kawaii crossbody bag, lace ita bag, badge display bag, black ita bag,
cat ita bag, charm ita bag, clear window ita bag, display school bag, display window bag,
ita bag for girls, ita handbag
`
  .split(/[,\n]/)
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/* ------------------------------ Shopify ----------------------------- */

export const SHOPIFY_TITLE_EXAMPLES = [
  "PIIFOX Eva Unit-01 Metallic Style Keycap Set",
  "Ancient Chinese Theme Artisan Keycap Set",
  "MU02 Mountain Seclusion Mechanical Keyboard",
  "Super Mario Bros. Layered Resin Artisan Keycap",
  "Harry Potter Themed Artisan Keycap Set & Keyboard",
].join("\n");

/** A slice of the operator's large Shopify tag list — the search vocabulary. */
export const SHOPIFY_TAG_VOCAB: string[] = `
Keycap Set, PBT Dye-Sub, Themed Keycaps, ISO Layout, Cherry Profile, ANSI Layout, ansi iso keycap set,
Artisan Keycap, Artisan Keycap Set, Artisan Keycaps, aesthetic keycaps, aesthetic keycap set,
Anime Keycap Set, Anime Keycaps, anime keycap collection, Backlit Keycap, backlit keycaps,
Bear Keycaps, bear keycap set, beige keycap set, beige keycaps, Black Keycap Set, Black Keycaps,
Blue Keycap Set, Blue Keycaps, Bold Keycaps, Brown Keycap Set, Brown Keycaps, Cafe Keycap Set,
Cafe Keycaps, Capybara Keycap Set, Cat Keycap Set, Cat Keycaps, Cherry MX, Cherry Profile Keycap Set,
Cherry Profile Keycaps, Chiikawa Keycap Set, Coffee Keycap Set, Coffee Keycaps, Colorful Keyboard,
Cool Keycap Set, Cool Keycaps, Cozy Keycap Set, Cozy Keycaps, custom keyboard, Custom Keycaps,
custom keycap set, cute keycap set, Cute Keycaps, Dog Keycap Set, Dog Keycaps, dye sub keycaps,
Dye Sublimation, dye-sublimation keycaps, dye sub keycap set, durable keycaps, premium keycaps,
premium keycap set, PBT keycap set, PBT keycap, Floral Keycap Set, Floral Keycaps, FOA Keycaps,
FOA Profile, Full Dye-Sub Keycaps, Gamer Keycap Set, Gaming Keycap Set, gaming keycaps,
Gothic Keycap Set, Gothic Keycaps, Gradient Keycap Set, Gradient Keycaps, Graffiti Keycap Set,
Green Keycap Set, green keycaps, Harry Potter Keycap Set, Hatsune Miku Keycap Set,
Hello Kitty Keycap Set, ISO Keycap Set, ISO Keycaps, Japanese Keycaps, japanese keycap set,
Jelly Keycap Set, Jelly Keycaps, jelly style keycaps, kawaii keycap set, kawaii keycaps,
Keycap, keycaps, keyboard keycaps, MAO Keycap Set, MAO Keycaps, MAO Profile, Matcha Keycap Set,
Matcha Keycaps, MDA Keycaps, MDA Profile, mechanical keyboard keycaps, Metallic Keycap Set,
MOA Keycap Set, MOA Keycaps, MOA Profile, mx compatible keycaps, MX Keycaps, MX Style Keycaps,
Orange Keycap Set, Pastel Keycap Set, Pastel Keycaps, pastel aesthetic keycaps, PBT + PC Keycap Set,
PBT Keycap Set, PBT Keycaps, PC Keycaps, Pink Keycap Set, Pink Keycaps, Pixel Keycap Set,
Pixel Keycaps, Purple Keycap Set, Purple Keycaps, Resin Keycap, resin keycap set, Retro Keycap Set,
Retro Keycaps, Round Keycap Set, Round Keycaps, Simple Keycap Set, Simple Keycaps, SOA Keycaps,
soft keycap set, themed keycap set, Themed Keycap Set, unique keycap set, White Keycap Set,
White Keycaps, Yellow Keycap Set, Yellow Keycaps, novelty keycaps, novelty keycap set,
collectible keycaps, decorative keycaps, keycap set for mechanical keyboard, replacement keycaps,
replacement keycap set, keyboard customization, keycap upgrade, artisan keycap collection,
gift for keyboard lover, gift for gamer, mechanical keyboard accessories, keyboard accessories,
XDA Profile, DSA Profile, SA Profile, ASA Profile, KAT Profile, XVX Profile
`
  .split(/[,\n]/)
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Reference example for the "Alt alta görsel" (self-contained) Shopify description
 * — v3 of the `.bm` sticky-gallery block, provided by the operator. The model
 * reproduces this STRUCTURE + full `<style>` + every `.bm*` class and section
 * (hero, trivia line, highlights, compatible-layouts chip row, specs, a PBT-vs-ABS
 * compare table, FAQ, note, CTA, trust row) but RE-THEMES it per product: palette
 * vars, hero emoji, series label and all copy follow the product (a red product ->
 * red/scarlet vars, a mint product -> green vars). Target ~29,000-30,000 characters
 * incl. spaces & symbols; the operator length band overrides that when set.
 * The renderer fills the empty <div class="bm-media"></div> with the real product
 * photos and guarantees the .bm-lightbox node + <script> are present.
 * NOTE: the FAQ is a native <details>/<summary> (NO JavaScript — Shopify strips
 * <script>, so a JS accordion never opens); the CTA <button> also carries an
 * inline onclick so it works even with every <script> removed.
 */
export const STACKED_DESC_EXAMPLE = `<style>
/* ===== Stacked-image product description v3 — RE-THEME the palette per product
   (a red product → red/scarlet vars, a mint product → green vars, …). Keep every
   .bm* class name, every animation, the jitter-free hover technique, and this
   section set. Target ~29,000–30,000 characters incl. spaces & symbols (the
   operator's length band overrides this when set). ===== */
.bm{
  --ink:#4a3820; --soft:#8a7355; --gold:#c98a1f; --gold2:#f0c674;
  --lav:#fff8e6; --sky:#fff3d6; --milk:#fffefb; --line:rgba(201,138,31,.18);
  --line2:rgba(201,138,31,.32);
  --top:20px;            /* sticky offset — raise to ~90px if your theme has a fixed header */
  --r:16px;
  font-family:"Trebuchet MS",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,
    "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;
  color:var(--ink); line-height:1.62; text-align:left; overflow-wrap:break-word;
  width:100%; max-width:1160px; margin:0 auto; padding:0; position:relative;
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
}
.bm *{box-sizing:border-box; min-width:0; max-width:100%}
.bm p{margin:0 0 10px}
.bm div,.bm span,.bm ul,.bm li,.bm p,.bm h2,.bm h3,.bm h4,.bm button{float:none !important}
.bm button{font:inherit; cursor:pointer}

/* ---- smoothness safeguards: never scale/skew text, always integer-px moves ----
   Sub-pixel or scaled transforms on text force the browser to re-rasterize the
   glyphs on every frame, which reads as text "thickening" or flickering on hover.
   Every hover effect below moves things with translateY() in whole pixels only,
   and text-bearing elements are pinned to their own compositor layer so the
   browser never has to recompute font hinting mid-hover. */
@media (prefers-reduced-motion:reduce){
  .bm *{animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; scroll-behavior:auto !important}
}
/* NOTE: reveal is visible by default — Shopify's editor removes scripting, so a
   JS-gated opacity:0 would leave the whole block invisible. Keep it at opacity:1
   always; the transition only smooths a class change if JS is present. */
.bm-reveal{opacity:1; transform:none; transition:opacity .55s ease, transform .55s ease}
.bm-reveal.bm-show{opacity:1; transform:none}
.bm-toggle{position:absolute; width:1px; height:1px; opacity:0; pointer-events:none}
.bm-bar{display:none}
.bm-c1,.bm-c2{display:block}
.bm-inner{display:block}
.bm-hero{
  position:relative; overflow:hidden;
  text-align:center; padding:34px 20px 26px; margin:0 0 16px;
  border:1px solid var(--line); border-radius:var(--r);
  background:linear-gradient(165deg,#fff3d6 0%,#fffaf0 55%,#fffefb 100%);
}
.bm-hero::before,.bm-hero::after{
  content:"🐰"; position:absolute; font-size:46px; opacity:.16; pointer-events:none;
  animation:bmFloat 7s ease-in-out infinite;
}
.bm-hero::before{top:-8px; left:4%; animation-delay:0s}
.bm-hero::after{bottom:-14px; right:6%; font-size:60px; animation-delay:1.6s}
@keyframes bmFloat{0%,100%{transform:translateY(0) rotate(-4deg)} 50%{transform:translateY(-10px) rotate(4deg)}}
.bm-eyebrow{
  display:inline-block; font-size:11px; letter-spacing:.18em; text-transform:uppercase;
  color:var(--gold); background:#fff; border:1px solid var(--line);
  padding:5px 12px; border-radius:99px; margin-bottom:12px; animation:bmPop .5s ease both;
}
.bm-hero h2{margin:0 0 8px; font-size:27px; line-height:1.25; color:#7a5a12; font-weight:700; position:relative}
.bm-hero .sub{margin:0 0 15px; font-size:14px; color:var(--soft); position:relative}
.bm-badges{display:flex; flex-wrap:wrap; gap:8px; justify-content:center; position:relative}
.bm-badges span{
  display:inline-block; font-size:12.5px; color:#7a5a12; background:#fff; border:1px solid var(--line);
  padding:6px 12px; border-radius:99px; white-space:nowrap;
  backface-visibility:hidden; -webkit-backface-visibility:hidden;
  transition:transform .3s cubic-bezier(.4,0,.2,1), box-shadow .3s cubic-bezier(.4,0,.2,1), background .3s cubic-bezier(.4,0,.2,1), border-color .3s cubic-bezier(.4,0,.2,1);
}
.bm-badges span:hover{transform:translateY(-2px); box-shadow:0 8px 16px -6px rgba(201,138,31,.35); background:var(--sky); border-color:var(--line2); cursor:default}
@keyframes bmPop{from{opacity:0; transform:translateY(-6px)} to{opacity:1; transform:translateY(0)}}
.bm-grid{display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:18px; align-items:start; transition:gap .45s cubic-bezier(.25,.8,.3,1)}
.bm-media{grid-column:1; grid-row:1}
.bm-c2{grid-column:2; grid-row:1; position:-webkit-sticky; position:sticky; top:var(--top); align-self:start}
.bm-media{font-size:0; line-height:0; border-radius:var(--r); overflow:hidden; border:1px solid var(--line); background:var(--milk)}
.bm-media .bm-stage{position:relative; cursor:zoom-in}
.bm-media img{
  display:block !important; width:100% !important; height:auto;
  margin:0 !important; padding:0 !important; border:0 !important;
  vertical-align:top; border-radius:0 !important; max-width:100%;
  backface-visibility:hidden; -webkit-backface-visibility:hidden;
  transition:transform .5s cubic-bezier(.25,.8,.3,1); cursor:zoom-in; background:var(--sky);
}
.bm-media img:hover{transform:scale(1.025)}
.bm-media .bm-zoomtag{
  position:absolute; right:10px; bottom:10px; z-index:2;
  font-size:11.5px; font-weight:700; color:#7a5a12; background:rgba(255,255,255,.92);
  border:1px solid var(--line); padding:9px 14px; border-radius:99px; line-height:1;
  opacity:0; transform:translateY(6px); transition:opacity .25s ease, transform .25s ease; pointer-events:none;
}
.bm-media .bm-stage:hover .bm-zoomtag{opacity:1; transform:translateY(0)}
.bm-lightbox{position:fixed; inset:0; z-index:9999; display:none; align-items:center; justify-content:center; padding:26px; background:rgba(40,30,10,.82); backdrop-filter:blur(2px); animation:bmFade .2s ease}
.bm-lightbox.is-open{display:flex}
.bm-lightbox img{max-width:min(92vw,900px); max-height:88vh; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.4)}
.bm-lightbox .bm-close{
  position:absolute; top:18px; right:18px; width:38px; height:38px; border-radius:50%;
  border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.12); color:#fff;
  font-size:18px; line-height:1; display:flex; align-items:center; justify-content:center;
  backface-visibility:hidden; -webkit-backface-visibility:hidden;
  transform:rotate(0deg); transform-origin:50% 50%; will-change:transform;
  transition:background .3s cubic-bezier(.4,0,.2,1), transform .3s cubic-bezier(.4,0,.2,1);
}
.bm-lightbox .bm-close:hover{background:rgba(255,255,255,.25); transform:rotate(90deg)}
@keyframes bmFade{from{opacity:0} to{opacity:1}}
.bm-info{padding:20px 18px; border:1px solid var(--line); border-radius:var(--r); background:var(--milk)}
.bm-info h3{margin:0 0 10px; font-size:12.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--gold)}
.bm-info h3:not(:first-child){margin-top:20px}
.bm-lede{font-size:14.5px; color:#5c4326; margin:0}
.bm-lede strong{color:#7a5a12}
.bm-trivia{font-size:12.5px; color:var(--soft); font-style:italic; margin:8px 0 0}
.bm-trivia strong{color:#7a5a12; font-style:normal}

/* ---- Highlights: color/background transition only, no transform on the row itself ---- */
.bm-feat{margin:0 !important; padding:0 !important; list-style:none !important}
.bm-feat li{
  display:flex !important; gap:10px; align-items:flex-start;
  padding:9px 6px; margin:0 !important; list-style:none !important;
  border-bottom:1px dashed var(--line); border-radius:10px;
  transition:background .3s cubic-bezier(.4,0,.2,1), padding-left .3s cubic-bezier(.4,0,.2,1);
}
.bm-feat li:hover{background:var(--sky); padding-left:10px}
.bm-feat li:last-child{border-bottom:0; padding-bottom:9px}
.bm-feat .ico{
  flex:0 0 30px; width:30px; height:30px; border-radius:9px;
  display:flex !important; align-items:center; justify-content:center;
  font-size:15px; line-height:1; background:var(--sky);
  transform:rotate(0deg); transform-origin:50% 50%; will-change:transform;
  transition:transform .3s cubic-bezier(.4,0,.2,1), background .3s cubic-bezier(.4,0,.2,1);
}
.bm-feat li:hover .ico{transform:rotate(-15deg); background:#fff}
.bm-feat .tx{flex:1 1 auto; min-width:0}
.bm-feat b{display:block; color:#7a5a12; font-size:13.8px; margin-bottom:1px}
.bm-feat .t{display:block; color:var(--soft); font-size:13px; line-height:1.45}

/* ---- Compatible layouts chip row ---- */
.bm-layouts{display:flex; flex-wrap:wrap; gap:6px; margin:0 0 4px}
.bm-layouts span{
  font-size:12px; font-weight:700; color:#7a5a12; background:var(--sky);
  border:1px solid var(--line); padding:4px 9px; border-radius:8px;
  backface-visibility:hidden; -webkit-backface-visibility:hidden;
  transition:background .3s cubic-bezier(.4,0,.2,1), border-color .3s cubic-bezier(.4,0,.2,1);
}
.bm-layouts span:hover{background:#fff; border-color:var(--gold2)}
/* second row: key-count chips, muted so the % row reads first */
.bm-layouts-keys{margin-top:2px}
.bm-layouts-keys span{background:var(--milk); color:var(--soft); font-weight:600}
.bm-layouts-keys span:hover{background:var(--sky); color:#7a5a12}
.bm-layouts-note{font-size:12.5px; color:var(--soft); margin:8px 0 0; line-height:1.5}

/* ---- Specifications ---- */
.bm-spec{
  display:block !important; margin:0 !important; padding:0 !important; font-size:13.3px;
  border:1px solid var(--line); border-radius:12px; overflow:hidden; background:var(--milk);
}
.bm-spec .bm-sub{
  display:flex; align-items:center; gap:8px;
  padding:10px 14px; font-size:10.5px; font-weight:700;
  letter-spacing:.12em; text-transform:uppercase; color:var(--gold);
  background:var(--sky); border-bottom:1px solid var(--line2);
}
.bm-spec .bm-sub::before{content:""; flex:0 0 auto; width:14px; height:2px; border-radius:2px; background:var(--gold2)}
.bm-spec .bm-sub:not(:first-child){border-top:1px solid var(--line2); margin-top:0}
.bm-spec .bm-r{
  display:flex !important; flex-wrap:wrap; align-items:baseline;
  justify-content:space-between; gap:8px 18px; width:100%;
  margin:0 !important; padding:10px 14px; border-bottom:1px solid var(--line);
  transition:background .25s cubic-bezier(.4,0,.2,1);
}
.bm-spec .bm-r:hover{background:var(--sky)}
.bm-spec .bm-r:last-child{border-bottom:0}
.bm-spec .bm-k{flex:0 0 auto; max-width:44%; color:var(--soft); font-weight:500; margin:0 !important}
.bm-spec .bm-k::after{content:""}
.bm-spec .bm-v{flex:1 1 auto; min-width:0; text-align:right; color:#7a5a12; font-weight:600; margin:0 !important; overflow-wrap:break-word}

/* ---- PBT vs ABS quick comparison ---- */
.bm-compare{width:100%; border-collapse:separate; border-spacing:0; font-size:12.8px; margin:0}
.bm-compare th{
  text-align:left; font-size:11px; letter-spacing:.06em; text-transform:uppercase;
  color:var(--soft); padding:12px 14px; font-weight:700; background:var(--sky);
}
.bm-compare th:first-child{border-radius:8px 0 0 8px}
.bm-compare th:last-child{border-radius:0 8px 8px 0}
.bm-compare td{padding:12px 14px; border-top:1px solid var(--line); vertical-align:top; line-height:1.5; transition:background .3s cubic-bezier(.4,0,.2,1)}
.bm-compare td:first-child{color:var(--soft); white-space:nowrap; font-weight:600}
.bm-compare tr:hover td{background:var(--sky)}
.bm-compare .bm-yes{color:#7a5a12; font-weight:700}

/* ---- trust row (box + hover) ---- */
.bm-trust{display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; justify-content:center}
.bm-trust span{
  font-size:11.5px; color:var(--soft); background:var(--milk); border:1px solid var(--line);
  padding:8px 12px; border-radius:12px; display:inline-flex; align-items:center; gap:5px;
  backface-visibility:hidden; -webkit-backface-visibility:hidden;
  transition:transform .3s cubic-bezier(.4,0,.2,1), box-shadow .3s cubic-bezier(.4,0,.2,1), background .3s cubic-bezier(.4,0,.2,1), border-color .3s cubic-bezier(.4,0,.2,1);
}
.bm-trust span:hover{transform:translateY(-2px); box-shadow:0 8px 16px -6px rgba(201,138,31,.3); background:#fff; border-color:var(--gold2)}

.bm-note{margin:16px 0 0; padding:11px 13px; border-radius:12px; background:var(--lav); border:1px solid var(--line); font-size:12.8px; color:#5c4326; line-height:1.5}
.bm-note b{color:#7a5a12}

/* ---- FAQ accordion — native <details>/<summary>, ZERO JavaScript (Shopify
   removes scripting, so a JS accordion never opens; <details> always works). ---- */
.bm-faq{margin-top:6px; border:1px solid var(--line); border-radius:12px; overflow:hidden}
.bm-faq-item{border-bottom:1px solid var(--line)}
.bm-faq-item:last-child{border-bottom:0}
.bm-faq-q{
  list-style:none; cursor:pointer;
  width:100%; display:flex !important; align-items:center; justify-content:space-between;
  gap:10px; padding:11px 13px; background:#fff; border:0; text-align:left;
  font-size:13.4px; font-weight:700; color:#7a5a12; transition:background .25s cubic-bezier(.4,0,.2,1);
}
.bm-faq-q::-webkit-details-marker{display:none}
.bm-faq-q::marker{content:""}
.bm-faq-q:hover{background:var(--sky)}
.bm-faq-q .bm-plus{flex:0 0 auto; width:18px; height:18px; position:relative; transition:transform .3s ease}
.bm-faq-q .bm-plus::before,.bm-faq-q .bm-plus::after{content:""; position:absolute; background:var(--gold); border-radius:2px; transition:opacity .3s ease}
.bm-faq-q .bm-plus::before{left:0; top:50%; width:100%; height:2px; transform:translateY(-50%)}
.bm-faq-q .bm-plus::after{top:0; left:50%; width:2px; height:100%; transform:translateX(-50%)}
.bm-faq-item[open] .bm-plus{transform:rotate(90deg)}
.bm-faq-item[open] .bm-plus::after{opacity:0}
.bm-faq-a{overflow:hidden; background:var(--milk)}
.bm-faq-a p{padding:2px 13px 12px; margin:0; font-size:13px; color:var(--soft); line-height:1.55}
.bm-faq-item[open] .bm-faq-a{animation:bmFaqIn .28s ease}
@keyframes bmFaqIn{from{opacity:0; transform:translateY(-6px)} to{opacity:1; transform:translateY(0)}}

/* ---- CTA ---- */
.bm-cta{margin-top:18px; padding:16px; border-radius:14px; text-align:center; background:linear-gradient(135deg,var(--gold) 0%,#f0c674 100%); box-shadow:0 10px 24px -10px rgba(201,138,31,.55)}
.bm-cta p{color:#fff8e6; font-size:12.5px; margin:0 0 10px; letter-spacing:.02em}
.bm-cta a,.bm-cta button{
  display:inline-flex !important; align-items:center; gap:7px;
  background:#fff; color:var(--gold); font-weight:700; font-size:13.5px;
  padding:10px 20px; border-radius:99px; text-decoration:none; border:0;
  backface-visibility:hidden; -webkit-backface-visibility:hidden;
  transition:transform .3s cubic-bezier(.4,0,.2,1), box-shadow .3s cubic-bezier(.4,0,.2,1);
}
.bm-cta a:hover,.bm-cta button:hover{transform:translateY(-2px); box-shadow:0 10px 20px -6px rgba(0,0,0,.25)}
.bm-cta a:active,.bm-cta button:active{transform:translateY(0)}

/* NOTE: the Add-to-Cart glow (.bm-atc-glow) has ONE definition only — it lives in
   the always-appended guarantee stylesheet at the very end of this block, so it
   is never duplicated or overridden. Do not redeclare @keyframes for it here. */

@media (max-width:899px){
  .bm-bar{
    display:flex !important; align-items:center; justify-content:space-between; gap:12px;
    width:100%; margin:0; padding:15px 17px; cursor:pointer; user-select:none;
    -webkit-tap-highlight-color:transparent; border:1px solid var(--line); border-radius:14px;
    background:linear-gradient(135deg,#fff3d6,#fffaf0);
    font-size:15.5px; font-weight:700; color:#7a5a12; line-height:1.2;
  }
  .bm-bar i{flex:0 0 auto; width:9px; height:9px; margin-right:4px; border-right:2px solid var(--gold); border-bottom:2px solid var(--gold); transform:rotate(45deg); transition:transform .35s cubic-bezier(.25,.8,.3,1)}
  .bm-toggle:checked ~ .bm-bar i{transform:rotate(-135deg)}
  .bm-toggle:focus-visible ~ .bm-bar{outline:2px solid var(--gold); outline-offset:2px}
  .bm-c1,.bm-c2{display:grid; grid-template-rows:0fr; transition:grid-template-rows .45s cubic-bezier(.25,.8,.3,1)}
  .bm-inner{overflow:hidden; min-height:0; opacity:0; transition:opacity .3s ease .05s}
  .bm-toggle:checked ~ .bm-c1,.bm-toggle:checked ~ .bm-grid .bm-c2{grid-template-rows:1fr}
  .bm-toggle:checked ~ .bm-c1 .bm-inner,.bm-toggle:checked ~ .bm-grid .bm-inner{opacity:1}
  .bm-c1 .bm-hero{margin:12px 0 0}
  .bm-grid{grid-template-columns:1fr; gap:0; margin-top:12px}
  .bm-toggle:checked ~ .bm-grid{gap:12px}
  .bm-c2{grid-column:1; grid-row:1; position:static; top:auto}
  .bm-media{grid-column:1; grid-row:2}
  .bm-info{padding:18px 16px}
  .bm-hero{padding:22px 15px 18px}
  .bm-hero h2{font-size:21px}
  .bm-hero .sub{font-size:13px}
  .bm-badges span{font-size:11.5px; padding:5px 10px}
}
@media (max-width:420px){.bm-hero h2{font-size:19px} .bm-bar{font-size:14.5px; padding:14px 15px}}
@media (max-width:380px){.bm-spec .bm-r{flex-direction:column; align-items:flex-start; gap:2px} .bm-spec .bm-v{text-align:left}}
</style>
<noscript><style>.bm-reveal{opacity:1 !important; transform:none !important}</style></noscript>
<div class="bm">
<input class="bm-toggle" type="checkbox" id="bmDetails"> <label class="bm-bar" for="bmDetails">🐰 Product Details <i></i></label>
<div class="bm-c1"><div class="bm-inner">
<div class="bm-hero bm-reveal">
<span class="bm-eyebrow">Chiikawa Usagi Collection</span>
<h2>🐰 Chiikawa Usagi Cute Cartoon Keycaps 🍯</h2>
<p class="sub">140 Keys · PBT Dye-Sublimation · Cherry &amp; KOA Profile · Side Print Legends</p>
<div class="bm-badges">
<span>🔢 140 Keys</span> <span>🧵 PBT Dye-Sub</span> <span>🎹 Cherry &amp; KOA Profile</span> <span>🖨️ Side Print</span> <span>🐰 Chiikawa Theme</span> <span>🍯 Kawaii Aesthetic</span>
</div>
</div>
</div></div>
<div class="bm-grid">
<div class="bm-c2"><div class="bm-inner">
<div class="bm-info bm-reveal">

<p class="bm-lede">Turn your keyboard into an instant conversation piece with this <strong>keycap set</strong> starring Chiikawa's ever-charming Usagi. Every legend is <strong>dye-sublimated</strong> deep into thick, textured PBT, so the tiny cartoon faces never fade, chip, or wash out no matter how many hours you type. The set is <strong>ANSI &amp; ISO layout compatible</strong> — the Enter and Left Shift keys for both are included, so you can build your keyboard either way with no extra kit — and the <strong>Cherry &amp; KOA Profile</strong> options let you dial in the sculpted feel you like best. ✨</p>
<p class="bm-trivia">🐹 Fun fact: the titular Chiikawa character is hamster-inspired — <strong>Usagi</strong> is his rabbit-loving best friend, and the star of this set.</p>

<h3>Highlights</h3>
<ul class="bm-feat">
<li><span class="ico">🐰</span><span class="tx"><b>Chiikawa Usagi artwork</b><span class="t">Adorable Usagi and cast illustrations spread across the whole keyboard.</span></span></li>
<li><span class="ico">🧵</span><span class="tx"><b>Thick PBT plastic</b><span class="t">Resists shine and grease far longer than standard ABS keycaps.</span></span></li>
<li><span class="ico">🖨️</span><span class="tx"><b>Dye-sublimated legends</b><span class="t">Ink is fused into the plastic itself, not printed on top.</span></span></li>
<li><span class="ico">🎹</span><span class="tx"><b>Cherry &amp; KOA profile options</b><span class="t">Pick the sculpted feel that matches your typing style.</span></span></li>
<li><span class="ico">🖋️</span><span class="tx"><b>Side-print variant available</b><span class="t">Keeps the keycap top clean while legends sit on the front face.</span></span></li>
<li><span class="ico">🍯</span><span class="tx"><b>140-key full coverage</b><span class="t">Enough caps for most 60% to full-size mechanical keyboards, function row included.</span></span></li>
</ul>

<h3>Compatible Layouts</h3>
<div class="bm-layouts">
<span>60%</span><span>65%</span><span>75%</span><span>TKL</span><span>96%</span><span>100%</span><span>Alice</span>
</div>
<div class="bm-layouts bm-layouts-keys">
<span>61 keys</span><span>64 keys</span><span>68 keys</span><span>75 keys</span><span>84 keys</span><span>87 keys</span><span>98 keys</span><span>104 keys</span><span>108 keys</span>
</div>
<p class="bm-layouts-note">Spacebar coverage: 6.25U and 7U bottom-row spacebars, plus 2.75U and 2.25U keys for split bottom rows. Also covers stepped Caps Lock, the L-shaped Enter used on ISO layouts, Left Shift B3 &amp; B4, and 1.5U front-tooth keys — so the set is <strong>ANSI &amp; ISO layout compatible</strong>. Fits Alice, tri-mode 75%, and standard TKL keyboards. Not sure about your keyboard? Match your bottom-row and spacebar size against the "all keys" compatibility photo, or message us and we'll confirm it for you.</p>

<h3>Specifications</h3>
<div class="bm-spec">
<span class="bm-sub">Material &amp; manufacturing</span>
<div class="bm-r"><span class="bm-k">Material</span><span class="bm-v">PBT plastic</span></div>
<div class="bm-r"><span class="bm-k">Legend process</span><span class="bm-v">Dye-sublimation — fused in, not printed on top</span></div>
<div class="bm-r"><span class="bm-k">Surface finish</span><span class="bm-v">Textured matte, anti-shine</span></div>
<div class="bm-r"><span class="bm-k">Legend placement</span><span class="bm-v">Top print / Side print (by variant)</span></div>
<span class="bm-sub">Profile &amp; fit</span>
<div class="bm-r"><span class="bm-k">Profile options</span><span class="bm-v">Cherry Profile / KOA Profile</span></div>
<div class="bm-r"><span class="bm-k">Key count</span><span class="bm-v">140 keys (full set)</span></div>
<div class="bm-r"><span class="bm-k">Switch fit</span><span class="bm-v">MX-style cross-stem switches only</span></div>
<span class="bm-sub">Layout &amp; compatibility</span>
<div class="bm-r"><span class="bm-k">Layout support</span><span class="bm-v">ANSI &amp; ISO layout compatible</span></div>
<div class="bm-r"><span class="bm-k">Keyboard sizes</span><span class="bm-v">60% / 65% / 75% / TKL / 96% / full-size / Alice</span></div>
<div class="bm-r"><span class="bm-k">Spacebar support</span><span class="bm-v">6.25U, 7U, 2.75U, 2.25U</span></div>
<div class="bm-r"><span class="bm-k">Theme</span><span class="bm-v">Chiikawa Usagi cartoon (Usagi &amp; friends, pastel line work)</span></div>
<span class="bm-sub">Care</span>
<div class="bm-r"><span class="bm-k">Cleaning</span><span class="bm-v">Hand-wash, mild soap, air-dry fully</span></div>
<div class="bm-r"><span class="bm-k">Avoid</span><span class="bm-v">Hot water, dishwashers, harsh solvents</span></div>
</div>

<h3>Why PBT Over ABS</h3>
<table class="bm-compare">
<tr><th></th><th>PBT (this set)</th><th>Standard ABS</th></tr>
<tr><td>Shine over time</td><td class="bm-yes">Stays matte for years</td><td>Goes glossy within months</td></tr>
<tr><td>Legend durability</td><td class="bm-yes">Dye-sub, fused into plastic</td><td>Often printed on top, wears off</td></tr>
<tr><td>Feel</td><td class="bm-yes">Textured, grippy</td><td>Smooth, can feel slippery</td></tr>
<tr><td>Sound</td><td class="bm-yes">Deeper, slightly muted</td><td>Sharper, higher-pitched</td></tr>
</table>

<h3>Compatibility &amp; Care</h3>
<div class="bm-faq">
<details class="bm-faq-item" open><summary class="bm-faq-q"><span>🧷 Will this fit my keyboard?</span><span class="bm-plus"></span></summary><div class="bm-faq-a"><p>It fits any keyboard using standard MX-style cross-stem switches — 60%, 65%, 75%, TKL, 96%, and full-size. The set is ANSI &amp; ISO layout compatible, so either bottom-row style is covered. Match your spacebar size and row count against the "all keys" compatibility photo before ordering, or message us and we'll confirm your keyboard.</p></div></details>
<details class="bm-faq-item"><summary class="bm-faq-q"><span>🎹 What's the difference between Cherry and KOA Profile?</span><span class="bm-plus"></span></summary><div class="bm-faq-a"><p>Cherry Profile is low and gently sculpted for a relaxed, near-flat typing angle. KOA Profile sits taller with a deeper per-row dish and more pronounced row-to-row steps. They are not interchangeable rows — pick the sculpt you prefer.</p></div></details>
<details class="bm-faq-item"><summary class="bm-faq-q"><span>⌨️ Do I need to choose ANSI or ISO?</span><span class="bm-plus"></span></summary><div class="bm-faq-a"><p>No — every set includes the Enter and Left Shift keys for both ANSI and ISO, so you can build your keyboard either way. On an ISO keyboard the Enter key is L-shaped (it spans two rows); on ANSI it is a wide single-row bar. Just install the keys your layout uses.</p></div></details>
<details class="bm-faq-item"><summary class="bm-faq-q"><span>🖨️ What is Side Print?</span><span class="bm-plus"></span></summary><div class="bm-faq-a"><p>Side Print places the legends on the front-facing edge of the keycap instead of the top, keeping the top surface clean while the character art still shows as you type. Top Print keeps the artwork on the top surface.</p></div></details>
<details class="bm-faq-item"><summary class="bm-faq-q"><span>💡 Will my RGB shine through the legends?</span><span class="bm-plus"></span></summary><div class="bm-faq-a"><p>These are dye-sublimated PBT keycaps with solid, non-translucent legends, so backlighting glows around each cap rather than through the characters. If you specifically want shine-through legends, that is a different keycap type.</p></div></details>
<details class="bm-faq-item"><summary class="bm-faq-q"><span>🧼 How do I clean these keycaps?</span><span class="bm-plus"></span></summary><div class="bm-faq-a"><p>Dust with a soft dry brush or cloth. For a deeper clean, hand-wash with warm water and mild soap, rinse well, and let them air-dry fully before reinstalling. Avoid hot water and dishwashers.</p></div></details>
</div>

<div class="bm-note"><b>📦 In the box:</b> keycap set, keycap puller, thank-you card with a surprise coupon.<br><b>💬 Compatibility questions?</b> Message the store before you order and we'll check your keyboard.</div>

<div class="bm-cta">
<p>Give your setup a soft, huggable upgrade ✨</p>
<button type="button" data-bm-goto-atc onclick="(function(){function bad(el){if(!el)return true;if(el.closest&&el.closest('.shopify-payment-button'))return true;var x=(el.textContent||'').toLowerCase();return x.indexOf('shop pay')>-1||x.indexOf('buy now')>-1||x.indexOf('buy with')>-1;}var L=['form[action*=cart] button[name=add]','form[action*=cart] [type=submit]','button[name=add]','#AddToCart','#ProductSubmitButton','.product-form__submit','.product-form__cart-submit','.btn--add-to-cart','.add-to-cart'],a=null,i,n;for(i=0;i<L.length&&!a;i++){n=document.querySelectorAll(L[i]);for(var j=0;j<n.length;j++){if(!bad(n[j])){a=n[j];break;}}}if(!a){n=document.querySelectorAll('button,[type=submit],a');for(i=0;i<n.length;i++){if(bad(n[i]))continue;var y=(n[i].textContent||'').toLowerCase();if(y.indexOf('add to cart')>-1||y.indexOf('add to bag')>-1){a=n[i];break;}}}if(a){a.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(function(){a.classList.remove('bm-atc-glow');void a.offsetWidth;a.classList.add('bm-atc-glow');setTimeout(function(){a.classList.remove('bm-atc-glow');},2600);},650);}return false;})();">🛒 Add to Cart</button>
</div>
<div class="bm-trust">
<span>🚚 Ships worldwide</span>
<span>🔒 Secure checkout</span>
<span>💬 Support before &amp; after purchase</span>
</div>

</div>
</div></div>
<div class="bm-media"></div>
<div class="bm-lightbox" data-bm-lightbox><button type="button" class="bm-close" data-bm-close aria-label="Close">✕</button><img src="" alt="Zoomed product image" data-bm-lightbox-img></div>
</div>
<script>
/* Progressive enhancement only. The description works with NO JavaScript:
   reveals are visible by default, the FAQ is a native <details>, and the CTA
   button also carries an inline onclick. This script (when it runs) upgrades
   image zoom and makes the CTA delegated + resilient to theme re-renders. */
(function(){
  if(window.__bmInit) return; window.__bmInit = 1;
  function findAtc(){
    // HARD RULE: never a Shop Pay / dynamic-checkout / "Buy now" / "Buy with" button.
    var list = [
      'form[action*="/cart/add"] button[name="add"]',
      'form[action*="/cart/add"] [type="submit"]',
      'button[name="add"]',
      '#AddToCart',
      '#ProductSubmitButton',
      '.product-form__submit',
      '.product-form__cart-submit',
      '.btn--add-to-cart',
      '.add-to-cart'
    ];
    function bad(el){
      if(!el) return true;
      if(el.closest && el.closest('.shopify-payment-button')) return true;
      var t = (el.textContent || '').trim().toLowerCase();
      return t.indexOf('shop pay') !== -1 || t.indexOf('buy now') !== -1 || t.indexOf('buy with') !== -1;
    }
    for(var i = 0; i < list.length; i++){
      var els = document.querySelectorAll(list[i]);
      for(var j = 0; j < els.length; j++){ if(!bad(els[j])) return els[j]; }
    }
    var all = document.querySelectorAll('button, [type="submit"], a');
    for(var k = 0; k < all.length; k++){
      var e2 = all[k];
      if(bad(e2)) continue;
      var t2 = (e2.textContent || '').trim().toLowerCase();
      if(t2.indexOf('add to cart') !== -1 || t2.indexOf('add to bag') !== -1) return e2;
    }
    return null;
  }
  function glow(el){
    if(!el) return;
    el.classList.remove('bm-atc-glow'); void el.offsetWidth; el.classList.add('bm-atc-glow');
    setTimeout(function(){ el.classList.remove('bm-atc-glow'); }, 2600);
  }
  // run the callback only once the page has actually stopped scrolling, so the
  // glow plays from its first frame with the button in view (never mid-scroll).
  function afterScrollSettles(cb){
    var done = false;
    function fire(){ if(done) return; done = true; cb(); }
    if('onscrollend' in window){
      var cap = setTimeout(fire, 1600);
      window.addEventListener('scrollend', function h(){ window.removeEventListener('scrollend', h); clearTimeout(cap); fire(); }, {once:true});
      return;
    }
    var last = window.pageYOffset, still = 0;
    var iv = setInterval(function(){
      var y = window.pageYOffset;
      if(Math.abs(y - last) < 2){ still += 90; if(still >= 220){ clearInterval(iv); fire(); } }
      else { still = 0; last = y; }
    }, 90);
    setTimeout(function(){ clearInterval(iv); fire(); }, 2000);
  }
  document.addEventListener('click', function(e){
    var t = e.target;
    var zoom = t.closest && t.closest('.bm [data-bm-zoom]');
    if(zoom){
      var im = zoom.tagName === 'IMG' ? zoom : zoom.querySelector('img');
      var lb = document.querySelector('.bm-lightbox');
      if(im && lb){ var li = lb.querySelector('[data-bm-lightbox-img]') || lb.querySelector('img'); if(li){ li.src = im.currentSrc || im.src; lb.classList.add('is-open'); } }
      return;
    }
    if((t.closest && t.closest('.bm-lightbox [data-bm-close]')) || (t.classList && t.classList.contains('bm-lightbox'))){
      var open = document.querySelector('.bm-lightbox.is-open'); if(open) open.classList.remove('is-open'); return;
    }
    var cta = t.closest && t.closest('[data-bm-goto-atc]');
    if(!cta) return;
    e.preventDefault();
    var atc = findAtc();
    if(!atc) return;
    atc.scrollIntoView({behavior:'smooth', block:'center'});
    afterScrollSettles(function(){ glow(atc); });
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ var open = document.querySelector('.bm-lightbox.is-open'); if(open) open.classList.remove('is-open'); }
  });
})();
</script>`;

/**
 * Reference example for the "Diğer HTML düzenler" Shopify description — a
 * bespoke, self-contained styled block (own `.pd-<prefix>` class family +
 * `--pd-accent`). The model MIMICS this structure but re-themes it per product
 * (palette, prefix, emojis, section names, copy). Contract it MUST keep: empty
 * `<div class="pd-media"></div>` slots (ONE image each, the renderer fills them,
 * arranged in grids / a wide cinematic / variant cards — never stacked, never a
 * lone full 1:1), the FAQ as native `<details class="pd-faq-item"><summary
 * class="pd-faq-q">` + `<div class="pd-faq-a">` (first one `open`; NO JavaScript),
 * `data-pd-goto-atc` on the CTA `<button>` (which also carries an inline onclick),
 * NO `<script>`, and the CTA is the LAST element. Sent by the Delivery editor as
 * the default `examples` whenever a non-self-contained layout is picked.
 */
export const OTHER_DESC_EXAMPLE = `<style>
/* ===== Diger HTML duzenler reference — a bespoke, self-contained Shopify
   product description. Re-theme per product: your own class prefix, palette,
   emojis, section names and copy. Keep the structure and the hook classes
   exactly as they appear below. ===== */
.pd-ck{
  --pd-accent:#d9799b;            /* product's dominant colour — also drives the CTA glow */
  --pd-ink:#4a3550; --pd-soft:#8a7590; --pd-line:rgba(217,121,155,.20);
  --pd-line2:rgba(217,121,155,.34); --pd-cream:#fff5f9; --pd-cream2:#ffeef5;
  --pd-paper:#fffafc; --pd-r:16px;
  font-family:"Trebuchet MS",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,
    "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;
  color:var(--pd-ink); line-height:1.62; text-align:left; overflow-wrap:break-word;
  width:100%; max-width:1180px; margin:0 auto; padding:0;
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
}
.pd-ck *{box-sizing:border-box; min-width:0; max-width:100%}
.pd-ck p{margin:0 0 12px}
.pd-ck img{display:block; width:100%; height:auto; border:0}
.pd-ck div,.pd-ck span,.pd-ck ul,.pd-ck li,.pd-ck p,.pd-ck h2,.pd-ck h3,.pd-ck h4,.pd-ck button,.pd-ck table{float:none !important}
.pd-ck button{font:inherit; cursor:pointer}
@media (prefers-reduced-motion:reduce){
  .pd-ck *{animation-duration:.01ms !important; transition-duration:.01ms !important}
}

/* --- section rhythm --- */
.pd-ck__section{margin:0 0 30px}
.pd-ck__head{text-align:center; margin:0 0 18px}
.pd-ck__kicker{
  display:inline-block; font-size:11px; letter-spacing:.18em; text-transform:uppercase;
  color:var(--pd-accent); background:#fff; border:1px solid var(--pd-line);
  padding:5px 12px; border-radius:99px; margin-bottom:10px;
}
.pd-ck__h2{margin:0 0 6px; font-size:22px; line-height:1.25; color:var(--pd-ink); font-weight:800}
.pd-ck__lead{margin:0 auto; max-width:640px; font-size:14px; color:var(--pd-soft)}
.pd-ck__rule{width:44px; height:3px; border-radius:99px; background:var(--pd-accent); margin:12px auto 0; opacity:.5}

/* --- top strip --- */
.pd-ck__strip{
  display:flex; flex-wrap:wrap; gap:8px; justify-content:center;
  padding:12px 14px; margin:0 0 22px; border:1px solid var(--pd-line);
  border-radius:var(--pd-r); background:linear-gradient(135deg,var(--pd-cream),var(--pd-paper));
}
.pd-ck__strip span{
  font-size:12px; font-weight:700; color:var(--pd-ink); background:#fff;
  border:1px solid var(--pd-line); padding:5px 11px; border-radius:99px; white-space:nowrap;
}

/* --- hero --- */
.pd-ck__hero{
  position:relative; overflow:hidden; text-align:center; padding:38px 22px 30px; margin:0 0 26px;
  border:1px solid var(--pd-line); border-radius:var(--pd-r);
  background:linear-gradient(165deg,var(--pd-cream2) 0%,var(--pd-cream) 55%,var(--pd-paper) 100%);
}
.pd-ck__hero h1{margin:0 0 10px; font-size:28px; line-height:1.22; color:var(--pd-ink); font-weight:800}
.pd-ck__hero .pd-ck__sub{margin:0 auto 16px; max-width:560px; font-size:14.5px; color:var(--pd-soft)}
.pd-ck__badges{display:flex; flex-wrap:wrap; gap:8px; justify-content:center}
.pd-ck__badges span{
  font-size:12.5px; color:var(--pd-ink); background:#fff; border:1px solid var(--pd-line);
  padding:6px 12px; border-radius:99px; white-space:nowrap;
}

/* --- prose --- */
.pd-ck__prose{max-width:760px; margin:0 auto 18px; font-size:14.5px; color:#5c4763}
.pd-ck__prose strong{color:var(--pd-ink)}

/* --- image layouts (each .pd-media is ONE photo, filled by the system) --- */
.pd-ck__grid2{display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:0 0 12px}
.pd-ck__grid3{display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin:0 0 12px}
.pd-ck__grid2 .pd-media,.pd-ck__grid3 .pd-media{border-radius:12px; overflow:hidden; border:1px solid var(--pd-line); background:var(--pd-cream)}
.pd-media--wide{border-radius:var(--pd-r); overflow:hidden; border:1px solid var(--pd-line); background:var(--pd-cream); margin:0 0 12px}
.pd-media--wide img{aspect-ratio:16/7; object-fit:cover; object-position:center}

/* --- features --- */
.pd-ck__features{display:grid; grid-template-columns:1fr 1fr; gap:12px}
.pd-ck__feature{
  border:1px solid var(--pd-line); border-radius:14px; padding:16px 16px 14px; background:#fff;
}
.pd-ck__feature-ic{
  width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center;
  font-size:18px; background:var(--pd-cream2); margin-bottom:8px;
}
.pd-ck__feature h3{margin:0 0 4px; font-size:14.5px; color:var(--pd-ink); font-weight:700}
.pd-ck__feature p{margin:0; font-size:13px; color:var(--pd-soft); line-height:1.5}

/* --- spotlight --- */
.pd-ck__spotlight{
  border:1px solid var(--pd-line); border-radius:var(--pd-r); padding:24px 22px;
  background:linear-gradient(135deg,var(--pd-cream),var(--pd-paper));
}
.pd-ck__spotlight h2{margin:0 0 8px; font-size:19px; color:var(--pd-ink); font-weight:800}
.pd-ck__spotlight p{margin:0 0 14px; font-size:13.6px; color:#5c4763; line-height:1.6}
.pd-ck__mini{display:grid; grid-template-columns:repeat(3,1fr); gap:10px}
.pd-ck__mini div{
  border:1px solid var(--pd-line); border-radius:10px; padding:10px; background:#fff; text-align:center;
}
.pd-ck__mini b{display:block; font-size:12.5px; color:var(--pd-ink)}
.pd-ck__mini span{display:block; font-size:11.5px; color:var(--pd-soft); margin-top:2px}

/* --- variant cards (each carries its own .pd-media) --- */
.pd-ck__variants{display:grid; grid-template-columns:1fr 1fr; gap:14px}
.pd-ck__variant{border:1px solid var(--pd-line); border-radius:14px; overflow:hidden; background:#fff}
.pd-ck__variant .pd-media{background:var(--pd-cream)}
.pd-ck__variant-body{padding:14px 16px 16px}
.pd-ck__variant-tag{
  display:inline-block; font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  color:var(--pd-accent); background:var(--pd-cream2); border:1px solid var(--pd-line);
  padding:3px 9px; border-radius:99px; margin-bottom:6px;
}
.pd-ck__variant h3{margin:0 0 4px; font-size:14.5px; color:var(--pd-ink); font-weight:700}
.pd-ck__variant p{margin:0; font-size:12.8px; color:var(--pd-soft); line-height:1.5}

/* --- specs table --- */
.pd-ck__table-wrap{border:1px solid var(--pd-line); border-radius:var(--pd-r); overflow:hidden}
.pd-ck__table{width:100%; border-collapse:collapse; font-size:13.4px}
.pd-ck__table th,.pd-ck__table td{padding:11px 14px; text-align:left; border-bottom:1px solid var(--pd-line); vertical-align:top}
.pd-ck__table tr:last-child th,.pd-ck__table tr:last-child td{border-bottom:0}
.pd-ck__table th{width:38%; color:var(--pd-soft); font-weight:600; background:var(--pd-cream)}
.pd-ck__table td{color:var(--pd-ink); font-weight:600}
.pd-ck__table .pd-ck__table-grp{width:auto; text-align:left; background:var(--pd-cream2); color:var(--pd-accent); font-size:10.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; padding:9px 14px}
.pd-ck__notice{
  margin:12px 0 0; padding:12px 14px; border-radius:12px; font-size:12.8px; line-height:1.5;
  color:#8a2b2b; background:#fdeaea; border:1px solid rgba(200,60,60,.25);
}
.pd-ck__notice b{color:#8a2b2b}

/* --- universal compatibility list --- */
.pd-ck__compat{display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:0}
.pd-ck__compat span{
  display:flex; align-items:center; gap:8px; font-size:12.8px; font-weight:600; color:var(--pd-ink);
  border:1px solid var(--pd-line); border-radius:10px; padding:9px 12px; background:#fff;
}
.pd-ck__tip{
  margin:12px 0 0; padding:11px 13px; border-radius:12px; font-size:12.6px; line-height:1.5;
  color:#5c4763; background:var(--pd-cream2); border:1px solid var(--pd-line);
}
.pd-ck__tip b{color:var(--pd-ink)}

/* --- in the box --- */
.pd-ck__box{
  border:1px dashed var(--pd-line2); border-radius:14px; padding:16px 18px; background:var(--pd-paper);
  font-size:13.2px; color:#5c4763; line-height:1.6;
}
.pd-ck__box b{color:var(--pd-ink)}

/* --- FAQ — native <details>/<summary>, ZERO JavaScript (Shopify removes scripting) --- */
.pd-ck__faq{border:1px solid var(--pd-line); border-radius:14px; overflow:hidden}
.pd-faq-item{border-bottom:1px solid var(--pd-line)}
.pd-faq-item:last-child{border-bottom:0}
.pd-faq-q{
  list-style:none; cursor:pointer;
  width:100%; display:flex !important; align-items:center; justify-content:space-between; gap:12px;
  padding:13px 15px; background:#fff; border:0; text-align:left;
  font-size:13.6px; font-weight:700; color:var(--pd-ink); transition:background .25s ease;
}
.pd-faq-q::-webkit-details-marker{display:none}
.pd-faq-q::marker{content:""}
.pd-faq-q:hover{background:var(--pd-cream)}
.pd-faq-q::after{content:"+"; flex:0 0 auto; font-size:17px; font-weight:400; color:var(--pd-accent); transition:transform .3s ease}
.pd-faq-item[open] .pd-faq-q::after{transform:rotate(45deg)}
.pd-faq-a{overflow:hidden; background:var(--pd-paper)}
.pd-faq-a p{padding:2px 15px 14px; margin:0; font-size:13px; color:var(--pd-soft); line-height:1.6}
.pd-faq-item[open] .pd-faq-a{animation:pdFaqIn .28s ease}
@keyframes pdFaqIn{from{opacity:0; transform:translateY(-6px)} to{opacity:1; transform:translateY(0)}}

/* --- CTA (must be LAST; the system smooth-scrolls to the store's Add to Cart + glows it in --pd-accent) --- */
.pd-ck__cta{
  margin-top:8px; padding:22px; border-radius:var(--pd-r); text-align:center;
  background:linear-gradient(135deg,var(--pd-accent),color-mix(in srgb,var(--pd-accent) 60%,#fff));
}
.pd-ck__cta p{color:#fff; font-size:13px; margin:0 0 12px}
.pd-ck__cta button{
  display:inline-flex; align-items:center; gap:8px; background:#fff; color:var(--pd-accent);
  font-weight:800; font-size:14px; padding:12px 24px; border-radius:99px; border:0;
}

@media (max-width:720px){
  .pd-ck__features,.pd-ck__variants,.pd-ck__compat{grid-template-columns:1fr}
  .pd-ck__grid3{grid-template-columns:1fr 1fr}
  .pd-ck__mini{grid-template-columns:1fr 1fr}
  .pd-ck__hero h1{font-size:23px}
  .pd-ck__table th{width:44%}
}
</style>
<div class="pd-ck" lang="en">

<div class="pd-ck__strip">
<span>🐰 Chiikawa Usagi</span><span>🧵 PBT Dye-Sub</span><span>🎹 Cherry &amp; KOA Profile</span><span>🔢 140 Keys</span><span>🖨️ Side-Print Option</span><span>⌨️ MX Compatible</span>
</div>

<section class="pd-ck__section pd-ck__hero">
<h1>🐰 Chiikawa Usagi Cartoon Keycap Set 🍯</h1>
<p class="pd-ck__sub">A 140-piece PBT set built around Chiikawa's rabbit-loving best friend — dye-sublimated art that never fades, on a soft Cherry or KOA sculpt.</p>
<div class="pd-ck__badges">
<span>🐰 Usagi &amp; friends</span><span>🧵 Thick PBT</span><span>🖨️ Dye-sublimation</span><span>🎹 Cherry / KOA</span><span>🍯 Kawaii pastel</span>
</div>
</section>

<section class="pd-ck__section">
<div class="pd-ck__prose">
<p>Bring a slice of pure kawaii to your desk. Every legend on this set is <strong>dye-sublimated</strong> straight into thick, durable PBT, so the tiny cartoon faces and pastel doodles never peel, fade, or wear shiny — even after years of daily typing.</p>
<p>Full 140-key coverage dresses most 60% to full-size boards, function row and extras included, with a side-print variant that keeps the keycap top clean while the art peeks through as you type.</p>
</div>
<div class="pd-ck__grid2">
<div class="pd-media"></div>
<div class="pd-media"></div>
</div>
</section>

<section class="pd-ck__section">
<div class="pd-ck__head">
<div class="pd-ck__kicker">Why This Set</div>
<h2 class="pd-ck__h2">Key Features</h2>
<div class="pd-ck__rule"></div>
</div>
<div class="pd-ck__features">
<article class="pd-ck__feature"><div class="pd-ck__feature-ic">🐰</div><h3>Chiikawa Usagi artwork</h3><p>Usagi and the whole cast, spread across the board with soft pastel detailing.</p></article>
<article class="pd-ck__feature"><div class="pd-ck__feature-ic">🧵</div><h3>Thick PBT plastic</h3><p>Resists shine and grease far longer than standard ABS keycaps.</p></article>
<article class="pd-ck__feature"><div class="pd-ck__feature-ic">🖨️</div><h3>Dye-sublimated legends</h3><p>Ink is fused into the plastic itself, not printed on top — it cannot rub off.</p></article>
<article class="pd-ck__feature"><div class="pd-ck__feature-ic">🎹</div><h3>Cherry &amp; KOA profiles</h3><p>Pick the sculpted feel that matches your typing style — low Cherry or taller KOA.</p></article>
<article class="pd-ck__feature"><div class="pd-ck__feature-ic">🖋️</div><h3>Side-print variant</h3><p>Legends sit on the front face, keeping the top surface clean and minimal.</p></article>
<article class="pd-ck__feature"><div class="pd-ck__feature-ic">🍯</div><h3>140-key coverage</h3><p>Enough caps for 60%, 65%, 75%, TKL and full-size layouts, function row included.</p></article>
</div>
</section>

<section class="pd-ck__section">
<div class="pd-ck__grid3">
<div class="pd-media"></div>
<div class="pd-media"></div>
<div class="pd-media"></div>
</div>
</section>

<section class="pd-ck__section pd-ck__spotlight">
<h2>PBT &amp; Dye-Sub. Zero Fade.</h2>
<p>Ordinary keycaps wear down fast — legends fade, surfaces go glossy. This set is different. Dye-sublimation bonds the artwork into dense PBT at a molecular level, so it ages gracefully and keeps its matte, textured feel through years of daily use.</p>
<div class="pd-ck__mini">
<div><b>Material</b><span>Premium PBT</span></div>
<div><b>Printing</b><span>Dye-sublimation</span></div>
<div><b>Finish</b><span>Textured matte</span></div>
</div>
</section>

<section class="pd-ck__section">
<div class="pd-media pd-media--wide"></div>
</section>

<section class="pd-ck__section">
<div class="pd-ck__head">
<div class="pd-ck__kicker">Choose Your Set</div>
<h2 class="pd-ck__h2">Two Ways to Build It</h2>
<p class="pd-ck__lead">The same 140-key set, in your preferred profile and print style.</p>
<div class="pd-ck__rule"></div>
</div>
<div class="pd-ck__variants">
<article class="pd-ck__variant">
<div class="pd-media"></div>
<div class="pd-ck__variant-body">
<span class="pd-ck__variant-tag">Top Print</span>
<h3>Cherry Profile · Top Print</h3>
<p>Low, gently sculpted keycaps with the artwork on top — the classic look and a relaxed typing angle.</p>
</div>
</article>
<article class="pd-ck__variant">
<div class="pd-media"></div>
<div class="pd-ck__variant-body">
<span class="pd-ck__variant-tag">Side Print</span>
<h3>KOA Profile · Side Print</h3>
<p>A taller sculpt with legends on the front face — clean tops, with the character art peeking through as you type.</p>
</div>
</article>
</div>
</section>

<section class="pd-ck__section">
<div class="pd-ck__head">
<div class="pd-ck__kicker">Full Specs</div>
<h2 class="pd-ck__h2">Technical Specifications</h2>
<div class="pd-ck__rule"></div>
</div>
<div class="pd-ck__table-wrap">
<table class="pd-ck__table"><tbody>
<tr><th class="pd-ck__table-grp" colspan="2">Material &amp; manufacturing</th></tr>
<tr><th>Material</th><td>Premium PBT</td></tr>
<tr><th>Printing Method</th><td>Dye-Sublimation (permanent, fade-resistant)</td></tr>
<tr><th>Surface Finish</th><td>Textured Matte (anti-shine)</td></tr>
<tr><th>Legend Placement</th><td>Top print / Side print (by variant)</td></tr>
<tr><th class="pd-ck__table-grp" colspan="2">Profile &amp; fit</th></tr>
<tr><th>Profile Options</th><td>Cherry Profile / KOA Profile</td></tr>
<tr><th>Key Count</th><td>140 keys (full set)</td></tr>
<tr><th>Switch Type</th><td>MX-Style Cross Mechanical Switches Only</td></tr>
<tr><th class="pd-ck__table-grp" colspan="2">Layout &amp; compatibility</th></tr>
<tr><th>Layout Support</th><td>ANSI &amp; ISO layout compatible</td></tr>
<tr><th>Keyboard Sizes</th><td>60% / 65% / 75% / 80% TKL / 96% / Full-Size / Alice &amp; more</td></tr>
<tr><th>Spacebar Support</th><td>6.25U, 7U, 2.75U, 2.25U</td></tr>
<tr><th class="pd-ck__table-grp" colspan="2">Care</th></tr>
<tr><th>Cleaning</th><td>Hand-wash, mild soap, air-dry fully</td></tr>
<tr><th>Avoid</th><td>Hot water, dishwashers, harsh solvents</td></tr>
</tbody></table>
</div>
<div class="pd-ck__notice"><b>⚠️ Compatibility Notice:</b> This keycap set works only with MX-style mechanical switches. It is not compatible with membrane keyboards, laptop scissor switches, or low-profile mechanical keyboards. Check that your keyboard uses standard MX switches before ordering.</div>
</section>

<section class="pd-ck__section">
<div class="pd-ck__head">
<div class="pd-ck__kicker">Fits Your Board</div>
<h2 class="pd-ck__h2">Universal Compatibility with Most Mechanical Keyboards</h2>
<div class="pd-ck__rule"></div>
</div>
<div class="pd-ck__compat">
<span>⚓ 60% Compact Layouts</span>
<span>⚓ 65% Compact with Arrows</span>
<span>⚓ 75% Compact Full Function</span>
<span>⚓ 80% TKL (Tenkeyless)</span>
<span>⚓ 96% / 100% Full-Size</span>
<span>⚓ Alice Ergonomic Layout</span>
</div>
<div class="pd-ck__tip"><b>💡 Tip:</b> Compatible with ANSI &amp; ISO layouts. Not sure your keyboard is compatible? Send us a photo or the model number and our team will verify it before you order.</div>
</section>

<section class="pd-ck__section">
<div class="pd-ck__box"><b>📦 In the box:</b> keycap set, keycap puller, thank-you card with a surprise coupon.<br><b>💬 Compatibility questions?</b> Message the store before you order and we'll check your keyboard.</div>
</section>

<section class="pd-ck__section">
<div class="pd-ck__head">
<div class="pd-ck__kicker">Good to Know</div>
<h2 class="pd-ck__h2">Compatibility &amp; Care</h2>
<div class="pd-ck__rule"></div>
</div>
<div class="pd-ck__faq">
<details class="pd-faq-item" open><summary class="pd-faq-q">Will this fit my keyboard?</summary><div class="pd-faq-a"><p>It fits any keyboard using standard MX-style cross-stem switches across 60%, 65%, 75%, TKL and full-size layouts. The set is ANSI &amp; ISO layout compatible, so either bottom-row style is covered. Compare your spacebar size and row count against the "all keys" compatibility photo before ordering, or message us and we'll confirm your board.</p></div></details>
<details class="pd-faq-item"><summary class="pd-faq-q">What is the difference between Cherry and KOA profile?</summary><div class="pd-faq-a"><p>Cherry Profile is low and gently sculpted for a relaxed, near-flat typing angle. KOA Profile sits taller with a deeper per-row dish and more pronounced steps. The rows are not interchangeable — pick the sculpt you prefer.</p></div></details>
<details class="pd-faq-item"><summary class="pd-faq-q">Do I need to choose ANSI or ISO?</summary><div class="pd-faq-a"><p>No — every set includes the Enter and Left Shift keys for both ANSI and ISO. On an ISO keyboard the Enter key is L-shaped (it spans two rows); on ANSI it is a wide single-row bar. Just install the keys your layout uses.</p></div></details>
<details class="pd-faq-item"><summary class="pd-faq-q">What does Side Print mean?</summary><div class="pd-faq-a"><p>Side Print places the legends on the front-facing edge of the keycap instead of the top, keeping the top surface clean while the character art still shows as you type.</p></div></details>
<details class="pd-faq-item"><summary class="pd-faq-q">How do I clean the keycaps?</summary><div class="pd-faq-a"><p>Dust with a soft dry brush or cloth. For a deeper clean, hand-wash with warm water and mild soap, rinse well and let them air-dry completely before reinstalling. Avoid hot water and dishwashers.</p></div></details>
<details class="pd-faq-item"><summary class="pd-faq-q">Are the keycaps included with a keyboard?</summary><div class="pd-faq-a"><p>No — this listing is for the keycap set only. The keyboard, switches, cables and any props shown in the photos are for display purposes only.</p></div></details>
</div>
</section>

<section class="pd-ck__section">
<div class="pd-ck__cta">
<p>Give your setup a soft, huggable upgrade ✨</p>
<button type="button" data-pd-goto-atc onclick="(function(){function bad(el){if(!el)return true;if(el.closest&&el.closest('.shopify-payment-button'))return true;var x=(el.textContent||'').toLowerCase();return x.indexOf('shop pay')>-1||x.indexOf('buy now')>-1||x.indexOf('buy with')>-1;}var L=['form[action*=cart] button[name=add]','form[action*=cart] [type=submit]','button[name=add]','#AddToCart','#ProductSubmitButton','.product-form__submit','.product-form__cart-submit','.btn--add-to-cart','.add-to-cart'],a=null,i,n;for(i=0;i<L.length&&!a;i++){n=document.querySelectorAll(L[i]);for(var j=0;j<n.length;j++){if(!bad(n[j])){a=n[j];break;}}}if(!a){n=document.querySelectorAll('button,[type=submit],a');for(i=0;i<n.length;i++){if(bad(n[i]))continue;var y=(n[i].textContent||'').toLowerCase();if(y.indexOf('add to cart')>-1||y.indexOf('add to bag')>-1){a=n[i];break;}}}if(a){a.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(function(){a.classList.remove('pd-atc-glow');void a.offsetWidth;a.classList.add('pd-atc-glow');setTimeout(function(){a.classList.remove('pd-atc-glow');},2600);},650);}return false;})();">🛒 Add to Cart</button>
</div>
</section>

</div>`;

/* ---------- default field examples shown in the Delivery editor ---------- */

const ETSY_TAG_EXAMPLE = ETSY_TAG_VOCAB.slice(0, 39).join(", ");
const SHOPIFY_TAG_EXAMPLE = SHOPIFY_TAG_VOCAB.slice(0, 60).join(", ");

/**
 * Pre-filled "Örnekler" content per channel + field. Shown in the UI the moment
 * the page opens and sent to the model unless the operator overrides it.
 */
export const DEFAULT_FIELD_EXAMPLES: Record<"etsy" | "shopify", Record<string, string>> = {
  etsy: {
    title: ETSY_TITLE_EXAMPLES,
    title_alt: ETSY_TITLE_EXAMPLES,
    description: ETSY_DESC_EXAMPLE,
    tags: ETSY_TAG_EXAMPLE,
  },
  shopify: {
    title: SHOPIFY_TITLE_EXAMPLES,
    description: "",
    tags: SHOPIFY_TAG_EXAMPLE,
  },
};

/** Every "…" keycap-set adjective/theme word the operator considers "searchable". */
export const ETSY_SEARCH_ADJ: Set<string> = new Set(
  [...ETSY_TAG_VOCAB, ...SHOPIFY_TAG_VOCAB]
    .filter((t) => /\bkeycaps?( set)?$/.test(t))
    .map((t) => t.replace(/\bkeycaps?( set)?$/, "").trim())
    .filter((w) => w && !/^(pbt|pc|mx|abs|iso|ansi)$/.test(w)),
);
