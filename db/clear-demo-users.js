'use strict';
/* ==========================================================================
   REMOVE THE DEMONSTRATION STAFF ACCOUNTS

   The seed creates ten invented people — James Whitfield, Claire Bennett and
   the rest. They exist so the demonstration has someone to attribute work to.
   On a real deployment they are impersonation risks and clutter: every one of
   them can sign in with the seeded password.

   This keeps exactly one administrator so the CMS is still reachable, and
   removes the other nine.

   Users are referenced from a dozen tables — events they created, revisions
   they made, audit entries, submissions. Those references are re-pointed at
   the surviving administrator rather than deleted, so the history stays
   readable: "created by" continues to name someone, and nothing is orphaned.

   Usage:
     node db/clear-demo-users.js --dry-run
     node db/clear-demo-users.js --yes [--keep <email>] [--rename]
   ========================================================================== */

const { db, migrate, now, tx } = require('../src/db');

/* Columns that point at a user and should survive by being re-pointed. */
const REPOINT = [
  ['events', 'organizer_id'], ['events', 'created_by'], ['events', 'updated_by'],
  ['event_revisions', 'changed_by'],
  ['attachments', 'uploaded_by'],
  ['event_submissions', 'submitted_by'], ['event_submissions', 'reviewed_by'],
  ['api_keys', 'created_by'],
  ['import_jobs', 'created_by'], ['export_jobs', 'created_by'],
  ['audit_log', 'user_id'],
  ['notifications', 'created_by'],
  ['settings', 'updated_by']
];

/* Rows that belong to a person and go with them. ON DELETE CASCADE already
   covers sessions, preferences and subscriptions, but being explicit here
   means the script does not depend on the pragma being on. */
const CASCADE = [
  ['sessions', 'user_id'],
  ['user_preferences', 'user_id'],
  ['calendar_subscriptions', 'user_id']
];

function clearDemoUsers({ keepEmail, rename } = {}) {
  migrate();
  return tx(() => {
    const keeper = keepEmail
      ? db.prepare('SELECT * FROM users WHERE email = ?').get(keepEmail)
      : db.prepare("SELECT * FROM users WHERE role = 'super' ORDER BY created_at LIMIT 1").get();
    if (!keeper) throw new Error('no account to keep — refusing to lock you out');

    const doomed = db.prepare('SELECT id, name, email, role FROM users WHERE id != ?').all(keeper.id);
    if (!doomed.length) return { keeper, removed: [], repointed: 0 };

    const ids = doomed.map(u => u.id);
    const marks = ids.map(() => '?').join(',');

    // Check the schema rather than trusting this list: a wrong name here
    // would either throw halfway through or, worse, silently skip a table and
    // leave a dangling reference.
    const columnsOf = t => db.prepare(`PRAGMA table_info(${t})`).all().map(r => r.name);
    for (const [table, col] of [...REPOINT, ...CASCADE]) {
      if (!columnsOf(table).includes(col)) {
        throw new Error(`schema mismatch: ${table}.${col} does not exist`);
      }
    }

    let repointed = 0;
    for (const [table, col] of REPOINT) {
      const r = db.prepare(
        `UPDATE ${table} SET ${col} = ? WHERE ${col} IN (${marks})`).run(keeper.id, ...ids);
      repointed += r.changes;
    }
    for (const [table, col] of CASCADE) {
      db.prepare(`DELETE FROM ${table} WHERE ${col} IN (${marks})`).run(...ids);
    }
    db.prepare(`DELETE FROM users WHERE id IN (${marks})`).run(...ids);

    if (rename) {
      db.prepare('UPDATE users SET name = ?, email = ?, initials = ?, updated_at = ? WHERE id = ?')
        .run('PBIS Administrator', 'admin@pbis.edu.la', 'PA', now(), keeper.id);
    }

    db.prepare(`INSERT INTO audit_log (id, action, entity, entity_id, title, detail, user_id, created_at)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run('aud_' + Math.random().toString(36).slice(2, 12), 'removed demo accounts', 'user',
        keeper.id, `${doomed.length} demonstration accounts removed`,
        JSON.stringify(doomed.map(u => u.email)), keeper.id, now());

    return {
      keeper: db.prepare('SELECT * FROM users WHERE id = ?').get(keeper.id),
      removed: doomed, repointed
    };
  });
}

if (require.main === module) {
  /* eslint-disable no-console */
  const argv = process.argv;
  const dry = argv.includes('--dry-run');
  const rename = argv.includes('--rename');
  const ki = argv.indexOf('--keep');
  const keepEmail = ki > -1 ? argv[ki + 1] : null;

  if (!dry && !argv.includes('--yes')) {
    console.log('\n  This deletes staff accounts. Re-run with --yes, or --dry-run to preview.\n');
    process.exit(1);
  }

  if (dry) {
    const keeper = keepEmail
      ? db.prepare('SELECT * FROM users WHERE email = ?').get(keepEmail)
      : db.prepare("SELECT * FROM users WHERE role = 'super' ORDER BY created_at LIMIT 1").get();
    const doomed = db.prepare('SELECT name, email, role FROM users WHERE id != ?').all(keeper.id);
    console.log(`\n  KEEP    ${keeper.role.padEnd(10)} ${keeper.name} <${keeper.email}>`);
    if (rename) console.log('          → will be renamed to PBIS Administrator <admin@pbis.edu.la>');
    console.log(`\n  REMOVE  (${doomed.length})`);
    doomed.forEach(u => console.log(`   · ${u.role.padEnd(12)} ${u.name.padEnd(24)} ${u.email}`));
    console.log('');
    process.exit(0);
  }

  const r = clearDemoUsers({ keepEmail, rename });
  console.log(`\n  Removed ${r.removed.length} demonstration accounts.`);
  console.log(`  Re-pointed ${r.repointed} references to ${r.keeper.name} <${r.keeper.email}>.`);
  console.log(`\n  Sign in as: ${r.keeper.email}`);
  console.log('  Change that password before this is reachable from the internet.\n');
}

module.exports = { clearDemoUsers };
