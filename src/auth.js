'use strict';
/* ==========================================================================
   Authentication and session handling.

   Local password accounts use scrypt. Google Workspace SSO is the intended
   production path — `linkExternalAccount` is the seam for it, so switching
   does not touch anything downstream: routes only ever see `request.user`.
   ========================================================================== */

const crypto = require('crypto');
const { db, now, id } = require('./db');
const { audit } = require('./repo');
const V = require('./lib/visibility');

const SESSION_COOKIE = 'pbis_session';
const SESSION_DAYS = 14;

/* ------------------------------------------------------------ passwords */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, expected] = stored.split('$');
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expected, 'hex');
  if (expectedBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

/* ------------------------------------------------------------- sessions */
function createSession(user, meta = {}) {
  const sid = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare(`INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip)
              VALUES (?,?,?,?,?,?)`)
    .run(sid, user.id, now(), expires, meta.userAgent || null, meta.ip || null);
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(now(), user.id);
  return { id: sid, expiresAt: expires };
}

function userForSession(sid) {
  if (!sid) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > ?
      AND u.active = 1 AND u.deleted_at IS NULL`).get(sid, now());
  return row || null;
}

function revokeSession(sid) {
  if (sid) db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').run(now(), sid);
}

function purgeExpiredSessions() {
  return db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()).changes;
}

/* ----------------------------------------------------------- accounts */
function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND deleted_at IS NULL')
    .get(String(email || '').trim());
}

function signIn(email, password, meta) {
  const user = findByEmail(email);
  // Constant-ish work whether or not the account exists, so timing does not
  // reveal which addresses are registered.
  const stored = user ? user.password_hash : 'scrypt$0000$' + '0'.repeat(128);
  const ok = verifyPassword(password || '', stored);
  if (!user || !ok || !user.active) return { ok: false };
  const session = createSession(user, meta);
  audit('signed in', 'user', user.id, user.name, user);
  return { ok: true, user, session };
}

/**
 * Seam for Google Workspace / any OIDC provider. The provider hands back a
 * stable subject and a verified email; we bind it to an existing account
 * rather than creating one, so role assignment stays deliberate.
 */
function linkExternalAccount({ subject, email }, meta) {
  const user = db.prepare('SELECT * FROM users WHERE external_id=? AND deleted_at IS NULL').get(subject)
            || findByEmail(email);
  if (!user || !user.active) return { ok: false, reason: 'no_account' };
  if (!user.external_id) db.prepare('UPDATE users SET external_id=? WHERE id=?').run(subject, user.id);
  const session = createSession(user, meta);
  audit('signed in', 'user', user.id, user.name, user);
  return { ok: true, user, session };
}

/* ------------------------------------------------------------ API keys */
function hashKey(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }

function issueApiKey(name, scopes, createdBy) {
  const raw = 'pbis_' + crypto.randomBytes(24).toString('base64url');
  const keyId = id('key');
  db.prepare(`INSERT INTO api_keys (id, name, key_hash, scopes, created_by, created_at)
              VALUES (?,?,?,?,?,?)`)
    .run(keyId, name, hashKey(raw), scopes || 'read', createdBy || null, now());
  return { id: keyId, name, key: raw };   // raw is shown once and never stored
}

function apiKeyFor(raw) {
  if (!raw) return null;
  const row = db.prepare('SELECT * FROM api_keys WHERE key_hash=? AND revoked_at IS NULL').get(hashKey(raw));
  if (row) db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(now(), row.id);
  return row;
}

/* ------------------------------------------------------------- plugin */
const PUBLIC_VIEWER = { id: null, name: 'Guest', role: 'public', campus_id: null };

/**
 * Attaches request.user (always set — 'public' when anonymous) and helpers.
 * Registered as an onRequest hook so every route, including feeds and pages,
 * is evaluated against a viewer.
 */
function attach(app) {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);
  app.decorateRequest('apiKey', null);

  app.addHook('onRequest', async (req) => {
    req.user = { ...PUBLIC_VIEWER, ip: req.ip };

    const sid = req.cookies ? req.cookies[SESSION_COOKIE] : null;
    if (sid) {
      const u = userForSession(sid);
      if (u) { req.user = { ...u, ip: req.ip }; req.sessionId = sid; }
    }

    const header = req.headers['authorization'];
    if (header && header.startsWith('Bearer ')) {
      const k = apiKeyFor(header.slice(7));
      if (k) {
        req.apiKey = k;
        // Integration keys read at 'internal' level but can never write.
        if (req.user.role === 'public') req.user = { ...PUBLIC_VIEWER, role: 'teacher', ip: req.ip, viaApiKey: true };
      }
    }
  });

  app.decorate('requireAuth', async (req, reply) => {
    if (!req.user || req.user.role === 'public') {
      reply.code(401).send({ error: 'authentication_required' });
      return reply;
    }
  });

  app.decorate('requirePermission', (action) => async (req, reply) => {
    if (!req.user || !V.can(req.user.role, action) || req.user.viaApiKey) {
      reply.code(req.user && req.user.role !== 'public' ? 403 : 401)
        .send({ error: req.user && req.user.role !== 'public' ? 'forbidden' : 'authentication_required',
                requiredPermission: action });
      return reply;
    }
  });
}

module.exports = {
  SESSION_COOKIE, SESSION_DAYS, hashPassword, verifyPassword, createSession,
  userForSession, revokeSession, purgeExpiredSessions, findByEmail, signIn,
  linkExternalAccount, issueApiKey, apiKeyFor, attach, PUBLIC_VIEWER
};
