import { useEffect, useMemo, useRef, useState } from "react";
import { api, proxied } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { canvasFits, stitchImages, stitchPlan, type StitchDir, type StitchFit } from "../lib/stitch";
import { loadImage } from "../lib/image";
import { coverCrop, padRects, splitRegions, type Rect } from "../lib/splitRegions";

type Mode = "merge" | "split";

interface UiPiece extends Rect {
  id: number;
  keep: boolean;
  suspect: boolean;
  kind?: string;
}

interface Analysis {
  canvas: HTMLCanvasElement;
  pixels: ImageData;
  url: string;
}

const RATIOS: { key: string; ratio: number | null }[] = [
  { key: "orig", ratio: null },
  { key: "1:1", ratio: 1 },
  { key: "4:5", ratio: 4 / 5 },
  { key: "3:4", ratio: 3 / 4 },
  { key: "2:3", ratio: 2 / 3 },
  { key: "3:2", ratio: 3 / 2 },
  { key: "16:9", ratio: 16 / 9 },
];

/** Thumbnail of one piece, cut from the analysis canvas. */
function PieceThumb({ canvas, rect }: { canvas: HTMLCanvasElement; rect: Rect }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const k = 56 / Math.max(rect.w, rect.h);
    c.width = Math.max(1, Math.round(rect.w * k));
    c.height = Math.max(1, Math.round(rect.h * k));
    c.getContext("2d")!.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
  }, [canvas, rect.x, rect.y, rect.w, rect.h]);
  return <canvas ref={ref} style={{ borderRadius: 4, border: "1px solid var(--line)", flex: "0 0 auto" }} />;
}

/**
 * Merge N selected images into ONE, edge-to-edge with no gap — and/or split an image back
 * into its separate pictures. "Merge & split" stitches the sources (reorderable), then finds
 * the individual pictures inside the long image (white gutters, black bars, hard seams;
 * slices of one photo stay together), lets you fix the boxes, optionally asks the AI which
 * boxes are real product photos, and saves each picture as its own image.
 */
