/* cloud.js - the Firebase driver, and the ONLY file in this app that is an
 * ES module. It loads the Firebase SDK from Google's CDN, then publishes a
 * plain-object API on `window.CLCloud` so the rest of the app can stay the
 * dependency-free, build-step-free ES5 it has always been.
 *
 * If config.js has no Firebase config, this resolves to `null` and the app
 * silently stays in local mode. Nothing here is required for the app to work.
 *
 * Authentication is sign-in only, with an email and a password. No provider
 * beyond Email/Password, no account creation, no password reset. This is not a
 * SaaS with users to onboard: whoever deploys it owns the Firebase project, so
 * accounts are created and passwords changed where they belong - the console,
 * under Authentication > Users. Every line that would exist to support
 * self-service signup is a line that can leak or break, so none of it is here.
 *
 * Firestore layout (see firestore.rules):
 *   users/{uid}                    -> { version, profile, templates, updatedAt }
 *   users/{uid}/applications/{id}  -> one tracked application
 *
 * Applications live in a subcollection, not in the user document, so the
 * tracker is not capped by Firestore's 1 MiB per-document limit and a single
 * edited row costs a single small write.
 */

if (!window.CL_CONFIG) {
  // config.js threw before it could assign, or never loaded at all. Without
  // this line the app just quietly falls back to local mode and you spend an
  // afternoon wondering why "Sign in to sync" never appears.
  console.error(
    '[CareerLauncher] config.js did not define window.CL_CONFIG.\n' +
    'There is almost certainly a syntax error in app/config.js - look for it ' +
    'higher up in this console. The most common one is pasting Firebase\'s ' +
    '`const firebaseConfig = {...}` as-is: inside config.js the key must be ' +
    '`firebase: { ... },`.\n' +
    'The app is running in local mode until this is fixed.'
  );
}

const CFG = window.CL_CONFIG || {};
const SDK = CFG.firebaseSdkVersion || '12.17.1';
const CDN = 'https://www.gstatic.com/firebasejs/' + SDK + '/';

const WRITE_DEBOUNCE_MS = 700;
const BATCH_LIMIT = 400; // Firestore allows 500 ops; leave headroom.

function done(api) {
  window.CLCloud = api;
  if (typeof window.__CL_CLOUD_RESOLVE__ === 'function') window.__CL_CLOUD_RESOLVE__(api);
  window.dispatchEvent(new CustomEvent('cl-cloud-ready', { detail: api }));
}

function configured(c) {
  return !!(c && typeof c === 'object' && c.apiKey && c.projectId && c.appId);
}

/* --------------------------------------------------------------- shaping */

/** Firestore document -> the plain application object the app already uses. */
function appFromDoc(id, d) {
  return {
    id: id,
    company: d.company || '',
    email: d.email || '',
    role: d.role || '',
    templateId: d.templateId || '',
    dateSent: d.dateSent || '',
    status: d.status || 'pending',
    responseDate: d.responseDate || null,
    notes: d.notes || '',
    followUpOn: d.followUpOn || null,
    createdAt: d.createdAt || d.dateSent || ''
  };
}

/** The app object -> exactly the fields firestore.rules accepts. */
function docFromApp(a) {
  return {
    company: String(a.company || ''),
    email: String(a.email || ''),
    role: String(a.role || ''),
    templateId: String(a.templateId || ''),
    dateSent: String(a.dateSent || ''),
    status: String(a.status || 'pending'),
    responseDate: a.responseDate || null,
    notes: String(a.notes || ''),
    followUpOn: a.followUpOn || null,
    createdAt: String(a.createdAt || a.dateSent || '')
  };
}

/** Newest first - the order the tracker has always shown. */
function byNewest(a, b) {
  const ka = (a.createdAt || a.dateSent || '') + '|' + a.id;
  const kb = (b.createdAt || b.dateSent || '') + '|' + b.id;
  return ka < kb ? 1 : (ka > kb ? -1 : 0);
}

