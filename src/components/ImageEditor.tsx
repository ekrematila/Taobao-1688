import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LOGO, loadImage, canvasToBlob, downloadBlob, slugify } from "../lib/image";
import { localInpaint } from "../lib/inpaint";
import { refineMaskToMarks } from "../lib/detect";
import { api } from "../api";
import { useI18n, type Key } from "../i18n";
import { useToast } from "../toast";
import type { ImageOp } from "@shared/types.ts";

/* --------------------------------- model -------------------------------- */

const FONTS = [
  "Inter", "Poppins", "Montserrat", "Oswald", "Roboto Slab", "Playfair Display",
  "Bebas Neue", "Space Grotesk", "DM Sans", "Pacifico", "Lobster", "Anton",
  "Archivo Black", "Caveat", "Dancing Script", "Bungee", "Righteous",
  "Abril Fatface", "Josefin Sans", "Rubik",
];
const SWATCHES = [
  "#ffffff", "#000000", "#e0322d", "#f59e0b", "#16a34a", "#2563eb",
  "#7c3aed", "#db2777", "#0ea5e9", "#111827", "#facc15", "#f3f4f6",
];
const REF_WIDTH = 1000;

interface TextLayer {
  id: string;
  text: string;
  xPct: number;
  yPct: number;
  fontFamily: string;
  sizePct: number;
  color: string;
  gradientTo: string | null;
  bold: boolean;
  italic: boolean;
  align: CanvasTextAlign;
  strokePx: number;
  strokeColor: string;
  opacity: number;
  rotation: number;
}
interface LogoLayer {
  src: string;
  anchor: number;
  heightPx: number;
  offsetPx: number;
  opacity: number;
  rotation: number;
}
interface EditorState {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
  texts: TextLayer[];
  logo: LogoLayer | null;
  format: "image/png" | "image/jpeg" | "image/webp";
  quality: number;
}
const blankState = (): EditorState => ({
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  texts: [],
  logo: null,
  format: "image/png",
  quality: 0.92,
});
const newText = (label = "TEXT"): TextLayer => ({
  id: Math.random().toString(36).slice(2),
  text: label,
  xPct: 50,
  yPct: 50,
  fontFamily: "Inter",
  sizePct: 7,
  color: "#ffffff",
  gradientTo: null,
  bold: true,
  italic: false,
  align: "center",
  strokePx: 0,
  strokeColor: "#000000",
  opacity: 100,
  rotation: 0,
});

const PRESETS: { key: Key; apply: (s: EditorState) => EditorState }[] = [
  {
    key: "editor.preset.strip",
    apply: (s) => ({
      ...s,
      texts: [...s.texts, { ...newText(), text: "PREMIUM PBT", yPct: 92, sizePct: 5, color: "#ffffff" }],
    }),
  },
  {
    key: "editor.preset.badge",
    apply: (s) => ({ ...s, texts: [...s.texts, { ...newText(), text: "NEW", xPct: 85, yPct: 12, sizePct: 6, color: "#e0322d" }] }),
  },
  {
    key: "editor.preset.discount",
    apply: (s) => ({
      ...s,
      texts: [
        ...s.texts,
        { ...newText(), text: "-30%", xPct: 20, yPct: 20, sizePct: 12, color: "#e0322d", gradientTo: "#f59e0b", rotation: -12 },
      ],
    }),
  },
  { key: "editor.preset.bright", apply: (s) => ({ ...s, brightness: 106, contrast: 104, saturate: 112 }) },
];

interface Snap {
  src: string;
  st: EditorState;
  mask: string | null; // dataURL of the mask canvas
}

/* -------------------------------- component ----------------------------- */

