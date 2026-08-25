/* ==========================================================================
   PBIS CENTRAL CALENDAR — CLIENT CORE (API-backed)

   This file replaces the prototype's seeded in-memory store. It keeps exactly
   the same shape — Store.state.events, Store.addEvent(), CAMPUSES, and so on —
   so every view, filter and renderer works unchanged. What changed is where
   the data comes from: the database, through the API, with the server as the
   authority on who may see what.
   ========================================================================== */

"use strict";

const PBIS = {};
window.PBIS = PBIS;

const SITE = {
  domain:      location.host,
  origin:      window.__PBIS_ORIGIN__ || location.origin,
  adminPath:   '/admin',
  adminDomain: location.host + '/admin',
  feedBase:    'webcal://' + location.host + '/feeds/',
  apiBase:     '/api/v1'
};
PBIS.SITE = SITE;
function publicUrl(p){ return SITE.origin + (p === '/' ? '' : p); }
PBIS.publicUrl = publicUrl;

/* ---------------------------------------------------------------- TIME --- */
const TZ = 'Asia/Vientiane';
const TZ_OFFSET_MIN = 420;

const T = {
  todayKey(){ return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); },
  nowMinutes(){ const f=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
    const [h,m]=f.split(':').map(Number); return h*60+m; },
  nowClock(){ return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()); },
  parse(key){ const [y,m,d]=key.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); },
  key(dt){ return dt.toISOString().slice(0,10); },
  addDays(key,n){ const d=T.parse(key); d.setUTCDate(d.getUTCDate()+n); return T.key(d); },
  addMonths(key,n){ const d=T.parse(key); const day=d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+n);
    const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); d.setUTCDate(Math.min(day,last)); return T.key(d); },
  dow(key){ return T.parse(key).getUTCDay(); },
  isWeekend(key){ const d=T.dow(key); return d===0||d===6; },
  startOfWeek(key){ const d=T.dow(key); return T.addDays(key, d===0?-6:1-d); },
  startOfMonth(key){ return key.slice(0,8)+'01'; },
  endOfMonth(key){ const d=T.parse(key); return T.key(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0))); },
  daysInMonth(key){ return Number(T.endOfMonth(key).slice(8)); },
  diffDays(a,b){ return Math.round((T.parse(b)-T.parse(a))/86400000); },
  cmp(a,b){ return a<b?-1:a>b?1:0; },
  range(a,b){ const out=[]; let c=a,g=0; while(c<=b&&g++<1200){ out.push(c); c=T.addDays(c,1);} return out; },
  MONTHS:['January','February','March','April','May','June','July','August','September','October','November','December'],
  MON:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  DAYS:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  DAY3:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  DAY1:['S','M','T','W','T','F','S'],
  monthName(key){ return T.MONTHS[T.parse(key).getUTCMonth()]; },
  fmtLong(key){ const d=T.parse(key); return `${T.DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${T.MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; },
  fmtMed(key){ const d=T.parse(key); return `${T.DAY3[d.getUTCDay()]} ${d.getUTCDate()} ${T.MON[d.getUTCMonth()]}`; },
  fmtShort(key){ const d=T.parse(key); return `${d.getUTCDate()} ${T.MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; },
  fmtNum(key){ const d=T.parse(key); return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`; },
  fmtTime(hm){ return hm||''; },
  toMin(hm){ if(!hm) return 0; const [h,m]=hm.split(':').map(Number); return h*60+m; },
  fromMin(m){ return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; },
  dur(a,b){ const d=T.toMin(b)-T.toMin(a); if(d<=0) return ''; const h=Math.floor(d/60),m=d%60; return h?`${h}h${m?' '+m+'m':''}`:`${m}m`; },
  relative(key){ const t=T.todayKey(); const n=T.diffDays(t,key);
    if(n===0) return 'Today'; if(n===1) return 'Tomorrow'; if(n===-1) return 'Yesterday';
    if(n>1&&n<7) return `In ${n} days`; if(n<-1&&n>-7) return `${-n} days ago`;
    if(n>=7&&n<14) return 'Next week'; if(n>=14&&n<32) return `In ${Math.round(n/7)} weeks`;
    return T.fmtShort(key); },
  toUTCStamp(dateKey,hm){ const [y,mo,d]=dateKey.split('-').map(Number); const [h,mi]=(hm||'00:00').split(':').map(Number);
    const dt=new Date(Date.UTC(y,mo-1,d,h,mi)-TZ_OFFSET_MIN*60000); const p=n=>String(n).padStart(2,'0');
    return `${dt.getUTCFullYear()}${p(dt.getUTCMonth()+1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00Z`; },
  toDateStamp(k){ return k.replace(/-/g,''); }
};
PBIS.T = T;

/* ----------------------------------------------------------- utilities --- */
const uid = (p='e') => p+'-'+Math.random().toString(36).slice(2,9);
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72);
const byId = (arr,id) => arr.find(x=>x.id===id);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
PBIS.uid=uid; PBIS.slugify=slugify; PBIS.byId=byId; PBIS.esc=esc;

/* ------------------------------------------------------------- ROLES ----- */
const ROLES = {
  super:      {id:'super',  name:'Super Admin',    rank:100, desc:'Full control across every campus and every setting.'},
  caladmin:   {id:'caladmin',name:'Calendar Admin',rank:80,  desc:'Manage the whole school calendar, approve submissions, run imports.'},
  campusadmin:{id:'campusadmin',name:'Campus Admin',rank:60, desc:'Manage events for an assigned campus only.'},
  teacher:    {id:'teacher',name:'Teacher',        rank:40,  desc:'View everything relevant and submit events for approval.'},
  parent:     {id:'parent', name:'Parent',         rank:20,  desc:'View events relevant to their children.'},
  student:    {id:'student',name:'Student',        rank:20,  desc:'See what matters to them.'},
  public:     {id:'public', name:'Public Viewer',  rank:0,   desc:'View public events only.'}
};
PBIS.ROLES = ROLES;

/* Taxonomy arrays are populated from the API at boot. Views hold references,
   so they are filled in place rather than reassigned. */
const CAMPUSES = [], YEAR_GROUPS = [], AUDIENCES = [], CATEGORIES = [], LOCATIONS = [], USERS = [];
const ACADEMIC_YEARS = [], TERMS = [];
PBIS.CAMPUSES=CAMPUSES; PBIS.YEAR_GROUPS=YEAR_GROUPS; PBIS.AUDIENCES=AUDIENCES;
PBIS.CATEGORIES=CATEGORIES; PBIS.LOCATIONS=LOCATIONS; PBIS.USERS=USERS;
PBIS.ACADEMIC_YEARS=ACADEMIC_YEARS; PBIS.TERMS=TERMS;

const fill = (target, rows, shape) => { target.length = 0; rows.forEach(r => target.push(shape ? shape(r) : r)); };

/* --------------------------------------------------------------- API ----- */
class ApiError extends Error {
  constructor(status, body){ super((body && (body.message || body.error)) || `Request failed (${status})`);
    this.status = status; this.body = body || {}; this.errors = (body && body.errors) || []; }
}

const Api = {
  async request(method, path, body, opts = {}) {
    const init = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined && !(body instanceof FormData)) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      init.body = body;
    }
    const res = await fetch(path.startsWith('http') ? path : path, init);
    if (res.status === 204) return null;
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    if (!res.ok) throw new ApiError(res.status, json || { message: text.slice(0, 200) });
    return json;
  },
  get(p){ return Api.request('GET', p); },
  post(p, b){ return Api.request('POST', p, b === undefined ? {} : b); },
  patch(p, b){ return Api.request('PATCH', p, b); },
  put(p, b){ return Api.request('PUT', p, b); },
  del(p){ return Api.request('DELETE', p); }
};
PBIS.Api = Api; PBIS.ApiError = ApiError;

/* ------------------------------------------------------------- STORE ----- */
const PREF_KEY = 'pbis-local-prefs-v1';

const Store = {
  state: {
    events: [], submissions: [], auditLog: [],
    campuses: CAMPUSES, yearGroups: YEAR_GROUPS, categories: CATEGORIES,
    locations: LOCATIONS, academicYears: ACADEMIC_YEARS, terms: TERMS,
    currentUserId: null,
    session: { signedIn: false, user: null },
    prefs: { theme:'light', motion:'on', onboarded:false, campusId:null, yearGroupId:null,
             audienceId:null, categoryIds:[], subscriptions:[] },
    ui: { view:'month', cursor:null, ayId:null, loading:false, error:null,
          filters:{campusIds:[],yearGroupIds:[],categoryIds:[],audienceIds:[],statuses:[],q:''} },
    // Window of events currently held in memory. The client renders from this
    // cache; it is refilled when the user navigates outside it.
    window: { from:null, to:null }
  },
  listeners: new Set(),
  _undo: null,

  /* ------------------------------------------------------------- boot */
  async init(){
    this.state.ui.cursor = T.todayKey();
    this.loadLocalPrefs();
    applyTheme(this.state.prefs.theme);
    applyMotion(this.state.prefs.motion);

    const [session, taxonomy] = await Promise.all([
      Api.get('/api/v1/auth/session').catch(() => ({ data: { user: null } })),
      Api.get('/api/v1/taxonomy')
    ]);
    this.applyTaxonomy(taxonomy.data);
    this.applySession(session.data);

    const ay = ACADEMIC_YEARS.find(a => a.status === 'active');
    this.state.ui.ayId = ay ? ay.id : (ACADEMIC_YEARS[0] || {}).id;

    await this.loadWindow(T.addDays(T.todayKey(), -200), T.addDays(T.todayKey(), 400));
    if (this.can('accessCms')) await this.loadAdminExtras();
  },

  applyTaxonomy(t){
    fill(CAMPUSES, t.campuses, c => ({ id:c.id, name:c.name, short:c.short, slug:c.slug,
      blurb:c.blurb, colour:c.colour, order:c.sort_order, archived:!!c.archived }));
    fill(YEAR_GROUPS, t.yearGroups, y => ({ id:y.id, name:y.name, slug:y.slug,
      campusId:y.campus_id, order:y.sort_order, archived:!!y.archived }));
    fill(CATEGORIES, t.categories, c => ({ id:c.id, name:c.name, slug:c.slug,
      colourVar:c.colour_var, order:c.sort_order, archived:!!c.archived }));
    fill(AUDIENCES, t.audiences, a => ({ id:a.id, name:a.name, slug:a.slug }));
    fill(LOCATIONS, t.locations, l => ({ id:l.id, name:l.name, slug:l.slug,
      campusId:l.campus_id, capacity:l.capacity, archived:!!l.archived }));
    fill(ACADEMIC_YEARS, t.academicYears, a => ({ id:a.id, name:a.name,
      start:a.start_date, end:a.end_date, status:a.status }));
    fill(TERMS, t.terms, x => ({ id:x.id, ayId:x.academic_year_id, name:x.name,
      start:x.start_date, end:x.end_date, order:x.sort_order, status:x.status }));
  },

  applySession(d){
    if (d && d.user) {
      this.state.session = { signedIn:true, user:d.user };
      this.state.currentUserId = d.user.id;
      if (d.preferences) {
        Object.assign(this.state.prefs, {
          campusId: d.preferences.campusId, yearGroupId: d.preferences.yearGroupId,
          audienceId: d.preferences.audienceId, categoryIds: d.preferences.categoryIds || [],
          onboarded: !!d.preferences.onboarded
        });
        if (d.preferences.theme) { this.state.prefs.theme = d.preferences.theme; applyTheme(d.preferences.theme); }
        if (d.preferences.motion) { this.state.prefs.motion = d.preferences.motion; applyMotion(d.preferences.motion); }
      }
      if (!USERS.length) this.loadUsers();
    } else {
      this.state.session = { signedIn:false, user:null };
      this.state.currentUserId = null;
    }
  },

  async loadUsers(){
    if (!this.can('accessCms')) return;
    try {
      const r = await Api.get('/api/v1/admin/users');
      fill(USERS, r.data, u => ({ id:u.id, name:u.name, email:u.email, initials:u.initials,
        role:u.role, campusId:u.campus_id, active:!!u.active }));
    } catch { /* not permitted — the UI degrades to ids */ }
  },

  /** Pull a date window into the local cache; every view reads from here. */
  async loadWindow(from, to, force){
    const w = this.state.window;
    if (!force && w.from && w.to && from >= w.from && to <= w.to) return;
    const nf = w.from && w.from < from ? w.from : from;
    const nt = w.to && w.to > to ? w.to : to;
    this.state.ui.loading = true; this.emit();
    try {
      const path = this.can('accessCms')
        ? `/api/v1/admin/events?from=${nf}&to=${nt}&limit=500`
        : (this.state.session.signedIn
            ? `/api/v1/events?from=${nf}&to=${nt}&limit=500`
            : `/api/v1/events?from=${nf}&to=${nt}&limit=500`);
      const r = await Api.get(path);
      this.state.events = (r.data || []).map(normaliseEvent);
      this.state.window = { from:nf, to:nt };
      this.state.ui.error = null;
    } catch (err) {
      this.state.ui.error = err.message;
    } finally {
      this.state.ui.loading = false; this.emit();
    }
  },

  async loadAdminExtras(){
    try {
      const [subs, audit] = await Promise.all([
        Api.get('/api/v1/admin/submissions?status=all').catch(() => ({ data: [] })),
        this.can('viewAudit') ? Api.get('/api/v1/admin/audit?limit=120').catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);
      this.state.submissions = (subs.data || []).map(s => ({
        id:s.id, title:s.title, description:s.description, date:s.date, endDate:s.endDate,
        start:s.start, end:s.end, allDay:s.allDay, campusId:s.campusId, categoryId:s.categoryId,
        locationId:s.locationId, yearGroupIds:s.yearGroupIds||[], audienceIds:s.audienceIds||[],
        status:s.status, notes:s.reviewerNote, submittedBy:s.submittedBy,
        submittedAt:(s.createdAt||'').slice(0,10), conflicts:s.conflicts||[]
      }));
      this.state.auditLog = (audit.data || []).map(a => ({
        id:a.id, action:a.action, entityId:a.entity_id, title:a.title,
        userId:a.user_id, userName:a.user_name, at:a.created_at, date:(a.created_at||'').slice(0,10)
      }));
    } catch { /* non-fatal */ }
  },

  async refresh(){
    const w = this.state.window;
    await this.loadWindow(w.from || T.addDays(T.todayKey(),-200), w.to || T.addDays(T.todayKey(),400), true);
    if (this.can('accessCms')) await this.loadAdminExtras();
  },

  /* ------------------------------------------------------- local prefs */
  loadLocalPrefs(){
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) Object.assign(this.state.prefs, JSON.parse(raw));
    } catch {}
  },
  persist(){
    try { localStorage.setItem(PREF_KEY, JSON.stringify(this.state.prefs)); } catch {}
  },

  /* ------------------------------------------------------------ events */
  subscribe(fn){ this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit(){ this.listeners.forEach(fn => fn(this.state)); },
  set(patch){ Object.assign(this.state, patch); this.emit(); },
  setUI(patch){ Object.assign(this.state.ui, patch); this.emit(); this.ensureWindow(); },
  setFilters(patch){ Object.assign(this.state.ui.filters, patch); this.emit(); },

  setPrefs(patch){
    Object.assign(this.state.prefs, patch);
    this.persist();
    // Signed-in users get their preferences stored on the account (§16).
    if (this.state.session.signedIn) {
      Api.put('/api/v1/me/preferences', {
        campusId:this.state.prefs.campusId, yearGroupId:this.state.prefs.yearGroupId,
        audienceId:this.state.prefs.audienceId, categoryIds:this.state.prefs.categoryIds,
        theme:this.state.prefs.theme, motion:this.state.prefs.motion,
        onboarded:this.state.prefs.onboarded
      }).catch(() => {});
    }
    this.emit();
  },

  /** Widen the cache when the user navigates past its edge. */
  ensureWindow(){
    const c = this.state.ui.cursor; if (!c) return;
    const need = { from: T.addDays(c, -120), to: T.addDays(c, 200) };
    const w = this.state.window;
    if (!w.from || need.from < w.from || need.to > w.to) {
      this.loadWindow(need.from, need.to);
    }
  },

  /* -------------------------------------------------------- identity */
  GUEST: { id:null, name:'Guest', role:'public', campusId:null, initials:'G' },
  user(){ return this.state.session.signedIn ? this.state.session.user : this.GUEST; },
  role(){ return ROLES[this.user().role] || ROLES.public; },
  can(action){
    const u = this.user();
    if (u.permissions) return u.permissions.includes(action);
    return action === 'view';
  },
  scopedCampus(){ const u = this.user(); return u.role === 'campusadmin' ? u.campusId : null; },

  async signIn(email, password){
    const r = await Api.post('/api/v1/auth/sign-in', { email, password });
    this.applySession(r.data);
    await this.loadUsers();
    await this.refresh();
    this.emit();
    return r.data.user;
  },
  async signOut(){
    await Api.post('/api/v1/auth/sign-out').catch(() => {});
    this.applySession(null);
    this.state.submissions = []; this.state.auditLog = [];
    await this.refresh();
    this.emit();
  },

  /* -------------------------------------------------------- mutations */
  async addEvent(ev, opts = {}){
    const payload = toPayload(ev);
    if (opts.acknowledgeConflict) payload.acknowledgeConflict = true;
    const r = await Api.post('/api/v1/admin/events', payload);
    const created = normaliseEvent(r.data);
    this.state.events.push(created);
    this._undo = { label:`Created “${created.title}”`, fn: async () => {
      await Api.del(`/api/v1/admin/events/${created.id}`);
      this.state.events = this.state.events.filter(e => e.id !== created.id);
      this.emit();
    }};
    this.emit();
    return created;
  },

  async updateEvent(id, patch, action){
    const before = this.state.events.find(e => e.id === id);
    const r = await Api.patch(`/api/v1/admin/events/${id}`, toPayload(patch, true));
    const updated = normaliseEvent(r.data);
    const i = this.state.events.findIndex(e => e.id === id);
    if (i > -1) this.state.events[i] = updated; else this.state.events.push(updated);
    if (before) {
      const revert = {};
      Object.keys(patch).forEach(k => { if (k in before) revert[k] = before[k]; });
      this._undo = { label:`Updated “${before.title}”`, fn: async () => {
        const back = await Api.patch(`/api/v1/admin/events/${id}`, toPayload(revert, true));
        const j = this.state.events.findIndex(e => e.id === id);
        if (j > -1) this.state.events[j] = normaliseEvent(back.data);
        this.emit();
      }};
    }
    this.emit();
    return updated;
  },

  async deleteEvent(id){
    const before = this.state.events.find(e => e.id === id);
    await Api.del(`/api/v1/admin/events/${id}`);
    this.state.events = this.state.events.filter(e => e.id !== id);
    this._undo = { label:`Archived “${before ? before.title : 'event'}”`, fn: async () => {
      const r = await Api.post(`/api/v1/admin/events/${id}/restore`);
      this.state.events.push(normaliseEvent(r.data));
      this.emit();
    }};
    this.emit();
  },

  async bulk(ids, operation, value, label){
    const r = await Api.post('/api/v1/admin/events/bulk', { ids, operation, value });
    await this.refresh();
    // Undo for a bulk action is the inverse operation where one exists.
    const inverse = { publish:'unpublish', important:'unimportant', unimportant:'important',
      move: operation === 'move' ? 'move' : null }[operation];
    if (inverse) {
      const invValue = operation === 'move' ? -Number(value) : value;
      this._undo = { label: `${label || operation} (${r.data.updated.length} events)`, fn: async () => {
        await Api.post('/api/v1/admin/events/bulk', { ids: r.data.updated, operation: inverse, value: invValue });
        await this.refresh();
      }};
    } else { this._undo = null; }
    this.emit();
    return r.data;
  },

  undo(){
    if (!this._undo) return null;
    const u = this._undo; this._undo = null;
    Promise.resolve(u.fn()).catch(err => toast('Could not undo: ' + err.message, { type:'danger' }));
    return u.label;
  },

  audit(){ /* the server writes the audit trail; nothing to do client-side */ },

  async reset(){
    try { localStorage.removeItem(PREF_KEY); } catch {}
    location.reload();
  }
};
PBIS.Store = Store;

/* Map an API event onto the shape every view already understands. */
function normaliseEvent(e){
  if (!e) return e;
  return {
    id: e.id, slug: e.slug, title: e.title, description: e.description || '',
    date: e.date || (e.start || '').slice(0,10),
    endDate: e.endDate || null,
    start: e.start && e.start.includes('T') ? e.start.slice(11,16) : (e.start || null),
    end: e.end && e.end.includes('T') ? e.end.slice(11,16) : (e.end || null),
    allDay: !!e.allDay,
    campusId: e.campusId !== undefined ? e.campusId : (e.campus ? e.campus.id : null),
    categoryId: e.categoryId !== undefined ? e.categoryId : (e.category ? e.category.id : 'other'),
    locationId: e.locationId !== undefined ? e.locationId : (e.location ? e.location.id : null),
    organizerId: e.organizerId || null,
    yearGroupIds: e.yearGroupIds || (e.yearGroups || []).map(y => y.id),
    audienceIds: e.audienceIds || e.audiences || [],
    visibility: e.visibility, status: e.status,
    important: !!e.important, notify: !!e.notify,
    recurrence: e.recurrence || null,
    attachments: e.attachments || [], links: e.links || [],
    academicYearId: e.academicYearId || null,
    createdAt: e.createdAt, updatedAt: e.updatedAt, publishedAt: e.publishedAt,
    createdBy: e.createdBy, updatedBy: e.updatedBy, source: e.source
  };
}
PBIS.normaliseEvent = normaliseEvent;

function toPayload(ev, partial){
  const p = {};
  const copy = ['title','description','date','endDate','start','end','allDay','campusId','categoryId',
    'locationId','organizerId','yearGroupIds','audienceIds','visibility','status','important',
    'notify','recurrence','links','changeNote'];
  for (const k of copy) if (ev[k] !== undefined) p[k] = ev[k] === '' && k !== 'title' && k !== 'description' ? null : ev[k];
  if (!partial) {
    if (p.categoryId === undefined || p.categoryId === null) p.categoryId = 'other';
    if (!p.audienceIds || !p.audienceIds.length) p.audienceIds = ['community'];
    if (!p.status) p.status = 'draft';
    if (!p.visibility) p.visibility = 'public';
  }
  return p;
}
PBIS.toPayload = toPayload;

function applyTheme(theme){ document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light'); }
function applyMotion(m){ document.documentElement.setAttribute('data-motion', m === 'off' ? 'off' : 'on'); }
PBIS.applyTheme = applyTheme; PBIS.applyMotion = applyMotion;
