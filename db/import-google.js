'use strict';
/* ==========================================================================
   IMPORT THE SCHOOL'S REAL CALENDARS

   PBIS keeps two Google calendars: one covering Primary and Early Years
   together, one for Secondary. This reads their .ics exports, replaces the
   demonstration data, and files each event against the right campus,
   category and location.

   Usage:
     node db/import-google.js --pr-ey primary.ics --se secondary.ics [options]

   Options:
     --keep-demo     Add to the existing events instead of replacing them.
     --dry-run       Report what would happen and write nothing.
     --status draft  Import as drafts needing approval (default: published,
                     because these events are already public on the school
                     site — importing them as drafts would take the calendar
                     down rather than move it).

   The combined Primary / Early Years calendar has no campus field, so campus
   is inferred from each title. Anything with no clear signal is left
   UNASSIGNED and listed at the end for a human to file, rather than guessed
   at silently — a Nursery event mislabelled as Primary is worse than one
   plainly marked as needing attention.
   ========================================================================== */

const fs = require('fs');
const { db, migrate, now, id, slugify, uniqueSlug, json, tx } = require('../src/db');
const repo = require('../src/repo');
const T = require('../src/lib/time');
const { parseIcs } = require('../src/lib/icsparse');
const { clearEvents } = require('./clear-demo-events');
const { classify } = require('../src/lib/classify');

/* ------------------------------------------------------------------ run */
function parseArgs(argv) {
  const a = { files: [], keepDemo: false, dryRun: false, status: 'published' };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--pr-ey') a.files.push({ source: 'pr-ey', path: argv[++i] });
    else if (v === '--se') a.files.push({ source: 'se', path: argv[++i] });
    else if (v === '--keep-demo') a.keepDemo = true;
    else if (v === '--dry-run') a.dryRun = true;
    else if (v === '--status') a.status = argv[++i];
  }
  return a;
}

function run(opts) {
  migrate();
  const taxo = repo.taxonomy.all();
  const actor = db.prepare("SELECT * FROM users WHERE role IN ('super','caladmin') ORDER BY role='super' DESC LIMIT 1").get();

  const parsedFiles = opts.files.map(f => {
    const text = fs.readFileSync(f.path, 'utf8');
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error(`${f.path} is not an iCalendar file`);
    const { events, skipped } = parseIcs(text, taxo);
    return { ...f, events, skipped };
  });

  const rows = [];
  for (const f of parsedFiles) {
    for (const ev of f.events) {
      if (!ev.title || !T.isDateKey(ev.date)) continue;
      rows.push({ ...ev, ...classify(ev, f.source, taxo), _source: f.source });
    }
  }

  // Both calendars carry the same whole-school dates, so the same term start
  // arrives twice. Same title on the same day is the same event.
  const seen = new Map();
  const deduped = [];
  for (const r of rows) {
    const k = `${r.title.trim().toLowerCase()}|${r.date}`;
    if (seen.has(k)) {
      const kept = seen.get(k);
      // Appearing in BOTH campus calendars is the strongest evidence an event
      // belongs to the whole school — so it becomes whole-school rather than
      // taking the campus of whichever file happened to be read second.
      if (kept._source !== r._source) {
        kept.campusId = null;
        kept.needsReview = false;
        kept.why = 'appears in both campus calendars';
        kept.yearGroupIds = [...new Set([...kept.yearGroupIds, ...r.yearGroupIds])];
      } else if (!kept.campusId && r.campusId && kept.needsReview) {
        // Same calendar twice: the one that could be filed wins.
        kept.campusId = r.campusId; kept.needsReview = false; kept.why = r.why;
      }
      kept._duplicates = (kept._duplicates || 1) + 1;
      continue;
    }
    seen.set(k, r); deduped.push(r);
  }

  const report = {
    files: parsedFiles.map(f => ({ path: f.path, source: f.source, read: f.events.length, skipped: f.skipped })),
    parsed: rows.length,
    duplicatesMerged: rows.length - deduped.length,
    toWrite: deduped.length,
    byCampus: {}, byCategory: {},
    needsReview: deduped.filter(r => r.needsReview),
    unknownLocations: [...new Set(deduped.filter(r => r._locRaw && !r.locationId).map(r => r._locRaw))],
    recurring: deduped.filter(r => r.recurrence).length,
    multiDay: deduped.filter(r => r.endDate).length,
    timed: deduped.filter(r => !r.allDay).length
  };
  for (const r of deduped) {
    const c = r.campusId || '(whole school / unassigned)';
    report.byCampus[c] = (report.byCampus[c] || 0) + 1;
    report.byCategory[r.categoryId] = (report.byCategory[r.categoryId] || 0) + 1;
  }

  if (opts.dryRun) return { report, written: 0 };

  const written = tx(() => {
    if (!opts.keepDemo) clearEvents();
    let n = 0;
    for (const r of deduped) {
      repo.createEvent({
        title: r.title,
        description: r.description || '',
        date: r.date,
        endDate: r.endDate || null,
        start: r.allDay ? null : (r.start || null),
        end: r.allDay ? null : (r.end || null),
        allDay: r.allDay,
        campusId: r.campusId,
        categoryId: r.categoryId,
        locationId: r.locationId,
        yearGroupIds: r.yearGroupIds,
        audienceIds: ['community'],
        // Everything imported is already public on the school's own site.
        visibility: 'public',
        status: opts.status,
        recurrence: r.recurrence || null,
        source: 'import'
      }, actor);
      n++;
    }
    return n;
  });

  return { report, written };
}

