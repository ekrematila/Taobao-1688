// "Page skin": the product page is themed AS A WHOLE, not just the description card.
//
// A Shopify description can carry a <style> that applies to the entire product page, so the colours the
// model picked from the product's photos (`--gold`, `--lav`, …), its font pair (`--fh` / `--fb`) and a
// few theme characters (`--deco`, `--fall`) are turned into rules for the store theme's own parts:
// announcement bar, header, product title + price, Add to Cart / Buy now, footer, page background —
// plus small animations. Everything is scoped with `body:has(.bm)`, so it only ever touches pages that
// carry this description; a browser without :has() simply ignores it (nothing breaks).
//
// Selectors target the shop's theme (Ella) and generic Shopify classes. Pure string work, no DOM.

type RGB = [number, number, number];

const clamp = (n: number, a = 0, b = 255) => Math.max(a, Math.min(b, n));

export function parseHex(v: string | undefined): RGB | null {
  const m = String(v ?? "").trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const toHex = (c: RGB) => "#" + c.map((x) => clamp(Math.round(x)).toString(16).padStart(2, "0")).join("");
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

export function luminance(c: RGB): number {
  const f = (x: number) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** darken `c` (towards black) until it reaches `min` contrast against `bg` */
function darkenFor(c: RGB, bg: RGB, min: number): RGB {
  let out = c;
  for (let i = 0; i < 12 && contrast(out, bg) < min; i++) out = mix(out, BLACK, 0.12);
  return out;
}
/** lighten `c` (towards white) until it reaches `min` contrast against `bg` */
function lightenFor(c: RGB, bg: RGB, min: number): RGB {
  let out = c;
  for (let i = 0; i < 12 && contrast(out, bg) < min; i++) out = mix(out, WHITE, 0.12);
  return out;
}
/** whichever of white / near-black reads better on `bg` */
const textOn = (bg: RGB): string => (contrast(WHITE, bg) >= contrast([28, 28, 32], bg) ? "#ffffff" : "#1c1c20");

/* -------------------------------- variables -------------------------------- */

const SAFE_TEXT = /[^\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Presentation}‍️☀-➿★☆✦✧✿♡♥◆▪▫·•❄❅❆\s]/gu;

/** the first `.bm{…}` rule's custom properties */
export function readBmVars(html: string): Record<string, string> {
  const m = html.match(/\.bm\s*\{([^}]*)\}/);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const d of m[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);?/gi)) out[d[1].toLowerCase()] = d[2].trim();
  return out;
}

