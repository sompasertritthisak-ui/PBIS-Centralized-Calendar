'use strict';
/* ==========================================================================
   Clear the demonstration events.

   Removes every event and everything hanging off an event — links, revisions,
   submissions, attachments, notifications, import jobs — so the calendar is
   genuinely empty rather than soft-deleted and still lurking in the CMS.

   Deliberately KEPT: campuses, year groups, categories, audiences, locations,
   academic years, terms, calendars, users, sessions, API keys and settings.
   Those are the school's real structure, not demonstration content.

   Usage:  node db/clear-demo-events.js [--yes]
   ========================================================================== */

const { db, migrate, tx } = require('../src/db');

function clearEvents() {
  migrate();
  return tx(() => {
    const before = db.prepare('SELECT count(*) c FROM events').get().c;

    // Children first — foreign keys are enforced. These names are checked
    // against the schema rather than swallowed: a typo here would silently
    // leave rows behind, which is precisely what this script exists to avoid.
    const CHILDREN = ['event_year_groups', 'event_audiences', 'event_revisions',
      'attachments', 'notifications', 'event_submissions', 'import_jobs', 'export_jobs'];
    const known = new Set(db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
    const missing = CHILDREN.filter(t => !known.has(t));
    if (missing.length) throw new Error('unknown table(s): ' + missing.join(', '));
    for (const t of CHILDREN) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare('DELETE FROM events').run();
    db.prepare("DELETE FROM audit_log WHERE entity = 'event'").run();

    return { removed: before, remaining: db.prepare('SELECT count(*) c FROM events').get().c };
  });
}

if (require.main === module) {
  if (!process.argv.includes('--yes')) {
    /* eslint-disable no-console */
    console.log('\n  This deletes every event in the database. Taxonomy, users and');
    console.log('  calendars are kept. Re-run with --yes to confirm.\n');
    process.exit(1);
  }
  const r = clearEvents();
  console.log(`\n  Removed ${r.removed} events. ${r.remaining} remain.\n`);
}

module.exports = { clearEvents };
