'use strict';
/* ==========================================================================
   TAKE STAFF-ONLY DATES OFF THE PUBLIC CALENDAR

   The imported Google calendars carry the school's internal reporting cycle —
   "Reports Open By Staff", "Y11 Mock Result to be in System", "SLT and Middle
   Leaders Report Check". These are working deadlines for teachers. They were
   publicly visible on the Google calendars and would stay publicly visible
   here unless something changed them.

   This flips them to `internal`, which means: signed-in staff still see them
   on the calendar and in their feeds, and the public no longer does.

   Deliberately NOT touched:
     · Staff PD and training days — parents need to know the school is shut,
       and both campuses often share the same date.
     · Either half of a near-duplicate pair — merging or hiding one of those
       is a judgement about which wording is right, and belongs to a human.

   Every change writes a revision and an audit entry, so this is reversible
   and traceable:  node db/flag-internal.js --revert

   Usage:
     node db/flag-internal.js --dry-run     list what would change
     node db/flag-internal.js               apply
     node db/flag-internal.js --revert      put them back to public
   ========================================================================== */

const { db } = require('../src/db');
const repo = require('../src/repo');

/* Staff workflow: the reporting cycle, results entry, leadership checks. */
const INTERNAL = /\bby staff\b|to staff|open to staff|close to all staff|into system|in system|digital tidy|\bSLT\b|middle leader|report check|template shared|reports? (due|open|close)|new staff/i;

/* Parents need these: the school is closed or the day is about them. */
const KEEP_PUBLIC = /\bPD\b|induction|orientation|training|welcome back|\bnew fams?\b|new families/i;

const NOTE = 'Staff-only working date — hidden from the public calendar pending review';

/** Meaningful words, for spotting the two calendars describing one event. */
const words = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
  .filter(w => w.length > 2 && !['the', 'and', 'for', 'all', 'day'].includes(w));

function nearDuplicates(rows) {
  const byDate = {};
  rows.forEach(r => (byDate[r.start_date] = byDate[r.start_date] || []).push(r));
  const dup = new Set();
  for (const list of Object.values(byDate)) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = new Set(words(list[i].title)), b = words(list[j].title);
        const overlap = b.filter(w => a.has(w)).length;
        if (overlap >= 1 && overlap / Math.max(a.size, b.length) >= 0.4) {
          dup.add(list[i].id); dup.add(list[j].id);
        }
      }
    }
  }
  return dup;
}

function pick(revert) {
  const rows = db.prepare(
    `SELECT id, title, start_date, visibility FROM events
     WHERE deleted_at IS NULL AND visibility = ? ORDER BY start_date`
  ).all(revert ? 'internal' : 'public');

  if (revert) {
    // Only put back what this script hid.
    const mine = new Set(db.prepare(
      "SELECT entity_id FROM audit_log WHERE action='hidden from public' AND entity='event'"
    ).all().map(r => r.entity_id));
    return { flip: rows.filter(r => mine.has(r.id)), skippedPD: [], skippedDup: [] };
  }

  const candidates = rows.filter(r => INTERNAL.test(r.title));
  const dup = nearDuplicates(rows);
  const skippedPD = candidates.filter(r => KEEP_PUBLIC.test(r.title));
  const rest = candidates.filter(r => !KEEP_PUBLIC.test(r.title));
  const skippedDup = rest.filter(r => dup.has(r.id));
  return { flip: rest.filter(r => !dup.has(r.id)), skippedPD, skippedDup };
}

function apply(list, revert, actor) {
  let n = 0;
  for (const r of list) {
    repo.updateEvent(r.id, { visibility: revert ? 'public' : 'internal' }, actor,
      { action: revert ? 'restored to public' : 'hidden from public', note: NOTE });
    n++;
  }
  return n;
}

if (require.main === module) {
  const revert = process.argv.includes('--revert');
  const dry = process.argv.includes('--dry-run');
  const actor = db.prepare(
    "SELECT * FROM users WHERE role IN ('super','caladmin') ORDER BY role='super' DESC LIMIT 1").get();

  const { flip, skippedPD, skippedDup } = pick(revert);
  /* eslint-disable no-console */
  const show = (label, list) => {
    if (!list.length) return;
    console.log(`\n  ${label} (${list.length})`);
    list.forEach(r => console.log(`   · ${r.start_date}  ${r.title}`));
  };

  console.log('\n' + '='.repeat(66));
  console.log(revert ? '  RESTORING STAFF DATES TO PUBLIC' : '  HIDING STAFF-ONLY DATES FROM THE PUBLIC CALENDAR');
  if (dry) console.log('  (dry run — nothing written)');
  console.log('='.repeat(66));

  show(revert ? 'Back to public' : 'Flipped to internal', flip);
  show('Left public — staff PD, training and induction days', skippedPD);
  show('Left public — half of a near-duplicate pair, needs a human', skippedDup);

  if (!dry) {
    const n = apply(flip, revert, actor);
    console.log(`\n  ${n} events updated. Each has a revision and an audit entry.`);
    console.log(revert ? '' : '  Undo with:  node db/flag-internal.js --revert');
  }
  console.log('');
}

module.exports = { pick, apply, INTERNAL, KEEP_PUBLIC };
