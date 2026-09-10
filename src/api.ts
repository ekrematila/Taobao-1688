import type {
  ApiCallInput,
  ApiCallResult,
  ArchiveEntry,
  BlogConfig,
  BlogRecord,
  BlogSeo,
  BlogSummary,
  DraftRevision,
  DraftSummary,
  GenerateListingInput,
  ImageTranslateJobResult,
  NormalisedProduct,
  OneboundEndpoint,
  Settings,
  SettingsPatch,
  UsageDashboard,
} from "@shared/types.ts";
import { runJob, type RunningJob } from "./lib/jobs";

export interface Draft {
  id: string;
  numIid: string;
  platform: "taobao" | "1688";
  title: string;
  channel: "shopify" | "etsy" | null;
  step: number;
  product: NormalisedProduct | null;
  listing: import("@shared/types.ts").GeneratedListing | null;
  imageState: unknown;
  apiResponse: unknown;
  updatedAt: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}
const post = <T>(p: string, body?: unknown) =>
  req<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined });

function qs(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? "?" + s : "";
}

export const api = {
  me: () => req<{ needsAuth: boolean; authed: boolean }>("/me"),
  login: (password: string) => post<{ authed: boolean }>("/login", { password }),
  logout: () => post("/logout"),

  settings: () => req<Settings>("/settings"),
  examples: () =>
    req<{
      etsy: { title: string; title_alt: string; description: string; tags: string };
      shopify: { title: string; description: string; tags: string };
    }>("/examples"),
  saveSettings: (patch: SettingsPatch) => post<Settings>("/settings", patch),
  verifyClaude: (key?: string) => post<import("@shared/types.ts").VerifyClaudeResult>("/verify/claude", { key }),
  verifyManus: (key?: string) => post<import("@shared/types.ts").VerifyManusResult>("/verify/manus", { key }),
  verifyShopify: (domain?: string, token?: string) =>
    post<import("@shared/types.ts").VerifyShopifyResult>("/verify/shopify", { domain, token }),

  endpoints: () => req<OneboundEndpoint[]>("/onebound/endpoints"),
  taxonomy: () => req<{ count: number; paths: string[]; attrCount: number }>("/taxonomy"),
  taxonomyAttributes: (params: { draftId?: string; category?: string }) =>
    req<import("@shared/types.ts").TaxonomyAttributesResult>(
      "/taxonomy/attributes?" +
        new URLSearchParams(
          Object.entries(params).filter(([, v]) => v) as [string, string][],
        ).toString(),
    ),
  suggestAttributes: (draftId: string, category?: string) =>
    post<{ picks: Record<string, import("@shared/types.ts").ProductAttrPick> }>(
      "/taxonomy/attributes/suggest",
      { draftId, category },
    ),
  call: (input: ApiCallInput) => post<ApiCallResult & { draftId?: string }>("/onebound/call", input),

  drafts: () => req<DraftSummary[]>("/drafts"),
  draft: (id: string) => req<Draft>(`/drafts/${id}`),
  researchHsCode: (draftId: string, productType: string, model?: string) =>
    post<{ code: string; heading: string; rationale: string }>("/ai/hs-code", { draftId, productType, model }),
  patchDraft: (id: string, patch: Record<string, unknown>) => post<Draft>(`/drafts/${id}`, patch),
  deleteDraft: (id: string) => req<{ ok: true }>(`/drafts/${id}`, { method: "DELETE" }),
  setDraftVideo: (id: string, body: { dataUrl?: string; url?: string }) => post<Draft>(`/drafts/${id}/video`, body),
  clearDraftVideo: (id: string) => req<Draft>(`/drafts/${id}/video`, { method: "DELETE" }),
  revisions: (id: string) => req<DraftRevision[]>(`/drafts/${id}/revisions`),
  restore: (revId: number) => post<Draft>(`/revisions/${revId}/restore`),

  pushShopify: (draftId: string) => post<{ adminUrl: string; id: number }>("/shopify/push", { draftId }),

  etsyAppStatus: () => req<{ configured: boolean; url: string; reachable: boolean }>("/etsy-app/status"),
  pairEtsyApp: (url?: string) => post<{ url: string; connected: boolean }>("/etsy-app/pair", { url }),
  pushEtsyApp: (draftId: string, dryRun = false) =>
    post<{
      ok?: boolean;
      dryRun?: boolean;
      draftId?: number;
      updated?: boolean;
      openUrl?: string;
      title?: string;
      images?: number;
      variants?: number;
      message?: string;
      wouldCreate?: { title?: string; price?: number | null; images?: number; variants?: number };
    }>("/etsy-app/push", { draftId, dryRun }),

  usage: (range?: { from?: string; to?: string }) =>
    req<UsageDashboard>("/usage" + qs(range)),
  manusUsage: (range?: { from?: string; to?: string }) =>
    req<import("@shared/types.ts").ManusAccountUsage>("/manus/usage" + qs(range)),
  archive: () => req<ArchiveEntry[]>("/archive"),
  saveArchive: (entry: Omit<ArchiveEntry, "createdAt"> & { payload: unknown }) => post("/archive", entry),
  saveMedia: (dataUrl: string) => post<{ url: string }>("/media", { dataUrl }),
  freeTranslate: (texts: string[], to = "en", from = "zh") =>
    post<{ results: string[]; engine: string }>("/translate/free", { texts, to, from }),
  jobs: () => req<import("@shared/types.ts").JobView[]>("/jobs"),
  cancelJob: (id: string) => post<{ cancelled: boolean }>(`/jobs/${id}/cancel`),

  /* -------------------------------- blog -------------------------------- */
  blogs: (kind?: "product" | "category") => req<BlogSummary[]>("/blogs" + (kind ? `?kind=${kind}` : "")),
  blog: (id: string) => req<BlogRecord>(`/blogs/${id}`),
  ensureProductBlog: (draftId: string) => post<BlogRecord>("/blogs/product", { draftId }),
  createCategoryBlog: (category: string, siteUrl: string) => post<BlogRecord>("/blogs/category", { category, siteUrl }),
  patchBlog: (id: string, patch: { title?: string; config?: BlogConfig }) => post<BlogRecord>(`/blogs/${id}`, patch),
  deleteBlog: (id: string) => req<{ ok: true }>(`/blogs/${id}`, { method: "DELETE" }),
};

