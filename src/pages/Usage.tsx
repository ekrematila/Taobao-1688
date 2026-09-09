import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { absoluteUrl, api, proxied } from "../api";
import { useI18n } from "../i18n";
import Spark from "../components/Spark";

const usd = (n: number) => "$" + (n === 0 ? "0.00" : n < 0.01 ? n.toFixed(5) : n.toFixed(n < 1 ? 4 : 2));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function rangeToIso(from: string, to: string): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (from) out.from = `${from}T00:00:00.000Z`;
  if (to) {
    const d = new Date(`${to}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1); // make `to` inclusive
    out.to = d.toISOString();
  }
  return out;
}

export default function Usage() {
  const { t } = useI18n();
  const today = ymd(new Date());
  const ago = (days: number) => ymd(new Date(Date.now() - days * 864e5));
  const [from, setFrom] = useState(ago(30));
  const [to, setTo] = useState(today);
  const [openRow, setOpenRow] = useState<number | null>(null);

  const iso = useMemo(() => rangeToIso(from, to), [from, to]);
  const u = useQuery({ queryKey: ["usage", iso], queryFn: () => api.usage(iso) });
  const m = useQuery({ queryKey: ["manus-usage", iso], queryFn: () => api.manusUsage(iso) });
  const d = u.data;
  const mu = m.data;

  const preset = (label: string, f: string, tt = today) => (
    <button
      className={"chip" + (from === f && to === tt ? " active" : "")}
      onClick={() => {
        setFrom(f);
        setTo(tt);
      }}
    >
      {label}
    </button>
  );

  const maxDay = Math.max(1, ...(mu?.byDay ?? []).map((x) => x.credits));

  // combined $ spend per day (Claude tokens + billable Manus), bucketed from the call log
  const dailySpend = useMemo(() => {
    const by = new Map<string, number>();
    for (const c of d?.calls ?? []) {
      const day = String(c.at).slice(0, 10);
      by.set(day, (by.get(day) ?? 0) + (c.costUsd || 0));
    }
    return [...by.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([x, y]) => ({ x: x.slice(5), y }));
  }, [d?.calls]);
  const kindSpend = useMemo(() => {
    const by = new Map<string, number>();
    for (const c of d?.calls ?? []) by.set(c.kind, (by.get(c.kind) ?? 0) + (c.costUsd || 0));
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [d?.calls]);
  // Prefer the app-scoped, Manus-reconciled figure; fall back to our local estimate.
  const manusUsd = mu?.configured ? mu.costUsd : d?.manusCostUsd ?? 0;
  const manusCredits = mu?.configured ? mu.costCredits : d?.totalManusCredits ?? 0;
  const claudeBalance = d?.claudeBalanceUsd ?? 0;

  // Manus is a prepaid CREDIT plan: while the account still holds credits, the
  // credits this app burned cost no extra money — don't add them to the total.
  const manusHasCredits = (mu?.available ?? 0) > 0;
  const manusBillableUsd = manusHasCredits ? 0 : manusUsd;
  const totalCostUsd = (d?.claudeCostUsd ?? 0) + manusBillableUsd;

  return (
    <>
      <div className="topbar">
        <div className="title">{t("nav.usage")}</div>
      </div>
      <div className="content grid" style={{ gap: 14 }}>
        {/* date filter */}
        <div className="card">
          <div className="card-b row" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <b className="tiny">{t("usage.range")}</b>
            <div className="chips">
              {preset(t("usage.range7"), ago(7))}
              {preset(t("usage.range30"), ago(30))}
              {preset(t("usage.range90"), ago(90))}
              {preset(t("usage.rangeMonth"), today.slice(0, 8) + "01")}
              {preset(t("usage.rangeAll"), "2000-01-01")}
            </div>
            <div className="grow" style={{ flex: 1 }} />
            <label className="row tiny muted" style={{ gap: 4, margin: 0 }}>
              {t("usage.from")}
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="row tiny muted" style={{ gap: 4, margin: 0 }}>
              {t("usage.to")}
              <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </div>

        {/* range totals (our log) */}
        <div className="row">
          <Stat label={t("usage.totalCost")} value={usd(totalCostUsd)} big sub={t("usage.appOnly")} />
          <Stat label={t("usage.claudeToken")} value={usd(d?.claudeCostUsd ?? 0)} />
          <Stat
            label={t("usage.manusCredit")}
            value={usd(manusBillableUsd)}
            sub={
              manusHasCredits
                ? t("usage.manusCovered", { c: manusCredits.toLocaleString(), v: usd(manusUsd) })
                : `${manusCredits.toLocaleString()} ${t("settings.credits")} · ${mu?.error || mu?.pending ? t("usage.ourEstimate") : t("usage.reconciled")}`
            }
          />
          <Stat
            label={t("usage.tokensInOut")}
            value={`${(d?.totalInputTokens ?? 0).toLocaleString()} / ${(d?.totalOutputTokens ?? 0).toLocaleString()}`}
          />
        </div>
        <p className="tiny muted">
          {t("usage.rate", { rate: "$" + (d?.manusUsdPerCredit ?? 0.01), calls: d?.callCount ?? 0 })}
          {manusHasCredits && " · " + t("usage.manusCreditNote")}
        </p>

        {/* spend over time + by operation */}
        {dailySpend.length > 1 && (
          <div className="card">
            <div className="card-h"><h3>{t("usage.spendChart")}</h3></div>
            <div className="card-b col" style={{ gap: 14 }}>
              <Spark points={dailySpend} label={t("usage.spendDaily")} fmtMax={usd} />
              {kindSpend.length > 0 && (
                <div className="col" style={{ gap: 5 }}>
                  <div className="tiny muted">{t("usage.spendByKind")}</div>
                  {kindSpend.map(([k, v]) => {
                    const mx = kindSpend[0][1] || 1;
                    return (
                      <div key={k} className="kindbar">
                        <span className="mono">{k}</span>
                        <span className="kb-track"><i style={{ width: `${Math.max(3, (v / mx) * 100)}%` }} /></span>
                        <span className="mono">{usd(v)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Claude — this app's spend + (manual) balance */}
        <div className="card">
          <div className="card-h">
            <h3>{t("usage.claudeCard")}</h3>
          </div>
          <div className="card-b col" style={{ gap: 12 }}>
            <div className="row">
              <Stat
                label={t("usage.claudeSpentRange")}
                value={usd(d?.claudeCostUsd ?? 0)}
                sub={`${(d?.totalInputTokens ?? 0).toLocaleString()} / ${(d?.totalOutputTokens ?? 0).toLocaleString()} token`}
                big
              />
              {claudeBalance > 0 ? (
                <Stat
                  label={t("usage.claudeRemaining")}
                  value={usd(Math.max(0, claudeBalance - (d?.claudeSpentAllUsd ?? 0)))}
                  sub={t("usage.claudeRemainingSub", {
                    bal: usd(claudeBalance),
                    all: usd(d?.claudeSpentAllUsd ?? 0),
                  })}
                />
              ) : (
                <Stat label={t("usage.claudeBalanceUnset")} value="—" sub={t("usage.claudeBalanceUnsetSub")} />
              )}
              <Stat
                label={t("usage.claudeRate")}
                value={`$${d?.claudeInPer1M ?? "?"} / $${d?.claudeOutPer1M ?? "?"}`}
                sub={`${d?.activeClaudeModel ?? ""} · /1M in·out`}
              />
            </div>
            <p className="tiny muted">{t("usage.claudeNote")}</p>
          </div>
        </div>

        {/* Manus's own authoritative record */}
        <div className="card">
          <div className="card-h">
            <h3>{t("usage.manusLive")}</h3>
            {m.isFetching && <span className="sub">…</span>}
          </div>
          <div className="card-b col" style={{ gap: 12 }}>
            {!mu?.configured ? (
              <div className="empty">{t("usage.manusNoKey")}</div>
            ) : mu.error ? (
              <div className="err-t tiny">{mu.error}</div>
            ) : (
              <>
                <div className="row">
                  <Stat
                    label={t("usage.manusSpentRange")}
                    value={usd(mu.costUsd)}
                    sub={`${mu.costCredits.toLocaleString()} ${t("settings.credits")}`}
                    big
                  />
                  <Stat label={t("usage.manusEntries")} value={`${mu.entryCount}`} sub={t("usage.manusReconciled", { r: mu.reconciled, p: mu.pending })} />
                  {mu.refundCredits > 0 && (
                    <Stat label={t("usage.manusRefund")} value={`${mu.refundCredits.toLocaleString()}`} sub={t("settings.credits")} />
                  )}
                  <Stat
                    label={t("usage.manusBalance")}
                    value={mu.available != null ? `${mu.available.toLocaleString()} ${t("settings.credits")}` : "—"}
                    sub={mu.availableUsd != null ? t("usage.manusBalanceUsd", { v: usd(mu.availableUsd) }) : t("usage.manusBalanceSub")}
                  />
                </div>
                {manusHasCredits && (
                  <div className="note" style={{ fontSize: 12 }}>{t("usage.manusCreditNote")}</div>
                )}

                {mu.byDraft.length > 0 && (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("usage.colProduct")}</th>
                        <th>{t("usage.colCredits")}</th>
                        <th>{t("usage.colCost")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mu.byDraft.map((r) => (
                        <tr key={r.draftId ?? "none"}>
                          <td>{r.title}</td>
                          <td>{r.credits.toLocaleString()}</td>
                          <td>
                            <b>{usd(r.costUsd)}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {mu.byDay.length > 0 && (
                  <div>
                    <div className="tiny muted" style={{ marginBottom: 6 }}>
                      {t("usage.manusPerDay")}
                    </div>
                    <div className="daybars">
                      {mu.byDay.map((x) => (
                        <div key={x.date} className="daybar" title={`${x.date} · ${x.credits} ${t("settings.credits")}`}>
                          <span style={{ height: `${Math.round((x.credits / maxDay) * 100)}%` }} />
                          <em>{x.date.slice(5)}</em>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {mu.entries.length > 0 && (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("usage.colTime")}</th>
                        <th>{t("usage.colAction")}</th>
                        <th>{t("usage.colProduct")}</th>
                        <th>{t("usage.colCredits")}</th>
                        <th>{t("usage.colCost")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mu.entries.map((e) => (
                        <tr key={e.taskId + e.createdAt}>
                          <td className="tiny muted">{new Date(e.createdAt).toLocaleString()}</td>
                          <td className="mono">
                            {e.kind}
                            {e.type !== "cost" ? ` · ${e.type}` : ""}
                          </td>
                          <td>{e.draftTitle}</td>
                          <td>
                            {Math.abs(e.credits).toLocaleString()}
                            {e.estimated ? "*" : ""}
                          </td>
                          <td>{e.type === "refund" ? "—" : usd(Math.abs(e.credits) * mu.usdPerCredit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {mu.truncated && <p className="tiny muted">{t("usage.manusTruncated")}</p>}
                <p className="tiny muted">{t("usage.manusNote")}</p>
              </>
            )}
          </div>
        </div>

        {/* per product (our log) */}
        {!!d?.perDraft.length && (
          <div className="card">
            <div className="card-h">
              <h3>{t("usage.perProduct")}</h3>
              <span className="sub">{t("usage.ourEstimate")}</span>
            </div>
            <div className="card-b">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("usage.colProduct")}</th>
                    <th>Claude</th>
                    <th>Manus</th>
                    <th>{t("usage.colCredits")}</th>
                    <th>{t("usage.colTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.perDraft.map((r) => (
                    <tr key={r.draftId ?? "none"}>
                      <td>{r.title}</td>
                      <td>{usd(r.claudeUsd)}</td>
                      <td>{usd(r.manusUsd)}</td>
                      <td>{r.manusCredits}</td>
                      <td>
                        <b>{usd(r.claudeUsd + r.manusUsd)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* call log (our log) */}
        <div className="card">
          <div className="card-h">
            <h3>{t("usage.callLog")}</h3>
            <span className="sub">{t("usage.ourEstimate")}</span>
          </div>
          <div className="card-b">
            {!d?.calls.length ? (
              <div className="empty">{t("usage.empty")}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("usage.colTime")}</th>
                    <th>{t("usage.colAction")}</th>
                    <th>{t("usage.colProvider")}</th>
                    <th>{t("usage.colModel")}</th>
                    <th>{t("usage.colTokens")}</th>
                    <th>{t("usage.colCredits")}</th>
                    <th>{t("usage.colCost")}</th>
                    <th>{t("usage.colResult")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.calls.map((c, i) => (
                    <Fragment key={i}>
                      <tr>
                        <td className="tiny muted">{new Date(c.at).toLocaleString()}</td>
                        <td className="mono">{c.kind}</td>
                        <td>
                          <span className={"badge " + (c.provider === "manus" ? "brand" : "")}>{c.provider}</span>
                        </td>
                        <td className="mono">{c.model}</td>
                        <td>
                          {c.inputTokens.toLocaleString()} / {c.outputTokens.toLocaleString()}
                        </td>
                        <td>
                          {c.credits || "—"}
                          {c.estimated && c.credits ? "*" : ""}
                        </td>
                        <td>{usd(c.costUsd)}</td>
                        <td>
                          {c.result != null && c.result !== "" ? (
                            <button className="btn ghost sm" onClick={() => setOpenRow(openRow === i ? null : i)}>
                              {openRow === i ? t("usage.hideResult") : t("usage.showResult")}
                            </button>
                          ) : (
                            <span className="tiny muted">—</span>
                          )}
                        </td>
                      </tr>
                      {openRow === i && c.result != null && (
                        <tr>
                          <td colSpan={8} style={{ background: "var(--panel-2)" }}>
                            <ResultView result={c.result} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <p className="tiny muted">{t("usage.note")}</p>
        <p className="tiny muted">{t("usage.estimatedNote")}</p>
      </div>
    </>
  );
}

function Thumb({ url, label }: { url: string; label: string }) {
  const abs = absoluteUrl(url);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <span className="tiny muted">{label}</span>
      <a href={abs} target="_blank" rel="noreferrer">
        <img
          src={proxied(url)}
          alt={label}
          style={{ maxWidth: 220, maxHeight: 220, borderRadius: 6, border: "1px solid var(--line)" }}
        />
      </a>
      <a className="tiny" href={abs} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all", maxWidth: 260 }}>
        {abs}
      </a>
    </div>
  );
}

/** Renders an activity-log entry's stored output: text/HTML, or image before→after. */
function ResultView({ result }: { result: unknown }) {
  const { t } = useI18n();
  const copy = (s: string) => navigator.clipboard.writeText(s);

  const r = result as any;
  const isObj = r && typeof r === "object";
  const from: string | undefined = isObj && typeof r.from === "string" ? r.from : undefined;
  const to: string | undefined = isObj && typeof r.to === "string" ? r.to : undefined;
  const text: string | undefined =
    typeof r === "string" ? r : isObj && typeof r.text === "string" ? r.text : undefined;
  const alt: string | undefined = isObj && typeof r.alt === "string" ? r.alt : undefined;
  const taskUrl: string | undefined = isObj && typeof r.taskUrl === "string" && r.taskUrl ? r.taskUrl : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 4px" }}>
      {(from || to) && (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {from && <Thumb url={from} label={t("usage.resultBefore")} />}
          {to ? (
            <Thumb url={to} label={t("usage.resultAfter")} />
          ) : (
            <span className="tiny muted">{t("usage.resultNoChange")}</span>
          )}
        </div>
      )}

      {alt && (
        <div>
          <span className="tiny muted">alt</span>
          <p style={{ margin: "2px 0" }}>{alt}</p>
          <button className="btn ghost sm" onClick={() => copy(alt)}>
            {t("common.copy")}
          </button>
        </div>
      )}

      {text != null && (
        <div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 360,
              overflow: "auto",
              margin: 0,
              padding: 10,
              border: "1px solid var(--line)",
              borderRadius: 6,
              font: "12px/1.5 ui-monospace, monospace",
            }}
          >
            {text}
          </pre>
          <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => copy(text)}>
            {t("common.copy")}
          </button>
        </div>
      )}

      {text == null && !alt && !from && !to && (
        <pre style={{ whiteSpace: "pre-wrap", margin: 0, font: "12px/1.5 ui-monospace, monospace" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {taskUrl && (
        <a className="tiny" href={taskUrl} target="_blank" rel="noreferrer">
          {t("usage.resultTask")}
        </a>
      )}
    </div>
  );
}

function Stat({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className="card stat-card" style={{ flex: 1, minWidth: 168 }}>
      <div className="card-b" style={{ padding: 16 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value" style={{ fontSize: big ? 28 : 21 }}>{value}</div>
        {sub && <div className="tiny muted" style={{ marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}
