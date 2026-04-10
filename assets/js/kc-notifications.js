(function () {
  'use strict';

  var _channel = null;
  var _notifications = [];
  var _unreadCount = 0;
  var _dropdownOpen = false;
  var _loading = false;
  var _initialized = false;
  var _markVisibleTimer = null;
  var _busyAction = '';
  var _activeBell = null;

  var _handleBellClick = null;
  var _handleDocumentClick = null;
  var _handleDocumentKeydown = null;
  var _handleWindowResize = null;
  var _handleDocumentScroll = null;

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
      case 'comment_reply': return 'fas fa-reply';
      case 'vote_on_post': return 'fas fa-arrow-up';
      case 'post_expired': return 'fas fa-clock';
      case 'post_reported': return 'fas fa-flag';
      case 'system': return 'fas fa-info-circle';
      default: return 'fas fa-bell';
    }
  }

  function notifLink(notif) {
    var data = notif && notif.data ? notif.data : {};
    if (!data.post_id) return null;
    if (window.KCUtils && typeof window.KCUtils.buildProductDetailHref === 'function') {
      return window.KCUtils.buildProductDetailHref(data.post_id);
    }
    return '_product.html?id=' + encodeURIComponent(data.post_id);
  }

  function normalizeNotificationId(value) {
    return String(value || '').trim();
  }

  function hasNotifications() {
    return _notifications.length > 0;
  }

  function isBusy(action) {
    return _busyAction === action;
  }

  function updateBellState() {
    if (!_activeBell) return;
    _activeBell.classList.toggle('kc-notif-bell--active', _dropdownOpen);
    _activeBell.setAttribute('aria-expanded', _dropdownOpen ? 'true' : 'false');
  }

  function setBusyAction(action) {
    _busyAction = action || '';
    if (_dropdownOpen) renderDropdown();
  }

  function updateBadge(count) {
    _unreadCount = Number(count) > 0 ? Number(count) : 0;
    var badge = $('#kcNotifBadge');
    if (!badge) return;

    if (_unreadCount > 0) {
      badge.textContent = _unreadCount > 99 ? '99+' : String(_unreadCount);
      badge.style.display = '';
    } else {
      badge.textContent = '0';
      badge.style.display = 'none';
    }
  }

  function ensureDropdown() {
    var existing = $('#kcNotifDropdown');
    if (existing) return existing;

    var el = document.createElement('div');
    el.id = 'kcNotifDropdown';
    el.className = 'kc-notif-dropdown';
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('aria-busy', 'false');

    el.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;

      var clearBtn = target.closest('#kcNotifClearAll');
      if (clearBtn) {
        e.preventDefault();
        e.stopPropagation();
        clearAllNotifications();
        return;
      }

      var markAllBtn = target.closest('#kcNotifMarkAll');
      if (markAllBtn) {
        e.preventDefault();
        e.stopPropagation();
        markAllRead();
        return;
      }

      var notifItem = target.closest('.kc-notif-item[data-notif-id]');
      if (!notifItem) return;

      var notifId = normalizeNotificationId(notifItem.getAttribute('data-notif-id'));
      if (!notifId) return;

      if (!notifItem.classList.contains('kc-notif-item--read')) {
        markRead([notifId]);
      }
      closeDropdown();
    });

    document.body.appendChild(el);
    return el;
  }

  function clearMarkVisibleTimer() {
    if (_markVisibleTimer) {
      clearTimeout(_markVisibleTimer);
      _markVisibleTimer = null;
    }
  }

  function scheduleVisibleMarkRead() {
    clearMarkVisibleTimer();
    if (!_dropdownOpen || _busyAction === 'clear') return;

    var unreadIds = [];
    for (var i = 0; i < _notifications.length; i++) {
      if (!_notifications[i].read) unreadIds.push(_notifications[i].id);
    }
    if (unreadIds.length === 0) return;

    _markVisibleTimer = setTimeout(function () {
      _markVisibleTimer = null;
      if (_dropdownOpen) markRead(unreadIds);
    }, 2000);
  }

  function getDropdownCountLabel() {
    var count = _notifications.length;
    if (count === 1) return '1 item';
    return count + ' itens';
  }

  function buildDropdownHTML() {
    var parts = [];
    var disableAttr = _busyAction ? ' disabled' : '';

    parts.push('<div class="kc-notif-dropdown__header">');
    parts.push('<div class="kc-notif-dropdown__heading">');
    parts.push('<span class="kc-notif-dropdown__title">Notificações</span>');
    if (hasNotifications()) {
      parts.push('<span class="kc-notif-dropdown__meta">' + getDropdownCountLabel() + '</span>');
    }
    parts.push('</div>');

    if (hasNotifications()) {
      parts.push('<div class="kc-notif-dropdown__actions">');
      if (_unreadCount > 0) {
        parts.push('<button type="button" class="kc-notif-dropdown__action kc-notif-dropdown__action--primary" id="kcNotifMarkAll"' + disableAttr + '>');
        parts.push(isBusy('mark-all') ? 'Marcando...' : 'Marcar todas');
        parts.push('</button>');
      }
      parts.push('<button type="button" class="kc-notif-dropdown__action kc-notif-dropdown__action--ghost" id="kcNotifClearAll"' + disableAttr + '>');
      parts.push(isBusy('clear') ? 'Limpando...' : 'Limpar');
      parts.push('</button>');
      parts.push('</div>');
    }
    parts.push('</div>');

    if (_loading) {
      parts.push('<div class="kc-notif-dropdown__empty">Carregando...</div>');
      return parts.join('');
    }

    if (!hasNotifications()) {
      parts.push('<div class="kc-notif-dropdown__empty">Nenhuma notificação</div>');
      return parts.join('');
    }

    parts.push('<div class="kc-notif-dropdown__list">');
    for (var i = 0; i < _notifications.length; i++) {
      var notif = _notifications[i];
      var readClass = notif.read ? ' kc-notif-item--read' : '';
      var link = notifLink(notif);
      var tag = link ? 'a' : 'div';
      var href = link ? ' href="' + escapeHtml(link) + '"' : '';

      parts.push('<' + tag + ' class="kc-notif-item' + readClass + '"' + href + ' data-notif-id="' + escapeHtml(notif.id) + '">');
      parts.push('<div class="kc-notif-item__icon"><i class="' + notifIcon(notif.type) + '"></i></div>');
      parts.push('<div class="kc-notif-item__content">');
      parts.push('<div class="kc-notif-item__title">' + escapeHtml(notif.title) + '</div>');
      if (notif.body) {
        parts.push('<div class="kc-notif-item__body">' + escapeHtml(notif.body) + '</div>');
      }
      parts.push('<div class="kc-notif-item__time">' + timeAgo(notif.created_at) + '</div>');
      parts.push('</div>');
      parts.push('</' + tag + '>');
    }
    parts.push('</div>');

    return parts.join('');
  }

  function positionDropdown() {
    var dropdown = $('#kcNotifDropdown');
    var bell = _activeBell || $('#kcNotifBell');
    if (!dropdown || !bell) return;

    var rect = bell.getBoundingClientRect();
    var width = window.innerWidth <= 600 ? Math.max(280, window.innerWidth - 16) : 360;
    var top = rect.bottom + 10;
    var left = rect.right - width;

    if (window.innerWidth <= 600) {
      left = 8;
    } else {
      if (left < 8) left = 8;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
    }

    dropdown.style.top = Math.max(8, top) + 'px';
    dropdown.style.left = left + 'px';
  }

  function renderDropdown() {
    var dropdown = ensureDropdown();
    if (!dropdown) return null;

    dropdown.innerHTML = buildDropdownHTML();
    dropdown.setAttribute('aria-busy', _loading || !!_busyAction ? 'true' : 'false');

    if (_dropdownOpen) {
      positionDropdown();
      scheduleVisibleMarkRead();
    }
    return dropdown;
  }

  function openDropdown() {
    var dropdown = renderDropdown();
    if (!dropdown) return;

    positionDropdown();
    dropdown.classList.add('active');
    dropdown.setAttribute('aria-hidden', 'false');
    _dropdownOpen = true;
    updateBellState();
    scheduleVisibleMarkRead();
  }

  function closeDropdown() {
    var dropdown = $('#kcNotifDropdown');
    clearMarkVisibleTimer();
    if (dropdown) {
      dropdown.classList.remove('active');
      dropdown.setAttribute('aria-hidden', 'true');
    }
    _dropdownOpen = false;
    updateBellState();
  }

  function toggleDropdown() {
    if (_dropdownOpen) {
      closeDropdown();
      return;
    }

    fetchNotifications().then(function () {
      openDropdown();
    });
  }

  function fetchNotifications() {
    _loading = true;
    if (_dropdownOpen) renderDropdown();

    return window.KCAPI.getNotifications(20, 0).then(function (result) {
      _loading = false;
      if (result && result.ok) {
        _notifications = Array.isArray(result.notifications) ? result.notifications.slice(0, 20) : [];
        updateBadge(result.unread || 0);
      }
      if (_dropdownOpen) renderDropdown();
      return result;
    }).catch(function () {
      _loading = false;
      if (_dropdownOpen) renderDropdown();
      return { ok: false };
    });
  }

  function fetchUnreadCount() {
    return window.KCAPI.getUnreadNotificationCount().then(function (count) {
      updateBadge(count || 0);
      if (_dropdownOpen) renderDropdown();
    }).catch(function () {});
  }

  function markRead(ids) {
    if (!ids || ids.length === 0 || _busyAction === 'clear') return Promise.resolve({ ok: false, error: 'BUSY' });

    return window.KCAPI.markNotificationsRead(ids).then(function (result) {
      if (result && result.ok) {
        for (var i = 0; i < _notifications.length; i++) {
          if (ids.indexOf(_notifications[i].id) !== -1) {
            _notifications[i].read = true;
          }
        }
        fetchUnreadCount();
        if (_dropdownOpen) renderDropdown();
      }
      return result;
    });
  }

  function markAllRead() {
    if (_busyAction || _unreadCount <= 0) return Promise.resolve({ ok: false, error: 'BUSY' });

    setBusyAction('mark-all');

    return window.KCAPI.markAllNotificationsRead().then(function (result) {
      if (result && result.ok) {
        for (var i = 0; i < _notifications.length; i++) {
          _notifications[i].read = true;
        }
        updateBadge(0);
      }
      return result;
    }).catch(function () {
      return { ok: false };
    }).then(function (result) {
      setBusyAction('');
      if (_dropdownOpen) renderDropdown();
      if (!result || !result.ok) fetchUnreadCount();
      return result;
    });
  }

  function clearAllNotifications() {
    if (_busyAction || !hasNotifications()) return Promise.resolve({ ok: false, error: 'BUSY' });

    if (typeof window.confirm === 'function') {
      var approved = window.confirm('Limpar todas as notificações deste dropdown?');
      if (!approved) return Promise.resolve({ ok: false, cancelled: true });
    }

    setBusyAction('clear');

    return window.KCAPI.clearNotifications().then(function (result) {
      if (result && result.ok) {
        _notifications = [];
        updateBadge(0);
      }
      return result;
    }).catch(function () {
      return { ok: false };
    }).then(function (result) {
      setBusyAction('');
      if (_dropdownOpen) renderDropdown();
      if (!result || !result.ok) fetchUnreadCount();
      return result;
    });
  }

  function upsertNotification(notif, moveToFront) {
    if (!notif || !notif.id) return;

    var id = normalizeNotificationId(notif.id);
    if (!id) return;

    var index = -1;
    for (var i = 0; i < _notifications.length; i++) {
      if (normalizeNotificationId(_notifications[i].id) === id) {
        index = i;
        break;
      }
    }

    var merged = Object.assign({}, index >= 0 ? _notifications[index] : {}, notif, { id: id });

    if (index >= 0) {
      _notifications[index] = merged;
      if (moveToFront && index > 0) {
        _notifications.splice(index, 1);
        _notifications.unshift(merged);
      }
    } else {
      _notifications.unshift(merged);
    }

    if (_notifications.length > 20) {
      _notifications = _notifications.slice(0, 20);
    }
  }

  function removeNotificationById(id) {
    var normalizedId = normalizeNotificationId(id);
    if (!normalizedId) return false;

    for (var i = 0; i < _notifications.length; i++) {
      if (normalizeNotificationId(_notifications[i].id) === normalizedId) {
        _notifications.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  function normalizeRealtimeEvent(payload) {
    if (!payload || typeof payload !== 'object') return null;

    if (payload.eventType || payload.old || payload.new) {
      return {
        eventType: String(payload.eventType || 'INSERT').toUpperCase(),
        current: payload.new || null,
        previous: payload.old || null,
      };
    }

    return {
      eventType: 'INSERT',
      current: payload,
      previous: null,
    };
  }

  function onRealtimeNotification(payload) {
    var event = normalizeRealtimeEvent(payload);
    if (!event) return;

    if (event.eventType === 'DELETE') {
      removeNotificationById(event.previous && event.previous.id);
      if (_dropdownOpen) renderDropdown();
      fetchUnreadCount();
      return;
    }

    var notif = event.current || event.previous;
    if (!notif || !notif.id) return;

    upsertNotification(notif, event.eventType === 'INSERT');
    if (_dropdownOpen) renderDropdown();
    fetchUnreadCount();
  }

  function activate(bell, user) {
    if (_initialized) return;
    _initialized = true;
    _activeBell = bell;

    bell.style.display = 'inline-flex';
    bell.setAttribute('aria-haspopup', 'dialog');
    bell.setAttribute('aria-expanded', 'false');

    fetchUnreadCount();

    if (user && user.id) {
      _channel = window.KCAPI.subscribeNotifications(user.id, onRealtimeNotification);
    }

    _handleBellClick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown();
    };

    _handleDocumentClick = function (e) {
      if (!_dropdownOpen) return;
      var dropdown = $('#kcNotifDropdown');
      if (bell.contains(e.target)) return;
      if (dropdown && dropdown.contains(e.target)) return;
      closeDropdown();
    };

    _handleDocumentKeydown = function (e) {
      if (e.key === 'Escape' && _dropdownOpen) closeDropdown();
    };

    _handleWindowResize = function () {
      if (_dropdownOpen) positionDropdown();
    };

    _handleDocumentScroll = function () {
      if (_dropdownOpen) positionDropdown();
    };

    bell.addEventListener('click', _handleBellClick);
    document.addEventListener('click', _handleDocumentClick);
    document.addEventListener('keydown', _handleDocumentKeydown);
    window.addEventListener('resize', _handleWindowResize);
    document.addEventListener('scroll', _handleDocumentScroll, true);
  }

  function init() {
    if (_initialized) return;

    var bell = $('#kcNotifBell');
    if (!bell) return;

    var attempts = 0;
    var maxAttempts = 20;

    function checkAuth() {
      if (_initialized) return;
      attempts++;

      if (typeof window.KCAPI !== 'undefined' && typeof window.KCAPI.getCurrentUser === 'function') {
        try {
          Promise.resolve(window.KCAPI.getCurrentUser()).then(function (user) {
            if (user && user.id) {
              activate(bell, user);
            } else if (attempts < maxAttempts) {
              setTimeout(checkAuth, 500);
            }
          }).catch(function () {
            if (attempts < maxAttempts) setTimeout(checkAuth, 500);
          });
        } catch (_) {
          if (attempts < maxAttempts) setTimeout(checkAuth, 500);
        }
        return;
      }

      var authBtn = document.querySelector('a.btn-login.is-auth');
      if (authBtn) {
        activate(bell, null);
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(checkAuth, 500);
      }
    }

    setTimeout(checkAuth, 600);
  }

  function destroy() {
    if (_channel) {
      window.KCAPI.unsubscribeNotifications(_channel);
      _channel = null;
    }

    clearMarkVisibleTimer();
    closeDropdown();

    if (_activeBell && _handleBellClick) _activeBell.removeEventListener('click', _handleBellClick);
    if (_handleDocumentClick) document.removeEventListener('click', _handleDocumentClick);
    if (_handleDocumentKeydown) document.removeEventListener('keydown', _handleDocumentKeydown);
    if (_handleWindowResize) window.removeEventListener('resize', _handleWindowResize);
    if (_handleDocumentScroll) document.removeEventListener('scroll', _handleDocumentScroll, true);

    var dropdown = $('#kcNotifDropdown');
    if (dropdown && dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);

    _notifications = [];
    _unreadCount = 0;
    _dropdownOpen = false;
    _loading = false;
    _busyAction = '';
    _initialized = false;
    _activeBell = null;
    _handleBellClick = null;
    _handleDocumentClick = null;
    _handleDocumentKeydown = null;
    _handleWindowResize = null;
    _handleDocumentScroll = null;
  }

  window.KCNotifications = {
    init: init,
    destroy: destroy,
    fetchNotifications: fetchNotifications,
    fetchUnreadCount: fetchUnreadCount,
    markAllRead: markAllRead,
    clearNotifications: clearAllNotifications,
    toggleDropdown: toggleDropdown,
  };

  document.addEventListener('DOMContentLoaded', init);
}());
