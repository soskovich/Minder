#!/usr/bin/env node
/* check.js — validatie van het inline script in index.html.
 *
 * Extraheert alle attribuutloze <script>-blokken uit index.html (de app draait
 * als één inline script) en controleert de syntax met `node --check`.
 * Vervangt het handmatige awk/extract-commando.
 *
 * Gebruik:  node check.js
 * Exit:     0 = groen (syntax OK), 1 = rood (leesfout of syntaxfout).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RESET = '\x1b[0m';
const FILE = path.join(__dirname, 'index.html');

let html;
try {
  html = fs.readFileSync(FILE, 'utf8');
} catch (e) {
  console.error(`${RED}✗ Kan index.html niet lezen: ${e.message}${RESET}`);
  process.exit(1);
}

const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!blocks.length) {
  console.error(`${RED}✗ Geen inline <script>-blok gevonden in index.html${RESET}`);
  process.exit(1);
}
const js = blocks.join('\n;\n');

const tmp = path.join(os.tmpdir(), `minder-check-${process.pid}.js`);
let code = 0;
try {
  fs.writeFileSync(tmp, js);
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  console.log(`${GREEN}✓ Syntax OK${RESET} ${DIM}(${blocks.length} script-blok(ken), ${js.length.toLocaleString('nl-NL')} tekens)${RESET}`);
} catch (e) {
  const msg = (e.stderr ? e.stderr.toString() : e.message).trim();
  console.error(`${RED}✗ Syntaxfout in het inline script van index.html:${RESET}`);
  console.error(msg);
  code = 1;
} finally {
  try { fs.unlinkSync(tmp); } catch (_) {}
}
process.exit(code);
