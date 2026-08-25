'use strict';
/* ==========================================================================
   School time. The canonical zone is Asia/Vientiane (UTC+7, no DST).
   Events are stored as wall time; UTC appears only at the boundary.
   ========================================================================== */

const TZ = 'Asia/Vientiane';
const TZ_OFFSET_MIN = 420;

const pad = n => String(n).padStart(2, '0');

/** Today's date key in school time, whatever the server's own zone is. */
function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function nowMinutes() {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
  const [h, m] = f.split(':').map(Number);
  return h * 60 + m;
}

const parse = key => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const key = dt => dt.toISOString().slice(0, 10);

function addDays(k, n) { const d = parse(k); d.setUTCDate(d.getUTCDate() + n); return key(d); }
function addMonths(k, n) {
  const d = parse(k), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return key(d);
}
const dow = k => parse(k).getUTCDay();
const startOfWeek = k => { const d = dow(k); return addDays(k, d === 0 ? -6 : 1 - d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const toMin = hm => { if (!hm) return 0; const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

const isDateKey = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(parse(v).getTime());
const isTime = v => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

/** Wall time -> UTC instant. */
function toUTC(dateKey, hm) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const [h, mi] = (hm || '00:00').split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - TZ_OFFSET_MIN * 60000);
}
/** Wall time -> ICS UTC stamp, e.g. 20260924T083000Z */
function icsStamp(dateKey, hm) {
  const dt = toUTC(dateKey, hm);
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` +
         `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`;
}
/** Wall time -> ISO-8601 with the school offset, e.g. 2026-09-24T15:30:00+07:00 */
function isoLocal(dateKey, hm) {
  return `${dateKey}T${hm || '00:00'}:00+07:00`;
}
const dateStamp = k => k.replace(/-/g, '');

module.exports = {
  TZ, TZ_OFFSET_MIN, todayKey, nowMinutes, parse, key, addDays, addMonths, dow,
  startOfWeek, diffDays, toMin, isDateKey, isTime, toUTC, icsStamp, isoLocal, dateStamp
};
