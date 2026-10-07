import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { CLAUDE_MODELS, registerDiscovered, type ClaudeModel } from "@shared/models.ts";

/** The model catalogue every picker shows: the priced baseline right away, plus
 *  whatever new releases the server found live (refreshed every 30 minutes). */
export function useModels() {
  const q = useQuery({
    queryKey: ["models"],
    queryFn: () => api.models(),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
  const live = q.data?.models;
  if (live) registerDiscovered(live.filter((m) => m.isNew || m.priceKnown === false));
  const models: ClaudeModel[] = live ?? CLAUDE_MODELS;
  return { models, discovered: q.data?.discovered ?? [], errors: q.data?.errors ?? [], query: q };
}
