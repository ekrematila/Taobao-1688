import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";

/**
 * Shows the current Cloudflare quick-tunnel address (from `tools/start-tunnel.ps1`,
 * via `GET /api/tunnel-url`) in the sidebar, if one is running. Polls every 5s so
 * a restart — which always hands out a brand new `*.trycloudflare.com` address —
 * is reflected here automatically, with no page reload needed. Renders nothing
 * when no tunnel is active.
 */
export default function TunnelBadge() {
  const { t } = useI18n();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const last = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = () => {
      api
        .tunnelUrl()
        .then((r) => {
          if (!alive) return;
          setUrl(r.url);
          if (r.url && last.current && r.url !== last.current) {
            toast(`${t("tunnel.label")}: ${r.url}`, "info");
          }
          last.current = r.url;
        })
        .catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!url) return null;

  const short = url.replace(/^https:\/\//, "");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(t("tunnel.copied"), "ok");
    } catch {
      /* clipboard unavailable — the link is still shown for manual copy */
    }
  };

  return (
    <div className="tunnel-badge" title={url}>
      <span className="tunnel-dot" aria-hidden="true" />
      <a href={url} target="_blank" rel="noreferrer" className="tunnel-link">
        {short}
      </a>
      <button type="button" className="tunnel-copy" onClick={copy} aria-label={t("tunnel.copied")}>
        📋
      </button>
    </div>
  );
}
