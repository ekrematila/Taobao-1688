import type { JobView } from "@shared/types.ts";
import { useI18n } from "../i18n";

export default function JobProgress({
  job,
  onCancel,
}: {
  job: JobView | null;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  if (!job) return null;
  const pct = Math.round((job.progress || 0) * 100);
  return (
    <div className="jobbox">
      <div className="between">
        <div className="row" style={{ gap: 8 }}>
          {job.status === "running" ? <span className="spin" /> : job.status === "error" ? "⚠️" : "✓"}
          <b className="tiny">{job.statusText}</b>
        </div>
        {job.status === "running" && (
          <button className="btn ghost sm" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        )}
      </div>
      <div className="jobbar">
        <span style={{ width: `${pct}%` }} />
      </div>
      {job.steps.length > 0 && (
        <ul className="joblist">
          {job.steps.map((s, i) => (
            <li key={i} className={`js-${s.state}`}>
              <span className="jsmark">
                {s.state === "done" ? "✓" : s.state === "skipped" ? "–" : s.state === "active" ? "•" : "·"}
              </span>
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
