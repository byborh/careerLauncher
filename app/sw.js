/* sw.js - offline shell.
 *
 * Only the app's own files are cached here. Firestore traffic and the Firebase
 * SDK on gstatic are deliberately left alone: Firestore has its own IndexedDB
 * offline cache and intercepting its transport would break sync.
 *
 * Bump CACHE when you change any shell file, or the old one is served forever.
 */
var CACHE = 'careerlauncher-shell-v2';

var SHELL = [
  './',
  'index.html',
  'styles.css',
  'config.js',
  'templates.js',
  'seed-companies.js',
  'data.js',
  'storage.js',
  'store.js',
  'app.js',
  'cloud.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .catch(function () { /* a missing optional file must not block install */ })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // gstatic, Firestore, the dataset

  // Navigations: fresh shell when online, cached shell when not.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match('index.html').then(function (hit) {
          return hit || caches.match('./');
        });
      })
    );
    return;
  }

  // Everything else in the shell: network first, cache as the offline copy.
  //
  // This used to be stale-while-revalidate, which meant the first load after a
  // deploy served the OLD file and only refreshed it in the background - so a
  // fix you just shipped looked like it had not worked, and you only saw it on
  // the second reload. The shell is a handful of small files with no filename
  // fingerprinting; a round-trip when online is cheaper than that confusion.
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return caches.match(req); })
  );
});
