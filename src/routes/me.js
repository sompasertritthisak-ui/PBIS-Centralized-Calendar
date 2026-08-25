'use strict';
/* ==========================================================================
   LAYER 2 — AUTHENTICATED USER API
   Sign-in, the signed-in user's own calendar, preferences, personal feed
   tokens and event submission.
   ========================================================================== */

const crypto = require('crypto');
const { db, now, id, json } = require('../db');
const repo = require('../repo');
const O = require('../lib/origin');
const auth = require('../auth');
const V = require('../lib/visibility');
const T = require('../lib/time');
const { present, lookupContext } = require('./public');

const publicUser = u => ({
  id: u.id, name: u.name, email: u.email, initials: u.initials,
  role: u.role, campusId: u.campus_id || null,
  permissions: Object.keys(V.PERMISSIONS).filter(a => V.can(u.role, a))
});

function prefsFor(userId) {
  const p = db.prepare('SELECT * FROM user_preferences WHERE user_id=?').get(userId);
  if (!p) return { campusId: null, yearGroupId: null, audienceId: null, categoryIds: [], theme: 'light', motion: 'on', onboarded: false };
  return {
    campusId: p.campus_id, yearGroupId: p.year_group_id, audienceId: p.audience_id,
    categoryIds: json.parse(p.category_ids, []), theme: p.theme, motion: p.motion,
    onboarded: !!p.onboarded
  };
}

/**
 * "My PBIS Calendar" relevance (§15). Whole-school events always survive;
 * campus and year group only narrow when the event is actually scoped;
 * audience is inclusive by relationship; closures are never filtered out.
 */
function personalMatch(ev, prefs) {
  const wholeSchool = !ev.campusId && !(ev.yearGroupIds || []).length;
  if (wholeSchool) return true;
  if (prefs.campusId && ev.campusId && ev.campusId !== prefs.campusId) return false;
  if (prefs.yearGroupId) {
    const ygs = ev.yearGroupIds || [];
    if (ygs.length && !ygs.includes(prefs.yearGroupId)) return false;
  }
  if (prefs.audienceId) {
    const accept = V.AUDIENCE_ACCEPT[prefs.audienceId] || [prefs.audienceId, 'community'];
    const auds = ev.audienceIds || [];
    if (auds.length && !auds.some(a => accept.includes(a))) return false;
  }
  if (prefs.categoryIds && prefs.categoryIds.length) {
    if (!prefs.categoryIds.includes(ev.categoryId) && ev.categoryId !== 'holiday') return false;
  }
  return true;
}

