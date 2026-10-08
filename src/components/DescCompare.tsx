import { useRef, useState } from "react";
import { compareDescriptionJob, type DescCompareResult, type Draft } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { JobCancelled, type RunningJob } from "../lib/jobs";
import { importBodyHtmlPreview } from "../lib/export";
import JobProgress from "./JobProgress";
import ModelOptions from "./ModelOptions";
import type { GenerateListingInput, GeneratedListing, JobView } from "@shared/types.ts";

/**
 * Write the Shopify HTML description with two models for the SAME product and look at both,
 * side by side, before anything is saved. "Use this" puts the chosen one into the listing.
 */
export default function DescCompare({
  draft,
  buildInput,
  defaultA,
  defaultB,
  onUse,
  onClose,
}: {
  draft: Draft;
  /** the current Delivery-studio settings as a generate input (without the model) */
  buildInput: () => GenerateListingInput;
  defaultA: string;
  defaultB: string;
  onUse: (description: string, model: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [a, setA] = useState(defaultA);
  const [b, setB] = useState(defaultB);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const [results, setResults] = useState<DescCompareResult[] | null>(null);
  const [using, setUsing] = useState("");
  const jobRef = useRef<RunningJob<unknown> | null>(null);

  async function run() {
    if (!draft.product) return;
    setBusy(true);
    setResults(null);
    const r = compareDescriptionJob({ ...buildInput(), models: [a, b] }, setJob);
    jobRef.current = r as RunningJob<unknown>;
    try {
      const out = await r.promise;
      setResults(out.results);
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy(false);
      setJob(null);
    }
  }

  /** the draft's own listing, with just this description swapped in — the same render the preview/push use */
  const html = (description: string) => {
    const base: GeneratedListing = draft.listing ?? { channel: "shopify", fields: [], variants: [], model: "", usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
    const fields = base.fields.some((f) => f.key === "description")
      ? base.fields.map((f) => (f.key === "description" ? { ...f, value: description } : f))
      : [...base.fields, { key: "description" as const, value: description }];
    const body = importBodyHtmlPreview(draft.product!, { ...base, layout: base.layout ?? (buildInput().descriptionLayout as any), fields });
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#fff">${body}</body>`;
  };

  return (
    <div className="modal-scrim" onClick={() => !busy && onClose()}>
      <div className="modal" style={{ width: "min(1500px, 98vw)", maxHeight: "96vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="m-h">
          <h3 style={{ fontSize: 14 }}>{t("descCmp.title")}</h3>
          <div className="grow" style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={onClose} disabled={busy}>
            {t("common.close")}
          </button>
        </div>
        <div className="m-b col" style={{ gap: 12, overflow: "auto" }}>
          <p className="tiny muted" style={{ margin: 0 }}>{t("descCmp.hint")}</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={a} onChange={(e) => setA(e.target.value)} disabled={busy}>
              <ModelOptions purpose="code" extraIds={[defaultA]} />
            </select>
            <span className="muted">vs</span>
            <select value={b} onChange={(e) => setB(e.target.value)} disabled={busy}>
              <ModelOptions purpose="code" extraIds={[defaultB]} />
            </select>
            <button className="btn primary sm" onClick={run} disabled={busy || a === b}>
              {busy ? <span className="spin" /> : t("descCmp.run")}
            </button>
          </div>
          {job && <JobProgress job={job} onCancel={() => jobRef.current?.cancel()} />}
          {results && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 12 }}>
              {results.map((r) => (
                <div key={r.model} className="col" style={{ gap: 8, minWidth: 0 }}>
                  <div className="row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <b>{r.model}</b>
                    <span className="tiny muted">
                      {r.secs}s · ${r.costUsd.toFixed(3)} · {r.description.length.toLocaleString()} {t("descCmp.chars")}
                    </span>
                    <div className="grow" style={{ flex: 1 }} />
                    {!r.error && (
                      <button
                        className="btn primary sm"
                        disabled={!!using}
                        onClick={async () => {
                          setUsing(r.model);
                          try {
                            await onUse(r.description, r.model);
                            toast(t("descCmp.used", { m: r.model }), "ok");
                            onClose();
                          } catch (e) {
                            toast((e as Error).message, "err");
                          } finally {
                            setUsing("");
                          }
                        }}
                      >
                        {using === r.model ? <span className="spin" /> : t("descCmp.use")}
                      </button>
                    )}
                  </div>
                  {r.error ? (
                    <div className="err-t tiny">{r.error}</div>
                  ) : (
                    <iframe title={r.model} srcDoc={html(r.description)} sandbox="" style={{ width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
