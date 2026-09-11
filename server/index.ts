import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env, ROOT, mask } from "./env.ts";
import { db, getSetting, setSetting, now } from "./db.ts";
import { callOnebound, OneboundError, oneboundCreds } from "./onebound.ts";
import { normaliseItem } from "./normalize.ts";
import {
  ask,
  extractJson,
  generateListing,
  generateAdvice,
  researchCategory,
  researchHsCode,
  nameVariantsForChannel,
  translateVariants,
  generateAltTexts,
  logManusUsage,
  manusUsdPerCredit,
  activeModel,
  activeAnthropicKey,
  activeEffort,
  activeThinking,
  activeFast,
  claudeConfigured,
  verifyClaude,
  EFFORT_LEVELS,
  FAST_MODELS,
  LlmError,
  suggestAttributes,
} from "./llm.ts";
import {
  pushToShopify,
  shopifyConfigured,
  ShopifyError,
  verifyShopify,
  activeShopifyDomain,
  activeShopifyToken,
  activeShopifyClientId,
  shopifyOAuthStart,
  shopifyOAuthCallback,
} from "./shopify.ts";
import {
  pushToEtsyApp,
  pairEtsyApp,
  etsyAppStatus,
  etsyAppConfigured,
  etsyAppBaseUrl,
  EtsyAppError,
} from "./etsyApp.ts";
import {
  TAXONOMY,
  TAXONOMY_PATHS,
  TAXONOMY_ATTR_COUNT,
  findTaxonomy,
  resolveCategory,
  attributesForCategory,
  resolveAttributes,
} from "./taxonomy.ts";
import { freeTranslate } from "./translate.ts";
import { localAdvice, localCategoryResearch, localListing } from "./localContent.ts";
import { allExamples } from "./examples.ts";
import { applyKeycapGlossary, detectKeyboardLayout, layoutNote } from "@shared/keycaps.ts";
import { stripCJK } from "@shared/listingFormat.ts";
import {
  manusConfigured,
  manusCredits,
  manusBalance,
  manusUsageList,
  activeManusKey,
  manusFileAuthHeaders,
  translateImage,
  editImageManus,
  editVideoManus,
  videoAltManus,
  composeImagesManus,
  researchBrandManus,
  altTextManus,
  researchCategoryManus,
  verifyManus,
  ManusError,
} from "./manus.ts";
import { startJob, getJob, listJobs, cancelJob, Cancelled } from "./jobs.ts";
import {
  listBlogs,
  getBlog,
  ensureProductBlog,
  createCategoryBlog,
  patchBlog,
  deleteBlog,
  DEFAULT_BLOG_CONFIG,
} from "./blogStore.ts";
import { generateBlog, researchBlogSeo, productStyleHint } from "./blog.ts";
import { renderBlogHtml } from "@shared/blogPresets.ts";
import type { BlogConfig, BlogRecord } from "@shared/types.ts";
import { persistFromUrl, persistFileFromUrl, persistDataUrl, mediaPath, normaliseShortestEdge } from "./imagestore.ts";
import { existsSync as fsExists } from "node:fs";
import {
  getDraft,
  patchDraft,
  deleteDraft,
  upsertProductDraft,
  setDraftApiResponse,
  listDrafts,
  listRevisions,
  restoreRevision,
  withDraftLock,
} from "./drafts.ts";
import { ONEBOUND_ENDPOINTS, type ApiCallInput, type ProductImage, type Settings } from "@shared/types.ts";
import { claudePricing, DEFAULT_PRODUCT_TYPES } from "@shared/models.ts";

const app = express();
app.use(express.json({ limit: "64mb" }));

/* ----------------------------- auth (optional) ---------------------------- */

