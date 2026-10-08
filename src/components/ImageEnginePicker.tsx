import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useI18n } from "../i18n";
import { useImageAi } from "../lib/useImageAi";
import { groupOpenAIModels } from "@shared/openaiModels.ts";
import ManusProfileOptions from "./ManusProfileOptions";

/**
 * Engine for the AI image work, in one control: Manus (agent, with its capacity profile)
 * or OpenAI (gpt-image model + quality). Replaces the old Manus-only version select in
 * every panel that translates / edits / composes product images.
 */
export default function ImageEnginePicker({
  profile,
  onProfile,
  inline = false,
}: {
  profile: string;
  onProfile: (p: string) => void;
  /** one compact row (toolbars) instead of a stacked field */
  inline?: boolean;
}) {
  const { t } = useI18n();
  const ai = useImageAi();
  const models = useQuery({ queryKey: ["openai-models"], queryFn: () => api.openaiModels(), staleTime: 30 * 60 * 1000, retry: 1, enabled: ai.hasOpenai });
  const grouped = groupOpenAIModels(models.data?.ids ?? []);
  const rec = grouped.recommended.image?.id;
  const saved = ai.openaiDefaults.image;
  const available = [...grouped.current.image, ...grouped.hidden.image];
  const effective = ai.model || (saved && available.includes(saved) ? saved : rec) || "";
  const list = grouped.current.image.length ? grouped.current.image : effective ? [effective] : [];
  const is25 = /^gpt-image-2\.5/.test(effective);
  const qualities = is25 ? ["low", "medium", "high", "xhigh", "max", "auto"] : ["low", "medium", "high", "auto"];

  const body = (
    <>
      <span className="seg tiny">
        <button type="button" className={"seg-b" + (ai.engine === "manus" ? " on" : "")} onClick={() => ai.set({ engine: "manus" })}>
          Manus
        </button>
        <button type="button" className={"seg-b" + (ai.engine === "openai" ? " on" : "")} onClick={() => ai.set({ engine: "openai" })}>
          ChatGPT
        </button>
      </span>
      {ai.engine === "manus" ? (
        <select value={profile} onChange={(e) => onProfile(e.target.value)} title={t("ws.manusProfile")}>
          <ManusProfileOptions />
        </select>
      ) : (
        <>
          <select value={effective} onChange={(e) => ai.set({ model: e.target.value })} title={t("ws.imageModel")} disabled={!ai.hasOpenai}>
            {list.map((id) => (
              <option key={id} value={id}>
                {id}
                {id === rec ? "  ★" : ""}
              </option>
            ))}
            {!list.length && <option value="">{t("ws.imageModelDefault")}</option>}
          </select>
          <select
            value={qualities.includes(ai.quality) ? ai.quality : "high"}
            onChange={(e) => ai.set({ quality: e.target.value })}
            title={t("ws.imageQuality")}
            disabled={!ai.hasOpenai}
          >
            {qualities.map((q) => (
              <option key={q} value={q}>
                {t("ws.imageQuality")}: {q}
              </option>
            ))}
          </select>
        </>
      )}
    </>
  );

  return inline ? (
    <span className="row tiny muted" style={{ gap: 6, margin: 0, alignItems: "center", flexWrap: "wrap" }}>
      {body}
    </span>
  ) : (
    <div className="field">
      <span>{ai.engine === "openai" ? t("ws.imageEngineLabel") : t("ws.manusProfile")}</span>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {body}
      </div>
      {ai.engine === "openai" && !ai.hasOpenai && <span className="tiny err-t">{t("ws.imageAiMissing")}</span>}
    </div>
  );
}
