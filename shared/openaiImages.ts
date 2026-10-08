// Pure helpers for OpenAI's image models (gpt-image-*): reading an image's size from its
// bytes, picking a valid output size for an edit, and pricing the token usage the
// Images API reports. Facts from developers.openai.com (Oct 2026):
//   - gpt-image-2 and gpt-image-2.5-* accept any WIDTHxHEIGHT with both sides a multiple of
//     16, aspect ratio 1:3..3:1, 655,360..8,294,400 pixels, longest edge <= 3840;
//     older models (gpt-image-1, 1.5, 1-mini) only take 1024x1024 / 1536x1024 / 1024x1536.
//   - token prices per 1M: gpt-image-2 / 2.5-* text $5, image-in $8, image-out $30;
//     1.5 $5/$8/$32; 1 $5/$10/$40; 1-mini $2/$2.5/$8.

export function imageDimensions(buf: Uint8Array): { w: number; h: number } | null {
  const b = buf;
  // PNG
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  // GIF
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  }
  // JPEG — walk the markers to the first SOFn frame header
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = (b[i + 2] << 8) | b[i + 3];
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + len;
    }
    return null;
  }
  // WebP
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (tag === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (tag === "VP8 ") return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (tag === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

/** gpt-image-2 and newer take free-form sizes; older ones only three presets. */
export function supportsCustomImageSize(model: string): boolean {
  return /^gpt-image-([2-9]|\d{2,})/.test(model);
}

const MIN_PX = 655_360;
const MAX_PX = 8_294_400;
const up16 = (n: number) => Math.max(16, Math.ceil(n / 16) * 16);
const near16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);

/**
 * Output size for editing a w×h source: keep the SOURCE aspect ratio (a gallery photo must
 * not come back stretched), stay close to its resolution, and satisfy the model's limits.
 * `maxLong` caps the long edge to keep token cost down.
 */
export function pickImageSize(model: string, w: number, h: number, maxLong = 1536): string {
  if (!w || !h) return "auto";
  if (!supportsCustomImageSize(model)) {
    const r = w / h;
    return r >= 1.2 ? "1536x1024" : r <= 0.83 ? "1024x1536" : "1024x1024";
  }
  // aspect must stay within 1:3 .. 3:1
  let ww = w;
  let hh = h;
  if (ww / hh > 3) ww = hh * 3;
  if (hh / ww > 3) hh = ww * 3;
  const longEdge = Math.max(ww, hh);
  if (longEdge > maxLong) {
    const k = maxLong / longEdge;
    ww *= k;
    hh *= k;
  }
  if (ww * hh < MIN_PX) {
    const k = Math.sqrt(MIN_PX / (ww * hh)) * 1.002;
    ww *= k;
    hh *= k;
  }
  let W = near16(ww);
  let H = near16(hh);
  while (W * H < MIN_PX) {
    W = up16(W * 1.02);
    H = up16(H * 1.02);
  }
  // rounding to 16 can nudge a 3:1 ratio just past the limit — pull the long side back in
  if (W / H > 3) W = H * 3;
  if (H / W > 3) H = W * 3;
  if (W * H > MAX_PX || Math.max(W, H) > 3840) {
    const k = Math.min(Math.sqrt(MAX_PX / (W * H)), 3840 / Math.max(W, H));
    W = Math.floor((W * k) / 16) * 16;
    H = Math.floor((H * k) / 16) * 16;
  }
  return `${W}x${H}`;
}

export interface ImageTokenPrices {
  textIn: number;
  imageIn: number;
  imageOut: number;
}

/** USD per 1M tokens. Unknown / new image models fall back to the GPT Image 2 rates. */
export function openaiImagePrices(model: string): ImageTokenPrices {
  if (/^gpt-image-1-mini/.test(model)) return { textIn: 2, imageIn: 2.5, imageOut: 8 };
  if (/^gpt-image-1\.5/.test(model)) return { textIn: 5, imageIn: 8, imageOut: 32 };
  if (/^gpt-image-1(?!\.|-mini)/.test(model) || model === "chatgpt-image-latest") return { textIn: 5, imageIn: 10, imageOut: 40 };
  return { textIn: 5, imageIn: 8, imageOut: 30 };
}

export interface ImageUsage {
  textIn: number;
  imageIn: number;
  out: number;
}

export function imageCostUsd(model: string, u: ImageUsage): number {
  const p = openaiImagePrices(model);
  return (u.textIn / 1e6) * p.textIn + (u.imageIn / 1e6) * p.imageIn + (u.out / 1e6) * p.imageOut;
}

/** USD per minute of audio for the file-transcription models. */
export function transcribeUsdPerMinute(model: string): number {
  if (model === "gpt-transcribe") return 0.0045;
  if (model === "gpt-4o-mini-transcribe") return 0.003;
  return 0.006; // gpt-4o-transcribe, whisper-1 and anything newer we haven't priced
}
