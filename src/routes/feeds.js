'use strict';
/* ==========================================================================
   LIVE CALENDAR FEEDS
   This is what makes a subscription a subscription: the feed is generated
   from the database on every fetch, so publishing "Year 5 Parent Evening"
   makes it appear on a subscribed parent's phone without anyone re-entering
   it (§18).
   ========================================================================== */

const crypto = require('crypto');
const { db, now } = require('../db');
const repo = require('../repo');
const O = require('../lib/origin');
const ICS = require('../lib/ics');
const T = require('../lib/time');
const { prefsFor, personalMatch } = require('./me');

/** Resolve a scope name to a filter + display name. */
function resolveScope(scopeId) {
  const cal = db.prepare('SELECT * FROM calendars WHERE id=?').get(scopeId);
  if (cal) return cal;
  // Allow campus and year-group slugs directly, so /feeds/primary.ics works
  // even before a calendar row exists for it.
  const campus = db.prepare('SELECT * FROM campuses WHERE slug=? AND deleted_at IS NULL').get(scopeId);
  if (campus) return { id: scopeId, name: campus.name, scope_type: 'campus', scope_ref: campus.id, public: 1 };
  const yg = db.prepare('SELECT * FROM year_groups WHERE slug=? AND deleted_at IS NULL').get(scopeId);
  if (yg) return { id: scopeId, name: yg.name, scope_type: 'yeargroup', scope_ref: yg.id, public: 1 };
  return null;
}

/** Events for a scope, already filtered to what the viewer may see. */
function eventsForScope(scope, viewer, opts = {}) {
  const from = opts.from || T.addDays(T.todayKey(), -120);
  const to = opts.to || T.addDays(T.todayKey(), 500);
  const query = { from, to, status: ['published', 'cancelled', 'postponed', 'completed'] };

  switch (scope.scope_type) {
    case 'campus':    query.campus = [scope.scope_ref]; break;
    case 'yeargroup': query.yearGroup = [scope.scope_ref]; break;
    case 'category':  query.category = [scope.scope_ref]; break;
    case 'important': query.important = true; break;
    case 'holidays':  query.category = ['holiday']; break;
    case 'exams':     query.category = ['exam', 'assessment']; break;
    default: break;
  }
  const occ = repo.listInRange(viewer, query);

  // De-duplicate: the feed carries the event with its RRULE, not one entry
  // per occurrence — that is what lets a calendar app show the whole series.
  const seen = new Set();
  const events = [];
  for (const o of occ) {
    if (seen.has(o.event.id)) continue;
    seen.add(o.event.id);
    events.push(o.event);
  }
  return events;
}