export default function StitchPanel({
  urls,
  initialMode = "merge",
  onClose,
  onApply,
  onApplySplit,
}: {
  urls: string[];
  initialMode?: Mode;
  onClose: () => void;
  onApply: (sourceUrls: string[], resultUrl: string) => Promise<void>;
  onApplySplit: (sourceUrls: string[], pieceUrls: string[], removeSources: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const single = urls.length < 2;

  const [mode, setMode] = useState<Mode>(single ? "split" : initialMode);
  const [order, setOrder] = useState<string[]>(() => [...urls]);
  const [dir, setDir] = useState<StitchDir>("v");
  const [fit, setFit] = useState<StitchFit>("max");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // split settings
  const [sens, setSens] = useState(50);
  const [seams, setSeams] = useState(false); // also cut hard seams between pictures with no gutter
  const [minPiece, setMinPiece] = useState(10); // % of the shorter side
  const [padPct, setPadPct] = useState(0);
  const [ratioKey, setRatioKey] = useState("orig");
  const [removeSources, setRemoveSources] = useState(true);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [pieces, setPieces] = useState<UiPiece[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const nextId = useRef(1);
  const imgRef = useRef<HTMLImageElement>(null);
  const [selId, setSelId] = useState<number | null>(null); // the box Delete removes
  const [drawing, setDrawing] = useState<Rect | null>(null); // a box being drawn on empty image area
  const drawRef = useRef<null | { x0: number; y0: number; r: Rect | null }>(null);
  // size of the merged picture at full resolution (and whether any source had to be scaled)
  const [sizeInfo, setSizeInfo] = useState<{ width: number; height: number; scaled: boolean } | null>(null);

  const sig = useMemo(() => `${dir}|${fit}|${order.join("~")}`, [dir, fit, order]);

  // the merged picture's exact size, straight from the sources' real pixel sizes
  useEffect(() => {
    let dead = false;
    Promise.all(order.map((u) => loadImage(u.split("#dup-")[0])))
      .then((imgs) => {
        if (dead) return;
        const plan = stitchPlan(imgs.map((im) => ({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height })), dir, fit);
        setSizeInfo({ width: plan.width, height: plan.height, scaled: plan.scaled });
      })
      .catch(() => !dead && setSizeInfo(null));
    return () => {
      dead = true;
    };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete / Backspace removes the selected box
  useEffect(() => {
    if (mode !== "split" || selId == null) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removePiece(selId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- merge preview (plain stitch) ----------
  useEffect(() => {
    if (mode !== "merge") return;
    setRendering(true);
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      try {
        const c = await stitchImages(order, { dir, fit, maxEdge: 1100 });
        setPreview(c.toDataURL("image/jpeg", 0.82));
      } catch (e) {
        toast((e as Error).message, "err");
      } finally {
        setRendering(false);
      }
    }, 250);
    return () => {
      if (tRef.current) clearTimeout(tRef.current);
    };
  }, [sig, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- split: render the analysis canvas, then detect ----------
  const detect = (a: Analysis, s = sens, m = minPiece, sm = seams) => {
    const found = splitRegions(a.pixels, { sensitivity: s, minPiece: m / 100, seams: sm });
    setSelId(null);
    setPieces(found.map((p) => ({ id: nextId.current++, x: p.x, y: p.y, w: p.w, h: p.h, keep: !p.suspect, suspect: p.suspect })));
  };

  useEffect(() => {
    if (mode !== "split") return;
    setRendering(true);
    let dead = false;
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      try {
        const c = await stitchImages(order, { dir, fit, maxEdge: 2400 });
        if (dead) return;
        const pixels = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
        const a: Analysis = { canvas: c, pixels, url: c.toDataURL("image/jpeg", 0.85) };
        setAnalysis(a);
        detect(a);
      } catch (e) {
        toast((e as Error).message, "err");
      } finally {
        if (!dead) setRendering(false);
      }
    }, 250);
    return () => {
      dead = true;
      if (tRef.current) clearTimeout(tRef.current);
    };
  }, [sig, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // re-detect when the sliders settle (this resets hand edits — the hint says so)
  useEffect(() => {
    if (mode !== "split" || !analysis) return;
    const h = setTimeout(() => detect(analysis), 200);
    return () => clearTimeout(h);
  }, [sens, minPiece, seams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- ordering ----------
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    setOrder((o) => {
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };
  const dropAt = (from: number, to: number) => {
    if (from === to) return;
    setOrder((o) => {
      const n = [...o];
      const [x] = n.splice(from, 1);
      n.splice(to, 0, x);
      return n;
    });
  };

  // ---------- box editing (drag a box / its edges on the preview) ----------
  const drag = useRef<null | { id: number; edge: string; sx: number; sy: number; r0: Rect; moved: boolean }>(null);
  const startDrag = (e: React.PointerEvent, id: number, edge: string) => {
    e.stopPropagation();
    const p = pieces.find((x) => x.id === id);
    if (!p) return;
    setSelId(id);
    drag.current = { id, edge, sx: e.clientX, sy: e.clientY, r0: { x: p.x, y: p.y, w: p.w, h: p.h }, moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  /** pointer position in the analysis canvas' pixels */
  const toCanvas = (e: React.PointerEvent) => {
    const img = imgRef.current;
    if (!img || !analysis) return null;
    const rb = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(analysis.canvas.width, ((e.clientX - rb.left) * analysis.canvas.width) / rb.width)),
      y: Math.max(0, Math.min(analysis.canvas.height, ((e.clientY - rb.top) * analysis.canvas.height) / rb.height)),
    };
  };
  const rectOf = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: Math.round(Math.min(x0, x1)), y: Math.round(Math.min(y0, y1)), w: Math.round(Math.abs(x1 - x0)), h: Math.round(Math.abs(y1 - y0)) });
  /** dragging on empty image area draws a new box anywhere (boxes may overlap) */
  const startDraw = (e: React.PointerEvent) => {
    const p0 = toCanvas(e);
    if (!p0) return;
    drawRef.current = { x0: p0.x, y0: p0.y, r: null };
    setSelId(null);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const endDraw = () => {
    const d = drawRef.current;
    drawRef.current = null;
    const r = d?.r ?? null; // the ref, not state: the last move and the release can land in one frame
    setDrawing(null);
    if (!d || !r || r.w < 24 || r.h < 24) return; // a click, not a box
    const id = nextId.current++;
    setPieces((ps) => [...ps, { id, ...r, keep: true, suspect: false }]);
    setSelId(id);
  };
  const removePiece = (id: number) => {
    setPieces((ps) => ps.filter((x) => x.id !== id));
    setSelId((cur) => (cur === id ? null : cur));
  };
  const onDrag = (e: React.PointerEvent) => {
    if (drawRef.current) {
      const p1 = toCanvas(e);
      if (p1) {
        const r = rectOf(drawRef.current.x0, drawRef.current.y0, p1.x, p1.y);
        drawRef.current.r = r;
        setDrawing(r);
      }
      return;
    }
    const d = drag.current;
    const img = imgRef.current;
    if (!d || !img || !analysis) return;
    const rb = img.getBoundingClientRect();
    const kx = analysis.canvas.width / rb.width;
    const ky = analysis.canvas.height / rb.height;
    const dx = (e.clientX - d.sx) * kx;
    const dy = (e.clientY - d.sy) * ky;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    const W = analysis.canvas.width;
    const H = analysis.canvas.height;
    const MIN = 16;
    let { x, y, w, h } = d.r0;
    if (d.edge === "move") {
      x = Math.max(0, Math.min(W - w, x + dx));
      y = Math.max(0, Math.min(H - h, y + dy));
    } else {
      if (d.edge.includes("l")) {
        const nx = Math.max(0, Math.min(x + w - MIN, x + dx));
        w += x - nx;
        x = nx;
      }
      if (d.edge.includes("r")) w = Math.max(MIN, Math.min(W - x, w + dx));
      if (d.edge.includes("t")) {
        const ny = Math.max(0, Math.min(y + h - MIN, y + dy));
        h += y - ny;
        y = ny;
      }
      if (d.edge.includes("b")) h = Math.max(MIN, Math.min(H - y, h + dy));
    }
    setPieces((ps) => ps.map((p) => (p.id === d.id ? { ...p, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } : p)));
  };
  const endDrag = (id: number) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && d.edge === "move") setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, keep: !p.keep } : p)));
  };
  const addBox = () => {
    if (!analysis) return;
    const W = analysis.canvas.width;
    const H = analysis.canvas.height;
    const w = Math.round(W * 0.6);
    const h = Math.round(Math.min(H * 0.3, w * 1.2));
    const id = nextId.current++;
    setPieces((ps) => [...ps, { id, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, keep: true, suspect: false }]);
    setSelId(id);
  };

  // ---------- AI: which boxes are real product photos? ----------
  async function aiPick() {
    if (!analysis || !pieces.length) return;
    setAiBusy(true);
    try {
      // a small copy of the merged image with the numbered boxes drawn on it
      const k = Math.min(1, 1400 / Math.max(analysis.canvas.width, analysis.canvas.height));
      const c = document.createElement("canvas");
      c.width = Math.round(analysis.canvas.width * k);
      c.height = Math.round(analysis.canvas.height * k);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(analysis.canvas, 0, 0, c.width, c.height);
      ctx.lineWidth = 3;
      ctx.font = `bold ${Math.max(16, Math.round(c.width * 0.045))}px sans-serif`;
      pieces.forEach((p, i) => {
        ctx.strokeStyle = "#ff1744";
        ctx.strokeRect(p.x * k + 1.5, p.y * k + 1.5, p.w * k - 3, p.h * k - 3);
        const label = String(i + 1);
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = "#ff1744";
        ctx.fillRect(p.x * k + 3, p.y * k + 3, tw, parseInt(ctx.font.match(/\d+/)![0]) + 8);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, p.x * k + 9, p.y * k + 3 + parseInt(ctx.font.match(/\d+/)![0]));
      });
      const r = await api.classifyRegions(c.toDataURL("image/jpeg", 0.85), pieces.length);
      const byN = new Map(r.regions.map((x) => [x.n, x]));
      setPieces((ps) => ps.map((p, i) => (byN.has(i + 1) ? { ...p, keep: !!byN.get(i + 1)!.keep, kind: byN.get(i + 1)!.kind } : p)));
      toast(t("stitch.aiDone", { n: r.regions.filter((x) => x.keep).length, total: pieces.length }), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setAiBusy(false);
    }
  }

  // ---------- apply ----------
  async function applyMerge() {
    if (order.length < 2) return toast(t("stitch.needTwo"), "err");
    setBusy(true);
    try {
      const c = await stitchImages(order, { dir, fit }); // full resolution
      const { url } = await api.saveMedia(c.toDataURL("image/png"));
      await onApply(order, url);
      toast(t("stitch.done", { n: order.length }), "ok");
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  const kept = pieces.filter((p) => p.keep);

  async function applySplit() {
    if (!analysis || !kept.length) return;
    setBusy(true);
    try {
      const full = await stitchImages(order, { dir, fit }); // full resolution
      const k = full.width / analysis.canvas.width;
      const aW = analysis.canvas.width;
      const aH = analysis.canvas.height;
      const pad = Math.round((padPct / 100) * aW);
      let rects: Rect[] = padRects(
        kept.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })),
        pad,
        { width: aW, height: aH },
      );
      const ratio = RATIOS.find((r) => r.key === ratioKey)?.ratio ?? null;
      if (ratio) rects = rects.map((r) => coverCrop(analysis.pixels, r, ratio));
      // a fixed output ratio can stretch a box into its neighbour — the same strip of picture would then appear at the
      // bottom of one piece AND the top of the next (a visible repeat). Meet in the middle instead.
      {
        const order = rects.map((_, i) => i).sort((x, y) => rects[x].y - rects[y].y);
        for (let oi = 0; oi < order.length; oi++)
          for (let oj = oi + 1; oj < order.length; oj++) {
            const A = rects[order[oi]];
            const B = rects[order[oj]];
            const sameColumn = A.x < B.x + B.w && B.x < A.x + A.w;
            if (!sameColumn || A.y + A.h <= B.y) continue;
            const mid = Math.round((A.y + A.h + B.y) / 2);
            A.h = Math.max(1, mid - A.y);
            B.h = Math.max(1, B.y + B.h - mid);
            B.y = mid;
          }
      }
      const out: string[] = [];
      for (const r of rects) {
        const w = Math.max(1, Math.round(r.w * k));
        const h = Math.max(1, Math.round(r.h * k));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(full, Math.round(r.x * k), Math.round(r.y * k), w, h, 0, 0, w, h);
        const { url } = await api.saveMedia(c.toDataURL("image/png"));
        out.push(url);
      }
      await onApplySplit(order, out, removeSources);
      toast(t("stitch.splitDone", { n: out.length }), "ok");
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  const aW = analysis?.canvas.width ?? 1;
  const aH = analysis?.canvas.height ?? 1;
  const handles: [string, React.CSSProperties][] = [
    ["l", { left: -4, top: 8, bottom: 8, width: 8, cursor: "ew-resize" }],
    ["r", { right: -4, top: 8, bottom: 8, width: 8, cursor: "ew-resize" }],
    ["t", { top: -4, left: 8, right: 8, height: 8, cursor: "ns-resize" }],
    ["b", { bottom: -4, left: 8, right: 8, height: 8, cursor: "ns-resize" }],
    ["tl", { left: -5, top: -5, width: 12, height: 12, cursor: "nwse-resize" }],
    ["tr", { right: -5, top: -5, width: 12, height: 12, cursor: "nesw-resize" }],
    ["bl", { left: -5, bottom: -5, width: 12, height: 12, cursor: "nesw-resize" }],
    ["br", { right: -5, bottom: -5, width: 12, height: 12, cursor: "nwse-resize" }],
  ];

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(960px, 97vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="m-h">
          <h3 style={{ fontSize: 14 }}>{mode === "split" ? t("stitch.splitTitle", { n: order.length }) : t("stitch.title", { n: order.length })}</h3>
          <span className="sub">{mode === "split" ? t("stitch.splitSub") : t("stitch.sub")}</span>
          <div className="grow" style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={onClose} disabled={busy}>
            {t("common.close")}
          </button>
        </div>

        <div className="m-b" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
          {/* controls */}
          <div className="col" style={{ gap: 10 }}>
            {!single && (
              <div className="chips">
                <button className={"chip" + (mode === "merge" ? " active" : "")} onClick={() => setMode("merge")}>
                  {t("stitch.modeMerge")}
                </button>
                <button className={"chip" + (mode === "split" ? " active" : "")} onClick={() => setMode("split")}>
                  ✂ {t("stitch.modeSplit")}
                </button>
              </div>
            )}

            {!single && (
              <>
                <div className="chips">
                  <button className={"chip" + (dir === "v" ? " active" : "")} onClick={() => setDir("v")}>
                    {t("stitch.vertical")}
                  </button>
                  <button className={"chip" + (dir === "h" ? " active" : "")} onClick={() => setDir("h")}>
                    {t("stitch.horizontal")}
                  </button>
                </div>
                <label className="field">
                  {t("stitch.fit")}
                  <select value={fit} onChange={(e) => setFit(e.target.value as StitchFit)}>
                    <option value="max">{t("stitch.fitMax")}</option>
                    <option value="min">{t("stitch.fitMin")}</option>
                    <option value="first">{t("stitch.fitFirst")}</option>
                  </select>
                </label>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn ghost sm" onClick={() => setOrder((o) => [...o].reverse())} disabled={busy}>
                    {t("stitch.reverse")}
                  </button>
                  <button className="btn ghost sm" onClick={() => setOrder([...urls])} disabled={busy}>
                    {t("stitch.reset")}
                  </button>
                </div>
                <div className="stitch-list" style={mode === "split" ? { maxHeight: "18vh" } : undefined}>
                  {order.map((u, i) => (
                    <div
                      key={u}
                      className="stitch-row"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = Number(e.dataTransfer.getData("text/plain"));
                        if (Number.isFinite(from)) dropAt(from, i);
                      }}
                    >
                      <span className="stitch-idx">{i + 1}</span>
                      <img src={proxied(u.split("#dup-")[0])} alt="" loading="lazy" />
                      <div className="stitch-move">
                        <button disabled={i === 0} title={t("ws.moveLeft")} onClick={() => move(i, -1)}>
                          ▲
                        </button>
                        <button disabled={i === order.length - 1} title={t("ws.moveRight")} onClick={() => move(i, 1)}>
                          ▼
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {mode === "merge" && <p className="tiny muted" style={{ margin: 0 }}>{t("stitch.hint")}</p>}
                {sizeInfo && (
                  <div className="tiny" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <b>{t("stitch.outSize", { w: sizeInfo.width, h: sizeInfo.height })}</b>
                    <span className="muted">{sizeInfo.scaled ? t("stitch.scaled") : t("stitch.noScale")}</span>
                    {(Math.max(sizeInfo.width, sizeInfo.height) / Math.min(sizeInfo.width, sizeInfo.height) > 3 || Math.max(sizeInfo.width, sizeInfo.height) > 3840 || sizeInfo.width * sizeInfo.height > 8_294_400) && (
                      <span style={{ color: "var(--warn, #8a5300)" }}>⚠ {t("stitch.aiLimit")}</span>
                    )}
                    {!canvasFits(sizeInfo.width, sizeInfo.height) && <span style={{ color: "var(--danger)" }}>⛔ {t("stitch.tooBig")}</span>}
                  </div>
                )}
              </>
            )}

            {mode === "split" && (
              <>
                <div className="col" style={{ gap: 8, borderTop: single ? "none" : "1px solid var(--line)", paddingTop: single ? 0 : 8 }}>
                  <label className="field">
                    {t("stitch.sens")}: {sens}
                    <input type="range" min={0} max={100} value={sens} onChange={(e) => setSens(Number(e.target.value))} />
                  </label>
                  <label className="row tiny" style={{ gap: 6, margin: 0 }} title={t("stitch.seamsHint")}>
                    <input type="checkbox" checked={seams} onChange={(e) => setSeams(e.target.checked)} />
                    {t("stitch.seams")}
                  </label>
                  <label className="field">
                    {t("stitch.minPiece")}: {minPiece}%
                    <input type="range" min={3} max={40} value={minPiece} onChange={(e) => setMinPiece(Number(e.target.value))} />
                  </label>
                  <label className="field">
                    {t("stitch.pad")}: {padPct}%
                    <input type="range" min={0} max={15} value={padPct} onChange={(e) => setPadPct(Number(e.target.value))} />
                  </label>
                  <label className="field">
                    {t("stitch.ratio")}
                    <select value={ratioKey} onChange={(e) => setRatioKey(e.target.value)}>
                      {RATIOS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.key === "orig" ? t("stitch.ratioOrig") : r.key}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="row" style={{ gap: 6 }}>
                    <input type="checkbox" style={{ width: 14 }} checked={removeSources} onChange={(e) => setRemoveSources(e.target.checked)} />
                    <span className="tiny">{t("stitch.removeSources")}</span>
                  </label>
                </div>

                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button className="btn ghost sm" onClick={() => analysis && detect(analysis)} disabled={!analysis || busy}>
                    ↺ {t("stitch.detect")}
                  </button>
                  <button className="btn ghost sm" onClick={addBox} disabled={!analysis || busy}>
                    {t("stitch.addBox")}
                  </button>
                  <button className="btn ghost sm" onClick={() => selId != null && removePiece(selId)} disabled={selId == null || busy} title={t("stitch.delBoxTip")}>
                    ✕ {t("stitch.delBox")}
                  </button>
                  <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => { setPieces([]); setSelId(null); }} disabled={!pieces.length || busy}>
                    {t("stitch.delAll")}
                  </button>
                  <button className="btn sm" onClick={aiPick} disabled={!analysis || !pieces.length || busy || aiBusy}>
                    {aiBusy ? <span className="spin" /> : t("stitch.aiPick")}
                  </button>
                </div>

                <div className="stitch-list" style={{ maxHeight: "26vh" }}>
                  {pieces.map((p, i) => (
                    <label key={p.id} className="stitch-row" style={{ cursor: "pointer", opacity: p.keep ? 1 : 0.5, outline: p.id === selId ? "2px solid #2563eb" : undefined }} onClick={() => setSelId(p.id)}>
                      <input type="checkbox" style={{ width: 14 }} checked={p.keep} onChange={() => setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, keep: !x.keep } : x)))} />
                      {analysis && <PieceThumb canvas={analysis.canvas} rect={p} />}
                      <span className="tiny" style={{ lineHeight: 1.3 }}>
                        <b>{i + 1}</b> · {p.w}×{p.h}
                        {p.kind ? <><br /><span className="muted">{t(`stitch.kind.${p.kind}` as any)}</span></> : p.suspect ? <><br /><span className="muted">⚠ {t("stitch.suspect")}</span></> : null}
                      </span>
                      <button
                        type="button"
                        className="btn ghost sm"
                        title={t("stitch.delBox")}
                        style={{ marginLeft: "auto", padding: "0 6px" }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removePiece(p.id);
                        }}
                      >
                        ✕
                      </button>
                    </label>
                  ))}
                  {analysis && !pieces.length && <p className="tiny muted" style={{ margin: 0 }}>{t("stitch.noPieces")}</p>}
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>{t("stitch.splitHint")}</p>
                <p className="tiny muted" style={{ margin: 0 }}>{t("stitch.drawHint")}</p>
              </>
            )}
          </div>

          {/* preview */}
          <div className="stitch-preview">
            {mode === "merge" ? (
              preview ? (
                <img src={preview} alt="" style={{ opacity: rendering ? 0.5 : 1 }} />
              ) : (
                <div className="empty">
                  <span className="spin" /> {t("stitch.rendering")}
                </div>
              )
            ) : analysis ? (
              <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", opacity: rendering ? 0.5 : 1, touchAction: "none", cursor: "crosshair" }} onPointerDown={startDraw} onPointerMove={onDrag} onPointerUp={endDraw}>
                <img ref={imgRef} src={analysis.url} alt="" draggable={false} style={{ display: "block", maxWidth: "100%", height: "auto" }} />
                {pieces.map((p, i) => (
                  <div
                    key={p.id}
                    onPointerDown={(e) => startDrag(e, p.id, "move")}
                    onPointerUp={() => endDrag(p.id)}
                    style={{
                      position: "absolute",
                      left: `${(p.x / aW) * 100}%`,
                      top: `${(p.y / aH) * 100}%`,
                      width: `${(p.w / aW) * 100}%`,
                      height: `${(p.h / aH) * 100}%`,
                      outline: p.id === selId ? "3px solid #2563eb" : p.keep ? "2px solid #17935a" : "2px dashed #9aa0aa",
                      background: p.keep ? "rgba(23,147,90,.10)" : "rgba(0,0,0,.28)",
                      cursor: "move",
                      boxSizing: "border-box",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute", left: 0, top: 0, padding: "1px 6px", font: "700 11px/1.4 var(--sans)",
                        background: p.keep ? "#17935a" : "#6b7280", color: "#fff", borderBottomRightRadius: 6, pointerEvents: "none",
                      }}
                    >
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      title={t("stitch.delBox")}
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        removePiece(p.id);
                      }}
                      style={{ position: "absolute", right: 2, top: 2, width: 20, height: 20, borderRadius: 10, border: 0, background: "rgba(220,38,38,.92)", color: "#fff", font: "700 12px/20px var(--sans)", cursor: "pointer", padding: 0, zIndex: 3 }}
                    >
                      ✕
                    </button>
                    {handles.map(([edge, style]) => (
                      <div key={edge} onPointerDown={(e) => startDrag(e, p.id, edge)} onPointerUp={() => endDrag(p.id)} style={{ position: "absolute", ...style }} />
                    ))}
                  </div>
                ))}
                {drawing && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${(drawing.x / aW) * 100}%`,
                      top: `${(drawing.y / aH) * 100}%`,
                      width: `${(drawing.w / aW) * 100}%`,
                      height: `${(drawing.h / aH) * 100}%`,
                      outline: "2px dashed #2563eb",
                      background: "rgba(37,99,235,.12)",
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="empty">
                <span className="spin" /> {t("stitch.analyzing")}
              </div>
            )}
          </div>
        </div>

        <div
          className="row"
          style={{
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: "1px solid var(--line)",
          }}
        >
          <button className="btn" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          {mode === "merge" ? (
            <button className="btn primary" onClick={applyMerge} disabled={busy || rendering || order.length < 2 || (!!sizeInfo && !canvasFits(sizeInfo.width, sizeInfo.height))}>
              {busy ? <span className="spin" /> : t("stitch.apply", { n: order.length })}
            </button>
          ) : (
            <button className="btn primary" onClick={applySplit} disabled={busy || rendering || !kept.length}>
              {busy ? <span className="spin" /> : t("stitch.applySplit", { n: kept.length })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
