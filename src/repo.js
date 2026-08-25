'use strict';
/* ==========================================================================
   Repository. Every read of an event goes through here so the visibility
   clause is never accidentally omitted.
   ========================================================================== */

const { db, now, id, json, uniqueSlug, tx } = require('./db');
const T = require('./lib/time');
const R = require('./lib/recurrence');
const V = require('./lib/visibility');

/* ------------------------------------------------------------- taxonomy */
/**
 * Days the school is closed: holidays, half terms, training days. Computed
 * from the calendar itself rather than a separate list, so a closure only has
 * to be entered once — as an event.
 */
let closureCache = { key: null, set: null };
function closureDates(from, to) {
  const key = `${from}|${to}`;
  if (closureCache.key === key) return closureCache.set;
  const rows = db.prepare(`
    SELECT start_date, end_date FROM events
    WHERE category_id = 'holiday' AND deleted_at IS NULL
      AND status NOT IN ('cancelled','draft','archived')
      AND start_date <= ? AND COALESCE(end_date, start_date) >= ?`).all(to, from);
  const set = new Set();
  for (const r of rows) {
    const last = r.end_date || r.start_date;
    let d = r.start_date, guard = 0;
    while (d <= last && guard++ < 400) { set.add(d); d = T.addDays(d, 1); }
  }
  closureCache = { key, set };
  return set;
}
function invalidateClosures() { closureCache = { key: null, set: null }; }

const taxonomy = {
  campuses: () => db.prepare('SELECT * FROM campuses WHERE deleted_at IS NULL ORDER BY sort_order').all(),
  yearGroups: () => db.prepare('SELECT * FROM year_groups WHERE deleted_at IS NULL ORDER BY sort_order').all(),
  categories: () => db.prepare('SELECT * FROM event_categories WHERE deleted_at IS NULL ORDER BY sort_order').all(),
  audiences: () => db.prepare('SELECT * FROM audiences WHERE deleted_at IS NULL ORDER BY sort_order').all(),
  locations: () => db.prepare('SELECT * FROM locations WHERE deleted_at IS NULL ORDER BY name').all(),
  academicYears: () => db.prepare('SELECT * FROM academic_years WHERE deleted_at IS NULL ORDER BY start_date').all(),
  terms: () => db.prepare('SELECT * FROM terms WHERE deleted_at IS NULL ORDER BY start_date').all(),
  activeYear: () => db.prepare("SELECT * FROM academic_years WHERE status='active' AND deleted_at IS NULL").get(),
  termsFor: (ayId) => db.prepare('SELECT * FROM terms WHERE academic_year_id=? AND deleted_at IS NULL ORDER BY sort_order').all(ayId),
  all() {
    return {
      campuses: this.campuses(), yearGroups: this.yearGroups(), categories: this.categories(),
      audiences: this.audiences(), locations: this.locations(),
      academicYears: this.academicYears(), terms: this.terms()
    };
  }
};

/* --------------------------------------------------------------- events */
const SELECT_EVENT = `
  SELECT e.*,
         (SELECT group_concat(year_group_id) FROM event_year_groups WHERE event_id = e.id) AS yg_ids,
         (SELECT group_concat(audience_id)   FROM event_audiences   WHERE event_id = e.id) AS aud_ids
  FROM events e`;

function hydrate(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    date: row.start_date,
    endDate: row.end_date || null,
    start: row.start_time || null,
    end: row.end_time || null,
    allDay: !!row.all_day,
    timezone: row.timezone,
    campusId: row.campus_id || null,
    categoryId: row.category_id,
    locationId: row.location_id || null,
    organizerId: row.organizer_id || null,
    academicYearId: row.academic_year_id || null,
    yearGroupIds: row.yg_ids ? row.yg_ids.split(',') : [],
    audienceIds: row.aud_ids ? row.aud_ids.split(',') : [],
    visibility: row.visibility,
    status: row.status,
    important: !!row.important,
    notify: !!row.notify,
    recurrence: json.parse(row.recurrence, null),
    links: json.parse(row.links, []),
    attachments: attachmentsFor(row.id),
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || null,
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null
  };
}

