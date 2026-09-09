import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Draft } from "../api";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import Stepper from "../components/Stepper";
import ApiExplorer from "../components/ApiExplorer";
import AdvicePanel from "../components/AdvicePanel";
import VisualWorkspace from "../components/VisualWorkspace";
import DeliveryStudio from "../components/DeliveryStudio";
import type { DraftSummary } from "@shared/types.ts";

const UNDO_CAP = 40;

export default function Studio() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const { draftId } = useParams();
  const [step, setStep] = useState(1);
  const [confirmDel, setConfirmDel] = useState<DraftSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // session undo/redo — captures every draft mutation (OCR, alt text, advice,
  // generative erase, listing, …). Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y).
  const undoStack = useRef<Draft[]>([]);
  const redoStack = useRef<Draft[]>([]);
  const prevSnap = useRef<Draft | null>(null);
  const applyingUndo = useRef(false);
  const [undoTick, setUndoTick] = useState(0); // re-render the buttons

  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const draftsQ = useQuery({ queryKey: ["drafts"], queryFn: api.drafts });
  const draftQ = useQuery({
    queryKey: ["draft", draftId],
    queryFn: () => api.draft(draftId!),
    enabled: !!draftId,
  });
  const draft = draftQ.data ?? null;
  const hasProduct = !!draft?.product;

  useEffect(() => {
    // Resume at the draft's saved step when a *different* draft is opened.
    // After that, never yank the step around — the user can walk freely
    // between 1..4 (nothing locks once it has been done).
    if (draft) setStep(Math.min(Math.max(draft.step || 1, 1), 4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id]);

  // Steps 2..4 need a product first, but no step is ever "locked" after it has
  // been completed — you can always go back to 1 and re-fetch / change things.
  const maxStep = hasProduct ? 4 : 1;
  const minStep = 1;

  /* ----------------------------- undo / redo ----------------------------- */
  // step is navigation, not an operation — exclude it so plain stepping doesn't
  // create undo entries
  const draftKey = (d: Draft | null) =>
    d ? JSON.stringify({ p: d.product, l: d.listing, s: d.imageState, c: d.channel, ti: d.title }) : "";

  // reset the stacks when the open draft changes
  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    prevSnap.current = null;
    applyingUndo.current = false;
    setUndoTick((x) => x + 1);
  }, [draftId]);

  // whenever the fetched draft changes (any save → refetch), remember the
  // PREVIOUS state so Ctrl+Z can go back to it
  useEffect(() => {
    if (!draft) return;
    const prev = prevSnap.current;
    if (prev && prev.id === draft.id && draftKey(prev) !== draftKey(draft)) {
      if (applyingUndo.current) {
        applyingUndo.current = false; // this change was our own undo/redo write
      } else {
        undoStack.current.push(prev);
        if (undoStack.current.length > UNDO_CAP) undoStack.current.shift();
        redoStack.current = [];
        setUndoTick((x) => x + 1);
      }
    }
    prevSnap.current = draft;
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  async function writeSnap(s: Draft, label: string) {
    applyingUndo.current = true;
    const patch: Record<string, unknown> = {
      channel: s.channel,
      step: s.step,
      title: s.title,
      imageState: s.imageState,
    };
    if (s.product) patch.product = s.product;
    if (s.listing) patch.listing = s.listing;
    await api.patchDraft(s.id, { ...patch, label });
    await draftQ.refetch();
  }
  async function doUndo() {
    if (!draft || !undoStack.current.length) return;
    const snap = undoStack.current.pop()!;
    redoStack.current.push(draft);
    setUndoTick((x) => x + 1);
    try {
      await writeSnap(snap, t("undo.label"));
      toast(t("undo.done"));
    } catch (e) {
      applyingUndo.current = false;
      toast((e as Error).message, "err");
    }
  }
  async function doRedo() {
    if (!draft || !redoStack.current.length) return;
    const snap = redoStack.current.pop()!;
    undoStack.current.push(draft);
    setUndoTick((x) => x + 1);
    try {
      await writeSnap(snap, t("redo.label"));
      toast(t("redo.done"));
    } catch (e) {
      applyingUndo.current = false;
      toast((e as Error).message, "err");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") {
        if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")) return;
      }
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return; // let the field handle it
      e.preventDefault();
      const redo = (e.key.toLowerCase() === "y") || e.shiftKey;
      void (redo ? doRedo() : doUndo());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // no deps — always current closures

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  void undoTick;

  async function persistStep(next: number) {
    const clamped = Math.min(Math.max(next, 1), maxStep);
    setStep(clamped);
    if (draft && clamped !== draft.step) {
      await api.patchDraft(draft.id, { step: clamped });
      draftQ.refetch();
    }
  }

  async function doDeleteDraft() {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      const wasOpen = confirmDel.id === draftId;
      await api.deleteDraft(confirmDel.id);
      toast(t("history.deleted"), "ok");
      setConfirmDel(null);
      await draftsQ.refetch();
      if (wasOpen) {
        nav("/studio");
        setStep(1);
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="title">{t("nav.studio")}</div>
        <div className="grow" style={{ flex: 1 }} />
        {draft && (
          <span className="badge brand">
            {draft.platform} · {draft.numIid}
          </span>
        )}
        {draft && (
          <>
            <button
              className="btn ghost sm"
              title={t("undo.tip")}
              disabled={!canUndo}
              onClick={() => void doUndo()}
            >
              ↶ {t("undo.btn")}
            </button>
            <button
              className="btn ghost sm"
              title={t("redo.tip")}
              disabled={!canRedo}
              onClick={() => void doRedo()}
            >
              ↷
            </button>
          </>
        )}
        <button className="btn ghost sm" onClick={() => { nav("/studio"); setStep(1); }}>
          + {t("studio.newProduct")}
        </button>
        {draft && (
          <RevisionMenu
            draftId={draft.id}
            onRestore={() => {
              draftQ.refetch();
              toast(t("studio.restored"), "ok");
            }}
          />
        )}
      </div>

      <div className="content wide studio-shell">
        <aside className="studio-rail">
          <div className="rail-h">{t("studio.railTitle")}</div>
          {(draftsQ.data ?? []).length === 0 && <div className="tiny muted" style={{ padding: 8 }}>{t("studio.railEmpty")}</div>}
          {(draftsQ.data ?? []).map((d) => (
            <div key={d.id} className={"rail-item" + (d.id === draft?.id ? " on" : "")}>
              <button
                className="rail-open"
                onClick={() => {
                  nav(`/studio/${d.id}`);
                  setStep(Math.max(2, Math.min(d.step, 4)));
                }}
                title={d.title || d.numIid}
              >
                <span className="rail-name">{d.title || d.numIid}</span>
                <span className="tiny muted">
                  {d.platform} · {d.numIid} · {t("studio.railStep", { n: String(d.step) })}
                </span>
              </button>
              <button
                className="rail-del"
                title={t("history.delete")}
                onClick={() => setConfirmDel(d)}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="btn ghost sm"
            style={{ margin: 8 }}
            onClick={() => {
              nav("/studio");
              setStep(1);
            }}
          >
            + {t("studio.newProduct")}
          </button>
        </aside>

        <div className="studio-main">
        <Stepper step={step} maxStep={maxStep} minStep={minStep} onGo={(s) => s >= 1 && s <= maxStep && persistStep(s)} />

        {step === 1 && (
          <>
            {hasProduct && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-b row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <p className="sub" style={{ margin: 0, flex: 1 }}>
                    {t("studio.productLocked", { id: `${draft!.platform} · ${draft!.numIid}` })}
                  </p>
                  <button className="btn primary" onClick={() => persistStep(2)}>
                    {t("studio.openFetched")}
                  </button>
                </div>
              </div>
            )}
            <ApiExplorer
              defaultQuery={hasProduct ? draft!.numIid : ""}
              initialJson={draft?.apiResponse ?? null}
              onSeeded={(id) => {
                draftsQ.refetch();
                draftQ.refetch();
                if (id !== draftId) nav(`/studio/${id}`);
                persistStep(2);
              }}
            />
          </>
        )}

        {step === 2 && draft && (
          <>
            <AdvicePanel draft={draft} defaultModel={settings.data?.llmModel || "claude-sonnet-5"} onSaved={() => draftQ.refetch()} />
            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn primary" onClick={() => persistStep(3)}>
                {t("common.next")}
              </button>
            </div>
          </>
        )}

        {step === 3 && draft && (
          <>
            <VisualWorkspace draft={draft} onSaved={() => draftQ.refetch()} />
            <div className="row" style={{ marginTop: 16, justifyContent: "space-between" }}>
              <button className="btn" onClick={() => persistStep(2)}>
                {t("common.back")}
              </button>
              <button className="btn primary" onClick={() => persistStep(4)}>
                {t("common.next")}
              </button>
            </div>
          </>
        )}

        {step === 4 && draft && (
          <>
            <DeliveryStudio
              draft={draft}
              hasShopify={!!settings.data?.hasShopify}
              defaultModel={settings.data?.llmModel || "claude-sonnet-5"}
              onSaved={() => draftQ.refetch()}
            />
            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => persistStep(3)}>
                {t("common.back")}
              </button>
            </div>
          </>
        )}

        {step > 1 && !draft && <div className="empty">{t("common.loading")}</div>}
        </div>
      </div>

      {confirmDel && (
        <div className="modal-scrim" onClick={() => !deleting && setConfirmDel(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("history.deleteConfirmTitle")}</h3>
            <p className="sub">{t("history.deleteConfirmBody", { title: confirmDel.title || confirmDel.numIid })}</p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn" onClick={() => setConfirmDel(null)} disabled={deleting}>
                {t("common.cancel")}
              </button>
              <button className="btn danger" onClick={doDeleteDraft} disabled={deleting}>
                {deleting ? <span className="spin" /> : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RevisionMenu({ draftId, onRestore }: { draftId: string; onRestore: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const revs = useQuery({ queryKey: ["revisions", draftId], queryFn: () => api.revisions(draftId), enabled: open });

  return (
    <div style={{ position: "relative" }}>
      <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
        {t("studio.revisions")} ▾
      </button>
      {open && (
        <div
          className="card"
          style={{ position: "absolute", right: 0, top: "110%", width: 300, zIndex: 30, maxHeight: 320, overflow: "auto" }}
        >
          <div className="card-b col" style={{ gap: 6 }}>
            {revs.data?.length ? (
              revs.data.map((r) => (
                <button
                  key={r.id}
                  className="btn ghost sm"
                  style={{ justifyContent: "space-between" }}
                  onClick={async () => {
                    await api.restore(r.id);
                    setOpen(false);
                    onRestore();
                  }}
                >
                  <span>{r.label}</span>
                  <span className="tiny muted">{new Date(r.createdAt).toLocaleTimeString()}</span>
                </button>
              ))
            ) : (
              <div className="tiny muted">{t("studio.noRevisions")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
