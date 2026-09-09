import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useI18n } from "../i18n";

const ICON: Record<string, string> = {
  queued: "⏳",
  running: "▶",
  done: "✓",
  error: "✕",
  cancelled: "⊘",
};

export default function JobsDrawer() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["jobs"],
    queryFn: api.jobs,
    refetchInterval: 1500,
  });
  const jobs = q.data ?? [];
  const active = jobs.filter((j) => j.status === "running" || j.status === "queued");
  if (!jobs.length) return null;

  return (
    <div className={"jobsdrawer" + (open ? " open" : "")}>
      <button className="jobspill" onClick={() => setOpen((o) => !o)}>
        {active.length ? <span className="spin" /> : "🗂"} {t("jobs.title")}
        {active.length > 0 && <span className="n">{active.length}</span>}
        <span className="chev">{open ? "▾" : "▴"}</span>
      </button>
      {open && (
        <div className="jobslist">
          {jobs.slice(0, 12).map((j) => (
            <div key={j.id} className={"jobitem s-" + j.status}>
              <span className="ic">{ICON[j.status] ?? "•"}</span>
              <div className="body">
                <div className="mono">{j.kind}</div>
                <div className="tiny muted">{j.statusText}</div>
                {(j.status === "running" || j.status === "queued") && (
                  <div className="jobbar">
                    <span style={{ width: `${Math.round(j.progress * 100)}%` }} />
                  </div>
                )}
              </div>
              {(j.status === "running" || j.status === "queued") && (
                <button
                  className="btn ghost sm"
                  onClick={async () => {
                    await api.cancelJob(j.id);
                    q.refetch();
                  }}
                >
                  {t("common.cancel")}
                </button>
              )}
            </div>
          ))}
          <p className="tiny muted" style={{ margin: "4px 8px 0" }}>{t("jobs.note")}</p>
        </div>
      )}
    </div>
  );
}
