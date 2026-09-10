import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, categoryResearchJob, generateListingJob, nameVariantsJob, type Draft } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { JobCancelled, type RunningJob } from "../lib/jobs";
import JobProgress from "./JobProgress";
import ListingPreview from "./ListingPreview";
import DescCropLayer from "./DescCropLayer";
import { downloadBlob, slugify } from "../lib/image";
import { etsyZip, importBodyHtml, importBodyHtmlPreview, listingJson, plainText, shopifyBodyHtml, shopifyCsv, wooCsv } from "../lib/export";
import { CLAUDE_MODELS, DEFAULT_PRODUCT_TYPES, DESC_STYLES, HTML_BUDGETS, HTML_LENGTH_BANDS, HTML_CHAR_BANDS } from "@shared/models.ts";
import { DEFAULT_FIELD_EXAMPLES, STACKED_DESC_EXAMPLE } from "@shared/exampleData.ts";
import { DESC_LAYOUTS, isSelfContainedLayout, renderDescriptionHtml } from "@shared/descLayouts.ts";
import { descBodyImages, publicImageUrl } from "@shared/listingFormat.ts";
import { cleanSpecs } from "@shared/specs.ts";
import { detectKeyboardLayout, detectProfiles, profilePhrase } from "@shared/keycaps.ts";
import { defaultHsCode, estimateWeightKg } from "@shared/weight.ts";
import { SHOPIFY_CATEGORY_PATHS, categoryFor } from "@shared/shopifyCategories.ts";
import { proxied } from "../api";
import type {
  ChannelId,
  DescriptionLayout,
  GeneratedField,
  GeneratedListing,
  JobView,
  ProductAttrPick,
  ProductVariant,
  TaxonomyAttribute,
} from "@shared/types.ts";

const FIELDS_BY_CHANNEL: Record<ChannelId, GeneratedField["key"][]> = {
  shopify: ["title", "description", "tags"],
  etsy: ["title", "title_alt", "description", "tags"],
};

/** Common countries/regions of origin (ISO-3166-1 alpha-2 · name) for the picker. */
const ORIGINS: [string, string][] = [
  ["CN", "China"], ["TW", "Taiwan"], ["HK", "Hong Kong"], ["KR", "South Korea"],
  ["JP", "Japan"], ["VN", "Vietnam"], ["TH", "Thailand"], ["MY", "Malaysia"],
  ["ID", "Indonesia"], ["IN", "India"], ["TR", "Türkiye"], ["US", "United States"],
  ["DE", "Germany"], ["GB", "United Kingdom"], ["PL", "Poland"],
];

const ETSY_DESC_EXAMPLE = `✨ Ever wanted your mechanical keyboard to feel like a pirate adventure?

The One Piece Anime Artisan Keycap Set brings colorful chibi characters, treasure motifs, and ocean-voyage vibes straight to your desk.

💖 𝐇𝐢𝐠𝐡𝐥𝐢𝐠𝐡𝐭 𝐅𝐞𝐚𝐭𝐮𝐫𝐞𝐬
Premium PBT Keycaps – Thick, durable, shine-resistant
Dye-Sublimation Printing – Crisp, long-lasting artwork
Two Profile Options – MOA / Cherry

🧱 𝐌𝐚𝐭𝐞𝐫𝐢𝐚𝐥 & 𝐁𝐮𝐢𝐥𝐝
High-quality PBT, dye-sublimated legends and novelties.

📦 𝐍𝐨𝐭𝐞
This listing is for keycaps only. Keyboard shown in photos is for display only.

💬 Need help with compatibility? Message us anytime — we usually reply within 24 hours.`;

const SHOPIFY_DESC_EXAMPLE = `<h2>A keyboard worthy of the theme</h2>
<p>Transform your setup with a set inspired by the story. Iconic symbols and subtle detailing bring a refined aesthetic to your desk.</p>
<h3>Key features</h3>
<ul>
  <li>Premium PBT, dye-sublimation legends</li>
  <li>Profile options: Cherry / MOA / SA</li>
  <li>MX-style compatible</li>
</ul>
<h3>What's included</h3>
<p>Full keycap set, secure packaging.</p>`;

