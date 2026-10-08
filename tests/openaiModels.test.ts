import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOpenAIModel, groupOpenAIModels, recommendOpenAI } from "../shared/openaiModels.ts";

// ids taken from a real /v1/models response (133 entries, one flat blob)
const REAL = [
  "chatgpt-image-latest", "gpt-3.5-turbo", "gpt-3.5-turbo-0125", "gpt-4", "gpt-4-0613", "gpt-4.1", "gpt-4.1-2025-04-14",
  "gpt-4o", "gpt-4o-mini", "gpt-4o-mini-search-preview", "gpt-4o-mini-transcribe", "gpt-4o-mini-transcribe-2025-12-15",
  "gpt-4o-mini-tts", "gpt-4o-mini-tts-2025-12-15", "gpt-4o-transcribe", "gpt-4o-transcribe-diarize", "gpt-5", "gpt-5-2025-08-07",
  "gpt-5-chat-latest", "gpt-5-codex", "gpt-5-mini", "gpt-5-pro", "gpt-5-search-api", "gpt-5.1", "gpt-5.1-codex", "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini", "gpt-5.2", "gpt-5.2-codex", "gpt-5.2-pro", "gpt-5.3-chat-latest",
];

test("classify sorts the flat list by purpose and flags snapshots / legacy", () => {
  const c = (id: string) => classifyOpenAIModel(id);
  assert.equal(c("gpt-4o-mini-tts").category, "speech");
  assert.equal(c("gpt-4o-mini-transcribe-2025-12-15").category, "transcription");
  assert.equal(c("gpt-4o-mini-transcribe-2025-12-15").snapshot, true);
  assert.equal(c("gpt-5.1-codex-max").category, "code");
  assert.equal(c("chatgpt-image-latest").category, "image");
  assert.equal(c("gpt-image-2").category, "image");
  assert.equal(c("sora-2-pro").category, "video");
  assert.equal(c("gpt-realtime-mini").category, "realtime");
  assert.equal(c("gpt-5-search-api").category, "text");
  assert.equal(c("text-embedding-3-large").category, "other");
  assert.deepEqual([c("gpt-3.5-turbo").legacy, c("gpt-4-0613").legacy, c("gpt-4-0613").snapshot], [true, true, true]);
  assert.equal(c("gpt-5.2").legacy, false);
  // an old TTS model is a speech model, not "legacy chat noise"
  assert.equal(c("tts-1").legacy, false);
});

test("text default is GPT-6.1 Sol when the key has it, else the next best value, else the newest plain chat model", () => {
  assert.equal(recommendOpenAI("text", ["gpt-5.5", "gpt-6.1-sol", "gpt-6-astra"])?.id, "gpt-6.1-sol");
  assert.equal(recommendOpenAI("text", ["gpt-5.5", "gpt-5.6-terra"])?.id, "gpt-5.6-terra");
  // only older ids: newest non-pro plain model, never *-pro / *-chat-latest / search / snapshots
  assert.equal(recommendOpenAI("text", REAL)?.id, "gpt-5.2");
});

test("per-purpose price/performance defaults", () => {
  assert.equal(recommendOpenAI("code", REAL)?.id, "gpt-5.2-codex", "newest plain codex, not -max / -mini");
  assert.equal(recommendOpenAI("image", ["gpt-image-1", "gpt-image-2", "gpt-image-2-mini", "dall-e-3"])?.id, "gpt-image-2-mini");
  assert.equal(recommendOpenAI("image", ["gpt-image-1", "gpt-image-2"])?.id, "gpt-image-2");
  assert.equal(recommendOpenAI("speech", REAL)?.id, "gpt-4o-mini-tts");
  assert.equal(recommendOpenAI("transcription", REAL)?.id, "gpt-4o-mini-transcribe");
  assert.equal(recommendOpenAI("realtime", ["gpt-realtime", "gpt-realtime-mini"])?.id, "gpt-realtime-mini");
  assert.equal(recommendOpenAI("video", ["sora-2-pro", "sora-2"])?.id, "sora-2");
  assert.equal(recommendOpenAI("video", ["gpt-5.2"]), undefined, "nothing to recommend when the key has no such model");
});

test("grouping hides snapshots and legacy by default and keeps everything reachable", () => {
  const g = groupOpenAIModels(REAL);
  assert.ok(!g.current.text.includes("gpt-3.5-turbo") && g.hidden.text.includes("gpt-3.5-turbo"));
  assert.ok(!g.current.speech.includes("gpt-4o-mini-tts-2025-12-15") && g.hidden.speech.includes("gpt-4o-mini-tts-2025-12-15"));
  assert.equal(g.current.code[0], "gpt-5.2-codex", "newest first");
  const total = Object.values(g.current).flat().length + Object.values(g.hidden).flat().length;
  assert.equal(total, REAL.length, "no model is lost");
  assert.equal(g.recommended.code?.id, "gpt-5.2-codex");
});
