/* KinoCampus - Local Notifications Adapter */
(function () {
  'use strict';

  const LOCAL_NOTIFICATION_PREFERENCES_STORAGE_KEY = 'kc_notification_preferences';
  const LOCAL_NOTIFICATION_CHANNEL_TARGETS_STORAGE_KEY = 'kc_notification_channel_targets';

  window._KCLA = window._KCLA || {};

  function getAccountProfileUtils() {
    return (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils === 'object')
      ? window.KCAccountProfileUtils
      : null;
  }

  function buildDefaultNotificationPreferences() {
    const utils = getAccountProfileUtils();
    if (utils && typeof utils.buildDefaultNotificationPreferences === 'function') {
      return utils.buildDefaultNotificationPreferences();
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

  function normalizeNotificationPreferences(value) {
    const utils = getAccountProfileUtils();
    if (utils && typeof utils.normalizeNotificationPreferences === 'function') {
      return utils.normalizeNotificationPreferences(value);
    }
    const defaults = buildDefaultNotificationPreferences();
    const source = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
    const normalized = {};
    Object.keys(defaults).forEach((eventKey) => {
      const sourceEvent = (source[eventKey] && typeof source[eventKey] === 'object' && !Array.isArray(source[eventKey]))
        ? source[eventKey]
        : {};
      normalized[eventKey] = {
        in_app: sourceEvent.in_app !== false,
        email: sourceEvent.email === true,
        whatsapp: sourceEvent.whatsapp === true,
      };
    });
    return normalized;
  }

  function buildDefaultNotificationChannelTargets() {
    const utils = getAccountProfileUtils();
    if (utils && typeof utils.buildDefaultNotificationChannelTargets === 'function') {
      return utils.buildDefaultNotificationChannelTargets();
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

  function normalizeNotificationDigits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function formatNotificationWhatsapp(value) {
    const digits = normalizeNotificationDigits(value);
    if (!digits) return '';
    if (digits.indexOf('55') === 0 && digits.length >= 12) {
      const ddd = digits.slice(2, 4);
      const body = digits.slice(4);
      if (body.length === 9) return `+55 (${ddd}) ${body.slice(0, 5)}-${body.slice(5)}`;
      if (body.length === 8) return `+55 (${ddd}) ${body.slice(0, 4)}-${body.slice(4)}`;
    }
    return `+${digits}`;
  }

  function normalizeNotificationChannelTargets(value) {
    const utils = getAccountProfileUtils();
    if (utils && typeof utils.normalizeNotificationChannelTargets === 'function') {
      return utils.normalizeNotificationChannelTargets(value);
    }
    const defaults = buildDefaultNotificationChannelTargets();
    const source = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
    const whatsapp = (source.whatsapp && typeof source.whatsapp === 'object' && !Array.isArray(source.whatsapp))
      ? source.whatsapp
      : {};
    const metadata = (whatsapp.metadata && typeof whatsapp.metadata === 'object' && !Array.isArray(whatsapp.metadata))
      ? whatsapp.metadata
      : {};
    const countryCode = normalizeNotificationDigits(whatsapp.country_code || whatsapp.countryCode || metadata.country_code || '55') || defaults.whatsapp.country_code;
    const explicitDestinationDigits = normalizeNotificationDigits(whatsapp.destination || whatsapp.destination_normalized || whatsapp.destinationNormalized || '');
    const localNumberDigits = normalizeNotificationDigits(whatsapp.local_number || whatsapp.localNumber || '');
    const destination = explicitDestinationDigits
      ? `+${explicitDestinationDigits}`
      : (localNumberDigits ? `+${countryCode}${localNumberDigits}` : '');
    const normalizedLocalNumber = destination && destination.indexOf(`+${countryCode}`) === 0
      ? normalizeNotificationDigits(destination.slice(countryCode.length + 1))
      : localNumberDigits;
    const consentGranted = whatsapp.consent_granted === true || whatsapp.consentGranted === true;

    return {
      whatsapp: {
        channel: 'whatsapp',
        destination,
        country_code: countryCode,
        local_number: normalizedLocalNumber,
        consent_granted: consentGranted,
        consent_at: whatsapp.consent_at || whatsapp.consentAt || null,
        configured: !!destination,
        ready: !!destination && consentGranted,
        display: formatNotificationWhatsapp(destination),
        metadata: { country_code: countryCode },
      },
    };
  }

  function readNotificationPreferences() {
    const defaults = buildDefaultNotificationPreferences();
    try {
      const raw = localStorage.getItem(LOCAL_NOTIFICATION_PREFERENCES_STORAGE_KEY);
      if (!raw) return defaults;
      return normalizeNotificationPreferences(JSON.parse(raw));
    } catch (_) {
      return defaults;
    }
  }

  function writeNotificationPreferences(preferences) {
    const normalized = normalizeNotificationPreferences(preferences);
    try {
      localStorage.setItem(LOCAL_NOTIFICATION_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (_) {
      return null;
    }
  }

  function readNotificationChannelTargets() {
    const defaults = buildDefaultNotificationChannelTargets();
    try {
      const raw = localStorage.getItem(LOCAL_NOTIFICATION_CHANNEL_TARGETS_STORAGE_KEY);
      if (!raw) return defaults;
      return normalizeNotificationChannelTargets(JSON.parse(raw));
    } catch (_) {
      return defaults;
    }
  }

  function writeNotificationChannelTargets(targets) {
    const normalized = normalizeNotificationChannelTargets(targets);
    try {
      localStorage.setItem(LOCAL_NOTIFICATION_CHANNEL_TARGETS_STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (_) {
      return null;
    }
  }

  async function getNotificationPreferences() {
    return readNotificationPreferences();
  }

  async function updateNotificationPreferences(preferences = {}) {
    const saved = writeNotificationPreferences(preferences);
    if (!saved) {
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel salvar as preferÃªncias de notificaÃ§Ã£o localmente.' } };
    }
    return { ok: true, data: { preferences: saved } };
  }

  async function getNotificationChannelTargets() {
    return readNotificationChannelTargets();
  }

  async function updateNotificationChannelTargets(targets = {}) {
    const saved = writeNotificationChannelTargets(targets);
    if (!saved) {
      return { ok: false, error: { message: 'Nao foi possivel salvar os destinos privados localmente.' } };
    }
    return { ok: true, data: { targets: saved } };
  }

  async function getNotifications() {
    return { ok: true, notifications: [], unread: 0, total: 0 };
  }

  async function markNotificationsRead() {
    return { ok: true };
  }

  async function markAllNotificationsRead() {
    return { ok: true };
  }

  async function clearNotifications() {
    return { ok: true, deleted: 0 };
  }

  async function getUnreadNotificationCount() {
    return 0;
  }

  function subscribeNotifications() {
    return null;
  }

  function unsubscribeNotifications() { }

  async function inviteExternalUser() {
    return { ok: false, error: 'DRIVER_NAO_SUPORTA' };
  }

  async function getInvites() {
    return { data: [], error: null };
  }

  async function revokeInvite() {
    return { ok: false, error: 'DRIVER_NAO_SUPORTA' };
  }

  window._KCLA.notifications = Object.freeze({
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
    inviteExternalUser,
    getInvites,
    revokeInvite,
  });
})();
