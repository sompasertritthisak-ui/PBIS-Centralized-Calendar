/* ==========================================================================
   PBIS CENTRAL CALENDAR — SHELL, ROUTER, OVERLAYS
   ========================================================================== */

const App = { root:null, route:{name:'home', params:{}}, mobileNavOpen:false, sideOpen:false };
PBIS.App = App;

/* ---------------------------------------------------------- ROUTING ----- */
const ROUTES = [
  [/^\/?$/,                       m=>({name:'home'})],
  [/^\/calendar\/?$/,             m=>({name:'calendar'})],
  [/^\/events\/([\w-]+)$/,        m=>({name:'event', slug:m[1]})],
  [/^\/my\/?$/,                   m=>({name:'my'})],
  [/^\/subscribe\/?$/,            m=>({name:'subscribe'})],
  [/^\/dates\/?$/,                m=>({name:'dates'})],
  [/^\/year\/?$/,                 m=>({name:'year'})],
  [/^\/campus\/([\w-]+)$/,        m=>({name:'campus', slug:m[1]})],
  [/^\/signage\/?$/,              m=>({name:'signage'})],
  [/^\/embed\/?$/,                m=>({name:'embed'})],
  [/^\/api\/?$/,                  m=>({name:'api'})],
  [/^\/admin\/?$/,                m=>({name:'admin', sub:'dashboard'})],
  [/^\/admin\/([\w-]+)\/?$/,      m=>({name:'admin', sub:m[1]})]
];

