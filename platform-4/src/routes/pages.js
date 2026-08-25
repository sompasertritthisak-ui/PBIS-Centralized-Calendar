'use strict';
/* ==========================================================================
   LAYER 4 — INTEGRATION, plus server-rendered pages.

   Event pages are rendered with real meta, Open Graph and JSON-LD before the
   app boots, so a shared link previews correctly and a public event can be
   indexed — while restricted events emit noindex and 404 to the public (§87).
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const repo = require('../repo');
const O = require('../lib/origin');
const T = require('../lib/time');
const { present, lookupContext } = require('./public');
const { eventsForScope, resolveScope } = require('./feeds');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Serialise JSON for embedding inside a <script> block. Plain JSON.stringify
 * is NOT safe here: a value containing "</script>" closes the block early and
 * anything after it is parsed as markup.
 */
const jsonForScript = obj => JSON.stringify(obj)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

let shellCache = null;
function shell() {
  if (!shellCache || process.env.NODE_ENV !== 'production') {
    shellCache = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  }
  return shellCache;
}

/**
 * Inject head tags into the app shell. The shell carries site-wide defaults;
 * they are stripped first so a page never emits two og:title tags and leaves a
 * crawler to guess which one is authoritative.
 */
function withHead(html, tags, origin) {
  return html
    .replace(/<title>[^<]*<\/title>\s*/i, '')
    .replace(/<meta name="description"[^>]*>\s*/i, '')
    .replace(/<meta property="og:(title|description|type|url)"[^>]*>\s*/gi, '')
    .replace('<!--SSR_HEAD-->', tags)
    .replace('<!--SSR_ORIGIN-->', `<script>window.__PBIS_ORIGIN__=${jsonForScript(origin)}</script>`);
}

