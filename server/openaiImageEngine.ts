// The OpenAI image engine: the same three jobs the Manus agent does for product photos
// (translate overlay text, free-form edit, compose a new image) done with gpt-image-*
// through /v1/images/edits. Results are stored under /api/media right away (the API
// returns base64, there is no expiring URL to chase), cost comes from the reported
// token usage and is logged as provider "openai".

import { ask, logClaudeUsage, LlmError } from "./llm.ts";
import { imageToBase64 } from "./manus.ts";
import { openaiImageEdit } from "./openaiMedia.ts";
import { OpenAIHttpError, openaiConfigured } from "./openai.ts";
import { persistDataUrl } from "./imagestore.ts";
import { CHERRY_PROFILE_DIRECTIVE } from "@shared/keycaps.ts";
import { imageDimensions, pickImageSize } from "@shared/openaiImages.ts";
import { NO_CJK_DIRECTIVE, translatePromptCore } from "./manus.ts";
import type { JobCtx } from "./jobs.ts";

export const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-sunburst";
export const IMAGE_QUALITIES = ["low", "medium", "high", "xhigh", "max", "auto"] as const;

export interface OpenAIImageOpts {
  model?: string;
  quality?: string;
  draftId?: string;
  ctx?: JobCtx;
}

export interface OpenAIImageOut {
  sourceUrl: string;
  /** the stored result (/api/media/…) or null when nothing needed changing */
  resultUrl: string | null;
  changed: boolean;
  costUsd: number;
  model: string;
}

function pickQuality(model: string, quality?: string): string {
  const q = String(quality || "high").toLowerCase();
  if (!(IMAGE_QUALITIES as readonly string[]).includes(q)) return "high";
  // xhigh / max exist only on the gpt-image-2.5 models
  if ((q === "xhigh" || q === "max") && !/^gpt-image-2\.5/.test(model)) return "high";
  return q;
}

function fail(e: unknown): never {
  if (e instanceof OpenAIHttpError) {
    if (e.status === 401) throw new LlmError("OpenAI API anahtarı geçersiz.", 401);
    if (e.status === 429) throw new LlmError("OpenAI hız sınırı / kota — biraz sonra tekrar deneyin.", 429);
    throw new LlmError(e.message);
  }
  throw e;
}

