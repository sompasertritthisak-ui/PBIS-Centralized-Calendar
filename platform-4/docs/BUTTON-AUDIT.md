# Control audit — every button, on both surfaces

The question asked of each control: does it end somewhere, and does it do the
thing its label promises?

Answered three ways, because no single method answers it. A static pass reads
every action the interface emits and every action it handles, and diffs the
two. A browser sweep clicks each distinct control on all twenty routes and
records whether anything moved. A verification pass takes each control the
sweep could not vouch for and asks the specific question that settles it —
did a file download, did the clipboard fill, did the filter filter.

Run them with the server up:

```bash
node test/buttons.test.js          # the sweep — 321 controls, 20 routes
node test/buttons-verify.test.js   # 22 targeted assertions
```

## Result

| | |
|---|---|
| Distinct controls clicked | 321 across 20 routes |
| Did something | 218 |
| Correctly disabled | 3 |
| Skipped as destructive (sign out, delete, reset) | 33 |
| Did nothing — all explained and individually verified below | 67 |
| Errors | 0 |

## What was broken, and what it now does

**The import source chooser did nothing.** The CSV / XLSX / ICS / Google
buttons rendered with `aria-pressed`, looked selectable, and had no handler at
all — four dead buttons at the top of the import screen. They now select the
source, and the file input's accepted extensions and the hint text below it
follow the choice. Picking XLSX says plainly that Excel workbooks are not
parsed on this deployment, at the moment of choosing, instead of letting the
upload fail with a 415 two steps later.

**The column mapper did nothing.** Every `Source column → Field` dropdown in
the import preview was inert, which is worse than useless: an administrator
correcting a mis-guessed column would watch the dropdown change and believe
the import had been corrected. Changing a mapping now re-reads the whole file
against the corrected mapping and rebuilds the preview. This needed a server
change too — `POST /api/v1/admin/imports` accepts an optional `mapping` array
that overrides the guessed one.

**Three rollover buttons and "Keep anyway" did nothing.** On the year-rollover
screen, *Import an ICS feed*, *Add manually* and *Skip for now* were plain
`<button>` elements with no action, and the *Keep anyway* button beside each
conflict warning did not keep anything. They now go to the import screen, open
the event editor, advance the wizard, and accept the double booking — which
removes it from the outstanding list, so what remains on screen is genuinely
what still needs attention.

**Every published URL dropped the port.** The embed emitted
`http://localhost/events/…`, and so did canonical links, Open Graph tags and
the personal feed addresses handed to parents. The cause was `req.hostname`,
which Fastify strips the port from. On a deployment behind a proxy on 443 this
is invisible; anywhere else every link is broken. All seven sites now go
through `src/lib/origin.js`, which reads the Host header, honours
`X-Forwarded-Host` and `X-Forwarded-Proto`, and lets `PBIS_ORIGIN` override the
lot.

**The browser had a second, worse copy of the import parser.** File uploads
were parsed in the browser by `importICS` / `buildImportPreview` while pasted
text went to the server. The two had drifted: the browser copy truncated
folded lines and treated an all-day `DTEND` as inclusive when RFC 5545 says it
is exclusive, so a 19–24 October half-term imported as ending a day late.
Both paths now go through the server, and the duplicate has been deleted.

## The 67 that do nothing, and why that is correct

Each was checked individually, not waved through.

| What | Count | Why nothing moves |
|---|---|---|
| Links with `target="_blank"` — *Admin*, *Public site*, embed event links | 58 | They open a new tab. Verified: the href resolves 200, and every one carries `rel="noopener"`. The nav link for the page you are already on is in here too. |
| `ics-scope` — *Download .ics* | 2 | Fires a download, which changes nothing on screen. Verified: the download event fires, the file is named `.ics`, and it contains a real `VCALENDAR` with events. |
| `copy-text` — *Copy feed address* | 1 | Writes to the clipboard. Verified: a toast confirms, and the clipboard holds a valid `webcal://…​.ics` address. |
| `filter-campus`, `filter-yg`, `filter-aud` — the *All …* chips | 3 | Clearing a filter that is not set is genuinely nothing. Verified: with a filter active, the *All* chip clears it. |
| `page-size` | 1 | A `<select>`; clicking only opens the menu. Verified: choosing 25 then 100 changes the rows shown. |
| `sub-tab` — *Pending* | 1 | Already the active tab. |
| `imp-src` — the currently selected source | 1 | Re-selecting what is already selected. The other three now work. |

## A note on the sweep itself

The first two runs of the crawler produced a hundred false failures, and the
reason is worth recording. A `page.goto` that changes only the URL fragment
does not reload the document — so once a click opened the command palette, the
palette stayed open and swallowed every subsequent click, reporting the rest
of the CMS as dead. The sweep now forces a real document load between clicks.
Anyone extending these tests should keep that in mind: with hash routing,
`goto` is not a reset.

Two further sharp edges, both fixed in the tests rather than the app: admin
sub-routes must be spelled exactly as the keys in `ADMIN_NAV`, because an
unknown key silently renders the dashboard — a typo in a test route therefore
looks like a passing page. And the suites can no longer assume seeded pending
submissions still exist, since earlier runs approve them; they now create
their own.
