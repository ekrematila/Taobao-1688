import { randomUUID } from "node:crypto";
import { stopManusTask } from "./manus.ts";

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

/**
 * How many AI jobs run at once; the rest wait in a FIFO queue. The image
 * translate/edit batches fan out to one job PER image (so all N show in the
 * operations area AND all start together), so this is 10 — a typical bulk
 * selection runs fully in parallel. The Manus task-spawn throttle (manus.ts,
 * ~600ms) + 429 back-off still protect the API.
 */
const MAX_CONCURRENT = Number(process.env.JOB_CONCURRENCY || 10);

export interface JobStep {
  label: string;
  state: "pending" | "active" | "done" | "skipped";
}

export interface JobView {
  id: string;
  kind: string;
  status: JobStatus;
  statusText: string;
  steps: JobStep[];
  progress: number; // 0..1
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export class Cancelled extends Error {
  constructor() {
    super("İşlem iptal edildi.");
  }
}

export interface JobCtx {
  signal: AbortSignal;
  /** free-text status shown live in the UI ("Görseller çevriliyor…") */
  setStatus(text: string): void;
  /** declare the ordered checklist once at the start */
  plan(labels: string[]): void;
  /** mark a planned step active (and the previous one done) */
  step(label: string): void;
  /** mark a planned step skipped ("çeviriye gerek yok") */
  skip(label: string): void;
  /** stash a Manus task id so cancel() can also stop it remotely */
  bindManusTask(taskId: string): void;
  throwIfCancelled(): void;
}

interface JobInternal extends JobView {
  ac: AbortController;
  manusTaskId?: string;
  onCancel: (() => void)[];
  runner?: (ctx: JobCtx) => Promise<unknown>;
}

const jobs = new Map<string, JobInternal>();
const waiting: string[] = [];
let activeCount = 0;

function toView(j: JobInternal): JobView {
  const total = j.steps.length || 1;
  const done = j.steps.filter((s) => s.state === "done" || s.state === "skipped").length;
  return {
    id: j.id,
    kind: j.kind,
    status: j.status,
    statusText: j.statusText,
    steps: j.steps,
    progress: j.status === "done" ? 1 : done / total,
    result: j.result,
    error: j.error,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };
}

export function getJob(id: string): JobView | null {
  const j = jobs.get(id);
  return j ? toView(j) : null;
}

/** All known jobs (last ~10 min), newest first — for the jobs drawer. */
export function listJobs(): JobView[] {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).map(toView);
}

export function cancelJob(id: string): boolean {
  const j = jobs.get(id);
  if (!j || (j.status !== "running" && j.status !== "queued")) return false;
  const wasQueued = j.status === "queued";
  j.status = "cancelled";
  j.statusText = "İptal edildi.";
  j.updatedAt = Date.now();
  if (wasQueued) {
    const i = waiting.indexOf(id);
    if (i >= 0) waiting.splice(i, 1);
  }
  j.ac.abort();
  for (const fn of j.onCancel) {
    try {
      fn();
    } catch {
      /* best effort */
    }
  }
  return true;
}

function pump() {
  while (activeCount < MAX_CONCURRENT && waiting.length) {
    const id = waiting.shift()!;
    const j = jobs.get(id);
    if (!j || j.status !== "queued" || !j.runner) continue;
    activeCount++;
    j.status = "running";
    j.statusText = "Başlatılıyor…";
    j.updatedAt = Date.now();
    void execJob(j);
  }
}

async function execJob(j: JobInternal) {
  const touch = () => (j.updatedAt = Date.now());
  const ctx: JobCtx = {
    signal: j.ac.signal,
    setStatus(text) {
      j.statusText = text;
      touch();
    },
    plan(labels) {
      j.steps = labels.map((label, i) => ({ label, state: i === 0 ? "active" : "pending" }));
      touch();
    },
    step(label) {
      let hitActive = false;
      for (const s of j.steps) {
        if (s.label === label) {
          s.state = "active";
          hitActive = true;
        } else if (!hitActive && s.state !== "skipped") {
          s.state = "done";
        }
      }
      j.statusText = label;
      touch();
    },
    skip(label) {
      const s = j.steps.find((x) => x.label === label);
      if (s) s.state = "skipped";
      touch();
    },
    bindManusTask(taskId) {
      j.manusTaskId = taskId;
      j.onCancel.push(() => stopManusTask(taskId).catch(() => {}));
    },
    throwIfCancelled() {
      if (j.ac.signal.aborted) throw new Cancelled();
    },
  };

  try {
    const result = await j.runner!(ctx);
    if (j.ac.signal.aborted) {
      j.status = "cancelled";
      j.statusText = "İptal edildi.";
    } else {
      j.status = "done";
      j.statusText = "Tamamlandı.";
      j.result = result;
      for (const s of j.steps) if (s.state !== "skipped") s.state = "done";
    }
  } catch (e) {
    if (e instanceof Cancelled || j.ac.signal.aborted) {
      j.status = "cancelled";
      j.statusText = "İptal edildi.";
    } else {
      j.status = "error";
      j.error = (e as Error).message || "Bilinmeyen hata";
      j.statusText = "Hata: " + j.error;
      console.error(`[job ${j.kind}]`, e);
    }
  } finally {
    j.updatedAt = Date.now();
    activeCount--;
    setTimeout(() => jobs.delete(j.id), 10 * 60 * 1000);
    pump();
  }
}

/** Register a Manus stop callback for a running job (used by manus client). */
export function onJobCancel(id: string, fn: () => void) {
  const j = jobs.get(id);
  if (j) j.onCancel.push(fn);
}

export function startJob<T>(kind: string, run: (ctx: JobCtx) => Promise<T>): string {
  const id = randomUUID();
  const ac = new AbortController();
  const j: JobInternal = {
    id,
    kind,
    status: "queued",
    statusText: activeCount >= MAX_CONCURRENT ? "Sırada…" : "Başlatılıyor…",
    steps: [],
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ac,
    onCancel: [],
    runner: run as (ctx: JobCtx) => Promise<unknown>,
  };
  jobs.set(id, j);
  waiting.push(id);
  pump();
  return id;
}
