import { useState, type ReactNode } from "react";

/** A titled section that collapses; open/closed state can persist per storageKey. */
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
      <button type="button" className="collapsible-h" onClick={toggle}>
        <span className="collapsible-caret">▸</span>
        <span className="collapsible-title">{title}</span>
        {right != null && (
          <span className="collapsible-right" onClick={(e) => e.stopPropagation()}>
            {right}
          </span>
        )}
      </button>
      {open && <div className="collapsible-b">{children}</div>}
    </div>
  );
}