function parseRoute(){
  const h = (location.hash||'#/').replace(/^#/,'') || '/';
  for(const [re, fn] of ROUTES){ const m = h.match(re); if(m) return fn(m); }
  return {name:'notfound'};
}
function go(path){ location.hash = '#'+path; }
PBIS.go = go;

/* ------------------------------------------------------------ CHROME ---- */
const NAV = [
  {path:'/',          label:'Home'},
  {path:'/calendar',  label:'Calendar'},
  {path:'/my',        label:'My PBIS Calendar'},
  {path:'/dates',     label:'Important Dates'},
  {path:'/year',      label:'Academic Year'},
  {path:'/subscribe', label:'Subscribe'}
];

function renderMasthead(){
  const cur = '/'+ (location.hash.replace(/^#\//,'').split('/')[0] || '');
  const dark = Store.state.prefs.theme==='dark';
  const canAdmin = Store.can('accessCms');
  return `
  <header class="masthead">
    <div class="shell masthead-in">
      <a class="brand" href="#/" aria-label="PBIS Central Calendar, home">
        <span class="brand-mark">${logo('crest',38)}</span>
        <span class="brand-txt"><b>PBIS Central Calendar</b><small>Panyathip British Int'l School</small></span>
      </a>
      <nav class="mainnav" aria-label="Primary">
        ${NAV.map(n=>`<a href="#${n.path}" ${cur===n.path?'aria-current="page"':''}>${n.label}</a>`).join('')}
      </nav>
      <div class="masthead-actions">
        <button class="kbd-hint" data-act="palette" aria-label="Open command palette">
          ${I.search}<span>Search</span><span class="kbd">⌘K</span>
        </button>
        <button class="icon-btn nav-toggle" data-act="mobilenav" aria-label="Open menu" aria-expanded="${App.mobileNavOpen}">${I.menu}</button>
        <button class="icon-btn" data-act="theme" aria-label="Switch to ${dark?'light':'dark'} mode" title="${dark?'Light':'Dark'} mode">${dark?I.sun:I.moon}</button>
        <a class="btn ${canAdmin?'btn-gold':'btn-on-dark'} btn-sm hide-sm" href="/admin" target="_blank" rel="noopener"
           style="margin-left:4px" title="Opens ${location.host}/admin in a new tab">
          ${canAdmin?I.settings:I.lock}<span>${canAdmin?'Admin':'Staff sign in'}</span><span class="ext">${I.external}</span>
        </a>
      </div>
    </div>
    ${App.mobileNavOpen?`<div class="mobilenav"><ul>
      ${NAV.map(n=>`<li><a href="#${n.path}" ${cur===n.path?'aria-current="page"':''}>${n.label}</a></li>`).join('')}
      <li><a href="/admin" target="_blank" rel="noopener">Admin Console ↗</a></li>
      <li><a href="#/signage">Digital Signage</a></li>
    </ul></div>`:''}
  </header>`;
}

function renderFooter(){
  const ay = activeAY();
  return `
  <footer class="footer">
    <div class="shell">
      <div class="footer-grid">
        <div>
          ${logo('full',150,{cls:'footer-logo',decorative:false,label:'Panyathip British International School — 25th Anniversary'})}
          <div class="footer-word">One School.<br>Three Campuses.<br><em>One Shared Calendar.</em></div>
          <p class="mt-5" style="font-size:var(--fs-sm);max-width:42ch;line-height:1.7">
            PBIS Central Calendar is the official source of truth for events at Panyathip British International School.
            Every event is created once and distributed everywhere.
          </p>
        </div>
        <div>
          <h5>Calendar</h5>
          <ul>
            <li><a href="#/calendar">Full calendar</a></li>
            <li><a href="#/dates">Important dates</a></li>
            <li><a href="#/year">Academic year ${ay?ay.name:''}</a></li>
            <li><a href="#/my">My PBIS Calendar</a></li>
            <li><a href="#/subscribe">Subscribe</a></li>
          </ul>
        </div>
        <div>
          <h5>Campuses</h5>
          <ul>${CAMPUSES.map(c=>`<li><a href="#/campus/${c.slug}">${c.name}</a></li>`).join('')}</ul>
        </div>
        <div>
          <h5>Platform</h5>
          <ul>
            <li><a href="/admin" target="_blank" rel="noopener">Admin console ↗</a></li>
            <li><a href="#/signage">Digital signage</a></li>
            <li><a href="#/embed">Embeddable calendar</a></li>
            <li><a href="#/api">Calendar API</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} Panyathip British International School · Celebrating 25 years</span>
        <span class="mono">${location.host}</span>
        <span class="mono">All times Asia/Vientiane (UTC+7)</span>
      </div>
    </div>
  </footer>`;
}

/* ------------------------------------------------- ADMIN (CMS) CHROME ---- */
function renderAdminMasthead(sub){
  const u = Store.user();
  const dark = Store.state.prefs.theme==='dark';
  const signedIn = Store.state.session.signedIn;
  return `
  <header class="masthead masthead-admin">
    <div class="masthead-in">
      <a class="brand" href="/admin" aria-label="PBIS Central Calendar CMS, dashboard">
        <span class="brand-mark">${logo('crest',38)}</span>
        <span class="brand-txt"><b>PBIS Central Calendar</b><small>Content Management System</small></span>
      </a>
      <span class="admin-chip" aria-hidden="true">CMS</span>
      <span class="urlbar" title="Production address of the CMS">${I.lock}<span class="mono">${location.host}/admin${sub&&sub!=='dashboard'?'/'+sub:''}</span></span>
      <div class="masthead-actions">
        <a class="btn btn-on-dark btn-sm" href="#/" target="_blank" rel="noopener" title="Opens the public calendar in a new tab">
          ${I.globe}<span class="hide-sm">View public site</span><span class="ext">${I.external}</span></a>
        ${signedIn?`<button class="kbd-hint" data-act="palette" aria-label="Open command palette">${I.search}<span>Search</span><span class="kbd">⌘K</span></button>`:''}
        <button class="icon-btn" data-act="theme" aria-label="Switch to ${dark?'light':'dark'} mode" title="${dark?'Light':'Dark'} mode">${dark?I.sun:I.moon}</button>
        ${signedIn?`<span class="who" title="${esc(u.email)}">
            <span class="avatar" aria-hidden="true">${esc(u.initials)}</span>
            <span class="who-txt"><b>${esc(u.name)}</b><small>${esc(Store.role().name)}</small></span>
          </span>
          <button class="icon-btn" data-act="sign-out" aria-label="Sign out of the CMS" title="Sign out">${I.signout}</button>`:''}
      </div>
    </div>
  </header>`;
}
PBIS.renderAdminMasthead = renderAdminMasthead;

/* --------------------------------------------------------- OVERLAYS ----- */
const Overlay = {
  el:null, lastFocus:null,
  open(html, opts={}){
    this.close(true);
    this.lastFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const host = document.getElementById('overlays');
    host.innerHTML = '';
    host.appendChild(wrap);
    this.el = wrap;
    requestAnimationFrame(()=>{
      wrap.querySelectorAll('.scrim').forEach(s=>s.classList.add('show'));
      wrap.querySelectorAll('.drawer,.modal,.palette').forEach(s=>s.classList.add('show'));
      const focusTarget = wrap.querySelector('[autofocus]') || wrap.querySelector('.drawer,.modal,.palette');
      if(focusTarget) focusTarget.focus({preventScroll:true});
    });
    document.body.style.overflow='hidden';
    this._key = (e)=>{
      if(e.key==='Escape'){ e.preventDefault(); this.close(); }
      if(e.key==='Tab') this.trap(e);
    };
    document.addEventListener('keydown', this._key);
    this.onClose = opts.onClose;
  },
  trap(e){
    if(!this.el) return;
    const f = this.el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
    if(!f.length) return;
    const list = Array.from(f).filter(x=>x.offsetParent!==null);
    if(!list.length) return;
    const first=list[0], last=list[list.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  },
  close(silent){
    if(!this.el) return;
    const el = this.el; this.el=null;
    el.querySelectorAll('.scrim').forEach(s=>s.classList.remove('show'));
    el.querySelectorAll('.drawer,.modal,.palette').forEach(s=>s.classList.remove('show'));
    document.removeEventListener('keydown', this._key);
    document.body.style.overflow='';
    setTimeout(()=>{ if(el.isConnected) el.remove(); }, 300);
    if(!silent && this.lastFocus && this.lastFocus.isConnected) this.lastFocus.focus({preventScroll:true});
    if(this.onClose) { const f=this.onClose; this.onClose=null; f(); }
  }
};
PBIS.Overlay = Overlay;

/* ------------------------------------------------------ EVENT DRAWER ---- */
function openEvent(evId, occDate){
  const ev = Store.state.events.find(e=>e.id===evId);
  if(!ev){ toast('That event could not be found',{type:'warning'}); return; }
  const d = occDate || ev.date;
  Overlay.open(eventDrawerHTML(ev, d));
}
PBIS.openEvent = openEvent;

function eventDrawerHTML(ev, d){
  const cat = byId(CATEGORIES, ev.categoryId);
  const colour = catColour(ev.categoryId);
  const cam = byId(CAMPUSES, ev.campusId);
  const loc = byId(LOCATIONS, ev.locationId);
  const org = byId(USERS, ev.organizerId);
  const term = termFor(d);
  const auds = (ev.audienceIds||[]).map(a=>{const x=byId(AUDIENCES,a);return x?x.name:'';}).filter(Boolean);
  const statusBadge = {
    published:'', draft:'<span class="badge badge-neutral">Draft</span>',
    cancelled:'<span class="badge badge-danger">Cancelled</span>',
    postponed:'<span class="badge badge-warning">Postponed</span>',
    completed:'<span class="badge badge-neutral">Completed</span>',
    archived:'<span class="badge badge-neutral">Archived</span>'
  }[ev.status]||'';
  const visBadge = ev.visibility==='public' ? '' :
    `<span class="badge badge-neutral">${I.lock}${ev.visibility==='internal'?'Internal':'Restricted'}</span>`;

  return `
  <div class="scrim" data-act="close-overlay"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(ev.title)}" tabindex="-1" style="--cat:${colour}">
    <div class="drawer-head">
      <div class="grow">
        <span class="cat-tag" style="--cat:${colour}"><span class="dot"></span>${cat?cat.name:'Event'}</span>
      </div>
      <button class="icon-btn" style="color:var(--fg-muted)" data-act="close-overlay" aria-label="Close event details">${I.x}</button>
    </div>
    <div class="drawer-body">
      <div class="event-hero" style="--cat:${colour}">
        <div class="row row-tight mb-3">
          ${ev.important?`<span class="badge badge-important">${I.star}Important</span>`:''}
          ${statusBadge}${visBadge}
          ${ev.recurrence?`<span class="badge badge-neutral">${I.repeat}Recurring</span>`:''}
        </div>
        <h3>${esc(ev.title)}</h3>
        <div class="event-when">${I.calendar}<span>${T.fmtLong(d)}</span></div>
        <div class="event-when mt-2">${I.clock}<span>${timeLabel(ev)||'Time to be confirmed'}${!ev.allDay&&ev.start&&ev.end?` · ${T.dur(ev.start,ev.end)}`:''}</span></div>
        ${ev.endDate&&ev.endDate!==ev.date?`<div class="event-when mt-2">${I.arrowRight}<span>Runs until ${T.fmtLong(ev.endDate)}</span></div>`:''}
      </div>

      ${ev.status==='cancelled'?`<div class="alert alert-danger">${I.ban}<div class="txt"><b>This event has been cancelled</b><span class="body">It remains listed so families who had it in their diary are informed.</span></div></div>`:''}
      ${ev.status==='postponed'?`<div class="alert alert-warning">${I.alert}<div class="txt"><b>This event has been postponed</b><span class="body">A new date will be published once confirmed.</span></div></div>`:''}

      ${ev.description?`<p style="line-height:1.7;color:var(--fg);margin-bottom:var(--s-5)">${esc(ev.description)}</p>`:''}

      <dl class="dl">
        <dt>Campus</dt><dd>${cam?esc(cam.name):'Whole School'}</dd>
        <dt>Year groups</dt><dd>${esc(ygLabel(ev.yearGroupIds))}</dd>
        <dt>Audience</dt><dd>${auds.length?esc(auds.join(', ')):'Whole school community'}</dd>
        ${loc?`<dt>Location</dt><dd>${esc(loc.name)}</dd>`:''}
        ${org?`<dt>Organiser</dt><dd>${esc(org.name)}</dd>`:''}
        ${term?`<dt>Term</dt><dd>${esc(term.name)}, ${esc((byId(Store.state.academicYears,term.ayId)||{}).name||'')}</dd>`:''}
        <dt>Time zone</dt><dd class="mono" style="font-size:var(--fs-sm)">Asia/Vientiane (UTC+7)</dd>
      </dl>

      ${ev.attachments&&ev.attachments.length?`
        <div class="mt-6">
          <h5 class="eyebrow mb-3">Attachments</h5>
          ${ev.attachments.map(a=>`<a class="row" href="${esc(a.url||'#')}" target="_blank" rel="noopener" style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:8px">
            <span style="color:var(--fg-subtle)">${I.file}</span>
            <span class="grow" style="font-size:var(--fs-sm)">${esc(a.name)}</span>
            <span class="mono subtle" style="font-size:11px">${a.size?Math.round(a.size/1024)+' KB':''}</span>
          </a>`).join('')}
        </div>`:''}

      ${ev.links&&ev.links.length?`
        <div class="mt-5">
          <h5 class="eyebrow mb-3">Links</h5>
          ${ev.links.map(l=>`<a class="row" href="${esc(l.url)}" style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:8px">
            <span style="color:var(--fg-subtle)">${I.link}</span><span class="grow" style="font-size:var(--fs-sm)">${esc(l.label)}</span>
          </a>`).join('')}
        </div>`:''}

      <div class="mt-6">
        <h5 class="eyebrow mb-3">Add to your calendar</h5>
        <div class="col" style="gap:8px">
          <a class="btn btn-outline btn-block" href="${googleUrl(ev)}" target="_blank" rel="noopener">${I.google}Add to Google Calendar</a>
          <button class="btn btn-outline btn-block" data-act="ics-event" data-id="${ev.id}">${I.apple}Add to Apple Calendar (.ics)</button>
          <a class="btn btn-outline btn-block" href="${outlookUrl(ev)}" target="_blank" rel="noopener">${I.outlook}Add to Outlook</a>
        </div>
      </div>

      <div class="mt-5">
        <h5 class="eyebrow mb-3">Share</h5>
        <div class="row row-tight">
          <button class="btn btn-ghost btn-sm" data-act="copy-event" data-slug="${ev.slug}">${I.link}Copy link</button>
          <button class="btn btn-ghost btn-sm" data-act="ics-event" data-id="${ev.id}">${I.download}Download .ics</button>
          <a class="btn btn-ghost btn-sm" href="/events/${ev.slug}">${I.arrowRight}Open event page</a>
        </div>
      </div>
    </div>
    <div class="drawer-foot">
      <a class="btn btn-primary grow" href="${googleUrl(ev)}" target="_blank" rel="noopener">${I.calendarPlus}Add to calendar</a>
      ${Store.can('edit')?`<button class="btn btn-outline" data-act="edit-event" data-id="${ev.id}">${I.edit}Edit</button>`:''}
    </div>
  </aside>`;
}
PBIS.eventDrawerHTML = eventDrawerHTML;

/* ---------------------------------------------------- COMMAND PALETTE --- */
let paletteState = {q:'', sel:0, items:[]};

function openPalette(){
  paletteState = {q:'', sel:0, items:paletteItems('')};
  Overlay.open(`
    <div class="scrim" data-act="close-overlay"></div>
    <div class="palette-wrap">
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette" tabindex="-1">
        <div class="palette-input">
          ${I.search}
          <input id="pal-input" autofocus placeholder="Search events, jump to a view, run a command…" aria-label="Search or run a command" autocomplete="off">
          <span class="kbd" style="border-color:var(--border-strong);color:var(--fg-subtle)">ESC</span>
        </div>
        <div class="palette-list" id="pal-list" role="listbox" aria-label="Results"></div>
      </div>
    </div>`);
  setTimeout(()=>{
    const input = document.getElementById('pal-input');
    if(!input) return;
    input.focus();
    renderPalette();
    input.addEventListener('input', e=>{ paletteState.q=e.target.value; paletteState.sel=0; paletteState.items=paletteItems(e.target.value); renderPalette(); });
    input.addEventListener('keydown', e=>{
      const n = paletteState.items.filter(i=>!i.group).length;
      if(e.key==='ArrowDown'){ e.preventDefault(); paletteState.sel=Math.min(paletteState.sel+1,n-1); renderPalette(true); }
      if(e.key==='ArrowUp'){ e.preventDefault(); paletteState.sel=Math.max(paletteState.sel-1,0); renderPalette(true); }
      if(e.key==='Enter'){ e.preventDefault(); runPaletteSel(); }
    });
  },40);
}
PBIS.openPalette = openPalette;

function paletteItems(q){
  const s=q.trim().toLowerCase();
  const nav = [
    {group:'Navigate'},
    {label:'Go to Today', icon:I.calendarCheck, sub:'T', run:()=>{ Store.setUI({cursor:T.todayKey()}); go('/calendar'); }},
    {label:'Open Calendar', icon:I.calendar, run:()=>go('/calendar')},
    {label:'My PBIS Calendar', icon:I.star, run:()=>go('/my')},
    {label:'Important Dates', icon:I.alert, run:()=>go('/dates')},
    {label:'Academic Year Overview', icon:I.layers, run:()=>go('/year')},
    {label:'Subscribe to a calendar', icon:I.rss, run:()=>go('/subscribe')},
    {label:'Digital Signage view', icon:I.monitor, run:()=>go('/signage')},
    {group:'Filter'},
    {label:'Early Years only', icon:I.school, run:()=>{Store.setFilters({campusIds:['ey']}); go('/calendar');}},
    {label:'Primary only', icon:I.school, run:()=>{Store.setFilters({campusIds:['pr']}); go('/calendar');}},
    {label:'Secondary only', icon:I.school, run:()=>{Store.setFilters({campusIds:['se']}); go('/calendar');}},
    {label:'Clear all filters', icon:I.x, run:()=>{Store.setFilters({campusIds:[],yearGroupIds:[],categoryIds:[],audienceIds:[],statuses:[],q:''}); toast('Filters cleared');}},
    {group:'View'},
    {label:'Month view', icon:I.grid, run:()=>{Store.setUI({view:'month'}); go('/calendar');}},
    {label:'Week view', icon:I.table, run:()=>{Store.setUI({view:'week'}); go('/calendar');}},
    {label:'Agenda view', icon:I.list, run:()=>{Store.setUI({view:'agenda'}); go('/calendar');}},
    {label:'Year view', icon:I.layers, run:()=>{Store.setUI({view:'year'}); go('/calendar');}}
  ];
  const admin = Store.can('create') ? [
    {group:'Administration'},
    {label:'Create event', icon:I.plus, sub:'C', run:()=>openEditor(null)},
    {label:'Admin dashboard', icon:I.dashboard, run:()=>go('/admin')},
    {label:'Review submissions', icon:I.inbox, run:()=>go('/admin/submissions')},
    {label:'Import calendar', icon:I.upload, run:()=>go('/admin/import')},
    {label:'Export calendar', icon:I.download, run:()=>go('/admin/export')},
    {label:'Start new academic year', icon:I.refresh, run:()=>go('/admin/rollover')},
    {label:'Audit log', icon:I.history, run:()=>go('/admin/audit')},
    {label:'Settings', icon:I.settings, run:()=>go('/admin/settings')}
  ] : [];
  const base = nav.concat(admin);

  if(!s) return base;

  const filtered = [];
  let currentGroup=null, pushedGroup=false;
  base.forEach(it=>{
    if(it.group){ currentGroup=it; pushedGroup=false; return; }
    if(it.label.toLowerCase().includes(s)){
      if(!pushedGroup && currentGroup){ filtered.push(currentGroup); pushedGroup=true; }
      filtered.push(it);
    }
  });

  const matches = Store.state.events
    .filter(e=>e.status!=='archived' && visibleTo(e, Store.user().role))
    .filter(e=>{
      const loc=byId(LOCATIONS,e.locationId), cam=byId(CAMPUSES,e.campusId);
      return [e.title, e.description, loc&&loc.name, cam&&cam.name, catName(e.categoryId)].join(' ').toLowerCase().includes(s);
    })
    .sort((a,b)=>T.cmp(a.date,b.date))
    .slice(0,8);
  if(matches.length){
    filtered.push({group:'Events'});
    matches.forEach(e=>filtered.push({
      label:e.title, icon:I.calendar, sub:T.fmtMed(e.date),
      run:()=>{ Overlay.close(); setTimeout(()=>openEvent(e.id),120); }
    }));
  }
  if(!filtered.length) filtered.push({group:'No results'});
  return filtered;
}

function renderPalette(scrollOnly){
  const list=document.getElementById('pal-list'); if(!list) return;
  let idx=-1;
  list.innerHTML = paletteState.items.map(it=>{
    if(it.group) return `<div class="palette-group">${esc(it.group)}</div>`;
    idx++;
    return `<button class="palette-item ${idx===paletteState.sel?'sel':''}" data-pi="${idx}" role="option" aria-selected="${idx===paletteState.sel}">
      ${it.icon||I.arrowRight}<span>${esc(it.label)}</span>${it.sub?`<span class="sub">${esc(it.sub)}</span>`:''}</button>`;
  }).join('');
  const sel = list.querySelector('.palette-item.sel');
  if(sel) sel.scrollIntoView({block:'nearest'});
  list.querySelectorAll('.palette-item').forEach(b=>{
    b.onclick = ()=>{ paletteState.sel = Number(b.dataset.pi); runPaletteSel(); };
  });
}
function runPaletteSel(){
  const actionable = paletteState.items.filter(i=>!i.group);
  const it = actionable[paletteState.sel];
  if(!it) return;
  Overlay.close();
  setTimeout(()=>it.run(), 80);
}

/* --------------------------------------------------------- CONFIRM ------ */
function confirmDialog({title, body, confirmLabel, danger, onConfirm}){
  Overlay.open(`
  <div class="scrim" data-act="close-overlay"></div>
  <div class="modal-wrap">
    <div class="modal" role="alertdialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
      <div class="modal-head"><h3>${esc(title)}</h3></div>
      <div class="modal-body"><p style="line-height:1.65">${body}</p></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-act="close-overlay">Cancel</button>
        <button class="btn ${danger?'btn-danger':'btn-primary'}" id="confirm-yes" autofocus>${esc(confirmLabel||'Confirm')}</button>
      </div>
    </div>
  </div>`);
  setTimeout(()=>{
    const b=document.getElementById('confirm-yes');
    if(b) b.onclick=()=>{ Overlay.close(); setTimeout(onConfirm, 100); };
  },50);
}
PBIS.confirmDialog = confirmDialog;

/* --------------------------------------------------- GLOBAL DISPATCHER -- */
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-act]');
  if(!t) return;
  const act = t.dataset.act;
  const stop = ()=>{ e.preventDefault(); e.stopPropagation(); };

  switch(act){
    case 'noop': stop(); break;
    case 'close-overlay': stop(); Overlay.close(); break;
    case 'close-overlay-nav': Overlay.close(); break;
    case 'palette': stop(); openPalette(); break;
    case 'mobilenav': stop(); App.mobileNavOpen=!App.mobileNavOpen; render(); break;
    case 'theme': {
      stop();
      const next = Store.state.prefs.theme==='dark'?'light':'dark';
      Store.setPrefs({theme:next}); applyTheme(next); render();
      break;
    }
    case 'motion': {
      stop();
      const next = Store.state.prefs.motion==='off'?'on':'off';
      Store.setPrefs({motion:next}); applyMotion(next); render();
      break;
    }
    case 'open-event': stop(); openEvent(t.dataset.id, t.dataset.date); break;
    case 'edit-event': stop(); Overlay.close(); setTimeout(()=>openEditor(t.dataset.id),140); break;
    case 'ics-event': stop(); downloadEventICS(t.dataset.id); toast('Calendar file downloaded',{type:'success'}); break;
    case 'copy-event': stop(); copy(location.origin+'/events/'+t.dataset.slug, 'Event link'); break;
    case 'copy-text': stop(); copy(t.dataset.text, t.dataset.label||'Link'); break;
    case 'toggle-side': stop(); App.sideOpen=!App.sideOpen; render(); break;
  }
}, false);

/* Keyboard shortcuts */
document.addEventListener('keydown', e=>{
  const tag = (e.target.tagName||'').toLowerCase();
  const typing = tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable;
  if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openPalette(); return; }
  if(typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if(Overlay.el) return;
  const r = App.route;
  if(e.key==='/'){ e.preventDefault(); openPalette(); }
  if(r.name==='calendar'||r.name==='home'){
    if(e.key==='t'||e.key==='T'){ Store.setUI({cursor:T.todayKey()}); if(r.name!=='calendar') go('/calendar'); }
    if(e.key==='m'){ Store.setUI({view:'month'}); if(r.name!=='calendar') go('/calendar'); }
    if(e.key==='w'){ Store.setUI({view:'week'}); if(r.name!=='calendar') go('/calendar'); }
    if(e.key==='d'){ Store.setUI({view:'day'}); if(r.name!=='calendar') go('/calendar'); }
    if(e.key==='a'){ Store.setUI({view:'agenda'}); if(r.name!=='calendar') go('/calendar'); }
    if(e.key==='y'){ Store.setUI({view:'year'}); if(r.name!=='calendar') go('/calendar'); }
    if(r.name==='calendar' && (e.key==='ArrowLeft'||e.key==='ArrowRight')){ e.preventDefault(); shiftCursor(e.key==='ArrowLeft'?-1:1); }
  }
  if(e.key==='c' && Store.can('create')){ openEditor(null); }
});

/* ---------------------------------------------------------- REVEALS ----- */
let revealObserver=null;
function bindReveals(){
  if(Store.state.prefs.motion==='off'){ document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in')); return; }
  if(revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver(entries=>{
    entries.forEach((en,i)=>{ if(en.isIntersecting){ en.target.style.transitionDelay=(Math.min(i,6)*45)+'ms'; en.target.classList.add('in'); revealObserver.unobserve(en.target); } });
  },{rootMargin:'0px 0px -8% 0px', threshold:.06});
  document.querySelectorAll('.reveal:not(.in)').forEach(el=>revealObserver.observe(el));
}
