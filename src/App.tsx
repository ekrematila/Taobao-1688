import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { I18nContext, type Lang } from "./i18n";
import Layout from "./components/Layout";
import Studio from "./pages/Studio";
import Blog from "./pages/Blog";
import SettingsPage from "./pages/Settings";
import History from "./pages/History";
import Archive from "./pages/Archive";
import Usage from "./pages/Usage";
import Login from "./pages/Login";

type Theme = "system" | "light" | "dark";

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("tps.lang") as Lang) || "tr");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("tps.theme") as Theme) || "system");

  useEffect(() => {
    localStorage.setItem("tps.lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    localStorage.setItem("tps.theme", theme);
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);

  const me = useQuery({ queryKey: ["me"], queryFn: api.me });

  const i18n = useMemo(() => ({ lang, setLang }), [lang]);

  if (me.isLoading) {
    return <div className="center-screen">…</div>;
  }
  if (me.data?.needsAuth && !me.data.authed) {
    return (
      <I18nContext.Provider value={i18n}>
        <Login onDone={() => me.refetch()} />
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={i18n}>
      <Routes>
        <Route element={<Layout theme={theme} setTheme={setTheme} />}>
          <Route index element={<Studio />} />
          <Route path="studio/:draftId" element={<Studio />} />
          <Route path="blog" element={<Blog />} />
          <Route path="blog/:blogId" element={<Blog />} />
          <Route path="history" element={<History />} />
          <Route path="archive" element={<Archive />} />
          <Route path="usage" element={<Usage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </I18nContext.Provider>
  );
}
