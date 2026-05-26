/* Heredita auth — Supabase Auth (email + password).
 *
 * Cross-device by definition: same email+password works anywhere.
 * Username lives in Supabase user_metadata (no separate table).
 *
 * Public surface (window.HereditaAuth):
 *   ready()                                  → Promise<boolean>
 *   signUp({email, username, dob, password}) → { ok, user?, needsConfirm?, error?, message? }
 *   signIn({emailOrUsername, password})      → { ok, user?, error?, message? }
 *   signOut()                                → Promise<void>
 *   currentUser()                            → { id, email, username, displayName } | null
 *   onChange(cb)                             → unsubscribe()
 *
 * Why a module: uses the official @supabase/supabase-js ESM build from esm.sh.
 * No build step, no bundler. Loads at runtime via dynamic import().
 */
(function () {
  'use strict';

  const cfg = window.HEREDITA_SUPABASE_CONFIG || {};

  let _client = null;
  let _readyPromise = null;
  let _profileCache = null; // { id, email, username, displayName }
  const _listeners = new Set();

  async function _init() {
    if (_client) return true;
    if (!cfg.url || !cfg.anonKey) {
      console.warn('[heredita][auth] Supabase config missing — set HEREDITA_SUPABASE_CONFIG');
      return false;
    }
    try {
      const mod = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
      _client = mod.createClient(cfg.url, cfg.anonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          storage: window.localStorage,
          storageKey: 'heredita.supabase.auth'
        }
      });

      // Subscribe to auth changes (cross-tab sync + post-confirm magic links)
      _client.auth.onAuthStateChange((_event, session) => {
        _profileCache = session ? _userFromSession(session) : null;
        _listeners.forEach(cb => { try { cb(_profileCache); } catch (_) {} });
      });

      // Hydrate any existing session
      const { data } = await _client.auth.getSession();
      if (data && data.session) _profileCache = _userFromSession(data.session);

      console.log('[heredita][auth] Supabase ready', { hasSession: !!_profileCache });
      return true;
    } catch (e) {
      console.error('[heredita][auth] Supabase init failed', e);
      return false;
    }
  }

  function ready() {
    if (!_readyPromise) _readyPromise = _init();
    return _readyPromise;
  }

  function _userFromSession(session) {
    const u = session.user || {};
    const meta = u.user_metadata || {};
    const username = meta.username || (u.email || 'user').split('@')[0];
    return {
      id: u.id,
      email: u.email || '',
      username,
      displayName: meta.displayName || username
    };
  }

  function _normalizeError(e) {
    const status = (e && e.status) || 0;
    const msg = (e && (e.message || e.error_description || '')) || '';
    const m = msg.toLowerCase();
    if (m.includes('user already registered') || m.includes('already been registered'))
      return { ok: false, error: 'taken', message: 'An account with that email already exists. Switch to the Sign in tab.' };
    if (m.includes('invalid login credentials'))
      return { ok: false, error: 'wrong-password', message: 'Wrong email or password.' };
    if (m.includes('email not confirmed'))
      return { ok: false, error: 'not-confirmed', message: 'Confirm your email first — check your inbox for the link we sent.' };
    if (m.includes('email address') && m.includes('invalid'))
      return { ok: false, error: 'invalid-email', message: 'That email address looks wrong.' };
    if (m.includes('password should be') || m.includes('weak password'))
      return { ok: false, error: 'weak-password', message: 'Password must be at least 6 characters.' };
    if (status === 429 || m.includes('rate'))
      return { ok: false, error: 'too-many-requests', message: 'Too many tries — wait a minute and retry.' };
    if (m.includes('fetch') || m.includes('network'))
      return { ok: false, error: 'network', message: 'Network error — check your connection.' };
    return { ok: false, error: 'unknown', message: msg || 'Something went wrong.' };
  }

  async function signUp({ email, username, dob, password }) {
    if (!(await ready())) return { ok: false, error: 'unknown', message: 'Auth not configured.' };
    email = String(email || '').trim();
    username = String(username || '').trim();
    if (!email)               return { ok: false, error: 'invalid-email', message: 'Enter an email address.' };
    if (username.length < 3)  return { ok: false, error: 'invalid',       message: 'Username must be 3+ characters.' };
    if (!/^[A-Za-z0-9_.\-]+$/.test(username))
      return { ok: false, error: 'invalid', message: 'Username: letters, numbers, _ . - only.' };
    if (!password || password.length < 6)
      return { ok: false, error: 'weak-password', message: 'Password must be 6+ characters.' };

    try {
      const { data, error } = await _client.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            displayName: username,
            dob: dob || null
          },
          // Magic confirmation link returns the user to /home with a session
          emailRedirectTo: `${location.origin}/home`
        }
      });
      if (error) return _normalizeError(error);

      // If email confirmation is required, data.session is null.
      // The user has been created but must click the email link to sign in.
      if (!data.session) {
        return {
          ok: true,
          needsConfirm: true,
          user: data.user ? {
            id: data.user.id,
            email: data.user.email || email,
            username,
            displayName: username
          } : null
        };
      }
      // Autoconfirm is on — they're signed in immediately.
      _profileCache = _userFromSession(data.session);
      return { ok: true, user: _profileCache };
    } catch (e) {
      console.error('[heredita][auth] signUp threw', e);
      return _normalizeError(e);
    }
  }

  async function signIn({ emailOrUsername, password }) {
    if (!(await ready())) return { ok: false, error: 'unknown', message: 'Auth not configured.' };
    const id = String(emailOrUsername || '').trim();
    if (!id || !password) return { ok: false, error: 'invalid', message: 'Enter your credentials.' };

    // Supabase Auth only knows emails. If the user typed a non-email,
    // tell them — we don't keep a server-side username→email index.
    if (!id.includes('@')) {
      return {
        ok: false,
        error: 'invalid-email',
        message: 'Sign in with your email address (the one you used at sign-up).'
      };
    }
    try {
      const { data, error } = await _client.auth.signInWithPassword({
        email: id,
        password
      });
      if (error) return _normalizeError(error);
      _profileCache = _userFromSession(data.session);
      return { ok: true, user: _profileCache };
    } catch (e) {
      console.error('[heredita][auth] signIn threw', e);
      return _normalizeError(e);
    }
  }

  async function signOut() {
    if (!(await ready())) return;
    try { await _client.auth.signOut(); } catch (_) {}
    _profileCache = null;
  }

  function currentUser() { return _profileCache; }

  function onChange(cb) {
    _listeners.add(cb);
    try { cb(_profileCache); } catch (_) {}
    return () => _listeners.delete(cb);
  }

  window.HereditaAuth = { ready, signUp, signIn, signOut, currentUser, onChange };

  // Eager init so the topbar can pick up a restored session immediately.
  ready();
})();
