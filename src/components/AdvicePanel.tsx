import { useEffect, useRef, useState } from "react";
import { adviceJob, api, type Draft } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { JobCancelled, type RunningJob } from "../lib/jobs";
import JobProgress from "./JobProgress";
import { CLAUDE_MODELS, EFFORT_LEVELS, EFFORT_LABEL, THINKING_MODES, THINKING_LABEL } from "@shared/models.ts";
import type { ChannelId, JobView } from "@shared/types.ts";

export default function AdvicePanel({
  draft,
  defaultModel,
  onSaved,
}: {
  draft: Draft;
  defaultModel: string;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const st = (draft.imageState as any) ?? {};
  const [channel, setChannel] = useState<ChannelId>((st.adviceChannel as ChannelId) || (draft.channel as ChannelId) || "shopify");
  const [model, setModel] = useState(defaultModel);
  const [effort, setEffort] = useState("");
  const [thinking, setThinking] = useState("");
  const [lang, setLang] = useState<string>(st.adviceLang || "en");
  const [advice, setAdvice] = useState<string>(st.advice || "");
  const [useAdvice, setUseAdvice] = useState<boolean>(!!st.useAdvice);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const jobRef = useRef<RunningJob<unknown> | null>(null);
  const [confirm, setConfirm] = useState<null | boolean>(null); // pending new value
  const [clearAsk, setClearAsk] = useState(false);

  useEffect(() => {
    const s = (draft.imageState as any) ?? {};
    setAdvice(s.advice || "");
    setUseAdvice(!!s.useAdvice);
  }, [draft.id, (draft.imageState as any)?.advice]);
  useEffect(() => setModel(defaultModel), [defaultModel]);

  async function run(mode: "ai" | "local" = "ai") {
    setBusy(true);
    const r = adviceJob(
      { draftId: draft.id, channel, model, effort: effort || undefined, thinking: thinking || undefined, targetLanguage: lang, mode },
      setJob,
    );
    jobRef.current = r as RunningJob<unknown>;
    try {
      const out = await r.promise;
      setAdvice(out.advice);
      await api.patchDraft(draft.id, {
        imageState: { ...((draft.imageState as any) ?? {}), advice: out.advice, adviceChannel: channel, adviceLang: lang },
      });
      onSaved();
      toast(t("advice.done"), "ok");
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy(false);
      setJob(null);
    }
  }

  async function clearAdvice() {
    setClearAsk(false);
    setAdvice("");
    setUseAdvice(false);
    const st = { ...((draft.imageState as any) ?? {}) };
    delete st.advice;
    delete st.adviceChannel;
    delete st.adviceLang;
    delete st.useAdvice;
    await api.patchDraft(draft.id, { imageState: st });
    onSaved();
    toast(t("advice.cleared"));
  }

  async function applyGate(next: boolean) {
    setConfirm(null);
    setUseAdvice(next);
    await api.patchDraft(draft.id, { imageState: { ...((draft.imageState as any) ?? {}), useAdvice: next } });
    onSaved();
    toast(next ? t("advice.gateOn") : t("advice.gateOff"));
  }

  return (
    <div className="card">
      <div className="card-h">
        <h3>{t("advice.title")}</h3>
        <span className="sub">{t("advice.sub")}</span>
      </div>
      <div className="card-b col" style={{ gap: 12 }}>
        <div className="row">
          <button className={"chip" + (channel === "shopify" ? " active" : "")} onClick={() => setChannel("shopify")}>
            Shopify
          </button>
          <button className={"chip" + (channel === "etsy" ? " active" : "")} onClick={() => setChannel("etsy")}>
            Etsy
          </button>
          <div className="grow" style={{ flex: 1 }} />
          <label className="field" style={{ width: 90 }}>
            {t("delivery.targetLang")}
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="en">EN</option>
              <option value="tr">TR</option>
              <option value="de">DE</option>
              <option value="fr">FR</option>
            </select>
          </label>
        </div>
        <label className="field">
          {t("delivery.model")}
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} — {m.label}
              </option>
            ))}
          </select>
          <div className="ai-picker" style={{ marginTop: 6 }}>
            <select value={effort} onChange={(e) => setEffort(e.target.value)} title={t("ai.effort")}>
              <option value="">{t("ai.effortDefault")}</option>
              {EFFORT_LEVELS.map((e) => (
                <option key={e} value={e}>
                  {EFFORT_LABEL[e]}
                </option>
              ))}
            </select>
            <select value={thinking} onChange={(e) => setThinking(e.target.value)} title={t("ai.thinking")}>
              <option value="">{t("ai.thinkingDefault")}</option>
              {THINKING_MODES.map((tm) => (
                <option key={tm} value={tm}>
                  {THINKING_LABEL[tm]}
                </option>
              ))}
            </select>
          </div>
        </label>

        <div className="row">
          <button className="btn primary" onClick={() => run("ai")} disabled={busy} style={{ flex: 1 }}>
            {busy ? <span className="spin" /> : advice ? t("advice.regen") : t("advice.generate")}
          </button>
          <button className="btn" onClick={() => run("local")} disabled={busy} title={t("advice.localHint")}>
            {t("advice.local")}
          </button>
        </div>
        {job && <JobProgress job={job} onCancel={() => jobRef.current?.cancel()} />}

        {advice ? (
          <>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn ghost sm danger" onClick={() => setClearAsk(true)} disabled={busy}>
                {t("advice.clear")}
              </button>
            </div>
            <div className="advice-box">{advice}</div>
          </>
        ) : (
          <div className="empty">{t("advice.empty")}</div>
        )}

        {advice && (
          <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              style={{ width: 16, marginTop: 2 }}
              checked={useAdvice}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            <span className="tiny">
              <b>{t("advice.gateLabel")}</b>
              <br />
              {t("advice.gateHint")}
            </span>
          </label>
        )}
      </div>

      {confirm !== null && (
        <div className="modal-scrim" onClick={() => setConfirm(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{confirm ? t("advice.confirmOnTitle") : t("advice.confirmOffTitle")}</h3>
            <p className="sub">{confirm ? t("advice.confirmOnBody") : t("advice.confirmOffBody")}</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setConfirm(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn primary" onClick={() => applyGate(confirm)}>
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {clearAsk && (
        <div className="modal-scrim" onClick={() => setClearAsk(false)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("advice.clearTitle")}</h3>
            <p className="sub">{t("advice.clearBody")}</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setClearAsk(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn danger" onClick={clearAdvice}>
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