const COOKIE = "tps_session";
function sign(v: string) {
  return createHmac("sha256", env.sessionSecret).update(v).digest("hex");
}
function issue(res: express.Response) {
  const payload = `ok.${Date.now()}`;
  res.setHeader("Set-Cookie", `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
}
function authed(req: express.Request): boolean {
  if (!env.appPassword) return true;
  const raw = (req.headers.cookie || "").split(/; */).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const val = raw.slice(COOKIE.length + 1);
  const idx = val.lastIndexOf(".");
  if (idx === -1) return false;
  const body = val.slice(0, idx);
  const mac = val.slice(idx + 1);
  try {
    return timingSafeEqual(Buffer.from(sign(body)), Buffer.from(mac));
  } catch {
    return false;
  }
}

app.post("/api/login", (req, res) => {
  if (!env.appPassword) return res.json({ authed: true });
  if (String(req.body?.password || "") === env.appPassword) {
    issue(res);
    return res.json({ authed: true });
  }
  res.status(401).json({ error: "Parola hatalı." });
});
app.post("/api/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  res.json({ ok: true });
});
app.get("/api/me", (req, res) => {
  res.json({ needsAuth: Boolean(env.appPassword), authed: authed(req) });
});

// The live Cloudflare quick-tunnel URL, if `tools/start-tunnel.ps1` has one
// running — it writes the current address to `tools/tunnel-url.txt` each time
// it (re)starts. The UI polls this so the address shown in-app always matches
// reality, including after a restart hands out a brand new *.trycloudflare.com
// address (those are never stable across runs).
app.get("/api/tunnel-url", (_req, res) => {
  try {
    const p = join(ROOT, "tools", "tunnel-url.txt");
    const url = existsSync(p) ? readFileSync(p, "utf8").trim() : "";
    res.json({ url: url || null });
  } catch {
    res.json({ url: null });
  }
});

// Gate everything else under /api.
app.use("/api", (req, res, next) => {
  if (
    req.path === "/login" ||
    req.path === "/logout" ||
    req.path === "/me" ||
    req.path === "/image-proxy" ||
    req.path.startsWith("/shopify/oauth/") // OAuth callback (HMAC-verified) — must work on Shopify's redirect
  ) {
    return next();
  }
  if (!authed(req)) return res.status(401).json({ error: "Oturum açın." });
  next();
});

const wrap =
  (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) => {
    fn(req, res).catch((e) => {
      const status =
        e instanceof OneboundError ||
        e instanceof LlmError ||
        e instanceof ShopifyError ||
        e instanceof ManusError ||
        e instanceof EtsyAppError
          ? e.status
          : 500;
      if (status >= 500) console.error(e);
      res.status(status).json({ error: e?.message || "Sunucu hatası" });
    });
  };

/* ------------------------------- settings -------------------------------- */

async function currentSettings(): Promise<Settings> {
  const creds = oneboundCreds();
  const anthropicFromDb = Boolean(getSetting("anthropic_key"));
  const manusFromDb = Boolean(getSetting("manus_key"));
  return {
    oneboundKeyHint: mask(creds.key),
    oneboundSecretHint: mask(creds.secret),
    oneboundBase: creds.base,
    llmModel: getSetting("llm_model") ?? env.llmModel,
    hasLlmKey: claudeConfigured(),
    llmKeyHint: mask(activeAnthropicKey()),
    llmKeySource: anthropicFromDb ? "ui" : env.anthropicKey ? "env" : "none",
    hasManusKey: manusConfigured(),
    manusKeyHint: mask(activeManusKey()),
    manusKeySource: manusFromDb ? "ui" : env.manusKey ? "env" : "none",
    llmEffort: activeEffort(),
    llmThinking: activeThinking(),
    llmFast: activeFast(),
    llmEffortLevels: [...EFFORT_LEVELS],
    llmFastModels: [...FAST_MODELS],
    manusAgentProfile: getSetting("manus_agent_profile") ?? env.manusAgentProfile,
    manusBase: env.manusBase,
    manusUsdPerCredit: manusUsdPerCredit(),
    manusCredits: await manusCredits(),
    anthropicBalanceUsd: Number(getSetting("anthropic_balance_usd")) || 0,
    hasShopify: shopifyConfigured(),
    shopifyDomain: activeShopifyDomain(),
    shopifyTokenHint: mask(activeShopifyToken()),
    shopifySource: getSetting("shopify_token") ? "ui" : env.shopifyToken ? "env" : "none",
    shopifyClientIdHint: mask(activeShopifyClientId()),
    shopifyHasSecret: Boolean(getSetting("shopify_client_secret") || env.shopifyClientSecret),
    shopifyRedirectUri: `${env.appPublicUrl}/api/shopify/oauth/callback`,
    shopifyApiVersion: env.shopifyApiVersion,
    autoPushShopify: getSetting("auto_push_shopify") === "1",
    etsyAppUrl: etsyAppBaseUrl(),
    etsyAppConnected: etsyAppConfigured(),
    previewReferenceUrl: env.previewReferenceUrl,
    uiLang: (getSetting("ui_lang") as "tr" | "en") ?? "tr",
    brandUrl: getSetting("brand_url") ?? "",
    brandBrief: getSetting("brand_brief") ?? "",
    productTypes: readProductTypes(),
  };
}

/** Built-in product-type presets + operator-added ones, de-duped, order preserved. */
function readProductTypes(): string[] {
  let saved: string[] = [];
  try {
    const raw = JSON.parse(getSetting("product_types") ?? "[]");
    if (Array.isArray(raw)) saved = raw.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  } catch {
    /* ignore corrupt json */
  }
  const seen = new Set<string>();
  return [...DEFAULT_PRODUCT_TYPES, ...saved].filter((x) => x && !seen.has(x) && (seen.add(x), true));
}

app.get(
  "/api/settings",
  wrap(async (_req, res) => res.json(await currentSettings())),
);

app.post(
  "/api/settings",
  wrap(async (req, res) => {
    const p = req.body ?? {};
    if (typeof p.oneboundKey === "string" && p.oneboundKey.trim()) setSetting("onebound_key", p.oneboundKey.trim());
    if (typeof p.oneboundSecret === "string" && p.oneboundSecret.trim())
      setSetting("onebound_secret", p.oneboundSecret.trim());
    if (typeof p.llmModel === "string" && p.llmModel.trim()) {
      setSetting("llm_model", p.llmModel.trim());
      env.llmModel = p.llmModel.trim();
    }
    if (typeof p.manusAgentProfile === "string" && p.manusAgentProfile.trim()) {
      setSetting("manus_agent_profile", p.manusAgentProfile.trim());
      env.manusAgentProfile = p.manusAgentProfile.trim();
    }
    if (typeof p.anthropicKey === "string" && p.anthropicKey.trim()) setSetting("anthropic_key", p.anthropicKey.trim());
    if (typeof p.manusKey === "string" && p.manusKey.trim()) setSetting("manus_key", p.manusKey.trim());
    if (typeof p.llmEffort === "string" && (EFFORT_LEVELS as readonly string[]).includes(p.llmEffort))
      setSetting("llm_effort", p.llmEffort);
    if (p.llmThinking === "adaptive" || p.llmThinking === "off") setSetting("llm_thinking", p.llmThinking);
    if (typeof p.llmFast === "boolean") setSetting("llm_fast", p.llmFast ? "1" : "0");
    if (typeof p.manusUsdPerCredit === "number" && p.manusUsdPerCredit > 0 && p.manusUsdPerCredit < 100)
      setSetting("manus_usd_per_credit", String(p.manusUsdPerCredit));
    if (typeof p.anthropicBalanceUsd === "number" && p.anthropicBalanceUsd >= 0 && p.anthropicBalanceUsd < 1e7)
      setSetting("anthropic_balance_usd", String(p.anthropicBalanceUsd));
    if (typeof p.shopifyDomain === "string")
      setSetting("shopify_domain", p.shopifyDomain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").slice(0, 200));
    if (typeof p.shopifyToken === "string" && p.shopifyToken.trim()) setSetting("shopify_token", p.shopifyToken.trim());
    if (typeof p.shopifyClientId === "string" && p.shopifyClientId.trim())
      setSetting("shopify_client_id", p.shopifyClientId.trim());
    if (typeof p.shopifyClientSecret === "string" && p.shopifyClientSecret.trim())
      setSetting("shopify_client_secret", p.shopifyClientSecret.trim());
    // explicit clears
    if (p.clearAnthropicKey === true) setSetting("anthropic_key", "");
    if (p.clearManusKey === true) setSetting("manus_key", "");
    if (p.clearShopify === true) {
      setSetting("shopify_token", "");
      setSetting("shopify_domain", "");
      setSetting("shopify_client_id", "");
      setSetting("shopify_client_secret", "");
    }
    if (typeof p.autoPushShopify === "boolean") setSetting("auto_push_shopify", p.autoPushShopify ? "1" : "0");
    if (typeof p.etsyAppUrl === "string")
      setSetting("etsy_app_url", p.etsyAppUrl.trim().replace(/\/+$/, "").slice(0, 300));
    if (typeof p.etsyAppKey === "string" && p.etsyAppKey.trim()) setSetting("etsy_app_key", p.etsyAppKey.trim());
    if (p.clearEtsyApp === true) {
      setSetting("etsy_app_url", "");
      setSetting("etsy_app_key", "");
    }
    if (p.uiLang === "tr" || p.uiLang === "en") setSetting("ui_lang", p.uiLang);
    if (typeof p.brandUrl === "string") setSetting("brand_url", p.brandUrl.trim().slice(0, 300));
    if (typeof p.brandBrief === "string") setSetting("brand_brief", p.brandBrief.slice(0, 12000));
    if (Array.isArray(p.productTypes)) {
      const clean = Array.from(
        new Set(
          p.productTypes
            .map((x: unknown) => String(x).trim().toLowerCase())
            .filter((x: string) => x && x.length <= 40 && !DEFAULT_PRODUCT_TYPES.includes(x)),
        ),
      ).slice(0, 50);
      setSetting("product_types", JSON.stringify(clean));
    }
    res.json(await currentSettings());
  }),
);

// POST so the UI can test a key that was typed but not saved yet.
app.post(
  "/api/verify/claude",
  wrap(async (req, res) => res.json(await verifyClaude(String(req.body?.key || "") || undefined))),
);
app.post(
  "/api/verify/manus",
  wrap(async (req, res) => res.json(await verifyManus(String(req.body?.key || "") || undefined))),
);
app.post(
  "/api/verify/shopify",
  wrap(async (req, res) =>
    res.json(await verifyShopify(String(req.body?.domain || "") || undefined, String(req.body?.token || "") || undefined)),
  ),
);

/* --------------------------- Shopify OAuth (Dev Dashboard app) --------------------------- */

const SHOPIFY_REDIRECT_URI = `${env.appPublicUrl}/api/shopify/oauth/callback`;

/** Kick off OAuth: browser → Shopify authorize screen. */
app.get(
  "/api/shopify/oauth/start",
  wrap(async (req, res) => {
    const url = shopifyOAuthStart(String(req.query.shop || ""), SHOPIFY_REDIRECT_URI);
    res.redirect(url);
  }),
);

/** Shopify redirects the browser back here with ?code&hmac&shop&state. */
app.get(
  "/api/shopify/oauth/callback",
  wrap(async (req, res) => {
    try {
      const raw = String(req.originalUrl.split("?")[1] || "");
      const { shop } = await shopifyOAuthCallback(raw);
      res.redirect(`${env.appPublicUrl}/settings?shopify=${encodeURIComponent(shop)}`);
    } catch (e) {
      res.redirect(`${env.appPublicUrl}/settings?shopify_error=${encodeURIComponent((e as Error).message)}`);
    }
  }),
);

/* ------------------------------- onebound -------------------------------- */

app.get("/api/onebound/endpoints", (_req, res) => res.json(ONEBOUND_ENDPOINTS));

/** The COMPLETE Shopify product taxonomy (bundled) — for the Category picker. */
app.get("/api/taxonomy", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.json({ count: TAXONOMY.length, paths: TAXONOMY_PATHS, attrCount: TAXONOMY_ATTR_COUNT });
});

/** Resolve the category GID from an explicit path, the draft's saved GID, or the
 *  auto-classifier — then return that category's taxonomy attributes + a
 *  data-based (no-AI) suggestion for each. */
function resolveCategoryNode(catQuery: string, draftId: string) {
  const draft = draftId ? getDraft(draftId) : null;
  const product = draft?.product ?? null;
  let node = catQuery ? findTaxonomy(catQuery) : null;
  if (!node && product?.categoryGid) node = TAXONOMY.find((n) => n.gid === product.categoryGid) ?? null;
  if (!node && product) node = resolveCategory(product.shopType || product.category || "", product);
  return { node, draft, product };
}

app.get(
  "/api/taxonomy/attributes",
  wrap(async (req, res) => {
    const { node, product } = resolveCategoryNode(String(req.query.category || ""), String(req.query.draftId || ""));
    if (!node) return res.json({ categoryGid: "", categoryPath: "", attributes: [], suggested: {} });
    res.json({
      categoryGid: node.gid,
      categoryPath: node.path,
      attributes: attributesForCategory(node.gid),
      suggested: product ? resolveAttributes(node.gid, product) : {},
    });
  }),
);

/** AI pick of taxonomy attribute values for a draft's product. */
app.post(
  "/api/taxonomy/attributes/suggest",
  wrap(async (req, res) => {
    const { node, draft, product } = resolveCategoryNode(String(req.body?.category || ""), String(req.body?.draftId || ""));
    if (!product) return res.status(400).json({ error: "Ürün eksik." });
    if (!node) return res.json({ picks: {} });
    const attributes = attributesForCategory(node.gid);
    if (!attributes.length) return res.json({ picks: {} });
    const { picks: names } = await suggestAttributes(
      product,
      draft?.listing ?? null,
      node.path,
      attributes.map((a) => ({ handle: a.handle, name: a.name, values: a.values.map((v) => v.name) })),
      { draftId: draft?.id },
    );
    // map exact value names → { attrGid, valueGids, valueNames }
    const picks: Record<string, { attrGid: string; attrName: string; valueGids: string[]; valueNames: string[] }> = {};
    for (const a of attributes) {
      const chosen = names[a.handle];
      if (!chosen?.length) continue;
      const vals = a.values.filter((v) => chosen.some((c) => c.toLowerCase() === v.name.toLowerCase()));
      if (vals.length)
        picks[a.handle] = {
          attrGid: a.gid,
          attrName: a.name,
          valueGids: vals.map((v) => v.gid),
          valueNames: vals.map((v) => v.name),
        };
    }
    res.json({ picks });
  }),
);

app.post(
  "/api/onebound/call",
  wrap(async (req, res) => {
    const input = req.body as ApiCallInput;
    const raw = await callOnebound(input);
    const ep = ONEBOUND_ENDPOINTS.find((e) => e.id === input.endpoint);
    let product;
    let draftId: string | undefined;
    if (ep?.seedsWorkspace) {
      product = normaliseItem(raw.json, input.platform, input.query);
      if (product) {
        draftId = upsertProductDraft(product).id;
        setDraftApiResponse(draftId, raw.json);
      }
    }
    res.json({
      requestUrl: raw.requestUrl,
      status: raw.status,
      ms: raw.ms,
      json: raw.json,
      product,
      draftId,
    });
  }),
);

/* -------------------------------- drafts -------------------------------- */

app.get("/api/drafts", (_req, res) => res.json(listDrafts()));
app.get(
  "/api/drafts/:id",
  wrap(async (req, res) => {
    const d = getDraft(req.params.id);
    if (!d) return res.status(404).json({ error: "Taslak bulunamadı" });
    res.json(d);
  }),
);
app.post(
  "/api/drafts/:id",
  wrap(async (req, res) => {
    const { channel, step, imageState, product, listing, title, label } = req.body ?? {};
    const d = patchDraft(req.params.id, { channel, step, imageState, product, listing, title }, label);
    res.json(d);
  }),
);
app.delete(
  "/api/drafts/:id",
  wrap(async (req, res) => {
    if (!getDraft(req.params.id)) return res.status(404).json({ error: "Taslak bulunamadı" });
    deleteDraft(req.params.id);
    res.json({ ok: true });
  }),
);
app.get("/api/examples", (_req, res) => res.json(allExamples()));

app.get(
  "/api/drafts/:id/revisions",
  wrap(async (req, res) => res.json(listRevisions(req.params.id))),
);
app.post(
  "/api/revisions/:id/restore",
  wrap(async (req, res) => res.json(restoreRevision(Number(req.params.id)))),
);

/* ---------------------------------- jobs ------------------------------- */

app.get("/api/jobs", (_req, res) => res.json(listJobs()));
app.get(
  "/api/jobs/:id",
  wrap(async (req, res) => {
    const j = getJob(req.params.id);
    if (!j) return res.status(404).json({ error: "İş bulunamadı (bitmiş olabilir)." });
    res.json(j);
  }),
);
app.post(
  "/api/jobs/:id/cancel",
  wrap(async (req, res) => res.json({ cancelled: cancelJob(req.params.id) })),
);

/* ---------------------------------- ai --------------------------------- */

app.post(
  "/api/ai/generate-listing",
  wrap(async (req, res) => {
    const input = req.body;
    const draft = getDraft(input.draftId);
    if (!draft?.product) return res.status(400).json({ error: "Önce bir ürün çağrısı yapın." });
    const local = input.mode === "local";
    const jobId = startJob("generate-listing", async (ctx) => {
      ctx.plan(["Ürün ve niş tanınıyor", local ? "Şablonla içerik kuruluyor" : "Kod / içerik yazılıyor", "Kanal kurallarına göre biçimleniyor"]);
      ctx.step(local ? "Şablonla içerik kuruluyor" : "Kod / içerik yazılıyor");
      const listing = local ? localListing(draft.product!, input) : await generateListing(draft.product!, input, ctx.signal);
      ctx.step("Kanal kurallarına göre biçimleniyor");
      patchDraft(draft.id, { listing, channel: input.channel, step: Math.max(draft.step, 4) }, local ? "Listeleme üretildi (şablon)" : "Listeleme üretildi");
      return listing;
    });
    res.json({ jobId });
  }),
);

/** Step 2 — quick AI review of the product, GUIDANCE ONLY. */
app.post(
  "/api/ai/advice",
  wrap(async (req, res) => {
    const { draftId, channel, model, effort, thinking, targetLanguage, mode } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    const ch = channel === "etsy" ? "etsy" : "shopify";
    const jobId = startJob("advice", async (ctx) => {
      ctx.plan(["Ürün hızlı inceleniyor", "Tavsiye yazılıyor"]);
      ctx.step("Tavsiye yazılıyor");
      const r =
        mode === "local"
          ? localAdvice(draft.product!, ch, targetLanguage)
          : await generateAdvice(draft.product!, ch, {
              model,
              effort,
              thinking,
              signal: ctx.signal,
              draftId: draft.id,
              targetLanguage,
            });
      await withDraftLock(draft.id, async () => {
        const fresh = getDraft(draft.id)!;
        patchDraft(
          draft.id,
          { imageState: { ...((fresh.imageState as any) ?? {}), advice: r.advice, adviceChannel: r.channel } },
          "Tavsiye üretildi",
        );
      });
      return r;
    });
    res.json({ jobId });
  }),
);

/** On-demand deep research of the product's CATEGORY (step 4 helper). */
app.post(
  "/api/ai/category-research",
  wrap(async (req, res) => {
    const { draftId, question, model, effort, thinking, targetLanguage, mode = "manus", agentProfile } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    if (mode === "manus" && !manusConfigured())
      return res.status(400).json({ error: "MANUS_API_KEY ayarlı değil — 'AI (Claude)' veya 'Yapay zekasız' seçin." });
    const jobId = startJob("category-research", async (ctx) => {
      ctx.plan(["Kategori araştırılıyor"]);
      ctx.step("Kategori araştırılıyor");
      let r: { research: string; model: string };
      if (mode === "local") {
        r = localCategoryResearch(draft.product!, String(question || ""), targetLanguage);
      } else if (mode === "ai") {
        r = await researchCategory(draft.product!, String(question || ""), {
          model,
          effort,
          thinking,
          signal: ctx.signal,
          draftId: draft.id,
          targetLanguage,
        });
      } else {
        const mr = await researchCategoryManus({
          productTitle: draft.product!.titleTranslated || draft.product!.title,
          props: draft.product!.props,
          question: String(question || ""),
          targetLanguage: targetLanguage || "English",
          agentProfile: typeof agentProfile === "string" ? agentProfile : undefined,
          ctx,
        });
        if (mr.taskId)
          logManusUsage("category-research", mr.creditsUsed, mr.creditsEstimated, draft.id, mr.taskId, {
            text: mr.research,
          });
        r = { research: mr.research, model: agentProfile || "manus-1.6" };
      }
      await withDraftLock(draft.id, async () => {
        const fresh = getDraft(draft.id)!;
        patchDraft(
          draft.id,
          { imageState: { ...((fresh.imageState as any) ?? {}), categoryResearch: r.research } },
          "Kategori araştırması",
        );
      });
      return r;
    });
    res.json({ jobId });
  }),
);

/** Best-guess HS (Harmonized System) code for Shopify customs — Claude. */
app.post(
  "/api/ai/hs-code",
  wrap(async (req, res) => {
    const { draftId, productType, model } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    const r = await researchHsCode(draft.product, String(productType || ""), { model, draftId: draft.id });
    res.json(r);
  }),
);

/** Concise channel-ready variant names (Etsy ≤20 / Shopify ≤40 chars). `mode`
 *  "ai" = Claude · "free" = glossary + free MT (no paid AI). */
app.post(
  "/api/ai/name-variants",
  wrap(async (req, res) => {
    const { draftId, channel, targetLanguage, model, mode } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    const cap = channel === "etsy" ? 20 : 40;
    const jobId = startJob("name-variants", async (ctx) => {
      ctx.plan(["Varyant adları kısaltılıyor"]);
      ctx.step("Varyant adları kısaltılıyor");
      let variants;
      if (mode === "free") {
        const src = draft.product!.variants.map((v) => v.nameTranslated || v.name);
        const { results } = await freeTranslate(src, (targetLanguage || "en").slice(0, 2), "zh");
        variants = draft.product!.variants.map((v, i) => ({
          ...v,
          nameTranslated: stripCJK(applyKeycapGlossary(results[i] || v.name)).replace(/\s+/g, " ").trim().slice(0, cap),
        }));
      } else {
        variants = (
          await nameVariantsForChannel(draft.product!.variants, channel === "etsy" ? "etsy" : "shopify", targetLanguage || "en", {
            model,
            signal: ctx.signal,
            draftId: draft.id,
          })
        ).variants;
      }
      await withDraftLock(draft.id, async () => {
        const fresh = getDraft(draft.id)!;
        patchDraft(draft.id, { product: { ...fresh.product!, variants } }, "Varyant adları güncellendi");
      });
      return { variants };
    });
    res.json({ jobId });
  }),
);

/** Free machine translation (no paid AI). `{ texts: string[], to?, from? }`. */
app.post(
  "/api/translate/free",
  wrap(async (req, res) => {
    const texts: string[] = Array.isArray(req.body?.texts) ? req.body.texts.map(String).slice(0, 60) : [];
    if (!texts.length) return res.json({ results: [], engine: "glossary-only" });
    res.json(await freeTranslate(texts, String(req.body?.to || "en").slice(0, 2), String(req.body?.from || "zh").slice(0, 2)));
  }),
);

app.post(
  "/api/ai/translate-variants",
  wrap(async (req, res) => {
    const { draftId, targetLanguage, model } = req.body;
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    const jobId = startJob("translate-variants", async (ctx) => {
      ctx.plan(["Varyant adları çevriliyor"]);
      ctx.step("Varyant adları çevriliyor");
      const { variants } = await translateVariants(draft.product!.variants, targetLanguage || "en", {
        model,
        signal: ctx.signal,
        draftId: draft.id,
      });
      await withDraftLock(draft.id, async () => {
        const fresh = getDraft(draft.id)!;
        patchDraft(draft.id, { product: { ...fresh.product!, variants } }, "Varyantlar çevrildi");
      });
      return { variants };
    });
    res.json({ jobId });
  }),
);

app.post(
  "/api/ai/alt-texts",
  wrap(async (req, res) => {
    const { draftId, targetLanguage, model } = req.body;
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    const jobId = startJob("alt-texts", async (ctx) => {
      ctx.plan(["Görseller inceleniyor", "Alt metin yazılıyor"]);
      ctx.step("Alt metin yazılıyor");
      const { results } = await generateAltTexts(draft.product!.images, draft.product!, targetLanguage || "en", {
        model,
        signal: ctx.signal,
        draftId: draft.id,
      });
      await withDraftLock(draft.id, async () => {
        const fresh = getDraft(draft.id)!;
        const images = fresh.product!.images.map((im) => {
          const hit = results.find((r) => r.url === im.url);
          return hit ? { ...im, alt: hit.alt } : im;
        });
        patchDraft(draft.id, { product: { ...fresh.product!, images } }, "Alt metinler üretildi");
      });
      return { results };
    });
    res.json({ jobId });
  }),
);

/** Manus vision-based DETAILED batch alt texts (angle, framing, background, …). */
app.post(
  "/api/ai/alt-texts-manus",
  wrap(async (req, res) => {
    const { draftId, imageUrls, targetLanguage, instruction } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    if (!manusConfigured()) return res.status(400).json({ error: "MANUS_API_KEY ayarlı değil." });
    const urls: string[] =
      Array.isArray(imageUrls) && imageUrls.length
        ? imageUrls
        : draft.product.images.filter((im) => im.role !== "unused").map((im) => im.url);
    const target = targetLanguage || "English";
    const context = `${draft.product.titleTranslated || draft.product.title}. ${Object.entries(draft.product.props)
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ")}`;

    const jobId = startJob("alt-texts-manus", async (ctx) => {
      ctx.plan(urls.map((_, i) => `Görsel ${i + 1}/${urls.length} — alt metin`));
      const results: { url: string; alt: string }[] = [];
      let totalCredits = 0;
      for (let i = 0; i < urls.length; i++) {
        ctx.throwIfCancelled();
        ctx.step(`Görsel ${i + 1}/${urls.length} — alt metin`);
        try {
          const r = await altTextManus({
            imageUrl: urls[i],
            productContext: context,
            targetLanguage: target,
            instruction: instruction ? String(instruction) : undefined,
            ctx,
          });
          results.push({ url: r.sourceUrl, alt: r.alt });
          totalCredits += r.creditsUsed;
          // always log so the task_id is recorded — the dashboard reconciles the
          // real credit amount against Manus's usage.list by task_id.
          if (r.taskId)
            logManusUsage("alt-text-manus", r.creditsUsed, r.creditsEstimated, draft.id, r.taskId, {
              from: r.sourceUrl,
              alt: r.alt,
            });
        } catch (e) {
          if ((e as Error)?.name === "AbortError" || e instanceof Cancelled) throw e;
          results.push({ url: urls[i], alt: "" });
        }
      }
      await withDraftLock(draft.id, async () => {
        const fresh = getDraft(draft.id)!;
        const images = fresh.product!.images.map((im) => {
          const hit = results.find((r) => r.url === im.url && r.alt);
          return hit ? { ...im, alt: hit.alt } : im;
        });
        patchDraft(draft.id, { product: { ...fresh.product!, images } }, `${results.filter((r) => r.alt).length} detaylı alt metin`);
      });
      return { results, totalCredits };
    });
    res.json({ jobId });
  }),
);

