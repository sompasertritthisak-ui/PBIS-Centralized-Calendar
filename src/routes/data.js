'use strict';
/* ==========================================================================
   IMPORT, ATTACHMENTS AND ACADEMIC-YEAR ROLLOVER
   Import never publishes: a job is created, validated and previewed, and only
   a second, explicit call writes drafts (§63).
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, now, id, json, tx, DATA_DIR } = require('../db');
const repo = require('../repo');
const T = require('../lib/time');
const R = require('../lib/recurrence');
const ICSP = require('../lib/icsparse');
const { classify } = require('../lib/classify');
const V = require('../lib/visibility');

const UPLOADS = path.join(DATA_DIR, 'uploads');

/* ------------------------------------------------------------ parsing */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

const HEADER_MAP = [
  [/^(event\s*)?(name|title|summary)$/i, 'title'],
  [/^(start\s*)?date$/i, 'date'],
  [/^end\s*date$/i, 'endDate'],
  [/^start(\s*time)?$/i, 'start'],
  [/^end(\s*time)?$/i, 'end'],
  [/^campus$/i, 'campusId'],
  [/^year\s*group/i, 'yearGroupIds'],
  [/^categor/i, 'categoryId'],
  [/^audience/i, 'audienceIds'],
  [/^(location|venue|room)$/i, 'locationId'],
  [/^(description|notes|details)$/i, 'description']
];
const guessTarget = h => (HEADER_MAP.find(([re]) => re.test(String(h).trim())) || [])[1] || '';

/** Infer campus / category from the title when the sheet does not say (§65). */
const TITLE_RULES = [
  [/sports day|gala|football|athletic|swim/i, 'sports'],
  [/parent evening|parent/i, 'parent'],
  [/exam|mock/i, 'exam'],
  [/assembly/i, 'assembly'],
  [/holiday|closed|break|festival|half term/i, 'holiday'],
  [/trip|residential|visit|expedition/i, 'trip'],
  [/graduation|leavers/i, 'graduation'],
  [/open day|admission|entrance/i, 'admissions'],
  [/concert|fair|nativity|celebration|book week/i, 'celebration'],
  [/eca|club|activity/i, 'eca'],
  [/deadline|due/i, 'deadline'],
  [/staff|inset|training/i, 'staff'],
  [/meeting/i, 'meeting']
];

/* ICS reading lives in ../lib/icsparse.js — one parser, shared with the
   command-line importer. */

/**
 * @param override  Optional [{source,target}] from the CMS column mapper. When
 *                  present it replaces the guessed mapping for any heading it
 *                  names, so correcting a column re-reads the file properly
 *                  rather than only relabelling it on screen.
 */
