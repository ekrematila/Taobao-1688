import {
  adjustFilter,
  applyPixelAdjust,
  computeLogoRect,
  drawLogo,
  NEUTRAL_ADJUST,
  type Adjust,
  type LogoSpec,
} from "./image";

export interface CoverRegion {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  mode: "blur" | "pixelate" | "fill";
  fill?: string;
}
export interface CropRect {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}
export interface ChromaKey {
  color: string; // "#rrggbb"
  tol: number; // 0..100 colour distance tolerance
  soft: number; // 0..100 edge feather
}
export interface TextOverlay {
  value: string;
  xPct: number; // 0..100 (centre of the text box)
  yPct: number;
  sizePct: number; // font size as % of height
  color: string;
  bg?: string; // optional pill background
  bold?: boolean;
  font?: string; // font family name
}
export interface AudioFx {
  volume?: number; // % 0..400 (100 = unchanged)
  fadeIn?: number; // s
  fadeOut?: number; // s
  vocalRemove?: boolean; // stereo centre-channel cancel (karaoke)
  denoise?: boolean; // rumble/hiss reduction
  reverse?: boolean; // play audio backwards
  pitch?: number; // semitones -12..12 (also nudges tempo)
  eqLow?: number; // dB -18..18  (low shelf ~120 Hz)
  eqMid?: number; // dB -18..18  (peaking ~1 kHz)
  eqHigh?: number; // dB -18..18  (high shelf ~6 kHz)
}

export interface BakeVideoOpts {
  trimStart?: number; // s
  trimEnd?: number; // s (0 = to end)
  mute?: boolean;
  fps?: number; // capture fps (default 30)
  speed?: number; // 0.1..16 playbackRate
  ratio?: number | null; // crop to aspect (centre); null = keep source
  cropRect?: CropRect | null; // freeform source crop, applied before ratio
  maxEdge?: number; // cap the longer output edge (px)
  rotate?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  opacity?: number; // 0..100 of the video layer (over bgColor)
  adjust?: Partial<Adjust>;
  bw?: boolean; // hard black & white
  chroma?: ChromaKey | null; // remove a colour → show bgColor / bgBlur through it
  bgColor?: string; // canvas backdrop for letterbox / opacity / chroma / rotate gaps
  bgBlur?: number; // 0..40 px — blurred cover of the source as the backdrop
  logo?: LogoSpec | null;
  logoImg?: HTMLImageElement | null;
  text?: TextOverlay | null;
  covers?: CoverRegion[];
  audioUrl?: string; // replace the audio with this track
  audio?: AudioFx;
  bitrate?: number; // video bits/s
  format?: "auto" | "mp4" | "webm";
}

export interface VideoMeta {
  width: number;
  height: number;
  duration: number;
}

export async function probeVideo(src: string): Promise<VideoMeta> {
  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  v.muted = true;
  v.preload = "metadata";
  v.src = src;
  await new Promise<void>((ok, no) => {
    v.onloadedmetadata = () => ok();
    v.onerror = () => no(new Error("Video yüklenemedi."));
  });
  return { width: v.videoWidth || 0, height: v.videoHeight || 0, duration: v.duration || 0 };
}

