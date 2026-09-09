import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.ts";
import { db, getSetting, now } from "./db.ts";
import { CHARS_PER_LINE, claudePricing, DESC_STYLES, htmlBudgetFactor, TITLE_VOCAB } from "@shared/models.ts";
import { isSelfContainedLayout } from "@shared/descLayouts.ts";
import { applyKeycapGlossary, detectKeyboardLayout, layoutNote } from "@shared/keycaps.ts";
import { cleanPropsRecord, cleanSpecs } from "@shared/specs.ts";
import {
  buildTagCandidates,
  descBodyImages,
  deTurkish,
  dropCJK,
  etsyAltTitle,
  etsyPreBarLen,
  etsySplitTags,
  fancyEtsyHeaders,
  finalizeEtsyTags,
  isEtsyTag,
  isFragmentTag,
  productForSpecs,
  stripCJK,
  stripKeycapProfileFromTitle,
} from "@shared/listingFormat.ts";
import { detectProfiles, profilePhrase } from "@shared/keycaps.ts";
import { readExample } from "./examples.ts";
import type {
  AdviceResult,
  CategoryResearchResult,
  ChannelId,
  GenerateListingInput,
  GeneratedField,
  GeneratedListing,
  LlmUsage,
  NormalisedProduct,
  ProductImage,
  ProductVariant,
} from "@shared/types.ts";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];
export type ThinkingMode = "adaptive" | "off";
/** Fast mode is a research preview limited to these models. */
export const FAST_MODELS = ["claude-opus-5", "claude-opus-4-8"];

