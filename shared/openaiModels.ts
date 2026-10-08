// What OpenAI's /v1/models returns is one flat blob (100+ ids: chat, codex, image,
// speech, transcription, realtime, embeddings, dated snapshots, legacy…).
// This sorts it by PURPOSE and picks a price/performance default for each, so the
// Settings page and every AI picker can show a handful of relevant choices instead
// of a wall of chips. Pure functions, shared by the server, the tests and the client.
//
// Facts this encodes (developers.openai.com, Oct 2026):
//   - images: gpt-image-2.5-sunburst (most capable / editing precision) and
//     gpt-image-2.5-flare (fastest everyday) share GPT Image 2's token prices;
//   - transcription: gpt-transcribe ($0.0045/min) is OpenAI's recommended file model;
//   - realtime: gpt-realtime-mini is deprecated, gpt-realtime-2.1(-mini) replace it;
//   - video: the Sora models and the Videos API were SHUT DOWN on 2026-09-24 with no
//     replacement, so there is nothing to recommend (or build) for video.

export type OpenAICategory = "text" | "code" | "image" | "speech" | "transcription" | "realtime" | "video" | "other";

/** Display order of the purposes the Settings page offers a default for. */
export const OPENAI_CATEGORIES: OpenAICategory[] = ["text", "code", "image", "speech", "transcription", "realtime", "video"];

/** Purposes OpenAI no longer serves at all (nothing to pick, nothing to build). */
export const OPENAI_UNAVAILABLE: Partial<Record<OpenAICategory, string>> = {
  video: "Sora models and the Videos API were shut down on 2026-09-24 (no replacement).",
};

export interface ClassifiedModel {
  id: string;
  category: OpenAICategory;
  /** dated snapshot (…-2025-04-14, …-0613) — pinned copy of an id that already exists */
  snapshot: boolean;
  /** gpt-3.5 / gpt-4* / o1-o4 chat models, or a model OpenAI has deprecated / shut down */
  legacy: boolean;
}

const DEPRECATED = /^(sora|gpt-realtime-mini$)/;

export function classifyOpenAIModel(rawId: string): ClassifiedModel {
  const id = rawId.toLowerCase();
  const snapshot = /-\d{4}-\d{2}-\d{2}$/.test(id) || /-\d{4}$/.test(id);
  const oldChat = /^(gpt-3\.5|gpt-4)/.test(id) || /^o[1-4](-|$)/.test(id);
  let category: OpenAICategory = "other";
  if (/^sora/.test(id)) category = "video";
  else if (/(^|-)image(-|$)|^dall-e|^chatgpt-image/.test(id)) category = "image";
  else if (/transcribe|whisper/.test(id)) category = "transcription";
  else if (/tts|speech/.test(id)) category = "speech";
  else if (/realtime|audio|^gpt-live/.test(id)) category = "realtime";
  else if (/embedding|moderation/.test(id)) category = "other";
  else if (/codex/.test(id)) category = "code";
  else if (/^(gpt-|o\d|chatgpt-)/.test(id)) category = "text";
  const legacy = DEPRECATED.test(id) || ((category === "text" || category === "code") && oldChat);
  return { id: rawId, category, snapshot, legacy };
}

/** Numeric version of an id for "newest first": gpt-5.2-codex -> [5,2]; gpt-image-2.5-flare -> [2,5]. */
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
  why: "bestValue" | "cheapest" | "newest" | "bestForEditing";
}

/** Current GPT-6 / GPT-5.6 flagships — OpenAI describes these (not a separate codex line) as its coding models. */
const CODING_FLAGSHIP = /^gpt-(6|5\.[6-9])(\.\d+)?-[a-z]+$|^gpt-6$/;

