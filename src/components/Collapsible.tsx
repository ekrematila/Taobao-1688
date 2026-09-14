import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A titled section that collapses; open/closed state can persist per storageKey.
 *
 * The smooth open/close is a measured-height JS transition (ref.scrollHeight
 * animated via inline style), not the CSS-only `grid-template-rows:0fr->1fr`
 * trick. That trick relies on a grid item's automatic minimum size being
 * content-based, but the `overflow:hidden` this component needs on the inner
 * content (to actually clip it while collapsed) resets a flex/grid item's
 * automatic minimum size to 0 per spec — so the "1fr" row ends up sized by
 * whatever tiny intrinsic height is left (padding/border only) instead of the
 * real content height, and the panel opens permanently clipped to a sliver.
 * Measuring the real height in JS sidesteps that entirely.
 */
export default function Collapsible({
  title,
  children,
  defaultOpen = true,
  storageKey,
  right,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  right?: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const v = localStorage.getItem("tps.collapse." + storageKey);
      return v == null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // first mount: snap to the right state with no animation (no click yet)
    if (firstRun.current) {
      firstRun.current = false;
      el.style.height = open ? "auto" : "0px";
      el.style.overflow = open ? "visible" : "hidden";
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (open) {
        el.style.height = "auto";
        el.style.overflow = "visible";
      } else {
        el.style.overflow = "hidden";
      }
    };
    if (open) {
      el.style.overflow = "hidden";
      el.style.height = el.scrollHeight + "px";
      // already at target height (no measurable change) — nothing will
      // transition, so transitionend never fires; finish immediately.
      if (el.scrollHeight === 0) { finish(); return () => {}; }
    } else {
      el.style.overflow = "hidden";
      el.style.height = el.scrollHeight + "px";
      void el.offsetHeight;
      el.style.height = "0px";
    }
    const onEnd = (e: TransitionEvent) => { if (e.propertyName === "height") finish(); };
    el.addEventListener("transitionend", onEnd);
    const timeout = setTimeout(finish, 450);
    return () => {
      el.removeEventListener("transitionend", onEnd);
      clearTimeout(timeout);
    };
  }, [open]);

  const toggle = () =>
    setOpen((o) => {
      const n = !o;
      if (storageKey) {
        try {
          localStorage.setItem("tps.collapse." + storageKey, n ? "1" : "0");
        } catch {
          /* private mode */
        }
      }
      return n;
    });
  return (
    <div className={"collapsible" + (open ? " open" : "")}>
      <button type="button" className="collapsible-h" onClick={toggle} aria-expanded={open}>
        <span className="collapsible-caret">▸</span>
        <span className="collapsible-title">{title}</span>
        {right != null && (
          <span className="collapsible-right" onClick={(e) => e.stopPropagation()}>
            {right}
          </span>
        )}
      </button>
      <div ref={bodyRef} className="collapsible-wrap">
        <div className="collapsible-b">{children}</div>
      </div>
    </div>
  );
}
