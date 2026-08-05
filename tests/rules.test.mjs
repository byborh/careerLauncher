/* Security-rule tests. The only thing that stands between one user's job
 * search and another's is firestore.rules, so it gets tested.
 *
 *   npm install
 *   npm run test:rules      (starts the Firestore emulator around this file)
 */
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  initializeTestEnvironment, assertFails, assertSucceeds
} from '@firebase/rules-unit-testing';
import { doc, collection, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'careerlauncher-rules-test',
  firestore: {
    rules: readFileSync('firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080
  }
});

test.after(() => testEnv.cleanup());
test.beforeEach(() => testEnv.clearFirestore());

const alice = () => testEnv.authenticatedContext('alice').firestore();
const stranger = () => testEnv.unauthenticatedContext().firestore();

const userDoc = { version: 1, profile: { name: 'Ada' }, templates: [], updatedAt: new Date() };

const application = {
  company: 'Cerebras', email: 'careers@example.test', role: 'intern', templateId: 'internship',
  dateSent: '2026-08-07', status: 'pending', responseDate: null, notes: '',
  followUpOn: '2026-08-17', createdAt: '2026-08-07T09:00:00.000Z'
};

/* ------------------------------------------------------------- own data */

test('a signed-in user writes and reads their own document', async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, 'users/alice'), userDoc));
  await assertSucceeds(getDoc(doc(db, 'users/alice')));
});

test('a signed-in user writes, lists and deletes their own applications', async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, 'users/alice/applications/a1'), application));
  await assertSucceeds(getDocs(collection(db, 'users/alice/applications')));
  await assertSucceeds(deleteDoc(doc(db, 'users/alice/applications/a1')));
});

/* ---------------------------------------------------------- other people */

test('a user cannot read another user document', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/bob'), userDoc);
  });
  await assertFails(getDoc(doc(alice(), 'users/bob')));
});

test('a user cannot write into another user tree', async () => {
  await assertFails(setDoc(doc(alice(), 'users/bob'), userDoc));
  await assertFails(setDoc(doc(alice(), 'users/bob/applications/a1'), application));
});

test('a user cannot list another user applications', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/bob/applications/a1'), application);
  });
  await assertFails(getDocs(collection(alice(), 'users/bob/applications')));
});

test('a signed-out visitor can read and write nothing', async () => {
  const db = stranger();
  await assertFails(getDoc(doc(db, 'users/alice')));
  await assertFails(setDoc(doc(db, 'users/alice'), userDoc));
  await assertFails(getDocs(collection(db, 'users/alice/applications')));
});

/* ----------------------------------------------------------------- shape */

test('unknown fields are rejected, so the database cannot be used as free storage', async () => {
  await assertFails(setDoc(doc(alice(), 'users/alice/applications/a1'),
    { ...application, payload: 'x'.repeat(1000) }));
  await assertFails(setDoc(doc(alice(), 'users/alice'), { ...userDoc, payload: 'x' }));
});

test('oversized and mistyped fields are rejected', async () => {
  const db = alice();
  await assertFails(setDoc(doc(db, 'users/alice/applications/a1'),
    { ...application, notes: 'x'.repeat(5001) }));
  await assertFails(setDoc(doc(db, 'users/alice/applications/a2'),
    { ...application, company: 42 }));
  await assertFails(setDoc(doc(db, 'users/alice/applications/a3'),
    { ...application, dateSent: null }));
  await assertFails(setDoc(doc(db, 'users/alice'),
    { ...userDoc, templates: 'not-a-list' }));
});

test('a nullable field accepts null and a string, and nothing else', async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, 'users/alice/applications/a1'),
    { ...application, responseDate: null }));
  await assertSucceeds(setDoc(doc(db, 'users/alice/applications/a2'),
    { ...application, responseDate: '2026-08-20' }));
  await assertFails(setDoc(doc(db, 'users/alice/applications/a3'),
    { ...application, responseDate: 7 }));
});

/* ---------------------------------------------------------- outside tree */

test('collections outside users/ are unreachable', async () => {
  await assertFails(setDoc(doc(alice(), 'anything/else'), { a: 1 }));
  await assertFails(getDoc(doc(alice(), 'anything/else')));
});
