/* The app in local mode - no Firebase config, which is the state a fresh
 * clone is in and the one that must never break.
 *
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bootApp, REPO } from './helpers/load-app.mjs';

test('boots without a Firebase config and stays in local mode', async () => {
  const { window, errors, $ } = await bootApp();

  assert.deepEqual(errors, []);
  assert.equal(window.CLStore.cloudAvailable(), false);
  assert.equal(window.CLStore.mode(), 'local');
  assert.equal($('btnSignIn').hidden, true, 'no sign-in button without a config');
  assert.match($('storageBar').className, /is-unsaved/, 'the local-only bar is yellow');
});

test('shows the bundled dataset and the three default templates', async () => {
  const { window, $ } = await bootApp();

  assert.ok($('companyList').children.length > 10);
  assert.equal($('templatePick').children.length, 3);
  assert.match($('datasetInfo').textContent, /companies/);
  // Accommodation and fraud inboxes are never offered as targets.
  const shown = [...$('companyList').querySelectorAll('button.company')]
    .map((b) => b.textContent);
  assert.ok(!shown.some((t) => /accommodation/i.test(t)));
  assert.ok(window.CL_SEED_COMPANIES.length > $('companyList').children.length);
});

test('refuses to copy an email until the "why" line is written by a human', async () => {
  const { window, $, click, type } = await bootApp();

  $('companyList').querySelector('button.company')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal($('btnCopyAll').disabled, true);
  assert.match($('copyBlocker').textContent, /why this company/i);

  type('whyInput', 'too short');
  assert.equal($('btnCopyAll').disabled, true, 'a token effort is still blocked');

  type('whyInput', 'Your work on distributed storage is the problem I want to spend my career on.');
  assert.equal($('btnCopyAll').disabled, false);
  assert.ok($('previewBody').value.includes($('selCompanyName').textContent),
            'the company name was merged into the body');
  assert.ok(!/\{\{/.test($('previewBody').value), 'no token was left unmerged');

  // Seeding a draft must not count as writing it yourself.
  click('btnSeedWhy');
  assert.equal($('btnCopyAll').disabled, true);
});

test('logs an application, orders it newest first and persists it', async () => {
  const { window, $, click, type, stored } = await bootApp();

  $('companyList').querySelector('button.company')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  type('roleInput', 'Backend intern');
  click('btnLog');

  assert.equal($('trackerBody').children.length, 1);
  assert.equal($('tabCount').textContent, '1');

  click('btnAddRow');
  assert.equal($('trackerBody').children.length, 2);

  const state = stored();
  assert.equal(state.applications.length, 2);
  assert.ok(state.applications.every((a) => typeof a.createdAt === 'string' && a.createdAt),
            'every row carries createdAt, which is what orders them in Firestore');
  assert.ok(state.applications[0].createdAt >= state.applications[1].createdAt);
});

test('every tracker cell carries the label its phone layout needs', async () => {
  const { $, click } = await bootApp();
  click('btnAddRow');

  const labels = [...$('trackerBody').querySelectorAll('td[data-label]')]
    .map((td) => td.getAttribute('data-label'));
  const headers = [...$('trackerTable').querySelectorAll('thead th')]
    .map((th) => th.textContent).filter(Boolean);

  assert.deepEqual(labels, headers,
                   'below 760px the <thead> is hidden, so the labels must match it exactly');
});

test('the dialogs open, close and release the scroll lock', async () => {
  const { window, $, click } = await bootApp();

  $('btnSignIn').hidden = false; // normally hidden without a Firebase config
  click('btnSignIn');
  assert.equal($('authModal').hidden, false);
  assert.ok(window.document.body.classList.contains('modal-open'));

  click('btnAuthClose');
  assert.equal($('authModal').hidden, true);
  assert.ok(!window.document.body.classList.contains('modal-open'));
});

test('the parser and the bundled snapshot agree with data/companies.md', async () => {
  const { window } = await bootApp();
  const markdown = readFileSync(path.join(REPO, 'data', 'companies.md'), 'utf8');
  const rows = window.CLData.parseMarkdownTable(markdown);

  assert.equal(rows.length, window.CL_SEED_COMPANIES.length,
               'run `npm run seed` - app/seed-companies.js is stale');
  assert.ok(rows.some((r) => r.applyLevel === 'blocked'));
  assert.ok(rows.every((r) => r.company && r.email.includes('@')));
  assert.ok(window.CLData.datasetURL().endsWith('/data/companies.md'));
});
