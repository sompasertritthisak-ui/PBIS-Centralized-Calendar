'use strict';
/* ==========================================================================
   READING iCALENDAR

   One parser, used by the CMS import route and by the command-line importer.
   The browser used to have its own copy and it drifted — folded lines
   truncated, all-day DTEND treated as inclusive — so there is deliberately
   only one of these now.
   ========================================================================== */

const T = require('./time');
const R = require('./recurrence');

/** RFC 5545 text escaping, reversed. */
const unescapeIcs = s => String(s)
  .replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

/**
 * Read one DTSTART / DTEND into school wall time.
 *
 * Three forms turn up in the wild, and Google emits all three:
 *   DTSTART;VALUE=DATE:20260901              an all-day event
 *   DTSTART;TZID=Asia/Bangkok:20260901T0830  a zoned instant
 *   DTSTART:20260901T013000Z                 UTC
 *
 * Bangkok and Vientiane are both UTC+7 with no daylight saving, so a TZID of
 * either is already school time. A UTC instant has to be shifted. Anything
 * else zoned is taken at face value: guessing a third time zone would be
 * worse than being predictable about it.
 */
function moment({ params, value }) {
  if (!value) return { date: '', time: '' };
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return { date: '', time: '' };
  let date = `${m[1]}-${m[2]}-${m[3]}`;
  if (/VALUE=DATE(?!-TIME)/i.test(params) || !m[4]) return { date, time: '' };

  let hours = Number(m[4]), mins = Number(m[5]);
  if (m[7]) { // UTC → Asia/Vientiane
    const shifted = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], hours, mins) + T.TZ_OFFSET_MIN * 60000);
    date = shifted.toISOString().slice(0, 10);
    hours = shifted.getUTCHours(); mins = shifted.getUTCMinutes();
  }
  return { date, time: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}` };
}

/**
 * Parse a VCALENDAR into plain event shapes. Taxonomy is only used to match a
 * LOCATION by name; campus, category and audience are left for the caller to
 * decide, because those depend on which calendar the file came from.
 *
 * Cancelled events and the recurrence exceptions Google emits as separate
 * VEVENTs with RECURRENCE-ID are skipped: importing them would create
 * duplicates of days the RRULE already covers.
 */
function parseIcs(text, taxo) {
  const locations = (taxo && taxo.locations) || [];
  const byName = v => locations.find(x =>
    x.name.toLowerCase() === String(v).trim().toLowerCase() ||
    x.slug === String(v).trim().toLowerCase());

  const blocks = String(text).split(/BEGIN:VEVENT/i).slice(1);
  const out = [];
  let skipped = { cancelled: 0, exceptions: 0, unreadable: 0 };

  for (let b of blocks) {
    // Unfold first: RFC 5545 wraps long lines and Google wraps almost every
    // DESCRIPTION. Without this a folded SUMMARY or LOCATION is truncated.
    b = b.replace(/\r?\n[ \t]/g, '');
    const line = k => {
      const m = b.match(new RegExp('^' + k + '([^:]*):(.*)$', 'mi'));
      return m ? { params: m[1] || '', value: m[2].trim() } : { params: '', value: '' };
    };
    const get = k => line(k).value;

    if (/^STATUS[^:]*:CANCELLED/mi.test(b)) { skipped.cancelled++; continue; }
    if (get('RECURRENCE-ID')) { skipped.exceptions++; continue; }

    const S = line('DTSTART'), E = line('DTEND');
    const start = moment(S), end = moment(E);
    if (!start.date) { skipped.unreadable++; continue; }
    const allDay = !start.time;

    // For an all-day event DTEND is exclusive (RFC 5545 3.8.2.2), so one day
    // reads as start+1. Step back to the inclusive last day the school
    // actually means, and drop it when the event is a single day.
    let endDate = '';
    if (allDay && end.date) {
      const inclusive = T.addDays(end.date, -1);
      if (inclusive > start.date) endDate = inclusive;
    } else if (end.date && end.date > start.date) {
      endDate = end.date;
    }

    const locRaw = unescapeIcs(get('LOCATION'));
    out.push({
      uid: get('UID') || null,
      title: unescapeIcs(get('SUMMARY')),
      date: start.date,
      endDate,
      start: start.time || '',
      end: end.time || '',
      allDay,
      locationId: (byName(locRaw) || {}).id || null,
      _locRaw: locRaw,
      description: unescapeIcs(get('DESCRIPTION')),
      recurrence: R.fromRRule(get('RRULE')),
      campusId: null, categoryId: null, yearGroupIds: [], audienceIds: []
    });
  }
  return { events: out, skipped };
}

module.exports = { parseIcs, moment, unescapeIcs };
