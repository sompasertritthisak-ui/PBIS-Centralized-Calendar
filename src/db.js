'use strict';
/* ==========================================================================
   Database access. One connection, WAL mode, prepared statements.
   SQLite is the development and small-deployment target; the same schema is
   ported to Postgres in db/postgres/001_init.sql for a hosted deployment.
   ========================================================================== */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.PBIS_DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = process.env.PBIS_DB || path.join(DATA_DIR, 'pbis.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/* ------------------------------------------------------------ migrations */
function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
             version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  );
  const dir = path.join(ROOT, 'db', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const run = [];
  for (const f of files) {
    const version = f.replace('.sql', '');
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?,?)')
        .run(version, new Date().toISOString());
      db.exec('COMMIT');
      run.push(version);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${version} failed: ${err.message}`);
    }
  }
  return run;
}

/* ----------------------------------------------------------------- utils */
const now = () => new Date().toISOString();

/** Short, sortable, URL-safe id. Time prefix keeps insert order roughly stable. */
function id(prefix) {
  const t = Date.now().toString(36);
  const r = crypto.randomBytes(6).toString('base64url');
  return `${prefix}_${t}${r}`;
}

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'item';
}

/** Ensure a slug is unique within a table, appending -2, -3 … if needed. */
function uniqueSlug(table, base, ignoreId) {
  let slug = slugify(base);
  let n = 1;
  const q = ignoreId
    ? db.prepare(`SELECT 1 FROM ${table} WHERE slug = ? AND id != ?`)
    : db.prepare(`SELECT 1 FROM ${table} WHERE slug = ?`);
  while (ignoreId ? q.get(slug, ignoreId) : q.get(slug)) {
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
}

const json = {
  parse(v, fallback) { try { return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  stringify(v) { return JSON.stringify(v == null ? null : v); }
};

/** Run fn inside a transaction; nested calls join the outer transaction. */
function tx(fn) {
  if (db.inTransaction) return fn();
  return db.transaction(fn)();
}

module.exports = { db, migrate, now, id, slugify, uniqueSlug, json, tx, DATA_DIR, DB_PATH };
