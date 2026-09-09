import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, blogGenJob, blogSeoJob } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { JobCancelled, type RunningJob } from "../lib/jobs";
import JobProgress from "./JobProgress";
import { downloadBlob } from "../lib/image";
import {
  BLOG_LAYOUTS,
  BLOG_THEMES,
  BLOG_VOICES,
  productStyleHint,
  renderBlogHtml,
} from "@shared/blogPresets.ts";
import type { BlogConfig, BlogRecord, JobView } from "@shared/types.ts";

const LANGS = ["English", "Türkçe", "Deutsch", "Français", "Español", "Italiano", "Nederlands", "日本語"];

export default function BlogStudio({
  blogId,
  defaultModel,
  defaultSiteUrl,
  onSaved,
}: {
  blogId: string;
  defaultModel: string;
  defaultSiteUrl?: string;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const nav = useNavigate();

  const blogQ = useQuery({ queryKey: ["blog", blogId], queryFn: () => api.blog(blogId) });
  const blog = blogQ.data ?? null;
  const draftQ = useQuery({
    queryKey: ["draft", blog?.draftId],
    queryFn: () => api.draft(blog!.draftId!),
    enabled: !!blog?.draftId,
  });
  const product = draftQ.data?.product ?? null;
  const hasVideo = !!product?.videoUrl;

  const [title, setTitle] = useState("");
  const [config, setConfig] = useState<BlogConfig | null>(null);
  const [model, setModel] = useState(defaultModel);
  const [targetLang, setTargetLang] = useState("English");
  const [useSeo, setUseSeo] = useState(true);
  const [job, setJob] = useState<JobView | null>(null);
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"preview" | "html" | "structure" | "seo">("preview");
  const jobRef = useRef<RunningJob<unknown> | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!blog) return;
    hydrated.current = false;
    setTitle(blog.title);
    // prefill the backlink site once from the saved brand URL if still blank
    setConfig(
      !blog.config.siteUrl && defaultSiteUrl
        ? { ...blog.config, siteUrl: defaultSiteUrl }
        : blog.config,
    );
  }, [blog?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setModel(defaultModel), [defaultModel]);

  // debounced silent autosave of title + config
  useEffect(() => {
    if (!config) return;
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const id = setTimeout(() => {
      api
        .patchBlog(blogId, { title, config })
        .then(() => {
          blogQ.refetch();
          onSaved();
        })
        .catch(() => {});
    }, 700);
    return () => clearTimeout(id);
  }, [title, config]); // eslint-disable-line react-hooks/exhaustive-deps

  const hint = useMemo(
    () => productStyleHint(product, config?.category),
    [product, config?.category],
  );

  const rawHtml = useMemo(() => {
    if (!blog?.doc || !config) return blog?.html || "";
    try {
      return renderBlogHtml(blog.doc, { config, hint }).full;
    } catch {
      return blog?.html || "";
    }
  }, [blog?.doc, blog?.html, config, hint]);

  // absolute-ify app-relative asset URLs so hero/video/images show inside the
  // srcDoc preview (the exported HTML keeps the portable relative form).
  const previewHtml = useMemo(
    () =>
      rawHtml
        .replace(/(src|href)="\/api\//g, `$1="${location.origin}/api/`)
        .replace(/(src|href)="\/\//g, `$1="https://`),
    [rawHtml],
  );

  if (blogQ.isLoading || !config) return <div className="empty">{t("common.loading")}</div>;
  if (!blog) return <div className="empty">{t("blog.notFound")}</div>;

  const patch = (p: Partial<BlogConfig>) => setConfig((c) => (c ? { ...c, ...p } : c));
  const patchHtml = (p: Partial<BlogConfig["html"]>) =>
    setConfig((c) => (c ? { ...c, html: { ...c.html, ...p } } : c));

  const canGenerate =
    blog.kind === "product" ? !!blog.draftId : !!config.siteUrl && /^https?:\/\/.+/i.test(config.siteUrl);

  async function runSeo() {
    setBusy("seo");
    const r = blogSeoJob({ blogId, targetLanguage: targetLang, model }, setJob);
    jobRef.current = r as RunningJob<unknown>;
    try {
      await r.promise;
      toast(t("blog.seoDone"), "ok");
      setTab("seo");
      await blogQ.refetch();
      onSaved();
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setJob(null);
    }
  }
  async function runGen() {
    if (!canGenerate) return toast(t("blog.needSite"), "err");
    setBusy("gen");
    const r = blogGenJob({ blogId, targetLanguage: targetLang, model, useSeo: useSeo && !!blog!.seo }, setJob);
    jobRef.current = r as RunningJob<unknown>;
    try {
      const res = (await r.promise) as { doc: { title: string } };
      if (res?.doc?.title) {
        hydrated.current = false;
        setTitle(res.doc.title);
      }
      toast(t("blog.genDone"), "ok");
      setTab("preview");
      await blogQ.refetch();
      onSaved();
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setJob(null);
    }
  }

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(rawHtml);
      toast(t("blog.copied"), "ok");
    } catch {
      toast(t("blog.copyFail"), "err");
    }
  };
  const dlHtml = () =>
    downloadBlob(new Blob([rawHtml], { type: "text/html" }), `${blog!.doc?.slug || "blog"}.html`);

  const backlinks = config.backlinks ?? [];

  return (
    <div className="col" style={{ gap: 14 }}>
      {/* header */}
      <div className="card">
        <div className="card-b col" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="badge brand">{blog.kind === "product" ? t("blog.product") : t("blog.category")}</span>
            {blog.draftId && (
              <button className="tiny linklike" onClick={() => nav(`/studio/${blog.draftId}`)}>
                {t("blog.openProduct")}
              </button>
            )}
          </div>
          <input
            className="blog-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("blog.titlePh")}
          />
        </div>
      </div>

      {/* backlinks + site */}
      <div className="card">
        <div className="card-h"><h4>🔗 {t("blog.linkTitle")}</h4></div>
        <div className="card-b col" style={{ gap: 10 }}>
          <label className="field">
            {t("blog.siteUrl")} <span style={{ color: "var(--danger,#e0322d)" }}>*</span>
            <input value={config.siteUrl} onChange={(e) => patch({ siteUrl: e.target.value })} placeholder="https://…" />
            <span className="tiny muted">{t("blog.siteUrlHint")}</span>
          </label>
          <label className="field">
            {t("blog.focusKeyword")}
            <input value={config.focusKeyword ?? ""} onChange={(e) => patch({ focusKeyword: e.target.value })} placeholder={t("blog.focusKeywordPh")} />
          </label>

          <div className="col" style={{ gap: 6 }}>
            <b className="tiny">{t("blog.extraLinks")}</b>
            {backlinks.map((b, i) => (
              <div key={i} className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <input
                  style={{ flex: "2 1 220px" }}
                  value={b.url}
                  placeholder="https://…"
                  onChange={(e) =>
                    patch({ backlinks: backlinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })
                  }
                />
                <input
                  style={{ flex: "1 1 140px" }}
                  value={b.label ?? ""}
                  placeholder={t("blog.linkLabelPh")}
                  onChange={(e) =>
                    patch({ backlinks: backlinks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                  }
                />
                <button className="btn ghost sm" onClick={() => patch({ backlinks: backlinks.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </div>
            ))}
            <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => patch({ backlinks: [...backlinks, { url: "", label: "" }] })}>
              + {t("blog.addLink")}
            </button>
          </div>

          <label className="field">
            {t("blog.notes")}
            <textarea value={config.notes ?? ""} onChange={(e) => patch({ notes: e.target.value })} placeholder={t("blog.notesPh")} style={{ minHeight: 60 }} />
          </label>
        </div>
      </div>

      {/* layout */}
      <div className="card">
        <div className="card-h"><h4>{t("blog.layoutTitle")}</h4><span className="sub">{t("blog.defaultProduct")}</span></div>
        <div className="card-b">
          <div className="layout-grid">
            {BLOG_LAYOUTS.map((L) => (
              <button
                key={L.id}
                className={"layout-chip" + (config.layout === L.id ? " active" : "")}
                onClick={() => patch({ layout: L.id })}
                title={lang === "tr" ? L.tr : L.en}
              >
                <span className="wire" dangerouslySetInnerHTML={{ __html: L.wire }} />
                <span className="lbl">{lang === "tr" ? L.tr : L.en}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* theme */}
      <div className="card">
        <div className="card-h"><h4>{t("blog.themeTitle")}</h4><span className="sub">{t("blog.defaultProduct")}</span></div>
        <div className="card-b">
          <div className="chips">
            {BLOG_THEMES.map((H) => (
              <button
                key={H.id}
                className={"chip blog-theme-chip" + (config.theme === H.id ? " active" : "")}
                onClick={() => patch({ theme: H.id })}
              >
                <span className="bt-swatch" style={{ background: "#fff", borderColor: "var(--line-strong)" }}>
                  <i style={{ background: H.vars["--accent"] }} />
                  <i style={{ background: H.vars["--card"] }} />
                </span>
                {lang === "tr" ? H.tr : H.en}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* voice */}
      <div className="card">
        <div className="card-h"><h4>{t("blog.voiceTitle")}</h4><span className="sub">{t("blog.defaultProduct")}</span></div>
        <div className="card-b">
          <div className="chips">
            {BLOG_VOICES.map((V) => (
              <button
                key={V.id}
                className={"chip" + (config.voice === V.id ? " active" : "")}
                onClick={() => patch({ voice: V.id })}
                title={V.guide}
              >
                {lang === "tr" ? V.tr : V.en}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* options */}
      <div className="card">
        <div className="card-h"><h4>{t("blog.optionsTitle")}</h4></div>
        <div className="card-b col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field" style={{ width: 130 }}>
              {t("blog.words")}
              <input type="number" min={400} max={4000} step={100} value={config.words} onChange={(e) => patch({ words: +e.target.value || 1200 })} />
            </label>
            <label className="field" style={{ width: 160 }}>
              {t("blog.language")}
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 200 }}>
              {t("blog.model")}
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {[defaultModel, "claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 6 }}>
              <input
                type="checkbox"
                checked={config.includeVideo}
                disabled={blog.kind === "product" && !hasVideo}
                onChange={(e) => patch({ includeVideo: e.target.checked })}
              />
              {t("blog.includeVideo")}
              {blog.kind === "product" && !hasVideo ? ` (${t("blog.noVideo")})` : ""}
            </label>
          </div>

          <div className="col" style={{ gap: 4 }}>
            <b className="tiny">{t("blog.htmlTitle")}</b>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              {([
                ["jsonLd", t("blog.htmlJsonLd")],
                ["faq", t("blog.htmlFaq")],
                ["toc", t("blog.htmlToc")],
                ["meta", t("blog.htmlMeta")],
                ["breadcrumbs", t("blog.htmlBreadcrumbs")],
                ["lazyImages", t("blog.htmlLazy")],
              ] as [keyof BlogConfig["html"], string][]).map(([k, labelText]) => (
                <label key={k} className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={config.html[k]} onChange={(e) => patchHtml({ [k]: e.target.checked })} />
                  {labelText}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="card">
        <div className="card-b col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn ghost" onClick={runSeo} disabled={!!busy}>
              {busy === "seo" ? <span className="spin" /> : "🔍 " + t("blog.researchSeo")}
            </button>
            <button className="btn primary" onClick={runGen} disabled={!!busy || !canGenerate}>
              {busy === "gen" ? <span className="spin" /> : blog.doc ? t("blog.regenerate") : t("blog.generate")}
            </button>
            <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={useSeo} onChange={(e) => setUseSeo(e.target.checked)} disabled={!blog.seo} />
              {t("blog.useSeo")}
            </label>
            {!canGenerate && <span className="tiny muted">{t("blog.needSite")}</span>}
          </div>
          {job && <JobProgress job={job} onCancel={() => jobRef.current?.cancel()} />}
        </div>
      </div>

      {/* result */}
      {(blog.doc || blog.seo) && (
        <div className="card">
          <div className="card-h" style={{ gap: 6, flexWrap: "wrap" }}>
            {(["preview", "html", "structure", "seo"] as const).map((tk) => (
              <button
                key={tk}
                className={"chip" + (tab === tk ? " active" : "")}
                onClick={() => setTab(tk)}
                disabled={(tk !== "seo" && !blog.doc) || (tk === "seo" && !blog.seo)}
              >
                {t(`blog.tab.${tk}` as any)}
              </button>
            ))}
            <div className="grow" style={{ flex: 1 }} />
            {blog.doc && tab !== "seo" && (
              <>
                <button className="btn ghost sm" onClick={copyHtml}>{t("blog.copyHtml")}</button>
                <button className="btn ghost sm" onClick={dlHtml}>{t("blog.downloadHtml")}</button>
              </>
            )}
          </div>
          <div className="card-b">
            {tab === "preview" && blog.doc && (
              <iframe
                title="blog-preview"
                className="blog-preview"
                sandbox="allow-same-origin"
                srcDoc={previewHtml}
              />
            )}
            {tab === "html" && blog.doc && (
              <textarea readOnly className="blog-html-src" value={rawHtml} onFocus={(e) => e.currentTarget.select()} />
            )}
            {tab === "structure" && blog.doc && (
              <div className="col" style={{ gap: 8 }}>
                <div className="tiny muted">
                  {t("blog.slug")}: <code>{blog.doc.slug}</code> · {t("blog.metaDesc")}: {blog.doc.metaDescription.length}/160
                </div>
                <p className="tiny"><b>{t("blog.metaTitle")}:</b> {blog.doc.seoTitle}</p>
                <p className="tiny"><b>{t("blog.metaDesc")}:</b> {blog.doc.metaDescription}</p>
                <p className="tiny"><b>{t("blog.keywords")}:</b> {blog.doc.keywords.join(", ")}</p>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {blog.doc.sections.map((s, i) => (
                    <li key={i} className="tiny">
                      {s.heading}
                      {s.linkUrls && s.linkUrls.length > 0 ? ` · 🔗${s.linkUrls.length}` : ""}
                    </li>
                  ))}
                </ol>
                {blog.doc.faq.length > 0 && (
                  <div className="tiny"><b>SSS:</b> {blog.doc.faq.map((f) => f.q).join(" · ")}</div>
                )}
              </div>
            )}
            {tab === "seo" && blog.seo && (
              <div className="col" style={{ gap: 10 }}>
                <p className="tiny"><b>{t("blog.metaTitle")}:</b> {blog.seo.metaTitle}</p>
                <p className="tiny"><b>{t("blog.metaDesc")}:</b> {blog.seo.metaDescription}</p>
                <p className="tiny"><b>{t("blog.words")}:</b> ~{blog.seo.words}</p>
                <div>
                  <b className="tiny">{t("blog.clusters")}</b>
                  <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                    {blog.seo.clusters.map((c, i) => (
                      <li key={i} className="tiny">
                        <b>{c.name}</b> <span className="muted">({c.intent})</span>: {c.keywords.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <b className="tiny">{t("blog.outline")}</b>
                  <ol style={{ margin: "4px 0", paddingLeft: 18 }}>
                    {blog.seo.outline.map((o, i) => <li key={i} className="tiny">{o}</li>)}
                  </ol>
                </div>
                {blog.seo.gaps.length > 0 && (
                  <div>
                    <b className="tiny">{t("blog.gaps")}</b>
                    <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                      {blog.seo.gaps.map((g, i) => <li key={i} className="tiny">{g}</li>)}
                    </ul>
                  </div>
                )}
                {blog.seo.notes && <p className="tiny muted">{blog.seo.notes}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
