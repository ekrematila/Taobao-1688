import { ask, extractJson, LlmError } from "./llm.ts";
import { dropCJK, stripCJK } from "@shared/listingFormat.ts";
import { applyKeycapGlossary, detectKeyboardLayout, layoutNote } from "@shared/keycaps.ts";
import { BLOG_LAYOUTS, BLOG_THEMES, BLOG_VOICES, productStyleHint } from "@shared/blogPresets.ts";
import type { BlogConfig, BlogDoc, BlogSeo, NormalisedProduct } from "@shared/types.ts";

export { productStyleHint };

export interface BlogGenInput {
  kind: "product" | "category";
  product?: NormalisedProduct | null;
  category?: string;
  config: BlogConfig;
  targetLanguage: string;
  seo?: BlogSeo | null;
  model?: string;
  draftId?: string;
}

/* ------------------------------- prompts ------------------------------ */

function productBlock(p?: NormalisedProduct | null): string {
  if (!p) return "(ürün yok — kategori blogu)";
  return [
    `Başlık (kaynak): ${p.title}`,
    p.titleTranslated ? `Başlık (çeviri): ${p.titleTranslated}` : "",
    `Fiyat: ${p.priceOriginal ?? "?"} ${p.currencyOriginal}`,
    `Özellikler: ${JSON.stringify(p.props).slice(0, 2600)}`,
    `Varyantlar: ${JSON.stringify(p.variants.map((v) => v.nameTranslated || v.name)).slice(0, 1400)}`,
    `Açıklama (kırpıldı): ${p.descHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2600)}`,
    p.videoUrl ? "Ürün videosu VAR (bloga gömülecek — metinde ondan doğal biçimde bahset)." : "",
    layoutNote(detectKeyboardLayout(p), "tr"),
  ]
    .filter(Boolean)
    .join("\n");
}

function linkLines(cfg: BlogConfig): string {
  const rows: string[] = [];
  if (cfg.siteUrl) rows.push(`- ${cfg.siteUrl} — ${cfg.category || "ana site / mağaza"} (BİRİNCİL hedef)`);
  for (const b of cfg.backlinks || []) if (b?.url) rows.push(`- ${b.url}${b.label ? ` — ${b.label}` : ""}`);
  return rows.length ? rows.join("\n") : "(bağlantı verilmedi)";
}

/* --------------------------- SEO research --------------------------- */

export async function researchBlogSeo(input: BlogGenInput): Promise<BlogSeo> {
  const lang = input.targetLanguage || "English";
  const subject =
    input.kind === "product"
      ? input.product?.titleTranslated || input.product?.title || "the product"
      : input.category || "the category";
  const system = [
    "Sen kıdemli bir SEO içerik stratejistisin. Bir blog yazısı için ARAŞTIRMA çıktısı üretiyorsun —",
    "gerçek yazıyı YAZMIYORSUN, sadece stratejiyi veriyorsun.",
    `Çıktı dili: ${lang.toUpperCase()}.`,
    "Şunları kapsa: birincil + ikincil anahtar kelimeler, arama amacı (informational/commercial/transactional),",
    "rakiplerin atladığı açılar, önerilen H2/H3 taslağı (8-14 madde), meta başlık (≤60 krkt) ve meta açıklama",
    "(≤155 krkt), önerilen kelime sayısı, dahili/harici bağlantı fırsatları, öne çıkan snippet (featured snippet) şansı.",
    'Yanıtı SADECE şu JSON şemasında ver: {"clusters":[{"name":"","keywords":["",""],"intent":""}],"outline":["H2 …"],"gaps":["…"],"metaTitle":"","metaDescription":"","words":1200,"notes":"…"}',
    "Markdown veya açıklama ekleme.",
  ].join("\n");
  const user = [
    `TÜR: ${input.kind === "product" ? "ürün blogu" : "kategori blogu"}`,
    `KONU: ${subject}`,
    input.config.focusKeyword?.trim() ? `HEDEF ANAHTAR KELİME: ${input.config.focusKeyword.trim()}` : "",
    `BAĞLANTI HEDEFLERİ (yazı bunlara backlink verecek):\n${linkLines(input.config)}`,
    input.config.notes?.trim() ? `EK NOTLAR: ${input.config.notes.trim()}` : "",
    "",
    "KAYNAK:",
    productBlock(input.product),
  ]
    .filter(Boolean)
    .join("\n");

  const { text, model } = await ask(system, user, "blog-seo", {
    model: input.model,
    maxTokens: 3200,
    draftId: input.draftId,
  });
  const j = extractJson(text);
  return {
    clusters: Array.isArray(j.clusters)
      ? j.clusters.map((c: any) => ({
          name: dropCJK(String(c.name || "")),
          keywords: Array.isArray(c.keywords) ? c.keywords.map((k: any) => dropCJK(String(k))) : [],
          intent: dropCJK(String(c.intent || "")),
        }))
      : [],
    outline: Array.isArray(j.outline) ? j.outline.map((o: any) => dropCJK(String(o))) : [],
    gaps: Array.isArray(j.gaps) ? j.gaps.map((g: any) => dropCJK(String(g))) : [],
    metaTitle: dropCJK(String(j.metaTitle || "")).slice(0, 70),
    metaDescription: dropCJK(String(j.metaDescription || "")).slice(0, 180),
    words: Number(j.words) > 300 ? Math.round(Number(j.words)) : input.config.words || 1200,
    notes: dropCJK(String(j.notes || "")),
    model,
  };
}

