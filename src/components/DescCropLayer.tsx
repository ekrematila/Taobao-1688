import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { DESC_CROP_ASPECTS, DESC_CROP_ANCHORS } from "@shared/models.ts";
import type { DescImageCrop, ProductImage } from "@shared/types.ts";
import { publicImageUrl } from "@shared/listingFormat.ts";
import { absoluteUrl } from "../api";

/**
 * Renders a description-HTML preview and, on hover (1s) or right-click of any
 * image, pops an elegant panel to non-destructively CROP that image for the
 * description only: aspect preset (16:9 · 4:3 · 30:7 · 5:2 · 5:3 · 10:3 …), which
 * area of the photo to keep (3×3 focus grid), a max-width cap, "open in new tab",
 * and "reset to default". Changes are lifted via `onChange` (keyed by the image's
 * working `url`).
 */
export default function DescCropLayer({
  html,
  images,
  onChange,
}: {
  html: string;
  images: ProductImage[];
  onChange: (url: string, crop: DescImageCrop | undefined) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const hoverT = useRef<number>();
  const [panel, setPanel] = useState<{ url: string; x: number; y: number } | null>(null);

  const bySrc = useMemo(() => {
    const m = new Map<string, ProductImage>();
    for (const im of images) {
      for (const u of [im.url, publicImageUrl(im) || "", (im as any).remoteUrl || "", im.srcUrl || ""]) {
        if (u) m.set(u, im);
      }
    }
    return m;
  }, [images]);

  const resolve = (el: HTMLImageElement): ProductImage | undefined => {
    const raw = el.getAttribute("src") || "";
    if (bySrc.has(raw)) return bySrc.get(raw);
    const q = /[?&]url=([^&]+)/.exec(raw);
    if (q) {
      const u = decodeURIComponent(q[1]);
      if (bySrc.has(u)) return bySrc.get(u);
    }
    // last resort: match by filename
    const base = raw.split("?")[0].split("/").pop() || "";
    if (base) for (const [k, v] of bySrc) if (k.split("?")[0].endsWith(base)) return v;
    return undefined;
  };

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll("img")) as HTMLImageElement[];
    const offs: (() => void)[] = [];
    for (const el of els) {
      const im = resolve(el);
      if (!im) continue;
      el.style.cursor = "context-menu";
      const open = (x: number, y: number) =>
        setPanel({
          url: im.url,
          x: Math.min(x, window.innerWidth - 300),
          y: Math.min(y, window.innerHeight - 340),
        });
      const onEnter = () => {
        window.clearTimeout(hoverT.current);
        const r = el.getBoundingClientRect();
        hoverT.current = window.setTimeout(() => open(r.left + Math.min(r.width, 40), r.top + 8), 1000);
      };
      const onLeave = () => window.clearTimeout(hoverT.current);
      const onCtx = (e: MouseEvent) => {
        e.preventDefault();
        window.clearTimeout(hoverT.current);
        open(e.clientX + 4, e.clientY + 4);
      };
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
      el.addEventListener("contextmenu", onCtx);
      offs.push(() => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
        el.removeEventListener("contextmenu", onCtx);
      });
    }
    return () => offs.forEach((f) => f());
  }, [html, bySrc]);

  const active = panel ? images.find((i) => i.url === panel.url) : undefined;
  const crop: DescImageCrop = active?.descCrop ?? {};
  const patch = (p: Partial<DescImageCrop>) => {
    if (!panel) return;
    const next: DescImageCrop = { ...crop, ...p };
    const empty = !next.aspect && next.posX == null && next.posY == null && !next.maxW;
    onChange(panel.url, empty ? undefined : next);
  };
  const anchorKey =
    DESC_CROP_ANCHORS.find((a) => a.x === (crop.posX ?? 50) && a.y === (crop.posY ?? 50))?.key ?? "mc";

  const isPreset = DESC_CROP_ASPECTS.some((a) => a.value === (crop.aspect ?? ""));
  const [customOpen, setCustomOpen] = useState(false);
  const [customW, customH] = (crop.aspect && !isPreset ? crop.aspect : "").split("/");
  useEffect(() => setCustomOpen(!isPreset && !!crop.aspect), [panel?.url]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={ref} className="pdp-desc-body" lang="en" dangerouslySetInnerHTML={{ __html: html }} />

      {panel && active && (
        <>
          <div className="crop-pop-scrim" onClick={() => setPanel(null)} onContextMenu={(e) => e.preventDefault()} />
          <div className="crop-pop" style={{ left: panel.x, top: panel.y }}>
            <div className="crop-pop-h">
              <b>{t("desccrop.title")}</b>
              <button className="x" onClick={() => setPanel(null)}>
                ✕
              </button>
            </div>

            <div className="crop-pop-sec">{t("desccrop.aspect")}</div>
            <div className="crop-asps">
              {DESC_CROP_ASPECTS.map((a) => (
                <button
                  key={a.value || "orig"}
                  className={"chip" + (!customOpen && (crop.aspect ?? "") === a.value ? " active" : "")}
                  onClick={() => {
                    setCustomOpen(false);
                    patch({ aspect: a.value || undefined });
                  }}
                >
                  {a.label}
                </button>
              ))}
              <button
                className={"chip" + (customOpen ? " active" : "")}
                onClick={() => {
                  setCustomOpen(true);
                  if (!customW || !customH) patch({ aspect: "1/1" });
                }}
              >
                {t("desccrop.custom")}
              </button>
            </div>
            {customOpen && (
              <div className="crop-pop-row">
                <input
                  type="number"
                  min={1}
                  className="crop-custom-n"
                  placeholder="W"
                  value={customW ?? ""}
                  onChange={(e) => patch({ aspect: `${e.target.value || 1}/${customH || 1}` })}
                />
                <span className="muted">:</span>
                <input
                  type="number"
                  min={1}
                  className="crop-custom-n"
                  placeholder="H"
                  value={customH ?? ""}
                  onChange={(e) => patch({ aspect: `${customW || 1}/${e.target.value || 1}` })}
                />
              </div>
            )}

            <div className="crop-pop-sec">{t("desccrop.area")}</div>
            <div className="crop-grid">
              {DESC_CROP_ANCHORS.map((a) => (
                <button
                  key={a.key}
                  className={"g" + (anchorKey === a.key ? " on" : "")}
                  title={a.label}
                  onClick={() => patch({ posX: a.x, posY: a.y })}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <div className="crop-pop-sec">
              {t("desccrop.maxw")} <span className="muted">· {crop.maxW ? `${crop.maxW}px` : t("desccrop.full")}</span>
            </div>
            <input
              type="range"
              min={240}
              max={1160}
              step={20}
              value={crop.maxW ?? 1160}
              onChange={(e) => patch({ maxW: Number(e.target.value) >= 1160 ? undefined : Number(e.target.value) })}
            />

            <div className="crop-pop-row">
              <button
                className="btn ghost sm"
                onClick={() => window.open(absoluteUrl(publicImageUrl(active) || active.url), "_blank", "noopener,noreferrer")}
              >
                ↗ {t("desccrop.newtab")}
              </button>
              <button className="btn ghost sm" onClick={() => onChange(panel.url, undefined)}>
                ↺ {t("desccrop.reset")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
