-- ===========================================================================
-- PBIS CENTRAL CALENDAR — SCHEMA 001  (PostgreSQL port)
--
-- This file is the PostgreSQL port of db/migrations/001_init.sql (SQLite).
-- The two files describe ONE schema and must be kept in step: any change to
-- the SQLite migration has to be mirrored here in the same commit, and vice
-- versa. Table names, column names, column order, CHECK constraints, foreign
-- keys, unique constraints and index names are deliberately identical.
--
-- Conventions
--   * Text ids (cuid-style) so records can be created before insert and are
--     safe to expose in URLs.
--   * Dates are stored as school wall time in Asia/Vientiane:
--       date  = 'YYYY-MM-DD'   time = 'HH:MM'
--     Conversion to UTC happens only at the integration boundary (ICS, API
--     ISO output). The database never holds a device time zone.
--     Dates stay TEXT (not DATE): the application relies on lexicographic
--     'YYYY-MM-DD' comparison, which is identical in both dialects.
--   * Nothing is hard deleted. deleted_at is set instead.
--   * created_at / updated_at are ISO-8601 UTC instants.
--
-- Dialect notes
--   * No PRAGMA: foreign keys are always enforced in PostgreSQL.
--   * SQLite tolerates forward references in REFERENCES clauses; PostgreSQL
--     does not. Table creation order is unchanged, so the two forward
--     references (users.campus_id, attachments.submission_id) are attached
--     with ALTER TABLE further down, once the target table exists.
--   * INTEGER 0/1 flags become BOOLEAN; genuinely numeric integers stay
--     INTEGER.
--   * "public" and "rows" are quoted so the column names survive verbatim.
-- ===========================================================================

-- ------------------------------------------------------------------ people
CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  initials       TEXT NOT NULL,
  role           TEXT NOT NULL
                 CHECK (role IN ('super','caladmin','campusadmin','teacher','parent','student','public')),
  campus_id      TEXT,                           -- campus admins are scoped
                                                 -- FK added after campuses exists
  password_hash  TEXT,                           -- null when the account is SSO-only
  external_id    TEXT UNIQUE,                    -- Google Workspace subject
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_campus ON users(campus_id);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,          -- opaque, sent in a signed cookie
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  user_agent  TEXT,
  ip          TEXT,
  revoked_at  TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

-- Integration credentials: signage screens, the school website, the future app.
CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  scopes      TEXT NOT NULL DEFAULT 'read',   -- comma separated
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at  TEXT
);

-- -------------------------------------------------------------- structure
CREATE TABLE campuses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  short      TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  blurb      TEXT,
  colour     TEXT NOT NULL DEFAULT '#3D8062',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Deferred forward reference from users (declared above campuses).
ALTER TABLE users
  ADD CONSTRAINT users_campus_id_fkey FOREIGN KEY (campus_id) REFERENCES campuses(id);

