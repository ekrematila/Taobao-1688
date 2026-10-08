import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import { DEFAULT_STORE_PROFILES, type StoreProfile } from "@shared/storeProfiles.ts";

const lines = (v: string[]) => v.join("\n");
const unlines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
const linksToText2 = (links: StoreProfile["links"]) => links.map((l) => `${l.label} | ${l.url} | ${l.keywords.join(",")}`).join("\n");
const textToLinks = (v: string): StoreProfile["links"] =>
  unlines(v)
    .map((row) => {
      const [label = "", url = "", kw = ""] = row.split("|").map((x) => x.trim());
      return { label, url, keywords: kw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean) };
    })
    .filter((l) => l.label && /^https?:\/\//i.test(l.url));


/** A textarea that keeps its own raw text while typing (so Enter / trailing blank lines survive) and reports the parsed value. */
function ListArea<T>({ value, ser, parse, rows, onChange }: { value: T; ser: (v: T) => string; parse: (t: string) => T; rows: number; onChange: (v: T) => void }) {
  const [text, setText] = useState(ser(value));
  useEffect(() => {
    if (ser(parse(text)) !== ser(value)) setText(ser(value));
  }, [ser(value)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <textarea
      rows={rows}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
    />
  );
}

/** Settings → the operator's real shipping / returns policy per store (feeds the product page's verified block). */
export default function StoreProfilesCard({ profiles }: { profiles: StoreProfile[] | undefined }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [list, setList] = useState<StoreProfile[]>(profiles ?? DEFAULT_STORE_PROFILES);
  const [open, setOpen] = useState<string>("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (profiles) setList(profiles);
  }, [JSON.stringify(profiles)]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id: string, p: Partial<StoreProfile>) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function save() {
    setBusy("save");
    try {
      await api.saveSettings({ storeProfiles: list });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast(t("settings.stores.saved"), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  async function refresh(p: StoreProfile) {
    setBusy("refresh-" + p.id);
    try {
      const r = await api.refreshStoreProfile(p.id);
      patch(p.id, r.profile);
      toast(t("settings.stores.refreshed"), "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  function addStore() {
    const id = "store-" + Math.random().toString(36).slice(2, 7);
    setList((l) => [
      ...l,
      { id, name: "New store", kind: "shopify", url: "https://", processing: "", shipping: [], returns: [], extra: [], contact: "", links: [], notes: "", fetchedAt: "", sources: [] },
    ]);
    setOpen(id);
  }

  return (
    <div className="card">
      <div className="card-h">
        <h3>{t("settings.stores.title")}</h3>
      </div>
      <div className="card-b col" style={{ gap: 10 }}>
        <p className="tiny muted" style={{ margin: 0 }}>{t("settings.stores.hint")}</p>
        {list.map((p) => {
          const isOpen = open === p.id;
          const def = DEFAULT_STORE_PROFILES.find((d) => d.id === p.id);
          return (
            <div key={p.id} className="col" style={{ gap: 8, border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <button className="btn ghost sm" onClick={() => setOpen(isOpen ? "" : p.id)}>
                  {isOpen ? "▾" : "▸"} <b>{p.name}</b>
                </button>
                <span className="badge">{p.kind === "etsy" ? "Etsy" : "Shopify"}</span>
                {p.fetchedAt && <span className="tiny muted">{t("settings.stores.fetched")}: {p.fetchedAt}</span>}
              </div>
              {isOpen && (
                <div className="col" style={{ gap: 8 }}>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <label className="field" style={{ flex: 1, minWidth: 180 }}>
                      Name
                      <input value={p.name} onChange={(e) => patch(p.id, { name: e.target.value })} />
                    </label>
                    <label className="field" style={{ flex: 2, minWidth: 220 }}>
                      {t("settings.stores.fUrl")}
                      <input value={p.url} onChange={(e) => patch(p.id, { url: e.target.value })} />
                    </label>
                    <label className="field">
                      Type
                      <select value={p.kind} onChange={(e) => patch(p.id, { kind: e.target.value === "etsy" ? "etsy" : "shopify" })}>
                        <option value="shopify">Shopify</option>
                        <option value="etsy">Etsy</option>
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    {t("settings.stores.fProcessing")}
                    <input value={p.processing} onChange={(e) => patch(p.id, { processing: e.target.value })} />
                  </label>
                  <label className="field">
                    {t("settings.stores.fShipping")}
                    <ListArea rows={4} value={p.shipping} ser={lines} parse={unlines} onChange={(v) => patch(p.id, { shipping: v })} />
                  </label>
                  <label className="field">
                    {t("settings.stores.fReturns")}
                    <ListArea rows={4} value={p.returns} ser={lines} parse={unlines} onChange={(v) => patch(p.id, { returns: v })} />
                  </label>
                  <label className="field">
                    {t("settings.stores.fExtra")}
                    <ListArea rows={2} value={p.extra} ser={lines} parse={unlines} onChange={(v) => patch(p.id, { extra: v })} />
                  </label>
                  <label className="field">
                    {t("settings.stores.fContact")}
                    <input value={p.contact} onChange={(e) => patch(p.id, { contact: e.target.value })} />
                  </label>
                  {p.kind === "shopify" && (
                    <label className="field">
                      {t("settings.stores.fLinks")}
                      <ListArea rows={5} value={p.links} ser={linksToText2} parse={textToLinks} onChange={(v) => patch(p.id, { links: v })} />
                    </label>
                  )}
                  <label className="field">
                    {t("settings.stores.fNotes")}
                    <textarea rows={3} value={p.notes} onChange={(e) => patch(p.id, { notes: e.target.value })} />
                  </label>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {p.kind === "shopify" ? (
                      <button className="btn sm" onClick={() => refresh(p)} disabled={!!busy}>
                        {busy === "refresh-" + p.id ? <span className="spin" /> : `⟳ ${t("settings.stores.refresh")}`}
                      </button>
                    ) : (
                      <span className="tiny muted">{t("settings.stores.etsyNote")}</span>
                    )}
                    {def && (
                      <button className="btn ghost sm" onClick={() => patch(p.id, def)}>
                        {t("settings.stores.reset")}
                      </button>
                    )}
                    <button className="btn ghost sm" onClick={() => setList((l) => l.filter((x) => x.id !== p.id))}>
                      {t("settings.stores.remove")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm" onClick={addStore}>
            + {t("settings.stores.add")}
          </button>
          <button className="btn primary sm" onClick={save} disabled={!!busy}>
            {busy === "save" ? <span className="spin" /> : t("settings.stores.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
