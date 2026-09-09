import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useI18n } from "../i18n";
import { downloadBlob } from "../lib/image";

export default function Archive() {
  const { t } = useI18n();
  const a = useQuery({ queryKey: ["archive"], queryFn: api.archive });

  async function redownload(id: string) {
    const res = await fetch(`/api/archive/${id}`);
    const row = await res.json();
    const p = row.payload;
    if (p?.csv) {
      downloadBlob(new Blob([p.csv], { type: "text/csv" }), `${row.title || "listing"}.csv`);
    } else if (p?.json) {
      downloadBlob(new Blob([p.json], { type: "application/json" }), `${row.title || "listing"}.json`);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="title">{t("nav.archive")}</div>
      </div>
      <div className="content">
        <div className="card">
          <div className="card-b">
            {!a.data?.length ? (
              <div className="empty">{t("archive.empty")}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("history.colTitle")}</th>
                    <th>{t("history.colChannel")}</th>
                    <th>{t("archive.colFormat")}</th>
                    <th>{t("archive.colDate")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {a.data.map((e) => (
                    <tr key={e.id}>
                      <td>{e.title}</td>
                      <td>{e.channel}</td>
                      <td className="mono">{e.format}</td>
                      <td className="tiny muted">{new Date(e.createdAt).toLocaleString()}</td>
                      <td>
                        <button className="btn sm" onClick={() => redownload(e.id)}>
                          {t("archive.redownload")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
