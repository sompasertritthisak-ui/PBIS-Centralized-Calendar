# PBIS Central Calendar — API Reference

Version 1.0. This document describes the HTTP surface implemented in `src/routes/*.js`,
`src/auth.js`, `src/lib/visibility.js` and `src/server.js`. Everything below is taken from
the code; nothing is aspirational.

---

## 1. Basics

### 1.1 Base URL

| | |
|---|---|
| Origin | `https://calendar.pbis.edu.la` (overridable with `PBIS_ORIGIN`) |
| API prefix | `/api/v1` |
| Live feeds | `/feeds/{scope}.ics` (not under `/api`) |
| Pages | `/events/{slug}`, `/embed`, `/robots.txt`, `/sitemap.xml` |
| Discovery | `GET /api/v1` |
| Health | `GET /health` |

`GET /api/v1` returns a machine-readable summary of the four layers:

```json
{
  "name": "PBIS Central Calendar API",
  "version": "1.0",
  "timezone": "Asia/Vientiane",
  "layers": {
    "public": "/api/v1/(events|campuses|academic-years|taxonomy|today)",
    "user": "/api/v1/me/*  (session cookie)",
    "administrative": "/api/v1/admin/*  (session cookie + permission)",
    "integration": "/api/v1/integration/*  (Bearer API key)"
  },
  "feeds": "/feeds/{scope}.ics",
  "documentation": "/api"
}
```

`GET /health` returns `{ status, events, migrations, uptimeSeconds }`.

### 1.2 Response envelope

Successful JSON responses are wrapped:

```json
{ "data": … , "meta": { … } }
```

* `data` — the payload: an object, or an array for list endpoints.
* `meta` — present on list and range endpoints only. Typical members: `total`,
  `returned`, `from`, `to`, `limit`, `offset`, `timezone`, `generatedAt`, `academicYear`.
* Some endpoints add sibling keys next to `data` rather than nesting them:
  `conflicts` (event create, submission create), `revisions` (`GET /admin/events/:id`),
  `note` (API key creation, rollover commit, import commit).

Non-JSON endpoints (ICS, CSV, attachments, HTML pages) return raw bodies with the
appropriate `Content-Type`; they are not enveloped.

### 1.3 Error shape

Errors are flat objects, never enveloped:

```json
{ "error": "range_too_large", "message": "Maximum range is 800 days. Request a narrower window." }
```

The global error handler (`src/server.js`) uses the thrown status code, or 500 when none
is present. A 500 is always reported as `{"error":"internal_error","message":"Something went
wrong handling that request."}` — stack traces and SQL are never returned. Other thrown
errors surface as `{"error": err.code || "request_failed", "message": err.message}`.

Unmatched paths under `/api/` or `/feeds/` return `404 {"error":"not_found","path":"…"}`.
Every other unmatched path returns `200 text/html` (the app shell) for client-side routing.

#### Error codes actually emitted

| Code | Status | Where |
|---|---|---|
| `authentication_required` | 401 | `requireAuth`, `requirePermission` for anonymous callers, `GET /api/v1/export?scope=my` |
| `invalid_credentials` | 401 | `POST /api/v1/auth/sign-in` |
| `api_key_required` | 401 | `/api/v1/integration/*` without a valid Bearer key |
| `forbidden` | 403 | `requirePermission` for signed-in callers, campus-scope violations, editing another user's submission |
| `not_found` | 404 | unknown event, submission, user, taxonomy row, revision, import job, attachment |
| `unknown_calendar` | 404 | `POST /api/v1/me/subscriptions` with an unknown `calendarId` |
| `unknown_kind` | 404 | `/api/v1/admin/taxonomy/:kind` with an unknown kind |
| `conflict` | 409 | publishing an event into a booked location |
| `already_approved` | 409 | approving or editing an already-approved submission |
| `already_committed` | 409 | committing an import job twice |
| `email_in_use` | 409 | `POST /api/v1/admin/users` |
| `in_use` | 409 | deleting a taxonomy row that is referenced and has no `archived` column |
| `file_missing` | 410 | attachment row exists but the file is gone from disk |
| `too_large` | 413 | attachment over 10 MiB |
| `unsupported_type` | 415 | attachment MIME type not allowed |
| `unsupported_format` | 415 | `POST /api/v1/admin/imports` with `format: "xlsx"` |
| `range_too_large` | 422 | `GET /api/v1/events` when `to - from > 800` days (response includes `maxDays: 800`) |
| `invalid_range` | 422 | `GET /api/v1/events` when `to < from` |
| `validation_failed` | 422 | event / submission / taxonomy / user / API-key / rollover validation; includes `errors[]` of `{field, message}` where the validator produces them |
| `no_content` | 422 | import with an empty `content` |
| `not_enough_rows` | 422 | CSV import with fewer than two rows |
| `no_ids` | 422 | bulk action with an empty `ids` array |
| `too_many` | 422 | bulk action with more than 500 ids |
| `unknown_operation` | 422 | bulk action with an unrecognised `operation` |
| `nothing_to_update` | 422 | taxonomy or user PATCH with no recognised fields |
| `no_file` | 422 | attachment upload with no multipart file |
| `unknown_source_year` | 422 | rollover preview/commit with an unknown `fromYearId` |
| `too_many_attempts` | 429 | sign-in rate limit |
| `internal_error` | 500 | unhandled exception |

`requirePermission` failures also carry `requiredPermission: "<action>"`.

### 1.4 Security headers

Applied by an `onSend` hook to every response:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `ALLOWALL` for URLs starting `/embed`, otherwise `SAMEORIGIN` |
| `Cache-Control` | `no-store` for `/api/*` and `/admin*`, unless the route already set one |

Feeds set `Cache-Control: public, max-age=900`; `/embed` sets `public, max-age=300`.
The request body limit is 12 MiB; multipart uploads are limited to one file of 10 MiB.
`trustProxy` is enabled, so `req.ip` reflects `X-Forwarded-For` behind the reverse proxy.

### 1.5 Rate limiting

One in-process limiter, applied only to URLs starting `/api/v1/auth/sign-in`:
**10 requests per IP per rolling 60-second window**. Exceeding it returns

```
HTTP/1.1 429 Too Many Requests
Retry-After: 43

{"error":"too_many_attempts","message":"Too many sign-in attempts. Try again shortly."}
```

No other endpoint is rate limited by the application.

---

## 2. The four layers

| Layer | Prefix | Authentication | Notes |
|---|---|---|---|
| 1 — Public | `/api/v1/events`, `/campuses`, `/taxonomy`, `/academic-years`, `/today`, `/calendars`, `/export`, `/attachments/:id` | none | Served as the `public` viewer unless a session cookie happens to be present, in which case the caller's own visibility applies |
| 2 — Authenticated user | `/api/v1/me/*`, `/api/v1/auth/*` | `pbis_session` cookie | `requireAuth`; submissions additionally need the `submit` permission |
| 3 — Administrative | `/api/v1/admin/*` | `pbis_session` cookie **plus** a permission, minimally `accessCms` | `requirePermission(action)`; API keys are explicitly rejected |
| 4 — Integration | `/api/v1/integration/*` | `Authorization: Bearer pbis_…` | Read-only; always evaluated as the `public` viewer |

### 2.1 Session cookie

`POST /api/v1/auth/sign-in` verifies the password (scrypt, `scrypt$salt$hash`, constant-ish
work whether or not the account exists) and sets:

```
Set-Cookie: pbis_session=<32 random bytes, base64url>; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600
```

`Secure` is added when `NODE_ENV=production`. Sessions live **14 days**, are stored in the
`sessions` table with user agent and IP, and are validated on every request (not revoked,
not expired, user active and not soft-deleted). Expired rows are swept hourly.
`POST /api/v1/auth/sign-out` revokes the session and clears the cookie.

