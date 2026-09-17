// One-click "push my AI/API settings to another instance of this app"
// (e.g. local dev -> production), mirroring the Etsy Command Center pairing
// pattern: the login password is only ever used once, to exchange it for a
// durable random key, which every later push then authenticates with — the
// password itself is never stored or resent.
//
// Scope is deliberately narrow: OneBound/Claude/Manus credentials, AI
// preferences, product-type presets, brand info, UI language. Shopify
// credentials and the Etsy-app pairing are deployment-specific and are
// never included, so a push can never overwrite either instance's own
// independently-configured store/app connections.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "./db.ts";

export class ProdSyncError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const SYNC_KEY_SETTING = "settings_sync_key";

const SYNC_FIELDS = [
  "onebound_key",
  "onebound_secret",
  "anthropic_key",
  "manus_key",
  "llm_model",
  "llm_effort",
  "llm_thinking",
  "llm_fast",
  "manus_agent_profile",
  "manus_usd_per_credit",
  "anthropic_balance_usd",
  "ui_lang",
  "brand_url",
  "brand_brief",
  "product_types",
] as const;

/** The receiving side's durable sync key — issued the first time it's asked
 *  for (behind the normal login gate), so older DBs need no migration. */
export function ensureSyncKey(): string {
  let key = getSetting(SYNC_KEY_SETTING);
  if (!key) {
    key = randomBytes(24).toString("hex");
    setSetting(SYNC_KEY_SETTING, key);
  }
  return key;
}

export function syncKeyMatches(presented: string): boolean {
  const real = getSetting(SYNC_KEY_SETTING);
  if (!real || !presented) return false;
  const a = Buffer.from(real);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Current values of the syncable fields, raw (never masked) — only ever
 *  sent over HTTPS to a target the operator typed in themselves, and only
 *  authenticated by the exchanged key above. */
export function readSyncableSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SYNC_FIELDS) {
    const v = getSetting(key);
    if (v !== null) out[key] = v;
  }
  return out;
}

export function applySyncedSettings(patch: Record<string, unknown>): number {
  let n = 0;
  for (const key of SYNC_FIELDS) {
    const v = (patch as Record<string, unknown>)[key];
    if (typeof v === "string") {
      setSetting(key, v);
      n++;
    }
  }
  return n;
}

export function productionUrl(): string {
  return getSetting("production_url") || "";
}
export function productionConnected(): boolean {
  return Boolean(getSetting("production_url") && getSetting("production_sync_key"));
}
export function clearProduction(): void {
  setSetting("production_url", "");
  setSetting("production_sync_key", "");
}

/** SENDING side: pair with another (e.g. production) instance of this app.
 *  `password` is that instance's own login password — used exactly once,
 *  here, to log in and fetch its durable sync key; never stored. */
export async function pairProduction(baseUrl: string, password: string): Promise<{ url: string }> {
  const base = baseUrl.replace(/\/+$/, "");
  if (!/^https?:\/\/.+/i.test(base)) throw new ProdSyncError("Geçerli bir adres girin.");

  let loginRes: Response;
  try {
    loginRes = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ProdSyncError(`${base} adresine ulaşılamadı.`, 502);
  }
  if (!loginRes.ok) throw new ProdSyncError("Şifre yanlış ya da giriş başarısız.", 401);
  // a passwordless target answers {authed:true} with no cookie at all — its
  // own auth gate lets everything through in that case, so no cookie is fine.
  const cookie = loginRes.headers.get("set-cookie");

  let keyRes: Response;
  try {
    keyRes = await fetch(`${base}/api/settings/sync-key`, {
      method: "POST",
      headers: cookie ? { Cookie: cookie.split(";")[0] } : {},
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ProdSyncError(`${base} adresine ulaşılamadı.`, 502);
  }
  const json = await keyRes.json().catch(() => ({}));
  if (!keyRes.ok || !json?.key) throw new ProdSyncError(json?.error || "Eşleşme anahtarı alınamadı.", 502);

  setSetting("production_url", base);
  setSetting("production_sync_key", String(json.key));
  return { url: base };
}

/** SENDING side: push this instance's current AI/API settings to the
 *  already-paired instance. */
export async function pushToProduction(): Promise<{ url: string; fields: number }> {
  const base = productionUrl();
  const key = getSetting("production_sync_key") || "";
  if (!base || !key) throw new ProdSyncError("Önce production ile eşleştirin.", 400);

  const payload = readSyncableSettings();
  let res: Response;
  try {
    res = await fetch(`${base}/api/settings/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Settings-Sync-Key": key },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ProdSyncError(`${base} adresine ulaşılamadı.`, 502);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProdSyncError(json?.error || `Sunucu ${res.status} döndü.`, res.status >= 500 ? 502 : 400);
  return { url: base, fields: Number(json?.applied ?? Object.keys(payload).length) };
}
