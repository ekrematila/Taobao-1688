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

/**
 * One HTTP round-trip + response-validity check. Split out so `callOnebound`
 * can retry just this part on a transient provider-side failure, without
 * rebuilding (and re-validating) the request each time.
 */
async function callOnce(url: string, redacted: string): Promise<RawCall> {
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

  // OneBound's OWN success/failure signal is `error_code`: "0000" = success,
  // anything else = a real failure (e.g. "5000" = "data error"). This is the
  // authoritative check — trust it whenever the field is present.
  //
  // The old check (`item`/`items`/... truthy => "has payload => not an error")
  // was fooled by OneBound's own failure shape: on a real error it still
  // returns `item: { format_check: "fail" }` — a non-empty OBJECT, so it read
  // as truthy and the error was silently swallowed. That created a "successful"
  // draft with no real title/price/images (title fell back to the raw pasted
  // URL) instead of surfacing the failure so the operator could just retry.
  const j = json as any;
  const errorCode = j?.error_code !== undefined ? String(j.error_code) : undefined;
  const isError =
    errorCode !== undefined
      ? errorCode !== "" && errorCode !== "0000"
      : // no error_code field at all (a few endpoints omit it) — fall back to
        // the old heuristic: an error message with no usable payload.
        Boolean(j?.error) && !(j?.item || j?.items || j?.items_list || j?.seller_info);
  if (isError) {
    const reason = j?.reason || j?.error || `error_code ${errorCode}` || "bilinmeyen hata";
    throw new OneboundError(`Sağlayıcı veri döndüremedi: ${reason}`, 502);
  }

  return { requestUrl: redacted, status: res.status, ms, json };
}

/**
 * One retry, after a short delay, ONLY for a provider-side failure (502 from
 * `callOnce` — bad/missing input never reaches here, `buildRequest` throws
 * those synchronously before any network call). OneBound occasionally answers
 * a perfectly valid product with a transient `error_code: "5000"` ("data
 * error") that a second, identical call resolves cleanly — confirmed: the
 * exact num_iid that produced this error came back with a full, valid item
 * moments later with nothing else changed.
 */
export async function callOnebound(input: ApiCallInput): Promise<RawCall> {
  const { url, redacted } = buildRequest(input);
  try {
    return await callOnce(url, redacted);
  } catch (e) {
    if (!(e instanceof OneboundError) || e.status !== 502) throw e;
    await new Promise((r) => setTimeout(r, 900));
    return callOnce(url, redacted);
  }
}
