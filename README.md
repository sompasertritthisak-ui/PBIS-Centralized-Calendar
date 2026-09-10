# PBIS Centralized Calendar

The public calendar for Panyathip British International School.

**Live site:** https://sompasertritthisak-ui.github.io/PBIS-Centralized-Calendar/

## What is in this repository

| File | What it is |
|---|---|
| `index.html` | The whole public calendar in one self-contained file |
| `admin.html` | A preview of the staff dashboard — see the warning below |
| `.nojekyll` | Tells GitHub Pages to serve these files as-is |

`index.html` must stay at the **root** of the repository. GitHub Pages looks for
`index.html` where the publish source begins; when it does not find one, it
falls back to rendering `README.md` as a web page. That is why this repository
showed its README instead of the calendar — the calendar file was in a
subfolder.

Both files carry everything they need inside them: the fonts, the crest, the
icons and the 201 published events are all embedded. There is nothing to build,
nothing to install, and no other file to upload.

## What this site is, and what it is not

This is a **snapshot**. The events are baked into the file at the moment it was
built. Adding an event in `admin.html` changes only what is on your screen until
you reload, and the sign-in screen there checks nothing — a static file cannot
keep a secret, because anyone can read its source.

> **Do not treat `admin.html` on this public site as a staff area.** It is a
> demonstration of the interface. If you would rather not have it publicly
> visible at all, delete it from the repository — `index.html` does not need it.

The real system — the one that stores events, enforces who may see what, checks
passwords properly and publishes live calendar feeds — is the Node application
in the platform package. It needs a host that runs code; GitHub Pages serves
files only. `docs/DEPLOY.md` in that package covers Fly.io and Render.

## Updating the events

Rebuild `index.html` from the platform and replace this file. Editing the
embedded event data by hand is possible but not advisable: it is one long line
of JSON inside a script tag, and a single missing bracket blanks the calendar.
