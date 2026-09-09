// Blog presets + a pure standalone-HTML renderer. Shared by the server (blog
// generation / storage) and the client (picker + live preview). No DOM, no deps.

import type { BlogConfig, BlogDoc, NormalisedProduct } from "./types.ts";

/* ============================ layouts (30) ============================ */

export type BlogStructure =
  | "classic"
  | "magazine"
  | "listicle"
  | "cards"
  | "longform"
  | "minimal";

export interface BlogLayout {
  id: string;
  tr: string;
  en: string;
  /** which structural engine renders it */
  structure: BlogStructure;
  /** tiny inline-SVG wireframe for the picker */
  wire: string;
  /** extra CSS appended after the theme — the layout's visual signature */
  css: string;
}

const w = (r: string) =>
  `<svg viewBox="0 0 40 30" xmlns="http://www.w3.org/2000/svg" fill="currentColor" opacity=".55">${r}</svg>`;

export const BLOG_LAYOUTS: BlogLayout[] = [
  { id: "product", tr: "Ürün tarzı (otomatik)", en: "Product style (auto)", structure: "classic", wire: w('<rect x="6" y="3" width="28" height="6" rx="1"/><rect x="6" y="12" width="28" height="2"/><rect x="6" y="16" width="28" height="2"/><rect x="6" y="20" width="20" height="2"/>'), css: "" },
  { id: "classic-article", tr: "Klasik makale", en: "Classic article", structure: "classic", wire: w('<rect x="7" y="3" width="26" height="5"/><rect x="7" y="11" width="26" height="2"/><rect x="7" y="15" width="26" height="2"/><rect x="7" y="19" width="18" height="2"/>'), css: ".post-body>h2{border-bottom:2px solid var(--accent);padding-bottom:.2em}" },
  { id: "magazine-feature", tr: "Dergi dosyası", en: "Magazine feature", structure: "magazine", wire: w('<rect x="3" y="3" width="16" height="14"/><rect x="21" y="4" width="16" height="2"/><rect x="21" y="8" width="16" height="2"/><rect x="21" y="12" width="12" height="2"/><rect x="3" y="20" width="34" height="7"/>'), css: ".post-hero h1{font-size:2.6em;line-height:1.05}.post-body>p:first-of-type::first-letter{float:left;font-size:3.4em;line-height:.8;padding:.05em .1em 0 0;font-weight:800;color:var(--accent)}" },
  { id: "longform-toc", tr: "Uzun okuma + içindekiler", en: "Longform + TOC", structure: "longform", wire: w('<rect x="4" y="4" width="10" height="22"/><rect x="17" y="4" width="19" height="4"/><rect x="17" y="10" width="19" height="2"/><rect x="17" y="14" width="19" height="2"/><rect x="17" y="18" width="14" height="2"/>'), css: "" },
  { id: "listicle-numbered", tr: "Numaralı liste", en: "Numbered listicle", structure: "listicle", wire: w('<circle cx="8" cy="7" r="3"/><rect x="14" y="6" width="22" height="3"/><circle cx="8" cy="16" r="3"/><rect x="14" y="15" width="22" height="3"/><circle cx="8" cy="25" r="3"/><rect x="14" y="24" width="22" height="3"/>'), css: "" },
  { id: "card-grid", tr: "Kart ızgarası", en: "Card grid", structure: "cards", wire: w('<rect x="4" y="4" width="15" height="11" rx="2"/><rect x="21" y="4" width="15" height="11" rx="2"/><rect x="4" y="17" width="15" height="11" rx="2"/><rect x="21" y="17" width="15" height="11" rx="2"/>'), css: "" },
  { id: "hero-split", tr: "Bölünmüş kahraman", en: "Split hero", structure: "classic", wire: w('<rect x="3" y="3" width="18" height="12"/><rect x="23" y="4" width="14" height="3"/><rect x="23" y="9" width="14" height="2"/><rect x="3" y="18" width="34" height="9"/>'), css: ".post-hero{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center}@media(max-width:640px){.post-hero{grid-template-columns:1fr}}" },
  { id: "editorial-serif", tr: "Editoryal serif", en: "Editorial serif", structure: "classic", wire: w('<rect x="9" y="3" width="22" height="5"/><rect x="7" y="12" width="26" height="2"/><rect x="7" y="16" width="26" height="2"/><rect x="7" y="20" width="16" height="2"/>'), css: "body{font-family:'Iowan Old Style',Palatino,Georgia,serif}.post-body{font-size:1.12em;line-height:1.85}" },
  { id: "docs-guide", tr: "Kılavuz / dokümantasyon", en: "Docs / guide", structure: "longform", wire: w('<rect x="4" y="4" width="9" height="22"/><rect x="16" y="4" width="20" height="3"/><rect x="16" y="9" width="20" height="2"/><rect x="16" y="13" width="20" height="2"/><rect x="16" y="18" width="15" height="2"/>'), css: ".post-body{--code:1}.post-body h2{counter-increment:h2;}.post-body h2::before{content:counter(h2) '. ';color:var(--accent);font-weight:800}.post-body{counter-reset:h2}" },
  { id: "story-narrative", tr: "Anlatı / hikâye", en: "Narrative story", structure: "minimal", wire: w('<rect x="10" y="4" width="20" height="4"/><rect x="8" y="12" width="24" height="2"/><rect x="8" y="16" width="24" height="2"/><rect x="8" y="20" width="24" height="2"/><rect x="8" y="24" width="16" height="2"/>'), css: ".post-wrap{max-width:640px}.post-body p{margin:1.2em 0}" },
  { id: "review-verdict", tr: "İnceleme + sonuç kutusu", en: "Review + verdict box", structure: "classic", wire: w('<rect x="6" y="3" width="28" height="5"/><rect x="6" y="11" width="28" height="6" rx="2"/><rect x="6" y="20" width="28" height="2"/><rect x="6" y="24" width="20" height="2"/>'), css: ".post-body>h2:first-of-type{background:var(--card);border-left:4px solid var(--accent);padding:.6em .8em;border-radius:8px}" },
  { id: "comparison-table", tr: "Karşılaştırma tablosu", en: "Comparison table", structure: "classic", wire: w('<rect x="5" y="4" width="30" height="4"/><rect x="5" y="10" width="14" height="16"/><rect x="21" y="10" width="14" height="16"/>'), css: ".post-body table{width:100%;border-collapse:collapse;margin:1.4em 0}.post-body th,.post-body td{border:1px solid var(--line);padding:.6em .7em;text-align:left}.post-body thead{background:var(--card)}" },
  { id: "gallery-led", tr: "Görsel öncelikli", en: "Gallery-led", structure: "magazine", wire: w('<rect x="3" y="3" width="34" height="12"/><rect x="3" y="17" width="16" height="9"/><rect x="21" y="17" width="16" height="9"/>'), css: ".post-figure{margin:1.6em 0}.post-figure img{border-radius:12px}" },
  { id: "minimal-mono", tr: "Minimal mono", en: "Minimal mono", structure: "minimal", wire: w('<rect x="9" y="5" width="22" height="3"/><rect x="9" y="13" width="22" height="2"/><rect x="9" y="17" width="22" height="2"/><rect x="9" y="21" width="14" height="2"/>'), css: "body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.post-body{line-height:1.8}" },
  { id: "newspaper-columns", tr: "Gazete sütunları", en: "Newspaper columns", structure: "magazine", wire: w('<rect x="4" y="3" width="32" height="5"/><rect x="4" y="11" width="15" height="16"/><rect x="21" y="11" width="15" height="16"/>'), css: "@media(min-width:760px){.post-body{column-count:2;column-gap:34px}.post-body h2,.post-figure{column-span:all}}" },
  { id: "faq-first", tr: "Önce SSS", en: "FAQ first", structure: "classic", wire: w('<rect x="6" y="3" width="28" height="4"/><rect x="6" y="10" width="28" height="3" rx="1"/><rect x="6" y="15" width="28" height="3" rx="1"/><rect x="6" y="21" width="24" height="2"/>'), css: "" },
  { id: "timeline", tr: "Zaman çizelgesi", en: "Timeline", structure: "listicle", wire: w('<rect x="9" y="3" width="2" height="24"/><circle cx="10" cy="7" r="3"/><rect x="15" y="6" width="20" height="3"/><circle cx="10" cy="18" r="3"/><rect x="15" y="17" width="20" height="3"/>'), css: ".post-body>h2{position:relative;padding-left:1.1em}.post-body>h2::before{content:'';position:absolute;left:0;top:.35em;width:.5em;height:.5em;border-radius:50%;background:var(--accent)}" },
  { id: "pillar-hub", tr: "Sütun (pillar) içerik", en: "Pillar hub", structure: "longform", wire: w('<rect x="6" y="3" width="28" height="6"/><rect x="6" y="12" width="13" height="6"/><rect x="21" y="12" width="13" height="6"/><rect x="6" y="20" width="28" height="2"/>'), css: "" },
  { id: "roundup", tr: "Derleme (roundup)", en: "Roundup", structure: "cards", wire: w('<rect x="5" y="4" width="30" height="6" rx="2"/><rect x="5" y="12" width="30" height="6" rx="2"/><rect x="5" y="20" width="30" height="6" rx="2"/>'), css: ".post-card{display:flex;gap:14px;align-items:flex-start}" },
  { id: "how-to-steps", tr: "Nasıl yapılır (adımlar)", en: "How-to steps", structure: "listicle", wire: w('<rect x="5" y="4" width="8" height="8" rx="2"/><rect x="16" y="5" width="20" height="2"/><rect x="16" y="9" width="20" height="2"/><rect x="5" y="16" width="8" height="8" rx="2"/><rect x="16" y="17" width="20" height="2"/>'), css: "" },
  { id: "qa-interview", tr: "Soru-cevap / röportaj", en: "Q&A interview", structure: "minimal", wire: w('<rect x="6" y="4" width="10" height="3"/><rect x="6" y="9" width="28" height="2"/><rect x="6" y="15" width="10" height="3"/><rect x="6" y="20" width="28" height="2"/>'), css: ".post-body>h2{color:var(--accent);font-size:1.05em;text-transform:none}" },
  { id: "case-study", tr: "Vaka çalışması", en: "Case study", structure: "classic", wire: w('<rect x="6" y="3" width="28" height="5"/><rect x="6" y="11" width="8" height="8"/><rect x="17" y="12" width="17" height="2"/><rect x="17" y="16" width="17" height="2"/><rect x="6" y="22" width="28" height="2"/>'), css: "" },
  { id: "cheatsheet", tr: "Hızlı başvuru", en: "Cheat sheet", structure: "cards", wire: w('<rect x="4" y="4" width="16" height="8"/><rect x="22" y="4" width="14" height="8"/><rect x="4" y="15" width="14" height="8"/><rect x="20" y="15" width="16" height="8"/>'), css: ".post-card{font-size:.95em}" },
  { id: "big-type", tr: "İri tipografi", en: "Big type", structure: "minimal", wire: w('<rect x="5" y="4" width="30" height="8"/><rect x="5" y="16" width="26" height="3"/><rect x="5" y="22" width="20" height="3"/>'), css: ".post-hero h1{font-size:3.1em;line-height:1}.post-body{font-size:1.15em}" },
  { id: "boxed-cards", tr: "Kutulu bölümler", en: "Boxed sections", structure: "classic", wire: w('<rect x="5" y="3" width="30" height="5"/><rect x="5" y="11" width="30" height="7" rx="2"/><rect x="5" y="20" width="30" height="7" rx="2"/>'), css: ".post-body>h2{margin-top:1.8em}.post-body>h2+p{background:var(--card);padding:.8em 1em;border-radius:10px}" },
  { id: "sidebar-notes", tr: "Kenar notları", en: "Sidebar notes", structure: "longform", wire: w('<rect x="4" y="4" width="22" height="4"/><rect x="4" y="11" width="22" height="2"/><rect x="4" y="15" width="22" height="2"/><rect x="29" y="4" width="7" height="18"/>'), css: "" },
  { id: "zine", tr: "Zine / kolaj", en: "Zine / collage", structure: "magazine", wire: w('<rect x="4" y="5" width="14" height="10" transform="rotate(-4 11 10)"/><rect x="21" y="4" width="15" height="9" transform="rotate(3 28 8)"/><rect x="6" y="19" width="28" height="7"/>'), css: ".post-figure img{border:6px solid var(--fg)}.post-hero h1{transform:rotate(-1.5deg)}" },
  { id: "scandi-clean", tr: "İskandinav sade", en: "Scandi clean", structure: "classic", wire: w('<rect x="8" y="4" width="24" height="4"/><rect x="8" y="12" width="24" height="2"/><rect x="8" y="16" width="24" height="2"/><rect x="8" y="20" width="16" height="2"/>'), css: ".post-wrap{max-width:680px}.post-body{line-height:1.9}h2{font-weight:600;letter-spacing:-.01em}" },
  { id: "spec-rhythm", tr: "Editoryal ritim", en: "Editorial rhythm", structure: "classic", wire: w('<rect x="6" y="3" width="28" height="5"/><rect x="6" y="12" width="28" height="1"/><rect x="10" y="15" width="16" height="2"/><rect x="6" y="21" width="28" height="1"/>'), css: ".post-body>h2{border-top:1px solid var(--line);padding-top:.8em;text-transform:uppercase;letter-spacing:.08em;font-size:.95em}" },
  { id: "poster", tr: "Afiş / kapak", en: "Poster / cover", structure: "magazine", wire: w('<rect x="3" y="3" width="34" height="16"/><rect x="6" y="8" width="20" height="4"/><rect x="4" y="21" width="34" height="6"/>'), css: ".post-hero{text-align:center}.post-hero h1{font-size:2.9em}.post-hero .post-meta{justify-content:center}" },
];