/** Shopify HTML-description build rule — "Diğer HTML düzenler". */
function shopifyDescRuleOther(descImgN: number, isKeycapSet: boolean): string {
  const slotN = Math.max(2, Math.min(10, descImgN || 4));
  return [
    "AÇIKLAMA DÜZENİ (Diğer HTML düzenler) — `description` ALANI, sana verilen ÖRNEKLER dosyasındaki (`Shopify Aciklamalar.txt` — 5 tam ürün bloğu: PIIFOX Eva, Ancient Chinese, MU02, Super Mario, Harry Potter) gibi TAM, KENDİNE YETEN, STİLLENDİRİLMİŞ bir HTML bloğu olacak. ASLA düz/sade metin verme; her şey HTML içinde olsun.",
    `GÖRSEL SLOTLARI (ÇOK ÖNEMLİ): her \`<div class="pd-media"></div>\` TEK BİR görsel içindir — ASLA birden fazla görseli aynı slota/aynı sütuna alt alta yığma, bu KESİNLİKLE YASAK. Sana yaklaşık ${descImgN || "birkaç"} açıklama görseli verilecek; TOPLAM yaklaşık ${slotN} tekli \`pd-media\` slotu oluştur ve bunları FARKLI görsel düzenlerine dağıt: (a) 2'li/3'lü IZGARA — birkaç \`pd-media\` div'ini kendi \`display:grid;grid-template-columns:...\` sınıfınla sarmala; (b) TEK GENİŞ SİNEMATİK kesit — bir \`pd-media\` div'ine ekstra bir sınıf ekleyip (ör. \`pd-media--wide\`) o sınıfla \`img{height:...;object-fit:cover}\` tanımla; (c) VARYANT KARTI görseli — varsa her varyant kartının içine kendi \`pd-media\`'sı. Slotları ANLAMLI bir bölüm başlığının hemen ardına koy (ör. Features'tan sonra ızgara, Spotlight'ta sinematik, her varyant kartında biri) — asla tek bir yerde art arda yığma. Kendin ASLA \`<img>\` YAZMA — sistemimiz her slota gerçek ürün görselini kendi düzeninle uyumlu şekilde yerleştirir.`,
    "GÖRSEL YALNIZLIK YASAĞI: hiçbir `pd-media` slotu TEK BAŞINA (kare/1:1'e yakın oranlı) bir bölümün TÜM genişliğini/alanını kaplamasın. Her tekli görsel ya (a) bir ızgarada en az bir görsel daha ile yan yana dursun, ya da (b) yanında/altında alakalı bir metin bloğuyla (özellik açıklaması, başlık, rozet) 2 sütunlu bir düzende dursun. Tam genişlikte, tek başına, yanında hiçbir şey olmayan kare bir fotoğraf YASAK — SADECE `pd-media--wide` gibi kasıtlı geniş sinematik kesitler (o zaten tek başına bir bölüm olarak tasarlanmış olur) bu kuralın dışındadır.",
    "Yapı: ilk satır kendi `<style>…</style>` bloğun (BENZERSİZ bir sınıf ön eki seç, ör. `.pd-<kısa-tema>` — örneklerdeki `.eva` / `.qm` gibi; tüm seçicileri o ön eke göre yaz, mağaza temasıyla çakışmasın; `@import` KULLANMA, sistem fontları yeter). Sarmalayıcının kök sınıfında (ör. `.pd-<önek>`) ürünün BASKIN renginden bir `--pd-accent: #hex;` CSS değişkeni tanımla — CTA parlama efekti bu rengi kullanır. Ardından `<div class=\"pd-<önek>\">…</div>` sarmalayıcı.",
    "İçerik bölümleri (örneklerdeki zenginlikte, ürüne göre uyarla): üst şerit / rozet satırı · HERO (büyük başlık + slogan + tema emojileri) · INTRO (2-3 paragraf hikâye) + görsel ızgarası · FEATURES (ikon/emoji'li 4-8 özellik) · SPOTLIGHT (malzeme/işçilik vurgusu, tek sinematik görsel) · VARYANTLAR (varsa, her kartta kendi görseli) · SPECS TABLOSU (ürünün GERÇEK verileri) · UYUMLULUK (neye uyar/uymaz) · KUTU İÇERİĞİ · FAQ · CTA. Renkler, emojiler, bölüm adları, tipografi ürünün TEMASINA göre değişsin.",
    isKeycapSet
      ? "KEYCAP SETİ İSE, açıklamada MUTLAKA şu iki bölüm de bulunsun (kendi tema/renk/sınıf sistemine uydur, verileri ürünün GERÇEK özelliklerinden doldur, tahmin ETME): (1) 'Technical Specifications' TABLOSU — satırlar: Profile Options, Key Count, Layout Support (ANSI/ISO), Keyboard Sizes (60% / 65% / 75% / 80% TKL / 96% veya 100% / Alice — ÜRÜNE GERÇEKTEN UYANLARI yaz), Switch Type (genelde 'MX-Style Cross Mechanical Switches Only'), Material, Printing Method, Surface Finish; altına kısa kırmızı/vurgulu bir '⚠️ Compatibility Notice' kutusu — SADECE MX-style mekanik switch'lerle uyumlu, membran/laptop/low-profile klavyeyle uyumsuz uyarısı. (2) 'Universal Compatibility with Most Mechanical Keyboards' rozet/madde listesi — 60% Compact, 65% Compact with Arrows, 75% Compact Full Function, 80% TKL, 96%/100%, Alice Ergonomic gibi (ürüne uyanları) her biri bir ikon/rozet ile; altına küçük bir '💡 Tip' kutusu (klavye modeliyle uyumluluktan emin değilse fotoğraf/model paylaşarak doğrulatabileceğini belirt). Keycap seti DEĞİLSE bu iki bölümü EKLEME."
      : "",
    'ZORUNLU — FAQ (JS YOK, sistemimiz açar/kapar, SAKİN/YUMUŞAK bir geçişle): her soru-cevap `<div class="<kendi-sınıfın> pd-faq-item">` (ilk soru ayrıca `pd-open` sınıfını da taşısın — başta açık gelsin), soru `<button type="button" class="<kendi-sınıfın> pd-faq-q">METİN</button>`, cevap `<div class="<kendi-sınıfın> pd-faq-a"><p>METİN</p></div>`. Kendi CSS\'inde AYNEN şu deseni kullan: `.<önek>-faq-a{max-height:0;overflow:hidden;transition:max-height .45s cubic-bezier(.4,0,.2,1)}` ve `.<önek>-faq-item.pd-open .<önek>-faq-a{max-height:640px}` (sabit yeterince büyük bir değer — JS ölçüm YOK, ani/sert bir açılma OLMASIN). 4-6 soru-cevap yaz.',
    'ZORUNLU — CTA: butona/linke `data-pd-goto-atc` attribute\'u ekle: `<button type="button" class="<kendi-sınıfın>" data-pd-goto-atc>METİN</button>` (href="#" YAZMA, `<a>` KULLANMA — `<button type="button">` olsun). Sistemimiz tıklayınca sayfanın gerçek "Add to Cart" butonuna YUMUŞAKÇA kaydırıp `--pd-accent` renginle hafif, dar bir parlama efekti uygular. CTA bloğu açıklamanın EN SON içerik parçası olsun — CTA\'dan sonra BAŞKA HİÇBİR görsel/bölüm/metin EKLEME.',
    "Görsel SEÇİMİYLE (hangi fotoğraf, tekrar/benzer kopya elemek) UĞRAŞMA — sistemimiz aynı fotoğrafın farklı boyuttaki kopyalarını zaten otomatik eler ve her slota gerçek, birbirinden farklı bir ürün fotoğrafı yerleştirir. Senin işin SADECE doğru sayıda/düzende `pd-media` slotu açmak.",
    "MUTLAK YASAK: kendi `<script>` YAZMA — FAQ ve CTA etkileşimini SADECE yukarıdaki `pd-faq-item`/`pd-faq-q`/`pd-faq-a` sınıfları ve `data-pd-goto-atc` attribute'u ile işaretle; JavaScript'i sistemimiz ekler. Kendi script'in eklenirse SİLİNİR.",
    "BÖLÜM BAŞLIKLARI HEDEF DİLDE olacak — ASLA Çince başlık yazma ('套餐说明', '产品参数', '官方标配' vb. YASAK). Kaynaktaki Çince başlıkları hedef dile çevir.",
    "Yukarıdaki HTML AÇIKLAMA UZUNLUĞU hedefine uy (varsa). Örnek metinleri KOPYALAMA; iskeleti/zenginliği taklit et, içeriği bu ürüne göre yaz. `<style>` serbest ve ZORUNLU; `<iframe>` yok.",
    "SON KONTROL (yanıtı göndermeden önce zihninde bir kez gözden geçir, ayrı bir mesaj yazma — sadece düzeltilmiş son hali gönder): (1) tek başına, yanında hiçbir şey olmadan tam alan kaplayan kare bir görsel var mı → varsa ızgaraya al ya da yanına metin ekle; (2) `pd-media` slotlarının HERBİRİ tek görsel mi, hiçbiri birden fazla görsel içermiyor mu; (3) CTA gerçekten en sonda mı, sonrasında başka içerik yok mu; (4) FAQ/CTA sınıfları (`pd-faq-item`/`pd-faq-q`/`pd-faq-a`/`data-pd-goto-atc`) doğru mu; (5) hiç Çince karakter kalmamış mı. Bir sorun varsa göndermeden DÜZELT.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Shopify HTML-description build rule — "Alt alta görsel" (.bm v3). */
const SHOPIFY_DESC_RULE_STACKED = [
  "AÇIKLAMA DÜZENİ (Alt alta görsel) — `description` ALANI, sana verilen `.bm` örneğinin (v3) BİREBİR YAPISINI izleyen TAM BİR HTML BELGESİ OLACAK. ASLA düz/sade metin verme.",
  '1) `<style>…</style>` bloğu: örnekteki TÜM `.bm*` seçicileri, animasyonlar (`@keyframes bmFloat/bmPop/bmFade/bmAtcGlow`), jitter-önleyici teknik (`backface-visibility`, tam-piksel `translateY`, metinde `scale/skew` YOK), `.bm-reveal`, `.bm-stage`, `.bm-zoomtag`, `.bm-lightbox`, `.bm-trivia`, `.bm-layouts`, `.bm-compare`, `.bm-trust`, `.bm-faq`, `.bm-cta`, `prefers-reduced-motion` ve mobil `@media` kuralları AYNEN kalsın. SADECE renk/tema değişecek: `--ink --soft --gold --gold2 --lav --sky --milk --line --line2` değişkenlerini ürünün BASKIN RENGİNE göre yeniden ata (kırmızı ürün → kırmızı/scarlet, nane → yeşil, lavanta → mor…), `.bm-hero`/`.bm-bar`/`.bm-cta` gradyanları ve tüm sabit hex renkleri (ör. `#7a5a12`) o palete uydur, `.bm-hero::before/::after` `content:"EMOJI"` glifini tema emojisiyle değiştir.',
  '2) `<noscript><style>.bm-reveal{opacity:1 !important;transform:none !important}</style></noscript>` satırını `</style>`\'dan hemen sonra koy.',
  '3) `<div class="bm">` sarmalayıcı: `<input class="bm-toggle" ...>` + `<label class="bm-bar">` (tema emojisi ile) · `.bm-c1>.bm-inner> <div class="bm-hero bm-reveal">` (`.bm-eyebrow` seri/koleksiyon adı · `<h2>` başında+sonunda tema emojisi · `.sub` tek satır özet · `.bm-badges` 5-7 emoji\'li `<span>` rozet).',
  '4) `.bm-grid>.bm-c2>.bm-inner> <div class="bm-info bm-reveal">` şu bölümleri SIRAYLA içerir: `<p class="bm-lede">` güçlü 2-3 cümle (anahtarlar `<strong>`); `<p class="bm-trivia">` ürünle ilgili 1 kısa ilginç bilgi (`<strong>` vurgulu); `<h3>Highlights</h3>`+`<ul class="bm-feat">` 5-6 `<li>` (`<span class="ico">EMOJI</span><span class="tx"><b>Başlık</b><span class="t">fayda</span></span>`); `<h3>Compatible Layouts</h3>`+`<div class="bm-layouts">` ürüne uyan boyut/tuş-sayısı `<span>` çipleri + `<p class="bm-layouts-note">` kısa not; `<h3>Specifications</h3>`+`<div class="bm-spec">` 6-9 `<div class="bm-r"><span class="bm-k">Etiket</span><span class="bm-v">Değer</span></div>` (GERÇEK veriler); `<h3>Why PBT Over ABS</h3>` (veya ürüne uygun bir "neden bu / X vs Y" başlığı)+`<table class="bm-compare">` 4 satırlık karşılaştırma (`<td class="bm-yes">` üstün tarafta); `<h3>Compatibility &amp; Care</h3>`+`<div class="bm-faq">` 4-5 `<div class="bm-faq-item">` (ilki `is-open`) → `<button type="button" class="bm-faq-q"><span>SORU</span><span class="bm-plus"></span></button><div class="bm-faq-a"><p>CEVAP</p></div>`; `<div class="bm-note"><b>📦 In the box:</b> … <br><b>💡 Before you order:</b> … <br><b>🧼 Care:</b> …</div>`; `<div class="bm-cta"><p>kısa çağrı ✨</p><button type="button" data-bm-goto-atc>🛒 Add to Cart</button></div>`; `<div class="bm-trust">` 3 `<span>` güven rozeti.',
  '5) `<div class="bm-media"></div>` — BOŞ bırak (yorumla doldurabilirsin). Kendin `<img>` YAZMA; sistemimiz ürün görsellerini buraya `data-bm-zoom`\'lu olarak dizer, `.bm-lightbox` düğümünü + çalışan `<script>`\'i ekler.',
  "TÜM emojiler/renkler/rozetler/highlight ikonları/layout çipleri/compare satırları/FAQ soruları/CTA metni ürünün tarzı-rengi-temasına göre DEĞİŞSİN. `.bm*` sınıf adlarını, `data-bm-*` kancalarını ve bölüm setini/yapısını DEĞİŞTİRME. Örnekteki 'Chiikawa' metnini KOPYALAMA — iskeleti taklit et, içeriği bu ürüne yaz. Yukarıdaki UZUNLUK HEDEFİNE uy (bu hedef `<style>` + CSS + şablon + metin dahil TÜM HTML'i sayar; görsel/detay çoksa FAQ/spec/highlight/rozet sayısını artırıp hedefe yaklaş); dolgu/tekrar YOK.",
].join(" ");

export function activeModel(): string {
  return getSetting("llm_model") || env.llmModel || "claude-sonnet-5";
}
export function activeEffort(): Effort {
  const v = (getSetting("llm_effort") || process.env.LLM_EFFORT || "high") as Effort;
  return EFFORT_LEVELS.includes(v) ? v : "high";
}
export function activeThinking(): ThinkingMode {
  const v = getSetting("llm_thinking") || process.env.LLM_THINKING || "adaptive";
  return v === "off" ? "off" : "adaptive";
}
export function activeFast(): boolean {
  const v = getSetting("llm_fast") ?? (process.env.LLM_FAST === "1" ? "1" : "0");
  return v === "1";
}

/** Settings-page value wins over .env. */
export function activeAnthropicKey(): string {
  return getSetting("anthropic_key") || env.anthropicKey;
}

export function claudeConfigured(): boolean {
  return Boolean(activeAnthropicKey());
}

function client(overrideKey?: string): Anthropic {
  const key = overrideKey || activeAnthropicKey();
  if (!key) throw new LlmError("ANTHROPIC_API_KEY ayarlı değil.", 400);
  return new Anthropic({ apiKey: key });
}

/**
 * Live verification for the Settings page — lists the models this key can access.
 * `overrideKey` lets the UI test a key that has been typed but not saved yet.
 */
export async function verifyClaude(overrideKey?: string): Promise<{
  ok: boolean;
  models: string[];
  activeModel: string;
  effort: Effort;
  thinking: ThinkingMode;
  fast: boolean;
  fastModels: string[];
  error?: string;
}> {
  const meta = {
    activeModel: activeModel(),
    effort: activeEffort(),
    thinking: activeThinking(),
    fast: activeFast(),
    fastModels: FAST_MODELS,
  };
  try {
    const list = await client(overrideKey).models.list({ limit: 100 });
    return { ok: true, models: list.data.map((m) => m.id), ...meta };
  } catch (e: any) {
    return { ok: false, models: [], ...meta, error: e?.message || String(e) };
  }
}

function priceUsage(m: string, u: Anthropic.Usage): LlmUsage {
  const p = claudePricing(m);
  const fresh = u.input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const out = u.output_tokens ?? 0;
  const costUsd =
    (fresh / 1e6) * p.inPer1M +
    (cacheWrite / 1e6) * p.inPer1M * 1.25 +
    (cacheRead / 1e6) * p.inPer1M * 0.1 +
    (out / 1e6) * p.outPer1M;
  return { inputTokens: fresh + cacheRead + cacheWrite, outputTokens: out, costUsd };
}
function zeroUsage(): LlmUsage {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

/** Serialise an operation's output for the activity log — string or JSON, capped. */
export function clampResult(v: unknown, cap = 20000): string | null {
  if (v == null) return null;
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (!s) return null;
    return s.length > cap ? s.slice(0, cap) + "…" : s;
  } catch {
    return null;
  }
}

export function logClaudeUsage(
  kind: string,
  m: string,
  u: LlmUsage,
  draftId?: string,
  result?: unknown,
) {
  db.prepare(
    "INSERT INTO usage_log (at, kind, model, input_tokens, output_tokens, cost_usd, provider, credits, estimated, draft_id, result) VALUES (?,?,?,?,?,?,'claude',0,0,?,?)",
  ).run(now(), kind, m, u.inputTokens, u.outputTokens, u.costUsd, draftId ?? null, clampResult(result));
}

export function manusUsdPerCredit(): number {
  const v = Number(getSetting("manus_usd_per_credit"));
  return Number.isFinite(v) && v > 0 ? v : env.manusUsdPerCredit;
}

export function logManusUsage(
  kind: string,
  credits: number,
  estimated: boolean,
  draftId?: string,
  taskId?: string,
  result?: unknown,
) {
  db.prepare(
    "INSERT INTO usage_log (at, kind, model, input_tokens, output_tokens, cost_usd, provider, credits, estimated, draft_id, manus_task_id, result) VALUES (?,?,?,0,0,?,'manus',?,?,?,?,?)",
  ).run(
    now(),
    kind,
    "manus-1.6",
    credits * manusUsdPerCredit(),
    credits,
    estimated ? 1 : 0,
    draftId ?? null,
    taskId ?? null,
    clampResult(result),
  );
}

export function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const s = body.indexOf("{");
  const a = body.indexOf("[");
  const from = s === -1 ? a : a === -1 ? s : Math.min(s, a);
  if (from === -1) throw new LlmError("Modelden JSON alınamadı.");
  const slice = body.slice(from);
  const end = Math.max(slice.lastIndexOf("}"), slice.lastIndexOf("]"));
  try {
    return JSON.parse(slice.slice(0, end + 1));
  } catch {
    const repaired = repairTruncatedJson(slice);
    if (repaired !== null) return repaired;
    throw new LlmError("Model geçersiz ya da eksik JSON döndürdü (çıktı çok uzun olabilir — tekrar dene).");
  }
}

/**
 * Best-effort recovery of a JSON reply the model cut off mid-way (a huge styled
 * `description` string can hit the token cap). Walks the text tracking string /
 * escape / bracket state, drops any trailing incomplete element, then closes the
 * still-open string and brackets so the earlier fields survive.
 */
function repairTruncatedJson(src: string): any | null {
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  let lastSafe = -1; // char index just past the last bracket close while still nested
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") {
      stack.pop();
      if (stack.length >= 1) lastSafe = i + 1;
    }
  }
  const build = (s: string): string => {
    let is = false;
    let es = false;
    const st: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (is) {
        if (es) es = false;
        else if (c === "\\") es = true;
        else if (c === '"') is = false;
        continue;
      }
      if (c === '"') is = true;
      else if (c === "{" || c === "[") st.push(c === "{" ? "}" : "]");
      else if (c === "}" || c === "]") st.pop();
    }
    let out = s;
    if (is) out += '"';
    while (st.length) out += st.pop();
    return out;
  };
  const candidates: string[] = [];
  if (inStr || stack.length) candidates.push(build(src));
  if (lastSafe > 0) candidates.push(build(src.slice(0, lastSafe).replace(/,\s*$/, "")));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* next */
    }
  }
  return null;
}

