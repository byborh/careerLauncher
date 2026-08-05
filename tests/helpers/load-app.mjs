/* Boots app/index.html in jsdom the way a browser would.
 *
 * cloud.js is an ES module and jsdom does not execute those, which is
 * convenient: it means the tests can hand the app a fake Firebase driver
 * through the same `window.CLCloudReady` promise the real one resolves.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..');
export const APP = path.join(REPO, 'app');

/* The classic scripts, in the order index.html lists them. */
const SCRIPTS = ['config.js', 'templates.js', 'seed-companies.js', 'data.js',
                 'storage.js', 'store.js', 'app.js'];

/**
 * @param {object}  [options]
 * @param {object}  [options.localState]  seeded into localStorage before boot
 * @param {object}  [options.cloud]       a fake CLCloud, or null for local mode
 * @param {boolean} [options.signIn]      call the auth listener after boot
 */
export async function bootApp(options = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  virtualConsole.on('error', (...a) => errors.push(a.join(' ')));

  const html = readFileSync(path.join(APP, 'index.html'), 'utf8')
    .replace(/<script type="module"[^>]*><\/script>/, '');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost:8000/',
    virtualConsole
  });
  const { window } = dom;

  // No network and no prompts in a test run.
  window.fetch = () => Promise.reject(new Error('offline in tests'));
  window.confirm = () => true;
  if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = () => 'id-' + Math.random().toString(36).slice(2);
  }

  if (options.localState) {
    window.localStorage.setItem('careerlauncher-state', JSON.stringify(options.localState));
  }

  for (const file of SCRIPTS) {
    const el = window.document.createElement('script');
    el.textContent = readFileSync(path.join(APP, file), 'utf8');
    window.document.body.appendChild(el);
  }

  // Let jsdom fire DOMContentLoaded itself; dispatching one by hand as well
  // would boot the app twice and bind every listener twice.
  await new Promise((resolve) => {
    if (window.document.readyState !== 'loading') return resolve();
    window.document.addEventListener('DOMContentLoaded', resolve);
  });

  window.__CL_CLOUD_RESOLVE__(options.cloud || null);
  await tick(window);

  if (options.cloud && options.signIn !== false) {
    options.cloud._auth({ uid: 'alice', email: 'alice@example.com', displayName: 'Alice' });
    await tick(window);
  }

  return {
    window,
    errors,
    $: (id) => window.document.getElementById(id),
    click: (id) => window.document.getElementById(id)
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
    type: (id, value) => {
      const el = window.document.getElementById(id);
      el.value = value;
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
    },
    stored: () => JSON.parse(window.localStorage.getItem('careerlauncher-state') || 'null'),
    settle: () => tick(window)
  };
}

function tick(window) {
  return new Promise((resolve) => window.setTimeout(resolve, 60));
}

/** A stand-in for cloud.js that records what the app asked it to do. */
export function fakeCloud(cloudState) {
  const calls = { save: [], replaceAll: [], wipe: 0 };
  let push = null;

  const api = {
    available: true,
    projectId: 'fake-project',
    calls,
    onAuth(fn) { api._auth = fn; return () => {}; },
    currentUser: () => null,
    onStatus() {},
    subscribe(uid, cb) {
      push = cb;
      setTimeout(() => cb(snapshot(cloudState), { fromCache: false, pending: false }), 0);
      return () => { push = null; };
    },
    save(uid, state) { calls.save.push(clone(state)); },
    flush: () => Promise.resolve(),
    replaceAll(uid, state) { calls.replaceAll.push(clone(state)); return Promise.resolve(); },
    wipe() { calls.wipe++; return Promise.resolve(); },

    /** Simulate a change made on another device. */
    pushRemote(state) { push(snapshot(state), { fromCache: false, pending: false }); }
  };
  return api;
}

function snapshot(state) {
  return {
    version: 1,
    profile: (state && state.profile) || {},
    templates: state ? (state.templates || null) : null,
    applications: (state && state.applications) || []
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