/* ============================= themes (30) ============================ */

export interface BlogTheme {
  id: string;
  tr: string;
  en: string;
  /** CSS custom-property block (without the :root wrapper) */
  vars: Record<string, string>;
  /** google-fonts family names, first is body, second (optional) is headings */
  fonts?: [string, string?];
  /** any extra rules */
  extra?: string;
}

const T = (
  id: string,
  tr: string,
  en: string,
  bg: string,
  fg: string,
  accent: string,
  muted: string,
  card: string,
  line: string,
  radius: string,
  fonts?: [string, string?],
  extra?: string,
): BlogTheme => ({
  id,
  tr,
  en,
  vars: { "--bg": bg, "--fg": fg, "--accent": accent, "--muted": muted, "--card": card, "--line": line, "--radius": radius },
  fonts,
  extra,
});

export const BLOG_THEMES: BlogTheme[] = [
  T("product", "Ürün tarzı (otomatik)", "Product style (auto)", "#ffffff", "#1a1a1a", "#c8622d", "#6b6b6b", "#f6f2ee", "#e7e0d8", "12px", ["Inter", "Fraunces"]),
  T("classic", "Klasik", "Classic", "#fdfcfa", "#20201d", "#8a5a2b", "#5f5c55", "#f3efe7", "#e4ded2", "6px", ["Georgia", "Georgia"]),
  T("retro", "Retro 70'ler", "Retro 70s", "#fdf3e3", "#3a2a17", "#d2691e", "#7a5c3e", "#f6e3c5", "#e6cfa8", "4px", ["Rubik", "Bitter"], "h1,h2{text-transform:uppercase;letter-spacing:.03em}"),
  T("cute", "Sevimli / kawaii", "Cute / kawaii", "#fff6fa", "#4a2f3d", "#f2789f", "#8a6b78", "#ffe6f0", "#ffd0e2", "18px", ["Quicksand", "Baloo 2"]),
  T("minimal", "Minimal", "Minimal", "#ffffff", "#111111", "#111111", "#767676", "#f4f4f4", "#e6e6e6", "2px", ["Inter", "Inter"]),
  T("luxe", "Lüks", "Luxe", "#0f0f10", "#f2efe9", "#c9a35b", "#a9a49a", "#1a1a1c", "#2a2a2d", "2px", ["Cormorant Garamond", "Cormorant Garamond"], "h1,h2{font-weight:500}"),
  T("dark", "Koyu mod", "Dark", "#101418", "#e6eaf0", "#5ea0ff", "#9aa4b2", "#171c22", "#252c35", "12px", ["Inter", "Inter"]),
  T("playful", "Neşeli", "Playful", "#fffdf5", "#232323", "#ff5c39", "#6c6c6c", "#fff0d6", "#ffe0b0", "16px", ["Poppins", "Poppins"]),
  T("editorial", "Editoryal", "Editorial", "#faf9f7", "#1c1c1c", "#b03636", "#5c5c5c", "#f0ede8", "#e2ddd4", "4px", ["Source Serif 4", "Playfair Display"]),
  T("techno", "Tekno", "Techno", "#0b0e11", "#d7e2ea", "#39d0d8", "#8b97a3", "#12171c", "#20272e", "8px", ["Space Grotesk", "Space Grotesk"]),
  T("pastel", "Pastel", "Pastel", "#fbf7ff", "#33304a", "#8b7bd8", "#726f8a", "#f0eafd", "#e3dbf7", "16px", ["Nunito", "Nunito"]),
  T("brutalist", "Brütalist", "Brutalist", "#ffffff", "#000000", "#0000ff", "#333333", "#ffffff", "#000000", "0px", ["Arial", "Arial"], ".post-wrap{border:3px solid #000}h2{border:2px solid #000;padding:.2em .4em;display:inline-block}"),
  T("vintage-print", "Vintage baskı", "Vintage print", "#f4ecd8", "#2b2620", "#7c3a2d", "#6e6350", "#ece0c4", "#dccda6", "3px", ["Bitter", "Bitter"]),
  T("scandi", "İskandinav", "Scandinavian", "#fbfbf9", "#26261f", "#5b7f6f", "#6f6f66", "#f0f0ea", "#e2e2d8", "10px", ["Inter", "Inter"]),
  T("y2k", "Y2K", "Y2K", "#eef6ff", "#1b2b3a", "#ff3ea5", "#5a6b7a", "#e2f0ff", "#c9e2ff", "20px", ["Chakra Petch", "Chakra Petch"]),
  T("neon", "Neon", "Neon", "#0a0a12", "#eef0ff", "#b026ff", "#8a8ca8", "#12121f", "#221f3a", "10px", ["Rajdhani", "Rajdhani"], "a{text-shadow:0 0 6px var(--accent)}"),
  T("earthy", "Toprak tonları", "Earthy", "#f6f1e9", "#2f2a22", "#6b7d4b", "#6a6152", "#ece3d3", "#dccdb4", "8px", ["Mulish", "Bitter"]),
  T("mono-ink", "Mürekkep mono", "Ink mono", "#ffffff", "#141414", "#141414", "#5a5a5a", "#f2f2f2", "#dcdcdc", "0px", ["Newsreader", "Newsreader"]),
  T("corporate", "Kurumsal", "Corporate", "#ffffff", "#1b2330", "#1857c4", "#5b6472", "#f2f5f9", "#e1e7ef", "6px", ["Inter", "Inter"]),
  T("zine", "Zine", "Zine", "#fffef7", "#111111", "#e2241a", "#444444", "#fff3b0", "#111111", "0px", ["Oswald", "Oswald"]),
  T("kawaii-soft", "Yumuşak kawaii", "Soft kawaii", "#fef7f9", "#5b3a4a", "#f49ac1", "#94707f", "#ffeaf2", "#ffd9e6", "22px", ["Comfortaa", "Baloo 2"]),
  T("gothic", "Gotik", "Gothic", "#0d0c0f", "#e4e0e6", "#9b2226", "#8f8a92", "#151318", "#2a262e", "2px", ["EB Garamond", "Cinzel"]),
  T("art-deco", "Art Deco", "Art Deco", "#101512", "#efe7d3", "#d4af37", "#a39c88", "#171d19", "#2b3129", "2px", ["Poiret One", "Cinzel"]),
  T("bauhaus", "Bauhaus", "Bauhaus", "#f5f2ea", "#111111", "#e63946", "#4a4a4a", "#ffd100", "#111111", "0px", ["Archivo", "Archivo Black"]),
  T("sunset", "Gün batımı", "Sunset", "#fff5ef", "#3a1f2b", "#e2603b", "#7a5a5f", "#ffe6d6", "#ffccb0", "14px", ["Mulish", "Fraunces"]),
  T("forest", "Orman", "Forest", "#f2f6f0", "#1f2a22", "#2f6b46", "#5a675c", "#e4efe0", "#cfe0c8", "10px", ["Mulish", "Bitter"]),
  T("ocean", "Okyanus", "Ocean", "#f1f8fb", "#12303a", "#0e7c9b", "#556d76", "#e0f0f6", "#c4e3ee", "12px", ["Inter", "Fraunces"]),
  T("candy", "Şeker", "Candy", "#fff7fb", "#3d2340", "#ff4fa3", "#7c6b7f", "#ffe3f2", "#ffc7e5", "20px", ["Baloo 2", "Baloo 2"]),
  T("noir", "Noir", "Noir", "#111111", "#e8e8e8", "#c0392b", "#9a9a9a", "#181818", "#2b2b2b", "2px", ["Oswald", "Oswald"]),
  T("craft-paper", "Kraft kâğıt", "Craft paper", "#e9dcc3", "#33291b", "#8a5a2b", "#5f5340", "#dfceac", "#c9b489", "6px", ["Bitter", "Bitter"]),
];

