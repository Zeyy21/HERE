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
  apiKey:            "PASTE_FROM_FIREBASE_HERE",
  authDomain:        "your-project.firebaseapp.com",
  databaseURL:       "https://your-project-default-rtdb.firebaseio.com",
  projectId:         "your-project",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "0000000000",
  appId:             "1:0000000000:web:0000000000"
};

// Public rooms users can join. Add/remove freely.
window.HEREDITA_CHAT_ROOMS = [
  { id: 'town-square', name: 'Town Square',    blurb: 'The main lobby. Anyone, any topic.' },
  { id: 'strategy',    name: 'Strategy',       blurb: 'Tactics, diplomacy, alliances.' },
  { id: 'history',     name: 'History Buffs',  blurb: 'Real-world events, dates, debates.' },
  { id: 'off-topic',   name: 'Off-Topic',      blurb: 'Whatever you want.' }
];