/**
 * Manus image translation — selectable (imageUrls[]) or bulk. Default zh -> target.
 * Only translates Chinese OVERLAY text; product + background untouched.
 */
app.post(
  "/api/ai/translate-images",
  wrap(async (req, res) => {
    const { draftId, imageUrls, targetLanguage, instruction, imageSpec, speed, agentProfile } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    if (!manusConfigured()) return res.status(400).json({ error: "MANUS_API_KEY ayarlı değil." });
    const urls: string[] = Array.isArray(imageUrls) && imageUrls.length
      ? imageUrls
      : draft.product.images.map((im) => im.url);
    const target = targetLanguage || "English";
    const context = `${draft.product.titleTranslated || draft.product.title}. ${Object.entries(draft.product.props)
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ")}. ${layoutNote(detectKeyboardLayout(draft.product), "en")}`;

    // How many image-translation tasks run at once. `task.create` calls are
    // spaced out globally by MANUS_TASK_SPAWN_GAP_MS (see manus.ts) and mfetch
    // backs off + retries on 429, so a batch of ~10 selected images all get
    // translated even on the free tier — just a few at a time, not a true burst.
    // Raise MANUS_IMAGE_CONCURRENCY on a paid plan for real parallelism.
    const CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.MANUS_IMAGE_CONCURRENCY) || 6));
    const jobId = startJob("translate-images", async (ctx) => {
      const labels = urls.map((_, i) => `Görsel ${i + 1}/${urls.length} çevriliyor`);
      ctx.plan(labels);
      const items: any[] = new Array(urls.length);
      let done = 0;
      let replaced = 0;
      let cursor = 0;

      // Apply ONE finished translation to the draft immediately — download the
      // (48h-expiring) Manus URL, then swap it into its gallery slot in place
      // under the per-draft lock. Runs per image so the app reflects each one
      // the moment it's ready, not only when the whole batch ends.
      const applyOne = async (it: any) => {
        if (!it?.resultUrl) return;
        let persisted = it.resultUrl as string;
        try {
          persisted = await persistFromUrl(it.resultUrl, manusFileAuthHeaders());
          // operator rule: a translated image's SHORTEST side is always 800–1000 px,
          // high quality — no other size constraint.
          persisted = await normaliseShortestEdge(persisted);
        } catch {
          /* fall back to the ephemeral url */
        }
        await withDraftLock(draft.id, async () => {
          const fresh = getDraft(draft.id);
          if (!fresh?.product) return;
          let hit = false;
          const images: ProductImage[] = fresh.product.images.map((im) => {
            if (im.url !== it.sourceUrl) return im;
            hit = true;
            return {
              ...im,
              url: persisted,
              originalUrl: im.originalUrl ?? im.url,
              translatedFrom: im.url,
              ops: [...(im.ops || []).filter((o) => o !== "translate"), "translate" as const],
              taskUrl: it.taskUrl,
              remoteUrl: it.resultUrl || undefined,
            };
          });
          if (!hit) {
            images.push({
              url: persisted,
              role: "description",
              ops: ["translate"],
              translatedFrom: it.sourceUrl,
              taskUrl: it.taskUrl,
              remoteUrl: it.resultUrl || undefined,
            });
          }
          replaced++;
          patchDraft(
            draft.id,
            { product: { ...fresh.product, images } },
            `${replaced}/${urls.length} görsel çevrildi (yerinde değiştirildi)`,
          );
        });
      };

      const worker = async () => {
        for (;;) {
          const i = cursor++;
          if (i >= urls.length) return;
          ctx.throwIfCancelled();
          try {
            const r = await translateImage({
              imageUrl: urls[i],
              targetLanguage: target,
              productContext: context,
              instruction,
              imageSpec,
              speed,
              agentProfile,
              ctx,
            });
            if (r.taskId)
              logManusUsage("translate-image", r.creditsUsed, r.creditsEstimated, draft.id, r.taskId, {
                from: urls[i],
                to: r.resultUrl,
                changed: r.changed,
                model: r.model,
                taskUrl: r.taskUrl,
              });
            items[i] = r;
            if (r.changed) {
              await applyOne(r); // reflect this image in the app right now
              done++;
              console.log(`[translate-images] #${i + 1}/${urls.length} OK model=${r.model} task=${r.taskUrl || r.taskId}`);
              ctx.step(labels[done - 1]);
            } else {
              done++;
              console.warn(`[translate-images] #${i + 1}/${urls.length} NO IMAGE (no change) task=${r.taskUrl || r.taskId}`);
              ctx.skip(labels[done - 1]);
            }
          } catch (e) {
            if (e instanceof Cancelled || (e as Error)?.name === "AbortError") throw e;
            console.error(`[translate-images] #${i + 1}/${urls.length} FAILED:`, (e as Error).message);
            items[i] = {
              sourceUrl: urls[i],
              resultUrl: null,
              changed: false,
              taskUrl: "",
              creditsUsed: 0,
              creditsEstimated: true,
              error: (e as Error).message,
            };
            done++;
            ctx.skip(labels[done - 1]);
          }
          ctx.setStatus(`${done}/${urls.length} görsel çevrildi`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
      const results = items.filter(Boolean);
      const totalCredits = results.reduce((s, it) => s + (it?.creditsUsed || 0), 0);
      const errs = results.filter((it) => it?.error).map((it) => it.error as string);
      // Nothing changed AND every image errored → surface the real reason instead
      // of a silent "completed" the operator can't act on.
      if (replaced === 0 && errs.length === results.length && errs.length > 0) {
        throw new Error(`Hiçbir görsel çevrilemedi. İlk hata: ${errs[0]}`);
      }
      return { items: results, totalCredits, replaced, errors: errs };
    });

    res.json({ jobId });
  }),
);

