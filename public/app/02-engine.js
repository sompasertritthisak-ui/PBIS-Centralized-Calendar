/* ==========================================================================
   PBIS CENTRAL CALENDAR — ENGINE
   Occurrence expansion · query/filter · personalisation · conflicts · feeds
   ========================================================================== */

/* ------------------------------------------------------------- ICONS ----- */
const I = (() => {
  const s = (p, extra='') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
  return {
    calendar:s('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
    calendarPlus:s('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 13v5M9.5 15.5h5"/>'),
    calendarCheck:s('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M9 15l2 2 4-4"/>'),
    clock:s('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 1.9"/>'),
    pin:s('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>'),
    users:s('<path d="M16 20v-1.8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7.5" r="3.4"/><path d="M22 20v-1.8a4 4 0 0 0-3-3.9M16.5 4.3a3.4 3.4 0 0 1 0 6.5"/>'),
    school:s('<path d="M3 10.5 12 5l9 5.5"/><path d="M5.5 12v7.5h13V12"/><path d="M9.5 19.5V15h5v4.5"/>'),
    search:s('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>'),
    filter:s('<path d="M3 5.5h18l-7 8v5.2l-4 2v-7.2Z"/>'),
    chevL:s('<path d="m15 5-7 7 7 7"/>'),
    chevR:s('<path d="m9 5 7 7-7 7"/>'),
    chevD:s('<path d="m6 9 6 6 6-6"/>'),
    chevU:s('<path d="m18 15-6-6-6 6"/>'),
    x:s('<path d="M18 6 6 18M6 6l12 12"/>'),
    plus:s('<path d="M12 5v14M5 12h14"/>'),
    check:s('<path d="m5 13 4 4 10-10"/>'),
    checkCircle:s('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-4.9"/>'),
    alert:s('<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4M12 17.2v.1"/>'),
    info:s('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8.1v.1"/>'),
    ban:s('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
    star:s('<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8Z"/>'),
    download:s('<path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>'),
    upload:s('<path d="M12 15.5v-11M7.5 8.5 12 4l4.5 4.5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>'),
    share:s('<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="m8.3 10.8 7.4-3.9M8.3 13.2l7.4 3.9"/>'),
    link:s('<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.5-1.5"/>'),
    rss:s('<path d="M5 18.5v.1"/><path d="M5 12a7 7 0 0 1 7 7M5 5.5a13.5 13.5 0 0 1 13.5 13.5"/>'),
    bell:s('<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z"/><path d="M13.7 19.5a2 2 0 0 1-3.4 0"/>'),
    settings:s('<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.4a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10.2 3h.1a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.6 1.7Z"/>'),
    grid:s('<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/>'),
    list:s('<path d="M8.5 6h12M8.5 12h12M8.5 18h12M3.7 6v.1M3.7 12v.1M3.7 18v.1"/>'),
    layers:s('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3.5 12.5 8.5 4.7 8.5-4.7"/>'),
    edit:s('<path d="M16.5 3.9a2.1 2.1 0 0 1 3 3L8 18.4l-4 1 1-4Z"/>'),
    copy:s('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M4.5 15.5A2 2 0 0 1 3.5 14V5a2 2 0 0 1 2-2h9a2 2 0 0 1 1.5.7"/>'),
    trash:s('<path d="M4 6.5h16M9.5 6.5V4.6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.9M6.5 6.5 7.3 20a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-13.5"/>'),
    undo:s('<path d="M4 9.5h10a5 5 0 0 1 0 10H9"/><path d="M7.5 6 4 9.5 7.5 13"/>'),
    menu:s('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    sun:s('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>'),
    moon:s('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>'),
    google:s('<path d="M21 12.2c0-.7-.06-1.3-.18-1.9H12v3.6h5.05c-.22 1.2-.88 2.2-1.88 2.9v2.4h3.05C19.99 17.5 21 15.1 21 12.2Z"/><path d="M12 21.5c2.55 0 4.7-.85 6.22-2.3l-3.05-2.4c-.85.57-1.93.9-3.17.9-2.44 0-4.5-1.65-5.24-3.86H3.6v2.42A9.5 9.5 0 0 0 12 21.5Z"/><path d="M6.76 13.84a5.7 5.7 0 0 1 0-3.66V7.76H3.6a9.5 9.5 0 0 0 0 8.5l3.16-2.42Z"/><path d="M12 6.28c1.38 0 2.62.48 3.6 1.4l2.7-2.7C16.7 3.42 14.55 2.5 12 2.5A9.5 9.5 0 0 0 3.6 7.76l3.16 2.42C7.5 7.94 9.56 6.28 12 6.28Z"/>'),
    apple:s('<path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.15-2.8.85-3.5.85s-1.8-.83-3-.8c-1.5.02-2.9.9-3.7 2.25-1.6 2.75-.4 6.8 1.1 9 .75 1.1 1.6 2.3 2.8 2.25 1.1-.05 1.5-.7 2.9-.7s1.7.7 2.9.7c1.2 0 2-1.1 2.7-2.2.85-1.25 1.2-2.5 1.2-2.55-.03-.02-2.3-.9-2.3-3.5Z"/><path d="M14.3 5.5c.6-.75 1-1.8.9-2.85-.87.04-1.93.6-2.55 1.35-.55.65-1.05 1.7-.92 2.7.97.08 1.96-.5 2.57-1.2Z"/>'),
    outlook:s('<rect x="2.5" y="5.5" width="11" height="13" rx="1.6"/><path d="M13.5 8.5h8v9.4a.6.6 0 0 1-.6.6h-7.4"/><ellipse cx="8" cy="12" rx="2.6" ry="3.2"/>'),
    inbox:s('<path d="M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4"/><path d="M5.2 4.5h13.6l2.7 9v5a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2v-5Z"/>'),
    dashboard:s('<path d="M3.5 12.5a8.5 8.5 0 0 1 17 0"/><path d="m12 12.5 3.6-3.2"/><circle cx="12" cy="12.5" r="1.2"/><path d="M3.5 12.5v3.6h17V12.5"/>'),
    tag:s('<path d="M3.5 11.4V4.9a1.4 1.4 0 0 1 1.4-1.4h6.5l9 9-7.9 7.9-9-9Z"/><circle cx="7.8" cy="7.8" r="1.3"/>'),
    mapPin:s('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>'),
    history:s('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5V10H9"/><path d="M12 7.8V12l3 1.8"/>'),
    shield:s('<path d="M12 3 5 5.8v5.4c0 4.3 2.9 8.2 7 9.3 4.1-1.1 7-5 7-9.3V5.8Z"/><path d="m9.2 12 2 2 3.6-3.8"/>'),
    file:s('<path d="M14 3.5H7a1.8 1.8 0 0 0-1.8 1.8v13.4A1.8 1.8 0 0 0 7 20.5h10a1.8 1.8 0 0 0 1.8-1.8V8.3Z"/><path d="M13.8 3.6V8.4h4.9"/>'),
    monitor:s('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7M12 17v4"/>'),
    sparkle:s('<path d="m12 3.5 1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8Z"/><path d="M18.5 3.2v2.6M17.2 4.5h2.6"/>'),
    arrowRight:s('<path d="M4.5 12h15M13.5 6l6 6-6 6"/>'),
    graduation:s('<path d="m3 9.5 9-4.5 9 4.5-9 4.5Z"/><path d="M7 11.5v4.2c0 1.3 2.2 2.6 5 2.6s5-1.3 5-2.6v-4.2"/><path d="M21 9.5v5"/>'),
    building:s('<rect x="4.5" y="3.5" width="15" height="17" rx="1.6"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10.5 20.5v-4h3v4"/>'),
    play:s('<path d="M7 5.5 18 12 7 18.5Z"/>'),
    refresh:s('<path d="M20 11.5A8 8 0 0 0 6.3 6.3L3.5 9"/><path d="M4 12.5a8 8 0 0 0 13.7 5.2l2.8-2.7"/><path d="M3.5 4.5V9H8M20.5 19.5V15H16"/>'),
    globe:s('<circle cx="12" cy="12" r="9"/><path d="M3.2 9.5h17.6M3.2 14.5h17.6"/><ellipse cx="12" cy="12" rx="4" ry="9"/>'),
    lock:s('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>'),
    eye:s('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
    move:s('<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
    repeat:s('<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9.5a3.5 3.5 0 0 1 3.5-3.5h13.5"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v1.5a3.5 3.5 0 0 1-3.5 3.5H3.5"/>'),
    table:s('<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9.5h18M3 14.5h18M9 9.5v10"/>'),
    external:s('<path d="M13.5 4.5H19.5V10.5"/><path d="M19.5 4.5 11 13"/><path d="M18 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4"/>'),
    signout:s('<path d="M9.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h3.5"/><path d="M15 8.5 19 12l-4 3.5"/><path d="M19 12H9.5"/>'),
    user:s('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>'),
    key:s('<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3.5M15.5 12v2.5"/>')
  };
})();
PBIS.I = I;

/* --------------------------------------------------------------- LOGO ----
   Every logo on every surface is a cropped <use> of the single sprite in the
   document head. There is one artwork, so the brand cannot drift.
   -------------------------------------------------------------------------- */
const LOGO_BOX = {
  full:  {vb:'80 122 1548 1427', ratio:1427/1548, ref:'pbisArt'},   // 25th anniversary lockup
  crest: {vb:'809 442 550 550',  ratio:1,          ref:'pbisCrest'}, // PBIS globe crest
  word:  {vb:'80 1344 1478 205', ratio:205/1478,   ref:'pbisWord'}   // school wordmark
};
function logo(kind, width, opts){
  const b = LOGO_BOX[kind] || LOGO_BOX.crest;
  const o = opts || {};
  const h = Math.round(width * b.ratio);
  const label = o.label || 'Panyathip British International School';
  const a11y = o.decorative===false
    ? `role="img" aria-label="${esc(label)}"`
    : 'aria-hidden="true" focusable="false"';
  return `<svg class="logo logo-${kind}${o.cls?' '+o.cls:''}" viewBox="${b.vb}" width="${width}" height="${h}" ${a11y}><use href="#${b.ref}"/></svg>`;
}
PBIS.logo = logo;

/* -------------------------------------------------- OCCURRENCE ENGINE ---- */
/**
 * Expand a canonical event record into concrete day occurrences within a range.
 * Handles: single-day, multi-day spans, and weekly/daily/monthly recurrence.
 * Returns light objects: {ev, date, isStart, isEnd, spanIndex, spanLen}
 */
function closureSet(){
  const set = new Set();
  Store.state.events.forEach(e => {
    if (e.categoryId !== 'holiday' || ['cancelled','draft','archived'].includes(e.status)) return;
    const last = e.endDate || e.date; let d = e.date, g = 0;
    while (d <= last && g++ < 400) { set.add(d); d = T.addDays(d, 1); }
  });
  return set;
}
function isSchoolDay(d, closures){
  const terms = Store.state.terms;
  if (terms && terms.length && !terms.some(t => d >= t.start && d <= t.end)) return false;
  if (closures && closures.has(d)) return false;
  const wd = T.dow(d);
  return wd !== 0 && wd !== 6;
}
function expand(ev, from, to, closures){
  const out = [];
  const wantsTermTime = !!(ev.recurrence && ev.recurrence.termTime);
  const closed = closures || (wantsTermTime ? closureSet() : null);
  const push = (startKey) => {
    const len = ev.endDate ? Math.max(1, T.diffDays(ev.date, ev.endDate)+1) : 1;
    for(let i=0;i<len;i++){
      const d = T.addDays(startKey, i);
      if(d>=from && d<=to) out.push({ev, date:d, isStart:i===0, isEnd:i===len-1, spanIndex:i, spanLen:len});
    }
  };
  const r = ev.recurrence;
  if(!r){ push(ev.date); return out; }

  const until = r.until || r.count ? (r.until || to) : to;
  const hardStop = (until < to ? until : to);
  let guard = 0;

  if(r.freq==='weekly'){
    const days = (r.byday && r.byday.length) ? r.byday : [T.dow(ev.date)];
    const interval = r.interval||1;
    const anchorWeek = T.startOfWeek(ev.date);
    let wk = T.startOfWeek(from < ev.date ? ev.date : from);
    // align to interval
    const weeksFromAnchor = Math.round(T.diffDays(anchorWeek, wk)/7);
    if(weeksFromAnchor % interval !== 0) wk = T.addDays(wk, (interval - (weeksFromAnchor % interval))*7);
    while(wk <= hardStop && guard++ < 400){
      days.forEach(dw=>{
        const offset = dw===0 ? 6 : dw-1;      // Monday-start week
        const d = T.addDays(wk, offset);
        if(d>=ev.date && d<=hardStop && d>=from && d<=to
           && (!wantsTermTime || isSchoolDay(d, closed))) push(d);
      });
      wk = T.addDays(wk, 7*interval);
    }
  } else if(r.freq==='daily'){
    const interval=r.interval||1;
    let d = ev.date;
    while(d<=hardStop && guard++<800){ if(d>=from&&d<=to&&(!wantsTermTime||isSchoolDay(d,closed))) push(d); d=T.addDays(d,interval); }
  } else if(r.freq==='monthly'){
    const interval=r.interval||1;
    if(r.bysetpos && r.byday && r.byday.length){
      let cursor = ev.date.slice(0,8)+'01';
      while(cursor<=hardStop && guard++<200){
        const d = nthWeekdayOfMonth(cursor, r.byday[0], r.bysetpos);
        if(d && d>=ev.date && d>=from && d<=to && d<=hardStop
           && (!wantsTermTime || isSchoolDay(d, closed))) push(d);
        cursor = T.addMonths(cursor, interval);
      }
    } else {
      let d = ev.date;
      while(d<=hardStop && guard++<200){ if(d>=from&&d<=to&&(!wantsTermTime||isSchoolDay(d,closed))) push(d); d=T.addMonths(d,interval); }
    }
  } else if(r.freq==='yearly'){
    let d = ev.date;
    while(d<=hardStop && guard++<40){ if(d>=from&&d<=to) push(d); d=T.addMonths(d,12); }
  } else {
    push(ev.date);
  }
  return out;
}

function nthWeekdayOfMonth(monthKey, weekday, nth){
  const lastDay = new Date(Date.UTC(Number(monthKey.slice(0,4)), Number(monthKey.slice(5,7)), 0)).getUTCDate();
  const hits = [];
  for(let day=1; day<=lastDay; day++){
    const d = `${monthKey.slice(0,8)}${String(day).padStart(2,'0')}`;
    if(T.dow(d)===weekday) hits.push(d);
  }
  if(!hits.length) return null;
  return nth === -1 ? hits[hits.length-1] : (hits[nth-1] || null);
}

/* -------------------------------------------------------- VISIBILITY ---- */
function visibleTo(ev, role){
  if(ev.status==='archived') return role==='super'||role==='caladmin';
  if(ev.status==='draft') return ['super','caladmin','campusadmin'].includes(role);
  if(ev.visibility==='public') return true;
  if(ev.visibility==='internal') return ['super','caladmin','campusadmin','teacher','student','parent'].includes(role);
  if(ev.visibility==='restricted') return ['super','caladmin','campusadmin'].includes(role);
  return false;
}

/* ------------------------------------------------------------ QUERY ----- */
/**
 * Query occurrences for a date range applying filters + personalisation.
 * opts: {from,to,filters,personalise,includeDrafts,role}
 */
function query(opts){
  const st = Store.state;
  const role = opts.role || Store.user().role;
  const f = opts.filters || st.ui.filters;
  const from = opts.from, to = opts.to;
  const p = st.prefs;
  const usePersonal = !!opts.personalise && p.onboarded;

  // The server has already removed anything this viewer may not see; these
  // checks are a second line of defence, not the only one.
  let occ = [];
  const closures = closureSet();
  st.events.forEach(ev=>{
    if(!opts.includeArchived && ev.status==='archived') return;
    if(!opts.includeDrafts && ev.status==='draft' && !['super','caladmin','campusadmin'].includes(role)) return;
    if(!visibleTo(ev, role)) return;
    if(!matchFilters(ev, f)) return;
    if(usePersonal && !matchPersonal(ev, p)) return;
    occ = occ.concat(expand(ev, from, to, closures));
  });
  occ.sort((a,b)=> a.date<b.date?-1 : a.date>b.date?1
    : (a.ev.allDay?0:1)-(b.ev.allDay?0:1) || T.toMin(a.ev.start||'00:00')-T.toMin(b.ev.start||'00:00')
    || a.ev.title.localeCompare(b.ev.title));
  return occ;
}

function matchFilters(ev, f){
  if(!f) return true;
  if(f.campusIds && f.campusIds.length){
    // null campus = whole school, always relevant
    if(ev.campusId && !f.campusIds.includes(ev.campusId)) return false;
  }
  if(f.yearGroupIds && f.yearGroupIds.length){
    if(ev.yearGroupIds && ev.yearGroupIds.length && !ev.yearGroupIds.some(y=>f.yearGroupIds.includes(y))) return false;
  }
  if(f.categoryIds && f.categoryIds.length && !f.categoryIds.includes(ev.categoryId)) return false;
  if(f.audienceIds && f.audienceIds.length){
    if(!(ev.audienceIds||[]).some(a=>f.audienceIds.includes(a) || a==='community')) return false;
  }
  if(f.statuses && f.statuses.length && !f.statuses.includes(ev.status)) return false;
  if(f.important && !ev.important) return false;
  if(f.q && f.q.trim()){
    const q = f.q.toLowerCase();
    const loc = byId(LOCATIONS, ev.locationId); const cam = byId(CAMPUSES, ev.campusId);
    const cat = byId(CATEGORIES, ev.categoryId); const org = byId(USERS, ev.organizerId);
    const ygs = (ev.yearGroupIds||[]).map(id=>{const y=byId(YEAR_GROUPS,id); return y?y.name:'';}).join(' ');
    const hay = [ev.title, ev.description, loc&&loc.name, cam&&cam.name, cat&&cat.name, org&&org.name, ygs, ev.date].join(' ').toLowerCase();
    if(!hay.includes(q)) return false;
  }
  return true;
}

/** My PBIS Calendar relevance rule (section 15 of the brief). */
function matchPersonal(ev, p){
  // Whole-school events always show
  const wholeSchool = !ev.campusId && (!ev.yearGroupIds || !ev.yearGroupIds.length);
  if(wholeSchool) return true;

  if(p.campusId){
    if(ev.campusId && ev.campusId !== p.campusId) return false;
  }
  if(p.yearGroupId){
    const ygs = ev.yearGroupIds||[];
    // campus-wide events (no year groups) are kept; year-specific must match
    if(ygs.length && !ygs.includes(p.yearGroupId)) return false;
  }
  if(p.audienceId){
    const auds = ev.audienceIds||[];
    // A parent needs to see what affects their child, so student-facing events count too.
    // Teachers and staff see the full internal picture.
    const ACCEPT = {
      parents:['parents','students','community'],
      students:['students','community'],
      teachers:['teachers','staff','leadership','students','community'],
      staff:['staff','teachers','leadership','community'],
      leadership:['leadership','staff','teachers','parents','students','community']
    }[p.audienceId] || [p.audienceId,'community'];
    if(auds.length && !auds.some(a=>ACCEPT.includes(a))) return false;
  }
  if(p.categoryIds && p.categoryIds.length){
    // holidays and whole-school academic markers always survive category filtering
    if(!p.categoryIds.includes(ev.categoryId) && !['holiday'].includes(ev.categoryId)) return false;
  }
  return true;
}

/* ----------------------------------------------------- CONFLICT CHECK --- */
function findConflicts(candidate, ignoreId){
  if(!candidate.locationId || candidate.allDay) return [];
  const out = [];
  const cs = T.toMin(candidate.start||'00:00'), ce = T.toMin(candidate.end||'23:59');
  const dates = candidate.endDate ? T.range(candidate.date, candidate.endDate) : [candidate.date];
  Store.state.events.forEach(ev=>{
    if(ev.id===ignoreId) return;
    if(ev.locationId!==candidate.locationId) return;
    if(['cancelled','archived','draft'].includes(ev.status)) return;
    if(ev.allDay) return;
    const occ = expand(ev, dates[0], dates[dates.length-1]);
    occ.forEach(o=>{
      const es=T.toMin(ev.start||'00:00'), ee=T.toMin(ev.end||'23:59');
      if(cs < ee && es < ce) out.push({event:ev, date:o.date});
    });
  });
  return out;
}

/** All location double-bookings currently in the calendar (admin dashboard). */
function allConflicts(){
  const map = new Map(); const out=[];
  const from = T.todayKey(), to = T.addDays(from, 300);
  Store.state.events.forEach(ev=>{
    if(!ev.locationId || ev.allDay || ['cancelled','archived','draft'].includes(ev.status)) return;
    expand(ev, from, to).forEach(o=>{
      const key = ev.locationId+'|'+o.date;
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(ev);
    });
  });
  map.forEach((list,key)=>{
    if(list.length<2) return;
    for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++){
      const a=list[i],b=list[j];
      const as=T.toMin(a.start||'0:00'),ae=T.toMin(a.end||'23:59'),bs=T.toMin(b.start||'0:00'),be=T.toMin(b.end||'23:59');
      if(as<be && bs<ae) out.push({a,b,date:key.split('|')[1],locationId:key.split('|')[0]});
    }
  });
  return out;
}

/* ---------------------------------------------------------- TERM INFO --- */
function termFor(dateKey){
  return Store.state.terms.find(t=>dateKey>=t.start && dateKey<=t.end) || null;
}
function ayFor(dateKey){
  return Store.state.academicYears.find(a=>dateKey>=a.start && dateKey<=a.end) || null;
}
function activeAY(){ return Store.state.academicYears.find(a=>a.status==='active') || Store.state.academicYears[0]; }

/* ------------------------------------------------------- FEED BUILDERS -- */
function icsEscape(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n'); }
function fold(line){
  if(line.length<=74) return line;
  const parts=[]; let s=line;
  parts.push(s.slice(0,74)); s=s.slice(74);
  while(s.length){ parts.push(' '+s.slice(0,73)); s=s.slice(73); }
  return parts.join('\r\n');
}
function eventToVEVENT(ev){
  const L=[];
  const loc = byId(LOCATIONS, ev.locationId);
  const cam = byId(CAMPUSES, ev.campusId);
  const cat = byId(CATEGORIES, ev.categoryId);
  const ygs = (ev.yearGroupIds||[]).map(id=>{const y=byId(YEAR_GROUPS,id);return y?y.name:'';}).filter(Boolean);
  const descParts = [ev.description||''];
  if(cam) descParts.push(`Campus: ${cam.name}`);
  if(ygs.length) descParts.push(`Year groups: ${ygs.join(', ')}`);
  if(cat) descParts.push(`Category: ${cat.name}`);
  descParts.push('PBIS Central Calendar — panyathip British International School');

  L.push('BEGIN:VEVENT');
  L.push(`UID:${ev.id}@pbis.edu.la`);
  L.push(`DTSTAMP:${T.toUTCStamp(T.todayKey(),'00:00')}`);
  if(ev.allDay){
    const endEx = T.addDays(ev.endDate||ev.date, 1);
    L.push(`DTSTART;VALUE=DATE:${T.toDateStamp(ev.date)}`);
    L.push(`DTEND;VALUE=DATE:${T.toDateStamp(endEx)}`);
  } else {
    L.push(`DTSTART:${T.toUTCStamp(ev.date, ev.start||'08:00')}`);
    L.push(`DTEND:${T.toUTCStamp(ev.endDate||ev.date, ev.end||ev.start||'09:00')}`);
  }
  if(ev.recurrence){
    const r=ev.recurrence; const D=['SU','MO','TU','WE','TH','FR','SA'];
    let rule=`FREQ=${r.freq.toUpperCase()}`;
    if(r.interval&&r.interval>1) rule+=`;INTERVAL=${r.interval}`;
    if(r.byday&&r.byday.length) rule+=`;BYDAY=${r.byday.map(d=>D[d]).join(',')}`;
    if(r.until) rule+=`;UNTIL=${T.toUTCStamp(r.until,'23:59')}`;
    L.push('RRULE:'+rule);
  }
  L.push(`SUMMARY:${icsEscape(ev.title)}`);
  L.push(`DESCRIPTION:${icsEscape(descParts.filter(Boolean).join('\n\n'))}`);
  if(loc) L.push(`LOCATION:${icsEscape(loc.name + (cam? ' — '+cam.name+' Campus':''))}`);
  if(cat) L.push(`CATEGORIES:${icsEscape(cat.name)}`);
  L.push(`STATUS:${ev.status==='cancelled'?'CANCELLED':ev.status==='draft'?'TENTATIVE':'CONFIRMED'}`);
  L.push(`URL:${location.origin}/events/${ev.slug}`);
  L.push(`X-PBIS-CAMPUS:${cam?cam.name:'Whole School'}`);
  L.push('END:VEVENT');
  return L;
}
function buildICS(events, calName){
  let L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PBIS//Central Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  L.push(`X-WR-CALNAME:${icsEscape(calName||'PBIS Central Calendar')}`);
  L.push(`X-WR-TIMEZONE:${TZ}`);
  L.push(`X-WR-CALDESC:${icsEscape('Official events from PBIS Central Calendar. One School. Three Campuses. One Shared Calendar.')}`);
  L.push('BEGIN:VTIMEZONE',`TZID:${TZ}`,'BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:+0700','TZOFFSETTO:+0700','TZNAME:+07','END:STANDARD','END:VTIMEZONE');
  events.forEach(ev=>{ L = L.concat(eventToVEVENT(ev)); });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n');
}
/* The server is the single ICS implementation — a downloaded file and a live
   subscription must never disagree, so the browser just asks for the file. */
function downloadUrl(url){
  const a = document.createElement('a');
  a.href = url; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(()=>a.remove(), 400);
}
function downloadEventICS(eventId){ downloadUrl(`/api/v1/events/${eventId}.ics`); }
function downloadScope(scope, format){
  downloadUrl(`/api/v1/export?scope=${encodeURIComponent(scope)}&format=${format||'ics'}`);
}
function googleUrl(ev){
  const loc = byId(LOCATIONS, ev.locationId), cam = byId(CAMPUSES, ev.campusId);
  const p = new URLSearchParams();
  p.set('action','TEMPLATE');
  p.set('text', ev.title);
  if(ev.allDay){
    p.set('dates', `${T.toDateStamp(ev.date)}/${T.toDateStamp(T.addDays(ev.endDate||ev.date,1))}`);
  } else {
    p.set('dates', `${T.toUTCStamp(ev.date, ev.start||'08:00')}/${T.toUTCStamp(ev.endDate||ev.date, ev.end||'09:00')}`);
  }
  const details = [ev.description||'', cam?`Campus: ${cam.name}`:'', 'PBIS Central Calendar'].filter(Boolean).join('\n\n');
  p.set('details', details);
  if(loc) p.set('location', loc.name + (cam?` — ${cam.name} Campus, Panyathip British International School`:', Panyathip British International School'));
  p.set('ctz', TZ);
  return 'https://calendar.google.com/calendar/render?'+p.toString();
}
function outlookUrl(ev){
  const loc = byId(LOCATIONS, ev.locationId);
  const p = new URLSearchParams();
  p.set('path','/calendar/action/compose'); p.set('rru','addevent');
  p.set('subject', ev.title);
  p.set('body', (ev.description||'') + '\n\nPBIS Central Calendar');
  if(loc) p.set('location', loc.name);
  const iso = (d,hm)=>{ const [y,mo,dd]=d.split('-').map(Number); const [h,mi]=(hm||'08:00').split(':').map(Number);
    return new Date(Date.UTC(y,mo-1,dd,h,mi) - TZ_OFFSET_MIN*60000).toISOString(); };
  p.set('startdt', ev.allDay ? ev.date : iso(ev.date, ev.start));
  p.set('enddt', ev.allDay ? T.addDays(ev.endDate||ev.date,1) : iso(ev.endDate||ev.date, ev.end||'09:00'));
  if(ev.allDay) p.set('allday','true');
  return 'https://outlook.live.com/calendar/0/deeplink/compose?'+p.toString();
}
/** Stable webcal-style feed address for a subscription scope. */
function feedUrl(scope){ return 'webcal://' + location.host + '/feeds/' + scope + '.ics'; }
/** The same feed over https, for apps that will not accept webcal://. */
function feedUrlHttps(scope){ return location.origin + '/feeds/' + scope + '.ics'; }

/* --------------------------------------------------------- CSV EXPORT --- */
function toCSV(events){
  const head = ['Title','Date','End Date','Start','End','All Day','Campus','Year Groups','Category','Audience','Location','Organizer','Status','Visibility','Important','Description'];
  const rows = events.map(ev=>{
    const cam=byId(CAMPUSES,ev.campusId), cat=byId(CATEGORIES,ev.categoryId), loc=byId(LOCATIONS,ev.locationId), org=byId(USERS,ev.organizerId);
    return [ev.title, ev.date, ev.endDate||'', ev.start||'', ev.end||'', ev.allDay?'Yes':'No',
      cam?cam.name:'Whole School',
      (ev.yearGroupIds||[]).map(id=>{const y=byId(YEAR_GROUPS,id);return y?y.name:'';}).join('; '),
      cat?cat.name:'', (ev.audienceIds||[]).map(id=>{const a=byId(AUDIENCES,id);return a?a.name:'';}).join('; '),
      loc?loc.name:'', org?org.name:'', ev.status, ev.visibility, ev.important?'Yes':'No',
      (ev.description||'').replace(/\s+/g,' ').slice(0,300)];
  });
  const q = v => `"${String(v??'').replace(/"/g,'""')}"`;
  return [head.map(q).join(','), ...rows.map(r=>r.map(q).join(','))].join('\r\n');
}
function downloadCSV(events, name){
  const blob = new Blob(['\uFEFF'+toCSV(events)],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=slugify(name||'pbis-events')+'.csv';
  document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},400);
}

/* ---------------------------------------------------------- CSV PARSE --- */
function parseCSV(text){
  const rows=[]; let row=[], cur='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; }
      else cur+=c;
    } else {
      if(c==='"') q=true;
      else if(c===','){ row.push(cur); cur=''; }
      else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
      else if(c==='\r'){ /* skip */ }
      else cur+=c;
    }
  }
  if(cur.length||row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r=>r.some(c=>c.trim()!==''));
}

PBIS.expand=expand; PBIS.query=query; PBIS.matchFilters=matchFilters; PBIS.matchPersonal=matchPersonal;
PBIS.findConflicts=findConflicts; PBIS.allConflicts=allConflicts; PBIS.visibleTo=visibleTo;
PBIS.termFor=termFor; PBIS.ayFor=ayFor; PBIS.activeAY=activeAY;
PBIS.downloadUrl=downloadUrl; PBIS.downloadEventICS=downloadEventICS; PBIS.downloadScope=downloadScope; PBIS.googleUrl=googleUrl; PBIS.outlookUrl=outlookUrl;
PBIS.feedUrl=feedUrl; PBIS.feedUrlHttps=feedUrlHttps; PBIS.parseCSV=parseCSV;

/* ------------------------------------------------------------- UTIL UI -- */
function catColour(catId){
  const c = byId(CATEGORIES, catId); return c ? `var(${c.colourVar})` : 'var(--forest-500)';
}
function catName(id){ const c=byId(CATEGORIES,id); return c?c.name:'Other'; }
function campusName(id){ const c=byId(CAMPUSES,id); return c?c.name:'Whole School'; }
function locName(id){ const l=byId(LOCATIONS,id); return l?l.name:''; }
function ygName(id){ const y=byId(YEAR_GROUPS,id); return y?y.name:''; }
function userName(id){ const u=byId(USERS,id); return u?u.name:'—'; }
function ygLabel(ids){
  if(!ids||!ids.length) return 'All year groups';
  if(ids.length>4){
    const first=byId(YEAR_GROUPS,ids[0]), last=byId(YEAR_GROUPS,ids[ids.length-1]);
    return `${first?first.name:''} – ${last?last.name:''}`;
  }
  return ids.map(ygName).filter(Boolean).join(', ');
}
function timeLabel(ev){
  if(ev.allDay) return ev.endDate ? `All day · ${T.diffDays(ev.date,ev.endDate)+1} days` : 'All day';
  if(!ev.start) return '';
  return ev.end ? `${ev.start}–${ev.end}` : ev.start;
}
PBIS.catColour=catColour; PBIS.catName=catName; PBIS.campusName=campusName;
PBIS.locName=locName; PBIS.ygName=ygName; PBIS.userName=userName; PBIS.ygLabel=ygLabel; PBIS.timeLabel=timeLabel;

/* --------------------------------------------------------------- TOAST -- */
let toastSeq=0;
function toast(msg, opts={}){
  const el = document.createElement('div');
  el.className = 'toast '+(opts.type||'');
  const icon = opts.type==='danger'?I.alert : opts.type==='warning'?I.alert : opts.type==='success'?I.checkCircle : I.info;
  el.innerHTML = `${icon}<div class="msg">${esc(msg)}</div>`;
  if(opts.undo){
    const b=document.createElement('button'); b.className='undo'; b.textContent='Undo';
    b.onclick=()=>{ const label=Store.undo(); el.remove(); if(label) toast('Change reverted',{type:'success'}); };
    el.appendChild(b);
  }
  const close=document.createElement('button'); close.className='undo'; close.setAttribute('aria-label','Dismiss');
  close.innerHTML=I.x; close.style.color='#fff'; close.onclick=()=>el.remove();
  el.appendChild(close);
  const stack = document.getElementById('toasts');
  stack.appendChild(el);
  const id = ++toastSeq;
  setTimeout(()=>{ if(el.isConnected){ el.classList.add('out'); setTimeout(()=>el.remove(),220); } }, opts.undo?7000:4200);
  return id;
}
PBIS.toast=toast;

function copy(text, label){
  const done = ()=> toast((label||'Link')+' copied to clipboard',{type:'success'});
  if(navigator.clipboard && window.isSecureContext){ navigator.clipboard.writeText(text).then(done).catch(fallback); }
  else fallback();
  function fallback(){
    const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); done(); }catch(e){ toast('Could not copy automatically — please copy manually',{type:'warning'}); }
    ta.remove();
  }
}
PBIS.copy=copy;
