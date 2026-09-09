import { env } from "./env.ts";
import { getSetting } from "./db.ts";
import { ONEBOUND_ENDPOINTS, type ApiCallInput } from "@shared/types.ts";

export class OneboundError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** Effective credentials: DB override (set via Settings page) beats .env. */
export function oneboundCreds() {
  return {
    key: getSetting("onebound_key") ?? env.oneboundKey,
    secret: getSetting("onebound_secret") ?? env.oneboundSecret,
    base: getSetting("onebound_base") ?? env.oneboundBase,
  };
}

/** Pull a numeric product id out of a bare id or any taobao/1688/tmall URL. */
export function extractNumIid(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{6,}$/.test(s)) return s;
  const patterns = [
    /[?&]id=(\d{6,})/,
    /[?&]num_iid=(\d{6,})/,
    /\/offer\/(\d{6,})\.html/,
    /\/item\/(\d{6,})\.html/,
    /\/(\d{9,})(?:\.html)?(?:[?#]|$)/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  const any = s.match(/(\d{9,})/);
  return any ? any[1] : null;
}

interface BuiltRequest {
  url: string; // real, with creds
  redacted: string; // safe to show the client
}

function buildRequest(input: ApiCallInput): BuiltRequest {
  const ep = ONEBOUND_ENDPOINTS.find((e) => e.id === input.endpoint);
  if (!ep) throw new OneboundError(`İzin listesinde olmayan endpoint: ${input.endpoint}`, 400);

  const { key, secret, base } = oneboundCreds();
  if (!key || !secret) {
    throw new OneboundError("OneBound Key/Secret ayarlı değil. Ayarlar sayfasından ekleyin.", 400);
  }

  const platformPath = input.platform === "1688" ? "1688" : "taobao";
  const params = new URLSearchParams();
  params.set("lang", input.lang || "cn");

  if (ep.input === "id") {
    const numIid = extractNumIid(input.query);
    if (!numIid) throw new OneboundError("Geçerli bir ürün ID'si veya bağlantısı gerekli.", 400);
    params.set("num_iid", numIid);
  } else if (ep.input === "keyword") {
    if (!input.query.trim()) throw new OneboundError("Arama için anahtar kelime gerekli.", 400);
    params.set("q", input.query.trim());
    params.set("page", String(input.page || 1));
  }

  // Safe defaults the studio always applies.
  params.set("get_type", "1");
  params.set("result_type", "jsonu");
  if (input.noCache) params.set("cache", "no");

  const redacted = `${base}/${platformPath}/${ep.id}/?${params.toString()}&key=***&secret=***`;
  params.set("key", key);
  params.set("secret", secret);
  const url = `${base}/${platformPath}/${ep.id}/?${params.toString()}`;
  return { url, redacted };
}

export interface RawCall {
  requestUrl: string;
  status: number;
  ms: number;
  json: unknown;
}

export async function callOnebound(input: ApiCallInput): Promise<RawCall> {
  const { url, redacted } = buildRequest(input);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new OneboundError(`OneBound ağ hatası: ${(e as Error).message}`);
  }
  const ms = Date.now() - started;
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OneboundError("OneBound JSON olmayan bir yanıt döndürdü (muhtemelen kota/anahtar hatası).");
  }

  // OneBound puts an error object at the top level on failure.
  const err = (json as any)?.error || (json as any)?.error_code;
  const hasPayload =
    (json as any)?.item || (json as any)?.items || (json as any)?.items_list || (json as any)?.seller_info;
  if (err && !hasPayload) {
    const reason = (json as any)?.reason || (json as any)?.error || "bilinmeyen hata";
    throw new OneboundError(`Sağlayıcı veri döndüremedi: ${reason}`, 502);
  }

  return { requestUrl: redacted, status: res.status, ms, json };
}
