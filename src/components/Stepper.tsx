import { useI18n } from "../i18n";

export default function Stepper({
  step,
  maxStep,
  minStep = 1,
  onGo,
}: {
  step: number;
  maxStep: number;
  minStep?: number;
  onGo: (s: number) => void;
}) {
  const { t } = useI18n();
  const steps = [
    { n: 1, label: t("step.1"), sub: t("step.1.sub") },
    { n: 2, label: t("step.2"), sub: t("step.2.sub") },
    { n: 3, label: t("step.3"), sub: t("step.3.sub") },
    { n: 4, label: t("step.4"), sub: t("step.4.sub") },
  ];
  return (
    <div className="stepper" role="tablist">
      {steps.map((s) => {
        const state = s.n === step ? "active" : s.n < step ? "done" : "";
        return (
          <button
            key={s.n}
            className={`step ${state}`}
            disabled={s.n > maxStep || s.n < minStep}
            aria-selected={s.n === step}
            onClick={() => onGo(s.n)}
          >
            <span className="n">{s.n < step ? "✓" : s.n}</span>
            <span className="lbl">
              <b>{s.label}</b>
              <span>{s.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
