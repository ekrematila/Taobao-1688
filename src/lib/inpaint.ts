// Local, offline "generative erase" — spins up the FMM/harmonic inpainting
// worker. No API, no key, no cost. Works on any canvas.

const MAX_EDGE = 2600; // downscale huge images so it stays fast

export interface InpaintOpts {
  grain?: number; // 0..1 synthetic noise (default 0.03 — barely there)
  dilate?: number; // px to grow the mask (default 2)
  texture?: boolean; // graft real texture detail (default true)
}

/**
 * Reconstruct the pixels marked white in `maskCanvas` from `srcCanvas`,
 * returning a new canvas the same size as the source. Runs in a Web Worker.
 * The mask canvas may be any size — it is scaled to the working resolution.
 */
export async function localInpaint(
  srcCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  opts: InpaintOpts = {},
): Promise<HTMLCanvasElement> {
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const wctx = work.getContext("2d")!;
  wctx.drawImage(srcCanvas, 0, 0, w, h);
  const imgData = wctx.getImageData(0, 0, w, h);

  // rasterise the mask at working resolution
  const mc = document.createElement("canvas");
  mc.width = w;
  mc.height = h;
  const mctx = mc.getContext("2d")!;
  mctx.imageSmoothingEnabled = false;
  mctx.drawImage(maskCanvas, 0, 0, w, h);
  const md = mctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    // white (or any bright / opaque) marks the region to erase
    const v = Math.max(md[i * 4], md[i * 4 + 1], md[i * 4 + 2]);
    mask[i] = v > 127 && md[i * 4 + 3] > 40 ? 255 : 0;
    if (mask[i]) count++;
  }
  if (count === 0) return srcCanvas;

  const worker = new Worker(new URL("./inpaint.worker.ts", import.meta.url), { type: "module" });
  const rgbaBuf = imgData.data.buffer.slice(0);
  const maskBuf = mask.buffer.slice(0);

  const outBuf: ArrayBuffer = await new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ ok: boolean; rgba?: ArrayBuffer; error?: string }>) => {
      worker.terminate();
      if (e.data.ok && e.data.rgba) resolve(e.data.rgba);
      else reject(new Error(e.data.error || "inpaint failed"));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "inpaint worker error"));
    };
    worker.postMessage(
      {
        width: w,
        height: h,
        rgba: rgbaBuf,
        mask: maskBuf,
        grain: opts.grain ?? 0.03,
        dilate: opts.dilate ?? 2,
        texture: opts.texture ?? true,
      },
      [rgbaBuf, maskBuf],
    );
  });

  wctx.putImageData(new ImageData(new Uint8ClampedArray(outBuf), w, h), 0, 0);

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(work, 0, 0, sw, sh);
  return out;
}
