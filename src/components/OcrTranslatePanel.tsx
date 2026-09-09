import { useEffect, useRef, useState } from "react";
import { altTextsManusJob, api, proxied, translateImagesJob, type Draft } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { JobCancelled, type RunningJob } from "../lib/jobs";
import JobProgress from "./JobProgress";
import { loadImage } from "../lib/image";
import { localAltText } from "../lib/altText";
import { disposeOcr, ocrBlocks, ocrRegion, renderTranslated, translateBlocks, type OcrBlock } from "../lib/ocrTranslate";
import type { JobView } from "@shared/types.ts";

const LANGS: [string, string][] = [
  ["en", "English"],
  ["tr", "Türkçe"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["es", "Español"],
];

const cleanImg = (u: string) => u.split("#dup-")[0];
const DISP_W = 300;

async function urlToCanvas(url: string): Promise<HTMLCanvasElement> {
  const im = await loadImage(url);
  const c = document.createElement("canvas");
  c.width = im.naturalWidth || im.width;
  c.height = im.naturalHeight || im.height;
  c.getContext("2d")!.drawImage(im, 0, 0);
  return c;
}

interface Item {
  url: string;
  src: HTMLCanvasElement | null;
  blocks: OcrBlock[];
  scanned: boolean;
}

export default function OcrTranslatePanel({
  urls,
  draft,
  hasManusKey,
  onSaved,
  onClose,
  onApply,
}: {
  urls: string[];
  draft: Draft;
  hasManusKey: boolean;
  onSaved: () => void;
  onClose: () => void;
  onApply: (map: { from: string; to: string }[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [lang, setLang] = useState("en");
  const langName = LANGS.find(([c]) => c === lang)?.[1] ?? "English";
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState<"" | "scan" | "run" | "region" | "ai">("");
  const [items, setItems] = useState<Item[]>(urls.map((url) => ({ url, src: null, blocks: [], scanned: false })));
  const [focus, setFocus] = useState(0);
  const [drawMode, setDrawMode] = useState(false);
  const [drag, setDrag] = useState<null | { x: number; y: number; x2: number; y2: number }>(null);
  const [manusProfile, setManusProfile] = useState<"manus-1.6-lite" | "manus-1.6" | "manus-1.6-max">("manus-1.6");
  const [job, setJob] = useState<JobView | null>(null);
  const jobRef = useRef<RunningJob<unknown> | null>(null);
  const beforeRef = useRef<HTMLCanvasElement | null>(null);
  const dispScale = useRef(1);
  const cur = items[focus];

  useEffect(() => () => void disposeOcr(), []);

  /* ------------------------------- scan ------------------------------- */
  async function scanAll() {
    setBusy("scan");
    setLog(t("ocr.firstDownload"));
    try {
      for (let i = 0; i < urls.length; i++) {
        setLog(t("ocr.progress", { i: i + 1, n: urls.length }));
        let src: HTMLCanvasElement;
        try {
          src = await urlToCanvas(proxied(cleanImg(urls[i])));
        } catch (e) {
          setItems((xs) => xs.map((it, j) => (j === i ? { ...it, scanned: true } : it)));
          continue;
        }
        const raw = await ocrBlocks(src, (s) => setLog(`${i + 1}/${urls.length} · ${s}`));
        const tr = await translateBlocks(raw, lang, api.freeTranslate);
        setItems((xs) => xs.map((it, j) => (j === i ? { ...it, src, blocks: tr, scanned: true } : it)));
      }
      setLog("");
    } catch (e) {
      toast((e as Error).message, "err");
      setLog(String((e as Error).message));
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    void scanAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join("|")]);

  /* --------------------------- block editing -------------------------- */
  function patchBlock(itemIdx: number, blockIdx: number, patch: Partial<OcrBlock>) {
    setItems((xs) =>
      xs.map((it, i) =>
        i === itemIdx ? { ...it, blocks: it.blocks.map((b, j) => (j === blockIdx ? { ...b, ...patch } : b)) } : it,
      ),
    );
  }
  function removeBlock(itemIdx: number, blockIdx: number) {
    setItems((xs) => xs.map((it, i) => (i === itemIdx ? { ...it, blocks: it.blocks.filter((_, j) => j !== blockIdx) } : it)));
  }
  function clearManual() {
    setItems((xs) => xs.map((it) => ({ ...it, blocks: it.blocks.filter((b) => !b.manual) })));
  }
  const manualCount = items.reduce((n, it) => n + it.blocks.filter((b) => b.manual).length, 0);

  /* ----------------------- draw a region on the focused image -------- */
  useEffect(() => {
    const src = cur?.src;
    const c = beforeRef.current;
    if (!src || !c) return;
    const k = DISP_W / src.width;
    dispScale.current = k;
    c.width = DISP_W;
    c.height = Math.round(src.height * k);
    c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  }, [focus, cur?.src]);

  function overlayPos(e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onDown(e: React.MouseEvent) {
    if (!drawMode || busy || !cur?.src) return;
    const p = overlayPos(e);
    setDrag({ x: p.x, y: p.y, x2: p.x, y2: p.y });
  }
  function onMove(e: React.MouseEvent) {
    if (!drag) return;
    const p = overlayPos(e);
    setDrag((d) => (d ? { ...d, x2: p.x, y2: p.y } : d));
  }
  async function onUp() {
    const d = drag;
    setDrag(null);
    if (!d || !cur?.src) return;
    const k = dispScale.current || 1;
    const rect = {
      x0: Math.min(d.x, d.x2) / k,
      y0: Math.min(d.y, d.y2) / k,
      x1: Math.max(d.x, d.x2) / k,
      y1: Math.max(d.y, d.y2) / k,
    };
    if (rect.x1 - rect.x0 < 8 || rect.y1 - rect.y0 < 6) return;
    setBusy("region");
    setLog(t("ocr.regionScan"));
    try {
      const blk = await ocrRegion(cur.src, rect, (s) => setLog(s));
      const [tr] = (await translateBlocks([blk], lang, api.freeTranslate)) as OcrBlock[];
      const at = focus;
      setItems((xs) => xs.map((it, i) => (i === at ? { ...it, blocks: [...it.blocks, tr || blk] } : it)));
      setLog("");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  /* ----------------------------- OCR apply --------------------------- */
  async function runAll() {
    setBusy("run");
    try {
      const map: { from: string; to: string }[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.src || !it.blocks.some((b) => (b.translated || "").trim())) continue;
        setLog(t("ocr.progress", { i: i + 1, n: items.length }));
        const out = await renderTranslated(it.src, it.blocks);
        const { url } = await api.saveMedia(out.toDataURL("image/png"));
        map.push({ from: it.url, to: url });
      }
      if (!map.length) {
        toast(t("ocr.none"), "err");
        return;
      }
      await onApply(map);
      toast(t("ocr.done", { n: map.length }), "ok");
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  /* --------------------------- AI actions --------------------------- */
  async function runJobAction(kind: "ai-tr" | "ai-alt") {
    if (!hasManusKey) return toast(t("ws.manusMissing"), "err");
    setBusy("ai");
    // pull the draft back into the workspace every time the job advances a step —
    // translate-images writes each image into its slot the moment it's ready, so
    // the gallery updates live instead of only when the whole batch finishes.
    let lastProg = -1;
    const onProg = (j: JobView) => {
      setJob(j);
      if (kind === "ai-tr" && j.progress > lastProg) {
        lastProg = j.progress;
        onSaved();
      }
    };
    const r =
      kind === "ai-tr"
        ? translateImagesJob(
            { draftId: draft.id, imageUrls: urls, targetLanguage: langName, agentProfile: manusProfile },
            onProg,
          )
        : altTextsManusJob({ draftId: draft.id, imageUrls: urls, targetLanguage: langName }, setJob);
    jobRef.current = r as RunningJob<unknown>;
    try {
      const res = (await r.promise) as import("@shared/types.ts").ImageTranslateJobResult | undefined;
      if (kind === "ai-tr") {
        const n = res?.replaced ?? 0;
        const failed = res?.errors?.length ?? 0;
        if (n === 0) {
          toast(failed ? `Çeviri başarısız: ${res!.errors![0]}` : "Çevrilecek Çince yazı bulunamadı.", failed ? "err" : "ok");
        } else {
          toast(`${n} görsel çevrildi${failed ? ` · ${failed} başarısız` : ""}.`, failed ? "err" : "ok");
        }
      } else {
        toast(t("ocr.aiAltDone"), "ok");
      }
      onSaved();
      if (kind === "ai-alt" || (res?.replaced ?? 0) > 0) onClose();
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setJob(null);
    }
  }

  async function runLocalAlt() {
    const product = draft.product;
    if (!product) return;
    setBusy("ai");
    const propsText = Object.entries(product.props ?? {})
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    const title = product.titleTranslated || product.title || draft.title;
    const byUrl = new Map<string, string>();
    try {
      for (const u of urls) {
        try {
          const im = await loadImage(proxied(cleanImg(u)));
          const c = document.createElement("canvas");
          c.width = im.naturalWidth || im.width;
          c.height = im.naturalHeight || im.height;
          c.getContext("2d")!.drawImage(im, 0, 0);
          const role = product.images.find((x) => x.url === u)?.role;
          byUrl.set(u, localAltText(c, { title, role, propsText }));
        } catch {
          /* skip */
        }
      }
      if (!byUrl.size) return toast(t("ocr.none"), "err");
      const fresh = await api.draft(draft.id);
      const images = (fresh.product?.images ?? []).map((im) => (byUrl.has(im.url) ? { ...im, alt: byUrl.get(im.url)! } : im));
      await api.patchDraft(draft.id, { product: { ...fresh.product, images }, label: t("ws.altLocalDone", { n: byUrl.size }) });
      toast(t("ws.altLocalDone", { n: byUrl.size }), "ok");
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  const boxStyle = (b: OcrBlock): React.CSSProperties => {
    const k = dispScale.current || 1;
    return {
      position: "absolute",
      left: b.x0 * k,
      top: b.y0 * k,
      width: (b.x1 - b.x0) * k,
      height: (b.y1 - b.y0) * k,
      border: `1.5px solid ${b.manual ? "var(--brand)" : "var(--ok)"}`,
      background: b.manual ? "rgba(90,49,244,0.12)" : "transparent",
      pointerEvents: "none",
      borderRadius: 2,
    };
  };

  const totalTr = items.reduce((n, it) => n + it.blocks.filter((b) => (b.translated || "").trim()).length, 0);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(940px, 97vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="m-h" style={{ flexWrap: "wrap", gap: 6 }}>
          <h3 style={{ fontSize: 14 }}>{t("ocr.title", { n: urls.length })}</h3>
          <span className="badge ok">{t("ocr.free")}</span>
          <div className="grow" style={{ flex: 1 }} />
          <label className="row tiny muted" style={{ gap: 4, margin: 0 }}>
            {t("ws.trTargetLang")}
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button className="btn ghost sm" onClick={() => scanAll()} disabled={!!busy}>
            {t("ocr.rescan")}
          </button>
          <button className="btn ghost sm" onClick={onClose} disabled={busy === "run" || busy === "ai"}>
            {t("common.close")}
          </button>
        </div>

        {/* action bar: OCR vs AI, Manus version */}
        <div className="m-b" style={{ paddingBottom: 0 }}>
          <div className="ocr-actions">
            <button className="btn primary sm" onClick={runAll} disabled={!!busy || !totalTr}>
              {busy === "run" ? <span className="spin" /> : t("ocr.apply", { n: urls.length })}
            </button>
            <span className="tiny muted">{t("ocr.orAi")}</span>
            <button className="btn sm" onClick={() => runJobAction("ai-tr")} disabled={!!busy || !hasManusKey}>
              {t("ocr.aiTranslate")}
            </button>
            <button className="btn sm" onClick={() => runJobAction("ai-alt")} disabled={!!busy || !hasManusKey}>
              {t("ocr.aiAlt")}
            </button>
            <button className="btn sm" onClick={runLocalAlt} disabled={!!busy}>
              {t("ocr.localAlt")}
            </button>
            <label className="row tiny muted" style={{ gap: 4, margin: 0 }}>
              {t("ws.manusProfile")}
              <select value={manusProfile} onChange={(e) => setManusProfile(e.target.value as any)} disabled={!hasManusKey}>
                <option value="manus-1.6-lite">manus-1.6-lite</option>
                <option value="manus-1.6">manus-1.6</option>
                <option value="manus-1.6-max">manus-1.6-max</option>
              </select>
            </label>
          </div>
          {job && <JobProgress job={job} onCancel={() => jobRef.current?.cancel()} />}
        </div>

        <div className="m-b">
          <div className="ocr-wrap">
            {/* left: every image's detected text */}
            <div className="ocr-list">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="tiny muted">{t("ocr.listHint")}</div>
                <button className="btn ghost sm" onClick={clearManual} disabled={!manualCount}>
                  {t("ocr.clearRegions")}
                </button>
              </div>
              {items.map((it, ii) => (
                <div key={it.url} className="ocr-imgblock">
                  <div
                    className={"ocr-imghdr" + (ii === focus ? " on" : "")}
                    onClick={() => setFocus(ii)}
                    role="button"
                    title={t("ocr.focusImage")}
                  >
                    {t("ws.gallery")} {ii + 1}
                    <span className="tiny muted">
                      {" "}
                      · {it.blocks.filter((b) => (b.translated || "").trim()).length}/{it.blocks.length}
                      {!it.scanned ? " · …" : ""}
                    </span>
                  </div>
                  {it.scanned && it.blocks.length === 0 && <div className="empty">{t("ocr.noText")}</div>}
                  {it.blocks.map((b, bi) => (
                    <div key={bi} className="ocr-row">
                      <span className="zh" title={`conf ${Math.round(b.conf)}`}>
                        {b.manual && <span className="badge brand" style={{ marginRight: 4 }}>✍</span>}
                        {b.text || t("ocr.manualNoText")}
                      </span>
                      <span className="arrow">→</span>
                      <input
                        value={b.translated}
                        onChange={(e) => patchBlock(ii, bi, { translated: e.target.value })}
                        placeholder={t("ocr.manualTypeHere")}
                      />
                      <button className="btn ghost sm" title={t("common.delete")} onClick={() => removeBlock(ii, bi)}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              {(busy === "scan" || busy === "region") && <div className="tiny muted">{log}</div>}
            </div>

            {/* right: focused-image source (draw regions) + a result preview per image */}
            <div className="ocr-side">
              <div className="grp">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <h5>
                    {t("ocr.pointHint")} · {t("ws.gallery")} {focus + 1}/{items.length}
                  </h5>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn ghost sm" onClick={() => setFocus((f) => (f - 1 + items.length) % items.length)} disabled={items.length < 2}>
                      ‹
                    </button>
                    <button className="btn ghost sm" onClick={() => setFocus((f) => (f + 1) % items.length)} disabled={items.length < 2}>
                      ›
                    </button>
                    <button
                      className={"btn sm" + (drawMode ? " primary" : " ghost")}
                      onClick={() => setDrawMode((v) => !v)}
                      disabled={(!!busy && busy !== "region") || !cur?.src}
                    >
                      {drawMode ? t("ocr.pointDone") : t("ocr.pointStart")}
                    </button>
                  </div>
                </div>
                <div
                  className="ocr-canvas-wrap"
                  style={{ position: "relative", cursor: drawMode ? "crosshair" : "default", width: DISP_W, maxWidth: "100%" }}
                  onMouseDown={onDown}
                  onMouseMove={onMove}
                  onMouseUp={onUp}
                  onMouseLeave={() => drag && onUp()}
                >
                  <canvas ref={beforeRef} style={{ display: "block", width: "100%", borderRadius: 6 }} />
                  {(cur?.blocks ?? []).map((b, i) => (
                    <div key={i} style={boxStyle(b)} />
                  ))}
                  {drag && (
                    <div
                      style={{
                        position: "absolute",
                        left: Math.min(drag.x, drag.x2),
                        top: Math.min(drag.y, drag.y2),
                        width: Math.abs(drag.x2 - drag.x),
                        height: Math.abs(drag.y2 - drag.y),
                        border: "1.5px dashed var(--brand)",
                        background: "rgba(90,49,244,0.15)",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                </div>
                {busy === "region" && <div className="tiny muted">{log || t("ocr.regionScan")}</div>}
              </div>

              <div className="grp">
                <h5>{t("ocr.afterAll", { n: items.length })}</h5>
                <div className="ocr-results">
                  {items.map((it, ii) => (
                    <ResultPreview
                      key={it.url}
                      label={`${t("ws.gallery")} ${ii + 1}`}
                      src={it.src}
                      blocks={it.blocks}
                      active={ii === focus}
                      onClick={() => setFocus(ii)}
                    />
                  ))}
                </div>
              </div>

              <p className="tiny muted" style={{ margin: 0 }}>
                {t("ocr.note")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One image's translated result — re-renders (debounced) whenever its blocks change. */
function ResultPreview({
  src,
  blocks,
  label,
  active,
  onClick,
}: {
  src: HTMLCanvasElement | null;
  blocks: OcrBlock[];
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!src) return;
    let dead = false;
    const id = setTimeout(async () => {
      const out = await renderTranslated(src, blocks);
      if (dead || !ref.current) return;
      const c = ref.current;
      const k = Math.min(1, 300 / out.width);
      c.width = Math.round(out.width * k);
      c.height = Math.round(out.height * k);
      c.getContext("2d")!.drawImage(out, 0, 0, c.width, c.height);
    }, 350);
    return () => {
      dead = true;
      clearTimeout(id);
    };
  }, [src, blocks]);
  return (
    <div className={"ocr-result" + (active ? " on" : "")} onClick={onClick} role="button">
      <div className="tiny muted">{label}</div>
      {src ? <canvas ref={ref} /> : <div className="empty tiny">—</div>}
    </div>
  );
}
