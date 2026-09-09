// 100% local, NO-AI alt-text generator. Analyses the actual pixels (dominant
// colours, brightness, orientation, framing, whether there's overlay text) and
// the product context, then composes one accessible, SEO-friendly sentence.
// Not vision-model quality, but honest, instant and free.

export interface AltMeta {
  title?: string;
  role?: string; // gallery | variant | description
  propsText?: string; // "material: PBT; theme: One Piece; ..."
  lang?: "tr" | "en";
}

const NAMED: [string, [number, number, number]][] = [
  ["black", [20, 20, 20]],
  ["white", [245, 245, 245]],
  ["grey", [128, 128, 128]],
  ["red", [200, 40, 40]],
  ["orange", [230, 130, 30]],
  ["yellow", [235, 210, 60]],
  ["green", [60, 160, 70]],
  ["teal", [40, 160, 160]],
  ["blue", [50, 90, 200]],
  ["navy", [30, 40, 90]],
  ["purple", [130, 70, 180]],
  ["pink", [230, 130, 175]],
  ["brown", [120, 80, 50]],
  ["beige", [210, 190, 150]],
  ["cream", [240, 232, 210]],
];

function nameColour(r: number, g: number, b: number): string {
  let best = "grey";
  let bd = Infinity;
  for (const [name, [nr, ng, nb]] of NAMED) {
    const d = (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2;
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}

/** Downscale, bucket colours, return the 2–3 most common named colours + mean luma. */
function analysePixels(canvas: HTMLCanvasElement) {
  const W = 48;
  const H = Math.max(8, Math.round((canvas.height / canvas.width) * W)) || 48;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const buckets = new Map<string, number>();
  let lumaSum = 0;
  let n = 0;
  let edge = 0;
  const luma = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] < 128) continue;
      const nm = nameColour(data[i], data[i + 1], data[i + 2]);
      buckets.set(nm, (buckets.get(nm) || 0) + 1);
      lumaSum += luma(i);
      n++;
      if (x > 0) edge += Math.abs(luma(i) - luma(i - 4));
    }
  }
  const ranked = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const total = n || 1;
  const colours = ranked.filter(([, v]) => v / total > 0.08).slice(0, 3).map(([k]) => k);
  return {
    colours: colours.length ? colours : ranked.slice(0, 2).map(([k]) => k),
    meanLuma: lumaSum / total,
    edgeDensity: edge / total, // high => busy / text / detailed
  };
}

function lightingPhrase(luma: number): string {
  return luma > 200 ? "brightly lit" : luma > 140 ? "soft, daylight" : luma > 80 ? "evenly lit" : "dark, moody";
}

function orientationPhrase(w: number, h: number): string {
  const r = w / h;
  if (r > 1.25) return "in a wide frame";
  if (r < 0.8) return "in a tall frame";
  return "in a square frame";
}

/** Product name for the sentence — Chinese stripped, ASCII-ish only. */
function subjectFrom(meta: AltMeta): string {
  let t = noCJK((meta.title || "").replace(/\s*\|\s*.*$/, "").replace(/[–-]\s*[^–-]+®?\s*$/, "").trim());
  // if what's left has no letters (was all Chinese), fall back
  if (!/[a-z0-9]/i.test(t)) return "the product";
  if (t.length > 70) t = t.slice(0, 70).replace(/\s+\S*$/, "");
  return t;
}

function joinColours(cs: string[]): string {
  if (cs.length <= 1) return cs[0] || "neutral";
  return cs.slice(0, -1).join(", ") + " and " + cs[cs.length - 1];
}

/** English-only, Chinese-free accessible alt text. */
export function localAltText(canvas: HTMLCanvasElement, meta: AltMeta = {}): string {
  const { colours, meanLuma, edgeDensity } = analysePixels(canvas);
  const subject = subjectFrom(meta);
  const cols = joinColours(colours);
  const light = lightingPhrase(meanLuma);
  const orient = orientationPhrase(canvas.width, canvas.height);
  const busy = edgeDensity > 26;
  const isDesc = meta.role === "description";
  const isVariant = meta.role === "variant";

  const propBit = noCJK(meta.propsText || "")
    .split(/[;,]/)
    .map((s) => s.split(":").pop()!.trim())
    .filter((s) => s && s.length < 24 && /[a-z0-9]/i.test(s))
    .slice(0, 2)
    .join(", ");

  const kind = isDesc ? "product information graphic" : isVariant ? "variant option image" : "product photo";
  const detail = busy ? "with detailed callouts and close-up detail" : "cleanly composed with plenty of space";
  return capClean(
    `${cap(subject)} shown ${orient}, ${detail}, in ${cols} tones under ${light} light — a ${kind}` +
      (propBit ? `, highlighting ${propBit}` : "") +
      ".",
  );
}

// local, dependency-free CJK stripper (client lib — keep it self-contained)
const ALT_CJK =
  /[⺀-⻿　-〿぀-ヿ㄀-ㄯㆠ-㇯㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]/g;
const noCJK = (s: string) => String(s ?? "").replace(ALT_CJK, "").replace(/\s{2,}/g, " ").trim();

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function capClean(s: string): string {
  let v = noCJK(s).replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").replace(/^[\s,;:–-]+/, "").trim();
  if (v.length > 480) v = v.slice(0, 480).replace(/\s+\S*$/, "") + "…";
  return v;
}