export default function ImageEditor({
  imageUrl,
  logoDataUrl,
  title,
  applyToUrls,
  selectedUrls,
  onEraseMulti,
  onClose,
  onApply,
}: {
  imageUrl: string;
  logoDataUrl?: string | null;
  title: string;
  /** dedicated multi-erase flow — "Erase" applies the same mask to every one of these */
  applyToUrls?: string[];
  /** the images selected in the workspace — the erase brush can target all of them */
  selectedUrls?: string[];
  onEraseMulti?: (map: { from: string; to: string; ops: ImageOp[] }[]) => void;
  onClose: () => void;
  onApply?: (dataUrl: string, ops: ImageOp[]) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [st, setStRaw] = useState<EditorState>(blankState);
  const [selId, setSelId] = useState<string | null>(null);
  const [tool, setTool] = useState<"move" | "erase">(applyToUrls?.length ? "erase" : "move");
  const [eraseMode, setEraseMode] = useState<"brush" | "detect" | "wand">("detect");
  const [eraseR, setEraseR] = useState(9);
  const [eraseBusyN, setEraseBusyN] = useState("");
  const [wandTol, setWandTol] = useState(28);
  const [detectSens, setDetectSens] = useState(45);
  const [grain, setGrain] = useState(2);
  const [eraseToSelected, setEraseToSelected] = useState<boolean>(!!applyToUrls?.length);
  const multiUrls =
    applyToUrls?.length ? applyToUrls : eraseToSelected && (selectedUrls?.length ?? 0) >= 2 ? selectedUrls! : null;
  const pendingDetect = useRef(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [maskVersion, setMaskVersion] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const didErase = useRef(false); // an inpaint erase was actually applied

  /** What was actually done to the image, for the workspace op badges. */
  function currentOps(): ImageOp[] {
    const ops: ImageOp[] = [];
    if (didErase.current) ops.push("erase");
    const adjusted =
      st.brightness !== 100 || st.contrast !== 100 || st.saturate !== 100 || st.blur !== 0 || st.texts.length > 0;
    if (adjusted) ops.push("edit");
    if (st.logo) ops.push("logo");
    if (st.format !== "image/png" || st.quality !== 0.92) ops.push("format");
    return ops;
  }

  // ------------------------------- history ------------------------------
  const history = useRef<Snap[]>([]);
  const histIdx = useRef(-1);
  const [histState, setHistState] = useState({ canUndo: false, canRedo: false });
  const restoring = useRef(false);

  const snapNow = useCallback((): Snap => {
    const mc = maskRef.current;
    const hasMask = mc.width > 0 && mc.height > 0;
    return { src: img?.src ?? imageUrl, st, mask: hasMask ? mc.toDataURL("image/png") : null };
  }, [img, imageUrl, st]);

  const pushHistory = useCallback(() => {
    if (restoring.current) return;
    const snap = snapNow();
    const cur = history.current[histIdx.current];
    if (cur && cur.src === snap.src && cur.mask === snap.mask && JSON.stringify(cur.st) === JSON.stringify(snap.st))
      return;
    history.current = history.current.slice(0, histIdx.current + 1);
    history.current.push(snap);
    if (history.current.length > 40) history.current.shift();
    histIdx.current = history.current.length - 1;
    setHistState({ canUndo: histIdx.current > 0, canRedo: false });
  }, [snapNow]);

  const applySnap = useCallback((snap: Snap) => {
    restoring.current = true;
    setStRaw(snap.st);
    const mc = maskRef.current;
    if (snap.mask) {
      const mi = new Image();
      mi.onload = () => {
        mc.width = mi.width;
        mc.height = mi.height;
        const mx = mc.getContext("2d")!;
        mx.clearRect(0, 0, mc.width, mc.height);
        mx.drawImage(mi, 0, 0);
        setMaskVersion((v) => v + 1);
      };
      mi.src = snap.mask;
    } else {
      const mx = mc.getContext("2d");
      if (mx && mc.width) mx.clearRect(0, 0, mc.width, mc.height);
      setMaskVersion((v) => v + 1);
    }
    loadImage(snap.src)
      .then(setImg)
      .finally(() => {
        setTimeout(() => (restoring.current = false), 60);
      });
  }, []);

  const undo = useCallback(() => {
    if (histIdx.current <= 0) return;
    histIdx.current--;
    applySnap(history.current[histIdx.current]);
    setHistState({ canUndo: histIdx.current > 0, canRedo: histIdx.current < history.current.length - 1 });
  }, [applySnap]);
  const redo = useCallback(() => {
    if (histIdx.current >= history.current.length - 1) return;
    histIdx.current++;
    applySnap(history.current[histIdx.current]);
    setHistState({ canUndo: histIdx.current > 0, canRedo: histIdx.current < history.current.length - 1 });
  }, [applySnap]);

  const setSt = (p: Partial<EditorState> | ((s: EditorState) => EditorState)) =>
    setStRaw((s) => (typeof p === "function" ? p(s) : { ...s, ...p }));

  // ------------------------------- load --------------------------------
  useEffect(() => {
    loadImage(imageUrl)
      .then((im) => {
        setImg(im);
        // seed history once the first image is in
        setTimeout(() => {
          history.current = [{ src: im.src, st: blankState(), mask: null }];
          histIdx.current = 0;
          setHistState({ canUndo: false, canRedo: false });
        }, 0);
      })
      .catch(() => {});
  }, [imageUrl]);

  // snapshot committed changes (debounced)
  useEffect(() => {
    if (restoring.current) return;
    const id = setTimeout(pushHistory, 450);
    return () => clearTimeout(id);
  }, [st, maskVersion, pushHistory]);

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  useEffect(() => {
    if (st.logo?.src) {
      const i = new Image();
      i.onload = () => setLogoImg(i);
      i.src = st.logo.src;
    } else setLogoImg(null);
  }, [st.logo?.src]);

  const sel = st.texts.find((x) => x.id === selId) || null;
  const patchText = (id: string, p: Partial<TextLayer>) =>
    setSt((s) => ({ ...s, texts: s.texts.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

  /* -------------------------------- render ---------------------------- */
  const render = (target?: HTMLCanvasElement, mode: "preview" | "export" | "plate" = "preview"): HTMLCanvasElement => {
    const base = img!;
    const forExport = mode === "export" || mode === "plate";
    // export at native resolution; preview downscaled to <=900 for speed
    const w = forExport ? base.width : Math.round(base.width * Math.min(1, 900 / base.width));
    const h = forExport ? base.height : Math.round(base.height * (w / base.width));

    const c = target || document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.filter = `brightness(${st.brightness}%) contrast(${st.contrast}%) saturate(${st.saturate}%) blur(${st.blur}px)`;
    ctx.drawImage(base, 0, 0, w, h);
    ctx.filter = "none";
    if (mode === "plate") return c;

    // mask overlay (screen only) — magenta so it reads as a selection
    if (mode === "preview" && maskRef.current.width > 0) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.globalCompositeOperation = "source-over";
      const tint = document.createElement("canvas");
      tint.width = w;
      tint.height = h;
      const tx = tint.getContext("2d")!;
      tx.drawImage(maskRef.current, 0, 0, w, h);
      tx.globalCompositeOperation = "source-in";
      tx.fillStyle = "#ec4899";
      tx.fillRect(0, 0, w, h);
      ctx.drawImage(tint, 0, 0);
      ctx.restore();
    }

    for (const tl of st.texts) {
      const fs = (tl.sizePct / 100) * h;
      ctx.save();
      ctx.globalAlpha = tl.opacity / 100;
      ctx.translate((tl.xPct / 100) * w, (tl.yPct / 100) * h);
      ctx.rotate((tl.rotation * Math.PI) / 180);
      ctx.font = `${tl.italic ? "italic " : ""}${tl.bold ? "700" : "400"} ${fs}px "${tl.fontFamily}", sans-serif`;
      ctx.textAlign = tl.align;
      ctx.textBaseline = "middle";
      if (tl.gradientTo) {
        const tw = ctx.measureText(tl.text).width;
        const g = ctx.createLinearGradient(-tw / 2, 0, tw / 2, 0);
        g.addColorStop(0, tl.color);
        g.addColorStop(1, tl.gradientTo);
        ctx.fillStyle = g;
      } else ctx.fillStyle = tl.color;
      if (tl.strokePx > 0) {
        ctx.lineWidth = (tl.strokePx / 100) * h * 0.4;
        ctx.strokeStyle = tl.strokeColor;
        ctx.strokeText(tl.text, 0, 0);
      }
      ctx.fillText(tl.text, 0, 0);
      if (tl.id === selId && !forExport) {
        const tw = ctx.measureText(tl.text).width;
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(tl.align === "center" ? -tw / 2 - 4 : tl.align === "right" ? -tw - 4 : -4, -fs / 2 - 4, tw + 8, fs + 8);
      }
      ctx.restore();
    }

    if (st.logo && logoImg) {
      const L = st.logo;
      // scale by the image's LONGEST edge relative to the 1000px reference, so the
      // logo looks identical no matter the image's size or aspect ratio.
      const k = Math.max(w, h) / REF_WIDTH;
      const lh = L.heightPx * k;
      const lw = (logoImg.width / logoImg.height) * lh;
      const off = L.offsetPx * k;
      const col = L.anchor % 3;
      const rowi = Math.floor(L.anchor / 3);
      const x = col === 0 ? off : col === 1 ? (w - lw) / 2 : w - lw - off;
      const y = rowi === 0 ? off : rowi === 1 ? (h - lh) / 2 : h - lh - off;
      ctx.save();
      ctx.globalAlpha = L.opacity / 100;
      ctx.translate(x + lw / 2, y + lh / 2);
      ctx.rotate((L.rotation * Math.PI) / 180);
      ctx.drawImage(logoImg, -lw / 2, -lh / 2, lw, lh);
      ctx.restore();
    }
    return c;
  };

  useEffect(() => {
    if (img && canvasRef.current) render(canvasRef.current);
  });

  /* ------------------------------- mask ops --------------------------- */
  function ensureMask() {
    const mc = maskRef.current;
    if (!img) return null;
    const w = Math.round(img.width * Math.min(1, 900 / img.width));
    const h = Math.round(img.height * (w / img.width));
    if (mc.width !== w || mc.height !== h) {
      mc.width = w;
      mc.height = h;
      mc.getContext("2d")!.clearRect(0, 0, w, h);
    }
    return mc;
  }

  function stageXY(e: React.MouseEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
      xPct: ((e.clientX - r.left) / r.width) * 100,
      yPct: ((e.clientY - r.top) / r.height) * 100,
    };
  }

  function brushMask(x: number, y: number, add: boolean) {
    const mc = ensureMask();
    if (!mc) return;
    const mx = mc.getContext("2d")!;
    mx.globalCompositeOperation = add ? "source-over" : "destination-out";
    mx.fillStyle = "#ffffff";
    mx.beginPath();
    mx.arc(x, y, (eraseR / 100) * mc.width, 0, Math.PI * 2);
    mx.fill();
    mx.globalCompositeOperation = "source-over";
    setMaskVersion((v) => v + 1);
  }

  /** one-click select: flood-fill the connected region of similar colour. */
  function wandSelect(sx: number, sy: number) {
    const mc = ensureMask();
    if (!mc) return;
    const plate = render(undefined, "plate");
    const scaleX = plate.width / mc.width;
    const scaleY = plate.height / mc.height;
    const pw = plate.width;
    const ph = plate.height;
    const data = plate.getContext("2d")!.getImageData(0, 0, pw, ph).data;
    const px = Math.round(sx * scaleX);
    const py = Math.round(sy * scaleY);
    if (px < 0 || py < 0 || px >= pw || py >= ph) return;
    const at = (x: number, y: number) => (y * pw + x) * 4;
    const s = at(px, py);
    const sr = data[s],
      sg = data[s + 1],
      sb = data[s + 2];
    const tol = wandTol;
    const visited = new Uint8Array(pw * ph);
    const stack = [px + py * pw];
    const sel: number[] = [];
    const cap = pw * ph * 0.6;
    while (stack.length && sel.length < cap) {
      const p = stack.pop()!;
      if (visited[p]) continue;
      visited[p] = 1;
      const x = p % pw;
      const y = (p / pw) | 0;
      const o = p * 4;
      if (
        Math.abs(data[o] - sr) > tol ||
        Math.abs(data[o + 1] - sg) > tol ||
        Math.abs(data[o + 2] - sb) > tol
      )
        continue;
      sel.push(p);
      if (x > 0) stack.push(p - 1);
      if (x < pw - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - pw);
      if (y < ph - 1) stack.push(p + pw);
    }
    if (!sel.length) return;
    // paint the selection onto the mask (in mask-canvas space) + a little grow
    const mimg = new ImageData(mc.width, mc.height);
    const md = mimg.data;
    for (const p of sel) {
      const mxp = Math.round(((p % pw) / pw) * mc.width);
      const myp = Math.round((((p / pw) | 0) / ph) * mc.height);
      for (let gy = -1; gy <= 1; gy++) {
        for (let gx = -1; gx <= 1; gx++) {
          const nx = mxp + gx;
          const ny = myp + gy;
          if (nx < 0 || ny < 0 || nx >= mc.width || ny >= mc.height) continue;
          const mo = (ny * mc.width + nx) * 4;
          md[mo] = md[mo + 1] = md[mo + 2] = 255;
          md[mo + 3] = 255;
        }
      }
    }
    const mx = mc.getContext("2d")!;
    // merge (keep existing mask)
    const prev = mx.getImageData(0, 0, mc.width, mc.height).data;
    for (let i = 0; i < md.length; i += 4) {
      if (prev[i + 3] > 40 && Math.max(prev[i], prev[i + 1], prev[i + 2]) > 127) {
        md[i] = md[i + 1] = md[i + 2] = 255;
        md[i + 3] = 255;
      }
    }
    mx.putImageData(mimg, 0, 0);
    setMaskVersion((v) => v + 1);
  }

  function clearMask() {
    const mc = maskRef.current;
    if (mc.width) mc.getContext("2d")!.clearRect(0, 0, mc.width, mc.height);
    setMaskVersion((v) => v + 1);
  }
  function maskHasContent() {
    const mc = maskRef.current;
    if (!mc.width) return false;
    const d = mc.getContext("2d")!.getImageData(0, 0, mc.width, mc.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 40) return true;
    return false;
  }

  /** shrink the current selection to the text / marks that stand out from the bg. */
  function runDetect(silent = false): boolean {
    const mc = ensureMask();
    if (!mc || !maskHasContent()) {
      if (!silent) toast(t("editor.aiEraseSelect"), "err");
      return false;
    }
    const ok = refineMaskToMarks(render(undefined, "plate"), mc, detectSens);
    setMaskVersion((v) => v + 1);
    if (!ok && !silent) toast(t("editor.detectNone"));
    return ok;
  }

  /* ----------------------------- pointer ---------------------------- */
  function onDown(e: React.MouseEvent) {
    const { x, y, xPct, yPct } = stageXY(e);
    if (tool === "erase") {
      if (eraseMode === "wand") wandSelect(x, y);
      else {
        brushMask(x, y, true);
        if (eraseMode === "detect") pendingDetect.current = true;
      }
      return;
    }
    let hit: TextLayer | null = null;
    let best = 14;
    for (const tl of st.texts) {
      const d = Math.hypot(tl.xPct - xPct, tl.yPct - yPct);
      if (d < best) {
        best = d;
        hit = tl;
      }
    }
    if (hit) {
      setSelId(hit.id);
      drag.current = { id: hit.id, dx: hit.xPct - xPct, dy: hit.yPct - yPct };
    } else setSelId(null);
  }
  function onMove(e: React.MouseEvent) {
    if (e.buttons !== 1) return;
    const { x, y, xPct, yPct } = stageXY(e);
    if (tool === "erase") {
      if (eraseMode !== "wand") brushMask(x, y, true);
      return;
    }
    if (drag.current) {
      patchText(drag.current.id, {
        xPct: Math.max(0, Math.min(100, xPct + drag.current.dx)),
        yPct: Math.max(0, Math.min(100, yPct + drag.current.dy)),
      });
    }
  }
  function onUp() {
    drag.current = null;
    if (pendingDetect.current) {
      pendingDetect.current = false;
      // brushed a rough area in "detect" mode -> auto-shrink to the text/marks
      setTimeout(() => runDetect(true), 0);
    }
  }

  /* ------------------------------ actions -------------------------- */
  async function exportImage(forApply: boolean) {
    if (!img) return;
    const c = render(undefined, "export");
    const blob = await canvasToBlob(c, st.format, st.quality);
    if (forApply && onApply) {
      const ops = currentOps();
      const rd = new FileReader();
      rd.onload = () => onApply(String(rd.result), ops);
      rd.readAsDataURL(blob);
    } else {
      const ext = st.format.split("/")[1].replace("jpeg", "jpg");
      downloadBlob(blob, `${slugify(title)}-edit.${ext}`);
    }
  }

  async function runErase() {
    if (!img) return;
    if (!maskHasContent()) return toast(t("editor.aiEraseSelect"), "err");
    setAiBusy(true);
    pushHistory();
    try {
      const mc = maskRef.current;

      if (multiUrls?.length) {
        const map: { from: string; to: string }[] = [];
        const failed: string[] = [];
        for (let i = 0; i < multiUrls.length; i++) {
          const url = multiUrls[i];
          setEraseBusyN(`${i + 1}/${multiUrls.length}`);
          try {
            const im = await loadImage(url);
            const cv = document.createElement("canvas");
            cv.width = im.width;
            cv.height = im.height;
            cv.getContext("2d")!.drawImage(im, 0, 0);
            // Re-scale the mask to THIS image, anchored top-left and scaled by the
            // width ratio — so it's the same pixel region on every image (which is
            // what "same region" means for sliced description strips), not a blob
            // stretched to fill each image's own aspect ratio.
            const tm = document.createElement("canvas");
            tm.width = im.width;
            tm.height = im.height;
            const tmx = tm.getContext("2d")!;
            tmx.imageSmoothingEnabled = false;
            const ratio = im.width / mc.width;
            tmx.drawImage(mc, 0, 0, mc.width, mc.height, 0, 0, mc.width * ratio, mc.height * ratio);
            const out = await localInpaint(cv, tm, { grain: grain / 100 });
            const { url: saved } = await api.saveMedia(out.toDataURL("image/png"));
            map.push({ from: url, to: saved });
          } catch (err) {
            failed.push(url);
            console.error("multi-erase failed for", url, err);
          }
        }
        setEraseBusyN("");
        onEraseMulti?.(map.map((m) => ({ ...m, ops: ["erase"] as ImageOp[] })));
        if (map.length) toast(t("editor.aiEraseMulti", { n: map.length }), "ok");
        if (failed.length) toast(t("editor.aiEraseMultiFail", { n: failed.length }), "err");
        onClose();
        return;
      }

      const plate = render(undefined, "plate");
      const out = await localInpaint(plate, mc, { grain: grain / 100 });
      const fresh = await loadImage(out.toDataURL("image/png"));
      didErase.current = true;
      setImg(fresh);
      setSt((s) => ({ ...s, brightness: 100, contrast: 100, saturate: 100, blur: 0 }));
      clearMask();
      toast(t("editor.aiEraseDone"), "ok");
      setTimeout(pushHistory, 100);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setAiBusy(false);
    }
  }

  const rangeCtl = (label: string, val: number, min: number, max: number, step: number, on: (n: number) => void) => (
    <div className="rangerow">
      <span>{label}</span>
      <span className="mono">{val}</span>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => on(Number(e.target.value))} />
    </div>
  );

  const logoAtRef = st.logo ? Math.round((st.logo.heightPx * (img?.width ?? REF_WIDTH)) / REF_WIDTH) : 0;

  return (
    <div className="modal-scrim" onMouseUp={onUp}>
      <div className="modal">
        <div className="m-h">
          <h3 style={{ fontSize: 14 }}>
            {t("editor.title")}
            {applyToUrls?.length ? ` — ${t("editor.aiEraseMultiTitle", { n: applyToUrls.length })}` : ` — ${title}`}
          </h3>
          <div className="grow" style={{ flex: 1 }} />
          <button className="btn ghost sm" title="Ctrl+Z" onClick={undo} disabled={!histState.canUndo}>
            ↶ {t("editor.undo")}
          </button>
          <button className="btn ghost sm" title="Ctrl+Y" onClick={redo} disabled={!histState.canRedo}>
            ↷ {t("editor.redo")}
          </button>
          <div className="chips">
            <button className={"chip" + (tool === "move" ? " active" : "")} onClick={() => setTool("move")}>
              {t("editor.toolMove")}
            </button>
            <button className={"chip" + (tool === "erase" ? " active" : "")} onClick={() => setTool("erase")}>
              {t("editor.toolErase")}
            </button>
          </div>
          <button className="btn ghost sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <div className="m-b">
          <div className="editor-wrap">
            <div
              className="editor-stage"
              onMouseDown={onDown}
              onMouseMove={onMove}
              style={{ cursor: tool === "erase" ? "crosshair" : "default" }}
            >
              {img ? <canvas ref={canvasRef} /> : <div className="empty">{t("editor.loading")}</div>}
            </div>

            <div className="editor-side">
              {tool === "erase" && (
                <div className="grp">
                  <h5>{t("editor.eraseGroup")}</h5>
                  <div className="chips">
                    <button className={"chip" + (eraseMode === "detect" ? " active" : "")} onClick={() => setEraseMode("detect")}>
                      {t("editor.eraseDetect")}
                    </button>
                    <button className={"chip" + (eraseMode === "brush" ? " active" : "")} onClick={() => setEraseMode("brush")}>
                      {t("editor.eraseBrush")}
                    </button>
                    <button className={"chip" + (eraseMode === "wand" ? " active" : "")} onClick={() => setEraseMode("wand")}>
                      {t("editor.eraseWand")}
                    </button>
                  </div>
                  {eraseMode === "wand"
                    ? rangeCtl(t("editor.wandTol"), wandTol, 5, 90, 1, setWandTol)
                    : rangeCtl(t("editor.brush"), eraseR, 1, 25, 0.5, setEraseR)}
                  {(eraseMode === "detect" || eraseMode === "brush") &&
                    rangeCtl(t("editor.detectSens"), detectSens, 1, 99, 1, setDetectSens)}
                  {rangeCtl(t("editor.grain"), grain, 0, 40, 1, setGrain)}
                  <p className="tiny muted" style={{ margin: 0 }}>
                    {eraseMode === "detect" ? t("editor.detectHint") : t("editor.aiEraseHint")}
                  </p>
                  {!applyToUrls?.length && (selectedUrls?.length ?? 0) >= 2 && (
                    <label className="row tiny" style={{ gap: 6, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        style={{ width: 15, marginTop: 2 }}
                        checked={eraseToSelected}
                        onChange={(e) => setEraseToSelected(e.target.checked)}
                      />
                      <span>
                        <b>{t("editor.eraseSameRegion", { n: selectedUrls!.length })}</b>
                        <br />
                        {t("editor.eraseSameRegionHint")}
                      </span>
                    </label>
                  )}
                  <button className="btn primary sm" onClick={runErase} disabled={aiBusy}>
                    {aiBusy ? (
                      <>
                        <span className="spin" /> {t("editor.aiEraseWorking")} {eraseBusyN}
                      </>
                    ) : multiUrls?.length ? (
                      t("editor.aiEraseRunMulti", { n: multiUrls.length })
                    ) : (
                      t("editor.aiEraseRun")
                    )}
                  </button>
                </div>
              )}

              <div className="grp">
                <h5>{t("editor.adjust")}</h5>
                {rangeCtl(t("editor.brightness"), st.brightness, 40, 180, 1, (n) => setSt({ brightness: n }))}
                {rangeCtl(t("editor.contrast"), st.contrast, 40, 200, 1, (n) => setSt({ contrast: n }))}
                {rangeCtl(t("editor.saturation"), st.saturate, 0, 220, 1, (n) => setSt({ saturate: n }))}
                {rangeCtl(t("editor.blur"), st.blur, 0, 8, 0.5, (n) => setSt({ blur: n }))}
              </div>

              <div className="grp">
                <h5>{t("editor.textLayers")}</h5>
                <button
                  className="btn sm"
                  onClick={() => {
                    const layer = newText(t("editor.newText"));
                    setSt((s) => ({ ...s, texts: [...s.texts, layer] }));
                    setSelId(layer.id);
                  }}
                >
                  {t("editor.addText")}
                </button>
                {sel && (
                  <>
                    <input value={sel.text} onChange={(e) => patchText(sel.id, { text: e.target.value })} />
                    <div className="fontgrid">
                      {FONTS.map((f) => (
                        <button
                          key={f}
                          className={sel.fontFamily === f ? "active" : ""}
                          style={{ fontFamily: `"${f}", sans-serif` }}
                          onClick={() => patchText(sel.id, { fontFamily: f })}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    {rangeCtl(t("editor.size"), sel.sizePct, 2, 30, 0.5, (n) => patchText(sel.id, { sizePct: n }))}
                    {rangeCtl(t("editor.rotate"), sel.rotation, -180, 180, 1, (n) => patchText(sel.id, { rotation: n }))}
                    {rangeCtl(t("editor.opacity"), sel.opacity, 10, 100, 1, (n) => patchText(sel.id, { opacity: n }))}
                    <div className="swatches">
                      {SWATCHES.map((c) => (
                        <button
                          key={c}
                          className={"sw" + (sel.color === c ? " active" : "")}
                          style={{ background: c }}
                          onClick={() => patchText(sel.id, { color: c })}
                        />
                      ))}
                    </div>
                    <label className="tiny">
                      {t("editor.color")}{" "}
                      <input type="color" value={sel.color} onChange={(e) => patchText(sel.id, { color: e.target.value })} />
                    </label>
                    <label className="row tiny" style={{ gap: 6 }}>
                      <input
                        type="checkbox"
                        style={{ width: 14 }}
                        checked={!!sel.gradientTo}
                        onChange={(e) => patchText(sel.id, { gradientTo: e.target.checked ? "#f59e0b" : null })}
                      />
                      {t("editor.gradient")}
                      {sel.gradientTo && (
                        <input type="color" value={sel.gradientTo} onChange={(e) => patchText(sel.id, { gradientTo: e.target.value })} />
                      )}
                    </label>
                    <div className="row tiny" style={{ gap: 6 }}>
                      <button className={"chip" + (sel.bold ? " active" : "")} onClick={() => patchText(sel.id, { bold: !sel.bold })}>B</button>
                      <button className={"chip" + (sel.italic ? " active" : "")} onClick={() => patchText(sel.id, { italic: !sel.italic })}>i</button>
                      {(["left", "center", "right"] as CanvasTextAlign[]).map((a) => (
                        <button key={a} className={"chip" + (sel.align === a ? " active" : "")} onClick={() => patchText(sel.id, { align: a })}>
                          {a[0].toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {rangeCtl(t("editor.stroke"), sel.strokePx, 0, 4, 0.25, (n) => patchText(sel.id, { strokePx: n }))}
                    <button
                      className="btn sm"
                      onClick={() => {
                        setSt((s) => ({ ...s, texts: s.texts.filter((x) => x.id !== sel.id) }));
                        setSelId(null);
                      }}
                    >
                      {t("editor.deleteLayer")}
                    </button>
                  </>
                )}
              </div>

              <div className="grp">
                <h5>{t("editor.logo")}</h5>
                {!st.logo ? (
                  <>
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
                            setSt({ logo: { src: String(rd.result), ...DEFAULT_LOGO, rotation: 0 } });
                          rd.readAsDataURL(f);
                        }}
                      />
                    </label>
                    {logoDataUrl && (
                      <button
                        className="btn sm"
                        onClick={() => setSt({ logo: { src: logoDataUrl, ...DEFAULT_LOGO, rotation: 0 } })}
                      >
                        {t("editor.useSavedLogo")}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="anchor-grid">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <button key={i} className={st.logo!.anchor === i ? "active" : ""} onClick={() => setSt({ logo: { ...st.logo!, anchor: i } })} />
                      ))}
                    </div>
                    <p className="tiny muted">
                      {t("editor.logoHint", { h: st.logo.heightPx, o: st.logo.offsetPx, w: img?.width ?? "?", r: logoAtRef })}
                    </p>
                    {rangeCtl(t("editor.logoHeight"), st.logo.heightPx, 4, 120, 1, (n) => setSt({ logo: { ...st.logo!, heightPx: n } }))}
                    {rangeCtl(t("editor.logoOffset"), st.logo.offsetPx, 0, 60, 1, (n) => setSt({ logo: { ...st.logo!, offsetPx: n } }))}
                    {rangeCtl(t("editor.opacity"), st.logo.opacity, 10, 100, 1, (n) => setSt({ logo: { ...st.logo!, opacity: n } }))}
                    {rangeCtl(t("editor.rotate"), st.logo.rotation, -180, 180, 1, (n) => setSt({ logo: { ...st.logo!, rotation: n } }))}
                    <button className="btn sm" onClick={() => setSt({ logo: null })}>
                      {t("editor.removeLogo")}
                    </button>
                  </>
                )}
              </div>

              <div className="grp">
                <h5>{t("editor.presets")}</h5>
                <div className="chips">
                  {PRESETS.map((p) => (
                    <button key={p.key} className="chip" onClick={() => setStRaw((s) => p.apply(s))}>
                      {t(p.key)}
                    </button>
                  ))}
                  {logoDataUrl ? (
                    <button
                      className="chip"
                      onClick={() =>
                        setSt({ logo: { src: logoDataUrl, ...DEFAULT_LOGO, rotation: 0 } })
                      }
                    >
                      {t("editor.preset.logo")}
                    </button>
                  ) : (
                    <label className="chip" style={{ cursor: "pointer" }}>
                      {t("editor.preset.logo")}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const rd = new FileReader();
                          rd.onload = () =>
                            setSt({ logo: { src: String(rd.result), ...DEFAULT_LOGO, rotation: 0 } });
                          rd.readAsDataURL(f);
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              {!applyToUrls?.length && (
                <div className="grp">
                  <h5>{t("editor.export")}</h5>
                  <label className="field">
                    {t("editor.format")}
                    <select value={st.format} onChange={(e) => setSt({ format: e.target.value as EditorState["format"] })}>
                      <option value="image/png">{t("editor.formatPng")}</option>
                      <option value="image/jpeg">JPG</option>
                      <option value="image/webp">WebP</option>
                    </select>
                  </label>
                  {st.format !== "image/png" &&
                    rangeCtl(t("editor.quality"), Math.round(st.quality * 100), 40, 100, 1, (n) => setSt({ quality: n / 100 }))}
                  <div className="row">
                    <button className="btn primary sm" onClick={() => exportImage(false)} disabled={!img}>
                      {t("editor.downloadBtn")}
                    </button>
                    {onApply && (
                      <button className="btn sm" onClick={() => exportImage(true)} disabled={!img}>
                        {t("editor.applyDraft")}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
