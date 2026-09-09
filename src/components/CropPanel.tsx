import { useEffect, useRef, useState } from "react";
import { api, proxied } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { loadImage } from "../lib/image";

type Rect = { x: number; y: number; w: number; h: number }; // fractions 0..1
const ASPECTS: { v: number | null; label: string }[] = [
  { v: null, label: "Serbest" },
  { v: 1, label: "1:1" },
  { v: 4 / 5, label: "4:5" },
  { v: 5 / 4, label: "5:4" },
  { v: 16 / 9, label: "16:9" },
  { v: 4 / 3, label: "4:3" },
  { v: 3 / 4, label: "3:4" },
];

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export default function CropPanel({
  urls,
  onClose,
  onApply,
}: {
  urls: string[];
  onClose: () => void;
  onApply: (map: { from: string; to: string }[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<Rect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [aspect, setAspect] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<null | { mode: "new" | "move" | "nw" | "ne" | "sw" | "se"; sx: number; sy: number; start: Rect }>(null);

  useEffect(() => {
    loadImage(urls[0]).then(setImg).catch(() => toast(t("crop.loadFail"), "err"));
  }, [urls[0]]);

  function applyAspect(r: Rect): Rect {
    if (!aspect || !img) return r;
    const ar = img.naturalWidth / img.naturalHeight; // px aspect
    // rect is in fractions of the image; convert w:h fraction ratio to px ratio = (w/h)*(ar)
    // we want (w*W)/(h*H) = aspect  ->  w/h = aspect / ar
    const targetWH = aspect / ar;
    let w = r.w;
    let h = w / targetWH;
    if (h > 1) {
      h = Math.min(1, r.h);
      w = h * targetWH;
    }
    return { ...r, w: Math.min(w, 1 - r.x), h: Math.min(h, 1 - r.y) };
  }

  function ptr(e: React.PointerEvent): { fx: number; fy: number } {
    const b = boxRef.current!.getBoundingClientRect();
    return { fx: clamp01((e.clientX - b.left) / b.width), fy: clamp01((e.clientY - b.top) / b.height) };
  }

  function down(e: React.PointerEvent, mode: NonNullable<typeof drag.current>["mode"]) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { fx, fy } = ptr(e);
    drag.current = { mode, sx: fx, sy: fy, start: { ...rect } };
  }
  function move(e: React.PointerEvent) {
    if (!drag.current) return;
    const { fx, fy } = ptr(e);
    const d = drag.current;
    const dx = fx - d.sx;
    const dy = fy - d.sy;
    let r = { ...d.start };
    if (d.mode === "new") {
      const x0 = Math.min(d.sx, fx);
      const y0 = Math.min(d.sy, fy);
      r = { x: x0, y: y0, w: Math.abs(fx - d.sx), h: Math.abs(fy - d.sy) };
    } else if (d.mode === "move") {
      r.x = clamp01(d.start.x + dx);
      r.y = clamp01(d.start.y + dy);
      r.x = Math.min(r.x, 1 - r.w);
      r.y = Math.min(r.y, 1 - r.h);
    } else {
      // corner resize
      let x1 = d.start.x;
      let y1 = d.start.y;
      let x2 = d.start.x + d.start.w;
      let y2 = d.start.y + d.start.h;
      if (d.mode.includes("w")) x1 = clamp01(fx);
      if (d.mode.includes("e")) x2 = clamp01(fx);
      if (d.mode.includes("n")) y1 = clamp01(fy);
      if (d.mode.includes("s")) y2 = clamp01(fy);
      r = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    }
    r.w = Math.max(0.03, r.w);
    r.h = Math.max(0.03, r.h);
    setRect(aspect ? applyAspect(r) : r);
  }
  function up(e: React.PointerEvent) {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  }

  useEffect(() => setRect((r) => (aspect ? applyAspect(r) : r)), [aspect]);

  async function cropOne(url: string): Promise<string> {
    const im = await loadImage(url);
    const W = im.naturalWidth || im.width;
    const H = im.naturalHeight || im.height;
    const sx = Math.round(rect.x * W);
    const sy = Math.round(rect.y * H);
    const sw = Math.max(1, Math.round(rect.w * W));
    const sh = Math.max(1, Math.round(rect.h * H));
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    c.getContext("2d")!.drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
    const { url: saved } = await api.saveMedia(c.toDataURL("image/png"));
    return saved;
  }

  async function apply() {
    setBusy(true);
    try {
      const map: { from: string; to: string }[] = [];
      for (const u of urls) {
        try {
          map.push({ from: u, to: await cropOne(u) });
        } catch {
          /* skip */
        }
      }
      await onApply(map);
      toast(t("crop.done", { n: map.length }), "ok");
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(720px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="m-h">
          <h3 style={{ fontSize: 14 }}>{t("crop.title", { n: urls.length })}</h3>
          <div className="grow" style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={onClose} disabled={busy}>
            {t("common.close")}
          </button>
        </div>
        <div className="m-b col" style={{ gap: 12 }}>
          <div className="chips">
            {ASPECTS.map((a) => (
              <button
                key={a.label}
                className={"chip" + (aspect === a.v ? " active" : "")}
                onClick={() => setAspect(a.v)}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="crop-stage">
            {img && (
              <div
                ref={boxRef}
                className="crop-box"
                onPointerDown={(e) => down(e, "new")}
                onPointerMove={move}
                onPointerUp={up}
              >
                <img src={proxied(urls[0])} alt="" draggable={false} />
                <div className="crop-shade" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${pct(rect.y)}, ${pct(rect.x)} ${pct(rect.y)}, ${pct(rect.x)} ${pct(rect.y + rect.h)}, ${pct(rect.x + rect.w)} ${pct(rect.y + rect.h)}, ${pct(rect.x + rect.w)} ${pct(rect.y)}, 0 ${pct(rect.y)})` }} />
                <div
                  className="crop-rect"
                  style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
                  onPointerDown={(e) => down(e, "move")}
                >
                  <span className="h nw" onPointerDown={(e) => down(e, "nw")} />
                  <span className="h ne" onPointerDown={(e) => down(e, "ne")} />
                  <span className="h sw" onPointerDown={(e) => down(e, "sw")} />
                  <span className="h se" onPointerDown={(e) => down(e, "se")} />
                </div>
              </div>
            )}
          </div>

          {urls.length > 1 && (
            <div className="bulk-strip">
              {urls.map((u) => (
                <img key={u} src={proxied(u)} alt="" loading="lazy" />
              ))}
            </div>
          )}
          <p className="tiny muted" style={{ margin: 0 }}>
            {t("crop.hint", { n: urls.length })}
          </p>
          <button className="btn primary sm" onClick={apply} disabled={busy || !img}>
            {busy ? <span className="spin" /> : t("crop.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
