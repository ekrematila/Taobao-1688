import { randomUUID } from "node:crypto";
import { db, now } from "./db.ts";
import type { BlogConfig, BlogDoc, BlogKind, BlogRecord, BlogSeo, BlogSummary } from "@shared/types.ts";

interface BlogRow {
  id: string;
  kind: string;
  draft_id: string | null;
  title: string;
  config: string;
  seo: string | null;
  doc: string | null;
  html: string | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_BLOG_CONFIG: BlogConfig = {
  layout: "product",
  theme: "product",
  voice: "product",
  words: 1200,
  siteUrl: "",
  backlinks: [],
  focusKeyword: "",
  notes: "",
  includeVideo: true,
  html: { jsonLd: true, faq: true, toc: true, meta: true, breadcrumbs: true, lazyImages: true },
};

function parse<T>(s: string | null, fb: T): T {
  if (!s) return fb;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fb;
  }
}

function toRecord(r: BlogRow): BlogRecord {
  return {
    id: r.id,
    kind: r.kind as BlogKind,
    draftId: r.draft_id,
    title: r.title,
    config: { ...DEFAULT_BLOG_CONFIG, ...parse<Partial<BlogConfig>>(r.config, {}), html: { ...DEFAULT_BLOG_CONFIG.html, ...(parse<Partial<BlogConfig>>(r.config, {}).html ?? {}) } },
    seo: parse<BlogSeo | null>(r.seo, null),
    doc: parse<BlogDoc | null>(r.doc, null),
    html: r.html,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getBlog(id: string): BlogRecord | null {
  const row = db.prepare("SELECT * FROM blogs WHERE id = ?").get(id) as BlogRow | undefined;
  return row ? toRecord(row) : null;
}

export function listBlogs(kind?: BlogKind): BlogSummary[] {
  const rows = (
    kind
      ? (db.prepare("SELECT * FROM blogs WHERE kind = ? ORDER BY updated_at DESC").all(kind) as unknown as BlogRow[])
      : (db.prepare("SELECT * FROM blogs ORDER BY updated_at DESC").all() as unknown as BlogRow[])
  ).map(toRecord);
  return rows.map((b) => ({
    id: b.id,
    kind: b.kind,
    draftId: b.draftId,
    title: b.title,
    hasDoc: !!b.doc,
    updatedAt: b.updatedAt,
  }));
}

/** One product blog per draft — reuse if it exists. */
export function ensureProductBlog(draftId: string, title: string): BlogRecord {
  const existing = db.prepare("SELECT * FROM blogs WHERE kind = 'product' AND draft_id = ?").get(draftId) as
    | BlogRow
    | undefined;
  if (existing) return toRecord(existing);
  const id = randomUUID();
  const ts = now();
  db.prepare(
    "INSERT INTO blogs (id, kind, draft_id, title, config, created_at, updated_at) VALUES (?, 'product', ?, ?, ?, ?, ?)",
  ).run(id, draftId, title || "", JSON.stringify(DEFAULT_BLOG_CONFIG), ts, ts);
  return getBlog(id)!;
}

export function createCategoryBlog(category: string, siteUrl: string): BlogRecord {
  const id = randomUUID();
  const ts = now();
  const cfg: BlogConfig = { ...DEFAULT_BLOG_CONFIG, category: category || "", siteUrl: siteUrl || "", includeVideo: false };
  db.prepare(
    "INSERT INTO blogs (id, kind, draft_id, title, config, created_at, updated_at) VALUES (?, 'category', NULL, ?, ?, ?, ?)",
  ).run(id, category || "Category blog", JSON.stringify(cfg), ts, ts);
  return getBlog(id)!;
}

export function patchBlog(
  id: string,
  patch: Partial<{ title: string; config: BlogConfig; seo: BlogSeo | null; doc: BlogDoc | null; html: string | null }>,
): BlogRecord {
  const cur = getBlog(id);
  if (!cur) throw new Error("Blog bulunamadı");
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.title !== undefined) (sets.push("title = ?"), vals.push(patch.title));
  if (patch.config !== undefined) (sets.push("config = ?"), vals.push(JSON.stringify(patch.config)));
  if (patch.seo !== undefined) (sets.push("seo = ?"), vals.push(patch.seo ? JSON.stringify(patch.seo) : null));
  if (patch.doc !== undefined) (sets.push("doc = ?"), vals.push(patch.doc ? JSON.stringify(patch.doc) : null));
  if (patch.html !== undefined) (sets.push("html = ?"), vals.push(patch.html));
  sets.push("updated_at = ?");
  vals.push(now(), id);
  db.prepare(`UPDATE blogs SET ${sets.join(", ")} WHERE id = ?`).run(...(vals as any));
  return getBlog(id)!;
}

export function deleteBlog(id: string): void {
  db.prepare("DELETE FROM blogs WHERE id = ?").run(id);
}