function buildRows(text, format, taxo, override, sourceCampus) {
  const byName = (list, v) => list.find(x =>
    x.name.toLowerCase() === String(v).trim().toLowerCase() ||
    (x.short && x.short.toLowerCase() === String(v).trim().toLowerCase()) ||
    x.slug === String(v).trim().toLowerCase());

  let mapping = [], parsed = [];

  if (format === 'ics') {
    mapping = [{ source: 'SUMMARY', target: 'title' }, { source: 'DTSTART', target: 'date' },
      { source: 'DTEND', target: 'end' }, { source: 'LOCATION', target: 'locationId' },
      { source: 'DESCRIPTION', target: 'description' }, { source: 'RRULE', target: 'recurrence' }];
    // A Google calendar carries no campus, so the CMS asks which calendar the
    // file came from and the shared classifier does the rest — the same rules
    // the command-line importer uses.
    parsed = ICSP.parseIcs(text, taxo).events.map(ev => {
      const c = classify(ev, sourceCampus === 'se' ? 'se' : 'pr-ey', taxo);
      return { ...ev,
        campusId: sourceCampus && sourceCampus !== 'auto' && sourceCampus !== 'se'
          ? (c.campusId || null) : c.campusId,
        categoryId: c.categoryId,
        yearGroupIds: c.yearGroupIds,
        _needsReview: c.needsReview,
        _why: c.why };
    });
  } else {
    const rows = parseCSV(text);
    if (rows.length < 2) return { mapping: [], rows: [], error: 'not_enough_rows' };
    const headers = rows[0].map(h => String(h).trim());
    const forced = new Map((override || []).map(m => [String(m.source), String(m.target || '')]));
    mapping = headers.map(h => ({ source: h, target: forced.has(h) ? forced.get(h) : guessTarget(h) }));
    parsed = rows.slice(1).map(cells => {
      const d = { title: '', date: '', endDate: '', start: '', end: '', allDay: false, campusId: null,
        categoryId: null, locationId: null, yearGroupIds: [], audienceIds: [], description: '', recurrence: null };
      mapping.forEach((m, i) => {
        const v = String(cells[i] == null ? '' : cells[i]).trim();
        if (!m.target || !v) return;
        if (m.target === 'campusId') d.campusId = (byName(taxo.campuses, v) || {}).id || null;
        else if (m.target === 'categoryId') d.categoryId = (byName(taxo.categories, v) || {}).id || null;
        else if (m.target === 'locationId') { d.locationId = (byName(taxo.locations, v) || {}).id || null; d._locRaw = v; }
        else if (m.target === 'yearGroupIds') d.yearGroupIds = v.split(/[;,]/).map(s => (byName(taxo.yearGroups, s) || {}).id).filter(Boolean);
        else if (m.target === 'audienceIds') d.audienceIds = v.split(/[;,]/).map(s => (byName(taxo.audiences, s) || {}).id).filter(Boolean);
        else d[m.target] = v;
      });
      if (!d.start && !d.end) d.allDay = true;
      return d;
    });
  }

  const out = parsed.map(d => {
    if (!d.audienceIds || !d.audienceIds.length) d.audienceIds = ['community'];
    if (!d.campusId && d._why === undefined) {
      // CSV only: the ICS path has already been through the classifier, which
      // distinguishes "deliberately whole-school" from "could not be filed".
      const c = taxo.campuses.find(x => new RegExp(x.name, 'i').test(d.title || ''));
      if (c) d.campusId = c.id;
    }
    if (!d.categoryId) {
      const hit = TITLE_RULES.find(([re]) => re.test(d.title || ''));
      d.categoryId = hit ? hit[1] : 'academic';
    }
    let status = 'ready', message = '';
    if (!d.title) { status = 'error'; message = 'Missing event name'; }
    else if (!T.isDateKey(d.date)) { status = 'error'; message = 'Date must be YYYY-MM-DD'; }
    else {
      const dup = db.prepare(
        'SELECT id FROM events WHERE lower(title)=lower(?) AND start_date=? AND deleted_at IS NULL')
        .get(d.title, d.date);
      if (dup) { status = 'duplicate'; message = 'An identical event already exists on this date'; d._duplicateOf = dup.id; }
      else {
        const cf = repo.findConflicts(d, null);
        if (cf.length) { status = 'conflict'; message = `Location is booked for “${cf[0].event.title}”`; }
        else if (d._needsReview) { status = 'warning'; message = 'No campus could be determined — assign one before publishing'; }
        else if (d._locRaw && !d.locationId) { status = 'warning'; message = `Location “${d._locRaw}” is not a known PBIS location`; }
        else if (!d.campusId && d._why) { status = 'ready'; message = `Whole school — ${d._why}`; }
        else if (!d.campusId) { status = 'warning'; message = 'No campus matched — will be created as a whole-school event'; }
      }
    }
    return { data: d, status, message, action: status === 'error' ? 'skip' : status === 'duplicate' ? 'skip' : 'import' };
  });

  return { mapping, rows: out };
}