function stable(value) {
  return JSON.stringify(value === undefined ? null : value);
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  if (!configured(CFG.firebase)) return null;

  const [appMod, authMod, fsMod] = await Promise.all([
    import(CDN + 'firebase-app.js'),
    import(CDN + 'firebase-auth.js'),
    import(CDN + 'firebase-firestore.js')
  ]);

  const app = appMod.initializeApp(CFG.firebase);

  if (CFG.appCheckSiteKey) {
    try {
      const ac = await import(CDN + 'firebase-app-check.js');
      ac.initializeAppCheck(app, {
        provider: new ac.ReCaptchaV3Provider(CFG.appCheckSiteKey),
        isTokenAutoRefreshEnabled: true
      });
    } catch (e) {
      console.warn('[CareerLauncher] App Check failed to initialise:', e);
    }
  }

  const auth = authMod.getAuth(app);
  await authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(function () {});

  // Offline-first: reads and writes go through an IndexedDB cache, so the app
  // keeps working in the metro and syncs when the network comes back.
  const db = fsMod.initializeFirestore(app, {
    localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() })
  });

  /* ---------------------------------------------------------------- auth */

  function friendly(err) {
    const code = (err && err.code) || '';
    const map = {
      'auth/invalid-email': 'That email address is not valid.',
      'auth/missing-password': 'Enter a password.',
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/wrong-password': 'Wrong email or password.',
      'auth/user-not-found':
        'No account for that email. Add it in the Firebase console: Authentication > Users.',
      'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
      'auth/network-request-failed': 'Network unreachable. Check your connection.',
      'auth/unauthorized-domain':
        'This domain is not in your Firebase authorized domains (Authentication > Settings).',
      'auth/operation-not-allowed':
        'Email/Password sign-in is disabled in your Firebase project ' +
        '(Authentication > Sign-in method).'
    };
    return map[code] || (err && err.message) || String(err);
  }

  function wrap(promise) {
    return promise.catch(function (err) {
      const e = new Error(friendly(err));
      e.code = err && err.code;
      throw e;
    });
  }

  /* ------------------------------------------------------------ firestore */

  const statusListeners = [];
  function onStatus(fn) { statusListeners.push(fn); }
  function emit(patch) {
    statusListeners.forEach(function (fn) { try { fn(patch); } catch (e) { /* noop */ } });
  }

  function userRef(uid) { return fsMod.doc(db, 'users', uid); }
  function appsRef(uid) { return fsMod.collection(db, 'users', uid, 'applications'); }

  // Last state the server acknowledged, so save() can write only what changed.
  let mirror = null;   // { profile, templates, apps: Map<id, doc> }
  let timer = null;
  let queued = null;
  let queuedUid = null;

  /**
   * Live-subscribe to a user's data. `cb(state, meta)` fires on every change,
   * local or remote. Returns an unsubscribe function.
   */
  function subscribe(uid, cb) {
    let docData = null;
    let rows = null;
    let gotDoc = false;
    let gotRows = false;
    let meta = { fromCache: false, pending: false };

    function push() {
      if (!gotDoc || !gotRows) return;
      mirror = {
        profile: (docData && docData.profile) || {},
        templates: (docData && docData.templates) || null,
        apps: new Map(rows.map(function (r) { return [r.id, docFromApp(r)]; }))
      };
      cb({
        version: 1,
        profile: (docData && docData.profile) || {},
        templates: (docData && docData.templates) || null,
        applications: rows.slice().sort(byNewest)
      }, meta);
    }

    const stopDoc = fsMod.onSnapshot(
      userRef(uid), { includeMetadataChanges: true },
      function (snap) {
        docData = snap.exists() ? snap.data() : null;
        gotDoc = true;
        meta = { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites };
        push();
      },
      function (err) { emit({ error: err.message || String(err) }); }
    );

    const stopRows = fsMod.onSnapshot(
      appsRef(uid), { includeMetadataChanges: true },
      function (snap) {
        rows = snap.docs.map(function (d) { return appFromDoc(d.id, d.data()); });
        gotRows = true;
        meta = { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites };
        push();
      },
      function (err) { emit({ error: err.message || String(err) }); }
    );

    return function () {
      stopDoc();
      stopRows();
      mirror = null;
    };
  }

  async function commit(uid, state) {
    const ops = [];

    const profile = state.profile || {};
    const templates = state.templates || [];
    if (!mirror ||
        stable(mirror.profile) !== stable(profile) ||
        stable(mirror.templates) !== stable(templates)) {
      ops.push(function (batch) {
        batch.set(userRef(uid), {
          version: 1,
          profile: profile,
          templates: templates,
          updatedAt: fsMod.serverTimestamp()
        }, { merge: true });
      });
    }

    const seen = new Set();
    (state.applications || []).forEach(function (a) {
      if (!a || !a.id) return;
      seen.add(a.id);
      const next = docFromApp(a);
      const prev = mirror && mirror.apps.get(a.id);
      if (prev && stable(prev) === stable(next)) return;
      ops.push(function (batch) { batch.set(fsMod.doc(appsRef(uid), a.id), next); });
    });

    if (mirror) {
      mirror.apps.forEach(function (_doc, id) {
        if (seen.has(id)) return;
        ops.push(function (batch) { batch.delete(fsMod.doc(appsRef(uid), id)); });
      });
    }

    if (!ops.length) return;

    emit({ saving: true });
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = fsMod.writeBatch(db);
      ops.slice(i, i + BATCH_LIMIT).forEach(function (op) { op(batch); });
      await batch.commit();
    }
    emit({ saving: false, savedAt: new Date() });
  }

  function save(uid, state) {
    queued = state;
    queuedUid = uid;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      const s = queued;
      queued = null;
      // Firestore's offline cache resolves this even with no network; a real
      // failure here is a rules or quota problem and the user must see it.
      commit(queuedUid, s).catch(function (err) {
        emit({ saving: false, error: err.message || String(err) });
      });
    }, WRITE_DEBOUNCE_MS);
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queued) return Promise.resolve();
    const s = queued;
    queued = null;
    return commit(queuedUid, s).catch(function () { /* noop */ });
  }

  /** Overwrite everything in the cloud with `state` (used by the merge dialog). */
  async function replaceAll(uid, state) {
    const existing = await fsMod.getDocs(appsRef(uid));
    const keep = new Set((state.applications || []).map(function (a) { return a.id; }));
    mirror = {
      profile: null, templates: null,
      apps: new Map(existing.docs
        .filter(function (d) { return !keep.has(d.id); })
        .map(function (d) { return [d.id, appFromDoc(d.id, d.data())]; }))
    };
    return commit(uid, state);
  }

  /** Delete every document this app created for `uid`. */
  async function wipe(uid) {
    const existing = await fsMod.getDocs(appsRef(uid));
    for (let i = 0; i < existing.docs.length; i += BATCH_LIMIT) {
      const batch = fsMod.writeBatch(db);
      existing.docs.slice(i, i + BATCH_LIMIT).forEach(function (d) { batch.delete(d.ref); });
      await batch.commit();
    }
    await fsMod.deleteDoc(userRef(uid));
    mirror = null;
  }

  return {
    available: true,
    projectId: CFG.firebase.projectId,

    onAuth: function (fn) { return authMod.onAuthStateChanged(auth, fn); },
    currentUser: function () { return auth.currentUser; },
    signInEmail: function (email, pw) { return wrap(authMod.signInWithEmailAndPassword(auth, email, pw)); },
    signOut: function () { return authMod.signOut(auth); },

    onStatus: onStatus,
    subscribe: subscribe,
    save: save,
    flush: flush,
    replaceAll: replaceAll,
    wipe: wipe
  };
}

boot().then(done).catch(function (err) {
  console.error('[CareerLauncher] cloud sync unavailable:', err);
  done(null);
});