const EFFORT_ORDER: Record<Effort, number> = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4 };

/**
 * Drop unpaired UTF-16 surrogates. A `.slice()` in prompt-building can cut an
 * emoji (or other astral char) in the source data in half, leaving a lone
 * surrogate — Anthropic's strict JSON body parser then 400s with
 * "no low surrogate in string".
 */
function stripLoneSurrogates(s: string): string {
  return s.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );
}

export async function ask(
  system: string,
  user: string,
  kind: string,
  opts: { model?: string; maxTokens?: number; signal?: AbortSignal; draftId?: string } = {},
) {
  system = stripLoneSurrogates(system);
  user = stripLoneSurrogates(user);
  const m = opts.model || activeModel();
  const thinking = activeThinking();
  let effort = activeEffort();
  // {type:"disabled"} thinking is rejected above effort "high" — cap it.
  if (thinking === "off" && EFFORT_ORDER[effort] > EFFORT_ORDER.high) effort = "high";

  const base: Anthropic.MessageCreateParamsNonStreaming = {
    model: m,
    max_tokens: opts.maxTokens ?? 8000,
    // cache the (stable) system prompt so repeated generations are ~90% cheaper on input
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { effort },
    thinking: thinking === "off" ? { type: "disabled" } : { type: "adaptive" },
  };

  const useFast = activeFast() && FAST_MODELS.includes(m);
  // The SDK refuses a NON-streaming request whose max_tokens is big enough that
  // it could run past 10 min. Above ~8k tokens we must stream and reassemble.
  const mustStream = (base.max_tokens ?? 0) > 8192;
  const run = (params: any): Promise<Anthropic.Message> =>
    mustStream
      ? (client().messages.stream(params, { signal: opts.signal }) as any).finalMessage()
      : (client().messages.create(params, { signal: opts.signal }) as Promise<Anthropic.Message>);
  const runFast = (params: any): Promise<Anthropic.Message> =>
    mustStream
      ? (client().beta.messages.stream(params, { signal: opts.signal }) as any).finalMessage()
      : (client().beta.messages.create(params, { signal: opts.signal }) as Promise<Anthropic.Message>);

  let resp: Anthropic.Message | any;
  try {
    if (useFast) {
      try {
        resp = await runFast({ ...(base as any), speed: "fast", betas: ["fast-mode-2026-02-01"] });
      } catch (fe: any) {
        // org not enabled for fast mode (0 fast-mode tokens/min) -> fall back to standard
        if (fe?.status === 429 && /fast mode/i.test(fe?.message || "")) {
          console.warn("[llm] fast mode unavailable for this org, falling back to standard");
          resp = await run(base);
        } else throw fe;
      }
    } else {
      resp = await run(base);
    }
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new LlmError("Anthropic API anahtarı geçersiz.", 401);
    if (e instanceof Anthropic.RateLimitError) throw new LlmError("Anthropic hız sınırı — biraz sonra tekrar deneyin.", 429);
    // requested max_tokens exceeds this model's cap → retry once with a safe value
    if (/max_tokens/i.test(e?.message || "") && (base.max_tokens ?? 0) > 16000) {
      try {
        resp = await run({ ...base, max_tokens: 16000 });
      } catch (e2: any) {
        throw new LlmError(`LLM hatası: ${e2?.message || e2}`);
      }
    } else {
      throw new LlmError(`LLM hatası: ${e?.message || e}`);
    }
  }
  const textOf = (r: any): string => {
    const tb = (r?.content as any[])?.find((b) => b.type === "text");
    return tb && "text" in tb ? (tb.text as string) : "";
  };
  let text = textOf(resp);

  // Extended thinking can consume the ENTIRE max_tokens budget on a demanding
  // prompt (huge examples, a full HTML+CSS block to reason through) and hit the
  // cap before ever writing the text block — the model then returns literally
  // no content ("Modelden JSON alınamadı."). Retry once with thinking disabled,
  // so the full budget goes to the actual answer.
  if (!text.trim() && resp?.stop_reason === "max_tokens" && base.thinking?.type !== "disabled") {
    console.warn(`[llm] ${kind}: empty reply (thinking exhausted max_tokens) — retrying with thinking off`);
    const retryEffort = EFFORT_ORDER[effort] > EFFORT_ORDER.high ? "high" : effort;
    const retryBase = { ...base, thinking: { type: "disabled" as const }, output_config: { effort: retryEffort } };
    try {
      const resp2 = useFast
        ? await runFast({ ...(retryBase as any), speed: "fast", betas: ["fast-mode-2026-02-01"] }).catch(() => run(retryBase))
        : await run(retryBase);
      const text2 = textOf(resp2);
      if (text2.trim()) {
        resp = resp2;
        text = text2;
      }
    } catch {
      /* keep the empty result — the caller's own error handling takes over */
    }
  }

  const usage = priceUsage(m, resp.usage as Anthropic.Usage);
  logClaudeUsage(kind, m, usage, opts.draftId, text);
  return { text, usage, model: m };
}

const FIELD_LABEL: Record<GeneratedField["key"], string> = {
  title: "Ürün başlığı",
  title_alt: "Alternatif başlık (Etsy · ≤14 kelime, öznel kelimeler yok)",
  description: "Ürün açıklaması",
  tags: "Etiketler (virgülle ayrık liste)",
  tags_pool: "Etiket havuzu (50 aday)",
  seo_title: "SEO başlığı",
  seo_description: "SEO meta açıklaması",
};

/** Etsy paired-keyword tags from the title: {adj1,adj2} × {noun1,noun2}, ≤20 chars. */
function etsyPairedTags(title: string): string[] {
  const pre = title.split(" | ")[0].trim();
  const after = (title.split(" | ")[1] || "").split(",")[0].trim();
  if (!pre || !after) return [];
  const w = (s: string) => s.split(/\s+/).filter(Boolean);
  const pw = w(pre);
  const aw = w(after);
  const noun1 = pw.slice(-2).join(" ");
  const noun2 = aw.slice(-1).join(" ");
  const adj1 = pw.slice(0, -2).join(" ");
  const adj2 = aw.slice(0, -1).join(" ");
  const out = new Set<string>();
  for (const adj of [adj1, adj2]) {
    for (const noun of [noun1, noun2]) {
      const tag = `${adj} ${noun}`.toLowerCase().replace(/\s+/g, " ").trim();
      if (tag && tag.length <= 20 && tag.includes(" ")) out.add(tag);
    }
  }
  return [...out];
}

/** Lowercase, strip punctuation, cap at 20 chars — but NEVER mid-word: drop the
 *  trailing partial word instead of slicing it ("cute mechanical keyboard" →
 *  "cute mechanical", not "cute mechanical keyb"). "" if nothing usable fits. */
const cleanTag = (s: string) => {
  const t = s.toLowerCase().replace(/[^a-z0-9 &+\-]/g, "").replace(/\s+/g, " ").trim();
  if (t.length <= 20) return t;
  const sp = t.slice(0, 21).lastIndexOf(" ");
  return sp > 0 ? t.slice(0, sp).trim() : ""; // no word boundary in 20 chars → junk, drop it
};

function ensureBrandSuffix(title: string, brand?: string): string {
  if (!brand?.trim()) return title;
  const b = brand.trim().replace(/®+\s*$/, "");
  const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = title.replace(new RegExp(`\\s*[–-]\\s*${esc}\\s*®?\\s*$`, "i"), "").replace(/[\s,|–-]+$/, "").trim();
  return `${stripped} – ${b}®`;
}

function clampEtsyTitle(title: string, brand?: string): string {
  let v = title.replace(/\s+/g, " ").trim();
  const b = brand?.trim().replace(/®+\s*$/, "");
  const suffix = b ? ` – ${b}®` : "";
  let core = suffix && v.endsWith(suffix) ? v.slice(0, -suffix.length) : v;
  const budget = 120 - suffix.length;
  if (core.length > budget) {
    const cut = core.slice(0, budget);
    const bnd = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf(" "));
    core = (bnd > 55 ? cut.slice(0, bnd) : cut).replace(/[\s,|–-]+$/, "");
  }
  return core + suffix;
}

function clampTitle(title: string, min = 35, max = 50): string {
  let t = title.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > min ? cut.slice(0, lastSpace) : cut).trim();
}