An `onRequest` hook sets `request.user` on **every** request — to the guest viewer
`{ id: null, name: 'Guest', role: 'public', campus_id: null }` when there is no valid
session. There is no "unauthenticated" branch anywhere downstream; there is only a viewer
with fewer rights.

`linkExternalAccount({subject, email})` exists in `src/auth.js` as the Google Workspace /
OIDC seam. It binds a provider subject to an **existing** account and never creates one, so
role assignment stays deliberate. It is not currently exposed as an HTTP route.

### 2.2 API keys

Keys are issued by `POST /api/v1/admin/api-keys` (permission `manageApiKeys`, i.e. `super`
only), are of the form `pbis_<24 random bytes base64url>`, and are stored only as a SHA-256
hash — the raw value is returned once and never again. `last_used_at` is updated on each
use. Revocation is a soft revoke (`revoked_at`).

Presenting `Authorization: Bearer <key>`:

* sets `request.apiKey`;
* if and only if the caller has no session, promotes the viewer from `public` to role
  `teacher` with the flag `viaApiKey: true` — so integrations read at internal level
  (`public` + `internal` visibility, published-ish statuses);
* `requirePermission` rejects any request with `viaApiKey` set. **An API key can never
  write and can never reach an `/admin` route**, regardless of the permission matrix.

Note that the integration endpoints in `pages.js` deliberately query as `{ role: 'public' }`,
so `/api/v1/integration/*` returns public-visibility events only.

---

## 3. Roles and permissions

Roles, with the internal rank used for ordering (`RANK` in `visibility.js`):

| Role | Rank |
|---|---|
| `public` | 0 |
| `parent` | 20 |
| `student` | 20 |
| `teacher` | 40 |
| `campusadmin` | 60 |
| `caladmin` | 80 |
| `super` | 100 |

The `PERMISSIONS` matrix, verbatim:

| Permission | super | caladmin | campusadmin | teacher | parent | student | public |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `accessCms` | ✓ | ✓ | ✓ | | | | |
| `submit` | ✓ | ✓ | ✓ | ✓ | | | |
| `create` | ✓ | ✓ | ✓ | | | | |
| `edit` | ✓ | ✓ | ✓ | | | | |
| `publish` | ✓ | ✓ | ✓ | | | | |
| `approve` | ✓ | ✓ | | | | | |
| `import` | ✓ | ✓ | | | | | |
| `manageTaxonomy` | ✓ | ✓ | | | | | |
| `manageUsers` | ✓ | | | | | | |
| `viewAudit` | ✓ | ✓ | | | | | |
| `rollover` | ✓ | ✓ | | | | | |
| `manageApiKeys` | ✓ | | | | | | |

> **`view` is the public read right.** It is granted to every role including `public`, and
> it must never be used to gate an administrative route — a check for `view` would pass for
> an anonymous caller. CMS access is `accessCms`, which no unauthenticated caller can hold.
> Every `/api/v1/admin/*` route in the codebase declares `accessCms` or a stronger
> permission.

### 3.1 Row-level visibility

Independently of the permission matrix, every event query is filtered by
`eventScopeSql(viewer)`:

| Role | Visibility levels | Statuses | Campus |
|---|---|---|---|
| `super`, `caladmin` | public, internal, restricted | all | all |
| `campusadmin` | public, internal, restricted | draft, pending, published, cancelled, postponed, completed | own campus + whole-school (`campus_id IS NULL`) |
| `teacher`, `student`, `parent` | public, internal | published, cancelled, postponed, completed | all |
| `public` | public | published, cancelled, postponed, completed | all |

Soft-deleted rows (`deleted_at IS NOT NULL`) are excluded for everybody.
`canEditEvent` additionally forbids a `campusadmin` from editing an event belonging to
another campus, or any whole-school event (those belong to calendar admins).

---

## 4. Endpoint reference

### 4.1 Layer 1 — Public

No authentication. If a session cookie is present the caller's own visibility applies, so
these endpoints can return more to a signed-in user than to a guest.

#### `GET /api/v1/events`

Occurrence-expanded range query. Recurring events are expanded to one entry per occurrence;
multi-day events yield one entry per day with an `occurrence` marker.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | today (Asia/Vientiane) | ignored if not a valid date key |
| `to` | `YYYY-MM-DD` | `from + 90` days | ignored if not a valid date key |
| `campus` | id or comma-separated ids | — | events with no campus (whole-school) always match |
| `yearGroup` | id or comma-separated ids | — | events with no year groups always match |
| `category` | id or comma-separated ids | — | |
| `audience` | id or comma-separated ids | — | events with no audiences always match |
| `important` | `true` / `1` | false | any other value is false |
| `q` | string | — | matches title, description, location, campus, category and organiser name |
| `limit` | integer | 200 | clamped to 1–500; applied after the range query, so `meta.total` may exceed `returned` |

```bash
curl -s "https://calendar.pbis.edu.la/api/v1/events?from=2026-09-01&to=2026-09-30&campus=pr&limit=2"
```

```json
{
  "data": [
    {
      "date": "2026-09-14",
      "occurrence": null,
      "id": "evt_m1x2k9Qz7Ab",
      "slug": "primary-sports-day-2609",
      "title": "Primary Sports Day",
      "description": "House athletics on the main field.",
      "start": "2026-09-14T08:30:00+07:00",
      "end": "2026-09-14T12:30:00+07:00",
      "allDay": false,
      "timezone": "Asia/Vientiane",
      "campus": { "id": "pr", "name": "Primary", "slug": "primary" },
      "yearGroups": [{ "id": "y1", "name": "Year 1", "slug": "year-1" }],
      "audiences": ["parents", "students"],
      "category": { "id": "sports", "name": "Sports", "slug": "sports" },
      "location": { "id": "loc_field", "name": "Sports Field" },
      "organizer": { "name": "A. Somchai" },
      "visibility": "public",
      "status": "published",
      "important": false,
      "recurrence": null,
      "attachments": [],
      "links": [],
      "updatedAt": "2026-08-02T04:11:09.442Z",
      "urls": {
        "self": "/api/v1/events/primary-sports-day-2609",
        "ics": "/api/v1/events/evt_m1x2k9Qz7Ab.ics",
        "web": "/events/primary-sports-day-2609"
      }
    }
  ],
  "meta": {
    "total": 24, "returned": 2, "from": "2026-09-01", "to": "2026-09-30",
    "timezone": "Asia/Vientiane", "generatedAt": "2026-08-14T02:14:55.107Z",
    "academicYear": "2026–2027"
  }
}
```

For a multi-day event, `occurrence` is `{ "index": 2, "of": 5 }`; it is `null` for
single-day occurrences.

Failures: `422 range_too_large` (with `maxDays: 800`) when `to − from > 800` days;
`422 invalid_range` when `to` precedes `from`.

```bash
curl -si "https://calendar.pbis.edu.la/api/v1/events?from=2026-01-01&to=2030-01-01" | head -1
# HTTP/1.1 422 Unprocessable Entity
```

#### `GET /api/v1/events/:slug`

Fetch one event by slug **or** id. A trailing `.ics` is stripped from the parameter before
lookup; the dedicated ICS route (§5.2) handles the actual calendar download.

```bash
curl -s https://calendar.pbis.edu.la/api/v1/events/primary-sports-day-2609
```

```json
{ "data": { "id": "evt_m1x2k9Qz7Ab", "slug": "primary-sports-day-2609", "…": "same shape as above" } }
```

Failures: `404 not_found` — which is also what a caller gets for an event that exists but
lies outside their visibility.

#### `GET /api/v1/campuses`

No parameters. Campuses with their year groups.

```bash
curl -s https://calendar.pbis.edu.la/api/v1/campuses
```

```json
{ "data": [
  { "id": "pr", "name": "Primary", "short": "PR", "slug": "primary",
    "blurb": "Years 1–6", "colour": "#2E7D5B",
    "yearGroups": [ { "id": "y1", "name": "Year 1", "slug": "year-1" } ] }
] }
```

