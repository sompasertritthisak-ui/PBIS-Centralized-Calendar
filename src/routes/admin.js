'use strict';
/* ==========================================================================
   LAYER 3 — ADMINISTRATIVE API
   Everything the CMS does. Each route declares the permission it needs; the
   repository re-applies campus scoping so a campus admin cannot reach past
   their own campus even with a hand-crafted request.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { db, now, id, json, slugify, uniqueSlug, tx, DATA_DIR } = require('../db');
const repo = require('../repo');
const auth = require('../auth');
const V = require('../lib/visibility');
const T = require('../lib/time');
const R = require('../lib/recurrence');
const { shapeSubmission, validateSubmission } = require('./me');

function validateEvent(b, partial) {
  const e = [];
  const has = k => b[k] !== undefined;
  if (!partial || has('title')) {
    if (!b.title || !String(b.title).trim()) e.push({ field: 'title', message: 'An event name is required.' });
    else if (String(b.title).length > 200) e.push({ field: 'title', message: 'Event name is too long (200 characters maximum).' });
  }
  if (!partial || has('date')) {
    if (!T.isDateKey(b.date)) e.push({ field: 'date', message: 'A valid date is required (YYYY-MM-DD).' });
  }
  if (has('endDate') && b.endDate && !T.isDateKey(b.endDate)) e.push({ field: 'endDate', message: 'End date must be YYYY-MM-DD.' });
  if (b.date && b.endDate && b.endDate < b.date) e.push({ field: 'endDate', message: 'End date cannot be before the start date.' });
  if (!b.allDay) {
    if (b.start && !T.isTime(b.start)) e.push({ field: 'start', message: 'Start time must be HH:MM.' });
    if (b.end && !T.isTime(b.end)) e.push({ field: 'end', message: 'End time must be HH:MM.' });
    if (b.start && b.end && T.toMin(b.end) <= T.toMin(b.start)) e.push({ field: 'end', message: 'The end time must be after the start time.' });
  }
  if (has('visibility') && b.visibility && !['public','internal','restricted'].includes(b.visibility)) {
    e.push({ field: 'visibility', message: 'Unknown visibility.' });
  }
  if (has('status') && b.status &&
      !['draft','pending','published','cancelled','postponed','completed','archived'].includes(b.status)) {
    e.push({ field: 'status', message: 'Unknown status.' });
  }
  if (has('categoryId') && b.categoryId && !db.prepare('SELECT 1 FROM event_categories WHERE id=?').get(b.categoryId)) {
    e.push({ field: 'categoryId', message: 'Unknown category.' });
  }
  if (b.campusId && !db.prepare('SELECT 1 FROM campuses WHERE id=?').get(b.campusId)) {
    e.push({ field: 'campusId', message: 'Unknown campus.' });
  }
  if (b.locationId && !db.prepare('SELECT 1 FROM locations WHERE id=?').get(b.locationId)) {
    e.push({ field: 'locationId', message: 'Unknown location.' });
  }
  for (const y of (b.yearGroupIds || [])) {
    if (!db.prepare('SELECT 1 FROM year_groups WHERE id=?').get(y)) {
      e.push({ field: 'yearGroupIds', message: `Unknown year group: ${y}` }); break;
    }
  }
  return e;
}

/** A campus admin may only file events against their own campus. */
function enforceCampusScope(user, body, reply) {
  if (user.role !== 'campusadmin') return true;
  if (!body.campusId || body.campusId !== user.campus_id) {
    reply.code(403).send({ error: 'forbidden',
      message: 'Campus administrators may only manage events for their own campus.' });
    return false;
  }
  return true;
}

