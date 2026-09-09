import { useState } from "react";
import { proxied, type Draft } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { importBodyHtml, importBodyHtmlPreview, plainText, ETSY_MAX_PHOTOS } from "../lib/export";
import { fancyEtsyHeaders } from "@shared/listingFormat.ts";
import type { GeneratedListing } from "@shared/types.ts";

function f(l: GeneratedListing | null, key: string) {
  return l?.fields.find((x) => x.key === key)?.value ?? "";
}

/**
 * Storefront-style preview. Etsy is modelled on a real Etsy PDP (thumbnail rail +
 * square hero, "Now $X", Item details / Highlights, plain-text description). Shopify
 * is modelled on the user's own theme (big title, purple price, option pills,
 * ADD TO CART, HTML description with figure images).
 */
export default function ListingPreview({ draft }: { draft: Draft }) {
  const { t } = useI18n();
  const toast = useToast();
  const l = draft.listing;
  const p = draft.product;
  const isEtsy = draft.channel === "etsy";

  const gallery = (p?.images ?? []).filter((i) => i.role === "gallery" || i.role === "variant");
  const descImgs = (p?.images ?? []).filter((i) => i.role === "description");
  const photos = isEtsy ? [...gallery, ...descImgs].slice(0, ETSY_MAX_PHOTOS) : gallery;
  const [hero, setHero] = useState(0);
  const heroUrl = photos[hero]?.url || p?.images[0]?.url;

  const videoUrl = p?.videoUrl || "";
  const videoAlt = p?.videoAlt || "";
  const [vidSel, setVidSel] = useState(false);
  const showVideo = !!videoUrl && vidSel;
  const pickImg = (i: number) => {
    setHero(i);
    setVidSel(false);
  };

  const title = f(l, "title") || p?.titleTranslated || p?.title || "—";
  // operator-edited product variants win over the generation-time snapshot
  const vlist = (p?.variants?.length ? p.variants : l?.variants) ?? [];
  const priced = vlist.find((v) => v.price != null);
  const price = priced?.price ?? p?.priceOriginal ?? null;
  const compareAt =
    priced?.compareAtPrice != null
      ? priced.compareAtPrice
      : price != null
        ? Math.round(price * 1.35 * 100) / 100
        : null;

  const axes: Record<string, Set<string>> = {};
  for (const v of vlist) {
    const parts = (v.nameTranslated || v.name).split(/\s*\/\s*/);
    parts.forEach((part, i) => {
      const axis = parts.length > 1 ? `${t("preview.option")} ${i + 1}` : t("preview.option");
      (axes[axis] ||= new Set()).add(part);
    });
  }

  const tags = f(l, "tags")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const highlights = Object.entries(p?.props ?? {})
    .filter(([k]) => /malzeme|material|profil|profile|renk|colou?r|tema|theme|boyut|size|uyum|compat/i.test(k))
    .slice(0, 6);

  const priceStr = price != null ? `$${price.toFixed(2)}` : t("preview.noPrice");

  /* ------------------------------- Etsy ------------------------------- */
  if (isEtsy) {
    return (
      <div className="pdp etsy-pdp">
        <div className="etsy-top">
          <div className="etsy-rail">
            {videoUrl && (
              <button
                type="button"
                className={"rail-vid" + (showVideo ? " on" : "")}
                onClick={() => setVidSel(true)}
                title={videoAlt || t("preview.video")}
              >
                <video src={videoUrl} muted preload="metadata" />
                <span>▶</span>
              </button>
            )}
            {photos.slice(0, ETSY_MAX_PHOTOS).map((im, i) => (
              <img
                key={im.url}
                src={proxied(im.url)}
                alt=""
                className={!showVideo && i === hero ? "on" : ""}
                onClick={() => pickImg(i)}
              />
            ))}
          </div>
          <div className="etsy-hero">
            {showVideo ? (
              <video src={videoUrl} controls playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
            ) : heroUrl ? (
              <img src={proxied(heroUrl)} alt={photos[hero]?.alt || ""} />
            ) : (
              t("preview.noImage")
            )}
          </div>
          <div className="etsy-info">
            <div className="etsy-price">
              {compareAt != null && <span className="was">${compareAt.toFixed(2)}</span>}
              <b>Now {priceStr}</b>
            </div>
            <div className="etsy-title">{title}</div>
            {f(l, "title_alt") && (
              <div className="tiny muted" style={{ marginTop: 2 }}>
                {t("preview.titleAlt")}: <span style={{ color: "var(--ink)" }}>{f(l, "title_alt")}</span>{" "}
                <span className="mono">({f(l, "title_alt").split(/\s+/).filter(Boolean).length} {t("delivery.words")})</span>
              </div>
            )}
            <div className="tiny muted">★★★★★ · {t("preview.store")}</div>
            <div className="tiny" style={{ color: "var(--ok)" }}>✓ Returns &amp; exchanges accepted</div>
            <button className="btn" disabled style={{ borderRadius: 999 }}>
              Make an offer
            </button>
            <button className="btn primary" disabled style={{ borderRadius: 999 }}>
              {t("preview.addToCart")}
            </button>
            {Object.entries(axes).map(([axis, vals]) => (
              <div className="pdp-opt" key={axis}>
                <b>{axis}</b>
                <div className="chips">
                  {[...vals].slice(0, 8).map((val) => (
                    <span key={val} className="chip" style={{ cursor: "default" }}>
                      {val}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div className="etsy-details">
              <b>Item details</b>
              {highlights.map(([k, v]) => (
                <div key={k} className="tiny">
                  <span className="muted">{k}:</span> {v}
                </div>
              ))}
              {!highlights.length && <div className="tiny muted">Materials: PBT</div>}
            </div>
            {(() => {
              const live = new Set(tags.map((x) => x.toLowerCase()));
              const poolRaw = f(l, "tags_pool")
                .split(/[,\n]/)
                .map((s) => s.trim())
                .filter(Boolean);
              const shown = poolRaw.length ? poolRaw.slice(0, 50) : tags.slice(0, 13);
              if (!shown.length) return null;
              return (
                <div>
                  <div className="tiny muted" style={{ marginBottom: 4 }}>
                    {t("preview.tags")} ({shown.length}) · {t("preview.tagsLive", { n: tags.length })}
                  </div>
                  <div className="chips">
                    {shown.map((tg) => (
                      <span
                        key={tg}
                        className={"chip" + (live.has(tg.toLowerCase()) ? " active" : "")}
                        style={{ cursor: "default" }}
                      >
                        {tg}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="pdp-desc">
          <div className="pdp-desc-h">
            {t("preview.description")} <span className="badge">{t("preview.plainText")}</span>
          </div>
          <div className="pdp-desc-body" style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.65 }}>
            {fancyEtsyHeaders(plainText(f(l, "description"))) || "—"}
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ Shopify ---------------------------- */
  return (
    <div className="pdp shopify-pdp">
      <div className="pdp-top">
        <div className="pdp-gallery">
          <div className="pdp-hero">
            {showVideo ? (
              <video src={videoUrl} controls playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
            ) : heroUrl ? (
              <img src={proxied(heroUrl)} alt={photos[hero]?.alt || ""} />
            ) : (
              t("preview.noImage")
            )}
          </div>
          <div className="pdp-strip">
            {videoUrl && (
              <button
                type="button"
                className={"rail-vid" + (showVideo ? " on" : "")}
                onClick={() => setVidSel(true)}
                title={videoAlt || t("preview.video")}
              >
                <video src={videoUrl} muted preload="metadata" />
                <span>▶</span>
              </button>
            )}
            {photos.slice(0, 12).map((im, i) => (
              <img
                key={im.url}
                src={proxied(im.url)}
                alt=""
                style={{ outline: !showVideo && i === hero ? "2px solid var(--brand)" : "none" }}
                onClick={() => pickImg(i)}
              />
            ))}
          </div>
        </div>
        <div className="pdp-info">
          <div className="pdp-title" style={{ fontSize: 22 }}>{title}</div>
          <div className="pdp-price" style={{ color: "#5a31f4" }}>
            {priceStr}
            {compareAt != null && <s>${compareAt.toFixed(2)}</s>}
          </div>
          {Object.entries(axes).map(([axis, vals]) => (
            <div className="pdp-opt" key={axis}>
              <b>
                {axis}: <span className="muted">{[...vals][0]}</span>
              </b>
              <div className="opt-pills">
                {[...vals].slice(0, 8).map((val, i) => (
                  <span key={val} className={"opt-pill" + (i === 0 ? " on" : "")}>
                    {val}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <button className="btn" disabled style={{ background: "#111", color: "#fff", borderColor: "#111" }}>
            {t("preview.addToCart")} — {priceStr}
          </button>
          <button className="btn" disabled style={{ background: "#5a31f4", color: "#fff", borderColor: "#5a31f4" }}>
            Buy with shop
          </button>
          <div className="metafield">
            <b>{t("preview.handleSeo")}:</b> {f(l, "seo_title") || title} · {title.length} {t("preview.chars")}
          </div>
          {tags.length > 0 && (
            <div>
              <div className="tiny muted" style={{ marginBottom: 4 }}>
                {t("preview.tags")} ({tags.length})
              </div>
              <div className="chips">
                {tags.slice(0, 60).map((tg) => (
                  <span key={tg} className="chip" style={{ cursor: "default" }}>
                    {tg}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="pdp-desc">
        <div className="pdp-desc-h" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1 }}>{t("preview.description")} <span className="badge">HTML</span></span>
          {l && p && (
            <button
              className="btn ghost sm"
              title={t("delivery.htmlCopyTip")}
              onClick={() => {
                navigator.clipboard?.writeText(importBodyHtml(p, l));
                toast(t("delivery.htmlCopied"), "ok");
              }}
            >
              ⧉ {t("delivery.htmlCopy")}
            </button>
          )}
        </div>
        <div
          className="pdp-desc-body"
          lang="en"
          dangerouslySetInnerHTML={{
            __html:
              l && p
                ? importBodyHtmlPreview(p, l)
                : f(l, "description")
                  ? `<pre style="white-space:pre-wrap;font:13px/1.6 sans-serif;margin:0">${plainText(f(l, "description"))}</pre>`
                  : "<p style='color:#888'>—</p>",
          }}
        />
      </div>
    </div>
  );
}