module.exports = async function meRoutes(app) {
  /* ------------------------------------------------------------- auth */
  app.post('/api/v1/auth/sign-in', async (req, reply) => {
    const { email, password } = req.body || {};
    const result = auth.signIn(email, password, { userAgent: req.headers['user-agent'], ip: req.ip });
    if (!result.ok) return reply.code(401).send({ error: 'invalid_credentials' });
    reply.setCookie(auth.SESSION_COOKIE, result.session.id, {
      path: '/', httpOnly: true, sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: auth.SESSION_DAYS * 86400
    });
    return { data: { user: publicUser(result.user), preferences: prefsFor(result.user.id) } };
  });

  app.post('/api/v1/auth/sign-out', async (req, reply) => {
    auth.revokeSession(req.sessionId);
    reply.clearCookie(auth.SESSION_COOKIE, { path: '/' });
    return { data: { signedOut: true } };
  });

  app.get('/api/v1/auth/session', async (req) => {
    if (!req.user || req.user.role === 'public') return { data: { user: null } };
    return { data: { user: publicUser(req.user), preferences: prefsFor(req.user.id) } };
  });

  /* -------------------------------------------------------- preferences */
  app.get('/api/v1/me/preferences', { onRequest: [app.requireAuth] }, async (req) =>
    ({ data: prefsFor(req.user.id) }));

  app.put('/api/v1/me/preferences', { onRequest: [app.requireAuth] }, async (req) => {
    const b = req.body || {};
    db.prepare(`INSERT INTO user_preferences (user_id, campus_id, year_group_id, audience_id, category_ids, theme, motion, onboarded, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET
                  campus_id=excluded.campus_id, year_group_id=excluded.year_group_id,
                  audience_id=excluded.audience_id, category_ids=excluded.category_ids,
                  theme=excluded.theme, motion=excluded.motion, onboarded=excluded.onboarded,
                  updated_at=excluded.updated_at`)
      .run(req.user.id, b.campusId || null, b.yearGroupId || null, b.audienceId || null,
           json.stringify(b.categoryIds || []), b.theme || 'light', b.motion || 'on',
           b.onboarded ? 1 : 0, now());
    return { data: prefsFor(req.user.id) };
  });

  /* ----------------------------------------------------- my calendar */
  app.get('/api/v1/me/calendar', { onRequest: [app.requireAuth] }, async (req) => {
    const prefs = prefsFor(req.user.id);
    const from = T.isDateKey(req.query.from) ? req.query.from : T.todayKey();
    const to = T.isDateKey(req.query.to) ? req.query.to : T.addDays(from, 90);
    const occ = repo.listInRange(req.user, { from, to }).filter(o => personalMatch(o.event, prefs));
    const ctx = lookupContext();
    return {
      data: occ.map(o => ({ date: o.date, ...present(o.event, ctx) })),
      meta: { total: occ.length, from, to, preferences: prefs, timezone: T.TZ }
    };
  });

  /* -------------------------------------------------- subscriptions */
  app.get('/api/v1/me/subscriptions', { onRequest: [app.requireAuth] }, async (req) => {
    const rows = db.prepare(`
      SELECT s.*, c.name AS calendar_name, c.scope_type FROM calendar_subscriptions s
      JOIN calendars c ON c.id = s.calendar_id
      WHERE s.user_id = ? AND s.revoked_at IS NULL ORDER BY s.created_at`).all(req.user.id);
    return {
      data: rows.map(r => ({
        id: r.id, calendarId: r.calendar_id, name: r.calendar_name, scope: r.scope_type,
        webcal: `${O.webcal(req)}/feeds/${r.calendar_id}.ics?token=${r.token}`,
        https: `${O.origin(req)}/feeds/${r.calendar_id}.ics?token=${r.token}`,
        fetchCount: r.fetch_count, lastFetchedAt: r.last_fetched_at, createdAt: r.created_at
      }))
    };
  });

  app.post('/api/v1/me/subscriptions', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const calendarId = (req.body || {}).calendarId;
    const cal = db.prepare('SELECT * FROM calendars WHERE id=?').get(calendarId);
    if (!cal) return reply.code(404).send({ error: 'unknown_calendar' });
    const existing = db.prepare(
      'SELECT * FROM calendar_subscriptions WHERE user_id=? AND calendar_id=? AND revoked_at IS NULL')
      .get(req.user.id, calendarId);
    if (existing) return { data: { id: existing.id, token: existing.token, existing: true } };
    const sid = id('sub');
    const token = crypto.randomBytes(18).toString('base64url');
    db.prepare(`INSERT INTO calendar_subscriptions (id, calendar_id, user_id, token, label, created_at)
                VALUES (?,?,?,?,?,?)`).run(sid, calendarId, req.user.id, token, cal.name, now());
    return { data: { id: sid, calendarId, token,
      webcal: `${O.webcal(req)}/feeds/${calendarId}.ics?token=${token}` } };
  });

  app.delete('/api/v1/me/subscriptions/:id', { onRequest: [app.requireAuth] }, async (req) => {
    db.prepare('UPDATE calendar_subscriptions SET revoked_at=? WHERE id=? AND user_id=?')
      .run(now(), req.params.id, req.user.id);
    return { data: { revoked: true } };
  });

  /** A single personal feed containing exactly the user's My PBIS Calendar. */
  app.post('/api/v1/me/personal-feed', { onRequest: [app.requireAuth] }, async (req) => {
    let row = db.prepare(
      "SELECT * FROM calendar_subscriptions WHERE user_id=? AND calendar_id='personal' AND revoked_at IS NULL")
      .get(req.user.id);
    if (!row) {
      db.prepare(`INSERT OR IGNORE INTO calendars (id,name,description,scope_type,scope_ref,public,created_at,updated_at)
                  VALUES ('personal','My PBIS Calendar',NULL,'personal',NULL,0,?,?)`).run(now(), now());
      const sid = id('sub');
      const token = crypto.randomBytes(18).toString('base64url');
      db.prepare(`INSERT INTO calendar_subscriptions (id, calendar_id, user_id, token, label, created_at)
                  VALUES (?,?,?,?,?,?)`).run(sid, 'personal', req.user.id, token, 'My PBIS Calendar', now());
      row = { id: sid, token };
    }
    return { data: {
      token: row.token,
      webcal: `${O.webcal(req)}/feeds/personal.ics?token=${row.token}`,
      https: `${O.origin(req)}/feeds/personal.ics?token=${row.token}`
    } };
  });

  /* --------------------------------------------------- submissions */
  app.get('/api/v1/me/submissions', { onRequest: [app.requireAuth] }, async (req) => {
    const rows = db.prepare(
      'SELECT * FROM event_submissions WHERE submitted_by=? AND deleted_at IS NULL ORDER BY created_at DESC')
      .all(req.user.id);
    return { data: rows.map(shapeSubmission) };
  });

  app.post('/api/v1/me/submissions', { onRequest: [app.requirePermission('submit')] }, async (req, reply) => {
    const b = req.body || {};
    const errors = validateSubmission(b);
    if (errors.length) return reply.code(422).send({ error: 'validation_failed', errors });
    const sid = id('sub');
    db.prepare(`INSERT INTO event_submissions
      (id,title,description,start_date,end_date,start_time,end_time,all_day,campus_id,category_id,location_id,
       year_group_ids,audience_ids,status,submitted_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(sid, b.title.trim(), b.description || '', b.date, b.endDate || null,
           b.allDay ? null : (b.start || null), b.allDay ? null : (b.end || null),
           b.allDay ? 1 : 0, b.campusId || null, b.categoryId || 'other', b.locationId || null,
           json.stringify(b.yearGroupIds || []), json.stringify(b.audienceIds || []),
           b.status === 'draft' ? 'draft' : 'pending', req.user.id, now(), now());
    repo.audit('submitted', 'submission', sid, b.title, req.user);
    const row = db.prepare('SELECT * FROM event_submissions WHERE id=?').get(sid);
    return reply.code(201).send({ data: shapeSubmission(row),
      conflicts: repo.findConflicts({ locationId: b.locationId, date: b.date, endDate: b.endDate,
        start: b.start, end: b.end, allDay: b.allDay }).map(c => ({ title: c.event.title, date: c.date })) });
  });

  app.patch('/api/v1/me/submissions/:id', { onRequest: [app.requirePermission('submit')] }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM event_submissions WHERE id=? AND deleted_at IS NULL').get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (row.submitted_by !== req.user.id) return reply.code(403).send({ error: 'forbidden' });
    if (row.status === 'approved') return reply.code(409).send({ error: 'already_approved' });
    const b = req.body || {};
    db.prepare(`UPDATE event_submissions SET title=?, description=?, start_date=?, end_date=?, start_time=?,
                end_time=?, all_day=?, campus_id=?, category_id=?, location_id=?, year_group_ids=?, audience_ids=?,
                status='pending', updated_at=? WHERE id=?`)
      .run(b.title || row.title, b.description ?? row.description, b.date || row.start_date,
           b.endDate ?? row.end_date, b.allDay ? null : (b.start ?? row.start_time),
           b.allDay ? null : (b.end ?? row.end_time), b.allDay ? 1 : 0,
           b.campusId ?? row.campus_id, b.categoryId ?? row.category_id, b.locationId ?? row.location_id,
           json.stringify(b.yearGroupIds || json.parse(row.year_group_ids, [])),
           json.stringify(b.audienceIds || json.parse(row.audience_ids, [])), now(), req.params.id);
    repo.audit('resubmitted', 'submission', req.params.id, b.title || row.title, req.user);
    return { data: shapeSubmission(db.prepare('SELECT * FROM event_submissions WHERE id=?').get(req.params.id)) };
  });
};

function validateSubmission(b) {
  const e = [];
  if (!b.title || !String(b.title).trim()) e.push({ field: 'title', message: 'An event name is required.' });
  if (!T.isDateKey(b.date)) e.push({ field: 'date', message: 'A valid date is required (YYYY-MM-DD).' });
  if (b.endDate && !T.isDateKey(b.endDate)) e.push({ field: 'endDate', message: 'End date must be YYYY-MM-DD.' });
  if (b.endDate && T.isDateKey(b.date) && b.endDate < b.date) e.push({ field: 'endDate', message: 'End date cannot be before the start date.' });
  if (!b.allDay) {
    if (b.start && !T.isTime(b.start)) e.push({ field: 'start', message: 'Start time must be HH:MM.' });
    if (b.end && !T.isTime(b.end)) e.push({ field: 'end', message: 'End time must be HH:MM.' });
    if (b.start && b.end && T.toMin(b.end) <= T.toMin(b.start)) {
      e.push({ field: 'end', message: 'The end time must be after the start time.' });
    }
  }
  return e;
}

function shapeSubmission(r) {
  return {
    id: r.id, title: r.title, description: r.description,
    date: r.start_date, endDate: r.end_date, start: r.start_time, end: r.end_time,
    allDay: !!r.all_day, campusId: r.campus_id, categoryId: r.category_id, locationId: r.location_id,
    yearGroupIds: json.parse(r.year_group_ids, []), audienceIds: json.parse(r.audience_ids, []),
    status: r.status, reviewerNote: r.reviewer_note, submittedBy: r.submitted_by,
    publishedEventId: r.published_event_id, createdAt: r.created_at, updatedAt: r.updated_at
  };
}

module.exports.prefsFor = prefsFor;
module.exports.personalMatch = personalMatch;
module.exports.shapeSubmission = shapeSubmission;
module.exports.publicUser = publicUser;
module.exports.validateSubmission = validateSubmission;
