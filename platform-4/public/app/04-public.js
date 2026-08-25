/* ==========================================================================
   PBIS CENTRAL CALENDAR — PUBLIC EXPERIENCE
   ========================================================================== */

/* ------------------------------------------------------------- HOME ----- */
function viewHome(){
  const today = T.todayKey();
  const todays = query({from:today, to:today, personalise:false});
  const upcoming = query({from:T.addDays(today,0), to:T.addDays(today,75)})
    .filter(o=>o.isStart && o.ev.status==='published')
    .slice(0,6);
  const important = query({from:today, to:T.addDays(today,300)})
    .filter(o=>o.isStart && o.ev.important && ['published','draft'].includes(o.ev.status) && o.ev.status==='published')
    .slice(0,5);
  const term = termFor(today);
  const ay = activeAY();
  const totalPublished = Store.state.events.filter(e=>e.status==='published').length;

  return `
  <main id="main">
    <!-- HERO -->
    <section class="hero">
      <div class="shell hero-in">
        <div>
          ${logo('full',188,{cls:'hero-logo',decorative:false,label:'Panyathip British International School — celebrating 25 years'})}
          <div class="hero-kicker"><span class="line"></span><span class="eyebrow eyebrow-gold">The Official School Calendar</span></div>
          <h1>PBIS Central<br><em>Calendar</em></h1>
          <p class="hero-sub">One School. <span>Three Campuses.</span> One Shared Calendar.</p>
          <p class="hero-copy">Stay connected with what's happening across the PBIS community — from Nursery to Year 13. Every official event, in one place, always current.</p>
          <div class="hero-cta">
            <a class="btn btn-gold btn-lg" href="#/calendar">${I.calendar}View Calendar</a>
            <a class="btn btn-on-dark btn-lg" href="#/my">${I.star}Find My Events</a>
          </div>
          <div class="hero-stats">
            <div class="hero-stat"><b>${CAMPUSES.length}</b><span>Campuses</span></div>
            <div class="hero-stat"><b>${YEAR_GROUPS.length}</b><span>Year Groups</span></div>
            <div class="hero-stat"><b>${totalPublished}</b><span>Published Events</span></div>
            <div class="hero-stat"><b>${ay?ay.name:'—'}</b><span>Academic Year</span></div>
          </div>
        </div>
        <div class="hero-panel">
          <div class="hero-panel-head">
            <h3>Today at PBIS</h3>
            <time class="mono" datetime="${today}">${T.fmtMed(today).toUpperCase()}</time>
          </div>
          ${todays.length ? todays.slice(0,5).map(o=>`
            <button class="hero-ev" data-act="open-event" data-id="${o.ev.id}" data-date="${o.date}">
              <span class="t">${o.ev.allDay?'ALL DAY':esc(o.ev.start||'')}</span>
              <span>
                <span class="n">${esc(o.ev.title)}</span>
                <span class="m">
                  <span>${esc(campusName(o.ev.campusId))}</span>
                  ${o.ev.locationId?`<span>${esc(locName(o.ev.locationId))}</span>`:''}
                </span>
              </span>
            </button>`).join('')
          : `<p style="color:#95B3A2;font-size:var(--fs-base);padding:var(--s-4) 0">No events scheduled today.
             ${term?`We are in ${esc(term.name)}.`:'The school is currently between terms.'}</p>`}
          <a class="btn btn-on-dark btn-block mt-4" href="#/calendar">${I.arrowRight}See the full calendar</a>
        </div>
      </div>
    </section>

    <!-- TODAY DETAIL -->
    <section class="section">
      <div class="shell">
        <div class="sec-head reveal">
          <div>
            <span class="eyebrow eyebrow-gold">Right now</span>
            <h2 class="mt-2">Today at PBIS</h2>
            <p>${T.fmtLong(today)}${term?` · ${esc(term.name)}, ${esc(ay?ay.name:'')}`:' · Between terms'}</p>
          </div>
          <a class="btn btn-outline" href="#/calendar">${I.calendar}Open calendar</a>
        </div>
        <div class="today-list reveal">
          ${todays.length ? todays.map(o=>todayRow(o)).join('') : `
            <div class="empty card">${I.calendarCheck}<h4>Nothing scheduled today</h4>
            <p>There are no events in the calendar for ${T.fmtLong(today)}. Check what's coming up below.</p></div>`}
        </div>
      </div>
    </section>

    <!-- COMING UP -->
    <section class="section section-sunken">
      <div class="shell">
        <div class="sec-head reveal">
          <div>
            <span class="eyebrow eyebrow-gold">Next 10 weeks</span>
            <h2 class="mt-2">Coming Up</h2>
            <p>The events families most often ask about, in the order they happen.</p>
          </div>
          <a class="btn btn-outline" href="#/calendar">${I.list}All upcoming events</a>
        </div>
        <div class="grid-cards">
          ${upcoming.map(o=>eventCard(o.ev, o.date)).join('') || emptyCard('Nothing in the next ten weeks')}
        </div>
      </div>
    </section>

    <!-- MY CALENDAR PROMO -->
    <section class="section section-brand">
      <div class="shell">
        <div class="promo-grid">
          <div class="reveal">
            <span class="eyebrow eyebrow-gold">Personalisation</span>
            <h2 class="display mt-3" style="font-size:clamp(1.8rem,3.4vw,2.6rem);color:#fff">Build <em style="font-style:italic;color:var(--gold-300)">your</em> PBIS calendar</h2>
            <p class="mt-4" style="color:#A9C4B6;max-width:52ch;line-height:1.7">
              Tell us your campus, your child's year group and what you are — parent, student, teacher or staff.
              We'll show you the events that actually affect you, and hide the ones that don't.
            </p>
            <ul class="mt-5" style="display:grid;gap:12px;color:#D6E9DF">
              ${['Whole-school events, always included','Your campus and your year group','Only the categories you care about','Subscribe once — new events appear automatically']
                .map(x=>`<li class="row row-tight" style="align-items:flex-start"><span style="color:var(--gold-400);flex:none;margin-top:2px">${I.check}</span><span style="font-size:var(--fs-md)">${x}</span></li>`).join('')}
            </ul>
            <div class="row mt-6">
              <a class="btn btn-gold" href="#/my">${I.sparkle}${Store.state.prefs.onboarded?'Open My PBIS Calendar':'Set up My PBIS Calendar'}</a>
              <a class="btn btn-on-dark" href="#/subscribe">${I.rss}Subscribe</a>
            </div>
          </div>
          <div class="reveal">
            ${myPreviewCard()}
          </div>
        </div>
      </div>
    </section>

    <!-- CAMPUS EXPLORER -->
    <section class="section">
      <div class="shell">
        <div class="sec-head reveal">
          <div>
            <span class="eyebrow eyebrow-gold">Campus Explorer</span>
            <h2 class="mt-2">Three campuses, one community</h2>
            <p>Each campus has its own rhythm. Choose one to see only what is happening there.</p>
          </div>
        </div>
        <div class="g3">
          ${CAMPUSES.map(c=>{
            const n = query({from:today,to:T.addDays(today,120),filters:{campusIds:[c.id]}}).filter(o=>o.isStart&&o.ev.campusId===c.id).length;
            const ygs = YEAR_GROUPS.filter(y=>y.campusId===c.id);
            return `<a class="card card-pad reveal" href="#/campus/${c.slug}" style="display:block;border-left:3px solid ${c.colour};transition:box-shadow var(--dur-2),transform var(--dur-2)">
              <span class="eyebrow">${esc(c.short)}</span>
              <h3 class="display mt-2" style="font-size:var(--fs-xl)">${esc(c.name)}</h3>
              <p class="muted mt-3" style="font-size:var(--fs-base);line-height:1.6">${esc(c.blurb)}</p>
              <div class="row row-tight mt-4">
                <span class="badge badge-neutral">${ygs.length} year groups</span>
                <span class="badge badge-neutral">${n} upcoming</span>
              </div>
              <div class="row mt-4" style="color:var(--accent-strong);font-weight:600;font-size:var(--fs-sm)">
                View ${esc(c.name)} calendar ${I.arrowRight}
              </div>
            </a>`;
          }).join('')}
        </div>
      </div>
    </section>

    <!-- IMPORTANT DATES -->
    <section class="section section-sunken">
      <div class="shell">
        <div class="sec-head reveal">
          <div>
            <span class="eyebrow eyebrow-gold">Diary essentials</span>
            <h2 class="mt-2">Important Dates</h2>
            <p>The dates the school asks every family to note. Used sparingly, on purpose.</p>
          </div>
          <a class="btn btn-outline" href="#/dates">${I.star}All important dates</a>
        </div>
        <div class="card reveal" style="overflow:hidden">
          ${important.map((o,i)=>`
            <button class="today-row" style="--cat:${catColour(o.ev.categoryId)};border-radius:0;border-top:${i?'1px solid var(--border)':'0'};border-left:3px solid ${catColour(o.ev.categoryId)};border-right:0"
              data-act="open-event" data-id="${o.ev.id}" data-date="${o.date}">
              <span class="time">${T.fmtNum(o.date)}</span>
              <span>
                <span class="title">${esc(o.ev.title)}</span>
                <span class="sub"><span>${esc(campusName(o.ev.campusId))}</span><span>${esc(catName(o.ev.categoryId))}</span><span>${esc(T.relative(o.date))}</span></span>
              </span>
              <span class="right"><span class="badge badge-important">${I.star}Important</span></span>
            </button>`).join('') || emptyCard('No important dates flagged')}
        </div>
      </div>
    </section>

    <!-- SUBSCRIBE -->
    <section class="section">
      <div class="shell">
        <div class="sec-head reveal">
          <div>
            <span class="eyebrow eyebrow-gold">Never check again</span>
            <h2 class="mt-2">Subscribe once. Stay current forever.</h2>
            <p>A live subscription keeps your phone's calendar in step with PBIS. When we add or move an event, your calendar updates on its own.</p>
          </div>
          <a class="btn btn-primary" href="#/subscribe">${I.rss}Subscription options</a>
        </div>
        <div class="sub-grid">
          ${[['all','All PBIS Events','Everything published across all three campuses.'],
             ['primary','Primary Campus','Years 1 to 6, plus every whole-school event.'],
             ['secondary','Secondary Campus','Years 7 to 13, plus every whole-school event.'],
             ['my','My PBIS Calendar','Your personalised feed, built from your preferences.']]
            .map(([k,t,d],i)=>`
            <div class="sub-card reveal ${k==='my'?'featured':''}">
              <h4>${k==='my'?`<span style="color:var(--accent)">${I.star}</span>`:''}${esc(t)}</h4>
              <p>${esc(d)}</p>
              <div class="feed-url"><span>${esc(feedUrl(k))}</span>
                <button class="btn btn-ghost btn-sm" data-act="copy-text" data-text="${esc(feedUrl(k))}" data-label="Feed address" aria-label="Copy feed address">${I.copy}</button></div>
              <button class="btn btn-outline btn-sm btn-block" data-act="ics-scope" data-scope="${k}">${I.download}Download .ics</button>
            </div>`).join('')}
        </div>
      </div>
    </section>
  </main>`;
}

function todayRow(o){
  const ev=o.ev;
  const nowM = T.nowMinutes();
  const live = !ev.allDay && ev.start && ev.end && o.date===T.todayKey() && nowM>=T.toMin(ev.start) && nowM<=T.toMin(ev.end);
  return `<button class="today-row" style="--cat:${catColour(ev.categoryId)}" data-act="open-event" data-id="${ev.id}" data-date="${o.date}">
    <span class="time">${ev.allDay?'ALL DAY':esc(timeLabel(ev))}</span>
    <span>
      <span class="title">${esc(ev.title)}</span>
      <span class="sub">
        <span>${esc(campusName(ev.campusId))}</span>
        ${ev.locationId?`<span>${esc(locName(ev.locationId))}</span>`:''}
        <span class="cat-tag" style="--cat:${catColour(ev.categoryId)}"><span class="dot"></span>${esc(catName(ev.categoryId))}</span>
      </span>
    </span>
    <span class="right">
      ${live?`<span class="now-pill"><span class="pulse"></span>NOW</span>`:''}
      ${ev.important?`<span class="badge badge-important">${I.star}Important</span>`:''}
      ${ev.status==='cancelled'?`<span class="badge badge-danger">Cancelled</span>`:''}
    </span>
  </button>`;
}

function eventCard(ev, date){
  const d = T.parse(date||ev.date);
  return `<button class="evcard reveal" style="--cat:${catColour(ev.categoryId)}" data-act="open-event" data-id="${ev.id}" data-date="${date||ev.date}">
    <span class="datebox"><span class="d">${d.getUTCDate()}</span><span class="mo">${T.MON[d.getUTCMonth()]} · ${T.DAY3[d.getUTCDay()]}</span></span>
    <span class="tags">
      <span class="cat-tag" style="--cat:${catColour(ev.categoryId)}"><span class="dot"></span>${esc(catName(ev.categoryId))}</span>
      ${ev.important?`<span class="badge badge-important" style="margin-left:auto">${I.star}Important</span>`:''}
      ${ev.status==='cancelled'?`<span class="badge badge-danger">Cancelled</span>`:''}
      ${ev.status==='postponed'?`<span class="badge badge-warning">Postponed</span>`:''}
    </span>
    <h4>${esc(ev.title)}</h4>
    <span class="meta">
      <span>${I.clock}${esc(timeLabel(ev)||'TBC')}</span>
      <span>${I.school}${esc(campusName(ev.campusId))}</span>
      ${ev.locationId?`<span>${I.pin}${esc(locName(ev.locationId))}</span>`:''}
    </span>
  </button>`;
}
function emptyCard(msg){
  return `<div class="empty card">${I.calendar}<h4>${esc(msg)}</h4><p>When events are published they will appear here automatically.</p></div>`;
}

function myPreviewCard(){
  const p = Store.state.prefs;
  const today=T.todayKey();
  const occ = query({from:today,to:T.addDays(today,60),personalise:true}).filter(o=>o.isStart&&o.ev.status==='published').slice(0,4);
  const camp = p.campusId?campusName(p.campusId):'All campuses';
  const yg = p.yearGroupId?ygName(p.yearGroupId):'All year groups';
  const aud = p.audienceId?(byId(AUDIENCES,p.audienceId)||{}).name:'Everyone';
  return `<div class="hero-panel">
    <div class="hero-panel-head">
      <h3>${p.onboarded?'Your PBIS Calendar':'Preview'}</h3>
      <span class="mono" style="font-size:10px;letter-spacing:.12em;color:var(--gold-300)">${p.onboarded?'PERSONALISED':'SAMPLE'}</span>
    </div>
    <div class="row row-tight mb-4">
      <span class="badge" style="background:rgba(255,255,255,.1);color:#fff">${esc(camp)}</span>
      <span class="badge" style="background:rgba(255,255,255,.1);color:#fff">${esc(yg)}</span>
      <span class="badge" style="background:rgba(255,255,255,.1);color:#fff">${esc(aud)}</span>
    </div>
    ${occ.length?occ.map(o=>`
      <button class="hero-ev" data-act="open-event" data-id="${o.ev.id}" data-date="${o.date}">
        <span class="t">${T.fmtNum(o.date).slice(0,5)}</span>
        <span><span class="n">${esc(o.ev.title)}</span>
        <span class="m"><span>${esc(campusName(o.ev.campusId))}</span><span>${esc(catName(o.ev.categoryId))}</span></span></span>
      </button>`).join(''):`<p style="color:#95B3A2;padding:var(--s-4) 0">Set your preferences to see a personalised list here.</p>`}
  </div>`;
}

/* --------------------------------------------------------- CALENDAR ----- */
function shiftCursor(dir){
  const ui = Store.state.ui;
  const c = ui.cursor;
  let n = c;
  if(ui.view==='month') n = T.addMonths(T.startOfMonth(c), dir);
  else if(ui.view==='week') n = T.addDays(c, 7*dir);
  else if(ui.view==='day') n = T.addDays(c, dir);
  else if(ui.view==='agenda') n = T.addDays(c, 14*dir);
  else if(ui.view==='year') n = T.addMonths(c, 12*dir);
  Store.setUI({cursor:n});
}
PBIS.shiftCursor = shiftCursor;

function calRange(){
  const {view, cursor} = Store.state.ui;
  if(view==='month'){
    const som = T.startOfMonth(cursor);
    return {from:T.addDays(T.startOfWeek(som),0), to:T.addDays(T.startOfWeek(T.endOfMonth(cursor)),6)};
  }
  if(view==='week'){ const s=T.startOfWeek(cursor); return {from:s, to:T.addDays(s,6)}; }
  if(view==='day'){ return {from:cursor, to:cursor}; }
  if(view==='agenda'){ return {from:cursor, to:T.addDays(cursor,44)}; }
  if(view==='year'){ const y=cursor.slice(0,4); return {from:`${y}-01-01`, to:`${y}-12-31`}; }
  return {from:cursor,to:cursor};
}
function calTitle(){
  const {view,cursor}=Store.state.ui;
  if(view==='month') return `${T.monthName(cursor)} ${cursor.slice(0,4)}`;
  if(view==='week'){ const s=T.startOfWeek(cursor), e=T.addDays(s,6);
    return s.slice(0,7)===e.slice(0,7) ? `${T.parse(s).getUTCDate()}–${T.parse(e).getUTCDate()} ${T.monthName(s)} ${s.slice(0,4)}`
      : `${T.fmtShort(s)} – ${T.fmtShort(e)}`; }
  if(view==='day') return T.fmtLong(cursor);
  if(view==='agenda') return `From ${T.fmtShort(cursor)}`;
  if(view==='year') return cursor.slice(0,4);
  return '';
}

function viewCalendar(opts={}){
  const ui = Store.state.ui;
  const {from,to} = calRange();
  const personalise = !!opts.personalise;
  const occ = query({from,to,personalise});
  const term = termFor(ui.cursor);

  return `
  <main id="main" class="cal-wrap">
    ${calSidebar(personalise)}
    <div class="cal-main">
      ${calToolbar(term, personalise)}
      ${activeFilterStrip()}
      <div class="cal-body">
        ${ui.view==='month'?monthView(occ)
        : ui.view==='week'?weekView(occ)
        : ui.view==='day'?dayView(occ)
        : ui.view==='agenda'?agendaView(occ)
        : yearView(occ)}
      </div>
    </div>
  </main>`;
}

function calSidebar(personalise){
  const f = Store.state.ui.filters;
  const today = T.todayKey();
  const counts = {};
  const all = query({from:today,to:T.addDays(today,365)});
  all.forEach(o=>{ counts[o.ev.categoryId]=(counts[o.ev.categoryId]||0)+1; });
  const campusCounts = {};
  all.forEach(o=>{ const k=o.ev.campusId||'all'; campusCounts[k]=(campusCounts[k]||0)+1; });
  const selCampus = f.campusIds;
  const ygs = selCampus.length ? YEAR_GROUPS.filter(y=>selCampus.includes(y.campusId)) : YEAR_GROUPS;

  return `<aside class="cal-side ${App.sideOpen?'is-open':''}" aria-label="Calendar filters">
    <div class="side-group">
      <h5>Calendars</h5>
      <a class="side-item ${personalise?'':'is-active'}" href="#/calendar">${I.calendar}All Events<span class="count">${all.length}</span></a>
      <a class="side-item ${personalise?'is-active':''}" href="#/my">${I.star}My PBIS Calendar</a>
      <a class="side-item" href="#/dates">${I.alert}Important Dates</a>
    </div>

    <div class="side-group">
      <h5>Campus</h5>
      <button class="side-item" aria-pressed="${!selCampus.length}" data-act="filter-campus" data-id="">${I.layers}All Campuses<span class="count">${all.length}</span></button>
      ${CAMPUSES.map(c=>`<button class="side-item" aria-pressed="${selCampus.includes(c.id)}" data-act="filter-campus" data-id="${c.id}" style="--cat:${c.colour}">
        <span class="dot" style="--cat:${c.colour}"></span>${esc(c.name)}<span class="count">${campusCounts[c.id]||0}</span></button>`).join('')}
    </div>

    <div class="side-group">
      <h5>Year Group</h5>
      <button class="side-item" aria-pressed="${!f.yearGroupIds.length}" data-act="filter-yg" data-id="">${I.users}All Year Groups</button>
      ${ygs.map(y=>`<button class="side-item" aria-pressed="${f.yearGroupIds.includes(y.id)}" data-act="filter-yg" data-id="${y.id}">
        <span style="width:16px"></span>${esc(y.name)}</button>`).join('')}
    </div>

    <div class="side-group">
      <h5>Category</h5>
      ${CATEGORIES.map(c=>`<button class="side-item" aria-pressed="${f.categoryIds.includes(c.id)}" data-act="filter-cat" data-id="${c.id}" style="--cat:var(${c.colourVar})">
        <span class="dot"></span>${esc(c.name)}<span class="count">${counts[c.id]||0}</span></button>`).join('')}
    </div>

    <div class="side-group">
      <h5>Audience</h5>
      ${AUDIENCES.map(a=>`<button class="side-item" aria-pressed="${f.audienceIds.includes(a.id)}" data-act="filter-aud" data-id="${a.id}">
        <span style="width:16px"></span>${esc(a.name)}</button>`).join('')}
    </div>

    <div class="side-group">
      <button class="btn btn-outline btn-sm btn-block" data-act="clear-filters">${I.x}Clear all filters</button>
      <button class="btn btn-ghost btn-sm btn-block mt-2" data-act="export-view">${I.download}Export this view</button>
    </div>
  </aside>`;
}

function calToolbar(term, personalise){
  const ui = Store.state.ui;
  const views = [['month','Month'],['week','Week'],['day','Day'],['agenda','Agenda'],['year','Year']];
  return `<div class="cal-bar">
    <button class="btn btn-outline btn-sm" data-act="toggle-side" style="display:none" id="side-toggle">${I.filter}Filters</button>
    <div class="nav-group">
      <button class="btn btn-ghost btn-icon btn-sm" data-act="cal-prev" aria-label="Previous period">${I.chevL}</button>
      <button class="btn btn-outline btn-sm" data-act="cal-today">Today</button>
      <button class="btn btn-ghost btn-icon btn-sm" data-act="cal-next" aria-label="Next period">${I.chevR}</button>
    </div>
    <h2 class="cal-title">${esc(calTitle())}${term?`<small>${esc(term.name)}</small>`:''}</h2>
    <div class="grow"></div>
    <div class="searchbox">
      ${I.search}
      <input class="input" type="search" placeholder="Search events…" value="${esc(ui.filters.q)}" data-act="search-input" aria-label="Search events">
    </div>
    <div class="seg" role="group" aria-label="Calendar view">
      ${views.map(([v,l])=>`<button data-act="set-view" data-view="${v}" aria-pressed="${ui.view===v}">${l}</button>`).join('')}
    </div>
    <button class="btn btn-outline btn-sm" data-act="subscribe-view" aria-label="Subscribe to this calendar">${I.rss}<span class="hide-sm">Subscribe</span></button>
    ${Store.can('create')?`<button class="btn btn-primary btn-sm" data-act="new-event" aria-label="Create an event">${I.plus}<span class="hide-sm">Create</span></button>`:''}
  </div>`;
}

function activeFilterStrip(){
  const f=Store.state.ui.filters;
  const tags=[];
  f.campusIds.forEach(id=>tags.push(['campus',id,campusName(id)]));
  f.yearGroupIds.forEach(id=>tags.push(['yg',id,ygName(id)]));
  f.categoryIds.forEach(id=>tags.push(['cat',id,catName(id)]));
  f.audienceIds.forEach(id=>tags.push(['aud',id,(byId(AUDIENCES,id)||{}).name]));
  if(f.q) tags.push(['q','',`“${f.q}”`]);
  if(!tags.length) return '';
  return `<div class="active-filters">
    <span class="subtle mono" style="font-size:10px;letter-spacing:.1em">FILTERED BY</span>
    ${tags.map(([k,id,label])=>`<span class="filter-tag">${esc(label||'')}
      <button data-act="remove-filter" data-kind="${k}" data-id="${id}" aria-label="Remove ${esc(label||'')} filter">${I.x}</button></span>`).join('')}
    <button class="btn btn-ghost btn-sm" data-act="clear-filters">Clear all</button>
  </div>`;
}

/* --- Month --- */
function monthView(occ){
  const {cursor} = Store.state.ui;
  const {from,to} = calRange();
  const today = T.todayKey();
  const month = cursor.slice(0,7);
  const byDay = {};
  occ.forEach(o=>{ (byDay[o.date]=byDay[o.date]||[]).push(o); });
  const days = T.range(from,to);
  const canDrag = Store.can('edit');

  return `
  <div class="month-head" aria-hidden="true">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div>${d}</div>`).join('')}</div>
  <div class="month-grid" role="group" aria-label="Month view — ${T.monthName(cursor)} ${cursor.slice(0,4)}">
    ${days.map(d=>{
      const list=(byDay[d]||[]);
      const holiday = list.some(o=>o.ev.categoryId==='holiday');
      const shown = list.slice(0,4), extra=list.length-shown.length;
      const dn = T.parse(d).getUTCDate();
      return `<div class="day-cell ${d.slice(0,7)!==month?'out':''} ${T.isWeekend(d)?'weekend':''} ${d===today?'is-today':''} ${holiday?'holiday':''}"
        role="group" data-date="${d}" ${canDrag?'data-drop="1"':''} aria-label="${T.fmtLong(d)}, ${list.length} events">
        <div class="day-head">
          <span class="daynum">${dn}</span>
          ${holiday?`<span class="day-tag">${esc((list.find(o=>o.ev.categoryId==='holiday').ev.title||'').slice(0,18))}</span>`:''}
        </div>
        ${shown.map(o=>pill(o,canDrag)).join('')}
        ${extra>0?`<button class="more-link" data-act="day-peek" data-date="${d}">+${extra} more</button>`:''}
      </div>`;
    }).join('')}
  </div>`;
}
function pill(o, canDrag){
  const ev=o.ev;
  const cls = [ 'pill',
    ev.allDay?'is-allday':'',
    ev.status==='cancelled'?'is-cancelled':'',
    ev.important?'is-important':'',
    canDrag?'draggable':''
  ].filter(Boolean).join(' ');
  return `<button class="${cls}" style="--cat:${catColour(ev.categoryId)}" data-act="open-event" data-id="${ev.id}" data-date="${o.date}"
    ${canDrag?`draggable="true" data-drag="${ev.id}"`:''} title="${esc(ev.title)} — ${esc(timeLabel(ev))}">
    ${!ev.allDay&&ev.start?`<span class="pt">${esc(ev.start)}</span>`:''}
    <span class="pn">${esc(ev.title)}</span>
  </button>`;
}

