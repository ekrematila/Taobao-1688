import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import type { DraftSummary } from "@shared/types.ts";

export default function History() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const drafts = useQuery({ queryKey: ["drafts"], queryFn: api.drafts });
  const [confirm, setConfirm] = useState<DraftSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api.deleteDraft(confirm.id);
      toast(t("history.deleted"), "ok");
      setConfirm(null);
      drafts.refetch();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="title">{t("nav.history")}</div>
      </div>
      <div className="content">
        <div className="card">
          <div className="card-b">
            {!drafts.data?.length ? (
              <div className="empty">{t("history.empty")}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("history.colTitle")}</th>
                    <th>{t("history.colPlatformId")}</th>
                    <th>{t("history.colChannel")}</th>
                    <th>{t("history.colStep")}</th>
                    <th>{t("history.colRevision")}</th>
                    <th>{t("history.colUpdated")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.data.map((d) => (
                    <tr key={d.id}>
                      <td>{d.title || "—"}</td>
                      <td className="mono">
                        {d.platform} · {d.numIid}
                      </td>
                      <td>{d.channel || "—"}</td>
                      <td>{d.step}/3</td>
                      <td>{d.revisionCount}</td>
                      <td className="tiny muted">{new Date(d.updatedAt).toLocaleString()}</td>
                      <td>
                        <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn sm" onClick={() => nav(`/studio/${d.id}`)}>
                            {t("common.open")}
                          </button>
                          <button className="btn sm danger" onClick={() => setConfirm(d)}>
                            {t("history.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          {t("history.note")}
        </p>
      </div>

      {confirm && (
        <div className="modal-scrim" onClick={() => !deleting && setConfirm(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("history.deleteConfirmTitle")}</h3>
            <p className="sub">{t("history.deleteConfirmBody", { title: confirm.title || confirm.numIid })}</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setConfirm(null)} disabled={deleting}>
                {t("common.cancel")}
              </button>
              <button className="btn danger" onClick={doDelete} disabled={deleting}>
                {deleting ? <span className="spin" /> : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
