import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useI18n } from "../i18n";
import { providerOf } from "@shared/models.ts";
import { groupOpenAIModels } from "@shared/openaiModels.ts";
import { useModels } from "../lib/useModels";

/** The AI model <option>s every picker shares, grouped by who serves them
 *  (claude-* → Claude, gpt-* → ChatGPT). Drop it inside a <select>. Brand-new
 *  releases found live by the server come first in their group.
 *
 *  `purpose="code"` is for pickers that make the model write CODE (the Shopify HTML /
 *  CSS description): it stars the saved coding default and also offers the dedicated
 *  Codex models this OpenAI key has, which the plain writing list doesn't include. */
export default function ModelOptions({
  withLabel = false,
  withPrice = false,
  extraIds = [],
  purpose = "text",
}: {
  withLabel?: boolean;
  withPrice?: boolean;
  /** ids not in the catalogue (e.g. a saved default) — kept selectable */
  extraIds?: string[];
  purpose?: "text" | "code";
}) {
  const { t } = useI18n();
  const { models } = useModels();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const openai = useQuery({
    queryKey: ["openai-models"],
    queryFn: () => api.openaiModels(),
    staleTime: 30 * 60 * 1000,
    retry: 1,
    enabled: purpose === "code" && !!settings.data?.hasOpenaiKey,
  });
  const grouped = purpose === "code" ? groupOpenAIModels(openai.data?.ids ?? []) : null;
  const codeDefault = grouped ? settings.data?.openaiDefaults?.code || grouped.recommended.code?.id : undefined;
  const known = new Set(models.map((m) => m.id));
  const codex = grouped ? grouped.current.code.filter((id) => !known.has(id)) : [];
  const extras = extraIds.filter((id, i, a) => id && !known.has(id) && !codex.includes(id) && a.indexOf(id) === i);
  return (
    <>
      {extras.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
      {(["anthropic", "openai"] as const).map((prov) => {
        const group = models.filter((m) => providerOf(m.id) === prov);
        const ordered = [...group.filter((m) => m.isNew), ...group.filter((m) => !m.isNew)];
        return (
          <optgroup key={prov} label={prov === "openai" ? "ChatGPT (OpenAI)" : "Claude (Anthropic)"}>
            {ordered.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
                {withLabel ? ` — ${m.label}` : ""}
                {withPrice ? ` (${m.priceKnown === false ? "~" : ""}$${m.inPer1M}/$${m.outPer1M} /M)` : ""}
                {m.id === codeDefault ? `  ★ ${t("ai.codeDefault")}` : ""}
              </option>
            ))}
          </optgroup>
        );
      })}
      {codex.length > 0 && (
        <optgroup label={t("ai.codexGroup")}>
          {codex.map((id) => (
            <option key={id} value={id}>
              {id}
              {id === codeDefault ? `  ★ ${t("ai.codeDefault")}` : ""}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
