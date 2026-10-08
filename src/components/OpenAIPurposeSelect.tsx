import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useI18n } from "../i18n";
import { groupOpenAIModels, type OpenAICategory } from "@shared/openaiModels.ts";

/**
 * A model picker for ONE purpose (transcription, coding…) listing only the OpenAI models
 * this key has for it, newest first, ★ on the price/performance pick. Empty value = "use
 * the saved default for this purpose" (Settings → ChatGPT), shown as the effective model.
 */
export default function OpenAIPurposeSelect({
  category,
  value,
  onChange,
  disabled,
  exclude,
  title,
}: {
  category: OpenAICategory;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** hide ids that fit the purpose in general but not this job (e.g. live/realtime transcription) */
  exclude?: RegExp;
  title?: string;
}) {
  const { t } = useI18n();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const models = useQuery({ queryKey: ["openai-models"], queryFn: () => api.openaiModels(), staleTime: 30 * 60 * 1000, retry: 1, enabled: !!settings.data?.hasOpenaiKey });
  const grouped = groupOpenAIModels(models.data?.ids ?? []);
  const list = grouped.current[category].filter((id) => !exclude?.test(id.toLowerCase()));
  const rec = grouped.recommended[category]?.id;
  const saved = settings.data?.openaiDefaults?.[category];
  const effective = value || (saved && list.includes(saved) ? saved : rec && list.includes(rec) ? rec : list[0]) || "";
  if (!settings.data?.hasOpenaiKey) return <span className="tiny muted">{t("ws.imageAiMissing")}</span>;
  return (
    <select value={effective} onChange={(e) => onChange(e.target.value)} disabled={disabled || !list.length} title={title}>
      {list.map((id) => (
        <option key={id} value={id}>
          {id}
          {id === rec ? "  ★" : ""}
        </option>
      ))}
      {!list.length && <option value="">{t("settings.openaiNoneInKey")}</option>}
    </select>
  );
}
