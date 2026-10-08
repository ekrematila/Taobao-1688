import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOpenAIModel, groupOpenAIModels, recommendOpenAI, OPENAI_UNAVAILABLE } from "../shared/openaiModels.ts";

// ids from a real /v1/models response (flat blob) + the current models documented on
// developers.openai.com/api/docs/models (Oct 2026)
const REAL = [
  "chatgpt-image-latest", "gpt-3.5-turbo", "gpt-3.5-turbo-0125", "gpt-4", "gpt-4-0613", "gpt-4.1", "gpt-4.1-2025-04-14",
  "gpt-4o", "gpt-4o-mini", "gpt-4o-mini-search-preview", "gpt-4o-mini-transcribe", "gpt-4o-mini-transcribe-2025-12-15",
  "gpt-4o-mini-tts", "gpt-4o-mini-tts-2025-12-15", "gpt-4o-transcribe", "gpt-4o-transcribe-diarize", "gpt-5", "gpt-5-2025-08-07",
  "gpt-5-chat-latest", "gpt-5-codex", "gpt-5-mini", "gpt-5-pro", "gpt-5-search-api", "gpt-5.1", "gpt-5.1-codex", "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini", "gpt-5.2", "gpt-5.2-codex", "gpt-5.2-pro", "gpt-5.3-chat-latest",
];
const CURRENT = [
  ...REAL, "gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna", "gpt-image-2", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare",
  "gpt-transcribe", "gpt-live-transcribe", "gpt-realtime-whisper", "gpt-realtime-2.1", "gpt-realtime-2.1-mini", "gpt-realtime-mini",
  "gpt-live-1", "text-embedding-3-large", "omni-moderation-latest", "sora-2", "sora-2-pro",
];

test("classify sorts the flat list by purpose and flags snapshots / legacy / deprecated", () => {
  const c = (id: string) => classifyOpenAIModel(id);
  assert.equal(c("gpt-4o-mini-tts").category, "speech");
  assert.equal(c("gpt-4o-mini-transcribe-2025-12-15").category, "transcription");
  assert.equal(c("gpt-4o-mini-transcribe-2025-12-15").snapshot, true);
  assert.equal(c("gpt-transcribe").category, "transcription");
  assert.equal(c("gpt-5.1-codex-max").category, "code");
  assert.equal(c("chatgpt-image-latest").category, "image");
  assert.equal(c("gpt-image-2.5-sunburst").category, "image");
  assert.equal(c("gpt-realtime-2.1-mini").category, "realtime");
  assert.equal(c("gpt-live-1").category, "realtime");
  assert.equal(c("gpt-live-transcribe").category, "transcription");
  assert.equal(c("gpt-5-search-api").category, "text");
  assert.equal(c("text-embedding-3-large").category, "other");
  assert.deepEqual([c("gpt-3.5-turbo").legacy, c("gpt-4-0613").legacy, c("gpt-4-0613").snapshot], [true, true, true]);
  assert.equal(c("gpt-5.2").legacy, false);
  assert.equal(c("tts-1").legacy, false, "an old TTS model is a speech model, not legacy chat noise");
  // shut down / deprecated by OpenAI -> hidden by default
  assert.equal(c("sora-2").category, "video");
  assert.equal(c("sora-2").legacy, true);
  assert.equal(c("gpt-realtime-mini").legacy, true);
  assert.equal(c("gpt-realtime-2.1-mini").legacy, false);
});

test("text default is GPT-6.1 Sol when the key has it, else the next best value, else the newest plain chat model", () => {
  assert.equal(recommendOpenAI("text", ["gpt-5.5", "gpt-6.1-sol", "gpt-6-astra"])?.id, "gpt-6.1-sol");
  assert.equal(recommendOpenAI("text", ["gpt-5.5", "gpt-5.6-terra"])?.id, "gpt-5.6-terra");
  assert.equal(recommendOpenAI("text", REAL)?.id, "gpt-5.2", "never *-pro / *-chat-latest / search / snapshots");
});

test("coding default is the GPT-6 line (OpenAI's coding line); old codex ids are the fallback", () => {
  assert.equal(recommendOpenAI("code", CURRENT)?.id, "gpt-6.1-sol");
  assert.equal(recommendOpenAI("code", REAL)?.id, "gpt-5.2-codex", "newest plain codex, not -max / -mini");
});

test("image default prefers editing precision (sunburst), then flare, then older models, then mini", () => {
  assert.deepEqual(recommendOpenAI("image", CURRENT), { id: "gpt-image-2.5-sunburst", why: "bestForEditing" });
  assert.equal(recommendOpenAI("image", ["gpt-image-2.5-flare", "gpt-image-2"])?.id, "gpt-image-2.5-flare");
  assert.equal(recommendOpenAI("image", ["gpt-image-1", "gpt-image-2"])?.id, "gpt-image-2");
  assert.equal(recommendOpenAI("image", ["gpt-image-1", "gpt-image-1-mini"])?.id, "gpt-image-1-mini");
});

test("audio defaults: file transcription never picks a live/realtime model; realtime skips the deprecated mini", () => {
  assert.equal(recommendOpenAI("speech", CURRENT)?.id, "gpt-4o-mini-tts");
  assert.equal(recommendOpenAI("transcription", CURRENT)?.id, "gpt-transcribe");
  assert.equal(recommendOpenAI("transcription", ["gpt-live-transcribe", "gpt-realtime-whisper", "gpt-4o-mini-transcribe"])?.id, "gpt-4o-mini-transcribe");
  assert.equal(recommendOpenAI("realtime", CURRENT)?.id, "gpt-realtime-2.1-mini");
  assert.equal(recommendOpenAI("realtime", ["gpt-realtime-mini"]), undefined, "deprecated ids are never recommended");
});

test("video: OpenAI shut the Sora / Videos API down, so nothing is recommended and the reason is recorded", () => {
  assert.equal(recommendOpenAI("video", CURRENT), undefined);
  assert.match(OPENAI_UNAVAILABLE.video ?? "", /shut down/);
});

test("grouping hides snapshots / legacy by default, keeps everything reachable, and offers the GPT-6 line under Coding too", () => {
  const g = groupOpenAIModels(CURRENT);
  assert.ok(!g.current.text.includes("gpt-3.5-turbo") && g.hidden.text.includes("gpt-3.5-turbo"));
  assert.ok(!g.current.speech.includes("gpt-4o-mini-tts-2025-12-15") && g.hidden.speech.includes("gpt-4o-mini-tts-2025-12-15"));
  assert.ok(g.hidden.video.includes("sora-2") && g.current.video.length === 0);
  assert.ok(g.current.code.includes("gpt-6.1-sol") && g.current.code.includes("gpt-5.2-codex"));
  assert.deepEqual(g.current.image.slice(0, 2).sort(), ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"], "newest generation first");
  const total = Object.values(g.current).flat().length + Object.values(g.hidden).flat().length;
  const duplicatedUnderCode = g.current.code.filter((id) => g.current.text.includes(id)).length;
  assert.equal(total - duplicatedUnderCode, CURRENT.length, "no model is lost");
  assert.equal(g.recommended.code?.id, "gpt-6.1-sol");
});
