/* ==========================================================================
   PUBLIC RUNTIME

   The parent-facing calendar and nothing else. This file is the reason
   index.html carries no CMS: the editor, the import pipeline, the admin
   views and every administrative action live only in admin.html.

   A visitor to the public site therefore cannot reach the CMS by guessing
   a route — the code that would render it is not in the page. That is a
   smaller download and a smaller surface, not a security boundary: the
   real boundary is the server refusing to send data, which exists on the
   platform, not on static hosting.
   ========================================================================== */

/* ------------------------------------------------------ SCOPE EXPORTS --- */
function eventsForScope(scope){
  const today=T.todayKey();
  const all = Store.state.events.filter(e=>e.status!=='archived'&&e.status!=='draft'&&visibleTo(e,Store.user().role)&&e.visibility!=='restricted');
  switch(scope){
    case 'all': return all;
    case 'my': return all.filter(e=>matchPersonal(e, Store.state.prefs));
    case 'important': return all.filter(e=>e.important);
    case 'holidays': return all.filter(e=>e.categoryId==='holiday'||/term/i.test(e.title));
    case 'exams': return all.filter(e=>['exam','assessment'].includes(e.categoryId));
    case 'early-years': return all.filter(e=>!e.campusId||e.campusId==='ey');
    case 'primary': return all.filter(e=>!e.campusId||e.campusId==='pr');
    case 'secondary': return all.filter(e=>!e.campusId||e.campusId==='se');
    case 'upcoming': return all.filter(e=>e.date>=today);
    case 'ay': { const a=activeAY(); return all.filter(e=>e.date>=a.start&&e.date<=a.end); }
    case 'campus': return all.filter(e=>e.campusId);
    case 'current': {
      const {from,to}=calRange();
      const ids=new Set(query({from,to}).map(o=>o.ev.id));
      return Store.state.events.filter(e=>ids.has(e.id));
    }
    default: return all;
  }
}
const SCOPE_NAMES = {all:'PBIS — All Events', my:'My PBIS Calendar', important:'PBIS — Important Dates',
  holidays:'PBIS — Term Dates and Holidays', exams:'PBIS — Examinations', 'early-years':'PBIS — Early Years',
  primary:'PBIS — Primary', secondary:'PBIS — Secondary', upcoming:'PBIS — Upcoming', ay:'PBIS — Academic Year',
  campus:'PBIS — By Campus', current:'PBIS — Current View'};


/* ------------------------------------------------------ DAY PEEK -------- */
function dayPeek(date){
  const occ = query({from:date,to:date,includeDrafts:true});
  Overlay.open(`
  <div class="scrim" data-act="close-overlay"></div>
  <div class="modal-wrap"><div class="modal" role="dialog" aria-modal="true" aria-label="${T.fmtLong(date)}" tabindex="-1">
    <div class="modal-head"><h3>${T.fmtLong(date)}</h3>
      <span class="badge badge-neutral">${occ.length} event${occ.length===1?'':'s'}</span>
      <button class="icon-btn" style="color:var(--fg-muted)" data-act="close-overlay" aria-label="Close">${I.x}</button></div>
    <div class="modal-body" style="padding:var(--s-3)">
      ${occ.map(o=>`<button class="agenda-item mb-2" style="--cat:${catColour(o.ev.categoryId)};width:100%"
        data-act="open-event" data-id="${o.ev.id}" data-date="${o.date}">
        <span class="at">${o.ev.allDay?'All day':esc(timeLabel(o.ev))}</span>
        <span><span class="an">${esc(o.ev.title)}</span>
        <span class="am"><span>${esc(campusName(o.ev.campusId))}</span><span>${esc(catName(o.ev.categoryId))}</span>
        ${o.ev.locationId?`<span>${esc(locName(o.ev.locationId))}</span>`:''}</span></span></button>`).join('')
        || `<div class="empty">${I.calendar}<h4>Nothing scheduled</h4></div>`}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-act="goto-day" data-date="${date}">Open day view</button>
      ${Store.can('create')?`<button class="btn btn-primary" data-act="new-event-on" data-date="${date}">${I.plus}Add event</button>`:''}
    </div>
  </div></div>`);
}


