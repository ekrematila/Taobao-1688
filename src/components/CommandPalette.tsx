import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
  keywords?: string;
}

/** Global command palette — Ctrl/Cmd-K. Navigation + a few quick actions. */
export default function CommandPalette({
  onGuide,
  onToggleTheme,
  onToggleLang,
}: {
  onGuide: () => void;
  onToggleTheme: () => void;
  onToggleLang: () => void;
}) {
  const { t } = useI18n();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    const openEvt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("tps:openPalette", openEvt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tps:openPalette", openEvt);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const go = (to: string) => () => {
    nav(to);
    setOpen(false);
  };
  const act = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  const actions: PaletteAction[] = useMemo(
    () => [
      { id: "nav-studio", group: t("cmd.navigate"), label: t("nav.studio"), hint: "g 1", run: go("/") },
      { id: "nav-blog", group: t("cmd.navigate"), label: t("nav.blog"), hint: "g 2", run: go("/blog") },
      { id: "nav-history", group: t("cmd.navigate"), label: t("nav.history"), hint: "g 3", run: go("/history") },
      { id: "nav-archive", group: t("cmd.navigate"), label: t("nav.archive"), hint: "g 4", run: go("/archive") },
      { id: "nav-usage", group: t("cmd.navigate"), label: t("nav.usage"), hint: "g 5", run: go("/usage") },
      { id: "nav-settings", group: t("cmd.navigate"), label: t("nav.settings"), hint: "g 6", run: go("/settings") },
      { id: "act-new-product", group: t("cmd.actions"), label: t("studio.newProduct"), run: act(() => nav("/")) },
      {
        id: "act-new-blog",
        group: t("cmd.actions"),
        label: t("blog.newCategory"),
        run: act(() => {
          nav("/blog");
          setTimeout(() => window.dispatchEvent(new CustomEvent("tps:newCategoryBlog")), 60);
        }),
      },
      { id: "act-guide", group: t("cmd.actions"), label: t("nav.guide"), run: act(onGuide) },
      { id: "act-theme", group: t("cmd.actions"), label: t("footer.theme"), run: act(onToggleTheme) },
      { id: "act-lang", group: t("cmd.actions"), label: t("footer.language"), run: act(onToggleLang) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return actions;
    return actions.filter((a) => (a.label + " " + a.group + " " + (a.keywords || "")).toLowerCase().includes(s));
  }, [q, actions]);

  if (!open) return null;

  const groups = [...new Set(filtered.map((a) => a.group))];

  return (
    <div className="cmdk-scrim" onPointerDown={() => setOpen(false)}>
      <div className="cmdk" onPointerDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          value={q}
          placeholder={t("cmd.placeholder")}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              filtered[sel]?.run();
            }
          }}
        />
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="cmdk-empty">{t("cmd.none")}</div>}
          {groups.map((g) => (
            <div key={g}>
              <div className="cmdk-grp">{g}</div>
              {filtered
                .filter((a) => a.group === g)
                .map((a) => {
                  const idx = filtered.indexOf(a);
                  return (
                    <button
                      key={a.id}
                      className={"cmdk-item" + (idx === sel ? " on" : "")}
                      onMouseEnter={() => setSel(idx)}
                      onClick={a.run}
                    >
                      <span>{a.label}</span>
                      {a.hint && <kbd>{a.hint}</kbd>}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span>↑↓ {t("cmd.move")}</span>
          <span>↵ {t("cmd.select")}</span>
          <span>esc {t("common.close")}</span>
        </div>
      </div>
    </div>
  );
}
