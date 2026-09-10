import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { CLAUDE_MODELS, EFFORT_LEVELS, EFFORT_LABEL, FAST_MODELS, MANUS_AGENT_PROFILES, type Effort } from "@shared/models.ts";
import type { KeySource, VerifyClaudeResult, VerifyManusResult, VerifyShopifyResult } from "@shared/types.ts";

export default function SettingsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const s = useQuery({ queryKey: ["settings"], queryFn: api.settings });

  const [obKey, setObKey] = useState("");
  const [obSecret, setObSecret] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [manusKey, setManusKey] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState<Effort>("high");
  const [thinking, setThinking] = useState<"adaptive" | "off">("adaptive");
  const [fast, setFast] = useState(false);
  const [profile, setProfile] = useState("manus-1.6");
  const [usdPerCredit, setUsdPerCredit] = useState(0.01);
  const [claudeBalance, setClaudeBalance] = useState(0);
  const [autoPush, setAutoPush] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [shopToken, setShopToken] = useState("");
  const [shopClientId, setShopClientId] = useState("");
  const [shopClientSecret, setShopClientSecret] = useState("");
  const [etsyUrl, setEtsyUrl] = useState("http://localhost:4317");
  const [pairing, setPairing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [vClaude, setVClaude] = useState<VerifyClaudeResult | "loading" | null>(null);
  const [vManus, setVManus] = useState<VerifyManusResult | "loading" | null>(null);
  const [vShop, setVShop] = useState<VerifyShopifyResult | "loading" | null>(null);

  // guards the initial s.data -> state sync so it doesn't trigger an auto-save
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // OAuth round-trip result (Shopify redirected back with ?shopify= / ?shopify_error=)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("shopify")) {
      toast(t("settings.shopifyConnected", { shop: p.get("shopify")! }), "ok");
      s.refetch();
    } else if (p.get("shopify_error")) {
      toast(`Shopify: ${p.get("shopify_error")}`, "err");
    }
    if (p.get("shopify") || p.get("shopify_error")) window.history.replaceState({}, "", "/settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (s.data) {
      setModel(s.data.llmModel);
      setEffort(s.data.llmEffort);
      setThinking(s.data.llmThinking);
      setFast(s.data.llmFast);
      setProfile(s.data.manusAgentProfile);
      setUsdPerCredit(s.data.manusUsdPerCredit);
      setClaudeBalance(s.data.anthropicBalanceUsd);
      setAutoPush(s.data.autoPushShopify);
      if (s.data.etsyAppUrl) setEtsyUrl(s.data.etsyAppUrl);
      hydrated.current = true;
    }
  }, [s.data]);

  /** Preferences (not keys) — persisted immediately on change, no Save click. */
  function prefsPatch() {
    return {
      llmModel: model || undefined,
      llmEffort: effort,
      llmThinking: thinking,
      llmFast: fast,
      manusAgentProfile: profile || undefined,
      manusUsdPerCredit: usdPerCredit > 0 ? usdPerCredit : undefined,
      anthropicBalanceUsd: claudeBalance >= 0 ? claudeBalance : undefined,
      autoPushShopify: autoPush,
    };
  }
  async function flushPrefs() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await api.saveSettings(prefsPatch());
    s.refetch();
  }
  // auto-save prefs (debounced, silent) whenever any of them changes
  useEffect(() => {
    if (!hydrated.current || !s.data) return;
    const d = s.data;
    const changed =
      model !== d.llmModel ||
      effort !== d.llmEffort ||
      thinking !== d.llmThinking ||
      fast !== d.llmFast ||
      profile !== d.manusAgentProfile ||
      usdPerCredit !== d.manusUsdPerCredit ||
      claudeBalance !== d.anthropicBalanceUsd ||
      autoPush !== d.autoPushShopify;
    if (!changed) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.saveSettings(prefsPatch()).then(() => s.refetch()).catch((e) => toast((e as Error).message, "err"));
    }, 350);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, effort, thinking, fast, profile, usdPerCredit, claudeBalance, autoPush]);

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await api.saveSettings({
        oneboundKey: obKey || undefined,
        oneboundSecret: obSecret || undefined,
        anthropicKey: claudeKey || undefined,
        manusKey: manusKey || undefined,
        shopifyDomain: shopDomain.trim() || undefined,
        shopifyToken: shopToken.trim() || undefined,
        shopifyClientId: shopClientId.trim() || undefined,
        shopifyClientSecret: shopClientSecret.trim() || undefined,
        ...prefsPatch(),
        ...extra,
      });
      setObKey("");
      setObSecret("");
      setClaudeKey("");
      setManusKey("");
      setShopToken("");
      setShopClientSecret("");
      toast(t("common.saved"), "ok");
      s.refetch();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function runVerifyClaude() {
    setVClaude("loading");
    try {
      await flushPrefs(); // make sure the server has the current slider values
      const r = await api.verifyClaude(claudeKey || undefined);
      setVClaude(r);
      if (r.ok && claudeKey) {
        await api.saveSettings({ anthropicKey: claudeKey });
        setClaudeKey("");
        toast(t("settings.verifiedSaved"), "ok");
        s.refetch();
      }
    } catch (e) {
      setVClaude({ ok: false, models: [], activeModel: "", effort: "", thinking: "", fast: false, fastModels: [], error: (e as Error).message });
    }
  }
  async function runVerifyManus() {
    setVManus("loading");
    try {
      await flushPrefs();
      const r = await api.verifyManus(manusKey || undefined);
      setVManus(r);
      if (r.ok && manusKey) {
        await api.saveSettings({ manusKey });
        setManusKey("");
        toast(t("settings.verifiedSaved"), "ok");
        s.refetch();
      }
    } catch (e) {
      setVManus({ ok: false, credits: null, base: "", authMode: null, agentProfiles: [], note: "", error: (e as Error).message });
    }
  }
  async function runVerifyShopify() {
    setVShop("loading");
    try {
      const r = await api.verifyShopify(shopDomain.trim() || undefined, shopToken.trim() || undefined);
      setVShop(r);
      if (r.ok && (shopDomain.trim() || shopToken.trim())) {
        await api.saveSettings({
          shopifyDomain: shopDomain.trim() || undefined,
          shopifyToken: shopToken.trim() || undefined,
        });
        setShopToken("");
        toast(t("settings.verifiedSaved"), "ok");
        s.refetch();
      }
    } catch (e) {
      setVShop({ ok: false, error: (e as Error).message });
    }
  }

  const srcLabel = (k: KeySource) => t(("settings.source." + k) as any);

  return (
    <>
      <div className="topbar">
        <div className="title">{t("nav.settings")}</div>
      </div>
      <div className="content grid" style={{ maxWidth: 820 }}>
        {/* OneBound */}
        <div className="card">
          <div className="card-h">
            <h3>🔑 {t("settings.secOnebound")}</h3>
          </div>
          <div className="card-b col" style={{ gap: 12 }}>
            <div className="row">
              <span className="badge">Key: {s.data?.oneboundKeyHint || "—"}</span>
              <span className="badge">Secret: {s.data?.oneboundSecretHint || "—"}</span>
              <span className="badge mono">{s.data?.oneboundBase}</span>
            </div>
            <p className="tiny muted">{t("settings.oneboundNote")}</p>
            <div className="row">
              <label className="field" style={{ flex: 1 }}>
                {t("settings.newOneboundKey")}
                <input type="text" value={obKey} onChange={(e) => setObKey(e.target.value)} placeholder={t("settings.blankKeeps")} />
              </label>
              <label className="field" style={{ flex: 1 }}>
                {t("settings.newOneboundSecret")}
                <input
                  type="password"
                  value={obSecret}
                  onChange={(e) => setObSecret(e.target.value)}
                  placeholder={t("settings.blankKeeps")}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Claude */}
        <div className="card">
          <div className="card-h">
            <h3>✦ {t("settings.secClaude")}</h3>
            <span className={"badge " + (s.data?.hasLlmKey ? "ok" : "warn")}>
              {s.data?.hasLlmKey ? t("settings.has") : t("settings.source.none")}
            </span>
          </div>
          <div className="card-b col" style={{ gap: 12 }}>
            <div className="row">
              <span className="badge">key: {s.data?.llmKeyHint || "—"}</span>
              <span className="badge">
                {t("usage.colProvider")}: {s.data ? srcLabel(s.data.llmKeySource) : "—"}
              </span>
            </div>
            <label className="field">
              ANTHROPIC_API_KEY — {t("settings.newKey")}
              <input type="password" value={claudeKey} onChange={(e) => setClaudeKey(e.target.value)} placeholder="sk-ant-…" />
            </label>
            <label className="field">
              {t("settings.claudeModel")}
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} — {m.label} (${m.inPer1M}/${m.outPer1M} /M)
                  </option>
                ))}
              </select>
            </label>
            <p className="tiny muted">{t("settings.claudeModelHint")}</p>

            <div className="metafield" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <b className="tiny">{t("settings.claudeAdvanced")}</b>
              <label className="field">
                {t("settings.effort")}
                <input
                  type="range"
                  min={0}
                  max={EFFORT_LEVELS.length - 1}
                  step={1}
                  value={EFFORT_LEVELS.indexOf(effort)}
                  onChange={(e) => setEffort(EFFORT_LEVELS[Number(e.target.value)])}
                />
                <span className="mono tiny">{EFFORT_LABEL[effort]}</span>
              </label>
              <p className="tiny muted" style={{ margin: 0 }}>{t("settings.effortHint")}</p>
              <label className="field">
                {t("settings.thinking")}
                <select value={thinking} onChange={(e) => setThinking(e.target.value as "adaptive" | "off")}>
                  <option value="adaptive">{t("settings.thinkingOn")}</option>
                  <option value="off">{t("settings.thinkingOff")}</option>
                </select>
              </label>
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" style={{ width: 15 }} checked={fast} onChange={(e) => setFast(e.target.checked)} />
                <span className="tiny">{t("settings.fast")}</span>
                {fast && !FAST_MODELS.includes(model) && <span className="badge warn">{FAST_MODELS.join(" / ")}</span>}
              </label>
              <p className="tiny muted" style={{ margin: 0 }}>{t("settings.fastHint", { models: FAST_MODELS.join(" / ") })}</p>
              <p className="tiny muted" style={{ margin: 0 }}>{t("settings.cachingNote")}</p>
            </div>

            <label className="field" style={{ maxWidth: 260 }}>
              {t("settings.claudeBalance")}
              <input
                type="number"
                step="1"
                min="0"
                value={claudeBalance}
                onChange={(e) => setClaudeBalance(Number(e.target.value) || 0)}
              />
            </label>
            <p className="tiny muted">{t("settings.claudeBalanceHint")}</p>

            <div className="row">
              <button className="btn sm" onClick={runVerifyClaude} disabled={vClaude === "loading"}>
                {vClaude === "loading" ? t("settings.verifying") : t("settings.verify")}
              </button>
              {s.data?.llmKeySource === "ui" && (
                <button className="btn ghost sm" onClick={() => save({ clearAnthropicKey: true })} disabled={busy}>
                  {t("settings.clear")}
                </button>
              )}
            </div>
            {vClaude && vClaude !== "loading" && (
              <div className="verifybox">
                <b className={vClaude.ok ? "ok-t" : "err-t"}>
                  {vClaude.ok ? "✓ " + t("settings.verifyOk") : "✗ " + t("settings.verifyFail")}
                </b>
                {vClaude.error && <div className="tiny err-t">{vClaude.error}</div>}
                {vClaude.ok && (
                  <>
                    <div className="tiny" style={{ margin: "4px 0" }}>
                      <span className="mono">
                        model={vClaude.activeModel} · effort={vClaude.effort} · thinking={vClaude.thinking} · fast=
                        {String(vClaude.fast)}
                      </span>
                    </div>
                    <div className="tiny muted" style={{ margin: "6px 0 4px" }}>
                      {t("settings.claudeModelsProof")} — {vClaude.models.length}
                    </div>
                    <div className="chips">
                      {vClaude.models.map((m) => (
                        <span key={m} className={"chip" + (m === vClaude.activeModel ? " active" : "")} style={{ cursor: "default" }}>
                          {m}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Manus */}
        <div className="card">
          <div className="card-h">
            <h3>🖼 {t("settings.secManus")}</h3>
            <span className={"badge " + (s.data?.hasManusKey ? "ok" : "warn")}>
              {s.data?.hasManusKey ? t("settings.has") : t("settings.source.none")}
            </span>
          </div>
          <div className="card-b col" style={{ gap: 12 }}>
            <div className="row">
              <span className="badge">key: {s.data?.manusKeyHint || "—"}</span>
              <span className="badge">
                {t("usage.colProvider")}: {s.data ? srcLabel(s.data.manusKeySource) : "—"}
              </span>
              <span className="badge mono">{s.data?.manusBase}</span>
              {s.data?.manusCredits != null && (
                <span className="badge brand">
                  {t("settings.manusBalanceLabel")}: {s.data.manusCredits}
                </span>
              )}
            </div>
            <label className="field">
              MANUS_API_KEY — {t("settings.newKey")}
              <input type="password" value={manusKey} onChange={(e) => setManusKey(e.target.value)} placeholder="mns-…" />
            </label>

            <label className="field">
              {t("settings.agentProfileProof")}
              <select value={profile} onChange={(e) => setProfile(e.target.value)}>
                {MANUS_AGENT_PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <p className="tiny muted">{t("settings.imageModelHint")}</p>

            <label className="field" style={{ maxWidth: 260 }}>
              {t("settings.usdPerCredit")}
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={usdPerCredit}
                onChange={(e) => setUsdPerCredit(Number(e.target.value) || 0)}
              />
            </label>
            <p className="tiny muted">{t("settings.usdPerCreditHint")}</p>

            <div className="row">
              <button className="btn sm" onClick={runVerifyManus} disabled={vManus === "loading"}>
                {vManus === "loading" ? t("settings.verifying") : t("settings.verify")}
              </button>
              {s.data?.manusKeySource === "ui" && (
                <button className="btn ghost sm" onClick={() => save({ clearManusKey: true })} disabled={busy}>
                  {t("settings.clear")}
                </button>
              )}
            </div>
            {vManus && vManus !== "loading" && (
              <div className="verifybox">
                <b className={vManus.ok ? "ok-t" : "err-t"}>
                  {vManus.ok ? "✓ " + t("settings.verifyOk") : "✗ " + t("settings.verifyFail")}
                </b>
                {vManus.error && <div className="tiny err-t">{vManus.error}</div>}
                {vManus.ok && (
                  <div className="tiny">
                    {vManus.credits != null && (
                      <>
                        {t("settings.manusBalanceLabel")}: <b>{vManus.credits}</b> ·{" "}
                      </>
                    )}
                    auth: <span className="mono">{vManus.authMode}</span>
                  </div>
                )}
                <div className="tiny muted" style={{ margin: "6px 0 3px" }}>
                  agent_profile:
                </div>
                <div className="chips">
                  {vManus.agentProfiles.map((p) => (
                    <span key={p} className="chip" style={{ cursor: "default" }}>
                      {p}
                    </span>
                  ))}
                </div>
                {vManus.note && (
                  <div className="tiny muted" style={{ marginTop: 8 }}>
                    {vManus.note}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Shopify */}
        <div className="card">
          <div className="card-h">
            <h3>🛍 {t("settings.secShopify")}</h3>
            <span className={"badge " + (s.data?.hasShopify ? "ok" : "")}>
              {s.data?.hasShopify ? s.data.shopifyDomain : t("settings.shopifyNotSet")}
            </span>
          </div>
          <div className="card-b col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="badge mono">API {s.data?.shopifyApiVersion}</span>
              {s.data?.shopifyTokenHint && <span className="badge mono">token: {s.data.shopifyTokenHint}</span>}
              {s.data && s.data.shopifySource !== "none" && (
                <span className="tiny muted">{t("usage.colProvider")}: {srcLabel(s.data.shopifySource as KeySource)}</span>
              )}
            </div>
            <label className="field">
              {t("settings.shopifyDomain")}
              <input
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder={s.data?.shopifyDomain || "343d10-7c.myshopify.com"}
              />
            </label>

            {/* A) OAuth via a Dev Dashboard app (Client ID + Secret) */}
            <div className="col" style={{ gap: 8, borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <b className="tiny">{t("settings.shopifyOauth")}</b>
              <label className="field">
                Client ID
                <input
                  value={shopClientId}
                  onChange={(e) => setShopClientId(e.target.value)}
                  placeholder={s.data?.shopifyClientIdHint || "01e21c49…"}
                />
              </label>
              <label className="field">
                Client Secret
                <input
                  type="password"
                  value={shopClientSecret}
                  onChange={(e) => setShopClientSecret(e.target.value)}
                  placeholder={s.data?.shopifyHasSecret ? "••••••••" : "shpss_…"}
                />
              </label>
              <p className="tiny muted">
                {t("settings.shopifyOauthHint")}
                <br />
                <span className="mono" style={{ userSelect: "all" }}>
                  {s.data?.shopifyRedirectUri || `${window.location.origin}/api/shopify/oauth/callback`}
                </span>
              </p>
              <button
                className="btn primary sm"
                onClick={async () => {
                  await save(); // persist domain + client id/secret first
                  const dom = (shopDomain.trim() || s.data?.shopifyDomain || "").trim();
                  if (!dom) return toast(t("settings.shopifyDomain"), "err");
                  window.location.href = `/api/shopify/oauth/start?shop=${encodeURIComponent(dom)}`;
                }}
                disabled={busy}
              >
                {t("settings.shopifyConnect")}
              </button>
            </div>

            {/* B) or paste a custom-app shpat_ token directly */}
            <div className="col" style={{ gap: 6, borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <b className="tiny">{t("settings.shopifyManual")}</b>
              <label className="field">
                {t("settings.shopifyToken")}
                <input type="password" value={shopToken} onChange={(e) => setShopToken(e.target.value)} placeholder="shpat_…" />
              </label>
              <p className="tiny muted">{t("settings.shopifyTokenHint")}</p>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm" onClick={runVerifyShopify} disabled={vShop === "loading"}>
                {vShop === "loading" ? <span className="spin" /> : t("settings.verify")}
              </button>
              {s.data && s.data.shopifySource !== "none" && (
                <button
                  className="btn ghost sm"
                  onClick={async () => {
                    await api.saveSettings({ clearShopify: true });
                    setShopDomain("");
                    setShopToken("");
                    setShopClientId("");
                    setShopClientSecret("");
                    setVShop(null);
                    s.refetch();
                  }}
                >
                  {t("settings.clear")}
                </button>
              )}
            </div>
            {vShop && vShop !== "loading" && (
              <p className={"tiny " + (vShop.ok ? "" : "err-t")} style={vShop.ok ? { color: "var(--ok)" } : undefined}>
                {vShop.ok ? `✓ ${vShop.shop}${vShop.plan ? ` · ${vShop.plan}` : ""}` : `✕ ${vShop.error}`}
              </p>
            )}
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" style={{ width: 16 }} checked={autoPush} onChange={(e) => setAutoPush(e.target.checked)} />
              <span className="tiny">{t("settings.autoPush")}</span>
            </label>
          </div>

          {/* Etsy Command Center companion app */}
          <div className="card">
            <h3>🧵 {t("settings.secEtsyApp")}</h3>
            <span className={"badge " + (s.data?.etsyAppConnected ? "ok" : "warn")}>
              {s.data?.etsyAppConnected ? t("settings.etsyAppConnected") : t("settings.etsyAppNotSet")}
            </span>
            <div className="col" style={{ gap: 8 }}>
              <p className="tiny muted">{t("settings.etsyAppHint")}</p>
              <label className="field">
                {t("settings.etsyAppUrl")}
                <input value={etsyUrl} onChange={(e) => setEtsyUrl(e.target.value)} placeholder="http://localhost:4317" />
              </label>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn sm"
                  disabled={pairing}
                  onClick={async () => {
                    setPairing(true);
                    try {
                      const r = await api.pairEtsyApp(etsyUrl.trim());
                      toast(t("settings.etsyAppPaired", { url: r.url }), "ok");
                      s.refetch();
                    } catch (e) {
                      toast((e as Error).message, "err");
                    } finally {
                      setPairing(false);
                    }
                  }}
                >
                  {pairing ? <span className="spin" /> : t("settings.etsyAppPair")}
                </button>
                {s.data?.etsyAppConnected && (
                  <button
                    className="btn ghost sm"
                    onClick={async () => {
                      await api.saveSettings({ clearEtsyApp: true });
                      setEtsyUrl("http://localhost:4317");
                      s.refetch();
                    }}
                  >
                    {t("settings.clear")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <button className="btn primary" onClick={() => save()} disabled={busy}>
            {busy ? <span className="spin" /> : t("common.save")}
          </button>
        </div>
        <p className="tiny muted">{t("settings.envNote")}</p>
      </div>
    </>
  );
}