/* --------------------------------------------------- ACTION HANDLERS ---- */
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-act]');
  if(!t) return;
  const a = t.dataset.act;
  const st = e=>{ e.preventDefault(); e.stopPropagation(); };
  const F = Store.state.ui.filters;
  const toggle = (arr,id)=> arr.includes(id) ? arr.filter(x=>x!==id) : arr.concat([id]);

  switch(a){
    /* --- calendar nav --- */
    case 'cal-prev': st(e); shiftCursor(-1); break;
    case 'cal-next': st(e); shiftCursor(1); break;
    case 'cal-today': st(e); Store.setUI({cursor:T.todayKey()}); break;
    case 'set-view': st(e); Store.setUI({view:t.dataset.view}); break;
    case 'goto-day': st(e); Overlay.close(); Store.setUI({view:'day',cursor:t.dataset.date}); if(App.route.name!=='calendar') go('/calendar'); break;
    case 'day-peek': st(e); dayPeek(t.dataset.date); break;

    /* --- filters --- */
    case 'filter-campus': { st(e); const id=t.dataset.id;
      Store.setFilters({campusIds: id? toggle(F.campusIds,id) : [], yearGroupIds:[]}); App.sideOpen=false; break; }
    case 'filter-yg': { st(e); const id=t.dataset.id; Store.setFilters({yearGroupIds: id? toggle(F.yearGroupIds,id):[]}); break; }
    case 'filter-cat': { st(e); Store.setFilters({categoryIds: toggle(F.categoryIds,t.dataset.id)}); break; }
    case 'filter-aud': { st(e); Store.setFilters({audienceIds: toggle(F.audienceIds,t.dataset.id)}); break; }
    case 'clear-filters': st(e); Store.setFilters({campusIds:[],yearGroupIds:[],categoryIds:[],audienceIds:[],statuses:[],q:''}); break;
    case 'remove-filter': { st(e); const {kind,id}=t.dataset;
      if(kind==='campus') Store.setFilters({campusIds:F.campusIds.filter(x=>x!==id)});
      if(kind==='yg') Store.setFilters({yearGroupIds:F.yearGroupIds.filter(x=>x!==id)});
      if(kind==='cat') Store.setFilters({categoryIds:F.categoryIds.filter(x=>x!==id)});
      if(kind==='aud') Store.setFilters({audienceIds:F.audienceIds.filter(x=>x!==id)});
      if(kind==='q') Store.setFilters({q:''});
      break; }
    case 'campus-cal': st(e); Store.setFilters({campusIds:[t.dataset.id],yearGroupIds:[]}); go('/calendar'); break;
    case 'campus-yg': st(e); Store.setFilters({campusIds:[t.dataset.campus],yearGroupIds:[t.dataset.id]}); go('/calendar'); break;

    /* --- export / subscribe --- */
    case 'ics-scope': { st(e); const s=t.dataset.scope; const list=eventsForScope(s);
      if(!list.length){ toast('Nothing to export in this scope',{type:'warning'}); break; }
      downloadICS(list, SCOPE_NAMES[s]||('PBIS — '+s)); toast(`${list.length} events downloaded as .ics`,{type:'success'}); break; }
    case 'exp': { st(e); const s=t.dataset.scope, f=t.dataset.fmt; const list=eventsForScope(s);
      if(!list.length){ toast('Nothing to export in this scope',{type:'warning'}); break; }
      if(f==='ics') downloadICS(list, SCOPE_NAMES[s]||'PBIS Calendar'); else downloadCSV(list, SCOPE_NAMES[s]||'PBIS Calendar');
      toast(`${list.length} events exported as .${f}`,{type:'success'}); break; }
    case 'export-view': case 'export-list': { st(e); const list=eventsForScope('current');
      downloadICS(list,'PBIS — Current View'); toast(`${list.length} events exported`,{type:'success'}); break; }
    case 'subscribe-view': st(e); go('/subscribe'); break;
    case 'toggle-sub': { st(e); const s=t.dataset.scope; const subs=Store.state.prefs.subscriptions;
      const on=subs.includes(s);
      Store.setPrefs({subscriptions: on? subs.filter(x=>x!==s) : subs.concat([s])});
      toast(on?'Unsubscribed':'Subscribed — copy the feed address into your calendar app',{type:on?'':'success'}); break; }

    /* --- onboarding --- */
    case 'ob-campus': { st(e); App.onboard.campusId=t.dataset.id||null; App.onboard.touchedCampus=true; App.onboard.yearGroupId=null; render(); break; }
    case 'ob-yg': { st(e); App.onboard.yearGroupId=t.dataset.id||null; App.onboard.touchedYg=true; render(); break; }
    case 'ob-aud': { st(e); App.onboard.audienceId=t.dataset.id; render(); break; }
    case 'ob-cat': { st(e); const id=t.dataset.id; App.onboard.categoryIds=toggle(App.onboard.categoryIds,id); render(); break; }
    case 'ob-back': st(e); App.onboard.step=Math.max(0,App.onboard.step-1); render(); break;
    case 'ob-skip': st(e);
      if(App.onboard.step<3){ App.onboard.step++; render(); }
      else { finishOnboarding(); }
      break;
    case 'ob-next': st(e);
      if(App.onboard.step<3){ App.onboard.step++; render(); }
      else finishOnboarding();
      break;
    case 'edit-prefs': st(e); Store.setPrefs({onboarded:false}); App.onboard={step:0,
      campusId:Store.state.prefs.campusId, yearGroupId:Store.state.prefs.yearGroupId,
      audienceId:Store.state.prefs.audienceId, categoryIds:Store.state.prefs.categoryIds.slice()}; render(); break;

    /* --- editor --- */
  }
}, false);

