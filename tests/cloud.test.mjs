/* The cloud path: what happens when you sign in, what happens when two
 * devices disagree, and what happens when you sign out.
 *
 * The Firebase SDK is not involved - store.js is driven through a fake driver
 * with the same shape as cloud.js, so these run anywhere, offline, in a second.
 *
 *   npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, fakeCloud } from './helpers/load-app.mjs';

const profile = {
  name: 'Ada', role: '', skills: [], portfolio: '', linkedin: '',
  github: '', phone: '', email: '', cvFileName: ''
};

function application(id, day) {
  return {
    id,
    company: 'Acme ' + id,
    email: id + '@acme.test',
    role: 'intern',
    templateId: 'internship',
    dateSent: '2026-08-0' + day,
    status: 'pending',
    responseDate: null,
    notes: '',
    followUpOn: '2026-08-1' + day,
    createdAt: '2026-08-0' + day + 'T10:00:00.000Z'
  };
}

const LOCAL = { version: 1, profile, applications: [application('local1', 1)] };

test('signing in with local data into an empty account uploads it', async () => {
  const cloud = fakeCloud(null);
  const { window, errors, $ } = await bootApp({ localState: LOCAL, cloud });

  assert.deepEqual(errors, []);
  assert.equal(window.CLStore.mode(), 'cloud');
  assert.equal($('mergeModal').hidden, true, 'nothing to arbitrate');
  assert.equal(cloud.calls.save.length, 1);
  assert.equal(cloud.calls.save[0].applications.length, 1);
  assert.equal($('trackerBody').children.length, 1, 'the row stayed on screen');
  assert.equal($('btnSignIn').hidden, true);
  assert.equal($('btnAccount').hidden, false);
  assert.equal($('accountLabel').textContent, 'alice@example.com');
  assert.equal($('syncDot').className, 'dot', 'a plain dot means synced');
  assert.equal($('storageBar').hidden, true, 'nothing to warn about once synced');
  assert.match($('dataStatus').textContent, /Synced to alice@example\.com/);
});

test('signing in on a fresh device adopts the account and overwrites nothing', async () => {
  const cloud = fakeCloud({ profile, applications: [application('c1', 1), application('c2', 2)] });
  const { $, errors } = await bootApp({ cloud });

  assert.deepEqual(errors, []);
  assert.equal($('trackerBody').children.length, 2);
  assert.equal($('mergeModal').hidden, true);
  assert.equal(cloud.calls.save.length, 0);
  assert.equal(cloud.calls.replaceAll.length, 0);
});

test('when both sides hold different data the user is asked, not overruled', async () => {
  const cloud = fakeCloud({ profile, applications: [application('c1', 2)] });
  const { $ } = await bootApp({ localState: LOCAL, cloud });

  assert.equal($('mergeModal').hidden, false);
  assert.match($('mergeSummary').textContent, /1 application\(s\); your account holds 1/);
  assert.equal(cloud.calls.replaceAll.length, 0, 'nothing is written before the answer');
});

test('"merge both" unions by id and writes the result back', async () => {
  const cloud = fakeCloud({ profile, applications: [application('c1', 2)] });
  const { $, click, settle } = await bootApp({ localState: LOCAL, cloud });

  click('btnMergeBoth');
  await settle();

  assert.equal($('mergeModal').hidden, true);
  assert.equal($('trackerBody').children.length, 2);
  assert.equal(cloud.calls.replaceAll.length, 1);
  assert.deepEqual(
    cloud.calls.replaceAll[0].applications.map((a) => a.id).sort(),
    ['c1', 'local1']
  );
});

test('"keep the account only" leaves the account untouched', async () => {
  const cloud = fakeCloud({ profile, applications: [application('c1', 2)] });
  const { $, click, settle } = await bootApp({ localState: LOCAL, cloud });

  click('btnMergeCloud');
  await settle();

  assert.equal($('trackerBody').children.length, 1);
  assert.equal(cloud.calls.replaceAll.length, 0);
});

test('"replace the account" pushes this browser over the account', async () => {
  const cloud = fakeCloud({ profile, applications: [application('c1', 2)] });
  const { $, click, settle } = await bootApp({ localState: LOCAL, cloud });

  click('btnMergeLocal');
  await settle();

  assert.equal($('trackerBody').children.length, 1);
  assert.equal(cloud.calls.replaceAll.length, 1);
  assert.deepEqual(cloud.calls.replaceAll[0].applications.map((a) => a.id), ['local1']);
});

test('a change made on another device appears without a reload', async () => {
  const cloud = fakeCloud({ profile, applications: [application('c1', 1)] });
  const { $, settle } = await bootApp({ cloud });

  cloud.pushRemote({ profile, applications: [application('c1', 1), application('phone1', 2)] });
  await settle();

  assert.equal($('trackerBody').children.length, 2);
  assert.equal(cloud.calls.save.length, 0, 'a remote change must not echo back as a write');
});

test('an edit goes to the cloud and is mirrored locally for offline reloads', async () => {
  const cloud = fakeCloud({ profile, applications: [application('c1', 1)] });
  const { click, stored } = await bootApp({ cloud });

  click('btnAddRow');

  assert.equal(cloud.calls.save.length, 1);
  assert.equal(cloud.calls.save[0].applications.length, 2);
  assert.equal(stored().applications.length, 2);
});

test('signing out falls back to local mode and keeps what was mirrored', async () => {
  const cloud = fakeCloud({ profile, applications: [application('c1', 1)] });
  const { window, $, click, settle } = await bootApp({ cloud });

  click('btnAddRow');
  cloud._auth(null);
  await settle();

  assert.equal(window.CLStore.mode(), 'local');
  assert.equal($('trackerBody').children.length, 2);
  assert.equal($('btnSignIn').hidden, false);
  assert.equal($('btnAccount').hidden, true);
});