#### `GET /api/v1/taxonomy`

No parameters. Raw taxonomy rows for the whole vocabulary:
`{ data: { campuses, yearGroups, categories, audiences, locations, academicYears, terms } }`.

#### `GET /api/v1/academic-years`

No parameters. Academic years with nested terms.

```json
{ "data": [ { "id": "ay_2627", "name": "2026–2027", "start": "2026-08-17",
  "end": "2027-06-25", "status": "active",
  "terms": [ { "id": "trm_1", "name": "Term 1", "start": "2026-08-17", "end": "2026-12-11", "status": "active" } ] } ] }
```

#### `GET /api/v1/today`

Digital-signage payload for the current school day. No parameters.

```bash
curl -s https://calendar.pbis.edu.la/api/v1/today
```

```json
{
  "data": {
    "date": "2026-08-14",
    "clock": "09:12",
    "current": { "id": "evt_…", "title": "Whole School Assembly", "…": "" },
    "next": [ { "id": "evt_…", "title": "Year 6 Swimming", "…": "" } ],
    "allDay": [],
    "schedule": [ { "id": "evt_…", "…": "" } ],
    "upcoming": [ { "date": "2026-08-18", "id": "evt_…", "…": "" } ]
  },
  "meta": { "timezone": "Asia/Vientiane", "generatedAt": "2026-08-14T02:12:44.901Z" }
}
```

`current` is the timed event spanning the current wall-clock minute (or `null`); `next` is
up to 5 later timed events today; `upcoming` is up to 6 event starts over the following 14
days.

#### `GET /api/v1/calendars`

Catalogue of public subscribable calendars, with subscriber counts and feed URLs built from
the request host.

```json
{ "data": [ { "id": "primary", "name": "Primary", "scope": "campus", "scopeRef": "pr",
  "subscribers": 148,
  "webcal": "webcal://calendar.pbis.edu.la/feeds/primary.ics",
  "https": "https://calendar.pbis.edu.la/feeds/primary.ics" } ] }
```

#### `GET /api/v1/export`

Bulk export as ICS or CSV.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `format` | `ics` \| `csv` | `ics` | anything other than `csv` means `ics` |
| `scope` | calendar id, campus slug, year-group slug, `all`, or `my` | `all` | unresolvable scopes fall back to all events |
| `from` | `YYYY-MM-DD` | today − 400 days | |
| `to` | `YYYY-MM-DD` | today + 500 days | |

`scope=my` requires a session and applies the caller's My PBIS Calendar preferences.
Exports by a signed-in user are recorded in `export_jobs`. CSV is UTF-8 with a BOM and the
columns: Title, Date, End Date, Start, End, All Day, Campus, Year Groups, Category,
Audience, Location, Status, Visibility, Important, Description (truncated to 500 chars).

```bash
curl -s -o pbis-primary.csv \
  "https://calendar.pbis.edu.la/api/v1/export?scope=primary&format=csv&from=2026-08-01&to=2027-07-31"
```

Failures: `401 authentication_required` for `scope=my` without a session.

#### `GET /api/v1/attachments/:id`

Streams an attachment inline with its stored MIME type, original filename in
`Content-Disposition`, and `X-Content-Type-Options: nosniff`. **An attachment inherits the
visibility of its event**: if the caller cannot see the event, the attachment is `404`.

Failures: `404 not_found` (missing, soft-deleted, or invisible), `410 file_missing`
(row present, file absent from disk).

---

### 4.2 Layer 2 — Authenticated user

Session cookie required unless noted. All of `/api/v1/me/*` is behind `requireAuth`;
submission routes are behind `requirePermission('submit')`.

#### `POST /api/v1/auth/sign-in`

Body: `{ "email": string, "password": string }` (JSON or form-encoded).

```bash
curl -s -c jar.txt -X POST https://calendar.pbis.edu.la/api/v1/auth/sign-in \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@pbis.edu.la","password":"…"}'
```

```json
{ "data": {
  "user": { "id": "usr_…", "name": "Calendar Admin", "email": "admin@pbis.edu.la",
            "initials": "CA", "role": "caladmin", "campusId": null,
            "permissions": ["view","accessCms","submit","create","edit","publish","approve",
                            "import","manageTaxonomy","viewAudit","rollover"] },
  "preferences": { "campusId": null, "yearGroupId": null, "audienceId": null,
                   "categoryIds": [], "theme": "light", "motion": "on", "onboarded": false }
} }
```

Failures: `401 invalid_credentials` (wrong password, unknown address, or inactive account —
all indistinguishable); `429 too_many_attempts`.

#### `POST /api/v1/auth/sign-out`

No body. Revokes the current session and clears the cookie. Returns
`{ "data": { "signedOut": true } }`. Safe to call when not signed in.

#### `GET /api/v1/auth/session`

Returns `{ "data": { "user": null } }` when anonymous, otherwise the same
`{ user, preferences }` shape as sign-in. Never 401s.

#### `GET /api/v1/me/preferences` · `PUT /api/v1/me/preferences`

| Body field (PUT) | Type | Default when omitted |
|---|---|---|
| `campusId` | string \| null | `null` |
| `yearGroupId` | string \| null | `null` |
| `audienceId` | string \| null | `null` |
| `categoryIds` | string[] | `[]` |
| `theme` | string | `"light"` |
| `motion` | string | `"on"` |
| `onboarded` | boolean | `false` |

PUT is a full replace (upsert on `user_id`) — omitted fields are reset to the defaults
above, not preserved. Both return the stored preferences.

```bash
curl -s -b jar.txt -X PUT https://calendar.pbis.edu.la/api/v1/me/preferences \
  -H 'Content-Type: application/json' \
  -d '{"campusId":"pr","yearGroupId":"y4","audienceId":"parents","categoryIds":["sports","holiday"],"onboarded":true}'
```

Failures: `401 authentication_required`.

#### `GET /api/v1/me/calendar`

The caller's My PBIS Calendar: the range query filtered by `personalMatch` against their
saved preferences.

| Parameter | Type | Default |
|---|---|---|
| `from` | `YYYY-MM-DD` | today |
| `to` | `YYYY-MM-DD` | `from + 90` days |

There is no 800-day guard and no `limit` on this endpoint.

Relevance rules: whole-school events (no campus and no year groups) always survive; campus
and year group only narrow when the event is actually scoped; audience matching is inclusive
by relationship (`AUDIENCE_ACCEPT`); category filtering never removes `holiday` events.

```json
{ "data": [ { "date": "2026-09-14", "id": "evt_…", "…": "" } ],
  "meta": { "total": 31, "from": "2026-08-14", "to": "2026-11-12",
            "preferences": { "…": "" }, "timezone": "Asia/Vientiane" } }
```

#### `GET /api/v1/me/subscriptions`

Active (non-revoked) feed subscriptions, each with `webcal://` and `https://` URLs carrying
the subscription token, plus `fetchCount` and `lastFetchedAt`.

#### `POST /api/v1/me/subscriptions`

Body: `{ "calendarId": string }`. Creates a token if one does not already exist; if it does,
returns the existing one with `"existing": true`.

```bash
curl -s -b jar.txt -X POST https://calendar.pbis.edu.la/api/v1/me/subscriptions \
  -H 'Content-Type: application/json' -d '{"calendarId":"primary"}'
```

```json
{ "data": { "id": "sub_m1…", "calendarId": "primary", "token": "8Qn2…",
  "webcal": "webcal://calendar.pbis.edu.la/feeds/primary.ics?token=8Qn2…" } }
```

Failures: `404 unknown_calendar`.

#### `DELETE /api/v1/me/subscriptions/:id`

