# CareerLauncher Tracker

A tiny, dependency-free web app that turns the [CareerLauncher dataset](../README.md)
into an organized job search:

1. **Compose** — pick a company from the list, pick a template, and get a
   ready-to-send email with your details merged in.
2. **Tracker** — log what you sent and see what needs a follow-up.
3. **Profile & Templates** — your details and your email templates.

It never sends anything. You copy the email and send it from your own mail
client, like a human.

## Run it

**Hosted:** open the GitHub Pages URL for this repo (`/app/`).

**Locally — recommended:**

```bash
cd app
python -m http.server 8000     # or: npx serve .
# open http://localhost:8000
```

**Locally — double-click:** opening `index.html` straight from disk works too,
but browsers block the File System Access API on `file://`, so you'll be limited
to the Export/Import buttons. Use a local server for the full experience.

No build step, no npm install, no CDN. Chrome/Edge/Brave get everything;
Firefox/Safari get everything except saving to a file (use Export/Import).

## Where your data lives

Your data is **yours and local**. There is no server, no account, no analytics.

- **Best case (Chromium):** click **Create data file** and pick a location for
  `careerlauncher-data.json`. Every change is written to that real file on your
  disk — back it up, sync it, commit it, move it between machines. The app
  remembers the file and reopens it next visit (the browser will ask permission
  once).
- **Every browser:** **Export JSON** / **Import JSON** move your data around, and
  **Export CSV** opens the tracker in Excel.
- The browser's `localStorage` keeps a mirror so the app reopens instantly, but
  it is *never* the source of truth. The bar at the top always tells you which
  mode you're in — if it's yellow, your data is only in this browser.

## The company list

The list is parsed from this repo's [`README.md`](../README.md) table.

- A snapshot ships in `seed-companies.js`, so the app works offline and on first
  run.
- **Update data** re-fetches the raw README from GitHub and re-parses it, then
  caches the result.
- Rows that are **not** application targets — accessibility/accommodation
  inboxes, recruiting-fraud inboxes, EEO addresses — are hidden. Generic
  `hello@`/`info@` addresses are shown with a *generic inbox* warning.

To regenerate the bundled snapshot after the dataset changes:

```bash
node app/scripts/build-seed.js
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
| `index.html` | the three screens |
| `styles.css` | styling (light, on purpose — it's a lot of text to read) |
| `app.js` | state, merge engine, tracker, wiring |
| `storage.js` | File System Access API, IndexedDB handle, export/import, CSV |
| `data.js` | README fetch + Markdown table parser + applicability filter |
| `templates.js` | the 3 seed templates in `{{token}}` form |
| `seed-companies.js` | generated dataset snapshot |
| `scripts/build-seed.js` | regenerates that snapshot (Node) |
| `PROMPT.md` | the build brief this app was written from |

## Merge tokens

`{{company}}` `{{email}}` `{{role}}` `{{description}}` `{{why}}` `{{name}}`
`{{skills}}` `{{portfolio}}` `{{linkedin}}` `{{github}}` `{{phone}}`
`{{userEmail}}` `{{cvFileName}}`

Anything not filled in renders as a visible `⟨…⟩` marker, never as a blank.

## Please use it ethically

One thoughtful email per company. This is not a mass-mailer and it deliberately
cannot become one — see the ethical guidelines in the [main README](../README.md).
