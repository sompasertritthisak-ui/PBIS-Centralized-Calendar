'use strict';
/* ==========================================================================
   Seed. Ports the canonical PBIS demonstration data into the database.
   Idempotent: running it twice does not duplicate anything.
   ========================================================================== */

const { db, migrate, now, id, slugify, tx } = require('../src/db');
const { hashPassword } = require('../src/auth');
const T = require('../src/lib/time');

const ts = now();
const ins = (table, cols, rows) => {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  for (const r of rows) stmt.run(...cols.map(c => r[c]));
};

function seed({ password = 'pbis-demo' } = {}) {
  migrate();
  return tx(() => {
    /* ------------------------------------------------------- campuses */
    ins('campuses', ['id','name','short','slug','blurb','colour','sort_order','archived','created_at','updated_at'], [
      { id:'ey', name:'Early Years', short:'EY', slug:'early-years', colour:'#3D8062', sort_order:1, archived:0,
        blurb:'Nursery and Reception. Play-led learning in a nurturing, purpose-built setting.', created_at:ts, updated_at:ts },
      { id:'pr', name:'Primary', short:'PRI', slug:'primary', colour:'#2F6690', sort_order:2, archived:0,
        blurb:'Years 1 to 6. The British National Curriculum, adapted for an international community.', created_at:ts, updated_at:ts },
      { id:'se', name:'Secondary', short:'SEC', slug:'secondary', colour:'#7B5E9B', sort_order:3, archived:0,
        blurb:'Years 7 to 13. IGCSE and A Level pathways to leading universities worldwide.', created_at:ts, updated_at:ts }
    ]);

    const YG = [['nur','Nursery','ey'],['rec','Reception','ey'],
      ['y1','Year 1','pr'],['y2','Year 2','pr'],['y3','Year 3','pr'],['y4','Year 4','pr'],['y5','Year 5','pr'],['y6','Year 6','pr'],
      ['y7','Year 7','se'],['y8','Year 8','se'],['y9','Year 9','se'],['y10','Year 10','se'],['y11','Year 11','se'],
      ['y12','Year 12','se'],['y13','Year 13','se']];
    ins('year_groups', ['id','name','slug','campus_id','sort_order','archived','created_at','updated_at'],
      YG.map(([i,n,c],x)=>({id:i,name:n,slug:slugify(n),campus_id:c,sort_order:x+1,archived:0,created_at:ts,updated_at:ts})));

    const CATS = [['academic','Academic','--cat-academic'],['assessment','Assessment','--cat-assessment'],
      ['exam','Examination','--cat-exam'],['sports','Sports','--cat-sports'],['eca','ECA','--cat-eca'],
      ['trip','Trip','--cat-trip'],['assembly','Assembly','--cat-assembly'],['parent','Parent Event','--cat-parent'],
      ['staff','Staff Event','--cat-staff'],['meeting','Meeting','--cat-meeting'],['holiday','Holiday','--cat-holiday'],
      ['deadline','Deadline','--cat-deadline'],['admissions','Admissions','--cat-admissions'],
      ['celebration','Celebration','--cat-celebration'],['graduation','Graduation','--cat-graduation'],['other','Other','--cat-other']];
    ins('event_categories', ['id','name','slug','colour_var','sort_order','archived','created_at','updated_at'],
      CATS.map(([i,n,v],x)=>({id:i,name:n,slug:slugify(n),colour_var:v,sort_order:x+1,archived:0,created_at:ts,updated_at:ts})));

    const AUDS = [['students','Students'],['parents','Parents'],['teachers','Teachers'],['staff','Staff'],
      ['leadership','Leadership'],['community','Whole School Community']];
    ins('audiences', ['id','name','slug','sort_order','created_at','updated_at'],
      AUDS.map(([i,n],x)=>({id:i,name:n,slug:slugify(n),sort_order:x+1,created_at:ts,updated_at:ts})));

    const LOCS = [['loc-eyhall','Early Years Hall','ey',120],['loc-eyplay','EY Playground','ey',80],
      ['loc-prhall','Primary Hall','pr',320],['loc-prlib','Primary Library','pr',60],
      ['loc-sehall','Secondary Hall','se',450],['loc-selib','Secondary Library','se',90],
      ['loc-sci','Science Laboratory 1','se',32],['loc-art','Art Studio','se',30],
      ['loc-music','Music Room',null,40],['loc-field','Sports Field',null,600],['loc-gym','Sports Hall',null,250],
      ['loc-pool','Swimming Pool',null,80],['loc-conf','Conference Room',null,24],['loc-adm','Admissions Office',null,12],
      ['loc-audit','Main Auditorium',null,700],['loc-offsite','Off-site',null,null],['loc-online','Online',null,null]];
    ins('locations', ['id','name','slug','campus_id','capacity','archived','created_at','updated_at'],
      LOCS.map(([i,n,c,cap])=>({id:i,name:n,slug:slugify(n),campus_id:c,capacity:cap,archived:0,created_at:ts,updated_at:ts})));

    /* -------------------------------------------------- academic years */
    ins('academic_years', ['id','name','start_date','end_date','status','created_at','updated_at'], [
      {id:'ay2526',name:'2025–2026',start_date:'2025-08-18',end_date:'2026-06-26',status:'archived',created_at:ts,updated_at:ts},
      {id:'ay2627',name:'2026–2027',start_date:'2026-08-17',end_date:'2027-06-25',status:'active',created_at:ts,updated_at:ts},
      {id:'ay2728',name:'2027–2028',start_date:'2027-08-16',end_date:'2028-06-23',status:'planning',created_at:ts,updated_at:ts}
    ]);
    const TERMS = [
      ['t2526-1','ay2526','Term 1','2025-08-18','2025-12-12',1],['t2526-2','ay2526','Term 2','2026-01-05','2026-03-27',2],
      ['t2526-3','ay2526','Term 3','2026-04-13','2026-06-26',3],
      ['t2627-1','ay2627','Term 1','2026-08-17','2026-12-11',1],['t2627-2','ay2627','Term 2','2027-01-05','2027-03-26',2],
      ['t2627-3','ay2627','Term 3','2027-04-12','2027-06-25',3],
      ['t2728-1','ay2728','Term 1','2027-08-16','2027-12-10',1],['t2728-2','ay2728','Term 2','2028-01-04','2028-03-24',2],
      ['t2728-3','ay2728','Term 3','2028-04-10','2028-06-23',3]];
    ins('terms', ['id','academic_year_id','name','start_date','end_date','status','sort_order','created_at','updated_at'],
      TERMS.map(([i,a,n,s,e,o])=>({id:i,academic_year_id:a,name:n,start_date:s,end_date:e,
        status: T.todayKey()>e?'complete':(T.todayKey()>=s?'active':'planned'), sort_order:o,created_at:ts,updated_at:ts})));

    /* ------------------------------------------------------------ users */
    const pw = hashPassword(password);
    const USERS = [
      ['u1','Souphaphone Vongsa','s.vongsa@pbis.edu.la','super',null,'SV'],
      ['u2','James Whitfield','j.whitfield@pbis.edu.la','caladmin',null,'JW'],
      ['u3','Anousone Keomany','a.keomany@pbis.edu.la','campusadmin','pr','AK'],
      ['u4','Claire Bennett','c.bennett@pbis.edu.la','campusadmin','se','CB'],
      ['u5','Malichanh Sisavath','m.sisavath@pbis.edu.la','campusadmin','ey','MS'],
      ['u6','Daniel Okonkwo','d.okonkwo@pbis.edu.la','teacher','se','DO'],
      ['u7','Phetsamone Inthavong','p.inthavong@pbis.edu.la','teacher','pr','PI'],
      ['u8','Sarah Lindqvist','s.lindqvist@pbis.edu.la','teacher','ey','SL'],
      ['u9','Nalinh Phommachanh','n.phommachanh@parent.pbis.edu.la','parent',null,'NP'],
      ['u10','Kevin Tran','k.tran@student.pbis.edu.la','student',null,'KT']
    ];
    ins('users', ['id','email','name','initials','role','campus_id','password_hash','active','created_at','updated_at'],
      USERS.map(([i,n,e,r,c,ini])=>({id:i,email:e,name:n,initials:ini,role:r,campus_id:c,
        password_hash:pw,active:1,created_at:ts,updated_at:ts})));

    /* ------------------------------------------------------- calendars */
    const CALS = [
      ['all','All PBIS Events','all',null],
      ['early-years','Early Years','campus','ey'],
      ['primary','Primary','campus','pr'],
      ['secondary','Secondary','campus','se'],
      ['important','Important Dates','important',null],
      ['holidays','Term Dates & Holidays','holidays',null],
      ['exams','Examinations','exams',null]
    ];
    ins('calendars', ['id','name','description','scope_type','scope_ref','public','created_at','updated_at'],
      CALS.map(([i,n,st,sr])=>({id:i,name:n,description:null,scope_type:st,scope_ref:sr,public:1,created_at:ts,updated_at:ts})));
    ins('calendars', ['id','name','description','scope_type','scope_ref','public','created_at','updated_at'],
      YG.map(([i,n])=>({id:'yg-'+i,name:n,description:null,scope_type:'yeargroup',scope_ref:i,public:1,created_at:ts,updated_at:ts})));

    /* ---------------------------------------------------------- events */
    if (db.prepare('SELECT count(*) c FROM events').get().c === 0) seedEvents();
    if (db.prepare('SELECT count(*) c FROM event_submissions').get().c === 0) seedSubmissions();
    if (db.prepare('SELECT count(*) c FROM settings').get().c === 0) seedSettings();

    return {
      campuses: db.prepare('SELECT count(*) c FROM campuses').get().c,
      users: db.prepare('SELECT count(*) c FROM users').get().c,
      events: db.prepare('SELECT count(*) c FROM events').get().c,
      submissions: db.prepare('SELECT count(*) c FROM event_submissions').get().c
    };
  });
}

