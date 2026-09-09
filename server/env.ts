import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Tiny .env loader (no dependency). Only sets keys not already in process.env.
function loadDotEnv() {
  const file = join(root, ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

export const ROOT = root;

export const env = {
  port: Number(process.env.PORT || 8787),
  appPassword: process.env.APP_PASSWORD || "",
  sessionSecret: process.env.SESSION_SECRET || "dev-insecure-secret",
  isProd: process.env.NODE_ENV === "production",

  oneboundKey: process.env.ONEBOUND_KEY || "",
  oneboundSecret: process.env.ONEBOUND_SECRET || "",
  oneboundBase: (process.env.ONEBOUND_BASE || "https://api-gw.onebound.cn").replace(/\/$/, ""),

  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  llmModel: process.env.LLM_MODEL || "claude-sonnet-5",

  manusKey: process.env.MANUS_API_KEY || "",
  manusBase: (process.env.MANUS_BASE || "https://api.manus.ai").replace(/\/$/, ""),
  manusAgentProfile: process.env.MANUS_AGENT_PROFILE || "manus-1.6",
  // ~$0.005/credit is the effective rate on Manus paid plans (Standard $20 → 4,000
  // credits, Extended $200 → 40,000). Override via env or Settings.
  manusUsdPerCredit: Number(process.env.MANUS_USD_PER_CREDIT || 0.005),

  shopifyDomain: process.env.SHOPIFY_STORE_DOMAIN || "",
  shopifyToken: process.env.SHOPIFY_ADMIN_TOKEN || "",
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY || "",
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || "",
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION || "2025-01",

  previewReferenceUrl:
    process.env.PREVIEW_REFERENCE_URL || "https://keyartisan.net/products/cool-harry-potter-theme-keycap-set",
  // where the browser reaches this app (front-end origin) — used to build the
  // Shopify OAuth redirect_uri. Vite proxies /api → the API server.
  appPublicUrl: (process.env.APP_PUBLIC_URL || "http://localhost:5173").replace(/\/+$/, ""),
};

export function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "•".repeat(value.length);
  return value.slice(0, 3) + "•".repeat(Math.max(3, value.length - 6)) + value.slice(-3);
}
