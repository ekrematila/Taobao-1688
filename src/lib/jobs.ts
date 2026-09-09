import type { JobView } from "@shared/types.ts";

export interface RunningJob<T> {
  promise: Promise<T>;
  cancel: () => void;
}

/**
 * Kick off a server job (via `start` which returns { jobId }), then poll
 * /api/jobs/:id until it finishes. `onProgress` gets every poll snapshot.
 */
export function runJob<T>(
  start: () => Promise<{ jobId: string }>,
  onProgress: (j: JobView) => void,
  pollMs = 1200,
): RunningJob<T> {
  let jobId = "";
  let stopped = false;

  const promise = (async () => {
    const { jobId: id } = await start();
    jobId = id;
    while (!stopped) {
      await new Promise((r) => setTimeout(r, pollMs));
      const res = await fetch(`/api/jobs/${id}`);
      if (res.status === 404) throw new Error("İş kaydı düştü.");
      const j = (await res.json()) as JobView;
      onProgress(j);
      if (j.status === "done") return j.result as T;
      if (j.status === "error") throw new Error(j.error || "İş başarısız oldu.");
      if (j.status === "cancelled") throw new JobCancelled();
    }
    throw new JobCancelled();
  })();

  return {
    promise,
    cancel: () => {
      stopped = true;
      if (jobId) fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => {});
    },
  };
}

export class JobCancelled extends Error {
  constructor() {
    super("İşlem iptal edildi.");
    this.name = "JobCancelled";
  }
}
