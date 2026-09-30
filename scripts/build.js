#!/usr/bin/env node
/* Assemble the self-contained public site (index.html) from the parts in site/.
   GitHub Pages serves files only, so everything — styles, app, brand artwork and
   the published events — is inlined into one file. Run: npm run build */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const css = read('site/styles.css');
const sprite = read('site/brand/logo-sprite.svg').trimEnd();
const app = [
  'site/app/01-core.js',
  'site/data/events.js',
  'site/app/02-engine.js',
  'site/app/03-shell.js',
  'site/app/04-public.js',
  'site/app/05-runtime.js'
].map(read).join('');

const html = read('site/template.html')
  .replace('<!--CSS-->', () => css)
  .replace('<!--SPRITE-->', () => sprite)
  .replace('<!--APP-->', () => app);

fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log(`index.html written (${(html.length / 1024).toFixed(0)} KB)`);