/* ============================= voices (30) =========================== */

export interface BlogVoice {
  id: string;
  tr: string;
  en: string;
  /** short guide injected into the LLM prompt */
  guide: string;
}

const V = (id: string, tr: string, en: string, guide: string): BlogVoice => ({ id, tr, en, guide });

export const BLOG_VOICES: BlogVoice[] = [
  V("product", "Ürün tarzı (otomatik)", "Product style (auto)", "match the product's own vibe and target buyer; pick the register that best fits the niche."),
  V("professional", "Profesyonel", "Professional", "clear, credible, third-person-leaning, no slang, confident but not salesy."),
  V("minimalist", "Minimalist", "Minimalist", "short sentences, plain words, lots of white space, no filler, one idea per paragraph."),
  V("storytelling", "Hikâye anlatan", "Storytelling", "open with a small scene, use narrative arc, concrete sensory detail, then land the point."),
  V("conversational", "Sohbet havası", "Conversational", "second person, contractions, rhetorical questions, friendly and warm."),
  V("authoritative", "Otoriter uzman", "Authoritative expert", "assertive, cites mechanisms and standards, defines terms precisely, no hedging."),
  V("witty", "Esprili", "Witty", "light humour, playful analogies, still informative; never at the reader's expense."),
  V("enthusiastic", "Coşkulu", "Enthusiastic", "energetic, exclamation-sparing but upbeat, highlights delight and payoff."),
  V("journalistic", "Gazeteci", "Journalistic", "inverted pyramid, attributable claims, neutral tone, tight ledes."),
  V("academic", "Akademik", "Academic", "structured, hedged where uncertain, precise terminology, formal connectors."),
  V("friendly", "Samimi", "Friendly", "like a helpful friend, encouraging, reassuring, practical."),
  V("luxury", "Lüks", "Luxury", "restrained, evocative, sensory, focuses on craft, materials and provenance."),
  V("technical", "Teknik", "Technical", "spec-first, tables and exact figures, tolerances, compatibility notes."),
  V("persuasive", "İkna edici", "Persuasive", "problem-agitate-solve, benefits over features, social proof, clear CTA."),
  V("inspirational", "İlham verici", "Inspirational", "aspirational framing, big-picture why, motivating close."),
  V("casual", "Rahat", "Casual", "relaxed, everyday phrasing, a little informal, easy to skim."),
  V("formal", "Resmî", "Formal", "complete sentences, no contractions, measured, respectful distance."),
  V("playful", "Oyuncu", "Playful", "puns welcome, bouncy rhythm, emoji sparingly, keeps it fun."),
  V("empathetic", "Empatik", "Empathetic", "acknowledges the reader's frustration first, gentle, solution-focused."),
  V("bold", "Cesur", "Bold", "strong claims, punchy short lines, opinionated, takes a stance."),
  V("poetic", "Şiirsel", "Poetic", "imagery, rhythm, metaphor; still delivers the practical information."),
  V("straightforward", "Dolambaçsız", "Straightforward", "no fluff, just the facts and steps, direct answers up front."),
  V("analytical", "Analitik", "Analytical", "compares options, weighs trade-offs, uses criteria and scoring."),
  V("warm", "Sıcak", "Warm", "kind, human, inclusive, gentle encouragement throughout."),
  V("energetic", "Enerjik", "Energetic", "fast pace, active verbs, momentum from section to section."),
  V("quirky", "Sıra dışı", "Quirky", "unexpected angles, offbeat comparisons, memorable phrasing."),
  V("confident", "Kendinden emin", "Confident", "no qualifiers, states things plainly, owns recommendations."),
  V("nostalgic", "Nostaljik", "Nostalgic", "references the past fondly, ties the product to memory and ritual."),
  V("punchy", "Vurucu", "Punchy", "one-two-sentence paragraphs, verbs first, headline energy in the body."),
  V("editorial", "Köşe yazısı", "Editorial", "a clear point of view, argued in sections, ends with a considered verdict."),
];

