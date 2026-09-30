"use strict";

/* ==========================================================================
   PBIS CENTRAL CALENDAR — CORE
   Layer 1: time (Asia/Vientiane canonical), Layer 2: data model, Layer 3: store
   All event times are stored as SCHOOL WALL TIME (Asia/Vientiane, UTC+7, no DST).
   Conversion to UTC happens only at the integration boundary (ICS / Google).
   ========================================================================== */

const PBIS = {};
window.PBIS = PBIS;

/* -------------------------------------------------------------- SITE ----
   Production addressing. The public calendar and the CMS are two separate
   surfaces on the same host — the CMS is never nested inside the public site.
   ------------------------------------------------------------------------ */
const SITE = {
  domain:      'calendar.pbis.edu.la',
  origin:      'https://calendar.pbis.edu.la',
  adminPath:   '/admin',
  adminDomain: 'calendar.pbis.edu.la/admin',
  feedBase:    'webcal://calendar.pbis.edu.la/feeds/',
  apiBase:     'https://calendar.pbis.edu.la/api'
};
PBIS.SITE = SITE;
/** Public URL for a route, as it will read once the domain is live. */
function publicUrl(hashPath){ return SITE.origin + (hashPath==='/' ? '' : hashPath); }
/** Address of this prototype file, for links that must work offline too. */
function localUrl(hash){ return location.origin + location.pathname + '#' + hash; }
PBIS.publicUrl = publicUrl; PBIS.localUrl = localUrl;

/* ---------------------------------------------------------------- TIME --- */
const TZ = 'Asia/Vientiane';
const TZ_OFFSET_MIN = 420; // UTC+07:00, no daylight saving

const T = {
  /** Today's date-key in school time, regardless of the viewer's device tz. */
  todayKey(){
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    return parts; // YYYY-MM-DD
  },
  /** Current minutes-since-midnight in school time. */
  nowMinutes(){
    const f = new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
    const [h,m] = f.split(':').map(Number);
    return h*60+m;
  },
  nowClock(){
    return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
  },
  /** Parse YYYY-MM-DD into a UTC-anchored Date used purely for calendar maths. */
  parse(key){ const [y,m,d]=key.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); },
  key(dt){ return dt.toISOString().slice(0,10); },
  addDays(key,n){ const d=T.parse(key); d.setUTCDate(d.getUTCDate()+n); return T.key(d); },
  addMonths(key,n){ const d=T.parse(key); const day=d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+n);
    const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); d.setUTCDate(Math.min(day,last)); return T.key(d); },
  dow(key){ return T.parse(key).getUTCDay(); }, // 0 Sun .. 6 Sat
  isWeekend(key){ const d=T.dow(key); return d===0||d===6; },
  startOfWeek(key){ const d=T.dow(key); return T.addDays(key, d===0?-6:1-d); }, // Monday start
  startOfMonth(key){ return key.slice(0,8)+'01'; },
  endOfMonth(key){ const d=T.parse(key); return T.key(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0))); },
  daysInMonth(key){ return Number(T.endOfMonth(key).slice(8)); },
  diffDays(a,b){ return Math.round((T.parse(b)-T.parse(a))/86400000); },
  cmp(a,b){ return a<b?-1:a>b?1:0; },
  range(a,b){ const out=[]; let c=a; let guard=0; while(c<=b && guard++<1200){ out.push(c); c=T.addDays(c,1);} return out; },

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
  /** 24h "HH:MM" -> display */
  fmtTime(hm){ if(!hm) return ''; return hm; },
  toMin(hm){ if(!hm) return 0; const [h,m]=hm.split(':').map(Number); return h*60+m; },
  fromMin(mins){ const h=Math.floor(mins/60), m=mins%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; },
  dur(a,b){ const d=T.toMin(b)-T.toMin(a); if(d<=0) return ''; const h=Math.floor(d/60),m=d%60; return h?`${h}h${m?' '+m+'m':''}`:`${m}m`; },
  relative(key){
    const t=T.todayKey(); const n=T.diffDays(t,key);
    if(n===0) return 'Today'; if(n===1) return 'Tomorrow'; if(n===-1) return 'Yesterday';
    if(n>1&&n<7) return `In ${n} days`; if(n<-1&&n>-7) return `${-n} days ago`;
    if(n>=7&&n<14) return 'Next week'; if(n>=14&&n<32) return `In ${Math.round(n/7)} weeks`;
    return T.fmtShort(key);
  },
  /** School wall time -> UTC stamp for ICS. */
  toUTCStamp(dateKey, hm){
    const [y,mo,d]=dateKey.split('-').map(Number);
    const [h,mi]=(hm||'00:00').split(':').map(Number);
    const ms = Date.UTC(y,mo-1,d,h,mi) - TZ_OFFSET_MIN*60000;
    const dt = new Date(ms);
    const p=n=>String(n).padStart(2,'0');
    return `${dt.getUTCFullYear()}${p(dt.getUTCMonth()+1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00Z`;
  },
  toDateStamp(dateKey){ return dateKey.replace(/-/g,''); }
};
PBIS.T = T;

