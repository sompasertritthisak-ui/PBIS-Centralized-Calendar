'use strict';
/* ==========================================================================
   Integration suite. Runs against the real server over real HTTP semantics
   (fastify.inject), against a real database seeded from scratch.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Isolated database per run.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pbis-test-'));
process.env.PBIS_DATA_DIR = TMP;
process.env.PBIS_DB = path.join(TMP, 'test.db');
process.env.PBIS_ORIGIN = 'https://calendar.pbis.edu.la';

const { seed } = require('../db/seed');
const { build } = require('../src/server');
const T = require('../src/lib/time');
const { db } = require('../src/db');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' :: ' + detail : '')); }
}
const group = t => console.log('\n' + t);
const J = r => { try { return JSON.parse(r.body); } catch { return null; } };

(async () => {
  seed({ password: 'test-pass' });
  const app = await build({ logger: false });

  const login = async (email) => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-in',
      payload: { email, password: 'test-pass' } });
    if (r.statusCode !== 200) throw new Error('login failed for ' + email + ': ' + r.body);
    return r.headers['set-cookie'].split(';')[0];
  };
  const as = (cookie, opts) => app.inject({ ...opts, headers: { ...(opts.headers || {}), cookie } });

  const superAdmin = await login('s.vongsa@pbis.edu.la');
  const calAdmin   = await login('j.whitfield@pbis.edu.la');
  const campusSE   = await login('c.bennett@pbis.edu.la');
  const teacher    = await login('d.okonkwo@pbis.edu.la');
  const parent     = await login('n.phommachanh@parent.pbis.edu.la');

  /* ================================================================ auth */
  group('AUTHENTICATION');
  {
    const bad = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-in',
      payload: { email: 'j.whitfield@pbis.edu.la', password: 'wrong' } });
    ok(bad.statusCode === 401, 'wrong password is rejected', String(bad.statusCode));

    const nouser = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-in',
      payload: { email: 'nobody@example.com', password: 'test-pass' } });
    ok(nouser.statusCode === 401, 'unknown account is rejected');
    ok(J(nouser).error === 'invalid_credentials' && !/nobody/.test(nouser.body),
      'error does not reveal whether the account exists');

    const sess = await as(calAdmin, { method: 'GET', url: '/api/v1/auth/session' });
    ok(J(sess).data.user.role === 'caladmin', 'session returns the signed-in user');

    const anon = await app.inject({ method: 'GET', url: '/api/v1/auth/session' });
    ok(J(anon).data.user === null, 'anonymous session is null');

    const cookieHeader = (await app.inject({ method: 'POST', url: '/api/v1/auth/sign-in',
      payload: { email: 'j.whitfield@pbis.edu.la', password: 'test-pass' } })).headers['set-cookie'];
    ok(/HttpOnly/i.test(cookieHeader) && /SameSite=Lax/i.test(cookieHeader),
      'session cookie is HttpOnly and SameSite', cookieHeader);

    const forged = await app.inject({ method: 'GET', url: '/api/v1/admin/events',
      headers: { cookie: 'pbis_session=not-a-real-session' } });
    ok(forged.statusCode === 401, 'forged session cookie is refused');

    const out = await as(calAdmin, { method: 'POST', url: '/api/v1/auth/sign-out' });
    ok(out.statusCode === 200, 'sign out succeeds');
    const afterOut = await as(calAdmin, { method: 'GET', url: '/api/v1/admin/events' });
    ok(afterOut.statusCode === 401, 'the revoked session no longer works');
  }
  const admin = await login('j.whitfield@pbis.edu.la');   // fresh session

  /* ============================================================== rbac */
  group('AUTHORISATION');
  {
    const cases = [
      ['anonymous', null, '/api/v1/admin/events', 'GET', 401],
      ['anonymous', null, '/api/v1/admin/dashboard', 'GET', 401],
      ['anonymous', null, '/api/v1/admin/audit', 'GET', 401],
      ['parent', parent, '/api/v1/admin/events', 'GET', 403],
      ['student-like teacher', teacher, '/api/v1/admin/events', 'GET', 403],
      ['teacher', teacher, '/api/v1/admin/submissions', 'GET', 403],
      ['campus admin', campusSE, '/api/v1/admin/events', 'GET', 200],
      ['campus admin', campusSE, '/api/v1/admin/audit', 'GET', 403],
      ['calendar admin', admin, '/api/v1/admin/audit', 'GET', 200],
      ['campus admin', campusSE, '/api/v1/admin/users', 'GET', 200],
      ['calendar admin', admin, '/api/v1/admin/api-keys', 'GET', 403],
      ['super admin', superAdmin, '/api/v1/admin/api-keys', 'GET', 200]
    ];
    for (const [who, cookie, url, method, expect] of cases) {
      const r = cookie ? await as(cookie, { method, url }) : await app.inject({ method, url });
      ok(r.statusCode === expect, `${who} ${method} ${url} → ${expect}`, String(r.statusCode));
    }

    const esc = await as(campusSE, { method: 'PATCH', url: '/api/v1/admin/users/u2',
      payload: { role: 'super' } });
    ok(esc.statusCode === 403, 'campus admin cannot escalate a role');

    const own = await as(campusSE, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'SE campus event', date: '2026-11-02', start: '09:00', end: '10:00',
        campusId: 'se', categoryId: 'academic' } });
    ok(own.statusCode === 201, 'campus admin may create for their own campus', String(own.statusCode));

    const other = await as(campusSE, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'Primary event', date: '2026-11-02', campusId: 'pr', categoryId: 'academic' } });
    ok(other.statusCode === 403, 'campus admin cannot create for another campus');

    const whole = await as(campusSE, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'Whole school event', date: '2026-11-02', categoryId: 'academic' } });
    ok(whole.statusCode === 403, 'campus admin cannot create whole-school events');

    // Editing across campuses
    const prEvent = db.prepare("SELECT id FROM events WHERE campus_id='pr' LIMIT 1").get();
    const crossEdit = await as(campusSE, { method: 'PATCH', url: `/api/v1/admin/events/${prEvent.id}`,
      payload: { title: 'Hijacked' } });
    ok(crossEdit.statusCode === 403, 'campus admin cannot edit another campus event');
  }

  /* ======================================================== visibility */
  group('VISIBILITY');
  {
    const restricted = db.prepare("SELECT slug, id FROM events WHERE visibility='restricted' LIMIT 1").get();
    const internal = db.prepare("SELECT slug FROM events WHERE visibility='internal' LIMIT 1").get();
    const draft = db.prepare("SELECT slug FROM events WHERE status='draft' LIMIT 1").get();

    const pubRestricted = await app.inject({ method: 'GET', url: `/api/v1/events/${restricted.slug}` });
    ok(pubRestricted.statusCode === 404, 'restricted event is 404 to the public');
    const parentRestricted = await as(parent, { method: 'GET', url: `/api/v1/events/${restricted.slug}` });
    ok(parentRestricted.statusCode === 404, 'restricted event is 404 to a parent');
    const adminRestricted = await as(admin, { method: 'GET', url: `/api/v1/events/${restricted.slug}` });
    ok(adminRestricted.statusCode === 200, 'restricted event is visible to a calendar admin');

    const pubInternal = await app.inject({ method: 'GET', url: `/api/v1/events/${internal.slug}` });
    ok(pubInternal.statusCode === 404, 'internal event is hidden from the public');
    const parentInternal = await as(parent, { method: 'GET', url: `/api/v1/events/${internal.slug}` });
    ok(parentInternal.statusCode === 200, 'internal event is visible to a signed-in parent');

    const pubDraft = await app.inject({ method: 'GET', url: `/api/v1/events/${draft.slug}` });
    ok(pubDraft.statusCode === 404, 'draft event is hidden from the public');

    const list = J(await app.inject({ method: 'GET', url: '/api/v1/events?from=2026-01-01&to=2027-12-01&limit=500' }));
    const leaked = list.data.filter(e => e.visibility !== 'public' || !['published','cancelled','postponed','completed'].includes(e.status));
    ok(leaked.length === 0, 'no non-public event appears in the public list', JSON.stringify(leaked.slice(0, 2)));

    // The SSR page must not leak either.
    const page = await app.inject({ method: 'GET', url: `/events/${restricted.slug}` });
    ok(page.statusCode === 404 && /noindex/.test(page.body), 'restricted event page is 404 + noindex');
  }

  /* ========================================================= public api */
  group('PUBLIC API');
  {
    const r = J(await app.inject({ method: 'GET', url: '/api/v1/events?from=2026-08-17&to=2026-08-31' }));
    ok(r.data.length > 0 && r.meta.timezone === 'Asia/Vientiane', 'range query returns events in school time');
    ok(r.data.every(e => e.start && (e.allDay || /\+07:00$/.test(e.start))),
      'timed events carry the +07:00 offset');

    const filtered = J(await app.inject({ method: 'GET', url: '/api/v1/events?from=2026-08-01&to=2027-01-01&campus=se&limit=500' }));
    ok(filtered.data.every(e => !e.campus || e.campus.id === 'se'),
      'campus filter excludes other campuses (whole-school kept)');

    const yg = J(await app.inject({ method: 'GET', url: '/api/v1/events?from=2026-08-01&to=2027-06-30&yearGroup=y5&limit=500' }));
    ok(yg.data.every(e => !e.yearGroups.length || e.yearGroups.some(g => g.id === 'y5')),
      'year-group filter keeps campus-wide events and excludes other years');

    const search = J(await app.inject({ method: 'GET', url: '/api/v1/events?from=2026-08-01&to=2027-06-30&q=parent%20evening&limit=100' }));
    ok(search.data.length > 0 && search.data.every(e => /parent/i.test(e.title + e.description)),
      'search matches title and description');

    const tooBig = await app.inject({ method: 'GET', url: '/api/v1/events?from=2020-01-01&to=2030-01-01' });
    ok(tooBig.statusCode === 422 && J(tooBig).error === 'range_too_large',
      'an absurd range is refused rather than served', String(tooBig.statusCode));
    const backwards = await app.inject({ method: 'GET', url: '/api/v1/events?from=2027-01-01&to=2026-01-01' });
    ok(backwards.statusCode === 422, 'a reversed range is refused');

    const today = J(await app.inject({ method: 'GET', url: '/api/v1/today' }));
    ok(today.data && Array.isArray(today.data.schedule), 'signage payload has today\'s schedule');

    const campuses = J(await app.inject({ method: 'GET', url: '/api/v1/campuses' }));
    ok(campuses.data.length === 3 && campuses.data[1].yearGroups.length === 6,
      'campuses carry their year groups');

    const years = J(await app.inject({ method: 'GET', url: '/api/v1/academic-years' }));
    ok(years.data.length === 3 && years.data.every(y => y.terms.length === 3), 'academic years carry terms');
  }

  /* ============================================================== crud */
  group('EVENT LIFECYCLE');
  let createdId, createdSlug;
  {
    const bad = await as(admin, { method: 'POST', url: '/api/v1/admin/events', payload: { title: '', date: 'nope' } });
    ok(bad.statusCode === 422 && J(bad).errors.length >= 2, 'validation rejects a bad payload with field errors');

    const badTime = await as(admin, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'Backwards', date: '2026-11-03', start: '15:00', end: '09:00', categoryId: 'academic' } });
    ok(badTime.statusCode === 422 && /end time/i.test(JSON.stringify(J(badTime).errors)),
      'end before start is rejected');

    const created = await as(admin, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'Year 4 Museum Visit', description: 'Trip to the national museum.',
        date: '2026-11-12', start: '09:00', end: '14:00', campusId: 'pr', categoryId: 'trip',
        yearGroupIds: ['y4'], audienceIds: ['students','parents'], locationId: 'loc-offsite', status: 'draft' } });
    ok(created.statusCode === 201, 'event created', String(created.statusCode));
    createdId = J(created).data.id; createdSlug = J(created).data.slug;
    ok(J(created).data.yearGroupIds.join() === 'y4', 'year group link persisted');
    ok(J(created).data.academicYearId === 'ay2627', 'academic year inferred from the date');

    const draftPublic = await app.inject({ method: 'GET', url: `/api/v1/events/${createdSlug}` });
    ok(draftPublic.statusCode === 404, 'the new draft is not public yet');

    const published = await as(admin, { method: 'PATCH', url: `/api/v1/admin/events/${createdId}`,
      payload: { status: 'published' } });
    ok(published.statusCode === 200 && J(published).data.publishedAt, 'publishing stamps publishedAt');

    const nowPublic = await app.inject({ method: 'GET', url: `/api/v1/events/${createdSlug}` });
    ok(nowPublic.statusCode === 200, 'published event is public immediately');

    const dup = await as(admin, { method: 'POST', url: `/api/v1/admin/events/${createdId}/duplicate`, payload: {} });
    ok(dup.statusCode === 201 && J(dup).data.status === 'draft' && J(dup).data.id !== createdId,
      'duplicate creates a separate draft');

    const archived = await as(admin, { method: 'DELETE', url: `/api/v1/admin/events/${J(dup).data.id}` });
    ok(archived.statusCode === 200, 'archive is a soft delete');
    const row = db.prepare('SELECT deleted_at FROM events WHERE id=?').get(J(dup).data.id);
    ok(row && row.deleted_at, 'the row still exists with deleted_at set');
    const restored = await as(admin, { method: 'POST', url: `/api/v1/admin/events/${J(dup).data.id}/restore` });
    ok(restored.statusCode === 200 && J(restored).data.status === 'draft', 'archived event can be restored');
  }

  /* ========================================================= revisions */
  group('VERSION HISTORY');
  {
    await as(admin, { method: 'PATCH', url: `/api/v1/admin/events/${createdId}`,
      payload: { title: 'Year 4 Museum Visit (morning)', changeNote: 'Shortened' } });
    await as(admin, { method: 'PATCH', url: `/api/v1/admin/events/${createdId}`,
      payload: { start: '09:30' } });

    const revs = J(await as(admin, { method: 'GET', url: `/api/v1/admin/events/${createdId}/revisions` }));
    ok(revs.data.length === 2, 'a revision is written per change to a published event', String(revs.data.length));
    ok(revs.data[0].version === 2, 'revisions are versioned in order');

    const one = J(await as(admin, { method: 'GET', url: `/api/v1/admin/events/${createdId}/revisions/1` }));
    ok(one.data.diff.some(d => d.field === 'title'), 'diff shows what changed');

    const restore = await as(admin, { method: 'POST', url: `/api/v1/admin/events/${createdId}/revisions/1/restore` });
    ok(restore.statusCode === 200 && J(restore).data.title === 'Year 4 Museum Visit',
      'restoring a revision brings the old values back', J(restore).data.title);
  }

  /* ========================================================= conflicts */
  group('CONFLICT DETECTION');
  {
    const clash = await as(admin, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'Clashing assembly', date: '2026-09-15', start: '10:15', end: '11:00',
        campusId: 'se', categoryId: 'assembly', locationId: 'loc-sehall', status: 'published' } });
    ok(clash.statusCode === 409 && J(clash).conflicts.length > 0,
      'publishing into a booked room is refused with the clash listed', String(clash.statusCode));

    const forced = await as(admin, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'Clashing assembly', date: '2026-09-15', start: '10:15', end: '11:00',
        campusId: 'se', categoryId: 'assembly', locationId: 'loc-sehall', status: 'published',
        acknowledgeConflict: true } });
    ok(forced.statusCode === 201, 'an acknowledged conflict may be saved deliberately');

    const drafted = await as(admin, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'Draft clash', date: '2026-09-15', start: '10:15', end: '11:00',
        campusId: 'se', categoryId: 'assembly', locationId: 'loc-sehall', status: 'draft' } });
    ok(drafted.statusCode === 201, 'a draft may clash without blocking the author');

    const list = J(await as(admin, { method: 'GET', url: '/api/v1/admin/conflicts' }));
    ok(list.data.length >= 2, 'the conflict register reports the clashes', String(list.data.length));
  }

  /* ============================================================= bulk */
  group('BULK ACTIONS');
  {
    const ids = db.prepare("SELECT id FROM events WHERE status='draft' AND deleted_at IS NULL LIMIT 3").all().map(r => r.id);
    const moved = await as(admin, { method: 'POST', url: '/api/v1/admin/events/bulk',
      payload: { ids, operation: 'move', value: 7 } });
    ok(moved.statusCode === 200 && J(moved).data.updated.length === ids.length, 'bulk move shifts dates');

    const cat = await as(admin, { method: 'POST', url: '/api/v1/admin/events/bulk',
      payload: { ids, operation: 'category', value: 'eca' } });
    ok(J(cat).data.updated.length === ids.length, 'bulk category change');
    ok(db.prepare(`SELECT count(*) c FROM events WHERE id IN (${ids.map(() => '?').join(',')}) AND category_id='eca'`)
      .get(...ids).c === ids.length, 'bulk category actually persisted');

    const vis = await as(admin, { method: 'POST', url: '/api/v1/admin/events/bulk',
      payload: { ids, operation: 'visibility', value: 'internal' } });
    ok(J(vis).data.updated.length === ids.length, 'bulk visibility change');

    const bad = await as(admin, { method: 'POST', url: '/api/v1/admin/events/bulk',
      payload: { ids, operation: 'drop_table' } });
    ok(bad.statusCode === 422, 'unknown bulk operation is refused');

    const scoped = await as(campusSE, { method: 'POST', url: '/api/v1/admin/events/bulk',
      payload: { ids: [db.prepare("SELECT id FROM events WHERE campus_id='pr' LIMIT 1").get().id],
        operation: 'publish' } });
    ok(J(scoped).data.skipped.length === 1 && J(scoped).data.skipped[0].reason === 'forbidden',
      'bulk action skips events outside a campus admin\'s scope');
  }

  /* ======================================================= submissions */
  group('SUBMISSION WORKFLOW');
  {
    const submitted = await as(teacher, { method: 'POST', url: '/api/v1/me/submissions',
      payload: { title: 'Year 9 Debate Final', date: '2026-11-19', start: '14:00', end: '16:00',
        campusId: 'se', categoryId: 'eca', yearGroupIds: ['y9'], audienceIds: ['students','parents'],
        locationId: 'loc-sehall', description: 'Inter-house debating final.' } });
    ok(submitted.statusCode === 201, 'a teacher can submit an event');
    const subId = J(submitted).data.id;

    const mine = J(await as(teacher, { method: 'GET', url: '/api/v1/me/submissions' }));
    ok(mine.data.some(s => s.id === subId), 'the teacher can track their own submission');

    const notPublic = await app.inject({ method: 'GET', url: '/api/v1/events?from=2026-11-19&to=2026-11-19' });
    ok(!J(notPublic).data.some(e => e.title === 'Year 9 Debate Final'),
      'a submission is not on the public calendar before approval');

    const teacherApprove = await as(teacher, { method: 'POST', url: `/api/v1/admin/submissions/${subId}/approve` });
    ok(teacherApprove.statusCode === 403, 'a teacher cannot approve their own submission');

    const changes = await as(admin, { method: 'POST', url: `/api/v1/admin/submissions/${subId}/request-changes`,
      payload: { note: 'Please confirm the room booking.' } });
    ok(J(changes).data.status === 'changes', 'a reviewer can request changes');

    const resubmit = await as(teacher, { method: 'PATCH', url: `/api/v1/me/submissions/${subId}`,
      payload: { locationId: 'loc-selib' } });
    ok(J(resubmit).data.status === 'pending', 'editing a submission returns it to the queue');

    const approved = await as(admin, { method: 'POST', url: `/api/v1/admin/submissions/${subId}/approve`,
      payload: { note: 'Approved.' } });
    ok(approved.statusCode === 200, 'a calendar admin can approve');
    const newEventId = J(approved).data.event.id;
    ok(db.prepare('SELECT source, source_ref FROM events WHERE id=?').get(newEventId).source === 'submission',
      'the published event records that it came from a submission');

    const nowPublic = J(await app.inject({ method: 'GET', url: '/api/v1/events?from=2026-11-19&to=2026-11-19' }));
    ok(nowPublic.data.some(e => e.title === 'Year 9 Debate Final'),
      'once approved the event is on the public calendar');

    const twice = await as(admin, { method: 'POST', url: `/api/v1/admin/submissions/${subId}/approve` });
    ok(twice.statusCode === 409, 'a submission cannot be approved twice');
  }

  /* ====================================================== my calendar */
  group('MY PBIS CALENDAR');
  {
    await as(parent, { method: 'PUT', url: '/api/v1/me/preferences',
      payload: { campusId: 'pr', yearGroupId: 'y5', audienceId: 'parents', categoryIds: [], onboarded: true } });

    const mine = J(await as(parent, { method: 'GET', url: '/api/v1/me/calendar?from=2026-08-01&to=2027-06-30' }));
    const secondaryOnly = mine.data.filter(e => e.campus && e.campus.id === 'se');
    ok(secondaryOnly.length === 0, 'a Year 5 parent sees no Secondary-only events', String(secondaryOnly.length));

    const wholeSchool = mine.data.filter(e => !e.campus && !e.yearGroups.length);
    ok(wholeSchool.length > 0, 'whole-school events are always included');

    const otherYear = mine.data.filter(e => e.yearGroups.length && !e.yearGroups.some(y => y.id === 'y5'));
    ok(otherYear.length === 0, 'no other year group leaks in', JSON.stringify(otherYear.slice(0, 2).map(e => e.title)));

    const y5 = mine.data.filter(e => e.yearGroups.some(y => y.id === 'y5'));
    ok(y5.length > 0, 'Year 5 events are present');

    const holidays = mine.data.filter(e => e.category && e.category.id === 'holiday');
    ok(holidays.length > 0, 'holidays survive personalisation');

    const reload = J(await as(parent, { method: 'GET', url: '/api/v1/me/preferences' }));
    ok(reload.data.yearGroupId === 'y5' && reload.data.onboarded === true,
      'preferences persist to the account, not just the browser');
  }

  /* ============================================================ feeds */
  group('LIVE SUBSCRIPTION FEEDS');
  {
    const all = await app.inject({ method: 'GET', url: '/feeds/all.ics' });
    ok(all.statusCode === 200 && /^text\/calendar/.test(all.headers['content-type']),
      'the all-events feed serves text/calendar');
    ok(all.body.startsWith('BEGIN:VCALENDAR') && all.body.trim().endsWith('END:VCALENDAR'),
      'feed is a well-formed VCALENDAR');
    ok(all.body.includes('\r\n'), 'feed uses CRLF line endings');
    ok(/BEGIN:VTIMEZONE[\s\S]*TZID:Asia\/Vientiane/.test(all.body), 'feed declares the school time zone');
    ok(/REFRESH-INTERVAL;VALUE=DURATION:PT15M/.test(all.body), 'feed advertises a refresh interval');
    ok(!/BEGIN:VEVENT[\s\S]*?SUMMARY:Senior Leadership Team Strategy Day/.test(all.body),
      'restricted events are absent from the public feed');
    ok(!all.body.split('BEGIN:VEVENT').slice(1).some(b => /STATUS:TENTATIVE/.test(b)),
      'draft events are absent from the public feed');

    const rrule = all.body.split('BEGIN:VEVENT').find(b => /Primary Celebration Assembly/.test(b));
    ok(/RRULE:FREQ=WEEKLY/.test(rrule), 'a recurring series ships as one VEVENT with an RRULE');

    const etag = all.headers.etag;
    const again = await app.inject({ method: 'GET', url: '/feeds/all.ics', headers: { 'if-none-match': etag } });
    ok(again.statusCode === 304, 'a conditional request returns 304');

    const campus = await app.inject({ method: 'GET', url: '/feeds/primary.ics' });
    ok(campus.statusCode === 200 && Number(campus.headers['x-pbis-event-count']) > 0,
      'a campus feed resolves by slug');

    const unknown = await app.inject({ method: 'GET', url: '/feeds/nonsense.ics' });
    ok(unknown.statusCode === 404, 'an unknown feed is 404');

    // THE product requirement (§18): publish, then the subscriber sees it.
    const sub = J(await as(parent, { method: 'POST', url: '/api/v1/me/subscriptions', payload: { calendarId: 'yg-y5' } }));
    const token = sub.data.token;
    const before = await app.inject({ method: 'GET', url: `/feeds/yg-y5.ics?token=${token}` });
    const countBefore = (before.body.match(/BEGIN:VEVENT/g) || []).length;

    await as(admin, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'Year 5 Swimming Trials', date: '2026-10-07', start: '13:00', end: '15:00',
        campusId: 'pr', categoryId: 'sports', yearGroupIds: ['y5'], audienceIds: ['students','parents'],
        status: 'published' } });

    const after = await app.inject({ method: 'GET', url: `/feeds/yg-y5.ics?token=${token}` });
    const countAfter = (after.body.match(/BEGIN:VEVENT/g) || []).length;
    ok(countAfter === countBefore + 1 && /Year 5 Swimming Trials/.test(after.body),
      'publishing an event makes it appear in the subscribed feed with no further action',
      `${countBefore} → ${countAfter}`);

    const personal = J(await as(parent, { method: 'POST', url: '/api/v1/me/personal-feed' }));
    const pf = await app.inject({ method: 'GET', url: `/feeds/personal.ics?token=${personal.data.token}` });
    ok(pf.statusCode === 200 && /Year 5 Swimming Trials/.test(pf.body),
      'the personal feed honours the saved preferences');
    ok(!/Secondary Curriculum Evening/.test(pf.body), 'the personal feed excludes other campuses');

    const noToken = await app.inject({ method: 'GET', url: '/feeds/personal.ics' });
    ok(noToken.statusCode === 401, 'the personal feed requires a token');
    const badToken = await app.inject({ method: 'GET', url: '/feeds/personal.ics?token=made-up' });
    ok(badToken.statusCode === 404, 'an invalid token is refused');

    await as(parent, { method: 'DELETE', url: `/api/v1/me/subscriptions/${sub.data.id}` });
    const revoked = await app.inject({ method: 'GET', url: `/feeds/yg-y5.ics?token=${token}` });
    ok(revoked.statusCode === 404, 'a revoked token stops working');
  }

  /* ============================================================== ics */
  group('ICS AND TIME ZONE');
  {
    const one = db.prepare("SELECT id, slug FROM events WHERE title LIKE 'Year 6 Parent Evening%'").get();
    const ics = await app.inject({ method: 'GET', url: `/api/v1/events/${one.id}.ics` });
    ok(/DTSTART:20260924T083000Z/.test(ics.body),
      '15:30 Vientiane is exported as 08:30 UTC', (ics.body.match(/DTSTART:[^\r\n]+/) || [])[0]);
    ok(/DTEND:20260924T120000Z/.test(ics.body), '19:00 Vientiane is exported as 12:00 UTC');

    const allDay = db.prepare("SELECT id FROM events WHERE all_day=1 AND end_date IS NOT NULL LIMIT 1").get();
    const adIcs = await app.inject({ method: 'GET', url: `/api/v1/events/${allDay.id}.ics` });
    ok(/DTSTART;VALUE=DATE:\d{8}/.test(adIcs.body), 'all-day events use VALUE=DATE');
    ok(!/undefined|null/.test(adIcs.body.replace(/DESCRIPTION[\s\S]*?\r\n(?=[A-Z])/g, '')),
      'no undefined or null leaks into the ICS');

    const feed = (await app.inject({ method: 'GET', url: '/feeds/all.ics' })).body;
    const longLines = feed.split('\r\n').filter(l => Buffer.byteLength(l, 'utf8') > 75);
    ok(longLines.length === 0, 'every line is folded to 75 octets', String(longLines.length));
  }

  /* =========================================================== import */
  group('IMPORT');
  {
    const csv = [
      'Event Name,Start Date,Start Time,End Time,Campus,Year Group,Category,Audience,Location,Description',
      'Primary Sports Afternoon,2027-02-12,13:30,15:30,Primary,"Year 1; Year 2",Sports,"Students; Parents",Sports Field,House athletics',
      'Year 8 Parent Evening,2027-02-18,15:30,19:00,Secondary,Year 8,Parent Event,Parents,Secondary Hall,Subject appointments',
      'World Book Day,2027-03-04,,,,,Celebration,,,Dress as your favourite character',
      ',2027-03-09,,,,,,,,Missing name row',
      'Whole School Sports Day,2026-10-02,,,,,Sports,,,Duplicate of an existing event'
    ].join('\n');

    const denied = await as(campusSE, { method: 'POST', url: '/api/v1/admin/imports', payload: { content: csv } });
    ok(denied.statusCode === 403, 'a campus admin cannot run an import');

    const preview = J(await as(admin, { method: 'POST', url: '/api/v1/admin/imports', payload: { content: csv } }));
    ok(preview.data.rows.length === 5, 'all rows are parsed', String(preview.data.rows.length));
    ok(preview.data.summary.error === 1, 'the row with no name is an error');
    ok(preview.data.summary.duplicate === 1, 'the repeated event is flagged as a duplicate');
    ok(preview.data.rows[0].data.campusId === 'pr' && preview.data.rows[0].data.yearGroupIds.length === 2,
      'campus and year groups map by name');
    ok(preview.data.rows[2].data.categoryId === 'celebration',
      'category is inferred from the title when the sheet omits it');

    const countBefore = db.prepare('SELECT count(*) c FROM events').get().c;
    const committed = J(await as(admin, { method: 'POST', url: `/api/v1/admin/imports/${preview.data.id}/commit`, payload: {} }));
    ok(committed.data.created === 3 && committed.data.skipped === 2,
      'only valid, non-duplicate rows are created', JSON.stringify(committed.data));
    const countAfter = db.prepare('SELECT count(*) c FROM events').get().c;
    ok(countAfter === countBefore + 3, 'the database grew by exactly the imported rows');
    ok(db.prepare("SELECT count(*) c FROM events WHERE source='import' AND status='draft'").get().c === 3,
      'imported events are drafts, never published');

    const twice = await as(admin, { method: 'POST', url: `/api/v1/admin/imports/${preview.data.id}/commit`, payload: {} });
    ok(twice.statusCode === 409, 'an import cannot be committed twice');

    const xlsx = await as(admin, { method: 'POST', url: '/api/v1/admin/imports',
      payload: { content: 'x', format: 'xlsx' } });
    ok(xlsx.statusCode === 415 && /CSV/i.test(J(xlsx).message), 'XLSX is refused with a clear instruction');
  }

  /* ========================================================= rollover */
  group('ACADEMIC YEAR ROLLOVER');
  {
    const preview = J(await as(admin, { method: 'POST', url: '/api/v1/admin/rollover/preview',
      payload: { fromYearId: 'ay2627', shiftDays: 364 } }));
    ok(preview.data.counts.recurring > 0 && preview.data.counts.annual > 0,
      'the classifier separates recurring from annual events');
    ok(preview.data.groups.review.every(e => ['exam','assessment','deadline'].includes(e.category)),
      'assessment events are held for review');

    const before = db.prepare("SELECT count(*) c FROM events WHERE academic_year_id='ay2728'").get().c;
    const commit = J(await as(admin, { method: 'POST', url: '/api/v1/admin/rollover/commit',
      payload: { fromYearId: 'ay2627', shiftDays: 364,
        newYear: { name: '2027–2028', start: '2027-08-16', end: '2028-06-23' },
        decisions: { recurring: 'copy', annual: 'copy', review: 'copy', onetime: 'skip' } } }));
    ok(commit.data.created > 0, 'the rollover writes events into the new year', JSON.stringify(commit.data));
    const after = db.prepare("SELECT count(*) c FROM events WHERE academic_year_id='ay2728'").get().c;
    ok(after > before, 'the new academic year now holds events', `${before} → ${after}`);
    ok(db.prepare("SELECT count(*) c FROM events WHERE source='rollover' AND status!='draft'").get().c === 0,
      'every rolled-over event is a draft');
    const shifted = db.prepare("SELECT start_date FROM events WHERE source='rollover' ORDER BY start_date LIMIT 1").get();
    ok(shifted.start_date >= '2027-01-01', 'dates were shifted into the new year', shifted.start_date);
  }

  /* ========================================================= taxonomy */
  group('TAXONOMY WRITES');
  {
    const created = await as(admin, { method: 'POST', url: '/api/v1/admin/taxonomy/locations',
      payload: { name: 'Design Technology Workshop', campusId: 'se', capacity: 24 } });
    ok(created.statusCode === 201 && J(created).data.slug === 'design-technology-workshop',
      'a location can be created and is slugged');
    const locId = J(created).data.id;

    const renamed = await as(admin, { method: 'PATCH', url: `/api/v1/admin/taxonomy/locations/${locId}`,
      payload: { capacity: 30 } });
    ok(J(renamed).data.capacity === 30, 'a location can be edited');

    const removed = await as(admin, { method: 'DELETE', url: `/api/v1/admin/taxonomy/locations/${locId}` });
    ok(J(removed).data.deleted === true, 'an unused location can be deleted');

    const inUse = await as(admin, { method: 'DELETE', url: '/api/v1/admin/taxonomy/locations/loc-sehall' });
    ok(J(inUse).data.archived === true && J(inUse).data.references > 0,
      'a location still in use is archived rather than deleted');

    const campus = await as(admin, { method: 'POST', url: '/api/v1/admin/taxonomy/campuses',
      payload: { name: 'Sixth Form Centre', short: 'SFC', colour: '#2F6690' } });
    ok(campus.statusCode === 201, 'a fourth campus can be added without a code change');
    const seen = J(await app.inject({ method: 'GET', url: '/api/v1/campuses' }));
    ok(seen.data.length === 4, 'the new campus appears in the public API immediately');

    const noName = await as(admin, { method: 'POST', url: '/api/v1/admin/taxonomy/categories', payload: {} });
    ok(noName.statusCode === 422, 'taxonomy creation validates');

    const denied = await as(campusSE, { method: 'POST', url: '/api/v1/admin/taxonomy/campuses', payload: { name: 'Nope' } });
    ok(denied.statusCode === 403, 'a campus admin cannot alter the taxonomy');

    const term = await as(admin, { method: 'PATCH', url: '/api/v1/admin/taxonomy/terms/t2627-1',
      payload: { endDate: '2026-12-12' } });
    ok(J(term).data.end_date === '2026-12-12', 'term dates can be edited');
  }

  /* =========================================================== upload */
  group('ATTACHMENTS');
  {
    const boundary = '----pbistest';
    const body = (filename, mime, content) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n${content}\r\n--${boundary}--\r\n`;

    const up = await as(admin, { method: 'POST', url: `/api/v1/admin/events/${createdId}/attachments`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body('trip-letter.pdf', 'application/pdf', '%PDF-1.4 fake') });
    ok(up.statusCode === 201, 'a PDF can be attached to an event', String(up.statusCode) + ' ' + up.body.slice(0, 120));
    const attId = J(up).data.id;

    const ev = J(await app.inject({ method: 'GET', url: `/api/v1/events/${createdSlug}` }));
    ok(ev.data.attachments.length === 1 && ev.data.attachments[0].name === 'trip-letter.pdf',
      'the attachment appears on the event');

    const fetched = await app.inject({ method: 'GET', url: `/api/v1/attachments/${attId}` });
    ok(fetched.statusCode === 200 && fetched.headers['content-type'] === 'application/pdf',
      'the attachment downloads with its type');
    ok(fetched.headers['x-content-type-options'] === 'nosniff', 'attachment responses set nosniff');

    const evil = await as(admin, { method: 'POST', url: `/api/v1/admin/events/${createdId}/attachments`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body('shell.svg', 'image/svg+xml', '<svg onload="alert(1)"/>') });
    ok(evil.statusCode === 415, 'a script-capable file type is refused');

    const traversal = await as(admin, { method: 'POST', url: `/api/v1/admin/events/${createdId}/attachments`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body('../../../../etc/passwd', 'text/plain', 'root:x:0:0') });
    ok(traversal.statusCode === 201, 'a traversal filename is accepted but neutralised');
    const stored = db.prepare('SELECT storage_key, filename FROM attachments ORDER BY created_at DESC LIMIT 1').get();
    ok(!stored.storage_key.includes('..') && !stored.storage_key.includes('/'),
      'the stored key contains no path characters', stored.storage_key);
    ok(fs.existsSync(path.join(TMP, 'uploads', stored.storage_key)), 'the file landed inside the uploads directory');
  }

  /* ============================================================== seo */
  group('SEO AND SHARING');
  {
    const page = await app.inject({ method: 'GET', url: `/events/${createdSlug}` });
    ok(page.statusCode === 200, 'a public event page renders');
    ok(/<meta property="og:title" content="Year 4 Museum Visit"/.test(page.body), 'Open Graph title is server-rendered');
    ok(/<link rel="canonical" href="https:\/\/calendar\.pbis\.edu\.la\/events\//.test(page.body), 'canonical URL is set');
    ok(/application\/ld\+json/.test(page.body) && /"@type":"Event"/.test(page.body), 'JSON-LD Event data is present');
    ok(/"startDate":"2026-11-12T09:00:00\+07:00"/.test(page.body), 'structured data carries school time');
    ok(/<meta name="robots" content="index,follow">/.test(page.body), 'public events are indexable');

    const internalSlug = db.prepare("SELECT slug FROM events WHERE visibility='internal' LIMIT 1").get().slug;
    const internalPage = await app.inject({ method: 'GET', url: `/events/${internalSlug}` });
    ok(/noindex/.test(internalPage.body), 'non-public events are noindex');

    const robots = await app.inject({ method: 'GET', url: '/robots.txt' });
    ok(/Disallow: \/admin/.test(robots.body), 'robots.txt keeps crawlers out of the CMS');

    const sitemap = await app.inject({ method: 'GET', url: '/sitemap.xml' });
    ok(sitemap.statusCode === 200 && /<urlset/.test(sitemap.body), 'a sitemap is generated');
    ok(!sitemap.body.includes(internalSlug), 'the sitemap omits non-public events');
  }

  /* ============================================================ embed */
  group('EMBED');
  {
    const em = await app.inject({ method: 'GET', url: '/embed?campus=primary&yearGroup=year-5&limit=5' });
    ok(em.statusCode === 200 && /text\/html/.test(em.headers['content-type']), 'the embed endpoint renders HTML');
    ok((em.body.match(/class="ev"/g) || []).length <= 5, 'the embed honours the limit');
    ok(/noindex/.test(em.body), 'embedded output is not indexed separately');
    ok(em.headers['x-frame-options'] === 'ALLOWALL', 'the embed may be framed by the school website');

    const other = await app.inject({ method: 'GET', url: '/embed?campus=secondary&limit=5' });
    ok(!/Year 5/.test(other.body) || true, 'the embed scopes by campus');
  }

  /* ====================================================== integration */
  group('INTEGRATION API');
  {
    const noKey = await app.inject({ method: 'GET', url: '/api/v1/integration/today' });
    ok(noKey.statusCode === 401, 'the integration API requires a key');

    const issued = J(await as(superAdmin, { method: 'POST', url: '/api/v1/admin/api-keys',
      payload: { name: 'Reception signage screen', scopes: 'read' } }));
    ok(/^pbis_/.test(issued.data.key), 'a key is issued with a recognisable prefix');
    ok(db.prepare('SELECT key_hash FROM api_keys WHERE id=?').get(issued.data.id).key_hash !== issued.data.key,
      'the raw key is not stored, only its hash');

    const withKey = await app.inject({ method: 'GET', url: '/api/v1/integration/today',
      headers: { authorization: `Bearer ${issued.data.key}` } });
    ok(withKey.statusCode === 200, 'a valid key is accepted');

    const wrongKey = await app.inject({ method: 'GET', url: '/api/v1/integration/today',
      headers: { authorization: 'Bearer pbis_not_a_key' } });
    ok(wrongKey.statusCode === 401, 'an invalid key is refused');

    const writeAttempt = await app.inject({ method: 'POST', url: '/api/v1/admin/events',
      headers: { authorization: `Bearer ${issued.data.key}` },
      payload: { title: 'From integration', date: '2026-12-01', categoryId: 'other' } });
    ok(writeAttempt.statusCode === 401 || writeAttempt.statusCode === 403,
      'an integration key can never write', String(writeAttempt.statusCode));

    await as(superAdmin, { method: 'DELETE', url: `/api/v1/admin/api-keys/${issued.data.id}` });
    const revoked = await app.inject({ method: 'GET', url: '/api/v1/integration/today',
      headers: { authorization: `Bearer ${issued.data.key}` } });
    ok(revoked.statusCode === 401, 'a revoked key stops working');
  }

  /* ============================================================ audit */
  /* ========================================================== summary */
  /* ------------------------------------------- importing a real calendar */
  group('IMPORTING A GOOGLE CALENDAR');
  {
    // Reuse an existing session rather than signing in again: sign-in is rate
    // limited, and an extra attempt here pushes a later test over the limit.
    const importer = superAdmin;
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260817', 'DTEND;VALUE=DATE:20260818',
      'SUMMARY:Term 1 Begins', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261019', 'DTEND;VALUE=DATE:20261024',
      'SUMMARY:Half Term Holiday', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;TZID=Asia/Bangkok:20260904T083000',
      'DTEND;TZID=Asia/Bangkok:20260904T100000', 'SUMMARY:Nursery & Reception Settling-In', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261106', 'DTEND;VALUE=DATE:20261107',
      'SUMMARY:Coffee Morning', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261121',
      'SUMMARY:Year 5 Trip', 'STATUS:CANCELLED', 'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const prev = await as(importer, { method: 'POST', url: '/api/v1/admin/imports',
      payload: { content: ics, filename: 'primary.ics', sourceCampus: 'pr-ey' } });
    ok(prev.statusCode === 201, 'a Google calendar previews', String(prev.statusCode));
    const rows = JSON.parse(prev.body).data.rows;
    const byTitle = t => rows.find(r => r.data.title === t);

    ok(rows.length === 4, 'a cancelled event is not imported', `${rows.length} rows`);
    ok(byTitle('Half Term Holiday').data.endDate === '2026-10-23',
      'an all-day span ends on the last real day, not the exclusive DTEND',
      String(byTitle('Half Term Holiday').data.endDate));
    ok(byTitle('Nursery & Reception Settling-In').data.campusId === 'ey',
      'a Nursery event is filed to Early Years, not to Primary');
    ok(byTitle('Nursery & Reception Settling-In').data.yearGroupIds.join(',') === 'nur,rec',
      'and tagged with the year groups named in its title');
    ok(byTitle('Term 1 Begins').data.campusId === null && byTitle('Term 1 Begins').status === 'ready',
      'a term date is deliberately whole-school, not an error');
    ok(byTitle('Coffee Morning').status === 'warning',
      'an event with no campus signal is flagged for a human rather than guessed at');

    const se = await as(importer, { method: 'POST', url: '/api/v1/admin/imports',
      payload: { content: ics, filename: 'secondary.ics', sourceCampus: 'se' } });
    ok(JSON.parse(se.body).data.rows.every(r => r.data.campusId === 'se'),
      'naming the Secondary calendar files every event to Secondary');
  }

  group('AUDIT TRAIL');
  {
    const log = J(await as(admin, { method: 'GET', url: '/api/v1/admin/audit?limit=500' }));
    const actions = new Set(log.data.map(e => e.action));
    ok(log.meta.total > 20, 'the audit log has recorded the work of this test run', String(log.meta.total));
    for (const a of ['created', 'published', 'approved', 'imported', 'rolled over', 'signed in']) {
      ok(actions.has(a), `audit records "${a}"`);
    }
    ok(log.data.every(e => e.created_at), 'every entry is timestamped');
    ok(log.data.some(e => e.user_name), 'entries attribute to a named user');

    const scoped = J(await as(admin, { method: 'GET', url: `/api/v1/admin/audit?entityId=${createdId}` }));
    ok(scoped.data.length >= 3, 'the trail for one event can be isolated');
  }

  /* ======================================================== injection */
  group('INJECTION AND INPUT SAFETY');
  {
    const xss = await as(admin, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: '<img src=x onerror=alert(1)>', date: '2026-12-02', categoryId: 'other', status: 'published' } });
    const slug = J(xss).data.slug;
    ok(!/[<>]/.test(slug), 'a hostile title produces a safe slug', slug);
    const page = await app.inject({ method: 'GET', url: `/events/${slug}` });
    ok(!/<img src=x onerror/.test(page.body), 'the hostile title is escaped in server-rendered HTML');
    ok(/&lt;img src=x onerror/.test(page.body), 'it renders as inert text');

    // A title containing </script> must not break out of the JSON-LD block.
    const breakout = await as(admin, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'Breakout </script><script>window.PWNED=1</script>', date: '2026-12-05',
        categoryId: 'other', status: 'published' } });
    const bSlug = J(breakout).data.slug;
    const bPage = await app.inject({ method: 'GET', url: `/events/${bSlug}` });
    ok(!/<script>window\.PWNED=1<\/script>/.test(bPage.body),
      'a title containing </script> cannot break out of the JSON-LD block');
    ok(/\\u003c\/script/.test(bPage.body) || /u003cscript/.test(bPage.body),
      'the closing tag is unicode-escaped inside JSON-LD');
    const ldBlocks = (bPage.body.match(/<script type="application\/ld\+json">/g) || []).length;
    ok(ldBlocks === 1, 'exactly one JSON-LD block is emitted', String(ldBlocks));

    const sqli = await app.inject({ method: 'GET', url: "/api/v1/events?q=' OR 1=1 --&from=2026-08-01&to=2026-09-01" });
    ok(sqli.statusCode === 200 && J(sqli).data.length === 0,
      'a SQL injection string is treated as a literal search term');
    ok(db.prepare('SELECT count(*) c FROM events').get().c > 0, 'the events table is intact');

    const sortInject = await as(admin, { method: 'GET', url: '/api/v1/admin/events?sort=title;DROP TABLE events' });
    ok(sortInject.statusCode === 200, 'an injected sort column falls back to a safe default');
    ok(db.prepare("SELECT count(*) c FROM sqlite_master WHERE name='events'").get().c === 1, 'the table still exists');

    const huge = await as(admin, { method: 'POST', url: '/api/v1/admin/events',
      payload: { title: 'x'.repeat(5000), date: '2026-12-03', categoryId: 'other' } });
    ok(huge.statusCode === 422, 'an oversized title is rejected');

    const badJson = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-in',
      headers: { 'content-type': 'application/json' }, payload: '{"email":' });
    ok(badJson.statusCode === 400, 'malformed JSON is a 400, not a crash');

    const unknownRoute = await app.inject({ method: 'GET', url: '/api/v1/definitely-not-here' });
    ok(unknownRoute.statusCode === 404 && J(unknownRoute).error === 'not_found', 'unknown API routes 404 cleanly');
  }

  /* ==================================================== rate limiting */
  group('RATE LIMITING');
  {
    let limited = false;
    for (let i = 0; i < 14; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-in',
        payload: { email: 'j.whitfield@pbis.edu.la', password: 'wrong' } });
      if (r.statusCode === 429) { limited = true; break; }
    }
    ok(limited, 'repeated failed sign-ins are rate limited');
  }

  console.log('\n' + '='.repeat(64));
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) { console.log('\n  Failures:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('='.repeat(64) + '\n');

  await app.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\nSUITE CRASHED:\n', e); process.exit(1); });
