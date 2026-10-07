// Live model discovery: asks each provider which models the configured key can
// use and merges anything the priced catalogue (shared/models.ts) doesn't know
// yet — so a new Claude / GPT release shows up in every model picker by itself,
// with no deploy. Newness is judged against the catalogue itself (anything
// released AFTER the newest model we already know), so no date is hard-coded.

import { getSetting, setSetting } from "./db.ts";
import { CLAUDE_MODELS, registerDiscovered, type ClaudeModel } from "@shared/models.ts";
import { claudeConfigured, listClaudeModelsLive } from "./llm.ts";
import { openaiConfigured, openaiListModelsDetailed } from "./openai.ts";

const TTL_MS = 6 * 60 * 60 * 1000;
const SETTING = "models_discovered";
const MAX_NEW_PER_PROVIDER = 6;

export interface ModelCatalog {
  models: ClaudeModel[];
  /** ids found live that the priced catalogue didn't have */
  discovered: string[];
  checkedAt: number;
  errors: string[];
}

let memo: ModelCatalog | null = null;
let inflight: Promise<ModelCatalog> | null = null;

const staticIds = () => new Set(CLAUDE_MODELS.filter((m) => !m.isNew && m.priceKnown !== false).map((m) => m.id));

/** Best price guess for an unpriced new id: newest catalogue model of the same family. */
function estimate(id: string, provider: "anthropic" | "openai"): { inPer1M: number; outPer1M: number } {
  const known = CLAUDE_MODELS.filter((m) => m.priceKnown !== false && !m.isNew);
  if (provider === "anthropic") {
    const tier = /(opus|sonnet|haiku|fable|mythos)/.exec(id)?.[1];
    const hit = known.find((m) => m.tier === (tier === "mythos" ? "fable" : tier));
    if (hit) return { inPer1M: hit.inPer1M, outPer1M: hit.outPer1M };
  } else {
    const suffix = /-([a-z]+)$/.exec(id)?.[1];
    const hit = known.find((m) => m.tier === "gpt" && suffix && m.id.endsWith("-" + suffix));
    if (hit) return { inPer1M: hit.inPer1M, outPer1M: hit.outPer1M };
  }
  return { inPer1M: 2, outPer1M: 10 };
}

function tierOf(id: string): ClaudeModel["tier"] {
  const t = /(opus|sonnet|haiku|fable|mythos)/.exec(id)?.[1];
  return t === "opus" || t === "sonnet" || t === "haiku" ? t : "fable";
}

async function discoverAnthropic(): Promise<ClaudeModel[]> {
  const live = await listClaudeModelsLive();
  const known = staticIds();
  const newestKnown = Math.max(0, ...live.filter((m) => known.has(m.id)).map((m) => m.createdAt));
  return live
    .filter((m) => !known.has(m.id) && /^claude-(opus|sonnet|haiku|fable|mythos)-\d/.test(m.id) && m.createdAt > newestKnown)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_NEW_PER_PROVIDER)
    .map((m) => ({
      id: m.id,
      label: `${m.displayName || m.id} · new`,
      ...estimate(m.id, "anthropic"),
      tier: tierOf(m.id),
      provider: "anthropic" as const,
      isNew: true,
      priceKnown: false,
    }));
}

async function discoverOpenAI(): Promise<ClaudeModel[]> {
  const live = await openaiListModelsDetailed();
  const known = staticIds();
  const newestKnown = Math.max(0, ...live.filter((m) => known.has(m.id)).map((m) => m.created));
  // chat/reasoning families only: gpt-<major>[.<minor>][-<name>] with major >= 5
  // (no dated snapshots, no image / audio / realtime / transcribe / tts variants)
  return live
    .filter((m) => !known.has(m.id) && /^gpt-([5-9]|\d{2,})(\.\d+)?(-[a-z]+)?$/.test(m.id) && m.created > newestKnown)
    .sort((a, b) => b.created - a.created)
    .slice(0, MAX_NEW_PER_PROVIDER)
    .map((m) => ({
      id: m.id,
      label: `${m.id.replace(/^gpt-/, "GPT-").replace(/-([a-z])/g, (_x, c: string) => " " + c.toUpperCase())} · new`,
      ...estimate(m.id, "openai"),
      tier: "gpt" as const,
      provider: "openai" as const,
      isNew: true,
      priceKnown: false,
    }));
}

function snapshot(discoveredModels: ClaudeModel[], errors: string[], checkedAt: number): ModelCatalog {
  registerDiscovered(discoveredModels);
  return {
    models: CLAUDE_MODELS.map((m) => ({ ...m })),
    discovered: discoveredModels.map((m) => m.id),
    checkedAt,
    errors,
  };
}

async function refresh(): Promise<ModelCatalog> {
  const found: ClaudeModel[] = [];
  const errors: string[] = [];
  const jobs: Promise<void>[] = [];
  if (claudeConfigured())
    jobs.push(
      discoverAnthropic().then(
        (r) => void found.push(...r),
        (e) => void errors.push(`Claude: ${e?.message || e}`),
      ),
    );
  if (openaiConfigured())
    jobs.push(
      discoverOpenAI().then(
        (r) => void found.push(...r),
        (e) => void errors.push(`ChatGPT: ${e?.message || e}`),
      ),
    );
  await Promise.all(jobs);
  const checkedAt = Date.now();
  // keep what we found last time when a provider is unreachable right now
  const merged = new Map<string, ClaudeModel>();
  for (const m of readPersisted()) merged.set(m.id, m);
  if (!errors.length) merged.clear();
  for (const m of found) merged.set(m.id, m);
  const list = [...merged.values()].filter((m) => !staticIds().has(m.id));
  setSetting(SETTING, JSON.stringify({ at: checkedAt, models: list }));
  return snapshot(list, errors, checkedAt);
}

function readPersisted(): ClaudeModel[] {
  try {
    const raw = JSON.parse(getSetting(SETTING) || "{}");
    return Array.isArray(raw.models) ? raw.models : [];
  } catch {
    return [];
  }
}

/** Restore last run's discoveries immediately (pricing works before the first live call). */
export function initModelCatalog(): void {
  try {
    const raw = JSON.parse(getSetting(SETTING) || "{}");
    registerDiscovered(Array.isArray(raw.models) ? raw.models : []);
  } catch {
    /* corrupt cache — the next refresh rewrites it */
  }
  void modelCatalog().catch(() => {});
  setInterval(() => void modelCatalog(true).catch(() => {}), TTL_MS).unref();
}

export async function modelCatalog(force = false): Promise<ModelCatalog> {
  if (!force && memo && Date.now() - memo.checkedAt < TTL_MS) return memo;
  if (!inflight)
    inflight = refresh()
      .then((c) => (memo = c))
      .finally(() => {
        inflight = null;
      });
  return inflight;
}