/* ------------------------------------------------------------ TAXONOMY --- */
const CAMPUSES = [
  {id:'ey', name:'Early Years',  short:'EY',  slug:'early-years', order:1, colour:'#3D8062', archived:false,
   blurb:'Nursery and Reception. Play-led learning in a nurturing, purpose-built setting.'},
  {id:'pr', name:'Primary',      short:'PRI', slug:'primary',     order:2, colour:'#2F6690', archived:false,
   blurb:'Years 1 to 6. The British National Curriculum, adapted for an international community.'},
  {id:'se', name:'Secondary',    short:'SEC', slug:'secondary',   order:3, colour:'#7B5E9B', archived:false,
   blurb:'Years 7 to 13. IGCSE and A Level pathways to leading universities worldwide.'}
];

const YEAR_GROUPS = [
  {id:'nur', name:'Nursery',    campusId:'ey', order:1},
  {id:'rec', name:'Reception',  campusId:'ey', order:2},
  {id:'y1', name:'Year 1',  campusId:'pr', order:3},
  {id:'y2', name:'Year 2',  campusId:'pr', order:4},
  {id:'y3', name:'Year 3',  campusId:'pr', order:5},
  {id:'y4', name:'Year 4',  campusId:'pr', order:6},
  {id:'y5', name:'Year 5',  campusId:'pr', order:7},
  {id:'y6', name:'Year 6',  campusId:'pr', order:8},
  {id:'y7', name:'Year 7',  campusId:'se', order:9},
  {id:'y8', name:'Year 8',  campusId:'se', order:10},
  {id:'y9', name:'Year 9',  campusId:'se', order:11},
  {id:'y10',name:'Year 10', campusId:'se', order:12},
  {id:'y11',name:'Year 11', campusId:'se', order:13},
  {id:'y12',name:'Year 12', campusId:'se', order:14},
  {id:'y13',name:'Year 13', campusId:'se', order:15}
];

const AUDIENCES = [
  {id:'students', name:'Students'},
  {id:'parents',  name:'Parents'},
  {id:'teachers', name:'Teachers'},
  {id:'staff',    name:'Staff'},
  {id:'leadership',name:'Leadership'},
  {id:'community',name:'Whole School Community'}
];

const CATEGORIES = [
  {id:'academic',   name:'Academic',    colourVar:'--cat-academic',    order:1},
  {id:'assessment', name:'Assessment',  colourVar:'--cat-assessment',  order:2},
  {id:'exam',       name:'Examination', colourVar:'--cat-exam',        order:3},
  {id:'sports',     name:'Sports',      colourVar:'--cat-sports',      order:4},
  {id:'eca',        name:'ECA',         colourVar:'--cat-eca',         order:5},
  {id:'trip',       name:'Trip',        colourVar:'--cat-trip',        order:6},
  {id:'assembly',   name:'Assembly',    colourVar:'--cat-assembly',    order:7},
  {id:'parent',     name:'Parent Event',colourVar:'--cat-parent',      order:8},
  {id:'staff',      name:'Staff Event', colourVar:'--cat-staff',       order:9},
  {id:'meeting',    name:'Meeting',     colourVar:'--cat-meeting',     order:10},
  {id:'holiday',    name:'Holiday',     colourVar:'--cat-holiday',     order:11},
  {id:'deadline',   name:'Deadline',    colourVar:'--cat-deadline',    order:12},
  {id:'admissions', name:'Admissions',  colourVar:'--cat-admissions',  order:13},
  {id:'celebration',name:'Celebration', colourVar:'--cat-celebration', order:14},
  {id:'graduation', name:'Graduation',  colourVar:'--cat-graduation',  order:15},
  {id:'other',      name:'Other',       colourVar:'--cat-other',       order:16}
];

const LOCATIONS = [
  {id:'loc-eyhall', name:'Early Years Hall',    campusId:'ey', capacity:120},
  {id:'loc-eyplay', name:'EY Playground',       campusId:'ey', capacity:80},
  {id:'loc-prhall', name:'Primary Hall',        campusId:'pr', capacity:320},
  {id:'loc-prlib',  name:'Primary Library',     campusId:'pr', capacity:60},
  {id:'loc-sehall', name:'Secondary Hall',      campusId:'se', capacity:450},
  {id:'loc-selib',  name:'Secondary Library',   campusId:'se', capacity:90},
  {id:'loc-sci',    name:'Science Laboratory 1',campusId:'se', capacity:32},
  {id:'loc-art',    name:'Art Studio',          campusId:'se', capacity:30},
  {id:'loc-music',  name:'Music Room',          campusId:null, capacity:40},
  {id:'loc-field',  name:'Sports Field',        campusId:null, capacity:600},
  {id:'loc-gym',    name:'Sports Hall',         campusId:null, capacity:250},
  {id:'loc-pool',   name:'Swimming Pool',       campusId:null, capacity:80},
  {id:'loc-conf',   name:'Conference Room',     campusId:null, capacity:24},
  {id:'loc-adm',    name:'Admissions Office',   campusId:null, capacity:12},
  {id:'loc-audit',  name:'Main Auditorium',     campusId:null, capacity:700},
  {id:'loc-offsite',name:'Off-site',            campusId:null, capacity:null},
  {id:'loc-online', name:'Online',              campusId:null, capacity:null}
];

