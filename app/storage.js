/* storage.js — "Option 2" storage (§5 of PROMPT.md).
 *
 * Source of truth = a real JSON file on the user's disk, via the File System
 * Access API (Chromium). The handle is remembered in IndexedDB so the same file
 * reopens next visit. localStorage is only a fast-reopen mirror, never the truth.
 * Export / Import JSON + Export CSV work in every browser.
 */
(function (root) {
  'use strict';

  var LS_STATE_KEY = 'careerlauncher-state';
  var LS_COMPANIES_KEY = 'careerlauncher-companies';
  var IDB_NAME = 'careerlauncher';
  var IDB_STORE = 'handles';
  var IDB_KEY = 'dataFile';
  var DEFAULT_FILENAME = 'careerlauncher-data.json';
  var WRITE_DEBOUNCE_MS = 600;

  var fileHandle = null;
  var writeTimer = null;
  var pendingState = null;
  var listeners = [];

  function supportsFS() {
    return typeof root.showSaveFilePicker === 'function' &&
           typeof root.showOpenFilePicker === 'function';
  }

  function emit(status) {
    listeners.forEach(function (fn) { try { fn(status); } catch (e) { /* noop */ } });
  }

  function onStatus(fn) { listeners.push(fn); }

  function status(extra) {
    return Object.assign({
      mode: fileHandle ? 'file' : 'local',
      fileName: fileHandle ? fileHandle.name : null,
      supported: supportsFS()
    }, extra || {});
  }

  /* ------------------------------------------------------------- IndexedDB */

  function idb() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var req = root.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbSet(value) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, IDB_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { /* handle persistence is a nicety, never fatal */ });
  }

  function idbGet() {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function idbClear() {
    return idb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(IDB_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () { /* noop */ });
  }

  /* ------------------------------------------------------------ permissions */

  function verifyPermission(handle, readWrite) {
    var opts = readWrite ? { mode: 'readwrite' } : { mode: 'read' };
    if (!handle.queryPermission) return Promise.resolve(true);
    return handle.queryPermission(opts).then(function (perm) {
      if (perm === 'granted') return true;
      return handle.requestPermission(opts).then(function (p) { return p === 'granted'; });
    }).catch(function () { return false; });
  }

  /* ------------------------------------------------------------- file I/O */

  function readHandle(handle) {
    return handle.getFile().then(function (file) {
      return file.text();
    }).then(function (text) {
      if (!text.trim()) return null;
      return JSON.parse(text);
    });
  }

  function writeHandle(handle, state) {
    return handle.createWritable().then(function (writable) {
      return writable.write(JSON.stringify(state, null, 2)).then(function () {
        return writable.close();
      });
    });
  }

  /** Let the user pick an existing data file and load it. */
  function openFile() {
    return root.showOpenFilePicker({
      types: [{ description: 'CareerLauncher data', accept: { 'application/json': ['.json'] } }],
      multiple: false
    }).then(function (handles) {
      var handle = handles[0];
      return verifyPermission(handle, true).then(function (ok) {
        if (!ok) throw new Error('Permission to write that file was denied.');
        return readHandle(handle).then(function (state) {
          fileHandle = handle;
          return idbSet(handle).then(function () {
            emit(status());
            return state; // null = empty file, caller seeds it
          });
        });
      });
    });
  }

  /** Let the user create (or overwrite-pick) a data file. */
  function createFile(state) {
    return root.showSaveFilePicker({
      suggestedName: DEFAULT_FILENAME,
      types: [{ description: 'CareerLauncher data', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      return verifyPermission(handle, true).then(function (ok) {
        if (!ok) throw new Error('Permission to write that file was denied.');
        // If the user picked an existing non-empty file, keep its contents
        // instead of destroying them.
        return readHandle(handle).catch(function () { return null; }).then(function (existing) {
          fileHandle = handle;
          return idbSet(handle).then(function () {
            if (existing && existing.applications) {
              emit(status());
              return existing;
            }
            return writeHandle(handle, state).then(function () {
              emit(status());
              return null;
            });
          });
        });
      });
    });
  }

  /** Try to silently reattach the file used last time. */
  function restoreFile() {
    if (!supportsFS()) return Promise.resolve(null);
    return idbGet().then(function (handle) {
      if (!handle) return null;
      var query = handle.queryPermission
        ? handle.queryPermission({ mode: 'readwrite' })
        : Promise.resolve('granted');
      return Promise.resolve(query).then(function (perm) {
        if (perm !== 'granted') {
          // Browsers require a gesture to re-grant; surface it to the UI.
          emit(status({ needsPermission: true, pendingName: handle.name }));
          return null;
        }
        return readHandle(handle).then(function (state) {
          fileHandle = handle;
          emit(status());
          return state;
        });
      }).catch(function () { return null; });
    });
  }

  /** Re-grant permission on the remembered handle (must run in a click handler). */
  function reconnectFile() {
    return idbGet().then(function (handle) {
      if (!handle) throw new Error('No remembered data file.');
      return verifyPermission(handle, true).then(function (ok) {
        if (!ok) throw new Error('Permission denied.');
        return readHandle(handle).then(function (state) {
          fileHandle = handle;
          emit(status());
          return state;
        });
      });
    });
  }

  function detachFile() {
    fileHandle = null;
    return idbClear().then(function () { emit(status()); });
  }

  function hasFile() { return !!fileHandle; }

  function rememberedName() {
    return idbGet().then(function (h) { return h ? h.name : null; });
  }

  /* ----------------------------------------------------------------- save */

  function saveLocal(state) {
    try { root.localStorage.setItem(LS_STATE_KEY, JSON.stringify(state)); }
    catch (e) { /* quota or disabled storage — not fatal */ }
  }

  function loadLocal() {
    try {
      var raw = root.localStorage.getItem(LS_STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /** Mirror immediately, write the real file debounced. */
  function save(state) {
    saveLocal(state);
    if (!fileHandle) { emit(status()); return; }
    pendingState = state;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(function () {
      writeTimer = null;
      var toWrite = pendingState;
      pendingState = null;
      emit(status({ saving: true }));
      writeHandle(fileHandle, toWrite).then(function () {
        emit(status({ savedAt: new Date() }));
      }).catch(function (err) {
        emit(status({ error: err.message || String(err) }));
      });
    }, WRITE_DEBOUNCE_MS);
  }

  /** Force any debounced write out now (used before export / on unload). */
  function flush() {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    if (!fileHandle || !pendingState) return Promise.resolve();
    var toWrite = pendingState;
    pendingState = null;
    return writeHandle(fileHandle, toWrite).catch(function () { /* noop */ });
  }

  /* ------------------------------------------------------- export / import */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJSON(state) {
    download(DEFAULT_FILENAME, JSON.stringify(state, null, 2), 'application/json');
  }

  function importJSON(file) {
    return file.text().then(function (text) { return JSON.parse(text); });
  }

  function csvCell(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCSV(applications, templateName) {
    var head = ['Company', 'Email', 'Role', 'Template', 'Date sent', 'Status',
                'Response date', 'Follow-up on', 'Notes'];
    var lines = [head.map(csvCell).join(',')];
    applications.forEach(function (a) {
      lines.push([
        a.company, a.email, a.role, templateName(a.templateId), a.dateSent,
        a.status, a.responseDate, a.followUpOn, a.notes
      ].map(csvCell).join(','));
    });
    // BOM so Excel reads UTF-8 accents correctly.
    download('careerlauncher-tracker.csv', '﻿' + lines.join('\r\n'), 'text/csv');
  }

  /* ----------------------------------------------------- company list cache */

  function cacheCompanies(rows) {
    try {
      root.localStorage.setItem(LS_COMPANIES_KEY, JSON.stringify({
        fetchedAt: new Date().toISOString(),
        rows: rows
      }));
    } catch (e) { /* noop */ }
  }

  function cachedCompanies() {
    try {
      var raw = root.localStorage.getItem(LS_COMPANIES_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  root.CLStorage = {
    supportsFS: supportsFS,
    onStatus: onStatus,
    getStatus: status,
    hasFile: hasFile,
    rememberedName: rememberedName,
    openFile: openFile,
    createFile: createFile,
    restoreFile: restoreFile,
    reconnectFile: reconnectFile,
    detachFile: detachFile,
    save: save,
    flush: flush,
    loadLocal: loadLocal,
    exportJSON: exportJSON,
    importJSON: importJSON,
    exportCSV: exportCSV,
    cacheCompanies: cacheCompanies,
    cachedCompanies: cachedCompanies
  };
})(window);