/* ==================== resolution + HTML rendering ==================== */

export const isProductPreset = (id?: string) => !id || id === "product";

/** Derive a concrete {layout,theme,voice} triple from the product / category. */
const VIBES: { re: RegExp; layout: string; theme: string; voice: string }[] = [
  { re: /(cute|kawaii|adorable|pastel|sanrio|plush|bunny|kitty)/i, layout: "card-grid", theme: "cute", voice: "playful" },
  { re: /(anime|manga|gaming|otaku|pixel|arcade)/i, layout: "zine", theme: "y2k", voice: "storytelling" },
  { re: /(mechanical keyboard|keycap|artisan|deskmat|gmk|pbt|switch)/i, layout: "listicle-numbered", theme: "techno", voice: "technical" },
  { re: /(luxury|premium|handcrafted|artisanal|heirloom|solid brass|leather|walnut)/i, layout: "editorial-serif", theme: "luxe", voice: "luxury" },
  { re: /(retro|vintage|nostalg|70s|80s)/i, layout: "newspaper-columns", theme: "retro", voice: "nostalgic" },
  { re: /(minimal|scandi|muji|understated)/i, layout: "scandi-clean", theme: "scandi", voice: "minimalist" },
  { re: /(eco|sustainable|organic|bamboo|recycled)/i, layout: "story-narrative", theme: "forest", voice: "warm" },
  { re: /(smart|electronic|gadget|wireless|rgb)/i, layout: "docs-guide", theme: "dark", voice: "straightforward" },
];