/* ------------------------------------------------------------------------ */
function seedEvents() {
  const today = T.todayKey();
  const rel = n => T.addDays(today, n);
  let n = 0;

  const evStmt = db.prepare(`INSERT INTO events (
    id, slug, title, description, start_date, end_date, start_time, end_time, all_day, timezone,
    campus_id, category_id, location_id, organizer_id, academic_year_id,
    visibility, status, important, notify, recurrence, links, source,
    created_at, updated_at, published_at, created_by, updated_by
  ) VALUES (@id,@slug,@title,@description,@start_date,@end_date,@start_time,@end_time,@all_day,'Asia/Vientiane',
    @campus_id,@category_id,@location_id,@organizer_id,@academic_year_id,
    @visibility,@status,@important,0,@recurrence,'[]','manual',
    @created_at,@updated_at,@published_at,@created_by,@created_by)`);
  const ygStmt = db.prepare('INSERT OR IGNORE INTO event_year_groups (event_id, year_group_id) VALUES (?,?)');
  const auStmt = db.prepare('INSERT OR IGNORE INTO event_audiences (event_id, audience_id) VALUES (?,?)');
  const ayFor = d => {
    const r = db.prepare('SELECT id FROM academic_years WHERE ? BETWEEN start_date AND end_date').get(d);
    return r ? r.id : null;
  };

  const add = o => {
    n += 1;
    const eid = 'seed-' + n;
    const slug = slugify(`${o.title}-${o.date.slice(2, 7).replace('-', '')}`) + (n > 900 ? '-' + n : '');
    let finalSlug = slug, i = 1;
    while (db.prepare('SELECT 1 FROM events WHERE slug=?').get(finalSlug)) { i += 1; finalSlug = `${slug}-${i}`; }
    evStmt.run({
      id: eid, slug: finalSlug, title: o.title, description: o.description || '',
      start_date: o.date, end_date: o.endDate || null,
      start_time: o.allDay ? null : (o.start || null),
      end_time: o.allDay ? null : (o.end || null),
      all_day: o.allDay ? 1 : 0,
      campus_id: o.campusId || null, category_id: o.categoryId || 'other',
      location_id: o.locationId || null, organizer_id: o.organizerId || 'u2',
      academic_year_id: ayFor(o.date),
      visibility: o.visibility || 'public', status: o.status || 'published',
      important: o.important ? 1 : 0,
      recurrence: o.recurrence ? JSON.stringify(o.recurrence) : null,
      created_at: ts, updated_at: ts,
      published_at: (o.status || 'published') === 'published' ? ts : null,
      created_by: o.organizerId || 'u2'
    });
    (o.yearGroupIds || []).forEach(y => ygStmt.run(eid, y));
    (o.audienceIds || ['community']).forEach(a => auStmt.run(eid, a));
  };

  /* --- around today --- */
  add({title:'Teacher Training Day — Safeguarding & Child Protection', date:rel(0), start:'08:30', end:'12:00',
    categoryId:'staff', audienceIds:['teachers','staff'], locationId:'loc-audit', organizerId:'u1', important:true,
    description:'Whole-staff INSET on the updated safeguarding policy, reporting routes and the new pastoral referral system. Attendance is compulsory for all teaching and support staff. School is closed to students.'});
  add({title:'Admissions Office Open — New Family Enrolment', date:rel(0), start:'08:30', end:'16:00',
    categoryId:'admissions', audienceIds:['parents'], locationId:'loc-adm', organizerId:'u2',
    description:'The admissions team is available for enrolment paperwork, fee queries and campus tours ahead of the new term. No appointment necessary.'});
  add({title:'Library Open for Textbook Collection', date:rel(0), start:'09:00', end:'15:00',
    categoryId:'academic', audienceIds:['students','parents'], locationId:'loc-selib', organizerId:'u4',
    description:'Students in Years 7 to 13 may collect their textbook sets and reading lists before term begins. Please bring a bag.'});
  add({title:'New Staff Orientation & Campus Tour', date:rel(0), start:'13:00', end:'15:30',
    categoryId:'staff', audienceIds:['teachers','staff'], locationId:'loc-conf', organizerId:'u2', visibility:'internal',
    description:'Induction for teachers joining PBIS this academic year. Systems, timetabling, house structure and a walking tour of all three campuses.'});
  add({title:'Secondary Department Heads Meeting', date:rel(0), start:'15:45', end:'17:00',
    campusId:'se', categoryId:'meeting', audienceIds:['teachers','leadership'], locationId:'loc-selib',
    organizerId:'u4', visibility:'internal',
    description:'Term 1 curriculum planning, IGCSE entry deadlines and the assessment calendar.'});
  add({title:'Classroom Setup — Early Years', date:rel(1), start:'08:00', end:'16:00',
    campusId:'ey', categoryId:'staff', audienceIds:['teachers'], locationId:'loc-eyhall', organizerId:'u5',
    visibility:'internal', description:'Preparation day for Nursery and Reception learning environments ahead of the first day of term.'});
  add({title:'Uniform Shop Open for New Families', date:rel(1), start:'09:00', end:'15:00',
    categoryId:'admissions', audienceIds:['parents'], locationId:'loc-prhall', organizerId:'u2',
    description:'The uniform shop is open for fittings and collection. Card and cash accepted. No appointment required.'});

  /* --- Term 1 opening --- */
  add({title:'First Day of Term 1 — All Campuses', date:'2026-08-17', allDay:true, categoryId:'academic',
    organizerId:'u1', important:true,
    description:'Term 1 begins for Early Years, Primary and Secondary. Normal school hours: 07:45 registration, 15:00 dismissal. Buses run to the standard timetable.'});
  add({title:'Welcome Assembly — Primary', date:'2026-08-17', start:'08:00', end:'09:00', campusId:'pr',
    categoryId:'assembly', audienceIds:['students','teachers'], locationId:'loc-prhall', organizerId:'u3',
    yearGroupIds:['y1','y2','y3','y4','y5','y6'],
    description:'Head of Primary welcomes students back and introduces the year theme, house captains and the Term 1 calendar.'});
  add({title:'Welcome Assembly — Secondary', date:'2026-08-17', start:'09:15', end:'10:15', campusId:'se',
    categoryId:'assembly', audienceIds:['students','teachers'], locationId:'loc-sehall', organizerId:'u4',
    yearGroupIds:['y7','y8','y9','y10','y11','y12','y13'],
    description:'Start-of-year assembly for all Secondary students. Expectations, house competition and the Year 13 university programme.'});
  add({title:'Nursery & Reception Settling-In Sessions', date:'2026-08-17', endDate:'2026-08-21', allDay:true,
    campusId:'ey', yearGroupIds:['nur','rec'], categoryId:'academic', audienceIds:['parents','students'], organizerId:'u5',
    description:'Staggered start for our youngest learners. Parents will receive an individual session time from the class teacher. Shorter days for the first week.'});
  add({title:'Meet the Teacher — Early Years', date:'2026-08-20', start:'15:30', end:'17:00', campusId:'ey',
    yearGroupIds:['nur','rec'], categoryId:'parent', audienceIds:['parents'], locationId:'loc-eyhall', organizerId:'u5',
    description:"An informal opportunity to meet your child's class teacher and teaching assistant, see the classroom and ask questions about the year ahead."});
  add({title:'Meet the Teacher — Primary', date:'2026-08-21', start:'15:30', end:'17:30', campusId:'pr',
    yearGroupIds:['y1','y2','y3','y4','y5','y6'], categoryId:'parent', audienceIds:['parents'],
    locationId:'loc-prhall', organizerId:'u3',
    description:"Year-group presentations followed by classroom visits. Curriculum overview, homework expectations, and how to contact your child's teacher."});
  add({title:'Secondary Curriculum Evening', date:'2026-08-27', start:'17:30', end:'19:30', campusId:'se',
    yearGroupIds:['y7','y8','y9','y10','y11'], categoryId:'parent', audienceIds:['parents'],
    locationId:'loc-sehall', organizerId:'u4', important:true,
    description:'Subject leaders present the Key Stage 3 and IGCSE programmes. Includes guidance on option choices, coursework deadlines and assessment.'});

  /* --- sport and ECA --- */
  add({title:'ECA Programme Begins — Term 1', date:'2026-08-24', allDay:true, categoryId:'eca',
    audienceIds:['students','parents'], organizerId:'u2',
    description:'The Term 1 Extra-Curricular Activities programme starts. Sign-up closes Friday 21 August via the parent portal.'});
  add({title:'Primary Swimming Gala', date:'2026-09-11', start:'08:30', end:'12:30', campusId:'pr',
    yearGroupIds:['y3','y4','y5','y6'], categoryId:'sports', audienceIds:['students','parents'],
    locationId:'loc-pool', organizerId:'u3',
    description:'House swimming gala for Years 3 to 6. Parents welcome from 08:15. Please send swimwear, towel and house-colour t-shirt.'});
  add({title:'Secondary Football — PBIS vs Vientiane International', date:'2026-09-18', start:'15:30', end:'17:30',
    campusId:'se', yearGroupIds:['y9','y10','y11'], categoryId:'sports', audienceIds:['students','parents'],
    locationId:'loc-field', organizerId:'u6',
    description:'Senior boys and girls fixtures. Spectators welcome. Late bus available at 18:00.'});
  add({title:'Whole School Sports Day', date:'2026-10-02', allDay:true, important:true, categoryId:'sports',
    locationId:'loc-field', organizerId:'u1',
    description:'The highlight of the Term 1 calendar. All three campuses compete across track and field in house teams. Parents are warmly invited; refreshments available all day.'});
  add({title:'Early Years Mini Sports Morning', date:'2026-10-01', start:'09:00', end:'11:00', campusId:'ey',
    yearGroupIds:['nur','rec'], categoryId:'sports', audienceIds:['parents','students'],
    locationId:'loc-eyplay', organizerId:'u5',
    description:'A gentle, fun morning of movement games for our youngest children. Parents encouraged to join in.'});

  /* --- assessment --- */
  add({title:'Year 11 Mock Examinations', date:'2026-11-09', endDate:'2026-11-20', allDay:true, important:true,
    campusId:'se', yearGroupIds:['y11'], categoryId:'exam', audienceIds:['students','parents','teachers'],
    locationId:'loc-sehall', organizerId:'u4',
    description:'Full mock IGCSE examination series under formal conditions. Timetables issued four weeks in advance. Study leave does not apply — students attend as normal.'});
  add({title:'Year 13 Mock Examinations', date:'2026-11-09', endDate:'2026-11-20', allDay:true, important:true,
    campusId:'se', yearGroupIds:['y13'], categoryId:'exam', audienceIds:['students','parents','teachers'],
    locationId:'loc-selib', organizerId:'u4',
    description:'A Level mock series. Results feed directly into predicted grades for university applications.'});
  add({title:'Primary Assessment Week', date:'2026-11-16', endDate:'2026-11-20', allDay:true, campusId:'pr',
    yearGroupIds:['y1','y2','y3','y4','y5','y6'], categoryId:'assessment', audienceIds:['students','teachers'],
    organizerId:'u3',
    description:'Standardised reading, writing and mathematics assessments. No revision required — these are low-stakes checks on progress.'});
  add({title:'IGCSE Coursework Deadline — Art & Design', date:'2026-12-04', allDay:true, campusId:'se',
    yearGroupIds:['y10','y11'], categoryId:'deadline', audienceIds:['students','parents'],
    locationId:'loc-art', organizerId:'u6', important:true,
    description:'Final submission of the personal portfolio. No extensions are possible after this date — this is an examination board deadline.'});

  /* --- parents --- */
  add({title:'Year 6 Parent Evening', date:'2026-09-24', start:'15:30', end:'19:00', campusId:'pr',
    yearGroupIds:['y6'], categoryId:'parent', audienceIds:['parents'], locationId:'loc-prhall',
    organizerId:'u3', important:true,
    description:"Ten-minute appointments with your child's class teacher, plus a short presentation on the transition to Secondary. Booking opens two weeks beforehand."});
  add({title:'Year 5 Parent Evening', date:'2026-09-25', start:'15:30', end:'19:00', campusId:'pr',
    yearGroupIds:['y5'], categoryId:'parent', audienceIds:['parents'], locationId:'loc-prhall', organizerId:'u3',
    description:"Individual appointments to discuss your child's settling in, targets for the year and how to support learning at home."});
  add({title:'Secondary Parent Evening — Years 7 to 9', date:'2026-10-15', start:'15:30', end:'19:30', campusId:'se',
    yearGroupIds:['y7','y8','y9'], categoryId:'parent', audienceIds:['parents'], locationId:'loc-sehall', organizerId:'u4',
    description:'Subject-by-subject appointments. Please book online; walk-ins cannot be accommodated.'});
  add({title:'Parent Coffee Morning — Supporting Reading at Home', date:'2026-09-04', start:'08:15', end:'09:30',
    campusId:'pr', categoryId:'parent', audienceIds:['parents'], locationId:'loc-prlib', organizerId:'u7',
    description:'An informal session with the Primary literacy lead. Practical strategies for reading with your child, whatever their level of English.'});
  add({title:'Friends of PBIS — Annual General Meeting', date:'2026-09-08', start:'08:15', end:'09:30',
    categoryId:'meeting', audienceIds:['parents'], locationId:'loc-conf', organizerId:'u2',
    description:"Committee elections, the year's fundraising plan and volunteer sign-up for the International Food Fair."});

  /* --- trips --- */
  add({title:'Year 6 Residential — Vang Vieng', date:'2026-10-21', endDate:'2026-10-23', allDay:true, important:true,
    campusId:'pr', yearGroupIds:['y6'], categoryId:'trip', audienceIds:['students','parents'], locationId:'loc-offsite',
    organizerId:'u7',
    description:'Three-day outdoor education residential. Kayaking, caving, team challenges and an evening campfire. Full risk assessment and two qualified first-aiders travel with the group.'});
  add({title:'Year 9 Geography Field Trip — Mekong Riverbank Study', date:'2026-11-05', start:'07:30', end:'16:30',
    campusId:'se', yearGroupIds:['y9'], categoryId:'trip', audienceIds:['students','parents'],
    locationId:'loc-offsite', organizerId:'u6',
    description:'River channel measurement and land-use survey supporting the IGCSE Geography coursework unit. Packed lunch required.'});
  add({title:'Reception Farm Visit', date:'2026-09-17', start:'08:30', end:'14:00', campusId:'ey',
    yearGroupIds:['rec'], categoryId:'trip', audienceIds:['students','parents'], locationId:'loc-offsite', organizerId:'u8',
    description:'A first school trip for Reception, linked to the "Growing" topic. Please return the consent form by 10 September.'});

  /* --- celebration --- */
  add({title:'PBIS International Food Fair', date:'2026-11-28', start:'10:00', end:'15:00', important:true,
    categoryId:'celebration', locationId:'loc-field', organizerId:'u2',
    description:'Our largest community event of the year. Families share food from home countries, with performances, games and a raffle in aid of the school scholarship fund.'});
  add({title:'Early Years Nativity', date:'2026-12-09', start:'09:30', end:'10:30', campusId:'ey',
    yearGroupIds:['nur','rec'], categoryId:'celebration', audienceIds:['parents'], locationId:'loc-eyhall', organizerId:'u5',
    description:'Our Nursery and Reception children perform for families. Doors open 09:15. Two tickets per family; additional tickets subject to space.'});
  add({title:'Winter Concert — Primary & Secondary', date:'2026-12-10', start:'17:30', end:'19:30',
    categoryId:'celebration', locationId:'loc-audit', organizerId:'u2',
    description:'Choir, orchestra, ensembles and soloists from across the school. Free entry; retiring collection for the music bursary.'});
  add({title:'PBIS 25th Anniversary Legacy Night', date:'2026-11-14', start:'18:00', end:'21:30', important:true,
    categoryId:'celebration', locationId:'loc-audit', organizerId:'u1',
    description:'Celebrating twenty-five years of Panyathip British International School. Alumni, founding staff and current families come together for an evening of reflection, performance and community.'});
  add({title:'Lao National Day Assembly', date:'2026-12-01', start:'08:00', end:'09:00',
    categoryId:'assembly', audienceIds:['students','teachers'], locationId:'loc-audit', organizerId:'u1',
    description:'A whole-school assembly marking Lao National Day, led by our Lao Studies department and student council.'});

  /* --- admissions --- */
  add({title:'Open Day — All Campuses', date:'2026-09-26', start:'09:00', end:'12:00', important:true,
    categoryId:'admissions', locationId:'loc-audit', organizerId:'u2',
    description:'Prospective families are invited to tour all three campuses, meet teachers and current students, and speak with the admissions team. No booking required.'});
  add({title:'Admissions Deadline — January Intake', date:'2026-11-30', allDay:true, categoryId:'deadline',
    audienceIds:['parents'], organizerId:'u2', important:true,
    description:'Final date for complete applications for entry in January 2027. Applications received after this date will be considered for August 2027.'});
  add({title:'Entrance Assessments — January Intake', date:'2026-12-05', start:'08:30', end:'12:00',
    categoryId:'admissions', audienceIds:['parents'], locationId:'loc-selib', organizerId:'u2',
    description:'English and mathematics assessments for applicants to Years 3 to 11, plus an informal interview with a member of the senior team.'});

  /* --- holidays --- */
  add({title:'October Half Term', date:'2026-10-12', endDate:'2026-10-16', allDay:true, categoryId:'holiday', organizerId:'u1',
    description:'School closed for the Term 1 half-term break. School reopens Monday 19 October.'});
  add({title:'Teacher Training Day (School Closed to Students)', date:'2026-10-19', allDay:true, categoryId:'holiday', organizerId:'u1',
    description:'Staff professional development day. There is no school for students. Childcare is not available on this day.'});
  add({title:'That Luang Festival', date:'2026-11-23', endDate:'2026-11-24', allDay:true, categoryId:'holiday', organizerId:'u1',
    description:'Public holiday for the That Luang Festival. All campuses closed.'});
  add({title:'End of Term 1', date:'2026-12-11', allDay:true, important:true, categoryId:'academic', organizerId:'u1',
    description:'Term 1 ends at 12:00. Buses depart at 12:15. Reports are issued via the parent portal on the final day.'});
  add({title:'Winter Holiday', date:'2026-12-14', endDate:'2027-01-04', allDay:true, categoryId:'holiday', organizerId:'u1',
    description:'The winter break. School reopens for Term 2 on Tuesday 5 January 2027.'});
  add({title:'Lao New Year (Pi Mai Lao)', date:'2027-04-13', endDate:'2027-04-16', allDay:true, categoryId:'holiday', organizerId:'u1',
    description:'Public holiday for Lao New Year. All campuses closed. Sok Dee Pi Mai.'});

  /* --- terms 2 and 3 --- */
  add({title:'First Day of Term 2', date:'2027-01-05', allDay:true, important:true, categoryId:'academic', organizerId:'u1',
    description:'Term 2 begins for all campuses. Normal school hours resume.'});
  add({title:'Year 11 & 13 Study Skills Workshop', date:'2027-01-14', start:'13:30', end:'15:00', campusId:'se',
    yearGroupIds:['y11','y13'], categoryId:'academic', audienceIds:['students'], locationId:'loc-sehall', organizerId:'u4',
    description:'Revision technique, timetabling and exam-stress management ahead of the summer examination series.'});
  add({title:'IGCSE & A Level Examinations Begin', date:'2027-05-04', endDate:'2027-06-11', allDay:true, important:true,
    campusId:'se', yearGroupIds:['y11','y13'], categoryId:'exam', audienceIds:['students','parents','teachers'],
    locationId:'loc-sehall', organizerId:'u4',
    description:'The formal Cambridge examination series. Individual timetables are issued in March. Candidates must arrive 30 minutes before each paper.'});
  add({title:'Year 13 Graduation Ceremony', date:'2027-06-18', start:'17:00', end:'20:00', important:true, campusId:'se',
    yearGroupIds:['y13'], categoryId:'graduation', locationId:'loc-audit', organizerId:'u1',
    description:'The graduation ceremony for the Class of 2027, followed by a reception for graduates and their families. Formal dress.'});
  add({title:"Year 6 Leavers' Assembly", date:'2027-06-24', start:'09:00', end:'10:30', campusId:'pr',
    yearGroupIds:['y6'], categoryId:'graduation', audienceIds:['parents','students'], locationId:'loc-prhall', organizerId:'u3',
    description:'A celebration of our Year 6 cohort as they prepare for Secondary. Parents warmly invited.'});
  add({title:'Last Day of Term 3', date:'2027-06-25', allDay:true, important:true, categoryId:'academic', organizerId:'u1',
    description:'The academic year ends at 12:00. End-of-year reports are published on the parent portal.'});

  /* --- lifecycle demonstrations --- */
  add({title:'Secondary Swimming Gala', date:'2026-09-30', start:'13:00', end:'16:00', campusId:'se',
    yearGroupIds:['y7','y8','y9'], categoryId:'sports', audienceIds:['students','parents'],
    locationId:'loc-pool', organizerId:'u6', status:'cancelled',
    description:'CANCELLED — pool maintenance has overrun. A revised date will be published once confirmed. Apologies for the inconvenience.'});
  add({title:'Year 10 Careers Fair', date:'2026-10-08', start:'09:00', end:'12:00', campusId:'se',
    yearGroupIds:['y10'], categoryId:'academic', audienceIds:['students','parents'],
    locationId:'loc-sehall', organizerId:'u4', status:'postponed',
    description:'POSTPONED to Term 2. Several employer partners were unable to attend. The new date will be confirmed by the end of Term 1.'});
  add({title:'Primary Book Week', date:'2027-03-01', endDate:'2027-03-05', allDay:true, status:'draft', campusId:'pr',
    categoryId:'celebration', audienceIds:['students','parents'], organizerId:'u3',
    description:'Draft — dressing-up day, visiting author, book swap and the Primary reading challenge finale. Awaiting confirmation of the author visit.'});
  add({title:'Secondary Drama Production — Rehearsal Schedule', date:'2027-02-08', start:'15:30', end:'17:30',
    status:'draft', campusId:'se', yearGroupIds:['y9','y10','y11'], categoryId:'eca', audienceIds:['students'],
    locationId:'loc-audit', organizerId:'u6',
    description:'Draft rehearsal block for the spring production. Cast list to be confirmed after auditions.'});
  add({title:'Senior Leadership Team Strategy Day', date:'2026-09-14', start:'08:00', end:'16:00',
    categoryId:'meeting', audienceIds:['leadership'], locationId:'loc-conf', organizerId:'u1', visibility:'restricted',
    description:'Annual strategy review: three-year development plan, staffing and capital projects.'});
  add({title:'Safeguarding Governors Review', date:'2026-10-06', start:'14:00', end:'16:00',
    categoryId:'meeting', audienceIds:['leadership'], locationId:'loc-conf', organizerId:'u1', visibility:'restricted',
    description:'Termly governor scrutiny of safeguarding records and single central register.'});

  /* --- deliberate location conflict --- */
  add({title:'Secondary House Assembly', date:'2026-09-15', start:'10:00', end:'11:00', campusId:'se',
    yearGroupIds:['y7','y8','y9','y10','y11'], categoryId:'assembly', audienceIds:['students'],
    locationId:'loc-sehall', organizerId:'u4', description:'Weekly house assembly with house points and notices.'});
  add({title:'University Guidance Presentation — Year 12', date:'2026-09-15', start:'10:00', end:'11:30', campusId:'se',
    yearGroupIds:['y12'], categoryId:'academic', audienceIds:['students','parents'],
    locationId:'loc-sehall', organizerId:'u4',
    description:'UCAS, US Common App and regional university pathways. Delivered by the Head of Sixth Form.'});

  /* --- recurring series --- */
  add({title:'Whole School Staff Briefing', date:'2026-08-17', start:'07:30', end:'07:55',
    categoryId:'staff', audienceIds:['teachers','staff'], locationId:'loc-conf', organizerId:'u1', visibility:'internal',
    description:'Weekly Monday briefing: notices, duty rota and the week ahead.',
    recurrence:{freq:'weekly', interval:1, byday:[1], until:'2026-12-11', termTime:true}});
  add({title:'Primary Celebration Assembly', date:'2026-08-21', start:'14:00', end:'14:45', campusId:'pr',
    yearGroupIds:['y1','y2','y3','y4','y5','y6'], categoryId:'assembly', audienceIds:['students','parents'],
    locationId:'loc-prhall', organizerId:'u3',
    description:'Weekly Friday celebration of achievement. Parents of children receiving certificates are notified on Wednesday.',
    recurrence:{freq:'weekly', interval:1, byday:[5], until:'2026-12-11', termTime:true}});
  add({title:'Secondary ECA Block — Wednesday Activities', date:'2026-08-26', start:'15:15', end:'16:30', campusId:'se',
    yearGroupIds:['y7','y8','y9','y10','y11'], categoryId:'eca', audienceIds:['students'],
    locationId:'loc-gym', organizerId:'u6',
    description:'Wednesday ECA carousel: sport, music, robotics, debate and service.',
    recurrence:{freq:'weekly', interval:1, byday:[3], until:'2026-12-09', termTime:true}});
  add({title:'Early Years Stay & Play', date:'2026-09-04', start:'08:00', end:'09:00', campusId:'ey',
    yearGroupIds:['nur','rec'], categoryId:'parent', audienceIds:['parents'], locationId:'loc-eyplay', organizerId:'u5',
    description:'Fortnightly Friday session for parents to join their child in the setting before the school day begins.',
    recurrence:{freq:'weekly', interval:2, byday:[5], until:'2026-12-11'}});
  add({title:'First Friday Whole School Assembly', date:'2026-09-04', start:'08:00', end:'08:45',
    categoryId:'assembly', audienceIds:['students','teachers'], locationId:'loc-audit', organizerId:'u1',
    description:'Whole-school assembly on the first Friday of each month, rotating between campuses.',
    recurrence:{freq:'monthly', interval:1, byday:[5], bysetpos:1, until:'2027-06-04', termTime:true}});

  /* --- history --- */
  add({title:'Whole School Sports Day', date:'2025-10-03', allDay:true, status:'completed', important:true,
    categoryId:'sports', locationId:'loc-field', organizerId:'u1',
    description:'2025–2026 Sports Day. Kingfisher House retained the trophy.'});
  add({title:'Year 13 Graduation Ceremony', date:'2026-06-19', start:'17:00', end:'20:00', status:'completed',
    important:true, campusId:'se', yearGroupIds:['y13'], categoryId:'graduation', locationId:'loc-audit', organizerId:'u1',
    description:'Graduation of the Class of 2026. Ninety-four graduates progressing to universities in eleven countries.'});
  add({title:'PBIS International Food Fair', date:'2025-11-29', start:'10:00', end:'15:00', status:'completed',
    categoryId:'celebration', locationId:'loc-field', organizerId:'u2',
    description:'2025 Food Fair. Raised 48,000,000 LAK for the scholarship fund.'});
  add({title:'Open Day — All Campuses', date:'2025-09-27', start:'09:00', end:'12:00', status:'completed',
    categoryId:'admissions', locationId:'loc-audit', organizerId:'u2',
    description:'2025 Open Day. 62 prospective families attended.'});
}

