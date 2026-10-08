// Which engine does the AI image work (translate overlay text / free-form edit / compose):
// the Manus agent or OpenAI's gpt-image models. One shared choice for every panel, kept in
// localStorage; api.ts reads it synchronously so each image job carries it automatically.

export type ImageEngine = "manus" | "openai";

export interface ImageEngineChoice {
  engine: ImageEngine;
  /** gpt-image model id; "" = the saved default / recommended one */
  model: string;
  /** low | medium | high | auto | xhigh | max */
  quality: string;
}

const KEY = "imageEngine";
const listeners = new Set<() => void>();
let cache: ImageEngineChoice | null | undefined;

function read(): ImageEngineChoice | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && (raw.engine === "manus" || raw.engine === "openai"))
      return { engine: raw.engine, model: String(raw.model || ""), quality: String(raw.quality || "high") };
  } catch {
    /* private mode / corrupt value — fall back to the default */
  }
  return null;
}

/** The explicit choice, or null when the operator never picked (callers then pick by which keys exist). */
export function getImageEngineChoice(): ImageEngineChoice | null {
  if (cache === undefined) cache = read();
  return cache;
}

export function setImageEngineChoice(next: ImageEngineChoice): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — keep it in memory for this session */
  }
  listeners.forEach((l) => l());
}

export function subscribeImageEngine(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The extra fields an image job sends: nothing for Manus (unchanged requests), engine + model + quality for OpenAI. */
export function imageEngineBody(): { engine?: "openai"; imageModel?: string; imageQuality?: string } {
  const c = getImageEngineChoice();
  return c?.engine === "openai" ? { engine: "openai", imageModel: c.model || undefined, imageQuality: c.quality || undefined } : {};
}
