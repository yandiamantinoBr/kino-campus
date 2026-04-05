(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────
  var _channel = null;
  var _notifications = [];
  var _unreadCount = 0;
  var _dropdownOpen = false;
  var _loading = false;
  var _initialized = false;

  // ── Helpers ──────────────────────────────────────────────────

  function $(sel) { return document.querySelector(sel); }

  function escapeHtml(str) {
    if (typeof window.KCUtils !== 'undefined' && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(str);
    }
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    var now = Date.now();
    var then = new Date(dateStr).getTime();
    var diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'agora';
    if (diff < 3600) return Math.floor(diff / 60) + 'min';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd';
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  function notifIcon(type) {
    switch (type) {
      case 'comment_on_post': return 'fas fa-comment';
      case 'comment_reply':   return 'fas fa-reply';
      case 'vote_on_post':    return 'fas fa-arrow-up';
      case 'post_expired':    return 'fas fa-clock';
      case 'post_reported':   return 'fas fa-flag';
      case 'system':          return 'fas fa-info-circle';
      default:                return 'fas fa-bell';
    }
  }

  function notifLink(notif) {
    var data = notif.data || {};
    if (data.post_id) {
      return '_product.html?id=' + encodeURIComponent(data.post_id);
    }
    return null;
  }

  // ── Badge ────────────────────────────────────────────────────

  function updateBadge(count) {
    _unreadCount = count;
    var badge = $('#kcNotifBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = '';
    } else {
      badge.textContent = '0';
      badge.style.display = 'none';
    }
  }

  // ── Dropdown ─────────────────────────────────────────────────

  function ensureDropdown() {
    if ($('#kcNotifDropdown')) return;
    var el = document.createElement('div');
    el.id = 'kcNotifDropdown';
    el.className = 'kc-notif-dropdown';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }

  function buildDropdownHTML() {
    var parts = [];
    parts.push('<div class="kc-notif-dropdown__header">');
    parts.push('<span class="kc-notif-dropdown__title">Notificações</span>');
    if (_unreadCount > 0) {
      parts.push('<button class="kc-notif-dropdown__mark-all" id="kcNotifMarkAll">Marcar todas como lidas</button>');
    }
    parts.push('</div>');

    if (_loading) {
      parts.push('<div class="kc-notif-dropdown__empty">Carregando...</div>');
      return parts.join('');
    }

    if (_notifications.length === 0) {
      parts.push('<div class="kc-notif-dropdown__empty">Nenhuma notificação</div>');
      return parts.join('');
    }

    parts.push('<div class="kc-notif-dropdown__list">');
    for (var i = 0; i < _notifications.length; i++) {
      var n = _notifications[i];
      var readClass = n.read ? ' kc-notif-item--read' : '';
      var link = notifLink(n);
      var tag = link ? 'a' : 'div';
      var href = link ? ' href="' + escapeHtml(link) + '"' : '';

      parts.push('<' + tag + ' class="kc-notif-item' + readClass + '"' + href + ' data-notif-id="' + n.id + '">');
      parts.push('<div class="kc-notif-item__icon"><i class="' + notifIcon(n.type) + '"></i></div>');
      parts.push('<div class="kc-notif-item__content">');
      parts.push('<div class="kc-notif-item__title">' + escapeHtml(n.title) + '</div>');
      if (n.body) {
        parts.push('<div class="kc-notif-item__body">' + escapeHtml(n.body) + '</div>');
      }
      parts.push('<div class="kc-notif-item__time">' + timeAgo(n.created_at) + '</div>');
      parts.push('</div>');
      parts.push('</' + tag + '>');
    }
    parts.push('</div>');

    return parts.join('');
  }

  function openDropdown() {
    ensureDropdown();
    var dropdown = $('#kcNotifDropdown');
    var bell = $('#kcNotifBell');
    if (!dropdown || !bell) return;

    dropdown.innerHTML = buildDropdownHTML();

    // Position below bell
    var rect = bell.getBoundingClientRect();
    var width = 340;
    var left = rect.right - width;
    if (left < 8) left = 8;
    dropdown.style.top = (rect.bottom + 8) + 'px';
    dropdown.style.left = left + 'px';

    dropdown.classList.add('active');
    dropdown.setAttribute('aria-hidden', 'false');
    _dropdownOpen = true;

    // Bind "Marcar todas como lidas"
    var markAllBtn = $('#kcNotifMarkAll');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        markAllRead();
      });
    }

    // Mark visible unread as read after 2s
    var unreadIds = [];
    for (var i = 0; i < _notifications.length; i++) {
      if (!_notifications[i].read) unreadIds.push(_notifications[i].id);
    }
    if (unreadIds.length > 0) {
      setTimeout(function () {
        if (_dropdownOpen) markRead(unreadIds);
      }, 2000);
    }
  }

  function closeDropdown() {
    var dropdown = $('#kcNotifDropdown');
    if (dropdown) {
      dropdown.classList.remove('active');
      dropdown.setAttribute('aria-hidden', 'true');
    }
    _dropdownOpen = false;
  }

  function toggleDropdown() {
    if (_dropdownOpen) {
      closeDropdown();
    } else {
      fetchNotifications().then(function () {
        openDropdown();
      });
    }
  }

  // ── Data ─────────────────────────────────────────────────────

  function fetchNotifications() {
    _loading = true;
    return window.KCAPI.getNotifications(20, 0).then(function (result) {
      _loading = false;
      if (result && result.ok) {
        _notifications = result.notifications || [];
        updateBadge(result.unread || 0);
      }
      return result;
    }).catch(function () {
      _loading = false;
    });
  }

  function fetchUnreadCount() {
    return window.KCAPI.getUnreadNotificationCount().then(function (count) {
      updateBadge(count || 0);
    }).catch(function () {});
  }

  function markRead(ids) {
    if (!ids || ids.length === 0) return;
    window.KCAPI.markNotificationsRead(ids).then(function () {
      for (var i = 0; i < _notifications.length; i++) {
        if (ids.indexOf(_notifications[i].id) !== -1) {
          _notifications[i].read = true;
        }
      }
      fetchUnreadCount();
      if (_dropdownOpen) {
        var dropdown = $('#kcNotifDropdown');
        if (dropdown) dropdown.innerHTML = buildDropdownHTML();
      }
    });
  }

  function markAllRead() {
    window.KCAPI.markAllNotificationsRead().then(function () {
      for (var i = 0; i < _notifications.length; i++) {
        _notifications[i].read = true;
      }
      updateBadge(0);
      if (_dropdownOpen) {
        var dropdown = $('#kcNotifDropdown');
        if (dropdown) dropdown.innerHTML = buildDropdownHTML();
      }
    });
  }

  // ── Realtime ─────────────────────────────────────────────────

  function onNewNotification(notif) {
    _notifications.unshift(notif);
    if (_notifications.length > 20) _notifications.pop();
    updateBadge(_unreadCount + 1);
    if (_dropdownOpen) {
      var dropdown = $('#kcNotifDropdown');
      if (dropdown) dropdown.innerHTML = buildDropdownHTML();
    }
  }

  // ── Init ─────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;

    // Wait for auth to be ready
    var bell = $('#kcNotifBell');
    if (!bell) return;

    // Check if user is logged in (kc-auth.ui.js sets btn-login.is-auth)
    function tryInit() {
      var authBtn = document.querySelector('a.btn-login.is-auth');
      if (!authBtn) {
        // Not logged in — hide bell
        bell.style.display = 'none';
        return;
      }

      // Show bell
      bell.style.display = '';
      _initialized = true;

      // Fetch initial count
      fetchUnreadCount();

      // Subscribe to realtime
      var user = null;
      if (typeof window.KCAPI.getCurrentUser === 'function') {
        Promise.resolve(window.KCAPI.getCurrentUser()).then(function (u) {
          if (u && u.id) {
            _channel = window.KCAPI.subscribeNotifications(u.id, onNewNotification);
          }
        }).catch(function () {});
      }

      // Bell click
      bell.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleDropdown();
      });

      // Close on outside click
      document.addEventListener('click', function (e) {
        if (!_dropdownOpen) return;
        var dropdown = $('#kcNotifDropdown');
        if (bell.contains(e.target)) return;
        if (dropdown && dropdown.contains(e.target)) return;
        closeDropdown();
      });

      // Close on Escape
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _dropdownOpen) closeDropdown();
      });
    }

    // Wait a bit for auth to initialize (auth UI runs on DOMContentLoaded too)
    setTimeout(tryInit, 500);
    // Retry after auth might have resolved
    setTimeout(function () {
      if (!_initialized) tryInit();
    }, 2000);
  }

  function destroy() {
    if (_channel) {
      window.KCAPI.unsubscribeNotifications(_channel);
      _channel = null;
    }
    _initialized = false;
    closeDropdown();
    var dropdown = $('#kcNotifDropdown');
    if (dropdown && dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
  }

  // ── Public API ───────────────────────────────────────────────

  window.KCNotifications = {
    init: init,
    destroy: destroy,
    fetchNotifications: fetchNotifications,
    fetchUnreadCount: fetchUnreadCount,
    markAllRead: markAllRead,
    toggleDropdown: toggleDropdown,
  };

  document.addEventListener('DOMContentLoaded', init);

}());