function seedSubmissions() {
  const today = T.todayKey();
  const rel = n => T.addDays(today, n);
  const stmt = db.prepare(`INSERT INTO event_submissions
    (id,title,description,start_date,end_date,start_time,end_time,all_day,campus_id,category_id,location_id,
     year_group_ids,audience_ids,status,reviewer_note,submitted_by,created_at,updated_at)
    VALUES (@id,@title,@description,@start_date,@end_date,@start_time,@end_time,@all_day,@campus_id,@category_id,
     @location_id,@year_group_ids,@audience_ids,@status,@reviewer_note,@submitted_by,@created_at,@updated_at)`);
  const rows = [
    {id:'sub-1',title:'Year 8 Science Fair',description:'Student-led investigation showcase. Each Year 8 class presents three projects; parents invited from 14:30.',
     start_date:rel(34),end_date:null,start_time:'13:00',end_time:'16:00',all_day:0,campus_id:'se',category_id:'academic',
     location_id:'loc-sehall',year_group_ids:'["y8"]',audience_ids:'["students","parents"]',status:'pending',reviewer_note:null,
     submitted_by:'u6',created_at:rel(-2),updated_at:rel(-2)},
    {id:'sub-2',title:'Primary Choir Performance at Provincial Music Festival',description:'Thirty-two Primary choir members perform at the provincial festival. Transport by school coach, packed lunch provided.',
     start_date:rel(48),end_date:null,start_time:'08:00',end_time:'17:00',all_day:0,campus_id:'pr',category_id:'trip',
     location_id:'loc-offsite',year_group_ids:'["y4","y5","y6"]',audience_ids:'["students","parents"]',status:'pending',reviewer_note:null,
     submitted_by:'u7',created_at:rel(-4),updated_at:rel(-4)},
    {id:'sub-3',title:"Reception Teddy Bears' Picnic",description:'End-of-topic celebration. Children bring a teddy; parents invited to join for the picnic.',
     start_date:rel(21),end_date:null,start_time:'10:00',end_time:'11:30',all_day:0,campus_id:'ey',category_id:'celebration',
     location_id:'loc-eyplay',year_group_ids:'["rec"]',audience_ids:'["students","parents"]',status:'pending',reviewer_note:null,
     submitted_by:'u8',created_at:rel(-1),updated_at:rel(-1)},
    {id:'sub-4',title:'Year 10 Duke of Edinburgh Practice Expedition',description:'Two-day practice expedition for the Bronze award.',
     start_date:rel(62),end_date:rel(63),start_time:null,end_time:null,all_day:1,campus_id:'se',category_id:'trip',
     location_id:'loc-offsite',year_group_ids:'["y10"]',audience_ids:'["students","parents"]',status:'changes',
     reviewer_note:'Please attach the completed risk assessment and confirm the qualified expedition leader before this can be approved.',
     submitted_by:'u6',created_at:rel(-7),updated_at:rel(-5)}
  ];
  for (const r of rows) stmt.run(r);
}

function seedSettings() {
  const s = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,?)');
  const defaults = {
    'site.domain': 'calendar.pbis.edu.la',
    'site.origin': 'https://calendar.pbis.edu.la',
    'school.name': 'Panyathip British International School',
    'product.name': 'PBIS Central Calendar',
    'product.strapline': 'One School. Three Campuses. One Shared Calendar.',
    'calendar.timezone': 'Asia/Vientiane',
    'calendar.weekStart': 'monday',
    'workflow.requireApproval': 'true',
    'workflow.campusAdminMayPublish': 'true',
    'workflow.warnOnConflict': 'true',
    'feeds.ttlMinutes': '15',
    'anniversary.enabled': 'true'
  };
  for (const [k, v] of Object.entries(defaults)) s.run(k, v, ts);
}

if (require.main === module) {
  const result = seed({ password: process.env.PBIS_SEED_PASSWORD || 'pbis-demo' });
  console.log('Seeded:', result);
}

module.exports = { seed };
