'use strict';
/* ==========================================================================
   PBIS CENTRAL CALENDAR — SERVER
   Two surfaces on one host:
     calendar.pbis.edu.la/        public calendar
     calendar.pbis.edu.la/admin   CMS, behind sign-in
   Four API layers, live ICS feeds, embed and server-rendered event pages.
   ========================================================================== */

const path = require('path');
const fs = require('fs');
const Fastify = require('fastify');

const { migrate, db } = require('./db');
const auth = require('./auth');
const repo = require('./repo');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

async function build(opts = {}) {
  migrate();

  const app = Fastify({
    logger: opts.logger !== undefined ? opts.logger : false,
    trustProxy: true,
    bodyLimit: 12 * 1024 * 1024
  });

  await app.register(require('@fastify/cookie'), {
    secret: process.env.PBIS_COOKIE_SECRET || 'pbis-development-secret-change-me'
  });
  await app.register(require('@fastify/formbody'));
  await app.register(require('@fastify/multipart'), { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

  /* ------------------------------------------------- security headers */
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Frame-Options', req.url.startsWith('/embed') ? 'ALLOWALL' : 'SAMEORIGIN');
    if (req.url.startsWith('/api/') || req.url.startsWith('/admin')) {
      reply.header('Cache-Control', reply.getHeader('Cache-Control') || 'no-store');
    }
    return payload;
  });

  /* ------------------------------------------------------------- auth */
  auth.attach(app);

  /* ------------------------------------------------- rate limiting */
  // Deliberately small and in-process: enough to blunt credential stuffing
  // and feed hammering without adding a dependency.
  const buckets = new Map();
  app.addHook('onRequest', async (req, reply) => {
    const limited = req.url.startsWith('/api/v1/auth/sign-in');
    if (!limited) return;
    const k = `${req.ip}`;
    const nowMs = Date.now();
    const b = buckets.get(k) || { count: 0, reset: nowMs + 60000 };
    if (nowMs > b.reset) { b.count = 0; b.reset = nowMs + 60000; }
    b.count += 1;
    buckets.set(k, b);
    if (b.count > 10) {
      reply.code(429).header('Retry-After', Math.ceil((b.reset - nowMs) / 1000))
        .send({ error: 'too_many_attempts', message: 'Too many sign-in attempts. Try again shortly.' });
      return reply;
    }
  });

  /* ----------------------------------------------------------- routes */
  await app.register(require('./routes/public'));
  await app.register(require('./routes/me'));
  await app.register(require('./routes/admin'));
  await app.register(require('./routes/data'));
  await app.register(require('./routes/feeds'));
  await app.register(require('./routes/pages'));

  app.get('/health', async () => ({
    status: 'ok',
    events: db.prepare('SELECT count(*) c FROM events WHERE deleted_at IS NULL').get().c,
    migrations: db.prepare('SELECT count(*) c FROM schema_migrations').get().c,
    uptimeSeconds: Math.round(process.uptime())
  }));

  /* ----------------------------------------------------------- static */
  await app.register(require('@fastify/static'), { root: PUBLIC_DIR, prefix: '/', index: false });

  const shell = () => fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
    .replace('<!--SSR_HEAD-->', '')
    .replace('<!--SSR_ORIGIN-->', '');

  // The public app.
  app.get('/', async (req, reply) => reply.type('text/html').send(shell()));

  // The CMS is a distinct entry point, not a route inside the public app.
  app.get('/admin', async (req, reply) => reply.type('text/html').send(shell()));
  app.get('/admin/*', async (req, reply) => reply.type('text/html').send(shell()));

  // Everything else falls through to the public app (client-side routing).
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/feeds/')) {
      return reply.code(404).send({ error: 'not_found', path: req.url });
    }
    return reply.code(200).type('text/html').send(shell());
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, 'request failed');
    reply.code(status).send({
      error: status === 500 ? 'internal_error' : (err.code || 'request_failed'),
      // Never leak a stack trace or SQL to a caller.
      message: status === 500 ? 'Something went wrong handling that request.' : err.message
    });
  });

  // Housekeeping: expired sessions do not need to live forever.
  const sweeper = setInterval(() => { try { auth.purgeExpiredSessions(); } catch (e) {} }, 3600_000);
  if (sweeper.unref) sweeper.unref();
  app.addHook('onClose', async () => clearInterval(sweeper));

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  build({ logger: { level: process.env.LOG_LEVEL || 'info' } })
    .then(app => app.listen({ port, host }))
    .then(addr => {
      /* eslint-disable no-console */
      console.log(`\n  PBIS Central Calendar`);
      console.log(`  public calendar  ${addr}/`);
      console.log(`  CMS              ${addr}/admin`);
      console.log(`  API              ${addr}/api/v1`);
      console.log(`  live feeds       ${addr}/feeds/all.ics\n`);
    })
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { build };
