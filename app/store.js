/* store.js - one facade over two storage drivers.
 *
 *   CLStorage  local: a real JSON file on disk (+ a localStorage mirror)
 *   CLCloud    remote: Firestore, one document tree per signed-in user
 *
 * app.js only ever talks to CLStore. Which driver is live depends on whether
 * config.js carries a Firebase config and whether someone is signed in:
 *
 *   signed in ............ 'cloud'  - Firestore is the truth, the local file
 *                                     and the localStorage mirror are kept as
 *                                     an offline copy / backup
 *   data file attached ... 'file'   - unchanged behaviour from before Firebase
 *   neither .............. 'local'  - localStorage only, the yellow bar
 */
(function (root) {
  'use strict';

  var cloud = null;          // the CLCloud API, or null
  var user = null;           // the signed-in Firebase user, or null
  var unsubscribe = null;    // active Firestore subscription
  var firstSnapshot = true;
  var localBooted = false;

  var opts = {};             // { getState, onState, onStatus, askMerge, normalize, toast }
  var localStatus = {};      // last status emitted by CLStorage
  var cloudStatus = {};      // last status emitted by CLCloud
  var meta = { fromCache: false, pending: false };

  function noop() {}

  function mode() {
    if (user) return 'cloud';
    if (localStatus.mode === 'file') return 'file';
    return 'local';
  }

  function getStatus() {
    var m = mode();
    return {
      mode: m,
      cloudAvailable: !!cloud,
      // config.js failed to run at all - almost always a syntax error in the
      // pasted Firebase config. Worth saying out loud rather than silently
      // degrading to local mode.
      configBroken: !root.CL_CONFIG,
      user: user ? { uid: user.uid, email: user.email || '', name: user.displayName || '' } : null,
      supported: root.CLStorage.supportsFS(),
      fileName: localStatus.fileName || null,
      needsPermission: !!localStatus.needsPermission,
      pendingName: localStatus.pendingName || null,
      offline: m === 'cloud' ? (meta.fromCache && !navigator.onLine) : !navigator.onLine,
      pending: m === 'cloud' ? meta.pending : false,
      saving: m === 'cloud' ? !!cloudStatus.saving : !!localStatus.saving,
      savedAt: m === 'cloud' ? cloudStatus.savedAt : localStatus.savedAt,
      error: (m === 'cloud' ? cloudStatus.error : localStatus.error) || null
    };
  }

  function emit() { (opts.onStatus || noop)(getStatus()); }

  /* ------------------------------------------------------------ comparing */

  function shaped(raw) {
    return JSON.stringify(opts.normalize(raw));
  }

  function hasContent(state) {
    if (!state) return false;
    if ((state.applications || []).length) return true;
    var p = state.profile || {};
    return !!(p.name || p.email || p.portfolio || p.linkedin || p.github ||
              p.phone || p.role || p.cvFileName || (p.skills || []).length);
  }

  /**
   * True when the cloud already contains everything the local copy has, so
   * adopting the cloud loses nothing and we can skip asking the user.
   */
  function cloudCoversLocal(localState, cloudState) {
    if (!hasContent(localState)) return true;
    var byId = {};
    (cloudState.applications || []).forEach(function (a) { byId[a.id] = JSON.stringify(a); });

    var covered = (localState.applications || []).every(function (a) {
      return byId[a.id] === JSON.stringify(a);
    });
    if (!covered) return false;
    if (JSON.stringify(localState.profile) !== JSON.stringify(cloudState.profile)) return false;
    return JSON.stringify(localState.templates) === JSON.stringify(cloudState.templates);
  }

  /** Union by id; the cloud wins every collision, the local copy fills blanks. */
  function mergeStates(localState, cloudState) {
    var out = opts.normalize(cloudState);

    var seen = {};
    out.applications.forEach(function (a) { seen[a.id] = true; });
    (localState.applications || []).forEach(function (a) {
      if (!seen[a.id]) out.applications.push(a);
    });
    out.applications.sort(function (a, b) {
      var ka = (a.createdAt || a.dateSent || '') + '|' + a.id;
      var kb = (b.createdAt || b.dateSent || '') + '|' + b.id;
      return ka < kb ? 1 : (ka > kb ? -1 : 0);
    });

    Object.keys(out.profile).forEach(function (k) {
      var empty = k === 'skills' ? !out.profile[k].length : !out.profile[k];
      if (empty && localState.profile && localState.profile[k]) out.profile[k] = localState.profile[k];
    });

    var haveTpl = {};
    out.templates.forEach(function (t) { haveTpl[t.id] = true; });
    (localState.templates || []).forEach(function (t) {
      if (!haveTpl[t.id]) out.templates.push(t);
    });

    return out;
  }

  /* --------------------------------------------------------------- cloud */

  function startSubscription() {
    var uid = user.uid;
    var localAtSignIn = opts.normalize(opts.getState());
    firstSnapshot = true;

    unsubscribe = cloud.subscribe(uid, function (raw, snapMeta) {
      meta = snapMeta || meta;

      // A document that has never been written has no templates array; treat
      // that as "this account is empty" rather than "the user deleted them".
      var isEmptyAccount = raw.templates === null && !(raw.applications || []).length;
      var cloudState = opts.normalize({
        version: 1,
        profile: raw.profile,
        templates: raw.templates || undefined,
        applications: raw.applications
      });

      if (firstSnapshot) {
        firstSnapshot = false;
        resolveFirstSnapshot(uid, localAtSignIn, cloudState, isEmptyAccount);
        return;
      }

      // Steady state: ignore the echo of our own writes, apply everything else.
      if (shaped(cloudState) !== shaped(opts.getState())) {
        opts.onState(cloudState, 'cloud');
      }
      emit();
    });
  }

  function resolveFirstSnapshot(uid, localState, cloudState, isEmptyAccount) {
    function adopt(state, message) {
      opts.onState(state, 'cloud');
      emit();
      if (message) (opts.toast || noop)(message);
    }

    if (isEmptyAccount) {
      if (hasContent(localState)) {
        adopt(localState, 'Signed in. Your local data was uploaded to your account.');
        cloud.save(uid, localState);
        root.CLStorage.save(localState);
      } else {
        adopt(cloudState, 'Signed in. This account is empty - start composing.');
        cloud.save(uid, localState); // seeds the document with the default templates
      }
      return;
    }

    if (cloudCoversLocal(localState, cloudState)) {
      adopt(cloudState, 'Signed in. Your data is synced.');
      root.CLStorage.save(cloudState);
      return;
    }

    (opts.askMerge || function () { return Promise.resolve('merge'); })(localState, cloudState)
      .then(function (choice) {
        if (choice === 'cloud') {
          adopt(cloudState, 'Using the account data. This browser\'s copy was left untouched.');
          root.CLStorage.save(cloudState);
          return;
        }
        var next = choice === 'local' ? localState : mergeStates(localState, cloudState);
        adopt(next, choice === 'local'
          ? 'This browser\'s data now replaces what was in your account.'
          : 'Merged: ' + next.applications.length + ' application(s).');
        root.CLStorage.save(next);
        return cloud.replaceAll(uid, next);
      })
      .catch(function (err) {
        (opts.toast || noop)('Sync failed: ' + (err.message || err));
      });
  }

  function handleUser(next) {
    var wasSignedIn = !!user;
    user = next || null;

    if (unsubscribe) { unsubscribe(); unsubscribe = null; }

    if (user) {
      startSubscription();
    } else if (wasSignedIn) {
      // Signed out: fall back to whatever this browser still holds.
      var local = opts.normalize(root.CLStorage.loadLocal());
      opts.onState(local, 'local');
    }
    emit();
  }

  /* --------------------------------------------------------------- local */

  function bootLocal() {
    if (localBooted) return;
    localBooted = true;
    root.CLStorage.restoreFile().then(function (fileState) {
      if (mode() === 'cloud') return;          // the cloud already won
      if (fileState) {
        opts.onState(opts.normalize(fileState), 'file');
        (opts.toast || noop)('Loaded your data file.');
      } else if (root.CLStorage.hasFile()) {
        root.CLStorage.save(opts.getState());  // empty file: seed it
      }
    }).catch(noop);
  }

  /* ---------------------------------------------------------------- API */

  function init(options) {
    opts = options;

    root.CLStorage.onStatus(function (st) { localStatus = st; emit(); });
    localStatus = root.CLStorage.getStatus();

    root.addEventListener('online', emit);
    root.addEventListener('offline', emit);

    emit();

    var ready = root.CLCloudReady || Promise.resolve(root.CLCloud || null);
    return ready.then(function (api) {
      cloud = api;
      if (!cloud) { bootLocal(); emit(); return; }
      cloud.onStatus(function (patch) { cloudStatus = Object.assign({}, cloudStatus, patch); emit(); });
      cloud.onAuth(function (u) {
        handleUser(u);
        if (!u) bootLocal();
      });
      emit();
    }).catch(function () { bootLocal(); emit(); });
  }

  function save(state) {
    if (user && cloud) {
      cloud.save(user.uid, state);
      root.CLStorage.save(state);   // offline copy / local file backup
    } else {
      root.CLStorage.save(state);
    }
  }

  function flush() {
    var jobs = [root.CLStorage.flush()];
    if (user && cloud) jobs.push(cloud.flush());
    return Promise.all(jobs);
  }

  function signOut(forgetBrowser) {
    if (!cloud) return Promise.resolve();
    return flush().then(function () {
      if (forgetBrowser) root.CLStorage.clearLocal();
      return cloud.signOut();
    });
  }

  root.CLStore = {
    init: init,
    save: save,
    flush: flush,
    getStatus: getStatus,
    mode: mode,
    isCloud: function () { return mode() === 'cloud'; },
    cloudAvailable: function () { return !!cloud; },
    user: function () { return user; },
    signInEmail: function (e, p) { return cloud.signInEmail(e, p); },
    signOut: signOut,
    wipeCloud: function () {
      if (!user || !cloud) return Promise.reject(new Error('Not signed in.'));
      return cloud.wipe(user.uid);
    }
  };
})(window);
