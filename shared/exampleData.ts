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
.bm-reveal{opacity:0; transform:translateY(14px); transition:opacity .55s ease, transform .55s ease}
.bm-reveal.bm-show{opacity:1; transform:translateY(0)}
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
.bm-feat li:hover .ico{transform:rotate(15deg); background:#fff}
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
.bm-layouts-note{font-size:12.5px; color:var(--soft); margin:8px 0 0; line-height:1.5}

/* ---- Specifications ---- */
.bm-spec{display:block !important; margin:0 !important; padding:0 !important; font-size:13.5px}
.bm-spec .bm-r{
  display:flex !important; flex-wrap:nowrap; align-items:baseline;
  justify-content:space-between; gap:12px; width:100%;
  margin:0 !important; padding:8px 6px; border-bottom:1px solid var(--line);
  border-radius:8px; transition:background .3s cubic-bezier(.4,0,.2,1);
}
.bm-spec .bm-r:hover{background:var(--sky)}
.bm-spec .bm-r:last-child{border-bottom:0}
.bm-spec .bm-k{flex:0 0 auto; color:var(--soft); margin:0 !important}
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

/* ---- trust row ---- */
.bm-trust{display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; justify-content:center}
.bm-trust span{
  font-size:11.5px; color:var(--soft); background:var(--milk); border:1px solid var(--line);
  padding:6px 10px; border-radius:99px; display:inline-flex; align-items:center; gap:5px;
}

.bm-note{margin:16px 0 0; padding:11px 13px; border-radius:12px; background:var(--lav); border:1px solid var(--line); font-size:12.8px; color:#5c4326; line-height:1.5}
.bm-note b{color:#7a5a12}

/* ---- FAQ accordion ---- */
.bm-faq{margin-top:6px; border:1px solid var(--line); border-radius:12px; overflow:hidden}
.bm-faq-item{border-bottom:1px solid var(--line)}
.bm-faq-item:last-child{border-bottom:0}
.bm-faq-q{
  width:100%; display:flex !important; align-items:center; justify-content:space-between;
  gap:10px; padding:11px 13px; background:#fff; border:0; text-align:left;
  font-size:13.4px; font-weight:700; color:#7a5a12; transition:background .3s cubic-bezier(.4,0,.2,1);
}
.bm-faq-q:hover{background:var(--sky)}
.bm-faq-q .bm-plus{flex:0 0 auto; width:18px; height:18px; position:relative}
.bm-faq-q .bm-plus::before,.bm-faq-q .bm-plus::after{content:""; position:absolute; background:var(--gold); border-radius:2px; transition:transform .3s ease}
.bm-faq-q .bm-plus::before{left:0; top:50%; width:100%; height:2px; transform:translateY(-50%)}
.bm-faq-q .bm-plus::after{top:0; left:50%; width:2px; height:100%; transform:translateX(-50%)}
.bm-faq-item.is-open .bm-plus::after{transform:translateX(-50%) rotate(90deg); opacity:0}
.bm-faq-a{max-height:0; overflow:hidden; background:var(--milk); transition:max-height .35s ease}
.bm-faq-a p{padding:0 13px 12px; margin:0; font-size:13px; color:var(--soft); line-height:1.55}
.bm-faq-item.is-open .bm-faq-a{max-height:260px}

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

@keyframes bmAtcGlow{0%{box-shadow:0 0 0 0 rgba(201,138,31,0)} 25%{box-shadow:0 0 9px 3px rgba(201,138,31,.5)} 50%{box-shadow:0 0 0 0 rgba(201,138,31,0)} 75%{box-shadow:0 0 9px 3px rgba(201,138,31,.5)} 100%{box-shadow:0 0 0 0 rgba(201,138,31,0)}}
.bm-atc-glow{animation:bmAtcGlow 2.6s ease-in-out 1 !important}

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

<p class="bm-lede">Bring a slice of pure kawaii to your setup with this <strong>140-piece PBT keycap set</strong> starring Chiikawa's beloved Usagi and friends. Every legend is <strong>dye-sublimated</strong> straight into thick, durable PBT plastic so the tiny cartoon faces and pastel doodles never fade, peel, or wear thin — even after years of daily typing. ✨</p>
<p class="bm-trivia">🐹 Fun fact: the titular Chiikawa character is actually hamster-inspired — <strong>Usagi</strong> is his rabbit-loving best friend, and the star of this set!</p>

<h3>Highlights</h3>
<ul class="bm-feat">
<li><span class="ico">🐰</span><span class="tx"><b>Chiikawa Usagi artwork</b><span class="t">Adorable Usagi and cast illustrations spread across the whole board.</span></span></li>
<li><span class="ico">🧵</span><span class="tx"><b>Thick PBT plastic</b><span class="t">Resists shine and grease far longer than standard ABS keycaps.</span></span></li>
<li><span class="ico">🖨️</span><span class="tx"><b>Dye-sublimated legends</b><span class="t">Ink is fused into the plastic itself, not printed on top.</span></span></li>
<li><span class="ico">🎹</span><span class="tx"><b>Cherry &amp; KOA profile options</b><span class="t">Pick the sculpted feel that matches your typing style.</span></span></li>
<li><span class="ico">🖋️</span><span class="tx"><b>Side-print variant available</b><span class="t">Keeps the keycap top clean while legends sit on the front face.</span></span></li>
<li><span class="ico">🍯</span><span class="tx"><b>140-key full coverage</b><span class="t">Enough caps to dress most 60%–TKL–full-size boards, function row included.</span></span></li>
</ul>

<h3>Compatible Layouts</h3>
<div class="bm-layouts">
<span>60</span><span>61</span><span>64</span><span>68</span><span>75</span><span>78</span><span>80</span><span>82</span><span>84</span><span>87</span><span>96</span><span>98</span><span>100</span><span>104</span><span>108</span>
</div>
<p class="bm-layouts-note">Also supports Left Shift B3 &amp; B4, Alice-style layouts, 7U spacebars, and 1.5U large front-tooth keys. Always match your bottom-row and spacebar size against the compatibility photos before ordering.</p>

<h3>Specifications</h3>
<div class="bm-spec">
<div class="bm-r"><span class="bm-k">Key count</span><span class="bm-v">140 pcs</span></div>
<div class="bm-r"><span class="bm-k">Material</span><span class="bm-v">PBT plastic</span></div>
<div class="bm-r"><span class="bm-k">Printing method</span><span class="bm-v">Dye-sublimation</span></div>
<div class="bm-r"><span class="bm-k">Profile</span><span class="bm-v">Cherry Profile / KOA Profile</span></div>
<div class="bm-r"><span class="bm-k">Legend placement</span><span class="bm-v">Top print / Side print</span></div>
<div class="bm-r"><span class="bm-k">Theme</span><span class="bm-v">Chiikawa Usagi cartoon</span></div>
<div class="bm-r"><span class="bm-k">Switch fit</span><span class="bm-v">MX-style cross-stem switches</span></div>
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
<div class="bm-faq-item is-open"><button type="button" class="bm-faq-q"><span>🧷 Will this fit my keyboard?</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>Fits any keyboard using standard MX-style cross-stem switches across 60%, 65%, 75%, TKL, and full-size layouts. Please compare your bottom row and spacebar sizes against the compatibility photos before ordering.</p></div></div>
<div class="bm-faq-item"><button type="button" class="bm-faq-q"><span>🎹 What's the difference between Cherry and KOA profile?</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>Cherry Profile is low and gently sculpted for a relaxed, ergonomic typing angle, while KOA Profile sits slightly taller with its own distinct row sculpt. Choose the variant that matches your preferred feel — they are not interchangeable rows.</p></div></div>
<div class="bm-faq-item"><button type="button" class="bm-faq-q"><span>🖨️ What is Side Print?</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>Side Print places the artwork and legends on the front-facing edge of the keycap instead of the top, keeping the top surface clean and minimal while the character art still peeks through when you type.</p></div></div>
<div class="bm-faq-item"><button type="button" class="bm-faq-q"><span>🧼 How do I clean these keycaps?</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>Dust with a soft dry brush or cloth. For deeper cleaning, hand-wash with warm water and mild soap, rinse thoroughly, and let air-dry completely before reinstalling. Avoid hot water and dishwashers.</p></div></div>
</div>

<div class="bm-note"><b>📦 In the box:</b> 140 Chiikawa Usagi keycaps in your chosen profile and print variant. Keyboard, switches, and puller not included.<br><b>💡 Before you order:</b> confirm your layout, bottom-row size, keyboard compatibility, and desired profile/print variant.<br><b>🧼 Care:</b> hand-wash gently with mild soap and air-dry fully; avoid harsh solvents.</div>

<div class="bm-cta">
<p>Ready to make your desk irresistibly cute? ✨</p>
<button type="button" data-bm-goto-atc>🛒 Add to Cart</button>
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
(function(){
  var root = document.currentScript.previousElementSibling;
  while(root && !(root.classList && root.classList.contains('bm'))) root = root.previousElementSibling;
  if(!root) return;
  var reveals = root.querySelectorAll('.bm-reveal');
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('bm-show'); io.unobserve(e.target);}});},{threshold:.12});
    reveals.forEach(function(el){io.observe(el);});
  } else { reveals.forEach(function(el){el.classList.add('bm-show');}); }
  var lightbox = root.querySelector('[data-bm-lightbox]');
  var lightboxImg = root.querySelector('[data-bm-lightbox-img]');
  var closeBtn = root.querySelector('[data-bm-close]');
  function onKey(e){ if(e.key === 'Escape'){ closeLightbox(); } }
  function openLightbox(src){ if(!lightbox || !lightboxImg || !src) return; lightboxImg.src = src; lightbox.classList.add('is-open'); document.addEventListener('keydown', onKey); }
  function closeLightbox(){ if(!lightbox) return; lightbox.classList.remove('is-open'); document.removeEventListener('keydown', onKey); }
  root.querySelectorAll('[data-bm-zoom]').forEach(function(el){
    el.addEventListener('click', function(){ var img = el.tagName === 'IMG' ? el : el.querySelector('img'); if(img){ openLightbox(img.currentSrc || img.src); } });
  });
  if(closeBtn){ closeBtn.addEventListener('click', closeLightbox); }
  if(lightbox){ lightbox.addEventListener('click', function(e){ if(e.target === lightbox){ closeLightbox(); } }); }
  root.querySelectorAll('.bm-faq-item').forEach(function(item){
    var q = item.querySelector('.bm-faq-q');
    if(q){ q.addEventListener('click', function(){ item.classList.toggle('is-open'); }); }
  });
  var atcBtn = root.querySelector('[data-bm-goto-atc]');
  if(atcBtn){
    atcBtn.addEventListener('click', function(){
      var atc = document.querySelector('form[action*="/cart/add"] [type="submit"], form[action*="/cart/add"] button[name="add"], button[name="add"], .product-form__submit, [data-add-to-cart]');
      if(!atc){ return; }
      atc.scrollIntoView({behavior:'smooth', block:'center'});
      var glowIt = function(){ atc.classList.remove('bm-atc-glow'); void atc.offsetWidth; atc.classList.add('bm-atc-glow'); setTimeout(function(){ atc.classList.remove('bm-atc-glow'); }, 2800); };
      if('onscrollend' in window){ document.addEventListener('scrollend', glowIt, {once:true}); } else { setTimeout(glowIt, 650); }
    });
  }
})();
</script>`;

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
