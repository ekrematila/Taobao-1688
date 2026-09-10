import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { useQuery } from "@tanstack/react-query";
import {
  absoluteUrl,
  altTextsJob,
  altTextsManusJob,
  api,
  editImagesJob,
  editVideoJob,
  proxied,
  translateImagesJob,
  videoAltJob,
  videoPlanJob,
  type Draft,
} from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { JobCancelled, type RunningJob } from "../lib/jobs";
import JobProgress from "./JobProgress";
import ImageEditor from "./ImageEditor";
import BulkEditPanel from "./BulkEditPanel";
import CropPanel from "./CropPanel";
import OcrTranslatePanel from "./OcrTranslatePanel";
import StitchPanel from "./StitchPanel";
import StudioPanel from "./StudioPanel";
import Collapsible from "./Collapsible";
import {
  ADJUST_PRESETS,
  CROP_PRESETS,
  DEFAULT_LOGO,
  NEUTRAL_ADJUST,
  adjustFilter,
  canvasToBlob,
  computeLogoRect,
  downloadBlob,
  loadImage,
  renderImage,
  slugify,
  type Adjust,
  type LogoSpec,
} from "../lib/image";
import type { ImageOp, ImageTranslateJobResult, JobView, ProductImage } from "@shared/types.ts";
import { OP_KEY, OP_LETTER, mergeOps, opsOf } from "../lib/imageOps";
import { localAltText } from "../lib/altText";
import { localInpaint } from "../lib/inpaint";
import { refineMaskToMarks } from "../lib/detect";
import {
  bakeVideo,
  probeVideo,
  renderAudioWav,
  type BakeVideoOpts,
  type ChromaKey as VBChromaKey,
  type CoverRegion,
  type CropRect as VBCropRect,
  type TextOverlay,
  type VideoMeta,
} from "../lib/videoBake";
import { BRIEF_META, IMAGE_LENGTH_BANDS, buildStudioPrompt, wordCount } from "@shared/imageBriefs.ts";

/** A logo added in the VIDEO studio starts a bit larger and higher so it clears
 *  the player's control bar; the operator can drag it anywhere afterwards. */
const VIDEO_LOGO_DEFAULT = { anchor: 8, heightPx: 95, offsetPx: 40, opacity: 100 };
/** 3×3 anchor presets for the text overlay (centre position, % of frame). */
const TXT_ANCHORS: [number, number][] = [
  [12, 12], [50, 12], [88, 12],
  [12, 50], [50, 50], [88, 50],
  [12, 88], [50, 88], [88, 88],
];

/** Font families for the video text overlay (best-effort; falls back to Inter). */
const NFX_FONTS = [
  "Inter", "Arial", "Helvetica", "Georgia", "Times New Roman", "Trebuchet MS",
  "Verdana", "Tahoma", "Courier New", "Impact", "Palatino Linotype", "Garamond",
  "Comic Sans MS", "Oswald", "Lobster", "Pacifico", "Bebas Neue", "Montserrat",
];

type Role = "gallery" | "variant" | "description";
const ZONES: { role: Role; key: string }[] = [
  { role: "gallery", key: "ws.gallery" },
  { role: "variant", key: "ws.variant" },
  { role: "description", key: "ws.description" },
];
const LANGS = ["English", "Türkçe", "Deutsch", "Français", "Español"];
const IMAGE_SPECS: { v: string; label: string }[] = [
  { v: "", label: "Kaynakla aynı boyut" },
  { v: "~1000x1000 px, standard quality", label: "1000×1000 · standart" },
  { v: "~1500x1500 px, high quality", label: "1500×1500 · yüksek" },
  { v: "~2000x2000 px, 2K high quality", label: "2000×2000 · 2K" },
  { v: "~2048x2048 px, maximum quality, sharp", label: "2048×2048 · maks" },
  { v: "~800x800 px, standard quality", label: "800×800 · küçük" },
  { v: "1200x1500 px (4:5), high quality", label: "1200×1500 · 4:5" },
  { v: "__custom__", label: "Özel…" },
];
const COLLAPSE_LIMIT = 8;
type Fmt = "image/png" | "image/jpeg" | "image/webp";
const FMTS: { v: Fmt; label: string }[] = [
  { v: "image/webp", label: "WebP" },
  { v: "image/jpeg", label: "JPG" },
  { v: "image/png", label: "PNG" },
];

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(b);
  });
}

