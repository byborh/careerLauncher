# Contributing to Career Launcher

Thanks for helping grow this community resource! 🚀

Career Launcher is an **open dataset of publicly listed company career emails**. Its value depends entirely on every entry being **real, public, and verifiable**. Please read this guide before opening a pull request.

---

## The golden rules

1. **Public only.** The email must be published on an official, publicly accessible page (careers page, contact page, accessibility/accommodation statement, press page, etc.). Never add a private, personal, or guessed address.
2. **Always include a source URL** where the email actually appears. If we can't see it on the page, we can't accept it.
3. **Role addresses, not people.** Add team inboxes like `careers@`, `jobs@`, `recruiting@`, `hr@`, `talent@`, or `accessibility@` — never an individual employee's personal address.
4. **No guessing.** Do not infer `careers@company.com` just because the pattern is common. If it isn't printed on a real page, leave it out.
5. **Ethical use.** This list exists for thoughtful, individual outreach — not bulk or automated emailing. Contributions that encourage spam will be rejected.

---

## Data format

Each company is **one row** in the table in [`README.md`](README.md), with exactly these 8 columns:

| Column | Meaning | Example |
|--------|---------|---------|
| **Company** | Official company name (spelled correctly) | `Nextcloud` |
| **Domain** | Primary web domain, no `https://` | `nextcloud.com` |
| **Role Email** | The exact public email | `jobs@nextcloud.com` |
| **Department / Team** | Short purpose label | `For Employment` |
| **Location** | HQ or region | `Stuttgart, Germany` / `Global` |
| **Description** | One sentence on what the company does | `Open-source cloud collaboration software company.` |
| **Source URL** | The exact page where the email is published | `https://nextcloud.com/jobs/` |
| **Last Verified** | Date you confirmed it, `YYYY-MM-DD` | `2026-07-11` |

### Row example

```
| Nextcloud | nextcloud.com | jobs@nextcloud.com | For Employment | Stuttgart, Germany | Open-source cloud collaboration and self-hosted file sync/share software company. | https://nextcloud.com/jobs/ | 2026-07-11 |
```

---

## How to contribute

### Option A — Suggest a company (easiest)
Open an issue using the **"Suggest a company"** template. Fill in the fields and we'll add it.

### Option B — Open a pull request
1. Fork the repo and create a branch (e.g. `add-nextcloud`).
2. Add your row to the table in `README.md`, keeping the columns aligned.
3. **Verify before submitting:** open the Source URL and confirm the email is visible on that page today.
4. Commit with a clear message: `add Nextcloud`.
5. Open a PR and fill in the checklist in the PR template.

---

## Verification checklist (self-check before submitting)

- [ ] The email is visible on the Source URL **right now**.
- [ ] It's a role/team inbox, not a personal address.
- [ ] The domain and company name are spelled correctly.
- [ ] `Last Verified` is today's date in `YYYY-MM-DD` format.
- [ ] The company isn't already in the list.

---

## What gets rejected

- Guessed or pattern-inferred emails with no source.
- Personal/individual employee addresses.
- Recruiter or third-party staffing agency addresses posing as the company.
- Anything that reads as encouraging spam or scraping.

---

## Reporting a bad or dead entry

Found a bounced email, dead link, or wrong data? Open an issue with the **"Report a problem"** template — keeping the list accurate is just as valuable as adding to it.

Thank you for keeping Career Launcher trustworthy and useful. 💚
