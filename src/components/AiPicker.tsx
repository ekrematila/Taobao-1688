import {
  CLAUDE_MODELS,
  EFFORT_LEVELS,
  EFFORT_LABEL,
  THINKING_MODES,
  THINKING_LABEL,
  MANUS_PROFILES,
  type Effort,
  type ThinkingMode,
} from "@shared/models.ts";

/**
 * One compact control for "which AI, how smart" — dropped into every card that
 * runs an AI action. `provider` picks the shape:
 *   - "claude": model + effort + thinking
 *   - "manus":  agent profile (version)
 *   - "both":   a Claude/Manus toggle, then the matching controls
 * `value` is a partial bag; unset fields fall back to the app defaults server-side.
 */
export interface AiChoice {
  provider?: "claude" | "manus";
  model?: string;
  effort?: Effort | "";
  thinking?: ThinkingMode | "";
  manusProfile?: string;
}

export default function AiPicker({
  kind = "claude",
  value,
  onChange,
  label,
  allowProviderToggle = false,
}: {
  kind?: "claude" | "manus";
  value: AiChoice;
  onChange: (next: AiChoice) => void;
  label?: string;
  allowProviderToggle?: boolean;
}) {
  const v = value || {};
  const set = (p: Partial<AiChoice>) => onChange({ ...v, ...p });
  const provider = allowProviderToggle ? v.provider || "claude" : kind;

  return (
    <div className="ai-picker">
      {label && <span className="ai-picker-l">{label}</span>}
      {allowProviderToggle && (
        <span className="seg tiny">
          <button type="button" className={"seg-b" + (provider === "claude" ? " on" : "")} onClick={() => set({ provider: "claude" })}>
            Claude
          </button>
          <button type="button" className={"seg-b" + (provider === "manus" ? " on" : "")} onClick={() => set({ provider: "manus" })}>
            Manus
          </button>
        </span>
      )}
      {provider === "claude" ? (
        <>
          <select value={v.model || ""} onChange={(e) => set({ model: e.target.value })} title="Model">
            <option value="">model: varsayılan</option>
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
          <select value={v.effort || ""} onChange={(e) => set({ effort: (e.target.value || "") as Effort | "" })} title="Zeka / çaba">
            <option value="">çaba: varsayılan</option>
            {EFFORT_LEVELS.map((e) => (
              <option key={e} value={e}>
                {EFFORT_LABEL[e]}
              </option>
            ))}
          </select>
          <select value={v.thinking || ""} onChange={(e) => set({ thinking: (e.target.value || "") as ThinkingMode | "" })} title="Düşünme">
            <option value="">düşünme: varsayılan</option>
            {THINKING_MODES.map((tm) => (
              <option key={tm} value={tm}>
                {THINKING_LABEL[tm]}
              </option>
            ))}
          </select>
        </>
      ) : (
        <select value={v.manusProfile || "manus-1.6"} onChange={(e) => set({ manusProfile: e.target.value })} title="Manus sürümü">
          {MANUS_PROFILES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
