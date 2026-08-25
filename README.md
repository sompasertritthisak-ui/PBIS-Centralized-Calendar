# PBIS Central Calendar — Platform

The calendar system for Panyathip British International School. One host serves
two surfaces:

| Surface | Address | Who it is for |
|---|---|---|
| Public calendar | `calendar.pbis.edu.la/` | Parents, students, staff, the public |
| CMS | `calendar.pbis.edu.la/admin` | Staff with `accessCms`, behind sign-in |
| API | `calendar.pbis.edu.la/api/v1` | Four layers — see `docs/API.md` |
| Live feeds | `calendar.pbis.edu.la/feeds/*.ics` | Google, Apple, Outlook subscriptions |

School wall time is **Asia/Vientiane** (UTC+7, no daylight saving). The database
never stores a device time zone; conversion to UTC happens only at the
integration boundary — ICS output and ISO timestamps in API responses.

## Running it

```bash
cd platform
npm install
node db/seed.js          # idempotent — safe to re-run
node src/server.js
```

Then open <http://localhost:3000/> for the calendar and
<http://localhost:3000/admin> for the CMS.

After seeding, ten demonstration accounts exist, all sharing the password
`pbis-demo`. **Remove them before this is reachable from the internet** — each
one can sign in:

```bash
node db/clear-demo-users.js --dry-run          # see what would go
node db/clear-demo-users.js --yes --rename     # keep one admin, remove the rest
```

That keeps a single super administrator (renamed to `admin@pbis.edu.la`), and
re-points everything the removed accounts touched — events they created,
revisions, audit entries — at the surviving administrator, so nothing is
orphaned and the history still names someone.

Two more scripts for getting from demonstration data to real data:

```bash
node db/clear-demo-events.js --yes             # remove all events, keep taxonomy
node db/import-google.js --pr-ey a.ics --se b.ics [--dry-run]
node db/flag-internal.js [--dry-run|--revert]  # hide staff-only dates
```

### Configuration

Everything is environment variables; there is no config file.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `PBIS_DATA_DIR` | `platform/data` | Database and uploads directory |
| `PBIS_DB` | `$PBIS_DATA_DIR/pbis.db` | SQLite file path |
| `PBIS_ORIGIN` | request origin, feeds fall back to `https://calendar.pbis.edu.la` | Canonical origin written into ICS URLs, Open Graph tags and canonical links |
| `PBIS_COOKIE_SECRET` | development placeholder | **Must be set in production.** Signs session cookies |
| `PBIS_SEED_PASSWORD` | `pbis-demo` | Password given to seeded accounts |
| `LOG_LEVEL` | `info` | Pino level |

## Layout

```
platform/
  db/
    migrations/001_init.sql     SQLite schema — the source of truth
    postgres/001_init.sql       Postgres port, kept in step by hand
    seed.js                     Canonical demonstration data
    clear-demo-events.js        Remove every event, keep the structure
    clear-demo-users.js         Remove the invented staff accounts
    import-google.js            Import the school's real Google calendars
    flag-internal.js            Hide staff-only dates from the public
  src/
    db.js                       Connection, migration runner, id/slug helpers
    auth.js                     scrypt, sessions, API keys, route guards
    repo.js                     All event and taxonomy reads and writes
    server.js                   Fastify app, headers, rate limiting, static
    lib/
      time.js                   Wall-time helpers, ICS timestamps
      recurrence.js             Occurrence expansion, RRULE in and out
      visibility.js             Roles, the permission matrix, SQL scoping
      ics.js                    RFC 5545 builder
      icsparse.js               Reading iCalendar — one parser, shared
      classify.js               Filing an imported event by campus/category
      origin.js                 Where this server thinks it lives
    routes/
      public.js  me.js  admin.js  data.js  feeds.js  pages.js
  public/                       The served front end (no build step)
    index.html  styles.css  app/01-core.js … app/07-boot.js
  test/
    api.test.js                 196 assertions against the HTTP surface
    ui.test.js                  43 assertions driving the real browser
    buttons.test.js             Clicks every control on every route
    buttons-verify.test.js      Settles the ones a click cannot judge
  docs/
    API.md                      Full endpoint reference
    SCHEMA.md                   Data model and the reasoning behind it
    BUTTON-AUDIT.md             What every control does, and what was dead
```

## Architecture notes

**No build step.** `public/` is plain HTML, CSS and seven ordered scripts. It is
served directly. This is a deliberate choice for a school that will maintain
this for years: there is no toolchain to rot, and any competent developer can
open a file and read what runs.

**Fastify + better-sqlite3, WAL mode.** SQLite is more than adequate for a
single school's calendar and removes an entire class of operational burden. The
schema is written plainly enough to port; `db/postgres/001_init.sql` is that
port, ready for the day the load or the hosting arrangement justifies it.

**Occurrence expansion is computed, not stored.** Recurring events hold an RFC
5545 subset in one JSON column. `lib/recurrence.js` expands them on read across
daily, weekly, fortnightly, monthly, yearly, nth-weekday (`BYSETPOS`) and
term-time patterns. Term-time recurrence consults the holiday events in the
database, so a weekly staff briefing correctly skips half-term, INSET days and
weekends without anyone maintaining a separate exclusion list.

**Feeds are live.** Publishing an event in the CMS makes it appear in every
subscribed calendar at that client's next refresh. There is no export step and
no file to regenerate.

**`view` is not `accessCms`.** The public read permission and the permission
that opens the CMS are separate entries in the matrix, because every role
including `public` can view. Administrative routes are gated on `accessCms`
alone. This is the single most important line in `lib/visibility.js`.

**Nothing is hard deleted.** Archiving sets `deleted_at`. Every change to a
published event writes a snapshot into `event_revisions` first, and every
administrative action lands in an append-only audit log.

## Tests

Start the server, then:

**Run the suites against a scratch database**, not your real one — they seed
demonstration data and create events as they go:

```bash
PBIS_DATA_DIR=/tmp/pbis-test node test/api.test.js
```

```bash
node test/api.test.js             # 196 assertions — HTTP surface, auth, ICS, SEO, limits
node test/ui.test.js              # 43 assertions — real Chromium against the real server
node test/buttons.test.js         # clicks all 321 controls across 20 routes
node test/buttons-verify.test.js  # 22 assertions on what the sweep cannot judge
```

The two button suites take roughly twenty minutes between them; the first two
take about a minute. See `docs/BUTTON-AUDIT.md` for what they cover and why
sixty-seven controls correctly do nothing when clicked.

The browser suite signs in, creates and publishes an event, checks it reaches
the public API and the live ICS feed, exercises the taxonomy and submission
workflows, and asserts no horizontal overflow at 375, 768 and 1440 pixels on
both surfaces.

## Deploying to calendar.pbis.edu.la

1. Set `PBIS_COOKIE_SECRET` to a long random value and `PBIS_ORIGIN` to
   `https://calendar.pbis.edu.la`.
2. Put a TLS terminator in front (nginx, Caddy, Cloudflare) and forward to the
   Node process. `trustProxy` is already on, so `X-Forwarded-*` is honoured.
3. Point `PBIS_DATA_DIR` at persistent storage and back that directory up — it
   holds both the database and uploaded attachments.
4. Run `node db/seed.js` **once** on a fresh install, then change the seeded
   passwords, or skip the seed entirely and create the first super
   administrator by hand.
5. Run the process under a supervisor (systemd, pm2) so it restarts on failure.

Migrations run automatically at boot; `schema_migrations` records what has been
applied.