/** Free-form (non-translate) AI image edit on the selected images via Manus. */
app.post(
  "/api/ai/edit-images",
  wrap(async (req, res) => {
    const { draftId, imageUrls, instruction, imageSpec, speed, agentProfile } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    if (!manusConfigured()) return res.status(400).json({ error: "MANUS_API_KEY ayarlı değil." });
    if (!String(instruction || "").trim()) return res.status(400).json({ error: "Komut boş." });
    const urls: string[] = Array.isArray(imageUrls) && imageUrls.length ? imageUrls : [];
    if (!urls.length) return res.status(400).json({ error: "Görsel seçin." });
    const context = `${draft.product.titleTranslated || draft.product.title}. ${layoutNote(detectKeyboardLayout(draft.product), "en")}`;

    const jobId = startJob("edit-images", async (ctx) => {
      ctx.plan(urls.map((_, i) => `Görsel ${i + 1}/${urls.length} düzenleniyor`));
      const map: { from: string; to: string; remote?: string }[] = [];
      let totalCredits = 0;
      for (let i = 0; i < urls.length; i++) {
        ctx.throwIfCancelled();
        ctx.step(`Görsel ${i + 1}/${urls.length} düzenleniyor`);
        try {
          const r = await editImageManus({
            imageUrl: urls[i],
            instruction: String(instruction),
            productContext: context,
            imageSpec,
            speed,
            agentProfile,
            ctx,
          });
          totalCredits += r.creditsUsed;
          if (r.taskId)
            logManusUsage("edit-image", r.creditsUsed, r.creditsEstimated, draft.id, r.taskId, {
              from: urls[i],
              to: r.resultUrl,
              taskUrl: r.taskUrl,
            });
          if (r.resultUrl) {
            let persisted = r.resultUrl;
            try {
              persisted = await persistFromUrl(r.resultUrl, manusFileAuthHeaders());
            } catch {
              /* keep ephemeral */
            }
            map.push({ from: urls[i], to: persisted, remote: r.resultUrl || undefined });
          }
        } catch (e) {
          if (e instanceof Cancelled || (e as Error)?.name === "AbortError") throw e;
          /* skip one */
        }
      }
      // replace the sources in place
      if (map.length) {
        await withDraftLock(draft.id, async () => {
          const fresh = getDraft(draft.id)!;
          const byFrom = new Map(map.map((m) => [m.from, m] as const));
          const images = fresh.product!.images.map((im) => {
            const m = byFrom.get(im.url);
            return m ? { ...im, url: m.to, originalUrl: im.originalUrl ?? im.url, remoteUrl: m.remote } : im;
          });
          patchDraft(draft.id, { product: { ...fresh.product!, images } }, `${map.length} görsel AI ile düzenlendi`);
        });
      }
      return { changed: map.length, totalCredits };
    });
    res.json({ jobId });
  }),
);