export function productStyleHint(
  product?: NormalisedProduct | null,
  category?: string,
): { layout: string; theme: string; voice: string } {
  const hay = [
    product?.titleTranslated || product?.title || "",
    category || "",
    Object.values(product?.props || {}).join(" "),
    (product?.descHtml || "").replace(/<[^>]+>/g, " ").slice(0, 1500),
  ].join(" ");
  for (const v of VIBES) if (v.re.test(hay)) return { layout: v.layout, theme: v.theme, voice: v.voice };
  return { layout: "classic-article", theme: "editorial", voice: "professional" };
}

/** Map "product" selections to a concrete triple, honouring an optional hint. */
export function resolveBlogConfig(
  cfg: BlogConfig,
  hint?: { layout?: string; theme?: string; voice?: string },
): { layout: BlogLayout; theme: BlogTheme; voice: BlogVoice } {
  const pick = <X extends { id: string }>(arr: X[], id: string, fb: string) =>
    arr.find((x) => x.id === id) || arr.find((x) => x.id === fb) || arr[0];
  const layoutId = isProductPreset(cfg.layout) ? hint?.layout || "classic-article" : cfg.layout;
  const themeId = isProductPreset(cfg.theme) ? hint?.theme || "editorial" : cfg.theme;
  const voiceId = isProductPreset(cfg.voice) ? hint?.voice || "professional" : cfg.voice;
  return {
    layout: pick(BLOG_LAYOUTS, layoutId, "classic-article"),
    theme: pick(BLOG_THEMES, themeId, "classic"),
    voice: pick(BLOG_VOICES, voiceId, "professional"),
  };
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s: string) =>
  (s || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";

/** Turn one body string into a <p>, a <li>, or a raw block. Leading "- " = bullet. */
function bodyToHtml(lines: string[], links: { url: string; label?: string }[]): string {
  const out: string[] = [];
  let inList = false;
  const linkify = (txt: string) => {
    let t = esc(txt);
    for (const l of links) {
      if (!l.url) continue;
      const anchor = esc(l.label || l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""));
      // link the first plain occurrence of the label if present, else append nothing here
      if (l.label && t.includes(esc(l.label))) {
        t = t.replace(esc(l.label), `<a href="${esc(l.url)}" rel="noopener">${anchor}</a>`);
      }
    }
    return t;
  };
  for (const raw of lines || []) {
    const line = (raw || "").trim();
    if (!line) continue;
    if (/^-\s+/.test(line)) {
      if (!inList) (out.push("<ul>"), (inList = true));
      out.push(`<li>${linkify(line.replace(/^-\s+/, ""))}</li>`);
    } else {
      if (inList) (out.push("</ul>"), (inList = false));
      out.push(`<p>${linkify(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function figure(url?: string, alt = "", lazy = true): string {
  if (!url) return "";
  return `<figure class="post-figure"><img src="${esc(url)}" alt="${esc(alt)}"${lazy ? ' loading="lazy" decoding="async"' : ""}></figure>`;
}

function videoEmbed(url?: string): string {
  if (!url) return "";
  return `<figure class="post-figure post-video"><video src="${esc(url)}" controls playsinline preload="metadata" style="width:100%;border-radius:var(--radius)"></video></figure>`;
}

function tocHtml(doc: BlogDoc): string {
  if (!doc.sections?.length) return "";
  const items = doc.sections
    .map((s) => `<li><a href="#${slug(s.heading)}">${esc(s.heading)}</a></li>`)
    .join("");
  return `<nav class="post-toc" aria-label="Contents"><b>İçindekiler</b><ol>${items}</ol></nav>`;
}

function faqHtml(doc: BlogDoc): string {
  if (!doc.faq?.length) return "";
  const items = doc.faq
    .map(
      (f) =>
        `<details class="post-faq-item"><summary>${esc(f.q)}</summary><div>${bodyToHtml([f.a], [])}</div></details>`,
    )
    .join("\n");
  return `<section class="post-faq" id="faq"><h2>SSS</h2>${items}</section>`;
}

function sectionsHtml(
  doc: BlogDoc,
  structure: BlogStructure,
  links: { url: string; label?: string }[],
  lazy: boolean,
): string {
  const one = (s: BlogDoc["sections"][number], i: number) => {
    const id = slug(s.heading);
    const fig = figure(s.image, s.heading, lazy);
    const body = bodyToHtml(s.body, links);
    if (structure === "listicle")
      return `<section class="post-item" id="${id}"><h2><span class="post-num">${i + 1}</span> ${esc(s.heading)}</h2>${fig}${body}</section>`;
    if (structure === "cards")
      return `<section class="post-card" id="${id}"><h2>${esc(s.heading)}</h2>${fig}${body}</section>`;
    return `<section id="${id}"><h2>${esc(s.heading)}</h2>${fig}${body}</section>`;
  };
  const inner = (doc.sections || []).map(one).join("\n");
  if (structure === "cards") return `<div class="post-cards">${inner}</div>`;
  return inner;
}

function jsonLd(doc: BlogDoc, cfg: BlogConfig, canonical: string): string {
  const blocks: any[] = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: doc.seoTitle || doc.title,
      description: doc.metaDescription,
      articleBody: [doc.intro, ...(doc.sections || []).map((s) => s.body)].flat().join(" ").slice(0, 5000),
      keywords: (doc.keywords || []).join(", "),
      image: doc.hero ? [doc.hero] : undefined,
      mainEntityOfPage: canonical || undefined,
    },
  ];
  if (cfg.html.faq && doc.faq?.length) {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: doc.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  if (cfg.html.breadcrumbs && cfg.category) {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Blog", item: cfg.siteUrl || undefined },
        { "@type": "ListItem", position: 2, name: cfg.category },
        { "@type": "ListItem", position: 3, name: doc.title },
      ],
    });
  }
  return blocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, "\\u003c")}</script>`)
    .join("\n");
}

/** rough perceived luminance of a #rgb / #rrggbb colour, 0 (black) … 1 (white) */
function luma(hex: string): number {
  const h = (hex || "").replace("#", "").trim();
  const s = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h;
  const n = parseInt(s.slice(0, 6) || "888888", 16);
  if (Number.isNaN(n)) return 0.5;
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function themeCss(theme: BlogTheme): string {
  // The blog canvas is ALWAYS white. Dark themes keep their accent/font/radius
  // but their bg/fg/card/line are flipped to a light, readable scheme.
  const v = { ...theme.vars };
  if (luma(v["--bg"] || "#fff") < 0.62) {
    v["--bg"] = "#ffffff";
    if (luma(v["--fg"] || "#111") > 0.5) v["--fg"] = "#1b1b1b";
    if (luma(v["--card"] || "#f2f2f2") < 0.85) v["--card"] = "#f6f6f7";
    if (luma(v["--line"] || "#e5e5e5") < 0.75) v["--line"] = "#e6e6e8";
    if (luma(v["--muted"] || "#666") < 0.28) v["--muted"] = "#6a6a70";
  } else {
    v["--bg"] = "#ffffff";
  }
  const vars = Object.entries(v)
    .map(([k, val]) => `${k}:${val}`)
    .join(";");
  const [body, head] = theme.fonts || ["Inter", "Inter"];
  const stack = (f?: string) => (f ? `'${f}', ` : "") + "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  return `:root{${vars}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:#ffffff;color:var(--fg);font-family:${stack(body)};line-height:1.7;font-size:17px;-webkit-font-smoothing:antialiased}
.post-wrap{max-width:760px;margin:0 auto;padding:48px 20px 80px;background:#ffffff}
/* soft, elegant reveal of each block as it scrolls in */
.post-hero,.post-body>section,.post-figure,.post-toc,.post-faq,.post-cta,.post-refs{
  animation:tps-rise .7s cubic-bezier(.22,.61,.36,1) both}
.post-body>section{animation-timeline:view();animation-range:entry 0% cover 22%}
.post-figure{animation-timeline:view();animation-range:entry 0% cover 20%}
@keyframes tps-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.post-body a{transition:color .18s ease,opacity .18s ease}
.post-body a:hover{opacity:.72}
.post-figure img,.post-card{transition:transform .35s cubic-bezier(.22,.61,.36,1),box-shadow .35s ease}
.post-figure img:hover{transform:translateY(-2px)}
.post-body>section{scroll-margin-top:24px;padding-top:.4em}
.post-body>section+section{margin-top:2.2em;border-top:1px solid var(--line)}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .post-hero,.post-body>section,.post-figure,.post-toc,.post-faq,.post-cta,.post-refs{animation:none}
  .post-figure img,.post-card,.post-body a{transition:none}
}
.post-hero h1{font-family:${stack(head)};font-size:2.2em;line-height:1.15;margin:.2em 0 .3em}
.post-meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:.9em;margin-bottom:8px}
.post-lede{font-size:1.12em;color:var(--fg)}
.post-body h2{font-family:${stack(head)};font-size:1.5em;margin:1.8em 0 .5em}
.post-body h3{font-size:1.15em;margin:1.4em 0 .4em}
.post-body a{color:var(--accent);text-underline-offset:2px}
.post-body img,.post-figure img{max-width:100%;height:auto;display:block;border-radius:var(--radius)}
.post-figure{margin:1.4em 0}
.post-toc{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:14px 18px;margin:1.4em 0}
.post-toc ol{margin:.4em 0 0;padding-left:1.2em}
.post-toc a{color:var(--accent)}
.post-num{display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;border-radius:50%;background:var(--accent);color:#fff;font-size:.7em;margin-right:.4em;vertical-align:middle}
.post-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.post-card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}
.post-faq{margin-top:2.4em}
.post-faq-item{border-bottom:1px solid var(--line);padding:.7em 0}
.post-faq-item summary{cursor:pointer;font-weight:700}
.post-cta{margin-top:2.4em;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:var(--radius);padding:18px 20px}
.post-refs{margin-top:2em;font-size:.9em;color:var(--muted)}
.post-refs a{color:var(--accent)}
${theme.extra || ""}`;
}

export interface RenderBlogOpts {
  config: BlogConfig;
  hint?: { layout?: string; theme?: string; voice?: string };
  /** absolute canonical URL if known */
  canonical?: string;
}

/** Full standalone HTML document + a body-only fragment for pasting into a CMS. */
export function renderBlogHtml(doc: BlogDoc, opts: RenderBlogOpts): { full: string; body: string } {
  const cfg = opts.config;
  const { layout, theme } = resolveBlogConfig(cfg, opts.hint);
  const links = [
    ...(cfg.siteUrl ? [{ url: cfg.siteUrl, label: cfg.category || "our shop" }] : []),
    ...(cfg.backlinks || []).filter((b) => b && b.url),
  ];
  const lazy = cfg.html.lazyImages !== false;

  const heroFig = doc.hero ? figure(doc.hero, doc.title, false) : "";
  const vid = cfg.includeVideo && doc.video ? videoEmbed(doc.video) : "";
  const toc = cfg.html.toc !== false ? tocHtml(doc) : "";
  const faqBlock = cfg.html.faq !== false ? faqHtml(doc) : "";
  const bodySections = sectionsHtml(doc, layout.structure, links, lazy);
  const intro = bodyToHtml(doc.intro || [], links);

  const refs =
    links.length > 0
      ? `<div class="post-refs"><b>Bağlantılar:</b> ${links
          .map((l) => `<a href="${esc(l.url)}" rel="noopener">${esc(l.label || l.url)}</a>`)
          .join(" · ")}</div>`
      : "";

  const ctaHtml = doc.cta
    ? `<aside class="post-cta">${bodyToHtml([doc.cta], links)}</aside>`
    : "";

  const article = `<article class="post">
  <header class="post-hero">
    <div class="post-meta"><span>${esc(cfg.category || "Blog")}</span><span>${(doc.keywords || []).slice(0, 3).map(esc).join(" · ")}</span></div>
    <h1>${esc(doc.title)}</h1>
    <p class="post-lede">${esc(doc.excerpt)}</p>
  </header>
  ${heroFig}
  ${vid}
  ${toc}
  <div class="post-body">
    ${intro}
    ${bodySections}
  </div>
  ${faqBlock}
  ${ctaHtml}
  ${refs}
</article>`;

  const body = article;

  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(doc.seoTitle || doc.title)}</title>`,
    cfg.html.meta !== false ? `<meta name="description" content="${esc(doc.metaDescription)}">` : "",
    cfg.html.meta !== false ? `<meta property="og:title" content="${esc(doc.seoTitle || doc.title)}">` : "",
    cfg.html.meta !== false ? `<meta property="og:description" content="${esc(doc.metaDescription)}">` : "",
    cfg.html.meta !== false && doc.hero ? `<meta property="og:image" content="${esc(doc.hero)}">` : "",
    cfg.html.meta !== false ? `<meta property="og:type" content="article">` : "",
    opts.canonical ? `<link rel="canonical" href="${esc(opts.canonical)}">` : "",
    (theme.fonts && theme.fonts.filter(Boolean).length)
      ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?${[...new Set(theme.fonts.filter(Boolean))]
          .map((f) => `family=${encodeURIComponent(String(f)).replace(/%20/g, "+")}:wght@400;600;700;800`)
          .join("&")}&display=swap" rel="stylesheet">`
      : "",
    `<style>${themeCss(theme)}\n${layout.css || ""}</style>`,
    cfg.html.jsonLd !== false ? jsonLd(doc, cfg, opts.canonical || "") : "",
  ]
    .filter(Boolean)
    .join("\n");

  const full = `<!doctype html>
<html lang="en" data-layout="${esc(layout.id)}" data-theme="${esc(theme.id)}">
<head>
${head}
</head>
<body>
<main class="post-wrap">
${body}
</main>
</body>
</html>`;

  return { full, body };
}
