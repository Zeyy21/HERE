/* Friends page — fully API-backed.
 *
 * Data sources:
 *   GET  /users/me         → friends, sent_friend_requests, received_friend_requests
 *   POST /users/friends/{username}                   send request
 *   DELETE /users/friends/{username}                 remove existing friend
 *   POST /users/friends/requests/{username}          accept incoming
 *   DELETE /users/friends/requests/{username}        decline incoming
 *
 * Notes:
 *   - We use /users/me as the single source of truth so all three tabs stay
 *     consistent with the server, even if the user has pending requests they
 *     never see in /users/friends/.
 *   - There is no public username→profile search. Adding a friend by name
 *     IS the search: the API returns 404 if the user doesn't exist.
 */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const API = window.HereditaAPI;
  const S   = window.HereditaSession;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    const session = S && S.get();
    const guestGate = $('#guestGate');
    const app       = $('#friendsApp');
    const corsGate  = $('#corsGate');

    // Not signed-in → show placeholder.
    if (!session || !session.token || session.guest) {
      guestGate.hidden = false;
      return;
    }

    // CORS / non-prod → show explainer instead of failing silently.
    if (API.isCorsBlockedOrigin()) {
      corsGate.hidden = false;
      // we still attempt the calls; if they happen to work, hide the warning.
    }

    app.hidden = false;
    wireTabs();
    wireAdd(session);
    await refreshAll(session);
  }

  function wireTabs() {
    const tabs   = $$('[data-fr-tab]');
    const panels = $$('[data-fr-panel]');
    tabs.forEach(t => t.addEventListener('click', () => {
      const id = t.dataset.frTab;
      tabs.forEach(x => x.classList.toggle('active', x === t));
      panels.forEach(p => p.hidden = p.dataset.frPanel !== id);
    }));
  }

  function wireAdd(session) {
    const form = $('#addForm');
    const input = $('#addUsername');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (input.value || '').trim();
      if (!name) return;
      if (name.toLowerCase() === (session.username || '').toLowerCase()) {
        toast("You can't friend yourself.");
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      setBusy(btn, true, 'Sending…');
      const r = await API.sendFriendRequest(session.token, name);
      setBusy(btn, false);
      if (!r.ok) {
        if (r.error === 'notfound') return toast('No user named "' + name + '".');
        if (r.error === 'cors')     return toast('Friends only work on heredita.net.');
        return toast(r.message || 'Could not send request.');
      }
      toast('✓ Friend request sent to ' + name + '.');
      input.value = '';
      await refreshAll(session);
      // jump to Outgoing tab so they see the result
      const out = $('[data-fr-tab="outgoing"]');
      if (out) out.click();
    });
  }

  async function refreshAll(session) {
    // /users/me carries friends + both pending lists. One round-trip.
    const r = await API.getMe(session.token);
    if (!r.ok) {
      if (r.error === 'cors' || r.error === 'network') return;
      if (r.error === 'unauthorized') {
        toast('Session expired — please sign in again.');
        S.clear();
        setTimeout(() => location.href = 'index.html', 800);
        return;
      }
      return;
    }
    const me = r.user || {};
    renderList($('#friendsList'),  $('#friendsEmpty'),  $('#cntFriends'),  me.friends || [], 'friend', session);
    renderList($('#incomingList'), $('#incomingEmpty'), $('#cntIncoming'), me.received_friend_requests || [], 'incoming', session);
    renderList($('#outgoingList'), $('#outgoingEmpty'), $('#cntOutgoing'), me.sent_friend_requests || [], 'outgoing', session);
  }

  function renderList(listEl, emptyEl, countEl, users, kind, session) {
    countEl.textContent = '(' + users.length + ')';
    if (!users.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    listEl.innerHTML = users.map(u => buildCard(u, kind)).join('');
    // wire action buttons in this list
    $$('button[data-action]', listEl).forEach(b => {
      b.addEventListener('click', async () => {
        const action = b.dataset.action;
        const username = b.dataset.username;
        setBusy(b, true, '…');
        let r;
        if      (action === 'remove')  r = await API.removeFriend(session.token, username);
        else if (action === 'accept')  r = await API.acceptFriendRequest(session.token, username);
        else if (action === 'decline') r = await API.declineFriendRequest(session.token, username);
        else if (action === 'cancel')  r = await API.declineFriendRequest(session.token, username); // outgoing cancel uses decline too
        if (r && r.ok) {
          toast(actionToast(action, username));
          await refreshAll(session);
        } else {
          setBusy(b, false);
          toast((r && r.message) || 'Action failed.');
        }
      });
    });
  }

  function buildCard(u, kind) {
    const initial = (u.username || '?').charAt(0).toUpperCase();
    const rank = u.rank || 'player';
    const actions = ({
      'friend':   `<button class="btn btn-ghost" data-action="remove"  data-username="${u.username}">Remove</button>`,
      'incoming': `<button class="btn btn-primary" data-action="accept" data-username="${u.username}">Accept</button>
                   <button class="btn btn-ghost"   data-action="decline" data-username="${u.username}">Decline</button>`,
      'outgoing': `<button class="btn btn-ghost"   data-action="cancel"  data-username="${u.username}">Cancel</button>`
    })[kind] || '';
    return `
      <article class="chalk-card" style="padding: 18px;">
        <div class="row" style="gap: 12px; align-items: center;">
          <span style="width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent-deep)); border: 2px solid var(--chalk); color: var(--board-3); display: inline-flex; align-items: center; justify-content: center; font-family: 'Caveat', cursive; font-weight: 700; font-size: 1.4rem;">${escapeHtml(initial)}</span>
          <div style="flex: 1; min-width: 0;">
            <div style="font-family:'Caveat',cursive; font-size: 1.4rem; line-height: 1.1; color: var(--chalk);">${escapeHtml(u.username)}</div>
            <div class="muted" style="font-size: .9rem;">${escapeHtml(rankLabel(rank))}</div>
          </div>
        </div>
        <div class="row" style="gap: 8px; margin-top: 12px; flex-wrap: wrap;">
          ${actions}
        </div>
      </article>
    `;
  }

  function rankLabel(rank) {
    return ({
      'player':        'Player',
      'moderator':     '🛡 Moderator',
      'administrator': '⚙ Administrator',
      'developer':     '🛠 Developer'
    })[rank] || rank;
  }

  function actionToast(action, username) {
    return ({
      'remove':  '✓ Removed ' + username + ' from friends.',
      'accept':  '🎉 You are now friends with ' + username + '.',
      'decline': '✗ Declined ' + username + "'s request.",
      'cancel':  '✗ Cancelled request to ' + username + '.'
    })[action] || 'Done.';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
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

  function toast(msg, ms = 2400) {
    let el = document.querySelector('.toast');
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
})();
