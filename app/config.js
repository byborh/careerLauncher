/* config.js - the only file you edit to make this app YOURS.
 *
 * Everything here is PUBLIC. A Firebase web config is not a secret: it ships in
 * every Firebase web app and identifies your project, it does not authorize
 * anything. What protects your data is firestore.rules (each signed-in user can
 * only touch their own documents) plus the API-key restrictions and the
 * authorized-domains list you set in the Firebase console.
 * See docs/DEPLOY.md, step 6.
 *
 * Leave `firebase: null` and the app still runs, exactly as it always has:
 * local file + browser storage, no account, no network.
 *
 * Only one Firebase feature has to be enabled for the cloud mode to work:
 * Authentication with the Email/Password provider, plus Cloud Firestore.
 * No OAuth provider is used anywhere in this app.
 */
window.CL_CONFIG = {

  /* Paste the config object from:
   * Firebase console > Project settings > Your apps > Web app > SDK setup > Config
   *
   *   firebase: {
   *     apiKey: "AIza...",
   *     authDomain: "your-project.firebaseapp.com",
   *     projectId: "your-project",
   *     storageBucket: "your-project.firebasestorage.app",
   *     messagingSenderId: "000000000000",
   *     appId: "1:000000000000:web:abcdef"
   *   },
   */
  firebase: {
    apiKey: "AIzaSyDtljbe8scOpE_JmJXNwTh8jaApq9_VH-w",
    authDomain: "byborh-careerlauncher.firebaseapp.com",
    projectId: "byborh-careerlauncher",
    storageBucket: "byborh-careerlauncher.firebasestorage.app",
    messagingSenderId: "710438225804",
    appId: "1:710438225804:web:4a753f7b4ff8bffd2978a9",
    measurementId: "G-69B7VK2K5C"
  },
  /* Where "Update data" re-fetches the company list from. Point this at your
   * own fork if you maintain your own list. */
  datasetUrl: 'https://raw.githubusercontent.com/byborh/careerLauncher/main/data/companies.md',

  /* Firebase JS SDK loaded from Google's CDN. Bump it when you want to. */
  firebaseSdkVersion: '12.17.1',

  /* Optional App Check site key (reCAPTCHA v3). Blocks abuse of your Firebase
   * project from outside your own site. See docs/DEPLOY.md, step 7. */
  appCheckSiteKey: null
};