function finishOnboarding(){
  const o=App.onboard;
  Store.setPrefs({onboarded:true, campusId:o.campusId, yearGroupId:o.yearGroupId, audienceId:o.audienceId, categoryIds:o.categoryIds});
  toast('Your PBIS Calendar is ready',{type:'success'});
  render();
}

/* --------------------------------------------------- SEARCH DEBOUNCE ---- */
let searchTimer=null;
document.addEventListener('input', e=>{
  const el=e.target.closest('[data-act="search-input"]'); if(!el) return;
  clearTimeout(searchTimer);
  const v=el.value;
  searchTimer=setTimeout(()=>{
    // AdminState belongs to the CMS build; resetting the table page only
    // applies there. Guarded rather than removed so the two builds share
    // one search handler.
    if(typeof AdminState!=='undefined') AdminState.page=0;
    Store.setFilters({q:v});
    const focused=document.activeElement===el;
    render();
    if(focused){
      const again=document.querySelector('[data-act="search-input"]');
      if(again){ again.focus(); again.setSelectionRange(v.length,v.length); }
    }
  },260);
});

/* ------------------------------------------------------------- RENDER --- */
function render(){
  App.route = parseRoute();
  const r = App.route;
  const root = document.getElementById('app');
  const scrollY = window.scrollY;

  if(r.name==='signage'){
    document.documentElement.setAttribute('data-surface','signage');
    document.title = routeTitle(r);
    root.innerHTML = viewSignage();
    startClock();
    App._lastRoute='signage';
    return;
  }

  let body;
  switch(r.name){
    case 'home':      body = viewHome(); break;
    case 'calendar':  body = viewCalendar(); break;
    case 'event':     body = viewEventPage(r.slug); break;
    case 'my':        body = viewMy(); break;
    case 'subscribe': body = viewSubscribe(); break;
    case 'dates':     body = viewDates(); break;
    case 'year':      body = viewYear(); break;
    case 'campus':    body = viewCampus(r.slug); break;
    case 'embed':     body = viewEmbed(); break;
    case 'api':       body = viewAPI(); break;
    // 'admin' is deliberately absent: the CMS is a separate page.
    default:          body = notFound();
  }
  // No CMS branch here: this build has no admin views, and a stale /admin
  // link should land on the public not-found page rather than throw.
  document.documentElement.setAttribute('data-surface','public');
  root.innerHTML = renderMasthead() + body + (r.name==='calendar'||r.name==='my' ? '' : renderFooter());
  document.title = routeTitle(r);
  bindReveals();
  if(r.name==='home') startHeroDust();
  // preserve scroll on in-place updates (filters, tabs) but not on navigation
  if(r.name===App._lastRoute && r.sub===App._lastSub && r.slug===App._lastSlug) window.scrollTo(0, scrollY);
  else window.scrollTo(0,0);
  App._lastRoute=r.name; App._lastSub=r.sub; App._lastSlug=r.slug;

  const st=document.getElementById('side-toggle');
  if(st) st.style.display = window.matchMedia('(max-width:1100px)').matches ? 'inline-flex' : 'none';
  measureSticky();
}
PBIS.render = render;