/* ------------------------------- jobs ------------------------------- */

type Progress = (j: import("@shared/types.ts").JobView) => void;

export function generateListingJob(
  input: GenerateListingInput & { model?: string; mode?: "ai" | "local" },
  onProgress: Progress,
): RunningJob<import("@shared/types.ts").GeneratedListing> {
  return runJob(() => post("/ai/generate-listing", input), onProgress);
}
export function translateVariantsJob(
  draftId: string,
  targetLanguage: string,
  model: string | undefined,
  onProgress: Progress,
) {
  return runJob(() => post("/ai/translate-variants", { draftId, targetLanguage, model }), onProgress);
}
export function adviceJob(
  body: {
    draftId: string;
    channel: string;
    model?: string;
    effort?: string;
    thinking?: string;
    targetLanguage?: string;
    mode?: "ai" | "local";
  },
  onProgress: Progress,
): RunningJob<import("@shared/types.ts").AdviceResult> {
  return runJob(() => post("/ai/advice", body), onProgress);
}
export function categoryResearchJob(
  body: {
    draftId: string;
    question?: string;
    model?: string;
    effort?: string;
    thinking?: string;
    targetLanguage?: string;
    mode?: "manus" | "ai" | "local";
    agentProfile?: string;
  },
  onProgress: Progress,
): RunningJob<import("@shared/types.ts").CategoryResearchResult> {
  return runJob(() => post("/ai/category-research", body), onProgress);
}
export function nameVariantsJob(
  body: { draftId: string; channel: string; targetLanguage?: string; model?: string; mode?: "ai" | "free" },
  onProgress: Progress,
) {
  return runJob(() => post("/ai/name-variants", body), onProgress);
}
export function altTextsJob(
  draftId: string,
  targetLanguage: string,
  model: string | undefined,
  onProgress: Progress,
) {
  return runJob(() => post("/ai/alt-texts", { draftId, targetLanguage, model }), onProgress);
}
export function altTextsManusJob(
  body: { draftId: string; imageUrls?: string[]; targetLanguage: string; instruction?: string },
  onProgress: Progress,
): RunningJob<{ results: { url: string; alt: string }[]; totalCredits: number }> {
  return runJob(() => post("/ai/alt-texts-manus", body), onProgress);
}
export function translateImagesJob(
  body: {
    draftId: string;
    imageUrls: string[];
    targetLanguage: string;
    instruction?: string;
    imageSpec?: string;
    speed?: "fast" | "medium" | "slow";
    agentProfile?: string;
  },
  onProgress: Progress,
): RunningJob<ImageTranslateJobResult> {
  return runJob(() => post("/ai/translate-images", body), onProgress);
}
export function editImagesJob(
  body: {
    draftId: string;
    imageUrls: string[];
    instruction: string;
    imageSpec?: string;
    speed?: "fast" | "medium" | "slow";
    agentProfile?: string;
  },
  onProgress: Progress,
): RunningJob<{ changed: number; totalCredits: number }> {
  return runJob(() => post("/ai/edit-images", body), onProgress);
}
export function composeImageJob(
  body: {
    draftId: string;
    imageUrls: string[];
    instruction: string;
    brandBrief?: string;
    imageSpec?: string;
    speed?: "fast" | "medium" | "slow";
    agentProfile?: string;
  },
  onProgress: Progress,
): RunningJob<{ url: string; remoteUrl?: string; taskUrl?: string; credits: number }> {
  return runJob(() => post("/ai/compose-image", body), onProgress);
}
export function researchBrandJob(
  body: { draftId: string; brandUrl: string },
  onProgress: Progress,
): RunningJob<{ brief: string; taskUrl?: string; credits: number }> {
  return runJob(() => post("/ai/research-brand", body), onProgress);
}
export function editVideoJob(
  body: { draftId: string; instruction: string; agentProfile?: string; logoDataUrl?: string },
  onProgress: Progress,
): RunningJob<{ url: string; remoteUrl?: string; taskUrl?: string; credits: number }> {
  return runJob(() => post("/ai/edit-video", body), onProgress);
}
export function videoAltJob(
  body: { draftId: string; targetLanguage?: string; agentProfile?: string; mode?: "manus" | "claude" },
  onProgress: Progress,
): RunningJob<{ alt: string; taskUrl?: string; credits: number }> {
  return runJob(() => post("/ai/video-alt", body), onProgress);
}
export function videoPlanJob(
  body: {
    draftId: string;
    request: string;
    model?: string;
    meta?: { width?: number; height?: number; duration?: number };
  },
  onProgress: Progress,
): RunningJob<{ plan: Record<string, unknown>; summary: string }> {
  return runJob(() => post("/ai/video-plan", body), onProgress);
}
export function blogSeoJob(
  body: { blogId: string; targetLanguage?: string; model?: string },
  onProgress: Progress,
): RunningJob<BlogSeo> {
  return runJob(() => post("/ai/blog-seo", body), onProgress);
}
export function blogGenJob(
  body: { blogId: string; targetLanguage?: string; model?: string; useSeo?: boolean },
  onProgress: Progress,
): RunningJob<{ doc: import("@shared/types.ts").BlogDoc; html: string }> {
  return runJob(() => post("/ai/blog", body), onProgress);
}

/** Route a remote product image through our proxy so canvas pixels stay readable. */
export function proxied(url: string): string {
  if (!url) return url;
  if (url.startsWith("/api/") || url.startsWith("data:") || url.startsWith("blob:")) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

const CN_CDN = /(^|\.)(alicdn|taobao|tmall|1688|aliyuncs)\.com$/i;

/**
 * A normal, shareable absolute image link:
 *  - strips the internal `#dup-…` marker
 *  - `//host/…` → `https://host/…`
 *  - app-relative `/api/media/…` → `https://<this-host>/api/media/…`
 *  - `http://` → `https://` for the Chinese image CDNs (they all serve https)
 */
export function absoluteUrl(url: string): string {
  if (!url) return url;
  let s = url.split("#dup-")[0].trim();
  if (s.startsWith("data:") || s.startsWith("blob:")) return s;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("/")) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return origin + s;
  }
  try {
    const u = new URL(s);
    if (u.protocol === "http:" && CN_CDN.test(u.hostname)) u.protocol = "https:";
    return u.toString();
  } catch {
    return s;
  }
}
