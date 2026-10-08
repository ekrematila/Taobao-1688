// What OpenAI's /v1/models returns is one flat blob (100+ ids: chat, codex, image,
// speech, transcription, realtime, video, embeddings, dated snapshots, legacy…).
// This sorts it by PURPOSE and picks a price/performance default for each, so the
// Settings page can show it as a handful of clear choices instead of a wall of chips.
// Pure functions, shared by the server tests and the client.

export type OpenAICategory = "text" | "code" | "image" | "speech" | "transcription" | "realtime" | "video" | "other";

/** Display order of the purposes the Settings page offers a default for. */
export const OPENAI_CATEGORIES: OpenAICategory[] = ["text", "code", "image", "speech", "transcription", "realtime", "video"];

export interface ClassifiedModel {
  id: string;
  category: OpenAICategory;
  /** dated snapshot (…-2025-04-14, …-0613) — pinned copy of an id that already exists */
  snapshot: boolean;
  /** gpt-3.5 / gpt-4* / o1 / o3 / o4 — still callable, but not what you'd pick today */
  legacy: boolean;
}

export function classifyOpenAIModel(rawId: string): ClassifiedModel {
  const id = rawId.toLowerCase();
  const snapshot = /-\d{4}-\d{2}-\d{2}$/.test(id) || /-\d{4}$/.test(id);
  const legacy = /^(gpt-3\.5|gpt-4)/.test(id) || /^o[1-4](-|$)/.test(id);
  let category: OpenAICategory = "other";
  if (/^sora/.test(id)) category = "video";
  else if (/(^|-)image(-|$)|^dall-e|^chatgpt-image/.test(id)) category = "image";
  else if (/transcribe|whisper/.test(id)) category = "transcription";
  else if (/tts|speech/.test(id)) category = "speech";
  else if (/realtime|audio/.test(id)) category = "realtime";
  else if (/embedding|moderation/.test(id)) category = "other";
  else if (/codex/.test(id)) category = "code";
  else if (/^(gpt-|o\d|chatgpt-)/.test(id)) category = "text";
  // legacy is about the generation, not the purpose — an old TTS model isn't "legacy" noise
  return { id: rawId, category, snapshot, legacy: category === "text" || category === "code" ? legacy : false };
}

/** Numeric version of an id for "newest first": gpt-5.2-codex -> [5,2]; gpt-image-2 -> [2]. */
function versionOf(id: string): number[] {
  const m = id.match(/(\d+(?:\.\d+)*)/);
  return m ? m[1].split(".").map(Number) : [0];
}
function newestFirst(a: string, b: string): number {
  const va = versionOf(a);
  const vb = versionOf(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (vb[i] ?? 0) - (va[i] ?? 0);
    if (d) return d;
  }
  return a.localeCompare(b);
}

export interface Recommendation {
  id: string;
  /** i18n key suffix explaining the pick */
  why: "bestValue" | "cheapest" | "newest";
}

/** The price/performance pick for one purpose among the ids this key can use (or undefined). */
export function recommendOpenAI(category: OpenAICategory, ids: string[]): Recommendation | undefined {
  const all = ids.map(classifyOpenAIModel).filter((m) => m.category === category && !m.snapshot && !m.legacy);
  const pool = all.map((m) => m.id);
  const has = (id: string) => pool.find((p) => p.toLowerCase() === id);
  const newest = (re: RegExp) => pool.filter((p) => re.test(p.toLowerCase())).sort(newestFirst)[0];
  const pick = (id: string | undefined, why: Recommendation["why"]) => (id ? { id, why } : undefined);

  switch (category) {
    case "text": {
      // near-flagship quality at the flagship-minus price: GPT-6.1 Sol first, then the
      // next-best value tiers; otherwise the newest plain chat model
      for (const id of ["gpt-6.1-sol", "gpt-6-sol", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.5"]) {
        const hit = has(id);
        if (hit) return { id: hit, why: "bestValue" };
      }
      return pick(
        pool.filter((p) => /^gpt-[\d.]+(-[a-z]+)?$/.test(p.toLowerCase()) && !/-pro$/.test(p.toLowerCase())).sort(newestFirst)[0],
        "newest",
      );
    }
    case "code":
      return pick(newest(/^gpt-[\d.]+-codex$/), "bestValue") ?? pick(pool.sort(newestFirst)[0], "newest");
    case "image":
      return pick(newest(/^gpt-image-[\d.]+-mini$/), "cheapest") ?? pick(newest(/^gpt-image-[\d.]+$/), "bestValue") ?? pick(pool[0], "newest");
    case "speech":
      return pick(has("gpt-4o-mini-tts"), "cheapest") ?? pick(newest(/tts/), "newest");
    case "transcription":
      return pick(has("gpt-4o-mini-transcribe"), "cheapest") ?? pick(has("gpt-4o-transcribe"), "bestValue") ?? pick(newest(/transcribe|whisper/), "newest");
    case "realtime":
      return pick(newest(/realtime.*mini|mini.*realtime/), "cheapest") ?? pick(has("gpt-realtime"), "bestValue") ?? pick(newest(/realtime|audio/), "newest");
    case "video":
      return pick(has("sora-2"), "bestValue") ?? pick(newest(/^sora/), "newest");
    default:
      return undefined;
  }
}

export interface GroupedOpenAIModels {
  /** current, non-legacy, non-snapshot ids per purpose (newest first) */
  current: Record<OpenAICategory, string[]>;
  /** everything hidden by default (snapshots + legacy), per purpose */
  hidden: Record<OpenAICategory, string[]>;
  recommended: Partial<Record<OpenAICategory, Recommendation>>;
}

export function groupOpenAIModels(ids: string[]): GroupedOpenAIModels {
  const empty = (): Record<OpenAICategory, string[]> => ({ text: [], code: [], image: [], speech: [], transcription: [], realtime: [], video: [], other: [] });
  const current = empty();
  const hidden = empty();
  for (const m of ids.map(classifyOpenAIModel)) (m.snapshot || m.legacy ? hidden : current)[m.category].push(m.id);
  for (const k of Object.keys(current) as OpenAICategory[]) {
    current[k].sort(newestFirst);
    hidden[k].sort(newestFirst);
  }
  const recommended: GroupedOpenAIModels["recommended"] = {};
  for (const c of OPENAI_CATEGORIES) {
    const r = recommendOpenAI(c, ids);
    if (r) recommended[c] = r;
  }
  return { current, hidden, recommended };
}
