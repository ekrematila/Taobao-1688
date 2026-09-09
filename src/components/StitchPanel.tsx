import { useEffect, useMemo, useRef, useState } from "react";
import { api, proxied } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { stitchImages, type StitchDir, type StitchFit } from "../lib/stitch";

/**
 * Merge N selected images into ONE, edge-to-edge with no gap. The order (and so
 * where the seams fall) is reorderable. The result replaces all the sources, so
 * translation / edits then run on the single stitched image.
 */
export default function StitchPanel({
  urls,
  onClose,
  onApply,
}: {
  urls: string[];
  onClose: () => void;
  onApply: (sourceUrls: string[], resultUrl: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [order, setOrder] = useState<string[]>(() => [...urls]);
  const [dir, setDir] = useState<StitchDir>("v");
  const [fit, setFit] = useState<StitchFit>("max");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sig = useMemo(() => `${dir}|${fit}|${order.join("~")}`, [dir, fit, order]);

  useEffect(() => {
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
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function apply() {
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

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(860px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="m-h">
          <h3 style={{ fontSize: 14 }}>{t("stitch.title", { n: order.length })}</h3>
          <span className="sub">{t("stitch.sub")}</span>
          <div className="grow" style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={onClose} disabled={busy}>
            {t("common.close")}
          </button>
        </div>

        <div className="m-b" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, alignItems: "start" }}>
          {/* controls + reorder list */}
          <div className="col" style={{ gap: 10 }}>
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

            <div className="stitch-list">
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
            <p className="tiny muted" style={{ margin: 0 }}>{t("stitch.hint")}</p>
          </div>

          {/* preview */}
          <div className="stitch-preview">
            {preview ? (
              <img src={preview} alt="" style={{ opacity: rendering ? 0.5 : 1 }} />
            ) : (
              <div className="empty">
                <span className="spin" /> {t("stitch.rendering")}
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
          <button className="btn primary" onClick={apply} disabled={busy || rendering || order.length < 2}>
            {busy ? <span className="spin" /> : t("stitch.apply", { n: order.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