export async function generateListing(
  product: NormalisedProduct,
  input: GenerateListingInput & { model?: string },
  signal?: AbortSignal,
): Promise<GeneratedListing> {
  const isShopify = input.channel === "shopify";

  const style = DESC_STYLES.find((s) => s.key === input.descStyle) ?? DESC_STYLES[0];
  const styleLine = `AÇIKLAMA TARZI: ${style.en} — ${style.guide}`;
  const vocabLine =
    "BAŞLIK SÖZLÜĞÜ (sadece ürüne UYANLARI kullan, uymayanları kullanma; gerekirse benzerlerini araştır): " +
    TITLE_VOCAB.join(", ");
  // spec detection reads the operator's "product details" note when present —
  // the source listing may still describe variants/options they REMOVED.
  const sv = productForSpecs(product, input.productNote);
  const kb = detectKeyboardLayout(sv.product);
  const kbLine = layoutNote(kb, "tr");
  const profs = kb.isKeycapSet
    ? detectProfiles(sv.product, { trustLiteral: sv.noteMode }).slice(0, sv.noteMode || sv.singleConfig ? 1 : 3)
    : [];
  const profStr = profilePhrase(profs);

  // ---- AUTO-SIZE the HTML description from the product itself ----
  // "This product has lots of description images and lots of detail → the
  // description should be deeper here." The operator's `htmlBudget`
  // (Klasik / -25% / -50%) then scales that auto target AND the token budget.
  let htmlLenLine = "";
  let descMaxTokens = isShopify ? 24000 : 16000;
  let descImgN = 0;
  if (isShopify) {
    descImgN = descBodyImages(product.images, 40).length;
    const specN = cleanSpecs(sv.product.props, 30).length;
    const variantN = product.variants?.length ?? 0;
    const srcLen = (product.descHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
    const detailScore = descImgN + specN + Math.round(Math.min(srcLen, 12000) / 1200) + Math.min(variantN, 12);

    // For the fixed ".bm" stacked layout the operator counts the WHOLE HTML
    // (CSS + template + copy ≈ 29–30k), so its band/auto target is a TOTAL size;
    // for "Diğer" the target is the visible text body only (CSS excluded).
    const bandIsTotal = isSelfContainedLayout(input.descriptionLayout);

    let autoChars =
      8500 + descImgN * 1450 + specN * 340 + Math.min(variantN, 20) * 180 + Math.min(srcLen, 10000) * 0.55;
    autoChars = Math.max(7000, Math.min(44000, autoChars));
    if (bandIsTotal) autoChars = 29000; // sensible default for the fixed .bm block

    // explicit operator line/char band overrides the auto size — for BOTH layouts
    if (input.htmlLengthBand && /^\d+-\d+$/.test(input.htmlLengthBand)) {
      const [lo, hi] = input.htmlLengthBand.split("-").map(Number);
      const mid = (lo + hi) / 2;
      autoChars = input.htmlLengthUnit === "char" ? mid : mid * CHARS_PER_LINE;
    }

    const factor = htmlBudgetFactor(input.htmlBudget);
    const targetChars = Math.round(Math.max(4000, Math.min(62000, autoChars * factor)));
    const targetLines = Math.round(targetChars / CHARS_PER_LINE);
    const sections = Math.max(3, Math.min(14, Math.round(targetChars / 3400)));
    const density = detailScore >= 22 ? "ÇOK YÜKSEK" : detailScore >= 12 ? "YÜKSEK" : detailScore >= 6 ? "ORTA" : "DÜŞÜK";
    const budgetNote =
      factor < 1
        ? ` EKONOMİK MOD (%${Math.round((1 - factor) * 100)} daha az): özü ve gerçek bilgiyi koru, süslemeyi/tekrarı/dolayı anlatımı kes; bölümleri kısalt ama atma.`
        : "";

    htmlLenLine = bandIsTotal
      ? `HTML AÇIKLAMA — UZUNLUK HEDEFİ: TÜM HTML (\`<style>\` + CSS + şablon + tüm görünür metin, boşluklar ve semboller dahil) YAKLAŞIK ${targetChars.toLocaleString("tr-TR")} karakter olsun. ` +
        `Bu üründe ${descImgN} açıklama görseli, ${specN} özellik${variantN ? `, ${variantN} varyant` : ""} var → detay yoğunluğu ${density}; görsel/detay çoksa FAQ, spec satırları, highlight ve rozet sayısını artırıp bu hedefe yaklaş, azsa kıs. .bm iskeletini, sınıfları ve bölüm setini KORU; dolgu/tekrar YOK.` +
        budgetNote
      : `HTML AÇIKLAMA — OTOMATİK BOYUT: bu üründe ${descImgN} açıklama görseli, ${specN} özellik` +
        (variantN ? `, ${variantN} varyant` : "") +
        ` var → detay yoğunluğu ${density}. ` +
        `Bir insan gibi düşün: görsel ve detay çoksa açıklama daha derin ve bölümlü olmalı; azsa kısa ve öz olmalı. ` +
        `Buna göre görünen metin gövdesi (etiketler hariç) YAKLAŞIK ${targetChars.toLocaleString("tr-TR")} karakter ` +
        `(~${targetLines} satır), ~${sections} bölüm olsun — hedef bu, dolgu yok, her bölüm gerçek yeni bilgi versin.` +
        budgetNote +
        ` Stil/şablon/CSS bu sayıya dahil değildir.`;

    // token budget scales with the target so cheap modes really are cheaper
    // floor raised to 12k: even the leanest budget still needs room for the full
    // required HTML+CSS scaffold (hero/features/specs/FAQ/CTA or the .bm card) on
    // top of the actual copy, plus whatever the model spends on thinking.
    // bandIsTotal → targetChars is the whole HTML the model must emit, so give it
    // more headroom (output tokens + thinking) than the "visible body only" case.
    descMaxTokens = bandIsTotal
      ? Math.round(Math.max(16000, Math.min(64000, targetChars / 2.6 + 8000)))
      : Math.round(Math.max(12000, Math.min(64000, targetChars / 3.1 + 6000)));
  }
  const brandLine = input.brand?.trim()
    ? `MARKA: "${input.brand.trim()}" — Etsy başlığının EN SONUNA " – ${input.brand.trim()}®" ekle (bir kez).`
    : 'MARKA: verilmedi — başlıkta marka kullanma (uydurma).';

  const channelRules = isShopify
    ? [
        "KANAL KURALLARI (Shopify):",
        "- `title` KESİNLİKLE 35–50 karakter olacak. Title Case, TAMAMI BÜYÜK HARF değil. Ana ürün adını mutlaka içersin.",
        "- `title` aynen URL handle ve SEO başlığı olarak da kullanılacak; bu yüzden temiz, anahtar-kelime odaklı ve tekrarsız olsun.",
        "- `title` içinde \"gift\" / \"gifts\" kelimesi GEÇMESİN.",
        kb.isKeycapSet
          ? "- KEYCAP SET İSE: `title` içine ASLA keycap profili / tuş yüksekliği YAZMA (Cherry, Cherry Profile, OEM, OEM height, SA, XDA, DSA, MOA, MAO, FOA, SOA, MDA, KAT, ASA, original height, 原厂高度 vb.). Onun yerine ürünün TEMASINI öne çıkar. Profil ve malzeme bilgisi AÇIKLAMA ve ETİKETLERDE kalır, sadece başlıkta OLMAZ."
          : "",
        kb.isKeycapSet && profs.length
          ? `- PROFİL: Bu ürünün profili ${sv.noteMode ? "(operatör detaylarında yazan) " : ""}"${profStr}". AÇIKLAMADA ve ETİKETLERDE bunu AYNEN kullan (ör. FOA yazıyorsa çıktıda da FOA). ${sv.noteMode || sv.singleConfig ? "TEK profil — 'şu/şu profil seçenekleri var' DEME." : 'Birden fazlaysa "Cherry & MOA Profile" biçiminde belirt.'} Uydurma profil ekleme.`
          : sv.noteMode && kb.isKeycapSet
            ? "- PROFİL: Operatör detaylarında profil belirtilmemiş — profil YAZMA, uydurma."
            : "",
        "- `seo_description` ÜRETME — otomatik olarak başlığın aynısı yazılacak.",
        "- `description` DAİMA kendi `<style>` bloğu olan, tam ve kendine yeten stillendirilmiş bir HTML gövdesidir (aşağıdaki AÇIKLAMA DÜZENİ'ne göre). ASLA sade/düz metin, ASLA stilsiz düz `<p>` yığını verme. `<script>` / `<iframe>` yok.",
        "- Diğer profesyonel Shopify mağazalarında YAYGIN olduğu gibi bölüm başlıklarında ve madde başlarında uygun ikon/emoji kullan (✅ ✨ 📦 🔧 💎 vb.). Bu ürünü farklı/eksik tutma — rakiplerle aynı zenginlikte olsun.",
        "- `tags` — EN AZ 40 etiket, virgülle ayrık, küçük harf, her biri ≤ 20 karakter. HEPSİ ürünle DOĞRUDAN alakalı gerçek alıcı arama ifadeleri olsun (tema, stil, malzeme, profil, renk, kullanım, uyumluluk, hediye amaçlı aramalar, eş anlamlılar).",
        "  - YASAK: ürünün bir 'parçasını' tarif eden veya başlıktan kesilmiş ifadeler. Örn. \"138 key keycap set\", \"104 keys\", \"126 pcs keycap\" gibi sayı+adet parçaları KULLANMA. (\"60 percent keyboard\" gibi gerçek arama terimleri serbest.)",
        "  - Tekrar yok; başlığı olduğu gibi bölüp etiket yapma. Genişlik için eş anlamlı ve uzun-kuyruk varyasyonları üret.",
        htmlLenLine,
        styleLine,
      ]
        .filter(Boolean)
        .join("\n")
    : [
        "KANAL KURALLARI (Etsy):",
        "",
        "`title` — TAM OLARAK bu yapıya uy (hedef: 100–140 karakter, asla 140'ı geçme):",
        "  1) \" | \" işaretinden ÖNCEKİ bölüm: en önemli anahtar kelimeler + ürünün TAM ADI. Bu bölüm",
        "     36–40 KARAKTER olacak, ASLA 41+ olmayacak. Karakterleri TEK TEK say; \"|\" işaretinden hemen",
        "     önceki boşluk sayılmaz ama diğer tüm boşluklar sayılır. Bu bölüm ürün ne ise onunla BİTMELİ",
        "     (örn. \"... Artisan Keycap Set\") — kelime ortadan kesilmesin.",
        "  2) Ayraç: \" | \" — dikey çizgiden HEM ÖNCE HEM SONRA bir boşluk olacak.",
        "  3) 2. ANAHTAR KELİME: 1. ürün adının bir varyantı (1. \"keycap set\" ise 2. \"keycaps\"). Sonuna virgül koy.",
        "  4) Ardından ürünü tanıtan diğer önemli öbekler, aralarında VİRGÜL ile (örn. \"Cherry Profile, PBT Dye-Sub, ...\").",
        "  5) EN SONDA marka (aşağıdaki MARKA satırına göre).",
        "  KELİME TEKRARI YASAK: aynı kelime (büyük/küçük harf farkı dahil) başlıkta İKİ KEZ geçemez.",
        "  \"gift\" / \"gifts\" kelimesi başlıkta GEÇMESİN.",
        "  ÖRNEK: One Piece Theme Anime Artisan Keycap Set | Pirate Adventure Keycaps, MOA & Cherry Profile, PBT Dye-Sub – KeyArtisan®",
        kb.isKeycapSet && profs.length > 1
          ? `  PROFİL: Bu üründe BİRDEN FAZLA profil var (${profStr}). Başlıkta ve açıklamada TAM olarak "${profStr}" biçiminde belirt (ör. "Cherry & MOA Profile"). Profiller üründen ürüne değişir — SADECE ürün verisinde/görsellerinde geçenleri yaz.`
          : kb.isKeycapSet && profs.length === 1
            ? `  PROFİL: Bu ürünün profili ${sv.noteMode ? "(operatör detaylarında yazan) " : ""}"${profStr}". Başlık ve açıklamada bunu kullan; ${sv.noteMode || sv.singleConfig ? "TEK profil — 'iki/çok profil seçeneği var' DEME; " : ""}uydurma başka profil ekleme.`
            : sv.noteMode && kb.isKeycapSet
              ? "  PROFİL: Operatör detaylarında profil belirtilmemiş — profil YAZMA, uydurma."
              : "",
        sv.noteMode
          ? "  VERİYE SADIK KAL: Yukarıdaki OPERATÖR DETAYLARI son sözdür. Kaynak ilan metni KALDIRILMIŞ varyantları/seçenekleri hâlâ anlatıyor olabilir — kaynaktan çelişen profil / malzeme / tuş yüksekliği / düzen / tuş sayısı ALMA."
          : "  VERİYE SADIK KAL: Kaynakta hangi profil geçiyorsa çıktı AYNEN onu yazsın (FOA, MAO, SOA, OEM…) — profil değiştirme. SADECE \"原厂高度\" / \"原厂\" / \"original height\" = \"Cherry Profile\". \"OEM\" AYRI bir profildir (daha yüksek), ASLA Cherry'ye çevirme; kaynakta OEM yazıyorsa çıktıda OEM Profile yaz. Kaynak başlığı/açıklaması Çince'yse oradaki profil ibaresini esas al.",
        "",
        "`title_alt` — `title`'ın İKİNCİ bir sürümü, şu EK kurallarla:",
        "  - EN FAZLA 14 KELİME (marka soneki dahil).",
        "  - ÖZNEL / beğeni kelimelerini ('cute', 'adorable', 'gorgeous', 'kawaii', 'aesthetic', 'perfect', 'stunning', 'cool' vb.) BAŞLIKTAN ÇIKAR — bunlar açıklamaya taşınır.",
        "  - Aynı ana anahtar kelimeleri ve marka sonekini koru; yalnızca öznel sıfatları at ve gerekirse kısalt.",
        "  - Bu öznel kelimeler `description` içinde doğal biçimde geçsin (title_alt'tan çıkarılanları açıklamaya kat).",
        "",
        "`tags` — TAM 13 etiket, virgülle ayrık, küçük harf, her biri ≤ 20 karakter ve TAM 2 VEYA 3 KELİME (1 veya 4+ kelime ASLA). Kelime ORTADAN KESİLMESİN (\"translucent keycap s\" gibi kırık etiket yok).",
        "  - GERÇEK ARAMA TERİMLERİ olsun. Kimse \"shadow-carved keycap\", \"cream keycap set\", \"dye-sub keycaps\" diye ARAMAZ. Onun yerine genel/aranan terimler: artisan keycaps, pastel keycap set, custom keycaps, mechanical keyboard, kawaii keycaps, anime keycap set, pbt keycaps ...",
        "  - TERCİH EDİLEN BİÇİM: TEK tema kelimesi + ürün adı. \"cute cat keycaps\" YERİNE: cute keycap set, cute keycaps, cat keycap set, cat keycaps.",
        "  - ASLA çıplak kategori adı olmasın: \"keycap set\", \"keycaps\", \"keyboard keycaps\", \"custom keycap set\" gibi tek başına ürün adı YASAK. Her etiket bir tema / stil / kullanım / uyumluluk kelimesi TAŞIMALI (\"cute keycap set\" evet, \"keycap set\" hayır) — yoksa \"cute keycap set\" gibi etiketlerin anlamı kalmaz.",
        "  - Marka adı (\"keyartisan\") ASLA etikette geçmesin.",
        "  - YASAK: sayı+adet parçası (\"138 key keycap set\", \"104 keys\"), renk/isim özel (\"cream keycap set\"), \"dye-sub\" içeren etiketler.",
        "  - Etiketler ürünle DOĞRUDAN alakalı ve ÖNEMLİ; boşa etiket harcama.",
        "`tags_pool` — aynı kurallarla 50'ye kadar aday etiket. En iyi 13'ü canlı `tags`, tamamı arayüzde. (Uygulama etiketleri alfabetik sıralar: önce seçilenler, sonra seçilmeyenler.)",
        "",
        "`description` — KESİNLİKLE DÜZ METİN. Etsy HTML, markdown, renk, font veya GÖRSEL kabul etmez.",
        "  - İlk satır KISA, İLGİ ÇEKİCİ BİR SORU olsun (örn. \"✨ Ever wanted your keyboard to feel like a pirate adventure?\").",
        "  - İlk 160 karakter içinde, `title`'daki \" | \" işaretinden ÖNCEKİ bölümü (ana anahtar öbek) aynen geçir.",
        "  - Başlıktaki anahtar kelimeleri açıklama gövdesinde de doğal biçimde kullan.",
        "  - Bölüm başlıkları için SABİT, ürüne uygun 'fancy' Unicode metin kullan (örn. 𝐇𝐢𝐠𝐡𝐥𝐢𝐠𝐡𝐭 𝐅𝐞𝐚𝐭𝐮𝐫𝐞𝐬, 𝐌𝐚𝐭𝐞𝐫𝐢𝐚𝐥 & 𝐁𝐮𝐢𝐥𝐝, 𝐒𝐩𝐞𝐜𝐢𝐟𝐢𝐜𝐚𝐭𝐢𝐨𝐧𝐬). Gövde normal düz metin.",
        "  - Kısa paragraflar, aralarında BOŞ SATIR. `<...>` etiketi, `#`, `*`, `-` madde işareti, `![]()` yok. Düz satır sonu listeleri olabilir.",
        "  - Görsellerden bahsetme; Etsy'de fotoğraflar ayrı listeleme fotoğrafıdır.",
        "  - Sonlara doğru kısa bir uyumluluk/uyarı bloğu ve nazik bir kapanış cümlesi ekle.",
        "  - Uyumsuzluk/uyarı satırında ❌ KULLANMA; onun yerine ⚠️ kullan (örn. \"⚠️ Not compatible with membrane or low-profile keyboards\").",
        "  - Birden fazla profil varsa açıklamada da doğru göster: \"Profile Options: Cherry / MOA\" ve/veya \"Two Profile Options – MOA (soft & rounded) / Cherry (classic)\".",
        styleLine,
      ]
        .filter(Boolean)
        .join("\n");

  const system = [
    "Sen bir e-ticaret listeleme uzmanısın. Taobao/1688 ürün verisinden",
    `${isShopify ? "Shopify" : "Etsy"} için satışa hazır, özgün ve doğru listeleme içeriği üretiyorsun.`,
    `Tüm çıktı ${input.targetLanguage.toUpperCase()} dilinde olmalı; hiç Çince bırakma.`,
    "Ürünü ve nişini önce doğru tanı, terminolojiyi o nişe göre kullan (örn. klavye keycap'lerinde",
    '"原厂高度"/"原厂"/"original height" = "Cherry Profile" (tam olarak, büyük P). AMA "OEM"/"OEM Profile"/"OEM高度" AYRI bir profildir (daha yüksek) — "OEM Profile" yaz, ASLA "Cherry" deme. Kaynakta hangi profil geçiyorsa onu koru, profili başka profille değiştirme. "热升华" = "dye-sublimation".',
    "PROFİL/ÖZELLİK DOĞRULAMASI: profil, malzeme, tuş sayısı, düzen gibi fiziksel bilgileri KAYNAĞIN kendisinden al — Çince başlık, (varsa) Çince açıklama ve özellik tablosu esastır. Emin değilsen o bilgiyi hiç yazma; uydurma veya benzer bir profille değiştirme.",
    "KEYCAP SET İSE: L şeklinde büyük Enter tuşu = ISO düzen; düz Enter = ANSI. Bazı ilanlar ikisini de sunar — o zaman varyanta göre değişir, başlık/etiket/açıklamada doğru belirt.",
    channelRules,
    isShopify
      ? 'Yanıtı SADECE şu şemada geçerli JSON ver: { "fields": [ { "key": "title", "value": "..." }, { "key": "description", "value": "..." }, { "key": "tags", "value": "..." } ] }'
      : 'Yanıtı SADECE şu şemada geçerli JSON ver: { "fields": [ { "key": "title", "value": "..." }, { "key": "title_alt", "value": "..." }, { "key": "description", "value": "..." }, { "key": "tags", "value": "..." }, { "key": "tags_pool", "value": "..." } ] }',
    "Markdown, kod bloğu veya açıklama ekleme.",
  ].join("\n");

  const wantedKeys = input.fields
    .map((f) => f.key)
    .filter((k) => !(isShopify && k === "seo_description"));

  // per-field example budget (chars) — tags get more room; the description
  // example is passed through in FULL (operator: never shorten it).
  const EX_CAP: Partial<Record<GeneratedField["key"], number>> = {
    title: 2500,
    title_alt: 2500,
    description: Number.MAX_SAFE_INTEGER,
    tags: 16000,
  };

  const fieldSpec = input.fields
    .filter((f) => wantedKeys.includes(f.key))
    .map((f) => {
      const parts = [`- key: ${f.key} (${FIELD_LABEL[f.key]})`];
      // operator's own examples win; otherwise the baked reference file
      const src = f.examples?.trim() || readExample(input.channel, f.key);
      const ex = src.slice(0, EX_CAP[f.key] ?? 4200);
      if (ex) parts.push(`  örnekler (biçim/ton için — İÇERİĞİ kopyalama, ÜRÜNE göre yeniden yaz):\n${ex}`);
      if (f.rules?.trim()) parts.push(`  kurallar: ${f.rules.trim()}`);
      return parts.join("\n");
    })
    .join("\n");

  // the Shopify AÇIKLAMA DÜZENİ rule — hoisted so the optional second-pass
  // (different model just for the description) can reuse it verbatim.
  const shopifyDescRule = !isShopify
    ? ""
    : !isSelfContainedLayout(input.descriptionLayout)
      ? shopifyDescRuleOther(descImgN, kb.isKeycapSet)
      : SHOPIFY_DESC_RULE_STACKED;

  const user = [
    `KANAL: ${input.channel}`,
    `ÜRÜN TÜRÜ: ${input.productType || "(modelin tanıması bekleniyor)"}`,
    `HEDEF DİL: ${input.targetLanguage}`,
    input.globalRules?.trim() ? `GENEL KURALLAR (başlık, açıklama ve etiketlerin HEPSİNE uygula): ${input.globalRules.trim()}` : "",
    input.productNote?.trim()
      ? [
          "",
          "OPERATÖRÜN ELLE GİRDİĞİ ÜRÜN DETAYLARI — BU SON SÖZDÜR (kullanıcı bunları kendisi yazdı):",
          input.productNote.trim().slice(0, 4000),
          "",
          "Bu detaylara UY:",
          "- Başlık, açıklama, etiketler ve özellikler bu detaylarla TUTARLI olsun; çelişen hiçbir şey yazma.",
          "- Kaynak ilan metni/varyant adları KALDIRILMIŞ varyantları veya seçenekleri hâlâ anlatıyor olabilir. Bu detaylarda YOKSA; kaynaktan gelen profil / malzeme / tuş yüksekliği / düzen (ISO/ANSI) / tuş sayısı / tema bilgisini KULLANMA.",
          "- Bu detaylarda bir şey tekse (ör. tek profil, tek malzeme) 'X veya Y seçeneği', 'şu profillerde gelir', 'comes in X/Y' gibi ÇOKLU-SEÇENEK dili KULLANMA.",
          `- Şu an üründe ${product.variants?.length ?? 0} varyant var${sv.singleConfig ? " — TEK yapılandırma; çoklu-seçenek dili kullanma" : ""}.`,
        ].join("\n")
      : "",
    shopifyDescRule,
    !isShopify ? brandLine : "",
    vocabLine,
    kbLine,
    input.advice?.trim()
      ? `\nTAVSİYE (kullanıcı bunu uygulamayı seçti — bağlayıcıdır; uzunluk/biçim çelişkisi olursa TAVSİYEYE uy, üstteki HTML bandına değil):\n${input.advice.trim().slice(0, 4000)}`
      : "",
    input.categoryResearch?.trim()
      ? `\nKATEGORİ ARAŞTIRMASI (doğru terminoloji, profil/malzeme/uyumluluk gerçekleri için kullan):\n${input.categoryResearch.trim().slice(0, 5000)}`
      : "",
    "",
    "ÜRETİLECEK ALANLAR:",
    fieldSpec,
    "",
    "KAYNAK ÜRÜN VERİSİ:",
    sv.noteMode
      ? "(NOT: Yukarıdaki OPERATÖR DETAYLARI önceliklidir. Aşağıdaki kaynak veri yalnızca tema/görsel bağlamı içindir; profil, malzeme, tuş sayısı, düzen, varyant gibi konularda kaynakla operatör detayları çelişirse OPERATÖR DETAYLARINI kullan. Kaynak, kaldırılmış varyantları hâlâ listeliyor olabilir.)"
      : "",
    `Başlık (Çince): ${product.title}`,
    `Orijinal fiyat: ${product.priceOriginal ?? "?"} ${product.currencyOriginal}`,
    // only real, customer-facing specs — marketplace stats (sales/shipping/reviews/
    // stock/listing date) and CJK-only junk are already stripped out
    `Özellikler (yalnızca gerçek ürün nitelikleri): ${JSON.stringify(cleanPropsRecord(sv.product.props)).slice(0, 2500)}`,
    "SPECIFICATIONS / özellik bölümü KURALI: sadece ürünün fiziksel/işlevsel nitelikleri (malzeme, profil, uyumluluk, layout, tuş sayısı, boyut, ağırlık, renk, tema…). ASLA pazaryeri verisi ekleme: satış adedi / toplam satış, kargo / kargo ücreti / ücretsiz kargo, stok, değerlendirme sayısı, favori, mağaza adı, ürün ID'si, liste/yayın tarihi. Emin olamadığın bir değeri uydurma, o satırı hiç yazma.",
    `Varyantlar: ${JSON.stringify(product.variants.map((v) => v.nameTranslated || v.name)).slice(0, 1800)}`,
    `Açıklama metni (kırpıldı): ${product.descHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 3000)}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Up to 3 attempts: (1) the sized budget, (2) same budget + a blunt
  // "JSON only" reminder if the reply had no JSON at all, (3) a bumped budget
  // if the reply parsed but the (huge) `description` still came out empty —
  // that means max_tokens ran out mid-description, not that anything is wrong
  // with the prompt. Each attempt's usage is accumulated.
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let model = input.model || activeModel();
  let text = "";
  let parsed: any = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const maxTok = attempt === 2 ? Math.min(64000, Math.round(descMaxTokens * 1.6)) : descMaxTokens;
    const u = attempt === 1 ? `${user}\n\nUYARI: Önceki yanıtın GEÇERLİ JSON DEĞİLDİ. Bu sefer SADECE istenen JSON nesnesini yaz — öncesinde/sonrasında hiçbir açıklama, özür ya da markdown olmasın.` : user;
    const r = await ask(system, u, "generateListing", { model: input.model, maxTokens: maxTok, signal, draftId: input.draftId });
    usage = { inputTokens: usage.inputTokens + r.usage.inputTokens, outputTokens: usage.outputTokens + r.usage.outputTokens, costUsd: usage.costUsd + r.usage.costUsd };
    model = r.model;
    text = r.text;
    try {
      const p = extractJson(text);
      const fs = (p.fields || []) as { key: string; value: unknown }[];
      const descOk = !isShopify || (fs.find((f) => f.key === "description")?.value || "").toString().trim();
      if (fs.length && descOk) {
        parsed = p;
        break;
      }
      lastErr = new LlmError(
        fs.length
          ? "Açıklama üretimi yarıda kesildi (çıktı çok uzun)."
          : "Model boş listeleme döndürdü.",
      );
    } catch (e) {
      lastErr = e;
    }
  }
  if (!parsed) {
    const sample = text.trim().slice(0, 160);
    if (lastErr instanceof LlmError && /yarıda kesildi|boş listeleme/.test(lastErr.message)) throw lastErr;
    throw new LlmError(
      `Modelden JSON alınamadı (3 denemede de).${sample ? ` Model şunu yazdı: "${sample}${text.trim().length > 160 ? "…" : ""}"` : " Model boş yanıt verdi."} Tekrar dene, ya da HTML açıklama maliyetini düşür.`,
    );
  }
  let fields: GeneratedField[] = (parsed.fields || []).map((f: any) => ({
    key: f.key,
    value: String(f.value ?? ""),
  }));

  const getF = (k: GeneratedField["key"]) => fields.find((f) => f.key === k);
  const setF = (k: GeneratedField["key"], v: string) => {
    const f = getF(k);
    if (f) f.value = v;
    else fields.push({ key: k, value: v });
  };

  // OPTIONAL: build the HTML `description` again with a DIFFERENT model (the
  // operator can point the big styled block at e.g. Sonnet while title/tags stay
  // on the main model). Falls back silently to the first-pass description.
  if (isShopify && input.descModel && input.descModel !== model) {
    try {
      const dTitle = getF("title")?.value || product.titleTranslated || product.title;
      const dSys = [
        "Sen bir Shopify HTML açıklama uzmanısın. SADECE ürünün `description` alanını üret — tam, kendine yeten, stillendirilmiş bir HTML bloğu. Başlık/etiket ÜRETME.",
        `Tüm çıktı ${input.targetLanguage.toUpperCase()} dilinde; hiç Çince bırakma. Markdown / kod bloğu / açıklama YOK.`,
        shopifyDescRule,
        htmlLenLine,
        'Yanıtı SADECE şu şemada geçerli JSON ver: {"description":"..."}',
      ]
        .filter(Boolean)
        .join("\n");
      const dUsr = [
        `ÜRÜN (üretilen başlık): ${dTitle}`,
        `ÜRÜN TÜRÜ: ${input.productType || "(modelin tanıması bekleniyor)"}`,
        input.globalRules?.trim() ? `GENEL KURALLAR: ${input.globalRules.trim()}` : "",
        input.productNote?.trim()
          ? `OPERATÖR DETAYLARI — SON SÖZ (çelişen hiçbir şey yazma):\n${input.productNote.trim().slice(0, 4000)}`
          : "",
        kbLine,
        input.categoryResearch?.trim()
          ? `\nKATEGORİ ARAŞTIRMASI:\n${input.categoryResearch.trim().slice(0, 5000)}`
          : "",
        "",
        "ÖRNEK (biçim / iskelet için — İÇERİĞİ KOPYALAMA, bu ürüne göre yeniden yaz):",
        (input.fields.find((f) => f.key === "description")?.examples?.trim() || readExample("shopify", "description")).slice(
          0,
          EX_CAP.description ?? 200000,
        ),
        "",
        "KAYNAK ÜRÜN VERİSİ:",
        `Başlık (Çince): ${product.title}`,
        `Özellikler (gerçek nitelikler): ${JSON.stringify(cleanPropsRecord(sv.product.props)).slice(0, 2500)}`,
        `Varyantlar: ${JSON.stringify(product.variants.map((v) => v.nameTranslated || v.name)).slice(0, 1800)}`,
        `Kaynak açıklama metni (kırpıldı): ${product.descHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 3000)}`,
      ]
        .filter(Boolean)
        .join("\n");
      const r2 = await ask(dSys, dUsr, "generateListingDesc", {
        model: input.descModel,
        maxTokens: descMaxTokens,
        signal,
        draftId: input.draftId,
      });
      const d2 = String(extractJson(r2.text).description ?? "").trim();
      if (d2) {
        setF("description", d2);
        usage.inputTokens += r2.usage.inputTokens;
        usage.outputTokens += r2.usage.outputTokens;
        usage.costUsd += r2.usage.costUsd;
      }
    } catch {
      /* keep the first-pass description */
    }
  }

  if (isShopify) {
    const titleField = getF("title");
    if (titleField) {
      let tv = clampTitle(titleField.value).replace(/\bgifts?\b/gi, "").replace(/\s{2,}/g, " ").trim();
      // keycap set → no profile/height word in the Shopify title (theme carries it)
      if (kb.isKeycapSet) tv = clampTitle(stripKeycapProfileFromTitle(tv));
      titleField.value = tv;
      // title == handle == seo_title == seo_description; no alt title on Shopify
      fields = fields.filter((f) => f.key !== "seo_title" && f.key !== "seo_description" && f.key !== "title_alt");
      fields.push({ key: "seo_title", value: titleField.value });
      fields.push({ key: "seo_description", value: titleField.value });
    }

    // ---- Shopify tags: ≥40 product-relevant, drop chopped "part" fragments ----
    const seen = new Set<string>();
    const uniq = (arr: string[]) =>
      arr.filter((x) => x && !isFragmentTag(x) && !seen.has(x) && (seen.add(x), true));
    const modelTags = (getF("tags")?.value ?? "").split(/[,\n]/).map(cleanTag).filter(Boolean);
    let shopTags = uniq(modelTags);
    if (shopTags.length < 40) {
      const seedTitle = titleField?.value || product.titleTranslated || product.title;
      shopTags = uniq([...shopTags, ...buildTagCandidates(product, seedTitle, input.productType)]);
    }
    setF("tags", shopTags.slice(0, 48).join(", "));
  } else {
    // ---- Etsy title: no "gift", brand suffix, ≤120 on a phrase boundary ----
    const tf = getF("title");
    if (tf) {
      let v = tf.value.replace(/\s+/g, " ").trim().replace(/\bgifts?\b/gi, "");
      v = ensureBrandSuffix(v, input.brand);
      v = clampEtsyTitle(v, input.brand);
      // hard guarantee: pre-"|" segment ≤ 40 chars (space before "|" not counted)
      if (etsyPreBarLen(v) > 40) v = clampEtsyTitle(clampEtsyTitle(v, input.brand), input.brand);
      tf.value = v;
    }
    const finalTitle = getF("title")?.value ?? "";

    // ---- Etsy alternate title: ≤14 words, subjective words removed ----
    {
      const rawAlt = getF("title_alt")?.value?.trim();
      let alt = rawAlt
        ? rawAlt.replace(/\s+/g, " ").replace(/\bgifts?\b/gi, "").replace(/\s+([,|])/g, "$1").trim()
        : finalTitle;
      alt = ensureBrandSuffix(alt, input.brand);
      alt = etsyAltTitle(alt, input.brand, 14);
      setF("title_alt", alt);
    }

    // ---- Etsy tags: 13 live + up to 50 pool, search-vocab ranked, whole words,
    //      no shop name, chosen & pool sorted alphabetically ----
    const parse = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    const raw = [
      ...etsySplitTags(finalTitle, input.productType),
      ...etsyPairedTags(finalTitle),
      ...parse(getF("tags")?.value ?? ""),
      ...parse(getF("tags_pool")?.value ?? ""),
      ...buildTagCandidates(product, finalTitle, input.productType),
    ];
    const pw = `${product.titleTranslated || product.title} ${Object.values(product.props).join(" ")} ${product.descHtml.replace(/<[^>]+>/g, " ")}`
      .split(/[^a-z0-9]+/i)
      .filter(Boolean);
    const fin = finalizeEtsyTags(raw, {
      title: finalTitle,
      productWords: pw,
      noun: input.productType || (kb.isKeycapSet ? "keycap set" : ""),
    });
    setF("tags", fin.chosen.join(", "));
    setF("tags_pool", fin.pool.join(", "));

    // ---- Etsy description: strict plain text (fancy Unicode kept), question opener, echo pre-| segment ----
    const d = getF("description");
    if (d) {
      let v = d.value
        .replace(/<[^>]+>/g, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/^\s*[#>]\s+/gm, "")
        .replace(/^\s*[*\-]\s+/gm, "• ")
        .replace(/[*_`]{1,3}/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/❌/g, "⚠️") // Etsy: warning-style emoji, not a red cross
        .trim();
      const preBar = finalTitle.split(" | ")[0].trim();
      const probe = preBar.toLowerCase().slice(0, 38);
      if (probe && !v.slice(0, 200).toLowerCase().includes(probe)) {
        const parts = v.split(/\n\n/);
        if (parts.length >= 2) parts[1] = `${preBar} — ${parts[1]}`;
        else parts.push(preBar + ".");
        v = parts.join("\n\n");
      }
      d.value = fancyEtsyHeaders(v); // section headers → fancy unicode
    }
  }

  // hard rules: 原厂高度 → "Cherry Profile", ZERO Chinese in any field, and — for
  // non-Turkish output — fold any stray Turkish letters (İ→I, ı→i, ş→s …) that
  // leaked in from the Turkish prompt so an English listing reads clean.
  const notTr = !/^tr/i.test(input.targetLanguage || "");
  for (const f of fields) {
    let g = applyKeycapGlossary(f.value);
    if (notTr) g = deTurkish(g);
    f.value = f.key === "description" ? dropCJK(g) : stripCJK(g);
  }

  return {
    channel: input.channel,
    fields,
    // variant names must be Chinese-free everywhere in the output
    variants: product.variants.map((v) => ({
      ...v,
      name: stripCJK(applyKeycapGlossary(v.name)),
      nameTranslated: v.nameTranslated ? stripCJK(applyKeycapGlossary(v.nameTranslated)) : v.nameTranslated,
    })),
    layout: isShopify ? input.descriptionLayout : undefined,
    meta: {
      brand: input.brand?.trim() || undefined,
      htmlLengthBand: input.htmlLengthBand,
      htmlLengthUnit: input.htmlLengthUnit,
      htmlBudget: input.htmlBudget,
      descStyle: input.descStyle,
    },
    model,
    usage,
  };
}

