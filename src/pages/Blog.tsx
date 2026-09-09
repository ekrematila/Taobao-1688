import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import BlogStudio from "../components/BlogStudio";

export default function Blog() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const { blogId } = useParams();

  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const draftsQ = useQuery({ queryKey: ["drafts"], queryFn: api.drafts });
  const blogsQ = useQuery({ queryKey: ["blogs"], queryFn: () => api.blogs() });

  const [newCat, setNewCat] = useState<{ category: string; siteUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    const open = () => setNewCat({ category: "", siteUrl: settings.data?.brandUrl || "" });
    window.addEventListener("tps:newCategoryBlog", open);
    return () => window.removeEventListener("tps:newCategoryBlog", open);
  }, [settings.data?.brandUrl]);

  const productBlogByDraft = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blogsQ.data ?? []) if (b.kind === "product" && b.draftId) m.set(b.draftId, b.id);
    return m;
  }, [blogsQ.data]);

  const categoryBlogs = (blogsQ.data ?? []).filter((b) => b.kind === "category");

  // finished products first
  const drafts = [...(draftsQ.data ?? [])].sort((a, b) => (b.step >= 4 ? 1 : 0) - (a.step >= 4 ? 1 : 0));

  async function openProductBlog(draftId: string) {
    setBusy(true);
    try {
      const rec = await api.ensureProductBlog(draftId);
      await blogsQ.refetch();
      nav(`/blog/${rec.id}`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }
  async function createCategory() {
    if (!newCat) return;
    setBusy(true);
    try {
      const rec = await api.createCategoryBlog(newCat.category.trim(), newCat.siteUrl.trim());
      setNewCat(null);
      await blogsQ.refetch();
      nav(`/blog/${rec.id}`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }
  async function doDelete() {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await api.deleteBlog(confirmDel);
      const wasOpen = confirmDel === blogId;
      setConfirmDel(null);
      await blogsQ.refetch();
      if (wasOpen) nav("/blog");
      toast(t("blog.deleted"), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="title">{t("nav.blog")}</div>
        <div className="grow" style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={() => setNewCat({ category: "", siteUrl: settings.data?.brandUrl || "" })}>
          + {t("blog.newCategory")}
        </button>
      </div>

      <div className="content wide studio-shell">
        <aside className="studio-rail">
          <div className="rail-h">{t("blog.productBlogs")}</div>
          {drafts.length === 0 && <div className="tiny muted" style={{ padding: 8 }}>{t("blog.noProducts")}</div>}
          {drafts.map((d) => {
            const bid = productBlogByDraft.get(d.id);
            return (
              <div key={d.id} className={"rail-item" + (bid && bid === blogId ? " on" : "")}>
                <button
                  className="rail-open"
                  disabled={busy}
                  onClick={() => (bid ? nav(`/blog/${bid}`) : openProductBlog(d.id))}
                  title={d.title || d.numIid}
                >
                  <span className="rail-name">{d.title || d.numIid}</span>
                  <span className="tiny muted">
                    {d.step >= 4 ? "✓ " + t("blog.done") : t("blog.draftUnfinished")}
                    {bid ? " · 📝" : ""}
                  </span>
                </button>
                {bid && (
                  <button className="rail-del" title={t("blog.delete")} onClick={() => setConfirmDel(bid)}>
                    ×
                  </button>
                )}
              </div>
            );
          })}

          <div className="rail-h" style={{ marginTop: 14 }}>{t("blog.categoryBlogs")}</div>
          {categoryBlogs.length === 0 && <div className="tiny muted" style={{ padding: 8 }}>{t("blog.noCategory")}</div>}
          {categoryBlogs.map((b) => (
            <div key={b.id} className={"rail-item" + (b.id === blogId ? " on" : "")}>
              <button className="rail-open" onClick={() => nav(`/blog/${b.id}`)} title={b.title}>
                <span className="rail-name">{b.title}</span>
                <span className="tiny muted">{t("blog.category")}{b.hasDoc ? " · 📝" : ""}</span>
              </button>
              <button className="rail-del" title={t("blog.delete")} onClick={() => setConfirmDel(b.id)}>
                ×
              </button>
            </div>
          ))}
          <button className="btn ghost sm" style={{ margin: 8 }} onClick={() => setNewCat({ category: "", siteUrl: settings.data?.brandUrl || "" })}>
            + {t("blog.newCategory")}
          </button>
        </aside>

        <div className="studio-main">
          {blogId ? (
            <BlogStudio
              blogId={blogId}
              defaultModel={settings.data?.llmModel || "claude-sonnet-5"}
              defaultSiteUrl={settings.data?.brandUrl || ""}
              onSaved={() => blogsQ.refetch()}
            />
          ) : (
            <div className="card">
              <div className="card-b col" style={{ gap: 8 }}>
                <h3 style={{ margin: 0 }}>{t("blog.pickTitle")}</h3>
                <p className="sub" style={{ margin: 0 }}>{t("blog.pickHint")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {newCat && (
        <div className="modal-scrim" onClick={() => !busy && setNewCat(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("blog.newCategory")}</h3>
            <p className="sub">{t("blog.newCategoryHint")}</p>
            <label className="field">
              {t("blog.categoryName")}
              <input
                autoFocus
                value={newCat.category}
                onChange={(e) => setNewCat({ ...newCat, category: e.target.value })}
                placeholder={t("blog.categoryNamePh")}
              />
            </label>
            <label className="field">
              {t("blog.siteUrl")}
              <input
                value={newCat.siteUrl}
                onChange={(e) => setNewCat({ ...newCat, siteUrl: e.target.value })}
                placeholder="https://…"
              />
            </label>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
              <button className="btn" onClick={() => setNewCat(null)} disabled={busy}>
                {t("common.cancel")}
              </button>
              <button
                className="btn primary"
                onClick={createCategory}
                disabled={busy || !newCat.category.trim() || !/^https?:\/\/.+/i.test(newCat.siteUrl.trim())}
              >
                {busy ? <span className="spin" /> : t("common.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="modal-scrim" onClick={() => !busy && setConfirmDel(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("blog.deleteTitle")}</h3>
            <p className="sub">{t("blog.deleteBody")}</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
              <button className="btn" onClick={() => setConfirmDel(null)} disabled={busy}>
                {t("common.cancel")}
              </button>
              <button className="btn danger" onClick={doDelete} disabled={busy}>
                {busy ? <span className="spin" /> : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