/* The calendar toolbar can wrap on narrower screens, so the sticky offset for the
   weekday header must be measured rather than assumed. */
function measureSticky(){
  const header = document.querySelector('.masthead');
  const bar = document.querySelector('.cal-bar');
  if(!bar){ document.documentElement.style.removeProperty('--cal-sticky'); return; }
  const strip = document.querySelector('.active-filters');
  const h = (header?header.offsetHeight:64) + bar.offsetHeight + (strip?strip.offsetHeight:0);
  document.documentElement.style.setProperty('--cal-sticky', h+'px');
}
PBIS.measureSticky = measureSticky;

function routeTitle(r){
  const base = 'PBIS Central Calendar';
  const m = {home:base+' — From Laos to the World · Growing Generations · 25 Years of Excellence', calendar:'Calendar · '+base,
    my:'My PBIS Calendar · '+base, subscribe:'Subscribe · '+base, dates:'Important Dates · '+base,
    year:'Academic Year · '+base, signage:'Today at PBIS', embed:'Embed · '+base, api:'API · '+base,
    admin:'CMS · '+base};
  if(r.name==='event'){ const e=Store.state.events.find(x=>x.slug===r.slug); return (e?e.title+' · ':'')+base; }
  if(r.name==='campus'){ const c=CAMPUSES.find(x=>x.slug===r.slug); return (c?c.name+' · ':'')+base; }
  return m[r.name]||base;
}

let clockTimer=null;
function startClock(){
  if(clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(()=>{
    const el=document.getElementById('sig-clock');
    if(!el){ clearInterval(clockTimer); clockTimer=null; return; }
    el.textContent = T.nowClock();
  }, 15000);
}


/* --------------------------------------------------------------- BOOT --- */
function boot(){
  Store.init();
  Store.subscribe(()=>render());
  window.addEventListener('hashchange', ()=>{ App.mobileNavOpen=false; App.sideOpen=false; Overlay.close(true); render(); });
  let rz=null;
  window.addEventListener('resize', ()=>{
    const st=document.getElementById('side-toggle');
    if(st) st.style.display = window.matchMedia('(max-width:1100px)').matches ? 'inline-flex' : 'none';
    clearTimeout(rz); rz=setTimeout(measureSticky,120);
  });
  if(!location.hash) location.hash = '#/';
  render();
  console.info('%cPBIS Central Calendar','color:#C39A2B;font-weight:700',
    `\nOne School. Three Campuses. One Shared Calendar.\n${Store.state.events.length} canonical events · timezone ${TZ}`);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

