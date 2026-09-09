import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./env.ts";

mkdirSync(join(ROOT, "data"), { recursive: true });
export const db = new DatabaseSync(join(ROOT, "data", "app.sqlite"));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drafts (
    id          TEXT PRIMARY KEY,
    num_iid     TEXT NOT NULL,
    platform    TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    channel     TEXT,
    step        INTEGER NOT NULL DEFAULT 1,
    product     TEXT,            -- JSON NormalisedProduct
    listing     TEXT,            -- JSON GeneratedListing
    image_state TEXT,            -- JSON: role assignments + edits
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS revisions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id   TEXT NOT NULL,
    label      TEXT NOT NULL,
    snapshot   TEXT NOT NULL,   -- JSON of the whole draft row
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usage_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    at            TEXT NOT NULL,
    kind          TEXT NOT NULL,
    model         TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd      REAL NOT NULL,
    provider      TEXT NOT NULL DEFAULT 'claude',
    credits       REAL NOT NULL DEFAULT 0,
    estimated     INTEGER NOT NULL DEFAULT 0,
    draft_id      TEXT
  );

  CREATE TABLE IF NOT EXISTS archive (
    id         TEXT PRIMARY KEY,
    draft_id   TEXT NOT NULL,
    channel    TEXT NOT NULL,
    title      TEXT NOT NULL,
    format     TEXT NOT NULL,
    payload    TEXT NOT NULL,   -- JSON: files/rows for re-download
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blogs (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,          -- 'product' | 'category'
    draft_id    TEXT,                   -- product blogs only
    title       TEXT NOT NULL DEFAULT '',
    config      TEXT NOT NULL,          -- JSON BlogConfig
    seo         TEXT,                   -- JSON BlogSeo
    doc         TEXT,                   -- JSON BlogDoc
    html        TEXT,                   -- last rendered standalone HTML
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
`);

// Idempotent column migrations for DBs created before these fields existed.
for (const stmt of [
  "ALTER TABLE usage_log ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude'",
  "ALTER TABLE usage_log ADD COLUMN credits REAL NOT NULL DEFAULT 0",
  "ALTER TABLE usage_log ADD COLUMN estimated INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE usage_log ADD COLUMN draft_id TEXT",
  "ALTER TABLE usage_log ADD COLUMN manus_task_id TEXT",
  "ALTER TABLE usage_log ADD COLUMN result TEXT", // short JSON summary of the operation output
  "ALTER TABLE drafts ADD COLUMN api_response TEXT", // last raw OneBound JSON, kept for review
]) {
  try {
    db.exec(stmt);
  } catch {
    /* column already exists */
  }
}

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function now(): string {
  return new Date().toISOString();
}