module.exports = async function adminRoutes(app) {
  const need = action => ({ onRequest: [app.requirePermission(action)] });

  /* ------------------------------------------------------- dashboard */
  app.get('/api/v1/admin/dashboard', need('accessCms'), async (req) => {
    const today = T.todayKey();
    const scope = V.eventScopeSql(req.user);
    const count = extra => db.prepare(
      `SELECT count(*) c FROM events e WHERE ${scope.sql}${extra ? ' AND ' + extra : ''}`).get(...scope.params).c;
    const conflicts = repo.allConflicts(req.user, today, T.addDays(today, 300));
    return {
      data: {
        totals: {
          events: count(),
          upcoming: db.prepare(`SELECT count(*) c FROM events e WHERE ${scope.sql} AND e.start_date >= ? AND e.status='published'`)
            .get(...scope.params, today).c,
          drafts: count("e.status='draft'"),
          important: count('e.important = 1'),
          pendingSubmissions: db.prepare("SELECT count(*) c FROM event_submissions WHERE status='pending' AND deleted_at IS NULL").get().c,
          conflicts: conflicts.length
        },
        byCampus: db.prepare(`SELECT COALESCE(e.campus_id,'__all') k, count(*) c FROM events e WHERE ${scope.sql} GROUP BY k`)
          .all(...scope.params),
        byCategory: db.prepare(`SELECT e.category_id k, count(*) c FROM events e WHERE ${scope.sql} GROUP BY k ORDER BY c DESC`)
          .all(...scope.params),
        conflicts: conflicts.slice(0, 20).map(c => ({
          date: c.date, locationId: c.locationId,
          a: { id: c.a.id, title: c.a.title, start: c.a.start, end: c.a.end },
          b: { id: c.b.id, title: c.b.title, start: c.b.start, end: c.b.end }
        })),
        recentActivity: repo.auditList({ limit: 10 }).entries
      }
    };
  });

  /* ---------------------------------------------------------- events */
  app.get('/api/v1/admin/events', need('accessCms'), async (req) => {
    const q = req.query;
    const result = repo.listEvents(req.user, {
      from: T.isDateKey(q.from) ? q.from : undefined,
      to: T.isDateKey(q.to) ? q.to : undefined,
      status: q.status ? String(q.status).split(',') : undefined,
      campus: q.campus ? String(q.campus).split(',') : undefined,
      category: q.category ? String(q.category).split(',') : undefined,
      q: q.q, sort: q.sort, dir: q.dir,
      limit: q.limit, offset: q.offset
    });
    return { data: result.events, meta: { total: result.total, limit: result.limit, offset: result.offset } };
  });

  app.post('/api/v1/admin/events', need('create'), async (req, reply) => {
    const b = req.body || {};
    const errors = validateEvent(b, false);
    if (errors.length) return reply.code(422).send({ error: 'validation_failed', errors });
    if (!enforceCampusScope(req.user, b, reply)) return reply;

    const conflicts = repo.findConflicts(b, null);
    if (conflicts.length && !b.acknowledgeConflict && b.status === 'published') {
      return reply.code(409).send({
        error: 'conflict', message: 'The location is already booked for that time.',
        conflicts: conflicts.map(c => ({ id: c.event.id, title: c.event.title, date: c.date,
          start: c.event.start, end: c.event.end }))
      });
    }
    const ev = repo.createEvent(b, req.user);
    if (b.notify && b.status === 'published') queueNotification(ev, 'new', req.user);
    return reply.code(201).send({ data: ev, conflicts: conflicts.length ? conflicts.map(c => ({ title: c.event.title, date: c.date })) : [] });
  });

  app.get('/api/v1/admin/events/:id', need('accessCms'), async (req, reply) => {
    const ev = repo.getEvent(req.user, req.params.id);
    if (!ev) return reply.code(404).send({ error: 'not_found' });
    return { data: ev, revisions: repo.revisions(ev.id) };
  });

  app.patch('/api/v1/admin/events/:id', need('edit'), async (req, reply) => {
    const before = repo.getEventRaw(req.params.id);
    if (!before) return reply.code(404).send({ error: 'not_found' });
    if (!V.canEditEvent(req.user, { campus_id: before.campusId })) {
      return reply.code(403).send({ error: 'forbidden', message: 'This event belongs to another campus.' });
    }
    const b = req.body || {};
    const merged = { ...before, ...b };
    const errors = validateEvent(merged, true);
    if (errors.length) return reply.code(422).send({ error: 'validation_failed', errors });

    if (merged.status === 'published' && !b.acknowledgeConflict) {
      const conflicts = repo.findConflicts(merged, before.id);
      if (conflicts.length) {
        return reply.code(409).send({ error: 'conflict',
          conflicts: conflicts.map(c => ({ id: c.event.id, title: c.event.title, date: c.date })) });
      }
    }
    const action = b.status && b.status !== before.status
      ? ({ published: 'published', cancelled: 'cancelled', postponed: 'postponed', archived: 'archived' }[b.status] || 'updated')
      : (b.date && b.date !== before.date ? 'moved' : 'updated');
    const ev = repo.updateEvent(req.params.id, b, req.user, { action, note: b.changeNote });
    if (b.notify && ev.status === 'published') {
      queueNotification(ev, before.status === 'published' ? 'updated' : 'new', req.user);
    }
    if (ev.status === 'cancelled' && before.status !== 'cancelled') queueNotification(ev, 'cancelled', req.user);
    return { data: ev };
  });

  app.delete('/api/v1/admin/events/:id', need('edit'), async (req, reply) => {
    const before = repo.getEventRaw(req.params.id);
    if (!before) return reply.code(404).send({ error: 'not_found' });
    if (!V.canEditEvent(req.user, { campus_id: before.campusId })) return reply.code(403).send({ error: 'forbidden' });
    repo.archiveEvent(req.params.id, req.user);
    return { data: { archived: true, id: req.params.id, restorable: true } };
  });

  app.post('/api/v1/admin/events/:id/restore', need('edit'), async (req) =>
    ({ data: repo.restoreEvent(req.params.id, req.user) }));

  app.post('/api/v1/admin/events/:id/duplicate', need('create'), async (req, reply) => {
    const src = repo.getEventRaw(req.params.id);
    if (!src) return reply.code(404).send({ error: 'not_found' });
    const b = req.body || {};
    const copy = { ...src, id: undefined, slug: undefined, status: 'draft',
      title: b.title || `${src.title} (copy)`,
      date: b.date || src.date,
      campusId: b.campusId !== undefined ? b.campusId : src.campusId,
      yearGroupIds: b.yearGroupIds !== undefined ? b.yearGroupIds : src.yearGroupIds };
    if (!enforceCampusScope(req.user, copy, reply)) return reply;
    return reply.code(201).send({ data: repo.createEvent(copy, req.user) });
  });

  /* ------------------------------------------------------ bulk actions */
  app.post('/api/v1/admin/events/bulk', need('edit'), async (req, reply) => {
    const { ids, operation, value } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return reply.code(422).send({ error: 'no_ids' });
    if (ids.length > 500) return reply.code(422).send({ error: 'too_many', message: 'Maximum 500 events per bulk action.' });

    const OPS = {
      publish:   () => ({ status: 'published' }),
      unpublish: () => ({ status: 'draft' }),
      cancel:    () => ({ status: 'cancelled' }),
      archive:   () => ({ status: 'archived' }),
      important: () => ({ important: true }),
      unimportant: () => ({ important: false }),
      campus:    () => ({ campusId: value || null }),
      category:  () => ({ categoryId: value }),
      visibility:() => ({ visibility: value }),
      move:      null   // handled separately: value is a day offset
    };
    if (!(operation in OPS)) return reply.code(422).send({ error: 'unknown_operation' });

    const results = tx(() => {
      const out = { updated: [], skipped: [] };
      for (const eid of ids) {
        const ev = repo.getEventRaw(eid);
        if (!ev) { out.skipped.push({ id: eid, reason: 'not_found' }); continue; }
        if (!V.canEditEvent(req.user, { campus_id: ev.campusId })) {
          out.skipped.push({ id: eid, reason: 'forbidden' }); continue;
        }
        let patch;
        if (operation === 'move') {
          const days = Number(value);
          if (!Number.isFinite(days)) { out.skipped.push({ id: eid, reason: 'bad_offset' }); continue; }
          patch = { date: T.addDays(ev.date, days) };
          if (ev.endDate) patch.endDate = T.addDays(ev.endDate, days);
        } else if (operation === 'archive') {
          repo.archiveEvent(eid, req.user); out.updated.push(eid); continue;
        } else {
          patch = OPS[operation]();
        }
        repo.updateEvent(eid, patch, req.user, { action: operation === 'move' ? 'moved' : 'updated' });
        out.updated.push(eid);
      }
      return out;
    });
    repo.audit('bulk ' + operation, 'event', null, `${results.updated.length} events`, req.user);
    return { data: results };
  });

  /* -------------------------------------------------------- revisions */
  app.get('/api/v1/admin/events/:id/revisions', need('accessCms'), async (req) =>
    ({ data: repo.revisions(req.params.id) }));

  app.get('/api/v1/admin/events/:id/revisions/:version', need('accessCms'), async (req, reply) => {
    const rev = repo.revision(req.params.id, Number(req.params.version));
    if (!rev) return reply.code(404).send({ error: 'not_found' });
    const current = repo.getEventRaw(req.params.id);
    const fields = ['title','description','date','endDate','start','end','allDay','campusId','categoryId',
      'locationId','visibility','status','important','yearGroupIds','audienceIds'];
    const diff = fields
      .filter(f => JSON.stringify(rev.snapshot[f]) !== JSON.stringify(current[f]))
      .map(f => ({ field: f, was: rev.snapshot[f], now: current[f] }));
    return { data: { revision: rev, current, diff } };
  });

  app.post('/api/v1/admin/events/:id/revisions/:version/restore', need('edit'), async (req, reply) => {
    const rev = repo.revision(req.params.id, Number(req.params.version));
    if (!rev) return reply.code(404).send({ error: 'not_found' });
    const s = rev.snapshot;
    const ev = repo.updateEvent(req.params.id, {
      title: s.title, description: s.description, date: s.date, endDate: s.endDate,
      start: s.start, end: s.end, allDay: s.allDay, campusId: s.campusId, categoryId: s.categoryId,
      locationId: s.locationId, visibility: s.visibility, status: s.status, important: s.important,
      recurrence: s.recurrence, links: s.links, yearGroupIds: s.yearGroupIds, audienceIds: s.audienceIds
    }, req.user, { action: 'restored', note: `Restored from version ${rev.version}` });
    return { data: ev };
  });

  /* ------------------------------------------------------- conflicts */
  app.post('/api/v1/admin/conflicts/check', need('accessCms'), async (req) =>
    ({ data: repo.findConflicts(req.body || {}, (req.body || {}).ignoreId)
        .map(c => ({ id: c.event.id, title: c.event.title, date: c.date, start: c.event.start, end: c.event.end })) }));

  app.get('/api/v1/admin/conflicts', need('accessCms'), async (req) => {
    const from = T.isDateKey(req.query.from) ? req.query.from : T.todayKey();
    const to = T.isDateKey(req.query.to) ? req.query.to : T.addDays(from, 300);
    return { data: repo.allConflicts(req.user, from, to) };
  });

  /* ----------------------------------------------------- submissions */
  app.get('/api/v1/admin/submissions', need('accessCms'), async (req) => {
    const status = req.query.status;
    const rows = status && status !== 'all'
      ? db.prepare('SELECT * FROM event_submissions WHERE status=? AND deleted_at IS NULL ORDER BY created_at DESC').all(status)
      : db.prepare('SELECT * FROM event_submissions WHERE deleted_at IS NULL ORDER BY created_at DESC').all();
    return { data: rows.map(r => {
      const s = shapeSubmission(r);
      s.conflicts = repo.findConflicts({ locationId: s.locationId, date: s.date, endDate: s.endDate,
        start: s.start, end: s.end, allDay: s.allDay }).map(c => ({ title: c.event.title, date: c.date }));
      return s;
    }) };
  });

  app.post('/api/v1/admin/submissions/:id/approve', need('approve'), async (req, reply) => {
    const row = db.prepare('SELECT * FROM event_submissions WHERE id=? AND deleted_at IS NULL').get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (row.status === 'approved') return reply.code(409).send({ error: 'already_approved' });
    const edits = req.body || {};
    const ev = tx(() => {
      const created = repo.createEvent({
        title: edits.title || row.title,
        description: edits.description ?? row.description,
        date: edits.date || row.start_date, endDate: edits.endDate ?? row.end_date,
        start: edits.start ?? row.start_time, end: edits.end ?? row.end_time,
        allDay: edits.allDay !== undefined ? edits.allDay : !!row.all_day,
        campusId: edits.campusId ?? row.campus_id, categoryId: edits.categoryId ?? row.category_id,
        locationId: edits.locationId ?? row.location_id,
        yearGroupIds: edits.yearGroupIds || json.parse(row.year_group_ids, []),
        audienceIds: edits.audienceIds || json.parse(row.audience_ids, []),
        organizerId: row.submitted_by, visibility: edits.visibility || 'public',
        status: 'published', important: !!edits.important,
        source: 'submission', sourceRef: row.id
      }, req.user);
      db.prepare(`UPDATE event_submissions SET status='approved', reviewer_note=?, reviewed_by=?,
                  published_event_id=?, updated_at=? WHERE id=?`)
        .run(edits.note || 'Approved and published.', req.user.id, created.id, now(), row.id);
      repo.audit('approved', 'submission', row.id, row.title, req.user);
      return created;
    });
    return { data: { event: ev, submissionId: row.id } };
  });

  app.post('/api/v1/admin/submissions/:id/reject', need('approve'), async (req, reply) => {
    const row = db.prepare('SELECT * FROM event_submissions WHERE id=?').get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    db.prepare("UPDATE event_submissions SET status='rejected', reviewer_note=?, reviewed_by=?, updated_at=? WHERE id=?")
      .run((req.body || {}).note || 'Rejected.', req.user.id, now(), row.id);
    repo.audit('rejected', 'submission', row.id, row.title, req.user);
    return { data: shapeSubmission(db.prepare('SELECT * FROM event_submissions WHERE id=?').get(row.id)) };
  });

  app.post('/api/v1/admin/submissions/:id/request-changes', need('approve'), async (req, reply) => {
    const row = db.prepare('SELECT * FROM event_submissions WHERE id=?').get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    db.prepare("UPDATE event_submissions SET status='changes', reviewer_note=?, reviewed_by=?, updated_at=? WHERE id=?")
      .run((req.body || {}).note || 'Changes requested.', req.user.id, now(), row.id);
    repo.audit('changes requested', 'submission', row.id, row.title, req.user);
    return { data: shapeSubmission(db.prepare('SELECT * FROM event_submissions WHERE id=?').get(row.id)) };
  });

  /* -------------------------------------------------------- taxonomy */
  const TAXONOMY = {
    campuses:   { table: 'campuses',        fields: ['name','short','slug','blurb','colour','sort_order','archived'] },
    yeargroups: { table: 'year_groups',     fields: ['name','slug','campus_id','sort_order','archived'] },
    categories: { table: 'event_categories',fields: ['name','slug','colour_var','sort_order','archived'] },
    locations:  { table: 'locations',       fields: ['name','slug','campus_id','capacity','archived'] },
    audiences:  { table: 'audiences',       fields: ['name','slug','sort_order'] },
    years:      { table: 'academic_years',  fields: ['name','start_date','end_date','status'] },
    terms:      { table: 'terms',           fields: ['name','academic_year_id','start_date','end_date','status','sort_order'] }
  };
  const CAMEL = { campusId: 'campus_id', sortOrder: 'sort_order', colourVar: 'colour_var',
    startDate: 'start_date', endDate: 'end_date', academicYearId: 'academic_year_id' };
  const toCol = k => CAMEL[k] || k;

  app.get('/api/v1/admin/taxonomy/:kind', need('accessCms'), async (req, reply) => {
    const t = TAXONOMY[req.params.kind];
    if (!t) return reply.code(404).send({ error: 'unknown_kind' });
    return { data: db.prepare(`SELECT * FROM ${t.table} WHERE deleted_at IS NULL ORDER BY rowid`).all() };
  });

  app.post('/api/v1/admin/taxonomy/:kind', need('manageTaxonomy'), async (req, reply) => {
    const t = TAXONOMY[req.params.kind];
    if (!t) return reply.code(404).send({ error: 'unknown_kind' });
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return reply.code(422).send({ error: 'validation_failed',
      errors: [{ field: 'name', message: 'A name is required.' }] });
    const rowId = b.id || id(req.params.kind.slice(0, 3));
    const cols = ['id','created_at','updated_at'], vals = [rowId, now(), now()];
    for (const f of t.fields) {
      const camel = Object.keys(CAMEL).find(k => CAMEL[k] === f) || f;
      let v = b[camel] !== undefined ? b[camel] : b[f];
      if (f === 'slug') v = uniqueSlug(t.table, v || b.name);
      if (v === undefined) continue;
      cols.push(f); vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
    }
    db.prepare(`INSERT INTO ${t.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    repo.audit('created', req.params.kind, rowId, b.name, req.user);
    return reply.code(201).send({ data: db.prepare(`SELECT * FROM ${t.table} WHERE id=?`).get(rowId) });
  });

  app.patch('/api/v1/admin/taxonomy/:kind/:id', need('manageTaxonomy'), async (req, reply) => {
    const t = TAXONOMY[req.params.kind];
    if (!t) return reply.code(404).send({ error: 'unknown_kind' });
    const existing = db.prepare(`SELECT * FROM ${t.table} WHERE id=?`).get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    const b = req.body || {};
    const sets = [], vals = [];
    for (const [k, v] of Object.entries(b)) {
      const col = toCol(k);
      if (!t.fields.includes(col)) continue;
      sets.push(`${col} = ?`); vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
    }
    if (!sets.length) return reply.code(422).send({ error: 'nothing_to_update' });
    sets.push('updated_at = ?'); vals.push(now());
    db.prepare(`UPDATE ${t.table} SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
    if (req.params.kind === 'years' || req.params.kind === 'terms') repo.invalidateClosures();
    repo.audit('updated', req.params.kind, req.params.id, b.name || existing.name, req.user);
    return { data: db.prepare(`SELECT * FROM ${t.table} WHERE id=?`).get(req.params.id) };
  });

  app.delete('/api/v1/admin/taxonomy/:kind/:id', need('manageTaxonomy'), async (req, reply) => {
    const t = TAXONOMY[req.params.kind];
    if (!t) return reply.code(404).send({ error: 'unknown_kind' });
    // Archive rather than delete when the record is referenced anywhere.
    const refs = referenceCount(req.params.kind, req.params.id);
    if (refs > 0) {
      if (!t.fields.includes('archived')) {
        return reply.code(409).send({ error: 'in_use', references: refs,
          message: `Still used by ${refs} event${refs === 1 ? '' : 's'}.` });
      }
      db.prepare(`UPDATE ${t.table} SET archived=1, updated_at=? WHERE id=?`).run(now(), req.params.id);
      repo.audit('archived', req.params.kind, req.params.id, null, req.user);
      return { data: { archived: true, references: refs } };
    }
    db.prepare(`UPDATE ${t.table} SET deleted_at=? WHERE id=?`).run(now(), req.params.id);
    repo.audit('deleted', req.params.kind, req.params.id, null, req.user);
    return { data: { deleted: true } };
  });

  function referenceCount(kind, rowId) {
    const q = {
      campuses:   "SELECT count(*) c FROM events WHERE campus_id=? AND deleted_at IS NULL",
      yeargroups: "SELECT count(*) c FROM event_year_groups WHERE year_group_id=?",
      categories: "SELECT count(*) c FROM events WHERE category_id=? AND deleted_at IS NULL",
      locations:  "SELECT count(*) c FROM events WHERE location_id=? AND deleted_at IS NULL",
      audiences:  "SELECT count(*) c FROM event_audiences WHERE audience_id=?",
      years:      "SELECT count(*) c FROM events WHERE academic_year_id=? AND deleted_at IS NULL",
      terms:      "SELECT 0 c"
    }[kind];
    return q ? db.prepare(q).get(rowId).c : 0;
  }

  /* ----------------------------------------------------------- audit */
  app.get('/api/v1/admin/audit', need('viewAudit'), async (req) => {
    const r = repo.auditList({ q: req.query.q, entity: req.query.entity, entityId: req.query.entityId,
      limit: req.query.limit, offset: req.query.offset });
    return { data: r.entries, meta: { total: r.total } };
  });

  /* ----------------------------------------------------------- users */
  app.get('/api/v1/admin/users', need('accessCms'), async () => ({
    data: db.prepare(`SELECT id,email,name,initials,role,campus_id,active,last_login_at,created_at
                      FROM users WHERE deleted_at IS NULL ORDER BY role, name`).all()
  }));

  app.post('/api/v1/admin/users', need('manageUsers'), async (req, reply) => {
    const b = req.body || {};
    if (!b.email || !b.name) return reply.code(422).send({ error: 'validation_failed' });
    if (auth.findByEmail(b.email)) return reply.code(409).send({ error: 'email_in_use' });
    const uid = id('usr');
    db.prepare(`INSERT INTO users (id,email,name,initials,role,campus_id,password_hash,active,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,1,?,?)`)
      .run(uid, b.email, b.name, (b.initials || b.name.split(' ').map(x => x[0]).join('').slice(0, 2)).toUpperCase(),
           b.role || 'teacher', b.campusId || null, b.password ? auth.hashPassword(b.password) : null, now(), now());
    repo.audit('created', 'user', uid, b.name, req.user);
    return reply.code(201).send({ data: db.prepare('SELECT id,email,name,role,campus_id FROM users WHERE id=?').get(uid) });
  });

  app.patch('/api/v1/admin/users/:id', need('manageUsers'), async (req, reply) => {
    const b = req.body || {};
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!u) return reply.code(404).send({ error: 'not_found' });
    const sets = [], vals = [];
    for (const [k, col] of Object.entries({ name: 'name', role: 'role', campusId: 'campus_id', active: 'active' })) {
      if (b[k] !== undefined) { sets.push(`${col}=?`); vals.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]); }
    }
    if (b.password) { sets.push('password_hash=?'); vals.push(auth.hashPassword(b.password)); }
    if (!sets.length) return reply.code(422).send({ error: 'nothing_to_update' });
    sets.push('updated_at=?'); vals.push(now());
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id=?`).run(...vals, req.params.id);
    repo.audit('updated', 'user', req.params.id, u.name, req.user);
    return { data: db.prepare('SELECT id,email,name,role,campus_id,active FROM users WHERE id=?').get(req.params.id) };
  });

  /* -------------------------------------------------------- API keys */
  app.get('/api/v1/admin/api-keys', need('manageApiKeys'), async () => ({
    data: db.prepare('SELECT id,name,scopes,created_at,last_used_at,revoked_at FROM api_keys ORDER BY created_at DESC').all()
  }));

  app.post('/api/v1/admin/api-keys', need('manageApiKeys'), async (req, reply) => {
    const b = req.body || {};
    if (!b.name) return reply.code(422).send({ error: 'validation_failed' });
    const k = auth.issueApiKey(b.name, b.scopes || 'read', req.user.id);
    repo.audit('created', 'api_key', k.id, b.name, req.user);
    return reply.code(201).send({ data: k, note: 'Store this key now — it is not shown again.' });
  });

  app.delete('/api/v1/admin/api-keys/:id', need('manageApiKeys'), async (req) => {
    db.prepare('UPDATE api_keys SET revoked_at=? WHERE id=?').run(now(), req.params.id);
    repo.audit('revoked', 'api_key', req.params.id, null, req.user);
    return { data: { revoked: true } };
  });

  /* ------------------------------------------------------- settings */
  app.get('/api/v1/admin/settings', need('accessCms'), async () => ({
    data: Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]))
  }));

  app.put('/api/v1/admin/settings', need('manageTaxonomy'), async (req) => {
    const stmt = db.prepare('INSERT INTO settings (key,value,updated_at,updated_by) VALUES (?,?,?,?) ' +
      'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by');
    for (const [k, v] of Object.entries(req.body || {})) stmt.run(k, String(v), now(), req.user.id);
    repo.audit('updated', 'settings', null, Object.keys(req.body || {}).join(', '), req.user);
    return { data: Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value])) };
  });

  /* --------------------------------------------------- notifications */
  app.get('/api/v1/admin/notifications', need('accessCms'), async () => ({
    data: db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100').all()
  }));

  function queueNotification(ev, kind, user) {
    const subjects = {
      new: `New event: ${ev.title}`, updated: `Updated: ${ev.title}`,
      cancelled: `Cancelled: ${ev.title}`, postponed: `Postponed: ${ev.title}`,
      reminder: `Reminder: ${ev.title}`
    };
    // Recipients are resolved from preferences and subscriptions, so a family
    // that has not opted into this campus or year group is never mailed.
    const recipients = db.prepare(`
      SELECT count(DISTINCT u.id) c FROM users u
      LEFT JOIN user_preferences p ON p.user_id = u.id
      WHERE u.active = 1 AND u.deleted_at IS NULL
        AND (p.campus_id IS NULL OR ? IS NULL OR p.campus_id = ?)`).get(ev.campusId, ev.campusId).c;
    db.prepare(`INSERT INTO notifications (id,event_id,kind,audience_ids,campus_id,year_group_ids,subject,body,status,recipients,created_by,created_at)
                VALUES (?,?,?,?,?,?,?,?,'queued',?,?,?)`)
      .run(id('ntf'), ev.id, kind, json.stringify(ev.audienceIds || []), ev.campusId || null,
           json.stringify(ev.yearGroupIds || []), subjects[kind] || subjects.new,
           ev.description || '', recipients, user ? user.id : null, now());
  }
  app.decorate('queueNotification', queueNotification);
};

module.exports.validateEvent = validateEvent;
