// OpenAI image editing (gpt-image-*) and file transcription over plain fetch + multipart.
// Same transport rules as openai.ts: bearer key from Settings/.env, short retry on
// 429 / 5xx / dropped connections, errors surfaced with OpenAI's own message.
//   POST /v1/images/edits          multipart: model, prompt, image[] (up to 16), size, quality, output_format
//   POST /v1/audio/transcriptions  multipart: file (<= 25 MB; mp3 mp4 mpeg mpga m4a wav webm), model

import { env } from "./env.ts";
import { activeOpenAIKey, OpenAIHttpError } from "./openai.ts";
import { imageCostUsd, transcribeUsdPerMinute, type ImageUsage } from "@shared/openaiImages.ts";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;

async function postWithRetry(path: string, form: FormData, key: string, signal?: AbortSignal, timeoutMs = 600_000): Promise<any> {
  const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  const delays = [1000, 3000, 6000];
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${env.openaiBase}${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: sig });
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      if (attempt >= delays.length) throw new OpenAIHttpError(`OpenAI ağ hatası: ${e?.message || e}`, 400);
      await new Promise((r) => setTimeout(r, delays[attempt]));
      continue;
    }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < delays.length) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
      continue;
    }
    const body: any = await res.json().catch(() => ({}));
    const code = body?.error?.code;
    const msg =
      code === "moderation_blocked"
        ? "OpenAI içerik denetimi bu görseli/isteği engelledi (moderation_blocked)."
        : body?.error?.message || `OpenAI ${res.status}`;
    throw new OpenAIHttpError(msg, res.status);
  }
}

export interface ImageEditRequest {
  model: string;
  prompt: string;
  images: { data: string; mime: string }[];
  /** "auto" or WIDTHxHEIGHT (see pickImageSize) */
  size: string;
  /** low | medium | high | auto (+ xhigh | max on the 2.5 models) */
  quality: string;
  signal?: AbortSignal;
}

export interface ImageEditResult {
  /** the edited image, base64 (PNG) */
  b64: string;
  mime: string;
  usage: ImageUsage;
  costUsd: number;
}

export async function openaiImageEdit(req: ImageEditRequest, overrideKey?: string): Promise<ImageEditResult> {
  const key = overrideKey || activeOpenAIKey();
  if (!key) throw new OpenAIHttpError("OPENAI_API_KEY ayarlı değil.", 400);
  if (!req.images.length) throw new OpenAIHttpError("Düzenlenecek görsel yok.", 400);

  const form = new FormData();
  form.append("model", req.model);
  form.append("prompt", req.prompt.slice(0, 30000));
  form.append("size", req.size);
  form.append("quality", req.quality);
  form.append("output_format", "png");
  form.append("n", "1");
  // gpt-image-1 / 1.5 support input_fidelity (keep the unedited pixels faithful); the 2.x
  // models reject it, and -mini only takes "low" — so only send it where it helps and is valid
  if (/^gpt-image-1(\.5)?$/.test(req.model)) form.append("input_fidelity", "high");
  req.images.forEach((img, i) => {
    const mime = EXT[img.mime] ? img.mime : "image/jpeg";
    form.append("image[]", new Blob([new Uint8Array(Buffer.from(img.data, "base64"))], { type: mime }), `image${i + 1}.${EXT[mime]}`);
  });

  const j = await postWithRetry("/images/edits", form, key, req.signal);
  const b64 = j?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || !b64) throw new OpenAIHttpError("OpenAI görsel döndürmedi.", 400);
  const u = j?.usage ?? {};
  const usage: ImageUsage = {
    textIn: Number(u.input_tokens_details?.text_tokens) || 0,
    imageIn: Number(u.input_tokens_details?.image_tokens) || 0,
    out: Number(u.output_tokens) || 0,
  };
  return { b64, mime: "image/png", usage, costUsd: imageCostUsd(req.model, usage) };
}

export interface TranscribeResult {
  text: string;
  /** audio length when the API reported it (it does for duration-billed models) */
  seconds: number | null;
  costUsd: number;
  /** true when the length wasn't reported and the cost is a rough guess */
  estimated: boolean;
}

export async function openaiTranscribe(
  req: { model: string; file: Buffer; filename: string; mime: string; signal?: AbortSignal },
  overrideKey?: string,
): Promise<TranscribeResult> {
  const key = overrideKey || activeOpenAIKey();
  if (!key) throw new OpenAIHttpError("OPENAI_API_KEY ayarlı değil.", 400);
  if (req.file.length > TRANSCRIBE_MAX_BYTES)
    throw new OpenAIHttpError(`Ses/video dosyası ${Math.round(req.file.length / 1048576)} MB — OpenAI transkripsiyon sınırı 25 MB.`, 400);

  const form = new FormData();
  form.append("model", req.model);
  form.append("response_format", "json");
  form.append("file", new Blob([new Uint8Array(req.file)], { type: req.mime }), req.filename);

  const j = await postWithRetry("/audio/transcriptions", form, key, req.signal, 300_000);
  const text = String(j?.text ?? "").trim();
  const seconds = typeof j?.usage?.seconds === "number" ? j.usage.seconds : typeof j?.duration === "number" ? j.duration : null;
  // no length reported: assume ~1 MB per 30 s of mp4 audio+video as a deliberately rough upper-ish guess
  const minutes = seconds != null ? seconds / 60 : req.file.length / 1048576 / 2;
  return { text, seconds, costUsd: minutes * transcribeUsdPerMinute(req.model), estimated: seconds == null };
}