export async function translateVariants(
  variants: ProductVariant[],
  targetLanguage: string,
  opts: { model?: string; signal?: AbortSignal; draftId?: string } = {},
): Promise<{ variants: ProductVariant[]; usage: LlmUsage }> {
  if (variants.length === 0) return { variants, usage: zeroUsage() };
  const system =
    "Ürün varyant adlarını çeviren bir asistansın. Ürünün nişini tanı ve o nişin doğru terimini kullan. " +
    'Sadece JSON dizi döndür: [{ "i": 0, "t": "çeviri" }].';
  const user = `HEDEF DİL: ${targetLanguage}\n` + variants.map((v, i) => `${i}: ${v.name}`).join("\n");
  const { text, usage } = await ask(system, user, "translateVariants", { maxTokens: 2000, ...opts });
  const rows = extractJson(text) as { i: number; t: string }[];
  const out = variants.map((v, i) => {
    const hit = rows.find((r) => Number(r.i) === i);
    return hit ? { ...v, nameTranslated: stripCJK(applyKeycapGlossary(String(hit.t))) } : v;
  });
  return { variants: out, usage };
}

export async function generateAltTexts(
  images: ProductImage[],
  product: NormalisedProduct,
  targetLanguage: string,
  opts: { model?: string; signal?: AbortSignal; draftId?: string } = {},
): Promise<{ results: { url: string; alt: string }[]; usage: LlmUsage }> {
  const targets = images.filter((im) => im.role !== "unused").slice(0, 24);
  if (targets.length === 0) return { results: [], usage: zeroUsage() };
  const system =
    "Erişilebilir, SEO dostu görsel alt metni yazan bir asistansın. " +
    'Sadece JSON dizi: [{ "i": 0, "alt": "..." }]. Her alt metin 8-16 kelime, hedef dilde. ' +
    "Çıktıda HİÇBİR Çince/CJK karakter olmayacak.";
  const user =
    `HEDEF DİL: ${targetLanguage}\nÜRÜN: ${stripCJK(product.titleTranslated || product.title) || "product"}\n` +
    `NİŞ: ${stripCJK(Object.values(product.props).slice(0, 6).join(", "))}\n` +
    targets.map((im, i) => `${i}: ${im.role} — ${im.url}`).join("\n");
  const { text, usage } = await ask(system, user, "generateAltTexts", { maxTokens: 3000, ...opts });
  const rows = extractJson(text) as { i: number; alt: string }[];
  const results = targets.map((im, i) => ({
    url: im.url,
    alt: stripCJK(String(rows.find((r) => Number(r.i) === i)?.alt || "")),
  }));
  return { results, usage };
}

