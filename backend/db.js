import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { parseAliases, serializeAliases } from './fuzzy.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'manwha.db');
const COVERS_DIR = path.join(DATA_DIR, 'covers');

fs.mkdirSync(COVERS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const TYPES = ['manhwa', 'manhua', 'webcomic', 'light_novel'];

db.exec(`
  CREATE TABLE IF NOT EXISTS manhwa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    cover_path TEXT,
    last_chapter TEXT DEFAULT '',
    comment TEXT DEFAULT '',
    score INTEGER DEFAULT 0 CHECK(score >= 0 AND score <= 20),
    status TEXT DEFAULT 'en_cours'
      CHECK(status IN ('en_cours', 'termine', 'abandonne', 'a_lire')),
    type TEXT NOT NULL DEFAULT 'manhwa',
    summary TEXT DEFAULT '',
    source TEXT,
    external_id TEXT,
    aliases TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_manhwa_title ON manhwa(title);
  CREATE INDEX IF NOT EXISTS idx_manhwa_updated ON manhwa(updated_at DESC);
`);

// Migration colonnes sur BDD existante.
let cols = db.prepare('PRAGMA table_info(manhwa)').all();
if (!cols.some((c) => c.name === 'type')) {
  db.exec("ALTER TABLE manhwa ADD COLUMN type TEXT NOT NULL DEFAULT 'manhwa'");
  cols = db.prepare('PRAGMA table_info(manhwa)').all();
}
if (!cols.some((c) => c.name === 'summary')) {
  db.exec("ALTER TABLE manhwa ADD COLUMN summary TEXT DEFAULT ''");
  cols = db.prepare('PRAGMA table_info(manhwa)').all();
}
if (!cols.some((c) => c.name === 'aliases')) {
  db.exec("ALTER TABLE manhwa ADD COLUMN aliases TEXT NOT NULL DEFAULT '[]'");
}

export { db, DATA_DIR, COVERS_DIR, DB_PATH };

function validType(t) {
  return TYPES.includes(t) ? t : 'manhwa';
}

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    aliases: parseAliases(row.aliases),
  };
}

export function listManhwa() {
  return db
    .prepare('SELECT * FROM manhwa ORDER BY updated_at DESC')
    .all()
    .map(mapRow);
}

export function getManhwa(id) {
  return mapRow(db.prepare('SELECT * FROM manhwa WHERE id = ?').get(id));
}

export function createManhwa(row) {
  const info = db
    .prepare(
      `INSERT INTO manhwa
        (title, cover_path, last_chapter, comment, score, status, type, summary, source, external_id, aliases)
       VALUES
        (@title, @cover_path, @last_chapter, @comment, @score, @status, @type, @summary, @source, @external_id, @aliases)`
    )
    .run({
      title: row.title,
      cover_path: row.cover_path ?? null,
      last_chapter: row.last_chapter ?? '',
      comment: row.comment ?? '',
      score: clampScore(row.score),
      status: row.status ?? 'en_cours',
      type: validType(row.type),
      summary: row.summary ?? '',
      source: row.source ?? null,
      external_id: row.external_id ?? null,
      aliases: serializeAliases(row.aliases ?? []),
    });
  return getManhwa(info.lastInsertRowid);
}

export function updateManhwa(id, patch) {
  const current = getManhwa(id);
  if (!current) return null;

  const next = {
    title: patch.title ?? current.title,
    cover_path: patch.cover_path !== undefined ? patch.cover_path : current.cover_path,
    last_chapter: patch.last_chapter ?? current.last_chapter,
    comment: patch.comment ?? current.comment,
    score: patch.score !== undefined ? clampScore(patch.score) : current.score,
    status: patch.status ?? current.status,
    type: patch.type !== undefined ? validType(patch.type) : current.type,
    summary: patch.summary !== undefined ? String(patch.summary) : current.summary,
    aliases:
      patch.aliases !== undefined
        ? serializeAliases(patch.aliases)
        : serializeAliases(current.aliases),
  };

  db.prepare(
    `UPDATE manhwa SET
      title = @title,
      cover_path = @cover_path,
      last_chapter = @last_chapter,
      comment = @comment,
      score = @score,
      status = @status,
      type = @type,
      summary = @summary,
      aliases = @aliases,
      updated_at = datetime('now')
     WHERE id = @id`
  ).run({ ...next, id });

  return getManhwa(id);
}

export function deleteManhwa(id) {
  const row = getManhwa(id);
  if (!row) return null;
  db.prepare('DELETE FROM manhwa WHERE id = ?').run(id);
  return row;
}

function clampScore(n) {
  const v = Number.parseInt(n, 10);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(20, v));
}