export default function VisualWorkspace({ draft, onSaved }: { draft: Draft; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [images, setImages] = useState<ProductImage[]>(draft.product?.images ?? []);
  const [sel, setSel] = useState<Set<string>>(new Set());
  // no forced crop here — keep the real aspect ratio, just cap the longest edge
  const preset = CROP_PRESETS[0]; // "Orijinal": ratio null, maxEdge 2000
  const [watermark, setWatermark] = useState("");
  const [adjust, setAdjust] = useState<Adjust>({ ...NEUTRAL_ADJUST });
  const [logo, setLogo] = useState<LogoSpec | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [dropZone, setDropZone] = useState<Role | null>(null);
  const [busy, setBusy] = useState<string>("");
  // Multiple AI jobs can run at once (the server takes 2 in parallel + a FIFO
  // queue). Each gets its own progress strip + cancel button, keyed by a local
  // slot id. `busy` still guards the strictly-serial in-browser canvas ops.
  const [jobs, setJobs] = useState<{ id: string; view: JobView; label?: string }[]>([]);
  const jobHandles = useRef<Map<string, RunningJob<unknown>>>(new Map());
  const jobSeq = useRef(0);

  /**
   * Start a server job in its own slot: wires progress into `jobs`, keeps the
   * handle for per-strip cancel, and clears the slot when it settles. Returns
   * the RunningJob so the caller can await / report its result. `label` is a
   * short caption (e.g. "Görsel 3/9") shown above the strip so a fanned-out
   * batch reads as N distinct rows.
   */
  function trackJob<T>(
    make: (onProgress: (j: JobView) => void) => RunningJob<T>,
    label?: string,
  ): RunningJob<T> {
    const slot = `j${++jobSeq.current}`;
    const r = make((view) =>
      setJobs((list) => {
        const i = list.findIndex((x) => x.id === slot);
        if (i === -1) return [...list, { id: slot, view, label }];
        const next = list.slice();
        next[i] = { id: slot, view, label };
        return next;
      }),
    );
    jobHandles.current.set(slot, r as RunningJob<unknown>);
    const clear = () => {
      jobHandles.current.delete(slot);
      setJobs((list) => list.filter((x) => x.id !== slot));
    };
    r.promise.then(clear, clear);
    return r;
  }

  /**
   * Fan a per-image Manus batch (translate / edit) out into ONE job PER image so
   * the operations area shows all N as distinct, individually-cancellable rows
   * (the server runs them JOB_CONCURRENCY-at-a-time, the rest queue). Returns the
   * settled results so the caller can post a single summary toast.
   */
  async function fanOutPerImage<T>(
    urls: string[],
    labelPrefix: string,
    make: (url: string, onProgress: (j: JobView) => void) => RunningJob<T>,
  ): Promise<PromiseSettledResult<T>[]> {
    const runs = urls.map((url, i) =>
      trackJob((op) => make(url, op), `${labelPrefix} ${i + 1}/${urls.length}`)
        .promise.finally(() => onSaved()), // each image swaps into its slot as it finishes
    );
    return Promise.allSettled(runs);
  }
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [eraseMultiUrls, setEraseMultiUrls] = useState<string[] | null>(null);
  const [bulkUrls, setBulkUrls] = useState<string[] | null>(null);
  const [cropUrls, setCropUrls] = useState<string[] | null>(null);
  const [ocrUrls, setOcrUrls] = useState<string[] | null>(null);
  const [stitchUrls, setStitchUrls] = useState<string[] | null>(null);
  const [studioSeed, setStudioSeed] = useState<string[] | "open" | null>(null);
  const [studioType, setStudioType] = useState<string>("ad");
  const [studioBand, setStudioBand] = useState<string>("");
  const studioThemeHint = useMemo(
    () =>
      Object.entries(draft.product?.props || {})
        .filter(([k]) => /tema|theme|renk|colou?r|stil|style|desen|pattern/i.test(k))
        .map(([, v]) => v)
        .join(", ")
        .slice(0, 120),
    [draft.product?.props],
  );
  const studioPromptPreview = useMemo(
    () =>
      buildStudioPrompt({
        typeKey: studioType,
        band: studioBand || undefined,
        product: draft.product,
        imageCount: sel.size,
        theme: studioThemeHint || undefined,
      }),
    [studioType, studioBand, draft.product, sel.size, studioThemeHint],
  );
  const [confirmRemove, setConfirmRemove] = useState<string[] | null>(null);

  // translation controls
  const [tLang, setTLang] = useState("English");
  const [tInstruction, setTInstruction] = useState("");
  const [imageSpec, setImageSpec] = useState("");
  const [customW, setCustomW] = useState(1500);
  const [customH, setCustomH] = useState(1500);
  const [customQ, setCustomQ] = useState<"standard" | "high" | "maximum">("high");
  const [manusProfile, setManusProfile] = useState<"manus-1.6-lite" | "manus-1.6" | "manus-1.6-max">("manus-1.6");
  const [aiCmd, setAiCmd] = useState("");
  const [bulkTrPrompt, setBulkTrPrompt] = useState("");
  const [bulkAltPrompt, setBulkAltPrompt] = useState("");
  const [expanded, setExpanded] = useState<Set<Role>>(new Set());
  // urls awaiting a "revert the AI cleanup / translation" confirmation
  const [revertConfirm, setRevertConfirm] = useState<string[] | null>(null);

  // AI is the default everywhere; ticking this also reveals the no-AI tools
  // (free OCR translation, local alt text) alongside the AI ones.
  const [showNoAi, setShowNoAi] = useState<boolean>(() => {
    try {
      return localStorage.getItem("tps:ws:noai") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("tps:ws:noai", showNoAi ? "1" : "0");
    } catch {
      /* private mode / disabled storage */
    }
  }, [showNoAi]);

  // right-click shortcut menu over a workspace thumbnail
  const [imgMenu, setImgMenu] = useState<{ x: number; y: number; url: string } | null>(null);
  const [imgMenuPrompt, setImgMenuPrompt] = useState("");
  // warning shown before a bulk (multi-image) action from the right-click menu
  const [bulkConfirm, setBulkConfirm] = useState<{ label: string; n: number; run: () => void } | null>(null);
  function openImgMenu(e: React.MouseEvent, url: string) {
    e.preventDefault();
    e.stopPropagation();
    // right-clicking an image outside the current selection targets just that image;
    // right-clicking one that IS selected keeps the whole selection (→ bulk actions)
    setSel((s) => (s.has(url) ? s : new Set([url])));
    setImgMenuPrompt("");
    const W = 264;
    const H = 360;
    setImgMenu({
      x: Math.max(8, Math.min(e.clientX, window.innerWidth - W - 8)),
      y: Math.max(8, Math.min(e.clientY, window.innerHeight - H - 8)),
      url,
    });
  }
  useEffect(() => {
    if (!imgMenu) return;
    const close = () => setImgMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [imgMenu]);

  const effectiveSpec =
    imageSpec === "__custom__" ? `${customW}x${customH} px, ${customQ} quality` : imageSpec;
  const dirty = useRef(false);
  const lastSel = useRef<string | null>(null);
  const serverSig = useRef("");

  // bulk format conversion + link panel
  const [fmt, setFmt] = useState<Fmt>("image/webp");
  const [fmtQ, setFmtQ] = useState(90);
  const [linksOpen, setLinksOpen] = useState(false);
  const [copied, setCopied] = useState<ProductImage[] | null>(null);
  const [dlOpen, setDlOpen] = useState(false);
  const videoUrl: string = (draft.product as any)?.videoUrl || "";

  // Keep the local image list in sync with the server. Fires on draft switch AND
  // when an AI op (translate / edit / erase / compose) replaced or added images.
  // Translated images keep their original slot server-side, so nothing jumps to
  // the bottom. Never overwrite an un-saved local role edit.
  useEffect(() => {
    const imgs = draft.product?.images ?? [];
    const sig = JSON.stringify(imgs.map((i) => [i.url, i.role, i.alt ?? ""]));
    if (sig === serverSig.current) return;
    serverSig.current = sig;
    if (dirty.current) return;
    setImages(imgs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id, draft.product?.images]);

  useEffect(() => {
    if (!dirty.current || !draft.product) return;
    const id = setTimeout(async () => {
      dirty.current = false;
      await api.patchDraft(draft.id, { product: { ...draft.product, images }, label: t("ws.roleLabel") });
      onSaved();
    }, 900);
    return () => clearTimeout(id);
  }, [images]);

  const byRole = useMemo(() => {
    const m: Record<Role, ProductImage[]> = { gallery: [], variant: [], description: [] };
    for (const im of images) m[(im.role === "unused" ? "description" : im.role) as Role].push(im);
    return m;
  }, [images]);

  const orderedUrls = useMemo(
    () => [...byRole.gallery, ...byRole.variant, ...byRole.description].map((im) => im.url),
    [byRole],
  );

  function setRole(urls: string[], role: Role) {
    const set = new Set(urls);
    setImages((xs) => xs.map((im) => (set.has(im.url) ? { ...im, role } : im)));
    dirty.current = true;
  }

  const normRole = (r: string) => (r === "unused" ? "description" : r);

  /** Move one image one slot earlier/later within its own role group. */
  function moveImage(url: string, dir: -1 | 1) {
    setImages((xs) => {
      const i = xs.findIndex((im) => im.url === url);
      if (i < 0) return xs;
      let j = i + dir;
      while (j >= 0 && j < xs.length && normRole(xs[j].role) !== normRole(xs[i].role)) j += dir;
      if (j < 0 || j >= xs.length) return xs;
      const next = xs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    dirty.current = true;
  }

  /** Drop `fromUrl` in front of `toUrl` (only within the same role group). */
  function reorderImage(fromUrl: string, toUrl: string) {
    setImages((xs) => {
      const from = xs.findIndex((im) => im.url === fromUrl);
      const to = xs.findIndex((im) => im.url === toUrl);
      if (from < 0 || to < 0 || from === to) return xs;
      if (normRole(xs[from].role) !== normRole(xs[to].role)) return xs;
      const next = xs.slice();
      const [it] = next.splice(from, 1);
      next.splice(next.findIndex((im) => im.url === toUrl), 0, it);
      return next;
    });
    dirty.current = true;
  }

  function pick(url: string, e: React.MouseEvent) {
    setSel((s) => {
      if (e.shiftKey && lastSel.current) {
        const a = orderedUrls.indexOf(lastSel.current);
        const b = orderedUrls.indexOf(url);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          const n = new Set(e.ctrlKey || e.metaKey ? s : []);
          orderedUrls.slice(lo, hi + 1).forEach((u) => n.add(u));
          return n;
        }
      }
      const n = new Set(e.ctrlKey || e.metaKey ? s : []);
      n.has(url) ? n.delete(url) : n.add(url);
      return n;
    });
    if (!e.shiftKey) lastSel.current = url;
  }

  function removeImages(urls: string[]) {
    const set = new Set(urls);
    setImages((xs) => xs.filter((im) => !set.has(im.url)));
    setSel((s) => {
      const n = new Set(s);
      urls.forEach((u) => n.delete(u));
      return n;
    });
    dirty.current = true;
    setConfirmRemove(null);
    toast(t("ws.removed", { n: urls.length }));
  }

  function patchAlt(url: string, alt: string) {
    setImages((xs) => xs.map((im) => (im.url === url ? { ...im, alt } : im)));
    dirty.current = true;
  }

  /** Copy the same image file into another zone (kept as a distinct card via a
   *  "#dup-…" url marker that never reaches the network). */
  function pasteInto(role: Role) {
    if (!copied?.length) return;
    const base = (u: string) => u.split("#dup-")[0];
    const stamp = Date.now();
    const dups: ProductImage[] = copied.map((im, i) => ({
      ...im,
      url: `${base(im.url)}#dup-${stamp}-${i}`,
      role,
      originalUrl: im.originalUrl ?? base(im.url),
    }));
    setImages((xs) => [...xs, ...dups]);
    dirty.current = true;
    toast(t("ws.pasted", { n: dups.length, zone: t(("ws." + role) as any) }));
  }

  // Delete/Backspace removes selection · Ctrl+C copies · Ctrl+V pastes into the
  // last-clicked image's zone (or the gallery).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editUrl || bulkUrls || confirmRemove) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel.size) {
        e.preventDefault();
        setConfirmRemove([...sel]);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && sel.size) {
        e.preventDefault();
        const picked = images.filter((im) => sel.has(im.url));
        setCopied(picked);
        toast(t("ws.copied", { n: picked.length }));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && copied?.length) {
        e.preventDefault();
        const anchor = lastSel.current ? images.find((im) => im.url === lastSel.current) : null;
        pasteInto(((anchor?.role === "unused" ? "description" : anchor?.role) as Role) ?? "gallery");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, editUrl, bulkUrls, confirmRemove, images, copied]);

  // preview shows the ACTUAL selected image(s) at true aspect ratio — no crop,
  // no stretch. The chosen view/crop + quality only apply on download.
  const previewUrls = useMemo(() => {
    if (sel.size) return orderedUrls.filter((u) => sel.has(u));
    const g = byRole.gallery[0]?.url;
    return g ? [g] : [];
  }, [sel, orderedUrls, byRole]);
  const preview = previewUrls[0];
  const [dlQuality, setDlQuality] = useState(92);
  const imgByUrl = useMemo(() => new Map(images.map((im) => [im.url, im])), [images]);
  /** selected images that were AI-cleaned/translated and can be reverted */
  const revertableSel = useMemo(
    () => [...sel].filter((u) => imgByUrl.get(u)?.translatedFrom),
    [sel, imgByUrl],
  );

  /** restore the pre-cleanup image (translatedFrom → originalUrl) for `urls`. */
  async function revertCleanup(urls: string[]) {
    const fresh = await api.draft(draft.id);
    const list: ProductImage[] = fresh.product?.images ?? [];
    const set = new Set(urls);
    const revertedTo: string[] = [];
    const next = list.map((im) => {
      if (!set.has(im.url)) return im;
      const prev = im.translatedFrom || (im.originalUrl && im.originalUrl !== im.url ? im.originalUrl : null);
      if (!prev) return im;
      revertedTo.push(prev);
      const ops = (im.ops || []).filter((o) => o !== "translate");
      return {
        ...im,
        url: prev,
        ops: ops.length ? ops : undefined,
        translatedFrom: undefined,
        taskUrl: undefined,
        remoteUrl: undefined,
      };
    });
    if (!revertedTo.length) return toast(t("ws.revertNone"), "err");
    await api.patchDraft(draft.id, {
      product: { ...fresh.product, images: next },
      label: t("ws.revertLabel", { n: revertedTo.length }),
    });
    setSel(new Set(revertedTo));
    onSaved();
    toast(t("ws.revertDone", { n: revertedTo.length }), "ok");
  }

  useEffect(() => {
    if (!logo?.src) return void setLogoImg(null);
    const i = new Image();
    i.onload = () => setLogoImg(i);
    i.src = logo.src;
  }, [logo?.src]);

  const PREVIEW_CAP = 12;
  const adjChanged = (Object.keys(NEUTRAL_ADJUST) as (keyof Adjust)[]).some(
    (k) => (adjust[k] ?? NEUTRAL_ADJUST[k]) !== NEUTRAL_ADJUST[k],
  );

  /* ------------------------------- jobs ------------------------------- */

  function cancelJob(id: string) {
    jobHandles.current.get(id)?.cancel();
    toast(t("ws.cancelling"));
  }

  async function runAltTexts(source: "claude" | "manus") {
    if (source === "manus" && !settings.data?.hasManusKey) return toast(t("ws.manusMissing"), "err");
    const urls = sel.size ? [...sel] : undefined; // undefined = all images
    const r = trackJob<unknown>((onProgress) =>
      source === "manus"
        ? altTextsManusJob({ draftId: draft.id, imageUrls: urls, targetLanguage: tLang }, onProgress)
        : altTextsJob(draft.id, tLang, settings.data?.llmModel, onProgress),
    );
    try {
      await r.promise;
      toast(t("ws.altTexts") + " ✓", "ok");
      onSaved();
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    }
  }

  /** NO-AI alt text: analyse the pixels locally + product context. Free, instant. */
  async function runLocalAltText() {
    const targets = sel.size ? images.filter((im) => sel.has(im.url)) : images;
    if (!targets.length) return toast(t("ws.selectFirst"), "err");
    setBusy("altlocal");
    const propsText = Object.entries(draft.product?.props ?? {})
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    const title = draft.product?.titleTranslated || draft.product?.title || draft.title;
    let n = 0;
    try {
      for (const im of targets) {
        try {
          const img = await loadImage(proxied(im.url.split("#dup-")[0]));
          const c = document.createElement("canvas");
          c.width = img.naturalWidth || img.width;
          c.height = img.naturalHeight || img.height;
          c.getContext("2d")!.drawImage(img, 0, 0);
          const alt = localAltText(c, { title, role: im.role, propsText }); // always English, Chinese-free
          if (alt) {
            patchAlt(im.url, alt);
            n++;
          }
        } catch {
          /* skip unreadable image */
        }
      }
      toast(t("ws.altLocalDone", { n }), "ok");
    } finally {
      setBusy("");
    }
  }

  /** One job PER image so all N show as separate rows in the operations area. */
  function translateFanout(urls: string[]) {
    return fanOutPerImage(urls, t("ws.jobImage"), (url, op) =>
      translateImagesJob(
        {
          draftId: draft.id,
          imageUrls: [url],
          targetLanguage: tLang,
          instruction: tInstruction || undefined,
          // no size knob for translation — the server guarantees shortest edge 800–1000 px, max quality
          agentProfile: manusProfile,
        },
        op,
      ),
    );
  }

  async function runTranslateImages(all: boolean) {
    if (!settings.data?.hasManusKey) return toast(t("ws.manusMissing"), "err");
    const urls = all ? images.map((i) => i.url) : [...sel];
    if (!urls.length) return toast(t("ws.selectFirst"), "err");
    reportTranslateSettled(await translateFanout(urls));
    onSaved();
  }

  /** Merge N single-image translate results (or failures) into one summary toast. */
  function reportTranslateSettled(res: PromiseSettledResult<ImageTranslateJobResult>[]) {
    const items = res.flatMap((r) => (r.status === "fulfilled" ? r.value.items : []));
    const credits = res.reduce((s, r) => s + (r.status === "fulfilled" ? r.value.totalCredits || 0 : 0), 0);
    const failed = res.filter((r) => r.status === "rejected" && !((r as PromiseRejectedResult).reason instanceof JobCancelled));
    reportTranslate({ items: [...items, ...failed.map(() => ({ changed: false, error: "job" }) as any)], totalCredits: credits });
  }

  /** Toast the outcome of a translate-images job — errors (rate limit etc.) win over the OK line. */
  function reportTranslate(res: ImageTranslateJobResult) {
    const changed = res.items.filter((i) => i.changed).length;
    const errs = res.items.filter((i) => i.error);
    if (errs.length) {
      toast(t("ws.trErrors", { n: errs.length, msg: errs[0].error || "" }), "err");
      if (changed) toast(t("ws.trResult", { changed, skipped: res.items.length - changed, credits: res.totalCredits }), "ok");
      return;
    }
    toast(t("ws.trResult", { changed, skipped: res.items.length - changed, credits: res.totalCredits }), "ok");
  }

  async function runEditImages() {
    if (!settings.data?.hasManusKey) return toast(t("ws.manusMissing"), "err");
    const urls = [...sel];
    if (!urls.length || !aiCmd.trim()) return toast(t("ws.selectFirst"), "err");
    reportEditSettled(await editFanout(urls, aiCmd.trim()));
    onSaved();
  }

  function noTranslationNeeded() {
    setSel(new Set());
    toast(t("ws.trSkipped"));
  }

  /* ---- explicit-URL variants for the right-click shortcut menu ---- */
  async function runTranslateUrls(urls: string[]) {
    if (!settings.data?.hasManusKey) return toast(t("ws.manusMissing"), "err");
    if (!urls.length) return;
    reportTranslateSettled(await translateFanout(urls));
    onSaved();
  }

  /** One edit job PER image (same reasoning as translateFanout). */
  function editFanout(urls: string[], instruction: string) {
    return fanOutPerImage(urls, t("ws.jobImage"), (url, op) =>
      editImagesJob(
        {
          draftId: draft.id,
          imageUrls: [url],
          instruction: instruction.trim(),
          imageSpec: effectiveSpec || undefined,
          agentProfile: manusProfile,
        },
        op,
      ),
    );
  }

  function reportEditSettled(res: PromiseSettledResult<{ changed: number }>[]) {
    const changed = res.reduce((s, r) => s + (r.status === "fulfilled" ? r.value.changed || 0 : 0), 0);
    const failed = res.filter((r) => r.status === "rejected" && !((r as PromiseRejectedResult).reason instanceof JobCancelled)).length;
    if (failed) toast(t("ws.trErrors", { n: failed, msg: "" }), "err");
    if (changed || !failed) toast(t("ws.aiCmdDone", { n: changed }), "ok");
  }

  async function runEditUrls(urls: string[], instruction: string) {
    if (!settings.data?.hasManusKey) return toast(t("ws.manusMissing"), "err");
    if (!urls.length || !instruction.trim()) return;
    reportEditSettled(await editFanout(urls, instruction));
    onSaved();
  }

  /* ---- bulk AI (preview card): selected images, or all if none selected ---- */
  const bulkTargets = useMemo(
    () => (sel.size ? orderedUrls.filter((u) => sel.has(u)) : images.map((i) => i.url)),
    [sel, orderedUrls, images],
  );
  async function runBulkAi(kind: "ai-tr" | "ai-alt") {
    if (!settings.data?.hasManusKey) return toast(t("ws.manusMissing"), "err");
    if (!bulkTargets.length) return toast(t("ws.selectFirst"), "err");
    if (kind === "ai-tr") {
      // fan out → one row per image in the operations area
      const res = await fanOutPerImage(bulkTargets, t("ws.jobImage"), (url, op) =>
        translateImagesJob(
          {
            draftId: draft.id,
            imageUrls: [url],
            targetLanguage: tLang,
            instruction: bulkTrPrompt.trim() || undefined,
            agentProfile: manusProfile,
          },
          op,
        ),
      );
      reportTranslateSettled(res as PromiseSettledResult<ImageTranslateJobResult>[]);
      onSaved();
      return;
    }
    const r = trackJob<unknown>((onProgress) =>
      altTextsManusJob(
        { draftId: draft.id, imageUrls: bulkTargets, targetLanguage: tLang, instruction: bulkAltPrompt.trim() || undefined },
        onProgress,
      ),
    );
    try {
      await r.promise;
      toast(t("ocr.aiAltDone"), "ok");
      onSaved();
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    }
  }
  const runBulkTranslate = () => runBulkAi("ai-tr");
  const runBulkAlt = () => runBulkAi("ai-alt");

  async function previewLocalAlt(url: string) {
    const product = draft.product;
    if (!product) return;
    try {
      const img = await loadImage(proxied(url.split("#dup-")[0]));
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      c.getContext("2d")!.drawImage(img, 0, 0);
      const propsText = Object.entries(product.props ?? {})
        .slice(0, 8)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      const role = images.find((x) => x.url === url)?.role;
      patchAlt(url, localAltText(c, { title: product.titleTranslated || product.title || draft.title, role, propsText }));
      toast(t("ws.altLocalDone", { n: 1 }), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  /* --------------------------- local exports ------------------------- */

  const DL_EXT: Record<Fmt, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

  /** Download the current selection (1 = single file, 2+ = zip) in `mime`,
   *  with the filigran + adjust + logo applied. Real aspect kept (no crop). */
  async function exportAs(mime: Fmt) {
    const urls = previewUrls.length ? previewUrls : images.map((i) => i.url);
    if (!urls.length) return toast(t("ws.selectFirst"), "err");
    const q = dlQuality / 100;
    const ext = DL_EXT[mime];
    const ro = { preset, watermark, adjust, logo, logoImg };
    setBusy("dl");
    try {
      if (urls.length === 1) {
        const img = await loadImage(urls[0]);
        const blob = await canvasToBlob(renderImage(img, ro), mime, q);
        downloadBlob(blob, `${slugify(draft.title)}.${ext}`);
      } else {
        const zip = new JSZip();
        let n = 1;
        for (const url of urls) {
          try {
            const img = await loadImage(url);
            const blob = await canvasToBlob(renderImage(img, ro), mime, q);
            zip.file(`${String(n).padStart(2, "0")}-${slugify(draft.title, 24)}.${ext}`, blob);
            n++;
          } catch {
            /* skip a broken image */
          }
        }
        downloadBlob(await zip.generateAsync({ type: "blob" }), `${slugify(draft.title)}-${ext}.zip`);
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  /** Bake the current logo into the selected images (or all) and persist in place. */
  async function applyLogo() {
    if (!logo || !logoImg) return toast(t("editor.logoNotReady"), "err");
    const targets = bulkTargets;
    if (!targets.length) return toast(t("ws.selectFirst"), "err");
    setBusy("logo");
    try {
      const map: { from: string; to: string }[] = [];
      for (const u of targets) {
        try {
          const img = await loadImage(proxied(u.split("#dup-")[0]));
          const canvas = renderImage(img, { preset: CROP_PRESETS[0], logo, logoImg });
          const { url } = await api.saveMedia(canvas.toDataURL("image/png"));
          map.push({ from: u, to: url });
        } catch {
          /* skip a broken image */
        }
      }
      if (map.length) {
        await applyImageMap(map, "logo", t("editor.logoApplied", { n: map.length }));
        setSel(new Set(map.map((m) => m.to))); // keep the just-logo'd images in view
      }
      toast(t("editor.logoApplied", { n: map.length }), map.length ? "ok" : "err");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  /** Bake filigran + adjust + logo into the selected images (or all), convert to
   *  `mime`, and PERSIST in place — no download. This is what the format buttons do. */
  async function applyRender(mime: Fmt) {
    const targets = bulkTargets;
    if (!targets.length) return toast(t("ws.selectFirst"), "err");
    const hasLogo = !!(logo && logoImg);
    const hasAdjust = JSON.stringify(adjust) !== JSON.stringify(NEUTRAL_ADJUST);
    const hasWm = !!watermark.trim();
    if (mime === "image/png" && !hasLogo && !hasAdjust && !hasWm)
      return toast(t("ws.applyNothing"), "err");
    setBusy("apply");
    try {
      const q = dlQuality / 100;
      const ro = { preset: CROP_PRESETS[0], watermark, adjust, logo, logoImg };
      const map: { from: string; to: string }[] = [];
      for (const u of targets) {
        try {
          const img = await loadImage(proxied(u.split("#dup-")[0]));
          const blob = await canvasToBlob(renderImage(img, ro), mime, q);
          const { url } = await api.saveMedia(await blobToDataUrl(blob));
          map.push({ from: u, to: url });
        } catch {
          /* skip a broken image */
        }
      }
      if (map.length) {
        const ops: ImageOp[] = [];
        if (hasLogo) ops.push("logo");
        if (hasAdjust || hasWm) ops.push("edit");
        if (mime !== "image/png") ops.push("format");
        await applyImageMap(map, ops.length ? ops : ["format"], t("ws.applyDone", { n: map.length }));
        setSel(new Set(map.map((m) => m.to)));
      }
      toast(t("ws.applyDone", { n: map.length }), map.length ? "ok" : "err");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  /** An editor result replaces its source image in place (same slot, merged ops). */
  async function applyEditedImage(dataUrl: string, ops: ImageOp[] = []) {
    setBusy("apply");
    try {
      const { url } = await api.saveMedia(dataUrl); // persist server-side, keep DB small
      const fresh = await api.draft(draft.id);
      const src = editUrl;
      const list: ProductImage[] = fresh.product?.images ?? [];
      const idx = list.findIndex((im) => im.url === src);
      let next: ProductImage[];
      if (idx >= 0) {
        next = list.map((im, i) =>
          i === idx
            ? { ...im, url, originalUrl: im.originalUrl ?? im.url, ops: mergeOps(im.ops, ops) }
            : im,
        );
      } else {
        next = [...list, { url, role: "description" as Role, ops, originalUrl: src ?? undefined }];
      }
      await api.patchDraft(draft.id, { product: { ...fresh.product, images: next }, label: t("ws.editLabel") });
      setEditUrl(null);
      onSaved();
      toast(t("ws.editReplaced"), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  /** A brand-new composite from the studio → appended to the gallery. */
  async function addComposite(url: string, remoteUrl?: string) {
    const fresh = await api.draft(draft.id);
    const next = [
      ...(fresh.product?.images ?? []),
      { url, role: "gallery" as Role, ops: ["edit" as ImageOp], remoteUrl: remoteUrl || undefined },
    ];
    await api.patchDraft(draft.id, { product: { ...fresh.product, images: next }, label: t("studioP.addedLabel") });
    onSaved();
  }

  /** N source images → ONE stitched image, dropped in at the first source's slot. */
  async function applyStitch(sourceUrls: string[], resultUrl: string) {
    const fresh = await api.draft(draft.id);
    const list: ProductImage[] = fresh.product?.images ?? [];
    const srcSet = new Set(sourceUrls);
    const idxs = list.map((im, i) => (srcSet.has(im.url) ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) return;
    const anchor = Math.min(...idxs);
    // dominant role of the pieces (most common; ties → first)
    const roleCount = new Map<string, number>();
    for (const i of idxs) roleCount.set(list[i].role, (roleCount.get(list[i].role) ?? 0) + 1);
    const role = ([...roleCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "description") as ProductImage["role"];
    const merged: ProductImage = { url: resultUrl, role, ops: ["edit"] };
    const next: ProductImage[] = [];
    list.forEach((im, i) => {
      if (i === anchor) next.push(merged);
      if (!srcSet.has(im.url)) next.push(im);
    });
    await api.patchDraft(draft.id, { product: { ...fresh.product, images: next }, label: t("stitch.label", { n: sourceUrls.length }) });
    setSel(new Set([resultUrl]));
    onSaved();
  }

  /** Replace images by a {from,to} map, in place, merging op(s). */
  async function applyImageMap(map: { from: string; to: string }[], op: ImageOp | ImageOp[], label: string) {
    if (!map.length) return;
    const ops = Array.isArray(op) ? op : [op];
    const fresh = await api.draft(draft.id);
    const byFrom = new Map(map.map((m) => [m.from, m.to]));
    const next = (fresh.product?.images ?? []).map((im) =>
      byFrom.has(im.url)
        ? { ...im, url: byFrom.get(im.url)!, originalUrl: im.originalUrl ?? im.url, ops: mergeOps(im.ops, ops) }
        : im,
    );
    await api.patchDraft(draft.id, { product: { ...fresh.product, images: next }, label });
    setSel(new Set());
    onSaved();
  }

  /** Re-encode the selected images to another format (no crop/adjust). */
  async function convertFormat() {
    const urls = [...sel];
    if (!urls.length) return toast(t("ws.selectFirst"), "err");
    setBusy("fmt");
    try {
      const fresh = await api.draft(draft.id);
      const list: ProductImage[] = fresh.product?.images ?? [];
      const map = new Map<string, string>();
      for (const u of urls) {
        try {
          const im = await loadImage(u);
          const c = document.createElement("canvas");
          c.width = im.naturalWidth || im.width;
          c.height = im.naturalHeight || im.height;
          c.getContext("2d")!.drawImage(im, 0, 0);
          const blob = await canvasToBlob(c, fmt, fmtQ / 100);
          const { url } = await api.saveMedia(await blobToDataUrl(blob));
          map.set(u, url);
        } catch {
          /* skip a broken image */
        }
      }
      const next = list.map((im) => {
        const nu = map.get(im.url);
        return nu ? { ...im, url: nu, originalUrl: im.originalUrl ?? im.url, ops: mergeOps(im.ops, ["format"]) } : im;
      });
      await api.patchDraft(draft.id, {
        product: { ...fresh.product, images: next },
        label: t("ws.fmtLabel", { n: map.size }),
      });
      setSel(new Set());
      onSaved();
      toast(t("ws.fmtDone", { n: map.size, fmt: FMTS.find((f) => f.v === fmt)?.label ?? fmt }), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  async function applyEraseMulti(map: { from: string; to: string; ops: ImageOp[] }[]) {
    if (!map.length) return;
    const fresh = await api.draft(draft.id);
    const byFrom = new Map(map.map((m) => [m.from, m]));
    const next = (fresh.product?.images ?? []).map((im) => {
      const m = byFrom.get(im.url);
      return m ? { ...im, url: m.to, originalUrl: im.originalUrl ?? im.url, ops: mergeOps(im.ops, m.ops) } : im;
    });
    await api.patchDraft(draft.id, {
      product: { ...fresh.product, images: next },
      label: t("editor.aiEraseMulti", { n: map.length }),
    });
    onSaved();
  }

  // AI jobs no longer block the UI — they run server-side (2 in parallel + a
  // queue) and each shows its own progress strip, so a second job can be started
  // while the first runs. `running` now only reflects the strictly-serial
  // in-browser canvas ops (local alt text, format convert, render/apply, logo).
  const running = !!busy;

  return (
    <div className="grid ws-grid" style={{ alignItems: "start" }}>
      {editUrl && (
        <ImageEditor
          imageUrl={editUrl}
          title={draft.title || draft.numIid}
          applyToUrls={eraseMultiUrls ?? undefined}
          selectedUrls={sel.size >= 2 ? [...sel] : undefined}
          onEraseMulti={applyEraseMulti}
          onClose={() => {
            setEditUrl(null);
            setEraseMultiUrls(null);
          }}
          onApply={applyEditedImage}
        />
      )}
      {bulkUrls && bulkUrls.length > 0 && (
        <BulkEditPanel urls={bulkUrls} draft={draft} onClose={() => setBulkUrls(null)} onDone={() => onSaved()} />
      )}
      {cropUrls && cropUrls.length > 0 && (
        <CropPanel
          urls={cropUrls}
          onClose={() => setCropUrls(null)}
          onApply={(map) => applyImageMap(map, "edit", t("ws.cropLabel", { n: map.length }))}
        />
      )}
      {ocrUrls && ocrUrls.length > 0 && (
        <OcrTranslatePanel
          urls={ocrUrls}
          draft={draft}
          hasManusKey={!!settings.data?.hasManusKey}
          onSaved={onSaved}
          onClose={() => setOcrUrls(null)}
          onApply={(map) => applyImageMap(map, "translate", t("ocr.label", { n: map.length }))}
        />
      )}
      {stitchUrls && stitchUrls.length >= 2 && (
        <StitchPanel
          urls={stitchUrls}
          onClose={() => setStitchUrls(null)}
          onApply={applyStitch}
        />
      )}
      {studioSeed && (
        <StudioPanel
          draft={draft}
          seedUrls={studioSeed === "open" ? undefined : studioSeed}
          seedType={studioType}
          seedBand={studioBand}
          onClose={() => setStudioSeed(null)}
          onApply={addComposite}
        />
      )}
      {confirmRemove && (
        <div className="modal-scrim" onClick={() => setConfirmRemove(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("ws.removeConfirmTitle", { n: confirmRemove.length })}</h3>
            <p className="sub">{t("ws.removeConfirmBody")}</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setConfirmRemove(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn danger" onClick={() => removeImages(confirmRemove)}>
                {t("ws.remove")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <h3>{t("ws.title")}</h3>
          <span className="sub">{t("ws.hint")}</span>
        </div>
        <div className="card-b col">
          <div className="stepsnote">{t("ws.stepsNote")}</div>

          <label className="ai-toggle">
            <input
              type="checkbox"
              checked={showNoAi}
              onChange={(e) => setShowNoAi(e.target.checked)}
            />
            <span>
              <b>{t("ws.noAiToggle")}</b>
              <span className="tiny muted"> — {showNoAi ? t("ws.noAiOn") : t("ws.noAiOff")}</span>
            </span>
          </label>

          {copied && copied.length > 0 && (
            <div className="pastebar">
              <span>{t("ws.copiedN", { n: copied.length })}</span>
              {(["gallery", "variant", "description"] as Role[]).map((r) => (
                <button key={r} className="btn sm" onClick={() => pasteInto(r)}>
                  → {t(("ws." + r) as any)}
                </button>
              ))}
              <div className="grow" style={{ flex: 1 }} />
              <button className="btn ghost sm" onClick={() => setCopied(null)}>
                ✕
              </button>
            </div>
          )}

          <div className="imgzones">
            {ZONES.map((z) => (
              <div
                key={z.role}
                className={"zone" + (dropZone === z.role ? " drop" : "")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropZone(z.role);
                }}
                onDragLeave={() => setDropZone(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropZone(null);
                  const url = e.dataTransfer.getData("text/plain");
                  setRole(sel.has(url) ? [...sel] : [url], z.role);
                }}
              >
                <h4>
                  <label className="row" style={{ gap: 5, margin: 0 }}>
                    <input
                      type="checkbox"
                      style={{ width: 13 }}
                      title={t("ws.zoneSelectAll")}
                      disabled={!byRole[z.role].length}
                      checked={byRole[z.role].length > 0 && byRole[z.role].every((im) => sel.has(im.url))}
                      onChange={(e) => {
                        const urls = byRole[z.role].map((im) => im.url);
                        setSel((s) => {
                          const n = new Set(s);
                          urls.forEach((u) => (e.target.checked ? n.add(u) : n.delete(u)));
                          return n;
                        });
                      }}
                    />
                    <span>{t(z.key as any)}</span>
                  </label>
                  <span className="muted">{byRole[z.role].length}</span>
                  <button
                    className="btn ghost sm"
                    style={{ padding: "2px 6px", fontSize: 10 }}
                    disabled={!byRole[z.role].length}
                    onClick={() => setBulkUrls(byRole[z.role].map((im) => im.url))}
                  >
                    {t("ws.bulkEditZone")}
                  </button>
                </h4>
                <div className="thumbs">
                  {(expanded.has(z.role) ? byRole[z.role] : byRole[z.role].slice(0, COLLAPSE_LIMIT)).map((im, i) => (
                    <ThumbCard
                      key={im.url}
                      im={im}
                      selected={sel.has(im.url)}
                      bulkCount={sel.has(im.url) && sel.size >= 2 ? sel.size : 0}
                      ops={opsOf(im)}
                      canLeft={i > 0}
                      canRight={i < byRole[z.role].length - 1}
                      onMove={(dir) => moveImage(im.url, dir)}
                      onReorderDrop={(from) => reorderImage(from, im.url)}
                      onPick={(e) => pick(im.url, e)}
                      onEdit={() => setEditUrl(im.url)}
                      onRemove={() =>
                        setConfirmRemove(
                          sel.has(im.url) && sel.size >= 2 ? orderedUrls.filter((u) => sel.has(u)) : [im.url],
                        )
                      }
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", im.url)}
                      onAlt={(alt) => patchAlt(im.url, alt)}
                      onCopyLink={() => {
                        navigator.clipboard?.writeText(absoluteUrl(im.url));
                        toast(t("ws.linksCopied"));
                      }}
                      onContextMenu={(e) => openImgMenu(e, im.url)}
                    />
                  ))}
                </div>
                {byRole[z.role].length > COLLAPSE_LIMIT && (
                  <button
                    className="btn ghost sm zone-more"
                    onClick={() =>
                      setExpanded((s) => {
                        const n = new Set(s);
                        n.has(z.role) ? n.delete(z.role) : n.add(z.role);
                        return n;
                      })
                    }
                  >
                    {expanded.has(z.role) ? t("ws.showLess") : t("ws.showAll", { n: byRole[z.role].length })}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="row">
            {(["gallery", "variant", "description"] as Role[]).map((r) => (
              <button key={r} className="btn sm" onClick={() => setRole([...sel], r)} disabled={!sel.size}>
                → {t(("ws." + r) as any)}
              </button>
            ))}
            <div className="grow" style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setSel(new Set(images.map((i) => i.url)))}>
              {t("common.selectAll")}
            </button>
            <button
              className="btn sm danger"
              onClick={() => setConfirmRemove([...sel])}
              disabled={!sel.size}
            >
              {t("ws.removeSelected")} ({sel.size})
            </button>
            <button className="btn sm" onClick={() => setBulkUrls([...sel])} disabled={!sel.size}>
              {t("ws.bulkEdit")} ({sel.size})
            </button>
            <button className="btn sm" onClick={() => setCropUrls([...sel])} disabled={!sel.size}>
              {t("ws.crop")} ({sel.size})
            </button>
            {revertableSel.length > 0 && (
              <button
                className="btn sm"
                style={{ color: "var(--danger)" }}
                onClick={() => setRevertConfirm(revertableSel)}
              >
                ↩ {t("ws.revertBtn")} ({revertableSel.length})
              </button>
            )}
            <button className="btn sm" onClick={() => setEditUrl(preview!)} disabled={!preview}>
              {t("ws.advancedEditor")}
            </button>
            <button className="btn sm" onClick={() => setStudioSeed(sel.size >= 1 ? [...sel] : "open")}>
              {sel.size >= 1 ? `${t("ws.studioCombine")} (${sel.size})` : `🎨 ${t("ws.studio")}`}
            </button>
          </div>

          {/* 1) image cleanup (translate + strip watermark/logo/off-topic text + re-fit type) */}
          <div className="card" style={{ boxShadow: "none" }}>
            <div className="card-h">
              <span className="hinttip">
                <h3 style={{ fontSize: 13 }}>{t("ws.trTitle")}</h3>
                <span className="hinttip-badge" tabIndex={0} aria-label={t("ws.trTip")}>?</span>
                <span className="hinttip-pop" role="tooltip">{t("ws.trTip")}</span>
              </span>
              {!settings.data?.hasManusKey && <span className="badge warn">{t("ws.manusMissing")}</span>}
            </div>
            <div className="card-b col">
              <label className="field">
                {t("ws.trTargetLang")}
                <select value={tLang} onChange={(e) => setTLang(e.target.value)}>
                  {LANGS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t("ws.trInstruction")}
                <input
                  type="text"
                  value={tInstruction}
                  onChange={(e) => setTInstruction(e.target.value)}
                  placeholder={t("ws.trInstructionPh")}
                />
              </label>
              <p className="tiny muted" style={{ margin: "2px 0 0" }}>{t("ws.trSizeNote")}</p>
              <label className="field">
                {t("ws.manusProfile")}
                <select value={manusProfile} onChange={(e) => setManusProfile(e.target.value as any)}>
                  <option value="manus-1.6-lite">manus-1.6-lite</option>
                  <option value="manus-1.6">manus-1.6</option>
                  <option value="manus-1.6-max">manus-1.6-max</option>
                </select>
              </label>
              <p className="tiny muted" style={{ margin: 0 }}>{t("ws.manusProfileHint")}</p>
              <div className="row">
                <button className="btn primary sm" onClick={() => runTranslateImages(false)} disabled={running || !sel.size}>
                  {t("ws.trSelected")} ({sel.size})
                </button>
                <button className="btn sm" onClick={() => runTranslateImages(true)} disabled={running}>
                  {t("ws.trAll")}
                </button>
                <button className="btn sm" onClick={noTranslationNeeded} disabled={running}>
                  {t("ws.trNone")}
                </button>
              </div>
              <p className="tiny muted">{t("ws.trHint")}</p>
              {showNoAi && (
                <>
                  <div className="row" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                    <b className="tiny">{t("ws.freeTr")}</b>
                    <button className="btn sm" onClick={() => setOcrUrls([...sel])} disabled={!sel.size || running}>
                      {t("ws.freeTrRun")} ({sel.size})
                    </button>
                  </div>
                  <p className="tiny muted" style={{ margin: 0 }}>{t("ws.freeTrHint")}</p>
                </>
              )}
            </div>
          </div>

          {/* 2) alt text — right after translation (before logo) */}
          <div className="row" style={{ alignItems: "center" }}>
            <b className="tiny">{t("ws.altTextsGroup")}</b>
            {showNoAi && (
              <button className="btn sm" onClick={runLocalAltText} disabled={running || busy === "altlocal"}>
                {busy === "altlocal" ? <span className="spin" /> : t("ws.altTextsLocal")} {sel.size ? `(${sel.size})` : ""}
              </button>
            )}
            <button
              className="btn primary sm"
              onClick={() => runAltTexts("manus")}
              disabled={running || !settings.data?.hasManusKey}
            >
              {t("ws.altTextsManus")} {sel.size ? `(${sel.size})` : ""}
            </button>
          </div>
          {showNoAi && <p className="tiny muted">{t("ws.altTextsLocalHint")}</p>}

          {/* 3) free-form AI image command (not translation) */}
          <div className="card" style={{ boxShadow: "none" }}>
            <div className="card-h">
              <h3 style={{ fontSize: 13 }}>{t("ws.aiCmdTitle")}</h3>
              {!settings.data?.hasManusKey && <span className="badge warn">{t("ws.manusMissing")}</span>}
            </div>
            <div className="card-b col">
              <input
                type="text"
                value={aiCmd}
                onChange={(e) => setAiCmd(e.target.value)}
                placeholder={t("ws.aiCmdPh")}
              />
              <div className="row">
                <button
                  className="btn primary sm"
                  onClick={runEditImages}
                  disabled={running || !sel.size || !aiCmd.trim() || !settings.data?.hasManusKey}
                >
                  {t("ws.aiCmdRun")} ({sel.size})
                </button>
              </div>
              <p className="tiny muted">{t("ws.aiCmdHint")}</p>
            </div>
          </div>

          {/* 3b) AI image / ad studio — detailed, research-backed prompts per type */}
          <div className="card" style={{ boxShadow: "none" }}>
            <div className="card-h">
              <h3 style={{ fontSize: 13 }}>🎨 {t("ws.studioTitle")}</h3>
              {!settings.data?.hasManusKey && <span className="badge warn">{t("ws.manusMissing")}</span>}
            </div>
            <div className="card-b col" style={{ gap: 8 }}>
              <p className="tiny muted" style={{ margin: 0 }}>{t("ws.studioIntro")}</p>
              <div className="chips">
                {BRIEF_META.map((m) => (
                  <button
                    key={m.key}
                    className={"chip" + (studioType === m.key ? " active" : "")}
                    onClick={() => setStudioType(m.key)}
                    title={m.research}
                  >
                    {lang === "tr" ? m.tr : m.en}
                  </button>
                ))}
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>
                💡 {BRIEF_META.find((m) => m.key === studioType)?.research}
              </p>
              <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="field" style={{ width: 170 }}>
                  {t("ws.studioPromptLen")}
                  <select value={studioBand} onChange={(e) => setStudioBand(e.target.value)}>
                    <option value="">{t("ws.studioPromptLenFull")}</option>
                    {IMAGE_LENGTH_BANDS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn primary sm"
                  onClick={() => setStudioSeed(sel.size >= 1 ? [...sel] : "open")}
                >
                  {sel.size >= 1 ? `${t("ws.studioOpenWith")} (${sel.size})` : t("ws.studioOpen")}
                </button>
              </div>
              <details>
                <summary className="tiny muted" style={{ cursor: "pointer" }}>
                  {t("ws.studioPromptShow")} · {wordCount(studioPromptPreview)} {t("preview.words")}
                </summary>
                <textarea
                  readOnly
                  value={studioPromptPreview}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ minHeight: 150, marginTop: 6, font: "400 11.5px/1.5 var(--mono)", whiteSpace: "pre-wrap" }}
                />
              </details>
              <p className="tiny muted" style={{ margin: 0 }}>{t("ws.studioHint")}</p>
            </div>
          </div>

          {/* 4) image work done → bulk format + links */}
          <div className="row" style={{ alignItems: "center" }}>
            <span className="tiny muted">{t("ws.fmtGroup")}</span>
            <select value={fmt} onChange={(e) => setFmt(e.target.value as Fmt)} style={{ width: 90 }}>
              {FMTS.map((f) => (
                <option key={f.v} value={f.v}>
                  {f.label}
                </option>
              ))}
            </select>
            {fmt !== "image/png" && (
              <label className="row tiny muted" style={{ gap: 4, margin: 0 }}>
                {t("editor.quality")}
                <input
                  type="range"
                  min={40}
                  max={100}
                  value={fmtQ}
                  onChange={(e) => setFmtQ(Number(e.target.value))}
                  style={{ width: 90 }}
                />
                <span className="mono">{fmtQ}</span>
              </label>
            )}
            <button className="btn sm" onClick={convertFormat} disabled={!sel.size || busy === "fmt"}>
              {busy === "fmt" ? <span className="spin" /> : `${t("ws.fmtConvert")} (${sel.size})`}
            </button>
          </div>

          <button
            className={"btn sm links-toggle" + (linksOpen ? " active" : "")}
            onClick={() => setLinksOpen((o) => !o)}
          >
            🔗 {t("ws.links")} · {orderedUrls.length} {linksOpen ? "▴" : "▾"}
          </button>
          {linksOpen && (
            <LinksPanel
              byRole={byRole}
              sel={sel}
              onToggle={(url, on) =>
                setSel((s) => {
                  const n = new Set(s);
                  on ? n.add(url) : n.delete(url);
                  return n;
                })
              }
              onCopy={(text, msg) => {
                navigator.clipboard?.writeText(text);
                toast(msg ?? t("ws.linksCopied"));
              }}
            />
          )}

          {jobs.length > 0 && (
            <div className="col" style={{ gap: 6 }}>
              <div className="tiny muted">{t("ws.jobsActive", { n: jobs.length })}</div>
              {jobs.map(({ id, view, label }) => (
                <div key={id}>
                  {label && <div className="tiny" style={{ fontWeight: 600, margin: "2px 0" }}>{label}</div>}
                  <JobProgress job={view} onCancel={() => cancelJob(id)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* right column: quick-crop + the video studio directly under it */}
      <div className="col" style={{ gap: 16, minWidth: 0 }}>
      {/* preview + adjust / logo / export */}
      <div className="card">
        <div className="card-h">
          <h3>{t("ws.quickCrop")}</h3>
          <span className="sub">{previewUrls.length > 1 ? t("ws.previewN", { n: previewUrls.length }) : ""}</span>
        </div>
        <div className="card-b col">
          <label className="field">
            {t("ws.watermark")}
            <input
              type="text"
              value={watermark}
              onChange={(e) => setWatermark(e.target.value)}
              placeholder={t("ws.optional")}
            />
          </label>

          {/* adjustments */}
          <div className="qc-grp">
            <h5>{t("editor.adjust")}</h5>
            <div className="chips">
              {ADJUST_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className="chip"
                  onClick={() => setAdjust({ ...NEUTRAL_ADJUST, ...p.adjust })}
                  title={t("ws.applyPreset")}
                >
                  {lang === "tr" ? p.tr : p.en}
                </button>
              ))}
            </div>
            <Range label={t("editor.brightness")} value={adjust.brightness} min={40} max={180} onChange={(n) => setAdjust((a) => ({ ...a, brightness: n }))} />
            <Range label={t("editor.contrast")} value={adjust.contrast} min={40} max={200} onChange={(n) => setAdjust((a) => ({ ...a, contrast: n }))} />
            <Range label={t("editor.saturation")} value={adjust.saturate} min={0} max={220} onChange={(n) => setAdjust((a) => ({ ...a, saturate: n }))} />
            <Range label={t("ws.adjExposure")} value={adjust.exposure ?? 0} min={-100} max={100} onChange={(n) => setAdjust((a) => ({ ...a, exposure: n }))} />
            <Range label={t("ws.adjWarmth")} value={adjust.warmth ?? 0} min={-100} max={100} onChange={(n) => setAdjust((a) => ({ ...a, warmth: n }))} />
            <Range label={t("ws.adjTint")} value={adjust.tint ?? 0} min={-100} max={100} onChange={(n) => setAdjust((a) => ({ ...a, tint: n }))} />
            <Range label={t("ws.adjSharpen")} value={adjust.sharpen ?? 0} min={0} max={100} onChange={(n) => setAdjust((a) => ({ ...a, sharpen: n }))} />
            <Range label={t("ws.adjVignette")} value={adjust.vignette ?? 0} min={0} max={100} onChange={(n) => setAdjust((a) => ({ ...a, vignette: n }))} />
            <Range label={t("ws.adjBlur")} value={adjust.blur ?? 0} min={0} max={12} onChange={(n) => setAdjust((a) => ({ ...a, blur: n }))} />
            {adjChanged && (
              <button className="btn ghost sm" onClick={() => setAdjust({ ...NEUTRAL_ADJUST })}>
                {t("ws.resetAdjust")}
              </button>
            )}
          </div>

          {/* logo — single or bulk (applies to every selected image on download) */}
          <div className="qc-grp">
            {!logo ? (
              <label className="btn sm" style={{ alignSelf: "flex-start" }}>
                {t("editor.uploadLogo")}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const rd = new FileReader();
                    rd.onload = () => setLogo({ src: String(rd.result), ...DEFAULT_LOGO });
                    rd.readAsDataURL(f);
                    e.currentTarget.value = "";
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
                <Range label={t("editor.logoHeight")} value={logo.heightPx} min={4} max={120} onChange={(n) => setLogo({ ...logo, heightPx: n })} />
                <Range label={t("editor.logoOffset")} value={logo.offsetPx} min={0} max={60} onChange={(n) => setLogo({ ...logo, offsetPx: n })} />
                <Range label={t("editor.opacity")} value={logo.opacity} min={10} max={100} onChange={(n) => setLogo({ ...logo, opacity: n })} />
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn primary sm"
                    onClick={applyLogo}
                    disabled={!!busy || !logoImg || !bulkTargets.length}
                  >
                    {busy === "logo" ? <span className="spin" /> : t("editor.logoApply", { n: bulkTargets.length })}
                  </button>
                  <button className="btn ghost sm" onClick={() => setLogo(null)}>{t("editor.removeLogo")}</button>
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>{t("editor.logoApplyHint")}</p>
              </>
            )}
          </div>

          {/* bulk AI — runs on the selected images (or all if none selected) */}
          <div className="qc-grp">
            <h5>{t("ws.bulkAi")} {`· ${bulkTargets.length}`}</h5>
            <label className="field">
              {t("ws.manusProfile")}
              <select value={manusProfile} onChange={(e) => setManusProfile(e.target.value as any)}>
                <option value="manus-1.6-lite">manus-1.6-lite</option>
                <option value="manus-1.6">manus-1.6</option>
                <option value="manus-1.6-max">manus-1.6-max</option>
              </select>
            </label>
            <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
              <input
                type="text"
                style={{ flex: 1 }}
                value={bulkTrPrompt}
                onChange={(e) => setBulkTrPrompt(e.target.value)}
                placeholder={t("ws.bulkTrPh")}
              />
              <button
                className="btn primary sm"
                onClick={runBulkTranslate}
                disabled={running || !bulkTargets.length || !settings.data?.hasManusKey}
              >
                {t("ws.pvAiTr")}
              </button>
            </div>
            <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
              <input
                type="text"
                style={{ flex: 1 }}
                value={bulkAltPrompt}
                onChange={(e) => setBulkAltPrompt(e.target.value)}
                placeholder={t("ws.bulkAltPh")}
              />
              <button
                className="btn primary sm"
                onClick={runBulkAlt}
                disabled={running || !bulkTargets.length || !settings.data?.hasManusKey}
              >
                {t("ws.pvAiAlt")}
              </button>
            </div>
            {!settings.data?.hasManusKey && <p className="tiny muted" style={{ margin: 0 }}>{t("ws.manusMissing")}</p>}
          </div>

          {/* every selected image — real aspect, no crop/stretch, live filigran+logo+adjust
              + per-image tools (OCR translate, no-AI alt text, inline generative erase) */}
          <div className="preview-list">
            {previewUrls.length === 0 && <div className="empty">{t("ws.previewEmpty")}</div>}
            {previewUrls.slice(0, PREVIEW_CAP).map((u) => (
              <PreviewImage
                key={u}
                url={u}
                alt={imgByUrl.get(u)?.alt ?? ""}
                ops={imgByUrl.get(u) ? opsOf(imgByUrl.get(u)!) : []}
                watermark={watermark}
                adjust={adjust}
                logo={logo}
                logoImg={logoImg}
                busy={!!busy}
                showNoAi={showNoAi}
                onAlt={(v) => patchAlt(u, v)}
                onCopy={(link) => {
                  navigator.clipboard?.writeText(link);
                  toast(t("ws.linksCopied"));
                }}
                onOcr={() => setOcrUrls([u])}
                onLocalAlt={() => previewLocalAlt(u)}
                onErased={(nu) => applyImageMap([{ from: u, to: nu }], "erase", t("editor.aiEraseDone"))}
              />
            ))}
            {previewUrls.length > PREVIEW_CAP && (
              <p className="tiny muted">{t("ws.previewMore", { n: previewUrls.length - PREVIEW_CAP })}</p>
            )}
          </div>

          <label className="field">
            {t("ws.dlQuality")} · {dlQuality}%
            <input type="range" min={40} max={100} value={dlQuality} onChange={(e) => setDlQuality(Number(e.target.value))} />
          </label>
          <div className="row">
            <button className="btn primary sm" onClick={() => applyRender("image/png")} disabled={!bulkTargets.length || !!busy}>
              {busy === "apply" ? <span className="spin" /> : `${t("ws.applyPng")} (${bulkTargets.length})`}
            </button>
            <button className="btn sm" onClick={() => applyRender("image/jpeg")} disabled={!bulkTargets.length || !!busy}>
              {t("ws.applyJpg")}
            </button>
            <button className="btn sm" onClick={() => applyRender("image/webp")} disabled={!bulkTargets.length || !!busy}>
              {t("ws.applyWebp")}
            </button>
            <button className="btn ghost sm" onClick={() => setDlOpen((v) => !v)}>
              {t("ws.advancedShort")}
            </button>
          </div>
          <p className="tiny muted">{t("ws.applyHint")}</p>
          {dlOpen && (
            <div className="qc-grp" style={{ marginTop: 6 }}>
              <div className="tiny muted">{t("ws.dlHint")}</div>
              <div className="row">
                <button className="btn sm" onClick={() => exportAs("image/png")} disabled={!previewUrls.length || !!busy}>
                  {t("ws.dlPng")}
                </button>
                <button className="btn sm" onClick={() => exportAs("image/jpeg")} disabled={!previewUrls.length || !!busy}>
                  {t("ws.dlJpg")}
                </button>
                <button className="btn sm" onClick={() => exportAs("image/webp")} disabled={!previewUrls.length || !!busy}>
                  {t("ws.dlWebp")}
                </button>
                <button className="btn sm" onClick={() => setEditUrl(preview!)} disabled={!preview}>
                  {t("ws.fullEditor")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <VideoStudio
        draft={draft}
        videoUrl={videoUrl}
        hasManusKey={!!settings.data?.hasManusKey}
        manusProfile={manusProfile}
        onSaved={onSaved}
      />
      </div>

      {imgMenu &&
        (() => {
          const targets =
            sel.has(imgMenu.url) && sel.size >= 2 ? orderedUrls.filter((u) => sel.has(u)) : [imgMenu.url];
          const bulk = targets.length >= 2;
          const close = () => setImgMenu(null);
          // run now for a single image; for a bulk set, warn first
          const go = (label: string, fn: () => void) => {
            close();
            if (bulk) setBulkConfirm({ label, n: targets.length, run: fn });
            else fn();
          };
          const cnt = bulk ? <span className="cnt"> · {targets.length}</span> : null;
          const hasManusKey = !!settings.data?.hasManusKey;
          const revertTargets = targets.filter((u) => imgByUrl.get(u)?.translatedFrom);
          return (
            <>
              <div
                className="vfx-menu-scrim"
                onPointerDown={close}
                onContextMenu={(e) => {
                  e.preventDefault();
                  close();
                }}
              />
              <div
                className="vfx-menu"
                style={{ left: imgMenu.x, top: imgMenu.y }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="vfx-menu-h">
                  {bulk ? t("ws.imgMenuTitleBulk", { n: targets.length }) : t("ws.imgMenuTitle")}
                </div>
                {bulk && <div className="vfx-menu-note">{t("ws.imgMenuBulkNote", { n: targets.length })}</div>}

                {targets.length >= 2 && (
                  <>
                    <div className="vfx-menu-sec">{t("ws.imgMenuMerge")}</div>
                    <button
                      className="vfx-menu-item"
                      onClick={() => {
                        const list = targets;
                        close();
                        setStitchUrls(list);
                      }}
                    >
                      {t("ws.imgMenuMergeRun")}
                      <span className="cnt"> · {targets.length}</span>
                    </button>
                  </>
                )}

                <div className="vfx-menu-sec">{t("ws.imgMenuTranslate")}</div>
                <button
                  className="vfx-menu-item primary"
                  disabled={running || !hasManusKey}
                  onClick={() => go(t("ws.imgMenuTranslateAi"), () => runTranslateUrls(targets))}
                >
                  {t("ws.imgMenuTranslateAi")}
                  {cnt}
                </button>
                {revertTargets.length > 0 && (
                  <button
                    className="vfx-menu-item danger"
                    onClick={() => {
                      close();
                      setRevertConfirm(revertTargets);
                    }}
                  >
                    ↩ {t("ws.revertMenu")}
                    {revertTargets.length > 1 ? <span className="cnt"> · {revertTargets.length}</span> : null}
                  </button>
                )}
                {showNoAi && (
                  <button
                    className="vfx-menu-item"
                    disabled={running}
                    onClick={() => go(t("ws.imgMenuTranslateFree"), () => setOcrUrls(targets))}
                  >
                    {t("ws.imgMenuTranslateFree")}
                    {cnt}
                  </button>
                )}

                <div className="vfx-menu-sec">{t("ws.imgMenuPrompt")}</div>
                <div className="vfx-menu-prompt">
                  <textarea
                    rows={3}
                    autoFocus
                    value={imgMenuPrompt}
                    onChange={(e) => setImgMenuPrompt(e.target.value)}
                    placeholder={t("ws.imgMenuPromptPh")}
                  />
                  <button
                    className="btn primary sm"
                    disabled={running || !imgMenuPrompt.trim() || !hasManusKey}
                    onClick={() => {
                      const p = imgMenuPrompt;
                      go(t("ws.imgMenuPromptRun"), () => runEditUrls(targets, p));
                    }}
                  >
                    {t("ws.imgMenuPromptRun")}
                    {bulk ? ` · ${targets.length}` : ""}
                  </button>
                  <p className="tiny muted" style={{ margin: 0 }}>
                    {bulk ? t("ws.imgMenuPromptHintBulk", { n: targets.length }) : t("ws.imgMenuPromptHint")}
                  </p>
                </div>

                <div className="vfx-menu-sec">{t("ws.imgMenuTools")}</div>
                <button
                  className="vfx-menu-item"
                  onClick={() => {
                    close();
                    window.open(absoluteUrl(imgMenu.url), "_blank", "noopener,noreferrer");
                  }}
                >
                  {t("ws.imgMenuOpenTab")}
                </button>
                <button
                  className="vfx-menu-item"
                  onClick={() => {
                    close();
                    setEditUrl(imgMenu.url);
                  }}
                >
                  {t("ws.advancedEditor")}
                  {bulk ? <span className="cnt"> · 1</span> : null}
                </button>
                <button
                  className="vfx-menu-item"
                  onClick={() => go(t("ws.crop"), () => setCropUrls(targets))}
                >
                  {t("ws.crop")}
                  {cnt}
                </button>
                <button
                  className="vfx-menu-item"
                  onClick={() => go(t("ws.bulkEdit"), () => setBulkUrls(targets))}
                >
                  {t("ws.bulkEdit")}
                  {cnt}
                </button>
                {showNoAi && (
                  <button
                    className="vfx-menu-item"
                    onClick={() => go(t("ws.pvLocalAlt"), () => targets.forEach((u) => previewLocalAlt(u)))}
                  >
                    {t("ws.pvLocalAlt")}
                    {cnt}
                  </button>
                )}
                <button
                  className="vfx-menu-item"
                  onClick={() => {
                    close();
                    navigator.clipboard?.writeText(targets.map((u) => absoluteUrl(u)).join("\n"));
                    toast(bulk ? t("ws.linksCopiedN", { n: targets.length }) : t("ws.linksCopied"));
                  }}
                >
                  {t("ws.imgMenuCopyLink")}
                  {cnt}
                </button>
                <button
                  className="vfx-menu-item danger"
                  onClick={() => {
                    close();
                    setConfirmRemove(targets);
                  }}
                >
                  {t("ws.remove")}
                  {cnt}
                </button>
              </div>
            </>
          );
        })()}

      {bulkConfirm && (
        <div className="modal-scrim" onClick={() => setBulkConfirm(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("ws.bulkConfirmTitle", { n: bulkConfirm.n })}</h3>
            <p className="sub">{t("ws.bulkConfirmBody", { label: bulkConfirm.label, n: bulkConfirm.n })}</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setBulkConfirm(null)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  const r = bulkConfirm.run;
                  setBulkConfirm(null);
                  r();
                }}
              >
                {t("ws.bulkConfirmOk", { n: bulkConfirm.n })}
              </button>
            </div>
          </div>
        </div>
      )}

      {revertConfirm && (
        <div className="modal-scrim" onClick={() => setRevertConfirm(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("ws.revertConfirmTitle", { n: revertConfirm.length })}</h3>
            <p className="sub">{t("ws.revertConfirmBody", { n: revertConfirm.length })}</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setRevertConfirm(null)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  const urls = revertConfirm;
                  setRevertConfirm(null);
                  revertCleanup(urls);
                }}
              >
                {t("ws.revertBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ VIDEO STUDIO ============================ */
/* Product video: AI (Manus) editing with preset commands + own-logo + adjust
   defaults, AI alt text, and no-AI tools (poster-frame capture, mute / trim).
   "Uygula" persists the result to product.videoUrl in place. */
function VideoStudio({
  draft,
  videoUrl,
  hasManusKey,
  manusProfile,
  onSaved,
}: {
  draft: Draft;
  videoUrl: string;
  hasManusKey: boolean;
  manusProfile: "manus-1.6-lite" | "manus-1.6" | "manus-1.6-max";
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const vref = useRef<HTMLVideoElement | null>(null);
  const [busy, setBusy] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const jobRef = useRef<RunningJob<unknown> | null>(null);
  const [cmd, setCmd] = useState("");
  const [prof, setProf] = useState(manusProfile);
  const [logo, setLogo] = useState<LogoSpec | null>(null);
  const [alt, setAlt] = useState<string>(((draft.product as any)?.videoAlt as string) || "");
  const ops: ImageOp[] = ((draft.product as any)?.videoOps as ImageOp[]) || [];
  const dv = ((draft.product as any)?.videoDelivery as { trimStart?: number; trimEnd?: number; mute?: boolean }) || {};
  const [mute, setMute] = useState(!!dv.mute);
  const [trimS, setTrimS] = useState(dv.trimStart ?? 0);
  const [trimE, setTrimE] = useState(dv.trimEnd ?? 0);
  const [vlink, setVlink] = useState("");
  const [adding, setAdding] = useState(false);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [bakePct, setBakePct] = useState(0);
  const [engine, setEngine] = useState<"manus" | "claude">("manus");
  const [previewUrl, setPreviewUrl] = useState("");
  const previewBlob = useRef<Blob | null>(null);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  /* ---- no-AI browser toolkit state ---- */
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [adj, setAdj] = useState<Adjust>({ ...NEUTRAL_ADJUST });
  const [bw, setBw] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fps, setFps] = useState(30);
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [ratioId, setRatioId] = useState("orig");
  const [maxEdge, setMaxEdge] = useState(0);
  const [fmt, setFmt] = useState<"auto" | "mp4" | "webm">("mp4");
  const [bitrateM, setBitrateM] = useState(8);
  const [txtOn, setTxtOn] = useState(false);
  const [txt, setTxt] = useState<TextOverlay>({ value: "", xPct: 50, yPct: 88, sizePct: 7, color: "#ffffff", bg: "", bold: true });
  const [covers, setCovers] = useState<CoverRegion[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioName, setAudioName] = useState("");
  const [withLogo, setWithLogo] = useState(false);
  const [frameEvery, setFrameEvery] = useState(2);
  // real width/height ratio of the loaded video — the player box is pinned to it
  // so a square/portrait clip is shown at its true proportions with no black
  // side bars (CSS `object-fit:contain` letterboxing).
  const [vAspect, setVAspect] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [drawOn, setDrawOn] = useState(false);
  const [pending, setPending] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const adjChanged = JSON.stringify(adj) !== JSON.stringify(NEUTRAL_ADJUST);

  /* ---- tabbed no-AI panel: extra state ---- */
  const [nfxTab, setNfxTab] = useState<"video" | "ses" | "metin" | "tuval">("video");
  const [cropOn, setCropOn] = useState(false);
  const [cropRect, setCropRect] = useState<VBCropRect>({ xPct: 0, yPct: 0, wPct: 100, hPct: 100 });
  const [flipV, setFlipV] = useState(false);
  const [opacity, setOpacity] = useState(100);
  const [chromaOn, setChromaOn] = useState(false);
  const [chroma, setChroma] = useState<VBChromaKey>({ color: "#00ff00", tol: 18, soft: 12 });
  const [bgColor, setBgColor] = useState("#000000");
  const [bgBlur, setBgBlur] = useState(0);
  const [vol, setVol] = useState(100);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [vocalRm, setVocalRm] = useState(false);
  const [denoise, setDenoise] = useState(false);
  const [revAudio, setRevAudio] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [eqLow, setEqLow] = useState(0);
  const [eqMid, setEqMid] = useState(0);
  const [eqHigh, setEqHigh] = useState(0);
  /* drag-to-place logo + text on the preview */
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
  const [placeMode, setPlaceMode] = useState(false);
  const [cmpOrig, setCmpOrig] = useState(false); // hold-to-compare with the original
  const [dragTarget, setDragTarget] = useState<null | "logo" | "text">(null);
  const dragGrab = useRef({ dx: 0, dy: 0 });

  useEffect(() => setAlt(((draft.product as any)?.videoAlt as string) || ""), [draft.id, (draft.product as any)?.videoAlt]);
  useEffect(() => {
    if (!logo?.src) return void setLogoImg(null);
    const i = new Image();
    i.onload = () => setLogoImg(i);
    i.src = logo.src;
  }, [logo?.src]);
  // force the logo into the bake the moment one is added
  useEffect(() => {
    if (logo?.src) setWithLogo(true);
  }, [logo?.src]);
  // keep wrapSize current so the preview logo box matches the bake math exactly
  useEffect(() => {
    setVAspect(null); // new clip — re-measure its real ratio on loadedmetadata
    const el = wrapRef.current;
    if (!el) return;
    const upd = () => setWrapSize({ w: el.clientWidth, h: el.clientHeight });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [videoUrl]);

  const loadLogoImg = () =>
    logo?.src && !logoImg
      ? new Promise<HTMLImageElement | null>((res) => {
          const i = new Image();
          i.onload = () => { setLogoImg(i); res(i); };
          i.onerror = () => res(null);
          i.src = logo.src;
        })
      : Promise.resolve(logoImg);

  const logoRect = () =>
    logo && logoImg && wrapSize.w
      ? computeLogoRect(logo, logoImg.naturalWidth || 1, logoImg.naturalHeight || 1, wrapSize.w, wrapSize.h)
      : null;

  /** Keep the text OFF the logo (percentage space). */
  function nudgeTextOffLogo(x: TextOverlay): TextOverlay {
    const lr = logoRect();
    if (!lr || !wrapSize.w) return x;
    const lcx = ((lr.x + lr.w / 2) / wrapSize.w) * 100;
    const lcy = ((lr.y + lr.h / 2) / wrapSize.h) * 100;
    const lwp = (lr.w / wrapSize.w) * 100;
    const lhp = (lr.h / wrapSize.h) * 100;
    const twp = Math.max(12, x.value.length * x.sizePct * 0.52);
    const thp = x.sizePct * 1.7;
    const pad = 3;
    const hit = Math.abs(x.xPct - lcx) < (twp + lwp) / 2 + pad && Math.abs(x.yPct - lcy) < (thp + lhp) / 2 + pad;
    if (!hit) return x;
    const above = lcy - lhp / 2 - thp / 2 - pad;
    const below = lcy + lhp / 2 + thp / 2 + pad;
    const ny = lcy > 50 ? Math.max(thp / 2 + 2, above) : Math.min(100 - thp / 2 - 2, below);
    return { ...x, yPct: +ny.toFixed(1) };
  }

  function overlayPct(e: React.PointerEvent) {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  }
  function startPlaceDrag(which: "logo" | "text", e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = overlayPct(e);
    let cx = 50;
    let cy = 50;
    if (which === "logo") {
      if (logo?.xPct != null && logo?.yPct != null) {
        cx = logo.xPct;
        cy = logo.yPct;
      } else {
        const lr = logoRect();
        if (lr && wrapSize.w) {
          cx = ((lr.x + lr.w / 2) / wrapSize.w) * 100;
          cy = ((lr.y + lr.h / 2) / wrapSize.h) * 100;
        }
      }
    } else {
      const d = nudgeTextOffLogo(txt);
      cx = d.xPct;
      cy = d.yPct;
    }
    dragGrab.current = { dx: p.x - cx, dy: p.y - cy };
    setDragTarget(which);
  }
  function movePlaceDrag(e: React.PointerEvent) {
    if (!dragTarget) return;
    const p = overlayPct(e);
    const nx = Math.min(100, Math.max(0, p.x - dragGrab.current.dx));
    const ny = Math.min(100, Math.max(0, p.y - dragGrab.current.dy));
    if (dragTarget === "logo") setLogo((l) => (l ? { ...l, xPct: +nx.toFixed(1), yPct: +ny.toFixed(1) } : l));
    else setTxt((x) => ({ ...x, xPct: +nx.toFixed(1), yPct: +ny.toFixed(1) }));
  }
  function endPlaceDrag() {
    if (dragTarget === "text") setTxt((x) => nudgeTextOffLogo(x));
    setDragTarget(null);
  }
  useEffect(() => {
    let off = false;
    setMeta(null);
    if (!videoUrl) return;
    probeVideo(videoUrl)
      .then((m) => !off && setMeta(m))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [videoUrl]);

  /** Output W×H the bake will produce, mirroring bakeVideo's own math. */
  const outDims = useMemo(() => {
    if (!meta || !meta.width) return null;
    const cw0 = cropOn ? (meta.width * cropRect.wPct) / 100 : meta.width;
    const ch0 = cropOn ? (meta.height * cropRect.hPct) / 100 : meta.height;
    const swap = rotate === 90 || rotate === 270;
    const sw = swap ? ch0 : cw0;
    const sh = swap ? cw0 : ch0;
    const r = CROP_PRESETS.find((c) => c.id === ratioId)?.ratio ?? null;
    const tr = r && r > 0 ? r : sw / sh;
    let cw = sw;
    let ch = sh;
    if (sw / sh > tr) cw = Math.round(sh * tr);
    else ch = Math.round(sw / tr);
    let ow = cw;
    let oh = ch;
    const me = maxEdge || Math.max(cw, ch);
    if (Math.max(cw, ch) > me) {
      const k = me / Math.max(cw, ch);
      ow = Math.max(2, Math.round((cw * k) / 2) * 2);
      oh = Math.max(2, Math.round((ch * k) / 2) * 2);
    } else {
      ow = Math.max(2, Math.round(ow / 2) * 2);
      oh = Math.max(2, Math.round(oh / 2) * 2);
    }
    return { ow, oh };
  }, [meta, rotate, ratioId, maxEdge, cropOn, cropRect.wPct, cropRect.hPct]);

  const outDur = useMemo(() => {
    if (!meta) return 0;
    const s = Math.min(Math.max(0, trimS || 0), Math.max(0, meta.duration - 0.05));
    const e = trimE && trimE > s ? Math.min(trimE, meta.duration) : meta.duration;
    return Math.max(0, (e - s) / Math.max(0.1, speed));
  }, [meta, trimS, trimE, speed]);
  const estMb = outDur > 0 ? ((bitrateM * 1_000_000 * outDur) / 8 / 1_048_576).toFixed(1) : "0";

  /** NO AI: re-encode the video in the browser with the logo baked in. */
  async function bakeLogo() {
    if (!logo) return toast(t("editor.logoNotReady"), "err");
    setBusy("logo");
    setBakePct(0);
    try {
      const li = logoImg || (await loadLogoImg());
      if (!li) throw new Error(t("editor.logoNotReady"));
      const { blob, mime } = await bakeVideo(
        videoUrl,
        { logo, logoImg: li, mute, trimStart: trimS || 0, trimEnd: trimE || 0, audio: audioFx() },
        setBakePct,
      );
      const dataUrl: string = await new Promise((ok, no) => {
        const rd = new FileReader();
        rd.onload = () => ok(String(rd.result));
        rd.onerror = () => no(new Error("read"));
        rd.readAsDataURL(blob);
      });
      await api.setDraftVideo(draft.id, { dataUrl });
      await api.patchDraft(draft.id, {
        product: {
          ...(draft.product as any),
          videoOps: [...new Set([...(((draft.product as any)?.videoOps as string[]) || []), "logo"])],
        },
        label: t("video.logoLabel"),
      });
      // the logo is now burned INTO the video file — drop the live editing
      // overlay so the player shows the real result, not a <img> on top of it
      setLogo(null);
      setPlaceMode(false);
      setWithLogo(false);
      onSaved();
      toast(t("video.logoDone", { fmt: mime.includes("mp4") ? "MP4" : "WebM" }), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setBakePct(0);
    }
  }

  async function addVideoFile(file: File) {
    setAdding(true);
    try {
      const dataUrl: string = await new Promise((ok, no) => {
        const rd = new FileReader();
        rd.onload = () => ok(String(rd.result));
        rd.onerror = () => no(new Error("read"));
        rd.readAsDataURL(file);
      });
      await api.setDraftVideo(draft.id, { dataUrl });
      onSaved();
      toast(t("video.added"), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setAdding(false);
    }
  }
  async function addVideoLink() {
    const u = vlink.trim();
    if (!/^https?:\/\/.+/i.test(u)) return toast(t("video.badLink"), "err");
    setAdding(true);
    try {
      await api.setDraftVideo(draft.id, { url: u });
      setVlink("");
      onSaved();
      toast(t("video.added"), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setAdding(false);
    }
  }
  async function removeVideo() {
    setAdding(true);
    try {
      await api.clearDraftVideo(draft.id);
      onSaved();
      toast(t("video.removed"), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setAdding(false);
    }
  }

  const origVideo = (((draft.product as any)?.videoUrlOriginal as string) || "").trim();
  async function revertVideo() {
    if (!origVideo) return;
    setAdding(true);
    try {
      await api.patchDraft(draft.id, {
        product: { ...(draft.product as any), videoUrl: origVideo, videoOps: [] },
        label: t("video.revertLabel"),
      });
      onSaved();
      toast(t("video.reverted"), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setAdding(false);
    }
  }

  const AddVideoRow = (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <label className={"btn ghost sm" + (adding ? " disabled" : "")}>
        {videoUrl ? t("video.replaceFile") : t("video.addFile")}
        <input
          type="file"
          accept="video/*"
          hidden
          disabled={adding}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addVideoFile(f);
            e.currentTarget.value = "";
          }}
        />
      </label>
      <input
        value={vlink}
        onChange={(e) => setVlink(e.target.value)}
        placeholder={t("video.linkPh")}
        style={{ flex: "1 1 200px", minWidth: 160 }}
      />
      <button className="btn ghost sm" onClick={addVideoLink} disabled={adding || !vlink.trim()}>
        {adding ? <span className="spin" /> : t("video.addLink")}
      </button>
      {videoUrl && origVideo && origVideo !== videoUrl && (
        <button className="btn ghost sm" onClick={revertVideo} disabled={adding}>
          {t("video.revert")}
        </button>
      )}
      {videoUrl && (
        <button className="btn ghost sm" onClick={removeVideo} disabled={adding} style={{ color: "var(--danger, #e0322d)" }}>
          {t("video.remove")}
        </button>
      )}
    </div>
  );

  const PRESETS: { key: string; label: string; text: string }[] = [
    { key: "cn-remove", label: t("video.cmdCnRemove"), text: "Remove every Chinese / CJK caption and overlay text from the video. Do NOT touch the video itself, the product or the background — only erase the overlaid text, cleanly filling behind it to match the surrounding pixels for the whole clip." },
    { key: "cn-translate", label: t("video.cmdCnTranslate"), text: "Translate every Chinese / CJK overlay caption in the video into natural English, re-rendered in the same position, font, size and colour. Do NOT touch the video itself, the product or the background — only the overlay text changes. No Chinese may remain." },
    { key: "logo-remove", label: t("video.cmdLogoRemove"), text: "Remove the seller/brand logo or watermark from the video, cleanly filling behind it across the whole clip. Do NOT touch the video itself, the product or the background — only remove that logo." },
  ];

  async function runEdit() {
    if (!hasManusKey) return toast(t("ws.manusMissing"), "err");
    const instruction = cmd.trim();
    if (!instruction) return toast(t("video.needCmd"), "err");
    setBusy("ai");
    const r = editVideoJob({ draftId: draft.id, instruction, agentProfile: prof }, setJob);
    jobRef.current = r as RunningJob<unknown>;
    try {
      await r.promise;
      toast(t("video.editDone"), "ok");
      setCmd("");
      onSaved();
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setJob(null);
    }
  }

  async function runAlt(mode: "manus" | "claude" = "manus") {
    if (mode === "manus" && !hasManusKey) return toast(t("ws.manusMissing"), "err");
    setBusy(mode === "claude" ? "altc" : "alt");
    const r = videoAltJob({ draftId: draft.id, agentProfile: prof, mode }, setJob);
    jobRef.current = r as RunningJob<unknown>;
    try {
      const res = (await r.promise) as { alt: string };
      setAlt(res.alt);
      toast(t("video.altDone"), "ok");
      onSaved();
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setJob(null);
    }
  }

  /** Push a Claude edit-plan into the on-screen controls. */
  function applyPlanToState(pl: any) {
    if (pl.trimStart != null) setTrimS(pl.trimStart);
    if (pl.trimEnd != null) setTrimE(pl.trimEnd);
    if (pl.mute != null) setMute(pl.mute);
    if (pl.speed != null) setSpeed(pl.speed);
    if (pl.ratioId) setRatioId(pl.ratioId);
    if (pl.maxEdge != null) setMaxEdge(pl.maxEdge);
    if (pl.rotate != null) setRotate(pl.rotate);
    if (pl.flipH != null) setFlipH(pl.flipH);
    if (pl.flipV != null) setFlipV(pl.flipV);
    if (pl.opacity != null) setOpacity(pl.opacity);
    if (pl.adjustPreset) {
      const pr = ADJUST_PRESETS.find((x) => x.id === pl.adjustPreset);
      if (pr) {
        setAdj({ ...NEUTRAL_ADJUST, ...pr.adjust });
        setBw(pl.adjustPreset === "bw");
      }
    }
    if (pl.adjust) setAdj((a) => ({ ...a, ...pl.adjust }));
    if (pl.bw != null) setBw(pl.bw);
    if ("chroma" in pl) {
      if (pl.chroma) { setChroma(pl.chroma); setChromaOn(true); } else setChromaOn(false);
    }
    if (pl.bgColor) setBgColor(pl.bgColor);
    if (pl.bgBlur != null) setBgBlur(pl.bgBlur);
    if (pl.volume != null) setVol(pl.volume);
    if (pl.fadeIn != null) setFadeIn(pl.fadeIn);
    if (pl.fadeOut != null) setFadeOut(pl.fadeOut);
    if (pl.vocalRemove != null) setVocalRm(pl.vocalRemove);
    if (pl.denoise != null) setDenoise(pl.denoise);
    if (pl.reverse != null) setRevAudio(pl.reverse);
    if (pl.pitch != null) setPitch(pl.pitch);
    if (pl.eq) { setEqLow(pl.eq.low ?? 0); setEqMid(pl.eq.mid ?? 0); setEqHigh(pl.eq.high ?? 0); }
    if ("text" in pl) {
      if (pl.text && pl.text.value) { setTxt((x) => ({ ...x, ...pl.text })); setTxtOn(true); } else setTxtOn(false);
    }
    if (pl.covers) setCovers(pl.covers);
    if (pl.withLogo != null) setWithLogo(pl.withLogo);
  }

  /** Merge a Claude plan onto the current fx options (state-flush independent). */
  function mergePlanIntoOpts(base: BakeVideoOpts, pl: any): BakeVideoOpts {
    const o: BakeVideoOpts = { ...base };
    if (pl.trimStart != null) o.trimStart = pl.trimStart;
    if (pl.trimEnd != null) o.trimEnd = pl.trimEnd;
    if (pl.mute != null) o.mute = pl.mute;
    if (pl.speed != null) o.speed = pl.speed;
    if (pl.ratioId) o.ratio = CROP_PRESETS.find((c) => c.id === pl.ratioId)?.ratio ?? null;
    if (pl.maxEdge != null) o.maxEdge = pl.maxEdge || undefined;
    if (pl.rotate != null) o.rotate = pl.rotate;
    if (pl.flipH != null) o.flipH = pl.flipH;
    if (pl.flipV != null) o.flipV = pl.flipV;
    if (pl.opacity != null) o.opacity = pl.opacity;
    let a: Adjust = { ...NEUTRAL_ADJUST, ...(o.adjust ?? {}) };
    if (pl.adjustPreset) {
      const pr = ADJUST_PRESETS.find((x) => x.id === pl.adjustPreset);
      if (pr) a = { ...NEUTRAL_ADJUST, ...pr.adjust };
    }
    if (pl.adjust) a = { ...a, ...pl.adjust };
    o.adjust = a;
    if (pl.bw != null) o.bw = pl.bw || pl.adjustPreset === "bw";
    if ("chroma" in pl) o.chroma = pl.chroma;
    if (pl.bgColor) o.bgColor = pl.bgColor;
    if (pl.bgBlur != null) o.bgBlur = pl.bgBlur;
    const au = { ...(o.audio ?? {}) } as Record<string, unknown>;
    if (pl.volume != null) au.volume = pl.volume;
    if (pl.fadeIn != null) au.fadeIn = pl.fadeIn;
    if (pl.fadeOut != null) au.fadeOut = pl.fadeOut;
    if (pl.vocalRemove != null) au.vocalRemove = pl.vocalRemove;
    if (pl.denoise != null) au.denoise = pl.denoise;
    if (pl.reverse != null) au.reverse = pl.reverse;
    if (pl.pitch != null) au.pitch = pl.pitch;
    if (pl.eq) { au.eqLow = pl.eq.low ?? 0; au.eqMid = pl.eq.mid ?? 0; au.eqHigh = pl.eq.high ?? 0; }
    o.audio = au as BakeVideoOpts["audio"];
    if ("text" in pl) o.text = pl.text && pl.text.value ? pl.text : null;
    if (pl.covers) o.covers = pl.covers;
    if (pl.withLogo != null) {
      o.logo = pl.withLogo ? logo : null;
      o.logoImg = pl.withLogo ? logoImg : null;
    }
    return o;
  }

  /** Claude edits the video DIRECTLY: it returns an edit plan, we apply + bake it. */
  async function runClaudeEdit() {
    const request = cmd.trim();
    if (!request) return toast(t("video.needCmd"), "err");
    setBusy("claude");
    const r = videoPlanJob(
      { draftId: draft.id, request, meta: meta ? { width: meta.width, height: meta.height, duration: meta.duration } : undefined },
      setJob,
    );
    jobRef.current = r as RunningJob<unknown>;
    try {
      const { plan, summary } = (await r.promise) as { plan: Record<string, unknown>; summary: string };
      if (!plan || Object.keys(plan).length === 0) {
        toast(t("video.claudeNoOp"), "err");
        return;
      }
      applyPlanToState(plan);
      const opts = mergePlanIntoOpts(fxOpts(), plan);
      await bakeAll("apply", opts);
      toast(summary || t("video.claudeEditDone"), "ok");
      setCmd("");
    } catch (e) {
      if (!(e instanceof JobCancelled)) toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setJob(null);
    }
  }

  async function saveAlt() {
    await api.patchDraft(draft.id, { product: { ...(draft.product as any), videoAlt: alt }, label: t("video.altLabel") });
    onSaved();
  }
  async function saveDelivery(next: Partial<{ trimStart: number; trimEnd: number; mute: boolean }>) {
    const vd = { trimStart: trimS, trimEnd: trimE, mute, ...next };
    await api.patchDraft(draft.id, { product: { ...(draft.product as any), videoDelivery: vd }, label: t("video.deliveryLabel") });
    onSaved();
  }

  async function capturePoster() {
    const v = vref.current;
    if (!v) return;
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth || 1280;
      c.height = v.videoHeight || 720;
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      const { url } = await api.saveMedia(c.toDataURL("image/jpeg", 0.92));
      const fresh = await api.draft(draft.id);
      const next = [...(fresh.product?.images ?? []), { url, role: "gallery" as const, ops: ["format" as ImageOp] }];
      await api.patchDraft(draft.id, { product: { ...fresh.product, images: next }, label: t("video.posterLabel") });
      onSaved();
      toast(t("video.posterDone"), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  /* ---------- no-AI browser toolkit ---------- */

  function resetFx() {
    setAdj({ ...NEUTRAL_ADJUST });
    setBw(false);
    setSpeed(1);
    setFps(30);
    setRotate(0);
    setFlipH(false);
    setFlipV(false);
    setRatioId("orig");
    setMaxEdge(0);
    setFmt("mp4");
    setBitrateM(8);
    setTxtOn(false);
    setTxt({ value: "", xPct: 50, yPct: 88, sizePct: 7, color: "#ffffff", bg: "", bold: true, font: "" });
    setCovers([]);
    setAudioUrl("");
    setAudioName("");
    setWithLogo(false);
    setDrawOn(false);
    setPending(null);
    setCropOn(false);
    setCropRect({ xPct: 0, yPct: 0, wPct: 100, hPct: 100 });
    setOpacity(100);
    setChromaOn(false);
    setChroma({ color: "#00ff00", tol: 18, soft: 12 });
    setBgColor("#000000");
    setBgBlur(0);
    setVol(100);
    setFadeIn(0);
    setFadeOut(0);
    setVocalRm(false);
    setDenoise(false);
    setRevAudio(false);
    setPitch(0);
    setEqLow(0);
    setEqMid(0);
    setEqHigh(0);
  }

  const audioFx = () => ({
    volume: vol,
    fadeIn,
    fadeOut,
    vocalRemove: vocalRm,
    denoise,
    reverse: revAudio,
    pitch,
    eqLow,
    eqMid,
    eqHigh,
  });
  const audioFxOn = () =>
    vol !== 100 || fadeIn > 0 || fadeOut > 0 || vocalRm || denoise || revAudio || pitch !== 0 || eqLow !== 0 || eqMid !== 0 || eqHigh !== 0;

  function fxOpts(): BakeVideoOpts {
    return {
      trimStart: trimS || 0,
      trimEnd: trimE || 0,
      mute,
      fps,
      speed,
      ratio: CROP_PRESETS.find((c) => c.id === ratioId)?.ratio ?? null,
      cropRect: cropOn ? cropRect : null,
      maxEdge: maxEdge || undefined,
      rotate,
      flipH,
      flipV,
      opacity,
      adjust: adj,
      bw,
      chroma: chromaOn ? chroma : null,
      bgColor,
      bgBlur,
      logo: withLogo ? logo : null,
      logoImg: withLogo ? logoImg : null,
      text: txtOn && txt.value.trim() ? txt : null,
      covers,
      audioUrl: audioUrl || undefined,
      audio: audioFx(),
      bitrate: Math.round(bitrateM * 1_000_000),
      format: fmt,
    };
  }
  function fxOpsTags(): string[] {
    const s = new Set<string>((((draft.product as any)?.videoOps as string[]) || []).slice());
    s.add("format");
    if (withLogo && logo) s.add("logo");
    if (covers.length || (chromaOn && chroma.color)) s.add("erase");
    if (
      bw ||
      (txtOn && txt.value.trim()) ||
      speed !== 1 ||
      rotate !== 0 ||
      flipH ||
      flipV ||
      adjChanged ||
      audioUrl ||
      cropOn ||
      opacity !== 100 ||
      bgBlur > 0 ||
      audioFxOn()
    )
      s.add("edit");
    return [...s];
  }

  async function detachAudio() {
    if (!videoUrl) return;
    setBusy("audio");
    try {
      const blob = await renderAudioWav(videoUrl, audioFx(), {
        trimStart: trimS || 0,
        trimEnd: trimE || 0,
        speed,
      });
      downloadBlob(blob, `${slugify(draft.title || "video", 40)}-audio.wav`);
      toast(t("video.nfx.audioDetached"), "ok");
    } catch (e) {
      toast(t("video.nfx.audioDetachFail"), "err");
    } finally {
      setBusy("");
    }
  }

  async function saveBakedBlob(blob: Blob, fmtLabel: string) {
    const dataUrl: string = await new Promise((ok, no) => {
      const rd = new FileReader();
      rd.onload = () => ok(String(rd.result));
      rd.onerror = () => no(new Error("read"));
      rd.readAsDataURL(blob);
    });
    await api.setDraftVideo(draft.id, { dataUrl });
    await api.patchDraft(draft.id, {
      product: { ...(draft.product as any), videoOps: fxOpsTags() },
      label: t("video.nfx.baked", { fmt: fmtLabel }),
    });
    onSaved();
    toast(t("video.nfx.baked", { fmt: fmtLabel }), "ok");
  }

  /** Apply the already-rendered preview blob without re-encoding. */
  async function keepPreview() {
    if (!previewBlob.current) return;
    setBusy("bake");
    try {
      const isMp4 = (previewBlob.current.type || "").includes("mp4");
      await saveBakedBlob(previewBlob.current, isMp4 ? "MP4" : "WebM");
      setPreviewUrl("");
      previewBlob.current = null;
      if (withLogo || logo) {
        setLogo(null);
        setPlaceMode(false);
        setWithLogo(false);
      }
      if (!isMp4) toast(t("video.nfx.webmWarn"), "info");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  async function bakeAll(mode: "apply" | "download" | "preview", override?: BakeVideoOpts) {
    if (!videoUrl) return;
    setBusy("bake");
    setBakePct(0);
    try {
      const opts = override ?? fxOpts();
      // FORCE the logo in: if it's wanted but its <img> hasn't loaded yet, load it now
      if (withLogo && logo && !opts.logo) opts.logo = logo;
      if (opts.logo && !opts.logoImg) opts.logoImg = await loadLogoImg();
      const { blob, mime } = await bakeVideo(videoUrl, opts, setBakePct);
      const isMp4 = mime.includes("mp4");
      const fmtLabel = isMp4 ? "MP4" : "WebM";
      if (mode === "preview") {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewBlob.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        toast(t("video.nfx.previewReady", { fmt: fmtLabel }), "ok");
      } else if (mode === "download") {
        downloadBlob(blob, `${slugify(draft.title || "video", 40)}-edit.${isMp4 ? "mp4" : "webm"}`);
        toast(t("video.nfx.dlDone", { fmt: fmtLabel }), "ok");
      } else {
        await saveBakedBlob(blob, fmtLabel);
        setPreviewUrl("");
        previewBlob.current = null;
        // anything baked in is now part of the file — clear the live overlays
        // (logo / text) so the player shows the real, burned-in result
        if (opts.logo) {
          setLogo(null);
          setPlaceMode(false);
          setWithLogo(false);
        }
        if (!isMp4) toast(t("video.nfx.webmWarn"), "info");
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setBakePct(0);
    }
  }

  async function extractFrames() {
    if (!videoUrl || frameEvery <= 0) return;
    setBusy("frames");
    setBakePct(0);
    try {
      const m = meta ?? (await probeVideo(videoUrl));
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.src = videoUrl;
      await new Promise<void>((ok, no) => {
        v.onloadedmetadata = () => ok();
        v.onerror = () => no(new Error(t("video.nfx.framesNone")));
      });
      const c = document.createElement("canvas");
      c.width = v.videoWidth || 1280;
      c.height = v.videoHeight || 720;
      const g = c.getContext("2d")!;
      const s = Math.min(Math.max(0, trimS || 0), Math.max(0, m.duration - 0.05));
      const e = trimE && trimE > s ? Math.min(trimE, m.duration) : m.duration;
      const times: number[] = [];
      for (let x = s; x < e - 0.01 && times.length < 60; x += frameEvery) times.push(x);
      const urls: string[] = [];
      for (let i = 0; i < times.length; i++) {
        await new Promise<void>((ok) => {
          v.onseeked = () => ok();
          v.currentTime = times[i];
        });
        g.drawImage(v, 0, 0, c.width, c.height);
        const { url } = await api.saveMedia(c.toDataURL("image/jpeg", 0.9));
        urls.push(url);
        setBakePct(Math.round(((i + 1) / times.length) * 100));
      }
      if (!urls.length) return void toast(t("video.nfx.framesNone"), "err");
      const fresh = await api.draft(draft.id);
      const add = urls.map((url) => ({ url, role: "gallery" as const, ops: ["format" as ImageOp] }));
      await api.patchDraft(draft.id, {
        product: { ...fresh.product, images: [...(fresh.product?.images ?? []), ...add] },
        label: t("video.nfx.framesDone", { n: urls.length }),
      });
      onSaved();
      toast(t("video.nfx.framesDone", { n: urls.length }), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
      setBakePct(0);
    }
  }

  function pickAudio(file: File) {
    const rd = new FileReader();
    rd.onload = () => {
      setAudioUrl(String(rd.result));
      setAudioName(file.name);
    };
    rd.readAsDataURL(file);
  }

  function evtPct(e: React.PointerEvent) {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  }
  function coverDown(e: React.PointerEvent) {
    if (!drawOn) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = evtPct(e);
    setPending({ ...dragRef.current, w: 0, h: 0 });
  }
  function coverMove(e: React.PointerEvent) {
    if (!drawOn || !dragRef.current) return;
    const p = evtPct(e);
    const s = dragRef.current;
    setPending({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }
  function coverUp() {
    if (drawOn && pending && pending.w > 2 && pending.h > 2)
      setCovers((c) => [
        ...c,
        { xPct: +pending.x.toFixed(1), yPct: +pending.y.toFixed(1), wPct: +pending.w.toFixed(1), hPct: +pending.h.toFixed(1), mode: "blur" },
      ]);
    setPending(null);
    dragRef.current = null;
    setDrawOn(false);
  }

  /* ---- interactive crop rectangle on the video ---- */
  const cropDrag = useRef<null | { mode: string; sx: number; sy: number; r: VBCropRect }>(null);
  const cl01 = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  function cropDown(mode: string, e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = evtPct(e);
    cropDrag.current = { mode, sx: p.x, sy: p.y, r: { ...cropRect } };
  }
  function cropMove(e: React.PointerEvent) {
    if (!cropDrag.current) return;
    const p = evtPct(e);
    const { mode, sx, sy, r } = cropDrag.current;
    const dx = p.x - sx;
    const dy = p.y - sy;
    let { xPct, yPct, wPct, hPct } = r;
    if (mode === "move") {
      xPct = cl01(r.xPct + dx, 0, 100 - r.wPct);
      yPct = cl01(r.yPct + dy, 0, 100 - r.hPct);
    } else {
      if (mode.includes("e")) wPct = cl01(r.wPct + dx, 8, 100 - r.xPct);
      if (mode.includes("s")) hPct = cl01(r.hPct + dy, 8, 100 - r.yPct);
      if (mode.includes("w")) {
        const nx = cl01(r.xPct + dx, 0, r.xPct + r.wPct - 8);
        wPct = r.wPct + (r.xPct - nx);
        xPct = nx;
      }
      if (mode.includes("n")) {
        const ny = cl01(r.yPct + dy, 0, r.yPct + r.hPct - 8);
        hPct = r.hPct + (r.yPct - ny);
        yPct = ny;
      }
    }
    setCropRect({ xPct: +xPct.toFixed(1), yPct: +yPct.toFixed(1), wPct: +wPct.toFixed(1), hPct: +hPct.toFixed(1) });
  }
  function cropUp() {
    cropDrag.current = null;
  }
  const HANDLE_POS: Record<string, React.CSSProperties> = {
    nw: { left: -6, top: -6, cursor: "nwse-resize" },
    n: { left: "50%", top: -6, marginLeft: -6, cursor: "ns-resize" },
    ne: { right: -6, top: -6, cursor: "nesw-resize" },
    w: { left: -6, top: "50%", marginTop: -6, cursor: "ew-resize" },
    e: { right: -6, top: "50%", marginTop: -6, cursor: "ew-resize" },
    sw: { left: -6, bottom: -6, cursor: "nesw-resize" },
    s: { left: "50%", bottom: -6, marginLeft: -6, cursor: "ns-resize" },
    se: { right: -6, bottom: -6, cursor: "nwse-resize" },
  };

  /* ---- right-click tool menu over the video ---- */
  const nfxPanelRef = useRef<HTMLDivElement | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  function openCtxMenu(e: React.MouseEvent) {
    e.preventDefault();
    const w = 260;
    const x = Math.min(e.clientX, window.innerWidth - w - 8);
    const y = Math.min(e.clientY, window.innerHeight - 20);
    setCtxMenu({ x, y });
  }
  function jumpTab(tab: "video" | "ses" | "metin" | "tuval") {
    setNfxTab(tab);
    setCtxMenu(null);
    setTimeout(() => nfxPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [ctxMenu]);

  if (!videoUrl) {
    return (
      <div className="card vstudio">
        <div className="card-h">
          <h4>🎬 {t("video.title")}</h4>
        </div>
        <div className="card-b col" style={{ gap: 8 }}>
          <p className="tiny muted" style={{ margin: 0 }}>{t("video.emptyHint")}</p>
          {AddVideoRow}
        </div>
      </div>
    );
  }

  return (
    <div className="card vstudio">
      <div className="card-h">
        <h4>🎬 {t("video.title")}</h4>
        {ops.length > 0 && <span className="tag ops" style={{ position: "static" }}>{ops.map((o) => OP_LETTER[o]).join("+")}</span>}
        <div className="grow" style={{ flex: 1 }} />
        <a className="tiny" href={absoluteUrl(videoUrl)} target="_blank" rel="noreferrer">{t("video.open")}</a>
      </div>
      <div className="card-b col" style={{ gap: 12 }}>
        <div
          ref={wrapRef}
          style={{ position: "relative", lineHeight: 0 }}
          onContextMenu={openCtxMenu}
        >
          <video
            ref={vref}
            src={cmpOrig && origVideo ? origVideo : videoUrl}
            controls
            muted={mute}
            playsInline
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              if (el.videoWidth && el.videoHeight) setVAspect(el.videoWidth / el.videoHeight);
            }}
            style={{
              display: "block",
              width: "100%",
              // pin the player box to the clip's real ratio → the element is
              // exactly the video's shape, so `object-fit:contain` has nothing
              // to letterbox (no black side/top bars). Wrapper stays the same
              // box, so the cover/crop overlays keep aligning 1:1.
              aspectRatio: vAspect ? String(vAspect) : undefined,
              height: vAspect ? "auto" : undefined,
              borderRadius: 8,
              filter: cmpOrig ? undefined : (adjChanged ? adjustFilter(adj) : "") + (bw ? " grayscale(1)" : "") || undefined,
              opacity: !cmpOrig && opacity < 100 ? opacity / 100 : undefined,
              transform: cmpOrig
                ? undefined
                : `${rotate ? `rotate(${rotate}deg)` : ""} ${flipH ? "scaleX(-1)" : ""} ${flipV ? "scaleY(-1)" : ""}`.trim() ||
                  undefined,
            }}
          />
          {origVideo && origVideo !== videoUrl && (
            <button
              className="btn xs"
              style={{ position: "absolute", top: 8, left: 8, zIndex: 6, opacity: 0.92 }}
              onPointerDown={() => setCmpOrig(true)}
              onPointerUp={() => setCmpOrig(false)}
              onPointerLeave={() => setCmpOrig(false)}
              title={t("video.cmpHint")}
            >
              {cmpOrig ? t("video.cmpOn") : `◀ ${t("video.cmpBtn")}`}
            </button>
          )}
          <div
            onPointerDown={coverDown}
            onPointerMove={coverMove}
            onPointerUp={coverUp}
            style={{
              position: "absolute",
              inset: 0,
              cursor: drawOn ? "crosshair" : "default",
              pointerEvents: drawOn ? "auto" : "none",
            }}
          >
            {covers.map((c, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${c.xPct}%`,
                  top: `${c.yPct}%`,
                  width: `${c.wPct}%`,
                  height: `${c.hPct}%`,
                  outline: "2px solid #4ade80",
                  background: "rgba(74,222,128,.14)",
                  boxSizing: "border-box",
                }}
              >
                <span style={{ position: "absolute", top: -15, left: 0, fontSize: 10, lineHeight: 1, color: "#4ade80" }}>
                  {i + 1} · {t(`video.nfx.${c.mode}` as any)}
                </span>
              </div>
            ))}
            {pending && (
              <div
                style={{
                  position: "absolute",
                  left: `${pending.x}%`,
                  top: `${pending.y}%`,
                  width: `${pending.w}%`,
                  height: `${pending.h}%`,
                  outline: "2px dashed #4ade80",
                  background: "rgba(74,222,128,.18)",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>

          {/* interactive crop rectangle — drag the box / handles on the video */}
          {cropOn && (
            <div
              style={{ position: "absolute", inset: 0, pointerEvents: "auto", touchAction: "none" }}
              onPointerMove={cropMove}
              onPointerUp={cropUp}
            >
              <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: `${cropRect.yPct}%`, background: "rgba(0,0,0,.5)" }} />
              <div style={{ position: "absolute", left: 0, top: `${cropRect.yPct}%`, width: `${cropRect.xPct}%`, height: `${cropRect.hPct}%`, background: "rgba(0,0,0,.5)" }} />
              <div style={{ position: "absolute", left: `${cropRect.xPct + cropRect.wPct}%`, top: `${cropRect.yPct}%`, right: 0, height: `${cropRect.hPct}%`, background: "rgba(0,0,0,.5)" }} />
              <div style={{ position: "absolute", left: 0, top: `${cropRect.yPct + cropRect.hPct}%`, right: 0, bottom: 0, background: "rgba(0,0,0,.5)" }} />
              <div
                onPointerDown={(e) => cropDown("move", e)}
                style={{
                  position: "absolute",
                  left: `${cropRect.xPct}%`,
                  top: `${cropRect.yPct}%`,
                  width: `${cropRect.wPct}%`,
                  height: `${cropRect.hPct}%`,
                  border: "1.5px solid #fff",
                  boxShadow: "0 0 0 1px rgba(0,0,0,.55)",
                  cursor: "move",
                  boxSizing: "border-box",
                }}
              >
                {(["nw", "n", "ne", "w", "e", "sw", "s", "se"] as const).map((h) => (
                  <div
                    key={h}
                    onPointerDown={(e) => cropDown(h, e)}
                    style={{
                      position: "absolute",
                      width: 12,
                      height: 12,
                      background: "#fff",
                      border: "1px solid #333",
                      borderRadius: 2,
                      ...HANDLE_POS[h],
                    }}
                  />
                ))}
                <span style={{ position: "absolute", top: -16, left: 0, fontSize: 10, lineHeight: 1, color: "#fff", textShadow: "0 1px 2px #000" }}>
                  {Math.round(cropRect.wPct)}×{Math.round(cropRect.hPct)}%
                </span>
              </div>
            </div>
          )}

          {/* live logo overlay — exact bake geometry; drag to reposition in place mode */}
          {logo && logoImg && wrapSize.w > 0 && (() => {
            const lr = computeLogoRect(logo, logoImg.naturalWidth || 1, logoImg.naturalHeight || 1, wrapSize.w, wrapSize.h);
            return (
              <img
                src={logo.src}
                alt=""
                onPointerDown={placeMode ? (e) => startPlaceDrag("logo", e) : undefined}
                onPointerMove={placeMode ? movePlaceDrag : undefined}
                onPointerUp={placeMode ? endPlaceDrag : undefined}
                style={{
                  position: "absolute",
                  left: lr.x,
                  top: lr.y,
                  width: lr.w,
                  height: lr.h,
                  opacity: (logo.opacity ?? 100) / 100,
                  pointerEvents: placeMode ? "auto" : "none",
                  cursor: placeMode ? "move" : "default",
                  outline: placeMode ? "2px dashed #4ade80" : "none",
                  outlineOffset: 2,
                  touchAction: "none",
                }}
              />
            );
          })()}

          {/* live text/badge overlay — never on top of the logo; drag in place mode */}
          {txtOn && txt.value.trim() && (() => {
            const d = nudgeTextOffLogo(txt);
            return (
              <div
                onPointerDown={placeMode ? (e) => startPlaceDrag("text", e) : undefined}
                onPointerMove={placeMode ? movePlaceDrag : undefined}
                onPointerUp={placeMode ? endPlaceDrag : undefined}
                style={{
                  position: "absolute",
                  left: `${d.xPct}%`,
                  top: `${d.yPct}%`,
                  transform: "translate(-50%,-50%)",
                  fontSize: `min(${txt.sizePct}vw, ${txt.sizePct * 3.2}px)`,
                  fontFamily: txt.font ? `'${txt.font}', Inter, system-ui, sans-serif` : undefined,
                  fontWeight: txt.bold === false ? 600 : 800,
                  color: txt.color || "#fff",
                  background: txt.bg || "transparent",
                  padding: txt.bg ? "0.15em 0.5em" : 0,
                  borderRadius: txt.bg ? "0.35em" : 0,
                  textShadow: "0 1px 3px rgba(0,0,0,.55)",
                  whiteSpace: "nowrap",
                  pointerEvents: placeMode ? "auto" : "none",
                  cursor: placeMode ? "move" : "default",
                  outline: placeMode ? "2px dashed #4ade80" : "none",
                  outlineOffset: 3,
                  touchAction: "none",
                  lineHeight: 1.2,
                }}
              >
                {txt.value}
              </div>
            );
          })()}
        </div>
        {ops.length > 0 && (
          <p className="tiny" style={{ margin: 0, color: "var(--ok, #16794a)" }}>
            ✓ {t("video.resultNote", { ops: ops.map((o) => OP_LETTER[o]).join("+") })}
          </p>
        )}
        {AddVideoRow}

        {/* AI editing — Manus edits the video; Claude drafts / refines the command */}
        <div className="qc-grp">
          <h5>{t("video.aiTitle")}</h5>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <div className="chips">
              {(["manus", "claude"] as const).map((e) => (
                <button key={e} className={"chip" + (engine === e ? " active" : "")} onClick={() => setEngine(e)}>
                  {e === "manus" ? "Manus" : "Claude"}
                </button>
              ))}
            </div>
            <span className="tiny muted">
              {engine === "manus" ? t("video.engManus") : t("video.engClaude")}
            </span>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {PRESETS.map((p) => (
              <button key={p.key} className="btn ghost sm" onClick={() => setCmd((c) => (c ? c + "\n" : "") + p.text)}>
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder={engine === "claude" ? t("video.goalPh") : t("video.cmdPh")}
            style={{ minHeight: 70 }}
          />
          {engine === "manus" && (
            <label className="field" style={{ width: 160 }}>
              {t("ws.manusProfile")}
              <select value={prof} onChange={(e) => setProf(e.target.value as any)}>
                <option value="manus-1.6-lite">manus-1.6-lite</option>
                <option value="manus-1.6">manus-1.6</option>
                <option value="manus-1.6-max">manus-1.6-max</option>
              </select>
            </label>
          )}
          {engine === "manus" ? (
            <button className="btn primary sm" onClick={runEdit} disabled={!!busy || !hasManusKey}>
              {busy === "ai" ? <span className="spin" /> : t("video.apply")}
            </button>
          ) : (
            <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn primary sm" onClick={runClaudeEdit} disabled={!!busy}>
                {busy === "claude" ? <span className="spin" /> : t("video.claudeEdit")}
              </button>
              <span className="tiny muted">{t("video.claudeEditHint")}</span>
            </div>
          )}
        </div>

        {/* logo — NO AI: baked into the video in the browser */}
        <div className="qc-grp">
          <h5>{t("video.logoTitle")}</h5>
          {!logo ? (
            <label className="btn ghost sm" style={{ alignSelf: "flex-start" }}>
              {t("video.addLogo")}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const rd = new FileReader();
                  rd.onload = () => setLogo({ src: String(rd.result), ...VIDEO_LOGO_DEFAULT });
                  rd.readAsDataURL(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          ) : (
            <>
              <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <button className={"btn sm" + (placeMode ? " primary" : " ghost")} onClick={() => setPlaceMode((p) => !p)}>
                  🎯 {t("video.placeOnVideo")}
                </button>
                {logo.xPct != null && (
                  <button className="btn ghost sm" onClick={() => setLogo({ ...logo, xPct: undefined, yPct: undefined })}>
                    {t("video.placeReset")}
                  </button>
                )}
                <span className="tiny muted">{t("video.placeHint")}</span>
              </div>
              <div className="anchor-grid">
                {Array.from({ length: 9 }).map((_, i) => (
                  <button
                    key={i}
                    className={logo.xPct == null && logo.anchor === i ? "active" : ""}
                    onClick={() => setLogo({ ...logo, anchor: i, xPct: undefined, yPct: undefined })}
                  />
                ))}
              </div>
              <Range label={t("editor.logoHeight")} value={logo.heightPx} min={4} max={200} onChange={(n) => setLogo({ ...logo, heightPx: n })} />
              <Range label={t("editor.logoOffset")} value={logo.offsetPx} min={0} max={80} onChange={(n) => setLogo({ ...logo, offsetPx: n })} />
              <Range label={t("editor.opacity")} value={logo.opacity} min={10} max={100} onChange={(n) => setLogo({ ...logo, opacity: n })} />
              <div className="row" style={{ gap: 6 }}>
                <button className="btn primary sm" onClick={bakeLogo} disabled={!!busy}>
                  {busy === "logo" ? <span className="spin" /> : t("video.logoApply")}
                </button>
                <button className="btn ghost sm" onClick={() => setLogo(null)}>{t("editor.removeLogo")}</button>
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>
                {t("video.logoHint")}
                {bakePct > 0 && bakePct < 100 ? ` · ${bakePct}%` : ""}
              </p>
            </>
          )}
        </div>

        {/* alt text */}
        <div className="qc-grp">
          <h5>{t("video.altTitle")}</h5>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <input value={alt} onChange={(e) => setAlt(e.target.value)} onBlur={saveAlt} placeholder={t("video.altPh")} style={{ flex: "1 1 160px" }} />
            <button className="btn ghost sm" onClick={() => runAlt("claude")} disabled={!!busy}>
              {busy === "altc" ? <span className="spin" /> : t("video.altClaude")}
            </button>
            <button className="btn ghost sm" onClick={() => runAlt("manus")} disabled={!!busy || !hasManusKey}>
              {busy === "alt" ? <span className="spin" /> : t("video.altAi")}
            </button>
          </div>
        </div>

        {/* no-AI tools — full in-browser video editor, zero AI (tabbed like a real editor) */}
        <div className="qc-grp" ref={nfxPanelRef}>
          <h5>{t("video.noAiTitle")}</h5>

          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn ghost sm" onClick={capturePoster}>{t("video.poster")}</button>
            <button className="btn ghost sm" onClick={resetFx}>{t("video.nfx.reset")}</button>
            {meta && (
              <span className="tiny muted">
                {t("video.nfx.source", { w: meta.width, h: meta.height, dur: meta.duration.toFixed(1) })}
              </span>
            )}
          </div>

          <div className="chips" style={{ marginTop: 2 }}>
            {(["video", "ses", "metin", "tuval"] as const).map((k) => (
              <button key={k} className={"chip" + (nfxTab === k ? " active" : "")} onClick={() => setNfxTab(k)}>
                {t(`video.tab.${k}` as any)}
              </button>
            ))}
          </div>

          {/* ============================ VIDEO ============================ */}
          {nfxTab === "video" && (
            <div className="col" style={{ gap: 10, marginTop: 4 }}>
              {/* trim */}
              <div className="col" style={{ gap: 6 }}>
                <b className="tiny">{t("video.nfx.trimGroup")}</b>
                <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {t("video.trimStart")}
                    <input type="number" min={0} step="0.1" value={trimS} onChange={(e) => setTrimS(+e.target.value)} onBlur={() => saveDelivery({})} style={{ width: 60 }} />
                  </label>
                  <button className="btn ghost sm" onClick={() => { const c = +(vref.current?.currentTime ?? 0).toFixed(2); setTrimS(c); saveDelivery({ trimStart: c }); }}>
                    {t("video.nfx.setStart")}
                  </button>
                  <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {t("video.trimEnd")}
                    <input type="number" min={0} step="0.1" value={trimE} onChange={(e) => setTrimE(+e.target.value)} onBlur={() => saveDelivery({})} style={{ width: 60 }} />
                  </label>
                  <button className="btn ghost sm" onClick={() => { const c = +(vref.current?.currentTime ?? 0).toFixed(2); setTrimE(c); saveDelivery({ trimEnd: c }); }}>
                    {t("video.nfx.setEnd")}
                  </button>
                  <button className="btn ghost sm" onClick={() => { setTrimS(0); setTrimE(0); saveDelivery({ trimStart: 0, trimEnd: 0 }); }}>
                    {t("video.nfx.clearTrim")}
                  </button>
                </div>
              </div>

              {/* speed */}
              <Range label={`${t("video.nfx.speed")} ×${speed.toFixed(2)}`} value={Math.round(speed * 100)} min={10} max={1600} onChange={(n) => setSpeed(n / 100)} />

              {/* crop (freeform) — drag the box on the video, sliders fine-tune */}
              <div className="col" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="checkbox" checked={cropOn} onChange={(e) => setCropOn(e.target.checked)} />
                    <b>{t("video.nfx.cropFree")}</b>
                  </label>
                  {cropOn && (cropRect.xPct !== 0 || cropRect.yPct !== 0 || cropRect.wPct !== 100 || cropRect.hPct !== 100) && (
                    <button className="btn ghost sm" onClick={() => setCropRect({ xPct: 0, yPct: 0, wPct: 100, hPct: 100 })}>
                      {t("video.nfx.cropReset")}
                    </button>
                  )}
                </div>
                {cropOn && (
                  <>
                    <p className="tiny muted" style={{ margin: 0 }}>{t("video.nfx.cropDragHint")}</p>
                    <Range label={t("video.nfx.cropX")} value={cropRect.xPct} min={0} max={90} onChange={(n) => setCropRect((r) => ({ ...r, xPct: Math.min(n, 100 - r.wPct) }))} />
                    <Range label={t("video.nfx.cropY")} value={cropRect.yPct} min={0} max={90} onChange={(n) => setCropRect((r) => ({ ...r, yPct: Math.min(n, 100 - r.hPct) }))} />
                    <Range label={t("video.nfx.cropW")} value={cropRect.wPct} min={10} max={100} onChange={(n) => setCropRect((r) => ({ ...r, wPct: Math.min(n, 100 - r.xPct) }))} />
                    <Range label={t("video.nfx.cropH")} value={cropRect.hPct} min={10} max={100} onChange={(n) => setCropRect((r) => ({ ...r, hPct: Math.min(n, 100 - r.yPct) }))} />
                  </>
                )}
              </div>

              {/* geometry */}
              <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="field" style={{ width: 150 }}>
                  {t("video.nfx.ratio")}
                  <select value={ratioId} onChange={(e) => setRatioId(e.target.value)}>
                    {CROP_PRESETS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <label className="field" style={{ width: 130 }}>
                  {t("video.nfx.res")}
                  <select value={maxEdge} onChange={(e) => setMaxEdge(+e.target.value)}>
                    <option value={0}>{t("video.nfx.resAuto")}</option>
                    <option value={720}>720p</option>
                    <option value={1080}>1080p</option>
                    <option value={1440}>1440p</option>
                    <option value={1920}>1920p</option>
                  </select>
                </label>
                <label className="field" style={{ width: 100 }}>
                  {t("video.nfx.rotate")}
                  <select value={rotate} onChange={(e) => setRotate(+e.target.value as 0 | 90 | 180 | 270)}>
                    <option value={0}>0°</option>
                    <option value={90}>90°</option>
                    <option value={180}>180°</option>
                    <option value={270}>270°</option>
                  </select>
                </label>
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 6 }}>
                  <input type="checkbox" checked={flipH} onChange={(e) => setFlipH(e.target.checked)} />
                  {t("video.nfx.flip")}
                </label>
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 6 }}>
                  <input type="checkbox" checked={flipV} onChange={(e) => setFlipV(e.target.checked)} />
                  {t("video.nfx.flipV")}
                </label>
              </div>

              <Range label={t("video.nfx.opacity")} value={opacity} min={0} max={100} onChange={setOpacity} />

              {/* colour */}
              <Collapsible title={t("video.nfx.look")} storageKey="vfx-look" defaultOpen={false}>
                <div className="chips">
                  {ADJUST_PRESETS.map((p) => (
                    <button key={p.id} className="chip" title={t("ws.applyPreset")} onClick={() => { setAdj({ ...NEUTRAL_ADJUST, ...p.adjust }); setBw(p.id === "bw"); }}>
                      {lang === "tr" ? p.tr : p.en}
                    </button>
                  ))}
                </div>
                <Range label={t("editor.brightness")} value={adj.brightness} min={40} max={180} onChange={(n) => setAdj((a) => ({ ...a, brightness: n }))} />
                <Range label={t("editor.contrast")} value={adj.contrast} min={40} max={200} onChange={(n) => setAdj((a) => ({ ...a, contrast: n }))} />
                <Range label={t("editor.saturation")} value={adj.saturate} min={0} max={220} onChange={(n) => setAdj((a) => ({ ...a, saturate: n }))} />
                <Range label={t("ws.adjExposure")} value={adj.exposure ?? 0} min={-100} max={100} onChange={(n) => setAdj((a) => ({ ...a, exposure: n }))} />
                <Range label={t("ws.adjWarmth")} value={adj.warmth ?? 0} min={-100} max={100} onChange={(n) => setAdj((a) => ({ ...a, warmth: n }))} />
                <Range label={t("ws.adjTint")} value={adj.tint ?? 0} min={-100} max={100} onChange={(n) => setAdj((a) => ({ ...a, tint: n }))} />
                <Range label={t("ws.adjSharpen")} value={adj.sharpen ?? 0} min={0} max={100} onChange={(n) => setAdj((a) => ({ ...a, sharpen: n }))} />
                <Range label={t("ws.adjVignette")} value={adj.vignette ?? 0} min={0} max={100} onChange={(n) => setAdj((a) => ({ ...a, vignette: n }))} />
                <Range label={t("ws.adjBlur")} value={adj.blur ?? 0} min={0} max={12} onChange={(n) => setAdj((a) => ({ ...a, blur: n }))} />
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={bw} onChange={(e) => setBw(e.target.checked)} />
                  {t("video.nfx.bw")}
                </label>
              </Collapsible>

              {/* chroma key */}
              <Collapsible title={t("video.nfx.chroma")} storageKey="vfx-chroma" defaultOpen={false}>
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={chromaOn} onChange={(e) => setChromaOn(e.target.checked)} />
                  <b>{t("video.nfx.chroma")}</b>
                </label>
                {chromaOn && (
                  <>
                    <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {t("video.nfx.chromaColor")}
                      <input type="color" value={chroma.color} onChange={(e) => setChroma((c) => ({ ...c, color: e.target.value }))} />
                    </label>
                    <Range label={t("video.nfx.chromaTol")} value={chroma.tol} min={0} max={100} onChange={(n) => setChroma((c) => ({ ...c, tol: n }))} />
                    <Range label={t("video.nfx.chromaSoft")} value={chroma.soft} min={0} max={100} onChange={(n) => setChroma((c) => ({ ...c, soft: n }))} />
                    <p className="tiny muted" style={{ margin: 0 }}>{t("video.nfx.chromaHint")}</p>
                  </>
                )}
              </Collapsible>

              {/* region covers */}
              <Collapsible title={t("video.nfx.covers")} storageKey="vfx-covers" defaultOpen={false}>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button className={"btn sm" + (drawOn ? " primary" : " ghost")} onClick={() => setDrawOn((d) => !d)}>
                    {t("video.nfx.draw")}
                  </button>
                  <button className="btn ghost sm" onClick={() => setCovers((c) => [...c, { xPct: 35, yPct: 35, wPct: 30, hPct: 20, mode: "blur" }])}>
                    {t("video.nfx.addCover")}
                  </button>
                </div>
                {drawOn && <p className="tiny muted" style={{ margin: 0 }}>{t("video.nfx.drawOn")}</p>}
                {covers.length === 0 ? (
                  <p className="tiny muted" style={{ margin: 0 }}>{t("video.nfx.coverEmpty")}</p>
                ) : (
                  covers.map((c, i) => (
                    <div key={i} className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="tiny" style={{ width: 16 }}>{i + 1}</span>
                      <select value={c.mode} onChange={(e) => setCovers((cs) => cs.map((x, j) => (j === i ? { ...x, mode: e.target.value as CoverRegion["mode"] } : x)))}>
                        <option value="blur">{t("video.nfx.blur")}</option>
                        <option value="pixelate">{t("video.nfx.pixelate")}</option>
                        <option value="fill">{t("video.nfx.fill")}</option>
                      </select>
                      {c.mode === "fill" && (
                        <input type="color" value={c.fill || "#000000"} onChange={(e) => setCovers((cs) => cs.map((x, j) => (j === i ? { ...x, fill: e.target.value } : x)))} />
                      )}
                      <span className="tiny muted">{Math.round(c.xPct)},{Math.round(c.yPct)} · {Math.round(c.wPct)}×{Math.round(c.hPct)}%</span>
                      <button className="btn ghost sm" onClick={() => setCovers((cs) => cs.filter((_, j) => j !== i))}>{t("video.nfx.delete")}</button>
                    </div>
                  ))
                )}
              </Collapsible>

              {/* frames to gallery */}
              <Collapsible title={t("video.nfx.frames")} storageKey="vfx-frames" defaultOpen={false}>
                <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {t("video.nfx.frameEvery")}
                    <input type="number" min={0.2} step="0.2" value={frameEvery} onChange={(e) => setFrameEvery(+e.target.value)} style={{ width: 60 }} />
                  </label>
                  <button className="btn ghost sm" onClick={extractFrames} disabled={!!busy || frameEvery <= 0}>
                    {busy === "frames" ? <span className="spin" /> : t("video.nfx.extract")}
                  </button>
                  {busy === "frames" && bakePct > 0 && <span className="tiny muted">{bakePct}%</span>}
                </div>
              </Collapsible>
            </div>
          )}

          {/* ============================= SES ============================= */}
          {nfxTab === "ses" && (
            <div className="col" style={{ gap: 10, marginTop: 4 }}>
              <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={mute} onChange={(e) => { setMute(e.target.checked); saveDelivery({ mute: e.target.checked }); }} />
                {t("video.mute")}
              </label>
              <Range label={`${t("video.nfx.volume")} ${vol}%`} value={vol} min={0} max={400} onChange={setVol} />
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {t("video.nfx.fadeIn")}
                  <input type="number" min={0} step="0.1" value={fadeIn} onChange={(e) => setFadeIn(Math.max(0, +e.target.value))} style={{ width: 56 }} />
                </label>
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {t("video.nfx.fadeOut")}
                  <input type="number" min={0} step="0.1" value={fadeOut} onChange={(e) => setFadeOut(Math.max(0, +e.target.value))} style={{ width: 56 }} />
                </label>
              </div>
              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={vocalRm} onChange={(e) => setVocalRm(e.target.checked)} />
                  {t("video.nfx.vocalRemove")}
                </label>
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} />
                  {t("video.nfx.denoise")}
                </label>
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={revAudio} onChange={(e) => setRevAudio(e.target.checked)} />
                  {t("video.nfx.reverse")}
                </label>
              </div>
              <Range label={`${t("video.nfx.pitch")} ${pitch > 0 ? "+" : ""}${pitch}`} value={pitch} min={-12} max={12} onChange={setPitch} />
              <div className="col" style={{ gap: 6 }}>
                <b className="tiny">{t("video.nfx.eq")}</b>
                <Range label={t("video.nfx.eqLow")} value={eqLow} min={-18} max={18} onChange={setEqLow} />
                <Range label={t("video.nfx.eqMid")} value={eqMid} min={-18} max={18} onChange={setEqMid} />
                <Range label={t("video.nfx.eqHigh")} value={eqHigh} min={-18} max={18} onChange={setEqHigh} />
              </div>
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label className="btn ghost sm">
                  {t("video.nfx.replaceAudio")}
                  <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickAudio(f); e.currentTarget.value = ""; }} />
                </label>
                {audioName && <span className="tiny muted">🎵 {audioName}</span>}
                {audioUrl && <button className="btn ghost sm" onClick={() => { setAudioUrl(""); setAudioName(""); }}>{t("video.nfx.audioClear")}</button>}
                <button className="btn ghost sm" onClick={detachAudio} disabled={!!busy}>
                  {busy === "audio" ? <span className="spin" /> : t("video.nfx.detachAudio")}
                </button>
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>{t("video.nfx.audioNote2")}</p>
            </div>
          )}

          {/* ============================ METIN ============================ */}
          {nfxTab === "metin" && (
            <div className="col" style={{ gap: 8, marginTop: 4 }}>
              <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={txtOn} onChange={(e) => setTxtOn(e.target.checked)} />
                {t("video.nfx.textOn")}
              </label>
              {txtOn && (
                <>
                  <input value={txt.value} onChange={(e) => setTxt((x) => ({ ...x, value: e.target.value }))} placeholder={t("video.nfx.textPh")} />
                  <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <label className="field" style={{ width: 150 }}>
                      {t("video.nfx.font")}
                      <select value={txt.font || ""} onChange={(e) => setTxt((x) => ({ ...x, font: e.target.value }))}>
                        <option value="">Inter</option>
                        {NFX_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                      </select>
                    </label>
                    <label className="tiny" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {t("video.nfx.textColor")}
                      <input type="color" value={txt.color} onChange={(e) => setTxt((x) => ({ ...x, color: e.target.value }))} />
                    </label>
                    <label className="field" style={{ width: 120 }}>
                      {t("video.nfx.textBg")}
                      <select value={txt.bg || ""} onChange={(e) => setTxt((x) => ({ ...x, bg: e.target.value || undefined }))}>
                        <option value="">{t("video.nfx.textBgNone")}</option>
                        <option value="rgba(0,0,0,.55)">■ {t("video.nfx.blur")}</option>
                        <option value="#e0322d">■ red</option>
                        <option value="#111111">■ black</option>
                        <option value="#ffffff">■ white</option>
                      </select>
                    </label>
                    <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 6 }}>
                      <input type="checkbox" checked={txt.bold !== false} onChange={(e) => setTxt((x) => ({ ...x, bold: e.target.checked }))} />
                      bold
                    </label>
                  </div>
                  <Range label={t("video.nfx.textSize")} value={txt.sizePct} min={2} max={20} onChange={(n) => setTxt((x) => ({ ...x, sizePct: n }))} />
                  {/* placement — same as the logo: anchor grid + drag on the video */}
                  <div className="col" style={{ gap: 4 }}>
                    <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <b className="tiny">{t("video.nfx.textPlace")}</b>
                      <button className={"btn sm" + (placeMode ? " primary" : " ghost")} onClick={() => setPlaceMode((p) => !p)}>
                        🎯 {t("video.placeOnVideo")}
                      </button>
                    </div>
                    <div className="anchor-grid">
                      {TXT_ANCHORS.map(([ax, ay], i) => (
                        <button
                          key={i}
                          className={Math.abs(txt.xPct - ax) < 2 && Math.abs(txt.yPct - ay) < 2 ? "active" : ""}
                          onClick={() => setTxt((x) => nudgeTextOffLogo({ ...x, xPct: ax, yPct: ay }))}
                        />
                      ))}
                    </div>
                  </div>
                  <Range label={t("video.nfx.textX")} value={txt.xPct} min={0} max={100} onChange={(n) => setTxt((x) => nudgeTextOffLogo({ ...x, xPct: n }))} />
                  <Range label={t("video.nfx.textY")} value={txt.yPct} min={0} max={100} onChange={(n) => setTxt((x) => nudgeTextOffLogo({ ...x, yPct: n }))} />
                  <p className="tiny muted" style={{ margin: 0 }}>{t("video.nfx.textNoLogo")}</p>
                </>
              )}
            </div>
          )}

          {/* ============================ TUVAL ============================ */}
          {nfxTab === "tuval" && (
            <div className="col" style={{ gap: 10, marginTop: 4 }}>
              <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {t("video.nfx.bgColor")}
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
              </label>
              <Range label={t("video.nfx.bgBlur")} value={bgBlur} min={0} max={40} onChange={setBgBlur} />
              <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => { setRatioId("orig"); setCropOn(false); setMaxEdge(0); }}>
                {t("video.nfx.fitContent")}
              </button>
              <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="field" style={{ width: 110 }}>
                  {t("video.nfx.format")}
                  <select value={fmt} onChange={(e) => setFmt(e.target.value as "auto" | "mp4" | "webm")}>
                    <option value="mp4">MP4</option>
                    <option value="auto">auto</option>
                    <option value="webm">WebM</option>
                  </select>
                </label>
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {t("video.nfx.bitrate")}
                  <input type="number" min={1} max={40} step="1" value={bitrateM} onChange={(e) => setBitrateM(+e.target.value)} style={{ width: 52 }} />
                </label>
                <label className="field" style={{ width: 80 }}>
                  {t("video.nfx.fps")}
                  <select value={fps} onChange={(e) => setFps(+e.target.value)}>
                    <option value={24}>24</option>
                    <option value={25}>25</option>
                    <option value={30}>30</option>
                    <option value={60}>60</option>
                  </select>
                </label>
                <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 6 }}>
                  <input type="checkbox" checked={withLogo} onChange={(e) => setWithLogo(e.target.checked)} disabled={!logo} />
                  {t("video.nfx.withLogo")}
                </label>
              </div>
            </div>
          )}

          {/* shared footer: output + preview + bake (sticky) */}
          <div className="vfx-actionbar">
            {outDims && (
              <span className="tiny muted">{t("video.nfx.est", { w: outDims.ow, h: outDims.oh, mb: estMb })}</span>
            )}
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <button className="btn sm" onClick={() => bakeAll("preview")} disabled={!!busy}>
                {busy === "bake" && !previewBlob.current ? <span className="spin" /> : `👁 ${t("video.nfx.previewShow")}`}
              </button>
              <button className="btn primary sm" onClick={() => bakeAll("apply")} disabled={!!busy}>
                {busy === "bake" ? <span className="spin" /> : t("video.nfx.bake")}
              </button>
              <button className="btn ghost sm" onClick={() => bakeAll("download")} disabled={!!busy}>
                {t("video.nfx.download")}
              </button>
              {busy === "bake" && bakePct > 0 && <span className="tiny muted">{bakePct}%</span>}
            </div>

            {previewUrl && (
              <div className="col" style={{ gap: 6, border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
                <b className="tiny" style={{ color: "var(--ok)" }}>👁 {t("video.nfx.previewLabel")}</b>
                <video src={previewUrl} controls playsInline style={{ width: "100%", maxHeight: 300, borderRadius: 6, background: "#000" }} />
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button className="btn primary sm" onClick={keepPreview} disabled={!!busy}>
                    {t("video.nfx.previewKeep")}
                  </button>
                  <button
                    className="btn ghost sm"
                    onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(""); previewBlob.current = null; }}
                    disabled={!!busy}
                  >
                    {t("common.close")}
                  </button>
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>{t("video.nfx.previewExact")}</p>
              </div>
            )}
          </div>

          <p className="tiny muted" style={{ margin: 0 }}>{t("video.noAiHint")}</p>
          <p className="tiny muted" style={{ margin: 0 }}>{t("video.nfx.previewNote")}</p>
        </div>

        {job && <JobProgress job={job} onCancel={() => jobRef.current?.cancel()} />}
        <p className="tiny muted" style={{ margin: 0 }}>{t("video.deliverNote")}</p>
        <p className="tiny muted" style={{ margin: 0 }}>{t("video.ctxHint")}</p>
      </div>

      {ctxMenu && (
        <>
          <div className="vfx-menu-scrim" onPointerDown={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div className="vfx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onContextMenu={(e) => e.preventDefault()}>
            <div className="vfx-menu-h">{t("video.noAiTitle")}</div>

            <div className="vfx-menu-sec">{t("video.ctxTabs")}</div>
            <div className="vfx-menu-row">
              {(["video", "ses", "metin", "tuval"] as const).map((k) => (
                <button key={k} className={"chip" + (nfxTab === k ? " active" : "")} onClick={() => jumpTab(k)}>
                  {t(`video.tab.${k}` as any)}
                </button>
              ))}
            </div>

            <div className="vfx-menu-sec">{t("video.ctxToggles")}</div>
            {[
              [t("video.mute"), mute, () => { setMute(!mute); saveDelivery({ mute: !mute }); }],
              [t("video.nfx.bw"), bw, () => setBw((v) => !v)],
              [t("video.nfx.cropFree"), cropOn, () => setCropOn((v) => !v)],
              [t("video.nfx.textOn"), txtOn, () => setTxtOn((v) => !v)],
              [t("video.placeOnVideo"), placeMode, () => setPlaceMode((v) => !v)],
            ].map(([label, on, fn], i) => (
              <button key={i} className="vfx-menu-item" onClick={() => { (fn as () => void)(); }}>
                <span>{label as string}</span>
                <span className="vfx-check">{on ? "✓" : ""}</span>
              </button>
            ))}

            <div className="vfx-menu-sec">{t("video.nfx.look")}</div>
            <div className="vfx-menu-row">
              {ADJUST_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className="chip"
                  onClick={() => { setAdj({ ...NEUTRAL_ADJUST, ...p.adjust }); setBw(p.id === "bw"); }}
                >
                  {lang === "tr" ? p.tr : p.en}
                </button>
              ))}
            </div>

            <div className="vfx-menu-sec">{t("video.ctxTools")}</div>
            <button className="vfx-menu-item" onClick={() => { setCtxMenu(null); capturePoster(); }}>{t("video.poster")}</button>
            <button className="vfx-menu-item" onClick={() => { jumpTab("video"); }}>{t("video.nfx.frames")}</button>
            <button className="vfx-menu-item" onClick={() => { setCtxMenu(null); detachAudio(); }} disabled={!!busy}>{t("video.nfx.detachAudio")}</button>

            <div className="vfx-menu-sec">{t("video.nfx.output")}</div>
            <button className="vfx-menu-item" onClick={() => { setCtxMenu(null); bakeAll("preview"); }} disabled={!!busy}>👁 {t("video.nfx.previewShow")}</button>
            <button className="vfx-menu-item primary" onClick={() => { setCtxMenu(null); bakeAll("apply"); }} disabled={!!busy}>✓ {t("video.nfx.bake")}</button>
            <button className="vfx-menu-item" onClick={() => { setCtxMenu(null); bakeAll("download"); }} disabled={!!busy}>{t("video.nfx.download")}</button>
            <button className="vfx-menu-item danger" onClick={() => { resetFx(); setCtxMenu(null); }}>{t("video.nfx.reset")}</button>
          </div>
        </>
      )}
    </div>
  );
}

/* Small range row: label + value on one line, slider full-width below. */
function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="rangerow">
      <span>{label}</span>
      <span className="mono">{value}</span>
      <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

/* Live preview of one image at its true aspect ratio (no crop / no stretch) with
   the current filigran + adjust + logo baked in, plus per-image tools:
   OCR translate, no-AI alt text, and a compact inline generative erase.
   (AI translate / AI alt text moved to the bulk-AI block above.) */
function PreviewImage({
  url,
  alt,
  ops,
  watermark,
  adjust,
  logo,
  logoImg,
  busy,
  showNoAi,
  onAlt,
  onCopy,
  onOcr,
  onLocalAlt,
  onErased,
}: {
  url: string;
  alt: string;
  ops: ImageOp[];
  watermark: string;
  adjust: Adjust;
  logo: LogoSpec | null;
  logoImg: HTMLImageElement | null;
  busy: boolean;
  showNoAi: boolean;
  onAlt: (v: string) => void;
  onCopy: (link: string) => void;
  onOcr: () => void;
  onLocalAlt: () => void;
  onErased: (newUrl: string) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [erase, setErase] = useState(false);
  useEffect(() => {
    let dead = false;
    loadImage(url)
      .then((img) => {
        if (dead || !ref.current) return;
        const out = renderImage(img, {
          preset: { id: "prev", label: "", ratio: null, maxEdge: 720 },
          watermark,
          adjust,
          logo,
          logoImg,
        });
        const c = ref.current;
        c.width = out.width;
        c.height = out.height;
        c.getContext("2d")!.drawImage(out, 0, 0);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [url, watermark, adjust, logo, logoImg]);
  const link = absoluteUrl(url);
  return (
    <div className="preview-item">
      <div className="preview-canvas-wrap">
        <canvas ref={ref} />
        {ops.length > 0 && (
          <span className="tag ops" title={ops.map((o) => t(OP_KEY[o] as any)).join(", ")}>
            {ops.map((o) => OP_LETTER[o]).join("+")}
          </span>
        )}
      </div>
      <div className="preview-tools">
        {showNoAi && (
          <>
            <button className="btn ghost sm" onClick={onOcr} disabled={busy}>{t("ws.pvOcr")}</button>
            <button className="btn ghost sm" onClick={onLocalAlt} disabled={busy}>{t("ws.pvLocalAlt")}</button>
          </>
        )}
        <button className={"btn ghost sm" + (erase ? " active" : "")} onClick={() => setErase((v) => !v)}>{t("ws.pvErase")}</button>
      </div>
      {erase && (
        <InlineErase
          url={url}
          onDone={(nu) => {
            setErase(false);
            onErased(nu);
          }}
        />
      )}
      <input className="preview-alt" value={alt} placeholder={t("ws.altPh")} onChange={(e) => onAlt(e.target.value)} />
      <div className="preview-link">
        <span className="mono" title={link}>{link}</span>
        <button className="cpy" title={t("common.copy")} onClick={() => onCopy(link)}>⧉</button>
      </div>
    </div>
  );
}

/* Compact per-image generative erase — brush over the area (or auto-detect the
   text/marks inside it), local inpaint, replace that one image. No API / no cost. */
function InlineErase({ url, onDone }: { url: string; onDone: (newUrl: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [mode, setMode] = useState<"detect" | "brush">("detect");
  const [brush, setBrush] = useState(9);
  const [sens, setSens] = useState(45);
  const [grain, setGrain] = useState(2);
  const [busy, setBusy] = useState(false);
  const [maskV, setMaskV] = useState(0);
  const src = useRef<HTMLCanvasElement | null>(null);
  const mask = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const disp = useRef<HTMLCanvasElement | null>(null);
  const k = useRef(1);
  const drawing = useRef(false);
  const DISP_W = 300;

  function redraw() {
    const s = src.current;
    const d = disp.current;
    if (!s || !d) return;
    k.current = DISP_W / s.width;
    d.width = DISP_W;
    d.height = Math.round(s.height * k.current);
    const dx = d.getContext("2d")!;
    dx.drawImage(s, 0, 0, d.width, d.height);
    const tmp = document.createElement("canvas");
    tmp.width = d.width;
    tmp.height = d.height;
    const tx = tmp.getContext("2d")!;
    tx.drawImage(mask.current, 0, 0, d.width, d.height);
    tx.globalCompositeOperation = "source-in";
    tx.fillStyle = "#5a31f4";
    tx.fillRect(0, 0, d.width, d.height);
    dx.globalAlpha = 0.5;
    dx.drawImage(tmp, 0, 0);
    dx.globalAlpha = 1;
  }

  useEffect(() => {
    let dead = false;
    loadImage(proxied(url.split("#dup-")[0]))
      .then((im) => {
        if (dead) return;
        const c = document.createElement("canvas");
        c.width = im.naturalWidth || im.width;
        c.height = im.naturalHeight || im.height;
        c.getContext("2d")!.drawImage(im, 0, 0);
        src.current = c;
        const m = mask.current;
        m.width = c.width;
        m.height = c.height;
        m.getContext("2d")!.clearRect(0, 0, m.width, m.height);
        redraw();
      })
      .catch((e) => toast((e as Error).message, "err"));
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(redraw, [maskV]);

  function paint(e: React.PointerEvent) {
    const s = src.current;
    if (!s) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / k.current;
    const y = (e.clientY - r.top) / k.current;
    const mx = mask.current.getContext("2d")!;
    mx.fillStyle = "#fff";
    mx.beginPath();
    mx.arc(x, y, (brush / 100) * s.width, 0, Math.PI * 2);
    mx.fill();
    setMaskV((v) => v + 1);
  }
  function clearMask() {
    mask.current.getContext("2d")!.clearRect(0, 0, mask.current.width, mask.current.height);
    setMaskV((v) => v + 1);
  }
  function hasMask() {
    const m = mask.current.getContext("2d")!.getImageData(0, 0, mask.current.width, mask.current.height).data;
    for (let i = 3; i < m.length; i += 40) if (m[i] > 40) return true;
    return false;
  }

  async function run() {
    const s = src.current;
    if (!s) return;
    if (!hasMask()) return toast(t("editor.aiEraseSelect"), "err");
    setBusy(true);
    try {
      if (mode === "detect") refineMaskToMarks(s, mask.current, sens);
      const out = await localInpaint(s, mask.current, { grain: grain / 100 });
      const { url: saved } = await api.saveMedia(out.toDataURL("image/png"));
      toast(t("editor.aiEraseDone"), "ok");
      onDone(saved);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-erase">
      <div className="chips">
        <button className={"chip" + (mode === "detect" ? " active" : "")} onClick={() => setMode("detect")}>
          {t("editor.eraseDetect")}
        </button>
        <button className={"chip" + (mode === "brush" ? " active" : "")} onClick={() => setMode("brush")}>
          {t("editor.eraseBrush")}
        </button>
      </div>
      <canvas
        ref={disp}
        style={{ width: "100%", display: "block", borderRadius: 6, cursor: "crosshair", touchAction: "none" }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drawing.current = true;
          paint(e);
        }}
        onPointerMove={(e) => drawing.current && paint(e)}
        onPointerUp={() => (drawing.current = false)}
      />
      <Range label={t("editor.brush")} value={brush} min={1} max={25} onChange={setBrush} />
      <Range label={t("editor.detectSens")} value={sens} min={1} max={99} onChange={setSens} />
      <Range label={t("editor.grain")} value={grain} min={0} max={40} onChange={setGrain} />
      <div className="row">
        <button className="btn primary sm" onClick={run} disabled={busy}>
          {busy ? <span className="spin" /> : t("editor.aiEraseRun")}
        </button>
        <button className="btn ghost sm" onClick={clearMask} disabled={busy}>
          {t("ws.pvEraseClear")}
        </button>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        {mode === "detect" ? t("editor.detectHint") : t("editor.aiEraseHint")}
      </p>
    </div>
  );
}

/* One image card: thumb + editable alt text + short link with copy. Alt text and
   link appear under EVERY image, everywhere. */
function ThumbCard({
  im,
  selected,
  bulkCount,
  ops,
  canLeft,
  canRight,
  onMove,
  onReorderDrop,
  onPick,
  onEdit,
  onRemove,
  onDragStart,
  onAlt,
  onCopyLink,
  onContextMenu,
}: {
  im: ProductImage;
  selected: boolean;
  /** >0 when clicking delete removes this many selected images at once */
  bulkCount: number;
  ops: ImageOp[];
  canLeft: boolean;
  canRight: boolean;
  onMove: (dir: -1 | 1) => void;
  onReorderDrop: (fromUrl: string) => void;
  onPick: (e: React.MouseEvent) => void;
  onEdit: () => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onAlt: (alt: string) => void;
  onCopyLink: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(im.alt ?? "");
  const [over, setOver] = useState(false);
  useEffect(() => setVal(im.alt ?? ""), [im.alt]);
  const fullLink = absoluteUrl(im.url);

  return (
    <div
      className={"thumbwrap" + (over ? " dragover" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation(); // reorder, don't let the zone treat it as a role change
        setOver(false);
        const from = e.dataTransfer.getData("text/plain");
        if (from && from !== im.url) onReorderDrop(from);
      }}
    >
      <div
        className={"thumb" + (selected ? " sel" : "")}
        draggable
        onDragStart={onDragStart}
        onClick={onPick}
        onDoubleClick={onEdit}
        onContextMenu={onContextMenu}
        title={
          ops.length
            ? t("ws.opsTitle", { list: ops.map((o) => t(OP_KEY[o] as any)).join(", ") })
            : t("ws.titleTagEdit")
        }
      >
        <img src={proxied(im.url)} loading="lazy" alt="" />
        {ops.length > 0 && <span className="tag ops">{ops.map((o) => OP_LETTER[o]).join("+")}</span>}
        <button
          className={"rm" + (bulkCount > 0 ? " bulk" : "")}
          title={bulkCount > 0 ? t("ws.removeSelectedTitle", { n: bulkCount }) : t("ws.remove")}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          {bulkCount > 0 ? `× ${bulkCount}` : "×"}
        </button>
        <div className="ord">
          <button
            disabled={!canLeft}
            title={t("ws.moveLeft")}
            onClick={(e) => {
              e.stopPropagation();
              onMove(-1);
            }}
          >
            ◀
          </button>
          <button
            disabled={!canRight}
            title={t("ws.moveRight")}
            onClick={(e) => {
              e.stopPropagation();
              onMove(1);
            }}
          >
            ▶
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          className="cap-edit"
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (val !== (im.alt ?? "")) onAlt(val);
          }}
          placeholder={t("ws.altPh")}
        />
      ) : (
        <div
          className={"cap" + (val ? "" : " empty")}
          title={val || t("ws.altPh")}
          onClick={() => setEditing(true)}
        >
          {val || t("ws.altAdd")}
        </div>
      )}
      <div className="linkrow-mini" title={fullLink}>
        <span className="mono">{fullLink}</span>
        <button
          className="cpy"
          title={t("common.copy")}
          onClick={(e) => {
            e.stopPropagation();
            onCopyLink();
          }}
        >
          ⧉
        </button>
      </div>
    </div>
  );
}

/* Image-links panel: per-zone copy, copy-selected, thumbnail beside every link. */
function LinksPanel({
  byRole,
  sel,
  onToggle,
  onCopy,
}: {
  byRole: Record<Role, ProductImage[]>;
  sel: Set<string>;
  onToggle: (url: string, on: boolean) => void;
  onCopy: (text: string, msg?: string) => void;
}) {
  const { t } = useI18n();
  const clean = (u: string) => absoluteUrl(u);
  const all = [...byRole.gallery, ...byRole.variant, ...byRole.description];
  const selLinks = all.filter((im) => sel.has(im.url)).map((im) => clean(im.url));

  return (
    <div className="card" style={{ boxShadow: "none" }}>
      <div className="card-h" style={{ gap: 6, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 13 }}>{t("ws.links")}</h3>
        <div className="grow" style={{ flex: 1 }} />
        <button
          className="btn ghost sm"
          disabled={!selLinks.length}
          onClick={() => onCopy(selLinks.join("\n"), t("ws.linksCopiedN", { n: selLinks.length }))}
        >
          {t("ws.linksCopySel")} ({selLinks.length})
        </button>
        <button className="btn ghost sm" onClick={() => onCopy(all.map((im) => clean(im.url)).join("\n"))}>
          {t("ws.linksCopyAll")}
        </button>
      </div>
      <div className="card-b col" style={{ gap: 8 }}>
        {ZONES.map((z) =>
          byRole[z.role].length ? (
            <div key={z.role} className="col" style={{ gap: 3 }}>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <b className="tiny">
                  {t(z.key as any)} · {byRole[z.role].length}
                </b>
                <button
                  className="btn ghost sm"
                  style={{ padding: "1px 6px", fontSize: 10 }}
                  onClick={() =>
                    onCopy(
                      byRole[z.role].map((im) => clean(im.url)).join("\n"),
                      t("ws.linksCopiedZone", { zone: t(z.key as any) }),
                    )
                  }
                >
                  {t("ws.linksCopyZone")}
                </button>
              </div>
              {byRole[z.role].map((im) => (
                <label key={im.url} className="linkrow">
                  <input
                    type="checkbox"
                    checked={sel.has(im.url)}
                    onChange={(e) => onToggle(im.url, e.target.checked)}
                  />
                  <img className="linkthumb" src={proxied(im.url)} loading="lazy" alt="" />
                  <span className="mono" title={clean(im.url)}>
                    {clean(im.url)}
                  </span>
                  {im.originalUrl && im.originalUrl !== im.url && (
                    <span className="badge" title={absoluteUrl(im.originalUrl)}>
                      {t("ws.linksEdited")}
                    </span>
                  )}
                  <button
                    className="btn ghost sm"
                    style={{ padding: "1px 5px", fontSize: 10 }}
                    onClick={(e) => {
                      e.preventDefault();
                      onCopy(clean(im.url));
                    }}
                  >
                    {t("common.copy")}
                  </button>
                </label>
              ))}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
