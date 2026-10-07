import { providerOf } from "@shared/models.ts";
import { useModels } from "../lib/useModels";

/** The AI model <option>s every picker shares, grouped by who serves them
 *  (claude-* → Claude, gpt-* → ChatGPT). Drop it inside a <select>. Brand-new
 *  releases found live by the server come first in their group. */
export default function ModelOptions({
  withLabel = false,
  withPrice = false,
  extraIds = [],
}: {
  withLabel?: boolean;
  withPrice?: boolean;
  /** ids not in the catalogue (e.g. a saved default) — kept selectable */
  extraIds?: string[];
}) {
  const { models } = useModels();
  const known = new Set(models.map((m) => m.id));
  const extras = extraIds.filter((id, i, a) => id && !known.has(id) && a.indexOf(id) === i);
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
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