/* --------------------------- step 2: advice --------------------------- */

function productBrief(p: NormalisedProduct): string {
  return [
    `Başlık (Çince): ${p.title}`,
    `Fiyat: ${p.priceOriginal ?? "?"} ${p.currencyOriginal}`,
    `Özellikler (gerçek ürün nitelikleri): ${JSON.stringify(cleanPropsRecord(p.props)).slice(0, 2200)}`,
    `Varyantlar: ${JSON.stringify(p.variants.map((v) => v.nameTranslated || v.name)).slice(0, 1400)}`,
    `Açıklama (kırpıldı): ${p.descHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2600)}`,
  ].join("\n");
}

/**
 * Quick review of the product — GUIDANCE ONLY. Never writes the actual title /
 * description / tags; says how they SHOULD be (structure, keyword angle, length,
 * line & character budget for the HTML body, tone), separately for Etsy & Shopify.
 */
export async function generateAdvice(
  product: NormalisedProduct,
  channel: ChannelId,
  opts: { model?: string; signal?: AbortSignal; draftId?: string; targetLanguage?: string } = {},
): Promise<AdviceResult> {
  const lang = opts.targetLanguage || "en";
  const system = [
    "Sen kıdemli bir e-ticaret listeleme danışmanısın. SADECE TAVSİYE verirsin — asla gerçek",
    "başlık, açıklama veya etiket YAZMAZSIN. Nasıl olması gerektiğini anlatırsın.",
    `Çıktı dili: ${lang.toUpperCase()}. Kısa, madde madde, uygulanabilir.`,
    "Şu başlıkları ver:",
    "• ÜRÜN & NİŞ: model ürünü nasıl tanımlıyor (1-2 cümle).",
    "• BAŞLIK: hangi anahtar kelime açısı, hangi sıra, kaç karakter hedefi, nelerden kaçınılmalı (Etsy ve Shopify AYRI).",
    "• AÇIKLAMA: hangi bölümler, hangi ton, ilk satır ne yapmalı, uzunluk. HTML (Shopify) için KAÇ SATIR ve KAÇ KARAKTER önerdiğini net söyle. Etsy düz metin için de uzunluk.",
    "• ETİKETLER: hangi tür etiketler, hangi kelimeyle bitmeli. Shopify: en az 40 ürünle alakalı etiket. Etsy: 13 canlı + 20'lik aday havuzu. Her iki kanalda da sayı+adet parçası (\"138 key keycap set\" gibi) YASAK.",
    "• GÖRSELLER: ana galeri kaç adet, hangi açılar; açıklama görseli gerekli mi.",
    "• RİSKLER: bu üründe dikkat edilecek uyumluluk / doğruluk noktaları.",
    "Markdown başlıkları (##) ve kısa maddeler kullan.",
  ].join("\n");
  const user = [
    `KANAL ODAK: ${channel} (ama diğer kanal için de kısa not ver)`,
    layoutNote(detectKeyboardLayout(product), "tr"),
    "",
    productBrief(product),
  ]
    .filter(Boolean)
    .join("\n");
  const { text, usage, model } = await ask(system, user, "advice", {
    model: opts.model,
    maxTokens: 2500,
    signal: opts.signal,
    draftId: opts.draftId,
  });
  return { channel, advice: dropCJK(text.trim()), model, usage };
}

