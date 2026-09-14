import { useRef, useState, type ReactNode } from "react";
import type { DraftSummary } from "@shared/types.ts";
import { useI18n } from "../i18n";

/**
 * Wraps a draft row/card so hovering it for ~1s shows a small summary of
 * what was last done for that product and which AI model produced it.
 * Deliberately delayed (not the instant `.hinttip` `:hover` pattern used
 * elsewhere) so briefly passing the cursor over a long list doesn't flash a
 * popover per row.
 */
export default function DraftHoverPreview({ draft, children }: { draft: DraftSummary; children: ReactNode }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const onEnter = () => {
    clear();
    timer.current = window.setTimeout(() => setShow(true), 1000);
  };
  const onLeave = () => {
    clear();
    setShow(false);
  };

  return (
    <div
      className="draft-hover-wrap"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {children}
      {show && (
        <div className="draft-hover-pop" role="tooltip">
          <div className="tiny">
            <b>{t("history.hoverModel")}</b>: {draft.lastModel || t("history.hoverNone")}
          </div>
          {draft.descChars != null && (
            <div className="tiny">
              {t("history.hoverDesc")}: {draft.descChars.toLocaleString()} {t("history.hoverChars")}
            </div>
          )}
          {draft.tagCount != null && (
            <div className="tiny">
              {t("history.hoverTags")}: {draft.tagCount}
            </div>
          )}
          <div className="tiny muted">
            {t("history.hoverStep")}: {draft.step}/4
          </div>
        </div>
      )}
    </div>
  );
}