/* ---------------------------- generation --------------------------- */

export async function generateBlog(input: BlogGenInput): Promise<BlogDoc> {
  const lang = input.targetLanguage || "English";
  const hint = productStyleHint(input.product, input.category);
  const L = BLOG_LAYOUTS.find((x) => x.id === input.config.layout && x.id !== "product");
  const H = BLOG_THEMES.find((x) => x.id === input.config.theme && x.id !== "product");
  const Vo = BLOG_VOICES.find((x) => x.id === input.config.voice && x.id !== "product");
  const layoutName = L ? L.en : `product style (${BLOG_LAYOUTS.find((x) => x.id === hint.layout)?.en})`;
  const themeName = H ? H.en : `product style (${BLOG_THEMES.find((x) => x.id === hint.theme)?.en})`;
  const voiceGuide = (Vo || BLOG_VOICES.find((x) => x.id === hint.voice))?.guide || "clear and professional";

  const words = input.seo?.words || input.config.words || 1200;
  const subject =
    input.kind === "product"
      ? input.product?.titleTranslated || input.product?.title || "the product"
      : input.category || "the category";

  const system = [
    "Sen uzman bir SEO blog yazarısın. Verilen ürün/kategori için MÜKEMMEL, özgün, doğru ve",
    "arama motoruna son derece uyumlu bir blog yazısı üretiyorsun.",
    `Çıktı dili: ${lang.toUpperCase()}. Kesinlikle Çince/CJK bırakma.`,
    `YAZI TARZI (voice): ${voiceGuide}`,
    `GÖRSEL DÜZEN (bilgi amaçlı — HTML'i uygulama render eder): ${layoutName}; tema: ${themeName}.`,
    `HEDEF UZUNLUK: ~${words} kelime (gövde). Bölümleri buna göre boyutla.`,
    "",
    "SEO KURALLARI:",
    "- Birincil anahtar kelime başlıkta (H1), ilk 100 kelimede, en az bir H2'de ve meta açıklamada geçsin — doğal biçimde, tekrara kaçmadan.",
    "- Her H2 bir arama niyetini karşılasın; H3'lerle destekle. Bölüm başlıkları soru/uzun-kuyruk anahtar kelime içerebilir.",
    "- Kısa paragraflar (2-4 cümle), taranabilir; yerinde madde işaretli listeler (satır başına \"- \").",
    "- İçsel tutarlılık, gerçeklere sadakat; uydurma istatistik yok. Emin değilsen genel ifade kullan.",
    "- 'featured snippet' için en az bir bölüm 40-55 kelimelik net bir tanım/cevap ile başlasın.",
    "- SSS bölümü: 4-7 gerçek alıcı sorusu + kısa net cevap (schema'ya uygun).",
    "",
    "BACKLINK KURALLARI (çok önemli):",
    "- Verilen bağlantı hedeflerine BOL ve DOĞAL backlink ver. Birincil siteye en az 3-5, diğer hedeflere en az 1'er.",
    "- Anchor metin AÇIKLAYICI olsun (çıplak URL veya 'buraya tıkla' YASAK). Anchor, hedefin 'label' değeriyle uyumlu olsun.",
    "- Bağlantı verilecek cümleyi, o bağlantının 'label' ifadesini AYNEN içerecek şekilde kur ki uygulama linki yerleştirebilsin.",
    "- Her bölümde en fazla 1-2 link; spam gibi durmasın. CTA paragrafında birincil siteye net bir çağrı olsun.",
    "",
    input.product?.videoUrl && input.config.includeVideo
      ? "- Ürün videosu yazıya gömülecek; bir bölümde videoya doğal biçimde atıfta bulun ('yukarıdaki videoda görebileceğiniz gibi')."
      : "",
    "",
    "",
    "GÖRSEL EŞLEŞTİRME: her bölüm için `imageHint` alanına, O BÖLÜMDE gösterilmesi mantıklı olacak",
    "görselin 2-5 kelimelik İngilizce betimlemesini yaz (ör. 'close-up of MX switch stem', 'full",
    "keyboard on desk', 'PBT dye-sub legend detail'). Uygulama bu ipucunu ürün fotoğraflarının alt",
    "metinleriyle eşleştirir; alakasız görsel koymaz. Bir bölüme görsel uymuyorsa `imageHint` boş bırak.",
    "",
    'Yanıtı SADECE şu JSON şemasında ver:',
    '{"title":"","slug":"","seoTitle":"","metaDescription":"","excerpt":"","keywords":["",""],',
    '"intro":["paragraf", "..."],',
    '"sections":[{"heading":"H2 başlık","body":["paragraf","- madde"],"linkLabels":["label"],"imageHint":"short english description or empty"}],',
    '"faq":[{"q":"","a":""}],',
    '"cta":"birincil siteye çağrı paragrafı (site label\'ını içersin)",',
    '"internalLinks":[{"anchor":"","note":""}]}',
    "Markdown, kod bloğu veya açıklama YOK.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `TÜR: ${input.kind === "product" ? "ürün blogu" : "kategori blogu"}`,
    `KONU: ${subject}`,
    input.config.category ? `KATEGORİ: ${input.config.category}` : "",
    input.config.focusKeyword?.trim() ? `HEDEF ANAHTAR KELİME: ${input.config.focusKeyword.trim()}` : "",
    "",
    `BAĞLANTI HEDEFLERİ (yazı bunlara backlink verecek — label ifadelerini metinde AYNEN kullan):`,
    linkLines(input.config),
    "",
    input.seo
      ? `SEO ARAŞTIRMASI (buna uy):\nMeta başlık: ${input.seo.metaTitle}\nMeta açıklama: ${input.seo.metaDescription}\nTaslak: ${input.seo.outline.join(" | ")}\nAnahtar kümeler: ${input.seo.clusters
          .map((c) => `${c.name}: ${c.keywords.join(", ")}`)
          .join(" ; ")}\nAçıklar: ${input.seo.gaps.join(" ; ")}\nNotlar: ${input.seo.notes}`
      : "",
    input.config.notes?.trim() ? `EK NOTLAR: ${input.config.notes.trim()}` : "",
    "",
    "KAYNAK:",
    productBlock(input.product),
  ]
    .filter(Boolean)
    .join("\n");

  const { text, model } = await ask(system, user, "blog", {
    model: input.model,
    maxTokens: 9000,
    draftId: input.draftId,
  });
  const j = extractJson(text);
  if (!j || !j.title || !Array.isArray(j.sections)) throw new LlmError("Model geçerli bir blog döndürmedi.");

  const S = (v: unknown) => stripCJK(applyKeycapGlossary(String(v ?? "")));
  const D = (v: unknown) => dropCJK(applyKeycapGlossary(String(v ?? "")));
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);

  const cfgLinks = [
    ...(input.config.siteUrl ? [{ url: input.config.siteUrl, label: input.config.category || "our shop" }] : []),
    ...(input.config.backlinks || []).filter((b) => b?.url),
  ];
  const heroImg = input.product?.images?.find((i) => i.role === "gallery")?.url || input.product?.images?.[0]?.url;

  // candidate images for section illustration: skip variant swatches and the hero
  const STOP = new Set(
    "the a an and or of for with to in on at from this that these those is are was set pcs keys key photo image close up view shot detail product our your it its".split(
      " ",
    ),
  );
  const tok = (s: string) =>
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !STOP.has(w));
  const candidates = (input.product?.images || [])
    .filter((im) => im.role !== "variant" && im.url && im.url !== heroImg)
    .map((im) => ({ url: im.url, words: new Set([...tok(im.alt || ""), ...tok(im.url.split("/").pop() || "")]) }));
  const usedImg = new Set<string>();
  /** best image whose alt text actually overlaps the section's topic; else none. */
  const matchImage = (sectionText: string): string | undefined => {
    const want = tok(sectionText);
    if (!want.length) return undefined;
    let best: { url: string; score: number } | null = null;
    for (const c of candidates) {
      if (usedImg.has(c.url) || !c.words.size) continue;
      let score = 0;
      for (const w of want) if (c.words.has(w)) score++;
      if (!best || score > best.score) best = { url: c.url, score };
    }
    if (best && best.score >= 2) {
      usedImg.add(best.url);
      return best.url;
    }
    return undefined;
  };

  const sections = arr(j.sections).map((s: any) => {
    const labels: string[] = arr(s.linkLabels).map((x: any) => String(x));
    const urls = labels
      .map((lab) => cfgLinks.find((l) => (l.label || "").toLowerCase() === lab.toLowerCase())?.url)
      .filter(Boolean) as string[];
    const body = arr(s.body).map(D).filter(Boolean);
    return {
      heading: S(s.heading),
      body,
      linkUrls: urls,
      image: matchImage(`${s.imageHint || ""} ${s.heading || ""} ${body.slice(0, 2).join(" ")}`),
    };
  });

  const doc: BlogDoc = {
    title: S(j.title),
    slug:
      String(j.slug || j.title || "post")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70) || "post",
    seoTitle: S(j.seoTitle || j.title).slice(0, 70),
    metaDescription: D(j.metaDescription).slice(0, 180),
    excerpt: D(j.excerpt).slice(0, 320),
    keywords: arr(j.keywords).map(S).filter(Boolean).slice(0, 12),
    intro: arr(j.intro).map(D).filter(Boolean),
    sections,
    faq: arr(j.faq).map((f: any) => ({ q: S(f.q), a: D(f.a) })).filter((f: any) => f.q && f.a),
    cta: D(j.cta),
    hero: heroImg,
    video: input.config.includeVideo ? input.product?.videoUrl : undefined,
    internalLinks: arr(j.internalLinks)
      .map((x: any) => ({ anchor: S(x.anchor), note: D(x.note) }))
      .filter((x: any) => x.anchor),
    model,
  };
  return doc;
}