/**
 * AI image/ad studio — Manus generates ONE brand-new image (ad, lifestyle scene,
 * collage, studio shot, background swap) from up to 20 source images. The result
 * is persisted and returned; the client appends it to the gallery.
 */
app.post(
  "/api/ai/research-brand",
  wrap(async (req, res) => {
    const { draftId, brandUrl } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    if (!manusConfigured()) return res.status(400).json({ error: "MANUS_API_KEY ayarlı değil." });
    const url = String(brandUrl || "").trim();
    if (!/^https?:\/\/.+\..+/.test(url)) return res.status(400).json({ error: "Geçerli bir marka web sitesi adresi girin." });
    const jobId = startJob("research-brand", async (ctx) => {
      ctx.plan(["Marka sitesi araştırılıyor", "Yaratıcı brief yazılıyor"]);
      ctx.step("Marka sitesi araştırılıyor");
      const r = await researchBrandManus({
        brandUrl: url,
        productTitle: draft.product!.titleTranslated || draft.product!.title,
        ctx,
      });
      if (r.taskId)
        logManusUsage("brand-research", r.creditsUsed, r.creditsEstimated, draft.id, r.taskId, { text: r.brief });
      // brand is the operator's own — keep it GLOBAL & fixed, not per-draft
      setSetting("brand_url", url);
      setSetting("brand_brief", r.brief);
      return { brief: r.brief, taskUrl: r.taskUrl, credits: r.creditsUsed };
    });
    res.json({ jobId });
  }),
);

app.post(
  "/api/ai/compose-image",
  wrap(async (req, res) => {
    const { draftId, imageUrls, instruction, brandBrief, imageSpec, speed, agentProfile } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    if (!manusConfigured()) return res.status(400).json({ error: "MANUS_API_KEY ayarlı değil." });
    if (!String(instruction || "").trim()) return res.status(400).json({ error: "Ne oluşturulacağını yazın." });
    const urls: string[] = (Array.isArray(imageUrls) ? imageUrls : []).map(String).filter(Boolean).slice(0, 20);
    if (!urls.length) return res.status(400).json({ error: "En az bir kaynak görsel seçin." });
    const context = `${draft.product.titleTranslated || draft.product.title}. ${layoutNote(detectKeyboardLayout(draft.product), "en")}`;

    const jobId = startJob("compose-image", async (ctx) => {
      ctx.plan(["Kaynak görseller hazırlanıyor", "Yeni görsel oluşturuluyor", "Kaydediliyor"]);
      ctx.step("Yeni görsel oluşturuluyor");
      const r = await composeImagesManus({
        imageUrls: urls,
        instruction: String(instruction),
        productContext: context,
        brandBrief: brandBrief ? String(brandBrief) : undefined,
        imageSpec: imageSpec || undefined,
        speed,
        agentProfile,
        ctx,
      });
      if (r.taskId)
        logManusUsage("compose-image", r.creditsUsed, r.creditsEstimated, draft.id, r.taskId, {
          to: r.resultUrl,
          taskUrl: r.taskUrl,
        });
      if (!r.resultUrl) throw new Error("Manus yeni görsel döndürmedi.");
      ctx.step("Kaydediliyor");
      let url = r.resultUrl;
      try {
        url = await persistFromUrl(r.resultUrl, manusFileAuthHeaders());
      } catch {
        /* keep ephemeral url */
      }
      return { url, remoteUrl: r.resultUrl, taskUrl: r.taskUrl, credits: r.creditsUsed };
    });
    res.json({ jobId });
  }),
);

/* --------------------------------- video ------------------------------- */

app.post(
  "/api/ai/edit-video",
  wrap(async (req, res) => {
    const { draftId, instruction, agentProfile, logoDataUrl } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product?.videoUrl) return res.status(400).json({ error: "Üründe video yok." });
    if (!manusConfigured()) return res.status(400).json({ error: "MANUS_API_KEY ayarlı değil." });
    if (!String(instruction || "").trim()) return res.status(400).json({ error: "Komut boş." });
    const context = `${draft.product.titleTranslated || draft.product.title}. ${layoutNote(detectKeyboardLayout(draft.product), "en")}`;
    const jobId = startJob("edit-video", async (ctx) => {
      ctx.plan(["Video hazırlanıyor", "AI düzenliyor", "Kaydediliyor"]);
      ctx.step("AI düzenliyor");
      const r = await editVideoManus({
        videoUrl: draft.product!.videoUrl!,
        instruction: String(instruction),
        productContext: context,
        logoDataUrl: typeof logoDataUrl === "string" && logoDataUrl.startsWith("data:") ? logoDataUrl : undefined,
        agentProfile: typeof agentProfile === "string" ? agentProfile : undefined,
        ctx,
      });
      if (r.taskId)
        logManusUsage("edit-video", r.creditsUsed, r.creditsEstimated, draft.id, r.taskId, {
          from: draft.product!.videoUrl,
          to: r.resultUrl,
          taskUrl: r.taskUrl,
        });
      if (!r.resultUrl) throw new Error("Manus düzenlenmiş video döndürmedi.");
      ctx.step("Kaydediliyor");
      let url = r.resultUrl;
      try {
        url = await persistFromUrl(r.resultUrl, manusFileAuthHeaders());
      } catch {
        /* keep ephemeral */
      }
      await withDraftLock(draft.id, async () => {
        const fresh = getDraft(draft.id)!;
        patchDraft(
          draft.id,
          {
            product: {
              ...fresh.product!,
              videoUrl: url,
              videoUrlOriginal: fresh.product!.videoUrlOriginal ?? fresh.product!.videoUrl,
              videoOps: [...new Set([...(fresh.product!.videoOps ?? []), "edit"])] as any,
            },
          },
          "Video düzenlendi",
        );
      });
      return { url, remoteUrl: r.resultUrl, taskUrl: r.taskUrl, credits: r.creditsUsed };
    });
    res.json({ jobId });
  }),
);