const cleanTokens = (v: string | undefined, max: number): string[] => {
  const s = String(v ?? "").replace(/^['"]|['"]$/g, "").replace(SAFE_TEXT, "");
  return s.split(/\s+/).filter(Boolean).slice(0, max);
};

export interface SkinInput {
  acc: RGB;
  acc2: RGB;
  ink: RGB;
  lav: RGB;
  fh?: string;
  fb?: string;
  deco: string[];
  fall: string[];
  mood: string;
}

export function skinInputFrom(html: string): SkinInput | null {
  if (!/class\s*=\s*["']bm["']/i.test(html)) return null;
  const v = readBmVars(html);
  const acc = parseHex(v["gold"]);
  const ink = parseHex(v["ink"]) ?? parseHex(v["head"]);
  if (!acc || !ink) return null; // no usable palette → leave the store theme alone
  const acc2 = parseHex(v["gold2"]) ?? mix(acc, WHITE, 0.45);
  const lav = parseHex(v["lav"]) ?? mix(acc, WHITE, 0.9);
  const fontName = (x?: string) => (x ? x.replace(/['"]/g, "").trim() : undefined);
  return {
    acc,
    acc2,
    ink,
    lav,
    fh: fontName(v["fh"]),
    fb: fontName(v["fb"]),
    deco: cleanTokens(v["deco"], 6),
    fall: cleanTokens(v["fall"], 6),
    mood: (v["mood"] || "").replace(/['"]/g, "").trim().toLowerCase(),
  };
}

/* ---------------------------------- CSS ---------------------------------- */

const SCOPE = "body:has(.bm)";
const rule = (selectors: string[], body: string) => selectors.map((s) => `${SCOPE} ${s}`).join(",") + `{${body}}`;
const repeat = (tokens: string[], n: number) => Array.from({ length: n }, (_, i) => tokens[i % tokens.length]).join("  ");

export function buildPageSkinCss(html: string): string {
  const k = skinInputFrom(html);
  if (!k) return "";
  const accDark = darkenFor(k.acc, WHITE, 4.5); // text/price colour on white
  const onAcc = textOn(k.acc);
  // footer: a deep shade of the product's ink, dark enough for light text
  let deep = mix(k.ink, BLACK, 0.3);
  deep = darkenFor(deep, [235, 235, 235], 9);
  const deep2 = mix(deep, BLACK, 0.28);
  const deep3 = mix(deep, BLACK, 0.5);
  const headOnDeep = lightenFor(k.acc2, deep, 5);
  const linkOnDeep = lightenFor(mix(k.lav, WHITE, 0.3), deep, 7);
  const lavHex = toHex(k.lav);
  const accHex = toHex(k.acc);
  const acc2Hex = toHex(k.acc2);
  const rgb = (c: RGB) => c.map((x) => Math.round(x)).join(",");

  const fam = (n?: string, serif = false) => (n ? `'${n}',${serif ? "Georgia,serif" : "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"}` : "");
  const SERIF = new Set(["Playfair Display", "DM Serif Display", "Lora"]);
  const fh = fam(k.fh || k.fb, SERIF.has(k.fh || k.fb || ""));
  const fb = fam(k.fb || k.fh, SERIF.has(k.fb || k.fh || ""));

  const deco = k.deco.length ? k.deco : k.fall;
  const parts: string[] = [];

  parts.push(
    `${SCOPE}{--sk-acc:${accHex};--sk-acc2:${acc2Hex};--sk-acc-dark:${toHex(accDark)};--sk-on-acc:${onAcc};--sk-lav:${lavHex};--sk-ink:${toHex(k.ink)};--sk-deep:${toHex(deep)};--sk-deep2:${toHex(deep2)};--sk-deep3:${toHex(deep3)};--sk-acc-rgb:${rgb(k.acc)}}`,
  );
  // page background: a soft wash of the palette that fades into white behind the product
  parts.push(rule(["#MainContent", ".wrapper-body"], `background:linear-gradient(180deg,var(--sk-lav) 0,#fff 760px)!important`));
  if (fb) parts.push(`${SCOPE},${SCOPE} button,${SCOPE} input,${SCOPE} select,${SCOPE} textarea{font-family:${fb}!important}`);
  if (fh)
    parts.push(
      rule([".productView-title", ".productView-title *", "h1", "footer.footer h2", "footer.footer h3", "footer.footer .footer-block__heading"], `font-family:${fh}!important`),
    );

  // announcement bar + header
  parts.push(
    rule([".announcement-bar", "announcement-bar-component"], `background:linear-gradient(90deg,var(--sk-acc),var(--sk-acc2))!important;color:var(--sk-on-acc)!important`),
    rule([".announcement-bar *", "announcement-bar-component *"], `color:var(--sk-on-acc)!important`),
    rule(
      ["sticky-header-mobile", ".header-mobile", "sticky-header", ".header-navigation-wrapper", ".header-navigation"],
      `background:linear-gradient(180deg,var(--sk-lav),#fff)!important;border-bottom:1px solid rgba(var(--sk-acc-rgb),.25)`,
    ),
  );

  // product title + price
  parts.push(
    rule([".productView-title"], `color:var(--sk-ink)!important;letter-spacing:.2px`),
    rule([".productView-price .price", ".productView-price .price-item", ".productView-price .price__regular", ".productView-price .money"], `color:var(--sk-acc-dark)!important;font-weight:700`),
  );

  // Add to cart + Buy it now — and their surroundings
  const atc = ["#product-add-to-cart", ".product-form__submit", ".product-form__submit.button", ".product-form__cart-submit"];
  parts.push(
    rule(
      atc,
      `background:linear-gradient(135deg,var(--sk-acc),var(--sk-acc2))!important;color:var(--sk-on-acc)!important;border:0!important;border-radius:999px!important;box-shadow:0 10px 24px -10px rgba(var(--sk-acc-rgb),.7)!important;letter-spacing:.3px;transition:transform .25s cubic-bezier(.4,0,.2,1),box-shadow .25s cubic-bezier(.4,0,.2,1)!important;animation:skGlow 3.4s ease-in-out infinite`,
    ),
    rule(atc.map((s) => s + ":hover"), `transform:translateY(-2px) scale(1.015)!important;box-shadow:0 16px 30px -10px rgba(var(--sk-acc-rgb),.8)!important`),
    rule([".shopify-payment-button__button--unbranded", ".shopify-payment-button .button", ".product-form__buttons .button--primary:not(#product-add-to-cart)"], `background:#fff!important;color:var(--sk-acc-dark)!important;border:2px solid var(--sk-acc)!important;border-radius:999px!important;box-shadow:none!important`),
  );
  if (deco[0]) parts.push(rule(atc.map((s) => s + "::before"), `content:"${deco[0]}";margin-right:.45em;display:inline-block`));

  // everything around the buttons: payment-methods trigger, delivery timeline, the reviews block
  parts.push(
    rule([".ka-payments-trigger", ".ka-payments-trigger *"], `color:var(--sk-on-acc)!important`),
    rule([".ka-payments-trigger"], `background:linear-gradient(135deg,var(--sk-acc2),var(--sk-acc))!important;border-radius:999px!important;border:0!important;box-shadow:0 8px 18px -10px rgba(var(--sk-acc-rgb),.8)!important`),
    rule([".three_step_card", ".delivery_msg .step_template", ".delivery_msg .li_border_1"], `border-color:rgba(var(--sk-acc-rgb),.5)!important;background:var(--sk-lav)!important;border-radius:14px`),
    rule([".three_step_card *", ".delivery_msg .step_template *"], `color:var(--sk-ink)!important`),
    rule([".ka-reviews"], `background:linear-gradient(180deg,var(--sk-deep),var(--sk-deep2))!important;border-radius:22px!important`),
    rule([".ka-reviews__label", ".ka-reviews__header *"], `color:var(--sk-acc2)!important;font-family:inherit`),
    rule([".productView-moreItem a", ".product-form__input a"], `color:var(--sk-acc-dark)!important`),
  );

  // footer: deep product colour, tinted text, a strip of the product's characters
  parts.push(
    rule(["footer.footer .footer__content-top"], `background:linear-gradient(180deg,var(--sk-deep),var(--sk-deep2))!important`),
    rule(["footer.footer .footer__content-bottom"], `background:var(--sk-deep3)!important`),
    rule(["footer.footer", "footer.footer p", "footer.footer li", "footer.footer span", "footer.footer a"], `color:${toHex(linkOnDeep)}!important`),
    rule(["footer.footer h2", "footer.footer h3", "footer.footer .footer-block__heading", "footer.footer .footer-block__heading *"], `color:${toHex(headOnDeep)}!important`),
    rule(["footer.footer a:hover"], `color:var(--sk-acc2)!important`),
    rule(["footer.footer"], `position:relative;overflow:hidden;background:var(--sk-deep)!important`),
    // newsletter button + field
    rule(["footer.footer button[type=submit]", "footer.footer input[type=submit]", "footer.footer .button"], `background:var(--sk-acc)!important;color:var(--sk-on-acc)!important;border-color:var(--sk-acc)!important;border-radius:999px!important`),
    rule(["footer.footer input[type=email]", "footer.footer input[type=text]"], `border-color:rgba(var(--sk-acc-rgb),.55)!important;border-radius:999px!important`),
    // the theme's floating bottom menu
    rule([".gm-bb-menu", ".gm-bb-item-box"], `background:var(--sk-deep)!important`),
    rule([".gm-bb-submenu", ".gm-bb-item-box-inner"], `background:var(--sk-deep2)!important`),
  );
  if (deco.length) {
    parts.push(
      rule(
        ["footer.footer::before"],
        `content:"${repeat(deco, 14)}";display:block;white-space:nowrap;overflow:hidden;text-align:center;font-size:22px;line-height:1;padding:16px 0 4px;background:var(--sk-deep);animation:skSway 7s ease-in-out infinite alternate`,
      ),
    );
  }

  // falling characters (only when the model asked for them; off on small screens and for reduced motion)
  if (k.fall.length) {
    const row = repeat(k.fall, 10);
    parts.push(
      `${SCOPE}::before,${SCOPE}::after{content:"${row}";position:fixed;left:0;right:0;top:-60px;z-index:3;pointer-events:none;white-space:nowrap;overflow:hidden;text-align:center;font-size:20px;letter-spacing:9vw;opacity:.22;animation:skFall 17s linear infinite}`,
      `${SCOPE}::after{letter-spacing:13vw;margin-left:5vw;font-size:16px;opacity:.16;animation-duration:23s;animation-delay:-9s}`,
    );
  }

  parts.push(
    `@keyframes skGlow{0%,100%{box-shadow:0 10px 24px -10px rgba(${rgb(k.acc)},.6)}50%{box-shadow:0 14px 30px -8px rgba(${rgb(k.acc)},.95)}}`,
    `@keyframes skSway{from{transform:translateX(-14px)}to{transform:translateX(14px)}}`,
    `@keyframes skFall{from{transform:translateY(-8vh)}to{transform:translateY(112vh)}}`,
    // phones / tablets: calmer, bigger tap targets, lighter decoration
    `@media (max-width:749px){${k.fall.length ? `${SCOPE}::after{display:none}${SCOPE}::before{font-size:16px;opacity:.18}` : ""}${rule(atc, "width:100%!important;min-height:48px")}${deco.length ? rule(["footer.footer::before"], "font-size:18px;padding-top:12px") : ""}${rule([".productView-title"], "font-size:clamp(20px,6vw,26px)!important")}}`,
    `@media (min-width:750px) and (max-width:1024px){${deco.length ? rule(["footer.footer::before"], "font-size:20px") : ""}}`,
    `@media (prefers-reduced-motion:reduce){${k.fall.length ? `${SCOPE}::before,${SCOPE}::after{display:none!important}` : ""}${rule(atc, "animation:none!important")}${deco.length ? rule(["footer.footer::before"], "animation:none!important") : ""}}`,
  );

  return `<style data-ps-skin="1">${parts.join("\n")}</style>`;
}

/** the skin <style> goes in once, right after the page's own styles */
export function applyPageSkin(html: string): string {
  if (html.includes("data-ps-skin")) return html;
  const css = buildPageSkinCss(html);
  if (!css) return html;
  const end = html.lastIndexOf("</div>");
  return end >= 0 ? html.slice(0, end) + css + html.slice(end) : html + css;
}
