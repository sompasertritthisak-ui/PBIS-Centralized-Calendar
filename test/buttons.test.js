'use strict';
/* ==========================================================================
   BUTTON AUDIT
   Clicks every distinct control on every route, on both surfaces, and asks one
   question of each: did anything happen?

   "Something happened" means at least one of — the DOM changed, the route
   changed, a toast appeared, an overlay or drawer opened or closed, an
   aria state flipped, or a form field changed value. A control that fires
   none of these is a no-op: either a dead handler, or a button that should
   not be on screen.

   Two things keep this bounded. The page is only reloaded when a click
   actually moved the route or left an overlay open — otherwise the sweep
   continues in place. And controls are deduplicated by signature, so a table
   of twenty-five identical row menus is proved with two, not fifty.
   ========================================================================== */

const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PER_SIGNATURE = 2;   // how many instances of an identical control to try

const ROUTES = [
  { path: '/', auth: false },
  { path: '/calendar', auth: false },
  { path: '/subscribe', auth: false },
  { path: '/embed', auth: false },
  // These keys must match the ADMIN_NAV table in public/app/05-admin.js —
  // an unknown key silently falls back to the dashboard, which would make a
  // typo here look like a passing route.
  { path: '/admin#/admin/dashboard', auth: true },
  { path: '/admin#/admin/calendar', auth: true },
  { path: '/admin#/admin/events', auth: true },
  { path: '/admin#/admin/submissions', auth: true },
  { path: '/admin#/admin/campuses', auth: true },
  { path: '/admin#/admin/yeargroups', auth: true },
  { path: '/admin#/admin/years', auth: true },
  { path: '/admin#/admin/categories', auth: true },
  { path: '/admin#/admin/locations', auth: true },
  { path: '/admin#/admin/import', auth: true },
  { path: '/admin#/admin/export', auth: true },
  { path: '/admin#/admin/rollover', auth: true },
  { path: '/admin#/admin/subscriptions', auth: true },
  { path: '/admin#/admin/audit', auth: true },
  { path: '/admin#/admin/users', auth: true },
  { path: '/admin#/admin/settings', auth: true }
];

/* Clicking these would end the session or wipe data, ruining the sweep. */
const SKIP = new Set(['sign-out', 'reset-demo', 'tax-delete', 'ed-delete']);

const results = [];

async function signIn(page) {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#si-email', { timeout: 15000 });
  await page.fill('#si-email', 'j.whitfield@pbis.edu.la');
  await page.fill('#si-password', process.env.PBIS_SEED_PASSWORD || 'pbis-demo');
  await page.locator('[data-act="sign-in"]').click();
  await page.waitForSelector('.admin-side', { timeout: 20000 });
}

const snapshot = page => page.evaluate(() => ({
  html: document.body.innerHTML.length,
  text: document.body.innerText.slice(0, 3000),
  hash: location.hash,
  path: location.pathname,
  overlay: document.querySelectorAll('.overlay, .drawer.show, .modal').length,
  toast: document.querySelectorAll('.toast').length,
  aria: [...document.querySelectorAll('[aria-pressed],[aria-selected],[aria-expanded]')]
    .map(el => `${el.getAttribute('aria-pressed')}${el.getAttribute('aria-selected')}${el.getAttribute('aria-expanded')}`).join('|'),
  fields: [...document.querySelectorAll('input,select,textarea')].map(el => el.value).join('|')
}));

const changed = (a, b) => a.html !== b.html || a.text !== b.text || a.hash !== b.hash ||
  a.path !== b.path || a.overlay !== b.overlay || a.toast !== b.toast ||
  a.aria !== b.aria || a.fields !== b.fields;

const SEL = 'button, a[href], [data-act], [role="button"]';

async function enumerate(page) {
  return page.evaluate(sel => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const seen = new Map();
    const out = [];
    [...document.querySelectorAll(sel)].forEach((el, i) => {
      if (!vis(el)) return;
      const act = el.dataset ? (el.dataset.act || '') : '';
      // Signature: same action + same shape of label = the same control repeated.
      const sig = act + '|' + el.tagName + '|' + (el.className || '').split(' ').slice(0, 2).join('.');
      const n = (seen.get(sig) || 0) + 1;
      seen.set(sig, n);
      out.push({
        i, act, occurrence: n, sig,
        tag: el.tagName.toLowerCase(),
        href: el.getAttribute('href') || '',
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        label: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 44)
      });
    });
    return out;
  }, SEL);
}