Revokes the subscription (scoped to the caller's own rows). Always returns
`{ "data": { "revoked": true } }`, including when nothing matched.

#### `POST /api/v1/me/personal-feed`

Idempotent. Creates (or returns) the caller's single personal feed token for
`/feeds/personal.ics`, creating the `personal` calendar row on first use.

```json
{ "data": { "token": "kR7…",
  "webcal": "webcal://calendar.pbis.edu.la/feeds/personal.ics?token=kR7…",
  "https": "https://calendar.pbis.edu.la/feeds/personal.ics?token=kR7…" } }
```

#### `GET /api/v1/me/submissions`

The caller's own submissions, newest first. Auth: `requireAuth` only.

#### `POST /api/v1/me/submissions`

Permission: `submit` (teacher and above). Body:

| Field | Type | Default | Required |
|---|---|---|---|
| `title` | string | — | yes, non-blank |
| `description` | string | `""` | |
| `date` | `YYYY-MM-DD` | — | yes |
| `endDate` | `YYYY-MM-DD` \| null | `null` | must not precede `date` |
| `start` | `HH:MM` | `null` | ignored when `allDay` |
| `end` | `HH:MM` | `null` | must be after `start` |
| `allDay` | boolean | `false` | clears `start`/`end` |
| `campusId` | string \| null | `null` | |
| `categoryId` | string | `"other"` | |
| `locationId` | string \| null | `null` | |
| `yearGroupIds` | string[] | `[]` | |
| `audienceIds` | string[] | `[]` | |
| `status` | `"draft"` \| anything | `"pending"` | only `"draft"` is honoured; everything else becomes `pending` |

```bash
curl -s -b jar.txt -X POST https://calendar.pbis.edu.la/api/v1/me/submissions \
  -H 'Content-Type: application/json' \
  -d '{"title":"Year 4 Museum Trip","date":"2026-10-08","start":"08:30","end":"14:00","campusId":"pr","categoryId":"trip"}'
```

```json
{ "data": { "id": "sub_m1…", "title": "Year 4 Museum Trip", "date": "2026-10-08",
  "start": "08:30", "end": "14:00", "allDay": false, "status": "pending",
  "reviewerNote": null, "submittedBy": "usr_…", "publishedEventId": null,
  "createdAt": "2026-08-14T02:20:01.883Z", "updatedAt": "2026-08-14T02:20:01.883Z" },
  "conflicts": [] }
```

Returns `201`. `conflicts` lists location double-bookings as `{title, date}` — advisory
only; the submission is still created.

Failures: `422 validation_failed` with `errors[]`; `401`/`403` from `requirePermission('submit')`.

#### `PATCH /api/v1/me/submissions/:id`

Permission: `submit`, and the caller must be the original submitter. Any field from the
create body may be supplied; unsupplied fields keep their stored value. The status is
forced back to `pending`.

Failures: `404 not_found`, `403 forbidden` (another user's submission),
`409 already_approved`.

---

### 4.3 Layer 3 — Administrative

Session cookie plus the stated permission. API keys are rejected with 403 on every route in
this layer. Callers without a session get `401 authentication_required`; signed-in callers
without the permission get `403 forbidden` with `requiredPermission`.

Event bodies in this layer use the internal event shape (`repo.hydrate`), not the public
presentation shape: `date`, `endDate`, `start`, `end`, `allDay`, `campusId`, `categoryId`,
`locationId`, `organizerId`, `academicYearId`, `yearGroupIds`, `audienceIds`, `visibility`,
`status`, `important`, `notify`, `recurrence`, `links`, `attachments`, `source`,
`createdAt`, `updatedAt`, `publishedAt`, `createdBy`, `updatedBy`.

#### Dashboard

`GET /api/v1/admin/dashboard` — permission `accessCms`. No parameters.

```json
{ "data": {
  "totals": { "events": 412, "upcoming": 118, "drafts": 24, "important": 31,
              "pendingSubmissions": 3, "conflicts": 2 },
  "byCampus": [ { "k": "pr", "c": 160 }, { "k": "__all", "c": 74 } ],
  "byCategory": [ { "k": "academic", "c": 96 } ],
  "conflicts": [ { "date": "2026-09-14", "locationId": "loc_hall",
                   "a": { "id": "evt_…", "title": "Assembly", "start": "08:00", "end": "08:40" },
                   "b": { "id": "evt_…", "title": "Rehearsal", "start": "08:20", "end": "09:30" } } ],
  "recentActivity": [ { "action": "published", "entity": "event", "…": "" } ]
} }
```

Conflict scanning covers today → today + 300 days; at most 20 are returned.

#### Events

| Route | Permission |
|---|---|
| `GET /api/v1/admin/events` | `accessCms` |
| `POST /api/v1/admin/events` | `create` |
| `GET /api/v1/admin/events/:id` | `accessCms` |
| `PATCH /api/v1/admin/events/:id` | `edit` |
| `DELETE /api/v1/admin/events/:id` | `edit` |
| `POST /api/v1/admin/events/:id/restore` | `edit` |
| `POST /api/v1/admin/events/:id/duplicate` | `create` |
| `POST /api/v1/admin/events/bulk` | `edit` |

**`GET /api/v1/admin/events`** — flat, paginated list (no occurrence expansion).

| Parameter | Type | Default |
|---|---|---|
| `from`, `to` | `YYYY-MM-DD` | none (unbounded); ignored if malformed |
| `status` | comma-separated | none |
| `campus` | comma-separated | none |
| `category` | comma-separated | none |
| `q` | string | none |
| `sort` | `date` \| `title` \| `status` \| `campus` \| `category` \| `updated` | `date` |
| `dir` | `asc` \| `desc` | `asc` |
| `limit` | integer | 50, clamped 1–500 |
| `offset` | integer | 0 |

```bash
curl -s -b jar.txt "https://calendar.pbis.edu.la/api/v1/admin/events?status=draft&sort=updated&dir=desc&limit=25"
```

```json
{ "data": [ { "id": "evt_…", "title": "Staff INSET", "status": "draft", "…": "" } ],
  "meta": { "total": 24, "limit": 25, "offset": 0 } }
```

**`POST /api/v1/admin/events`** — permission `create`.

| Field | Type | Default |
|---|---|---|
| `title` | string, ≤200 chars | required |
| `date` | `YYYY-MM-DD` | required |
| `endDate` | `YYYY-MM-DD` \| null | `null` |
| `start`, `end` | `HH:MM` | `null`; `end` must be after `start` |
| `allDay` | boolean | `false` |
| `description` | string | `""` |
| `campusId`, `locationId`, `organizerId` | id \| null | `null` (organizer defaults to the caller) |
| `categoryId` | id | required to exist if given |
| `yearGroupIds`, `audienceIds` | string[] | `[]` |
| `visibility` | `public` \| `internal` \| `restricted` | `public` |
| `status` | `draft` \| `pending` \| `published` \| `cancelled` \| `postponed` \| `completed` \| `archived` | `draft` |
| `important`, `notify` | boolean | `false` |
| `recurrence` | object \| null | `null` |
| `links` | array | `[]` |
| `acknowledgeConflict` | boolean | `false` — set to publish over a location clash |

```bash
curl -s -b jar.txt -X POST https://calendar.pbis.edu.la/api/v1/admin/events \
  -H 'Content-Type: application/json' \
  -d '{"title":"Secondary Parent Evening","date":"2026-10-22","start":"16:00","end":"19:00",
       "campusId":"se","categoryId":"parent","locationId":"loc_hall","status":"published","notify":true}'
```

```json
{ "data": { "id": "evt_m2…", "slug": "secondary-parent-evening-2610",
  "status": "published", "publishedAt": "2026-08-14T02:31:10.004Z", "…": "" },
  "conflicts": [] }
```

Returns `201`. A conflict blocks the request only when `status` is `published` and
`acknowledgeConflict` is not set:

```json
{ "error": "conflict", "message": "The location is already booked for that time.",
  "conflicts": [ { "id": "evt_…", "title": "Drama Rehearsal", "date": "2026-10-22",
                   "start": "16:30", "end": "18:00" } ] }
```

Failures: `422 validation_failed`, `403 forbidden` (a `campusadmin` filing against another
campus, or with no campus), `409 conflict`.

**`GET /api/v1/admin/events/:id`** — returns `{ data, revisions }`, where `revisions` is the
version list. Failures: `404 not_found`.

**`PATCH /api/v1/admin/events/:id`** — partial update; accepts the same fields plus
`changeNote` (recorded on the revision) and `acknowledgeConflict`. The audit action is
derived: a status change maps to `published`/`cancelled`/`postponed`/`archived`, a date
change to `moved`, otherwise `updated`. Setting `notify` on a published event queues a
notification; a transition into `cancelled` always queues one.
Failures: `404 not_found`, `403 forbidden` (cross-campus), `422 validation_failed`,
`409 conflict`.

**`DELETE /api/v1/admin/events/:id`** — soft delete. Sets `status='archived'`, writes a
revision, then stamps `deleted_at`.

```json
{ "data": { "archived": true, "id": "evt_…", "restorable": true } }
```

Failures: `404 not_found`, `403 forbidden`.

**`POST /api/v1/admin/events/:id/restore`** — clears `deleted_at` and returns the event to
`draft`. No body. Returns `{ data: <event> }`.

**`POST /api/v1/admin/events/:id/duplicate`** — copies the source event as a `draft` with a
new id and slug. Optional body: `title` (default `"<title> (copy)"`), `date`, `campusId`,
`yearGroupIds`. Returns `201`. Failures: `404 not_found`, `403 forbidden` (campus scope).

**`POST /api/v1/admin/events/bulk`** — permission `edit`.

Body: `{ "ids": string[], "operation": string, "value": any }`.

| `operation` | Effect | `value` |
|---|---|---|
| `publish` | status → `published` | — |
| `unpublish` | status → `draft` | — |
| `cancel` | status → `cancelled` | — |
| `archive` | soft delete via `archiveEvent` | — |
| `important` / `unimportant` | toggles `important` | — |
| `campus` | sets `campusId` (`null` when `value` is falsy) | campus id |
| `category` | sets `categoryId` | category id |
| `visibility` | sets `visibility` | level |
| `move` | shifts `date` (and `endDate` if present) | day offset, positive or negative number |

Runs in one transaction; per-event failures are skipped, not fatal.

```bash
curl -s -b jar.txt -X POST https://calendar.pbis.edu.la/api/v1/admin/events/bulk \
  -H 'Content-Type: application/json' \
  -d '{"ids":["evt_a","evt_b"],"operation":"move","value":7}'
```

```json
{ "data": { "updated": ["evt_a"], "skipped": [ { "id": "evt_b", "reason": "forbidden" } ] } }
```

Skip reasons: `not_found`, `forbidden`, `bad_offset`.
Failures: `422 no_ids`, `422 too_many` (>500 ids), `422 unknown_operation`.

#### Revisions

| Route | Permission |
|---|---|
| `GET /api/v1/admin/events/:id/revisions` | `accessCms` |
| `GET /api/v1/admin/events/:id/revisions/:version` | `accessCms` |
| `POST /api/v1/admin/events/:id/revisions/:version/restore` | `edit` |

The list returns `{ id, version, changed_by, change_note, created_at }` newest first. The
single-version route returns `{ data: { revision, current, diff } }`, where `diff` compares
these fields only: `title`, `description`, `date`, `endDate`, `start`, `end`, `allDay`,
`campusId`, `categoryId`, `locationId`, `visibility`, `status`, `important`, `yearGroupIds`,
`audienceIds`, as `{ field, was, now }`.

```bash
curl -s -b jar.txt https://calendar.pbis.edu.la/api/v1/admin/events/evt_m2…/revisions/3
```

Restoring writes the snapshot back as a normal update with the note
`"Restored from version N"`. Failures: `404 not_found`.

#### Conflicts

`GET /api/v1/admin/conflicts` — permission `accessCms`. Query `from` (default today),
`to` (default today + 300 days). Returns all location double-bookings in the window.

`POST /api/v1/admin/conflicts/check` — permission `accessCms`. Body is a candidate event
(`locationId`, `date`, `endDate`, `start`, `end`, `allDay`) plus optional `ignoreId`.
Returns `{ data: [ { id, title, date, start, end } ] }`. Conflict detection applies only to
timed events with a location; all-day events never conflict.

#### Submissions

| Route | Permission |
|---|---|
| `GET /api/v1/admin/submissions` | `accessCms` |
| `POST /api/v1/admin/submissions/:id/approve` | `approve` |
| `POST /api/v1/admin/submissions/:id/reject` | `approve` |
| `POST /api/v1/admin/submissions/:id/request-changes` | `approve` |

`GET` accepts `status` (a single status, or `all`/omitted for everything) and adds a
`conflicts` array to each submission.

**Approve** creates a published event from the submission and links it back
(`published_event_id`). The body may override any field before publishing: `title`,
`description`, `date`, `endDate`, `start`, `end`, `allDay`, `campusId`, `categoryId`,
`locationId`, `yearGroupIds`, `audienceIds`, `visibility` (default `public`), `important`,
and `note` (default `"Approved and published."`). The created event has `status:
"published"`, `source: "submission"`, `sourceRef: <submission id>`, and the submitter as
organiser.

```bash
curl -s -b jar.txt -X POST https://calendar.pbis.edu.la/api/v1/admin/submissions/sub_m1…/approve \
  -H 'Content-Type: application/json' -d '{"locationId":"loc_bus","note":"Approved, bus booked."}'
```

```json
{ "data": { "event": { "id": "evt_m3…", "status": "published", "…": "" }, "submissionId": "sub_m1…" } }
```

Failures: `404 not_found`, `409 already_approved`.

**Reject** sets status `rejected`; **request-changes** sets status `changes`. Both take
`{ "note": string }` (defaults `"Rejected."` / `"Changes requested."`) and return the
updated submission. Failures: `404 not_found`.

#### Taxonomy

| Route | Permission |
|---|---|
| `GET /api/v1/admin/taxonomy/:kind` | `accessCms` |
| `POST /api/v1/admin/taxonomy/:kind` | `manageTaxonomy` |
| `PATCH /api/v1/admin/taxonomy/:kind/:id` | `manageTaxonomy` |
| `DELETE /api/v1/admin/taxonomy/:kind/:id` | `manageTaxonomy` |

| `:kind` | Table | Writable fields |
|---|---|---|
| `campuses` | `campuses` | `name`, `short`, `slug`, `blurb`, `colour`, `sortOrder`, `archived` |
| `yeargroups` | `year_groups` | `name`, `slug`, `campusId`, `sortOrder`, `archived` |
| `categories` | `event_categories` | `name`, `slug`, `colourVar`, `sortOrder`, `archived` |
| `locations` | `locations` | `name`, `slug`, `campusId`, `capacity`, `archived` |
| `audiences` | `audiences` | `name`, `slug`, `sortOrder` |
| `years` | `academic_years` | `name`, `startDate`, `endDate`, `status` |
| `terms` | `terms` | `name`, `academicYearId`, `startDate`, `endDate`, `status`, `sortOrder` |

Both camelCase and snake_case keys are accepted. On create, `slug` is generated from the
name if omitted and made unique (`-2`, `-3`, …); an explicit `id` may be supplied,
otherwise one is generated from the first three letters of `:kind`. Editing `years` or
`terms` invalidates the cached closure dates.

```bash
curl -s -b jar.txt -X POST https://calendar.pbis.edu.la/api/v1/admin/taxonomy/locations \
  -H 'Content-Type: application/json' -d '{"name":"Music Room 2","campusId":"se","capacity":30}'
```

Delete is reference-aware: if the row is referenced by events (or link tables) and the table
has an `archived` column, it is archived and `{ data: { archived: true, references: n } }` is
returned. If it is referenced and cannot be archived (`audiences`, `years`, `terms`), the
call fails with `409 in_use`. Otherwise the row is soft-deleted:
`{ data: { deleted: true } }`.

Failures: `404 unknown_kind`, `404 not_found`, `422 validation_failed` (missing name),
`422 nothing_to_update`, `409 in_use`.

#### Audit log

`GET /api/v1/admin/audit` — permission `viewAudit`.

| Parameter | Default |
|---|---|
| `q` | none (matches title, action, or user name) |
| `entity` | none |
| `entityId` | none |
| `limit` | 100, capped at 500 |
| `offset` | 0 |

Returns `{ data: [entries], meta: { total } }`, newest first, each entry joined to the
acting user's name and role.

#### Users

| Route | Permission |
|---|---|
| `GET /api/v1/admin/users` | `accessCms` |
| `POST /api/v1/admin/users` | `manageUsers` |
| `PATCH /api/v1/admin/users/:id` | `manageUsers` |

`GET` returns `id, email, name, initials, role, campus_id, active, last_login_at,
created_at` for non-deleted users, ordered by role then name. Password hashes are never
returned.

`POST` body: `email` and `name` are required; `initials` defaults to the uppercased first
letters of the name (2 chars), `role` defaults to `teacher`, `campusId` defaults to `null`,
`password` is optional (no password means no local sign-in). Returns `201`.
Failures: `422 validation_failed`, `409 email_in_use`.

`PATCH` accepts `name`, `role`, `campusId`, `active`, `password`. Failures:
`404 not_found`, `422 nothing_to_update`.

#### API keys

| Route | Permission |
|---|---|
| `GET /api/v1/admin/api-keys` | `manageApiKeys` |
| `POST /api/v1/admin/api-keys` | `manageApiKeys` |
| `DELETE /api/v1/admin/api-keys/:id` | `manageApiKeys` |

`GET` lists `id, name, scopes, created_at, last_used_at, revoked_at` — never the key.

```bash
curl -s -b jar.txt -X POST https://calendar.pbis.edu.la/api/v1/admin/api-keys \
  -H 'Content-Type: application/json' -d '{"name":"Reception signage","scopes":"read"}'
```

```json
{ "data": { "id": "key_m4…", "name": "Reception signage", "key": "pbis_9Xq…" },
  "note": "Store this key now — it is not shown again." }
```

`scopes` defaults to `"read"` and is stored but not currently enforced beyond the blanket
read-only rule. `DELETE` soft-revokes: `{ "data": { "revoked": true } }`.
Failures: `422 validation_failed` (missing `name`).

#### Settings and notifications

| Route | Permission | Notes |
|---|---|---|
| `GET /api/v1/admin/settings` | `accessCms` | flat `{ key: value }` map |
| `PUT /api/v1/admin/settings` | `manageTaxonomy` | upserts every key in the body; values are coerced to strings |
| `GET /api/v1/admin/notifications` | `accessCms` | 100 most recent queued notifications |

Notifications are queued, not sent, by this codebase: publishing or cancelling an event with
`notify` inserts a row with a resolved recipient count and `status: "queued"`.

#### Import

| Route | Permission |
|---|---|
| `POST /api/v1/admin/imports` | `import` |
| `GET /api/v1/admin/imports/:id` | `import` |
| `POST /api/v1/admin/imports/:id/commit` | `import` |
| `DELETE /api/v1/admin/imports/:id` | `import` |
| `GET /api/v1/admin/imports/template.csv` | `import` |

Import is two-phase: **an import never publishes**. The first call parses and previews; a
second, explicit call writes drafts.

`POST /api/v1/admin/imports` body: `{ "content": string, "filename": string?, "format": "csv"|"xlsx"? }`.
Format is auto-detected as `ics` when the content contains `BEGIN:VCALENDAR`, otherwise
`csv` (or `xlsx`, which is refused). CSV headers are matched to targets by pattern
(`Event Name`/`Title`/`Summary` → `title`, `Start Date`/`Date` → `date`, `End Date`,
`Start`/`Start Time`, `End`/`End Time`, `Campus`, `Year Group…`, `Categor…`, `Audience…`,
`Location`/`Venue`/`Room`, `Description`/`Notes`/`Details`). Campus, category, year group,
audience and location values are resolved by name, short name or slug. Missing categories
are inferred from the title; missing audiences default to `["community"]`.

Each preview row gets a status and a default action:

| Row status | Meaning | Default action |
|---|---|---|
| `ready` | valid, no clash | `import` |
| `warning` | unknown location name, or no campus matched | `import` |
| `conflict` | location booked by another event | `import` |
| `duplicate` | same title on the same date already exists | `skip` |
| `error` | missing title or bad date | `skip` |

```bash
curl -s -b jar.txt -X POST https://calendar.pbis.edu.la/api/v1/admin/imports \
  -H 'Content-Type: application/json' \
  -d '{"filename":"term1.csv","content":"Event Name,Start Date\nOpen Day,2026-11-05\n"}'
```

```json
{ "data": { "id": "imp_m5…", "format": "csv",
  "mapping": [ { "source": "Event Name", "target": "title" }, { "source": "Start Date", "target": "date" } ],
  "rows": [ { "data": { "title": "Open Day", "date": "2026-11-05", "categoryId": "admissions", "…": "" },
              "status": "ready", "message": "", "action": "import" } ],
  "summary": { "ready": 1 } } }
```

Returns `201`. Failures: `422 no_content`, `422 not_enough_rows`, `415 unsupported_format`.

`POST /api/v1/admin/imports/:id/commit` body: `{ "decisions": { "<rowIndex>": "import"|"skip"|"replace" } }`
(optional; each row's own `action` is the default). `replace` updates the duplicate event
identified during preview. All created events are `status: "draft"`, `visibility: "public"`,
`source: "import"`, `sourceRef: <job id>`.

```json
{ "data": { "created": 12, "replaced": 1, "skipped": 3, "ids": ["evt_…"],
  "status": "committed",
  "note": "Imported events are drafts. Review and publish them when you are ready." } }
```

Failures: `404 not_found`, `409 already_committed`.

`DELETE /api/v1/admin/imports/:id` marks the job `cancelled` and returns
`{ "data": { "cancelled": true } }`.

`GET /api/v1/admin/imports/template.csv` returns a CSV attachment
(`pbis-import-template.csv`) with the canonical header row and one example line.

#### Attachments (write)

`POST /api/v1/admin/events/:id/attachments` — permission `edit`, plus the campus-scope check.
`multipart/form-data`, exactly one file, maximum 10 MiB.

Allowed MIME types: `application/pdf`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`,
`application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`application/vnd.ms-excel`,
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/plain`, `text/csv`.

Files are stored under a generated key, never the uploaded filename, so a crafted name
cannot escape the uploads directory.

```bash
curl -s -b jar.txt -X POST https://calendar.pbis.edu.la/api/v1/admin/events/evt_m2…/attachments \
  -F file=@permission-slip.pdf
```

```json
{ "data": { "id": "att_m6…", "name": "permission-slip.pdf", "size": 84210,
            "url": "/api/v1/attachments/att_m6…" } }
```

Returns `201`. Failures: `404 not_found`, `403 forbidden`, `422 no_file`,
`415 unsupported_type` (echoes `mime`), `413 too_large` (echoes `maxBytes`).

`DELETE /api/v1/admin/attachments/:id` — permission `edit`. Soft delete;
returns `{ "data": { "deleted": true } }` unconditionally.

#### Academic-year rollover

| Route | Permission |
|---|---|
| `POST /api/v1/admin/rollover/preview` | `rollover` |
| `POST /api/v1/admin/rollover/commit` | `rollover` |

Events from the source year are classified:

| Class | Rule | Default decision |
|---|---|---|
| `recurring` | the event has a recurrence rule | `copy` |
| `annual` | category is `holiday`, `celebration`, `sports`, `admissions` or `graduation` | `copy` |
| `review` | category is `exam`, `assessment` or `deadline` | `review` (copied, and counted in `held`) |
| `onetime` | everything else | `skip` |

**Preview** body: `{ "fromYearId": string, "shiftDays": number? }` — `shiftDays` defaults to
**364** (52 weeks, preserving weekday alignment). Returns
`{ data: { fromYear, shiftDays, counts, groups } }`, where each group entry is
`{ id, title, from, to, category, recurring }`.

**Commit** body:

| Field | Type | Default |
|---|---|---|
| `fromYearId` | string | required |
| `newYear` | `{ name, start, end }` | required; `start`/`end` must be `YYYY-MM-DD` |
| `shiftDays` | number | 364 |
| `decisions` | `{ recurring, annual, review, onetime }` each `copy`\|`review`\|`skip` | `copy`, `copy`, `review`, `skip` |
| `terms` | `[{ name, start, end }]` | `[]` |

```bash
curl -s -b jar.txt -X POST https://calendar.pbis.edu.la/api/v1/admin/rollover/commit \
  -H 'Content-Type: application/json' \
  -d '{"fromYearId":"ay_2627","newYear":{"name":"2027–2028","start":"2027-08-16","end":"2028-06-23"},
       "terms":[{"name":"Term 1","start":"2027-08-16","end":"2027-12-10"}]}'
```

```json
{ "data": { "academicYearId": "ay_m7…", "created": 96, "held": 14, "skipped": 41,
  "note": "Every copied event was created as a draft in the new year. Nothing is live until you publish it." } }
```

The new academic year is created with `status: "planning"`; copied events are `draft`,
`source: "rollover"`, `sourceRef: <original event id>`; a recurrence `until` date is shifted
by the same offset. Failures: `422 unknown_source_year`, `422 validation_failed`.

---

### 4.4 Layer 4 — Integration

`Authorization: Bearer pbis_…` required. Read-only. Both endpoints query as the `public`
viewer, so only public-visibility, publicly visible events are returned.

#### `GET /api/v1/integration/today`

No parameters.

```bash
curl -s -H "Authorization: Bearer pbis_9Xq…" \
  https://calendar.pbis.edu.la/api/v1/integration/today
```

```json
{ "data": { "date": "2026-08-14",
            "events": [ { "id": "evt_…", "title": "Whole School Assembly", "…": "" } ] },
  "meta": { "key": "Reception signage", "timezone": "Asia/Vientiane" } }
```

#### `GET /api/v1/integration/events`

| Parameter | Type | Default |
|---|---|---|
| `from` | `YYYY-MM-DD` | today |
| `to` | `YYYY-MM-DD` | `from + 90` days |
| `scope` | calendar id, campus slug or year-group slug | `all` (unresolvable scopes fall back to all) |

Events are de-duplicated by id (one entry per event, not per occurrence).

```bash
curl -s -H "Authorization: Bearer pbis_9Xq…" \
  "https://calendar.pbis.edu.la/api/v1/integration/events?scope=primary&from=2026-09-01&to=2026-09-30"
```

```json
{ "data": [ { "id": "evt_…", "title": "Primary Sports Day", "…": "" } ],
  "meta": { "scope": "primary", "from": "2026-09-01", "to": "2026-09-30",
            "count": 18, "key": "Reception signage" } }
```

Failures: `401 api_key_required` when the header is missing, malformed or the key is
unknown/revoked.

---

## 5. ICS feeds

### 5.1 Feed URLs

```
https://calendar.pbis.edu.la/feeds/{scope}.ics[?token=…]
webcal://calendar.pbis.edu.la/feeds/{scope}.ics[?token=…]
```

`{scope}` resolves in this order: a row in `calendars`, then a campus **slug**, then a
year-group **slug**. Seeded calendars are `all`, `early-years`, `primary`, `secondary`,
`important`, `holidays`, `exams`, and one `yg-<id>` per year group. Scope types map to
filters as follows:

| `scope_type` | Filter |
|---|---|
| `campus` | that campus (plus whole-school events) |
| `yeargroup` | that year group (plus events with no year groups) |
| `category` | that category |
| `important` | `important = 1` |
| `holidays` | category `holiday` |
| `exams` | categories `exam`, `assessment` |
| `all` / other | no additional filter |
| `personal` | the token holder's My PBIS Calendar |

Every feed covers **today − 120 days to today + 500 days** and includes statuses
`published`, `cancelled`, `postponed`, `completed`. Recurring events appear once, carrying
their `RRULE` — that is what lets a calendar app render the whole series.

```bash
curl -s "https://calendar.pbis.edu.la/feeds/primary.ics" -o primary.ics
```

**Tokens.** Without a token the feed is generated for the `public` viewer. With
`?token=…` matching an unrevoked subscription of an active user, the feed is generated for
that user's role and campus, and `fetch_count` / `last_fetched_at` are updated.
`/feeds/personal.ics` **requires** a token.

Failures (all `text/plain`, not JSON):

| Status | Body |
|---|---|
| 404 | `Unknown or revoked feed token.` |
| 404 | `Unknown calendar.` |
| 401 | `This feed requires a personal token.` |

### 5.2 Response headers and conditional GET

| Header | Value |
|---|---|
| `Content-Type` | `text/calendar; charset=utf-8` |
| `Content-Disposition` | `inline; filename="pbis-{scope}.ics"` |
| `Cache-Control` | `public, max-age=900` |
| `ETag` | `"<sha1 of the body, base64url>"` |
| `X-PBIS-Event-Count` | number of VEVENTs |

The ETag is computed over the generated body. If the request carries an exactly matching
`If-None-Match`, the server returns `304 Not Modified` with no body:

```bash
curl -s -D - -o /dev/null -H 'If-None-Match: "kQ9c…"' \
  https://calendar.pbis.edu.la/feeds/primary.ics
# HTTP/1.1 304 Not Modified
```

Single-event ICS: `GET /api/v1/events/{id}.ics` — visibility-checked, served as
`attachment; filename="{slug}.ics"`. No ETag on this route. `404` (`text/plain`, `Not found.`)
when the event is missing or invisible.

### 5.3 Calendar body

Produced only by `src/lib/ics.js`, so a downloaded file and a live subscription can never
disagree. Lines are folded at 75 octets per RFC 5545.

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Panyathip British International School//PBIS Central Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:PBIS — Primary
X-WR-TIMEZONE:Asia/Vientiane
X-WR-CALDESC:Primary. Generated live from PBIS Central Calendar.
X-PUBLISHED-TTL:PT15M
REFRESH-INTERVAL;VALUE=DURATION:PT15M
BEGIN:VTIMEZONE
TZID:Asia/Vientiane
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0700
TZOFFSETTO:+0700
TZNAME:+07
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:evt_m1x2k9Qz7Ab@pbis.edu.la
DTSTAMP:20260813T170000Z
SEQUENCE:0
DTSTART:20260914T013000Z
DTEND:20260914T053000Z
SUMMARY:Primary Sports Day
DESCRIPTION:House athletics on the main field.\n\nCampus: Primary\n\n…
LOCATION:Sports Field — Primary Campus\, Panyathip British International School
CATEGORIES:Sports
STATUS:CONFIRMED
URL:https://calendar.pbis.edu.la/events/primary-sports-day-2609
X-PBIS-CAMPUS:Primary
END:VEVENT
END:VCALENDAR
```

* `REFRESH-INTERVAL;VALUE=DURATION:PT15M` and `X-PUBLISHED-TTL:PT15M` ask clients to poll
  every 15 minutes; the HTTP `max-age` of 900 s matches.
* **Time zone.** A single `VTIMEZONE` for `Asia/Vientiane` with a fixed `+07:00` offset and
  no DST rule. Timed events are emitted as UTC stamps (`…Z`) converted from stored wall
  time. A timed event with no start falls back to `08:00`; with no end, to the start time or
  `09:00`.
* **All-day events** use `DTSTART;VALUE=DATE` and `DTEND;VALUE=DATE` set to the day *after*
  the last day, per the exclusive-end convention.
* `STATUS` maps: `cancelled` → `CANCELLED`, `draft` → `TENTATIVE`, everything else →
  `CONFIRMED`.
* Extension properties: `X-PBIS-CAMPUS` (campus name or `Whole School`) and
  `X-PBIS-IMPORTANT:TRUE` on flagged events.
* `UID` is `{eventId}@pbis.edu.la` and is stable across edits, so a client updates rather
  than duplicates an event.

---

## 6. Embed and server-rendered pages

### 6.1 `GET /embed`

Returns a standalone, self-contained HTML fragment page (inline CSS, no JavaScript,
`<meta name="robots" content="noindex">`) intended for an `<iframe>`. It is served with
`X-Frame-Options: ALLOWALL` and `Cache-Control: public, max-age=300`, and it always queries
as the `public` viewer regardless of any cookie.

| Parameter | Type | Default |
|---|---|---|
| `from` | `YYYY-MM-DD` | today |
| `to` | `YYYY-MM-DD` | `from + 120` days |
| `limit` | integer | 8, clamped 1–50 |
| `theme` | `light` \| `dark` | `light` |
| `campus` | campus slug **or** id | none |
| `yearGroup` | year-group slug **or** id | none |
| `category` | comma-separated ids | none |
| `audience` | comma-separated ids | none |
| `important` | `true` | false |

Only occurrence starts are listed (`isStart`), so a multi-day event appears once. An empty
result renders "No events scheduled in this period." Each row links to
`/events/{slug}` in a new tab; the footer links to `/calendar`.

```html
<iframe src="https://calendar.pbis.edu.la/embed?campus=primary&limit=6&theme=dark"
        width="100%" height="420" style="border:0" loading="lazy" title="PBIS events"></iframe>
```

### 6.2 `GET /events/:slug`

The app shell with real head tags injected server-side, before the client app boots, so a
shared link previews correctly and a public event can be indexed. Site-wide default
`<title>`, `<meta name="description">` and `og:title|description|type|url` tags are stripped
first, so a page never emits duplicates.

An event is **indexable** only when `visibility === 'public'` and status is `published` or
`completed`. Otherwise the page emits `<meta name="robots" content="noindex,nofollow">` and
the header `X-Robots-Tag: noindex`, and the JSON-LD block is omitted entirely.

Injected head:

| Tag | Value |
|---|---|
| `<title>` | `{title} · PBIS Central Calendar` |
| `<meta name="description">` | event description (or a generated fallback), collapsed whitespace, 300 chars |
| `<link rel="canonical">` | `{origin}/events/{slug}` |
| `<meta name="robots">` | `index,follow` or `noindex,nofollow` |
| Open Graph | `og:type` (`website`), `og:title`, `og:description`, `og:url`, `og:site_name` |
| Twitter | `twitter:card` (`summary`), `twitter:title`, `twitter:description` |
| `<meta name="pbis:when">` | human-readable date, or `YYYY-MM-DD HH:MM` for timed events |
| `<link rel="alternate" type="text/calendar">` | `{origin}/api/v1/events/{id}.ics` |
| `<script type="application/ld+json">` | schema.org `Event` — indexable events only |

JSON-LD payload: `name`, `description`, `startDate`/`endDate` (ISO with `+07:00`, or bare
dates for all-day), `eventStatus` (`EventCancelled` / `EventPostponed` / `EventScheduled`),
`eventAttendanceMode: OfflineEventAttendanceMode`, `location` (the event location or the
school, always `addressLocality: Vientiane`, `addressCountry: LA`), `organizer`
(`EducationalOrganization`), `isAccessibleForFree: true` and `url`.

All embedded JSON is escaped for `<`, `>`, `&`, U+2028 and U+2029 before being written into
a `<script>` block, so a value containing `</script>` cannot break out.

A missing or invisible event returns `404 text/html` with
`<title>Event not found · PBIS Central Calendar</title>` and `noindex`.

### 6.3 `robots.txt` and `sitemap.xml`

`GET /robots.txt`:

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Sitemap: https://calendar.pbis.edu.la/sitemap.xml
```

`GET /sitemap.xml` lists `/`, `/calendar`, `/dates`, `/year`, `/subscribe`, plus up to 5000
public, published-or-completed event pages with `lastmod` from `updated_at`.

---

## 7. Conventions

**Time zone.** The canonical zone is `Asia/Vientiane` (UTC+7, no DST). Events are stored as
**wall time** — a date key plus optional `HH:MM` — never as UTC instants. UTC appears only
at the boundary: ICS stamps and the `+07:00` offset in public JSON. "Today" is always
computed in school time, whatever the server's own zone is.

**Date and time formats.**

| Concept | Format | Example |
|---|---|---|
| Date key (`from`, `to`, `date`, `endDate`) | `YYYY-MM-DD` | `2026-09-14` |
| Wall clock (`start`, `end`) | `HH:MM`, 24-hour | `08:30` |
| Public `start` / `end` in event JSON | ISO-8601 with the school offset | `2026-09-14T08:30:00+07:00` |
| Public `start` / `end` for all-day events | bare date key | `2026-09-14` |
| Timestamps (`createdAt`, `updatedAt`, `generatedAt`) | ISO-8601 UTC | `2026-08-14T02:14:55.107Z` |
| ICS stamps | UTC basic format | `20260914T013000Z` |

Malformed `from`/`to` values are not errors: they are ignored and the default is used.

**Identifiers.** Generated ids are cuid-style: `{prefix}_{base36 timestamp}{6 random bytes
base64url}` — e.g. `evt_m1x2k9Qz7Ab`, `sub_…`, `rev_…`, `att_…`, `imp_…`, `key_…`,
`usr_…`, `ntf_…`, `exp_…`, `ay_…`, `trm_…`. The time prefix keeps insertion order roughly
sortable. Taxonomy rows may carry short human-authored ids instead (`pr`, `holiday`,
`primary`). Slugs are lowercase, hyphenated, at most 72 characters, and made unique within
their table by appending `-2`, `-3`, …; event slugs append a `YYMM` suffix derived from the
start date. Anywhere an event is addressed by `:id` or `:slug`, either form is accepted.

**Soft delete.** Nothing is physically deleted. `deleted_at` is stamped on events,
attachments, taxonomy rows, submissions and users, and every read path excludes those rows.
Deleting an event first sets `status='archived'` (writing a revision) and then stamps
`deleted_at`; `POST /admin/events/:id/restore` clears it and returns the event to `draft`.
Taxonomy rows still in use are archived (`archived = 1`) rather than deleted. API keys and
sessions use `revoked_at`; expired sessions are the one exception — they are physically
purged hourly.

**Revisions.** Before any change to an event that is published (or has ever been published,
i.e. has a `published_at`), a full JSON snapshot is written to `event_revisions` with an
incrementing `version`, the acting user and an optional `change_note`. Draft-only edits do
not accumulate revisions. Revisions are readable and restorable through the
`/admin/events/:id/revisions` routes.

**Audit log.** Every write records an audit entry (`created`, `updated`, `published`,
`moved`, `cancelled`, `archived`, `restored`, `submitted`, `resubmitted`, `approved`,
`rejected`, `changes requested`, `imported`, `rolled over`, `signed in`, `bulk <op>`, …),
readable via `GET /api/v1/admin/audit` with the `viewAudit` permission.