const ROLES = {
  super:      {id:'super',  name:'Super Admin',    rank:100, desc:'Full control across every campus and every setting.'},
  caladmin:   {id:'caladmin',name:'Calendar Admin',rank:80,  desc:'Manage the whole school calendar, approve submissions, run imports.'},
  campusadmin:{id:'campusadmin',name:'Campus Admin',rank:60, desc:'Manage events for an assigned campus only.'},
  teacher:    {id:'teacher',name:'Teacher',        rank:40,  desc:'View everything relevant and submit events for approval.'},
  parent:     {id:'parent', name:'Parent',         rank:20,  desc:'View events relevant to their children.'},
  student:    {id:'student',name:'Student',        rank:20,  desc:'View events relevant to their year group.'},
  public:     {id:'public', name:'Public Viewer',  rank:0,   desc:'View public events only.'}
};

const USERS = [
  {id:'u1', name:'Souphaphone Vongsa',  email:'s.vongsa@pbis.edu.la',    role:'super',      campusId:null, initials:'SV'},
  {id:'u2', name:'James Whitfield',     email:'j.whitfield@pbis.edu.la', role:'caladmin',   campusId:null, initials:'JW'},
  {id:'u3', name:'Anousone Keomany',    email:'a.keomany@pbis.edu.la',   role:'campusadmin',campusId:'pr', initials:'AK'},
  {id:'u4', name:'Claire Bennett',      email:'c.bennett@pbis.edu.la',   role:'campusadmin',campusId:'se', initials:'CB'},
  {id:'u5', name:'Malichanh Sisavath',  email:'m.sisavath@pbis.edu.la',  role:'campusadmin',campusId:'ey', initials:'MS'},
  {id:'u6', name:'Daniel Okonkwo',      email:'d.okonkwo@pbis.edu.la',   role:'teacher',    campusId:'se', initials:'DO'},
  {id:'u7', name:'Phetsamone Inthavong', email:'p.inthavong@pbis.edu.la',role:'teacher',    campusId:'pr', initials:'PI'},
  {id:'u8', name:'Sarah Lindqvist',     email:'s.lindqvist@pbis.edu.la', role:'teacher',    campusId:'ey', initials:'SL'}
];

/* ----------------------------------------------- ACADEMIC YEARS + TERMS --- */
const ACADEMIC_YEARS = [
  {id:'ay2526', name:'2025–2026', start:'2025-08-18', end:'2026-06-26', status:'archived'},
  {id:'ay2627', name:'2026–2027', start:'2026-08-17', end:'2027-06-25', status:'active'},
  {id:'ay2728', name:'2027–2028', start:'2027-08-16', end:'2028-06-23', status:'planning'}
];

const TERMS = [
  {id:'t2526-1', ayId:'ay2526', name:'Term 1', start:'2025-08-18', end:'2025-12-12', order:1},
  {id:'t2526-2', ayId:'ay2526', name:'Term 2', start:'2026-01-05', end:'2026-03-27', order:2},
  {id:'t2526-3', ayId:'ay2526', name:'Term 3', start:'2026-04-13', end:'2026-06-26', order:3},
  {id:'t2627-1', ayId:'ay2627', name:'Term 1', start:'2026-08-17', end:'2026-12-11', order:1},
  {id:'t2627-2', ayId:'ay2627', name:'Term 2', start:'2027-01-05', end:'2027-03-26', order:2},
  {id:'t2627-3', ayId:'ay2627', name:'Term 3', start:'2027-04-12', end:'2027-06-25', order:3},
  {id:'t2728-1', ayId:'ay2728', name:'Term 1', start:'2027-08-16', end:'2027-12-10', order:1},
  {id:'t2728-2', ayId:'ay2728', name:'Term 2', start:'2028-01-04', end:'2028-03-24', order:2},
  {id:'t2728-3', ayId:'ay2728', name:'Term 3', start:'2028-04-10', end:'2028-06-23', order:3}
];

/* ------------------------------------------------------------ HELPERS ---- */
const uid = (p='e') => p+'-'+Math.random().toString(36).slice(2,9);
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72);
const byId = (arr,id) => arr.find(x=>x.id===id);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

PBIS.CAMPUSES=CAMPUSES; PBIS.YEAR_GROUPS=YEAR_GROUPS; PBIS.AUDIENCES=AUDIENCES;
PBIS.CATEGORIES=CATEGORIES; PBIS.LOCATIONS=LOCATIONS; PBIS.ROLES=ROLES; PBIS.USERS=USERS;
PBIS.ACADEMIC_YEARS=ACADEMIC_YEARS; PBIS.TERMS=TERMS;
PBIS.uid=uid; PBIS.slugify=slugify; PBIS.byId=byId; PBIS.esc=esc;

