import { useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";

export default function Login({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api.login(pw);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card" style={{ width: 360 }} onSubmit={submit}>
        <div className="card-h">
          <h3>{t("login.title")}</h3>
        </div>
        <div className="card-b col">
          <label className="field">
            {t("login.password")}
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          </label>
          {err && <div className="tiny" style={{ color: "var(--danger)" }}>{err}</div>}
          <button className="btn primary" disabled={busy}>
            {busy ? <span className="spin" /> : t("login.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