// Prepared lazily: this module is loaded by the migration/seed scripts too,
// before the tables exist.
let attachStmt = null;
function attachmentsFor(eventId) {
  if (!attachStmt) attachStmt = db.prepare(
    'SELECT id, filename, mime, size_bytes FROM attachments WHERE event_id=? AND deleted_at IS NULL');
  return attachStmt.all(eventId).map(a => ({
    id: a.id, name: a.filename, mime: a.mime, size: a.size_bytes,
    url: `/api/v1/attachments/${a.id}`
  }));
}

/**
 * Range query. This is the hot path: it hits idx_events_range rather than
 * scanning, and only widens for recurring events (a small, bounded set).
 */
function listInRange(viewer, opts = {}) {
  const from = opts.from || T.todayKey();
  const to = opts.to || T.addDays(from, 60);
  const scope = V.eventScopeSql(viewer);
  const where = [scope.sql];
  const params = [...scope.params];

  // Non-recurring events overlapping the window …
  where.push(`(
    (e.recurrence IS NULL AND e.start_date <= ? AND COALESCE(e.end_date, e.start_date) >= ?)
    OR (e.recurrence IS NOT NULL AND e.start_date <= ?)
  )`);
  params.push(to, from, to);

  applyFilters(opts, where, params);

  const rows = db.prepare(`${SELECT_EVENT} WHERE ${where.join(' AND ')} ORDER BY e.start_date`).all(...params);

  // Expand to occurrences using the same engine the UI uses.
  const cal = { terms: taxonomy.terms(), closures: closureDates(from, to) };
  const out = [];
  for (const row of rows) {
    const ev = hydrate(row);
    const occ = R.expand(
      { start_date: row.start_date, end_date: row.end_date, recurrence: ev.recurrence },
      from, to, cal
    );
    for (const o of occ) out.push({ ...o, event: ev });
  }
  out.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1
      : (a.event.allDay ? 0 : 1) - (b.event.allDay ? 0 : 1)
      || T.toMin(a.event.start || '00:00') - T.toMin(b.event.start || '00:00')
      || a.event.title.localeCompare(b.event.title));
  return out;
}