/* ------------------------------------------------------------- routes */
module.exports = async function dataRoutes(app) {
  const need = action => ({ onRequest: [app.requirePermission(action)] });

  /* ---------------------------------------------------------- import */
  app.post('/api/v1/admin/imports', need('import'), async (req, reply) => {
    const b = req.body || {};
    const text = b.content;
    if (!text || !String(text).trim()) return reply.code(422).send({ error: 'no_content' });
    const format = /BEGIN:VCALENDAR/i.test(text) ? 'ics' : (b.format === 'xlsx' ? 'xlsx' : 'csv');
    if (format === 'xlsx') {
      return reply.code(415).send({ error: 'unsupported_format',
        message: 'Convert the workbook to CSV and upload that. XLSX parsing is not enabled on this deployment.' });
    }
    const built = buildRows(String(text), format, repo.taxonomy.all(),
      Array.isArray(b.mapping) ? b.mapping : null, b.sourceCampus || 'auto');
    if (built.error) return reply.code(422).send({ error: built.error });

    const jobId = id('imp');
    db.prepare(`INSERT INTO import_jobs (id, filename, format, mapping, rows, row_count, status, created_by, created_at)
                VALUES (?,?,?,?,?,?,'preview',?,?)`)
      .run(jobId, b.filename || null, format, json.stringify(built.mapping),
           json.stringify(built.rows), built.rows.length, req.user.id, now());
    repo.audit('import previewed', 'import_job', jobId, `${built.rows.length} rows`, req.user);

    return reply.code(201).send({
      data: { id: jobId, format, mapping: built.mapping, rows: built.rows,
        summary: built.rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}) }
    });
  });

  app.get('/api/v1/admin/imports/:id', need('import'), async (req, reply) => {
    const job = db.prepare('SELECT * FROM import_jobs WHERE id=?').get(req.params.id);
    if (!job) return reply.code(404).send({ error: 'not_found' });
    return { data: { ...job, mapping: json.parse(job.mapping, []), rows: json.parse(job.rows, []) } };
  });

  app.post('/api/v1/admin/imports/:id/commit', need('import'), async (req, reply) => {
    const job = db.prepare('SELECT * FROM import_jobs WHERE id=?').get(req.params.id);
    if (!job) return reply.code(404).send({ error: 'not_found' });
    if (job.status === 'committed') return reply.code(409).send({ error: 'already_committed' });

    const rows = json.parse(job.rows, []);
    const decisions = (req.body || {}).decisions || {};   // { rowIndex: 'import'|'skip'|'replace' }
    const created = [], replaced = [], skipped = [];

    tx(() => {
      rows.forEach((r, i) => {
        const action = decisions[i] || r.action;
        if (action === 'skip' || r.status === 'error') { skipped.push(i); return; }
        if (action === 'replace' && r.data._duplicateOf) {
          repo.updateEvent(r.data._duplicateOf, {
            title: r.data.title, description: r.data.description, date: r.data.date,
            endDate: r.data.endDate || null, start: r.data.start || null, end: r.data.end || null,
            allDay: !!r.data.allDay, campusId: r.data.campusId, categoryId: r.data.categoryId,
            locationId: r.data.locationId, yearGroupIds: r.data.yearGroupIds, audienceIds: r.data.audienceIds
          }, req.user, { action: 'imported', note: `Replaced by import ${job.id}` });
          replaced.push(r.data._duplicateOf);
          return;
        }
        const ev = repo.createEvent({
          title: r.data.title, description: r.data.description, date: r.data.date,
          endDate: r.data.endDate || null, start: r.data.start || null, end: r.data.end || null,
          allDay: !!r.data.allDay, campusId: r.data.campusId, categoryId: r.data.categoryId,
          locationId: r.data.locationId, yearGroupIds: r.data.yearGroupIds,
          audienceIds: r.data.audienceIds, recurrence: r.data.recurrence || null,
          visibility: 'public', status: 'draft', source: 'import', sourceRef: job.id
        }, req.user);
        created.push(ev.id);
      });
      db.prepare("UPDATE import_jobs SET status='committed', imported_count=?, committed_at=? WHERE id=?")
        .run(created.length + replaced.length, now(), job.id);
    });

    repo.audit('imported', 'import_job', job.id,
      `${created.length} created, ${replaced.length} replaced, ${skipped.length} skipped`, req.user);
    return { data: { created: created.length, replaced: replaced.length, skipped: skipped.length,
      ids: created, status: 'committed',
      note: 'Imported events are drafts. Review and publish them when you are ready.' } };
  });

  app.delete('/api/v1/admin/imports/:id', need('import'), async (req) => {
    db.prepare("UPDATE import_jobs SET status='cancelled' WHERE id=?").run(req.params.id);
    return { data: { cancelled: true } };
  });

  /* ----------------------------------------------------- attachments */
  const ALLOWED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv']);
  const MAX_BYTES = 10 * 1024 * 1024;

  app.post('/api/v1/admin/events/:id/attachments', need('edit'), async (req, reply) => {
    const ev = repo.getEventRaw(req.params.id);
    if (!ev) return reply.code(404).send({ error: 'not_found' });
    if (!V.canEditEvent(req.user, { campus_id: ev.campusId })) return reply.code(403).send({ error: 'forbidden' });

    const file = await req.file();
    if (!file) return reply.code(422).send({ error: 'no_file' });
    if (!ALLOWED.has(file.mimetype)) {
      return reply.code(415).send({ error: 'unsupported_type', mime: file.mimetype,
        message: 'Allowed: PDF, images, Word, Excel, plain text and CSV.' });
    }
    const buf = await file.toBuffer();
    if (buf.length > MAX_BYTES) return reply.code(413).send({ error: 'too_large', maxBytes: MAX_BYTES });

    // Stored under a generated key, never the user's filename — a crafted
    // name cannot escape the uploads directory.
    const attId = id('att');
    const storageKey = `${attId}${path.extname(file.filename || '').slice(0, 10).replace(/[^.\w]/g, '')}`;
    fs.writeFileSync(path.join(UPLOADS, storageKey), buf);
    db.prepare(`INSERT INTO attachments (id,event_id,filename,mime,size_bytes,storage_key,uploaded_by,created_at)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(attId, ev.id, path.basename(file.filename || 'file'), file.mimetype, buf.length,
           storageKey, req.user.id, now());
    repo.audit('attached', 'event', ev.id, file.filename, req.user);
    return reply.code(201).send({ data: { id: attId, name: file.filename, size: buf.length,
      url: `/api/v1/attachments/${attId}` } });
  });

  app.get('/api/v1/attachments/:id', async (req, reply) => {
    const a = db.prepare('SELECT * FROM attachments WHERE id=? AND deleted_at IS NULL').get(req.params.id);
    if (!a) return reply.code(404).send({ error: 'not_found' });
    // An attachment inherits the visibility of its event.
    if (a.event_id && !repo.getEvent(req.user, a.event_id)) return reply.code(404).send({ error: 'not_found' });
    const p = path.join(UPLOADS, a.storage_key);
    if (!fs.existsSync(p)) return reply.code(410).send({ error: 'file_missing' });
    return reply
      .header('Content-Type', a.mime)
      .header('Content-Disposition', `inline; filename="${a.filename.replace(/"/g, '')}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .send(fs.createReadStream(p));
  });

  app.delete('/api/v1/admin/attachments/:id', need('edit'), async (req) => {
    db.prepare('UPDATE attachments SET deleted_at=? WHERE id=?').run(now(), req.params.id);
    return { data: { deleted: true } };
  });

  /* -------------------------------------------------------- rollover */
  app.post('/api/v1/admin/rollover/preview', need('rollover'), async (req, reply) => {
    const b = req.body || {};
    const from = db.prepare('SELECT * FROM academic_years WHERE id=?').get(b.fromYearId);
    if (!from) return reply.code(422).send({ error: 'unknown_source_year' });
    const shift = Number(b.shiftDays != null ? b.shiftDays : 364);

    const source = db.prepare(`SELECT * FROM events WHERE academic_year_id=? AND deleted_at IS NULL
                               AND status NOT IN ('archived')`).all(from.id);
    const classify = e => e.recurrence ? 'recurring'
      : (['holiday','celebration','sports','admissions','graduation'].includes(e.category_id) ? 'annual'
      : (['exam','assessment','deadline'].includes(e.category_id) ? 'review' : 'onetime'));
    const groups = { recurring: [], annual: [], review: [], onetime: [] };
    for (const e of source) {
      groups[classify(e)].push({
        id: e.id, title: e.title, from: e.start_date, to: T.addDays(e.start_date, shift),
        category: e.category_id, recurring: !!e.recurrence
      });
    }
    return { data: { fromYear: from, shiftDays: shift, counts:
      Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), groups } };
  });

  app.post('/api/v1/admin/rollover/commit', need('rollover'), async (req, reply) => {
    const b = req.body || {};
    const from = db.prepare('SELECT * FROM academic_years WHERE id=?').get(b.fromYearId);
    if (!from) return reply.code(422).send({ error: 'unknown_source_year' });
    if (!b.newYear || !b.newYear.name || !T.isDateKey(b.newYear.start) || !T.isDateKey(b.newYear.end)) {
      return reply.code(422).send({ error: 'validation_failed',
        errors: [{ field: 'newYear', message: 'Name, start and end are required.' }] });
    }
    const shift = Number(b.shiftDays != null ? b.shiftDays : 364);
    const decisions = Object.assign({ recurring: 'copy', annual: 'copy', review: 'review', onetime: 'skip' },
      b.decisions || {});

    const result = tx(() => {
      let ayId = db.prepare('SELECT id FROM academic_years WHERE name=?').get(b.newYear.name);
      ayId = ayId ? ayId.id : id('ay');
      db.prepare(`INSERT INTO academic_years (id,name,start_date,end_date,status,created_at,updated_at)
                  VALUES (?,?,?,?,'planning',?,?)
                  ON CONFLICT(name) DO UPDATE SET start_date=excluded.start_date, end_date=excluded.end_date,
                  updated_at=excluded.updated_at`)
        .run(ayId, b.newYear.name, b.newYear.start, b.newYear.end, now(), now());

      (b.terms || []).forEach((t, i) => {
        db.prepare(`INSERT INTO terms (id,academic_year_id,name,start_date,end_date,status,sort_order,created_at,updated_at)
                    VALUES (?,?,?,?,?,'planned',?,?,?)`)
          .run(id('trm'), ayId, t.name, t.start, t.end, i + 1, now(), now());
      });

      const source = db.prepare(`SELECT * FROM events WHERE academic_year_id=? AND deleted_at IS NULL
                                 AND status NOT IN ('archived')`).all(from.id);
      const classify = e => e.recurrence ? 'recurring'
        : (['holiday','celebration','sports','admissions','graduation'].includes(e.category_id) ? 'annual'
        : (['exam','assessment','deadline'].includes(e.category_id) ? 'review' : 'onetime'));

      let created = 0, held = 0, skipped = 0;
      for (const e of source) {
        const decision = decisions[classify(e)];
        if (decision === 'skip') { skipped++; continue; }
        const full = repo.getEventRaw(e.id);
        const rec = full.recurrence ? { ...full.recurrence } : null;
        if (rec && rec.until) rec.until = T.addDays(rec.until, shift);
        repo.createEvent({
          title: full.title, description: full.description,
          date: T.addDays(full.date, shift),
          endDate: full.endDate ? T.addDays(full.endDate, shift) : null,
          start: full.start, end: full.end, allDay: full.allDay,
          campusId: full.campusId, categoryId: full.categoryId, locationId: full.locationId,
          organizerId: full.organizerId, yearGroupIds: full.yearGroupIds, audienceIds: full.audienceIds,
          visibility: full.visibility, important: full.important,
          recurrence: rec, links: full.links,
          status: 'draft',                       // nothing is published by a rollover
          source: 'rollover', sourceRef: full.id
        }, req.user);
        created++;
        if (decision === 'review') held++;
      }
      db.prepare("UPDATE academic_years SET status='planning' WHERE id=?").run(ayId);
      repo.audit('rolled over', 'academic_year', ayId,
        `${b.newYear.name}: ${created} events created as drafts`, req.user);
      return { academicYearId: ayId, created, held, skipped };
    });

    return { data: { ...result,
      note: 'Every copied event was created as a draft in the new year. Nothing is live until you publish it.' } };
  });

  /* ------------------------------------------------- import template */
  app.get('/api/v1/admin/imports/template.csv', need('import'), async (req, reply) =>
    reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="pbis-import-template.csv"')
      .send('Event Name,Start Date,End Date,Start Time,End Time,Campus,Year Group,Category,Audience,Location,Description\r\n' +
            'Primary Sports Day,2027-02-12,,08:30,12:30,Primary,"Year 1; Year 2",Sports,"Students; Parents",Sports Field,House athletics\r\n'));
};

module.exports.buildRows = buildRows;
module.exports.parseCSV = parseCSV;
