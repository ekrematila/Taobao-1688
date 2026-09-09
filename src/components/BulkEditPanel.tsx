import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { api, proxied, type Draft } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import {
  CROP_PRESETS,
  NEUTRAL_ADJUST,
  canvasToBlob,
  DEFAULT_LOGO,
  downloadBlob,
  loadImage,
  renderImage,
  slugify,
  type Adjust,
  type CropPreset,
  type LogoSpec,
} from "../lib/image";
import type { ImageOp, ProductImage } from "@shared/types.ts";
import { mergeOps } from "../lib/imageOps";

type Role = "gallery" | "variant" | "description";
type Fmt = "image/png" | "image/jpeg" | "image/webp";

export default function BulkEditPanel({
  urls,
  draft,
  onClose,
  onDone,
}: {
  urls: string[];
  draft: Draft;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [preset, setPreset] = useState<CropPreset>(CROP_PRESETS[0]);
  const [adjust, setAdjust] = useState<Adjust>({ ...NEUTRAL_ADJUST });
  const [watermark, setWatermark] = useState("");
  const [logo, setLogo] = useState<LogoSpec | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [fmt, setFmt] = useState<Fmt>("image/png");
  const [quality, setQuality] = useState(0.92);
  const [targetRole, setTargetRole] = useState<Role | "keep">("keep");
  const [busy, setBusy] = useState<"" | "zip" | "apply">("");
  const [progress, setProgress] = useState(0);
  const [idx, setIdx] = useState(0);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => setIdx((i) => Math.min(i, Math.max(0, urls.length - 1))), [urls.length]);
  const cur = urls[Math.min(idx, urls.length - 1)] ?? urls[0];

  useEffect(() => {
    if (!logo?.src) return void setLogoImg(null);
    const i = new Image();
    i.onload = () => setLogoImg(i);
    i.src = logo.src;
  }, [logo?.src]);

  // live preview of the current image in the strip
  useEffect(() => {
    let dead = false;
    if (!cur || !previewRef.current) return;
    loadImage(cur)
      .then((img) => {
        if (dead || !previewRef.current) return;
        const out = renderImage(img, { preset, watermark, adjust, logo, logoImg });
        const c = previewRef.current;
        c.width = out.width;
        c.height = out.height;
        c.getContext("2d")!.drawImage(out, 0, 0);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [cur, preset, watermark, adjust, logo, logoImg]);

  async function renderAll(): Promise<{ url: string; blob: Blob }[]> {
    const out: { url: string; blob: Blob }[] = [];
    for (let i = 0; i < urls.length; i++) {
      try {
        const img = await loadImage(urls[i]);
        const canvas = renderImage(img, { preset, watermark, adjust, logo, logoImg });
        out.push({ url: urls[i], blob: await canvasToBlob(canvas, fmt, quality) });
      } catch {
        /* skip a broken image */
      }
      setProgress((i + 1) / urls.length);
    }
    return out;
  }

  async function downloadZip() {
    setBusy("zip");
    setProgress(0);
    try {
      const rendered = await renderAll();
      const zip = new JSZip();
      const ext = fmt.split("/")[1].replace("jpeg", "jpg");
      rendered.forEach((r, i) => zip.file(`${String(i + 1).padStart(2, "0")}-${slugify(draft.title, 24)}.${ext}`, r.blob));
      downloadBlob(await zip.generateAsync({ type: "blob" }), `${slugify(draft.title)}-bulk.zip`);
    } finally {
      setBusy("");
    }
  }

  async function applyToDraft() {
    setBusy("apply");
    setProgress(0);
    try {
      const rendered = await renderAll();
      const fresh = await api.draft(draft.id);
      const list: ProductImage[] = fresh.product?.images ?? [];

      const ops: ImageOp[] = [];
      const adjChanged =
        adjust.brightness !== NEUTRAL_ADJUST.brightness ||
        adjust.contrast !== NEUTRAL_ADJUST.contrast ||
        adjust.saturate !== NEUTRAL_ADJUST.saturate;
      if (adjChanged || watermark.trim() || preset.id !== CROP_PRESETS[0].id) ops.push("edit");
      if (logo) ops.push("logo");
      if (fmt !== "image/png" || quality !== 0.92) ops.push("format");

      const map = new Map<string, string>(); // source url -> new persisted url
      for (const r of rendered) {
        const b64 = await blobToDataUrl(r.blob);
        const { url } = await api.saveMedia(b64);
        map.set(r.url, url);
      }

      const next: ProductImage[] = list.map((im) => {
        const nu = map.get(im.url);
        if (!nu) return im;
        return {
          ...im,
          url: nu,
          originalUrl: im.originalUrl ?? im.url,
          role: targetRole === "keep" ? im.role : targetRole,
          ops: mergeOps(im.ops, ops),
        };
      });
      for (const [src, nu] of map) {
        if (!list.some((im) => im.url === src)) {
          next.push({ url: nu, role: targetRole === "keep" ? "description" : targetRole, ops });
        }
      }

      await api.patchDraft(draft.id, {
        product: { ...fresh.product, images: next },
        label: `${map.size} görsel toplu düzenlendi`,
      });
      toast(t("bulk.applied", { n: map.size }), "ok");
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  const rng = (label: string, val: number, min: number, max: number, step: number, on: (n: number) => void) => (
    <div className="rangerow">
      <span>{label}</span>
      <span className="mono">{val}</span>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => on(Number(e.target.value))} />
    </div>
  );

  return (
    <div className="modal-scrim">
      <div className="modal" style={{ width: "min(900px, 96vw)" }}>
        <div className="m-h">
          <h3 style={{ fontSize: 14 }}>{t("bulk.title", { n: urls.length })}</h3>
          <div className="grow" style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={onClose} disabled={!!busy}>
            {t("common.close")}
          </button>
        </div>
        <div className="m-b">
          <div className="editor-wrap">
            <div className="editor-stage">
              <div className="bulk-slider">
                <button
                  className="nav prev"
                  onClick={() => setIdx((i) => (i - 1 + urls.length) % urls.length)}
                  disabled={urls.length < 2}
                  aria-label="prev"
                >
                  ‹
                </button>
                <canvas ref={previewRef} />
                <button
                  className="nav next"
                  onClick={() => setIdx((i) => (i + 1) % urls.length)}
                  disabled={urls.length < 2}
                  aria-label="next"
                >
                  ›
                </button>
                <span className="bulk-count">
                  {Math.min(idx, urls.length - 1) + 1} / {urls.length}
                </span>
              </div>
              <div className="bulk-strip">
                {urls.map((u, i) => {
                  const alt = draft.product?.images.find((x) => x.url === u)?.alt || "";
                  return (
                    <img
                      key={u}
                      src={proxied(u)}
                      className={i === Math.min(idx, urls.length - 1) ? "on" : ""}
                      loading="lazy"
                      onClick={() => setIdx(i)}
                      alt={alt}
                      title={alt || `#${i + 1}`}
                    />
                  );
                })}
              </div>
              {(() => {
                const alt = draft.product?.images.find((x) => x.url === cur)?.alt || "";
                return alt ? (
                  <p className="tiny muted" style={{ marginTop: 6 }} title={alt}>
                    <b>alt:</b> {alt}
                  </p>
                ) : null;
              })()}
              <p className="tiny muted" style={{ marginTop: 6 }}>
                {t("bulk.sliderHint")}
              </p>
            </div>
            <div className="editor-side">
              <div className="grp">
                <h5>{t("ws.crop")}</h5>
                <div className="chips">
                  {CROP_PRESETS.map((p) => (
                    <button key={p.id} className={"chip" + (p.id === preset.id ? " active" : "")} onClick={() => setPreset(p)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grp">
                <h5>{t("editor.adjust")}</h5>
                {rng(t("editor.brightness"), adjust.brightness, 40, 180, 1, (n) => setAdjust((a) => ({ ...a, brightness: n })))}
                {rng(t("editor.contrast"), adjust.contrast, 40, 200, 1, (n) => setAdjust((a) => ({ ...a, contrast: n })))}
                {rng(t("editor.saturation"), adjust.saturate, 0, 220, 1, (n) => setAdjust((a) => ({ ...a, saturate: n })))}
              </div>
              <div className="grp">
                <h5>{t("ws.watermark")}</h5>
                <input type="text" value={watermark} onChange={(e) => setWatermark(e.target.value)} placeholder={t("ws.optional")} />
              </div>
              <div className="grp">
                <h5>{t("editor.logo")}</h5>
                {!logo ? (
                  <label className="btn sm">
                    {t("editor.uploadLogo")}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const rd = new FileReader();
                        rd.onload = () =>
                          setLogo({ src: String(rd.result), ...DEFAULT_LOGO });
                        rd.readAsDataURL(f);
                      }}
                    />
                  </label>
                ) : (
                  <>
                    <div className="anchor-grid">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <button key={i} className={logo.anchor === i ? "active" : ""} onClick={() => setLogo({ ...logo, anchor: i })} />
                      ))}
                    </div>
                    {rng(t("editor.logoHeight"), logo.heightPx, 4, 120, 1, (n) => setLogo({ ...logo, heightPx: n }))}
                    {rng(t("editor.logoOffset"), logo.offsetPx, 0, 60, 1, (n) => setLogo({ ...logo, offsetPx: n }))}
                    {rng(t("editor.opacity"), logo.opacity, 10, 100, 1, (n) => setLogo({ ...logo, opacity: n }))}
                    <button className="btn sm" onClick={() => setLogo(null)}>
                      {t("editor.removeLogo")}
                    </button>
                  </>
                )}
              </div>
              <div className="grp">
                <h5>{t("editor.export")}</h5>
                <label className="field">
                  {t("editor.format")}
                  <select value={fmt} onChange={(e) => setFmt(e.target.value as Fmt)}>
                    <option value="image/png">{t("editor.formatPng")}</option>
                    <option value="image/jpeg">JPG</option>
                    <option value="image/webp">WebP</option>
                  </select>
                </label>
                {fmt !== "image/png" && rng(t("editor.quality"), Math.round(quality * 100), 40, 100, 1, (n) => setQuality(n / 100))}
                <label className="field">
                  {t("bulk.targetRole")}
                  <select value={targetRole} onChange={(e) => setTargetRole(e.target.value as Role | "keep")}>
                    <option value="keep">{t("bulk.roleKeep")}</option>
                    <option value="gallery">{t("ws.gallery")}</option>
                    <option value="variant">{t("ws.variant")}</option>
                    <option value="description">{t("ws.description")}</option>
                  </select>
                </label>
              </div>
              {busy && (
                <div className="jobbar">
                  <span style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              )}
              <div className="row">
                <button className="btn primary sm" onClick={applyToDraft} disabled={!!busy}>
                  {busy === "apply" ? <span className="spin" /> : t("bulk.apply")}
                </button>
                <button className="btn sm" onClick={downloadZip} disabled={!!busy}>
                  {busy === "zip" ? <span className="spin" /> : t("bulk.downloadZip")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(b);
  });
}
