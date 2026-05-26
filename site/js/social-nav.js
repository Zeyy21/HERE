/* Social popover — injects a "Social ▾" button into the primary nav and
 * mounts a body-attached popover panel beneath it.
 *
 * Why body-attached: the topbar's nav uses display:flex with its own per-
 * link padding, animated chalk underlines, etc. Putting the menu inside
 * the nav fights that cascade. Attaching to <body> with position:fixed
 * sidesteps every collision and lets the panel be styled as a first-class
 * chalkboard card.
 *
 * Pages opt in by declaring <nav data-social-host>.
 */
(function () {
  'use strict';

  const ITEMS = [
    {
      href: 'friends.html',
      label: 'Friends',
      sub: 'Manage your roster',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>'
    },
    {
      href: 'chat.html',
      label: 'Chat',
      sub: 'Town Square & DMs',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    },
    {
      href: 'search.html',
      label: 'Find player',
      sub: 'Search by username',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
    }
  ];

  const CARET = '<svg class="caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="2,4 6,8 10,4"/></svg>';

  let toggleEl = null;
  let popoverEl = null;
  let isOpen = false;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const nav = document.querySelector('nav[data-social-host]');
    if (!nav) return;
    const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const itemActive = ITEMS.some(it => it.href.toLowerCase() === current);

    // ---- Toggle button in the nav
    toggleEl = document.createElement('button');
    toggleEl.type = 'button';
    toggleEl.className = 'social-toggle' + (itemActive ? ' has-active' : '');
    toggleEl.setAttribute('aria-haspopup', 'true');
    toggleEl.setAttribute('aria-expanded', 'false');
    toggleEl.setAttribute('aria-controls', 'socialPopover');
    toggleEl.innerHTML = `<span>Social</span>${CARET}`;

    // Insert before Updates if it exists, else append
    const updates = nav.querySelector('a[href$="updates.html"]');
    if (updates) nav.insertBefore(toggleEl, updates);
    else nav.appendChild(toggleEl);

    // ---- Popover (attached to body so it escapes the nav's flex cascade)
    popoverEl = document.createElement('div');
    popoverEl.className = 'social-popover';
    popoverEl.id = 'socialPopover';
    popoverEl.setAttribute('role', 'menu');
    popoverEl.innerHTML = ITEMS.map(it => `
      <a role="menuitem" href="${it.href}"${it.href.toLowerCase() === current ? ' class="active" aria-current="page"' : ''}>
        <span class="sp-icon">${it.icon}</span>
        <span class="sp-label">
          ${escapeHtml(it.label)}
          <span class="sp-sub">${escapeHtml(it.sub)}</span>
        </span>
      </a>
    `).join('');
    document.body.appendChild(popoverEl);

    // ---- Wiring
    toggleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen ? close() : open();
    });
    toggleEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
        focusFirstItem();
      }
    });

    document.addEventListener('click', (e) => {
      if (!isOpen) return;
      if (popoverEl.contains(e.target) || toggleEl.contains(e.target)) return;
      close();
    });
    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        close();
        toggleEl.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cycleFocus(e.key === 'ArrowDown' ? 1 : -1);
      }
    });

    // Reposition on scroll/resize so the panel always sits under the toggle
    window.addEventListener('resize', () => { if (isOpen) positionPopover(); });
    window.addEventListener('scroll', () => { if (isOpen) positionPopover(); }, { passive: true });
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    toggleEl.setAttribute('aria-expanded', 'true');
    positionPopover();
    // requestAnimationFrame so the 'open' class transitions in cleanly
    requestAnimationFrame(() => popoverEl.classList.add('open'));
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    toggleEl.setAttribute('aria-expanded', 'false');
    popoverEl.classList.remove('open');
  }

  function positionPopover() {
    const rect = toggleEl.getBoundingClientRect();
    // First render with auto sizing so we know its width
    popoverEl.style.left = '0px';
    popoverEl.style.top  = '0px';
    const popRect = popoverEl.getBoundingClientRect();
    const popWidth = popRect.width || 240;

    const margin = 8;
    const toggleCenter = rect.left + rect.width / 2;
    let left = toggleCenter - popWidth / 2;
    // clamp so it doesn't run off-screen
    const maxLeft = window.innerWidth - popWidth - margin;
    if (left < margin) left = margin;
    if (left > maxLeft) left = maxLeft;
    const top = rect.bottom + 12;

    popoverEl.style.left = left + 'px';
    popoverEl.style.top  = top + 'px';

    // Position the chalk-arrow notch so it points at the toggle center
    const arrowX = Math.max(14, Math.min(popWidth - 14, toggleCenter - left));
    popoverEl.style.setProperty('--arrow-x', arrowX + 'px');
  }

  function focusFirstItem() {
    const first = popoverEl.querySelector('a');
    if (first) first.focus();
  }

  function cycleFocus(dir) {
    const items = Array.from(popoverEl.querySelectorAll('a'));
    if (!items.length) return;
    const active = document.activeElement;
    let idx = items.indexOf(active);
    if (idx === -1) idx = dir > 0 ? -1 : items.length;
    idx = (idx + dir + items.length) % items.length;
    items[idx].focus();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
})();
