/* ==========================================================================
   PBIS CENTRAL CALENDAR — ADMIN COMMAND CENTRE
   ========================================================================== */

const IMPORT_SOURCES = [
  ['CSV','Comma-separated spreadsheet export'],
  ['XLSX','Excel workbook'],
  ['ICS','iCalendar file or feed'],
  ['Google','Google Calendar export']
];
const SRC_ACCEPT = { CSV:'.csv,.txt', XLSX:'.xlsx,.xls', ICS:'.ics,.txt', Google:'.ics,.csv,.zip' };
const SRC_HINT = {
  CSV:'The first row must contain column headings. Any heading we do not recognise can be mapped by hand after the preview.',
  XLSX:'Excel workbooks are not parsed on this deployment — save the sheet as CSV and upload that instead.',
  ICS:'An iCalendar file from Outlook, Apple Calendar or any standards-compliant system. Repeat rules are read as repeat rules.',
  Google:'Google Calendar → Settings → Import & export → Export. Unzip it first and upload the .ics inside.'
};

const AdminState = { selected:new Set(), sort:{key:'date',dir:1}, tab:'all', page:0, pageSize:50,
  importRows:null, importMap:null, importText:null, importSrc:'CSV', importCampus:'auto',
  rollover:{step:0, decisions:{}, keep:new Set()} };
PBIS.AdminState = AdminState;

const ADMIN_NAV = [
  {group:'Operate', items:[
    ['dashboard','Dashboard',I.dashboard],
    ['calendar','Calendar',I.calendar],
    ['events','Events',I.list],
    ['submissions','Submissions',I.inbox]
  ]},
  {group:'Structure', items:[
    ['campuses','Campuses',I.building],
    ['yeargroups','Year Groups',I.users],
    ['years','Academic Years',I.layers],
    ['categories','Categories',I.tag],
    ['locations','Locations',I.mapPin]
  ]},
  {group:'Data', items:[
    ['import','Import',I.upload],
    ['export','Export',I.download],
    ['rollover','Year Rollover',I.refresh],
    ['subscriptions','Subscriptions',I.rss]
  ]},
  {group:'Governance', items:[
    ['audit','Audit Log',I.history],
    ['users','Users & Roles',I.shield],
    ['settings','Settings',I.settings]
  ]}
];

/* The CMS is gated. Signing in is what separates calendar.pbis.edu.la
   from calendar.pbis.edu.la/admin — not a hidden link. */
function adminSignIn(){
  const demo = [
    ['s.vongsa@pbis.edu.la','Super Admin'],
    ['j.whitfield@pbis.edu.la','Calendar Admin'],
    ['c.bennett@pbis.edu.la','Campus Admin — Secondary'],
    ['d.okonkwo@pbis.edu.la','Teacher — Secondary']
  ];
  return `<main id="main" class="signin-wrap">
    <div class="signin">
      <div class="signin-head">
        ${logo('full',172,{cls:'signin-logo',decorative:false,label:'Panyathip British International School'})}
        <h1>Content Management System</h1>
        <p>PBIS Central Calendar · <span class="mono">${esc(location.host)}/admin</span></p>
      </div>
      <div class="signin-body">
        <form id="signin-form" autocomplete="on" novalidate>
          <div class="field mb-4">
            <label class="label" for="si-email">School email address</label>
            <input class="input" type="email" id="si-email" name="email" autocomplete="username"
                   inputmode="email" placeholder="you@pbis.edu.la" autofocus>
          </div>
          <div class="field mb-2">
            <label class="label" for="si-password">Password</label>
            <input class="input" type="password" id="si-password" name="password" autocomplete="current-password">
          </div>
          <p class="err mt-2" id="si-error" hidden></p>
          <button class="btn btn-primary btn-block mt-4" type="submit" data-act="sign-in">${I.lock}Sign in</button>
        </form>

        <div class="alert alert-info mt-5">${I.info}<div class="txt"><b>Google Workspace sign-in</b>
          <span class="body">In production this screen hands off to your school Google account. The password form stays as the fallback for accounts without SSO.</span></div></div>

        <h5 class="eyebrow mb-3 mt-5">Demonstration accounts</h5>
        <p class="hint mb-3">Password for all of them: <span class="mono">pbis-demo</span></p>
        ${demo.map(([email,role])=>`<button class="acct" type="button" data-act="sign-in-demo" data-email="${esc(email)}" data-password="pbis-demo">
          <span class="avatar">${esc(email.slice(0,2).toUpperCase())}</span>
          <span class="t"><b>${esc(role)}</b><small>${esc(email)}</small></span>
          ${I.arrowRight}</button>`).join('')}

        <a class="btn btn-ghost btn-block mt-4" href="/" target="_blank" rel="noopener">${I.globe}View the public calendar<span class="ext">${I.external}</span></a>
      </div>
    </div>
  </main>`;
}

function viewAdmin(sub){
  if(!Store.state.session.signedIn) return adminSignIn();
  const pending = Store.state.submissions.filter(s=>s.status==='pending').length;
  const body = {
    dashboard:adminDashboard, calendar:adminCalendar, events:adminEvents, submissions:adminSubmissions,
    campuses:adminCampuses, yeargroups:adminYearGroups, years:adminYears, categories:adminCategories,
    locations:adminLocations, import:adminImport, export:adminExport, rollover:adminRollover,
    subscriptions:adminSubscriptions, audit:adminAudit, users:adminUsers, settings:adminSettings
  }[sub] || adminDashboard;

  return `<main id="main" class="admin-wrap">
    <nav class="admin-side" aria-label="Admin sections">
      ${ADMIN_NAV.map(g=>`<h5>${g.group}</h5>
        ${g.items.map(([k,label,icon])=>`<a class="admin-link ${sub===k?'is-active':''}" href="#/admin/${k}">
          ${icon}<span>${label}</span>${k==='submissions'&&pending?`<span class="n">${pending}</span>`:''}</a>`).join('')}
      `).join('')}
      <div class="admin-side-foot">
        <a class="admin-link" href="#/" target="_blank" rel="noopener">${I.globe}<span>Public site</span></a>
        <button class="admin-link" data-act="sign-out">${I.signout}<span>Sign out</span></button>
      </div>
    </nav>
    <div class="admin-main">${body()}</div>
  </main>`;
}

