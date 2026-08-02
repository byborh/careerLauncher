#!/usr/bin/env node
/* build-seed.js - regenerate app/seed-companies.js from the repo README.
 *
 *   node app/scripts/build-seed.js
 *
 * The app fetches the live README at runtime ("Update data"), but it also ships
 * a bundled snapshot so it works on first run and offline. Re-run this whenever
 * the README table changes (or just let users click "Update data").
 * Uses the same parser the browser uses - app/data.js.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var CLData = require('../data.js');

var appDir = path.join(__dirname, '..');
var readmePath = path.join(appDir, '..', 'README.md');
var outPath = path.join(appDir, 'seed-companies.js');

var rows = CLData.parseMarkdownTable(fs.readFileSync(readmePath, 'utf8'));
if (!rows.length) {
  console.error('No rows parsed from ' + readmePath + ' - refusing to write an empty seed.');
  process.exit(1);
}

// Keep the payload small: applyLevel/applyReason are recomputed at load time.
var slim = rows.map(function (r) {
  return {
    company: r.company, domain: r.domain, email: r.email, team: r.team,
    location: r.location, description: r.description, source: r.source,
    lastVerified: r.lastVerified
  };
});

var banner = [
  '/* seed-companies.js - GENERATED, do not edit by hand.',
  ' * Snapshot of the README company table so the app works offline / on first run.',
  ' * Regenerate: node app/scripts/build-seed.js',
  ' * Rows: ' + slim.length,
  ' */'
].join('\n');

fs.writeFileSync(
  outPath,
  banner + '\nwindow.CL_SEED_COMPANIES = ' + JSON.stringify(slim, null, 1) + ';\n',
  'utf8'
);

var blocked = rows.filter(function (r) { return r.applyLevel === 'blocked'; }).length;
var warned = rows.filter(function (r) { return r.applyLevel === 'warn'; }).length;
console.log('Wrote ' + outPath);
console.log(slim.length + ' rows · ' + blocked + ' blocked (not for applications) · ' + warned + ' generic-inbox warnings');
