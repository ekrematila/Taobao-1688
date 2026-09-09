import { randomUUID } from "node:crypto";
import { db, now } from "./db.ts";
import type {
  DraftRevision,
  DraftSummary,
  GeneratedListing,
  NormalisedProduct,
} from "@shared/types.ts";

export interface DraftRow {
  id: string;
  num_iid: string;
  platform: string;
  title: string;
  channel: string | null;
  step: number;
  product: string | null;
  listing: string | null;
  image_state: string | null;
  api_response: string | null;
  updated_at: string;
}

export interface Draft {
  id: string;
  numIid: string;
  platform: "taobao" | "1688";
  title: string;
  channel: "shopify" | "etsy" | null;
  step: number;
  product: NormalisedProduct | null;
  listing: GeneratedListing | null;
  imageState: unknown;
  /** Last raw OneBound API JSON for this draft — shown in the Step 1 explorer. */
  apiResponse: unknown;
  updatedAt: string;
}

const PUB_RE = /^(https?:)?\/\/[^/]+\.[^/]/i;
const abs = (u?: string) => (u && u.startsWith("//") ? "https:" + u : u || "");

function toDraft(r: DraftRow): Draft {
  const product = r.product ? (JSON.parse(r.product) as NormalisedProduct) : null;
  if (product?.images) {
    // Legacy drafts stored a "unused" role; the workspace no longer has that zone.
    for (const im of product.images) if ((im.role as string) === "unused") im.role = "description";

    // Backfill `srcUrl` (the immutable original public URL) for images created
    // before the field existed — so an edited /api/media image still exports the
    // pre-edit original until the operator hosts the edits / connects the API.
    if (product.images.some((im) => !im.srcUrl)) {
      for (const im of product.images) {
        if (im.srcUrl) continue;
        im.srcUrl =
          [im.originalUrl, im.translatedFrom].find((u) => u && PUB_RE.test(u)) ||
          (PUB_RE.test(im.url) ? im.url : undefined);
      }
      // positional recovery for the rest, from the raw API description images
      const stillLocal = product.images.filter((im) => im.role === "description" && !im.srcUrl);
      if (stillLocal.length && r.api_response) {
        try {
          const j = JSON.parse(r.api_response);
          const item = j?.item ?? j?.data?.item ?? j?.data ?? j ?? {};
          const desc = String(item.desc ?? item.description ?? item.detail ?? "");
          const srcDesc = [
            ...new Set(
              [
                ...[...desc.matchAll(/<img[^>]+src=["']?([^"' >]+)/gi)].map((m) => m[1]),
                ...(Array.isArray(item.desc_img) ? item.desc_img : []),
              ]
                .map(abs)
                .filter((u) => PUB_RE.test(u)),
            ),
          ];
          const descImgs = product.images.filter((im) => im.role === "description");
          descImgs.forEach((im, i) => {
            if (!im.srcUrl && srcDesc[i]) im.srcUrl = srcDesc[i];
          });
        } catch {
          /* ignore malformed api_response */
        }
      }
    }
  }
  return {
    id: r.id,
    numIid: r.num_iid,
    platform: r.platform as Draft["platform"],
    title: r.title,
    channel: r.channel as Draft["channel"],
    step: r.step,
    product,
    listing: r.listing ? JSON.parse(r.listing) : null,
    imageState: r.image_state ? JSON.parse(r.image_state) : null,
    apiResponse: r.api_response ? JSON.parse(r.api_response) : null,
    updatedAt: r.updated_at,
  };
}

export function getDraft(id: string): Draft | null {
  const row = db.prepare("SELECT * FROM drafts WHERE id = ?").get(id) as DraftRow | undefined;
  return row ? toDraft(row) : null;
}

/** One draft branch per (platform, num_iid). Reuse if it exists. */
export function upsertProductDraft(product: NormalisedProduct): Draft {
  const existing = db
    .prepare("SELECT * FROM drafts WHERE num_iid = ? AND platform = ?")
    .get(product.numIid, product.platform) as DraftRow | undefined;

  if (existing) {
    db.prepare(
      "UPDATE drafts SET product = ?, title = ?, step = MAX(step, 2), updated_at = ? WHERE id = ?",
    ).run(JSON.stringify(product), product.title, now(), existing.id);
    snapshot(existing.id, "Ürün verisi yenilendi");
    return getDraft(existing.id)!;
  }

  const id = randomUUID();
  db.prepare(
    "INSERT INTO drafts (id, num_iid, platform, title, step, product, updated_at) VALUES (?,?,?,?,?,?,?)",
  ).run(id, product.numIid, product.platform, product.title, 2, JSON.stringify(product), now());
  snapshot(id, "Taslak oluşturuldu");
  return getDraft(id)!;
}

/** Keep the raw provider JSON so the Step 1 explorer can show it after a fetch. */
export function setDraftApiResponse(id: string, json: unknown): void {
  db.prepare("UPDATE drafts SET api_response = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(json ?? null),
    now(),
    id,
  );
}

export function patchDraft(
  id: string,
  patch: Partial<{
    channel: string | null;
    step: number;
    product: NormalisedProduct;
    listing: GeneratedListing;
    imageState: unknown;
    title: string;
  }>,
  label?: string,
): Draft {
  const d = getDraft(id);
  if (!d) throw new Error("Taslak bulunamadı");
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.channel !== undefined) (sets.push("channel = ?"), vals.push(patch.channel));
  if (patch.step !== undefined) (sets.push("step = ?"), vals.push(patch.step));
  if (patch.title !== undefined) (sets.push("title = ?"), vals.push(patch.title));
  if (patch.product !== undefined) (sets.push("product = ?"), vals.push(JSON.stringify(patch.product)));
  if (patch.listing !== undefined) (sets.push("listing = ?"), vals.push(JSON.stringify(patch.listing)));
  if (patch.imageState !== undefined) (sets.push("image_state = ?"), vals.push(JSON.stringify(patch.imageState)));
  sets.push("updated_at = ?");
  vals.push(now(), id);
  db.prepare(`UPDATE drafts SET ${sets.join(", ")} WHERE id = ?`).run(...(vals as any));
  if (label) snapshot(id, label);
  return getDraft(id)!;
}

/**
 * Serialise "read draft → mutate → patchDraft" sections that touch the SAME
 * draft. Several AI jobs now run in parallel (see server/jobs.ts) and more than
 * one of them writes the `product` column (image translation, AI edit, alt
 * texts, variant tools). Without this, two jobs that both read `fresh` and then
 * write back a full product object would clobber each other — e.g. an alt-text
 * job landing after an image-translation job would restore the pre-translation
 * image URLs. Per-draft FIFO promise chain; other drafts are unaffected.
 */
const draftLocks = new Map<string, Promise<unknown>>();
export function withDraftLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = (draftLocks.get(id) ?? Promise.resolve()).catch(() => {});
  const next = prev.then(() => fn());
  draftLocks.set(id, next);
  void next.catch(() => {}).finally(() => {
    if (draftLocks.get(id) === next) draftLocks.delete(id);
  });
  return next;
}

export function snapshot(draftId: string, label: string): void {
  const row = db.prepare("SELECT * FROM drafts WHERE id = ?").get(draftId) as DraftRow | undefined;
  if (!row) return;
  db.prepare("INSERT INTO revisions (draft_id, label, snapshot, created_at) VALUES (?,?,?,?)").run(
    draftId,
    label,
    JSON.stringify(row),
    now(),
  );
}

export function listRevisions(draftId: string): DraftRevision[] {
  return (
    db
      .prepare("SELECT id, draft_id, label, created_at FROM revisions WHERE draft_id = ? ORDER BY id DESC")
      .all(draftId) as any[]
  ).map((r) => ({ id: r.id, draftId: r.draft_id, label: r.label, createdAt: r.created_at }));
}

export function restoreRevision(revisionId: number): Draft {
  const rev = db.prepare("SELECT * FROM revisions WHERE id = ?").get(revisionId) as
    | { draft_id: string; snapshot: string }
    | undefined;
  if (!rev) throw new Error("Sürüm bulunamadı");
  const snap = JSON.parse(rev.snapshot) as DraftRow;
  db.prepare(
    "UPDATE drafts SET num_iid=?, platform=?, title=?, channel=?, step=?, product=?, listing=?, image_state=?, updated_at=? WHERE id=?",
  ).run(
    snap.num_iid,
    snap.platform,
    snap.title,
    snap.channel,
    snap.step,
    snap.product,
    snap.listing,
    snap.image_state,
    now(),
    rev.draft_id,
  );
  snapshot(rev.draft_id, "Önceki sürüm geri yüklendi");
  return getDraft(rev.draft_id)!;
}

/** Hard delete — draft + every revision. Only called on an explicit user confirm. */
export function deleteDraft(id: string): void {
  db.prepare("DELETE FROM revisions WHERE draft_id = ?").run(id);
  db.prepare("DELETE FROM drafts WHERE id = ?").run(id);
}

export function listDrafts(): DraftSummary[] {
  const rows = db.prepare("SELECT * FROM drafts ORDER BY updated_at DESC").all() as unknown as DraftRow[];
  return rows.map((r) => ({
    id: r.id,
    numIid: r.num_iid,
    platform: r.platform as any,
    title: r.title,
    channel: r.channel as any,
    step: r.step,
    updatedAt: r.updated_at,
    revisionCount: (db.prepare("SELECT COUNT(*) c FROM revisions WHERE draft_id = ?").get(r.id) as any).c,
  }));
}