/** Best MediaRecorder mime this browser supports for a preference. */
export function bestRecorderMime(prefer: "auto" | "mp4" | "webm" = "auto"): string {
  const R = (window as any).MediaRecorder;
  if (!R || !R.isTypeSupported) return "";
  const mp4 = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"];
  const webm = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const list = prefer === "mp4" ? [...mp4, ...webm] : prefer === "webm" ? [...webm, ...mp4] : [...mp4, ...webm];
  for (const m of list) if (R.isTypeSupported(m)) return m;
  return "";
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const hexRgb = (h: string): [number, number, number] => {
  const s = (h || "#000000").replace("#", "");
  const n = parseInt(s.length === 3 ? s.replace(/(.)/g, "$1$1") : s.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/* --------------------------- audio processing --------------------------- */

/** Build the Web-Audio effect chain; returns the tail node to connect onward. */
function buildAudioChain(ac: AudioContext, srcNode: AudioNode, fx: AudioFx): { tail: AudioNode; fadeGain: GainNode } {
  let n: AudioNode = srcNode;

  if (fx.vocalRemove) {
    const sp = ac.createChannelSplitter(2);
    const negR = ac.createGain();
    negR.gain.value = -1;
    const mrg = ac.createChannelMerger(1);
    n.connect(sp);
    sp.connect(mrg, 0, 0); // L
    sp.connect(negR, 1);
    negR.connect(mrg, 0, 0); // + (−R)  →  L − R on a single channel
    n = mrg;
  }

  if (fx.denoise) {
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 85;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 15000;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -45;
    comp.knee.value = 30;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    n.connect(hp);
    hp.connect(lp);
    lp.connect(comp);
    n = comp;
  }

  const eq: [number | undefined, BiquadFilterType, number][] = [
    [fx.eqLow, "lowshelf", 120],
    [fx.eqMid, "peaking", 1000],
    [fx.eqHigh, "highshelf", 6000],
  ];
  for (const [db, type, freq] of eq) {
    if (!db) continue;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (type === "peaking") f.Q.value = 1;
    f.gain.value = clamp(db, -24, 24);
    n.connect(f);
    n = f;
  }

  const g = ac.createGain();
  n.connect(g);
  return { tail: g, fadeGain: g };
}

/** Apply volume + fade automation once playback is about to start. */
function applyFade(g: GainNode, ac: AudioContext, fx: AudioFx, durSec: number) {
  const vol = clamp((fx.volume ?? 100) / 100, 0, 4);
  const t0 = ac.currentTime;
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(fx.fadeIn ? 0.0001 : vol, t0);
  if (fx.fadeIn) g.gain.linearRampToValueAtTime(vol, t0 + Math.min(fx.fadeIn, durSec));
  if (fx.fadeOut && durSec > 0) {
    g.gain.setValueAtTime(vol, t0 + Math.max(0, durSec - fx.fadeOut));
    g.gain.linearRampToValueAtTime(0.0001, t0 + durSec);
  }
}

const hasAudioFx = (fx?: AudioFx) =>
  !!fx &&
  (fx.vocalRemove ||
    fx.denoise ||
    fx.reverse ||
    (fx.pitch ?? 0) !== 0 ||
    (fx.volume ?? 100) !== 100 ||
    (fx.fadeIn ?? 0) > 0 ||
    (fx.fadeOut ?? 0) > 0 ||
    (fx.eqLow ?? 0) !== 0 ||
    (fx.eqMid ?? 0) !== 0 ||
    (fx.eqHigh ?? 0) !== 0);

/* ----------------------------- WAV export ----------------------------- */

function audioBufferToWav(buf: AudioBuffer): Blob {
  const chans = buf.numberOfChannels;
  const len = buf.length * chans * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF");
  view.setUint32(4, len - 8, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, chans, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * chans * 2, true);
  view.setUint16(32, chans * 2, true);
  view.setUint16(34, 16, true);
  ws(36, "data");
  view.setUint32(40, len - 44, true);
  const data: Float32Array[] = [];
  for (let c = 0; c < chans; c++) data.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < chans; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** Render just the audio (trim + effects) to a downloadable WAV — "Sesi ayır". */
export async function renderAudioWav(
  src: string,
  fx: AudioFx,
  opts: { trimStart?: number; trimEnd?: number; speed?: number } = {},
): Promise<Blob> {
  const ab = await (await fetch(src)).arrayBuffer();
  const tmp = new (window.AudioContext || (window as any).webkitAudioContext)();
  const decoded = await tmp.decodeAudioData(ab.slice(0));
  tmp.close();
  const sr = decoded.sampleRate;
  const dur = decoded.duration;
  const s = clamp(opts.trimStart || 0, 0, Math.max(0, dur - 0.02));
  const e = opts.trimEnd && opts.trimEnd > s ? Math.min(opts.trimEnd, dur) : dur;
  const s0 = Math.floor(s * sr);
  const n = Math.max(1, Math.floor((e - s) * sr));
  const rate = clamp(opts.speed ?? 1, 0.1, 16);
  const outLen = Math.ceil(n / rate) + sr;
  const oac = new OfflineAudioContext(Math.min(2, decoded.numberOfChannels), outLen, sr);
  const trimmed = oac.createBuffer(decoded.numberOfChannels, n, sr);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const seg = decoded.getChannelData(c).slice(s0, s0 + n);
    if (fx.reverse) seg.reverse();
    trimmed.copyToChannel(seg, c);
  }
  const bs = oac.createBufferSource();
  bs.buffer = trimmed;
  bs.playbackRate.value = rate;
  if (fx.pitch) bs.detune.value = fx.pitch * 100;
  const { tail, fadeGain } = buildAudioChain(oac as unknown as AudioContext, bs, fx);
  tail.connect(oac.destination);
  applyFade(fadeGain, oac as unknown as AudioContext, fx, (e - s) / rate);
  bs.start();
  const rendered = await oac.startRendering();
  return audioBufferToWav(rendered);
}

/* ------------------------------ video bake ----------------------------- */

/**
 * Re-encode a video entirely in the browser — NO AI. Supports trim, speed,
 * freeform crop + crop-to-aspect, resize, rotate/flip, opacity, colour adjust,
 * B&W, chroma key, a blurred / solid backdrop, a logo overlay, a text overlay,
 * rectangular region covers (blur / pixelate / solid), and a full audio chain
 * (volume, fade in/out, EQ, vocal removal, denoise, reverse, pitch, or a
 * replacement track). Returns a Blob — MP4 where supported, otherwise WebM.
 */
export async function bakeVideo(
  src: string,
  opts: BakeVideoOpts,
  onProgress?: (pct: number) => void,
): Promise<{ blob: Blob; mime: string }> {
  const mime = bestRecorderMime(opts.format ?? "auto");
  if (!mime) throw new Error("Bu tarayıcı video kaydını desteklemiyor.");

  const v = document.createElement("video");
  v.crossOrigin = "anonymous";
  v.muted = true;
  v.playsInline = true;
  v.src = src;
  await new Promise<void>((ok, no) => {
    v.onloadedmetadata = () => ok();
    v.onerror = () => no(new Error("Video yüklenemedi (CORS?)."));
  });
  const speed = clamp(opts.speed ?? 1, 0.1, 16);
  v.playbackRate = speed;

  const sw0 = v.videoWidth || 1280;
  const sh0 = v.videoHeight || 720;

  // 1) freeform source crop
  const cr = opts.cropRect;
  const crX = cr ? clamp(cr.xPct, 0, 99) / 100 * sw0 : 0;
  const crY = cr ? clamp(cr.yPct, 0, 99) / 100 * sh0 : 0;
  const crW = cr ? clamp(cr.wPct, 1, 100) / 100 * sw0 : sw0;
  const crH = cr ? clamp(cr.hPct, 1, 100) / 100 * sh0 : sh0;

  // 2) rotation
  const rot = opts.rotate ?? 0;
  const swap = rot === 90 || rot === 270;
  const rW = swap ? crH : crW;
  const rH = swap ? crW : crH;

  // 3) crop to aspect (centre) in rotated space
  const targetRatio = opts.ratio && opts.ratio > 0 ? opts.ratio : rW / rH;
  let cw = rW;
  let ch = rH;
  if (rW / rH > targetRatio) cw = Math.round(rH * targetRatio);
  else ch = Math.round(rW / targetRatio);

  // 4) output size (cap the long edge)
  let ow = cw;
  let oh = ch;
  const maxEdge = opts.maxEdge && opts.maxEdge > 0 ? opts.maxEdge : Math.max(cw, ch);
  if (Math.max(cw, ch) > maxEdge) {
    const k = maxEdge / Math.max(cw, ch);
    ow = Math.max(2, Math.round((cw * k) / 2) * 2);
    oh = Math.max(2, Math.round((ch * k) / 2) * 2);
  } else {
    ow = Math.max(2, Math.round(ow / 2) * 2);
    oh = Math.max(2, Math.round(oh / 2) * 2);
  }

  const canvas = document.createElement("canvas");
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext("2d")!;

  const A: Adjust = { ...NEUTRAL_ADJUST, ...(opts.adjust ?? {}) };
  const filterStr = adjustFilter(A);
  const needPixel =
    (A.exposure ?? 0) !== 0 || (A.warmth ?? 0) !== 0 || (A.tint ?? 0) !== 0 || (A.vignette ?? 0) > 0 || (A.sharpen ?? 0) > 0;

  const fps = opts.fps ?? 30;
  const start = clamp(opts.trimStart || 0, 0, Math.max(0, v.duration - 0.05));
  const end = opts.trimEnd && opts.trimEnd > start ? Math.min(opts.trimEnd, v.duration) : v.duration;
  const outDur = (end - start) / speed;

  const bg = opts.bgColor || "#000000";
  const bgBlur = clamp(opts.bgBlur ?? 0, 0, 40);
  const alpha = clamp((opts.opacity ?? 100) / 100, 0, 1);
  const chroma = opts.chroma && opts.chroma.color ? opts.chroma : null;
  const [ckR, ckG, ckB] = chroma ? hexRgb(chroma.color) : [0, 0, 0];
  const ckTol = chroma ? (chroma.tol / 100) * 441 : 0; // 441 = max rgb distance
  const ckSoft = chroma ? Math.max(1, (chroma.soft / 100) * 120) : 1;

  // crop-rect draw offsets in rotated space (centre-cropped for aspect)
  const cropOX = (rW - cw) / 2;
  const cropOY = (rH - ch) / 2;
  const px = document.createElement("canvas"); // scratch for pixelate
  const mainCv = document.createElement("canvas"); // scratch for chroma key
  mainCv.width = ow;
  mainCv.height = oh;
  const mainCtx = mainCv.getContext("2d")!;

  /* ---------------- audio ---------------- */
  let audioTracks: MediaStreamTrack[] = [];
  let extraAudioEl: HTMLAudioElement | null = null;
  let ac: AudioContext | null = null;
  let bufSrc: AudioBufferSourceNode | null = null;
  let fadeNode: GainNode | null = null;
  const fx = opts.audio || {};

  if (!opts.mute) {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (opts.audioUrl) {
      extraAudioEl = document.createElement("audio");
      extraAudioEl.crossOrigin = "anonymous";
      extraAudioEl.src = opts.audioUrl;
      extraAudioEl.loop = true;
      await new Promise<void>((ok) => (extraAudioEl!.oncanplay = () => ok()));
      try {
        if (AC && hasAudioFx(fx)) {
          ac = new AC();
          const es = ac.createMediaElementSource(extraAudioEl);
          const { tail, fadeGain } = buildAudioChain(ac, es, fx);
          const dest = ac.createMediaStreamDestination();
          tail.connect(dest);
          fadeNode = fadeGain;
          audioTracks = dest.stream.getAudioTracks();
        } else {
          audioTracks = (extraAudioEl as any).captureStream().getAudioTracks();
        }
      } catch {
        /* ignore */
      }
    } else if (AC && (fx.reverse || (fx.pitch ?? 0) !== 0)) {
      // buffer path (reverse / pitch need the decoded samples)
      try {
        ac = new AC();
        const raw = await (await fetch(src)).arrayBuffer();
        const dec = await ac.decodeAudioData(raw.slice(0));
        const sr = dec.sampleRate;
        const s0 = Math.floor(start * sr);
        const n = Math.max(1, Math.floor((end - start) * sr));
        const trimmed = ac.createBuffer(dec.numberOfChannels, n, sr);
        for (let c = 0; c < dec.numberOfChannels; c++) {
          const seg = dec.getChannelData(c).slice(s0, s0 + n);
          if (fx.reverse) seg.reverse();
          trimmed.copyToChannel(seg, c);
        }
        bufSrc = ac.createBufferSource();
        bufSrc.buffer = trimmed;
        bufSrc.playbackRate.value = speed;
        if (fx.pitch) bufSrc.detune.value = fx.pitch * 100;
        const { tail, fadeGain } = buildAudioChain(ac, bufSrc, fx);
        const dest = ac.createMediaStreamDestination();
        tail.connect(dest);
        fadeNode = fadeGain;
        audioTracks = dest.stream.getAudioTracks();
      } catch {
        ac?.close();
        ac = null;
        bufSrc = null;
      }
    }
    if (!audioTracks.length && !opts.audioUrl) {
      // element-source path (in sync) through the chain, else raw capture
      try {
        if (AC && hasAudioFx(fx)) {
          ac = ac || new AC();
          const es = ac.createMediaElementSource(v);
          const { tail, fadeGain } = buildAudioChain(ac, es, fx);
          const dest = ac.createMediaStreamDestination();
          tail.connect(dest);
          fadeNode = fadeGain;
          audioTracks = dest.stream.getAudioTracks();
        } else {
          audioTracks = (v as any).captureStream().getAudioTracks();
        }
      } catch {
        try {
          audioTracks = (v as any).captureStream().getAudioTracks();
        } catch {
          /* silent */
        }
      }
    }
  }

  const canvasStream: MediaStream = (canvas as any).captureStream(fps);
  const out = new MediaStream([canvasStream.getVideoTracks()[0], ...audioTracks]);
  const rec = new (window as any).MediaRecorder(out, {
    mimeType: mime,
    videoBitsPerSecond: opts.bitrate ?? 8_000_000,
  });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e: BlobEvent) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
  });

  await new Promise<void>((ok) => {
    v.currentTime = start;
    v.onseeked = () => ok();
  });

  function drawFrameTo(g: CanvasRenderingContext2D) {
    g.save();
    g.filter = filterStr;
    g.translate(ow / 2, oh / 2);
    if (opts.flipH) g.scale(-1, 1);
    if (opts.flipV) g.scale(1, -1);
    if (rot) g.rotate((rot * Math.PI) / 180);
    const drawW = swap ? oh : ow;
    const drawH = swap ? ow : oh;
    // source sub-rect: crop-rect origin + aspect centre offset (mapped back through rotation)
    const sX = crX + (swap ? cropOY : cropOX);
    const sY = crY + (swap ? cropOX : cropOY);
    const sW = swap ? ch : cw;
    const sH = swap ? cw : ch;
    g.drawImage(v, sX, sY, sW, sH, -drawW / 2, -drawH / 2, drawW, drawH);
    g.restore();
    g.filter = "none";
  }

  function paint() {
    // 0) backdrop
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, ow, oh);
    if (bgBlur > 0) {
      ctx.save();
      ctx.filter = `blur(${bgBlur}px)`;
      const s = Math.max(ow / (sw0 || ow), oh / (sh0 || oh)) * 1.15;
      const dw = (sw0 || ow) * s;
      const dh = (sh0 || oh) * s;
      ctx.drawImage(v, (ow - dw) / 2, (oh - dh) / 2, dw, dh);
      ctx.restore();
      ctx.filter = "none";
    }

    // 1) the (cropped / rotated / flipped / adjusted) video layer
    const target = chroma ? mainCtx : ctx;
    if (chroma) {
      mainCtx.clearRect(0, 0, ow, oh);
    } else {
      ctx.globalAlpha = alpha;
    }
    drawFrameTo(target);
    if (needPixel) applyPixelAdjust(target, ow, oh, A);
    if (opts.bw) {
      const d = target.getImageData(0, 0, ow, oh);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const gr = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0;
        p[i] = p[i + 1] = p[i + 2] = gr;
      }
      target.putImageData(d, 0, 0);
    }
    if (chroma) {
      const d = mainCtx.getImageData(0, 0, ow, oh);
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const dist = Math.hypot(p[i] - ckR, p[i + 1] - ckG, p[i + 2] - ckB);
        if (dist <= ckTol) p[i + 3] = 0;
        else if (dist <= ckTol + ckSoft) p[i + 3] = Math.round(p[i + 3] * ((dist - ckTol) / ckSoft));
      }
      mainCtx.putImageData(d, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(mainCv, 0, 0);
    }
    ctx.globalAlpha = 1;

    // 2) region covers (blur / pixelate / solid)
    for (const c of opts.covers ?? []) {
      const rx = Math.round((c.xPct / 100) * ow);
      const ry = Math.round((c.yPct / 100) * oh);
      const rw = Math.max(1, Math.round((c.wPct / 100) * ow));
      const rh = Math.max(1, Math.round((c.hPct / 100) * oh));
      if (c.mode === "fill") {
        ctx.fillStyle = c.fill || "#000";
        ctx.fillRect(rx, ry, rw, rh);
      } else if (c.mode === "blur") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        ctx.filter = "blur(14px)";
        ctx.drawImage(canvas, rx - 8, ry - 8, rw + 16, rh + 16, rx - 8, ry - 8, rw + 16, rh + 16);
        ctx.restore();
        ctx.filter = "none";
      } else {
        const bw = Math.max(2, Math.round(rw / 12));
        const bh = Math.max(2, Math.round(rh / 12));
        px.width = bw;
        px.height = bh;
        const pctx = px.getContext("2d")!;
        pctx.imageSmoothingEnabled = false;
        pctx.drawImage(canvas, rx, ry, rw, rh, 0, 0, bw, bh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(px, 0, 0, bw, bh, rx, ry, rw, rh);
        ctx.imageSmoothingEnabled = true;
      }
    }

    // 3) logo overlay
    if (opts.logo && opts.logoImg) drawLogo(ctx, ow, oh, opts.logo, opts.logoImg);

    // 4) text overlay — never allowed to overlap the logo
    if (opts.text?.value?.trim()) {
      const T = opts.text;
      const fs = Math.max(10, Math.round((T.sizePct / 100) * oh));
      ctx.font = `${T.bold === false ? "600" : "800"} ${fs}px ${T.font ? `'${T.font}', ` : ""}Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let x = (T.xPct / 100) * ow;
      let y = (T.yPct / 100) * oh;
      const tw = ctx.measureText(T.value).width + fs * (T.bg ? 0.9 : 0.2);
      const th = fs * 1.5;
      if (opts.logo && opts.logoImg) {
        const li = opts.logoImg as HTMLImageElement;
        const lr = computeLogoRect(opts.logo, li.naturalWidth || li.width, li.naturalHeight || li.height, ow, oh);
        const pad = fs * 0.4;
        const overlap =
          Math.abs(x - (lr.x + lr.w / 2)) < (tw + lr.w) / 2 + pad &&
          Math.abs(y - (lr.y + lr.h / 2)) < (th + lr.h) / 2 + pad;
        if (overlap) {
          // push the text to whichever side of the logo has more room
          const above = lr.y - th / 2 - pad;
          const below = lr.y + lr.h + th / 2 + pad;
          y = lr.y + lr.h / 2 > oh / 2 ? Math.max(th / 2 + 2, above) : Math.min(oh - th / 2 - 2, below);
        }
      }
      x = Math.min(ow - tw / 2 - 2, Math.max(tw / 2 + 2, x));
      y = Math.min(oh - th / 2 - 2, Math.max(th / 2 + 2, y));
      if (T.bg) {
        const w = ctx.measureText(T.value).width + fs * 0.9;
        ctx.fillStyle = T.bg;
        const r = fs * 0.35;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - fs * 0.75, w, fs * 1.5, r);
        ctx.fill();
      }
      ctx.lineWidth = Math.max(2, fs * 0.06);
      ctx.strokeStyle = "rgba(0,0,0,.55)";
      ctx.strokeText(T.value, x, y);
      ctx.fillStyle = T.color || "#fff";
      ctx.fillText(T.value, x, y);
    }
  }

  rec.start(250);
  try {
    await ac?.resume();
  } catch {
    /* ignore */
  }
  await v.play();
  if (extraAudioEl) extraAudioEl.play().catch(() => {});
  if (fadeNode && ac) applyFade(fadeNode, ac, fx, outDur);
  try {
    bufSrc?.start();
  } catch {
    /* ignore */
  }

  await new Promise<void>((resolve) => {
    let raf = 0;
    const tick = () => {
      if (v.currentTime >= end || v.ended) {
        cancelAnimationFrame(raf);
        rec.stop();
        v.pause();
        extraAudioEl?.pause();
        try {
          bufSrc?.stop();
        } catch {
          /* ignore */
        }
        resolve();
        return;
      }
      paint();
      onProgress?.(clamp(Math.round(((v.currentTime - start) / (end - start)) * 100), 0, 100));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  const blob = await done;
  try {
    await ac?.close();
  } catch {
    /* ignore */
  }
  return { blob, mime: mime.split(";")[0] };
}
