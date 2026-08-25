'use strict';
/* ==========================================================================
   LAYER 1 — PUBLIC CALENDAR API
   No authentication. Serves only what a member of the public may see; the
   visibility clause is applied inside the repository, not here, so it cannot
   be forgotten.
   ========================================================================== */

const repo = require('../repo');
const T = require('../lib/time');
const { db } = require('../db');

const asArray = v => v == null ? undefined : (Array.isArray(v) ? v : String(v).split(',').filter(Boolean));

/** Public shape of an event. Internal columns never cross this boundary. */
function present(ev, ctx) {
  const cam = ctx.campuses.get(ev.campusId);
  const cat = ctx.categories.get(ev.categoryId);
  const loc = ctx.locations.get(ev.locationId);
  const org = ctx.users.get(ev.organizerId);
  return {
    id: ev.id,
    slug: ev.slug,
    title: ev.title,
    description: ev.description,
    start: ev.allDay ? ev.date : T.isoLocal(ev.date, ev.start),
    end: ev.allDay ? (ev.endDate || ev.date) : T.isoLocal(ev.endDate || ev.date, ev.end),
    allDay: ev.allDay,
    timezone: ev.timezone,
    campus: cam ? { id: cam.id, name: cam.name, slug: cam.slug } : null,
    yearGroups: ev.yearGroupIds.map(x => ctx.yearGroups.get(x)).filter(Boolean)
      .map(y => ({ id: y.id, name: y.name, slug: y.slug })),
    audiences: ev.audienceIds,
    category: cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null,
    location: loc ? { id: loc.id, name: loc.name } : null,
    organizer: org ? { name: org.name } : null,
    visibility: ev.visibility,
    status: ev.status,
    important: ev.important,
    recurrence: ev.recurrence,
    attachments: ev.attachments,
    links: ev.links,
    updatedAt: ev.updatedAt,
    urls: {
      self: `/api/v1/events/${ev.slug}`,
      ics: `/api/v1/events/${ev.id}.ics`,
      web: `/events/${ev.slug}`
    }
  };
}

function lookupContext() {
  const t = repo.taxonomy.all();
  const map = a => new Map(a.map(x => [x.id, x]));
  return {
    campuses: map(t.campuses), yearGroups: map(t.yearGroups),
    categories: map(t.categories), locations: map(t.locations),
    users: map(db.prepare('SELECT id, name FROM users').all())
  };
}

module.exports = async function publicRoutes(app) {
  /* ------------------------------------------------------------ events */
  app.get('/api/v1/events', async (req, reply) => {
    const q = req.query;
    const from = T.isDateKey(q.from) ? q.from : T.todayKey();
    const to = T.isDateKey(q.to) ? q.to : T.addDays(from, 90);
    if (T.diffDays(from, to) > 800) {
      return reply.code(422).send({ error: 'range_too_large',
        message: 'Maximum range is 800 days. Request a narrower window.', maxDays: 800 });
    }
    if (to < from) {
      return reply.code(422).send({ error: 'invalid_range', message: '"to" must not precede "from".' });
    }
    const limit = Math.min(500, Math.max(1, Number(q.limit) || 200));
    const occ = repo.listInRange(req.user, {
      from, to,
      campus: asArray(q.campus), yearGroup: asArray(q.yearGroup),
      category: asArray(q.category), audience: asArray(q.audience),
      important: q.important === 'true' || q.important === '1',
      q: q.q
    });
    const ctx = lookupContext();
    const items = occ.slice(0, limit);
    return {
      data: items.map(o => ({ date: o.date, occurrence: o.spanLen > 1 ? { index: o.spanIndex, of: o.spanLen } : null,
                              ...present(o.event, ctx) })),
      meta: {
        total: occ.length, returned: items.length, from, to,
        timezone: T.TZ, generatedAt: new Date().toISOString(),
        academicYear: (repo.taxonomy.activeYear() || {}).name || null
      }
    };
  });

  app.get('/api/v1/events/:slug', async (req, reply) => {
    const raw = String(req.params.slug).replace(/\.ics$/, '');
    const ev = repo.getEvent(req.user, raw);
    if (!ev) return reply.code(404).send({ error: 'not_found' });
    return { data: present(ev, lookupContext()) };
  });

  /* ------------------------------------------------------- structure */
  app.get('/api/v1/campuses', async () => {
    const t = repo.taxonomy.all();
    return {
      data: t.campuses.map(c => ({
        id: c.id, name: c.name, short: c.short, slug: c.slug, blurb: c.blurb, colour: c.colour,
        yearGroups: t.yearGroups.filter(y => y.campus_id === c.id)
          .map(y => ({ id: y.id, name: y.name, slug: y.slug }))
      }))
    };
  });

  app.get('/api/v1/taxonomy', async () => {
    const t = repo.taxonomy.all();
    return {
      data: {
        campuses: t.campuses, yearGroups: t.yearGroups, categories: t.categories,
        audiences: t.audiences, locations: t.locations,
        academicYears: t.academicYears, terms: t.terms
      }
    };
  });

  app.get('/api/v1/academic-years', async () => {
    const t = repo.taxonomy.all();
    return {
      data: t.academicYears.map(a => ({
        id: a.id, name: a.name, start: a.start_date, end: a.end_date, status: a.status,
        terms: t.terms.filter(x => x.academic_year_id === a.id)
          .map(x => ({ id: x.id, name: x.name, start: x.start_date, end: x.end_date, status: x.status }))
      }))
    };
  });

  /* --------------------------------------------------------- signage */
  app.get('/api/v1/today', async (req) => {
    const today = T.todayKey();
    const nowM = T.nowMinutes();
    const occ = repo.listInRange(req.user, { from: today, to: today });
    const ctx = lookupContext();
    const timed = occ.filter(o => !o.event.allDay && o.event.start)
      .sort((a, b) => T.toMin(a.event.start) - T.toMin(b.event.start));
    const current = timed.find(o => nowM >= T.toMin(o.event.start) && nowM <= T.toMin(o.event.end || o.event.start));
    const upcoming = repo.listInRange(req.user, { from: T.addDays(today, 1), to: T.addDays(today, 14) })
      .filter(o => o.isStart).slice(0, 6);
    return {
      data: {
        date: today,
        clock: new Intl.DateTimeFormat('en-GB', { timeZone: T.TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
        current: current ? present(current.event, ctx) : null,
        next: timed.filter(o => T.toMin(o.event.start) > nowM).slice(0, 5).map(o => present(o.event, ctx)),
        allDay: occ.filter(o => o.event.allDay).map(o => present(o.event, ctx)),
        schedule: timed.map(o => present(o.event, ctx)),
        upcoming: upcoming.map(o => ({ date: o.date, ...present(o.event, ctx) }))
      },
      meta: { timezone: T.TZ, generatedAt: new Date().toISOString() }
    };
  });

  /* ------------------------------------------------------- discovery */
  app.get('/api/v1', async () => ({
    name: 'PBIS Central Calendar API',
    version: '1.0',
    timezone: T.TZ,
    layers: {
      public: '/api/v1/(events|campuses|academic-years|taxonomy|today)',
      user: '/api/v1/me/*  (session cookie)',
      administrative: '/api/v1/admin/*  (session cookie + permission)',
      integration: '/api/v1/integration/*  (Bearer API key)'
    },
    feeds: '/feeds/{scope}.ics',
    documentation: '/api'
  }));
};

module.exports.present = present;
module.exports.lookupContext = lookupContext;
module.exports.asArray = asArray;
