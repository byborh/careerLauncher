/* data.js — CareerLauncher dataset
 * Fetches the repo README, parses its Markdown table into company records,
 * and flags rows that are not appropriate application targets (§8 of PROMPT.md).
 *
 * Runs in the browser (attaches window.CLData) and in Node (module.exports),
 * so scripts/build-seed.js can reuse the exact same parser.
 */
(function (root) {
  'use strict';

  var REPO_OWNER = 'byborh';
  var REPO_NAME = 'careerLauncher';
  var REPO_BRANCH = 'main';
  var RAW_README_URL =
    'https://raw.githubusercontent.com/' +
    REPO_OWNER + '/' + REPO_NAME + '/' + REPO_BRANCH + '/README.md';

  // Local-part patterns that are never a place to apply for a job.
  var BLOCKED_LOCALPART = /accessib|accommodat|fraud|eeo|disability/i;
  // Local-part patterns that work sometimes, but deserve a warning.
  var GENERIC_LOCALPART = /^(hello|info|admin|contact|support|press|team)$/i;

  /* ---------------------------------------------------------------- parsing */

  function splitRow(line) {
    var trimmed = line.trim();
    if (trimmed.charAt(0) === '|') trimmed = trimmed.slice(1);
    if (trimmed.charAt(trimmed.length - 1) === '|') trimmed = trimmed.slice(0, -1);
    return trimmed.split('|').map(function (cell) { return cell.trim(); });
  }

  function isSeparatorRow(cells) {
    return cells.length > 0 && cells.every(function (c) { return /^:?-{2,}:?$/.test(c); });
  }

  /**
   * Locate the Markdown table under the "Big Tech Contacts" heading and map
   * its rows. Tolerant of extra spaces, the alignment row, and short rows.
   */
  function parseMarkdownTable(markdown) {
    var lines = String(markdown).split(/\r?\n/);
    var start = 0;
    for (var i = 0; i < lines.length; i++) {
      if (/^#{1,6}\s*Big Tech Contacts\s*$/i.test(lines[i])) { start = i + 1; break; }
    }

    var rows = [];
    var seenHeader = false;
    for (var j = start; j < lines.length; j++) {
      var line = lines[j];
      if (line.trim().indexOf('|') !== 0) {
        if (seenHeader && line.trim() === '') continue; // blank line inside/after table
        if (seenHeader && /^#{1,6}\s/.test(line)) break; // next section ends the table
        continue;
      }
      var cells = splitRow(line);
      if (isSeparatorRow(cells)) continue;
      if (!seenHeader) { seenHeader = true; continue; } // this was the header row
      if (cells.length < 3) continue;

      var row = {
        company: cells[0] || '',
        domain: cells[1] || '',
        email: (cells[2] || '').replace(/^<|>$/g, ''),
        team: cells[3] || '',
        location: cells[4] || '',
        description: cells[5] || '',
        source: cells[6] || '',
        lastVerified: cells[7] || '',
        applicability: cells[8] || '' // future column, see §8
      };
      if (!row.company || !/@/.test(row.email)) continue;
      rows.push(decorate(row));
    }
    return rows;
  }

  /* ----------------------------------------------------------- applicability */

  function localPart(email) {
    return String(email).split('@')[0] || '';
  }

  /**
   * Classify a row: 'apply' (fine), 'warn' (generic inbox), 'blocked'
   * (accommodation / fraud / EEO inbox — never offer it as a target).
   */
  function classify(row) {
    var declared = String(row.applicability || '').toLowerCase().trim();
    if (declared === 'apply') return { level: 'apply', reason: '' };
    if (declared === 'no' || declared === 'blocked') {
      return { level: 'blocked', reason: 'Marked as not-for-applications in the dataset.' };
    }

    var lp = localPart(row.email);
    var team = String(row.team || '');
    if (BLOCKED_LOCALPART.test(lp) || /accommodation|accessib|fraud/i.test(team)) {
      return {
        level: 'blocked',
        reason: 'This inbox is for accessibility / accommodation / fraud reports, not applications.'
      };
    }
    if (GENERIC_LOCALPART.test(lp)) {
      return {
        level: 'warn',
        reason: 'Generic company inbox — it may not reach a recruiter. Use with care.'
      };
    }
    return { level: 'apply', reason: '' };
  }

  function decorate(row) {
    var verdict = classify(row);
    row.applyLevel = verdict.level;
    row.applyReason = verdict.reason;
    return row;
  }

  /* ---------------------------------------------------------------- fetching */

  function fetchCompanies() {
    return fetch(RAW_README_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('GitHub returned HTTP ' + res.status);
        return res.text();
      })
      .then(function (md) {
        var rows = parseMarkdownTable(md);
        if (!rows.length) throw new Error('No table rows found in README.md');
        return rows;
      });
  }

  var api = {
    RAW_README_URL: RAW_README_URL,
    parseMarkdownTable: parseMarkdownTable,
    classify: classify,
    decorate: decorate,
    fetchCompanies: fetchCompanies
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CLData = api;
})(typeof window !== 'undefined' ? window : this);
