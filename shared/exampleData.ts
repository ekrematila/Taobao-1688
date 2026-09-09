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
 * — v2 of the `.bm` sticky-gallery block, provided by the operator. The model
 * reproduces this STRUCTURE + `<style>` but re-themes it per product (palette,
 * hero emoji, series label, badge/highlight/spec/FAQ copy). The renderer fills
 * `<div class="bm-media"></div>` with the real product photos and guarantees the
 * `.bm-lightbox` node + the `<script>` are present. Default shown + sent whenever
 * the stacked layout is picked.
 */
export const STACKED_DESC_EXAMPLE = `<style>
/* ===== Blueberry Milk Keycap Set — product description v2 ===== */
.bm{
  --ink:#252a4d; --soft:#575d86; --blue:#5768d6; --blue2:#8fa2f0;
  --lav:#efeaff; --sky:#e7f0ff; --milk:#fcfbff; --line:rgba(87,104,214,.16);
  --line2:rgba(87,104,214,.28);
  --top:20px;            /* sticky offset — raise to ~90px if your theme has a fixed header */
  --r:16px;
  font-family:"Trebuchet MS",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,
    "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;
  color:var(--ink); line-height:1.62; text-align:left; overflow-wrap:break-word;
  width:100%; max-width:1160px; margin:0 auto; padding:0; position:relative;
  -webkit-font-smoothing:antialiased;
}
.bm *{box-sizing:border-box; min-width:0; max-width:100%}
.bm p{margin:0 0 10px}
.bm div,.bm span,.bm ul,.bm li,.bm p,.bm h2,.bm h3,.bm h4,.bm button{float:none !important}
.bm button{font:inherit; cursor:pointer}
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
  background:linear-gradient(165deg,#e9f2ff 0%,#f1ecff 55%,#fdf8ff 100%);
}
.bm-hero::before,.bm-hero::after{
  content:"🫐"; position:absolute; font-size:46px; opacity:.16; pointer-events:none;
  animation:bmFloat 7s ease-in-out infinite;
}
.bm-hero::before{top:-8px; left:4%; animation-delay:0s}
.bm-hero::after{bottom:-14px; right:6%; font-size:60px; animation-delay:1.6s}
@keyframes bmFloat{0%,100%{transform:translateY(0) rotate(-4deg)} 50%{transform:translateY(-10px) rotate(4deg)}}
.bm-eyebrow{
  display:inline-block; font-size:11px; letter-spacing:.18em; text-transform:uppercase;
  color:var(--blue); background:#fff; border:1px solid var(--line);
  padding:5px 12px; border-radius:99px; margin-bottom:12px; animation:bmPop .5s ease both;
}
.bm-hero h2{margin:0 0 8px; font-size:27px; line-height:1.25; color:#2c3570; font-weight:700; position:relative}
.bm-hero .sub{margin:0 0 15px; font-size:14px; color:var(--soft); position:relative}
.bm-badges{display:flex; flex-wrap:wrap; gap:8px; justify-content:center; position:relative}
.bm-badges span{
  font-size:12.5px; color:#3b4585; background:#fff; border:1px solid var(--line);
  padding:6px 12px; border-radius:99px; white-space:nowrap;
  transition:transform .2s ease, box-shadow .2s ease, background .2s ease, border-color .2s ease;
}
.bm-badges span:hover{transform:translateY(-3px) scale(1.04); box-shadow:0 8px 16px -6px rgba(87,104,214,.35); background:var(--sky); border-color:var(--line2); cursor:default}
@keyframes bmPop{from{opacity:0; transform:translateY(-6px) scale(.92)} to{opacity:1; transform:translateY(0) scale(1)}}
.bm-grid{display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:18px; align-items:start; transition:gap .45s cubic-bezier(.25,.8,.3,1)}
.bm-media{grid-column:1; grid-row:1}
.bm-c2{grid-column:2; grid-row:1; position:-webkit-sticky; position:sticky; top:var(--top); align-self:start}
.bm-media{font-size:0; line-height:0; border-radius:var(--r); overflow:hidden; border:1px solid var(--line); background:var(--milk)}
.bm-media .bm-stage{position:relative; cursor:zoom-in}
.bm-media img{
  display:block !important; width:100% !important; height:auto;
  margin:0 !important; padding:0 !important; border:0 !important;
  vertical-align:top; border-radius:0 !important; max-width:100%;
  transition:transform .5s cubic-bezier(.25,.8,.3,1); cursor:zoom-in; background:var(--sky);
}
.bm-media img:hover{transform:scale(1.03)}
.bm-media .bm-zoomtag{
  position:absolute; right:10px; bottom:10px; z-index:2;
  font-size:11.5px; font-weight:700; color:#2c3570; background:rgba(255,255,255,.92);
  border:1px solid var(--line); padding:5px 10px; border-radius:99px;
  opacity:0; transform:translateY(6px); transition:opacity .25s ease, transform .25s ease; pointer-events:none;
}
.bm-media .bm-stage:hover .bm-zoomtag{opacity:1; transform:translateY(0)}
.bm-lightbox{position:fixed; inset:0; z-index:9999; display:none; align-items:center; justify-content:center; padding:26px; background:rgba(24,26,48,.82); backdrop-filter:blur(2px); animation:bmFade .2s ease}
.bm-lightbox.is-open{display:flex}
.bm-lightbox img{max-width:min(92vw,900px); max-height:88vh; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.4)}
.bm-lightbox .bm-close{position:absolute; top:18px; right:18px; width:38px; height:38px; border-radius:50%; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.12); color:#fff; font-size:18px; line-height:1; display:flex; align-items:center; justify-content:center; transition:background .2s ease, transform .2s ease}
.bm-lightbox .bm-close:hover{background:rgba(255,255,255,.25); transform:rotate(90deg)}
@keyframes bmFade{from{opacity:0} to{opacity:1}}
.bm-info{padding:20px 18px; border:1px solid var(--line); border-radius:var(--r); background:var(--milk)}
.bm-info h3{margin:0 0 10px; font-size:12.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--blue)}
.bm-info h3:not(:first-child){margin-top:20px}
.bm-lede{font-size:14.5px; color:#3a4070; margin:0}
.bm-lede strong{color:#2c3570}
.bm-feat{margin:0 !important; padding:0 !important; list-style:none !important}
.bm-feat li{display:flex !important; gap:10px; align-items:flex-start; padding:9px 6px; margin:0 !important; list-style:none !important; border-bottom:1px dashed var(--line); border-radius:10px; transition:background .2s ease, padding-left .2s ease, transform .2s ease}
.bm-feat li:hover{background:var(--sky); padding-left:10px; transform:translateX(1px)}
.bm-feat li:last-child{border-bottom:0; padding-bottom:9px}
.bm-feat .ico{flex:0 0 30px; width:30px; height:30px; border-radius:9px; display:flex !important; align-items:center; justify-content:center; font-size:15px; background:var(--sky); transition:transform .3s cubic-bezier(.34,1.56,.64,1), background .2s ease}
.bm-feat li:hover .ico{transform:scale(1.15) rotate(-6deg); background:#fff}
.bm-feat .tx{flex:1 1 auto; min-width:0}
.bm-feat b{display:block; color:#2c3570; font-size:13.8px; margin-bottom:1px}
.bm-feat .t{display:block; color:var(--soft); font-size:13px; line-height:1.45}
.bm-spec{display:block !important; margin:0 !important; padding:0 !important; font-size:13.5px}
.bm-spec .bm-r{display:flex !important; flex-wrap:nowrap; align-items:baseline; justify-content:space-between; gap:12px; width:100%; margin:0 !important; padding:8px 6px; border-bottom:1px solid var(--line); border-radius:8px; transition:background .18s ease}
.bm-spec .bm-r:hover{background:var(--sky)}
.bm-spec .bm-r:last-child{border-bottom:0}
.bm-spec .bm-k{flex:0 0 auto; color:var(--soft); margin:0 !important}
.bm-spec .bm-v{flex:1 1 auto; min-width:0; text-align:right; color:#2c3570; font-weight:600; margin:0 !important; overflow-wrap:break-word}
.bm-note{margin:16px 0 0; padding:11px 13px; border-radius:12px; background:var(--lav); border:1px solid var(--line); font-size:12.8px; color:#3f4578; line-height:1.5}
.bm-note b{color:#2c3570}
.bm-faq{margin-top:6px; border:1px solid var(--line); border-radius:12px; overflow:hidden}
.bm-faq-item{border-bottom:1px solid var(--line)}
.bm-faq-item:last-child{border-bottom:0}
.bm-faq-q{width:100%; display:flex !important; align-items:center; justify-content:space-between; gap:10px; padding:11px 13px; background:#fff; border:0; text-align:left; font-size:13.4px; font-weight:700; color:#2c3570; transition:background .2s ease}
.bm-faq-q:hover{background:var(--sky)}
.bm-faq-q .bm-plus{flex:0 0 auto; width:18px; height:18px; position:relative}
.bm-faq-q .bm-plus::before,.bm-faq-q .bm-plus::after{content:""; position:absolute; background:var(--blue); border-radius:2px; transition:transform .3s ease}
.bm-faq-q .bm-plus::before{left:0; top:50%; width:100%; height:2px; transform:translateY(-50%)}
.bm-faq-q .bm-plus::after{top:0; left:50%; width:2px; height:100%; transform:translateX(-50%)}
.bm-faq-item.is-open .bm-plus::after{transform:translateX(-50%) rotate(90deg); opacity:0}
.bm-faq-a{max-height:0; overflow:hidden; background:var(--milk); transition:max-height .35s ease}
.bm-faq-a p{padding:0 13px 12px; margin:0; font-size:13px; color:var(--soft); line-height:1.55}
.bm-faq-item.is-open .bm-faq-a{max-height:260px}
.bm-cta{margin-top:18px; padding:16px; border-radius:14px; text-align:center; background:linear-gradient(135deg,var(--blue) 0%,#7d8aeb 100%); box-shadow:0 10px 24px -10px rgba(87,104,214,.55)}
.bm-cta p{color:#eef0ff; font-size:12.5px; margin:0 0 10px; letter-spacing:.02em}
.bm-cta a,.bm-cta button{display:inline-flex !important; align-items:center; gap:7px; background:#fff; color:var(--blue); font-weight:700; font-size:13.5px; padding:10px 20px; border-radius:99px; text-decoration:none; border:0; transition:transform .2s ease, box-shadow .2s ease}
.bm-cta a:hover,.bm-cta button:hover{transform:translateY(-2px) scale(1.03); box-shadow:0 10px 20px -6px rgba(0,0,0,.25)}
.bm-cta a:active,.bm-cta button:active{transform:translateY(0) scale(.98)}
@keyframes bmAtcGlow{0%{box-shadow:0 0 0 0 rgba(87,104,214,0)} 35%{box-shadow:0 0 9px 3px rgba(87,104,214,.5)} 65%{box-shadow:0 0 9px 3px rgba(87,104,214,.5)} 100%{box-shadow:0 0 0 0 rgba(87,104,214,0)}}
.bm-atc-glow{animation:bmAtcGlow 2.6s ease-in-out 1 !important}
@media (max-width:899px){
  .bm-bar{display:flex !important; align-items:center; justify-content:space-between; gap:12px; width:100%; margin:0; padding:15px 17px; cursor:pointer; user-select:none; -webkit-tap-highlight-color:transparent; border:1px solid var(--line); border-radius:14px; background:linear-gradient(135deg,#eaf2ff,#f2ecff); font-size:15.5px; font-weight:700; color:#2c3570; line-height:1.2}
  .bm-bar i{flex:0 0 auto; width:9px; height:9px; margin-right:4px; border-right:2px solid var(--blue); border-bottom:2px solid var(--blue); transform:rotate(45deg); transition:transform .35s cubic-bezier(.25,.8,.3,1)}
  .bm-toggle:checked ~ .bm-bar i{transform:rotate(-135deg)}
  .bm-toggle:focus-visible ~ .bm-bar{outline:2px solid var(--blue); outline-offset:2px}
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
<input class="bm-toggle" type="checkbox" id="bmDetails"> <label class="bm-bar" for="bmDetails">🫐 Product Details <i></i></label>
<div class="bm-c1"><div class="bm-inner">
<div class="bm-hero bm-reveal">
<span class="bm-eyebrow">Blueberry Milk Series</span>
<h2>🫐 Blueberry Milk Keycap Set 🥛</h2>
<p class="sub">138 Keys · Cherry Profile · Semi-Translucent PC · Hall-Effect Ready</p>
<div class="bm-badges"><span>🔢 138 Keys</span> <span>🎹 Cherry Profile</span> <span>💎 Glossy PC</span> <span>🧲 Hall Effect</span> <span>🌈 RGB Glow</span></div>
</div>
</div></div>
<div class="bm-grid">
<div class="bm-c2"><div class="bm-inner">
<div class="bm-info bm-reveal">
<p class="bm-lede">Sweet and dreamy — a <strong>138-piece PC keycap set</strong> blending soft blueberry-blue tones with a glossy, semi-translucent finish that glows beautifully under RGB backlighting. Built in <strong>Cherry Profile</strong> for a low, ergonomic typing angle and shaped to fit <strong>magnetic axis (Hall effect)</strong> switches. ✨</p>
<h3>Highlights</h3>
<ul class="bm-feat">
<li><span class="ico">🫐</span><span class="tx"><b>Blueberry milk palette</b><span class="t">Pastel blues over creamy milk tones for a cozy, kawaii desk.</span></span></li>
<li><span class="ico">🌈</span><span class="tx"><b>Glows under RGB</b><span class="t">Semi-translucent PC diffuses backlight into a soft candy glow.</span></span></li>
<li><span class="ico">🎹</span><span class="tx"><b>Cherry Profile comfort</b><span class="t">Low sculpted rows keep your wrists relaxed for hours.</span></span></li>
<li><span class="ico">🧲</span><span class="tx"><b>Magnetic-switch friendly</b><span class="t">Seats cleanly on Hall effect and standard MX-style stems.</span></span></li>
<li><span class="ico">🖨️</span><span class="tx"><b>Double-shot legends</b><span class="t">Crisp lettering that never fades or rubs off.</span></span></li>
</ul>
<h3>Specifications</h3>
<div class="bm-spec">
<div class="bm-r"><span class="bm-k">Key count</span><span class="bm-v">138 pcs</span></div>
<div class="bm-r"><span class="bm-k">Profile</span><span class="bm-v">Cherry</span></div>
<div class="bm-r"><span class="bm-k">Material</span><span class="bm-v">PC (Polycarbonate)</span></div>
<div class="bm-r"><span class="bm-k">Finish</span><span class="bm-v">Glossy, semi-translucent</span></div>
<div class="bm-r"><span class="bm-k">Backlight</span><span class="bm-v">RGB friendly</span></div>
<div class="bm-r"><span class="bm-k">Switch fit</span><span class="bm-v">Magnetic / Hall effect</span></div>
</div>
<h3>Compatibility &amp; Care</h3>
<div class="bm-faq">
<div class="bm-faq-item is-open"><button type="button" class="bm-faq-q"><span>🧷 Will this fit my keyboard?</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>Designed for standard MX-style and Hall-effect (magnetic) stems on 60%–TKL–full-size layouts. Check the bottom-row and spacebar sizes in the compatibility chart image before ordering.</p></div></div>
<div class="bm-faq-item"><button type="button" class="bm-faq-q"><span>🧼 How do I clean the keycaps?</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>Wipe with a soft, slightly damp cloth for dust. For a deeper clean, hand-wash in warm water with mild soap, rinse, and air-dry fully before reinstalling — never hot water or a dishwasher.</p></div></div>
<div class="bm-faq-item"><button type="button" class="bm-faq-q"><span>📦 What's included?</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>138 keycaps only. Keyboard, switches, and a keycap puller are not included unless stated elsewhere in the listing.</p></div></div>
</div>
<div class="bm-note"><b>📦 In the box:</b> 138 keycaps. Keyboard and switches not included.<br><b>💡 Before you order:</b> check your layout and bottom-row sizes against the compatibility charts.<br><b>🧼 Care:</b> wipe with a soft damp cloth, or hand-wash in warm water with mild soap and air-dry fully.</div>
<div class="bm-cta"><p>Loving the blueberry vibe? Let's get it on your desk ✨</p><button type="button" data-bm-goto-atc>🛒 Add to Cart</button></div>
</div>
</div></div>
<div class="bm-media"><!-- leave EMPTY: the product photos are injected here as a zero-gap stack --></div>
</div>
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
