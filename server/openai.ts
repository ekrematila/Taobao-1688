// OpenAI (ChatGPT) transport — Responses API over plain fetch (no SDK dependency).
// Docs: developers.openai.com/api/docs/api-reference/responses/create
//
// Only the wire format lives here; model/effort/fast policy and cost logging stay
// in llm.ts's ask() so every feature that already calls ask() gets ChatGPT for free.

import { env } from "./env.ts";
import { getSetting } from "./db.ts";

export class OpenAIHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function activeOpenAIKey(): string {
  return getSetting("openai_key") || env.openaiKey;
}
export function openaiConfigured(): boolean {
  return Boolean(activeOpenAIKey());
}

export interface OpenAIRequest {
  model: string;
  system: string;
  user: string;
  images?: { data: string; mime: string }[];
  maxOutputTokens: number;
  /** "none" | "low" | … | "max" — already clamped to what the model supports */
  effort: string;
  /** service_tier=priority ("Fast mode", billed 2x) */
  fast?: boolean;
  signal?: AbortSignal;
}

export interface OpenAIResult {
  text: string;
  /** "completed" | "incomplete" | "failed" … */
  status: string;
  incompleteReason: string;
  /** the tier the request was actually served on ("default" | "priority" | "flex" …) */
  serviceTier: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

const SUPPORTED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function headers(key: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
}

async function errorOf(res: Response): Promise<OpenAIHttpError> {
  const body: any = await res.json().catch(() => ({}));
  const msg = body?.error?.message || `OpenAI ${res.status}`;
  return new OpenAIHttpError(msg, res.status);
}

/** One Responses API call, with a short retry on 429 / 5xx / dropped connections. */
export async function openaiRespond(req: OpenAIRequest, overrideKey?: string): Promise<OpenAIResult> {
  const key = overrideKey || activeOpenAIKey();
  if (!key) throw new OpenAIHttpError("OPENAI_API_KEY ayarlı değil.", 400);

  const content: any[] = [
    // images first, like the Anthropic path: visual context for the text that follows
    ...(req.images ?? []).map((img) => ({
      type: "input_image",
      image_url: `data:${SUPPORTED_IMAGE_MIME.has(img.mime) ? img.mime : "image/jpeg"};base64,${img.data}`,
      detail: "auto",
    })),
    { type: "input_text", text: req.user },
  ];
  const body: Record<string, unknown> = {
    model: req.model,
    instructions: req.system,
    input: [{ role: "user", content }],
    max_output_tokens: req.maxOutputTokens,
    reasoning: { effort: req.effort },
    store: false,
  };
  if (req.fast) body.service_tier = "priority";

  const signal = req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(600_000)]) : AbortSignal.timeout(600_000);
  const delays = [1000, 3000, 6000];
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${env.openaiBase}/responses`, {
        method: "POST",
        headers: headers(key),
        body: JSON.stringify(body),
        signal,
      });
    } catch (e: any) {
      if (e?.name === "AbortError" || e?.name === "TimeoutError" || attempt >= delays.length) {
        if (e?.name === "AbortError") throw e;
        // 400, never 502/504 — Cloudflare swaps those bodies for its own HTML page
        throw new OpenAIHttpError(`OpenAI ağ hatası: ${e?.message || e}`, 400);
      }
      await new Promise((r) => setTimeout(r, delays[attempt]));
      continue;
    }
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
        continue;
      }
      throw await errorOf(res);
    }
    return parseResponse(await res.json());
  }
}

function parseResponse(j: any): OpenAIResult {
  let text = "";
  if (typeof j?.output_text === "string") text = j.output_text;
  else
    for (const item of j?.output ?? [])
      if (item?.type === "message")
        for (const c of item.content ?? []) if (c?.type === "output_text" && typeof c.text === "string") text += c.text;
  const u = j?.usage ?? {};
  return {
    text,
    status: String(j?.status ?? ""),
    incompleteReason: String(j?.incomplete_details?.reason ?? ""),
    serviceTier: String(j?.service_tier ?? ""),
    inputTokens: Number(u.input_tokens) || 0,
    cachedTokens: Number(u.input_tokens_details?.cached_tokens) || 0,
    outputTokens: Number(u.output_tokens) || 0,
    reasoningTokens: Number(u.output_tokens_details?.reasoning_tokens) || 0,
  };
}

/** Live check for the Settings page — the model ids this key can use. */
export async function openaiListModels(overrideKey?: string): Promise<string[]> {
  return (await openaiListModelsDetailed(overrideKey)).map((m) => m.id).sort();
}

/** id + release time (unix seconds) of every model this key can use. */
export async function openaiListModelsDetailed(overrideKey?: string): Promise<{ id: string; created: number }[]> {
  const key = overrideKey || activeOpenAIKey();
  if (!key) throw new OpenAIHttpError("OPENAI_API_KEY ayarlı değil.", 400);
  let res: Response;
  try {
    res = await fetch(`${env.openaiBase}/models`, { headers: headers(key), signal: AbortSignal.timeout(20_000) });
  } catch (e: any) {
    throw new OpenAIHttpError(`OpenAI ağ hatası: ${e?.message || e}`, 400);
  }
  if (!res.ok) throw await errorOf(res);
  const j: any = await res.json();
  return (j?.data ?? []).map((m: any) => ({ id: String(m.id), created: Number(m.created) || 0 }));
}

let idsMemo: { at: number; key: string; ids: string[] } | null = null;

/** Model ids for the Settings panel — one OpenAI call per half hour, not per page view. */
export async function openaiModelIdsCached(force = false): Promise<string[]> {
  const key = activeOpenAIKey();
  if (!key) return [];
  if (!force && idsMemo && idsMemo.key === key && Date.now() - idsMemo.at < 30 * 60 * 1000) return idsMemo.ids;
  const ids = await openaiListModels();
  idsMemo = { at: Date.now(), key, ids };
  return ids;
}