async function sweep(page, route) {
  // A goto that only changes the fragment does NOT reload the document, so an
  // overlay left open by the previous click would survive and swallow every
  // subsequent one. Force a real document load every time.
  const load = async () => {
    await page.goto('about:blank');
    await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(900);
  };
  await load();

  const all = await enumerate(page);
  const targets = all.filter(c => c.occurrence <= PER_SIGNATURE && c.tag !== 'input');
  process.stdout.write(`  ${all.length} controls, ${targets.length} distinct to click\n`);

  let needsReload = false;
  for (const c of targets) {
    if (SKIP.has(c.act)) { results.push({ route: route.path, ...c, verdict: 'skipped' }); continue; }
    if (c.disabled) { results.push({ route: route.path, ...c, verdict: 'disabled' }); continue; }

    if (needsReload) { await load(); needsReload = false; }

    const before = await snapshot(page);
    let err = '';
    try {
      const el = page.locator(SEL).nth(c.i);
      try {
        await el.click({ timeout: 2500, noWaitAfter: true });
      } catch (e) {
        // Skip links and other deliberately off-screen affordances are only
        // reachable by keyboard. Dispatch the click rather than call them dead.
        if (/not visible|intercepts pointer|outside of the viewport|stable/i.test(e.message)) {
          await el.dispatchEvent('click');
        } else throw e;
      }
      await page.waitForTimeout(450);
    } catch (e) {
      err = String(e.message).split('\n')[0].slice(0, 80);
    }
    const after = err ? before : await snapshot(page);

    // Escape anything the click opened, and reload if the route moved or the
    // overlay would not close — otherwise carry on in place.
    if (!err && (after.overlay > before.overlay)) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);
    }
    const nowHash = await page.evaluate(() => location.hash + '|' + location.pathname);
    if (err || nowHash !== (before.hash + '|' + before.path)) needsReload = true;
    else if ((await page.locator('.overlay, .drawer.show, .modal').count()) > 0) needsReload = true;

    results.push({
      route: route.path, ...c,
      verdict: err ? 'error' : (changed(before, after) ? 'ok' : 'NO-OP'),
      detail: err
    });
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/favicon|fonts\.googleapis|net::ERR/.test(m.text())) {
      consoleErrors.push('CONSOLE: ' + m.text());
    }
  });

  await signIn(page);
  for (const r of ROUTES) {
    process.stdout.write(`\n${r.path}\n`);
    try { await sweep(page, r); }
    catch (e) { console.log('  route failed: ' + String(e.message).split('\n')[0]); }
  }

  const bad = results.filter(r => r.verdict === 'NO-OP' || r.verdict === 'error');
  const byRoute = {};
  for (const r of bad) (byRoute[r.route] = byRoute[r.route] || []).push(r);

  console.log('\n' + '='.repeat(74));
  console.log(`  ${results.length} distinct controls clicked across ${ROUTES.length} routes`);
  console.log(`  ${results.filter(r => r.verdict === 'ok').length} did something`);
  console.log(`  ${results.filter(r => r.verdict === 'disabled').length} correctly disabled`);
  console.log(`  ${results.filter(r => r.verdict === 'skipped').length} skipped (destructive)`);
  console.log(`  ${bad.length} did nothing at all`);
  console.log('='.repeat(74));

  for (const [route, list] of Object.entries(byRoute)) {
    console.log(`\n${route}`);
    for (const r of list) {
      console.log(`  ${r.verdict.padEnd(6)} <${r.tag}> act="${r.act || '—'}" ${JSON.stringify(r.label)} ${r.detail || ''}`);
    }
  }
  if (consoleErrors.length) {
    console.log('\nCONSOLE ERRORS');
    [...new Set(consoleErrors)].forEach(e => console.log('  - ' + e));
  }
  console.log('');

  require('fs').writeFileSync('/tmp/button-audit.json', JSON.stringify(results, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