app.post(
  "/api/ai/video-alt",
  wrap(async (req, res) => {
    const { draftId, targetLanguage, agentProfile, model, mode = "manus" } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product?.videoUrl) return res.status(400).json({ error: "Üründe video yok." });
    if (mode === "manus" && !manusConfigured()) return res.status(400).json({ error: "MANUS_API_KEY ayarlı değil." });
    if (mode === "claude" && !claudeConfigured()) return res.status(400).json({ error: "Claude API anahtarı ayarlı değil." });
    const p = draft.product;
    const context = `${p.titleTranslated || p.title}`;
    const lang = targetLanguage || "English";
    const jobId = startJob("video-alt", async (ctx) => {
      ctx.plan([mode === "claude" ? "Video alt metni yazılıyor (Claude)" : "Video inceleniyor"]);
      ctx.step(mode === "claude" ? "Video alt metni yazılıyor (Claude)" : "Video inceleniyor");
      if (mode === "claude") {
        const sys = [
          "Sen erişilebilirlik ve SEO odaklı bir asistansın. Bir ÜRÜN VİDEOSU için tek cümlelik,",
          `8-18 kelimelik, ${lang.toUpperCase()} dilinde bir alt metin yaz. Videoyu göremezsin; ürün`,
          "verisinden yola çık. Sadece alt metni döndür — tırnak, etiket, açıklama yok. Çince/CJK yok.",
        ].join("\n");
        const usr = [
          `ÜRÜN: ${stripCJK(context)}`,
          `ÖZELLİKLER: ${stripCJK(Object.values(p.props).slice(0, 8).join(", "))}`,
          p.videoOps?.length ? `VİDEO İŞLEMLERİ: ${p.videoOps.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        const { text } = await ask(sys, usr, "video-alt-claude", { model, maxTokens: 200, draftId: draft.id });
        const altText = stripCJK(text).replace(/^["'\s]+|["'\s]+$/g, "").split("\n")[0].slice(0, 300);
        await withDraftLock(draft.id, async () => {
          const fresh = getDraft(draft.id)!;
          patchDraft(draft.id, { product: { ...fresh.product!, videoAlt: altText } }, "Video alt metni (Claude)");
        });
        return { alt: altText, credits: 0 };
      }
      const r = await videoAltManus({
        videoUrl: p.videoUrl!,
        productContext: context,
        targetLanguage: lang,
        agentProfile: typeof agentProfile === "string" ? agentProfile : undefined,
        ctx,
      });
      if (r.taskId) logManusUsage("video-alt", r.creditsUsed, r.creditsEstimated, draft.id, r.taskId, { alt: r.alt });
      await withDraftLock(draft.id, async () => {
        const fresh = getDraft(draft.id)!;
        patchDraft(draft.id, { product: { ...fresh.product!, videoAlt: r.alt } }, "Video alt metni");
      });
      return { alt: r.alt, taskUrl: r.taskUrl, credits: r.creditsUsed };
    });
    res.json({ jobId });
  }),
);

/**
 * Claude edits the product video DIRECTLY: it turns a natural-language request
 * into a JSON plan of in-browser (no-AI) edit operations, which the client then
 * bakes onto the video. No Manus, no image model — just a real edit.
 */
const VIDEO_RATIOS = ["orig", "etsy", "shopify45", "square1600", "wide169", "story916"];
const ADJUST_KEYS = ["brightness", "contrast", "saturate", "exposure", "warmth", "tint", "sharpen", "vignette", "blur"];
const num = (v: any, lo: number, hi: number, dflt?: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : (dflt as number);
};
function sanitiseVideoPlan(j: any): { plan: Record<string, unknown>; summary: string } {
  const p: Record<string, unknown> = {};
  const has = (k: string) => j && j[k] != null;
  if (has("trimStart")) p.trimStart = num(j.trimStart, 0, 86400, 0);
  if (has("trimEnd")) p.trimEnd = num(j.trimEnd, 0, 86400, 0);
  if (has("mute")) p.mute = !!j.mute;
  if (has("speed")) p.speed = num(j.speed, 0.1, 16, 1);
  if (has("ratioId") && VIDEO_RATIOS.includes(String(j.ratioId))) p.ratioId = String(j.ratioId);
  if (has("maxEdge")) {
    const m = num(j.maxEdge, 0, 4320, 0);
    p.maxEdge = [0, 720, 1080, 1440, 1920].includes(m) ? m : 0;
  }
  if (has("rotate")) {
    const r = num(j.rotate, 0, 270, 0);
    p.rotate = [0, 90, 180, 270].includes(r) ? r : 0;
  }
  if (has("flipH")) p.flipH = !!j.flipH;
  if (has("flipV")) p.flipV = !!j.flipV;
  if (has("opacity")) p.opacity = num(j.opacity, 0, 100, 100);
  if (has("adjustPreset")) p.adjustPreset = String(j.adjustPreset).slice(0, 40);
  if (j && typeof j.adjust === "object") {
    const a: Record<string, number> = {};
    for (const k of ADJUST_KEYS) if (j.adjust[k] != null) a[k] = num(j.adjust[k], k === "blur" ? 0 : -200, k === "blur" ? 12 : 260, 100);
    if (Object.keys(a).length) p.adjust = a;
  }
  if (has("bw")) p.bw = !!j.bw;
  if (j && typeof j.chroma === "object" && j.chroma) {
    p.chroma = {
      color: /^#[0-9a-f]{6}$/i.test(String(j.chroma.color)) ? String(j.chroma.color) : "#00ff00",
      tol: num(j.chroma.tol, 0, 100, 18),
      soft: num(j.chroma.soft, 0, 100, 12),
    };
  } else if (j && j.chroma === null) p.chroma = null;
  if (/^#[0-9a-f]{6}$/i.test(String(j?.bgColor))) p.bgColor = String(j.bgColor);
  if (has("bgBlur")) p.bgBlur = num(j.bgBlur, 0, 40, 0);
  if (has("volume")) p.volume = num(j.volume, 0, 400, 100);
  if (has("fadeIn")) p.fadeIn = num(j.fadeIn, 0, 30, 0);
  if (has("fadeOut")) p.fadeOut = num(j.fadeOut, 0, 30, 0);
  if (has("vocalRemove")) p.vocalRemove = !!j.vocalRemove;
  if (has("denoise")) p.denoise = !!j.denoise;
  if (has("reverse")) p.reverse = !!j.reverse;
  if (has("pitch")) p.pitch = num(j.pitch, -12, 12, 0);
  if (j && typeof j.eq === "object" && j.eq) {
    p.eq = { low: num(j.eq.low, -18, 18, 0), mid: num(j.eq.mid, -18, 18, 0), high: num(j.eq.high, -18, 18, 0) };
  }
  if (j && typeof j.text === "object" && j.text && String(j.text.value || "").trim()) {
    p.text = {
      value: stripCJK(String(j.text.value)).slice(0, 120),
      xPct: num(j.text.xPct, 0, 100, 50),
      yPct: num(j.text.yPct, 0, 100, 88),
      sizePct: num(j.text.sizePct, 2, 20, 7),
      color: /^#[0-9a-f]{6}$/i.test(String(j.text.color)) ? String(j.text.color) : "#ffffff",
      bg: typeof j.text.bg === "string" ? j.text.bg.slice(0, 24) : "",
      bold: j.text.bold !== false,
      font: typeof j.text.font === "string" ? j.text.font.slice(0, 40) : "",
    };
  } else if (j && j.text === null) p.text = null;
  if (Array.isArray(j?.covers)) {
    p.covers = j.covers.slice(0, 8).map((c: any) => ({
      xPct: num(c.xPct, 0, 100, 35),
      yPct: num(c.yPct, 0, 100, 35),
      wPct: num(c.wPct, 1, 100, 30),
      hPct: num(c.hPct, 1, 100, 20),
      mode: ["blur", "pixelate", "fill"].includes(String(c.mode)) ? String(c.mode) : "blur",
      fill: /^#[0-9a-f]{6}$/i.test(String(c.fill)) ? String(c.fill) : "#000000",
    }));
  }
  if (has("withLogo")) p.withLogo = !!j.withLogo;
  const summary = stripCJK(String(j?.summary || "")).trim().slice(0, 300);
  return { plan: p, summary };
}

app.post(
  "/api/ai/video-plan",
  wrap(async (req, res) => {
    const { draftId, request: reqText, meta, model } = req.body ?? {};
    const draft = getDraft(draftId);
    if (!draft?.product) return res.status(400).json({ error: "Ürün yok." });
    if (!String(reqText || "").trim()) return res.status(400).json({ error: "Ne yapılacağını yaz." });
    if (!claudeConfigured()) return res.status(400).json({ error: "Claude API anahtarı ayarlı değil." });
    const p = draft.product;
    const dur = Number(meta?.duration) || 0;
    const jobId = startJob("video-plan", async (ctx) => {
      ctx.plan(["Claude videoyu düzenliyor"]);
      ctx.step("Claude videoyu düzenliyor");
      const sys = [
        "Sen tarayıcı-içi bir video editörünü SÜREN bir asistansın. Kullanıcının doğal dildeki",
        "isteğini, uygulanacak düzenleme AYARLARINI içeren TEK bir JSON nesnesine çevir. Metin/",
        "yönerge YAZMA — sadece ayar üret. Yalnızca şu anahtarları kullan (hepsi opsiyonel):",
        "trimStart, trimEnd (saniye); mute (bool); speed (0.1–16); ratioId (orig|etsy|shopify45|",
        "square1600|wide169|story916); maxEdge (0|720|1080|1440|1920); rotate (0|90|180|270);",
        "flipH, flipV (bool); opacity (0–100); adjustPreset (ecom-pop|studio-white|bright-crisp|",
        "vivid|high-contrast|soft|flat|warm|cool|pastel|dramatic|vintage|sharp-detail|bw);",
        "adjust {brightness 40–180, contrast 40–200, saturate 0–220, exposure/warmth/tint/sharpen/",
        "vignette -100..100 veya 0..100, blur 0–12}; bw (bool); chroma {color '#rrggbb', tol 0–100,",
        "soft 0–100} veya null; bgColor '#rrggbb'; bgBlur (0–40); volume (0–400); fadeIn, fadeOut",
        "(saniye); vocalRemove, denoise, reverse (bool); pitch (-12..12); eq {low,mid,high -18..18};",
        "text {value, xPct, yPct, sizePct 2–20, color '#rrggbb', bg '', bold, font} veya null;",
        "covers [{xPct,yPct,wPct,hPct,mode blur|pixelate|fill,fill '#rrggbb'}]; withLogo (bool).",
        "Ayrıca 'summary' anahtarına ne değiştirdiğini tek cümlede yaz (kullanıcının dili).",
        "Sadece istenen ayarları koy; istenmeyeni ekleme. Yanıt SADECE JSON olsun.",
      ].join("\n");
      const usr = [
        `İSTEK: ${String(reqText).trim()}`,
        dur ? `VİDEO SÜRESİ: ${dur.toFixed(2)} sn` : "",
        meta?.width ? `VİDEO BOYUTU: ${meta.width}×${meta.height}` : "",
        `ÜRÜN: ${stripCJK(p.titleTranslated || p.title)}`,
      ]
        .filter(Boolean)
        .join("\n");
      const { text } = await ask(sys, usr, "video-plan", { model, maxTokens: 900, draftId: draft.id });
      let parsed: any = {};
      try {
        parsed = extractJson(text);
      } catch {
        throw new LlmError("Claude geçerli bir düzenleme planı döndürmedi.");
      }
      return sanitiseVideoPlan(parsed);
    });
    res.json({ jobId });
  }),
);

/* --------------------------------- blog ------------------------------- */

/** Merge an incoming (possibly partial) config onto the stored one. */
function mergeBlogConfig(base: BlogConfig, patch: any): BlogConfig {
  const p = patch ?? {};
  return {
    ...base,
    ...p,
    backlinks: Array.isArray(p.backlinks)
      ? p.backlinks
          .map((b: any) => ({ url: String(b?.url || "").trim(), label: String(b?.label || "").trim() || undefined }))
          .filter((b: any) => b.url)
      : base.backlinks,
    html: { ...base.html, ...(p.html ?? {}) },
  };
}

/** Re-render the standalone HTML for a blog whose doc exists, and persist it. */
function renderAndStore(rec: BlogRecord): BlogRecord {
  if (!rec.doc) return rec;
  const draft = rec.draftId ? getDraft(rec.draftId) : null;
  const hint = productStyleHint(draft?.product ?? null, rec.config.category);
  const { full } = renderBlogHtml(rec.doc, { config: rec.config, hint });
  return patchBlog(rec.id, { html: full });
}

app.get(
  "/api/blogs",
  wrap(async (req, res) => {
    const kind = req.query.kind === "product" || req.query.kind === "category" ? req.query.kind : undefined;
    res.json(listBlogs(kind));
  }),
);

app.get(
  "/api/blogs/:id",
  wrap(async (req, res) => {
    const b = getBlog(req.params.id);
    if (!b) return res.status(404).json({ error: "Blog bulunamadı" });
    res.json(b);
  }),
);

/** Create (or reuse) the product blog for a finished draft. */
app.post(
  "/api/blogs/product",
  wrap(async (req, res) => {
    const draft = getDraft(String(req.body?.draftId || ""));
    if (!draft?.product) return res.status(400).json({ error: "Ürün taslağı bulunamadı." });
    const rec = ensureProductBlog(draft.id, draft.title || draft.product.titleTranslated || draft.product.title);
    res.json(rec);
  }),
);

/** Create a category blog — needs a category name and our site link. */
app.post(
  "/api/blogs/category",
  wrap(async (req, res) => {
    const category = String(req.body?.category || "").trim();
    const siteUrl = String(req.body?.siteUrl || "").trim();
    if (!category) return res.status(400).json({ error: "Kategori adı gerekli." });
    if (!/^https?:\/\/.+/i.test(siteUrl)) return res.status(400).json({ error: "Geçerli bir site bağlantısı gerekli (https://…)." });
    res.json(createCategoryBlog(category, siteUrl));
  }),
);

/** Patch title / config; re-renders HTML if a doc already exists. */
app.post(
  "/api/blogs/:id",
  wrap(async (req, res) => {
    const cur = getBlog(req.params.id);
    if (!cur) return res.status(404).json({ error: "Blog bulunamadı" });
    const patch: { title?: string; config?: BlogConfig } = {};
    if (typeof req.body?.title === "string") patch.title = req.body.title;
    if (req.body?.config) patch.config = mergeBlogConfig(cur.config ?? DEFAULT_BLOG_CONFIG, req.body.config);
    let rec = patchBlog(cur.id, patch);
    if (patch.config && rec.doc) rec = renderAndStore(rec);
    res.json(rec);
  }),
);

app.delete(
  "/api/blogs/:id",
  wrap(async (req, res) => {
    deleteBlog(req.params.id);
    res.json({ ok: true });
  }),
);

/** SEO research for a blog (Claude). */
app.post(
  "/api/ai/blog-seo",
  wrap(async (req, res) => {
    const rec = getBlog(String(req.body?.blogId || ""));
    if (!rec) return res.status(404).json({ error: "Blog bulunamadı" });
    if (!claudeConfigured()) return res.status(400).json({ error: "Claude API anahtarı ayarlı değil." });
    const draft = rec.draftId ? getDraft(rec.draftId) : null;
    const jobId = startJob("blog-seo", async (ctx) => {
      ctx.plan(["Anahtar kelimeler ve rakip açıları araştırılıyor"]);
      ctx.step("Anahtar kelimeler ve rakip açıları araştırılıyor");
      const seo = await researchBlogSeo({
        kind: rec.kind,
        product: draft?.product ?? null,
        category: rec.config.category,
        config: rec.config,
        targetLanguage: req.body?.targetLanguage || "English",
        model: req.body?.model,
        draftId: rec.draftId ?? undefined,
      });
      patchBlog(rec.id, { seo });
      return seo;
    });
    res.json({ jobId });
  }),
);

/** Generate (or regenerate) the blog article. */
app.post(
  "/api/ai/blog",
  wrap(async (req, res) => {
    const rec = getBlog(String(req.body?.blogId || ""));
    if (!rec) return res.status(404).json({ error: "Blog bulunamadı" });
    if (!claudeConfigured()) return res.status(400).json({ error: "Claude API anahtarı ayarlı değil." });
    if (rec.kind === "product" && !getDraft(rec.draftId || "")?.product)
      return res.status(400).json({ error: "Ürün taslağı bulunamadı." });
    if (rec.kind === "category" && !rec.config.siteUrl)
      return res.status(400).json({ error: "Önce site bağlantısı girin." });
    const draft = rec.draftId ? getDraft(rec.draftId) : null;
    const jobId = startJob("blog", async (ctx) => {
      const useSeo = req.body?.useSeo !== false && !!rec.seo;
      ctx.plan([useSeo ? "SEO araştırması uygulanıyor" : "Yapı kuruluyor", "Yazı yazılıyor", "SEO uyumlu HTML render ediliyor"]);
      ctx.step("Yazı yazılıyor");
      const doc = await generateBlog({
        kind: rec.kind,
        product: draft?.product ?? null,
        category: rec.config.category,
        config: rec.config,
        targetLanguage: req.body?.targetLanguage || "English",
        seo: useSeo ? rec.seo : null,
        model: req.body?.model,
        draftId: rec.draftId ?? undefined,
      });
      ctx.step("SEO uyumlu HTML render ediliyor");
      const hint = productStyleHint(draft?.product ?? null, rec.config.category);
      const { full } = renderBlogHtml(doc, { config: rec.config, hint });
      patchBlog(rec.id, { doc, html: full, title: doc.title || rec.title });
      return { doc, html: full };
    });
    res.json({ jobId });
  }),
);

/* -------------------------------- shopify ------------------------------ */

app.post(
  "/api/shopify/push",
  wrap(async (req, res) => {
    const draft = getDraft(req.body?.draftId);
    if (!draft?.product || !draft.listing) return res.status(400).json({ error: "Ürün veya listeleme eksik." });
    const out = await pushToShopify(draft.product, draft.listing);
    res.json(out);
  }),
);

/* ------------------------------ Etsy app ----------------------------- */

app.get("/api/etsy-app/status", wrap(async (_req, res) => res.json(await etsyAppStatus())));

app.post("/api/etsy-app/pair", wrap(async (req, res) => res.json(await pairEtsyApp(req.body?.url))));

/** Send this Etsy draft to the Etsy Command Center as a local draft. */
app.post(
  "/api/etsy-app/push",
  wrap(async (req, res) => {
    const draft = getDraft(req.body?.draftId);
    if (!draft?.product || !draft.listing) return res.status(400).json({ error: "Ürün veya listeleme eksik." });
    if (draft.listing.channel !== "etsy")
      return res.status(400).json({ error: "Bu taslak Etsy için üretilmemiş — kanalı Etsy seçip içerik üret." });
    // never carry Shopify-only material across
    const listing: typeof draft.listing = {
      ...draft.listing,
      fields: draft.listing.fields.filter((f) => f.key !== "seo_description"),
    };
    const out = await pushToEtsyApp(draft.product, listing, { dryRun: Boolean(req.body?.dryRun) });
    res.json(out);
  }),
);

/* -------------------------------- usage ------------------------------- */

/** `?from=ISO&to=ISO` — `to` is exclusive. Both optional. */
function usageRange(req: express.Request): { from: string | null; to: string | null; where: string; args: string[] } {
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : null;
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : null;
  const parts: string[] = [];
  const args: string[] = [];
  if (from) (parts.push("at >= ?"), args.push(from));
  if (to) (parts.push("at < ?"), args.push(to));
  return { from, to, where: parts.length ? "WHERE " + parts.join(" AND ") : "", args };
}

/** Stored result column → object when it's JSON, else the raw string, else null. */
function parseResult(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw) return null;
  const s = raw.trim();
  if (s[0] === "{" || s[0] === "[") {
    try {
      return JSON.parse(s);
    } catch {
      /* fall through to raw text */
    }
  }
  return raw;
}

app.get("/api/usage", (req, res) => {
  const { from, to, where, args } = usageRange(req);
  const calls = db
    .prepare(
      `SELECT at, kind, provider, model, input_tokens, output_tokens, credits, estimated, cost_usd, draft_id, result
       FROM usage_log ${where} ORDER BY id DESC LIMIT 500`,
    )
    .all(...args) as any[];
  const agg = db
    .prepare(
      `SELECT
         COALESCE(SUM(cost_usd),0) c,
         COALESCE(SUM(CASE WHEN provider='claude' THEN cost_usd ELSE 0 END),0) cc,
         COALESCE(SUM(CASE WHEN provider='manus' THEN cost_usd ELSE 0 END),0) mc,
         COALESCE(SUM(input_tokens),0) i,
         COALESCE(SUM(output_tokens),0) o,
         COALESCE(SUM(credits),0) cr
       FROM usage_log ${where}`,
    )
    .get(...args) as any;
  const perDraftRows = db
    .prepare(
      `SELECT draft_id,
         COALESCE(SUM(CASE WHEN provider='claude' THEN cost_usd ELSE 0 END),0) claude_usd,
         COALESCE(SUM(CASE WHEN provider='manus' THEN cost_usd ELSE 0 END),0) manus_usd,
         COALESCE(SUM(credits),0) credits
       FROM usage_log ${where} GROUP BY draft_id ORDER BY (claude_usd + manus_usd) DESC LIMIT 50`,
    )
    .all(...args) as any[];
  const draftTitle = (id: string | null) => {
    if (!id) return "(atanmamış)";
    const r = db.prepare("SELECT title, num_iid FROM drafts WHERE id = ?").get(id) as any;
    return r ? r.title || r.num_iid : id.slice(0, 8);
  };

  const nCalls = db.prepare(`SELECT COUNT(*) n FROM usage_log ${where}`).get(...args) as any;

  // all-time (unfiltered) app spend, for "balance remaining" math
  const allTime = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN provider='claude' THEN cost_usd ELSE 0 END),0) cc,
         COALESCE(SUM(CASE WHEN provider='manus' THEN cost_usd ELSE 0 END),0) mc
       FROM usage_log`,
    )
    .get() as any;
  const model = activeModel();
  const price = claudePricing(model);

  res.json({
    from,
    to,
    totalCostUsd: agg.c,
    claudeCostUsd: agg.cc,
    manusCostUsd: agg.mc,
    totalInputTokens: agg.i,
    totalOutputTokens: agg.o,
    totalManusCredits: agg.cr,
    manusUsdPerCredit: manusUsdPerCredit(),
    callCount: nCalls.n,
    claudeSpentAllUsd: allTime.cc,
    manusSpentAllUsd: allTime.mc,
    claudeBalanceUsd: Number(getSetting("anthropic_balance_usd")) || 0,
    activeClaudeModel: model,
    claudeInPer1M: price.inPer1M,
    claudeOutPer1M: price.outPer1M,
    perDraft: perDraftRows.map((r) => ({
      draftId: r.draft_id,
      title: draftTitle(r.draft_id),
      claudeUsd: r.claude_usd,
      manusUsd: r.manus_usd,
      manusCredits: r.credits,
    })),
    calls: calls.map((c) => ({
      at: c.at,
      kind: c.kind,
      provider: c.provider,
      model: c.model,
      inputTokens: c.input_tokens,
      outputTokens: c.output_tokens,
      credits: c.credits,
      estimated: !!c.estimated,
      costUsd: c.cost_usd,
      draftId: c.draft_id,
      result: parseResult(c.result),
    })),
  });
});

/**
 * Manus spend **for THIS APP only** — the app's own usage_log rows (which carry
 * the Manus task_id), reconciled against Manus's authoritative /v2/usage.list so
 * each task shows the real billed credits. Manual tasks the user ran on manus.im
 * are NOT included. `?from=&to=` filters by the app's log timestamp.
 */
app.get(
  "/api/manus/usage",
  wrap(async (req, res) => {
    const { from, to, where, args } = usageRange(req);
    const rate = manusUsdPerCredit();
    const empty = {
      configured: manusConfigured(),
      available: null as number | null,
      availableUsd: null as number | null,
      balance: null as unknown,
      usdPerCredit: rate,
      from,
      to,
      entries: [] as unknown[],
      entryCount: 0,
      costCredits: 0,
      refundCredits: 0,
      grantCredits: 0,
      costUsd: 0,
      byDay: [] as unknown[],
      byDraft: [] as unknown[],
      reconciled: 0,
      pending: 0,
      truncated: false,
    };
    if (!manusConfigured()) return res.json(empty);

    // this app's Manus calls, from our own log
    const appRows = db
      .prepare(
        `SELECT at, kind, credits, estimated, draft_id, manus_task_id
         FROM usage_log ${where ? where + " AND" : "WHERE"} provider = 'manus'
         ORDER BY id DESC LIMIT 500`,
      )
      .all(...args) as any[];

    // Manus's authoritative per-task record, keyed by task_id
    let authMap = new Map<string, { credits: number; title: string; type: string; createdAt: string }>();
    let balance: unknown = null;
    let truncated = false;
    let error: string | undefined;
    try {
      const [bal, list] = await Promise.all([manusBalance(), manusUsageList(8)]);
      balance = bal;
      truncated = list.truncated;
      for (const r of list.rows) if (r.taskId) authMap.set(r.taskId, r);
    } catch (e) {
      error = (e as Error).message;
    }

    const draftTitle = (id: string | null) => {
      if (!id) return "(atanmamış)";
      const r = db.prepare("SELECT title, num_iid FROM drafts WHERE id = ?").get(id) as any;
      return r ? r.title || r.num_iid : id.slice(0, 8);
    };

    let costCredits = 0;
    let refundCredits = 0;
    let reconciled = 0;
    let pending = 0;
    const dayMap = new Map<string, number>();
    const draftMap = new Map<string | null, number>();
    const entries = appRows.map((row) => {
      const auth = row.manus_task_id ? authMap.get(row.manus_task_id) : undefined;
      const credits = auth ? Math.abs(auth.credits) : Math.abs(Number(row.credits) || 0);
      const type = auth?.type ?? "cost";
      const estimated = auth ? false : !!row.estimated || !row.credits;
      const at = auth?.createdAt ?? row.at;
      if (auth) reconciled++;
      else pending++;
      if (type === "refund") refundCredits += credits;
      else {
        costCredits += credits;
        dayMap.set(at.slice(0, 10), (dayMap.get(at.slice(0, 10)) ?? 0) + credits);
        draftMap.set(row.draft_id ?? null, (draftMap.get(row.draft_id ?? null) ?? 0) + credits);
      }
      return {
        taskId: row.manus_task_id ?? "",
        title: auth?.title || row.kind,
        kind: row.kind,
        draftId: row.draft_id ?? null,
        draftTitle: draftTitle(row.draft_id ?? null),
        credits,
        type,
        estimated,
        createdAt: at,
      };
    });

    res.json({
      configured: true,
      available: (balance as any)?.total ?? null,
      availableUsd: (balance as any)?.total != null ? (balance as any).total * rate : null,
      balance,
      usdPerCredit: rate,
      from,
      to,
      entries: entries.slice(0, 200),
      entryCount: entries.length,
      costCredits,
      refundCredits,
      grantCredits: 0,
      costUsd: costCredits * rate,
      byDay: [...dayMap.entries()].map(([date, credits]) => ({ date, credits })).sort((a, b) => a.date.localeCompare(b.date)),
      byDraft: [...draftMap.entries()]
        .map(([draftId, credits]) => ({ draftId, title: draftTitle(draftId), credits, costUsd: credits * rate }))
        .sort((a, b) => b.credits - a.credits),
      reconciled,
      pending,
      truncated,
      error,
    });
  }),
);

/* ------------------------------- archive ----------------------------- */

app.get("/api/archive", (_req, res) => {
  const rows = db.prepare("SELECT id, draft_id, channel, title, format, created_at FROM archive ORDER BY created_at DESC").all() as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      draftId: r.draft_id,
      channel: r.channel,
      title: r.title,
      format: r.format,
      createdAt: r.created_at,
    })),
  );
});
app.post(
  "/api/archive",
  wrap(async (req, res) => {
    const { id, draftId, channel, title, format, payload } = req.body ?? {};
    db.prepare("INSERT OR REPLACE INTO archive (id, draft_id, channel, title, format, payload, created_at) VALUES (?,?,?,?,?,?,?)").run(
      id,
      draftId,
      channel,
      title,
      format,
      JSON.stringify(payload ?? {}),
      now(),
    );
    res.json({ ok: true });
  }),
);
app.get(
  "/api/archive/:id",
  wrap(async (req, res) => {
    const row = db.prepare("SELECT * FROM archive WHERE id = ?").get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: "Bulunamadı" });
    res.json({ ...row, payload: JSON.parse(row.payload) });
  }),
);

