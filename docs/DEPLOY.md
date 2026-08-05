# Deploy your own Career Launcher

At the end of this page you have your own URL, your own database, your own
account, and the same tracker on your laptop and your phone. It costs nothing.

Time: about ten minutes, most of it waiting for the Firebase console.

**Prerequisites:** [Node.js 18+](https://nodejs.org), a Google account, and a
GitHub account if you want automatic deploys.

---

## 1. Get the code

Fork this repository on GitHub — you want your own copy, so you can keep your
config and your dataset edits — then:

```bash
git clone https://github.com/YOUR-USERNAME/careerLauncher.git
cd careerLauncher
pnpm install
```

`pnpm install` only pulls development tools (the Firebase CLI, the emulators, the
rule tests). The app itself has no dependencies and no build step.

---

## 2. Create a Firebase project

1. Go to <https://console.firebase.google.com> and click **Create a project**.
2. Name it something you will recognise — `careerlauncher-ada`, for instance.
   The **project ID** it generates (shown under the name) is what you will use
   everywhere below.
3. Google Analytics: **not needed**. Turn it off unless you want it.

You are on the **Spark** plan, which is free and has no card attached. See
[§9](#9-what-this-costs) for why that is enough.

---

## 3. Turn on Authentication, and create your user

**3a. Enable the provider.** In the console: **Build > Authentication > Get
started**, then under **Sign-in method**, add **Email/Password** and enable the
top toggle. Leave "Email link (passwordless sign-in)" off.

That is the only provider this app uses, and it is deliberate. Email and
password works on every device, needs no OAuth consent screen, no support
email, and no extra domain configuration — the strict minimum to sync your data
and nothing more. There is no Google button and no code for one.

**3b. Create your account, here, now.** The app has a **Sign in** button and
nothing else: no "create account", no "forgot password". This is your own
deployment for your own use, not a service with users to onboard, so accounts
live where they belong — in the console you already own.

1. **Authentication > Users > Add user**
2. Type the email and password you want. Nothing is sent to that address; it is
   just your login.
3. **Add user**.

That is the account you will sign in with. To change the password later, come
back to the same screen: **⋮** at the end of the row > *Reset password* (sends
a reset email) or delete the user and add it again.

**3c. Close the door.** Enabling Email/Password also opens Firebase's public
sign-up endpoint, and removing the button from the app does **not** close it —
anyone with your config could still register through the API. Shut it properly:

**Authentication > Settings > User actions**, uncheck **"Enable create
(sign-up)"**, save.

Existing users — you — keep signing in normally. Nobody can create a new
account. Do this as soon as your user from 3b exists.

> **Authorized domains.** Still in Authentication, open **Settings > Authorized
> domains**. `your-project.web.app`, `your-project.firebaseapp.com` and
> `localhost` are there already, which is all email/password needs. If you add
> a custom domain in [§8](#8-use-your-own-domain), add it here too so password
> reset links keep working.

---

## 4. Turn on Cloud Firestore

**Build > Firestore Database > Create database**.

- **Location**: pick the region closest to you. *This cannot be changed later.*
- **Rules**: choose **Start in production mode** (locked down). You are about to
  deploy the real rules anyway, and this way there is never a window where your
  database is open.

---

## 5. Point the app at your project

This is the step everyone gets stuck on, so here it is click by click.

**5a. Register a web app.** A Firebase *project* can hold several *apps* (web,
Android, iOS). You have a project; you now need a web app inside it.

1. In the Firebase console, click the **⚙ gear** next to *Project Overview*
   (top left) → **Project settings**.
2. Stay on the **General** tab and scroll to the bottom, to the section
   **Your apps**.
3. If you see no app yet, click the **web icon — `</>`**. (Not Android, not
   iOS.) If an app is already listed, skip to 5b.
4. **App nickname**: anything, e.g. `careerlauncher-web`. It is only a label.
5. **"Also set up Firebase Hosting for this app"**: leave it **unchecked**. You
   will set up Hosting from the command line in step 6, and ticking it here
   changes nothing useful.
6. Click **Register app**.

**5b. Copy the config.** Firebase now shows you a code block titled *"Add
Firebase SDK"*. It looks like this — and **you only want the object**, not the
`import` lines and not the `initializeApp` call:

```js
// ⬇ Firebase shows you this. Ignore these two lines.
import { initializeApp } from "firebase/app";

// ⬇ THIS is what you copy - everything from { to } inclusive.
const firebaseConfig = {
  apiKey: "AIzaSyD-EXAMPLE-EXAMPLE-EXAMPLE",
  authDomain: "careerlauncher-ada.firebaseapp.com",
  projectId: "careerlauncher-ada",
  storageBucket: "careerlauncher-ada.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};

// ⬇ Ignore this line too. cloud.js already does it for you.
const app = initializeApp(firebaseConfig);
```

> **Lost this screen?** It is always available: **⚙ Project settings >
> General > Your apps >** your web app **> SDK setup and configuration**, then
> pick the **Config** radio button (not *CDN*, not *npm*).

**5c. Paste it.** Open [`app/config.js`](../app/config.js). Replace the line
`firebase: null,` with `firebase: { … },` — the object you just copied, comma
at the end because other keys follow:

```js
window.CL_CONFIG = {
  firebase: {
    apiKey: "AIzaSy…",
    authDomain: "careerlauncher-ada.firebaseapp.com",
    projectId: "careerlauncher-ada",
    storageBucket: "careerlauncher-ada.firebasestorage.app",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abc123"
  },
  datasetUrl: 'https://raw.githubusercontent.com/YOUR-USERNAME/careerLauncher/main/data/companies.md',
  firebaseSdkVersion: '12.17.1',
  appCheckSiteKey: null
};
```

Three things to get right, because they are the usual mistakes:

- keep the **quotes** around the values, and the **commas** between them;
- the object goes where `null` was, and the line still ends with a **comma**
  (`datasetUrl` follows it);
- do not paste `const firebaseConfig =` or the semicolon.

Save, and open `app/index.html` locally. The bar under the header should now
offer **Sign in to sync** instead of the yellow local-only warning. If it does
not, open the browser console: a syntax error in `config.js` shows up there
immediately.

If you skip this whole step and leave `firebase: null`, the app still works —
it just stays in local file / browser mode, with no account and no sync.

### Wait — I am committing an API key to a public repo?

Yes, and it is fine. This is the part that feels wrong and is not.

A Firebase web config **identifies** your project. It does not **authorize**
anything. It has to reach the browser for the app to work at all, so it is
public whatever you do — putting it in a `.env` and injecting it at build time
would only move it into your JavaScript bundle, where anyone opens DevTools and
reads it. That is security theatre, not security.

Here is exactly what a stranger holding your config can and cannot do:

| | |
|---|---|
| Read your applications, profile or templates | ❌ **Never.** `firestore.rules` binds every document to a `uid` |
| Write anything into your account | ❌ Never |
| Create *their own* account in your project | ✅ Only while sign-up is enabled — turn it off in [§3c](#3-turn-on-authentication-and-create-your-user) |
| Read the data of that account of theirs | ✅ Theirs only, and only if they got one |
| Burn through your free quota | ⚠️ In theory, if they are determined |

So the correct sentence is not "nobody can access it", it is **"nobody can
access *your* data"**. The only real exposure is strangers signing up in your
project and consuming quota. Three locks, weakest to strongest:

1. restrict the API key to your own domains ([§7](#7-lock-the-door-behind-you));
2. turn on App Check — then only your site can talk to your project ([§7](#7-lock-the-door-behind-you));
3. **disable sign-up** once your own user exists
   ([§3c](#3-turn-on-authentication-and-create-your-user)). This is the one
   that actually closes the door, and it takes ten seconds.

What actually keeps your job search private is [`firestore.rules`](../firestore.rules),
and `pnpm run test:rules` proves it does.

---

## 6. Deploy

```bash
pnpm exec firebase login
pnpm exec firebase use --add        # select your project, call the alias "default"
pnpm exec firebase deploy
```

That single deploy pushes both the app and the security rules. When it finishes
it prints your **Hosting URL**: `https://your-project-id.web.app`.

Open it, click **Sign in to sync**, and use the email and password you created
in [§3b](#3-turn-on-authentication-and-create-your-user). Then open the same URL
on your phone, sign in with the same account, and your applications are already
there.

### Check it before and after

```bash
pnpm test              # the app and the sync logic, no emulator needed
pnpm run test:rules    # the security rules, under the Firestore emulator
```

`pnpm test` boots the real `app/index.html` in a headless DOM and drives it: the
copy blocker, the tracker, the phone labels, and every branch of the sign-in
merge (empty account, fresh device, two devices that disagree, live remote
change, sign-out).

`pnpm run test:rules` asserts what actually matters: a signed-in user can touch
their own documents and *nothing else* — not another user's profile, not
another user's applications, not an arbitrary collection. It also rejects
unknown fields and oversized values, so nobody can turn your free database into
their file host.

> **Why this one asks for Java.** It does not test *your* code — it tests
> [`firestore.rules`](../firestore.rules), and rules are evaluated by Firestore
> itself, not by JavaScript. To run them on your laptop you need a Firestore,
> so Firebase ships one: the local emulator. That emulator is written in Java,
> which is why `java -version` has to work. Nothing else in this repo needs it.
>
> **You can skip it entirely.** `pnpm test` covers the app and needs nothing.
> The rule tests run automatically on every push in GitHub Actions, which
> installs Java for itself. Install [Temurin 17](https://adoptium.net) only if
> you want to change `firestore.rules` and check your work locally — which you
> should, before deploying a rules change.

---

## 7. Lock the door behind you

The rules are the real protection. These two steps make the project boring to
abuse in the first place.

**Restrict the API key** — Google Cloud console >
[Credentials](https://console.cloud.google.com/apis/credentials) > the
"Browser key (auto created by Firebase)":

- *Application restrictions* → **Websites**, and list your domains:
  `your-project.web.app`, `your-project.firebaseapp.com`,
  `your-custom-domain.com`, and `localhost` while you develop.
- *API restrictions* → restrict to **Identity Toolkit API**, **Token Service
  API**, **Cloud Firestore API**, and **Firebase Installations API**.

**Close sign-ups** — the single most useful lock, already covered in
[§3c](#3-turn-on-authentication-and-create-your-user): Authentication >
Settings > User actions > uncheck **Enable create (sign-up)**. Without it, the
public sign-up endpoint stays open even though the app has no button for it.

**App Check (optional but recommended)** — Firebase console > **Build > App
Check**. Register your web app with **reCAPTCHA v3**, copy the site key into
`appCheckSiteKey` in `app/config.js`, redeploy, watch the metrics for a few
days, then switch Firestore to **Enforced**. From that point only your own site
can talk to your project.

**Cap your usage** — Spark has no billing, so there is nothing to run away. If
you ever upgrade to Blaze, set a budget alert in Google Cloud Billing first.

---

## 8. Use your own domain

Firebase console > **Hosting > Add custom domain**, then follow the DNS records
it gives you. TLS is issued automatically and takes a few minutes to a few
hours.

Afterwards, add the domain to **Authentication > Settings > Authorized domains**
and to your API key's website restrictions ([§7](#7-lock-the-door-behind-you)),
or sign-in will break on the new hostname while working fine on `.web.app`.

---

## 9. What this costs

Nothing, and here is the arithmetic. The Spark free tier gives you 50,000
document reads, 20,000 writes and 1 GiB of storage **per day**.

One application row is one small document. Sending 500 applications over a
whole job search is 500 writes — 2.5% of a *single day's* free quota. Opening
the app reads your profile document plus one document per application; at 500
applications that is 501 reads, and Firestore's offline cache means a reload
usually reads nothing at all.

You would have to be running this for a small country to leave the free tier.

---

## 10. Automatic deploys (optional)

The repo ships [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):
it runs the rule tests and checks the dataset snapshot is current on every push
and pull request, deploys a **preview channel** for each pull request, and
deploys to **live** on `main`.

To enable it in your fork:

```bash
pnpm exec firebase init hosting:github
```

That creates the `FIREBASE_SERVICE_ACCOUNT` secret for you. Then add a
repository **variable** (Settings > Secrets and variables > Actions >
Variables) named `FIREBASE_PROJECT_ID` with your project ID.

If you also want the workflow to push rules changes, grant the service account
the **Firebase Rules Admin** role in Google Cloud IAM.

---

## 11. Develop locally

```bash
pnpm run dev        # the app on http://localhost:5000 - no Java needed
```

This runs the Hosting emulator only. Auth and Firestore calls go to your **real
project**, which is what you want for a quick look: you sign in with your real
account and see your real data.

```bash
pnpm run dev:full   # Hosting + Auth + Firestore emulators - needs Java
```

The full set gives you throwaway Auth and Firestore instances (emulator UI on
<http://localhost:4000>) so nothing touches production. It needs a JRE, for the
same reason `pnpm run test:rules` does — the Firestore emulator is a Java
program.

Without Firebase at all:

```bash
cd app && python -m http.server 8000
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `auth/unauthorized-domain` | The hostname is not in Authentication > Settings > Authorized domains | Add it |
| `auth/operation-not-allowed` | Email/Password is switched off | Enable it in Authentication > Sign-in method |
| `No account for that email` | You have not created your user yet | Authentication > Users > Add user ([§3b](#3-turn-on-authentication-and-create-your-user)) |
| Forgot your password | There is no reset button in the app, by design | Authentication > Users > **⋮** > Reset password |
| `Missing or insufficient permissions` | Rules not deployed, or deployed to the wrong project | `pnpm exec firebase use --add`, then `pnpm exec firebase deploy --only firestore:rules` |
| `auth/unauthorized-domain` on a custom domain | Password reset links point at a hostname Firebase does not know | Add the domain in Authentication > Settings > Authorized domains |
| The bar stays yellow and there is no "Sign in to sync" button | **The most common one.** `app/config.js` has a syntax error, so it never ran — usually pasting Firebase's `const firebaseConfig = {…}` verbatim. The key must be `firebase: { … },` | Open the browser console; the error is there. Fix, then `pnpm exec firebase deploy` |
| The bar says "app/config.js failed to load" | Same cause as above, now reported out loud | Browser console → fix the syntax → redeploy |
| The deployed site looks like the old one | `firebase deploy` ships your **local** `app/` folder, not what is on GitHub. A commit is not needed — but a redeploy is, after every edit | `pnpm exec firebase deploy` |
| Old version keeps loading | The service worker is serving its cache | Hard-reload once; `sw.js` and `index.html` are sent with `no-cache`, so this self-corrects |
| "Update data" fails | `datasetUrl` points at a file that does not exist | Check the raw URL in `app/config.js` opens in a browser |
