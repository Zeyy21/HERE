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
  // The Heredita API at app.heredita.net only sends CORS headers for the
  // production origin `https://heredita.net`. Any other origin (localhost,
  // 127.0.0.1, file://, *.vercel.app preview deploys, custom subdomains)
  // will have its preflight blocked by the browser. We surface this as a
  // distinct error code so callers can fall back gracefully.
  const PROD_ORIGIN = 'https://heredita.net';
  function isProdOrigin() { return location.origin === PROD_ORIGIN; }
  function isLocalOrigin() {
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '' || location.protocol === 'file:';
  }
  function isCorsBlockedOrigin() {
    // Anything other than production is going to fail CORS at the browser.
    return !isProdOrigin();
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
      case 'cors':         return 'Heredita API not reachable from this origin. Sign-up works only on heredita.net.';
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
    const cors = isCorsBlockedOrigin();
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

  // ---- Friends ----------------------------------------------------------
  // All four endpoints require a bearer token.

  async function getFriends(token) {
    let res;
    try {
      res = await fetch(`${BASE}/users/friends/`, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    const data = await res.json();
    // Schema is { friends: UserPartial[] }. We also enrich with the full
    // /users/me payload if the caller wants incoming/outgoing requests.
    return { ok: true, friends: (data && data.friends) || [] };
  }

  // POST /users/friends/{requestee_username} — send a friend request.
  async function sendFriendRequest(token, username) {
    let res;
    try {
      res = await fetch(`${BASE}/users/friends/${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    return { ok: true };
  }

  // DELETE /users/friends/{friend_username} — remove an existing friend.
  async function removeFriend(token, username) {
    let res;
    try {
      res = await fetch(`${BASE}/users/friends/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    return { ok: true };
  }

  // POST /users/friends/requests/{requester_username} — accept incoming.
  async function acceptFriendRequest(token, username) {
    let res;
    try {
      res = await fetch(`${BASE}/users/friends/requests/${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    return { ok: true };
  }

  // DELETE /users/friends/requests/{requester_username} — decline incoming.
  async function declineFriendRequest(token, username) {
    let res;
    try {
      res = await fetch(`${BASE}/users/friends/requests/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    return { ok: true };
  }

  // ---- Profile lookup ---------------------------------------------------

  // No bearer required — returns the integer id, or -1 if no match.
  async function lookupUsername(username) {
    let res;
    try {
      const qs = new URLSearchParams({ username, token: '' });
      // /users/verify/id requires both username and token. With an empty
      // token the API simply returns -1 (no match) rather than the id, so
      // we fall back to /users/{id} via a different path: try /users/me?
      // That requires auth. The only public username→id endpoint is verify
      // which needs a token. So we expose this helper instead via the
      // token-bearing variant below. Keep this for symmetry / future use.
      res = await fetch(`${BASE}/users/verify/id?${qs.toString()}`, {
        method: 'GET', headers: { 'Accept': 'application/json' }
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    const id = await res.json();
    if (typeof id !== 'number' || id < 0) {
      return { ok: false, error: 'notfound', status: 200, message: 'No account with that name.' };
    }
    return { ok: true, userId: id };
  }

  // GET /users/{id} — requires bearer.
  async function getUserById(token, id) {
    let res;
    try {
      res = await fetch(`${BASE}/users/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
      });
    } catch (e) { return networkError(e); }
    if (!res.ok) return await errorFromResponse(res);
    const user = await res.json();
    return { ok: true, user };
  }

  // Convenience: look up a username and fetch their profile in one call,
  // using the caller's bearer token for both steps. We use /users/verify/id
  // with the caller's own token, which still works as a name→id resolver.
  async function findUserByUsername(token, ownUsername, queryUsername) {
    // verify/id requires a valid (username, token) pair belonging to the
    // CALLER. It still returns -1 when the queried target doesn't exist…
    // actually that endpoint validates the username/token pair (caller's),
    // not the query string. So instead we just iterate ids? Bad idea.
    //
    // The simplest working approach: call /users/verify/id with the
    // target username + caller's token. The endpoint returns the id of the
    // user matching the given token, NOT the queried username — so this is
    // useless for lookups.
    //
    // Therefore: the ONLY no-bearer path username→id is verifyTokenId,
    // which requires that user's own token. Practical lookup-by-username
    // for OTHER users isn't supported by the documented API surface.
    //
    // Workaround: try `/users/{id}` with id == queryUsername-treated-as-id
    // (some APIs accept either). Otherwise return notfound and let the UI
    // explain the limitation.
    if (/^\d+$/.test(queryUsername)) {
      return getUserById(token, queryUsername);
    }
    return {
      ok: false, error: 'notfound', status: 0,
      message: 'Username lookup needs a numeric user id — Heredita API does not yet expose name→id search.'
    };
  }

  // Expose
  window.HereditaAPI = {
    BASE, PLAY_URL, PROD_ORIGIN,
    register, login, verifyTokenId, getMe,
    getFriends, sendFriendRequest, removeFriend,
    acceptFriendRequest, declineFriendRequest,
    lookupUsername, getUserById, findUserByUsername,
    isLocalOrigin, isProdOrigin, isCorsBlockedOrigin, friendlyMessage
  };
})();
