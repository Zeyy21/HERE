/* Heredita API wrapper
 * Talks to https://app.heredita.net (OAuth2 password grant + bearer).
 *
 * Public surface:
 *   HereditaAPI.register(username, password, email?)  -> { ok, userId, error? }
 *   HereditaAPI.login(username, password)             -> { ok, token, error? }
 *   HereditaAPI.verifyTokenId(username, token)        -> { ok, userId, error? }
 *   HereditaAPI.getMe(token)                          -> { ok, user, error? }
 *   HereditaAPI.BASE                                  -> string
 *   HereditaAPI.PLAY_URL                              -> string
 *
 * All methods return Promises. Errors are normalized:
 *   error in { 'network', 'cors', 'ratelimited', 'unauthorized', 'forbidden',
 *              'notfound', 'validation', 'taken', 'invalid', 'server', 'unknown' }
 *   plus a `status` (HTTP code) and `message` (best-effort human string).
 *
 * Local-dev note: CORS at app.heredita.net only allows Origin=https://heredita.net.
 * Requests from localhost / 127.0.0.1 / file:// will be blocked by the browser
 * (TypeError "Failed to fetch"). The wrapper detects this and returns
 * { ok: false, error: 'cors' } so callers can fall back to local-mock auth.
 */
(function () {
  'use strict';

  const BASE     = 'https://app.heredita.net';
  const PLAY_URL = 'https://app.heredita.net/app/';

  // ---- helpers -----------------------------------------------------------
  function isLocalOrigin() {
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '' || location.protocol === 'file:';
  }

  function asForm(obj) {
    const fd = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => { if (v != null) fd.append(k, String(v)); });
    return fd;
  }

  // Build a normalized error from a fetch failure / non-2xx response.
  async function errorFromResponse(res) {
    let body = null;
    try { body = await res.json(); } catch (_) {}
    const msg = body && (body.detail || body.message);
    const detailStr = Array.isArray(msg)
      ? msg.map(d => d.msg || JSON.stringify(d)).join('; ')
      : (typeof msg === 'string' ? msg : null);

    let code = 'unknown';
    switch (res.status) {
      case 401: code = 'unauthorized'; break;
      case 403: code = 'forbidden';    break;
      case 404: code = 'notfound';     break;
      case 409: code = 'taken';        break;
      case 422: code = 'validation';   break;
      case 429: code = 'ratelimited';  break;
      default:  code = res.status >= 500 ? 'server' : 'unknown';
    }

    return {
      ok: false,
      error: code,
      status: res.status,
      message: detailStr || friendlyMessage(code)
    };
  }

  function friendlyMessage(code) {
    switch (code) {
      case 'network':      return 'Could not reach Heredita servers.';
      case 'cors':         return 'Heredita API not reachable from this origin (local dev).';
      case 'ratelimited':  return 'Too many attempts — slow down a moment.';
      case 'unauthorized': return 'Wrong username or password.';
      case 'forbidden':    return 'Your account is not allowed to do that.';
      case 'notfound':     return 'No account with that name.';
      case 'taken':        return 'That username is already taken.';
      case 'validation':   return 'Some fields look wrong.';
      case 'server':       return 'Heredita servers had a hiccup. Try again.';
      default:             return 'Something went wrong.';
    }
  }

  function networkError(e) {
    // fetch only rejects on network/CORS failures. Both throw TypeError.
    const cors = isLocalOrigin();
    return {
      ok: false,
      error: cors ? 'cors' : 'network',
      status: 0,
      message: friendlyMessage(cors ? 'cors' : 'network'),
      cause: e && e.message
    };
  }

  // ---- API methods -------------------------------------------------------

  // POST /auth/users/new — query-string params, returns new user's integer id.
  async function register(username, password, email) {
    const qs = new URLSearchParams({ username, password });
    if (email) qs.set('email', email);
    let res;
    try {
      res = await fetch(`${BASE}/auth/users/new?${qs.toString()}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    const userId = await res.json();
    return { ok: true, userId };
  }

  // POST /auth/token — OAuth2 password grant. Form-urlencoded body.
  async function login(username, password) {
    let res;
    try {
      res = await fetch(`${BASE}/auth/token`, {
        method: 'POST',
        headers: {
          'Accept':       'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: asForm({ grant_type: 'password', username, password })
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    const body = await res.json();
    if (!body || typeof body.access_token !== 'string') {
      return { ok: false, error: 'unknown', status: 200, message: 'Bad token response from server.' };
    }
    return { ok: true, token: body.access_token, tokenType: body.token_type || 'bearer' };
  }

  // GET /users/verify/id?username=&token=  → returns int id, or -1 if invalid.
  async function verifyTokenId(username, token) {
    let res;
    try {
      const qs = new URLSearchParams({ username, token });
      res = await fetch(`${BASE}/users/verify/id?${qs.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    const id = await res.json();
    if (typeof id !== 'number' || id < 0) {
      return { ok: false, error: 'unauthorized', status: 200, message: 'Session expired.' };
    }
    return { ok: true, userId: id };
  }

  // GET /users/me — requires bearer.
  async function getMe(token) {
    let res;
    try {
      res = await fetch(`${BASE}/users/me`, {
        method: 'GET',
        headers: {
          'Accept':        'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    const user = await res.json();
    return { ok: true, user };
  }

  // Expose
  window.HereditaAPI = {
    BASE, PLAY_URL,
    register, login, verifyTokenId, getMe,
    isLocalOrigin, friendlyMessage
  };
})();
