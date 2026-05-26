/* Heredita chat — Firebase Realtime Database edition.
 *
 * - Reads config from window.HEREDITA_CHAT_CONFIG
 * - Public rooms: open to everyone (anonymous Firebase auth used so the
 *   per-room write rule passes). Identity is your Heredita username, or a
 *   generated guest name.
 * - Direct messages (DMs): only between two users, identified by a room
 *   key of `dm__{a}__{b}` where a/b are the two lowercased usernames
 *   sorted alphabetically. Both parties see the same history.
 * - Messages are { from, text, ts } where ts = Firebase ServerValue.TIMESTAMP.
 * - Last 200 messages kept locally; older ones scroll off.
 */
(function () {
  'use strict';

  const cfg = window.HEREDITA_CHAT_CONFIG || {};
  const ROOMS = window.HEREDITA_CHAT_ROOMS || [];
  const S = window.HereditaSession;

  // ---- DOM helpers
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function toast(msg, ms = 2400) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    // Wait for Supabase to hydrate so we don't flash the "sign in" gate to
    // an already-signed-in user.
    if (window.HereditaAuth && window.HereditaAuth.ready) {
      try { await window.HereditaAuth.ready(); } catch (_) {}
    }
    const session = S && S.get();

    // ---- Chat is for signed-in members only. Guests + signed-out users
    // see a clear gate explaining why.
    if (!S.isSignedIn()) {
      renderSignInGate(!!(session && session.guest));
      return;
    }
    const username = session.username;

    // ---- Config sanity
    if (!cfg || !cfg.apiKey || cfg.apiKey === 'PASTE_FROM_FIREBASE_HERE' || !cfg.databaseURL) {
      renderSetupNotice();
      return;
    }

    // ---- Load Firebase ESM SDK from CDN. Done at runtime so the page works
    // without any build step. We only need three modules.
    let fb, dbm, authm;
    try {
      fb    = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
      dbm   = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js');
      authm = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
    } catch (e) {
      console.error('[chat] firebase SDK load failed', e);
      renderError('Could not load the chat SDK. Check your network and try again.');
      return;
    }

    let app, db, auth;
    try {
      app  = fb.initializeApp(cfg);
      db   = dbm.getDatabase(app);
      auth = authm.getAuth(app);
    } catch (e) {
      console.error('[chat] firebase init failed', e);
      renderError('Chat backend rejected the configuration. Double-check js/chat-config.js.');
      return;
    }

    try {
      await authm.signInAnonymously(auth);
    } catch (e) {
      console.error('[chat] anonymous auth failed', e);
      renderError('Anonymous sign-in is disabled. Enable it in Firebase Console → Authentication.');
      return;
    }

    mountUI({ db, dbm, username, session });
  }

  // ---- Sign-in gate shown to guests and signed-out users
  function renderSignInGate(isGuest) {
    const root = document.getElementById('chatRoot');
    root.innerHTML = `
      <section class="chalk-card reveal" style="padding: 32px 24px; text-align: center; max-width: 560px; margin: 18px auto;">
        <h2 class="tilt-r" style="margin-top: 0;">Sign in to chat</h2>
        <p class="muted" style="max-width: 46ch; margin: 0 auto 16px;">
          ${isGuest
            ? "Guest sessions can't post in chat. Create a free account to join the conversation."
            : "Chat is for signed-in Heredita members. Make a free account or sign in to join."}
        </p>
        <div class="row" style="justify-content: center; gap: 10px;">
          <a class="btn btn-primary" href="index.html">Sign in or sign up</a>
          <a class="btn btn-ghost" href="home.html">Back to home</a>
        </div>
      </section>`;
  }

  // ---- Setup screen shown when config is still the placeholder
  function renderSetupNotice() {
    const root = document.getElementById('chatRoot');
    root.innerHTML = `
      <section class="chalk-card reveal" style="padding: 28px; text-align: center;">
        <h2 class="tilt-r" style="margin-top: 0;">Chat not yet configured</h2>
        <p class="muted" style="max-width: 60ch; margin: 0 auto 12px;">
          The chat backend uses <strong>Firebase Realtime Database</strong> (free tier).
          Set it up in ~5 minutes — instructions are inside
          <code style="color: var(--accent-soft);">js/chat-config.js</code>.
        </p>
        <p class="muted" style="font-size: .9rem;">
          Once you paste your Firebase config and push, this page becomes a live chat.
        </p>
      </section>`;
  }

  function renderError(msg) {
    const root = document.getElementById('chatRoot');
    root.innerHTML = `
      <section class="chalk-card reveal" style="padding: 28px; text-align: center;">
        <h2 class="tilt-r" style="margin-top: 0;">Chat unavailable</h2>
        <p class="muted">${escapeHtml(msg)}</p>
      </section>`;
  }

  // ---- DMs: list of usernames we've started a conversation with, persisted
  // locally so the sidebar shows them next time you visit.
  const DM_KEY = 'heredita.chat.dms';
  function loadDmList() {
    try { return JSON.parse(localStorage.getItem(DM_KEY) || '[]'); } catch { return []; }
  }
  function saveDmList(arr) { localStorage.setItem(DM_KEY, JSON.stringify(arr)); }
  function dmRoomKey(a, b) {
    const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
    return `dm__${x}__${y}`;
  }

  function mountUI({ db, dbm, username, session }) {
    const root = document.getElementById('chatRoot');
    root.innerHTML = `
      <div class="section-title reveal">
        <h1 class="tilt-l">Community Chat</h1>
        <span class="muted">real-time · signed in as <strong style="color: var(--accent-soft);">${escapeHtml(username)}</strong></span>
      </div>
      <div class="chat-layout">
        <aside class="chalk-card chat-sidebar">
          <h3 style="font-family:'Caveat',cursive; margin: 0 0 8px;">Rooms</h3>
          <ul class="chat-room-list" id="roomList"></ul>

          <h3 style="font-family:'Caveat',cursive; margin: 14px 0 6px;">Direct messages</h3>
          <ul class="chat-room-list" id="dmList"></ul>
          <form id="newDmForm" class="chat-new-dm" autocomplete="off">
            <input id="newDmInput" type="text" minlength="3" maxlength="32"
                   placeholder="Start DM with username…" required />
            <button class="btn btn-ghost" type="submit" title="Start DM">+</button>
          </form>
        </aside>

        <section class="chalk-card chat-main" aria-live="polite">
          <header class="chat-header">
            <div>
              <h2 id="chatTitle" style="font-family:'Caveat',cursive; margin: 0;">Select a room</h2>
              <p id="chatBlurb" class="muted" style="margin: 0; font-size: .9rem;"></p>
            </div>
            <div class="chat-me muted">You are <strong style="color: var(--accent-soft);">${escapeHtml(username)}</strong></div>
          </header>

          <div id="chatMessages" class="chat-messages"></div>

          <form id="chatComposer" class="chat-composer" autocomplete="off">
            <input id="chatInput" type="text" maxlength="800"
                   placeholder="Pick a room or DM first…" disabled />
            <button class="btn btn-primary" type="submit" disabled>Send</button>
          </form>
        </section>
      </div>
    `;

    // ---- Render the room + DM lists
    const roomListEl = document.getElementById('roomList');
    roomListEl.innerHTML = ROOMS.map(r => `
      <li><button class="chat-room-btn" data-room="${r.id}" data-kind="room"
                  data-name="${escapeHtml(r.name)}" data-blurb="${escapeHtml(r.blurb)}">
        <span class="dot" aria-hidden="true"></span>
        <span class="rname">${escapeHtml(r.name)}</span>
      </button></li>
    `).join('');

    const dmListEl = document.getElementById('dmList');
    function renderDmList() {
      const list = loadDmList();
      if (!list.length) {
        dmListEl.innerHTML = `<li class="muted" style="font-size: .85rem; padding: 4px 8px;">No DMs yet.</li>`;
        return;
      }
      dmListEl.innerHTML = list.map(other => `
        <li><button class="chat-room-btn" data-room="${dmRoomKey(username, other)}" data-kind="dm"
                    data-name="${escapeHtml('@ ' + other)}" data-blurb="Direct message with ${escapeHtml(other)}">
          <span class="dot" aria-hidden="true"></span>
          <span class="rname">@ ${escapeHtml(other)}</span>
        </button></li>
      `).join('');
    }
    renderDmList();

    // ---- Current room subscription bookkeeping
    let unsub = null;
    let currentRoom = null;

    function joinRoom(roomId, name, blurb) {
      // Tear down the previous listener.
      if (unsub) { try { unsub(); } catch (_) {} unsub = null; }

      currentRoom = roomId;
      document.getElementById('chatTitle').textContent = name;
      document.getElementById('chatBlurb').textContent = blurb || '';
      const input = document.getElementById('chatInput');
      const submit = document.querySelector('#chatComposer button[type="submit"]');
      input.disabled = false; submit.disabled = false;
      input.placeholder = 'Say something…';
      input.focus();

      // Highlight active button in the sidebar
      $$('.chat-room-btn').forEach(b => b.classList.toggle('active', b.dataset.room === roomId));

      const messagesEl = document.getElementById('chatMessages');
      messagesEl.innerHTML = `<p class="muted" style="text-align: center; padding: 20px;">Loading messages…</p>`;

      // Subscribe to the last 100 messages, ordered chronologically.
      const q = dbm.query(
        dbm.ref(db, `rooms/${roomId}/messages`),
        dbm.orderByChild('ts'),
        dbm.limitToLast(100)
      );
      const cb = dbm.onValue(q, (snap) => {
        const items = [];
        snap.forEach(child => items.push(Object.assign({ _id: child.key }, child.val())));
        renderMessages(items, username);
      }, (err) => {
        console.error('[chat] read error', err);
        messagesEl.innerHTML = `<p class="muted" style="text-align: center; padding: 20px;">Could not read messages: ${escapeHtml(err.message || err.code || 'unknown')}</p>`;
      });
      unsub = () => dbm.off(q, 'value', cb);
    }

    function renderMessages(items, me) {
      const messagesEl = document.getElementById('chatMessages');
      if (!items.length) {
        messagesEl.innerHTML = `<p class="muted" style="text-align: center; padding: 20px;">No messages yet. Be the first.</p>`;
        return;
      }
      const html = items.map(m => {
        const mine = (m.from || '') === me;
        const when = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `
          <div class="chat-msg ${mine ? 'me' : ''}">
            ${!mine ? `<div class="chat-from">${escapeHtml(m.from || '?')}</div>` : ''}
            <div class="chat-bubble">${escapeHtml(m.text || '')}</div>
            <div class="chat-time">${escapeHtml(when)}</div>
          </div>`;
      }).join('');
      messagesEl.innerHTML = html;
      // Auto-scroll to bottom.
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // ---- Sidebar clicks
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.chat-room-btn');
      if (!btn) return;
      joinRoom(btn.dataset.room, btn.dataset.name, btn.dataset.blurb || '');
    });

    // ---- New DM
    const newDmForm = document.getElementById('newDmForm');
    if (newDmForm) {
      newDmForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('newDmInput');
        const other = (input.value || '').trim();
        if (!other) return;
        if (other.toLowerCase() === username.toLowerCase()) {
          toast("You can't DM yourself.");
          return;
        }
        const list = loadDmList();
        if (!list.includes(other)) { list.push(other); saveDmList(list); }
        renderDmList();
        input.value = '';
        joinRoom(dmRoomKey(username, other), '@ ' + other, 'Direct message with ' + other);
      });
    }

    // ---- Composer
    const composer = document.getElementById('chatComposer');
    composer.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentRoom) return;
      const input = document.getElementById('chatInput');
      const text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      try {
        const refMsgs = dbm.ref(db, `rooms/${currentRoom}/messages`);
        await dbm.push(refMsgs, {
          from: username,
          text: text.slice(0, 800),
          ts: dbm.serverTimestamp()
        });
      } catch (err) {
        console.error('[chat] send failed', err);
        toast('Could not send: ' + (err.message || err.code || 'unknown'));
        input.value = text; // restore
      }
    });

    // Auto-join the first public room for a smooth landing.
    if (ROOMS.length) {
      const r = ROOMS[0];
      joinRoom(r.id, r.name, r.blurb);
    }
  }
})();
