/* Heredita chat — Firebase config (to be filled in by site owner)
 *
 * SETUP CHECKLIST (one-time, ~5 minutes, completely free):
 *
 *   1. Open https://console.firebase.google.com/ (sign in with any Google account)
 *   2. Click "Add project". Name it whatever you like (e.g. "heredita-chat").
 *      You can disable Google Analytics. Create.
 *   3. In the project dashboard, click the </> "Web" icon to add a web app.
 *      Nickname: "Heredita web". Skip Firebase Hosting. Click "Register app".
 *   4. Firebase shows a snippet like:
 *        const firebaseConfig = {
 *          apiKey: "AIzaSy...",
 *          authDomain: "heredita-chat.firebaseapp.com",
 *          databaseURL: "https://heredita-chat-default-rtdb.firebaseio.com",
 *          projectId: "heredita-chat",
 *          storageBucket: "heredita-chat.appspot.com",
 *          messagingSenderId: "1234567890",
 *          appId: "1:1234567890:web:abc123"
 *        };
 *      COPY THAT OBJECT into HEREDITA_CHAT_CONFIG below.
 *      The `databaseURL` line is critical — make sure it's present.
 *   5. In the Firebase console left sidebar: "Build" → "Realtime Database"
 *      → "Create Database" → Location: closest to you → Start in TEST MODE
 *      (we'll lock it down right after).
 *   6. Once the DB is up, click "Rules" tab at the top and paste:
 *
 *        {
 *          "rules": {
 *            "rooms": {
 *              "$room": {
 *                ".read":  true,
 *                ".write": "auth != null",
 *                "messages": {
 *                  "$mid": {
 *                    ".validate": "newData.hasChildren(['from','text','ts']) && newData.child('text').isString() && newData.child('text').val().length <= 800"
 *                  }
 *                }
 *              }
 *            }
 *          }
 *        }
 *
 *      Click "Publish". This lets anyone READ public rooms, but only
 *      authenticated users can POST, and each message must have from/text/ts.
 *   7. In the left sidebar: "Build" → "Authentication" → "Get started"
 *      → "Sign-in method" → enable "Anonymous". Save.
 *   8. Add your domain to the authorised origins list:
 *      Authentication → Settings tab → "Authorized domains" → Add
 *        heredita.net
 *      (localhost is allowed by default; *.vercel.app needs to be added too
 *      if you want chat working on preview deploys.)
 *
 *   Done. Save this file, commit, push. Chat works at /chat.html.
 *
 * If HEREDITA_CHAT_CONFIG.apiKey is still the placeholder below, the chat
 * page renders a friendly "not yet configured" notice instead of failing.
 */
window.HEREDITA_CHAT_CONFIG = {
  apiKey:            "AIzaSyAsKqOZr0Xc2tdof2ZvbNoXvo3qKNJyQmE",
  authDomain:        "heredita-5f315.firebaseapp.com",
  // Firebase doesn't show databaseURL in the modern "Add web app" snippet,
  // but the Realtime Database SDK needs it. The URL is your project id
  // suffixed with `-default-rtdb.firebaseio.com` (or `-default-rtdb.<region>`
  // for non-us regions). Yours is in us-central1, so:
  databaseURL:       "https://heredita-5f315-default-rtdb.firebaseio.com",
  projectId:         "heredita-5f315",
  storageBucket:     "heredita-5f315.firebasestorage.app",
  messagingSenderId: "680751896623",
  appId:             "1:680751896623:web:2a05a4fc3fc9b3b1a10eda",
  measurementId:     "G-PJYGBFRHVS"
};

// Public rooms users can join. Add more freely — only "General" for now.
window.HEREDITA_CHAT_ROOMS = [
  { id: 'general', name: 'General', blurb: 'The main lobby. Anyone, any topic.' }
];