/* --- Week / Day --- */
function weekView(occ){ return timeGrid(occ, T.range(T.startOfWeek(Store.state.ui.cursor), T.addDays(T.startOfWeek(Store.state.ui.cursor),6))); }
function dayView(occ){ return timeGrid(occ, [Store.state.ui.cursor]); }

function timeGrid(occ, days){
  const START=7, END=19;
  const today=T.todayKey();
  const allDay = occ.filter(o=>o.ev.allDay);
  const timed = occ.filter(o=>!o.ev.allDay && o.ev.start);
  const hours = []; for(let h=START;h<=END;h++) hours.push(h);

  const minW = days.length>1 ? 'min-width:660px' : '';
  return `
  <div class="tg-scroll">
   <div class="tg" style="${minW}">
    <div class="allday-row">
      <div class="allday-label">All day</div>
      <div style="display:grid;grid-template-columns:repeat(${days.length},minmax(0,1fr))">
        ${days.map(d=>`<div style="padding:4px;border-right:1px solid var(--border);display:grid;gap:2px;align-content:start;min-width:0">
          ${allDay.filter(o=>o.date===d).map(o=>pill(o,false)).join('')}
        </div>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:56px minmax(0,1fr)">
      <div></div>
      <div style="display:grid;grid-template-columns:repeat(${days.length},minmax(0,1fr))">
        ${days.map(d=>`<div class="wk-daycol-head ${d===today?'is-today':''}">
          <div class="wd">${T.DAY3[T.dow(d)]}</div><div class="dn">${T.parse(d).getUTCDate()}</div></div>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:56px minmax(0,1fr)">
    <div class="time-gutter">
      ${hours.map(h=>`<div class="time-slot"><span>${String(h).padStart(2,'0')}:00</span></div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(${days.length},minmax(0,1fr));position:relative">
      ${days.map(d=>{
        const items = timed.filter(o=>o.date===d);
        const nowLine = d===today ? nowOffset(START,END) : null;
        return `<div class="day-column ${T.isWeekend(d)?'weekend':''}" data-date="${d}" style="min-height:${(END-START+1)*48}px">
          ${hours.map(()=>`<div class="time-slot"></div>`).join('')}
          ${items.map(o=>{
            const s=T.toMin(o.ev.start), e=T.toMin(o.ev.end||T.fromMin(s+60));
            const top=((s-START*60)/60)*48, h=Math.max(22,((e-s)/60)*48-2);
            return `<button class="tl-event" style="--cat:${catColour(o.ev.categoryId)};top:${top}px;height:${h}px"
              data-act="open-event" data-id="${o.ev.id}" data-date="${o.date}">
              <b>${esc(o.ev.title)}</b><small>${esc(timeLabel(o.ev))}${o.ev.locationId?' · '+esc(locName(o.ev.locationId)):''}</small></button>`;
          }).join('')}
          ${nowLine!==null?`<div class="now-line" style="top:${nowLine}px"></div>`:''}
        </div>`;
      }).join('')}
    </div>
    </div>
   </div>
  </div>`;
}
function nowOffset(START,END){
  const m=T.nowMinutes();
  if(m < START*60 || m > END*60+60) return null;
  return ((m-START*60)/60)*48;
}

/* --- Agenda --- */
function agendaView(occ){
  const groups = {};
  occ.forEach(o=>{ (groups[o.date]=groups[o.date]||[]).push(o); });
  const dates = Object.keys(groups).sort();
  const today=T.todayKey();
  if(!dates.length) return `<div class="empty">${I.calendar}<h4>No events in this range</h4><p>Try clearing filters, or move forward to the next period.</p><button class="btn btn-outline btn-sm mt-3" data-act="clear-filters">Clear filters</button></div>`;
  return `<div class="agenda">
    ${dates.map(d=>{
      const dt=T.parse(d);
      return `<div class="agenda-day">
        <div class="agenda-date ${d===today?'is-today':''}">
          <div class="dow">${T.DAY3[dt.getUTCDay()]}</div>
          <div class="dnum">${dt.getUTCDate()}</div>
          <div class="mon">${T.MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}</div>
          ${d===today?`<div class="badge badge-gold mt-2">Today</div>`:''}
        </div>
        <div class="agenda-items">
          ${groups[d].map(o=>`
            <button class="agenda-item" style="--cat:${catColour(o.ev.categoryId)}" data-act="open-event" data-id="${o.ev.id}" data-date="${o.date}">
              <span class="at">${o.ev.allDay?'All day':esc(timeLabel(o.ev))}</span>
              <span>
                <span class="an">${esc(o.ev.title)}
                  ${o.ev.important?`<span class="badge badge-important" style="margin-left:6px">${I.star}Important</span>`:''}
                  ${o.ev.status==='cancelled'?`<span class="badge badge-danger" style="margin-left:6px">Cancelled</span>`:''}
                  ${o.spanLen>1?`<span class="badge badge-neutral" style="margin-left:6px">Day ${o.spanIndex+1} of ${o.spanLen}</span>`:''}
                </span>
                <span class="am">
                  <span class="cat-tag" style="--cat:${catColour(o.ev.categoryId)}"><span class="dot"></span>${esc(catName(o.ev.categoryId))}</span>
                  <span>${esc(campusName(o.ev.campusId))}</span>
                  ${o.ev.locationId?`<span>${esc(locName(o.ev.locationId))}</span>`:''}
                  ${o.ev.yearGroupIds&&o.ev.yearGroupIds.length?`<span>${esc(ygLabel(o.ev.yearGroupIds))}</span>`:''}
                </span>
              </span>
            </button>`).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* --- Year --- */
function yearView(occ){
  const y = Store.state.ui.cursor.slice(0,4);
  const today=T.todayKey();
  const byDay={};
  occ.forEach(o=>{ byDay[o.date]=(byDay[o.date]||0)+1; });
  return `<div class="year-grid">
    ${T.MONTHS.map((mn,mi)=>{
      const first = `${y}-${String(mi+1).padStart(2,'0')}-01`;
      const start = T.startOfWeek(first);
      const end = T.addDays(T.startOfWeek(T.endOfMonth(first)),6);
      const days = T.range(start,end);
      const count = days.filter(d=>d.slice(0,7)===first.slice(0,7)).reduce((a,d)=>a+(byDay[d]||0),0);
      return `<div class="mini-month">
        <h4>${mn}<span>${count} events</span></h4>
        <div class="mini-grid">
          ${['M','T','W','T','F','S','S'].map(d=>`<div class="wd">${d}</div>`).join('')}
          ${days.map(d=>{
            const n=byDay[d]||0;
            return `<button class="mini-day ${d.slice(0,7)!==first.slice(0,7)?'out':''} ${n?'has':''} ${n>2?'busy':''} ${d===today?'today':''}"
              data-act="goto-day" data-date="${d}" title="${T.fmtLong(d)} — ${n} event${n===1?'':'s'}">${T.parse(d).getUTCDate()}</button>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ------------------------------------------------------- EVENT PAGE ----- */
function viewEventPage(slug){
  const ev = Store.state.events.find(e=>e.slug===slug);
  if(!ev) return notFound(`We couldn't find an event at that address.`);
  if(!visibleTo(ev, Store.user().role)) return notFound('This event is not publicly available.');
  const colour = catColour(ev.categoryId);
  const cam=byId(CAMPUSES,ev.campusId), loc=byId(LOCATIONS,ev.locationId), org=byId(USERS,ev.organizerId);
  const related = query({from:T.todayKey(), to:T.addDays(T.todayKey(),180)})
    .filter(o=>o.isStart && o.ev.id!==ev.id && (o.ev.campusId===ev.campusId || o.ev.categoryId===ev.categoryId) && o.ev.status==='published')
    .slice(0,3);

  return `<main id="main">
    <section class="hero" style="padding:var(--s-16) 0 var(--s-12)">
      <div class="shell" style="position:relative;z-index:1;max-width:900px">
        <a class="btn btn-on-dark btn-sm mb-6" href="#/calendar">${I.chevL}Back to calendar</a>
        <div class="row row-tight mb-4">
          <span class="badge" style="background:${colour};color:#fff">${esc(catName(ev.categoryId))}</span>
          ${ev.important?`<span class="badge badge-gold">${I.star}Important</span>`:''}
          ${ev.status==='cancelled'?`<span class="badge badge-danger">Cancelled</span>`:''}
          ${ev.status==='postponed'?`<span class="badge badge-warning">Postponed</span>`:''}
        </div>
        <h1 class="display" style="font-size:clamp(2rem,4.6vw,3.4rem);color:#fff">${esc(ev.title)}</h1>
        <div class="row mt-6" style="gap:var(--s-8);color:#B9CFC2;font-size:var(--fs-md)">
          <span class="row row-tight">${I.calendar}${T.fmtLong(ev.date)}</span>
          <span class="row row-tight">${I.clock}${esc(timeLabel(ev)||'TBC')}</span>
          ${loc?`<span class="row row-tight">${I.pin}${esc(loc.name)}</span>`:''}
        </div>
        <div class="hero-cta mt-8" style="margin-bottom:0">
          <a class="btn btn-gold" href="${googleUrl(ev)}" target="_blank" rel="noopener">${I.google}Add to Google Calendar</a>
          <button class="btn btn-on-dark" data-act="ics-event" data-id="${ev.id}">${I.download}Download .ics</button>
          <button class="btn btn-on-dark" data-act="copy-event" data-slug="${ev.slug}">${I.link}Copy link</button>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="shell evpage-grid" style="max-width:900px">
        <div>
          ${ev.status==='cancelled'?`<div class="alert alert-danger">${I.ban}<div class="txt"><b>This event has been cancelled</b><span class="body">It stays published so families who had already noted it are informed.</span></div></div>`:''}
          <h3 class="display mb-4" style="font-size:var(--fs-xl)">About this event</h3>
          <p style="line-height:1.8;font-size:var(--fs-md)">${esc(ev.description||'Further details will be published closer to the date.')}</p>
          ${ev.attachments&&ev.attachments.length?`
            <h3 class="display mt-8 mb-4" style="font-size:var(--fs-xl)">Documents</h3>
            ${ev.attachments.map(a=>`<div class="row card card-pad mb-2" style="padding:12px 16px">${I.file}<span class="grow">${esc(a.name)}</span><span class="mono subtle">${esc(a.size||'')}</span></div>`).join('')}
          `:''}
        </div>
        <aside>
          <div class="card card-pad">
            <h5 class="eyebrow mb-4">Event details</h5>
            <dl class="dl">
              <dt>Date</dt><dd>${T.fmtLong(ev.date)}</dd>
              ${ev.endDate?`<dt>Until</dt><dd>${T.fmtLong(ev.endDate)}</dd>`:''}
              <dt>Time</dt><dd>${esc(timeLabel(ev)||'TBC')}</dd>
              <dt>Campus</dt><dd>${cam?esc(cam.name):'Whole School'}</dd>
              <dt>Years</dt><dd>${esc(ygLabel(ev.yearGroupIds))}</dd>
              ${loc?`<dt>Location</dt><dd>${esc(loc.name)}</dd>`:''}
              ${org?`<dt>Organiser</dt><dd>${esc(org.name)}</dd>`:''}
            </dl>
            <hr class="rule-gold mt-5 mb-5">
            <a class="btn btn-primary btn-block" href="${googleUrl(ev)}" target="_blank" rel="noopener">${I.calendarPlus}Add to calendar</a>
            <a class="btn btn-ghost btn-block mt-2" href="#/subscribe">${I.rss}Subscribe to PBIS events</a>
          </div>
        </aside>
      </div>
    </section>

    ${related.length?`<section class="section section-sunken">
      <div class="shell">
        <div class="sec-head"><div><span class="eyebrow eyebrow-gold">You may also want</span><h2 class="mt-2">Related events</h2></div></div>
        <div class="grid-cards">${related.map(o=>eventCard(o.ev,o.date)).join('')}</div>
      </div>
    </section>`:''}
  </main>`;
}

function notFound(msg){
  return `<main id="main" class="section"><div class="shell">
    <div class="empty" style="min-height:52vh">${I.alert}<h4>Page not found</h4><p>${esc(msg||'That address does not exist.')}</p>
    <a class="btn btn-primary mt-4" href="#/">${I.arrowRight}Back to the calendar</a></div></div></main>`;
}

/* --------------------------------------------------- MY PBIS CALENDAR --- */
function viewMy(){
  const p = Store.state.prefs;
  if(!p.onboarded) return viewOnboarding();
  return `<div>
    <section class="page-hero" style="background:var(--bg-brand);color:#fff;padding:var(--s-10) 0 var(--s-8)">
      <div class="shell">
        <div class="row between" style="align-items:flex-end">
          <div>
            <span class="eyebrow eyebrow-gold">Personalised</span>
            <h1 class="display mt-2" style="font-size:clamp(1.7rem,3.4vw,2.6rem);color:#fff">My PBIS Calendar</h1>
            <div class="row row-tight mt-4">
              <span class="badge" style="background:rgba(255,255,255,.12);color:#fff">${esc(p.campusId?campusName(p.campusId):'All campuses')}</span>
              <span class="badge" style="background:rgba(255,255,255,.12);color:#fff">${esc(p.yearGroupId?ygName(p.yearGroupId):'All year groups')}</span>
              <span class="badge" style="background:rgba(255,255,255,.12);color:#fff">${esc(p.audienceId?(byId(AUDIENCES,p.audienceId)||{}).name:'Everyone')}</span>
              ${p.categoryIds.length?`<span class="badge" style="background:rgba(255,255,255,.12);color:#fff">${p.categoryIds.length} categories</span>`:''}
            </div>
          </div>
          <div class="row row-tight">
            <button class="btn btn-on-dark btn-sm" data-act="edit-prefs">${I.settings}Change preferences</button>
            <button class="btn btn-gold btn-sm" data-act="ics-scope" data-scope="my">${I.download}Download</button>
            <button class="btn btn-on-dark btn-sm" data-act="copy-text" data-text="${esc(feedUrl('my'))}" data-label="Your feed address">${I.rss}Subscribe</button>
          </div>
        </div>
      </div>
    </section>
    ${viewCalendar({personalise:true})}
  </div>`;
}

function viewOnboarding(){
  const s = App.onboard = App.onboard || {step:0, campusId:null, yearGroupId:null, audienceId:null, categoryIds:[]};
  const steps = ['Campus','Year group','You are','Interests'];
  const ygs = s.campusId ? YEAR_GROUPS.filter(y=>y.campusId===s.campusId) : YEAR_GROUPS;

  const body = [
    // 0 campus
    `<div class="onboard-step">
      <h3 class="display" style="font-size:var(--fs-2xl)">Which campus are you interested in?</h3>
      <p class="muted">Whole-school events are always included, whichever you choose.</p>
      <div class="opt-grid mt-4">
        ${CAMPUSES.map(c=>`<button class="opt" aria-pressed="${s.campusId===c.id}" data-act="ob-campus" data-id="${c.id}">
          <b>${esc(c.name)}</b><small>${YEAR_GROUPS.filter(y=>y.campusId===c.id).map(y=>y.name).slice(0,1)} – ${YEAR_GROUPS.filter(y=>y.campusId===c.id).slice(-1).map(y=>y.name)}</small></button>`).join('')}
        <button class="opt" aria-pressed="${s.campusId===null&&s.touchedCampus}" data-act="ob-campus" data-id=""><b>All campuses</b><small>Show everything</small></button>
      </div>
    </div>`,
    // 1 year group
    `<div class="onboard-step">
      <h3 class="display" style="font-size:var(--fs-2xl)">Which year group?</h3>
      <p class="muted">We'll prioritise events for this year group, plus anything campus-wide.</p>
      <div class="opt-grid mt-4" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
        ${ygs.map(y=>`<button class="opt" style="min-height:56px" aria-pressed="${s.yearGroupId===y.id}" data-act="ob-yg" data-id="${y.id}"><b>${esc(y.name)}</b></button>`).join('')}
        <button class="opt" style="min-height:56px" aria-pressed="${!s.yearGroupId&&s.touchedYg}" data-act="ob-yg" data-id=""><b>All years</b></button>
      </div>
    </div>`,
    // 2 audience
    `<div class="onboard-step">
      <h3 class="display" style="font-size:var(--fs-2xl)">What are you?</h3>
      <p class="muted">This decides which events are shown first — and which are hidden.</p>
      <div class="opt-grid mt-4">
        ${AUDIENCES.filter(a=>['parents','students','teachers','staff'].includes(a.id)).map(a=>`
          <button class="opt" aria-pressed="${s.audienceId===a.id}" data-act="ob-aud" data-id="${a.id}">
            <b>${esc(a.name.replace(/s$/,''))}</b><small>${a.id==='parents'?'Events affecting your child':a.id==='students'?'Your lessons, trips and clubs':a.id==='teachers'?'Teaching and staff events':'Operational and staff events'}</small></button>`).join('')}
      </div>
    </div>`,
    // 3 categories
    `<div class="onboard-step">
      <h3 class="display" style="font-size:var(--fs-2xl)">What would you like to see?</h3>
      <p class="muted">Choose as many as you like. Holidays and closures are always included.</p>
      <div class="opt-grid mt-4" style="grid-template-columns:repeat(auto-fit,minmax(132px,1fr))">
        ${CATEGORIES.filter(c=>c.id!=='holiday'&&c.id!=='other').map(c=>`
          <button class="opt" style="min-height:56px" aria-pressed="${s.categoryIds.includes(c.id)}" data-act="ob-cat" data-id="${c.id}">
            <b style="font-size:var(--fs-base);display:flex;align-items:center;gap:8px"><span style="width:9px;height:9px;border-radius:50%;background:var(${c.colourVar});display:inline-block"></span>${esc(c.name)}</b></button>`).join('')}
      </div>
      <p class="hint mt-3">Leave all unselected to receive every category.</p>
    </div>`
  ][s.step];

  return `<main id="main" class="section">
    <div class="shell" style="max-width:720px">
      <div class="text-center mb-6" style="text-align:center">
        <span class="eyebrow eyebrow-gold">My PBIS Calendar</span>
        <h1 class="display mt-3" style="font-size:clamp(1.8rem,4vw,2.8rem)">Let's build your calendar</h1>
        <p class="muted mt-3" style="max-width:52ch;margin:0 auto">Four quick questions. You can change any of this later, and it is stored only on this device unless you sign in.</p>
      </div>
      <div class="card card-pad" style="padding:var(--s-8)">
        <div class="steps">${steps.map((_,i)=>`<span class="step-dot ${i<=s.step?'done':''}"></span>`).join('')}</div>
        <div class="row between mb-5">
          <span class="eyebrow">Step ${s.step+1} of ${steps.length}</span>
          <span class="eyebrow">${esc(steps[s.step])}</span>
        </div>
        ${body}
        <div class="row between mt-8">
          <button class="btn btn-ghost" data-act="ob-back" ${s.step===0?'disabled':''}>${I.chevL}Back</button>
          <div class="row row-tight">
            <button class="btn btn-ghost" data-act="ob-skip">Skip</button>
            <button class="btn btn-primary" data-act="ob-next">${s.step===3?'Create my calendar':'Continue'}${I.chevR}</button>
          </div>
        </div>
      </div>
      <p class="hint mt-5" style="text-align:center">Already set up on another device? Your preferences will sync once staff and parent accounts are connected.</p>
    </div>
  </main>`;
}

/* ---------------------------------------------------------- SUBSCRIBE --- */
function viewSubscribe(){
  const p = Store.state.prefs;
  const scopes = [
    {k:'all', t:'All PBIS Events', d:'Every published event across Early Years, Primary and Secondary. Best for staff and governors.', featured:false},
    {k:'my', t:'My PBIS Calendar', d:'Your personalised feed built from your campus, year group, audience and category preferences.', featured:true},
    {k:'early-years', t:'Early Years', d:'Nursery and Reception, plus every whole-school event.'},
    {k:'primary', t:'Primary', d:'Years 1 to 6, plus every whole-school event.'},
    {k:'secondary', t:'Secondary', d:'Years 7 to 13, plus every whole-school event.'},
    {k:'important', t:'Important Dates Only', d:'A lightweight feed of the dates every family must know. Around 20 events a year.'},
    {k:'holidays', t:'Term Dates & Holidays', d:'Term start and end dates, half terms, public holidays and closures.'},
    {k:'exams', t:'Examinations', d:'Mocks, internal assessment weeks and the Cambridge examination series.'}
  ];
  return `<main id="main">
    <section class="page-hero" style="background:var(--bg-brand);color:#fff;padding:var(--s-16) 0">
      <div class="shell" style="max-width:820px">
        <span class="eyebrow eyebrow-gold">Live subscriptions</span>
        <h1 class="display mt-3" style="font-size:clamp(2rem,4.4vw,3.2rem);color:#fff">Subscribe once.<br>Stay current forever.</h1>
        <p class="mt-5" style="color:#B9CFC2;font-size:var(--fs-lg);line-height:1.7;max-width:60ch">
          A subscription is not a one-off download. Your calendar app checks the PBIS feed regularly, so when we add
          a Year 5 parent evening or move Sports Day, it appears in your calendar without you doing anything.
        </p>
        <div class="row mt-8" style="gap:var(--s-8);padding-top:var(--s-6);border-top:1px solid rgba(255,255,255,.14)">
          <div><div class="mono" style="color:var(--gold-300);font-size:var(--fs-2xl)">iCal</div><div class="eyebrow" style="color:#8FAF9E">Open standard</div></div>
          <div><div class="mono" style="color:var(--gold-300);font-size:var(--fs-2xl)">3</div><div class="eyebrow" style="color:#8FAF9E">Platforms supported</div></div>
          <div><div class="mono" style="color:var(--gold-300);font-size:var(--fs-2xl)">UTC+7</div><div class="eyebrow" style="color:#8FAF9E">Asia/Vientiane</div></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="shell">
        <div class="sec-head"><div><h2>Choose what you want to follow</h2><p>You can subscribe to more than one. Whole-school events are included in every campus feed.</p></div></div>
        <div class="sub-grid">
          ${scopes.map(s=>`
            <div class="sub-card ${s.featured?'featured':''}">
              <h4>${s.featured?`<span style="color:var(--accent)">${I.star}</span>`:''}${esc(s.t)}
                ${p.subscriptions.includes(s.k)?`<span class="badge badge-success" style="margin-left:auto">${I.check}Subscribed</span>`:''}</h4>
              <p>${esc(s.d)}</p>
              <div class="feed-url"><span>${esc(feedUrl(s.k))}</span>
                <button class="btn btn-ghost btn-sm" data-act="copy-text" data-text="${esc(feedUrl(s.k))}" data-label="Feed address" aria-label="Copy feed address for ${esc(s.t)}">${I.copy}</button></div>
              <details style="margin-top:-4px"><summary class="hint" style="cursor:pointer">Prefer an https address?</summary>
                <div class="feed-url mt-2"><span>${esc(feedUrlHttps(s.k))}</span>
                <button class="btn btn-ghost btn-sm" data-act="copy-text" data-text="${esc(feedUrlHttps(s.k))}" data-label="Feed address" aria-label="Copy https feed address for ${esc(s.t)}">${I.copy}</button></div></details>
              <div class="row row-tight">
                <button class="btn ${p.subscriptions.includes(s.k)?'btn-outline':'btn-primary'} btn-sm grow" data-act="toggle-sub" data-scope="${s.k}">
                  ${p.subscriptions.includes(s.k)?'Unsubscribe':'Subscribe'}</button>
                <button class="btn btn-ghost btn-sm" data-act="ics-scope" data-scope="${s.k}" aria-label="Download ${esc(s.t)} as ICS">${I.download}</button>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <section class="section section-sunken">
      <div class="shell">
        <div class="sec-head"><div><h2>How to add a subscription</h2><p>Copy the feed address above, then follow the steps for your calendar app.</p></div></div>
        <div class="g3">
          ${[
            ['Google Calendar', I.google, ['Open Google Calendar on a computer','In the left panel, click + beside “Other calendars”','Choose “From URL”','Paste the PBIS feed address and click “Add calendar”']],
            ['Apple Calendar', I.apple, ['On iPhone: Settings → Apps → Calendar → Accounts','Tap “Add Account” → “Other” → “Add Subscribed Calendar”','Paste the PBIS feed address','On Mac: Calendar → File → New Calendar Subscription']],
            ['Outlook', I.outlook, ['Open Outlook on the web','Go to Calendar → Add calendar','Choose “Subscribe from web”','Paste the PBIS feed address and name it “PBIS”']]
          ].map(([t,icon,steps])=>`
            <div class="card card-pad">
              <div class="row row-tight mb-4" style="color:var(--accent)">${icon}<h4 style="font-size:var(--fs-md);color:var(--fg)">${t}</h4></div>
              <ol style="display:grid;gap:10px;counter-reset:s">
                ${steps.map(x=>`<li class="row row-tight" style="align-items:flex-start;font-size:var(--fs-sm);line-height:1.55">
                  <span style="flex:none;width:20px;height:20px;border-radius:50%;background:var(--bg-sunken);display:grid;place-items:center;font-family:var(--font-mono);font-size:10px;margin-top:1px">${steps.indexOf(x)+1}</span>
                  <span>${esc(x)}</span></li>`).join('')}
              </ol>
            </div>`).join('')}
        </div>
        <div class="alert alert-info mt-6">${I.info}<div class="txt"><b>One event, one source of truth</b>
          <span class="body">Feeds are generated live from the PBIS calendar database. Administrators never re-enter an event for a different platform — publishing it once makes it available everywhere.</span></div></div>
      </div>
    </section>
  </main>`;
}

/* ------------------------------------------------------ IMPORTANT DATES - */
function viewDates(){
  const today=T.todayKey();
  const ay = activeAY();
  const occ = query({from:ay?ay.start:today, to:ay?ay.end:T.addDays(today,365)})
    .filter(o=>o.isStart && o.ev.important && o.ev.status!=='archived');
  const groups={};
  occ.forEach(o=>{ const k=o.date.slice(0,7); (groups[k]=groups[k]||[]).push(o); });
  const keys=Object.keys(groups).sort();
  return `<main id="main">
    <section class="page-hero" style="background:var(--bg-brand);color:#fff;padding:var(--s-16) 0">
      <div class="shell" style="max-width:820px">
        <span class="eyebrow eyebrow-gold">${esc(ay?ay.name:'')}</span>
        <h1 class="display mt-3" style="font-size:clamp(2rem,4.4vw,3.2rem);color:#fff">Important Dates</h1>
        <p class="mt-5" style="color:#B9CFC2;font-size:var(--fs-lg);line-height:1.7;max-width:56ch">
          The dates every PBIS family should note. We keep this list short on purpose — if everything is important, nothing is.
        </p>
        <div class="row mt-8">
          <button class="btn btn-gold" data-act="ics-scope" data-scope="important">${I.download}Download all as .ics</button>
          <button class="btn btn-on-dark" data-act="copy-text" data-text="${esc(feedUrl('important'))}" data-label="Feed address">${I.rss}Subscribe to this list</button>
        </div>
      </div>
    </section>
    <section class="section"><div class="shell" style="max-width:960px">
      ${keys.length? keys.map(k=>{
        const d=T.parse(k+'-01');
        return `<div class="mb-8">
          <div class="row between mb-4" style="align-items:baseline">
            <h3 class="display" style="font-size:var(--fs-xl)">${T.MONTHS[d.getUTCMonth()]} <span class="subtle" style="font-family:var(--font-mono);font-size:var(--fs-base)">${d.getUTCFullYear()}</span></h3>
            <span class="eyebrow">${groups[k].length} date${groups[k].length===1?'':'s'}</span>
          </div>
          <hr class="rule-gold mb-4">
          <div class="card" style="overflow:hidden">
            ${groups[k].map((o,i)=>`
              <button class="today-row" style="--cat:${catColour(o.ev.categoryId)};border-radius:0;border-top:${i?'1px solid var(--border)':'0'};border-right:0"
                data-act="open-event" data-id="${o.ev.id}" data-date="${o.date}">
                <span class="time">${T.DAY3[T.dow(o.date)]} ${T.parse(o.date).getUTCDate()} ${T.MON[T.parse(o.date).getUTCMonth()]}</span>
                <span><span class="title">${esc(o.ev.title)}</span>
                  <span class="sub"><span>${esc(campusName(o.ev.campusId))}</span><span>${esc(catName(o.ev.categoryId))}</span>
                  ${o.ev.endDate?`<span>until ${T.fmtShort(o.ev.endDate)}</span>`:''}</span></span>
                <span class="right"><span class="badge badge-neutral">${esc(T.relative(o.date))}</span></span>
              </button>`).join('')}
          </div>
        </div>`;
      }).join('') : emptyCard('No important dates yet')}
    </div></section>
  </main>`;
}

/* ------------------------------------------------------ ACADEMIC YEAR --- */
function viewYear(){
  const ay = activeAY();
  const terms = Store.state.terms.filter(t=>t.ayId===ay.id);
  const holidays = Store.state.events.filter(e=>e.categoryId==='holiday' && e.date>=ay.start && e.date<=ay.end && e.status!=='archived').sort((a,b)=>T.cmp(a.date,b.date));
  const today=T.todayKey();
  const totalDays = T.diffDays(ay.start, ay.end);
  const elapsed = Math.max(0, Math.min(totalDays, T.diffDays(ay.start, today)));
  const pct = Math.round(elapsed/totalDays*100);

  return `<main id="main">
    <section class="page-hero" style="background:var(--bg-brand);color:#fff;padding:var(--s-16) 0">
      <div class="shell">
        <div class="row between" style="align-items:flex-end;gap:var(--s-8)">
          <div>
            <span class="eyebrow eyebrow-gold">Academic Year</span>
            <h1 class="display mt-3" style="font-size:clamp(2.2rem,5vw,3.6rem);color:#fff">${esc(ay.name)}</h1>
            <p class="mt-4" style="color:#B9CFC2">${T.fmtLong(ay.start)} — ${T.fmtLong(ay.end)}</p>
          </div>
          <div style="min-width:220px">
            <div class="row between mb-2" style="font-size:var(--fs-sm);color:#B9CFC2"><span>Year progress</span><span class="mono">${pct}%</span></div>
            <div style="height:6px;background:rgba(255,255,255,.15);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:var(--gold-400);border-radius:3px"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section"><div class="shell">
      <div class="sec-head"><div><h2>Terms</h2><p>Term dates for ${esc(ay.name)}. All three campuses follow the same term structure.</p></div>
        <button class="btn btn-outline" data-act="ics-scope" data-scope="holidays">${I.download}Term dates .ics</button></div>
      <div class="g3">
        ${terms.map(t=>{
          const active = today>=t.start && today<=t.end;
          const done = today>t.end;
          const len = T.diffDays(t.start,t.end)+1;
          return `<div class="card card-pad" style="${active?'border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)':''}">
            <div class="row between mb-3"><span class="eyebrow">${esc(t.name)}</span>
              ${active?'<span class="badge badge-gold">Current</span>':done?'<span class="badge badge-neutral">Complete</span>':'<span class="badge badge-neutral">Upcoming</span>'}</div>
            <div class="display" style="font-size:var(--fs-lg)">${T.fmtShort(t.start)}</div>
            <div class="subtle mono" style="font-size:var(--fs-xs);margin:4px 0">to</div>
            <div class="display" style="font-size:var(--fs-lg)">${T.fmtShort(t.end)}</div>
            <div class="row row-tight mt-4"><span class="badge badge-neutral">${len} days</span>
              <span class="badge badge-neutral">${Math.round(len/7)} weeks</span></div>
          </div>`;
        }).join('')}
      </div>

      <div class="sec-head mt-12" style="margin-top:var(--s-16)"><div><h2>Holidays & closures</h2><p>Public holidays, half terms and days when school is closed to students.</p></div></div>
      <div class="card" style="overflow:hidden">
        ${holidays.map((e,i)=>`
          <button class="today-row" style="--cat:${catColour(e.categoryId)};border-radius:0;border-top:${i?'1px solid var(--border)':'0'};border-right:0"
            data-act="open-event" data-id="${e.id}" data-date="${e.date}">
            <span class="time">${T.fmtNum(e.date)}</span>
            <span><span class="title">${esc(e.title)}</span>
              <span class="sub">${e.endDate?`<span>until ${T.fmtShort(e.endDate)} · ${T.diffDays(e.date,e.endDate)+1} days</span>`:'<span>Single day</span>'}</span></span>
            <span class="right"><span class="badge badge-neutral">${esc(T.relative(e.date))}</span></span>
          </button>`).join('') || emptyCard('No holidays recorded')}
      </div>

      <div class="sec-head mt-12" style="margin-top:var(--s-16)"><div><h2>All academic years</h2><p>Historical and future years remain available in the system.</p></div></div>
      <div class="g3">
        ${Store.state.academicYears.map(a=>`<div class="card card-pad">
          <div class="row between mb-3"><span class="display" style="font-size:var(--fs-xl)">${esc(a.name)}</span>
            <span class="badge ${a.status==='active'?'badge-gold':a.status==='planning'?'badge-info':'badge-neutral'}">${a.status[0].toUpperCase()+a.status.slice(1)}</span></div>
          <p class="muted" style="font-size:var(--fs-sm)">${T.fmtShort(a.start)} — ${T.fmtShort(a.end)}</p>
          <p class="muted mt-2" style="font-size:var(--fs-sm)">${Store.state.events.filter(e=>e.date>=a.start&&e.date<=a.end).length} events recorded</p>
        </div>`).join('')}
      </div>
    </div></section>
  </main>`;
}

/* ------------------------------------------------------------ CAMPUS ---- */
function viewCampus(slug){
  const c = CAMPUSES.find(x=>x.slug===slug);
  if(!c) return notFound('No campus at that address.');
  const today=T.todayKey();
  const occ = query({from:today,to:T.addDays(today,180),filters:{campusIds:[c.id],yearGroupIds:[],categoryIds:[],audienceIds:[],statuses:[],q:''}})
    .filter(o=>o.isStart&&o.ev.status==='published');
  const ygs = YEAR_GROUPS.filter(y=>y.campusId===c.id);
  return `<main id="main">
    <section class="hero" style="padding:var(--s-16) 0 var(--s-12)">
      <div class="shell" style="position:relative;z-index:1">
        <a class="btn btn-on-dark btn-sm mb-6" href="#/">${I.chevL}All campuses</a>
        <span class="eyebrow eyebrow-gold">${esc(c.short)} Campus</span>
        <h1 class="display mt-3" style="font-size:clamp(2.2rem,5vw,3.6rem);color:#fff">${esc(c.name)}</h1>
        <p class="mt-4" style="color:#B9CFC2;font-size:var(--fs-lg);max-width:56ch;line-height:1.65">${esc(c.blurb)}</p>
        <div class="row mt-8">
          <button class="btn btn-gold" data-act="campus-cal" data-id="${c.id}">${I.calendar}Open ${esc(c.name)} calendar</button>
          <button class="btn btn-on-dark" data-act="ics-scope" data-scope="${c.slug}">${I.download}Download .ics</button>
        </div>
      </div>
    </section>
    <section class="section"><div class="shell">
      <div class="sec-head"><div><h2>Year groups</h2><p>Select a year group to filter the calendar to it.</p></div></div>
      <div class="row">
        ${ygs.map(y=>`<button class="chip" data-act="campus-yg" data-campus="${c.id}" data-id="${y.id}">${esc(y.name)}</button>`).join('')}
      </div>
      <div class="sec-head mt-12" style="margin-top:var(--s-16)"><div><h2>Coming up at ${esc(c.name)}</h2><p>${occ.length} events in the next six months.</p></div></div>
      <div class="grid-cards">${occ.slice(0,12).map(o=>eventCard(o.ev,o.date)).join('') || emptyCard('Nothing scheduled yet')}</div>
    </div></section>
  </main>`;
}

/* ----------------------------------------------------------- SIGNAGE ---- */
function viewSignage(){
  const today=T.todayKey();
  const nowM=T.nowMinutes();
  const occ = query({from:today,to:today}).filter(o=>o.ev.status==='published');
  const timed = occ.filter(o=>!o.ev.allDay&&o.ev.start).sort((a,b)=>T.toMin(a.ev.start)-T.toMin(b.ev.start));
  const current = timed.find(o=>nowM>=T.toMin(o.ev.start)&&nowM<=T.toMin(o.ev.end||o.ev.start));
  const next = timed.filter(o=>T.toMin(o.ev.start)>nowM);
  const allDay = occ.filter(o=>o.ev.allDay);
  const upcoming = query({from:T.addDays(today,1),to:T.addDays(today,14)}).filter(o=>o.isStart&&o.ev.status==='published').slice(0,5);

  return `<div class="signage" id="signage-root">
    <div class="signage-head">
      <div class="row" style="gap:2vw;align-items:center">
        ${logo('crest',92)}
        <div>
          <div class="eyebrow" style="color:var(--gold-400)">Panyathip British International School</div>
          <h1>Today at PBIS</h1>
        </div>
      </div>
      <div class="now">
        <div class="clock" id="sig-clock">${T.nowClock()}</div>
        <div class="date">${T.fmtLong(today)}</div>
      </div>
    </div>
    <div class="signage-body">
      <div style="min-height:0;overflow:hidden">
        ${current?`<div class="sig-now">
          <h3 style="margin-bottom:8px">Happening now</h3>
          <div style="font-size:clamp(1.3rem,2.6vw,2.2rem);font-weight:500;line-height:1.2">${esc(current.ev.title)}</div>
          <div style="color:#B9CFC2;margin-top:8px;font-family:var(--font-mono)">${esc(timeLabel(current.ev))} · ${esc(locName(current.ev.locationId)||campusName(current.ev.campusId))}</div>
        </div>`:''}
        <h3>Today's schedule</h3>
        ${timed.length?timed.map(o=>`<div class="sig-ev">
          <div class="tm">${esc(o.ev.start)}</div>
          <div><div class="nm">${esc(o.ev.title)}</div>
          <div class="lc">${esc(campusName(o.ev.campusId))}${o.ev.locationId?' · '+esc(locName(o.ev.locationId)):''}</div></div>
        </div>`).join(''):`<p style="color:#8FAF9E">No timetabled events today.</p>`}
        ${allDay.length?`<h3 style="margin-top:3vh">All day</h3>${allDay.map(o=>`<div class="sig-ev"><div class="tm">—</div><div><div class="nm">${esc(o.ev.title)}</div></div></div>`).join('')}`:''}
      </div>
      <div style="min-height:0">
        <h3>Coming up</h3>
        ${upcoming.map(o=>`<div class="sig-ev">
          <div class="tm" style="font-size:clamp(.8rem,1.4vw,1.1rem)">${T.fmtNum(o.date).slice(0,5)}</div>
          <div><div class="nm" style="font-size:clamp(.9rem,1.5vw,1.25rem)">${esc(o.ev.title)}</div>
          <div class="lc">${esc(campusName(o.ev.campusId))}</div></div></div>`).join('')}
        <div style="margin-top:auto;padding-top:3vh">
          <div class="eyebrow" style="color:var(--gold-400)">One School. Three Campuses. One Shared Calendar.</div>
          ${logo('word',260,{cls:'mt-4'})}
        </div>
      </div>
    </div>
    <div style="position:fixed;bottom:12px;right:16px"><a class="btn btn-on-dark btn-sm" href="#/">Exit signage</a></div>
  </div>`;
}

/* ------------------------------------------------------------- EMBED ---- */
function viewEmbed(){
  const params = ['campus','yearGroup','category','audience','academicYear','view','limit','theme'];
  const snippet = `<iframe\n  src="${SITE.origin}/embed?campus=primary&yearGroup=year-5&view=agenda&limit=6"\n  width="100%" height="520" style="border:0;border-radius:12px"\n  title="PBIS Central Calendar — Primary, Year 5" loading="lazy"></iframe>`;
  const today=T.todayKey();
  const preview = query({from:today,to:T.addDays(today,90),filters:{campusIds:['pr'],yearGroupIds:['y5'],categoryIds:[],audienceIds:[],statuses:[],q:''}})
    .filter(o=>o.isStart&&o.ev.status==='published').slice(0,6);
  return `<main id="main" class="section"><div class="shell" style="max-width:1000px">
    <span class="eyebrow eyebrow-gold">Integration · ${SITE.domain}</span>
    <h1 class="display mt-3" style="font-size:clamp(1.9rem,4vw,2.8rem)">Embeddable Calendar</h1>
    <p class="muted mt-4" style="max-width:64ch;font-size:var(--fs-md);line-height:1.7">
      The PBIS website, parent portal and campus landing pages consume the same canonical events —
      they never maintain a separate database. Drop the snippet into any page and pass parameters to scope it.
    </p>
    <div class="g2 mt-8">
      <div>
        <h3 class="display mb-4" style="font-size:var(--fs-lg)">Embed code</h3>
        <pre class="card card-pad mono" tabindex="0" role="region" aria-label="Embed code" style="font-size:11.5px;overflow-x:auto;line-height:1.7;white-space:pre">${esc(snippet)}</pre>
        <button class="btn btn-outline btn-sm mt-3" data-act="copy-text" data-text="${esc(snippet)}" data-label="Embed code">${I.copy}Copy embed code</button>
        <h3 class="display mt-8 mb-4" style="font-size:var(--fs-lg)">Parameters</h3>
        <table class="tbl" style="min-width:0;font-size:var(--fs-sm)">
          <tbody>
          ${[['campus','early-years | primary | secondary'],['yearGroup','nursery … year-13'],['category','academic, sports, …'],
             ['audience','parents | students | teachers | staff'],['academicYear','2026-2027'],['view','month | agenda | list'],
             ['limit','1–50 events'],['theme','light | dark | auto']].map(([k,v])=>`
            <tr><td class="mono" style="width:120px;color:var(--accent-strong)">${k}</td><td class="muted">${esc(v)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div>
        <h3 class="display mb-4" style="font-size:var(--fs-lg)">Live preview</h3>
        <div class="card" style="overflow:hidden">
          <div class="panel-head"><h3 style="font-size:var(--fs-sm)">Primary · Year 5 · Agenda</h3><span class="badge badge-neutral">Embedded</span></div>
          <div class="panel-body flush">
            ${preview.map((o,i)=>`<button class="today-row" style="--cat:${catColour(o.ev.categoryId)};border-radius:0;border-top:${i?'1px solid var(--border)':'0'};border-right:0"
              data-act="open-event" data-id="${o.ev.id}" data-date="${o.date}">
              <span class="time">${T.fmtNum(o.date).slice(0,5)}</span>
              <span><span class="title" style="font-size:var(--fs-base)">${esc(o.ev.title)}</span>
              <span class="sub"><span>${esc(timeLabel(o.ev)||'All day')}</span><span>${esc(catName(o.ev.categoryId))}</span></span></span>
              <span class="right"></span></button>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </div></main>`;
}

/* --------------------------------------------------------------- API ---- */
function viewAPI(){
  const endpoints = [
    ['GET','/v1/events','Public','List published, public events. Supports from, to, campus, yearGroup, category, audience, q, limit, cursor.'],
    ['GET','/v1/events/:slug','Public','A single public event by stable slug.'],
    ['GET','/v1/feeds/:scope.ics','Public','Live iCalendar feed for a scope (all, campus, year group, important, holidays, my token).'],
    ['GET','/v1/campuses','Public','Campus entities with year group relationships.'],
    ['GET','/v1/academic-years','Public','Academic years, terms and status.'],
    ['GET','/v1/today','Public','Digital signage payload: current event, next events, all-day notices.'],
    ['GET','/v1/me/calendar','Authenticated','The signed-in user\'s personalised event stream.'],
    ['PUT','/v1/me/preferences','Authenticated','Persist campus, year group, audience and category preferences.'],
    ['POST','/v1/submissions','Authenticated','Submit an event for approval (staff and teachers).'],
    ['POST','/v1/admin/events','Administrative','Create a canonical event.'],
    ['PATCH','/v1/admin/events/:id','Administrative','Update, publish, cancel or postpone an event.'],
    ['POST','/v1/admin/imports','Administrative','Create an import job from CSV, XLSX or ICS; returns a preview for confirmation.'],
    ['GET','/v1/admin/audit','Administrative','Immutable audit trail.']
  ];
  return `<main id="main" class="section"><div class="shell" style="max-width:960px">
    <span class="eyebrow eyebrow-gold">API-first architecture · ${SITE.apiBase}</span>
    <h1 class="display mt-3" style="font-size:clamp(1.9rem,4vw,2.8rem)">Calendar API</h1>
    <p class="muted mt-4" style="max-width:66ch;font-size:var(--fs-md);line-height:1.7">
      The database is the source of truth. The website, the CMS, personal calendar subscriptions, digital signage
      and any future mobile application all consume this one API. Private events are never exposed through public layers.
    </p>
    <div class="alert alert-info mt-6">${I.shield}<div class="txt"><b>Four separate layers</b>
      <span class="body">Public · Authenticated user · Administrative · Integration. Authorisation is evaluated per layer, not per interface.</span></div></div>
    <div class="card mt-6" style="overflow:hidden">
      <div class="tbl-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table class="tbl">
        <thead><tr><th style="width:70px">Method</th><th>Endpoint</th><th style="width:130px">Layer</th><th>Purpose</th></tr></thead>
        <tbody>${endpoints.map(([m,p,l,d])=>`<tr>
          <td><span class="badge ${m==='GET'?'badge-info':m==='POST'?'badge-success':'badge-warning'}">${m}</span></td>
          <td class="mono" style="font-size:11.5px">${esc(p)}</td>
          <td><span class="badge badge-neutral">${l}</span></td>
          <td class="muted">${esc(d)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    <h3 class="display mt-8 mb-4" style="font-size:var(--fs-lg)">Example response</h3>
    <pre class="card card-pad mono" tabindex="0" role="region" aria-label="Example API response" style="font-size:11.5px;overflow-x:auto;line-height:1.7">${esc(JSON.stringify({
      data:[{
        id:'evt_7fh2k9', slug:'year-6-parent-evening-2609', title:'Year 6 Parent Evening',
        start:'2026-09-24T15:30:00+07:00', end:'2026-09-24T19:00:00+07:00', allDay:false, timezone:'Asia/Vientiane',
        campus:{id:'pr',name:'Primary'}, yearGroups:[{id:'y6',name:'Year 6'}],
        audiences:['parents'], category:{id:'parent',name:'Parent Event'},
        location:{id:'loc-prhall',name:'Primary Hall'}, visibility:'public', status:'published', important:true,
        links:{self:'/v1/events/year-6-parent-evening-2609', ics:'/v1/events/evt_7fh2k9.ics', web:SITE.origin+'/events/year-6-parent-evening-2609'}
      }],
      meta:{total:1, academicYear:'2026-2027', generatedAt:'2026-08-13T09:00:00+07:00'}
    },null,2))}</pre>
  </div></main>`;
}
