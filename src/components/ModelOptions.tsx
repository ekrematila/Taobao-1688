import { CLAUDE_MODELS, providerOf } from "@shared/models.ts";

/** The AI model <option>s every picker shares, grouped by who serves them
 *  (claude-* → Claude, gpt-* → ChatGPT). Drop it inside a <select>. */
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
  const known = new Set(CLAUDE_MODELS.map((m) => m.id));
  const extras = extraIds.filter((id, i, a) => id && !known.has(id) && a.indexOf(id) === i);
  return (
    <>
      {extras.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
      {(["anthropic", "openai"] as const).map((prov) => (
        <optgroup key={prov} label={prov === "openai" ? "ChatGPT (OpenAI)" : "Claude (Anthropic)"}>
          {CLAUDE_MODELS.filter((m) => providerOf(m.id) === prov).map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
              {withLabel ? ` — ${m.label}` : ""}
              {withPrice ? ` ($${m.inPer1M}/$${m.outPer1M} /M)` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
