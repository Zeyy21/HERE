/* Heredita - shared client JS (no backend) */
(function () {
  'use strict';

  // External app URL — the real game lives here.
  // Mirror of HereditaAPI.PLAY_URL so app.js works even if api.js isn't loaded yet.
  const PLAY_URL = (window.HereditaAPI && window.HereditaAPI.PLAY_URL) || 'https://app.heredita.net/app/';

  // Build a play URL with a #token handoff so the game can auto-login.
  // Uses URL hash (not query string) so the token never appears in Referer
  // headers, server access logs, or browser history.
  function buildPlayURL() {
    const s = getSession();
    if (!s || !s.token || s.guest) return PLAY_URL;
    const hash = new URLSearchParams({
      token: s.token,
      username: s.username || ''
    }).toString();
    return PLAY_URL + '#' + hash;
  }

  // ---------- helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const SESSION_KEY = 'heredita.session';
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }
  function setSession(s) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    syncAuthCookie(s);
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    syncAuthCookie(null);
  }

  // ---- Cross-subdomain auth handoff via shared cookie.
  // heredita.net and app.heredita.net share the parent domain `.heredita.net`,
  // so a cookie scoped there is automatically sent on every request to both.
  // The game app can read document.cookie on load and skip its own sign-in.
  //
  // Cookie shape: heredita_auth = base64({ token, username, ts })
  //   - Not HttpOnly (we set it from JS; can't be HttpOnly otherwise)
  //   - Secure + SameSite=Lax (only sent on https + same-site navigations)
  //   - 7-day expiry
  function syncAuthCookie(session) {
    // Only set cookies in browser contexts on the production domain. On
    // localhost / vercel previews, document.cookie with Domain= is ignored.
    const onHeredita = (location.hostname === 'heredita.net' || location.hostname.endsWith('.heredita.net'));
    if (!onHeredita) return;
    const isSignedIn = session && session.token && session.username && !session.guest;
    if (isSignedIn) {
      const payload = btoa(JSON.stringify({
        token: session.token,
        username: session.username,
        ts: Date.now()
      }));
      // 7 days
      const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `heredita_auth=${payload}; Domain=.heredita.net; Path=/; Expires=${exp}; Secure; SameSite=Lax`;
    } else {
      // Expire the cookie immediately.
      document.cookie = `heredita_auth=; Domain=.heredita.net; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax`;
    }
  }

  // Run once on load to ensure the cookie matches the stored session
  // (handles the case where a user signs in on device A, then opens device B
  // and we want the game to also see them as signed in).
  function syncCookieOnLoad() {
    syncAuthCookie(getSession());
  }

  // ---- Sign-in detection: a session counts as "signed in" if it has a
  // game-API token + username and isn't flagged as guest. ----
  function isSignedIn() {
    const s = getSession();
    return !!(s && s.token && !s.guest && s.username);
  }

  // ---- Tier helpers ----
  const TIER_LABEL = { guest: 'Guest', regular: 'Regular', emperor: 'Emperor' };
  // Emperor is paid — locked until paid release ships.
  const PAID_TIERS = ['emperor'];
  function isTierPaid(tier) { return PAID_TIERS.includes(tier); }
  function getTier() {
    const s = getSession();
    if (!s) return 'guest';
    return s.tier || (s.guest ? 'guest' : 'regular');
  }
  // Why a tier change is allowed / blocked. Used by UI to render locks + messaging.
  // Returns { ok: true } or { ok: false, reason: 'paid'|'needs-signup'|'needs-signout' }
  function canSwitchTier(targetTier) {
    const current = getTier();
    if (targetTier === current) return { ok: true };
    if (isTierPaid(targetTier)) return { ok: false, reason: 'paid' };
    // Account-type gate: tier matches session origin.
    // - Guest session → can only be Guest. Promote by signing up.
    // - Regular session (signed in) → can only be Regular. Demote by signing out.
    if (current === 'guest' && targetTier === 'regular')  return { ok: false, reason: 'needs-signup' };
    if (current === 'regular' && targetTier === 'guest')  return { ok: false, reason: 'needs-signout' };
    return { ok: true };
  }

  // Returns true if applied. Otherwise opens an explainer modal and returns false.
  function setTier(tier) {
    const verdict = canSwitchTier(tier);
    if (!verdict.ok) {
      if (verdict.reason === 'paid') {
        openPaywall({
          title: 'Emperor — Locked',
          body: 'Emperor opens with the paid release. We\'ll notify you the moment it ships.',
          primaryLabel: '🔔 Notify me'
        });
      } else if (verdict.reason === 'needs-signup') {
        openTierGate({
          title: 'Regular needs an account',
          body: 'You\'re browsing as a Guest. Sign up to become a Regular member — that\'s how you unlock monthly Heredita Coins and the free seasonal hat.',
          primaryLabel: 'Sign up',
          primaryHref: 'index.html'
        });
      } else if (verdict.reason === 'needs-signout') {
        openTierGate({
          title: 'Signed in as Regular',
          body: 'To browse as a Guest you need to sign out. Your saved profile stays safe — sign back in any time.',
          primaryLabel: 'Sign out',
          primaryAction: () => {
            clearSession();
            localStorage.removeItem('heredita.avatar');
            location.href = 'index.html';
          }
        });
      }
      return false;
    }
    const s = getSession() || { username: 'Guest' + Math.floor(Math.random() * 9000 + 1000), guest: true, coins: 0 };
    s.tier = tier;
    s.guest = (tier === 'guest');
    setSession(s);
    return true;
  }

  // Tier gate modal — same chalk-card shell as openPaywall, but with a key icon.
  function openTierGate({ title, body, primaryLabel = 'OK', primaryHref, primaryAction } = {}) {
    const modal = document.createElement('div');
    modal.className = 'lightbox';
    const primaryAttr = primaryHref ? `data-tier-go="${primaryHref}"` : 'data-tier-go="action"';
    modal.innerHTML = `
      <button class="close" aria-label="Close">✕</button>
      <div class="chalk-card" style="max-width: 460px; padding: 32px 28px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; pointer-events: auto; cursor: default;">
        <svg viewBox="0 0 200 200" aria-hidden="true" style="width: 96px; height: auto; filter: drop-shadow(0 8px 18px rgba(0,0,0,0.5));">
          <circle cx="78" cy="100" r="32" fill="none" stroke="rgba(244,241,230,0.92)" stroke-width="12"/>
          <rect x="100" y="92" width="78" height="16" rx="2" fill="rgba(244,241,230,0.92)"/>
          <rect x="150" y="108" width="10" height="20" fill="rgba(244,241,230,0.92)"/>
          <rect x="170" y="108" width="10" height="14" fill="rgba(244,241,230,0.92)"/>
          <circle cx="78" cy="100" r="8" fill="#0f2018"/>
        </svg>
        <h2 style="font-family:'Caveat',cursive; margin:0; font-size:2rem;">${title || 'Locked'}</h2>
        <p style="margin:0; color: var(--chalk-soft); max-width: 38ch;">${body || ''}</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin-top:6px;">
          <button class="btn btn-primary" ${primaryAttr}>${primaryLabel}</button>
          <button class="btn" data-tier-close>Cancel</button>
        </div>
      </div>
    `;
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('close') || e.target.hasAttribute('data-tier-close')) close();
      if (e.target.hasAttribute('data-tier-go')) {
        const go = e.target.getAttribute('data-tier-go');
        if (go === 'action' && typeof primaryAction === 'function') { primaryAction(); }
        else if (go && go !== 'action') { window.location.href = go; }
      }
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    });
    document.body.appendChild(modal);
  }

  // ---- Shared paywall modal ----
  function openPaywall({ title, body, primaryLabel = 'Notify me' } = {}) {
    // Reuse the existing lightbox shell (.lightbox)
    const modal = document.createElement('div');
    modal.className = 'lightbox';
    modal.innerHTML = `
      <button class="close" aria-label="Close">✕</button>
      <div class="chalk-card" style="max-width: 460px; padding: 32px 28px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; pointer-events: auto; cursor: default;">
        <svg viewBox="0 0 200 220" aria-hidden="true" style="width: 110px; height: auto; filter: drop-shadow(0 8px 18px rgba(0,0,0,0.5));">
          <path d="M60,100 V70 a40,40 0 0 1 80,0 V100" fill="none" stroke="rgba(244,241,230,0.92)" stroke-width="14" stroke-linecap="round"/>
          <rect x="38" y="100" width="124" height="100" rx="14" fill="rgba(244,241,230,0.92)" stroke="#0f2018" stroke-width="4"/>
          <circle cx="100" cy="142" r="11" fill="#0f2018"/>
          <rect x="95" y="148" width="10" height="28" rx="2" fill="#0f2018"/>
        </svg>
        <h2 style="font-family:'Caveat',cursive; margin:0; font-size:2rem;">${title || 'Locked'}</h2>
        <p style="margin:0; color: var(--chalk-soft); max-width: 38ch;">${body || 'This feature is locked until the paid release.'}</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin-top:6px;">
          <button class="btn btn-primary" data-paywall-notify>${primaryLabel}</button>
          <button class="btn" data-paywall-close>Close</button>
        </div>
      </div>
    `;
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('close') || e.target.hasAttribute('data-paywall-close')) close();
      if (e.target.hasAttribute('data-paywall-notify')) {
        toast('✓ We\'ll let you know when it opens.');
        close();
      }
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    });
    document.body.appendChild(modal);
  }

  // expose for other modules (avatar.js, settings page, membership, friends, chat)
  window.HereditaSession = {
    get: getSession, set: setSession, clear: clearSession,
    getTier, setTier, canSwitchTier, isTierPaid, isSignedIn,
    openPaywall, openTierGate, TIER_LABEL,
    syncAuthCookie
  };
  // Back-compat shim: anything still calling `isTierLocked` now means "paid".
  window.HereditaSession.isTierLocked = isTierPaid;

  // ---- Free-hat promo: Regular tier gets a tophat until 2026-08-28 ----
  const FREE_HAT_DEADLINE = new Date('2026-08-28T23:59:59');
  function applyFreeHatIfEligible() {
    const tier = getTier();
    if (tier !== 'regular') return;
    if (new Date() > FREE_HAT_DEADLINE) return;
    const s = getSession();
    if (!s || s.freeHatClaimed) return;
    try {
      const av = JSON.parse(localStorage.getItem('heredita.avatar') || 'null');
      const next = Object.assign({ country: 'poland', hat: 'tophat', eyes: 'default', mouth: 'smile', prop: 'none' }, av || {}, { hat: 'tophat' });
      localStorage.setItem('heredita.avatar', JSON.stringify(next));
      s.freeHatClaimed = true;
      setSession(s);
      setTimeout(() => toast('🎩 Free top hat unlocked — enjoy until Aug 28!'), 400);
    } catch (_) {}
  }

  function toast(msg, ms = 2200) {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  function openLightbox(src, alt = 'Heredita screenshot') {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `
      <button class="close" aria-label="Close">✕</button>
      <img alt="${alt}" src="${src}" />
    `;
    const close = () => lb.remove();
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('close')) close(); });
    document.addEventListener('keydown', function onKey(e){
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    });
    document.body.appendChild(lb);
  }

  // ---------- floating chalk dust ----------
  function spawnChalkDust(count = 22) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.createElement('div');
    layer.className = 'chalk-dust';
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      const size = 2 + Math.random() * 4;
      const dur  = 12 + Math.random() * 22;
      const delay = -Math.random() * dur;
      s.style.left   = Math.random() * 100 + 'vw';
      s.style.width  = size + 'px';
      s.style.height = size + 'px';
      s.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      s.style.animationDuration = dur + 's';
      s.style.animationDelay    = delay + 's';
      s.style.opacity = (0.10 + Math.random() * 0.35).toFixed(2);
      layer.appendChild(s);
    }
    document.body.appendChild(layer);
  }

  // ---------- reveal on scroll ----------
  let _revealIO = null;
  function wireReveal() {
    const els = $$('.reveal:not(.in)');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('in'));
      return;
    }
    if (!_revealIO) {
      _revealIO = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            _revealIO.unobserve(en.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    els.forEach(e => _revealIO.observe(e));
  }
  // Public hook so dynamically-injected cards can be picked up after fetch.
  window.HereditaApp = Object.assign(window.HereditaApp || {}, { rewireReveal: wireReveal });

  // ---------- top nav (mobile) ----------
  function wireNavToggle() {
    const bar = $('.topbar');
    const btn = $('.nav-toggle');
    if (bar && btn) {
      btn.addEventListener('click', () => bar.classList.toggle('mobile-open'));
    }
    renderUserChip();
  }

  function renderUserChip() {
    const s = getSession();
    const tier = getTier();
    const name = (s && s.username) ? s.username : 'Guest';

    // legacy initial avatar
    const av = $('.user-chip .avatar');
    if (av && !av.classList.contains('countryball')) av.textContent = name.charAt(0).toUpperCase();

    // new structure: .user-block with name + tier-badge
    $$('.user-chip .name').forEach(el => { el.textContent = name; });
    $$('.user-chip .tier-badge').forEach(el => {
      el.setAttribute('data-tier', tier);
      el.setAttribute('href', 'membership.html');
      el.setAttribute('aria-label', 'Membership tier: ' + TIER_LABEL[tier]);
      el.innerHTML = (tier === 'emperor' ? '<span class="crown" aria-hidden="true"></span>' : '') + TIER_LABEL[tier];
    });
  }
  window.HereditaSession.renderUserChip = renderUserChip;

  // ---------- Play CTAs ----------
  // Anything tagged data-play sends the user to the real app, with a #token
  // handoff if they're signed in (so the game can auto-login).
  function wirePlayCtas() {
    $$('[data-play]').forEach(el => {
      // Always set href freshly on click — token may have changed since page load.
      function refreshHref() {
        const url = buildPlayURL();
        if (el.tagName === 'A') {
          el.setAttribute('href', url);
          el.setAttribute('rel', 'noopener');
        }
        return url;
      }
      refreshHref();

      el.addEventListener('click', (e) => {
        const url = refreshHref();
        if (el.tagName !== 'A') e.preventDefault();

        // Brief loading flourish on the Play page only
        const ov = $('#loadingOverlay');
        if (ov) {
          ov.classList.add('show');
          const status = $('#loadingStatus');
          const s = getSession();
          const steps = (s && s.token && !s.guest)
            ? [
                'Sharpening chalk…',
                'Verifying your token…',
                'Painting Europe…',
                'Handing you the brush…'
              ]
            : [
                'Sharpening chalk…',
                'Loading 1936 borders…',
                'Rolling the dice…',
                'Painting Europe…'
              ];
          let i = 0;
          if (status) status.textContent = steps[0];
          const ticker = setInterval(() => {
            i++;
            if (status) status.textContent = steps[i % steps.length];
          }, 600);
          setTimeout(() => {
            clearInterval(ticker);
            window.location.href = url;
          }, 1400);
          // Prevent default A navigation since we'll redirect ourselves after the delay
          if (el.tagName === 'A') e.preventDefault();
        } else if (el.tagName !== 'A') {
          window.location.href = url;
        }
        // If it's a plain <a> with no loading overlay, the browser's default
        // navigation already uses the freshly-set href.
      });
    });
  }

  // ---------- auth page ----------
  function wireAuthPage() {
    const wrap = $('.auth-wrap');
    if (!wrap) return;

    // tab toggle
    const tabs   = $$('.auth-tabs button');
    const panels = $$('.auth-panel');
    tabs.forEach(t => t.addEventListener('click', () => {
      const id = t.dataset.tab;
      tabs.forEach(x => {
        const active = x === t;
        x.classList.toggle('active', active);
        x.setAttribute('aria-selected', String(active));
      });
      panels.forEach(p => p.hidden = (p.dataset.panel !== id));
    }));

    // T&C gating
    const tos = $('#tosCheck');
    const gated = $$('[data-requires-tos]');
    function syncGate() {
      const ok = tos && tos.checked;
      gated.forEach(b => {
        b.disabled = !ok;
        b.setAttribute('aria-disabled', String(!ok));
      });
    }
    if (tos) { tos.addEventListener('change', syncGate); syncGate(); }

    // Auth backend = Heredita game API at app.heredita.net.
    // CORS only allows https://heredita.net (which we are on now), so this
    // works end-to-end including Friends and Search.
    const API = window.HereditaAPI;

    async function persistAndGo(username, token) {
      // Best-effort: fetch rank from /users/me so the topbar can show it.
      let rank = 'player', userId = null;
      try {
        const me = await API.getMe(token);
        if (me.ok) { rank = me.user.rank || 'player'; userId = me.user.id; }
      } catch (_) {}
      setSession({
        uid: userId,
        username,
        token,
        rank,
        guest: false,
        tier: 'regular',
        coins: 0
      });
      renderUserChip();
      toast('Welcome, ' + username + '!');
      setTimeout(() => location.href = 'home.html', 500);
    }

    function setBusy(btn, busy, busyText) {
      if (!btn) return;
      if (busy) {
        btn._origLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = busyText || 'Working…';
      } else {
        btn.disabled = false;
        if (btn._origLabel) btn.textContent = btn._origLabel;
      }
    }

    // ---- sign up ----
    // Calls POST /auth/users/new on the game API, then POST /auth/token to
    // get a bearer for the new account, then routes to home.
    const signupForm = $('#signupForm');
    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = signupForm.querySelector('button[type="submit"]');
        try {
          if (!tos.checked) { toast('Please agree to the Terms first.'); return; }
          const fd = new FormData(signupForm);
          const username = (fd.get('username') || '').toString().trim();
          const dob      = (fd.get('dob') || '').toString();
          const pw       = (fd.get('password') || '').toString();
          const pw2      = (fd.get('confirm') || '').toString();
          if (username.length < 3)               return toast('Username must be 3+ characters.');
          if (!/^[A-Za-z0-9_.\-]+$/.test(username)) return toast('Username: letters, numbers, _ . - only.');
          if (!dob)                              return toast('Please enter your date of birth.');
          if (pw.length < 6)                     return toast('Password must be 6+ characters.');
          if (pw !== pw2)                        return toast('Passwords do not match.');

          setBusy(btn, true, 'Creating account…');
          console.log('[heredita][auth] register', { username });

          const reg = await API.register(username, pw);
          console.log('[heredita][auth] register result', reg);
          if (!reg.ok) {
            if (reg.error === 'taken') {
              toast('Username already taken — try signing in instead.');
              return;
            }
            if (reg.error === 'ratelimited') {
              toast('Too many sign-ups — wait a minute and try again.');
              return;
            }
            toast(reg.message || 'Could not create account.');
            return;
          }

          // Auto-login immediately with the credentials we just used.
          const lg = await API.login(username, pw);
          console.log('[heredita][auth] auto-login result', lg);
          if (!lg.ok) {
            toast('Account created — please sign in: ' + (lg.message || ''));
            const tab = document.querySelector('[data-tab="signin"]');
            if (tab) tab.click();
            const si = document.getElementById('si-username');
            if (si) si.value = username;
            return;
          }
          await persistAndGo(username, lg.token);
        } catch (err) {
          console.error('[heredita][auth] signup handler threw', err);
          toast('Something went wrong. Try again.');
        } finally {
          setBusy(btn, false);
        }
      });
    }

    // ---- sign in ----
    const signinForm = $('#signinForm');
    if (signinForm) {
      signinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = signinForm.querySelector('button[type="submit"]');
        try {
          const fd = new FormData(signinForm);
          const username = (fd.get('username') || '').toString().trim();
          const pw       = (fd.get('password') || '').toString();
          if (!username || !pw) return toast('Enter your credentials.');

          setBusy(btn, true, 'Signing in…');
          console.log('[heredita][auth] login', { username });
          const lg = await API.login(username, pw);
          console.log('[heredita][auth] login result', lg);
          if (!lg.ok) {
            if (lg.error === 'unauthorized') {
              toast('Wrong username or password.');
            }
            if (lg.error === 'ratelimited') {
              toast('Too many sign-in attempts — wait a minute.');
              return;
            }
            toast(lg.message || 'Could not sign in.');
            return;
          }
          await persistAndGo(username, lg.token);
        } catch (err) {
          console.error('[heredita][auth] signin handler threw', err);
          toast('Something went wrong. Try again.');
        } finally {
          setBusy(btn, false);
        }
      });
    }

    // ---- guest ----
    const guestBtn = $('#guestBtn');
    if (guestBtn) {
      guestBtn.addEventListener('click', () => {
        if (!tos.checked) { toast('Please agree to the Terms first.'); return; }
        setSession({
          username: 'Guest' + Math.floor(Math.random() * 9000 + 1000),
          guest: true,
          tier: 'guest',
          coins: 0
        });
        location.href = 'home.html';
      });
    }
  }

  // ---------- home page ----------
  function wireHomePage() {
    if (!$('.home-page')) return;
    const s = getSession() || { username: 'Guest', guest: true, coins: 0 };
    const nm = $('#welcomeName');
    if (nm) nm.textContent = s.username;
    const out = $('#logoutBtn');
    if (out) out.addEventListener('click', (e) => {
      e.preventDefault();
      clearSession();
      location.href = 'index.html';
    });
  }

  // ---------- preview showcase (carousel + thumbs + autoplay) ----------
  function wirePreviewShowcase() {
    const root = $('#previewShowcase');
    if (!root) return;

    const slides = $$('.slide', root);
    const thumbs = $$('.thumb', root);
    const captionEl = $('.caption', root);
    const subEl     = $('.sub', root);
    const bar       = $('.preview-progress .bar', root);
    const prev      = $('.stage-nav.prev', root);
    const next      = $('.stage-nav.next', root);

    let idx = 0;
    let timer = null;
    let progress = 0;
    const PERIOD = 5500;

    function applyMeta(i) {
      const t = thumbs[i];
      if (!t) return;
      if (captionEl) captionEl.textContent = t.dataset.caption || '';
      if (subEl)     subEl.textContent     = t.dataset.sub     || '';
    }

    function goto(i, { resetTimer = true } = {}) {
      idx = (i + slides.length) % slides.length;
      slides.forEach((s, n) => s.classList.toggle('active', n === idx));
      thumbs.forEach((t, n) => t.classList.toggle('active', n === idx));
      applyMeta(idx);
      progress = 0;
      if (bar) bar.style.width = '0%';
      if (resetTimer) startTimer();
    }

    function tick() {
      progress += 80;
      if (bar) bar.style.width = Math.min(100, (progress / PERIOD) * 100) + '%';
      if (progress >= PERIOD) goto(idx + 1, { resetTimer: false });
    }

    function startTimer() {
      stopTimer();
      timer = setInterval(tick, 80);
    }
    function stopTimer() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    thumbs.forEach((t, i) => {
      t.addEventListener('click', () => goto(i));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goto(i); }
      });
      t.setAttribute('tabindex', '0');
    });
    if (prev) prev.addEventListener('click', () => goto(idx - 1));
    if (next) next.addEventListener('click', () => goto(idx + 1));

    // click stage = lightbox
    const stage = $('.preview-stage', root);
    if (stage) {
      stage.addEventListener('click', (e) => {
        if (e.target.closest('.stage-nav')) return;
        const active = $('.slide.active', stage);
        const url = active && active.dataset.full;
        if (url) openLightbox(url, captionEl ? captionEl.textContent : '');
      });
      stage.addEventListener('mouseenter', stopTimer);
      stage.addEventListener('mouseleave', startTimer);
    }

    // keyboard nav
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft')  goto(idx - 1);
      if (e.key === 'ArrowRight') goto(idx + 1);
    });

    // pause if hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopTimer(); else startTimer();
    });

    goto(0);
  }

  // ---- Sanitize any previously-stored paid tier ----
  // (e.g. someone set Emperor in localStorage before paywall existed)
  function sanitizeStoredTier() {
    const s = getSession();
    if (s && isTierPaid(s.tier)) {
      s.tier = s.guest ? 'guest' : 'regular';
      setSession(s);
    }
  }

  // ---- Verify stored game-API token in the background.
  // Fire-and-forget on every page load: if the token is invalid (expired,
  // revoked), demote the session to guest and re-render the chip.
  async function verifyStoredToken() {
    const API = window.HereditaAPI;
    if (!API) return;
    const s = getSession();
    if (!s || !s.token || !s.username || s.guest) return;
    try {
      const v = await API.verifyTokenId(s.username, s.token);
      if (v.ok) return; // still valid
      if (v.error === 'cors' || v.error === 'network') return; // offline — don't punish
      // Token's gone — clean up.
      clearSession();
      renderUserChip();
      toast('Your session expired — please sign in again.');
    } catch (_) {}
  }

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', () => {
    sanitizeStoredTier();
    applyFreeHatIfEligible();
    // Mirror local session into the shared .heredita.net cookie so the
    // game app on app.heredita.net auto-recognizes the signed-in user.
    syncCookieOnLoad();
    wireNavToggle();
    // Verify any stored game-API token in the background (non-blocking).
    verifyStoredToken();
    wirePlayCtas();
    wireAuthPage();
    wireHomePage();
    wirePreviewShowcase();
    wireReveal();
    if (document.body.classList.contains('with-dust')) spawnChalkDust();
  });
})();
