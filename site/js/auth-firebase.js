/* Heredita auth — Firebase Authentication (email + password) + Firestore
 * for username uniqueness and profile.
 *
 * Why Firebase: cross-device sign-in. The same email+password works on any
 * device the user signs in from. The local game API at app.heredita.net is
 * untouched; it remains the source of truth for friends/search ONLY (and
 * only when CORS allows it).
 *
 * Public surface (window.HereditaAuth):
 *   ready()                        → Promise<boolean>  // SDK loaded + initialized
 *   signUp({email, username, dob, password})  → { ok, user?, error?, message? }
 *   signIn({emailOrUsername, password})       → { ok, user?, error?, message? }
 *   signOut()                      → Promise<void>
 *   currentUser()                  → { uid, email, username, displayName } | null
 *   onChange(cb)                   → unsubscribe()
 *
 * All write errors are normalised to { error: <code>, message }.
 * Common codes: 'taken' | 'invalid-email' | 'weak-password' | 'not-found' |
 *               'wrong-password' | 'too-many-requests' | 'network' | 'unknown'
 */
(function () {
  'use strict';

  const cfg = window.HEREDITA_CHAT_CONFIG || {};

  let _app = null, _auth = null, _db = null;
  let _authm = null, _fsm = null;
  let _readyPromise = null;
  let _profileCache = null; // { uid, email, username, displayName }
  const _listeners = new Set();

  async function _init() {
    if (_app) return true;
    if (!cfg || !cfg.apiKey || cfg.apiKey === 'PASTE_FROM_FIREBASE_HERE') {
      console.warn('[heredita][auth] Firebase config missing — cloud auth disabled');
      return false;
    }
    try {
      const [fb, authm, fsm] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js')
      ]);
      _app   = fb.initializeApp(cfg);
      _auth  = authm.getAuth(_app);
      _db    = fsm.getFirestore(_app);
      _authm = authm;
      _fsm   = fsm;

      // Persist sessions across browser restarts (default but explicit).
      try { await authm.setPersistence(_auth, authm.browserLocalPersistence); } catch (_) {}

      // Keep _profileCache and listeners in sync with auth changes.
      authm.onAuthStateChanged(_auth, async (user) => {
        if (!user) {
          _profileCache = null;
        } else {
          _profileCache = await _loadProfile(user);
        }
        _listeners.forEach(cb => { try { cb(_profileCache); } catch (_) {} });
      });
      console.log('[heredita][auth] Firebase ready');
      return true;
    } catch (e) {
      console.error('[heredita][auth] init failed', e);
      return false;
    }
  }

  function ready() {
    if (!_readyPromise) _readyPromise = _init();
    return _readyPromise;
  }

  async function _loadProfile(user) {
    if (!user) return null;
    let username = (user.displayName || '').trim();
    try {
      const snap = await _fsm.getDoc(_fsm.doc(_db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data();
        username = d.username || username;
      }
    } catch (_) {}
    return {
      uid: user.uid,
      email: user.email || '',
      username: username || (user.email || 'user').split('@')[0],
      displayName: user.displayName || username
    };
  }

  function _normalizeError(e) {
    const code = (e && e.code) || '';
    const map = {
      'auth/email-already-in-use':   { error: 'taken',            message: 'That email is already registered. Try signing in.' },
      'auth/invalid-email':          { error: 'invalid-email',    message: 'That email address looks wrong.' },
      'auth/weak-password':          { error: 'weak-password',    message: 'Password must be at least 6 characters.' },
      'auth/user-not-found':         { error: 'not-found',        message: 'No account with that email or username.' },
      'auth/wrong-password':         { error: 'wrong-password',   message: 'Wrong password.' },
      'auth/invalid-credential':     { error: 'wrong-password',   message: 'Wrong email/username or password.' },
      'auth/too-many-requests':      { error: 'too-many-requests',message: 'Too many tries — wait a minute and retry.' },
      'auth/network-request-failed': { error: 'network',          message: 'Network error — check your connection.' }
    };
    if (map[code]) return Object.assign({ ok: false }, map[code]);
    return { ok: false, error: 'unknown', message: (e && (e.message || code)) || 'Something went wrong.' };
  }

  function _normUsername(u) { return String(u || '').trim().toLowerCase(); }

  async function _usernameTaken(username) {
    const key = _normUsername(username);
    if (!key) return true;
    try {
      const snap = await _fsm.getDoc(_fsm.doc(_db, 'usernames', key));
      return snap.exists();
    } catch (e) {
      console.warn('[heredita][auth] username check failed', e);
      // If the check itself fails, err on the side of "available" and let
      // the reservation write throw if there's a real collision.
      return false;
    }
  }

  async function _resolveUsernameToEmail(username) {
    const key = _normUsername(username);
    if (!key) return null;
    try {
      const snap = await _fsm.getDoc(_fsm.doc(_db, 'usernames', key));
      if (!snap.exists()) return null;
      const uid = snap.data().uid;
      if (!uid) return null;
      const userSnap = await _fsm.getDoc(_fsm.doc(_db, 'users', uid));
      if (!userSnap.exists()) return null;
      return userSnap.data().email || null;
    } catch (e) {
      console.warn('[heredita][auth] username resolve failed', e);
      return null;
    }
  }

  async function signUp({ email, username, dob, password }) {
    if (!(await ready())) return { ok: false, error: 'unknown', message: 'Auth not configured.' };
    email = String(email || '').trim();
    username = String(username || '').trim();
    if (!email)               return { ok: false, error: 'invalid-email', message: 'Enter an email address.' };
    if (username.length < 3)  return { ok: false, error: 'invalid',       message: 'Username must be 3+ characters.' };
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return { ok: false, error: 'invalid', message: 'Username can contain letters, numbers, _ . - only.' };
    }
    if (!password || password.length < 6)
      return { ok: false, error: 'weak-password', message: 'Password must be 6+ characters.' };

    // Pre-check username uniqueness
    if (await _usernameTaken(username)) {
      return { ok: false, error: 'taken', message: 'That username is already taken.' };
    }

    let cred;
    try {
      cred = await _authm.createUserWithEmailAndPassword(_auth, email, password);
    } catch (e) {
      return _normalizeError(e);
    }
    const uid = cred.user.uid;

    // Reserve username + write profile in parallel.
    try {
      await Promise.all([
        _fsm.setDoc(_fsm.doc(_db, 'usernames', _normUsername(username)), { uid }),
        _fsm.setDoc(_fsm.doc(_db, 'users', uid), {
          username,
          displayName: username,
          email,
          dob: dob || null,
          tier: 'regular',
          createdAt: _fsm.serverTimestamp()
        })
      ]);
      try {
        await _authm.updateProfile(cred.user, { displayName: username });
      } catch (_) {}
    } catch (e) {
      console.error('[heredita][auth] profile write failed', e);
      // Roll back the auth account so the user can retry cleanly.
      try { await _authm.deleteUser(cred.user); } catch (_) {}
      return { ok: false, error: 'unknown', message: 'Sign-up partially failed — try again.' };
    }
    _profileCache = await _loadProfile(cred.user);
    return { ok: true, user: _profileCache };
  }

  async function signIn({ emailOrUsername, password }) {
    if (!(await ready())) return { ok: false, error: 'unknown', message: 'Auth not configured.' };
    let id = String(emailOrUsername || '').trim();
    if (!id || !password) return { ok: false, error: 'invalid', message: 'Enter your credentials.' };

    // If it doesn't look like an email, treat it as a username and resolve.
    let email = id;
    if (!id.includes('@')) {
      const resolved = await _resolveUsernameToEmail(id);
      if (!resolved) return { ok: false, error: 'not-found', message: 'No account with that username.' };
      email = resolved;
    }
    try {
      const cred = await _authm.signInWithEmailAndPassword(_auth, email, password);
      _profileCache = await _loadProfile(cred.user);
      return { ok: true, user: _profileCache };
    } catch (e) {
      return _normalizeError(e);
    }
  }

  async function signOut() {
    if (!(await ready())) return;
    try { await _authm.signOut(_auth); } catch (_) {}
    _profileCache = null;
  }

  function currentUser() { return _profileCache; }

  function onChange(cb) {
    _listeners.add(cb);
    // Fire once with current state (may be null until init completes).
    try { cb(_profileCache); } catch (_) {}
    return () => _listeners.delete(cb);
  }

  window.HereditaAuth = { ready, signUp, signIn, signOut, currentUser, onChange };

  // Kick off init eagerly so the session is restored before pages render.
  ready();
})();
