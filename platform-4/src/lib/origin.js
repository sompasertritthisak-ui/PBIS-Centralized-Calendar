'use strict';
/* ==========================================================================
   WHERE THIS SERVER THINKS IT LIVES

   Every URL the platform hands out — feed addresses parents paste into Apple
   Calendar, canonical links, Open Graph tags, embed links — has to be one an
   outsider can actually reach.

   `req.hostname` is not that: Fastify strips the port from it, so on any
   deployment not sitting on 80 or 443 it silently produces http://localhost/…
   and every link is broken. The Host header keeps the port, so use it.

   PBIS_ORIGIN overrides everything. Set it in production to
   https://calendar.pbis.edu.la and the answer stops depending on what a proxy
   happens to forward.
   ========================================================================== */

/** Host including the port, as a caller would have to type it. */
function host(req) {
  const forwarded = req.headers['x-forwarded-host'];
  const h = (forwarded ? String(forwarded).split(',')[0] : req.headers.host) || '';
  return h.trim() || req.hostname;
}

/** Scheme, honouring a terminating proxy. */
function protocol(req) {
  const fwd = req.headers['x-forwarded-proto'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.protocol;
}

/** Full origin with no trailing slash — the base for every URL we publish. */
function origin(req) {
  if (process.env.PBIS_ORIGIN) return String(process.env.PBIS_ORIGIN).replace(/\/+$/, '');
  return `${protocol(req)}://${host(req)}`;
}

/** webcal:// form of the same host, for one-click calendar subscription. */
function webcal(req) {
  return `webcal://${origin(req).replace(/^https?:\/\//, '')}`;
}

module.exports = { host, protocol, origin, webcal };
