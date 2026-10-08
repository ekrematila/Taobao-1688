import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { useModels } from "../lib/useModels";
import { groupOpenAIModels, OPENAI_CATEGORIES, type OpenAICategory } from "@shared/openaiModels.ts";

/**
 * What this OpenAI key can use, sorted by purpose (writing, coding, images, the
 * three audio kinds, video) with one price/performance default per purpose
 * instead of a 100+ chip wall. The pick is saved per purpose; "text" is the one
 * the app runs today (via the active-model picker above), the others are kept for
 * the features that will use them.
 */
export default function OpenAIModelsPanel({
  defaults,
  activeModel,
  onUseAsActive,
  onSaved,
}: {
  defaults: Record<string, string>;
  activeModel: string;
  onUseAsActive: (id: string) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { models } = useModels();
  const [showOld, setShowOld] = useState(false);
  const q = useQuery({ queryKey: ["openai-models"], queryFn: () => api.openaiModels(), staleTime: 30 * 60 * 1000, retry: 1 });

  if (q.isLoading) return <p className="tiny muted">{t("settings.verifying")}</p>;
  if (q.isError) return <p className="tiny err-t">{(q.error as Error).message}</p>;
  const grouped = groupOpenAIModels(q.data?.ids ?? []);
  const oldCount = Object.values(grouped.hidden).reduce((n, l) => n + l.length, 0);
  const otherCount = grouped.current.other.length + grouped.hidden.other.length;

  async function choose(cat: OpenAICategory, id: string) {
    try {
      // an empty value resets the purpose to the recommended default
      await api.saveSettings({ openaiDefaults: { ...defaults, [cat]: id } });
      onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  const priceOf = (id: string) => {
    const m = models.find((x) => x.id === id);
    return m ? `$${m.inPer1M}/$${m.outPer1M} /M` : "";
  };

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b className="tiny">
          {t("settings.openaiPurposes")} · {(q.data?.ids ?? []).length} {t("settings.openaiModelCount")}
        </b>
        {oldCount > 0 && (
          <label className="row tiny muted" style={{ gap: 6, margin: 0 }}>
            <input type="checkbox" style={{ width: 14 }} checked={showOld} onChange={(e) => setShowOld(e.target.checked)} />
            {t("settings.openaiShowOld", { n: oldCount })}
          </label>
        )}
      </div>

      {OPENAI_CATEGORIES.map((cat) => {
        const cur = grouped.current[cat];
        const old = grouped.hidden[cat];
        const rec = grouped.recommended[cat];
        const all = [...cur, ...old];
        const saved = defaults[cat];
        const value = saved && all.includes(saved) ? saved : rec?.id ?? cur[0] ?? "";
        const isText = cat === "text";
        return (
          <div key={cat} style={{ border: "1px solid var(--line, #e2e2e8)", borderRadius: 8, padding: "8px 10px" }}>
            <div className="row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <b className="tiny" style={{ minWidth: 150 }}>{t(`settings.openaiCat.${cat}` as any)}</b>
              {all.length ? (
                <select value={value} onChange={(e) => choose(cat, e.target.value)} style={{ flex: 1, minWidth: 200 }}>
                  {cur.map((id) => (
                    <option key={id} value={id}>
                      {id}
                      {id === rec?.id ? "  ★" : ""}
                    </option>
                  ))}
                  {showOld && old.length > 0 && (
                    <optgroup label={t("settings.openaiOldGroup")}>
                      {old.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {!showOld && value && !cur.includes(value) && <option value={value}>{value}</option>}
                </select>
              ) : (
                <span className="tiny muted">{t("settings.openaiNoneInKey")}</span>
              )}
              {rec && value && value !== rec.id && (
                <button className="btn ghost sm" onClick={() => choose(cat, "")} title={rec.id}>
                  ↺ ★
                </button>
              )}
            </div>
            {rec && (
              <div className="tiny muted" style={{ marginTop: 4 }}>
                ★ {t(`settings.openaiWhy.${rec.why}` as any)}: <span className="mono">{rec.id}</span>
                {priceOf(rec.id) && <> · {priceOf(rec.id)}</>}
              </div>
            )}
            {isText && value && (
              <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 4 }}>
                {value === activeModel ? (
                  <span className="badge ok">{t("settings.openaiIsActive")}</span>
                ) : (
                  <button className="btn sm" onClick={() => onUseAsActive(value)}>
                    {t("settings.openaiUseActive")}
                  </button>
                )}
                {priceOf(value) && <span className="tiny muted">{priceOf(value)}</span>}
              </div>
            )}
          </div>
        );
      })}

      <p className="tiny muted" style={{ margin: 0 }}>{t("settings.openaiPurposesNote")}</p>
      {otherCount > 0 && (
        <details>
          <summary className="tiny muted" style={{ cursor: "pointer" }}>
            {t("settings.openaiOther", { n: otherCount })}
          </summary>
          <div className="chips" style={{ marginTop: 6 }}>
            {[...grouped.current.other, ...grouped.hidden.other].map((id) => (
              <span key={id} className="chip" style={{ cursor: "default" }}>
                {id}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
