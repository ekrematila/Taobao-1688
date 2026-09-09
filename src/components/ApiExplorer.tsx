import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import type { ApiCallResult, OneboundPlatform } from "@shared/types.ts";

function detectId(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{6,}$/.test(s)) return s;
  const m =
    s.match(/[?&](?:id|num_iid)=(\d{6,})/) ||
    s.match(/\/offer\/(\d{6,})\.html/) ||
    s.match(/\/(\d{9,})(?:\.html)?(?:[?#]|$)/) ||
    s.match(/(\d{9,})/);
  return m ? m[1] : null;
}

export default function ApiExplorer({
  onSeeded,
  defaultQuery = "",
  initialJson = null,
}: {
  onSeeded: (draftId: string) => void;
  defaultQuery?: string;
  /** Previously-fetched raw JSON for this draft — shown until a new call runs. */
  initialJson?: unknown;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const eps = useQuery({ queryKey: ["endpoints"], queryFn: api.endpoints });
  const [platform, setPlatform] = useState<OneboundPlatform>("taobao");
  const [endpoint, setEndpoint] = useState("item_get_pro");
  const [query, setQuery] = useState(defaultQuery);
  const [noCache, setNoCache] = useState(false);
  const [lang, setLang] = useState("cn");
  const [filter, setFilter] = useState("");
  const [result, setResult] = useState<ApiCallResult | null>(
    initialJson != null ? { requestUrl: "", status: 200, ms: 0, json: initialJson } : null,
  );
  const [busy, setBusy] = useState(false);
  const [fromSaved, setFromSaved] = useState(initialJson != null);

  const active = eps.data?.find((e) => e.id === endpoint);
  const list = useMemo(
    () =>
      (eps.data ?? []).filter(
        (e) => !filter || (e.id + " " + e.summary).toLowerCase().includes(filter.toLowerCase()),
      ),
    [eps.data, filter],
  );
  const detected = active?.input === "id" ? detectId(query) : null;

  async function run() {
    if (!active) return;
    if (active.input === "id" && !detected) return toast(t("explorer.needId"), "err");
    if (active.input === "keyword" && !query.trim()) return toast(t("explorer.needKeyword"), "err");
    setBusy(true);
    try {
      const r = await api.call({ platform, endpoint, query, lang, noCache });
      setResult(r);
      setFromSaved(false);
      if (r.draftId) {
        toast(t("explorer.seeded"), "ok");
        onSeeded(r.draftId);
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "260px 1fr 1fr", alignItems: "start" }}>
      {/* endpoint list */}
      <div className="card">
        <div className="card-h">
          <h3>{t("explorer.title")}</h3>
        </div>
        <div className="card-b col">
          <div className="row">
            <button className={"chip" + (platform === "taobao" ? " active" : "")} onClick={() => setPlatform("taobao")}>
              TB
            </button>
            <button className={"chip" + (platform === "1688" ? " active" : "")} onClick={() => setPlatform("1688")}>
              1688
            </button>
          </div>
          <input type="text" placeholder={t("explorer.filter")} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="eplist">
            {list.map((e) => (
              <button key={e.id} className={"epitem" + (e.id === endpoint ? " active" : "")} onClick={() => setEndpoint(e.id)}>
                <b>{e.id}</b>
                <span>{e.summary}</span>
              </button>
            ))}
            {list.length === 0 && <div className="tiny muted" style={{ padding: 8 }}>{t("explorer.noMatch")}</div>}
          </div>
        </div>
      </div>

      {/* form */}
      <div className="card">
        <div className="card-h">
          <h3>{active?.id}</h3>
          <span className="sub">{active?.summary}</span>
        </div>
        <div className="card-b col" style={{ gap: 14 }}>
          <label className="field">
            {active?.input === "keyword" ? t("explorer.keyword") : t("explorer.query")}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                active?.input === "keyword"
                  ? t("explorer.keywordPh")
                  : "811899823905 · https://item.taobao.com/item.htm?id=811899823905"
              }
            />
          </label>
          {active?.input === "id" && (
            <div className="tiny mono muted">
              {t("explorer.detected")}: {detected ? <b style={{ color: "var(--ok)" }}>{detected}</b> : "—"}
            </div>
          )}
          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              {t("explorer.lang")}
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="cn">{t("explorer.langZh")}</option>
                <option value="en">en</option>
              </select>
            </label>
            <label className="row" style={{ gap: 6, marginTop: 18 }}>
              <input type="checkbox" style={{ width: 16 }} checked={noCache} onChange={(e) => setNoCache(e.target.checked)} />
              <span className="tiny">{t("explorer.noCache")}</span>
            </label>
          </div>
          <button className="btn primary" onClick={run} disabled={busy}>
            {busy ? <span className="spin" /> : t("explorer.run")}
          </button>
          <p className="tiny muted">{t("explorer.autoParams")}</p>
        </div>
      </div>

      {/* response */}
      <div className="card">
        <div className="card-h">
          <h3>{t("explorer.response")}</h3>
          {result && (
            <span className="sub">
              {fromSaved ? t("explorer.savedResponse") : `${result.status} · ${result.ms} ms`}
            </span>
          )}
          <div className="grow" style={{ flex: 1 }} />
          {result && (
            <button
              className="btn ghost sm"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(result.json, null, 2));
                toast(t("common.copied"), "ok");
              }}
            >
              {t("explorer.copy")}
            </button>
          )}
        </div>
        <div className="card-b col">
          {result?.requestUrl && <div className="reqline">GET {result.requestUrl}</div>}
          <pre className="json">
            {result ? JSON.stringify(result.json, null, 2) : `{\n  ${t("explorer.jsonPlaceholder")}\n}`}
          </pre>
        </div>
      </div>
    </div>
  );
}