module.exports = async function pageRoutes(app) {
  const origin = req => O.origin(req);

  /* ------------------------------------------ server-rendered event page */
  app.get('/events/:slug', async (req, reply) => {
    const ev = repo.getEvent(req.user, req.params.slug);
    const base = origin(req);

    if (!ev) {
      return reply.code(404).type('text/html').send(withHead(shell(),
        `<title>Event not found · PBIS Central Calendar</title><meta name="robots" content="noindex">`, base));
    }

    const indexable = ev.visibility === 'public' && ['published','completed'].includes(ev.status);
    const ctx = lookupContext();
    const p = present(ev, ctx);
    const when = ev.allDay
      ? T.parse(ev.date).toDateString()
      : `${ev.date} ${ev.start || ''}`.trim();
    const desc = (ev.description || `${ev.title} at Panyathip British International School.`)
      .replace(/\s+/g, ' ').slice(0, 300);

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: ev.title,
      description: desc,
      startDate: ev.allDay ? ev.date : T.isoLocal(ev.date, ev.start),
      endDate: ev.allDay ? (ev.endDate || ev.date) : T.isoLocal(ev.endDate || ev.date, ev.end),
      eventStatus: ev.status === 'cancelled' ? 'https://schema.org/EventCancelled'
        : ev.status === 'postponed' ? 'https://schema.org/EventPostponed'
        : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: p.location ? {
        '@type': 'Place', name: p.location.name,
        address: { '@type': 'PostalAddress', addressLocality: 'Vientiane', addressCountry: 'LA' }
      } : { '@type': 'Place', name: 'Panyathip British International School',
            address: { '@type': 'PostalAddress', addressLocality: 'Vientiane', addressCountry: 'LA' } },
      organizer: { '@type': 'EducationalOrganization',
        name: 'Panyathip British International School', url: base },
      isAccessibleForFree: true,
      url: `${base}/events/${ev.slug}`
    };

    const head = [
      `<title>${esc(ev.title)} · PBIS Central Calendar</title>`,
      `<meta name="description" content="${esc(desc)}">`,
      `<link rel="canonical" href="${esc(base)}/events/${esc(ev.slug)}">`,
      indexable ? '<meta name="robots" content="index,follow">' : '<meta name="robots" content="noindex,nofollow">',
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${esc(ev.title)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:url" content="${esc(base)}/events/${esc(ev.slug)}">`,
      `<meta property="og:site_name" content="PBIS Central Calendar">`,
      `<meta name="twitter:card" content="summary">`,
      `<meta name="twitter:title" content="${esc(ev.title)}">`,
      `<meta name="twitter:description" content="${esc(desc)}">`,
      `<meta name="pbis:when" content="${esc(when)}">`,
      indexable ? `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>` : '',
      `<link rel="alternate" type="text/calendar" href="${esc(base)}/api/v1/events/${esc(ev.id)}.ics">`
    ].join('\n');

    return reply.type('text/html')
      .header('X-Robots-Tag', indexable ? 'index' : 'noindex')
      .send(withHead(shell(), head, base));
  });

  /* ------------------------------------------------------------ embed */
  app.get('/embed', async (req, reply) => {
    const q = req.query;
    const from = T.isDateKey(q.from) ? q.from : T.todayKey();
    const to = T.isDateKey(q.to) ? q.to : T.addDays(from, 120);
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 8));
    const theme = q.theme === 'dark' ? 'dark' : 'light';

    const campus = q.campus ? (db.prepare('SELECT id FROM campuses WHERE slug=? OR id=?').get(q.campus, q.campus) || {}).id : null;
    const yg = q.yearGroup ? (db.prepare('SELECT id FROM year_groups WHERE slug=? OR id=?').get(q.yearGroup, q.yearGroup) || {}).id : null;

    const occ = repo.listInRange({ role: 'public' }, {
      from, to,
      campus: campus ? [campus] : undefined,
      yearGroup: yg ? [yg] : undefined,
      category: q.category ? String(q.category).split(',') : undefined,
      audience: q.audience ? String(q.audience).split(',') : undefined,
      important: q.important === 'true'
    }).filter(o => o.isStart).slice(0, limit);

    const ctx = lookupContext();
    const rows = occ.map(o => {
      const cat = ctx.categories.get(o.event.categoryId);
      const loc = ctx.locations.get(o.event.locationId);
      const cam = ctx.campuses.get(o.event.campusId);
      const d = T.parse(o.date);
      return `<a class="ev" href="${esc(origin(req))}/events/${esc(o.event.slug)}" target="_blank" rel="noopener">
        <span class="d"><b>${d.getUTCDate()}</b><i>${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]}</i></span>
        <span class="t"><b>${esc(o.event.title)}</b>
          <i>${o.event.allDay ? 'All day' : esc((o.event.start || '') + (o.event.end ? '–' + o.event.end : ''))}
             · ${esc(cam ? cam.name : 'Whole School')}${loc ? ' · ' + esc(loc.name) : ''}</i></span>
        <span class="c" style="--c:var(${esc((cat || {}).colour_var || '--cat-other')})"></span></a>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>PBIS Events</title>
<meta name="robots" content="noindex">
<style>
:root{--bg:#FBFAF5;--fg:#161A18;--muted:#5A635E;--line:#E2E6E3;--gold:#8A6A16;
  --cat-academic:#2F6690;--cat-assessment:#5C5A8A;--cat-exam:#7A4B72;--cat-sports:#2E7D5B;--cat-eca:#3D8062;
  --cat-trip:#57764A;--cat-assembly:#4A6572;--cat-parent:#A8821F;--cat-staff:#6B6257;--cat-meeting:#69747C;
  --cat-holiday:#A8342A;--cat-deadline:#B4592C;--cat-admissions:#7B5E9B;--cat-celebration:#C39A2B;
  --cat-graduation:#8A6A16;--cat-other:#79837D}
html[data-theme=dark]{--bg:#0A1710;--fg:#E9F0EB;--muted:#A7BDB0;--line:#1D3A2A;--gold:#D4AF47}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
  font:15px/1.5 Inter,system-ui,-apple-system,'Segoe UI',sans-serif}
.ev{display:grid;grid-template-columns:46px 1fr 3px;gap:12px;align-items:center;padding:11px 14px;
  border-bottom:1px solid var(--line);text-decoration:none;color:inherit}
.ev:last-child{border-bottom:0}.ev:hover{background:rgba(0,0,0,.03)}
html[data-theme=dark] .ev:hover{background:rgba(255,255,255,.04)}
.d{text-align:center;line-height:1.05}.d b{display:block;font-size:19px;font-weight:600}
.d i{font-style:normal;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.t b{display:block;font-weight:550;font-size:14px}.t i{font-style:normal;font-size:12px;color:var(--muted)}
.c{width:3px;height:26px;border-radius:2px;background:var(--c)}
.f{padding:10px 14px;font-size:11px;color:var(--muted);display:flex;justify-content:space-between;gap:8px}
.f a{color:var(--gold);text-decoration:none;font-weight:600}
.empty{padding:26px 14px;color:var(--muted);font-size:13px;text-align:center}
</style></head><body>
${rows || '<div class="empty">No events scheduled in this period.</div>'}
<div class="f"><span>PBIS Central Calendar</span>
  <a href="${esc(origin(req))}/calendar" target="_blank" rel="noopener">View full calendar →</a></div>
</body></html>`;

    return reply.type('text/html')
      .header('Cache-Control', 'public, max-age=300')
      .header('X-Frame-Options', 'ALLOWALL')
      .send(html);
  });

  /* ------------------------------------------- LAYER 4: integration API */
  const requireKey = async (req, reply) => {
    if (!req.apiKey) {
      reply.code(401).send({ error: 'api_key_required',
        message: 'Send an integration key as: Authorization: Bearer pbis_…' });
      return reply;
    }
  };

  app.get('/api/v1/integration/today', { onRequest: [requireKey] }, async (req) => {
    const today = T.todayKey();
    const occ = repo.listInRange({ role: 'public' }, { from: today, to: today });
    const ctx = lookupContext();
    return { data: { date: today, events: occ.map(o => present(o.event, ctx)) },
             meta: { key: req.apiKey.name, timezone: T.TZ } };
  });

  app.get('/api/v1/integration/events', { onRequest: [requireKey] }, async (req) => {
    const from = T.isDateKey(req.query.from) ? req.query.from : T.todayKey();
    const to = T.isDateKey(req.query.to) ? req.query.to : T.addDays(from, 90);
    const scope = resolveScope(req.query.scope || 'all') || { scope_type: 'all', name: 'All' };
    const events = eventsForScope(scope, { role: 'public' }, { from, to });
    const ctx = lookupContext();
    return { data: events.map(e => present(e, ctx)),
             meta: { scope: scope.id || 'all', from, to, count: events.length, key: req.apiKey.name } };
  });

  /* -------------------------------------------------------- robots/sitemap */
  app.get('/robots.txt', async (req, reply) => reply.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin(req)}/sitemap.xml\n`));

  app.get('/sitemap.xml', async (req, reply) => {
    const base = origin(req);
    const rows = db.prepare(`SELECT slug, updated_at FROM events
      WHERE visibility='public' AND status IN ('published','completed') AND deleted_at IS NULL
      ORDER BY start_date DESC LIMIT 5000`).all();
    const urls = ['', '/calendar', '/dates', '/year', '/subscribe']
      .map(p => `<url><loc>${base}${p}</loc><changefreq>daily</changefreq></url>`)
      .concat(rows.map(r =>
        `<url><loc>${base}/events/${r.slug}</loc><lastmod>${r.updated_at.slice(0, 10)}</lastmod></url>`));
    return reply.type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  });
};