CREATE TABLE year_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  campus_id  TEXT NOT NULL REFERENCES campuses(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_yeargroups_campus ON year_groups(campus_id);

CREATE TABLE academic_years (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'planning'
             CHECK (status IN ('draft','planning','active','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_ay_status ON academic_years(status);
CREATE INDEX idx_ay_range ON academic_years(start_date, end_date);

CREATE TABLE terms (
  id                TEXT PRIMARY KEY,
  academic_year_id  TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  start_date        TEXT NOT NULL,
  end_date          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned','active','complete')),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);
CREATE INDEX idx_terms_ay ON terms(academic_year_id);
CREATE INDEX idx_terms_range ON terms(start_date, end_date);

CREATE TABLE event_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  colour_var TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE audiences (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE locations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  campus_id  TEXT REFERENCES campuses(id),   -- null = shared across campuses
  capacity   INTEGER,
  archived   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_locations_campus ON locations(campus_id);

-- ----------------------------------------------------------------- events
CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',

  -- School wall time. start_date is indexed because every calendar query is
  -- a date-range query; this is what keeps range reads off a table scan.
  start_date    TEXT NOT NULL,
  end_date      TEXT,                 -- multi-day span, inclusive
  start_time    TEXT,                 -- null when all_day
  end_time      TEXT,
  all_day       BOOLEAN NOT NULL DEFAULT FALSE,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Vientiane',

  campus_id     TEXT REFERENCES campuses(id),        -- null = whole school
  category_id   TEXT NOT NULL REFERENCES event_categories(id),
  location_id   TEXT REFERENCES locations(id),
  organizer_id  TEXT REFERENCES users(id),
  academic_year_id TEXT REFERENCES academic_years(id),

  visibility    TEXT NOT NULL DEFAULT 'public'
                CHECK (visibility IN ('public','internal','restricted')),
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','pending','published','cancelled','postponed','completed','archived')),
  important     BOOLEAN NOT NULL DEFAULT FALSE,
  notify        BOOLEAN NOT NULL DEFAULT FALSE,

  -- RFC 5545 subset, stored as JSON text:
  --   {"freq":"weekly","interval":2,"byday":[5],"until":"2026-12-11","termTime":true}
  recurrence    TEXT,
  links         TEXT NOT NULL DEFAULT '[]',

  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','import','submission','rollover')),
  source_ref    TEXT,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  published_at  TEXT,
  created_by    TEXT REFERENCES users(id),
  updated_by    TEXT REFERENCES users(id),
  deleted_at    TEXT
);
CREATE INDEX idx_events_range     ON events(start_date, end_date);
CREATE INDEX idx_events_status    ON events(status);
CREATE INDEX idx_events_campus    ON events(campus_id);
CREATE INDEX idx_events_category  ON events(category_id);
CREATE INDEX idx_events_location  ON events(location_id, start_date);
CREATE INDEX idx_events_important ON events(important);
CREATE INDEX idx_events_ay        ON events(academic_year_id);
CREATE INDEX idx_events_live      ON events(status, visibility, start_date);

-- Many-to-many: an event can target several year groups and several audiences.
CREATE TABLE event_year_groups (
  event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  year_group_id TEXT NOT NULL REFERENCES year_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, year_group_id)
);
CREATE INDEX idx_eyg_yg ON event_year_groups(year_group_id);

CREATE TABLE event_audiences (
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  audience_id TEXT NOT NULL REFERENCES audiences(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, audience_id)
);
CREATE INDEX idx_ea_aud ON event_audiences(audience_id);

-- Full snapshot before every change to a published event (§83).
CREATE TABLE event_revisions (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  snapshot    TEXT NOT NULL,          -- JSON of the full event as it was
  changed_by  TEXT REFERENCES users(id),
  change_note TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (event_id, version)
);
CREATE INDEX idx_revisions_event ON event_revisions(event_id, version DESC);

CREATE TABLE attachments (
  id           TEXT PRIMARY KEY,
  event_id     TEXT REFERENCES events(id) ON DELETE CASCADE,
  submission_id TEXT,                 -- FK added after event_submissions exists
  filename     TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  storage_key  TEXT NOT NULL,         -- path on disk / object key in S3
  uploaded_by  TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX idx_attach_event ON attachments(event_id);

-- -------------------------------------------------------------- workflow
CREATE TABLE event_submissions (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  start_date    TEXT NOT NULL,
  end_date      TEXT,
  start_time    TEXT,
  end_time      TEXT,
  all_day       BOOLEAN NOT NULL DEFAULT FALSE,
  campus_id     TEXT REFERENCES campuses(id),
  category_id   TEXT REFERENCES event_categories(id),
  location_id   TEXT REFERENCES locations(id),
  year_group_ids TEXT NOT NULL DEFAULT '[]',   -- JSON array; a submission is not yet canonical
  audience_ids   TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('draft','pending','changes','approved','rejected')),
  reviewer_note TEXT,
  submitted_by  TEXT NOT NULL REFERENCES users(id),
  reviewed_by   TEXT REFERENCES users(id),
  published_event_id TEXT REFERENCES events(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_sub_status ON event_submissions(status);
CREATE INDEX idx_sub_user   ON event_submissions(submitted_by);

-- Deferred forward reference from attachments (declared above event_submissions).
ALTER TABLE attachments
  ADD CONSTRAINT attachments_submission_id_fkey
  FOREIGN KEY (submission_id) REFERENCES event_submissions(id) ON DELETE CASCADE;

-- ---------------------------------------------------------- distribution
CREATE TABLE calendars (
  id          TEXT PRIMARY KEY,     -- 'all', 'primary', 'yg-y5', 'important' …
  name        TEXT NOT NULL,
  description TEXT,
  scope_type  TEXT NOT NULL
              CHECK (scope_type IN ('all','campus','yeargroup','category','important','holidays','exams','personal')),
  scope_ref   TEXT,                 -- campus/year-group/category id when relevant
  "public"    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE calendar_subscriptions (
  id          TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,   -- personal feed address; revocable
  label       TEXT,
  created_at  TEXT NOT NULL,
  last_fetched_at TEXT,
  fetch_count INTEGER NOT NULL DEFAULT 0,
  revoked_at  TEXT
);
CREATE INDEX idx_subs_user ON calendar_subscriptions(user_id);

CREATE TABLE user_preferences (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  campus_id     TEXT REFERENCES campuses(id),
  year_group_id TEXT REFERENCES year_groups(id),
  audience_id   TEXT REFERENCES audiences(id),
  category_ids  TEXT NOT NULL DEFAULT '[]',
  theme         TEXT NOT NULL DEFAULT 'light',
  motion        TEXT NOT NULL DEFAULT 'on',
  onboarded     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TEXT NOT NULL
);

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  event_id    TEXT REFERENCES events(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL
              CHECK (kind IN ('new','updated','cancelled','postponed','reminder')),
  audience_ids TEXT NOT NULL DEFAULT '[]',
  campus_id   TEXT REFERENCES campuses(id),
  year_group_ids TEXT NOT NULL DEFAULT '[]',
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued','sent','failed','cancelled')),
  recipients  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL,
  sent_at     TEXT
);
CREATE INDEX idx_notif_status ON notifications(status);

-- --------------------------------------------------------------- jobs
CREATE TABLE import_jobs (
  id          TEXT PRIMARY KEY,
  filename    TEXT,
  format      TEXT NOT NULL CHECK (format IN ('csv','ics','xlsx')),
  mapping     TEXT NOT NULL DEFAULT '{}',
  "rows"      TEXT NOT NULL DEFAULT '[]',     -- parsed + validated preview
  row_count   INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'preview'
              CHECK (status IN ('preview','committed','cancelled','failed')),
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL,
  committed_at TEXT
);

CREATE TABLE export_jobs (
  id          TEXT PRIMARY KEY,
  scope       TEXT NOT NULL,
  format      TEXT NOT NULL CHECK (format IN ('ics','csv')),
  event_count INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL
);

-- ------------------------------------------------------------- governance
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,        -- created updated published cancelled postponed
                                    -- moved imported approved rejected archived restored
                                    -- signed_in signed_out
  entity      TEXT NOT NULL,        -- event, submission, campus, user …
  entity_id   TEXT,
  title       TEXT,
  detail      TEXT,                 -- JSON diff summary
  user_id     TEXT REFERENCES users(id),
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_audit_time   ON audit_log(created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_user   ON audit_log(user_id);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id)
);

-- schema_migrations is created by the migration runner itself, not by this
-- file — the same contract as the SQLite migration.

-- ===========================================================================
-- Postgres-specific notes (no DDL below this line)
--
--  * Foreign keys are always enforced; there is no PRAGMA foreign_keys
--    equivalent to switch on. The SQLite file's PRAGMA line has no analogue.
--  * Forward-declared foreign keys (users.campus_id, attachments.submission_id)
--    are added with ALTER TABLE immediately after their target table, so table
--    and column order still matches the SQLite file one-for-one.
--  * Date/time columns stay TEXT on purpose: application queries compare
--    'YYYY-MM-DD' strings lexicographically and ORDER BY / BETWEEN over TEXT
--    gives the same results as SQLite. Converting to DATE would change the
--    values the API returns and the collation-sensitive ordering; if it is
--    ever done, it must be done in both files at once. Note that TEXT ordering
--    is collation-dependent in Postgres — deployments should use a
--    deterministic collation (C or und-x-icu) for these columns to match
--    SQLite's BINARY comparison exactly.
--  * 0/1 flags are real BOOLEANs here (active, archived, all_day, important,
--    notify, "public", onboarded). Any application code that writes literal
--    0/1 for these must send true/false on Postgres.
--  * "public" and "rows" are quoted identifiers only to keep the names byte
--    identical to the SQLite schema; they are lowercase, so unquoted
--    references (public, rows) resolve to the same columns.
--  * Suggested partial indexes, if read volume warrants them. They are NOT
--    created here so the two schemas stay index-for-index identical; add them
--    in a later migration applied to both engines:
--       CREATE INDEX idx_events_live_active ON events(start_date)
--         WHERE deleted_at IS NULL AND status = 'published';
--       CREATE INDEX idx_events_important_live ON events(start_date)
--         WHERE important AND deleted_at IS NULL;
--       CREATE INDEX idx_sessions_active ON sessions(expires_at)
--         WHERE revoked_at IS NULL;
--  * JSON-bearing TEXT columns (recurrence, links, snapshot, detail, mapping,
--    "rows", the *_ids arrays) could become JSONB in Postgres. They stay TEXT
--    so both engines round-trip the exact same strings.
-- ===========================================================================