function applyFilters(opts, where, params) {
  if (opts.campus) {
    const ids = [].concat(opts.campus);
    where.push(`(e.campus_id IS NULL OR e.campus_id IN (${ids.map(() => '?').join(',')}))`);
    params.push(...ids);
  }
  if (opts.category) {
    const ids = [].concat(opts.category);
    where.push(`e.category_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (opts.status) {
    const ids = [].concat(opts.status);
    where.push(`e.status IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (opts.visibility) {
    const ids = [].concat(opts.visibility);
    where.push(`e.visibility IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (opts.important) where.push('e.important = 1');
  if (opts.yearGroup) {
    const ids = [].concat(opts.yearGroup);
    // An event with no year groups targets the whole campus, so it stays.
    where.push(`(
      NOT EXISTS (SELECT 1 FROM event_year_groups g WHERE g.event_id = e.id)
      OR EXISTS (SELECT 1 FROM event_year_groups g WHERE g.event_id = e.id
                 AND g.year_group_id IN (${ids.map(() => '?').join(',')}))
    )`);
    params.push(...ids);
  }
  if (opts.audience) {
    const ids = [].concat(opts.audience);
    where.push(`(
      NOT EXISTS (SELECT 1 FROM event_audiences a WHERE a.event_id = e.id)
      OR EXISTS (SELECT 1 FROM event_audiences a WHERE a.event_id = e.id
                 AND a.audience_id IN (${ids.map(() => '?').join(',')}))
    )`);
    params.push(...ids);
  }
  if (opts.q && String(opts.q).trim()) {
    const q = `%${String(opts.q).trim().toLowerCase()}%`;
    where.push(`(
      lower(e.title) LIKE ? OR lower(e.description) LIKE ?
      OR EXISTS (SELECT 1 FROM locations l WHERE l.id = e.location_id AND lower(l.name) LIKE ?)
      OR EXISTS (SELECT 1 FROM campuses c WHERE c.id = e.campus_id AND lower(c.name) LIKE ?)
      OR EXISTS (SELECT 1 FROM event_categories k WHERE k.id = e.category_id AND lower(k.name) LIKE ?)
      OR EXISTS (SELECT 1 FROM users u WHERE u.id = e.organizer_id AND lower(u.name) LIKE ?)
    )`);
    params.push(q, q, q, q, q, q);
  }
}

/** Flat list (no occurrence expansion) with pagination — used by the CMS table. */
function listEvents(viewer, opts = {}) {
  const scope = V.eventScopeSql(viewer);
  const where = [scope.sql];
  const params = [...scope.params];
  if (opts.from) { where.push('COALESCE(e.end_date, e.start_date) >= ?'); params.push(opts.from); }
  if (opts.to) { where.push('e.start_date <= ?'); params.push(opts.to); }
  applyFilters(opts, where, params);

  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT count(*) c FROM events e WHERE ${whereSql}`).get(...params).c;

  const sortCols = {
    date: 'e.start_date', title: 'e.title', status: 'e.status',
    campus: 'e.campus_id', category: 'e.category_id', updated: 'e.updated_at'
  };
  const col = sortCols[opts.sort] || 'e.start_date';
  const dir = opts.dir === 'desc' ? 'DESC' : 'ASC';
  const limit = Math.min(500, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);

  const rows = db.prepare(
    `${SELECT_EVENT} WHERE ${whereSql} ORDER BY ${col} ${dir}, e.id LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return { total, limit, offset, events: rows.map(hydrate) };
}

function getEvent(viewer, idOrSlug) {
  const scope = V.eventScopeSql(viewer);
  const row = db.prepare(
    `${SELECT_EVENT} WHERE (e.id = ? OR e.slug = ?) AND ${scope.sql}`
  ).get(idOrSlug, idOrSlug, ...scope.params);
  return hydrate(row);
}

/** Raw fetch that ignores visibility — only for internal writes after an
    explicit permission check. */
function getEventRaw(idOrSlug) {
  return hydrate(db.prepare(`${SELECT_EVENT} WHERE e.id = ? OR e.slug = ?`).get(idOrSlug, idOrSlug));
}

/* ---------------------------------------------------------------- writes */
function academicYearFor(dateKey) {
  const ay = db.prepare(
    'SELECT id FROM academic_years WHERE ? BETWEEN start_date AND end_date AND deleted_at IS NULL'
  ).get(dateKey);
  return ay ? ay.id : null;
}

function setLinks(eventId, ygIds, audIds) {
  db.prepare('DELETE FROM event_year_groups WHERE event_id=?').run(eventId);
  db.prepare('DELETE FROM event_audiences WHERE event_id=?').run(eventId);
  const g = db.prepare('INSERT OR IGNORE INTO event_year_groups (event_id, year_group_id) VALUES (?,?)');
  const a = db.prepare('INSERT OR IGNORE INTO event_audiences (event_id, audience_id) VALUES (?,?)');
  (ygIds || []).forEach(x => g.run(eventId, x));
  (audIds || []).forEach(x => a.run(eventId, x));
}

function createEvent(input, user) {
  return tx(() => {
    const eid = id('evt');
    const ts = now();
    const slug = uniqueSlug('events', `${input.title}-${input.date.slice(2, 7).replace('-', '')}`);
    db.prepare(`INSERT INTO events (
      id, slug, title, description, start_date, end_date, start_time, end_time, all_day, timezone,
      campus_id, category_id, location_id, organizer_id, academic_year_id,
      visibility, status, important, notify, recurrence, links, source, source_ref,
      created_at, updated_at, published_at, created_by, updated_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      eid, slug, input.title, input.description || '',
      input.date, input.endDate || null,
      input.allDay ? null : (input.start || null),
      input.allDay ? null : (input.end || null),
      input.allDay ? 1 : 0, 'Asia/Vientiane',
      input.campusId || null, input.categoryId, input.locationId || null,
      input.organizerId || (user && user.id) || null, academicYearFor(input.date),
      input.visibility || 'public', input.status || 'draft',
      input.important ? 1 : 0, input.notify ? 1 : 0,
      input.recurrence ? json.stringify(input.recurrence) : null,
      json.stringify(input.links || []),
      input.source || 'manual', input.sourceRef || null,
      ts, ts, input.status === 'published' ? ts : null,
      user ? user.id : null, user ? user.id : null
    );
    setLinks(eid, input.yearGroupIds, input.audienceIds);
    invalidateClosures();
    audit('created', 'event', eid, input.title, user);
    return getEventRaw(eid);
  });
}

/* Columns declared NOT NULL: an empty value is stored as '' rather than null. */
const NON_NULL_TEXT = new Set(['title', 'description', 'date', 'visibility', 'status', 'source']);

const EDITABLE = {
  title: 'title', description: 'description', date: 'start_date', endDate: 'end_date',
  start: 'start_time', end: 'end_time', campusId: 'campus_id', categoryId: 'category_id',
  locationId: 'location_id', organizerId: 'organizer_id', visibility: 'visibility',
  status: 'status', source: 'source'
};

function updateEvent(eventId, patch, user, opts = {}) {
  return tx(() => {
    const before = getEventRaw(eventId);
    if (!before) return null;

    // Snapshot before every change to something already published (§83).
    if (before.status === 'published' || before.publishedAt) {
      const v = (db.prepare('SELECT COALESCE(MAX(version),0) v FROM event_revisions WHERE event_id=?')
        .get(eventId).v) + 1;
      db.prepare(`INSERT INTO event_revisions (id, event_id, version, snapshot, changed_by, change_note, created_at)
                  VALUES (?,?,?,?,?,?,?)`)
        .run(id('rev'), eventId, v, JSON.stringify(before), user ? user.id : null,
             opts.note || null, now());
    }

    const sets = [], params = [];
    for (const [key, col] of Object.entries(EDITABLE)) {
      if (patch[key] !== undefined) {
        // An empty string means "cleared" for optional columns, but several
        // columns are NOT NULL — blanking a description must store '', not null.
        const v = patch[key] === '' && !NON_NULL_TEXT.has(key) ? null : patch[key];
        sets.push(`${col} = ?`); params.push(v);
      }
    }
    if (patch.allDay !== undefined) {
      sets.push('all_day = ?'); params.push(patch.allDay ? 1 : 0);
      if (patch.allDay) { sets.push('start_time = NULL', 'end_time = NULL'); }
    }
    if (patch.important !== undefined) { sets.push('important = ?'); params.push(patch.important ? 1 : 0); }
    if (patch.notify !== undefined) { sets.push('notify = ?'); params.push(patch.notify ? 1 : 0); }
    if (patch.recurrence !== undefined) {
      sets.push('recurrence = ?'); params.push(patch.recurrence ? json.stringify(patch.recurrence) : null);
    }
    if (patch.links !== undefined) { sets.push('links = ?'); params.push(json.stringify(patch.links)); }
    if (patch.date !== undefined) { sets.push('academic_year_id = ?'); params.push(academicYearFor(patch.date)); }
    if (patch.status === 'published' && !before.publishedAt) { sets.push('published_at = ?'); params.push(now()); }

    sets.push('updated_at = ?'); params.push(now());
    sets.push('updated_by = ?'); params.push(user ? user.id : null);

    if (sets.length) db.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`).run(...params, eventId);
    if (patch.yearGroupIds !== undefined || patch.audienceIds !== undefined) {
      setLinks(eventId,
        patch.yearGroupIds !== undefined ? patch.yearGroupIds : before.yearGroupIds,
        patch.audienceIds !== undefined ? patch.audienceIds : before.audienceIds);
    }
    invalidateClosures();
    audit(opts.action || 'updated', 'event', eventId, before.title, user, diffSummary(before, patch));
    return getEventRaw(eventId);
  });
}

function diffSummary(before, patch) {
  const changed = [];
  for (const k of Object.keys(patch)) {
    if (k === 'yearGroupIds' || k === 'audienceIds') continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(patch[k])) {
      changed.push({ field: k, from: before[k], to: patch[k] });
    }
  }
  return changed.length ? JSON.stringify(changed).slice(0, 2000) : null;
}

/** Soft delete (§84). The row stays, with its history. */
function archiveEvent(eventId, user) {
  const before = getEventRaw(eventId);
  if (!before) return null;
  updateEvent(eventId, { status: 'archived' }, user, { action: 'archived' });
  db.prepare('UPDATE events SET deleted_at=? WHERE id=?').run(now(), eventId);
  invalidateClosures();
  return true;
}

function restoreEvent(eventId, user) {
  db.prepare('UPDATE events SET deleted_at=NULL, status=?, updated_at=? WHERE id=?')
    .run('draft', now(), eventId);
  audit('restored', 'event', eventId, null, user);
  return getEventRaw(eventId);
}

function revisions(eventId) {
  return db.prepare(
    'SELECT id, version, changed_by, change_note, created_at FROM event_revisions WHERE event_id=? ORDER BY version DESC'
  ).all(eventId);
}
function revision(eventId, version) {
  const r = db.prepare('SELECT * FROM event_revisions WHERE event_id=? AND version=?').get(eventId, version);
  return r ? { ...r, snapshot: json.parse(r.snapshot, null) } : null;
}

/* ---------------------------------------------------------- conflicts */
function findConflicts(candidate, ignoreId) {
  if (!candidate.locationId || candidate.allDay || !candidate.start) return [];
  const from = candidate.date;
  const to = candidate.endDate || candidate.date;
  const rows = db.prepare(`
    ${SELECT_EVENT}
    WHERE e.location_id = ? AND e.deleted_at IS NULL AND e.all_day = 0
      AND e.status NOT IN ('cancelled','archived','draft')
      AND (e.id != ? OR ? IS NULL)
      AND e.start_date <= ?`).all(candidate.locationId, ignoreId || '', ignoreId || null, to);

  const cs = T.toMin(candidate.start), ce = T.toMin(candidate.end || '23:59');
  const cal = { terms: taxonomy.terms(), closures: closureDates(from, to) };
  const out = [];
  for (const row of rows) {
    const ev = hydrate(row);
    const occ = R.expand({ start_date: row.start_date, end_date: row.end_date, recurrence: ev.recurrence },
      from, to, cal);
    for (const o of occ) {
      const es = T.toMin(ev.start || '00:00'), ee = T.toMin(ev.end || '23:59');
      if (cs < ee && es < ce) out.push({ event: ev, date: o.date });
    }
  }
  return out;
}

/** Every location double-booking in a window (dashboard + rollover). */
function allConflicts(viewer, from, to) {
  const occ = listInRange(viewer, { from, to, status: ['published','pending','postponed'] });
  const byKey = new Map();
  for (const o of occ) {
    if (!o.event.locationId || o.event.allDay) continue;
    const k = `${o.event.locationId}|${o.date}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(o.event);
  }
  const out = [];
  for (const [k, list] of byKey) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const as = T.toMin(a.start || '0:00'), ae = T.toMin(a.end || '23:59');
      const bs = T.toMin(b.start || '0:00'), be = T.toMin(b.end || '23:59');
      if (as < be && bs < ae) out.push({ a, b, date: k.split('|')[1], locationId: k.split('|')[0] });
    }
  }
  return out;
}

/* ------------------------------------------------------------- audit */
function audit(action, entity, entityId, title, user, detail) {
  db.prepare(`INSERT INTO audit_log (id, action, entity, entity_id, title, detail, user_id, ip, created_at)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id('aud'), action, entity, entityId || null, title || null, detail || null,
         user ? user.id : null, (user && user.ip) || null, now());
}

function auditList(opts = {}) {
  const where = [], params = [];
  if (opts.entity) { where.push('a.entity = ?'); params.push(opts.entity); }
  if (opts.entityId) { where.push('a.entity_id = ?'); params.push(opts.entityId); }
  if (opts.q) {
    where.push('(lower(a.title) LIKE ? OR lower(a.action) LIKE ? OR lower(u.name) LIKE ?)');
    const q = `%${String(opts.q).toLowerCase()}%`; params.push(q, q, q);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(500, Number(opts.limit) || 100);
  const offset = Math.max(0, Number(opts.offset) || 0);
  const total = db.prepare(`SELECT count(*) c FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ${w}`)
    .get(...params).c;
  const rows = db.prepare(`
    SELECT a.*, u.name AS user_name, u.role AS user_role
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    ${w} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { total, entries: rows };
}

module.exports = {
  taxonomy, hydrate, closureDates, invalidateClosures, listInRange, listEvents, getEvent, getEventRaw,
  createEvent, updateEvent, archiveEvent, restoreEvent, revisions, revision,
  findConflicts, allConflicts, audit, auditList, academicYearFor, setLinks, SELECT_EVENT
};
