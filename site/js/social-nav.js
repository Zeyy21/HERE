/* Injects a "Social ▾" dropdown into the primary nav on any page that
 * declares <nav data-social-host>. Keeps the topbar tidy.
 *
 * The dropdown contains:
 *   - Friends  (friends.html)
 *   - Chat     (chat.html)
 *   - Find     (search.html)
 *
 * The active link is highlighted based on the current URL path.
 */
(function () {
  'use strict';

  const ITEMS = [
    { href: 'friends.html', label: 'Friends', icon: friendsIcon() },
    { href: 'chat.html',    label: 'Chat',    icon: chatIcon() },
    { href: 'search.html',  label: 'Find',    icon: searchIcon() }
  ];

  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('nav[data-social-host]');
    if (!nav) return;
    const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

    const wrap = document.createElement('span');
    wrap.className = 'nav-dropdown';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-dd-toggle';
    toggle.innerHTML = 'Social <span class="caret" aria-hidden="true">▾</span>';
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'nav-dd-menu';
    ITEMS.forEach(it => {
      const a = document.createElement('a');
      a.href = it.href;
      a.innerHTML = `<span class="nav-dd-icon">${it.icon}</span><span>${it.label}</span>`;
      if (it.href.toLowerCase() === current) {
        a.classList.add('active');
        toggle.classList.add('active');
      }
      menu.appendChild(a);
    });

    wrap.appendChild(toggle);
    wrap.appendChild(menu);

    // Place after the existing "Home / Play / Store / Avatar" cluster but
    // before Updates if present — practically: insert at the END of the nav
    // which sits between Avatar and Updates in our current ordering.
    // The simplest reliable spot: just before the LAST link in the nav.
    const links = nav.querySelectorAll('a');
    if (links.length >= 2) {
      // insert before the second-to-last? About is usually last. Insert
      // right before Updates if found, else just append.
      const updates = nav.querySelector('a[href$="updates.html"]');
      if (updates) nav.insertBefore(wrap, updates);
      else nav.appendChild(wrap);
    } else {
      nav.appendChild(wrap);
    }

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrap.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        wrap.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  });

  function friendsIcon() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>`;
  }
  function chatIcon() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  }
  function searchIcon() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`;
  }
})();
