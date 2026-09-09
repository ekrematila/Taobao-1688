import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, composeImageJob, proxied, researchBrandJob, type Draft } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { downloadBlob, slugify } from "../lib/image";
import { JobCancelled, type RunningJob } from "../lib/jobs";
import JobProgress from "./JobProgress";
import { BRIEF_META, IMAGE_LENGTH_BANDS, buildStudioPrompt, wordCount } from "@shared/imageBriefs.ts";
import type { JobView } from "@shared/types.ts";

/** AI image / ad studio — Manus generates a brand-new image from the product
 *  photos. No manual canvas editing: describe it, pick the sources, generate. */

const SIZES: { id: string; label: string; w: number; h: number }[] = [
  { id: "sq", label: "1:1 · 1500", w: 1500, h: 1500 },
  { id: "sq2000", label: "1:1 · 2000", w: 2000, h: 2000 },
  { id: "p45", label: "4:5 · 1600×2000", w: 1600, h: 2000 },
  { id: "land", label: "16:9 · 1920×1080", w: 1920, h: 1080 },
  { id: "story", label: "9:16 · 1080×1920", w: 1080, h: 1920 },
  { id: "__custom__", label: "Özel / Custom", w: 1500, h: 1500 },
];

export default function StudioPanel({
  draft,
  seedUrls,
  seedType,
  seedBand,
  onClose,
  onApply,
}: {
  draft: Draft;
  seedUrls?: string[];
  seedType?: string;
  seedBand?: string;
  onClose: () => void;
  onApply: (url: string, remoteUrl?: string) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();

  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const MAX = 20;
  const [uploads, setUploads] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const lastPick = useRef<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [promptType, setPromptType] = useState<string>(seedType || "");
  const [band, setBand] = useState<string>(seedBand || "");
  const themeHint = useMemo(
    () =>
      Object.entries(draft.product?.props || {})
        .filter(([k]) => /tema|theme|renk|colou?r|stil|style|desen|pattern/i.test(k))
        .map(([, v]) => v)
        .join(", ")
        .slice(0, 120),
    [draft.product?.props],
  );
  const buildPrompt = (type: string, b: string) =>
    buildStudioPrompt({
      typeKey: type,
      band: b || undefined,
      product: draft.product,
      imageCount: picked.size,
      theme: themeHint || undefined,
    });
  // brand research — GLOBAL & fixed (the operator's own brand); researched once,
  // kept in Settings. Optional — off by default until a brief exists.
  const [researchOn, setResearchOn] = useState(false);
  const [brandUrl, setBrandUrl] = useState("");
  const [brandBrief, setBrandBrief] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    setBrandUrl((p) => p || s.brandUrl);
    setBrandBrief((p) => p || s.brandBrief);
    setResearchOn((p) => p || !!s.brandBrief);
  }, [settingsQ.data?.brandUrl, settingsQ.data?.brandBrief]);
  const [size, setSize] = useState(SIZES[0]);
  const [customW, setCustomW] = useState(1500);
  const [customH, setCustomH] = useState(1500);
  const [quality, setQuality] = useState<"standard" | "high" | "maximum">("high");
  const [profile, setProfile] = useState<"manus-1.6-lite" | "manus-1.6" | "manus-1.6-max">("manus-1.6");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const jobRef = useRef<RunningJob<unknown> | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [resultRemote, setResultRemote] = useState<string | undefined>(undefined);

  // history of everything generated here — persisted on the draft so re-opening
  // the studio still shows earlier results (the urls are permanent /api/media/…).
  type HistItem = { url: string; remoteUrl?: string; at: number; prompt: string; type?: string };
  const [history, setHistory] = useState<HistItem[]>(
    () => ((draft.imageState as any)?.studioHistory as HistItem[]) ?? [],
  );
  const persistHistory = (next: HistItem[]) => {
    setHistory(next);
    api
      .patchDraft(draft.id, { imageState: { ...((draft.imageState as any) ?? {}), studioHistory: next } })
      .catch(() => {});
  };

  // groups: gallery / variant / description (from the product) + your uploads.
  const groups = useMemo(() => {
    const imgs = draft.product?.images ?? [];
    const byRole = (role: string) =>
      imgs.filter((i) => (i.role === "unused" ? "description" : i.role) === role).map((i) => i.url);
    const out: { key: string; label: string; urls: string[] }[] = [
      { key: "gallery", label: t("ws.gallery"), urls: byRole("gallery") },
      { key: "variant", label: t("ws.variant"), urls: byRole("variant") },
      { key: "description", label: t("ws.description"), urls: byRole("description") },
    ].filter((g) => g.urls.length);
    if (uploads.length) out.push({ key: "upload", label: t("studioP.uploads"), urls: uploads });
    return out;
  }, [draft.product?.images, uploads, t]);

  const flatUrls = useMemo(() => groups.flatMap((g) => g.urls), [groups]);

  useEffect(() => {
    const seed = new Set((seedUrls ?? []).filter(Boolean));
    setPicked(new Set([...seed].slice(0, 20)));
    lastPick.current = null;
    if (seedType) {
      setPromptType(seedType);
      setBand(seedBand || "");
      setInstruction(
        buildStudioPrompt({
          typeKey: seedType,
          band: seedBand || undefined,
          product: draft.product,
          imageCount: seed.size,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id, seedType, seedBand]);

  // rebuild the prompt when the design type or the length band changes
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (promptType) setInstruction(buildPrompt(promptType, band));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptType, band]);

  const spec =
    size.id === "__custom__"
      ? `${customW}x${customH} px, ${quality} quality`
      : `${size.w}x${size.h} px, ${quality} quality`;

  /** add up to the 20 cap, keeping existing picks */
  function addCapped(prev: Set<string>, urls: string[]): Set<string> {
    const n = new Set(prev);
    for (const u of urls) {
      if (n.has(u)) continue;
      if (n.size >= MAX) break;
      n.add(u);
    }
    return n;
  }

  function togglePick(u: string, e: React.MouseEvent) {
    const range = e.shiftKey && !!lastPick.current;
    if (!range && !picked.has(u) && picked.size >= MAX) {
      toast(t("studioP.maxPicked", { n: MAX }), "err");
      return;
    }
    setPicked((prev) => {
      if (range) {
        const a = flatUrls.indexOf(lastPick.current!);
        const b = flatUrls.indexOf(u);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          return addCapped(prev, flatUrls.slice(lo, hi + 1));
        }
      }
      const n = new Set(prev);
      n.has(u) ? n.delete(u) : n.add(u);
      return n;
    });
    if (!e.shiftKey) lastPick.current = u;
  }

  function toggleGroup(urls: string[]) {
    setPicked((prev) => {
      if (urls.every((u) => prev.has(u))) {
        const n = new Set(prev);
        urls.forEach((u) => n.delete(u));
        return n;
      }
      return addCapped(prev, urls);
    });
  }

  async function onUpload(files: FileList | null) {
    const list = [...(files ?? [])];
    const added: string[] = [];
    for (const f of list) {
      const dataUrl = await new Promise<string>((r) => {
        const rd = new FileReader();
        rd.onload = () => r(String(rd.result));
        rd.readAsDataURL(f);
      });
      try {
        const { url } = await api.saveMedia(dataUrl);
        added.push(url);
      } catch {
        added.push(dataUrl);
      }
    }
    setUploads((a) => Array.from(new Set([...a, ...added])));
    setPicked((prev) => addCapped(prev, added));
  }

  async function runResearch() {
    const url = brandUrl.trim();
    if (!/^https?:\/\/.+\..+/.test(url)) return toast(t("studioP.brandUrlBad"), "err");
    setResearchBusy(true);
    const r = researchBrandJob({ draftId: draft.id, brandUrl: url }, setJob);
    jobRef.current = r as RunningJob<unknown>;
    try {
      const out = await r.promise;
      setBrandBrief(out.brief);
      setBrandUrl(url);
      setResearchOn(true);
      qc.invalidateQueries({ queryKey: ["settings"] }); // server saved it globally
      toast(t("studioP.brandDone"), "ok");
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setResearchBusy(false);
      setJob(null);
    }
  }
  async function clearBrandBrief() {
    setBrandBrief("");
    try {
      await api.saveSettings({ brandBrief: "" });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch {
      /* best effort */
    }
  }

  async function generate() {
    if (!picked.size) return toast(t("studioP.needImages"), "err");
    if (!instruction.trim()) return toast(t("studioP.needBrief"), "err");
    setBusy(true);
    setResult(null);
    setResultRemote(undefined);
    const r = composeImageJob(
      {
        draftId: draft.id,
        imageUrls: [...picked],
        instruction: instruction.trim(),
        brandBrief: researchOn && brandBrief.trim() ? brandBrief.trim() : undefined,
        imageSpec: spec,
        agentProfile: profile,
      },
      setJob,
    );
    jobRef.current = r as RunningJob<unknown>;
    try {
      const out = await r.promise;
      setResult(out.url);
      setResultRemote(out.remoteUrl);
      persistHistory(
        [
          { url: out.url, remoteUrl: out.remoteUrl, at: Date.now(), prompt: instruction.trim().slice(0, 200), type: promptType || undefined },
          ...history,
        ].slice(0, 24),
      );
      toast(t("studioP.generated"), "ok");
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy(false);
      setJob(null);
    }
  }

  async function addToDraft() {
    if (!result) return;
    setBusy(true);
    try {
      await onApply(result, resultRemote);
      toast(t("studioP.applied"), "ok");
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!result) return;
    try {
      const blob = await (await fetch(proxied(result))).blob();
      const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
      downloadBlob(blob, `${slugify(draft.title || "studio")}-ai.${ext}`);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(1000px, 97vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="m-h">
          <h3 style={{ fontSize: 14 }}>{t("studioP.title")}</h3>
          <span className="sub">{t("studioP.subAi")}</span>
          <div className="grow" style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={onClose} disabled={busy}>
            {t("common.close")}
          </button>
        </div>
        <div className="m-b">
          <div className="studio-wrap">
            {/* result / preview */}
            <div className="studio-stage-col">
              <div className="studio-result">
                {result ? (
                  <img src={proxied(result)} alt="" />
                ) : busy ? (
                  <div className="empty">
                    <span className="spin" /> {t("studioP.working")}
                  </div>
                ) : (
                  <div className="empty">{t("studioP.resultEmpty")}</div>
                )}
              </div>
              {job && <JobProgress job={job} onCancel={() => jobRef.current?.cancel()} />}
              {result && (
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn primary sm" onClick={addToDraft} disabled={busy}>
                    {t("studioP.apply")}
                  </button>
                  <button className="btn sm" onClick={download} disabled={busy}>
                    {t("studioP.download")}
                  </button>
                  <button className="btn ghost sm" onClick={() => { setResult(null); setResultRemote(undefined); }} disabled={busy}>
                    {t("studioP.again")}
                  </button>
                </div>
              )}

              <div className="studio-history">
                <div className="studio-history-h">
                  <b className="tiny">
                    {t("studioP.history")}
                    {history.length > 0 ? ` · ${history.length}` : ""}
                  </b>
                  {history.length > 0 && (
                    <button
                      className="btn ghost sm"
                      style={{ padding: "1px 6px", fontSize: 10 }}
                      onClick={() => persistHistory([])}
                      disabled={busy}
                    >
                      {t("studioP.historyClear")}
                    </button>
                  )}
                </div>
                {history.length === 0 ? (
                  <p className="tiny muted" style={{ margin: 0 }}>{t("studioP.historyEmpty")}</p>
                ) : (
                  <div className="studio-history-strip">
                    {history.map((h) => (
                      <div
                        key={h.url}
                        className={"studio-hist-item" + (result === h.url ? " on" : "")}
                        title={h.prompt}
                      >
                        <button
                          type="button"
                          className="studio-hist-thumb"
                          onClick={() => {
                            setResult(h.url);
                            setResultRemote(h.remoteUrl);
                          }}
                        >
                          <img src={proxied(h.url)} alt="" loading="lazy" />
                        </button>
                        <div className="studio-hist-actions">
                          <button
                            className="btn ghost sm"
                            style={{ padding: "1px 5px", fontSize: 10 }}
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                await onApply(h.url, h.remoteUrl);
                                toast(t("studioP.applied"), "ok");
                              } catch (e) {
                                toast((e as Error).message, "err");
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {t("studioP.apply")}
                          </button>
                          <button
                            className="btn ghost sm"
                            style={{ padding: "1px 5px", fontSize: 10, color: "var(--danger)" }}
                            disabled={busy}
                            onClick={() => persistHistory(history.filter((x) => x.url !== h.url))}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* controls */}
            <div className="studio-side">
              {/* brand research (optional) — do it BEFORE generating */}
              <div className="grp">
                <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    style={{ width: 16, marginTop: 2 }}
                    checked={researchOn}
                    onChange={(e) => setResearchOn(e.target.checked)}
                  />
                  <span className="tiny">
                    <b>{t("studioP.brandResearch")}</b>
                    <br />
                    {t("studioP.brandResearchHint")}
                  </span>
                </label>
                {researchOn && (
                  <>
                    <div className="row">
                      <input
                        type="url"
                        style={{ flex: 1 }}
                        value={brandUrl}
                        onChange={(e) => setBrandUrl(e.target.value)}
                        placeholder="https://markam.com"
                      />
                      <button className="btn sm" onClick={runResearch} disabled={researchBusy || busy}>
                        {researchBusy ? <span className="spin" /> : brandBrief ? t("studioP.brandRedo") : t("studioP.brandGo")}
                      </button>
                    </div>
                    {brandBrief && (
                      <details>
                        <summary className="tiny muted" style={{ cursor: "pointer" }}>{t("studioP.brandShow")}</summary>
                        <div className="advice-box" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{brandBrief}</div>
                        <button className="btn ghost sm danger" style={{ marginTop: 4 }} onClick={clearBrandBrief}>
                          {t("studioP.brandClear")}
                        </button>
                      </details>
                    )}
                  </>
                )}
              </div>

              <div className="grp">
                <h5>{t("studioP.brief")}</h5>
                <div className="chips">
                  {BRIEF_META.map((m) => (
                    <button
                      key={m.key}
                      className={"chip" + (promptType === m.key ? " active" : "")}
                      onClick={() => setPromptType(m.key)}
                      title={m.research}
                    >
                      {lang === "tr" ? m.tr : m.en}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="field" style={{ width: 150 }}>
                    {t("studioP.promptLen")}
                    <select value={band} onChange={(e) => setBand(e.target.value)}>
                      <option value="">{t("studioP.promptLenFull")}</option>
                      {IMAGE_LENGTH_BANDS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="btn ghost sm"
                    onClick={() => promptType && setInstruction(buildPrompt(promptType, band))}
                    disabled={!promptType}
                    title={t("studioP.rebuildHint")}
                  >
                    🔁 {t("studioP.rebuild")}
                  </button>
                </div>
                {promptType && (
                  <p className="tiny muted" style={{ margin: "2px 0 0" }}>
                    💡 {BRIEF_META.find((m) => m.key === promptType)?.research}
                  </p>
                )}
                <textarea
                  rows={6}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={t("studioP.briefPh")}
                />
                <p className="tiny muted" style={{ margin: 0 }}>
                  {t("studioP.briefNote")} · {wordCount(instruction)} {t("preview.words")}
                </p>
              </div>

              <div className="grp">
                <h5 style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span>{t("studioP.sources")} · {picked.size}/{MAX}</span>
                  <span className="grow" style={{ flex: 1 }} />
                  <button
                    className="btn ghost sm"
                    style={{ padding: "1px 6px" }}
                    onClick={() => setPicked(new Set(flatUrls.slice(0, MAX)))}
                    disabled={!flatUrls.length}
                  >
                    {t("studioP.pickAll")}
                  </button>
                  <button
                    className="btn ghost sm"
                    style={{ padding: "1px 6px" }}
                    onClick={() => { setPicked(new Set()); lastPick.current = null; }}
                    disabled={!picked.size}
                  >
                    {t("studioP.pickClear")}
                  </button>
                  <label className="btn ghost sm" style={{ cursor: "pointer", padding: "1px 6px" }}>
                    {t("studioP.upload")}
                    <input type="file" accept="image/*" hidden multiple onChange={(e) => { void onUpload(e.target.files); e.currentTarget.value = ""; }} />
                  </label>
                </h5>
                <p className="tiny muted" style={{ margin: 0 }}>{t("studioP.pickHint")}</p>
                {groups.map((g) => {
                  const allOn = g.urls.every((u) => picked.has(u));
                  return (
                    <div key={g.key} className="studio-grp">
                      <div className="studio-grp-h">
                        <span>{g.label} · {g.urls.length}</span>
                        <button className="btn ghost sm" style={{ padding: "0 6px" }} onClick={() => toggleGroup(g.urls)}>
                          {allOn ? t("studioP.groupClear") : t("studioP.groupAll")}
                        </button>
                      </div>
                      <div className="asset-strip">
                        {g.urls.map((u) => (
                          <img
                            key={u}
                            src={proxied(u)}
                            alt=""
                            loading="lazy"
                            className={picked.has(u) ? "on" : ""}
                            onClick={(e) => togglePick(u, e)}
                            title={t("studioP.pickToggle")}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!flatUrls.length && <div className="empty">{t("studioP.noSources")}</div>}
              </div>

              <div className="grp">
                <h5>{t("studioP.output")}</h5>
                <div className="row">
                  <select value={size.id} onChange={(e) => setSize(SIZES.find((s) => s.id === e.target.value)!)}>
                    {SIZES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select value={quality} onChange={(e) => setQuality(e.target.value as any)}>
                    <option value="standard">standard</option>
                    <option value="high">high</option>
                    <option value="maximum">maximum</option>
                  </select>
                </div>
                {size.id === "__custom__" && (
                  <div className="row" style={{ alignItems: "center" }}>
                    <input type="number" min={256} max={6000} value={customW} onChange={(e) => setCustomW(Math.max(1, Number(e.target.value) || 0))} style={{ width: 84 }} />
                    <span className="tiny muted">×</span>
                    <input type="number" min={256} max={6000} value={customH} onChange={(e) => setCustomH(Math.max(1, Number(e.target.value) || 0))} style={{ width: 84 }} />
                  </div>
                )}
                <label className="field">
                  {t("ws.manusProfile")}
                  <select value={profile} onChange={(e) => setProfile(e.target.value as any)}>
                    <option value="manus-1.6-lite">manus-1.6-lite</option>
                    <option value="manus-1.6">manus-1.6</option>
                    <option value="manus-1.6-max">manus-1.6-max</option>
                  </select>
                </label>
              </div>

              <button className="btn primary" onClick={generate} disabled={busy || !picked.size || !instruction.trim()}>
                {busy ? <span className="spin" /> : t("studioP.generate")}
              </button>
              <p className="tiny muted" style={{ margin: 0 }}>{t("studioP.aiNote")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