/* ------------------------------ media store ------------------------ */
// Persisted images: Manus translations (their URLs expire in 48h) and
// browser-edited images. Stored under data/media, served from our origin.
app.get("/api/media/:file", (req, res) => {
  const p = mediaPath(req.params.file);
  if (!fsExists(p)) return res.status(404).json({ error: "Bulunamadı" });
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(p);
});
app.post(
  "/api/media",
  wrap(async (req, res) => {
    const dataUrl = String(req.body?.dataUrl || "");
    if (!/^data:(image|video)\//.test(dataUrl)) return res.status(400).json({ error: "data:image/... veya data:video/... bekleniyor" });
    res.json({ url: persistDataUrl(dataUrl) });
  }),
);

/** Attach a product video by file (data:video/... URL) or by remote link. */
app.post(
  "/api/drafts/:id/video",
  wrap(async (req, res) => {
    const draft = getDraft(req.params.id);
    if (!draft?.product) return res.status(404).json({ error: "Taslak bulunamadı" });
    const dataUrl = String(req.body?.dataUrl || "");
    const link = String(req.body?.url || "").trim();
    let stored = "";
    if (dataUrl.startsWith("data:video/")) {
      stored = persistDataUrl(dataUrl);
    } else if (/^https?:\/\/.+/i.test(link)) {
      try {
        stored = await persistFileFromUrl(link); // local copy — plays without CORS issues
      } catch {
        stored = link; // fall back to the raw link
      }
    } else {
      return res.status(400).json({ error: "Video dosyası (data:video/...) ya da geçerli bir bağlantı gerekli." });
    }
    patchDraft(
      draft.id,
      {
        product: {
          ...draft.product,
          videoUrl: stored,
          videoUrlOriginal: draft.product.videoUrlOriginal ?? draft.product.videoUrl ?? stored,
          videoOps: draft.product.videoOps,
        },
      },
      "Video eklendi",
    );
    res.json(getDraft(draft.id));
  }),
);
app.delete(
  "/api/drafts/:id/video",
  wrap(async (req, res) => {
    const draft = getDraft(req.params.id);
    if (!draft?.product) return res.status(404).json({ error: "Taslak bulunamadı" });
    const { videoUrl, videoUrlOriginal, videoOps, videoDelivery, ...rest } = draft.product as any;
    patchDraft(draft.id, { product: rest }, "Video kaldırıldı");
    res.json(getDraft(draft.id));
  }),
);

/* ---------------------------- image proxy --------------------------- */
// Streams remote product images from our own origin so the browser canvas
// can read their pixels (crop / watermark / PNG export) without tainting.
app.get(
  "/api/image-proxy",
  wrap(async (req, res) => {
    const url = String(req.query.url || "");
    if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: "url gerekli" });
    const host = new URL(url).hostname;
    const ok =
      /(alicdn\.com|taobao\.com|tmall\.com|1688\.com|aliimg\.com|360buyimg\.com)$/.test(host) ||
      /(manus\.ai|manus\.im|manuscdn\.com)$/.test(host) ||
      /\.amazonaws\.com$/.test(host); // Manus presigned result URLs
    if (!ok) return res.status(403).json({ error: "İzin verilmeyen görsel kaynağı" });
    const isManus = /(manus\.ai|manus\.im|manuscdn\.com)$/.test(host);
    const upstream = await fetch(url, {
      headers: isManus ? manusFileAuthHeaders() : { Referer: "https://www.taobao.com/" },
    });
    if (!upstream.ok || !upstream.body) return res.status(502).json({ error: `Görsel alınamadı (${upstream.status})` });
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  }),
);

/* --------------------------- static (prod) ------------------------- */

const dist = join(ROOT, "dist");
if (env.isProd && existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(join(dist, "index.html")));
}

app.listen(env.port, () => {
  console.log(`  Taobao Product Studio API  ->  http://localhost:${env.port}`);
  if (!env.isProd) console.log(`  Web (dev)                  ->  http://localhost:5173`);
  const warn: string[] = [];
  if (!oneboundCreds().key) warn.push("OneBound key yok — .env veya Ayarlar sayfasından ekleyin.");
  if (!claudeConfigured()) warn.push("Claude API anahtarı yok — .env veya Ayarlar sayfasından ekleyin.");
  if (!manusConfigured()) warn.push("Manus API anahtarı yok — .env veya Ayarlar sayfasından ekleyin.");
  if (warn.length) console.log("  ! " + warn.join("\n  ! "));
});
