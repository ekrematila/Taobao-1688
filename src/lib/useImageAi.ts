import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { getImageEngineChoice, setImageEngineChoice, subscribeImageEngine, type ImageEngine } from "./imageEngineStore";

/**
 * The image engine in effect + whether its API key exists. Until the operator picks one,
 * the engine follows the keys: Manus when it's set up (today's behaviour), OpenAI when
 * that's the only image-capable key.
 */
export function useImageAi() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const choice = useSyncExternalStore(subscribeImageEngine, getImageEngineChoice);
  const hasManus = !!settings.data?.hasManusKey;
  const hasOpenai = !!settings.data?.hasOpenaiKey;
  const engine: ImageEngine = choice?.engine ?? (!hasManus && hasOpenai ? "openai" : "manus");

  // make the key-driven default explicit so non-React callers (api.ts) agree with the UI
  useEffect(() => {
    if (settings.data && !getImageEngineChoice() && engine === "openai")
      setImageEngineChoice({ engine: "openai", model: "", quality: "high" });
  }, [settings.data, engine]);

  return {
    engine,
    model: choice?.model ?? "",
    quality: choice?.quality ?? "high",
    hasManus,
    hasOpenai,
    /** the selected engine's key is configured, so image AI can run */
    ready: engine === "openai" ? hasOpenai : hasManus,
    openaiDefaults: settings.data?.openaiDefaults ?? {},
    set: (patch: Partial<{ engine: ImageEngine; model: string; quality: string }>) =>
      setImageEngineChoice({ engine, model: choice?.model ?? "", quality: choice?.quality ?? "high", ...patch }),
  };
}