module.exports = async function feedRoutes(app) {
  // The URLs written into the .ics itself must be reachable by whoever
  // subscribed. Derive them from the request unless PBIS_ORIGIN says otherwise.
  const origin = req => O.origin(req);

  /* --------------------------------------------------- scope feeds */
  app.get('/feeds/:scope.ics', async (req, reply) => {
    const scopeId = req.params.scope;
    const token = req.query.token;

    let viewer = { role: 'public' };
    let scope = resolveScope(scopeId);
    let personal = false;

    if (token) {
      const sub = db.prepare(`
        SELECT s.*, u.* , s.id AS sub_id FROM calendar_subscriptions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.revoked_at IS NULL AND u.active = 1`).get(token);
      if (!sub) return reply.code(404).type('text/plain').send('Unknown or revoked feed token.');
      viewer = { id: sub.user_id, role: sub.role, campus_id: sub.campus_id };
      db.prepare('UPDATE calendar_subscriptions SET last_fetched_at=?, fetch_count=fetch_count+1 WHERE id=?')
        .run(now(), sub.sub_id);
      if (scopeId === 'personal') { personal = true; scope = { id: 'personal', name: 'My PBIS Calendar', scope_type: 'personal' }; }
    }

    if (!scope) return reply.code(404).type('text/plain').send('Unknown calendar.');
    if (scope.scope_type === 'personal' && !personal) {
      return reply.code(401).type('text/plain').send('This feed requires a personal token.');
    }

    let events = eventsForScope(scope, viewer);
    if (personal) {
      const prefs = prefsFor(viewer.id);
      events = events.filter(e => personalMatch(e, prefs));
    }

    const body = ICS.build(events, {
      name: `PBIS — ${scope.name}`,
      description: `${scope.name}. Generated live from PBIS Central Calendar.`,
      ctx: ICS.context(repo.taxonomy.all(), origin(req))
    });

    // A conditional GET keeps a few thousand subscribed phones cheap.
    const etag = '"' + crypto.createHash('sha1').update(body).digest('base64url') + '"';
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();

    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `inline; filename="pbis-${scope.id}.ics"`)
      .header('Cache-Control', 'public, max-age=900')
      .header('ETag', etag)
      .header('X-PBIS-Event-Count', String(events.length))
      .send(body);
  });

  /* ------------------------------------------------- single event ICS */
  app.get('/api/v1/events/:id.ics', async (req, reply) => {
    const ev = repo.getEvent(req.user, req.params.id);
    if (!ev) return reply.code(404).type('text/plain').send('Not found.');
    const body = ICS.build([ev], {
      name: ev.title, ctx: ICS.context(repo.taxonomy.all(), origin(req))
    });
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${ev.slug}.ics"`)
      .send(body);
  });

  /* --------------------------------------------------------- exports */
  app.get('/api/v1/export', async (req, reply) => {
    const format = req.query.format === 'csv' ? 'csv' : 'ics';
    const scopeId = req.query.scope || 'all';
    const from = T.isDateKey(req.query.from) ? req.query.from : T.addDays(T.todayKey(), -400);
    const to = T.isDateKey(req.query.to) ? req.query.to : T.addDays(T.todayKey(), 500);

    let events;
    if (scopeId === 'my') {
      if (!req.user || req.user.role === 'public') return reply.code(401).send({ error: 'authentication_required' });
      const prefs = prefsFor(req.user.id);
      events = eventsForScope({ scope_type: 'all', name: 'My PBIS Calendar' }, req.user, { from, to })
        .filter(e => personalMatch(e, prefs));
    } else {
      const scope = resolveScope(scopeId) || { id: 'all', name: 'All PBIS Events', scope_type: 'all' };
      events = eventsForScope(scope, req.user, { from, to });
    }

    if (req.user && req.user.id) {
      db.prepare('INSERT INTO export_jobs (id,scope,format,event_count,created_by,created_at) VALUES (?,?,?,?,?,?)')
        .run(require('../db').id('exp'), scopeId, format, events.length, req.user.id, now());
    }

    if (format === 'csv') {
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="pbis-${scopeId}.csv"`)
        .send('﻿' + toCSV(events));
    }
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="pbis-${scopeId}.ics"`)
      .send(ICS.build(events, { name: `PBIS — ${scopeId}`, ctx: ICS.context(repo.taxonomy.all(), origin(req)) }));
  });

  /* ------------------------------------------------ calendar catalogue */
  app.get('/api/v1/calendars', async (req) => {
    const rows = db.prepare('SELECT * FROM calendars WHERE public=1 ORDER BY rowid').all();
    const counts = db.prepare(`
      SELECT calendar_id, count(*) c FROM calendar_subscriptions
      WHERE revoked_at IS NULL GROUP BY calendar_id`).all();
    const byId = new Map(counts.map(c => [c.calendar_id, c.c]));
    return {
      data: rows.map(r => ({
        id: r.id, name: r.name, scope: r.scope_type, scopeRef: r.scope_ref,
        subscribers: byId.get(r.id) || 0,
        webcal: `${O.webcal(req)}/feeds/${r.id}.ics`,
        https: `${O.origin(req)}/feeds/${r.id}.ics`
      }))
    };
  });
};

function csvCell(v) { return `"${String(v == null ? '' : v).replace(/"/g, '""')}"`; }

function toCSV(events) {
  const t = repo.taxonomy.all();
  const map = a => new Map(a.map(x => [x.id, x]));
  const campuses = map(t.campuses), cats = map(t.categories), locs = map(t.locations), ygs = map(t.yearGroups);
  const head = ['Title','Date','End Date','Start','End','All Day','Campus','Year Groups','Category',
    'Audience','Location','Status','Visibility','Important','Description'];
  const rows = events.map(e => [
    e.title, e.date, e.endDate || '', e.start || '', e.end || '', e.allDay ? 'Yes' : 'No',
    e.campusId ? (campuses.get(e.campusId) || {}).name : 'Whole School',
    e.yearGroupIds.map(y => (ygs.get(y) || {}).name).filter(Boolean).join('; '),
    (cats.get(e.categoryId) || {}).name || '',
    e.audienceIds.join('; '),
    e.locationId ? (locs.get(e.locationId) || {}).name : '',
    e.status, e.visibility, e.important ? 'Yes' : 'No',
    (e.description || '').replace(/\s+/g, ' ').slice(0, 500)
  ]);
  return [head.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\r\n');
}

module.exports.eventsForScope = eventsForScope;
module.exports.resolveScope = resolveScope;
module.exports.toCSV = toCSV;