/** The price/performance pick for one purpose among the ids this key can use (or undefined). */
export function recommendOpenAI(category: OpenAICategory, ids: string[]): Recommendation | undefined {
  const pool = ids
    .map(classifyOpenAIModel)
    .filter((m) => !m.snapshot && !m.legacy && (m.category === category || (category === "code" && m.category === "text" && CODING_FLAGSHIP.test(m.id.toLowerCase()))))
    .map((m) => m.id);
  const has = (id: string) => pool.find((p) => p.toLowerCase() === id);
  const newest = (re: RegExp) => pool.filter((p) => re.test(p.toLowerCase())).sort(newestFirst)[0];
  const pick = (id: string | undefined, why: Recommendation["why"]): Recommendation | undefined => (id ? { id, why } : undefined);
  const firstOf = (list: string[], why: Recommendation["why"]) => {
    for (const id of list) {
      const hit = has(id);
      if (hit) return { id: hit, why };
    }
    return undefined;
  };

  switch (category) {
    case "text":
      // near-flagship quality at the flagship-minus price: GPT-6.1 Sol first, then the
      // next-best value tiers; otherwise the newest plain chat model
      return (
        firstOf(["gpt-6.1-sol", "gpt-6-sol", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.5"], "bestValue") ??
        pick(pool.filter((p) => /^gpt-[\d.]+(-[a-z]+)?$/.test(p.toLowerCase()) && !/-pro$/.test(p.toLowerCase())).sort(newestFirst)[0], "newest")
      );
    case "code":
      // the GPT-6 line is OpenAI's coding line now; older dedicated codex ids are the fallback
      return (
        firstOf(["gpt-6.1-sol", "gpt-6-sol"], "bestValue") ??
        pick(newest(/^gpt-[\d.]+-codex$/), "bestValue") ??
        pick(pool.sort(newestFirst)[0], "newest")
      );
    case "image":
      // this app edits real product photos, so editing precision wins; flare is the fast
      // everyday alternative at the same token prices; mini is the budget fallback
      return (
        firstOf(["gpt-image-2.5-sunburst"], "bestForEditing") ??
        firstOf(["gpt-image-2.5-flare"], "bestValue") ??
        firstOf(["gpt-image-2", "gpt-image-1.5"], "bestValue") ??
        pick(newest(/^gpt-image-[\d.]+-mini$/), "cheapest") ??
        pick(pool.sort(newestFirst)[0], "newest")
      );
    case "speech":
      return pick(has("gpt-4o-mini-tts"), "cheapest") ?? pick(newest(/tts/), "newest");
    case "transcription": {
      // file transcription only (live / realtime / diarize variants are for other jobs)
      const files = pool.filter((p) => !/live|realtime|diarize/.test(p.toLowerCase()));
      const f = (id: string) => files.find((p) => p.toLowerCase() === id);
      return pick(f("gpt-transcribe"), "bestValue") ?? pick(f("gpt-4o-mini-transcribe"), "cheapest") ?? pick(f("gpt-4o-transcribe"), "bestValue") ?? pick(files.sort(newestFirst)[0], "newest");
    }
    case "realtime":
      return (
        pick(newest(/^gpt-realtime-[\d.]+-mini$/), "cheapest") ??
        pick(newest(/^gpt-realtime-[\d.]+$/), "bestValue") ??
        pick(has("gpt-live-1"), "bestValue") ??
        pick(pool.sort(newestFirst)[0], "newest")
      );
    default:
      return undefined; // video and "other": nothing to recommend
  }
}

export interface GroupedOpenAIModels {
  /** current, non-legacy, non-snapshot ids per purpose (newest first) */
  current: Record<OpenAICategory, string[]>;
  /** everything hidden by default (snapshots, legacy, deprecated), per purpose */
  hidden: Record<OpenAICategory, string[]>;
  recommended: Partial<Record<OpenAICategory, Recommendation>>;
}

export function groupOpenAIModels(ids: string[]): GroupedOpenAIModels {
  const empty = (): Record<OpenAICategory, string[]> => ({ text: [], code: [], image: [], speech: [], transcription: [], realtime: [], video: [], other: [] });
  const current = empty();
  const hidden = empty();
  const classified = ids.map(classifyOpenAIModel);
  for (const m of classified) (m.snapshot || m.legacy ? hidden : current)[m.category].push(m.id);
  // the GPT-6 / 5.6 flagships are the coding line too — offer them under Coding as well
  for (const m of classified) if (!m.snapshot && !m.legacy && m.category === "text" && CODING_FLAGSHIP.test(m.id.toLowerCase())) current.code.push(m.id);
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
