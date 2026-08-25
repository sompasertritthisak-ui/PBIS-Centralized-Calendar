'use strict';
/* End-to-end: the real interface, against the real server and database. */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3000';

let pass = 0, fail = 0; const failures = [];
const ok = (c, label, detail) => { if (c) { pass++; console.log('  ok   ' + label); }
  else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' :: ' + detail : '')); } };
const group = t => console.log('\n' + t);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  // Some steps provoke a rejection on purpose (a wrong password, an anonymous
  // probe). Those windows set `expecting401` so a deliberate 401 is not counted
  // as a page error, while an unexpected one anywhere else still is.
  let expecting401 = false;
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|fonts\.googleapis|net::ERR/.test(t)) return;
    if (expecting401 && /status of 401/.test(t)) return;
    errors.push('CONSOLE: ' + t);
  });

  /* ------------------------------------------------ public app boots */
  group('PUBLIC APP');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.hero', { timeout: 15000 });
  ok(await page.locator('.masthead').isVisible(), 'the public app boots from the server');
  const heroEvents = await page.locator('.hero-ev').count();
  ok(heroEvents > 0, 'Today at PBIS is populated from the database', String(heroEvents));
  ok(await page.locator('.logo-full').first().isVisible(), 'the 25th anniversary lockup renders');

  const eventCount = await page.evaluate(() => PBIS.Store.state.events.length);
  ok(eventCount > 40, 'events came from the API, not a seed file', String(eventCount));
  ok(await page.evaluate(() => PBIS.Store.user().role === 'public'), 'an anonymous visitor is the public role');
  ok(await page.evaluate(() => PBIS.Store.state.events.every(e => e.visibility === 'public')),
    'the client never even receives non-public events');

  /* ---------------------------------------------------------- calendar */
  group('CALENDAR');
  await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
  await page.waitForSelector('.month-grid', { timeout: 10000 });
  ok(await page.locator('.pill').count() > 0, 'the month grid renders events');
  for (const v of ['week', 'day', 'agenda', 'year', 'month']) {
    await page.locator(`[data-act="set-view"][data-view="${v}"]`).click();
    await page.waitForTimeout(260);
    ok(await page.locator('.cal-body').isVisible(), `${v} view renders`);
  }
  await page.locator('[data-act="filter-campus"][data-id="pr"]').click();
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => PBIS.Store.state.ui.filters.campusIds.includes('pr')), 'campus filter applies');
  await page.locator('[data-act="clear-filters"]').first().click();
  await page.waitForTimeout(200);

  await page.locator('.pill').first().click();
  await page.waitForSelector('.drawer.show', { timeout: 5000 });
  ok(true, 'the event drawer opens');
  const icsHref = await page.locator('.drawer a[href*="calendar.google.com"]').first().getAttribute('href');
  ok(/ctz=Asia%2FVientiane/.test(icsHref || ''), 'Add to Google carries the school time zone');
  await page.keyboard.press('Escape');

  // navigating past the cached window must refetch
  const before = await page.evaluate(() => PBIS.Store.state.window.to);
  for (let i = 0; i < 8; i++) { await page.locator('[data-act="cal-next"]').first().click(); await page.waitForTimeout(120); }
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => PBIS.Store.state.window.to);
  ok(after > before, 'the client widens its window when you page forward', `${before} → ${after}`);

  /* --------------------------------------------------------- event page */
  group('EVENT PAGE');
  const slug = await page.evaluate(() => PBIS.Store.state.events.find(e => e.status === 'published').slug);
  await page.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle' });
  ok(await page.locator('h1').first().isVisible(), 'a shared event link renders its own page');
  const ogTags = await page.locator('meta[property="og:title"]').count();
  ok(ogTags === 1, 'exactly one og:title is emitted', String(ogTags));
  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
  const h1 = (await page.locator('h1').first().textContent()).trim();
  ok(ogTitle === h1, 'the Open Graph title matches the event', `${ogTitle} vs ${h1}`);
  ok(await page.locator('script[type="application/ld+json"]').count() === 1, 'one JSON-LD block');

  /* ----------------------------------------------------------- CMS gate */
  group('CMS');
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await page.waitForSelector('.signin', { timeout: 10000 });
  ok(true, '/admin presents the sign-in gate');
  ok(await page.locator('#si-email').isVisible() && await page.locator('#si-password').isVisible(),
    'sign-in asks for real credentials');
  ok(await page.locator('.admin-side').count() === 0, 'no CMS navigation before sign-in');

  expecting401 = true;
  await page.fill('#si-email', 'j.whitfield@pbis.edu.la');
  await page.fill('#si-password', 'wrong-password');
  await page.locator('[data-act="sign-in"]').click();
  await page.waitForTimeout(900);
  ok(await page.locator('#si-error').isVisible(), 'a wrong password shows an error and stays on the gate');
  ok(await page.locator('.admin-side').count() === 0, 'a failed sign-in does not reveal the CMS');

  expecting401 = false;
  await page.fill('#si-password', 'pbis-demo');
  await page.locator('[data-act="sign-in"]').click();
  await page.waitForSelector('.admin-side', { timeout: 10000 });
  ok(true, 'correct credentials reach the dashboard');
  ok(await page.locator('.masthead-admin').isVisible(), 'the CMS has its own chrome');
  const stats = await page.locator('.stat .v').allTextContents();
  ok(stats.length >= 4 && Number(stats[0]) > 0, 'dashboard statistics come from the server', stats.join('/'));

  /* ------------------------------------------------------ create+publish */
  group('CREATE AND PUBLISH');
  await page.locator('[data-act="new-event"]').first().click();
  await page.waitForSelector('.drawer.show');
  await page.fill('#ed-title', 'Year 3 Planetarium Visit');
  await page.fill('#ed-date', '2026-11-26');
  await page.locator('[data-act="ed-save-quick"]').click();
  await page.waitForSelector('#ed-campus', { timeout: 8000 });
  ok(true, 'quick create saves and opens advanced details');

  await page.selectOption('#ed-campus', 'pr');
  await page.waitForTimeout(250);
  await page.locator('[data-act="ed-yg"][data-id="y3"]').click();
  await page.waitForTimeout(200);
  await page.selectOption('#ed-cat', 'trip');
  await page.waitForTimeout(200);
  await page.locator('[data-act="ed-save"][data-status="published"]').click();
  await page.waitForTimeout(1200);
  ok(await page.locator('.drawer.show').count() === 0, 'the editor closes after publishing');

  const persisted = await fetch(`${BASE}/api/v1/events?from=2026-11-26&to=2026-11-26`).then(r => r.json());
  ok(persisted.data.some(e => e.title === 'Year 3 Planetarium Visit'),
    'the event is in the database and on the public API');

  const inFeed = await fetch(`${BASE}/feeds/primary.ics`).then(r => r.text());
  ok(/Year 3 Planetarium Visit/.test(inFeed),
    'and it appears in the live Primary feed with no further action');

  /* ------------------------------------------------------------- events */
  group('EVENTS TABLE');
  await page.goto(BASE + '/admin#/admin/events', { waitUntil: 'networkidle' });
  await page.waitForSelector('table.tbl tbody tr', { timeout: 10000 });
  const rows = await page.locator('table.tbl tbody tr').count();
  ok(rows > 0 && rows <= 50, 'the events table is paginated', String(rows));
  await page.locator('[data-act="sort"][data-key="title"]').click();
  await page.waitForTimeout(400);
  ok(await page.locator('table.tbl tbody tr').count() > 0, 'sorting works');

  /* --------------------------------------------------------- taxonomy */
  group('TAXONOMY WRITES FROM THE UI');
  await page.goto(BASE + '/admin#/admin/locations', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-act="tax-add"]', { timeout: 8000 });
  await page.locator('[data-act="tax-add"]').click();
  await page.waitForSelector('#tx-name', { timeout: 5000 });
  await page.fill('#tx-name', 'Rooftop Garden');
  await page.fill('#tx-capacity', '40');
  await page.locator('[data-act="tax-save"]').click();
  await page.waitForTimeout(1400);
  const locs = await fetch(`${BASE}/api/v1/taxonomy`).then(r => r.json());
  ok(locs.data.locations.some(l => l.name === 'Rooftop Garden'),
    'a location created in the CMS is in the database');
  ok(await page.evaluate(() => PBIS.LOCATIONS.some(l => l.name === 'Rooftop Garden')),
    'and the running app picked it up without a reload');

  // Clean up after ourselves. Without this every run leaves another "Rooftop
  // Garden" behind, and after a dozen runs the school's real location list is
  // buried under test litter.
  const removed = await page.evaluate(async () => {
    const all = (await (await fetch('/api/v1/taxonomy')).json()).data.locations
      .filter(l => l.name === 'Rooftop Garden');
    let n = 0;
    for (const l of all) {
      const r = await fetch('/api/v1/admin/taxonomy/locations/' + l.id, { method: 'DELETE' });
      if (r.ok) n++;
    }
    return n;
  });
  ok(removed > 0, 'and the test cleans the location up again', `${removed} removed`);

  /* ------------------------------------------------------- submissions */
  group('SUBMISSIONS');
  // Don't depend on seeded submissions surviving: an earlier run — or the
  // button sweep — may already have approved them all. Submit one as a
  // teacher first, so this section always has something real to act on.
  await page.evaluate(async () => {
    const r = await fetch('/api/v1/auth/sign-in', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'd.okonkwo@pbis.edu.la', password: 'pbis-demo' })
    });
    if (!r.ok) return;
    await fetch('/api/v1/me/submissions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Year 9 Debating Final', date: '2027-03-18', allDay: true,
        campusId: 'se', categoryId: 'academic', audienceIds: ['community']
      })
    });
  });
  // That signed the browser in as the teacher; sign back in as the administrator.
  await page.evaluate(async () => {
    await fetch('/api/v1/auth/sign-in', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'j.whitfield@pbis.edu.la', password: 'pbis-demo' })
    });
  });
  // A fragment-only navigation does not reload, so the app would still be
  // showing the submission list it fetched at boot — before the one above
  // existed. Force a real document load.
  await page.goto('about:blank');
  await page.goto(BASE + '/admin#/admin/submissions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const subCount = await page.locator('[data-act="sub-approve"]').count();
  ok(subCount > 0, 'pending submissions are listed', String(subCount));
  if (subCount) {
    await page.locator('[data-act="sub-approve"]').first().click();
    await page.waitForTimeout(1600);
    ok(await page.locator('.toast').count() > 0, 'approving publishes and confirms');
  }

  /* ------------------------------------------------------------ import */
  group('IMPORT');
  await page.goto(BASE + '/admin#/admin/import', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-act="imp-sample"]', { timeout: 8000 });
  await page.locator('[data-act="imp-sample"]').click();
  await page.waitForTimeout(1500);
  const impRows = await page.locator('[class*="imp-row-"]').count();
  ok(impRows > 0, 'the import preview comes back from the server', String(impRows));
  ok(await page.locator('[data-act="imp-commit"]').isVisible(), 'a commit step is offered');

  /* ------------------------------------------------------------ signout */
  group('SESSION');
  await page.locator('[data-act="sign-out"]').first().click();
  await page.waitForSelector('#confirm-yes', { timeout: 5000 });
  await page.locator('#confirm-yes').click();
  await page.waitForSelector('.signin', { timeout: 8000 });
  ok(true, 'signing out returns to the gate');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  ok(await page.locator('.signin').count() > 0, 'the session is really gone after a reload');

  /* ---------------------------------------------------------- responsive */
  group('RESPONSIVE');
  let overflow = 0;
  for (const w of [375, 768, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of ['/', '/calendar', '/subscribe', '/admin']) {
      await page.goto(BASE + p, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (o > 2) { console.log(`  FAIL overflow ${w} ${p}: ${o}px`); overflow++; }
    }
  }
  ok(overflow === 0, 'no horizontal overflow at 375 / 768 / 1440 on either surface');

  console.log('\n' + '='.repeat(60));
  console.log(`  ${pass} passed, ${fail} failed`);
  if (errors.length) { console.log('\n  Page errors:'); [...new Set(errors)].forEach(e => console.log('   - ' + e)); }
  if (failures.length) { console.log('\n  Failures:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('='.repeat(60) + '\n');

  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
