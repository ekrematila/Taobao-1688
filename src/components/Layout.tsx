import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useI18n } from "../i18n";
import Guide from "./Guide";
import JobsDrawer from "./JobsDrawer";
import CommandPalette from "./CommandPalette";
import TunnelBadge from "./TunnelBadge";

type Theme = "system" | "light" | "dark";

export default function Layout({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const [guide, setGuide] = useState(false);
  const themeIcon = theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥️";
  const themeLabel = t(("theme." + theme) as any);

  const links: [string, string, string][] = [
    ["/", t("nav.studio"), "1"],
    ["/blog", t("nav.blog"), "2"],
    ["/history", t("nav.history"), "3"],
    ["/archive", t("nav.archive"), "4"],
    ["/usage", t("nav.usage"), "5"],
    ["/settings", t("nav.settings"), "6"],
  ];

  return (
    <div className="app">
      <aside className="side">
        {links.map(([to, label, k]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => "navlink" + (isActive ? " active" : "")}>
            {label}
            <span className="k">g {k}</span>
          </NavLink>
        ))}
        <div className="spacer" />

        <div className="sidefoot">
          <TunnelBadge />
          <button className="footrow" onClick={() => window.dispatchEvent(new CustomEvent("tps:openPalette"))}>
            <span>🔎 {t("cmd.open")}</span>
          </button>
          <button className="footrow" onClick={() => setGuide(true)}>
            <span>📘 {t("nav.guide")}</span>
          </button>
          <button
            className="footrow"
            onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          >
            <span>{t("footer.theme")}</span>
            <span className="val">{themeIcon} {themeLabel}</span>
          </button>
          <button className="footrow" onClick={() => setLang(lang === "tr" ? "en" : "tr")}>
            <span>{t("footer.language")}</span>
            <span className="val">{lang === "tr" ? "Türkçe" : "English"}</span>
          </button>
          <button
            className="footrow danger"
            onClick={async () => {
              await api.logout();
              location.reload();
            }}
          >
            <span>{t("common.logout")}</span>
          </button>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>
      {guide && <Guide onClose={() => setGuide(false)} />}
      <JobsDrawer />
      <GKeys nav={nav} />
      <CommandPalette
        onGuide={() => setGuide(true)}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
        onToggleLang={() => setLang(lang === "tr" ? "en" : "tr")}
      />
    </div>
  );
}

// global "g then number" navigation shortcut
function GKeys({ nav }: { nav: ReturnType<typeof useNavigate> }) {
  if (typeof window !== "undefined" && !(window as any).__gkeys) {
    (window as any).__gkeys = true;
    let armed = false;
    let timer: number;
    window.addEventListener("keydown", (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "g") {
        armed = true;
        clearTimeout(timer);
        timer = window.setTimeout(() => (armed = false), 800);
        return;
      }
      if (armed && /[1-6]/.test(e.key)) {
        armed = false;
        const map: Record<string, string> = { "1": "/", "2": "/blog", "3": "/history", "4": "/archive", "5": "/usage", "6": "/settings" };
        nav(map[e.key]);
      }
    });
  }
  return null;
}
