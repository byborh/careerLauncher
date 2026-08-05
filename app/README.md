# CareerLauncher Tracker

A dependency-free web app that turns the
[CareerLauncher dataset](../data/companies.md) — from the open-source project
[github.com/byborh/careerLauncher](https://github.com/byborh/careerLauncher) —
into an organized job search:

1. **Compose** — pick a company, pick a template, get a ready-to-send email with
   your details merged in.
2. **Tracker** — log what you sent and see what needs a follow-up.
3. **Profile & Templates** — your details and your email templates.

It never sends anything. You copy the email and send it from your own mail
client, like a human.

## Run it

**Hosted:** your own deployment — see [docs/DEPLOY.md](../docs/DEPLOY.md).

**Locally, with the emulators:**

```bash
pnpm run dev        # from the repo root
```

**Locally, with nothing:**

```bash
cd app
python -m http.server 8000     # or: pnpm dlx serve .
```

Opening `index.html` straight from disk works too, but browsers block the File
System Access API and service workers on `file://`, so you are limited to the
Export/Import buttons.

No build step, no install step, no framework. The Firebase SDK is the one thing
loaded from a CDN, and only when you have configured a project.

## Where your data lives

The bar under the header always tells you which of three modes you are in.

**☁️ Cloud** — you are signed in with an email and a password. Firestore is the
source of truth. Every change syncs live to every device signed into the same
account, and it works offline: Firestore queues writes locally and replays them
when the network returns. The local file and the `localStorage` mirror are still
kept up to date, as a backup.

The sign-in dialog does exactly one thing: sign in. No provider beyond
Email/Password, no "create account", no "forgot password". This is a deployment
you own, not a service with users to onboard — so accounts are created and
passwords changed in the Firebase console, under **Authentication > Users**.
Everything that would exist to support self-service signup is a surface that can
leak or break, so none of it is here. See
[docs/DEPLOY.md §3](../docs/DEPLOY.md#3-turn-on-authentication-and-create-your-user).

**💾 Data file** *(Chromium)* — click **Create data file** and pick a location
for `careerlauncher-data.json`. Every change is written to that real file on
your disk — back it up, sync it, commit it, move it between machines. The app
remembers the file and reopens it next visit.

**⚠️ Browser only** — `localStorage` in this one browser, and nothing else. The
bar is yellow on purpose. Export regularly.

In every mode: **Export JSON** / **Import JSON** move your data around and
**Export CSV** opens the tracker in Excel.

### Signing in when you already have local data

If both this browser and your account hold data, the app asks rather than
guessing:

- **Merge both** — the union of both sides. When the same application exists on
  both, the account's version wins.
- **Keep the account only** — this browser's copy is left untouched but unused.
- **Replace the account with this browser** — destructive, and confirmed twice.

When only one side has data, there is nothing to decide and the app just does
the obvious thing.

**Sign out and forget this browser** signs you out *and* erases the local
mirror — for shared or borrowed machines.

## Install it on a phone

The app is a PWA (`manifest.webmanifest` + `sw.js`). Open your deployed URL on
your phone and use **Add to home screen**. Below 760px the tracker table becomes
one card per application, so a ten-column spreadsheet stops being a ten-column
spreadsheet.

## The company list

Parsed from [`data/companies.md`](../data/companies.md).

- A snapshot ships in `seed-companies.js`, so the app works offline and on first
  run.
- **Update data** re-fetches the live file (`datasetUrl` in `config.js`) and
  re-parses it, then caches the result.
- Rows that are **not** application targets — accessibility/accommodation
  inboxes, recruiting-fraud inboxes, EEO addresses — are hidden. Generic
  `hello@`/`info@` addresses are shown with a *generic inbox* warning.

Regenerate the bundled snapshot after the dataset changes:

```bash
pnpm run seed      # = node app/scripts/build-seed.js
```

## The "why this company" line

The app **will not let you copy** an email whose "why this company" line is
empty, still a placeholder, still the auto-seeded draft, or too short. That line
is the difference between a read email and a deleted one, and no mail merge can
write it for you. "Seed a draft from the description" gives you a starting point
— you still have to rewrite it.

## Files

| File | What it does |
|------|--------------|
| `index.html` | the three screens and the three dialogs |
| `styles.css` | styling (light on purpose — it's a lot of text to read) and the phone layout |
| `config.js` | **the only file you edit**: Firebase config, dataset URL |
| `app.js` | state, merge engine, tracker, wiring |
| `store.js` | the facade: which storage driver is live, and the sign-in merge |
| `storage.js` | local driver — File System Access API, IndexedDB handle, export/import, CSV |
| `cloud.js` | Firebase driver — sign-in, Firestore sync, offline cache (the only ES module) |
| `data.js` | dataset fetch + Markdown table parser + applicability filter |
| `templates.js` | the 3 seed templates in `{{token}}` form |
| `seed-companies.js` | generated dataset snapshot |
| `sw.js`, `manifest.webmanifest`, `icon*.svg` | the PWA shell |
| `scripts/build-seed.js` | regenerates the snapshot (Node) |
| `PROMPT.md` | the build brief this app was written from |

## How the cloud layer is put together

`cloud.js` is the only ES module in the app; it loads the Firebase SDK from
Google's CDN and publishes a plain object on `window.CLCloud`, so every other
file stays the classic, build-step-free script it always was. It handles
email/password authentication only — no OAuth provider is imported, so nothing
in the bundle exists to configure or go wrong.

Firestore layout:

```
users/{uid}                    profile, templates
users/{uid}/applications/{id}  one document per tracked application
```

Applications live in a subcollection rather than inside the user document, so
the tracker is not capped by Firestore's 1 MiB per-document limit and editing
one row costs one small write. Writes are debounced and diffed against the last
server state, so typing a note does not rewrite your whole tracker.

Who can read what is in [`firestore.rules`](../firestore.rules), and it is
tested: `pnpm run test:rules`.

## Merge tokens

`{{company}}` `{{email}}` `{{role}}` `{{description}}` `{{why}}` `{{name}}`
`{{skills}}` `{{portfolio}}` `{{linkedin}}` `{{github}}` `{{phone}}`
`{{userEmail}}` `{{cvFileName}}`

Anything not filled in renders as a visible `⟨…⟩` marker, never as a blank.

## Please use it ethically

One thoughtful email per company. This is not a mass-mailer and it deliberately
cannot become one — see the ethical guidelines in the [main README](../README.md).