/**
 * On-demand deep research of the product's CATEGORY (not this listing) — e.g. for
 * keycap sets: which profiles exist, materials, printing methods, which keys a
 * keyboard needs for compatibility, sizing conventions. Category-specific.
 */
export async function researchCategory(
  product: NormalisedProduct,
  question: string,
  opts: { model?: string; signal?: AbortSignal; draftId?: string; targetLanguage?: string } = {},
): Promise<CategoryResearchResult> {
  const lang = opts.targetLanguage || "en";
  const system = [
    "Sen bir ürün kategorisi araştırmacısısın. Verilen ürünün KATEGORİSİNİ derinlemesine araştır",
    "(bu spesifik ilan için değil, genel kategori bilgisi). Doğru, standart terminoloji kullan.",
    `Çıktı dili: ${lang.toUpperCase()}. Yapılandırılmış, madde madde.`,
    "Kategoriye göre şunları kapsa (uygun olanları): tipler/profiller, malzemeler, üretim/baskı yöntemleri,",
    "boyut & uyumluluk kuralları (örn. bir klavyeye uyması için gereken tuşlar/layout), bakım, yaygın hatalar,",
    "alıcının sorduğu tipik sorular, kalite göstergeleri.",
    "Uydurma yok; emin değilsen 'değişebilir' de.",
    '"原厂高度"/"原厂"/"original height" = "Cherry Profile"; "OEM" AYRI bir profildir → "OEM Profile", asla Cherry deme. Keycap set ise: L şeklinde büyük Enter = ISO, düz Enter = ANSI; ilan ikisini de sunuyorsa varyanta göre değişir.',
  ].join("\n");
  const user = [
    `ÜRÜN: ${product.titleTranslated || product.title}`,
    `ÖZELLİKLER: ${cleanSpecs(product.props, 12).map((s) => `${s.label}: ${s.value}`).join("; ")}`,
    layoutNote(detectKeyboardLayout(product), "tr"),
    question?.trim() ? `\nODAK SORU: ${question.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const { text, usage, model } = await ask(system, user, "categoryResearch", {
    model: opts.model,
    maxTokens: 3500,
    signal: opts.signal,
    draftId: opts.draftId,
  });
  return { research: dropCJK(text.trim()), model, usage };
}

/* --------------------------- HS code lookup -------------------------- */

export interface HsCodeResult {
  code: string;
  heading: string;
  rationale: string;
  model: string;
  usage: LlmUsage;
}

/**
 * Best-guess Harmonized System (HS) code for the product, formatted for Shopify
 * (6 digits, dotted). Deterministic keycap/keyboard defaults are applied BEFORE
 * calling this; use it for everything else.
 */
export async function researchHsCode(
  product: NormalisedProduct,
  productType: string,
  opts: { model?: string; signal?: AbortSignal; draftId?: string } = {},
): Promise<HsCodeResult> {
  const system = [
    "You are a customs classification assistant. Return the single most appropriate 6-digit Harmonized System (HS) code for the product, as used for international shipping and Shopify's customs field.",
    "Use the WCO 6-digit level (the first 6 digits are internationally standard). Format the code with a dot after the 4th digit, e.g. \"8471.60\".",
    "Do NOT invent a code you are unsure of — if genuinely ambiguous, pick the closest defensible heading and say so in the rationale.",
    "Reply as strict JSON only: {\"code\":\"XXXX.XX\",\"heading\":\"short official heading text\",\"rationale\":\"one sentence, why this code\"}",
  ].join("\n");
  const user = [
    `Product: ${product.titleTranslated || product.title}`,
    productType ? `Type: ${productType}` : "",
    `Key specs: ${cleanSpecs(product.props, 10).map((s) => `${s.label}: ${s.value}`).join("; ")}`,
    "Common references: mechanical keyboard = 8471.60; keycap set (keyboard parts/accessories) = 8473.30; mouse = 8471.60; mouse pad / deskmat (textile/rubber) = 6307.90 or 4016.99; tote/ita bag (textile) = 4202.22.",
  ]
    .filter(Boolean)
    .join("\n");
  const { text, usage, model } = await ask(system, user, "hsCode", {
    model: opts.model,
    maxTokens: 400,
    signal: opts.signal,
    draftId: opts.draftId,
  });
  let parsed: any = {};
  try {
    parsed = JSON.parse((text.match(/\{[\s\S]*\}/) || ["{}"])[0]);
  } catch {
    /* fall through */
  }
  let code = String(parsed.code || "").replace(/[^\d.]/g, "");
  if (/^\d{6,10}$/.test(code)) code = code.slice(0, 4) + "." + code.slice(4, 6);
  if (!/^\d{4}\.\d{2}$/.test(code)) code = "";
  return {
    code,
    heading: String(parsed.heading || "").slice(0, 120),
    rationale: String(parsed.rationale || "").slice(0, 240),
    model,
    usage,
  };
}

/* -------------------- Shopify taxonomy attribute picks -------------------- */

export interface AttrForAI {
  handle: string;
  name: string;
  values: string[];
}

/**
 * Pick the best Shopify taxonomy attribute value(s) for the product from the
 * CLOSED value list of each attribute. Returns `{handle: [valueName, ...]}` using
 * EXACT names from the provided lists (never invented). Leaves an attribute out
 * when the product data doesn't clearly support any value.
 */
export async function suggestAttributes(
  product: NormalisedProduct,
  listing: GeneratedListing | null,
  categoryPath: string,
  attrs: AttrForAI[],
  opts: { model?: string; signal?: AbortSignal; draftId?: string } = {},
): Promise<{ picks: Record<string, string[]>; usage: LlmUsage; model: string }> {
  const desc = (listing?.fields.find((f) => f.key === "description")?.value || product.descHtml || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 1500);
  const handleList = attrs.map((a) => a.handle).join(", ");
  const system = [
    "You classify a product against Shopify's Standard Product Taxonomy attributes.",
    "You are given a set of ATTRIBUTES. Each has a `handle`, a display name, and a FIXED list of allowed values.",
    "Choose, per attribute, the value(s) the product data clearly supports. Use EXACT value strings from that attribute's list — never invent, reword, or prefix them.",
    "Most attributes take exactly ONE value. Pick multiple only when the product genuinely has several (e.g. Color).",
    "Omit an attribute completely if nothing in the data supports any of its values. Never guess.",
    '"原厂高度"/"original height" = "Cherry" profile; "OEM" is its OWN profile (never Cherry). Dye-sub / 热升华 = "Dye-sublimated"; double-shot / 二色 = "Double-shot".',
    "",
    "OUTPUT: a single strict JSON object. Its keys MUST be attribute handles taken verbatim from this list:",
    handleList,
    'Each value is an array of chosen value strings. Do NOT use the product name as a key. No prose, no code fences.',
    'Example shape: {"color":["Black","Purple"],"keycap-profile":["OEM"]}',
  ].join("\n");
  const user = [
    `CATEGORY: ${categoryPath}`,
    `PRODUCT: ${product.titleTranslated || product.title}`,
    product.title && product.title !== (product.titleTranslated || "") ? `ORIGINAL (zh): ${product.title}` : "",
    `SPECS: ${cleanSpecs(product.props, 20).map((s) => `${s.label}: ${s.value}`).join("; ")}`,
    profilePhrase(detectProfiles(product)) ? `DETECTED PROFILE: ${profilePhrase(detectProfiles(product))}` : "",
    `DESCRIPTION: ${desc}`,
    "",
    "ATTRIBUTES:",
    ...attrs.map((a) => `${a.handle} (${a.name}): ${a.values.join(" | ")}`),
  ]
    .filter(Boolean)
    .join("\n");
  const { text, usage, model } = await ask(system, user, "attributeSuggest", {
    model: opts.model,
    maxTokens: 1200,
    signal: opts.signal,
    draftId: opts.draftId,
  });
  let parsed: any = {};
  try {
    parsed = JSON.parse((text.match(/\{[\s\S]*\}/) || ["{}"])[0]);
  } catch {
    /* leave empty */
  }
  // canonical lookup: lower-cased value name → { handle, name }[]
  const canon = new Map<string, { handle: string; name: string }[]>();
  for (const a of attrs)
    for (const v of a.values) {
      const k = v.toLowerCase();
      (canon.get(k) ?? canon.set(k, []).get(k)!).push({ handle: a.handle, name: v });
    }
  const norm = (s: string) => s.toLowerCase().split(":").pop()!.trim();
  const picks: Record<string, string[]> = {};
  const add = (handle: string, name: string) => {
    const arr = (picks[handle] ??= []);
    if (!arr.includes(name) && arr.length < 4) arr.push(name);
  };

  const byHandle = new Map(attrs.map((a) => [a.handle, new Set(a.values.map((v) => v.toLowerCase()))]));
  let matchedByHandle = false;
  for (const [h, val] of Object.entries(parsed)) {
    const set = byHandle.get(h);
    if (!set) continue; // not a real handle (e.g. the model keyed by product name)
    const list = Array.isArray(val) ? val : [val];
    for (const x of list) {
      const canonName = attrs.find((a) => a.handle === h)?.values.find((v) => v.toLowerCase() === norm(String(x)));
      if (canonName) {
        add(h, canonName);
        matchedByHandle = true;
      }
    }
  }
  // Fallback: the model returned the right VALUES but under a wrong key (its
  // favourite failure is keying by the product title). Bucket every string it
  // produced back to the attribute(s) whose value list contains it.
  if (!matchedByHandle) {
    const flat: string[] = [];
    const walk = (x: unknown) => {
      if (typeof x === "string") flat.push(x);
      else if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") Object.values(x).forEach(walk);
    };
    walk(parsed);
    for (const s of flat) {
      const hits = canon.get(norm(s));
      if (hits && hits.length <= 2) for (const { handle, name } of hits) add(handle, name);
    }
  }
  return { picks, usage, model };
}

/* --------------------- variant names for a channel ------------------- */

/** Concise, marketplace-ready variant names. Etsy option values ≤ 20 chars, Shopify ≤ 40. */
export async function nameVariantsForChannel(
  variants: ProductVariant[],
  channel: ChannelId,
  targetLanguage: string,
  opts: { model?: string; signal?: AbortSignal; draftId?: string } = {},
): Promise<{ variants: ProductVariant[]; usage: LlmUsage; maxChars: number }> {
  const maxChars = channel === "etsy" ? 20 : 40;
  if (variants.length === 0) return { variants, usage: zeroUsage(), maxChars };
  const system = [
    "Ürün varyant adlarını bir pazaryeri için kısa ve net hale getiren asistansın.",
    `HER ad EN FAZLA ${maxChars} KARAKTER olacak (${channel}). Nişin doğru terimini kullan`,
    '(örn. "原厂高度" → "Cherry Profile"). Gereksiz kelime yok, marka yok, ölçü birimi netse kalsın.',
    `Çıktı dili: ${targetLanguage.toUpperCase()}. Sadece JSON dizi: [{ "i": 0, "t": "..." }].`,
  ].join("\n");
  const user = variants.map((v, i) => `${i}: ${v.nameTranslated || v.name}`).join("\n");
  const { text, usage } = await ask(system, user, "nameVariants", { maxTokens: 1800, model: opts.model, signal: opts.signal, draftId: opts.draftId });
  const rows = extractJson(text) as { i: number; t: string }[];
  const out = variants.map((v, i) => {
    const hit = rows.find((r) => Number(r.i) === i);
    const t = stripCJK(applyKeycapGlossary(hit ? String(hit.t).trim() : v.nameTranslated || v.name)).slice(0, maxChars);
    return { ...v, nameTranslated: t };
  });
  return { variants: out, usage, maxChars };
}
