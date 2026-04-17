/*
  KinoCampus - KCAPI Notifications Module (V8.6.0)

  Sub-modulo de notifications/preferencias/targets para a fachada KCAPI.
  Registrado em window._KCAPI.notifications e carregado antes de kc-api.client.js.
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  function getActiveDriverOrNull(deps) {
    if (!deps || typeof deps.getActiveDriver !== 'function') return null;
    try {
      return deps.getActiveDriver();
    } catch (_) {
      return null;
    }
  }

  function getAccountProfileUtils(deps) {
    if (deps && deps.accountProfileUtils && typeof deps.accountProfileUtils === 'object') {
      return deps.accountProfileUtils;
    }
    return window.KCAccountProfileUtils || null;
  }

  function buildFallbackNotificationPreferences(deps = {}) {
    const accountProfileUtils = getAccountProfileUtils(deps);
    if (accountProfileUtils && typeof accountProfileUtils.buildDefaultNotificationPreferences === 'function') {
      return accountProfileUtils.buildDefaultNotificationPreferences();
    }
    return {
      comment_on_post: { in_app: true, email: false, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: false },
    };
  }

  function buildFallbackNotificationChannelTargets(deps = {}) {
    const accountProfileUtils = getAccountProfileUtils(deps);
    if (accountProfileUtils && typeof accountProfileUtils.buildDefaultNotificationChannelTargets === 'function') {
      return accountProfileUtils.buildDefaultNotificationChannelTargets();
    }
    return {
      whatsapp: {
        channel: 'whatsapp',
        destination: '',
        country_code: '55',
        local_number: '',
        consent_granted: false,
        consent_at: null,
        configured: false,
        ready: false,
        display: '',
        metadata: { country_code: '55' },
      },
    };
  }

  async function getNotificationPreferences(deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getNotificationPreferences !== 'function') {
      return buildFallbackNotificationPreferences(deps);
    }
    return driver.getNotificationPreferences();
  }

  async function updateNotificationPreferences(preferences = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.updateNotificationPreferences !== 'function') {
      return { ok: false, error: { message: 'Preferencias de notificacao indisponiveis neste driver.' } };
    }
    return driver.updateNotificationPreferences(preferences);
  }

  async function getNotificationChannelTargets(deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getNotificationChannelTargets !== 'function') {
      return buildFallbackNotificationChannelTargets(deps);
    }
    return driver.getNotificationChannelTargets();
  }

  async function updateNotificationChannelTargets(targets = {}, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.updateNotificationChannelTargets !== 'function') {
      return { ok: false, error: { message: 'Destinos privados de notificacao indisponiveis neste driver.' } };
    }
    return driver.updateNotificationChannelTargets(targets);
  }

  async function getNotifications(limit, offset, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getNotifications !== 'function') {
      return { ok: false, notifications: [], unread: 0, total: 0 };
    }
    return driver.getNotifications(limit, offset);
  }

  async function markNotificationsRead(ids, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.markNotificationsRead !== 'function') {
      return { ok: false, error: 'UNAVAILABLE' };
    }
    return driver.markNotificationsRead(ids);
  }

  async function markAllNotificationsRead(deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.markAllNotificationsRead !== 'function') {
      return { ok: false, error: 'UNAVAILABLE' };
    }
    return driver.markAllNotificationsRead();
  }

  async function clearNotifications(deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.clearNotifications !== 'function') {
      return { ok: false, error: 'UNAVAILABLE' };
    }
    return driver.clearNotifications();
  }

  async function getUnreadNotificationCount(deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getUnreadNotificationCount !== 'function') return 0;
    return driver.getUnreadNotificationCount();
  }

  function subscribeNotifications(userId, callback, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.subscribeNotifications !== 'function') return null;
    return driver.subscribeNotifications(userId, callback);
  }

  function unsubscribeNotifications(channel, deps = {}) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.unsubscribeNotifications !== 'function') return;
    driver.unsubscribeNotifications(channel);
  }

  window._KCAPI.notifications = {
    buildFallbackNotificationPreferences,
    buildFallbackNotificationChannelTargets,
    getNotificationPreferences,
    updateNotificationPreferences,
    getNotificationChannelTargets,
    updateNotificationChannelTargets,
    getNotifications,
    markNotificationsRead,
    markAllNotificationsRead,
    clearNotifications,
    getUnreadNotificationCount,
    subscribeNotifications,
    unsubscribeNotifications,
  };
})();