export default function DeliveryStudio({
  draft,
  hasShopify,
  defaultModel,
  onSaved,
}: {
  draft: Draft;
  hasShopify: boolean;
  defaultModel: string;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [channel, setChannel] = useState<ChannelId>((draft.channel as ChannelId) || "shopify");
  const [productType, setProductType] = useState("");
  const [targetLang, setTargetLang] = useState("en");
  const [model, setModel] = useState(defaultModel);
  const [layout, setLayout] = useState<DescriptionLayout>("stacked-plain");
  const [globalRules, setGlobalRules] = useState("");
  const [productNote, setProductNote] = useState("");
  const [fieldCfg, setFieldCfg] = useState<Record<string, { examples: string; rules: string }>>({});
  const [brand, setBrand] = useState("");
  const [htmlBudget, setHtmlBudget] = useState<"full" | "lean" | "min">("full");
  // explicit length override for "Diğer HTML düzenler" — leave unset to use the
  // auto-sized target; set a band to pin it (still styled HTML either way).
  const [htmlBand, setHtmlBand] = useState("400-500");
  const [htmlUnit, setHtmlUnit] = useState<"line" | "char">("line");
  const [descModel, setDescModel] = useState(""); // "" = same as the main model
  const [descStyle, setDescStyle] = useState("product");
  // shipping & customs (persisted on draft.product so exports/push can read them).
  // "Type" is not its own field — it mirrors the Ürün türü (productType) value.
  const [category, setCategory] = useState("");
  const [originCountry, setOriginCountry] = useState("CN");
  const [hsCode, setHsCode] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [perVariantCustoms, setPerVariantCustoms] = useState(false);
  const [weightNote, setWeightNote] = useState("");
  const [hsNote, setHsNote] = useState("");
  const [hsBusy, setHsBusy] = useState(false);
  // Shopify taxonomy attributes chosen for this product (keyed by attribute handle)
  const [attrPicks, setAttrPicks] = useState<Record<string, ProductAttrPick>>({});
  const [attrOpen, setAttrOpen] = useState(false);
  const shipHydrated = useRef(false);
  const shopType = productType.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const [applyAdvice, setApplyAdvice] = useState(false);
  const [applyResearch, setApplyResearch] = useState(false);
  const [research, setResearch] = useState("");
  const [researchQ, setResearchQ] = useState("");
  const [researchManusProfile, setResearchManusProfile] = useState<"manus-1.6-lite" | "manus-1.6" | "manus-1.6-max">("manus-1.6");
  const [confirmGate, setConfirmGate] = useState<null | boolean>(null);
  const [hoverLayout, setHoverLayout] = useState<string | null>(null);
  const hoverT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const jobRef = useRef<RunningJob<unknown> | null>(null);
  const hydrated = useRef(false);
  const cropSave = useRef<Record<string, import("@shared/types.ts").DescImageCrop | null>>({});
  const cropTimer = useRef<number | null>(null);

  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  // the COMPLETE Shopify taxonomy (bundled, ~14.6k paths) for the Category picker
  const taxonomyQ = useQuery({ queryKey: ["taxonomy"], queryFn: api.taxonomy, staleTime: 24 * 60 * 60 * 1000 });
  const productTypeOpts = settingsQ.data?.productTypes ?? DEFAULT_PRODUCT_TYPES;
  const ptNorm = productType.trim().toLowerCase();
  const canSavePt = ptNorm.length > 0 && ptNorm.length <= 40 && !productTypeOpts.includes(ptNorm);
  const [savingPt, setSavingPt] = useState(false);
  async function saveProductType() {
    if (!canSavePt) return;
    setSavingPt(true);
    try {
      const custom = productTypeOpts.filter((x) => !DEFAULT_PRODUCT_TYPES.includes(x));
      await api.saveSettings({ productTypes: [...custom, ptNorm] });
      await qc.invalidateQueries({ queryKey: ["settings"] });
    } finally {
      setSavingPt(false);
    }
  }
  async function removeProductType(pt: string) {
    setSavingPt(true);
    try {
      const custom = productTypeOpts.filter((x) => !DEFAULT_PRODUCT_TYPES.includes(x) && x !== pt);
      await api.saveSettings({ productTypes: custom });
      await qc.invalidateQueries({ queryKey: ["settings"] });
    } finally {
      setSavingPt(false);
    }
  }

  const adviceText: string = (draft.imageState as any)?.advice || "";
  const kb = draft.product ? detectKeyboardLayout(draft.product) : null;

  // hydrate saved generation settings from the draft
  useEffect(() => {
    hydrated.current = false;
    setChannel((draft.channel as ChannelId) || "shopify");
    const s = (draft.imageState as any) ?? {};
    const dc = s.delivery;
    if (dc) {
      setProductType(dc.productType ?? "");
      setTargetLang(dc.targetLang ?? "en");
      setLayout(dc.layout ?? "stacked-plain");
      setGlobalRules(dc.globalRules ?? "");
      setProductNote(dc.productNote ?? "");
      setFieldCfg(dc.fieldCfg ?? {});
      setBrand(dc.brand ?? "");
      setHtmlBudget(dc.htmlBudget === "lean" || dc.htmlBudget === "min" ? dc.htmlBudget : "full");
      setHtmlBand(dc.htmlBand ?? "400-500");
      setHtmlUnit(dc.htmlUnit === "char" ? "char" : "line");
      setDescModel(typeof dc.descModel === "string" ? dc.descModel : "");
      setDescStyle(dc.descStyle ?? "product");
      setPerVariantCustoms(!!dc.perVariantCustoms);
    }
    setApplyAdvice(!!s.useAdvice);
    setApplyResearch(!!s.useCategoryResearch);
    setResearch(s.categoryResearch || "");
    // shipping/customs live on the product itself
    shipHydrated.current = false;
    const p = draft.product;
    setCategory(p?.category ?? "");
    setOriginCountry(p?.originCountry ?? "CN");
    setHsCode(p?.hsCode ?? "");
    setWeightKg(p?.weightKg != null ? String(p.weightKg) : "");
    setAttrPicks((p?.attributes as Record<string, ProductAttrPick>) ?? {});
    setWeightNote("");
    setHsNote("");
  }, [draft.id, (draft.imageState as any)?.categoryResearch]);

  // auto-fill HS code + Shopify category from the type / bundled taxonomy when still blank
  useEffect(() => {
    if (!draft.product) return;
    if (!hsCode.trim()) {
      const d = defaultHsCode(productType, draft.product);
      if (d) {
        setHsCode(d);
        setHsNote(lang === "tr" ? `varsayılan (${/keycap|键帽/i.test(productType || draft.product.title) ? "keycap set" : "klavye"})` : "default");
      }
    }
    if (!category.trim()) setCategory(categoryFor(productType, draft.product));
  }, [productType, draft.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setModel(defaultModel), [defaultModel]);

  // persist generation settings (debounced, silent)
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const id = setTimeout(() => {
      api
        .patchDraft(draft.id, {
          imageState: {
            ...((draft.imageState as any) ?? {}),
            delivery: { productType, targetLang, layout, globalRules, productNote, fieldCfg, brand, htmlBudget, htmlBand, htmlUnit, descModel, descStyle, perVariantCustoms },
          },
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(id);
  }, [productType, targetLang, layout, globalRules, productNote, fieldCfg, brand, htmlBudget, htmlBand, htmlUnit, descModel, descStyle, perVariantCustoms]);

  // persist shipping & customs onto draft.product (debounced, silent, fresh-merged)
  useEffect(() => {
    if (!shipHydrated.current) {
      shipHydrated.current = true;
      return;
    }
    const id = setTimeout(async () => {
      try {
        const fresh = await api.draft(draft.id);
        if (!fresh.product) return;
        const w = parseFloat(weightKg.replace(",", "."));
        await api.patchDraft(draft.id, {
          product: {
            ...fresh.product,
            shopType: shopType || undefined,
            category: category.trim() || undefined,
            originCountry: originCountry.trim() || undefined,
            hsCode: hsCode.trim() || undefined,
            weightKg: Number.isFinite(w) && w > 0 ? Math.round(w * 1000) / 1000 : undefined,
            attributes: Object.keys(attrPicks).length ? attrPicks : undefined,
          },
        });
      } catch {
        /* best effort */
      }
    }, 700);
    return () => clearTimeout(id);
  }, [shopType, category, originCountry, hsCode, weightKg, JSON.stringify(attrPicks)]);

  const keys = FIELDS_BY_CHANNEL[channel];
  const examplesQ = useQuery({ queryKey: ["examples"], queryFn: api.examples, staleTime: 60 * 60 * 1000 });
  const defaultExample = (k: string): string => {
    // "Alt alta görsel" description → the .bm sticky-card reference is the default example
    if (k === "description" && channel === "shopify" && isSelfContainedLayout(layout)) {
      return (examplesQ.data as any)?.shopify?.descriptionStacked || STACKED_DESC_EXAMPLE;
    }
    return (examplesQ.data as any)?.[channel]?.[k] ?? (DEFAULT_FIELD_EXAMPLES as any)[channel]?.[k] ?? "";
  };

  async function generate(mode: "ai" | "local" = "ai") {
    setBusy(mode === "local" ? "gen-local" : "gen");
    const r = generateListingJob(
      {
        draftId: draft.id,
        channel,
        productType,
        targetLanguage: targetLang,
        descriptionLayout: layout,
        globalRules,
        productNote: productNote.trim() || undefined,
        model,
        mode,
        brand: channel === "etsy" ? brand : undefined,
        // length is AUTO-sized from the product; htmlBudget scales it + the token cost
        htmlBudget: channel === "shopify" ? htmlBudget : undefined,
        // explicit line/char length target — pins the auto size. Applies to BOTH
        // "Diğer HTML düzenler" and "Alt alta görsel".
        htmlLengthBand: channel === "shopify" ? htmlBand : undefined,
        htmlLengthUnit: channel === "shopify" ? htmlUnit : undefined,
        // optional 2nd-pass model just for the HTML description
        descModel: channel === "shopify" && descModel && descModel !== model ? descModel : undefined,
        descStyle,
        advice: applyAdvice && adviceText ? adviceText : undefined,
        categoryResearch: applyResearch && research ? research : undefined,
        fields: keys.map((k) => ({
          key: k,
          examples: (fieldCfg[k]?.examples ?? defaultExample(k)) || undefined,
          rules: fieldCfg[k]?.rules,
        })),
      },
      setJob,
    );
    jobRef.current = r as RunningJob<unknown>;
    try {
      await r.promise;
      toast(t("delivery.generated"), "ok");
      onSaved();
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setJob(null);
    }
  }

  async function applyGateNow(next: boolean) {
    setConfirmGate(null);
    setApplyAdvice(next);
    await api.patchDraft(draft.id, { imageState: { ...((draft.imageState as any) ?? {}), useAdvice: next } });
    onSaved();
  }

  async function runResearch(mode: "manus" | "ai" | "local" = "manus") {
    setBusy("research");
    const r = categoryResearchJob(
      { draftId: draft.id, question: researchQ, model, targetLanguage: targetLang, mode, agentProfile: researchManusProfile },
      setJob,
    );
    jobRef.current = r as RunningJob<unknown>;
    try {
      const out = await r.promise;
      setResearch(out.research);
      onSaved();
      toast(t("delivery.researchDone"), "ok");
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setJob(null);
    }
  }
  async function toggleResearch(next: boolean) {
    setApplyResearch(next);
    await api.patchDraft(draft.id, { imageState: { ...((draft.imageState as any) ?? {}), useCategoryResearch: next } });
    onSaved();
  }

  async function runNameVariants(mode: "ai" | "free") {
    setBusy("variants");
    const r = nameVariantsJob({ draftId: draft.id, channel, targetLanguage: targetLang, model, mode }, setJob);
    jobRef.current = r as RunningJob<unknown>;
    try {
      await r.promise;
      onSaved();
      toast(t("delivery.variantsDone"), "ok");
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setJob(null);
    }
  }
  async function saveVariants(variants: ProductVariant[]) {
    if (!draft.product) return;
    await api.patchDraft(draft.id, { product: { ...draft.product, variants }, label: t("delivery.variantsLabel") });
    onSaved();
  }
  /** Fill Category (bundled Shopify taxonomy) + Origin (CN) + HS code (keycap/keyboard
   *  defaults) + Weight (declared or type estimate) from the product. */
  function fillShipping() {
    if (!draft.product) return;
    setCategory(categoryFor(productType, draft.product));
    setOriginCountry("CN");
    const hs = defaultHsCode(productType, draft.product);
    if (hs) {
      setHsCode(hs);
      setHsNote(lang === "tr" ? `varsayılan (${/keycap|键帽/i.test(productType || draft.product.title) ? "keycap set" : "klavye"})` : "default");
    }
    const g = estimateWeightKg(draft.product, productType);
    setWeightNote(lang === "tr" ? g.tr : g.en);
    if (g.kg != null) setWeightKg(String(g.kg));
  }
  async function researchHs() {
    if (!draft.product) return;
    setHsBusy(true);
    setHsNote("");
    try {
      const r = await api.researchHsCode(draft.id, productType, model);
      if (r.code) {
        setHsCode(r.code);
        setHsNote(`${r.heading}${r.rationale ? " — " + r.rationale : ""}`.slice(0, 200));
      } else {
        toast(t("delivery.shipHsFail"), "err");
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setHsBusy(false);
    }
  }
  const variantCap = channel === "etsy" ? 20 : 40;

  async function archive(format: string, payload: unknown) {
    try {
      await api.saveArchive({
        id: `${draft.id}-${format}-${Date.now()}`,
        draftId: draft.id,
        channel,
        title: draft.title || draft.numIid,
        format,
        payload,
      });
      onSaved();
    } catch {
      /* archive is best-effort */
    }
  }

  const base = slugify(draft.title || draft.numIid);
  const dl = (name: string, text: string, mime: string) => downloadBlob(new Blob([text], { type: mime }), name);

  function doExport(kind: string) {
    if (!draft.product || !draft.listing) return toast(t("delivery.needProduct"), "err");
    const desc = draft.listing.fields.find((f) => f.key === "description")?.value ?? "";
    if (kind === "shopify-csv") {
      // one file only — the CSV. No companion .txt notes.
      const csvText = shopifyCsv(draft.product, draft.listing);
      dl(`${base}-shopify.csv`, csvText, "text/csv");
      archive("shopify-csv", { csv: csvText });
    } else if (kind === "woo-csv") {
      const csvText = wooCsv(draft.product, draft.listing);
      dl(`${base}-woo.csv`, csvText, "text/csv");
      archive("woo-csv", { csv: csvText });
    } else if (kind === "json") {
      const j = listingJson(draft.product, draft.listing);
      dl(`${base}.json`, j, "application/json");
      archive("json", { json: j });
    } else if (kind === "etsy-zip") {
      etsyZip(draft.product, draft.listing);
      archive("etsy-zip", { note: "zip re-download from studio" });
    } else if (kind === "desc-html") {
      dl(`${base}-description.html`, descHtmlFile(), "text/html");
    } else if (kind === "desc-txt") {
      dl(`${base}-description.txt`, plainText(desc), "text/plain");
    } else if (kind === "desc-all") {
      dl(`${base}-description.txt`, plainText(desc), "text/plain");
      dl(`${base}-description.html`, descHtmlFile(), "text/html");
    }
  }

  /** Standalone .html: Shopify = full rendered body (layout + images + lang pin);
   *  Etsy renders no HTML, so ship the plain text in a <pre>. */
  function descHtmlFile(): string {
    const desc = draft.listing!.fields.find((f) => f.key === "description")?.value ?? "";
    const body =
      channel === "shopify"
        ? shopifyBodyHtml(draft.product!, draft.listing!)
        : `<pre style="white-space:pre-wrap;font:14px/1.6 sans-serif">${plainText(desc)}</pre>`;
    const title = (draft.listing!.fields.find((f) => f.key === "title")?.value || draft.title || "").replace(/</g, "&lt;");
    return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
  }

  async function push() {
    setBusy("push");
    try {
      const r = await api.pushShopify(draft.id);
      toast(t("delivery.pushShopify") + " ✓", "ok");
      window.open(r.adminUrl, "_blank");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  async function pushEtsy() {
    setBusy("push-etsy");
    try {
      // self-healing pairing: the pair endpoint just re-reads the companion app's
      // contract and stores its current key, so doing it every time keeps a
      // regenerated key from breaking the button. If the app is down it throws
      // here and we let the push below report the real reason.
      try {
        await api.pairEtsyApp();
        qc.invalidateQueries({ queryKey: ["settings"] });
      } catch {
        /* fall through */
      }
      const r = await api.pushEtsyApp(draft.id);
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast(r.message || t("delivery.pushEtsyAppDone"), "ok");
      if (r.openUrl) window.open(r.openUrl, "_blank");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 560px)", alignItems: "start" }}
    >
      <div className="card">
        <div className="card-h">
          <h3>{t("delivery.title")}</h3>
        </div>
        <div className="card-b col" style={{ gap: 14 }}>
          <div className="row">
            <button className={"chip" + (channel === "shopify" ? " active" : "")} onClick={() => setChannel("shopify")}>
              Shopify
            </button>
            <button className={"chip" + (channel === "etsy" ? " active" : "")} onClick={() => setChannel("etsy")}>
              Etsy
            </button>
          </div>
          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              {t("delivery.productType")}
              <div className="row" style={{ gap: 6 }}>
                <input
                  type="text"
                  list="pt-presets"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  placeholder={t("delivery.productTypePh")}
                  style={{ flex: 1 }}
                />
                <datalist id="pt-presets">
                  {productTypeOpts.map((pt) => (
                    <option key={pt} value={pt} />
                  ))}
                </datalist>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={saveProductType}
                  disabled={!canSavePt || savingPt}
                  title={t("delivery.productTypeSaveHint")}
                >
                  {savingPt ? <span className="spin" /> : `★ ${t("delivery.productTypeSave")}`}
                </button>
              </div>
            </label>
            <label className="field" style={{ width: 110 }}>
              {t("delivery.targetLang")}
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                <option value="en">EN</option>
                <option value="tr">TR</option>
                <option value="de">DE</option>
                <option value="fr">FR</option>
              </select>
            </label>
          </div>
          {productTypeOpts.length > 0 && (
            <div className="chips" style={{ marginTop: -4 }}>
              {productTypeOpts.map((pt) => {
                const isDefault = DEFAULT_PRODUCT_TYPES.includes(pt);
                return (
                  <span
                    key={pt}
                    className={"chip" + (ptNorm === pt ? " active" : "")}
                    role="button"
                    tabIndex={0}
                    onClick={() => setProductType(pt)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setProductType(pt)}
                    style={{ cursor: "pointer" }}
                  >
                    {pt}
                    {!isDefault && (
                      <button
                        type="button"
                        className="chip-x"
                        title={t("delivery.productTypeRemove")}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeProductType(pt);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
          <label className="field">
            {t("delivery.model")}
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.label}
                </option>
              ))}
            </select>
          </label>

          {/* Step-2 advice gate (mirrors the AdvicePanel checkbox) */}
          <div className="card" style={{ boxShadow: "none" }}>
            <div className="card-h">
              <h3 style={{ fontSize: 12 }}>{t("advice.title")}</h3>
            </div>
            <div className="card-b col">
              {adviceText ? (
                <>
                  <details>
                    <summary className="tiny muted" style={{ cursor: "pointer" }}>{t("delivery.adviceShow")}</summary>
                    <div className="advice-box" style={{ marginTop: 6 }}>{adviceText}</div>
                  </details>
                  <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      style={{ width: 16, marginTop: 2 }}
                      checked={applyAdvice}
                      onChange={(e) => setConfirmGate(e.target.checked)}
                    />
                    <span className="tiny">
                      <b>{t("delivery.applyAdvice")}</b>
                      <br />
                      {t("delivery.applyAdviceHint")}
                    </span>
                  </label>
                </>
              ) : (
                <p className="tiny muted" style={{ margin: 0 }}>{t("delivery.adviceNone")}</p>
              )}
            </div>
          </div>

          {/* Category research */}
          <div className="card" style={{ boxShadow: "none" }}>
            <div className="card-h" style={{ gap: 6, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 12 }}>{t("delivery.research")}</h3>
              <div className="grow" style={{ flex: 1 }} />
              {busy === "research" ? (
                <span className="spin" />
              ) : (
                <>
                  <button className="btn ghost sm" onClick={() => runResearch("manus")} disabled={!!busy}>
                    {research ? t("delivery.researchRegen") : t("delivery.researchManus")}
                  </button>
                  <button className="btn ghost sm" onClick={() => runResearch("ai")} disabled={!!busy}>
                    {t("delivery.researchAi")}
                  </button>
                  <button className="btn ghost sm" onClick={() => runResearch("local")} disabled={!!busy}>
                    {t("delivery.researchLocal")}
                  </button>
                </>
              )}
            </div>
            <div className="card-b col">
              <div className="row">
                <label className="field" style={{ flex: 1 }}>
                  {t("delivery.researchClaudeModel")}
                  <select value={model} onChange={(e) => setModel(e.target.value)}>
                    {CLAUDE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id} — {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ flex: 1 }}>
                  {t("delivery.researchManusVer")}
                  <select value={researchManusProfile} onChange={(e) => setResearchManusProfile(e.target.value as any)}>
                    <option value="manus-1.6-lite">manus-1.6-lite</option>
                    <option value="manus-1.6">manus-1.6</option>
                    <option value="manus-1.6-max">manus-1.6-max</option>
                  </select>
                </label>
              </div>
              <input
                type="text"
                value={researchQ}
                onChange={(e) => setResearchQ(e.target.value)}
                placeholder={t("delivery.researchQPh")}
              />
              {research ? (
                <>
                  <details>
                    <summary className="tiny muted" style={{ cursor: "pointer" }}>{t("delivery.researchShow")}</summary>
                    <div className="advice-box" style={{ marginTop: 6 }}>{research}</div>
                  </details>
                  <label className="row tiny" style={{ gap: 8 }}>
                    <input type="checkbox" style={{ width: 16 }} checked={applyResearch} onChange={(e) => toggleResearch(e.target.checked)} />
                    {t("delivery.applyResearch")}
                  </label>
                </>
              ) : (
                <p className="tiny muted" style={{ margin: 0 }}>{t("delivery.researchHint")}</p>
              )}
            </div>
          </div>

          {/* Keycap layout (ISO / ANSI) — L-shaped big Enter ⇒ always ISO */}
          {kb?.isKeycapSet && kb.layout !== "unknown" && (
            <div className={"note" + (kb.layout === "mixed" ? " warn" : "")} style={{ fontSize: 12 }}>
              {kb.layout === "mixed" ? (
                <>
                  <b>{t("delivery.kbMixed")}</b>{" "}
                  {kb.perVariant.map((p) => `${p.name}: ${p.layout}`).join(" · ")}
                </>
              ) : (
                <>
                  <b>{t("delivery.kbLayout", { layout: kb.layout })}</b>{" "}
                  {kb.layout === "ISO" ? t("delivery.kbIso") : t("delivery.kbAnsi")}
                </>
              )}
            </div>
          )}

          {/* Shipping & customs — Type, Category, Origin, HS code, Weight (+ per-variant).
              Shopify-only: it's built around the Shopify taxonomy + Shopify CSV columns. */}
          {channel === "shopify" && (
          <div className="card" style={{ boxShadow: "none" }}>
            <div className="card-h">
              <h3 style={{ fontSize: 12 }}>{t("delivery.ship")}</h3>
              <span className="sub">{t("delivery.shipSub")}</span>
              <div className="grow" style={{ flex: 1 }} />
              <button className="btn sm" onClick={fillShipping} disabled={!draft.product}>
                {t("delivery.shipFill")}
              </button>
            </div>
            <div className="card-b col" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label className="field" style={{ flex: "0 1 150px" }}>
                  {t("delivery.shipType")}
                  <input value={shopType} readOnly disabled placeholder={t("delivery.shipTypePh")} />
                </label>
                <label className="field" style={{ flex: "1 1 260px" }}>
                  {t("delivery.shipCategory")}
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder={t("delivery.shipCategoryPh")}
                    list="dl-shopcat"
                  />
                  <datalist id="dl-shopcat">
                    {(() => {
                      const all = taxonomyQ.data?.paths ?? SHOPIFY_CATEGORY_PATHS;
                      const q = category.trim().toLowerCase();
                      const words = q.split(/\s+/).filter(Boolean);
                      const list = q
                        ? all.filter((p) => words.every((w) => p.toLowerCase().includes(w))).slice(0, 200)
                        : (taxonomyQ.data?.paths
                            ? SHOPIFY_CATEGORY_PATHS // sensible starter set until they type
                            : all
                          ).slice(0, 200);
                      return list.map((p) => <option key={p} value={p} />);
                    })()}
                  </datalist>
                  {taxonomyQ.data && (
                    <span className="tiny muted">{t("delivery.taxonomyCount", { n: taxonomyQ.data.count.toLocaleString() })}</span>
                  )}
                </label>
                <label className="field" style={{ flex: "0 1 160px" }}>
                  {t("delivery.shipOrigin")}
                  <select value={originCountry} onChange={(e) => setOriginCountry(e.target.value)}>
                    <option value="">—</option>
                    {ORIGINS.map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} · {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label className="field" style={{ flex: "0 1 140px" }}>
                  {t("delivery.shipHs")}
                  <input
                    value={hsCode}
                    onChange={(e) => {
                      setHsCode(e.target.value.replace(/[^\d.]/g, "").slice(0, 10));
                      setHsNote("");
                    }}
                    placeholder="8471.60"
                    inputMode="numeric"
                  />
                </label>
                <button className="btn ghost sm" onClick={researchHs} disabled={hsBusy || !draft.product}>
                  {hsBusy ? <span className="spin" /> : t("delivery.shipHsAi")}
                </button>
                <div className="grow" style={{ flex: 1 }} />
                <label className="field" style={{ flex: "0 1 120px" }}>
                  {t("delivery.shipWeight")}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="0.60"
                  />
                </label>
              </div>
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn ghost sm" onClick={() => setAttrOpen(true)} disabled={!draft.product}>
                  🏷 {t("delivery.attrOpen")}
                </button>
                <span className="tiny muted">
                  {(() => {
                    const n = Object.values(attrPicks).filter((p) => p?.valueGids?.length).length;
                    return n
                      ? t("delivery.attrCount", { n })
                      : t("delivery.attrNone");
                  })()}
                </span>
              </div>
              {Object.values(attrPicks).some((p) => p?.valueNames?.length) && (
                <p className="tiny muted" style={{ margin: 0 }}>
                  {Object.values(attrPicks)
                    .filter((p) => p?.valueNames?.length)
                    .map((p) => `${p.attrName}: ${p.valueNames.join(" / ")}`)
                    .join(" · ")}
                </p>
              )}
              {hsNote && <p className="tiny muted" style={{ margin: 0 }}>🧾 {hsNote}</p>}
              {weightNote && <p className="tiny muted" style={{ margin: 0 }}>⚖ {weightNote}</p>}
              <p className="tiny muted" style={{ margin: 0 }}>{t("delivery.shipHint")}</p>
              {!!draft.product && draft.product.variants.length > 0 && (
                <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    style={{ width: 13 }}
                    checked={perVariantCustoms}
                    onChange={(e) => setPerVariantCustoms(e.target.checked)}
                  />
                  {t("delivery.shipPerVariant")}
                </label>
              )}
            </div>
          </div>
          )}

          {/* Variants — remove / add / rename, per-variant image + price + compare-at */}
          {!!draft.product && (
            <VariantEditor
              variants={draft.product.variants}
              images={draft.product.images}
              basePrice={draft.product.priceOriginal}
              cap={variantCap}
              channel={channel}
              busy={!!busy}
              naming={busy === "variants"}
              customs={perVariantCustoms}
              productWeightKg={weightKg}
              onNameAll={runNameVariants}
              onChange={saveVariants}
            />
          )}

          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              {t("delivery.style")}
              <select value={descStyle} onChange={(e) => setDescStyle(e.target.value)}>
                {DESC_STYLES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {lang === "tr" ? s.tr : s.en}
                  </option>
                ))}
              </select>
            </label>
            {channel === "shopify" && (
              <label className="field" style={{ width: 250 }}>
                {t("delivery.htmlBudget")}
                <span className="seg" style={{ marginTop: 2 }}>
                  {HTML_BUDGETS.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      className={"seg-b" + (htmlBudget === b.key ? " on" : "")}
                      onClick={() => setHtmlBudget(b.key)}
                    >
                      {lang === "tr" ? b.tr : b.en}
                    </button>
                  ))}
                </span>
                <span className="tiny muted" style={{ marginTop: 3 }}>{t("delivery.htmlBudgetHint")}</span>
              </label>
            )}
          </div>

          {channel === "shopify" && (
            <label className="field" style={{ width: 260 }}>
              <span className="row" style={{ gap: 6, alignItems: "center", justifyContent: "space-between" }}>
                {t("delivery.htmlBand")}
                <span className="seg tiny">
                  <button
                    type="button"
                    className={"seg-b" + (htmlUnit === "line" ? " on" : "")}
                    onClick={() => {
                      setHtmlUnit("line");
                      if (!HTML_LENGTH_BANDS.includes(htmlBand)) setHtmlBand("400-500");
                    }}
                  >
                    {t("delivery.unitLine")}
                  </button>
                  <button
                    type="button"
                    className={"seg-b" + (htmlUnit === "char" ? " on" : "")}
                    onClick={() => {
                      setHtmlUnit("char");
                      if (!HTML_CHAR_BANDS.includes(htmlBand)) setHtmlBand("30000-38000");
                    }}
                  >
                    {t("delivery.unitChar")}
                  </button>
                </span>
              </span>
              <select value={htmlBand} onChange={(e) => setHtmlBand(e.target.value)}>
                {(htmlUnit === "char" ? HTML_CHAR_BANDS : HTML_LENGTH_BANDS).map((b) => (
                  <option key={b} value={b}>
                    {b.replace("-", " – ")} {htmlUnit === "char" ? t("delivery.unitCharShort") : t("delivery.unitLineShort")}
                  </option>
                ))}
              </select>
              <span className="tiny muted" style={{ marginTop: 3 }}>{t("delivery.htmlBandHint")}</span>
            </label>
          )}

          {channel === "shopify" && (
            <label className="field">
              {t("delivery.descModel")}
              <select value={descModel} onChange={(e) => setDescModel(e.target.value)}>
                <option value="">{t("delivery.descModelSame")}</option>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="tiny muted" style={{ marginTop: 3 }}>{t("delivery.descModelHint")}</span>
            </label>
          )}

          {channel === "etsy" && (
            <label className="field">
              {t("delivery.brand")}
              <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={t("delivery.brandPh")} />
            </label>
          )}

          {channel === "shopify" ? (
            <div className="metafield">{t("delivery.shopifyRule")}</div>
          ) : (
            <div className="metafield">{t("delivery.etsyRule")}</div>
          )}
          <label className="field">
            {t("delivery.globalRules")}
            <textarea
              value={globalRules}
              onChange={(e) => setGlobalRules(e.target.value)}
              placeholder={t("delivery.globalRulesPh")}
            />
          </label>
          <label className="field">
            {t("delivery.productNote")}
            <textarea
              value={productNote}
              onChange={(e) => setProductNote(e.target.value)}
              placeholder={t("delivery.productNotePh")}
              rows={4}
            />
            <p className="tiny muted" style={{ margin: "4px 0 0" }}>{t("delivery.productNoteHint")}</p>
          </label>
          {channel === "shopify" && (
            <div className="field">
              {t("delivery.descLayout")}
              {/* primary choice: stacked-image self-contained vs. text-driven */}
              <div className="seg" style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  className={"seg-b" + (isSelfContainedLayout(layout) ? " on" : "")}
                  onClick={() => setLayout("stacked-plain")}
                >
                  🖼 {t("delivery.modeStacked")}
                </button>
                <button
                  type="button"
                  className={"seg-b" + (!isSelfContainedLayout(layout) ? " on" : "")}
                  onClick={() => setLayout(isSelfContainedLayout(layout) ? "themed-header" : layout)}
                >
                  🎨 {t("delivery.modeOther")}
                </button>
              </div>
              {isSelfContainedLayout(layout) ? (
                <p className="tiny muted" style={{ margin: 0 }}>{t("delivery.modeStackedHint")}</p>
              ) : (
                <>
                  <p className="tiny muted" style={{ margin: "0 0 4px" }}>{t("delivery.modeOtherHint")}</p>
                  <div className="layout-grid">
                    {DESC_LAYOUTS.filter((L) => L.id !== "stacked-plain").map((L) => (
                      <button
                        key={L.id}
                        className={"layout-chip" + (layout === L.id ? " active" : "")}
                        onClick={() => setLayout(L.id)}
                        onMouseEnter={() => {
                          if (hoverT.current) clearTimeout(hoverT.current);
                          hoverT.current = setTimeout(() => setHoverLayout(L.id), 1000);
                        }}
                        onMouseLeave={() => {
                          if (hoverT.current) clearTimeout(hoverT.current);
                          setHoverLayout(null);
                        }}
                      >
                        <span className="wire" dangerouslySetInnerHTML={{ __html: L.wire }} />
                        <span className="lbl">{lang === "tr" ? L.tr : L.en}</span>
                      </button>
                    ))}
                  </div>
                  <p className="tiny muted" style={{ margin: "4px 0 0" }}>{t("delivery.layoutHoverHint")}</p>
                </>
              )}
            </div>
          )}

          {keys.map((k) => (
            <div key={k} className="card" style={{ boxShadow: "none" }}>
              <div className="card-h" style={{ gap: 6, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 12 }}>{t(("delivery.field." + k) as any)}</h3>
                <div className="grow" style={{ flex: 1 }} />
                <label className="btn ghost sm" style={{ cursor: "pointer" }}>
                  {t("delivery.uploadExample")}
                  <input
                    type="file"
                    accept=".html,.htm,.txt,.md,.markdown,text/html,text/plain"
                    hidden
                    multiple
                    onChange={async (e) => {
                      const files = [...(e.target.files ?? [])];
                      if (!files.length) return;
                      const texts = await Promise.all(files.map((f) => f.text()));
                      // description examples are kept in FULL; other fields stay bounded
                      const perFile = k === "description" ? 400000 : 12000;
                      const total = k === "description" ? 800000 : 16000;
                      const joined = texts.join("\n\n---\n\n").slice(0, perFile);
                      setFieldCfg((c) => ({
                        ...c,
                        [k]: {
                          examples: [c[k]?.examples, joined].filter(Boolean).join("\n\n---\n\n").slice(0, total),
                          rules: c[k]?.rules || "",
                        },
                      }));
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="card-b col">
                <label className="field">
                  {t("delivery.examples")}
                  <textarea
                    value={fieldCfg[k]?.examples ?? defaultExample(k)}
                    onChange={(e) => setFieldCfg((c) => ({ ...c, [k]: { ...c[k], examples: e.target.value, rules: c[k]?.rules || "" } }))}
                    placeholder={t("delivery.examplesPh")}
                  />
                </label>
                <label className="field">
                  {t("delivery.rules")}
                  <input
                    type="text"
                    value={fieldCfg[k]?.rules || ""}
                    onChange={(e) => setFieldCfg((c) => ({ ...c, [k]: { ...c[k], rules: e.target.value, examples: c[k]?.examples || "" } }))}
                    placeholder={t("delivery.rulesPh")}
                  />
                </label>
                {defaultExample(k) && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() =>
                      setFieldCfg((c) => ({ ...c, [k]: { ...c[k], examples: defaultExample(k), rules: c[k]?.rules || "" } }))
                    }
                  >
                    ↺ {t("delivery.exampleDefault")}
                  </button>
                )}
              </div>
            </div>
          ))}

          <p className="tiny muted" style={{ margin: 0 }}>{t("delivery.knobs")}</p>
          <div className="row">
            <button className="btn primary" onClick={() => generate("ai")} disabled={!!busy} style={{ flex: 1 }}>
              {busy === "gen" ? <span className="spin" /> : draft.listing ? t("delivery.regen") : t("delivery.generate")}
            </button>
            <button className="btn" onClick={() => generate("local")} disabled={!!busy} title={t("delivery.generateLocalHint")}>
              {busy === "gen-local" ? <span className="spin" /> : t("delivery.generateLocal")}
            </button>
          </div>
          {job && <JobProgress job={job} onCancel={() => jobRef.current?.cancel()} />}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t("delivery.preview")}</h3>
          {draft.listing && <span className="sub">{draft.listing.model}</span>}
        </div>
        <div className="card-b col" style={{ gap: 14 }}>
          {draft.product?.videoUrl && (
            <div className="delivery-video col" style={{ gap: 6 }}>
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <b className="tiny">🎬 {t("delivery.videoTitle")}</b>
                {!!(draft.product as any).videoOps?.length && (
                  <span className="tag ops" style={{ position: "static" }}>
                    {((draft.product as any).videoOps as string[]).join("+")}
                  </span>
                )}
              </div>
              <video src={draft.product.videoUrl} controls playsInline preload="metadata" />
              {draft.product.videoAlt && (
                <p className="tiny muted" style={{ margin: 0 }}>
                  {t("delivery.videoAltLabel")}: {draft.product.videoAlt}
                </p>
              )}
              {(() => {
                const vd = (draft.product as any).videoDelivery as
                  | { trimStart?: number; trimEnd?: number; mute?: boolean }
                  | undefined;
                const bits: string[] = [];
                if (vd?.mute) bits.push(t("delivery.videoMuted"));
                if (vd?.trimStart || vd?.trimEnd)
                  bits.push(t("delivery.videoTrim", { a: vd.trimStart || 0, b: vd.trimEnd || "∞" }));
                return bits.length ? (
                  <p className="tiny muted" style={{ margin: 0 }}>{bits.join(" · ")}</p>
                ) : null;
              })()}
              <p className="tiny muted" style={{ margin: 0 }}>{t("delivery.videoNote")}</p>
            </div>
          )}
          {hoverLayout && (
            <div className="card" style={{ boxShadow: "none", borderColor: "var(--brand)" }}>
              <div className="card-h">
                <h3 style={{ fontSize: 12 }}>
                  {t("delivery.layoutPreview")} · {lang === "tr"
                    ? DESC_LAYOUTS.find((L) => L.id === hoverLayout)?.tr
                    : DESC_LAYOUTS.find((L) => L.id === hoverLayout)?.en}
                </h3>
              </div>
              <div
                className="preview-html"
                dangerouslySetInnerHTML={{
                  __html: renderDescriptionHtml(
                    hoverLayout,
                    draft.listing?.fields.find((f) => f.key === "description")?.value ||
                      "<p style='color:#888'>" + t("delivery.layoutPreviewSample") + "</p>",
                    descBodyImages(draft.product?.images ?? [], 8).map((i) => ({ url: proxied(i.url), alt: i.alt, crop: i.descCrop })),
                    {
                      name:
                        draft.listing?.fields.find((f) => f.key === "title")?.value ||
                        draft.product?.titleTranslated ||
                        draft.product?.title,
                      props: draft.product?.props,
                    },
                  ),
                }}
              />
            </div>
          )}
          <SourceCompare draft={draft} />

          {draft.listing ? (
            <>
              <ListingPreview draft={draft} />

              <ListingEditor
                key={JSON.stringify(draft.listing.fields.map((f) => f.key))}
                listing={draft.listing}
                product={draft.product}
                channel={channel}
                htmlBand={htmlBand}
                htmlUnit={htmlUnit}
                onSave={async (fields) => {
                  await api.patchDraft(draft.id, { listing: { ...draft.listing!, fields } });
                  toast(t("delivery.saved"), "ok");
                  onSaved();
                }}
                onCropChange={(url, crop) => {
                  cropSave.current[url] = crop ?? null;
                  if (cropTimer.current) clearTimeout(cropTimer.current);
                  cropTimer.current = window.setTimeout(async () => {
                    const pending = { ...cropSave.current };
                    cropSave.current = {};
                    try {
                      const fresh = await api.draft(draft.id);
                      if (!fresh.product) return;
                      await api.patchDraft(draft.id, {
                        product: {
                          ...fresh.product,
                          images: fresh.product.images.map((im) =>
                            im.url in pending ? { ...im, descCrop: pending[im.url] ?? undefined } : im,
                          ),
                        },
                      });
                      onSaved();
                    } catch {
                      /* best effort */
                    }
                  }, 500);
                }}
              />

              <div className="between">
                <b className="tiny">{t("delivery.export")}</b>
              </div>
              {(() => {
                const all = [
                  ...(draft.product?.images ?? []).filter((i) => i.role === "gallery" || i.role === "variant"),
                  ...descBodyImages(draft.product?.images ?? [], 20),
                ];
                const isLocal = (u?: string) => !!u && /^\/api\/media\//.test(u);
                // edited images whose export falls back to a DIFFERENT url (the pre-edit original)
                const fellBack = all.filter((im) => isLocal(im.url) && publicImageUrl(im) && publicImageUrl(im) !== im.url).length;
                const dropped = all.filter((im) => !publicImageUrl(im)).length;
                if (!fellBack && !dropped) return null;
                return (
                  <p className="tiny" style={{ margin: 0, color: "var(--warn, #9a6700)" }}>
                    ⚠️ {fellBack ? t("delivery.localImgFallback", { n: fellBack }) : ""}
                    {fellBack && dropped ? " " : ""}
                    {dropped ? t("delivery.localImgDropped", { n: dropped }) : ""}
                  </p>
                );
              })()}
              <div className="row">
                <button className="btn sm" onClick={() => doExport("shopify-csv")}>
                  {t("delivery.exportShopifyCsv")}
                </button>
                <button className="btn sm" onClick={() => doExport("woo-csv")}>
                  {t("delivery.exportWooCsv")}
                </button>
                <button className="btn sm" onClick={() => doExport("etsy-zip")}>
                  {t("delivery.exportEtsyZip")}
                </button>
                <button className="btn sm" onClick={() => doExport("json")}>
                  {t("delivery.exportJson")}
                </button>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => doExport("desc-txt")}>
                  {t("delivery.dlTxt")}
                </button>
                <button className="btn sm" onClick={() => doExport("desc-html")}>
                  {t("delivery.dlHtml")}
                </button>
                <button className="btn sm" onClick={() => doExport("desc-all")}>
                  {t("delivery.dlAll")}
                </button>
              </div>
              {channel === "shopify" && hasShopify && (
                <button className="btn" onClick={push} disabled={!!busy}>
                  {busy === "push" ? <span className="spin" /> : t("delivery.pushShopify")}
                </button>
              )}
              {channel === "etsy" && (
                <button className="btn" onClick={pushEtsy} disabled={!!busy}>
                  {busy === "push-etsy" ? <span className="spin" /> : t("delivery.pushEtsyApp")}
                </button>
              )}
            </>
          ) : (
            <div className="empty">{t("delivery.previewEmpty")}</div>
          )}
        </div>
      </div>

      {confirmGate !== null && (
        <div className="modal-scrim" onClick={() => setConfirmGate(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmGate ? t("advice.confirmOnTitle") : t("advice.confirmOffTitle")}</h3>
            <p className="sub">{confirmGate ? t("advice.confirmOnBody") : t("advice.confirmOffBody")}</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setConfirmGate(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn primary" onClick={() => applyGateNow(confirmGate)}>
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {attrOpen && (
        <AttributesModal
          draftId={draft.id}
          category={category}
          value={attrPicks}
          onClose={() => setAttrOpen(false)}
          onApply={(picks) => {
            setAttrPicks(picks);
            setAttrOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ----------------------- Shopify taxonomy attributes ---------------------- */

function AttributesModal({
  draftId,
  category,
  value,
  onClose,
  onApply,
}: {
  draftId: string;
  category: string;
  value: Record<string, ProductAttrPick>;
  onClose: () => void;
  onApply: (picks: Record<string, ProductAttrPick>) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [picks, setPicks] = useState<Record<string, ProductAttrPick>>(value);
  const [aiBusy, setAiBusy] = useState(false);
  const q = useQuery({
    queryKey: ["taxAttrs", draftId, category],
    queryFn: () => api.taxonomyAttributes({ draftId, category: category || undefined }),
    staleTime: 5 * 60 * 1000,
  });
  const attrs: TaxonomyAttribute[] = q.data?.attributes ?? [];

  const toggle = (a: TaxonomyAttribute, vGid: string, vName: string) => {
    setPicks((cur) => {
      const prev = cur[a.handle];
      const has = prev?.valueGids.includes(vGid);
      let gids = has ? (prev?.valueGids ?? []).filter((g) => g !== vGid) : [...(prev?.valueGids ?? []), vGid];
      let names = gids.map((g) => a.values.find((v) => v.gid === g)?.name || vName);
      const next = { ...cur };
      if (!gids.length) delete next[a.handle];
      else next[a.handle] = { attrGid: a.gid, attrName: a.name, valueGids: gids, valueNames: names };
      return next;
    });
  };

  const applySuggested = (src: Record<string, ProductAttrPick>) => {
    setPicks((cur) => {
      const next = { ...cur };
      for (const [h, p] of Object.entries(src)) if (p?.valueGids?.length) next[h] = p;
      return next;
    });
  };

  const runAi = async () => {
    setAiBusy(true);
    try {
      const r = await api.suggestAttributes(draftId, category || undefined);
      if (Object.keys(r.picks).length) {
        applySuggested(r.picks);
        toast(t("delivery.attrAiOk", { n: Object.keys(r.picks).length }), "ok");
      } else {
        toast(t("delivery.attrAiNone"), "info");
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620, width: "92vw" }}>
        <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
          <h3 style={{ flex: 1 }}>{t("delivery.attrTitle")}</h3>
          <span className="tiny muted">{q.data?.categoryPath || category || "—"}</span>
        </div>
        <p className="sub" style={{ marginTop: 2 }}>{t("delivery.attrHint")}</p>

        <div className="row" style={{ gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
          <button className="btn sm" onClick={runAi} disabled={aiBusy || !attrs.length}>
            {aiBusy ? <span className="spin" /> : "✨ " + t("delivery.attrAi")}
          </button>
          <button
            className="btn ghost sm"
            onClick={() => applySuggested(q.data?.suggested ?? {})}
            disabled={!q.data || !Object.keys(q.data.suggested).length}
          >
            📊 {t("delivery.attrData")}
          </button>
          <button className="btn ghost sm" onClick={() => setPicks({})} disabled={!Object.keys(picks).length}>
            ✕ {t("delivery.attrClear")}
          </button>
        </div>

        {q.isLoading && <p className="tiny muted">…</p>}
        {!q.isLoading && !attrs.length && <p className="tiny muted">{t("delivery.attrEmpty")}</p>}

        <div style={{ maxHeight: "52vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {attrs.map((a) => {
            const sel = picks[a.handle]?.valueGids ?? [];
            const sugg = q.data?.suggested?.[a.handle]?.valueGids ?? [];
            return (
              <div key={a.handle} className="field" style={{ gap: 4 }}>
                <div className="tiny" style={{ fontWeight: 600 }}>
                  {a.name}
                  {sel.length > 0 && <span className="muted"> · {sel.length}</span>}
                </div>
                <div className="chips" style={{ gap: 4 }}>
                  {a.values.map((v) => {
                    const on = sel.includes(v.gid);
                    const isSugg = sugg.includes(v.gid);
                    return (
                      <span
                        key={v.gid}
                        className={"chip" + (on ? " active" : "")}
                        style={{ cursor: "pointer", opacity: on || isSugg ? 1 : 0.75 }}
                        title={isSugg ? t("delivery.attrSuggested") : undefined}
                        onClick={() => toggle(a, v.gid, v.name)}
                      >
                        {isSugg && !on ? "· " : ""}
                        {v.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn primary" onClick={() => onApply(picks)}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- variant editor --------------------------- */

const CJK_RE = /[㐀-鿿豈-﫿＀-￯]/g;
const noCn = (s: string) => s.replace(CJK_RE, "").replace(/\s{2,}/g, " ").trim();

/**
 * Side-by-side of the ORIGINAL Taobao product (from the API response) and OUR
 * generated listing, so the operator can verify we didn't drift on the facts.
 * Auto-flags a keycap-PROFILE contradiction (source says one profile, our copy
 * says a different one — e.g. source "OEM" but description "Cherry").
 */
function SourceCompare({ draft }: { draft: Draft }) {
  const { t, lang } = useI18n();
  const p = draft.product;
  if (!p) return null;
  const l = draft.listing;

  const field = (k: string) => l?.fields.find((f) => f.key === k)?.value ?? "";
  const genTitle = field("title");
  const genDescPlain = plainText(field("description"));
  const genTags = field("tags");
  const genBlob = `${genTitle}\n${genDescPlain}\n${genTags}`.toLowerCase();

  const srcProfiles = detectProfiles(p); // reads ZH title + props + ZH description
  const kb = detectKeyboardLayout(p);
  const zhDesc = (p.descHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const specs = cleanSpecs(p.props, 10);

  const inGen = (s: string) => new RegExp(`\\b${s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(genBlob);
  const keptProfiles = srcProfiles.filter(inGen);
  const cherryInGen = /\bcherry\b/.test(genBlob);
  const sourceIsCherry = srcProfiles.some((x) => x.toLowerCase() === "cherry");
  const profileMismatch =
    !!l &&
    srcProfiles.length > 0 &&
    ((keptProfiles.length === 0 && /\bprofile\b/.test(genBlob)) || (cherryInGen && !sourceIsCherry));

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="tiny" style={{ display: "flex", gap: 6 }}>
      <span className="muted" style={{ minWidth: 80, flex: "none" }}>{k}</span>
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{v || "—"}</span>
    </div>
  );
  const Side = ({ head, children }: { head: string; children: React.ReactNode }) => (
    <div className="col" style={{ gap: 6, flex: "1 1 260px", minWidth: 0 }}>
      <b className="tiny" style={{ textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-soft)" }}>{head}</b>
      {children}
    </div>
  );

  return (
    <div className="card" style={{ boxShadow: "none", borderStyle: "dashed" }}>
      <div className="card-h">
        <h3 style={{ fontSize: 12 }}>{t("delivery.cmpTitle")}</h3>
        <span className="sub">{t("delivery.cmpHint")}</span>
      </div>
      <div className="card-b col" style={{ gap: 10 }}>
        {profileMismatch && (
          <div className="tiny" style={{ background: "var(--danger-bg, #fdecea)", color: "var(--danger, #b3261e)", padding: "6px 8px", borderRadius: 6, fontWeight: 600 }}>
            ⚠️ {t("delivery.cmpProfileWarn", { src: profilePhrase(srcProfiles) || srcProfiles.join(", "), gen: keptProfiles.join(", ") || (cherryInGen ? "Cherry" : "—") })}
          </div>
        )}
        <div className="row" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Side head={t("delivery.cmpSource")}>
            <Row k={t("delivery.cmpZhTitle")} v={<span lang="zh">{p.title}</span>} />
            <Row k={t("delivery.cmpMtTitle")} v={p.titleTranslated} />
            <Row k={t("delivery.cmpProfile")} v={profilePhrase(srcProfiles) || srcProfiles.join(", ")} />
            {kb.isKeycapSet && kb.layout !== "unknown" && <Row k={t("delivery.cmpLayout")} v={kb.layout} />}
            {specs.slice(0, 8).map((s) => (
              <Row key={s.label} k={s.label} v={s.value} />
            ))}
            {zhDesc && (
              <details style={{ marginTop: 2 }}>
                <summary className="tiny muted" style={{ cursor: "pointer" }}>{t("delivery.cmpZhDesc")}</summary>
                <p className="tiny" lang="zh" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0", maxHeight: 160, overflow: "auto" }}>{zhDesc.slice(0, 1200)}</p>
              </details>
            )}
          </Side>
          <Side head={t("delivery.cmpOurs")}>
            {l ? (
              <>
                <Row k={t("delivery.cmpGenTitle")} v={genTitle} />
                <Row k={t("delivery.cmpProfile")} v={keptProfiles.join(" & ") || (cherryInGen ? "Cherry" : "—")} />
                <Row k={t("delivery.cmpTags")} v={`${genTags.split(/[,\n]/).filter((s) => s.trim()).length}`} />
                <details style={{ marginTop: 2 }}>
                  <summary className="tiny muted" style={{ cursor: "pointer" }}>{t("delivery.cmpGenDesc")}</summary>
                  <p className="tiny" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0", maxHeight: 160, overflow: "auto" }}>{genDescPlain.slice(0, 1200)}</p>
                </details>
              </>
            ) : (
              <p className="tiny muted" style={{ margin: 0 }}>{t("delivery.cmpNoListing")}</p>
            )}
          </Side>
        </div>
      </div>
    </div>
  );
}

/** Fill any blank variant image from the gallery/variant images, by position. */
function withAutoImages(variants: ProductVariant[], images: { url: string; role?: string }[]): ProductVariant[] {
  const pics = images.filter((im) => im.role === "gallery" || im.role === "variant").map((im) => im.url);
  if (!pics.length) return variants;
  return variants.map((v, i) => (v.imageUrl ? v : { ...v, imageUrl: pics[i % pics.length] }));
}

function VariantEditor({
  variants,
  images,
  basePrice,
  cap,
  channel,
  busy,
  naming,
  customs,
  productWeightKg,
  onNameAll,
  onChange,
}: {
  variants: ProductVariant[];
  images: { url: string; role?: string; alt?: string }[];
  basePrice: number | null;
  cap: number;
  channel: ChannelId;
  busy: boolean;
  naming: boolean;
  /** show per-variant weight / HS code / origin inputs */
  customs?: boolean;
  /** product-level weight (kg, as string) shown as the placeholder for per-variant weight */
  productWeightKg?: string;
  onNameAll: (mode: "ai" | "free") => void;
  onChange: (variants: ProductVariant[]) => void;
}) {
  const { t } = useI18n();
  const pics = useMemo(
    () => images.filter((im) => im.role === "gallery" || im.role === "variant"),
    [images],
  );
  // local working copy so typing is smooth; committed on blur / structural change
  const [rows, setRows] = useState<ProductVariant[]>(() => withAutoImages(variants, images));
  const sig = useMemo(() => JSON.stringify(variants), [variants]);
  useEffect(() => {
    setRows(withAutoImages(variants, images));
    setSel(new Set());
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picking, setPicking] = useState<number | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const lastPick = useRef<number | null>(null);

  const commit = (next: ProductVariant[]) => {
    setRows(next);
    onChange(next);
  };
  const toggleSel = (i: number, shift: boolean) => {
    setSel((s) => {
      const n = new Set(s);
      if (shift && lastPick.current != null) {
        const [a, b] = [lastPick.current, i].sort((x, y) => x - y);
        const on = !n.has(i);
        for (let k = a; k <= b; k++) on ? n.add(k) : n.delete(k);
      } else {
        n.has(i) ? n.delete(i) : n.add(i);
      }
      return n;
    });
    lastPick.current = i;
  };
  const deleteSelected = () => {
    if (!sel.size) return;
    commit(rows.filter((_, j) => !sel.has(j)));
    setSel(new Set());
    lastPick.current = null;
  };
  const deleteAll = () => {
    commit([]);
    setSel(new Set());
    setConfirmClear(false);
    lastPick.current = null;
  };
  const patch = (i: number, p: Partial<ProductVariant>) => {
    const next = rows.map((v, j) => (j === i ? { ...v, ...p } : v));
    setRows(next);
    return next;
  };
  const num = (s: string): number | null => {
    const n = parseFloat(s.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  };
  const addVariant = () =>
    commit([
      ...rows,
      {
        name: `Variant ${rows.length + 1}`,
        nameTranslated: "",
        price: basePrice ?? null,
        compareAtPrice: null,
        imageUrl: pics[rows.length % Math.max(1, pics.length)]?.url,
        manual: true,
      },
    ]);
  const removeVariant = (i: number) => commit(rows.filter((_, j) => j !== i));

  return (
    <div className="card" style={{ boxShadow: "none" }}>
      <div className="card-h" style={{ gap: 6, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 12 }}>
          {t("delivery.variants")} <span className="tiny muted">· {rows.length}</span>
          {sel.size > 0 && <span className="tiny" style={{ color: "var(--brand)" }}> · {t("delivery.variantSelN", { n: sel.size })}</span>}
        </h3>
        <div className="grow" style={{ flex: 1 }} />
        {!!rows.length && (
          <>
            <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                style={{ width: 13 }}
                checked={sel.size === rows.length && rows.length > 0}
                ref={(el) => el && (el.indeterminate = sel.size > 0 && sel.size < rows.length)}
                onChange={(e) => setSel(e.target.checked ? new Set(rows.map((_, j) => j)) : new Set())}
              />
              {t("delivery.variantSelAll")}
            </label>
            <button
              className="btn ghost sm"
              style={{ color: "var(--danger)" }}
              disabled={!sel.size || busy}
              onClick={deleteSelected}
            >
              {t("delivery.variantDelSel", { n: sel.size })}
            </button>
            <button className="btn ghost sm" style={{ color: "var(--danger)" }} disabled={busy} onClick={() => setConfirmClear(true)}>
              {t("delivery.variantDelAll")}
            </button>
            <button className="btn ghost sm" onClick={() => onNameAll("free")} disabled={busy}>
              {naming ? <span className="spin" /> : t("delivery.variantsFree", { n: cap })}
            </button>
            <button className="btn ghost sm" onClick={() => onNameAll("ai")} disabled={busy}>
              {t("delivery.variantsAi", { n: cap })}
            </button>
          </>
        )}
      </div>
      {confirmClear && (
        <div className="modal-scrim" onClick={() => setConfirmClear(false)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("delivery.variantDelAllTitle", { n: rows.length })}</h3>
            <p className="sub">{t("delivery.variantDelAllBody")}</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setConfirmClear(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn danger" onClick={deleteAll}>
                {t("delivery.variantDelAll")}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="card-b col" style={{ gap: 10 }}>
        {rows.map((v, i) => {
          const nameVal = v.nameTranslated ?? "";
          const over = nameVal.length > cap;
          return (
            <div key={i} className={"variant-row" + (sel.has(i) ? " sel" : "")}>
              <input
                type="checkbox"
                className="variant-check"
                title={t("delivery.variantSelRow")}
                checked={sel.has(i)}
                onClick={(e) => toggleSel(i, (e as React.MouseEvent).shiftKey)}
                onChange={() => {}}
              />
              <button
                type="button"
                className="variant-thumb"
                title={t("delivery.variantPickImg")}
                onClick={() => setPicking(picking === i ? null : i)}
              >
                {v.imageUrl ? (
                  <img src={proxied(v.imageUrl)} alt="" />
                ) : (
                  <span className="tiny muted">+img</span>
                )}
              </button>

              <div className="variant-fields">
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <input
                    value={nameVal}
                    placeholder={noCn(v.name) || t("delivery.variantNamePh")}
                    maxLength={cap + 20}
                    onChange={(e) => patch(i, { nameTranslated: e.target.value })}
                    onBlur={(e) => {
                      const clean = noCn(e.target.value).slice(0, cap);
                      if (clean !== (v.nameTranslated ?? "")) commit(patch(i, { nameTranslated: clean }));
                    }}
                    style={{ flex: 1 }}
                  />
                  <span className={"tiny mono" + (over ? " err-t" : " muted")}>
                    {nameVal.length}/{cap}
                  </span>
                  <button
                    type="button"
                    className="btn ghost sm variant-del"
                    title={t("delivery.variantRemove")}
                    onClick={() => removeVariant(i)}
                  >
                    ✕
                  </button>
                </div>
                <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {v.name && v.name !== nameVal && (
                    <span
                      className="tiny muted"
                      style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={v.name}
                    >
                      {noCn(v.name) || "—"}
                    </span>
                  )}
                  <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {t("delivery.variantPrice")}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={v.price ?? ""}
                      onChange={(e) => patch(i, { price: e.target.value === "" ? null : num(e.target.value) })}
                      onBlur={() => commit(rows)}
                      style={{ width: 84 }}
                    />
                  </label>
                  <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {t("delivery.variantCompareAt")}
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={v.compareAtPrice ?? ""}
                      onChange={(e) =>
                        patch(i, { compareAtPrice: e.target.value === "" ? null : num(e.target.value) })
                      }
                      onBlur={() => commit(rows)}
                      style={{ width: 84 }}
                    />
                  </label>
                </div>
                {customs && (
                  <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {t("delivery.shipWeight")}
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={v.weightKg ?? ""}
                        placeholder={productWeightKg || "0.60"}
                        onChange={(e) => patch(i, { weightKg: e.target.value === "" ? null : num(e.target.value) })}
                        onBlur={() => commit(rows)}
                        style={{ width: 78 }}
                      />
                    </label>
                    <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {t("delivery.shipHs")}
                      <input
                        value={v.hsCode ?? ""}
                        placeholder="8471.60"
                        inputMode="numeric"
                        onChange={(e) => patch(i, { hsCode: e.target.value.replace(/[^\d.]/g, "").slice(0, 10) })}
                        onBlur={() => commit(rows)}
                        style={{ width: 92 }}
                      />
                    </label>
                    <label className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {t("delivery.shipOrigin")}
                      <select
                        value={v.countryOfOrigin ?? ""}
                        onChange={(e) => {
                          patch(i, { countryOfOrigin: e.target.value || undefined });
                          commit(rows.map((r, j) => (j === i ? { ...r, countryOfOrigin: e.target.value || undefined } : r)));
                        }}
                        style={{ width: 96 }}
                      >
                        <option value="">—</option>
                        {ORIGINS.map(([code]) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>

              {picking === i && (
                <div className="variant-picker">
                  {pics.length === 0 && <span className="tiny muted">{t("delivery.variantNoImgs")}</span>}
                  {pics.map((im) => (
                    <button
                      type="button"
                      key={im.url}
                      className={"variant-pick" + (im.url === v.imageUrl ? " on" : "")}
                      onClick={() => {
                        commit(patch(i, { imageUrl: im.url }));
                        setPicking(null);
                      }}
                    >
                      <img src={proxied(im.url)} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <button className="btn ghost sm" onClick={addVariant} style={{ alignSelf: "flex-start" }}>
          + {t("delivery.variantAdd")}
        </button>
        <p className="tiny muted" style={{ margin: 0 }}>
          {channel === "shopify" ? t("delivery.variantHintShopify") : t("delivery.variantHintEtsy")}
        </p>
      </div>
    </div>
  );
}

/* --------------------------- post-generation editor --------------------------- */

function ListingEditor({
  listing,
  product,
  channel,
  htmlBand,
  htmlUnit,
  onSave,
  onCropChange,
}: {
  listing: GeneratedListing;
  product: Draft["product"];
  channel: ChannelId;
  /** explicit length target for "Diğer HTML düzenler" ("" = auto-sized, no pinned target) */
  htmlBand?: string;
  htmlUnit?: "line" | "char";
  onSave: (fields: GeneratedField[]) => Promise<void>;
  onCropChange?: (url: string, crop: import("@shared/types.ts").DescImageCrop | undefined) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [showHtml, setShowHtml] = useState(false);
  const seed = useMemo(() => Object.fromEntries(listing.fields.map((f) => [f.key, f.value])), [listing]);
  const [v, setV] = useState<Record<string, string>>(seed);
  const [saving, setSaving] = useState(false);
  useEffect(() => setV(seed), [seed]);
  // live crop overrides (keyed by image working url) so the preview updates instantly;
  // also lifted via onCropChange to persist onto the draft.
  const [cropOv, setCropOv] = useState<Record<string, import("@shared/types.ts").DescImageCrop | null>>({});
  useEffect(() => setCropOv({}), [product?.numIid]);

  const isEtsy = channel === "etsy";

  const cropProduct = useMemo(() => {
    if (!product || !Object.keys(cropOv).length) return product;
    return {
      ...product,
      images: product.images.map((im) => (im.url in cropOv ? { ...im, descCrop: cropOv[im.url] ?? undefined } : im)),
    };
  }, [product, cropOv]);

  const descImages = useMemo(
    () => (cropProduct?.images ?? []).filter((i) => i.role === "description"),
    [cropProduct],
  );

  // the EXACT HTML that goes to the Shopify CSV / API push — reflects the live
  // edits in this form (title + description + tags). `shopifyHtml` is the raw body
  // (copy / code view); `shopifyHtmlView` is the same with <img src> proxied, and
  // is IDENTICAL to what the storefront preview above renders (importBodyHtmlPreview).
  const [shopifyHtml, shopifyHtmlView] = useMemo<[string, string]>(() => {
    if (isEtsy || !cropProduct) return ["", ""];
    const merged: GeneratedListing = { ...listing, fields: listing.fields.map((f) => ({ ...f, value: v[f.key] ?? f.value })) };
    try {
      return [importBodyHtml(cropProduct, merged), importBodyHtmlPreview(cropProduct, merged)];
    } catch {
      return ["", ""];
    }
  }, [isEtsy, cropProduct, listing, v]);
  const copyHtml = () => {
    navigator.clipboard?.writeText(shopifyHtml);
    toast(t("delivery.htmlCopied"), "ok");
  };

  const pool = (v.tags_pool ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chosen = new Set(
    (v.tags ?? "")
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const tagCount = (v.tags ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean).length;
  const toggleTag = (tag: string) => {
    const cur = (v.tags ?? "")
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const has = cur.some((x) => x.toLowerCase() === tag.toLowerCase());
    // Etsy caps at 13 live tags; Shopify has no cap.
    let next = has
      ? cur.filter((x) => x.toLowerCase() !== tag.toLowerCase())
      : isEtsy
        ? [...cur, tag].slice(0, 13)
        : [...cur, tag];
    if (isEtsy) {
      next = [...next].sort((a, b) => a.localeCompare(b)); // chosen tags alphabetical
      // pool = chosen (alpha) first, then the rest (alpha)
      const chosenSet = new Set(next.map((x) => x.toLowerCase()));
      const rest = (v.tags_pool ?? "")
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((x) => !chosenSet.has(x.toLowerCase()))
        .sort((a, b) => a.localeCompare(b));
      setV((s) => ({ ...s, tags: next.join(", "), tags_pool: [...next, ...rest].join(", ") }));
      return;
    }
    setV((s) => ({ ...s, tags: next.join(", ") }));
  };

  // description "length" is counted in LINES (block tags → newlines), matching the target band
  const descLines = (v.description ?? "")
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|section|figure|table|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  async function save() {
    setSaving(true);
    try {
      const next = listing.fields.map((f) => ({ ...f, value: v[f.key] ?? f.value }));
      // keep the alt title even if the generator didn't emit it as a field
      if (isEtsy && v.title_alt != null && !next.some((f) => f.key === "title_alt")) {
        next.push({ key: "title_alt" as GeneratedField["key"], value: v.title_alt });
      }
      if (channel === "shopify") {
        const tv = v.title ?? "";
        for (const f of next) if (f.key === "seo_title" || f.key === "seo_description") f.value = tv;
      }
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ boxShadow: "none" }}>
      <div className="card-h" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ fontSize: 12, flex: 1 }}>{t("delivery.edit")}</h3>
        {!isEtsy && shopifyHtml && (
          <button className="btn ghost sm" onClick={copyHtml} title={t("delivery.htmlCopyTip")}>
            ⧉ {t("delivery.htmlCopy")}
          </button>
        )}
      </div>
      <div className="card-b col">
        <p className="tiny muted" style={{ margin: 0 }}>{t("delivery.editHint")}</p>

        <label className="field">
          {t("delivery.field.title")} <span className="tiny muted">· {(v.title ?? "").length}</span>
          <input value={v.title ?? ""} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} />
        </label>

        {isEtsy && (
          <label className="field">
            {t("delivery.field.title_alt")}{" "}
            <span className="tiny muted">
              · {(v.title_alt ?? "").length} · {(v.title_alt ?? "").split(/\s+/).filter(Boolean).length} {t("delivery.words")}
            </span>
            <input value={v.title_alt ?? ""} onChange={(e) => setV((s) => ({ ...s, title_alt: e.target.value }))} />
          </label>
        )}

        <label className="field">
          {t("delivery.field.description")}{" "}
          {channel === "shopify" && (
            <span className="tiny muted">
              {!htmlBand
                ? `· ${descLines} ${t("delivery.unitLineShort")} · ${(v.description ?? "").length.toLocaleString()} ${t("delivery.unitCharShort")}`
                : htmlUnit === "char"
                  ? `· ${t("delivery.htmlTargetChar", { band: htmlBand.replace("-", "–"), n: (v.description ?? "").length.toLocaleString() })}`
                  : `· ${t("delivery.htmlTarget", { band: htmlBand.replace("-", "–"), n: descLines })}`}
            </span>
          )}
          <textarea
            style={{ minHeight: 180, fontFamily: isEtsy ? "inherit" : "var(--mono)" }}
            value={v.description ?? ""}
            onChange={(e) => setV((s) => ({ ...s, description: e.target.value }))}
          />
        </label>

        {!isEtsy && shopifyHtml && (
          <div className="field">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="tiny muted">
                {t("delivery.htmlFinal")} · {shopifyHtml.length} · {(shopifyHtml.match(/<img /g) || []).length} görsel
              </span>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn ghost sm" onClick={() => setShowHtml((x) => !x)}>
                  {showHtml ? t("delivery.htmlShowView") : t("delivery.htmlShowCode")}
                </button>
                <button className="btn ghost sm" onClick={copyHtml}>⧉ {t("delivery.htmlCopy")}</button>
              </div>
            </div>
            {showHtml ? (
              <textarea
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                style={{ minHeight: 220, fontFamily: "var(--mono)", fontSize: 11, background: "var(--panel-2, #f6f6f8)" }}
                value={shopifyHtml}
              />
            ) : (
              <div
                style={{
                  border: "1px solid var(--line, #e2e2e8)",
                  borderRadius: 8,
                  padding: 12,
                  maxHeight: 460,
                  overflow: "auto",
                  background: "#fff",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <DescCropLayer
                  html={shopifyHtmlView}
                  images={descImages}
                  onChange={(url, crop) => {
                    setCropOv((o) => ({ ...o, [url]: crop ?? null }));
                    onCropChange?.(url, crop);
                  }}
                />
              </div>
            )}
            <p className="tiny muted" style={{ margin: 0 }}>{t("delivery.htmlFinalHint")} · {t("desccrop.hint")}</p>
          </div>
        )}

        <label className="field">
          {t("delivery.field.tags")}{" "}
          <span className={"tiny " + (!isEtsy && tagCount < 40 ? "err-t" : "muted")}>
            · {isEtsy ? `${tagCount}/13` : t("delivery.tagsShopifyCount", { n: tagCount })}
          </span>
          <input value={v.tags ?? ""} onChange={(e) => setV((s) => ({ ...s, tags: e.target.value }))} />
        </label>

        {isEtsy && pool.length > 0 && (
          <div>
            <div className="tiny muted" style={{ marginBottom: 4 }}>
              {t("delivery.field.tags_pool")} — {t("delivery.poolHint")}
            </div>
            <div className="chips">
              {pool.map((tg) => (
                <button
                  key={tg}
                  className={"chip" + (chosen.has(tg.toLowerCase()) ? " active" : "")}
                  onClick={() => toggleTag(tg)}
                >
                  {tg}
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="btn primary sm" onClick={save} disabled={saving}>
          {saving ? <span className="spin" /> : t("delivery.saveEdits")}
        </button>
      </div>
    </div>
  );
}
