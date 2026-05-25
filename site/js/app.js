/* Heredita - shared client JS (no backend) */
(function () {
  'use strict';

  // External app URL — the real game lives here.
  const PLAY_URL = 'https://app.heredita.net/app/';

  // ---------- helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const SESSION_KEY = 'heredita.session';
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }
  function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

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
  function wireReveal() {
    const els = $$('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(e => io.observe(e));
  }

  // ---------- top nav (mobile) ----------
  function wireNavToggle() {
    const bar = $('.topbar');
    const btn = $('.nav-toggle');
    if (bar && btn) {
      btn.addEventListener('click', () => bar.classList.toggle('mobile-open'));
    }
    const chip = $('.user-chip .name');
    const av   = $('.user-chip .avatar');
    if (chip || av) {
      const s = getSession();
      const name = (s && s.username) ? s.username : 'Guest';
      if (chip) chip.textContent = name;
      if (av) av.textContent = name.charAt(0).toUpperCase();
    }
  }

  // ---------- Play CTAs ----------
  // Anything tagged data-play sends the user to the real app.
  function wirePlayCtas() {
    $$('[data-play]').forEach(el => {
      if (el.tagName === 'A') {
        el.setAttribute('href', PLAY_URL);
        el.setAttribute('rel', 'noopener');
      }
      el.addEventListener('click', (e) => {
        if (el.tagName !== 'A') e.preventDefault();
        // brief loading flourish on the Play page only
        const ov = $('#loadingOverlay');
        if (ov) {
          ov.classList.add('show');
          const status = $('#loadingStatus');
          const steps = [
            'Sharpening chalk…',
            'Loading 1936 borders…',
            'Rolling the dice…',
            'Painting Europe…',
            'Handing you the brush…'
          ];
          let i = 0;
          if (status) status.textContent = steps[0];
          const ticker = setInterval(() => {
            i++;
            if (status) status.textContent = steps[i % steps.length];
          }, 600);
          setTimeout(() => {
            clearInterval(ticker);
            window.location.href = PLAY_URL;
          }, 1400);
        } else {
          window.location.href = PLAY_URL;
        }
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

    // sign up
    const signupForm = $('#signupForm');
    if (signupForm) {
      signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!tos.checked) { toast('Please agree to the Terms first.'); return; }
        const fd = new FormData(signupForm);
        const username = (fd.get('username') || '').toString().trim();
        const dob      = (fd.get('dob') || '').toString();
        const pw       = (fd.get('password') || '').toString();
        const pw2      = (fd.get('confirm') || '').toString();
        if (username.length < 3) return toast('Username must be 3+ characters.');
        if (!dob) return toast('Please enter your date of birth.');
        if (pw.length < 6) return toast('Password must be 6+ characters.');
        if (pw !== pw2) return toast('Passwords do not match.');
        setSession({ username, dob, guest: false, coins: 0 });
        toast('Welcome to Heredita, ' + username + '!');
        setTimeout(() => location.href = 'home.html', 700);
      });
    }

    // sign in
    const signinForm = $('#signinForm');
    if (signinForm) {
      signinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!tos.checked) { toast('Please agree to the Terms first.'); return; }
        const fd = new FormData(signinForm);
        const username = (fd.get('username') || '').toString().trim();
        const pw       = (fd.get('password') || '').toString();
        if (!username || !pw) return toast('Enter your credentials.');
        setSession({ username, guest: false, coins: 0 });
        setTimeout(() => location.href = 'home.html', 400);
      });
    }

    // guest
    const guestBtn = $('#guestBtn');
    if (guestBtn) {
      guestBtn.addEventListener('click', () => {
        if (!tos.checked) { toast('Please agree to the Terms first.'); return; }
        setSession({ username: 'Guest' + Math.floor(Math.random() * 9000 + 1000), guest: true, coins: 0 });
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

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', () => {
    wireNavToggle();
    wirePlayCtas();
    wireAuthPage();
    wireHomePage();
    wirePreviewShowcase();
    wireReveal();
    if (document.body.classList.contains('with-dust')) spawnChalkDust();
  });
})();