/* ------------------------------------------------------- DASHBOARD ------ */
function adminDashboard(){
  const today=T.todayKey();
  const evs = Store.state.events.filter(e=>e.status!=='archived');
  const upcoming = evs.filter(e=>e.date>=today && e.status==='published');
  const pending = Store.state.submissions.filter(s=>s.status==='pending');
  const conflicts = allConflicts();
  const drafts = evs.filter(e=>e.status==='draft');
  const recent = Store.state.auditLog.slice(0,8);
  const byCampus = CAMPUSES.map(c=>({name:c.name, n:evs.filter(e=>e.campusId===c.id).length, colour:c.colour}));
  byCampus.push({name:'Whole School', n:evs.filter(e=>!e.campusId).length, colour:'var(--gold-500)'});
  const maxC = Math.max(...byCampus.map(x=>x.n),1);
  const byCat = CATEGORIES.map(c=>({name:c.name, n:evs.filter(e=>e.categoryId===c.id).length, colour:`var(${c.colourVar})`}))
    .filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,8);
  const maxCat = Math.max(...byCat.map(x=>x.n),1);
  const importantSoon = evs.filter(e=>e.important&&e.date>=today&&e.status==='published').sort((a,b)=>T.cmp(a.date,b.date)).slice(0,5);

  return `
  <div class="admin-head">
    <div><h2>Dashboard</h2><p>${esc(Store.user().name)} · ${esc(Store.role().name)} · ${T.fmtLong(today)}</p></div>
    <div class="row row-tight">
      <button class="btn btn-outline btn-sm" data-act="palette">${I.search}Search ⌘K</button>
      ${Store.can('create')?`<button class="btn btn-primary btn-sm" data-act="new-event">${I.plus}Create Event</button>`:''}
    </div>
  </div>

  <div class="stat-grid">
    <div class="stat"><div class="k">Total events</div><div class="v">${evs.length}</div><div class="d">across all academic years</div></div>
    <div class="stat accent"><div class="k">Upcoming</div><div class="v">${upcoming.length}</div><div class="d">published, from today</div></div>
    <div class="stat ${pending.length?'warn':''}"><div class="k">Pending submissions</div><div class="v">${pending.length}</div>
      <div class="d">${pending.length?'<a href="#/admin/submissions" style="color:inherit;text-decoration:underline">review now</a>':'nothing waiting'}</div></div>
    <div class="stat ${conflicts.length?'danger':''}"><div class="k">Potential conflicts</div><div class="v">${conflicts.length}</div><div class="d">double-booked locations</div></div>
    <div class="stat"><div class="k">Drafts</div><div class="v">${drafts.length}</div><div class="d">not yet published</div></div>
  </div>

  ${conflicts.length?`<div class="alert alert-warning">${I.alert}<div class="txt">
    <b>${conflicts.length} potential scheduling conflict${conflicts.length===1?'':'s'}</b>
    <span class="body">${esc(locName(conflicts[0].locationId))} is booked twice on ${T.fmtShort(conflicts[0].date)} — “${esc(conflicts[0].a.title)}” and “${esc(conflicts[0].b.title)}”.</span>
    </div><button class="btn btn-outline btn-sm" data-act="show-conflicts">View all</button></div>`:''}

  <div class="g2">
    <div class="panel">
      <div class="panel-head"><h3>Quick actions</h3></div>
      <div class="panel-body">
        <div class="opt-grid">
          ${[['new-event','Create event',I.plus],['#/admin/import','Import calendar',I.upload],['#/admin/export','Export calendar',I.download],
             ['#/admin/rollover','New academic year',I.refresh],['#/admin/submissions','Review submissions',I.inbox],['palette','Search everything',I.search]]
            .map(([a,l,ic])=>a.startsWith('#')
              ? `<a class="opt" href="${a}" style="min-height:64px"><span style="color:var(--accent)">${ic}</span><b style="font-size:var(--fs-sm)">${l}</b></a>`
              : `<button class="opt" data-act="${a}" style="min-height:64px"><span style="color:var(--accent)">${ic}</span><b style="font-size:var(--fs-sm)">${l}</b></button>`).join('')}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Events by campus</h3><span class="eyebrow">${evs.length} total</span></div>
      <div class="panel-body">
        <div class="bars">
          ${byCampus.map(c=>`<div class="bar-row"><span class="truncate">${esc(c.name)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${Math.round(c.n/maxC*100)}%;background:${c.colour}"></span></span>
            <span class="val">${c.n}</span></div>`).join('')}
        </div>
        <hr class="rule-gold mt-5 mb-5">
        <h4 class="eyebrow mb-4">By category</h4>
        <div class="bars">
          ${byCat.map(c=>`<div class="bar-row"><span class="truncate">${esc(c.name)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${Math.round(c.n/maxCat*100)}%;background:${c.colour}"></span></span>
            <span class="val">${c.n}</span></div>`).join('')}
        </div>
      </div>
    </div>
  </div>

  <div class="g2">
    <div class="panel">
      <div class="panel-head"><h3>Important dates ahead</h3><a class="btn btn-ghost btn-sm" href="#/dates">View all</a></div>
      <div class="panel-body flush">
        ${importantSoon.map((e,i)=>`<button class="today-row" style="--cat:${catColour(e.categoryId)};border-radius:0;border-top:${i?'1px solid var(--border)':'0'};border-right:0"
          data-act="open-event" data-id="${e.id}"><span class="time">${T.fmtNum(e.date).slice(0,5)}</span>
          <span><span class="title" style="font-size:var(--fs-base)">${esc(e.title)}</span>
          <span class="sub"><span>${esc(campusName(e.campusId))}</span><span>${esc(T.relative(e.date))}</span></span></span>
          <span class="right"></span></button>`).join('') || `<div class="empty">${I.star}<h4>No important dates flagged</h4></div>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Recent activity</h3><a class="btn btn-ghost btn-sm" href="#/admin/audit">Full audit log</a></div>
      <div class="panel-body">
        <div class="timeline">
          ${recent.map(a=>`<div class="tl-item">
            <div class="when">${new Date(a.at).toLocaleString('en-GB',{timeZone:'Asia/Vientiane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
            <div class="what"><b style="font-weight:600">${esc(a.action)}</b> — ${esc(a.title)}</div>
            <div class="who">${esc(userName(a.userId))}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

/* --------------------------------------------------- ADMIN CALENDAR ----- */
function adminCalendar(){
  return `<div class="admin-head"><div><h2>Calendar</h2><p>Drag an event to another day to move it. Every change can be undone.</p></div>
    <div class="row row-tight">
      <button class="btn btn-outline btn-sm" data-act="cal-prev" aria-label="Previous month">${I.chevL}</button>
      <button class="btn btn-outline btn-sm" data-act="cal-today">Today</button>
      <button class="btn btn-outline btn-sm" data-act="cal-next" aria-label="Next month">${I.chevR}</button>
      <button class="btn btn-primary btn-sm" data-act="new-event">${I.plus}Create</button>
    </div></div>
    <div class="alert alert-info">${I.info}<div class="txt"><b>${esc(calTitle())}</b>
      <span class="body">Drafts and restricted events are visible to you here but hidden from families.</span></div></div>
    <div class="panel" style="overflow:hidden">
      ${monthView(query(Object.assign(calRange(),{includeDrafts:true})))}
    </div>`;
}

/* ----------------------------------------------------- ADMIN EVENTS ----- */
function adminEvents(){
  const f = Store.state.ui.filters;
  const tab = AdminState.tab;
  let list = Store.state.events.slice();
  const scoped = Store.scopedCampus();
  if(scoped) list = list.filter(e=>e.campusId===scoped || !e.campusId);
  if(tab!=='all') list = list.filter(e=>e.status===tab);
  else list = list.filter(e=>e.status!=='archived');
  if(f.q) list = list.filter(e=>matchFilters(e,{q:f.q}));
  const {key,dir} = AdminState.sort;
  list.sort((a,b)=>{
    let av,bv;
    if(key==='date'){av=a.date;bv=b.date;}
    else if(key==='title'){av=a.title.toLowerCase();bv=b.title.toLowerCase();}
    else if(key==='campus'){av=campusName(a.campusId);bv=campusName(b.campusId);}
    else if(key==='category'){av=catName(a.categoryId);bv=catName(b.categoryId);}
    else {av=a.status;bv=b.status;}
    return (av<bv?-1:av>bv?1:0)*dir;
  });

  const counts = {
    all:Store.state.events.filter(e=>e.status!=='archived').length,
    published:Store.state.events.filter(e=>e.status==='published').length,
    draft:Store.state.events.filter(e=>e.status==='draft').length,
    cancelled:Store.state.events.filter(e=>e.status==='cancelled').length,
    postponed:Store.state.events.filter(e=>e.status==='postponed').length,
    archived:Store.state.events.filter(e=>e.status==='archived').length
  };
  // Never render an unbounded table — a full academic year can hold thousands
  // of rows, and the DOM cost is what makes a CMS feel slow.
  const total = list.length;
  const pageSize = AdminState.pageSize;
  const pages = Math.max(1, Math.ceil(total/pageSize));
  if(AdminState.page > pages-1) AdminState.page = pages-1;
  if(AdminState.page < 0) AdminState.page = 0;
  const from = AdminState.page*pageSize;
  const pageRows = list.slice(from, from+pageSize);

  const sel = AdminState.selected;
  const th = (k,label,w) => `<th class="sortable" data-act="sort" data-key="${k}" ${w?`style="width:${w}"`:''} aria-sort="${key===k?(dir===1?'ascending':'descending'):'none'}">
    ${label}${key===k?(dir===1?' ↑':' ↓'):''}</th>`;

  return `
  <div class="admin-head">
    <div><h2>Events</h2><p>${total} event${total===1?'':'s'}${scoped?` · scoped to ${esc(campusName(scoped))}`:''}${pages>1?` · showing ${from+1}–${Math.min(from+pageSize,total)}`:''}</p></div>
    <div class="row row-tight">
      <div class="searchbox">${I.search}<input class="input" type="search" placeholder="Filter events…" value="${esc(f.q)}" data-act="search-input" aria-label="Filter events"></div>
      <button class="btn btn-outline btn-sm" data-act="export-list">${I.download}Export</button>
      <button class="btn btn-primary btn-sm" data-act="new-event">${I.plus}Create Event</button>
    </div>
  </div>

  <div class="tabs" role="tablist">
    ${[['all','All'],['published','Published'],['draft','Drafts'],['cancelled','Cancelled'],['postponed','Postponed'],['archived','Archived']]
      .map(([k,l])=>`<button role="tab" aria-selected="${tab===k}" data-act="ev-tab" data-tab="${k}">${l} <span class="mono subtle">${counts[k]}</span></button>`).join('')}
  </div>

  <div class="panel">
    ${sel.size?`<div class="bulkbar">
      <b>${sel.size} selected</b>${sel.size&&pages>1?`<span style="opacity:.75;font-size:var(--fs-sm)">on this page</span>`:''}
      <button class="btn btn-ghost btn-sm" data-act="bulk" data-op="publish">${I.check}Publish</button>
      <button class="btn btn-ghost btn-sm" data-act="bulk" data-op="important">${I.star}Mark important</button>
      <button class="btn btn-ghost btn-sm" data-act="bulk" data-op="cancel">${I.ban}Cancel</button>
      <button class="btn btn-ghost btn-sm" data-act="bulk" data-op="duplicate">${I.copy}Duplicate</button>
      <button class="btn btn-ghost btn-sm" data-act="bulk" data-op="export">${I.download}Export</button>
      <button class="btn btn-ghost btn-sm" data-act="bulk" data-op="archive">${I.trash}Archive</button>
      <div class="grow"></div>
      <button class="btn btn-ghost btn-sm" data-act="bulk" data-op="clear">Clear selection</button>
    </div>`:''}
    <div class="tbl-wrap" tabindex="0" role="region" aria-label="Scrollable table">
      <table class="tbl">
        <thead><tr>
          <th style="width:38px"><input type="checkbox" data-act="sel-all" ${sel.size&&sel.size===list.length?'checked':''} aria-label="Select all events"></th>
          ${th('title','Event')}${th('date','Date','120px')}<th style="width:100px">Time</th>
          ${th('campus','Campus','110px')}<th style="width:130px">Year groups</th>${th('category','Category','120px')}
          ${th('status','Status','110px')}<th style="width:100px">Visibility</th><th style="width:90px"></th>
        </tr></thead>
        <tbody>
          ${pageRows.length?pageRows.map(e=>`<tr class="${sel.has(e.id)?'sel':''}">
            <td><input type="checkbox" data-act="sel-row" data-id="${e.id}" ${sel.has(e.id)?'checked':''} aria-label="Select ${esc(e.title)}"></td>
            <td><span class="nm">${esc(e.title)}</span>
              ${e.important?`<span class="badge badge-important" style="margin-left:6px">${I.star}</span>`:''}
              ${e.recurrence?`<span class="badge badge-neutral" style="margin-left:6px">${I.repeat}</span>`:''}</td>
            <td class="mono">${T.fmtNum(e.date)}${e.endDate?`<div class="subtle" style="font-size:10px">→ ${T.fmtNum(e.endDate)}</div>`:''}</td>
            <td class="mono subtle">${e.allDay?'All day':esc(timeLabel(e))}</td>
            <td>${esc(campusName(e.campusId))}</td>
            <td class="subtle" style="font-size:11.5px">${esc(ygLabel(e.yearGroupIds))}</td>
            <td><span class="cat-tag" style="--cat:${catColour(e.categoryId)}"><span class="dot"></span>${esc(catName(e.categoryId))}</span></td>
            <td><span class="status-dot st-${e.status}">${e.status[0].toUpperCase()+e.status.slice(1)}</span></td>
            <td>${e.visibility==='public'?`<span class="subtle row row-tight" style="gap:4px;font-size:11px">${I.globe}Public</span>`
                 :`<span class="subtle row row-tight" style="gap:4px;font-size:11px">${I.lock}${e.visibility==='internal'?'Internal':'Restricted'}</span>`}</td>
            <td><div class="rowacts">
              <button class="btn btn-ghost btn-icon btn-sm" data-act="open-event" data-id="${e.id}" aria-label="Preview ${esc(e.title)}">${I.eye}</button>
              <button class="btn btn-ghost btn-icon btn-sm" data-act="edit-event-direct" data-id="${e.id}" aria-label="Edit ${esc(e.title)}">${I.edit}</button>
              <button class="btn btn-ghost btn-icon btn-sm" data-act="dup-event" data-id="${e.id}" aria-label="Duplicate ${esc(e.title)}">${I.copy}</button>
            </div></td>
          </tr>`).join('') : `<tr><td colspan="10"><div class="empty">${I.calendar}<h4>No events match</h4><p>Try a different tab or clear the filter.</p></div></td></tr>`}
        </tbody>
      </table>
    </div>
    ${pages>1?`<div class="pager">
      <span class="hint">Page ${AdminState.page+1} of ${pages} · ${total} events</span>
      <div class="grow"></div>
      <button class="btn btn-outline btn-sm" data-act="page" data-to="0" ${AdminState.page===0?'disabled':''} aria-label="First page">${I.chevL}${I.chevL}</button>
      <button class="btn btn-outline btn-sm" data-act="page" data-to="${AdminState.page-1}" ${AdminState.page===0?'disabled':''}>${I.chevL}Previous</button>
      <button class="btn btn-outline btn-sm" data-act="page" data-to="${AdminState.page+1}" ${AdminState.page>=pages-1?'disabled':''}>Next${I.chevR}</button>
      <button class="btn btn-outline btn-sm" data-act="page" data-to="${pages-1}" ${AdminState.page>=pages-1?'disabled':''} aria-label="Last page">${I.chevR}${I.chevR}</button>
      <select class="select" style="width:auto;min-height:36px" data-act="page-size" aria-label="Rows per page">
        ${[25,50,100,250].map(n=>`<option value="${n}" ${pageSize===n?'selected':''}>${n} per page</option>`).join('')}
      </select>
    </div>`:''}
  </div>`;
}

/* ------------------------------------------------ ADMIN SUBMISSIONS ----- */
function adminSubmissions(){
  const subs = Store.state.submissions;
  const tab = AdminState.subTab || 'pending';
  const list = tab==='all'?subs:subs.filter(s=>s.status===tab);
  const c = k => subs.filter(s=>s.status===k).length;
  return `
  <div class="admin-head"><div><h2>Event Submissions</h2>
    <p>Events proposed by teaching and support staff. Nothing appears on the public calendar until approved.</p></div></div>
  <div class="tabs" role="tablist">
    ${[['pending','Pending',c('pending')],['changes','Needs changes',c('changes')],['approved','Approved',c('approved')],['rejected','Rejected',c('rejected')],['all','All',subs.length]]
      .map(([k,l,n])=>`<button role="tab" aria-selected="${tab===k}" data-act="sub-tab" data-tab="${k}">${l} <span class="mono subtle">${n}</span></button>`).join('')}
  </div>
  ${list.length? list.map(s=>{
    const u=byId(USERS,s.submittedBy);
    return `<div class="panel">
      <div class="panel-head">
        <div class="grow">
          <div class="row row-tight mb-2">
            <span class="status-dot st-${s.status==='changes'?'pending':s.status}">${s.status==='changes'?'Needs changes':s.status[0].toUpperCase()+s.status.slice(1)}</span>
            <span class="cat-tag" style="--cat:${catColour(s.categoryId)}"><span class="dot"></span>${esc(catName(s.categoryId))}</span>
          </div>
          <h3 style="font-size:var(--fs-lg);font-family:var(--font-display);font-weight:500">${esc(s.title)}</h3>
        </div>
        ${s.status==='pending'&&Store.can('approve')?`<div class="row row-tight">
          <button class="btn btn-ghost btn-sm" data-act="sub-changes" data-id="${s.id}">${I.edit}Request changes</button>
          <button class="btn btn-outline btn-sm" data-act="sub-reject" data-id="${s.id}">${I.x}Reject</button>
          <button class="btn btn-primary btn-sm" data-act="sub-approve" data-id="${s.id}">${I.check}Approve & publish</button>
        </div>`:''}
      </div>
      <div class="panel-body">
        <div class="g2">
          <div>
            <dl class="dl">
              <dt>Date</dt><dd>${T.fmtLong(s.date)}${s.endDate?` → ${T.fmtLong(s.endDate)}`:''}</dd>
              <dt>Time</dt><dd>${s.allDay?'All day':`${esc(s.start||'')}–${esc(s.end||'')}`}</dd>
              <dt>Campus</dt><dd>${esc(campusName(s.campusId))}</dd>
              <dt>Years</dt><dd>${esc(ygLabel(s.yearGroupIds))}</dd>
              <dt>Location</dt><dd>${esc(locName(s.locationId)||'—')}</dd>
              <dt>Submitted</dt><dd>${esc(u?u.name:'—')} · ${T.relative(s.submittedAt).toLowerCase()}</dd>
            </dl>
          </div>
          <div>
            <p class="muted" style="line-height:1.65;font-size:var(--fs-base)">${esc(s.description)}</p>
            ${s.notes?`<div class="alert alert-warning mt-4">${I.info}<div class="txt"><b>Reviewer note</b><span class="body">${esc(s.notes)}</span></div></div>`:''}
            ${(() => { const cf = findConflicts(s); return cf.length?`<div class="alert alert-danger mt-4">${I.alert}<div class="txt">
              <b>Potential conflict</b><span class="body">${esc(locName(s.locationId))} is already booked for “${esc(cf[0].event.title)}” on ${T.fmtShort(cf[0].date)}.</span></div></div>`:''; })()}
          </div>
        </div>
      </div>
    </div>`;
  }).join('') : `<div class="panel"><div class="empty">${I.inbox}<h4>Nothing here</h4><p>There are no submissions with this status.</p></div></div>`}`;
}

/* -------------------------------------------------- TAXONOMY SCREENS ---- */
function taxTable(title, desc, cols, rows, addLabel, kind){
  const mayEdit = Store.can('manageTaxonomy');
  return `<div class="admin-head"><div><h2>${title}</h2><p>${desc}</p></div>
    ${addLabel&&mayEdit?`<button class="btn btn-primary btn-sm" data-act="tax-add" data-kind="${kind}">${I.plus}${addLabel}</button>`:''}
    ${!mayEdit?`<span class="badge badge-neutral">${I.lock}Read only for your role</span>`:''}</div>
  <div class="panel"><div class="tbl-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table class="tbl">
    <thead><tr>${cols.map(c=>`<th${c.w?` style="width:${c.w}"`:''}>${c.label}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

function adminCampuses(){
  const rows = Store.state.campuses.map(c=>{
    const ygs=YEAR_GROUPS.filter(y=>y.campusId===c.id);
    const n=Store.state.events.filter(e=>e.campusId===c.id&&e.status!=='archived').length;
    return `<tr>
      <td><span class="row row-tight"><span style="width:12px;height:12px;border-radius:3px;background:${c.colour};display:inline-block"></span>
        <span class="nm">${esc(c.name)}</span></span></td>
      <td class="mono">${esc(c.short)}</td><td class="mono subtle">${esc(c.slug)}</td>
      <td>${ygs.length} <span class="subtle">(${esc(ygs[0]?ygs[0].name:'')} – ${esc(ygs.length?ygs[ygs.length-1].name:'')})</span></td>
      <td class="mono">${n}</td>
      <td><span class="badge ${c.archived?'badge-neutral':'badge-success'}">${c.archived?'Archived':'Active'}</span></td>
      <td><div class="rowacts"><button class="btn btn-ghost btn-icon btn-sm" data-act="tax-edit" data-kind="campuses" data-id="${c.id}" aria-label="Edit ${esc(c.name)}">${I.edit}</button></div></td>
    </tr>`;
  }).join('');
  return taxTable('Campuses','Campuses are database entities, not hard-coded values. Adding a campus does not require a code change.',
    [{label:'Name'},{label:'Code',w:'80px'},{label:'Slug',w:'120px'},{label:'Year groups'},{label:'Events',w:'80px'},{label:'Status',w:'100px'},{label:'',w:'60px'}], rows, 'Add campus', 'campuses');
}

function adminYearGroups(){
  const rows = CAMPUSES.map(c=>{
    const ygs=YEAR_GROUPS.filter(y=>y.campusId===c.id);
    return `<tr style="background:var(--bg-sunken)"><td colspan="5" class="eyebrow" style="padding:8px 16px">${esc(c.name)}</td></tr>` +
    ygs.map(y=>{
      const n=Store.state.events.filter(e=>(e.yearGroupIds||[]).includes(y.id)&&e.status!=='archived').length;
      return `<tr><td class="nm" style="padding-left:32px">${esc(y.name)}</td><td class="mono subtle">${esc(y.id)}</td>
        <td>${esc(c.name)}</td><td class="mono">${n}</td>
        <td><div class="rowacts"><button class="btn btn-ghost btn-icon btn-sm" data-act="tax-edit" data-kind="yeargroups" data-id="${y.id}" aria-label="Edit ${esc(y.name)}">${I.edit}</button></div></td></tr>`;
    }).join('');
  }).join('');
  return taxTable('Year Groups','Year groups belong to a campus and can be reordered, renamed or archived without affecting historical events.',
    [{label:'Name'},{label:'ID',w:'90px'},{label:'Campus',w:'140px'},{label:'Events',w:'80px'},{label:'',w:'60px'}], rows, 'Add year group', 'yeargroups');
}

function adminYears(){
  const rows = Store.state.academicYears.map(a=>{
    const terms=Store.state.terms.filter(t=>t.ayId===a.id);
    const n=Store.state.events.filter(e=>e.date>=a.start&&e.date<=a.end).length;
    return `<tr>
      <td class="nm">${esc(a.name)}</td>
      <td class="mono">${T.fmtNum(a.start)}</td><td class="mono">${T.fmtNum(a.end)}</td>
      <td>${terms.length}</td><td class="mono">${n}</td>
      <td><span class="badge ${a.status==='active'?'badge-gold':a.status==='planning'?'badge-info':'badge-neutral'}">${a.status[0].toUpperCase()+a.status.slice(1)}</span></td>
      <td><div class="rowacts">
        ${a.status==='planning'?`<a class="btn btn-ghost btn-sm" href="#/admin/rollover">Open wizard</a>`:''}
        <button class="btn btn-ghost btn-icon btn-sm" data-act="tax-edit" data-kind="years" data-id="${a.id}" aria-label="Edit ${esc(a.name)}">${I.edit}</button></div></td>
    </tr>` + terms.map(t=>`<tr><td style="padding-left:32px" class="subtle">${esc(t.name)}</td>
      <td class="mono subtle">${T.fmtNum(t.start)}</td><td class="mono subtle">${T.fmtNum(t.end)}</td>
      <td class="subtle" colspan="4">${T.diffDays(t.start,t.end)+1} days</td></tr>`).join('');
  }).join('');
  return taxTable('Academic Years','The platform plans in academic years, not calendar years. Only one year is normally active.',
    [{label:'Year'},{label:'Start',w:'110px'},{label:'End',w:'110px'},{label:'Terms',w:'70px'},{label:'Events',w:'80px'},{label:'Status',w:'110px'},{label:'',w:'130px'}], rows, 'New academic year', 'years');
}

function adminCategories(){
  const rows = Store.state.categories.map(c=>{
    const n=Store.state.events.filter(e=>e.categoryId===c.id&&e.status!=='archived').length;
    return `<tr><td><span class="cat-tag" style="--cat:var(${c.colourVar})"><span class="dot"></span><span class="nm" style="color:var(--fg)">${esc(c.name)}</span></span></td>
      <td class="mono subtle">${esc(c.id)}</td>
      <td><span class="mono" style="font-size:11px">var(${esc(c.colourVar)})</span></td>
      <td class="mono">${n}</td>
      <td><div class="rowacts"><button class="btn btn-ghost btn-icon btn-sm" data-act="tax-edit" data-kind="categories" data-id="${c.id}" aria-label="Edit ${esc(c.name)}">${I.edit}</button></div></td></tr>`;
  }).join('');
  return taxTable('Categories','Categories drive colour, filtering and personalisation. The palette is deliberately restrained — no rainbow calendar.',
    [{label:'Category'},{label:'ID',w:'110px'},{label:'Colour token',w:'180px'},{label:'Events',w:'80px'},{label:'',w:'60px'}], rows, 'Add category', 'categories');
}

function adminLocations(){
  const conflicts = allConflicts();
  const rows = Store.state.locations.map(l=>{
    const n=Store.state.events.filter(e=>e.locationId===l.id&&e.status!=='archived').length;
    const cf = conflicts.filter(c=>c.locationId===l.id).length;
    return `<tr><td class="nm">${esc(l.name)}</td>
      <td>${esc(campusName(l.campusId))}</td>
      <td class="mono">${l.capacity??'—'}</td>
      <td class="mono">${n}</td>
      <td>${cf?`<span class="badge badge-warning">${cf} conflict${cf===1?'':'s'}</span>`:`<span class="subtle">—</span>`}</td>
      <td><div class="rowacts"><button class="btn btn-ghost btn-icon btn-sm" data-act="tax-edit" data-kind="locations" data-id="${l.id}" aria-label="Edit ${esc(l.name)}">${I.edit}</button></div></td></tr>`;
  }).join('');
  return taxTable('Locations','Reusable location entities power conflict detection and appear in calendar subscriptions.',
    [{label:'Location'},{label:'Campus',w:'150px'},{label:'Capacity',w:'100px'},{label:'Bookings',w:'100px'},{label:'Conflicts',w:'120px'},{label:'',w:'60px'}], rows, 'Add location', 'locations');
}

/* ------------------------------------------------------ ADMIN IMPORT ---- */
const SAMPLE_CSV = `Event Name,Start Date,End Date,Start Time,End Time,Campus,Year Group,Category,Audience,Location,Description
Primary Sports Day,2027-02-12,,08:30,12:30,Primary,"Year 1; Year 2; Year 3",Sports,"Students; Parents",Sports Field,House athletics for Key Stage 1
Year 8 Parent Evening,2027-02-18,,15:30,19:00,Secondary,Year 8,Parent Event,Parents,Secondary Hall,Subject appointments
Secondary House Assembly,2026-09-15,,10:00,11:00,Secondary,Year 7,Assembly,Students,Secondary Hall,Weekly house assembly
World Book Day,2027-03-04,,,,,,Celebration,,,Dress as your favourite character
Staff Wellbeing Morning,2027-02-27,,08:00,10:00,,,Staff Event,Staff,Conference Room,
Easter Holiday,2027-04-05,2027-04-09,,,,,Holiday,,,School closed`;

function adminImport(){
  const rows = AdminState.importRows;
  if(!rows) return `
  <div class="admin-head"><div><h2>Import Calendar</h2><p>Bring in a spreadsheet or an existing calendar. Nothing is published until you confirm.</p></div></div>
  <div class="g2">
    <div class="panel">
      <div class="panel-head"><h3>1 · Choose a source</h3></div>
      <div class="panel-body">
        <div class="opt-grid mb-5">
          ${IMPORT_SOURCES.map(([t,d])=>`<button class="opt" aria-pressed="${AdminState.importSrc===t}" data-act="imp-src" data-src="${t}"><b>${t}</b><small>${d}</small></button>`).join('')}
        </div>
        <div class="field">
          <label class="label" for="imp-campus">Which calendar is this?</label>
          <select class="select" id="imp-campus" data-act="imp-campus">
            <option value="auto" ${AdminState.importCampus==='auto'?'selected':''}>Work it out from each event title</option>
            <option value="pr-ey" ${AdminState.importCampus==='pr-ey'?'selected':''}>Primary &amp; Early Years</option>
            <option value="se" ${AdminState.importCampus==='se'?'selected':''}>Secondary</option>
          </select>
          <span class="hint">A calendar file carries no campus. Naming the calendar it came from means every
            event lands on the right one; anything that still cannot be placed is flagged rather than guessed.</span>
        </div>
        <div class="field mt-5">
          <label class="label" for="imp-file">Upload a file</label>
          <input class="input" type="file" id="imp-file" accept="${SRC_ACCEPT[AdminState.importSrc]||'.csv,.txt,.ics'}" data-act="imp-file">
          <span class="hint">${SRC_HINT[AdminState.importSrc]||''}</span>
        </div>
        <div class="field mt-5">
          <label class="label" for="imp-paste">…or paste rows directly</label>
          <textarea class="textarea mono" id="imp-paste" rows="8" style="font-size:11.5px" placeholder="Event Name,Start Date,…">${esc(SAMPLE_CSV)}</textarea>
          <span class="hint">The first row must contain column headings.</span>
        </div>
        <div class="row mt-4">
          <button class="btn btn-primary" data-act="imp-parse">${I.upload}Preview import</button>
          <button class="btn btn-ghost" data-act="imp-sample">Load sample data</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>How import works</h3></div>
      <div class="panel-body">
        <div class="timeline">
          ${[['Preview, never publish','Every row is validated and shown to you before anything is written.'],
             ['Column mapping','Your spreadsheet headings are matched to PBIS fields. You can change any mapping.'],
             ['Smart suggestions','“Primary Sports Day” is suggested as Primary campus, Sports category, Students and Parents audience.'],
             ['Duplicate detection','Rows matching an existing event on name, date, time and location are flagged.'],
             ['Conflict detection','Location double-bookings are surfaced before publishing.'],
             ['Confirm','You choose per row: import, skip, or replace.']]
            .map(([t,d])=>`<div class="tl-item"><div class="what"><b style="font-weight:600">${t}</b></div><div class="who" style="font-size:var(--fs-sm);color:var(--fg-muted)">${d}</div></div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;

  // preview state
  const map = AdminState.importMap;
  const stats = rows.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a;},{});
  return `
  <div class="admin-head"><div><h2>Review Import</h2><p>${rows.length} rows parsed. Nothing is published until you confirm.</p></div>
    <div class="row row-tight">
      <button class="btn btn-ghost btn-sm" data-act="imp-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" data-act="imp-commit">${I.check}Import ${rows.filter(r=>r.status!=='error'&&r.include).length} events</button>
    </div></div>

  <div class="stat-grid">
    <div class="stat"><div class="k">Ready</div><div class="v" style="color:var(--sem-success)">${stats.ready||0}</div></div>
    <div class="stat"><div class="k">Warnings</div><div class="v" style="color:var(--sem-warning)">${stats.warning||0}</div></div>
    <div class="stat"><div class="k">Duplicates</div><div class="v" style="color:var(--sem-info)">${stats.duplicate||0}</div></div>
    <div class="stat"><div class="k">Errors</div><div class="v" style="color:var(--sem-danger)">${stats.error||0}</div></div>
  </div>

  <div class="panel">
    <div class="panel-head"><h3>Column mapping</h3><span class="eyebrow">Suggested automatically</span></div>
    <div class="panel-body">
      <div class="g2">
        ${map.map(m=>`<div class="map-row">
          <span class="mono truncate" style="font-size:11.5px;color:var(--fg-muted)">${esc(m.source)}</span>
          <span class="arrow">${I.arrowRight}</span>
          <select class="select" data-act="imp-map" data-src="${esc(m.source)}">
            ${[['','— ignore —'],['title','Title'],['date','Start date'],['endDate','End date'],['start','Start time'],['end','End time'],
               ['campusId','Campus'],['yearGroupIds','Year group'],['categoryId','Category'],['audienceIds','Audience'],
               ['locationId','Location'],['description','Description']]
              .map(([v,l])=>`<option value="${v}" ${m.target===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head"><h3>Rows</h3>
      <div class="grow"></div>
      <button class="btn btn-ghost btn-sm" data-act="imp-toggle-all">Toggle all</button></div>
    <div class="tbl-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table class="tbl">
      <thead><tr><th style="width:38px"></th><th>Event</th><th style="width:110px">Date</th><th style="width:100px">Time</th>
        <th style="width:110px">Campus</th><th style="width:120px">Year group</th><th style="width:120px">Category</th><th style="width:150px">Status</th></tr></thead>
      <tbody>
        ${rows.map((r,i)=>`<tr class="imp-row-${r.status}">
          <td><input type="checkbox" data-act="imp-row" data-i="${i}" ${r.include?'checked':''} ${r.status==='error'?'disabled':''} aria-label="Include ${esc(r.data.title||'row '+(i+1))}"></td>
          <td class="nm">${esc(r.data.title||'—')}</td>
          <td class="mono">${esc(r.data.date?T.fmtNum(r.data.date):'—')}</td>
          <td class="mono subtle">${r.data.allDay?'All day':esc((r.data.start||'')+(r.data.end?'–'+r.data.end:''))||'—'}</td>
          <td>${esc(campusName(r.data.campusId))}</td>
          <td class="subtle" style="font-size:11.5px">${esc(ygLabel(r.data.yearGroupIds))}</td>
          <td><span class="cat-tag" style="--cat:${catColour(r.data.categoryId)}"><span class="dot"></span>${esc(catName(r.data.categoryId))}</span></td>
          <td>${{
            ready:`<span class="badge badge-success">${I.check}Ready</span>`,
            warning:`<span class="badge badge-warning" title="${esc(r.message)}">${I.alert}Warning</span>`,
            duplicate:`<span class="badge badge-info" title="${esc(r.message)}">${I.copy}Duplicate</span>`,
            conflict:`<span class="badge badge-warning" title="${esc(r.message)}">${I.alert}Conflict</span>`,
            error:`<span class="badge badge-danger" title="${esc(r.message)}">${I.x}Error</span>`
          }[r.status]}
          ${r.message?`<div class="subtle" style="font-size:10.5px;margin-top:3px">${esc(r.message)}</div>`:''}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

/* ------------------------------------------------------ ADMIN EXPORT ---- */
function adminExport(){
  const today=T.todayKey();
  const scopes=[
    ['current','Current calendar view','Exactly what is on screen in the calendar, including active filters.'],
    ['all','All events','Every event in the system across all academic years.'],
    ['upcoming','Upcoming only','Published events from today forward.'],
    ['ay','Active academic year',`${activeAY().name} only.`],
    ['important','Important dates','The short list families must know.'],
    ['campus','By campus','One file per campus, or choose a single campus.']
  ];
  return `<div class="admin-head"><div><h2>Export</h2><p>Take the calendar out in an open format. Same data, no re-keying.</p></div></div>
  <div class="g2">
    <div class="panel"><div class="panel-head"><h3>Choose a scope</h3></div><div class="panel-body">
      ${scopes.map(([k,t,d])=>`<div class="row between" style="padding:var(--s-3) 0;border-bottom:1px solid var(--border)">
        <div class="grow"><b style="font-size:var(--fs-base)">${t}</b><div class="hint">${d}</div></div>
        <div class="row row-tight">
          <button class="btn btn-outline btn-sm" data-act="exp" data-scope="${k}" data-fmt="ics">.ics</button>
          <button class="btn btn-outline btn-sm" data-act="exp" data-scope="${k}" data-fmt="csv">.csv</button>
        </div></div>`).join('')}
    </div></div>
    <div class="panel"><div class="panel-head"><h3>Formats</h3></div><div class="panel-body">
      <div class="alert alert-info">${I.info}<div class="txt"><b>ICS (iCalendar)</b>
        <span class="body">The open standard. Opens in Google Calendar, Apple Calendar and Outlook. Preserves recurrence, all-day flags and the Asia/Vientiane time zone.</span></div></div>
      <div class="alert alert-info">${I.table}<div class="txt"><b>CSV</b>
        <span class="body">One row per event with campus, year groups, audience, category, location and status. Opens in Excel and Google Sheets, and can be re-imported.</span></div></div>
      <div class="alert alert-warning">${I.alert}<div class="txt"><b>Restricted events</b>
        <span class="body">Events marked Restricted are excluded from any export produced by a Campus Admin, and are always excluded from public feeds.</span></div></div>
      <hr class="rule-gold mt-5 mb-5">
      <h4 class="eyebrow mb-3">Scheduled exports</h4>
      <p class="hint">In production, a nightly job can push the active academic year to the school website and the MIS. Configure it in Settings.</p>
    </div></div>
  </div>`;
}

/* ---------------------------------------------------- ADMIN ROLLOVER ---- */
function adminRollover(){
  const s = AdminState.rollover;
  const from = Store.state.academicYears.find(a=>a.status==='active');
  const to = Store.state.academicYears.find(a=>a.status==='planning');
  const source = Store.state.events.filter(e=>e.date>=from.start&&e.date<=from.end&&e.status!=='archived');
  const classify = ev => ev.recurrence ? 'recurring' :
    (['holiday','celebration','sports','admissions','graduation'].includes(ev.categoryId) ? 'annual' :
    (['exam','assessment','deadline'].includes(ev.categoryId) ? 'review' : 'onetime'));
  const groups = {recurring:[],annual:[],review:[],onetime:[]};
  source.forEach(e=>groups[classify(e)].push(e));
  const steps=['Create year','Configure terms','Copy events','Import dates','Resolve conflicts','Review & publish'];

  return `<div class="admin-head"><div><h2>Start New Academic Year</h2>
    <p>Roll ${esc(from.name)} forward into ${esc(to.name)} without rebuilding the calendar by hand.</p></div></div>

  <div class="panel"><div class="panel-body">
    <div class="steps mb-5">${steps.map((_,i)=>`<span class="step-dot ${i<=s.step?'done':''}"></span>`).join('')}</div>
    <div class="row between mb-6">
      ${steps.map((t,i)=>`<span class="eyebrow" style="${i===s.step?'color:var(--accent-strong)':''}">${i+1}. ${t}</span>`).join('')}
    </div>

    ${s.step===0?`
      <h3 class="display mb-4" style="font-size:var(--fs-xl)">Create ${esc(to.name)}</h3>
      <div class="g2">
        <div class="field"><label class="label" for="ro-name">Academic year name</label><input class="input" id="ro-name" value="${esc(to.name)}" readonly></div>
        <div class="field"><label class="label" for="ro-status">Status</label><input class="input" id="ro-status" value="Planning" readonly></div>
        <div class="field"><label class="label" for="ro-start">Start date</label><input class="input mono" id="ro-start" type="date" value="${to.start}"></div>
        <div class="field"><label class="label" for="ro-end">End date</label><input class="input mono" id="ro-end" type="date" value="${to.end}"></div>
      </div>
      <div class="alert alert-info mt-5">${I.info}<div class="txt"><b>The active year is not touched</b>
        <span class="body">${esc(from.name)} stays live for families until you publish ${esc(to.name)} and make it active.</span></div></div>
    `:''}

    ${s.step===1?`
      <h3 class="display mb-4" style="font-size:var(--fs-xl)">Configure terms</h3>
      <table class="tbl"><thead><tr><th>Term</th><th style="width:170px">Start</th><th style="width:170px">End</th><th style="width:100px">Weeks</th></tr></thead>
      <tbody>${Store.state.terms.filter(t=>t.ayId===to.id).map(t=>`<tr>
        <td class="nm">${esc(t.name)}</td>
        <td><input class="input mono" type="date" value="${t.start}" aria-label="${esc(t.name)} start date"></td>
        <td><input class="input mono" type="date" value="${t.end}" aria-label="${esc(t.name)} end date"></td>
        <td class="mono">${Math.round((T.diffDays(t.start,t.end)+1)/7)}</td></tr>`).join('')}</tbody></table>
    `:''}

    ${s.step===2?`
      <h3 class="display mb-4" style="font-size:var(--fs-xl)">Copy events forward</h3>
      <p class="muted mb-5">The system has classified last year's ${source.length} events. Dates are not copied blindly — annual and assessment events are held for your review.</p>
      ${[['recurring','Recurring series','Migrate automatically — the pattern is date-independent.','badge-success'],
         ['annual','Annual fixtures','Same event each year on a shifted date. Review the new date.','badge-gold'],
         ['review','Assessment & deadlines','Depend on examination board dates. Must be confirmed manually.','badge-warning'],
         ['onetime','One-time events','Unlikely to repeat. Not copied by default.','badge-neutral']]
        .map(([k,t,d,b])=>`<div class="panel" style="margin-bottom:var(--s-4)">
          <div class="panel-head"><div class="grow"><b>${t}</b> <span class="badge ${b}">${groups[k].length}</span><div class="hint">${d}</div></div>
            <div class="seg"><button aria-pressed="${(s.decisions[k]||(k==='onetime'?'skip':k==='recurring'?'copy':'review'))==='copy'}" data-act="ro-dec" data-k="${k}" data-v="copy">Copy all</button>
            <button aria-pressed="${(s.decisions[k]||(k==='onetime'?'skip':k==='recurring'?'copy':'review'))==='review'}" data-act="ro-dec" data-k="${k}" data-v="review">Review each</button>
            <button aria-pressed="${(s.decisions[k]||(k==='onetime'?'skip':k==='recurring'?'copy':'review'))==='skip'}" data-act="ro-dec" data-k="${k}" data-v="skip">Skip</button></div></div>
          <div class="panel-body flush"><div class="tbl-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table class="tbl" style="min-width:0">
            <tbody>${groups[k].slice(0,4).map(e=>`<tr><td class="nm">${esc(e.title)}</td>
              <td class="mono subtle" style="width:110px">${T.fmtNum(e.date)}</td>
              <td class="mono" style="width:150px;color:var(--accent)">→ ${T.fmtNum(T.addDays(e.date,364))}</td>
              <td style="width:120px">${esc(catName(e.categoryId))}</td></tr>`).join('')}
              ${groups[k].length>4?`<tr><td colspan="4" class="subtle" style="text-align:center">+ ${groups[k].length-4} more</td></tr>`:''}
            </tbody></table></div></div>
        </div>`).join('')}
    `:''}

    ${s.step===3?`
      <h3 class="display mb-4" style="font-size:var(--fs-xl)">Import new dates</h3>
      <p class="muted mb-5">Add dates that are only known for the new year — examination timetables, public holidays and inter-school fixtures.</p>
      <div class="opt-grid">
        <a class="opt" href="#/admin/import"><b>Import a spreadsheet</b><small>CSV or XLSX with the new dates</small></a>
        <a class="opt" href="#/admin/import"><b>Import an ICS feed</b><small>Cambridge examination timetable</small></a>
        <button class="opt" data-act="new-event"><b>Add manually</b><small>Create events one at a time</small></button>
        <button class="opt" data-act="ro-next"><b>Skip for now</b><small>Add dates later</small></button>
      </div>
    `:''}

    ${s.step===4?`
      <h3 class="display mb-4" style="font-size:var(--fs-xl)">Resolve conflicts</h3>
      ${(()=>{const cf=allConflicts().filter(c=>!AdminState.rollover.keep.has(c.b.id)); return cf.length?cf.slice(0,5).map(c=>`
        <div class="alert alert-warning">${I.alert}<div class="txt">
          <b>${esc(locName(c.locationId))} — ${T.fmtLong(c.date)}</b>
          <span class="body">“${esc(c.a.title)}” (${esc(timeLabel(c.a))}) overlaps “${esc(c.b.title)}” (${esc(timeLabel(c.b))}).</span></div>
          <div class="row row-tight"><button class="btn btn-outline btn-sm" data-act="edit-event-direct" data-id="${c.b.id}">Change time</button>
          <button class="btn btn-ghost btn-sm" data-act="ro-keep" data-id="${esc(c.b.id)}">Keep anyway</button></div></div>`).join('')
        : `<div class="alert alert-success">${I.checkCircle}<div class="txt"><b>No conflicts detected</b><span class="body">No location is double-booked in the new year.</span></div></div>`;})()}
    `:''}

    ${s.step===5?`
      <h3 class="display mb-4" style="font-size:var(--fs-xl)">Review & publish</h3>
      <div class="stat-grid">
        <div class="stat"><div class="k">Events to create</div><div class="v">${groups.recurring.length+groups.annual.length}</div></div>
        <div class="stat"><div class="k">Held for review</div><div class="v">${groups.review.length}</div></div>
        <div class="stat"><div class="k">Not copied</div><div class="v">${groups.onetime.length}</div></div>
        <div class="stat accent"><div class="k">New academic year</div><div class="v" style="font-size:var(--fs-xl)">${esc(to.name)}</div></div>
      </div>
      <div class="alert alert-warning mt-4">${I.alert}<div class="txt"><b>Publishing makes ${esc(to.name)} the active year</b>
        <span class="body">${esc(from.name)} is archived but stays fully searchable. Every copied event is created as a draft so you can check it before families see it.</span></div></div>
    `:''}

    <div class="row between mt-8">
      <button class="btn btn-ghost" data-act="ro-back" ${s.step===0?'disabled':''}>${I.chevL}Back</button>
      <button class="btn ${s.step===5?'btn-gold':'btn-primary'}" data-act="ro-next">${s.step===5?'Create draft year':'Continue'}${I.chevR}</button>
    </div>
  </div></div>`;
}

/* ------------------------------------------------ ADMIN SUBSCRIPTIONS --- */
function adminSubscriptions(){
  const feeds=[['all','All PBIS Events',1482],['early-years','Early Years',236],['primary','Primary',614],['secondary','Secondary',708],
    ['important','Important Dates',390],['holidays','Term Dates & Holidays',512],['exams','Examinations',188]];
  const total = feeds.reduce((a,f)=>a+f[2],0);
  return `<div class="admin-head"><div><h2>Subscriptions</h2><p>Live calendar feeds generated from the central database.</p></div></div>
  <div class="stat-grid">
    <div class="stat accent"><div class="k">Active subscribers</div><div class="v">${total.toLocaleString()}</div><div class="d">across all feeds</div></div>
    <div class="stat"><div class="k">Feeds published</div><div class="v">${feeds.length + YEAR_GROUPS.length}</div><div class="d">including per-year-group</div></div>
    <div class="stat"><div class="k">Refresh interval</div><div class="v" style="font-size:var(--fs-xl)">15 min</div><div class="d">recommended TTL</div></div>
    <div class="stat"><div class="k">Personal feeds</div><div class="v">418</div><div class="d">My PBIS Calendar tokens</div></div>
  </div>
  <div class="panel"><div class="panel-head"><h3>Published feeds</h3></div>
    <div class="tbl-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table class="tbl">
      <thead><tr><th>Feed</th><th>Address</th><th style="width:130px">Subscribers</th><th style="width:120px">Status</th><th style="width:80px"></th></tr></thead>
      <tbody>${feeds.map(([k,t,n])=>`<tr><td class="nm">${esc(t)}</td>
        <td class="mono subtle" style="font-size:11px">${esc(feedUrl(k))}</td>
        <td class="mono">${n.toLocaleString()}</td>
        <td><span class="badge badge-success">${I.check}Live</span></td>
        <td><div class="rowacts"><button class="btn btn-ghost btn-icon btn-sm" data-act="copy-text" data-text="${esc(feedUrl(k))}" data-label="Feed address" aria-label="Copy ${esc(t)} address">${I.copy}</button>
        <button class="btn btn-ghost btn-icon btn-sm" data-act="ics-scope" data-scope="${k}" aria-label="Download ${esc(t)}">${I.download}</button></div></td></tr>`).join('')}
      </tbody></table></div>
  </div>
  <div class="alert alert-info">${I.info}<div class="txt"><b>Why subscriptions matter</b>
    <span class="body">A parent who subscribes to Primary → Year 5 receives “Year 5 Parent Evening” automatically when you publish it. They never re-add an event by hand, and they never work from a stale PDF.</span></div></div>`;
}

/* ------------------------------------------------------- ADMIN AUDIT ---- */
function adminAudit(){
  const log = Store.state.auditLog;
  const q = (Store.state.ui.filters.q||'').toLowerCase();
  const list = q ? log.filter(a=>(a.title+' '+a.action+' '+userName(a.userId)).toLowerCase().includes(q)) : log;
  return `<div class="admin-head"><div><h2>Audit Log</h2><p>Every change to the calendar is recorded. Entries cannot be edited or removed.</p></div>
    <div class="searchbox">${I.search}<input class="input" type="search" placeholder="Filter log…" value="${esc(Store.state.ui.filters.q)}" data-act="search-input" aria-label="Filter audit log"></div></div>
  <div class="panel"><div class="tbl-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table class="tbl">
    <thead><tr><th style="width:170px">When</th><th style="width:120px">Action</th><th>Event</th><th style="width:190px">User</th><th style="width:120px">Role</th></tr></thead>
    <tbody>${list.slice(0,80).map(a=>{
      const u=byId(USERS,a.userId);
      return `<tr><td class="mono subtle" style="font-size:11px">${new Date(a.at).toLocaleString('en-GB',{timeZone:'Asia/Vientiane',day:'2-digit',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
        <td><span class="badge ${a.action==='created'?'badge-success':a.action==='archived'?'badge-danger':a.action==='approved'?'badge-gold':'badge-neutral'}">${esc(a.action)}</span></td>
        <td class="nm">${esc(a.title)}</td>
        <td>${esc(u?u.name:'—')}</td>
        <td class="subtle">${esc(u?ROLES[u.role].name:'—')}</td></tr>`;
    }).join('')}</tbody></table></div></div>
  ${list.length>80?`<p class="hint" style="text-align:center">Showing the 80 most recent of ${list.length} entries.</p>`:''}`;
}

/* ------------------------------------------------------- ADMIN USERS ---- */
function adminUsers(){
  const cur = Store.state.currentUserId;
  const me = Store.user();
  return `<div class="admin-head"><div><h2>Users & Roles</h2><p>Permissions are evaluated per role, not per screen. Switch role below to see the platform as that user.</p></div></div>
  <div class="alert alert-info">${I.info}<div class="txt"><b>Real accounts, real sessions</b>
    <span class="body">Permissions are enforced by the server on every request, not by hiding buttons. To see the CMS as another role, sign out and sign in as that person.</span></div></div>
  <div class="panel"><div class="tbl-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table class="tbl">
    <thead><tr><th>Name</th><th>Email</th><th style="width:150px">Role</th><th style="width:130px">Campus scope</th><th style="width:150px"></th></tr></thead>
    <tbody>${USERS.map(u=>`<tr class="${u.id===cur?'sel':''}">
      <td><span class="row row-tight"><span style="width:28px;height:28px;border-radius:50%;background:var(--forest-100);color:var(--forest-700);display:grid;place-items:center;font-size:11px;font-weight:700;flex:none">${u.initials}</span>
        <span class="nm">${esc(u.name)}</span></span></td>
      <td class="mono subtle" style="font-size:11.5px">${esc(u.email)}</td>
      <td><span class="badge ${u.role==='super'?'badge-gold':u.role==='caladmin'?'badge-info':'badge-neutral'}">${esc(ROLES[u.role].name)}</span></td>
      <td>${u.campusId?esc(campusName(u.campusId)):'<span class="subtle">All campuses</span>'}</td>
      <td><div class="rowacts">${u.id===cur?'<span class="badge badge-success">You</span>'
        :`<span class="subtle" style="font-size:11px">${u.active?'Active':'Disabled'}</span>`}</div></td></tr>`).join('')}
    </tbody></table></div></div>

  <div class="panel"><div class="panel-head"><h3>Role permissions</h3></div><div class="panel-body flush">
    <div class="tbl-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table class="tbl">
      <thead><tr><th>Role</th><th>Can do</th></tr></thead>
      <tbody>${Object.values(ROLES).map(r=>`<tr><td class="nm">${esc(r.name)}</td><td class="muted">${esc(r.desc)}</td></tr>`).join('')}</tbody>
    </table></div>
  </div></div>`;
}

/* ---------------------------------------------------- ADMIN SETTINGS ---- */
function adminSettings(){
  const p=Store.state.prefs;
  return `<div class="admin-head"><div><h2>Settings</h2><p>Platform configuration for PBIS Central Calendar.</p></div></div>
  <div class="g2">
    <div class="panel"><div class="panel-head"><h3>Institution</h3></div><div class="panel-body">
      <div class="field mb-4"><label class="label" for="set-school">School name</label><input class="input" id="set-school" value="Panyathip British International School"></div>
      <div class="field mb-4"><label class="label" for="set-product">Product name</label><input class="input" id="set-product" value="PBIS Central Calendar"></div>
      <div class="field mb-4"><label class="label" for="set-strap">Strapline</label><input class="input" id="set-strap" value="One School. Three Campuses. One Shared Calendar."></div>
      <div class="field mb-4"><label class="label" for="set-tz">Canonical time zone</label>
        <select class="select" id="set-tz"><option selected>Asia/Vientiane (UTC+7)</option><option>Asia/Bangkok (UTC+7)</option></select>
        <span class="hint">All events are stored and distributed in this time zone, never the visitor's device time zone.</span></div>
      <div class="field mb-4"><label class="label" for="set-domain">Public calendar domain</label>
        <input class="input mono" id="set-domain" value="${SITE.domain}">
        <span class="hint">Families reach the calendar at <span class="mono">${SITE.origin}</span>.</span></div>
      <div class="field mb-4"><label class="label" for="set-admin-domain">CMS address</label>
        <input class="input mono" id="set-admin-domain" value="${SITE.adminDomain}" readonly>
        <span class="hint">The CMS always lives at <span class="mono">/admin</span> on the same host, behind sign-in. It is a separate surface, not a page of the public site.</span></div>
      <div class="field mb-4"><label class="label" for="set-feed">Feed base address</label>
        <input class="input mono" id="set-feed" value="${SITE.feedBase}" readonly>
        <span class="hint">Every subscription is served from this path. Also available over https for apps that reject <span class="mono">webcal://</span>.</span></div>
      <div class="field"><label class="label" for="set-week">Week starts on</label><select class="select" id="set-week"><option selected>Monday</option><option>Sunday</option></select></div>
    </div></div>

    <div class="panel"><div class="panel-head"><h3>Appearance & accessibility</h3></div><div class="panel-body">
      <label class="switch mb-3"><input type="checkbox" ${p.theme==='dark'?'checked':''} data-act="theme"><span class="track"></span><span class="thumb"></span>
        <span>Dark mode</span></label>
      <label class="switch mb-3"><input type="checkbox" ${p.motion==='off'?'checked':''} data-act="motion"><span class="track"></span><span class="thumb"></span>
        <span>Reduce animation</span></label>
      <p class="hint mt-3">The platform also honours the operating system's <span class="mono">prefers-reduced-motion</span> setting automatically. The calendar is fully usable with all animation disabled.</p>
      <hr class="rule-gold mt-5 mb-5">
      <h4 class="eyebrow mb-3">25th Anniversary</h4>
      <label class="switch"><input type="checkbox" checked><span class="track"></span><span class="thumb"></span><span>Show anniversary treatment on Legacy events</span></label>
      <p class="hint mt-2">Optional. The platform does not depend on anniversary branding.</p>
    </div></div>

    <div class="panel"><div class="panel-head"><h3>Approval workflow</h3></div><div class="panel-body">
      <label class="check"><input type="checkbox" checked><span>Teacher submissions require approval before publishing</span></label>
      <label class="check"><input type="checkbox" checked><span>Campus Admins may publish directly for their own campus</span></label>
      <label class="check"><input type="checkbox" checked><span>Warn on location conflicts before publishing</span></label>
      <label class="check"><input type="checkbox"><span>Require a second approver for whole-school events</span></label>
    </div></div>

    <div class="panel"><div class="panel-head"><h3>Data safety</h3></div><div class="panel-body">
      <label class="check"><input type="checkbox" checked disabled><span>Soft delete — events are archived, never destroyed</span></label>
      <label class="check"><input type="checkbox" checked disabled><span>Version history kept for published events</span></label>
      <label class="check"><input type="checkbox" checked disabled><span>Immutable audit log</span></label>
      <label class="check"><input type="checkbox" checked><span>Nightly backup of the event database</span></label>
      <hr class="rule-gold mt-5 mb-5">
      <h4 class="eyebrow mb-3">This demonstration</h4>
      <p class="hint mb-3">Your preferences and any events you create are stored in this browser only. Nothing leaves your device.</p>
      <button class="btn btn-outline btn-sm" data-act="reset-demo">${I.refresh}Reset demonstration data</button>
    </div></div>
  </div>`;
}
