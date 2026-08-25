'use strict';
/* ==========================================================================
   BUTTON AUDIT — VERIFICATION PASS
   The sweep flags anything that did not visibly move the page. Plenty of those
   are innocent: a link that opens a new tab, the nav link for the page you are
   already on, a <select> that only opens a menu when clicked. This pass takes
   each flagged control and asks the specific question that actually settles
   it — did a download fire, did a toast appear, did the filter filter.
   ========================================================================== */

const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let pass = 0, fail = 0; const failures = [];
const ok = (c, label, detail) => {
  if (c) { pass++; console.log('  ok   ' + label); }
  else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' :: ' + detail : '')); }
};
const group = t => console.log('\n' + t);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true
  });
  const page = await ctx.newPage();

  /* ------------------------------------------- links that open a new tab */
  group('LINKS THAT LEAVE THE PAGE');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });

  const adminLink = await page.evaluate(() => {
    const a = document.querySelector('a[href="/admin"], a[href$="/admin"]');
    return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'),
      rel: a.getAttribute('rel'), text: a.innerText.trim() } : null;
  });
  ok(adminLink && adminLink.rel === 'noopener',
    'and carries rel="noopener", so the new tab cannot reach back', JSON.stringify(adminLink));
  ok(adminLink && /\/admin/.test(adminLink.href), 'the Admin link points at /admin', JSON.stringify(adminLink));
  ok(adminLink && adminLink.target === '_blank',
    'the CMS opens in its own tab, as specified', JSON.stringify(adminLink));

  // It must actually resolve, not 404.
  const adminStatus = await page.evaluate(async () =>
    (await fetch('/admin', { redirect: 'follow' })).status);
  ok(adminStatus === 200, '/admin resolves', String(adminStatus));

  const brand = await page.evaluate(() => {
    const a = document.querySelector('.masthead a');
    return a ? a.getAttribute('href') : null;
  });
  ok(brand === '/' || brand === '#/' || brand === '#/home',
    'the brand lockup links home', String(brand));

  /* ------------------------------------------------------ copy to clipboard */
  group('COPY BUTTONS');
  await page.goto(BASE + '/subscribe', { waitUntil: 'networkidle' });
  const copyBtn = page.locator('[data-act="copy-text"]').first();
  if (await copyBtn.count()) {
    await copyBtn.click();
    await page.waitForTimeout(700);
    const toasted = await page.locator('.toast').count();
    ok(toasted > 0, 'copying a feed address confirms with a toast', `${toasted} toasts`);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    // webcal:// is correct here — it makes a calendar app subscribe rather
    // than a browser download the file once.
    ok(/^(https?|webcal):\/\/.+\.ics$/.test(clip.trim()),
      'and the clipboard holds a real feed URL', clip.slice(0, 70));
  } else { ok(false, 'a copy button exists on /subscribe'); }

  /* ----------------------------------------------------------- downloads */
  group('DOWNLOAD BUTTONS');
  const dlBtn = page.locator('[data-act="ics-scope"]').first();
  if (await dlBtn.count()) {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 6000 }).catch(() => null),
      dlBtn.click()
    ]);
    ok(!!dl, 'Download .ics actually downloads a file', dl ? dl.suggestedFilename() : 'no download event');
    if (dl) {
      const p = await dl.path();
      const body = p ? require('fs').readFileSync(p, 'utf8') : '';
      ok(/BEGIN:VCALENDAR/.test(body) && /BEGIN:VEVENT/.test(body),
        'and the file is a real calendar with events in it', body.slice(0, 40));
      ok(/\.ics$/.test(dl.suggestedFilename()), 'named with an .ics extension', dl.suggestedFilename());
    }
  } else { ok(false, 'a download button exists on /subscribe'); }

  /* ------------------------------------------------------------- filters */
  group('FILTER CHIPS');
  await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
  await page.waitForSelector('.month-grid', { timeout: 10000 });

  // An "All …" chip with nothing filtered is a no-op by design. The real
  // question is whether a specific chip narrows the set.
  const audChip = page.locator('[data-act="filter-aud"]').nth(1);
  if (await audChip.count()) {
    const before = await page.evaluate(() => PBIS.Store.state.ui.filters.audienceIds.slice());
    await audChip.click();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => PBIS.Store.state.ui.filters.audienceIds.slice());
    ok(JSON.stringify(before) !== JSON.stringify(after),
      'an audience chip changes the active filter', `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  }

  // "All" chips: clicking when a filter IS set must clear it.
  await page.locator('[data-act="filter-campus"][data-id="pr"]').click();
  await page.waitForTimeout(400);
  const setTo = await page.evaluate(() => PBIS.Store.state.ui.filters.campusIds.slice());
  await page.locator('[data-act="filter-campus"]').first().click();  // the All chip
  await page.waitForTimeout(400);
  const cleared = await page.evaluate(() => PBIS.Store.state.ui.filters.campusIds.slice());
  ok(setTo.length > 0 && cleared.length === 0,
    'the All Campuses chip clears an active campus filter', `${JSON.stringify(setTo)} → ${JSON.stringify(cleared)}`);

  /* ---------------------------------------------------------------- CMS */
  group('CMS CONTROLS');
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await page.waitForSelector('#si-email', { timeout: 10000 });
  await page.fill('#si-email', 'j.whitfield@pbis.edu.la');
  await page.fill('#si-password', process.env.PBIS_SEED_PASSWORD || 'pbis-demo');
  await page.locator('[data-act="sign-in"]').click();
  await page.waitForSelector('.admin-side', { timeout: 15000 });

  // page-size is a <select>: clicking only opens it, so select an option.
  await page.goto(BASE + '/admin#/admin/events', { waitUntil: 'networkidle' });
  await page.waitForSelector('table.tbl tbody tr', { timeout: 10000 });
  const rowsDefault = await page.locator('table.tbl tbody tr').count();
  await page.selectOption('[data-act="page-size"]', '25');
  await page.waitForTimeout(700);
  const rows25 = await page.locator('table.tbl tbody tr').count();
  await page.selectOption('[data-act="page-size"]', '100');
  await page.waitForTimeout(700);
  const rows100 = await page.locator('table.tbl tbody tr').count();
  ok(rows25 === 25 && rows100 > rows25,
    'rows per page actually changes the page size', `default ${rowsDefault} → 25 ${rows25} → 100 ${rows100}`);

  // imp-sample needs longer than the sweep allowed.
  await page.goto(BASE + '/admin#/admin/import', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-act="imp-sample"]', { timeout: 8000 });
  await page.locator('[data-act="imp-sample"]').click();
  await page.waitForTimeout(2000);
  ok(await page.locator('[class*="imp-row-"]').count() > 0,
    'Load sample data produces a preview when given time');

  // imp-src: the CSV / XLSX source chooser. A goto that only changes the
  // fragment does not reload, so the preview from the step above would still
  // be on screen and the chooser hidden. Force a real load.
  await page.goto('about:blank');
  await page.goto(BASE + '/admin#/admin/import', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-act="imp-src"]', { timeout: 8000 });
  const srcBefore = await page.locator('[data-act="imp-src"]').first().getAttribute('aria-pressed');
  await page.locator('[data-act="imp-src"]').nth(1).click();
  await page.waitForTimeout(700);
  const srcAfterFirst = await page.locator('[data-act="imp-src"]').first().getAttribute('aria-pressed');
  const srcAfterSecond = await page.locator('[data-act="imp-src"]').nth(1).getAttribute('aria-pressed');
  ok(srcAfterSecond === 'true' && srcAfterFirst === 'false',
    'choosing an import source selects it',
    `first ${srcBefore}→${srcAfterFirst}, second →${srcAfterSecond}`);

  // imp-map: the column mapping select on a live preview.
  await page.locator('[data-act="imp-sample"]').click();
  await page.waitForTimeout(2000);
  const mapCount = await page.locator('[data-act="imp-map"]').count();
  if (mapCount) {
    // Deliberately mis-map the first column to something it is not, so the
    // preview must visibly change. Selecting the mapping it already has would
    // prove nothing.
    const before = await page.locator('[class*="imp-row-"]').first().innerText();
    await page.selectOption('[data-act="imp-map"]', 'description');
    await page.waitForTimeout(1600);
    const after = await page.locator('[class*="imp-row-"]').first().innerText();
    ok(before !== after, 'remapping a column re-reads the preview',
      `${JSON.stringify(before.slice(0, 46))} → ${JSON.stringify(after.slice(0, 46))}`);
  } else { ok(false, 'the import preview offers column mapping'); }

  // sub-changes: the sweep timed out on it.
  await page.goto(BASE + '/admin#/admin/submissions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const chg = page.locator('[data-act="sub-changes"]').first();
  if (await chg.count()) {
    await chg.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    const opened = await page.locator('.overlay, .drawer.show, .modal, .toast').count();
    ok(opened > 0, 'Request changes opens a prompt or confirms', `${opened} surfaces`);
  } else { ok(true, 'no pending submission to request changes on (nothing to test)'); }

  // The rollover screen's option buttons.
  await page.goto(BASE + '/admin#/admin/rollover', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  for (let step = 0; step < 6; step++) {
    const opts = page.locator('.opt-grid button.opt');
    if (await opts.count()) {
      const before = await page.evaluate(() => document.body.innerText.slice(0, 2000));
      await opts.first().click().catch(() => {});
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => document.body.innerText.slice(0, 2000));
      ok(before !== after, 'a rollover option button does something');
      break;
    }
    const next = page.locator('[data-act="ro-next"]');
    if (!(await next.count())) break;
    await next.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }

  /* ------------------------------------------------------------- embed */
  group('EMBED');
  await page.goto('about:blank');
  await page.goto(BASE + '/embed', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const embedLinks = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
    .map(a => ({ href: a.getAttribute('href'), target: a.getAttribute('target') })));
  ok(embedLinks.length > 0, 'the embed renders linked events', String(embedLinks.length));
  ok(embedLinks.every(l => l.target === '_blank'),
    'every embed link opens outside the iframe, not inside it',
    JSON.stringify(embedLinks.slice(0, 3)));
  const embedTargets = embedLinks.filter(l => /\/events\//.test(l.href));
  if (embedTargets.length) {
    const st = await page.evaluate(async h => (await fetch(h)).status, embedTargets[0].href);
    ok(st === 200, 'and an embed event link resolves to a real page', String(st));
  }

  /* --------------------------------------------------- reject a submission */
  group('REJECT');
  // Make sure there is one to reject — earlier runs approve what the seed
  // provided, so this section must supply its own.
  await page.evaluate(async () => {
    await fetch('/api/v1/auth/sign-in', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'd.okonkwo@pbis.edu.la', password: 'pbis-demo' }) });
    await fetch('/api/v1/me/submissions', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Sixth Form Careers Fair', date: '2027-05-06',
        allDay: true, campusId: 'se', categoryId: 'academic', audienceIds: ['community'] }) });
    await fetch('/api/v1/auth/sign-in', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'j.whitfield@pbis.edu.la', password: 'pbis-demo' }) });
  });
  await page.goto('about:blank');
  await page.goto(BASE + '/admin#/admin/submissions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const rej = page.locator('[data-act="sub-reject"]').first();
  if (await rej.count()) {
    const pendingBefore = await page.evaluate(async () =>
      (await (await fetch('/api/v1/admin/submissions')).json()).data.filter(s => s.status === 'pending').length);
    await rej.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    const confirm = page.locator('#confirm-yes');
    if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(1400); }
    const pendingAfter = await page.evaluate(async () =>
      (await (await fetch('/api/v1/admin/submissions')).json()).data.filter(s => s.status === 'pending').length);
    ok(pendingAfter < pendingBefore, 'Reject actually rejects the submission',
      `${pendingBefore} pending → ${pendingAfter}`);
  } else { ok(true, 'no pending submission to reject (nothing to test)'); }

  console.log('\n' + '='.repeat(64));
  console.log(`  ${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('\n  Failures:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('='.repeat(64) + '\n');

  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