/* --------------------------------------------------------------- output */
if (require.main === module) {
  const opts = parseArgs(process.argv);
  if (!opts.files.length) {
    /* eslint-disable no-console */
    console.log('\n  node db/import-google.js --pr-ey <file.ics> --se <file.ics> [--dry-run] [--keep-demo]\n');
    process.exit(1);
  }
  const { report, written } = run(opts);
  const line = (k, v) => console.log(`  ${String(k).padEnd(34)} ${v}`);

  console.log('\n' + '='.repeat(64));
  console.log('  IMPORT ' + (opts.dryRun ? '(dry run — nothing written)' : ''));
  console.log('='.repeat(64));
  for (const f of report.files) {
    console.log(`\n  ${f.path}  [${f.source}]`);
    line('events read', f.read);
    if (f.skipped.cancelled) line('skipped, cancelled', f.skipped.cancelled);
    if (f.skipped.exceptions) line('skipped, recurrence overrides', f.skipped.exceptions);
    if (f.skipped.unreadable) line('skipped, unreadable', f.skipped.unreadable);
  }
  console.log('');
  line('parsed', report.parsed);
  line('duplicates merged across calendars', report.duplicatesMerged);
  line('written', opts.dryRun ? '(none — dry run)' : written);
  line('recurring series', report.recurring);
  line('multi-day', report.multiDay);
  line('with a start time', report.timed);

  console.log('\n  By campus');
  for (const [k, v] of Object.entries(report.byCampus).sort((a, b) => b[1] - a[1])) line(k, v);
  console.log('\n  By category');
  for (const [k, v] of Object.entries(report.byCategory).sort((a, b) => b[1] - a[1])) line(k, v);

  if (report.unknownLocations.length) {
    console.log('\n  Locations named in the calendar that PBIS does not have:');
    report.unknownLocations.forEach(l => console.log('   · ' + l));
    console.log('  (Add them under Structure → Locations, or leave them off.)');
  }

  if (report.needsReview.length) {
    console.log(`\n  ${report.needsReview.length} events could not be filed to a campus — assign these in the CMS:`);
    report.needsReview.slice(0, 40).forEach(r => console.log(`   · ${r.date}  ${r.title}`));
    if (report.needsReview.length > 40) console.log(`   … and ${report.needsReview.length - 40} more`);
  } else {
    console.log('\n  Every event was filed to a campus or is deliberately whole-school.');
  }
  console.log('');
}

module.exports = { run };
