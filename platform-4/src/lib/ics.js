'use strict';
/* ==========================================================================
   iCalendar generation. This is the only place ICS is produced — the browser
   downloads and the live subscription feeds both come through here, so a
   parent's phone and a downloaded file can never disagree.
   ========================================================================== */

const T = require('./time');
const R = require('./recurrence');

const esc = s => String(s == null ? '' : s)
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 says lines are folded at 75 octets. */
function fold(line) {
  if (Buffer.byteLength(line, 'utf8') <= 74) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (out.length ? 73 : 74)) { out.push(cur); cur = ' '; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.join('\r\n');
}

function vevent(ev, ctx) {
  const L = [];
  const loc = ctx.locations.get(ev.locationId);
  const cam = ctx.campuses.get(ev.campusId);
  const cat = ctx.categories.get(ev.categoryId);
  const ygs = (ev.yearGroupIds || []).map(x => ctx.yearGroups.get(x)).filter(Boolean).map(y => y.name);

  const desc = [ev.description || ''];
  if (cam) desc.push(`Campus: ${cam.name}`);
  else desc.push('Campus: Whole School');
  if (ygs.length) desc.push(`Year groups: ${ygs.join(', ')}`);
  if (cat) desc.push(`Category: ${cat.name}`);
  desc.push(`${ctx.origin}/events/${ev.slug}`);
  desc.push('PBIS Central Calendar — Panyathip British International School');

  L.push('BEGIN:VEVENT');
  L.push(`UID:${ev.id}@pbis.edu.la`);
  L.push(`DTSTAMP:${T.icsStamp(T.todayKey(), '00:00')}`);
  L.push(`SEQUENCE:${ctx.sequence != null ? ctx.sequence : 0}`);
  if (ev.allDay) {
    L.push(`DTSTART;VALUE=DATE:${T.dateStamp(ev.date)}`);
    L.push(`DTEND;VALUE=DATE:${T.dateStamp(T.addDays(ev.endDate || ev.date, 1))}`);
  } else {
    L.push(`DTSTART:${T.icsStamp(ev.date, ev.start || '08:00')}`);
    L.push(`DTEND:${T.icsStamp(ev.endDate || ev.date, ev.end || ev.start || '09:00')}`);
  }
  const rrule = R.toRRule(ev.recurrence);
  if (rrule) L.push('RRULE:' + rrule);
  L.push(`SUMMARY:${esc(ev.title)}`);
  L.push(`DESCRIPTION:${esc(desc.filter(Boolean).join('\n\n'))}`);
  if (loc) L.push(`LOCATION:${esc(loc.name + (cam ? ` — ${cam.name} Campus` : '') + ', Panyathip British International School')}`);
  if (cat) L.push(`CATEGORIES:${esc(cat.name)}`);
  L.push(`STATUS:${ev.status === 'cancelled' ? 'CANCELLED' : ev.status === 'draft' ? 'TENTATIVE' : 'CONFIRMED'}`);
  L.push(`URL:${ctx.origin}/events/${ev.slug}`);
  L.push(`X-PBIS-CAMPUS:${esc(cam ? cam.name : 'Whole School')}`);
  if (ev.important) L.push('X-PBIS-IMPORTANT:TRUE');
  L.push('END:VEVENT');
  return L;
}

function build(events, opts) {
  const ctx = opts.ctx;
  let L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Panyathip British International School//PBIS Central Calendar//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'
  ];
  L.push(`X-WR-CALNAME:${esc(opts.name || 'PBIS Central Calendar')}`);
  L.push(`X-WR-TIMEZONE:${T.TZ}`);
  L.push(`X-WR-CALDESC:${esc(opts.description || 'Official events from PBIS Central Calendar. One School. Three Campuses. One Shared Calendar.')}`);
  L.push(`X-PUBLISHED-TTL:PT15M`);
  L.push('REFRESH-INTERVAL;VALUE=DURATION:PT15M');
  L.push('BEGIN:VTIMEZONE', `TZID:${T.TZ}`, 'BEGIN:STANDARD',
    'DTSTART:19700101T000000', 'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:+07',
    'END:STANDARD', 'END:VTIMEZONE');
  for (const ev of events) L = L.concat(vevent(ev, ctx));
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

/** Look-up maps so the builder never issues a query per event. */
function context(taxonomy, origin) {
  const map = arr => new Map(arr.map(x => [x.id, x]));
  return {
    origin,
    campuses: map(taxonomy.campuses), yearGroups: map(taxonomy.yearGroups),
    categories: map(taxonomy.categories), locations: map(taxonomy.locations)
  };
}

module.exports = { build, context, esc, fold };
