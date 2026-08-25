'use strict';
/* ==========================================================================
   Occurrence expansion. One event record becomes concrete dates.
   Supports: single, multi-day spans, daily / weekly / monthly / yearly,
   nth-weekday-of-month (BYSETPOS), and term-time-only weekly series.
   ========================================================================== */

const T = require('./time');

const DAY_CODE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * @param ev   event row with start_date, end_date, recurrence (object|null)
 * @param from inclusive range start (date key)
 * @param to   inclusive range end
 * @param cal  school calendar context for term-time rules:
 *               { terms: [{start_date,end_date}], closures: Set<dateKey> }
 *             An array may be passed for terms alone.
 * @returns [{date, isStart, isEnd, spanIndex, spanLen}]
 */
function expand(ev, from, to, cal) {
  const out = [];
  const spanLen = ev.end_date ? Math.max(1, T.diffDays(ev.start_date, ev.end_date) + 1) : 1;

  const terms = Array.isArray(cal) ? cal : (cal && cal.terms) || null;
  const closures = (cal && !Array.isArray(cal) && cal.closures) || null;

  // "Term time" means inside a term AND on a day the school is actually open:
  // half terms, public holidays and training days sit inside term dates but
  // are not school days, so a weekly assembly must skip them.
  const isSchoolDay = d => {
    if (terms && terms.length && !terms.some(t => d >= t.start_date && d <= t.end_date)) return false;
    if (closures && closures.has(d)) return false;
    const wd = T.dow(d);
    if (wd === 0 || wd === 6) return false;
    return true;
  };

  const push = startKey => {
    for (let i = 0; i < spanLen; i++) {
      const d = T.addDays(startKey, i);
      if (d >= from && d <= to) {
        out.push({ date: d, isStart: i === 0, isEnd: i === spanLen - 1, spanIndex: i, spanLen });
      }
    }
  };

  const r = ev.recurrence;
  if (!r || !r.freq) { push(ev.start_date); return out; }

  const until = r.until && r.until < to ? r.until : to;
  const hardStop = until;
  const interval = Math.max(1, r.interval || 1);
  const wantsTermTime = !!r.termTime;
  let guard = 0;

  if (r.freq === 'weekly') {
    const days = (r.byday && r.byday.length) ? r.byday : [T.dow(ev.start_date)];
    const anchorWeek = T.startOfWeek(ev.start_date);
    let wk = T.startOfWeek(from < ev.start_date ? ev.start_date : from);
    const weeksFromAnchor = Math.round(T.diffDays(anchorWeek, wk) / 7);
    const rem = ((weeksFromAnchor % interval) + interval) % interval;
    if (rem !== 0) wk = T.addDays(wk, (interval - rem) * 7);
    while (wk <= hardStop && guard++ < 600) {
      for (const dw of days) {
        const offset = dw === 0 ? 6 : dw - 1;          // Monday-start week
        const d = T.addDays(wk, offset);
        if (d >= ev.start_date && d <= hardStop && d >= from && d <= to) {
          if (!wantsTermTime || isSchoolDay(d)) push(d);
        }
      }
      wk = T.addDays(wk, 7 * interval);
    }
  } else if (r.freq === 'daily') {
    let d = ev.start_date;
    while (d <= hardStop && guard++ < 2000) {
      if (d >= from && d <= to && (!wantsTermTime || isSchoolDay(d))) push(d);
      d = T.addDays(d, interval);
    }
  } else if (r.freq === 'monthly') {
    if (r.bysetpos && r.byday && r.byday.length) {
      // e.g. first Friday of each month: bysetpos 1, byday [5]
      let cursor = ev.start_date.slice(0, 8) + '01';
      while (cursor <= hardStop && guard++ < 400) {
        const d = nthWeekdayOfMonth(cursor, r.byday[0], r.bysetpos);
        if (d && d >= ev.start_date && d >= from && d <= to && d <= hardStop
            && (!wantsTermTime || isSchoolDay(d))) push(d);
        cursor = T.addMonths(cursor, interval);
      }
    } else {
      let d = ev.start_date;
      while (d <= hardStop && guard++ < 400) {
        if (d >= from && d <= to && (!wantsTermTime || isSchoolDay(d))) push(d);
        d = T.addMonths(d, interval);
      }
    }
  } else if (r.freq === 'yearly') {
    let d = ev.start_date;
    while (d <= hardStop && guard++ < 60) {
      if (d >= from && d <= to) push(d);
      d = T.addMonths(d, 12 * interval);
    }
  } else {
    push(ev.start_date);
  }
  return out;
}

/** nth (1-5, or -1 for last) weekday in the month containing monthKey. */
function nthWeekdayOfMonth(monthKey, weekday, nth) {
  const first = monthKey.slice(0, 8) + '01';
  const lastDay = new Date(Date.UTC(
    Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0)).getUTCDate();
  const hits = [];
  for (let day = 1; day <= lastDay; day++) {
    const d = `${monthKey.slice(0, 8)}${String(day).padStart(2, '0')}`;
    if (T.dow(d) === weekday) hits.push(d);
  }
  if (!hits.length) return null;
  return nth === -1 ? hits[hits.length - 1] : (hits[nth - 1] || null);
}

/** Serialise our recurrence object to an RFC 5545 RRULE line. */
function toRRule(r) {
  if (!r || !r.freq) return null;
  let rule = `FREQ=${String(r.freq).toUpperCase()}`;
  if (r.interval && r.interval > 1) rule += `;INTERVAL=${r.interval}`;
  if (r.byday && r.byday.length) rule += `;BYDAY=${r.byday.map(d => DAY_CODE[d]).join(',')}`;
  if (r.bysetpos) rule += `;BYSETPOS=${r.bysetpos}`;
  if (r.until) rule += `;UNTIL=${T.icsStamp(r.until, '23:59')}`;
  if (r.count) rule += `;COUNT=${r.count}`;
  return rule;
}

/** Parse an RRULE line back into our object (used by ICS import). */
function fromRRule(line) {
  if (!line) return null;
  const parts = {};
  line.replace(/^RRULE:/i, '').split(';').forEach(kv => {
    const [k, v] = kv.split('=');
    if (k) parts[k.toUpperCase()] = v;
  });
  if (!parts.FREQ) return null;
  const r = { freq: parts.FREQ.toLowerCase() };
  if (parts.INTERVAL) r.interval = Number(parts.INTERVAL);
  if (parts.BYDAY) r.byday = parts.BYDAY.split(',').map(c => DAY_CODE.indexOf(c.replace(/^[+-]?\d/, ''))).filter(n => n >= 0);
  if (parts.BYSETPOS) r.bysetpos = Number(parts.BYSETPOS);
  if (parts.UNTIL) r.until = parts.UNTIL.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  if (parts.COUNT) r.count = Number(parts.COUNT);
  return r;
}

module.exports = { expand, toRRule, fromRRule, nthWeekdayOfMonth, DAY_CODE };