async function run(
  kind: string,
  urls: string[],
  prompt: string,
  sizeFrom: number,
  o: OpenAIImageOpts,
): Promise<{ resultUrl: string; costUsd: number; model: string }> {
  if (!openaiConfigured()) throw new LlmError("OpenAI API anahtarı ayarlı değil.", 400);
  const model = o.model || DEFAULT_IMAGE_MODEL;
  const images: { data: string; mime: string }[] = [];
  for (const u of urls) {
    o.ctx?.throwIfCancelled();
    images.push(await imageToBase64(u));
  }
  const dims = imageDimensions(Buffer.from(images[sizeFrom].data, "base64"));
  const size = dims ? pickImageSize(model, dims.w, dims.h) : "auto";
  o.ctx?.throwIfCancelled();
  let r;
  try {
    r = await openaiImageEdit({ model, prompt, images, size, quality: pickQuality(model, o.quality), signal: o.ctx?.signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    fail(e);
  }
  const resultUrl = persistDataUrl(`data:${r.mime};base64,${r.b64}`);
  logClaudeUsage(
    kind,
    model,
    { inputTokens: r.usage.textIn + r.usage.imageIn, outputTokens: r.usage.out, costUsd: r.costUsd },
    o.draftId,
    { from: urls, to: resultUrl, size, quality: pickQuality(model, o.quality) },
    "openai",
  );
  return { resultUrl, costUsd: r.costUsd, model };
}

/**
 * Cheap guard before spending image tokens: does the photo carry Chinese text laid
 * ON TOP of it? (An image model always returns an image — unlike the Manus agent it
 * can't say "nothing to do".) Unknown/failed check => treat as yes, never skip work.
 */
async function hasChineseOverlay(img: { data: string; mime: string }, draftId?: string): Promise<boolean> {
  try {
    const { text } = await ask(
      "You inspect e-commerce product photos. Answer with exactly one word: YES or NO.",
      "Does this photo contain Chinese text that was ADDED ON TOP of it (captions, headlines, labels, banners, badges, watermarks, shop names, QR/contact text)? Ignore text that is physically part of the product itself (e.g. printed legends on keycaps). Answer YES or NO.",
      "image-overlay-check",
      { images: [img], maxTokens: 16, effort: "low", thinking: "off", draftId },
    );
    return !/^\s*no\b/i.test(text);
  } catch {
    return true;
  }
}

export async function openaiTranslateImage(
  o: OpenAIImageOpts & { imageUrl: string; targetLanguage: string; productContext?: string; instruction?: string },
): Promise<OpenAIImageOut> {
  const src = await imageToBase64(o.imageUrl);
  o.ctx?.setStatus("Görselde Çince yazı aranıyor…");
  if (!(await hasChineseOverlay(src, o.draftId))) {
    return { sourceUrl: o.imageUrl, resultUrl: null, changed: false, costUsd: 0, model: o.model || DEFAULT_IMAGE_MODEL };
  }
  const prompt = [
    ...translatePromptCore(o.targetLanguage, o.productContext, o.instruction),
    "Return only the edited image, same framing and aspect ratio as the original.",
  ]
    .filter(Boolean)
    .join("\n");
  o.ctx?.setStatus("Görsel çevriliyor…");
  const r = await run("translate-image", [o.imageUrl], prompt, 0, o);
  return { sourceUrl: o.imageUrl, resultUrl: r.resultUrl, changed: true, costUsd: r.costUsd, model: r.model };
}

export async function openaiEditImage(
  o: OpenAIImageOpts & { imageUrl: string; instruction: string; productContext?: string; imageSpec?: string },
): Promise<OpenAIImageOut> {
  const prompt = [
    "You are a precise product-image editor. Apply EXACTLY this edit to the attached image:",
    `"${o.instruction.slice(0, 800)}"`,
    o.productContext ? `Product context: ${o.productContext.slice(0, 300)}.` : "",
    "Keep everything else unchanged unless the instruction explicitly says otherwise. Do NOT add watermarks, logos or extra text. Preserve the product's real proportions and colours unless asked.",
    `If the edit involves any text, ${CHERRY_PROFILE_DIRECTIVE} Any text in the result must be English — never leave or add Chinese characters.`,
    o.imageSpec ? `Output target: ${o.imageSpec}.` : "",
    "Return only the edited image, same framing and aspect ratio as the original.",
  ]
    .filter(Boolean)
    .join("\n");
  o.ctx?.setStatus("Görsel düzenleniyor…");
  const r = await run("edit-image", [o.imageUrl], prompt, 0, o);
  return { sourceUrl: o.imageUrl, resultUrl: r.resultUrl, changed: true, costUsd: r.costUsd, model: r.model };
}

export async function openaiComposeImages(
  o: OpenAIImageOpts & { imageUrls: string[]; instruction: string; productContext?: string; brandBrief?: string; imageSpec?: string },
): Promise<OpenAIImageOut> {
  const srcs = o.imageUrls.slice(0, 16); // the Images API takes up to 16 source images
  const prompt = [
    "You are a senior e-commerce creative director. Using ONLY the attached product photo(s) as source",
    "material, create ONE brand-new, professionally designed image.",
    "",
    `BRIEF:\n${o.instruction.slice(0, 6000)}`,
    "",
    o.brandBrief?.trim()
      ? `BRAND BRIEF (match this brand's identity exactly — positioning, palette, lighting, styling, tone):\n${o.brandBrief.trim().slice(0, 6000)}`
      : "",
    o.productContext ? `Product context: ${o.productContext.slice(0, 300)}.` : "",
    `${srcs.length} source image(s) attached.`,
    "RULES:",
    "- The real product must stay accurate: same shape, colours, proportions, textures and any real printed markings.",
    "- Do NOT invent a different product, and do NOT add fake logos, brand names, prices or claims.",
    "- Clean, balanced, modern composition. If you add text, keep it minimal, in English, correctly spelled — never any Chinese characters.",
    "- This is a real independent premium brand: NEVER a dropshipping / AliExpress / Temu / generic-marketplace look — no cluttered collages, rainbow gradients, discount badges, arrows, checkmark call-outs, stock watermarks or plastic HDR.",
    CHERRY_PROFILE_DIRECTIVE,
    NO_CJK_DIRECTIVE,
    o.imageSpec ? `Output target: ${o.imageSpec}.` : "Output a square image.",
    "Return only the finished image.",
  ]
    .filter(Boolean)
    .join("\n");
  o.ctx?.setStatus("Yeni görsel oluşturuluyor…");
  const r = await run("compose-image", srcs, prompt, 0, o);
  return { sourceUrl: srcs[0], resultUrl: r.resultUrl, changed: true, costUsd: r.costUsd, model: r.model };
}
