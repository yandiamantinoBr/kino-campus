(function () {
  'use strict';

  const shared = window.KCAccountProfileUtils || {};
  const NO_PUBLIC_CONTACT_OPTION = Object.freeze({
    value: 'no_public_contact',
    label: 'Sem contato público',
  });

  const state = {
    user: null,
    profile: null,
    notificationPreferences: null,
    notificationChannelTargets: null,
    dataSubjectRequests: [],
    dataSubjectRequestsLoadSequence: 0,
    privacyActionKeys: Object.create(null),
    privacyActionKeyUserId: '',
    privacyProtocolLeases: new Map(),
    privacyRequestFocusDisplacement: null,
    privacyBusy: false,
    privacyBusyLease: null,
    accountEmailActionsInFlight: Object.create(null),
    accountLoadGeneration: 0,
    nextPath: '/index.html',
    saving: false,
    lastRealPrimaryMethod: '',
  };

  const PRIVACY_KIND_LABELS = Object.freeze({
    data_access_copy: 'Cópia dos dados',
    data_portability: 'Portabilidade',
    account_erasure: 'Exclusão da conta',
  });

  const PRIVACY_STATUS_LABELS = Object.freeze({
    received: 'Recebido',
    processing: 'Em processamento',
    ready: 'Pronto para baixar',
    pending_confirmation: 'Aguardando confirmação',
    completed: 'Concluído',
    cancelled: 'Cancelado',
    failed: 'Falhou sem efeito parcial',
    partial_failure: 'Atendimento parcial — continua aberto',
    expired: 'Janela de download expirada',
  });

  const PRIVACY_DOWNLOADABLE_STATUSES = new Set([
    'ready',
    'completed',
    'partial_failure',
  ]);

  const PRIVACY_ACCEPTED_REQUEST_STATUSES = new Set([
    'received',
    'processing',
    'ready',
    'pending_confirmation',
    'failed',
    'partial_failure',
  ]);

  const PRIVACY_ERASURE_BLOCKING_STATUSES = new Set([
    'received',
    'processing',
    'ready',
    'pending_confirmation',
    'failed',
    'partial_failure',
  ]);

  const PRIVACY_SUPPLEMENT_DETAIL_STATUSES = new Set([
    'ready',
    'partial_failure',
    'completed',
  ]);

  const BROWSER_EXPORT_LOCAL_KEYS = Object.freeze([
    'theme',
    'kc_consent_v1',
    'kc_events_calendar_month',
  ]);

  const BROWSER_CLEAR_LOCAL_KEYS = Object.freeze(BROWSER_EXPORT_LOCAL_KEYS.concat([
    'kc_search_preferences_v1',
    'kc_search_affinity_v1',
    'kc_home_category_affinity_v1',
    'kc_nav_module_affinity_v1',
    'kc_home_category_queue_v1',
    'kc_home_category_session_v1',
    'kc_home_category_merged_v1',
  ]));

  const BROWSER_CLEAR_SESSION_KEYS = Object.freeze([
    'kc_search_session_id',
  ]);

  const BROWSER_EXPORT_MAX_ITEMS = 200;
  const BROWSER_EXPORT_MAX_BYTES = 1024 * 1024;
  const PRIVACY_ACTION_STORAGE_PREFIX = 'kc_privacy_action_keys_v1:';
  const PRIVACY_ACTION_LEGACY_STORAGE_KEY = 'kc_privacy_action_keys_v1';
  const PRIVACY_ACTION_KINDS = new Set([
    'data_access_copy',
    'data_portability',
    'account_erasure',
  ]);

  function getSearchPreferenceStorageKeys(userId) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
      return ['kc_search_preferences_v1', 'kc_search_affinity_v1'];
    }
    const preferences = window.KCSearchPreferences;
    if (
      preferences &&
      typeof preferences.storageKeyForUser === 'function' &&
      typeof preferences.affinityStorageKeyForUser === 'function'
    ) {
      return [
        preferences.storageKeyForUser(normalizedUserId),
        preferences.affinityStorageKeyForUser(normalizedUserId),
      ].filter(Boolean);
    }
    const suffix = encodeURIComponent(normalizedUserId);
    return [
      `kc_search_preferences_v1:${suffix}`,
      `kc_search_affinity_v1:${suffix}`,
    ];
  }

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function getUserId(user) {
    return String(user && user.id || '').trim();
  }

  function isActiveAccountLoad(generation, userId) {
    return (
      state.accountLoadGeneration === generation &&
      getUserId(state.user) === String(userId || '').trim()
    );
  }

  function profileBelongsToUser(profile, userId) {
    if (!profile || typeof profile !== 'object') return false;
    const ownerId = String(profile.user_id || profile.userId || profile.id || '').trim();
    return Boolean(ownerId && ownerId === String(userId || '').trim());
  }

  function resetAccountBoundState(user) {
    const userId = getUserId(user);
    state.user = user || null;
    state.profile = null;
    state.notificationPreferences = getDefaultNotificationPreferences();
    state.notificationChannelTargets = getDefaultNotificationChannelTargets();
    state.dataSubjectRequests = [];
    state.dataSubjectRequestsLoadSequence += 1;
    state.privacyActionKeys = Object.create(null);
    state.privacyActionKeyUserId = userId;
    state.privacyProtocolLeases = new Map();
    state.privacyRequestFocusDisplacement = null;
    state.privacyBusy = false;
    state.privacyBusyLease = null;
    state.accountEmailActionsInFlight = Object.create(null);
    state.saving = false;
    state.lastRealPrimaryMethod = '';
    setPrivacyStatus('', '');
    [
      '#settingsSaveProfilePublic',
      '#settingsSaveContact',
      '#settingsSaveNotifications',
      '#settingsSaveVisibility',
      '#settingsResendConfirmation',
      '#settingsRequestReset',
      '#settingsLogout',
      '#settingsDownloadAccountData',
      '#settingsRequestDataPortability',
      '#settingsRequestAccountErasure',
      '#settingsRefreshDataRequests',
      '#settingsClearBrowserPrivacyData',
    ].forEach((selector) => restoreActionButton($(selector)));
    syncBrowserPrivacyClearAvailability();
    const userSummary = $('#settingsUserSummary');
    if (userSummary) userSummary.textContent = 'Carregando a conta atual...';
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value);
  }

  function normalizeNextPath(value) {
    if (shared && typeof shared.normalizeNextPath === 'function') {
      return shared.normalizeNextPath(value, '/settings.html');
    }
    const raw = String(value || '').trim();
    if (!raw) return '/settings.html';
    return raw.charAt(0) === '/' ? raw : `/${raw}`;
  }

  function readNextPath() {
    const params = new URLSearchParams(window.location.search || '');
    return normalizeNextPath(params.get('next') || '/index.html');
  }

  function buildAccountSetupHref() {
    const next = shared && typeof shared.normalizeNextPath === 'function'
      ? shared.normalizeNextPath(state.nextPath, '/index.html')
      : (state.nextPath || '/index.html');
    return `/account-setup.html?next=${encodeURIComponent(next)}`;
  }

  function buildProfileHref() {
    return state.user && state.user.id ? `/profile.html?id=${encodeURIComponent(state.user.id)}` : '/profile.html';
  }

  function buildCallbackUrl() {
    const url = new URL('/auth-callback.html', window.location.origin);
    url.searchParams.set('next', normalizeNextPath(state.nextPath));
    return url.toString();
  }

  function buildPreviewPostUrl() {
    const relativeHref = window.KCUtils && typeof window.KCUtils.buildProductDetailHref === 'function'
      ? window.KCUtils.buildProductDetailHref('demo')
      : `product.html?id=${encodeURIComponent('demo')}`;
    return new URL(relativeHref, window.location.origin).toString();
  }

  function normalizeSocialLinks(profile) {
    return shared && typeof shared.normalizeSocialLinks === 'function'
      ? shared.normalizeSocialLinks((profile && profile.social_links) || {})
      : ((profile && profile.social_links) || {});
  }

  function normalizeVisibility(profile) {
    return shared && typeof shared.normalizeSocialVisibility === 'function'
      ? shared.normalizeSocialVisibility((profile && profile.social_visibility) || {})
      : ((profile && profile.social_visibility) || {});
  }

  function getDefaultNotificationPreferences() {
    return shared && typeof shared.buildDefaultNotificationPreferences === 'function'
      ? shared.buildDefaultNotificationPreferences()
      : {
          comment_on_post: { in_app: true, email: false, whatsapp: false },
          comment_reply: { in_app: true, email: false, whatsapp: false },
          vote_on_post: { in_app: true, email: false, whatsapp: false },
          post_expired: { in_app: true, email: false, whatsapp: false },
          post_reported: { in_app: true, email: false, whatsapp: false },
          system: { in_app: true, email: false, whatsapp: false },
        };
  }

  function normalizeNotificationPreferences(value) {
    return shared && typeof shared.normalizeNotificationPreferences === 'function'
      ? shared.normalizeNotificationPreferences(value)
      : getDefaultNotificationPreferences();
  }

  function getDefaultNotificationChannelTargets() {
    return shared && typeof shared.buildDefaultNotificationChannelTargets === 'function'
      ? shared.buildDefaultNotificationChannelTargets()
      : {
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

  function normalizeNotificationChannelTargets(value) {
    return shared && typeof shared.normalizeNotificationChannelTargets === 'function'
      ? shared.normalizeNotificationChannelTargets(value)
      : getDefaultNotificationChannelTargets();
  }

  function setStatus(message, tone) {
    const status = $('#settingsStatus');
    if (!status) return;
    if (!message) {
      status.textContent = '';
      status.className = 'kc-settings-status';
      return;
    }
    status.textContent = message;
    status.className = 'kc-settings-status is-visible';
    if (tone) status.classList.add(`is-${tone}`);
  }

  function setPrivacyStatus(message, tone) {
    const status = $('#settingsPrivacyDataStatus');
    if (!status) return;
    if (!message) {
      status.textContent = '';
      status.className = 'kc-settings-status';
      return;
    }
    status.textContent = message;
    status.className = 'kc-settings-status is-visible';
    if (tone) status.classList.add(`is-${tone}`);
  }

  function formatPrivacyDate(value) {
    const parsed = Date.parse(String(value || ''));
    if (!Number.isFinite(parsed)) return '';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(parsed));
    } catch (_) {
      return new Date(parsed).toLocaleString('pt-BR');
    }
  }

  function getPrivacyActionStorageKey(userId) {
    const normalized = String(userId || '').trim();
    return normalized ? `${PRIVACY_ACTION_STORAGE_PREFIX}${encodeURIComponent(normalized)}` : '';
  }

  function parsePrivacyActionRecord(value, userId) {
    let parsed = value;
    try {
      if (typeof parsed === 'string') parsed = JSON.parse(parsed || 'null');
    } catch (_) {
      return null;
    }
    if (
      !parsed ||
      parsed.version !== 1 ||
      String(parsed.user_id || '') !== userId ||
      !parsed.keys ||
      typeof parsed.keys !== 'object' ||
      Array.isArray(parsed.keys)
    ) {
      return null;
    }
    const keys = Object.create(null);
    PRIVACY_ACTION_KINDS.forEach((kind) => {
      const key = String(parsed.keys[kind] || '').trim();
      if (
        key.startsWith(`settings-${kind}-`) &&
        /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key)
      ) {
        keys[kind] = key;
      }
    });
    return {
      version: 1,
      user_id: userId,
      keys,
    };
  }

  function privacyActionRecordBelongsToUser(value, userId) {
    let parsed = value;
    try {
      if (typeof parsed === 'string') parsed = JSON.parse(parsed || 'null');
    } catch (_) {
      return false;
    }
    return Boolean(
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      String(parsed.user_id || '') === userId
    );
  }

  function readPersistedPrivacyActionKeys() {
    const userId = String(state.user && state.user.id || '').trim();
    const storageKey = getPrivacyActionStorageKey(userId);
    if (!storageKey) return Object.create(null);
    try {
      const scoped = parsePrivacyActionRecord(
        window.sessionStorage.getItem(storageKey),
        userId
      );
      if (scoped) return scoped.keys;

      const legacyRaw = window.sessionStorage.getItem(PRIVACY_ACTION_LEGACY_STORAGE_KEY);
      const legacy = parsePrivacyActionRecord(legacyRaw, userId);
      if (!legacy) return Object.create(null);

      window.sessionStorage.setItem(storageKey, JSON.stringify(legacy));
      window.sessionStorage.removeItem(PRIVACY_ACTION_LEGACY_STORAGE_KEY);
      return legacy.keys;
    } catch (_) {
      return Object.create(null);
    }
  }

  function syncPrivacyActionKeyUser() {
    const userId = String(state.user && state.user.id || '').trim();
    if (state.privacyActionKeyUserId !== userId) {
      state.privacyActionKeys = Object.create(null);
      state.privacyActionKeyUserId = userId;
    }
    return userId;
  }

  function persistPrivacyActionKeys() {
    const userId = syncPrivacyActionKeyUser();
    const storageKey = getPrivacyActionStorageKey(userId);
    if (!storageKey) return;
    const keys = {};
    PRIVACY_ACTION_KINDS.forEach((kind) => {
      const value = String(state.privacyActionKeys[kind] || '').trim();
      if (value) keys[kind] = value;
    });
    try {
      if (Object.keys(keys).length) {
        window.sessionStorage.setItem(storageKey, JSON.stringify({
          version: 1,
          user_id: userId,
          keys,
        }));
      } else {
        window.sessionStorage.removeItem(storageKey);
      }
      const legacyRaw = window.sessionStorage.getItem(PRIVACY_ACTION_LEGACY_STORAGE_KEY);
      if (privacyActionRecordBelongsToUser(legacyRaw, userId)) {
        window.sessionStorage.removeItem(PRIVACY_ACTION_LEGACY_STORAGE_KEY);
      }
    } catch (_) {}
  }

  function getPrivacyActionKey(kind) {
    const normalized = String(kind || '').trim();
    if (!PRIVACY_ACTION_KINDS.has(normalized)) return '';
    syncPrivacyActionKeyUser();
    if (state.privacyActionKeys[normalized]) return state.privacyActionKeys[normalized];
    const persisted = readPersistedPrivacyActionKeys();
    if (persisted[normalized]) {
      state.privacyActionKeys[normalized] = persisted[normalized];
      return persisted[normalized];
    }
    let random = '';
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      random = window.crypto.randomUUID();
    } else if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      random = Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    } else {
      random = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    }
    const key = `settings-${normalized}-${random}`;
    state.privacyActionKeys[normalized] = key;
    persistPrivacyActionKeys();
    return key;
  }

  function clearPrivacyActionKey(kind) {
    const normalized = String(kind || '').trim();
    if (!PRIVACY_ACTION_KINDS.has(normalized)) return;
    syncPrivacyActionKeyUser();
    const persisted = readPersistedPrivacyActionKeys();
    PRIVACY_ACTION_KINDS.forEach((entryKind) => {
      if (!state.privacyActionKeys[entryKind] && persisted[entryKind]) {
        state.privacyActionKeys[entryKind] = persisted[entryKind];
      }
    });
    delete state.privacyActionKeys[normalized];
    persistPrivacyActionKeys();
  }

  function reconcilePrivacyActionKeys(requests) {
    const acceptedKinds = new Set();
    (Array.isArray(requests) ? requests : []).forEach((request) => {
      const kind = String(request && request.request_kind || '').trim();
      const status = String(request && request.status || '').trim();
      if (
        PRIVACY_ACTION_KINDS.has(kind) &&
        PRIVACY_ACCEPTED_REQUEST_STATUSES.has(status)
      ) {
        acceptedKinds.add(kind);
      }
    });
    acceptedKinds.forEach(clearPrivacyActionKey);
  }

  function getPrivacyErrorMessage(result, fallback) {
    const message = result && result.error && result.error.message
      ? String(result.error.message).trim()
      : '';
    return message || fallback;
  }

  function hasActiveAccountErasure(requests) {
    return Array.isArray(requests) && requests.some((request) => (
      request &&
      request.request_kind === 'account_erasure' &&
      PRIVACY_ERASURE_BLOCKING_STATUSES.has(String(request.status || ''))
    ));
  }

  function hasPrivacyWorkInFlight() {
    if (state.privacyBusy) return true;
    return state.privacyProtocolLeases instanceof Map && state.privacyProtocolLeases.size > 0;
  }

  function syncBrowserPrivacyClearAvailability() {
    const button = $('#settingsClearBrowserPrivacyData');
    if (!button) return;
    const blocked = hasPrivacyWorkInFlight();
    button.disabled = blocked;
    button.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    if (blocked) {
      button.dataset.privacyOperationBlocked = '1';
      button.title = 'Aguarde a operação de privacidade em andamento.';
    } else if (button.dataset.privacyOperationBlocked === '1') {
      delete button.dataset.privacyOperationBlocked;
      button.removeAttribute('title');
    }
  }

  function beginPrivacyOperation() {
    if (state.privacyBusy) return null;
    const lease = Object.freeze({});
    state.privacyBusy = true;
    state.privacyBusyLease = lease;
    syncBrowserPrivacyClearAvailability();
    return lease;
  }

  function endPrivacyOperation(lease) {
    if (!lease || state.privacyBusyLease !== lease) return false;
    state.privacyBusy = false;
    state.privacyBusyLease = null;
    syncBrowserPrivacyClearAvailability();
    return true;
  }

  function normalizePrivacyProtocol(value) {
    return String(value || '').trim().toUpperCase();
  }

  function getCurrentPrivacyProtocolLease(protocol) {
    const normalizedProtocol = normalizePrivacyProtocol(protocol);
    const leases = state.privacyProtocolLeases;
    if (!normalizedProtocol || !(leases instanceof Map)) return null;
    const lease = leases.get(normalizedProtocol);
    if (
      !lease ||
      lease.ownerMap !== leases ||
      lease.userId !== getUserId(state.user)
    ) {
      return null;
    }
    return lease;
  }

  function findPrivacyRequestRow(container, protocol) {
    const normalizedProtocol = normalizePrivacyProtocol(protocol);
    if (!container || !normalizedProtocol) return null;
    return Array.from(container.querySelectorAll('[data-privacy-request-row]')).find(
      (row) => normalizePrivacyProtocol(row.dataset.privacyRequestProtocol) === normalizedProtocol
    ) || null;
  }

  function findPrivacyRequestAction(container, protocol, action) {
    const row = findPrivacyRequestRow(container, protocol);
    const normalizedAction = String(action || '').trim();
    if (!row || !normalizedAction) return null;
    return Array.from(row.querySelectorAll('[data-privacy-request-action]')).find(
      (button) => String(button.dataset.privacyRequestAction || '') === normalizedAction
    ) || null;
  }

  function capturePrivacyRequestFocus(container) {
    const active = document.activeElement;
    if (!container || !active || !container.contains(active)) return null;
    const row = typeof active.closest === 'function'
      ? active.closest('[data-privacy-request-row]')
      : null;
    if (!row || !container.contains(row)) return null;
    const actionElement = typeof active.closest === 'function'
      ? active.closest('[data-privacy-request-action]')
      : null;
    const generation = Number(row.dataset.privacyRequestGeneration);
    return {
      protocol: normalizePrivacyProtocol(row.dataset.privacyRequestProtocol),
      action: actionElement
        ? String(actionElement.dataset.privacyRequestAction || '').trim()
        : '',
      generation: Number.isSafeInteger(generation)
        ? generation
        : state.accountLoadGeneration,
      userId: getUserId(state.user),
      sourceElement: active,
    };
  }

  function canRestorePrivacyRequestFocus(intent) {
    return Boolean(
      intent &&
      intent.protocol &&
      intent.userId === getUserId(state.user) &&
      intent.generation === state.accountLoadGeneration
    );
  }

  function focusPrivacyRequestElement(element) {
    if (!element || element.disabled === true || typeof element.focus !== 'function') return false;
    if (
      !/^(?:A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(String(element.tagName || '')) &&
      !element.hasAttribute('tabindex')
    ) {
      element.setAttribute('tabindex', '-1');
    }
    try {
      element.focus({ preventScroll: true });
    } catch (_) {
      try {
        element.focus();
      } catch (_) {
        return false;
      }
    }
    return document.activeElement === element;
  }

  function restorePrivacyRequestFocus(container, intent) {
    if (!container || !canRestorePrivacyRequestFocus(intent)) return null;
    const action = findPrivacyRequestAction(container, intent.protocol, intent.action);
    if (action && action.disabled !== true && focusPrivacyRequestElement(action)) {
      return action;
    }
    const row = findPrivacyRequestRow(container, intent.protocol);
    if (row && focusPrivacyRequestElement(row)) return row;
    const refreshButton = $('#settingsRefreshDataRequests');
    if (
      refreshButton &&
      refreshButton.disabled !== true &&
      focusPrivacyRequestElement(refreshButton)
    ) {
      return refreshButton;
    }
    const status = $('#settingsPrivacyDataStatus');
    if (status && focusPrivacyRequestElement(status)) return status;
    return focusPrivacyRequestElement(container) ? container : null;
  }

  function beginDataSubjectRequestRender(container) {
    let intent = capturePrivacyRequestFocus(container);
    let lease = intent && intent.action
      ? getCurrentPrivacyProtocolLease(intent.protocol)
      : null;
    const active = document.activeElement;
    const displacement = state.privacyRequestFocusDisplacement;
    const validDisplacement = Boolean(
      displacement &&
      displacement.lease &&
      displacement.lease.ownerMap === state.privacyProtocolLeases &&
      displacement.lease.ownerMap.get(displacement.lease.protocol) === displacement.lease &&
      canRestorePrivacyRequestFocus(displacement.intent)
    );
    if (
      intent &&
      !intent.action &&
      validDisplacement &&
      intent.protocol === displacement.intent.protocol &&
      active === displacement.lease.focus.fallbackElement
    ) {
      intent = displacement.intent;
      lease = displacement.lease;
    } else if (
      !intent &&
      (active === document.body || active === document.documentElement) &&
      validDisplacement
    ) {
      intent = displacement.intent;
      lease = displacement.lease;
    } else if (!intent && active && active !== document.body && active !== document.documentElement) {
      state.privacyRequestFocusDisplacement = null;
    }
    container.replaceChildren();
    return { intent, lease };
  }

  function finishDataSubjectRequestRender(container, renderContext) {
    const context = renderContext || {};
    const intent = context.intent;
    if (!intent) return null;
    const focused = restorePrivacyRequestFocus(container, intent);
    if (
      context.lease &&
      context.lease.focus &&
      context.lease.ownerMap.get(context.lease.protocol) === context.lease
    ) {
      context.lease.focus.intent = intent;
      context.lease.focus.fallbackElement = focused;
    }
    return focused;
  }

  function syncPrivacyProtocolControls(protocol, rowOverride) {
    const container = $('#settingsDataSubjectRequests');
    const normalizedProtocol = normalizePrivacyProtocol(protocol);
    const row = rowOverride || findPrivacyRequestRow(container, normalizedProtocol);
    if (!row || !normalizedProtocol) return;
    const busy = Boolean(getCurrentPrivacyProtocolLease(normalizedProtocol));
    row.setAttribute('aria-busy', busy ? 'true' : 'false');
    Array.from(row.querySelectorAll('[data-privacy-request-action]')).forEach((button) => {
      if (busy) {
        button.dataset.privacyProtocolLeaseDisabled = '1';
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        return;
      }
      if (button.dataset.privacyProtocolLeaseDisabled === '1') {
        delete button.dataset.privacyProtocolLeaseDisabled;
        button.disabled = false;
        button.setAttribute('aria-disabled', 'false');
      }
    });
  }

  function reportPrivacyProtocolBusy(protocol) {
    const normalizedProtocol = normalizePrivacyProtocol(protocol);
    setPrivacyStatus(
      `Já existe uma operação em andamento para o protocolo ${normalizedProtocol}. Aguarde a conclusão antes de baixar ou cancelar este pedido.`,
      'info'
    );
  }

  function beginPrivacyProtocolOperation(protocol, action, button) {
    const normalizedProtocol = normalizePrivacyProtocol(protocol);
    const normalizedAction = String(action || '').trim();
    const userId = getUserId(state.user);
    const ownerMap = state.privacyProtocolLeases;
    if (!normalizedProtocol || !userId || !(ownerMap instanceof Map)) return null;
    if (ownerMap.has(normalizedProtocol)) {
      reportPrivacyProtocolBusy(normalizedProtocol);
      return null;
    }
    const focusIntent = capturePrivacyRequestFocus($('#settingsDataSubjectRequests'));
    const ownsFocusedAction = Boolean(
      focusIntent &&
      focusIntent.protocol === normalizedProtocol &&
      focusIntent.action === normalizedAction &&
      document.activeElement === button
    );
    const lease = {
      protocol: normalizedProtocol,
      action: normalizedAction,
      generation: state.accountLoadGeneration,
      userId,
      ownerMap,
      focus: {
        intent: ownsFocusedAction ? focusIntent : null,
        fallbackElement: null,
      },
    };
    ownerMap.set(normalizedProtocol, lease);
    if (ownsFocusedAction) {
      state.privacyRequestFocusDisplacement = {
        lease,
        intent: focusIntent,
      };
    }
    syncPrivacyProtocolControls(normalizedProtocol);
    syncBrowserPrivacyClearAvailability();
    return lease;
  }

  function endPrivacyProtocolOperation(lease) {
    if (
      !lease ||
      !(lease.ownerMap instanceof Map) ||
      lease.ownerMap.get(lease.protocol) !== lease
    ) {
      return false;
    }
    lease.ownerMap.delete(lease.protocol);
    const ownsCurrentAccountMap = (
      state.privacyProtocolLeases === lease.ownerMap &&
      getUserId(state.user) === lease.userId
    );
    if (!ownsCurrentAccountMap) return false;

    const intent = lease.focus && lease.focus.intent;
    const fallbackElement = lease.focus && lease.focus.fallbackElement;
    const displacement = state.privacyRequestFocusDisplacement;
    const shouldRestoreFocus = Boolean(
      canRestorePrivacyRequestFocus(intent) &&
      (
        (fallbackElement && document.activeElement === fallbackElement) ||
        (
          displacement &&
          displacement.lease === lease &&
          document.activeElement === document.body
        )
      )
    );
    syncPrivacyProtocolControls(lease.protocol);
    syncBrowserPrivacyClearAvailability();
    if (shouldRestoreFocus) {
      restorePrivacyRequestFocus($('#settingsDataSubjectRequests'), intent);
    }
    if (
      state.privacyRequestFocusDisplacement &&
      state.privacyRequestFocusDisplacement.lease === lease
    ) {
      state.privacyRequestFocusDisplacement = null;
    }
    return true;
  }

  function isPrivacyDownloadAvailable(request, exportBlockedByErasure) {
    if (exportBlockedByErasure) return false;
    if (!request || !PRIVACY_DOWNLOADABLE_STATUSES.has(String(request.status || ''))) return false;
    const expiresAt = Date.parse(String(request.expires_at || ''));
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  }

  function isPrivacyRequestCancellable(request) {
    const kind = String(request && request.request_kind || '');
    const status = String(request && request.status || '');
    if (kind === 'account_erasure') {
      return status === 'received' || status === 'pending_confirmation';
    }
    if (kind === 'data_access_copy' || kind === 'data_portability') {
      return ['received', 'processing', 'ready', 'failed', 'partial_failure'].includes(status);
    }
    return false;
  }

  function isSupplementDownloadAvailable(request, exportBlockedByErasure) {
    if (exportBlockedByErasure) return false;
    const supplement = request && request.supplement;
    if (!supplement || !['ready', 'delivered'].includes(String(supplement.status || ''))) return false;
    const expiresAt = Date.parse(String(supplement.expires_at || ''));
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  }

  function saveJsonDownload(payload, filename) {
    const safeFilename = String(filename || 'kino-campus-meus-dados.json')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .slice(0, 180) || 'kino-campus-meus-dados.json';
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = safeFilename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(href);
    }, 1000);
  }

  function parseBrowserStorageValue(raw) {
    const text = String(raw == null ? '' : raw);
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  function collectBrowserStorageItems(storage, storageName, exactKeys, prefixes, budget, acceptItem) {
    if (!storage || !budget || budget.items >= BROWSER_EXPORT_MAX_ITEMS) return [];
    const allowedKeys = new Set(exactKeys || []);
    const allowedPrefixes = Array.isArray(prefixes) ? prefixes : [];
    const keys = [];

    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = String(storage.key(index) || '');
        if (
          allowedKeys.has(key) ||
          allowedPrefixes.some((prefix) => prefix && key.startsWith(prefix))
        ) {
          keys.push(key);
        }
      }
    } catch (_) {
      budget.readError = true;
      return [];
    }

    return keys.sort().reduce((items, key) => {
      if (budget.items >= BROWSER_EXPORT_MAX_ITEMS || budget.bytes >= BROWSER_EXPORT_MAX_BYTES) {
        budget.truncated = true;
        return items;
      }
      try {
        const raw = storage.getItem(key);
        if (raw == null) return items;
        const value = parseBrowserStorageValue(raw);
        if (typeof acceptItem === 'function' && acceptItem(key, value) !== true) {
          return items;
        }
        const itemBytes = new Blob([key, raw]).size;
        if ((budget.bytes + itemBytes) > BROWSER_EXPORT_MAX_BYTES) {
          budget.truncated = true;
          return items;
        }
        budget.items += 1;
        budget.bytes += itemBytes;
        items.push({
          storage: storageName,
          key,
          value,
        });
        return items;
      } catch (_) {
        budget.readError = true;
        return items;
      }
    }, []);
  }

  function collectBrowserDataExport() {
    const budget = { items: 0, bytes: 0, truncated: false, readError: false };
    const userId = String(state.user && state.user.id || '').trim();
    const localPrefixes = userId ? [`kc:chat:draft:${userId}:`] : [];
    const localExactKeys = BROWSER_EXPORT_LOCAL_KEYS.concat(
      getSearchPreferenceStorageKeys(userId)
    );
    let localItems = [];

    try {
      localItems = collectBrowserStorageItems(
        window.localStorage,
        'localStorage',
        localExactKeys,
        localPrefixes,
        budget
      );
    } catch (_) {
      budget.readError = true;
    }

    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source: 'current_browser',
      items: localItems,
      manifest: {
        item_count: budget.items,
        approximate_bytes: budget.bytes,
        completeness: budget.truncated || budget.readError ? 'partial' : 'complete',
        limitations: [
          'Preferências de busca e afinidade comportamental são limitadas ao identificador desta conta; configurações neutras do dispositivo podem ser compartilhadas por quem usa este navegador.',
          'Tokens, credenciais, sessão de autenticação, caches técnicos e dados possivelmente pertencentes a outra conta nunca são exportados.',
          'Dados locais de outro navegador ou dispositivo só podem ser obtidos naquele próprio navegador.',
        ].concat(budget.truncated
          ? ['O limite local de 200 itens ou 1 MiB foi atingido; alguns itens permitidos não entraram no arquivo.']
          : []).concat(budget.readError
          ? ['O navegador bloqueou a leitura de parte do armazenamento local.']
          : []),
      },
    };
  }

  async function sha256Utf8(value) {
    if (
      !window.crypto ||
      !window.crypto.subtle ||
      typeof window.crypto.subtle.digest !== 'function' ||
      typeof window.TextEncoder !== 'function'
    ) {
      return null;
    }
    const encoded = new window.TextEncoder().encode(String(value || ''));
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  async function combineServerAndBrowserExport(serverExport) {
    const source = serverExport && typeof serverExport === 'object' ? serverExport : {};
    const combined = Object.assign({}, source);
    const serverIntegrity = combined.integrity && typeof combined.integrity === 'object'
      ? Object.assign({}, combined.integrity)
      : null;
    delete combined.integrity;
    combined.browser_local_data = collectBrowserDataExport();
    if (serverIntegrity) {
      combined.server_integrity = Object.assign({}, serverIntegrity, {
        scope: serverIntegrity.scope || 'server_export_core_before_integrity_and_browser_local_data',
      });
    }

    const canonical = JSON.stringify(combined);
    const finalHash = await sha256Utf8(canonical);
    combined.integrity = finalHash
      ? {
          algorithm: 'SHA-256',
          scope: 'all_top_level_fields_except_integrity_serialized_as_utf8_json',
          payload_sha256: finalHash,
          payload_bytes: new window.TextEncoder().encode(canonical).byteLength,
        }
      : {
          algorithm: null,
          scope: 'final_download',
          payload_sha256: null,
          verified: false,
          unavailable_reason: 'browser_cryptography_unavailable',
        };
    return combined;
  }

  function removeAllowedBrowserStorage(storage, exactKeys, prefixes) {
    if (!storage) return 0;
    const allowedKeys = new Set(exactKeys || []);
    const allowedPrefixes = Array.isArray(prefixes) ? prefixes : [];
    const removable = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = String(storage.key(index) || '');
        if (
          allowedKeys.has(key) ||
          allowedPrefixes.some((prefix) => prefix && key.startsWith(prefix))
        ) {
          removable.push(key);
        }
      }
      removable.forEach((key) => storage.removeItem(key));
      return removable.length;
    } catch (_) {
      return 0;
    }
  }

  function clearBrowserPrivacyData() {
    const button = $('#settingsClearBrowserPrivacyData');
    if (hasPrivacyWorkInFlight()) {
      syncBrowserPrivacyClearAvailability();
      setPrivacyStatus(
        'Aguarde a operação do protocolo terminar antes de limpar os dados locais. Nenhuma chave da operação em andamento foi removida.',
        'warn'
      );
      return false;
    }
    const confirmed = window.confirm(
      'Remover as preferências, consentimentos e afinidades compartilhadas neste navegador, além dos rascunhos de chat desta conta? Tokens de login não serão alterados. Esta ação local não pode ser desfeita.'
    );
    if (!confirmed) return false;

    const userId = String(state.user && state.user.id || '').trim();
    const privacyStorageKey = getPrivacyActionStorageKey(userId);
    const localPrefixes = userId ? [`kc:chat:draft:${userId}:`] : [];
    const localExactKeys = BROWSER_CLEAR_LOCAL_KEYS.concat(
      getSearchPreferenceStorageKeys(userId)
    );
    setActionButtonState(button, 'loading', 'Limpando...');
    try {
      if (window.KCConsent && typeof window.KCConsent.rejectOptional === 'function') {
        window.KCConsent.rejectOptional('privacy_data_clear');
      }
    } catch (_) {}
    let localStorageRef = null;
    let sessionStorageRef = null;
    try { localStorageRef = window.localStorage; } catch (_) {}
    try { sessionStorageRef = window.sessionStorage; } catch (_) {}
    let removed = removeAllowedBrowserStorage(
      localStorageRef,
      localExactKeys,
      localPrefixes
    ) + removeAllowedBrowserStorage(
      sessionStorageRef,
      BROWSER_CLEAR_SESSION_KEYS.concat(privacyStorageKey ? [privacyStorageKey] : []),
      []
    );
    try {
      const legacyRaw = sessionStorageRef
        ? sessionStorageRef.getItem(PRIVACY_ACTION_LEGACY_STORAGE_KEY)
        : null;
      if (
        sessionStorageRef &&
        privacyActionRecordBelongsToUser(legacyRaw, userId)
      ) {
        sessionStorageRef.removeItem(PRIVACY_ACTION_LEGACY_STORAGE_KEY);
        removed += 1;
      }
    } catch (_) {}
    state.privacyActionKeys = Object.create(null);
    state.privacyActionKeyUserId = userId;
    try {
      window.dispatchEvent(new CustomEvent('kc:privacy-local-data-cleared', {
        detail: { userId, removed },
      }));
    } catch (_) {}
    setActionButtonState(button, 'success', 'Dados locais removidos');
    setPrivacyStatus(
      removed
        ? `${removed} item(ns) permitido(s) foram removidos deste navegador. Algumas preferências locais podem ser compartilhadas por quem usa este dispositivo; dados da conta no servidor não foram alterados.`
        : 'Nenhum dado local permitido foi encontrado neste navegador.',
      'success'
    );
    return true;
  }

  function renderDataSubjectRequests(items) {
    const container = $('#settingsDataSubjectRequests');
    if (!container) return;
    const renderContext = beginDataSubjectRequestRender(container);
    container.setAttribute('aria-busy', 'false');

    const allRequests = Array.isArray(items) ? items : [];
    const exportBlockedByErasure = hasActiveAccountErasure(allRequests);
    const requests = allRequests.slice(0, 20);
    if (!requests.length) {
      const empty = document.createElement('p');
      empty.className = 'kc-settings-help';
      empty.setAttribute('role', 'listitem');
      empty.textContent = 'Nenhum pedido protocolado nesta conta.';
      container.appendChild(empty);
      finishDataSubjectRequestRender(container, renderContext);
      return;
    }

    requests.forEach((request) => {
      const protocol = normalizePrivacyProtocol(request && request.protocol);
      const row = document.createElement('article');
      row.className = 'kc-settings-row';
      row.setAttribute('role', 'listitem');
      row.setAttribute('tabindex', '-1');
      row.setAttribute('data-privacy-request-row', '');
      row.dataset.privacyRequestProtocol = protocol;
      row.dataset.privacyRequestGeneration = String(state.accountLoadGeneration);

      const body = document.createElement('div');
      body.className = 'kc-settings-network__body';
      const title = document.createElement('strong');
      title.textContent = PRIVACY_KIND_LABELS[request.request_kind] || 'Solicitação de dados';
      const summary = document.createElement('p');
      const status = PRIVACY_STATUS_LABELS[request.status] || String(request.status || 'Em análise');
      const createdAt = formatPrivacyDate(request.created_at);
      const isExportRequest = ['data_access_copy', 'data_portability'].includes(
        String(request.request_kind || '')
      );
      summary.textContent = `${status} · Protocolo ${String(request.protocol || 'indisponível')}${createdAt ? ` · ${createdAt}` : ''}`;
      body.append(title, summary);

      if (
        isExportRequest &&
        request.expires_at &&
        PRIVACY_DOWNLOADABLE_STATUSES.has(String(request.status || ''))
      ) {
        const expiry = document.createElement('p');
        const expiresAt = formatPrivacyDate(request.expires_at);
        expiry.textContent = exportBlockedByErasure
          ? 'Download bloqueado enquanto o pedido de exclusão estiver ativo. Cancele a exclusão enquanto ela ainda for reversível e atualize os protocolos.'
          : isPrivacyDownloadAvailable(request)
          ? `Novo download disponível até ${expiresAt}.`
          : `A janela de novo download terminou em ${expiresAt}. O protocolo permanece registrado.`;
        body.appendChild(expiry);
      }
      if (request.supplement && request.supplement.status) {
        const supplementStatus = document.createElement('p');
        supplementStatus.textContent = exportBlockedByErasure
          ? 'O complemento também fica bloqueado durante a exclusão ativa.'
          : isSupplementDownloadAvailable(request)
          ? request.supplement.status === 'delivered'
            ? `Complemento integral já preparado; novo download disponível até ${formatPrivacyDate(request.supplement.expires_at)}.`
            : `Complemento integral pronto até ${formatPrivacyDate(request.supplement.expires_at)}.`
          : request.supplement.status === 'queued' || request.supplement.status === 'failed'
            ? 'Complemento integral em revisão assistida pela Central de Ajuda.'
            : request.supplement.status === 'delivered'
              ? 'A janela de novo download do complemento terminou.'
              : 'Complemento integral indisponível nesta janela; acompanhe o protocolo.';
        body.appendChild(supplementStatus);
      }

      const actions = document.createElement('div');
      actions.className = 'kc-settings-actions';

      if (isSupplementDownloadAvailable(request, exportBlockedByErasure)) {
        const supplementDownload = document.createElement('button');
        supplementDownload.type = 'button';
        supplementDownload.className = 'kc-settings-btn';
        supplementDownload.textContent = 'Baixar complemento integral';
        supplementDownload.dataset.privacyRequestProtocol = protocol;
        supplementDownload.dataset.privacyRequestAction = 'download_supplement';
        supplementDownload.setAttribute('aria-disabled', 'false');
        supplementDownload.setAttribute(
          'aria-label',
          `Baixar complemento integral do protocolo ${String(request.protocol || 'indisponível')}`
        );
        supplementDownload.addEventListener('click', function () {
          downloadDataSubjectSupplement(request, supplementDownload);
        });
        actions.appendChild(supplementDownload);
      }

      if (
        isExportRequest &&
        isPrivacyDownloadAvailable(request, exportBlockedByErasure)
      ) {
        const download = document.createElement('button');
        download.type = 'button';
        download.className = 'kc-settings-btn';
        download.textContent = 'Baixar novamente';
        download.dataset.privacyRequestProtocol = protocol;
        download.dataset.privacyRequestAction = 'download_export';
        download.setAttribute('aria-disabled', 'false');
        download.setAttribute(
          'aria-label',
          `Baixar novamente ${PRIVACY_KIND_LABELS[request.request_kind] || 'solicitação'} do protocolo ${String(request.protocol || 'indisponível')}`
        );
        download.addEventListener('click', function () {
          downloadDataSubjectExport(request, download);
        });
        actions.appendChild(download);
      }

      if (isPrivacyRequestCancellable(request)) {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'kc-settings-btn is-danger';
        cancel.textContent = 'Cancelar pedido';
        cancel.dataset.privacyRequestProtocol = protocol;
        cancel.dataset.privacyRequestAction = 'cancel';
        cancel.setAttribute('aria-disabled', 'false');
        cancel.setAttribute(
          'aria-label',
          `Cancelar ${PRIVACY_KIND_LABELS[request.request_kind] || 'solicitação'} do protocolo ${String(request.protocol || 'indisponível')}`
        );
        cancel.addEventListener('click', function () {
          cancelDataSubjectRequest(request, cancel);
        });
        actions.appendChild(cancel);
      }

      row.append(body, actions);
      container.appendChild(row);
      syncPrivacyProtocolControls(protocol, row);
    });
    finishDataSubjectRequestRender(container, renderContext);
  }

  function renderDataSubjectRequestsUnavailable() {
    const container = $('#settingsDataSubjectRequests');
    if (!container) return;
    const renderContext = beginDataSubjectRequestRender(container);
    container.setAttribute('aria-busy', 'false');
    const unavailable = document.createElement('p');
    unavailable.className = 'kc-settings-help';
    unavailable.setAttribute('role', 'listitem');
    unavailable.textContent = 'Não foi possível consultar seus protocolos agora. Isso não significa que não existam pedidos. Tente atualizar novamente ou use a Central de Ajuda.';
    container.appendChild(unavailable);
    finishDataSubjectRequestRender(container, renderContext);
  }

  function renderDataSubjectRequestsLoading() {
    const container = $('#settingsDataSubjectRequests');
    if (!container) return;
    const renderContext = beginDataSubjectRequestRender(container);
    container.setAttribute('aria-busy', 'true');
    const loading = document.createElement('p');
    loading.className = 'kc-settings-help';
    loading.setAttribute('role', 'listitem');
    loading.textContent = 'Consultando os protocolos desta conta...';
    container.appendChild(loading);
    finishDataSubjectRequestRender(container, renderContext);
  }

  async function loadDataSubjectRequests(options) {
    const opts = options || {};
    const loadSequence = ++state.dataSubjectRequestsLoadSequence;
    if (!state.user || !window.KCAPI || typeof window.KCAPI.listDataSubjectRequests !== 'function') {
      renderDataSubjectRequestsUnavailable();
      setPrivacyStatus('Os controles autenticados não estão disponíveis neste ambiente. Use a Central de Ajuda.', 'warn');
      return [];
    }

    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    const isCurrentLoad = () => (
      state.dataSubjectRequestsLoadSequence === loadSequence &&
      isActiveAccountLoad(generation, userId)
    );
    const refreshButton = $('#settingsRefreshDataRequests');
    const requestsContainer = $('#settingsDataSubjectRequests');
    if (requestsContainer) requestsContainer.setAttribute('aria-busy', 'true');
    if (opts.userInitiated) setActionButtonState(refreshButton, 'loading', 'Atualizando...');
    if (!opts.userInitiated && !state.dataSubjectRequests.length) {
      renderDataSubjectRequestsLoading();
    }
    try {
      const requestedLimit = 20;
      const result = await window.KCAPI.listDataSubjectRequests({
        limit: requestedLimit,
        expected_user_id: userId,
      });
      if (!isCurrentLoad()) return [];
      if (!result || result.ok === false || result.error) {
        if (state.dataSubjectRequests.length) {
          renderDataSubjectRequests(state.dataSubjectRequests);
        } else {
          renderDataSubjectRequestsUnavailable();
        }
        setPrivacyStatus(
          getPrivacyErrorMessage(result, 'Não foi possível carregar os protocolos agora.'),
          'error'
        );
        return state.dataSubjectRequests;
      }
      let requests = Array.isArray(result.data && result.data.items)
        ? result.data.items
        : [];
      if (typeof window.KCAPI.getDataSubjectRequest === 'function') {
        const enriched = await Promise.all(requests.map(async (request) => {
          if (
            !['data_access_copy', 'data_portability'].includes(
              String(request.request_kind || '')
            ) ||
            !PRIVACY_SUPPLEMENT_DETAIL_STATUSES.has(String(request.status || ''))
          ) return request;
          const detail = await window.KCAPI.getDataSubjectRequest(request.protocol, {
            expected_user_id: userId,
          });
          return detail && detail.ok === true && detail.data
            ? { ...request, supplement: detail.data.supplement || null }
            : request;
        }));
        if (!isCurrentLoad()) return [];
        requests = enriched;
      }
      if (!isCurrentLoad()) return [];
      state.dataSubjectRequests = requests;
      reconcilePrivacyActionKeys(state.dataSubjectRequests);
      renderDataSubjectRequests(state.dataSubjectRequests);
      if (opts.userInitiated) {
        setPrivacyStatus('Protocolos atualizados.', 'success');
        setActionButtonState(refreshButton, 'success', 'Atualizado');
      } else {
        setActionButtonState(refreshButton, 'idle');
      }
      return state.dataSubjectRequests;
    } catch (_) {
      if (!isCurrentLoad()) return [];
      if (state.dataSubjectRequests.length) {
        renderDataSubjectRequests(state.dataSubjectRequests);
      } else {
        renderDataSubjectRequestsUnavailable();
      }
      setActionButtonState(refreshButton, 'idle');
      setPrivacyStatus('Não foi possível carregar os protocolos agora.', 'error');
      return state.dataSubjectRequests;
    }
  }

  async function createDataSubjectRequest(kind) {
    if (!state.user || !window.KCAPI || typeof window.KCAPI.createDataSubjectRequest !== 'function') {
      return {
        ok: false,
        error: { message: 'Entre na conta ou use a Central de Ajuda para abrir este pedido.' },
      };
    }
    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const idempotencyKey = getPrivacyActionKey(kind);
      const result = await window.KCAPI.createDataSubjectRequest({
        request_kind: kind,
        request_source: 'settings',
        idempotency_key: idempotencyKey,
        expected_user_id: userId,
      });
      if (!isActiveAccountLoad(generation, userId)) {
        return {
          ok: false,
          error: {
            code: 'ACCOUNT_CHANGED',
            message: 'A conta ativa mudou durante a operação. Confira os protocolos da conta atual.',
          },
        };
      }
      const request = result && result.data && result.data.request;
      const terminalIdempotencyReplay = Boolean(
        result &&
        result.ok === true &&
        request &&
        result.data.reused_existing === true &&
        result.data.reuse_reason === 'idempotency_key' &&
        !PRIVACY_ACCEPTED_REQUEST_STATUSES.has(String(request.status || ''))
      );
      if (terminalIdempotencyReplay) {
        clearPrivacyActionKey(kind);
        if (attempt === 0) continue;
        return {
          ok: false,
          error: {
            code: 'IDEMPOTENCY_ROTATION_CONFLICT',
            message: 'O protocolo anterior já estava encerrado. Atualize a página e tente novamente.',
          },
        };
      }
      if (result && result.ok === true && request) {
        clearPrivacyActionKey(kind);
      }
      return result;
    }
    return {
      ok: false,
      error: {
        code: 'IDEMPOTENCY_ROTATION_CONFLICT',
        message: 'Não foi possível abrir um novo protocolo com segurança.',
      },
    };
  }

  function describePartialExport(exportPayload, protocol) {
    const manifest = exportPayload && exportPayload.manifest || {};
    const categoryResults = Array.isArray(manifest && manifest.category_results)
      ? manifest.category_results
      : [];
    const affectedCategories = categoryResults
      .filter((item) => item && (item.truncated === true || item.status === 'unavailable'))
      .map((item) => String(item.key || '').trim().replace(/_/g, ' '))
      .filter(Boolean);
    const categorySummary = affectedCategories.length
      ? ` Categorias afetadas: ${affectedCategories.slice(0, 6).join(', ')}${affectedCategories.length > 6 ? ' e outras' : ''}.`
      : '';
    const unavailableMedia = Number(
      exportPayload &&
      exportPayload.media_manifest &&
      exportPayload.media_manifest.unavailable_chat_media_count
    );
    const mediaSummary = Number.isFinite(unavailableMedia) && unavailableMedia > 0
      ? ` ${unavailableMedia} anexo(s) de conversa também exigem entrega assistida.`
      : '';
    return `O arquivo do protocolo ${protocol} é parcial, foi preparado e o download foi iniciado. O complemento manual continua necessário e vinculado a este protocolo.${categorySummary}${mediaSummary} Confira a pasta de downloads, consulte o manifesto do arquivo e acompanhe o protocolo; se precisar, use a Central de Ajuda.`;
  }

  async function downloadDataSubjectExport(request, button) {
    const protocol = normalizePrivacyProtocol(request && request.protocol);
    if (hasActiveAccountErasure(state.dataSubjectRequests)) {
      setActionButtonState(button, 'idle');
      setPrivacyStatus(
        'O download fica bloqueado enquanto o pedido de exclusão estiver ativo. Cancele a exclusão enquanto ela ainda for reversível e atualize os protocolos.',
        'warn'
      );
      return false;
    }
    if (!protocol || !window.KCAPI || typeof window.KCAPI.downloadDataSubjectExport !== 'function') {
      setPrivacyStatus('Não foi possível iniciar o download. Use o protocolo na Central de Ajuda.', 'error');
      return false;
    }
    const protocolLease = beginPrivacyProtocolOperation(protocol, 'download_export', button);
    if (!protocolLease) return false;
    const generation = protocolLease.generation;
    const userId = protocolLease.userId;
    setActionButtonState(button, 'loading', 'Preparando JSON...');
    setPrivacyStatus(`Preparando a cópia do protocolo ${protocol}. Não feche esta página.`, 'info');
    try {
      const result = await window.KCAPI.downloadDataSubjectExport(protocol, {
        expected_user_id: userId,
      });
      if (!isActiveAccountLoad(generation, userId)) return false;
      if (!result || result.ok === false || result.error || !result.data || !result.data.export) {
        setActionButtonState(button, 'idle');
        setPrivacyStatus(
          getPrivacyErrorMessage(result, `Não foi possível baixar o protocolo ${protocol}.`),
          'error'
        );
        await loadDataSubjectRequests({ silent: true });
        return false;
      }
      const combinedExport = await combineServerAndBrowserExport(result.data.export);
      if (!isActiveAccountLoad(generation, userId)) return false;
      saveJsonDownload(combinedExport, result.data.filename);
      const completeness = result.data.export &&
        result.data.export.manifest &&
        result.data.export.manifest.completeness;
      const complete = completeness === 'complete_within_automated_scope';
      setActionButtonState(button, complete ? 'success' : 'warn', 'Download iniciado');
      setPrivacyStatus(
        complete
          ? `Arquivo do protocolo ${protocol} preparado e download iniciado. Confira a pasta de downloads e guarde o arquivo em local seguro.`
          : describePartialExport(result.data.export, protocol),
        complete ? 'success' : 'warn'
      );
      await loadDataSubjectRequests({ silent: true });
      return true;
    } catch (_) {
      if (!isActiveAccountLoad(generation, userId)) return false;
      console.error('[Settings] privacy export download failed.');
      setActionButtonState(button, 'idle');
      setPrivacyStatus(`Não foi possível baixar o protocolo ${protocol}. Tente novamente ou use a Central de Ajuda.`, 'error');
      return false;
    } finally {
      const endedCurrentLease = endPrivacyProtocolOperation(protocolLease);
      if (endedCurrentLease && !isActiveAccountLoad(generation, userId)) {
        setActionButtonState(button, 'idle');
      }
    }
  }

  async function downloadDataSubjectSupplement(request, button) {
    const protocol = normalizePrivacyProtocol(request && request.protocol);
    const artifactRef = String(
      request && request.supplement && request.supplement.artifact_ref || ''
    ).trim();
    if (hasActiveAccountErasure(state.dataSubjectRequests)) {
      setActionButtonState(button, 'idle');
      setPrivacyStatus(
        'O complemento fica bloqueado enquanto o pedido de exclusão estiver ativo. Cancele a exclusão enquanto ela ainda for reversível e atualize os protocolos.',
        'warn'
      );
      return false;
    }
    if (
      !protocol ||
      !artifactRef ||
      !window.KCAPI ||
      typeof window.KCAPI.downloadDataSubjectSupplement !== 'function'
    ) {
      setPrivacyStatus('O complemento ainda não está disponível. Acompanhe o protocolo na Central de Ajuda.', 'warn');
      return false;
    }
    const protocolLease = beginPrivacyProtocolOperation(protocol, 'download_supplement', button);
    if (!protocolLease) return false;
    const generation = protocolLease.generation;
    const userId = protocolLease.userId;
    setActionButtonState(button, 'loading', 'Validando complemento...');
    try {
      const result = await window.KCAPI.downloadDataSubjectSupplement(protocol, artifactRef, {
        expected_user_id: userId,
      });
      if (!isActiveAccountLoad(generation, userId)) return false;
      if (!result || result.ok === false || result.error || !result.data || !result.data.export) {
        setActionButtonState(button, 'idle');
        setPrivacyStatus(
          getPrivacyErrorMessage(result, `Não foi possível baixar o complemento do protocolo ${protocol}.`),
          'error'
        );
        return false;
      }
      const combinedExport = await combineServerAndBrowserExport(result.data.export);
      if (!isActiveAccountLoad(generation, userId)) return false;
      saveJsonDownload(combinedExport, result.data.filename);
      setActionButtonState(button, 'success', 'Download iniciado');
      setPrivacyStatus(
        `Complemento integral do protocolo ${protocol} preparado e download iniciado. Confira a pasta de downloads e guarde o arquivo em local seguro.`,
        'success'
      );
      await loadDataSubjectRequests({ silent: true });
      return true;
    } catch (_) {
      if (!isActiveAccountLoad(generation, userId)) return false;
      setActionButtonState(button, 'idle');
      setPrivacyStatus(`Não foi possível baixar o complemento do protocolo ${protocol}.`, 'error');
      return false;
    } finally {
      const endedCurrentLease = endPrivacyProtocolOperation(protocolLease);
      if (endedCurrentLease && !isActiveAccountLoad(generation, userId)) {
        setActionButtonState(button, 'idle');
      }
    }
  }

  async function requestAndDownloadExport(kind, options) {
    const opts = options || {};
    const button = $(opts.buttonSelector);
    const privacyLease = beginPrivacyOperation();
    if (!privacyLease) return;
    if (hasActiveAccountErasure(state.dataSubjectRequests)) {
      setActionButtonState(button, 'idle');
      setPrivacyStatus(
        'Não é possível abrir ou baixar uma cópia durante uma exclusão ativa. Cancele a exclusão enquanto ela ainda for reversível; se o controle não estiver disponível, use a Central de Ajuda.',
        'warn'
      );
      endPrivacyOperation(privacyLease);
      return;
    }
    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    try {
      const reusable = state.dataSubjectRequests.find((request) => (
        request.request_kind === kind && isPrivacyDownloadAvailable(request, false)
      ));
      if (reusable) {
        clearPrivacyActionKey(kind);
        await downloadDataSubjectExport(reusable, button);
        return;
      }
      setActionButtonState(button, 'loading', 'Abrindo protocolo...');
      setPrivacyStatus(opts.openingMessage, 'info');
      const result = await createDataSubjectRequest(kind);
      if (!isActiveAccountLoad(generation, userId)) return;
      const request = result && result.data && result.data.request;
      if (!result || result.ok === false || result.error || !request) {
        setActionButtonState(button, 'idle');
        setPrivacyStatus(
          getPrivacyErrorMessage(result, opts.failureMessage),
          'error'
        );
        return;
      }
      await loadDataSubjectRequests({ silent: true });
      await downloadDataSubjectExport(request, button);
    } catch (_) {
      if (!isActiveAccountLoad(generation, userId)) return;
      setActionButtonState(button, 'idle');
      setPrivacyStatus(opts.failureMessage, 'error');
    } finally {
      const endedCurrentLease = endPrivacyOperation(privacyLease);
      if (
        endedCurrentLease &&
        getUserId(state.user) === userId &&
        !isActiveAccountLoad(generation, userId)
      ) {
        setActionButtonState(button, 'idle');
      }
    }
  }

  async function requestAndDownloadAccountData() {
    return requestAndDownloadExport('data_access_copy', {
      buttonSelector: '#settingsDownloadAccountData',
      openingMessage: 'Abrindo um protocolo seguro para gerar sua cópia...',
      failureMessage: 'Não foi possível gerar sua cópia agora. Use a Central de Ajuda se o problema continuar.',
    });
  }

  async function requestAndDownloadDataPortability() {
    return requestAndDownloadExport('data_portability', {
      buttonSelector: '#settingsRequestDataPortability',
      openingMessage: 'Abrindo um protocolo seguro para gerar a portabilidade em JSON...',
      failureMessage: 'Não foi possível gerar a portabilidade agora. Use a Central de Ajuda para informar outro formato ou destino.',
    });
  }

  async function requestAccountErasure() {
    if (state.privacyBusy) return;
    const existing = state.dataSubjectRequests.find((request) => (
      request.request_kind === 'account_erasure' &&
      ['received', 'processing', 'ready', 'pending_confirmation', 'failed', 'partial_failure']
        .includes(String(request.status || ''))
    ));
    if (existing) {
      clearPrivacyActionKey('account_erasure');
      const needsReview = ['failed', 'partial_failure'].includes(String(existing.status || ''));
      setPrivacyStatus(
        needsReview
          ? `O pedido de exclusão ${existing.protocol} continua aberto para revisão assistida. Consulte o protocolo ou a Central de Ajuda; não abra outro pedido.`
          : `Já existe um pedido de exclusão em análise: protocolo ${existing.protocol}.`,
        needsReview ? 'warn' : 'info'
      );
      return;
    }
    const confirmed = window.confirm(
      'Deseja abrir um pedido de exclusão da conta e dos dados? A conta não será apagada agora. Este pedido direto ainda não registra se você quer uma cópia antes da exclusão. Se quiser guardá-la, cancele e use “Baixar meus dados” primeiro; se prosseguir, a equipe confirmará sua preferência antes da etapa irreversível.'
    );
    if (!confirmed) return;

    const button = $('#settingsRequestAccountErasure');
    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    const privacyLease = beginPrivacyOperation();
    if (!privacyLease) return;
    setActionButtonState(button, 'loading', 'Abrindo pedido...');
    setPrivacyStatus('Registrando o pedido de exclusão sem apagar nada neste momento...', 'info');
    try {
      const result = await createDataSubjectRequest('account_erasure');
      if (!isActiveAccountLoad(generation, userId)) return;
      const request = result && result.data && result.data.request;
      if (!result || result.ok === false || result.error || !request) {
        setActionButtonState(button, 'idle');
        setPrivacyStatus(
          getPrivacyErrorMessage(result, 'Não foi possível abrir o pedido de exclusão agora.'),
          'error'
        );
        return;
      }
      setActionButtonState(button, 'success', 'Pedido recebido');
      setPrivacyStatus(
        `Pedido recebido. Protocolo ${request.protocol}. A conta continua ativa até a confirmação e o processamento seguro.`,
        'success'
      );
      await loadDataSubjectRequests({ silent: true });
    } catch (_) {
      if (!isActiveAccountLoad(generation, userId)) return;
      setActionButtonState(button, 'idle');
      setPrivacyStatus('Não foi possível abrir o pedido de exclusão agora. Use a Central de Ajuda se o problema continuar.', 'error');
    } finally {
      const endedCurrentLease = endPrivacyOperation(privacyLease);
      if (
        endedCurrentLease &&
        getUserId(state.user) === userId &&
        !isActiveAccountLoad(generation, userId)
      ) {
        setActionButtonState(button, 'idle');
      }
    }
  }

  async function cancelDataSubjectRequest(request, button) {
    const protocol = normalizePrivacyProtocol(request && request.protocol);
    if (!protocol || !window.KCAPI || typeof window.KCAPI.cancelDataSubjectRequest !== 'function') return;
    if (getCurrentPrivacyProtocolLease(protocol)) {
      reportPrivacyProtocolBusy(protocol);
      return false;
    }
    const isErasure = request.request_kind === 'account_erasure';
    const confirmed = window.confirm(
      isErasure
        ? `Cancelar o pedido de exclusão ${protocol}? Alterações reversíveis já aplicadas serão tratadas pelo atendimento.`
        : `Cancelar o pedido ${protocol}?`
    );
    if (!confirmed) return false;

    const protocolLease = beginPrivacyProtocolOperation(protocol, 'cancel', button);
    if (!protocolLease) return false;
    const generation = protocolLease.generation;
    const userId = protocolLease.userId;
    setActionButtonState(button, 'loading', 'Cancelando...');
    try {
      const result = await window.KCAPI.cancelDataSubjectRequest(protocol, {
        expected_user_id: userId,
      });
      if (!isActiveAccountLoad(generation, userId)) return;
      if (!result || result.ok === false || result.error) {
        setActionButtonState(button, 'idle');
        setPrivacyStatus(
          getPrivacyErrorMessage(result, `Não foi possível cancelar o protocolo ${protocol}.`),
          'error'
        );
        return;
      }
      clearPrivacyActionKey(request.request_kind);
      setPrivacyStatus(
        isErasure && request.status === 'pending_confirmation'
          ? `Cancelamento do protocolo ${protocol} registrado. A etapa irreversível foi bloqueada e a restauração das alterações reversíveis seguirá no atendimento.`
          : `Protocolo ${protocol} cancelado.`,
        'success'
      );
      await loadDataSubjectRequests({ silent: true });
      return true;
    } catch (_) {
      if (!isActiveAccountLoad(generation, userId)) return false;
      setActionButtonState(button, 'idle');
      setPrivacyStatus(`Não foi possível cancelar o protocolo ${protocol}.`, 'error');
      return false;
    } finally {
      const endedCurrentLease = endPrivacyProtocolOperation(protocolLease);
      if (endedCurrentLease && !isActiveAccountLoad(generation, userId)) {
        setActionButtonState(button, 'idle');
      }
    }
  }

  function cacheButtonHtml(button) {
    if (!button) return '';
    if (!button.dataset.defaultHtml) button.dataset.defaultHtml = button.innerHTML;
    return button.dataset.defaultHtml;
  }

  function restoreActionButton(button) {
    if (!button) return;
    if (button._kcResetTimer) {
      clearTimeout(button._kcResetTimer);
      button._kcResetTimer = null;
    }
    const protocolLeaseDisabled = button.dataset.privacyProtocolLeaseDisabled === '1';
    button.disabled = protocolLeaseDisabled;
    button.setAttribute('aria-disabled', protocolLeaseDisabled ? 'true' : 'false');
    button.setAttribute('aria-busy', 'false');
    button.classList.remove('is-loading', 'is-success', 'is-warn');
    const defaultHtml = cacheButtonHtml(button);
    if (defaultHtml) button.innerHTML = defaultHtml;
    if (button.id === 'settingsClearBrowserPrivacyData') {
      syncBrowserPrivacyClearAvailability();
    }
  }

  function setActionButtonState(button, mode, label) {
    if (!button) return;
    cacheButtonHtml(button);
    button.classList.remove('is-loading', 'is-success', 'is-warn');
    const protocolLeaseDisabled = button.dataset.privacyProtocolLeaseDisabled === '1';
    button.disabled = protocolLeaseDisabled;
    button.setAttribute(
      'aria-disabled',
      mode === 'loading' || protocolLeaseDisabled ? 'true' : 'false'
    );
    button.setAttribute('aria-busy', mode === 'loading' ? 'true' : 'false');

    if (mode === 'loading') {
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = `<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>${esc(label || 'Salvando...')}</span>`;
      return;
    }

    if (mode === 'success') {
      button.classList.add('is-success');
      button.innerHTML = `<i class="fas fa-check" aria-hidden="true"></i><span>${esc(label || 'Salvo')}</span>`;
      button._kcResetTimer = window.setTimeout(function () {
        restoreActionButton(button);
      }, 2200);
      return;
    }

    if (mode === 'warn') {
      button.classList.add('is-warn');
      button.innerHTML = `<i class="fas fa-triangle-exclamation" aria-hidden="true"></i><span>${esc(label || 'Concluído parcialmente')}</span>`;
      button._kcResetTimer = window.setTimeout(function () {
        restoreActionButton(button);
      }, 4000);
      return;
    }

    restoreActionButton(button);
  }

  function getPrimaryMethodOptions() {
    const options = Array.isArray(shared.CONTACT_METHOD_OPTIONS)
      ? shared.CONTACT_METHOD_OPTIONS.slice()
      : [];
    options.push(NO_PUBLIC_CONTACT_OPTION);
    return options;
  }

  function isNoPublicContactSelected() {
    return String($('#settingsPrimaryMethod')?.value || '').trim() === NO_PUBLIC_CONTACT_OPTION.value;
  }

  function syncContactPillLabel() {
    const label = $('#settingsCtaEnabledLabel');
    const toggle = $('#settingsCtaEnabled');
    if (!label || !toggle) return;
    label.textContent = toggle.checked ? 'Ativo' : 'Desativado';
  }

  function syncProfilePublicLabel() {
    const label = $('#settingsProfilePublicLabel');
    const toggle = $('#settingsProfilePublic');
    if (!label || !toggle) return;
    label.textContent = toggle.checked ? 'Ativado' : 'Desativado';
  }

  function syncContactControls(mode) {
    const select = $('#settingsPrimaryMethod');
    const toggle = $('#settingsCtaEnabled');
    if (!select || !toggle) return;

    const noPublic = String(select.value || '').trim() === NO_PUBLIC_CONTACT_OPTION.value;
    const wasDisabled = toggle.disabled === true;

    if (!noPublic && String(select.value || '').trim()) {
      state.lastRealPrimaryMethod = String(select.value || '').trim();
    }

    if (noPublic) {
      toggle.checked = false;
      toggle.disabled = true;
    } else {
      toggle.disabled = false;
      if (mode === 'select' && wasDisabled) toggle.checked = true;
    }

    syncContactPillLabel();
  }

  function renderPrimaryMethodOptions() {
    const select = $('#settingsPrimaryMethod');
    if (!select) return;
    select.innerHTML = getPrimaryMethodOptions().map((option) => {
      return `<option value="${esc(option.value)}">${esc(option.label)}</option>`;
    }).join('');
  }

  function buildNetworkRows() {
    const list = $('#settingsNetworksList');
    if (!list) return;

    const profile = state.profile || {};
    const networks = Array.isArray(shared.SOCIAL_ORDER) ? shared.SOCIAL_ORDER : [];
    const meta = shared.SOCIAL_NETWORKS || {};
    const socialLinks = normalizeSocialLinks(profile);
    const visibility = normalizeVisibility(profile);

    list.innerHTML = networks.map((key) => {
      const entry = meta[key] || { label: key, iconClass: 'fas fa-link' };
      const rawValue = String(socialLinks[key] || '').trim();
      const preview = key === 'whatsapp' && shared.formatWhatsAppDisplay
        ? shared.formatWhatsAppDisplay(rawValue)
        : rawValue;
      const checked = visibility[key] === true && !!rawValue;
      return [
        `<div class="kc-settings-network" data-network-row="${esc(key)}">`,
        '  <div class="kc-settings-network__body">',
        `    <strong><i class="${esc(entry.iconClass || 'fas fa-link')}"></i>${esc(entry.label || key)}</strong>`,
        `    <p title="${esc(preview || '')}">${preview ? esc(preview) : 'Preencha este link no onboarding para poder exibi-lo.'}</p>`,
        '  </div>',
        `  <label class="kc-settings-pill" for="settingsVisible_${esc(key)}">`,
        `    <input id="settingsVisible_${esc(key)}" type="checkbox" data-network-visible="${esc(key)}"${checked ? ' checked' : ''}${rawValue ? '' : ' disabled'} />`,
        '    <span>Exibir</span>',
        '  </label>',
        '</div>'
      ].join('');
    }).join('');
  }

  function renderNotificationPreferences() {
    const list = $('#settingsNotificationPreferencesList');
    if (!list) return;

    const eventOptions = Array.isArray(shared.NOTIFICATION_EVENT_OPTIONS) ? shared.NOTIFICATION_EVENT_OPTIONS : [];
    const channelOptions = Array.isArray(shared.NOTIFICATION_CHANNEL_OPTIONS) ? shared.NOTIFICATION_CHANNEL_OPTIONS : [];
    const preferences = normalizeNotificationPreferences(state.notificationPreferences);

    list.innerHTML = eventOptions.map((eventOption) => {
      const eventKey = String(eventOption.value || '').trim();
      const eventPrefs = preferences[eventKey] || {};
      const channels = channelOptions.map((channelOption) => {
        const channelKey = String(channelOption.value || '').trim();
        const checked = eventPrefs[channelKey] === true;
        return [
          `<label class="kc-settings-notification-option" for="settingsNotif_${esc(eventKey)}_${esc(channelKey)}">`,
          `  <input id="settingsNotif_${esc(eventKey)}_${esc(channelKey)}" type="checkbox" data-notification-event="${esc(eventKey)}" data-notification-channel="${esc(channelKey)}"${checked ? ' checked' : ''} />`,
          `  <span>${esc(channelOption.label || channelKey)}</span>`,
          '</label>',
        ].join('');
      }).join('');

      return [
        '<div class="kc-settings-notification-row">',
        '  <div class="kc-settings-notification-copy">',
        `    <strong><i class="${esc(eventOption.iconClass || 'fas fa-bell')}"></i>${esc(eventOption.label || eventKey)}</strong>`,
        `    <p>${esc(eventOption.description || '')}</p>`,
        '  </div>',
        `  <div class="kc-settings-notification-channels">${channels}</div>`,
        '</div>',
      ].join('');
    }).join('');
  }

  function countEnabledWhatsappEvents(preferences) {
    const normalized = normalizeNotificationPreferences(preferences);
    return Object.keys(normalized).reduce(function (count, eventKey) {
      const eventPrefs = normalized[eventKey] || {};
      return count + (eventPrefs.whatsapp === true ? 1 : 0);
    }, 0);
  }

  function renderNotificationChannelTargets() {
    const country = $('#settingsNotificationWhatsappCountry');
    const number = $('#settingsNotificationWhatsappNumber');
    const consent = $('#settingsNotificationWhatsappConsent');
    const normalizedTargets = normalizeNotificationChannelTargets(state.notificationChannelTargets);
    const whatsappTarget = normalizedTargets.whatsapp || getDefaultNotificationChannelTargets().whatsapp;
    const countryOptions = Array.isArray(shared.COUNTRY_DIAL_OPTIONS) ? shared.COUNTRY_DIAL_OPTIONS : [];

    if (country) {
      country.innerHTML = countryOptions.map(function (option) {
        const dialCode = String((option && option.dialCode) || '').trim();
        const selected = dialCode === String(whatsappTarget.country_code || '55') ? ' selected' : '';
        return `<option value="${esc(dialCode)}"${selected}>+${esc(dialCode)} - ${esc(option && option.name ? option.name : dialCode)}</option>`;
      }).join('');
      country.value = String(whatsappTarget.country_code || '55');
    }

    if (number) number.value = String(whatsappTarget.local_number || '');
    if (consent) consent.checked = whatsappTarget.consent_granted === true;

    updateNotificationWhatsappPreview();
  }

  function collectNotificationChannelTargets() {
    const countryCode = String($('#settingsNotificationWhatsappCountry')?.value || '55').trim() || '55';
    const localNumber = String($('#settingsNotificationWhatsappNumber')?.value || '').trim();
    const consentGranted = $('#settingsNotificationWhatsappConsent')?.checked === true;

    return normalizeNotificationChannelTargets({
      whatsapp: {
        country_code: countryCode,
        local_number: localNumber,
        consent_granted: consentGranted,
        metadata: {
          country_code: countryCode
        }
      }
    });
  }

  function updateNotificationWhatsappPreview() {
    const preview = $('#settingsNotificationWhatsappPreview');
    if (!preview) return;

    const normalizedTargets = collectNotificationChannelTargets();
    const whatsappTarget = normalizedTargets.whatsapp || getDefaultNotificationChannelTargets().whatsapp;
    const enabledWhatsappEvents = countEnabledWhatsappEvents(collectNotificationPreferences());

    if (!whatsappTarget.destination) {
      preview.textContent = enabledWhatsappEvents > 0
        ? 'WhatsApp marcado em eventos, mas ainda sem numero privado configurado. O canal segue bloqueado ate salvar um destino valido.'
        : 'Nenhum numero privado configurado. O KinoCampus nao reaproveita automaticamente o WhatsApp publico do seu perfil.';
      return;
    }

    if (!whatsappTarget.consent_granted) {
      preview.textContent = `Numero privado detectado (${whatsappTarget.display || whatsappTarget.destination}), mas o envio continua bloqueado ate voce autorizar o uso deste canal.`;
      return;
    }

    preview.textContent = enabledWhatsappEvents > 0
      ? `Canal privado pronto em ${whatsappTarget.display || whatsappTarget.destination}. Os eventos marcados para WhatsApp poderao ser enviados por este destino.`
      : `Canal privado salvo em ${whatsappTarget.display || whatsappTarget.destination}. Voce ainda nao marcou eventos para WhatsApp.`;
  }

  function updateOnboardingStatus() {
    const pill = $('#settingsOnboardingPill');
    const copy = $('#settingsOnboardingCopy');
    const setupLink = $('#settingsSetupLink');
    const profile = state.profile || {};
    const complete = shared && typeof shared.isOnboardingComplete === 'function'
      ? shared.isOnboardingComplete(profile)
      : !!profile.onboarding_completed_at;

    if (pill) pill.textContent = complete ? 'Completa' : 'Pendente';
    if (copy) {
      copy.textContent = complete
        ? 'Seu perfil básico já está pronto. Você pode revisar detalhes e visibilidade sem passar por tudo de novo.'
        : 'Ainda faltam etapas do onboarding. Complete os campos obrigatórios para publicar e receber contatos.';
    }
    if (setupLink) {
      setupLink.href = buildAccountSetupHref();
      setupLink.innerHTML = complete
        ? '<i class="fas fa-pen"></i><span>Revisar onboarding</span>'
        : '<i class="fas fa-list-check"></i><span>Completar conta</span>';
    }
  }

  function buildPreviewProfile() {
    const selectedValue = String($('#settingsPrimaryMethod')?.value || '').trim();
    const ctaEnabled = $('#settingsCtaEnabled')?.checked !== false;
    const fallbackPrimary = state.lastRealPrimaryMethod || String((state.profile && state.profile.contact_primary_method) || '').trim();

    return Object.assign({}, state.profile || {}, {
      contact_primary_method: selectedValue === NO_PUBLIC_CONTACT_OPTION.value
        ? (fallbackPrimary || null)
        : (selectedValue || null),
      contact_cta_enabled: selectedValue === NO_PUBLIC_CONTACT_OPTION.value
        ? false
        : ctaEnabled,
    });
  }

  function updateContactPreview() {
    const preview = $('#settingsContactPreview');
    if (!preview) return;

    const selectedValue = String($('#settingsPrimaryMethod')?.value || '').trim();
    if (selectedValue === NO_PUBLIC_CONTACT_OPTION.value) {
      preview.textContent = 'Estado atual: sem contato público. O anúncio exibirá uma alternativa segura, como “Ver perfil”.';
      return;
    }

    const action = shared && typeof shared.buildContactAction === 'function'
      ? shared.buildContactAction({
          profile: buildPreviewProfile(),
          viewerAuthenticated: true,
          postTitle: 'Anúncio de teste',
          postUrl: buildPreviewPostUrl(),
          viewProfileHref: buildProfileHref()
        })
      : null;

    if (!action) {
      preview.textContent = 'Não foi possível gerar a prévia do contato agora.';
      return;
    }

    const label = String(action.label || '').trim();
    const href = String(action.href || '').trim();
    if (!href && action.type !== 'login_required') {
      preview.textContent = `Estado atual: ${label || 'Contato indisponível'}. Complete o valor do contato no onboarding para ativar este botão.`;
      return;
    }

    if (action.type === 'view_profile') {
      preview.textContent = `Estado atual: ${label || 'Ver perfil'}. O anúncio exibirá uma alternativa segura no lugar do contato direto.`;
      return;
    }

    preview.textContent = `Estado atual: ${label || 'Contato pronto'}. O anúncio vai abrir o canal configurado quando alguém clicar em contato.`;
  }

  function updateThemeButtons() {
    const current = typeof window.kcGetTheme === 'function' ? window.kcGetTheme() : 'light';
    $all('[data-theme-option]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-theme-option') === current);
    });
  }

  function populate() {
    const profile = state.profile || {};
    const userSummary = $('#settingsUserSummary');
    const profileLink = $('#settingsProfileLink');
    const primaryMethod = $('#settingsPrimaryMethod');
    const ctaEnabled = $('#settingsCtaEnabled');
    const profilePublic = $('#settingsProfilePublic');
    const storedPrimaryMethod = String(profile.contact_primary_method || '').trim();

    state.lastRealPrimaryMethod = storedPrimaryMethod || state.lastRealPrimaryMethod;

    if (userSummary && state.user) {
      userSummary.textContent = `Conta ativa com ${state.user.email || 'seu e-mail institucional'}. Use estas ações para revisar o fluxo de conta e a segurança da sessão.`;
    }

    if (profileLink) profileLink.href = buildProfileHref();
    if (primaryMethod) {
      primaryMethod.value = profile.contact_cta_enabled === false
        ? NO_PUBLIC_CONTACT_OPTION.value
        : storedPrimaryMethod;
    }
    if (ctaEnabled) {
      ctaEnabled.checked = profile.contact_cta_enabled !== false;
    }
    if (profilePublic) {
      profilePublic.checked = profile.profile_public === true;
    }

    updateOnboardingStatus();
    buildNetworkRows();
    renderNotificationPreferences();
    renderNotificationChannelTargets();
    syncContactControls('populate');
    syncProfilePublicLabel();
    updateContactPreview();
    updateThemeButtons();
  }

  function collectNotificationPreferences() {
    const next = normalizeNotificationPreferences(state.notificationPreferences);
    document.querySelectorAll('[data-notification-event][data-notification-channel]').forEach((input) => {
      const eventKey = String(input.getAttribute('data-notification-event') || '').trim();
      const channelKey = String(input.getAttribute('data-notification-channel') || '').trim();
      if (!eventKey || !channelKey || !next[eventKey]) return;
      next[eventKey][channelKey] = input.checked === true;
    });
    return normalizeNotificationPreferences(next);
  }

  async function savePatch(patch, successMessage, buttonSelector, successButtonLabel) {
    const button = buttonSelector ? $(buttonSelector) : null;
    if (!window.KCAPI || typeof window.KCAPI.updateMyProfile !== 'function') {
      setStatus('Perfil indisponível neste ambiente.', 'error');
      setActionButtonState(button, 'idle');
      return;
    }
    if (state.saving) return;

    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    state.saving = true;
    setActionButtonState(button, 'loading', 'Salvando...');
    setStatus('Salvando suas configurações...', 'info');

    try {
      const result = await window.KCAPI.updateMyProfile(patch);
      if (!isActiveAccountLoad(generation, userId)) return;
      if (!result || !result.ok) {
        setActionButtonState(button, 'idle');
        setStatus((result && result.error && result.error.message) || 'Não foi possível salvar agora.', 'error');
        return;
      }

      state.profile = result.data || state.profile;
      populate();
      setActionButtonState(button, 'success', successButtonLabel || 'Salvo');
      setStatus(successMessage || 'Configurações salvas com sucesso.', 'success');
    } catch (error) {
      if (!isActiveAccountLoad(generation, userId)) return;
      console.error('[Settings] save failed:', error);
      setActionButtonState(button, 'idle');
      setStatus('Não foi possível salvar agora.', 'error');
    } finally {
      if (isActiveAccountLoad(generation, userId)) state.saving = false;
    }
  }

  async function saveContactSettings() {
    const selectedValue = String($('#settingsPrimaryMethod')?.value || '').trim();
    const noPublic = selectedValue === NO_PUBLIC_CONTACT_OPTION.value;
    const effectivePrimaryMethod = noPublic
      ? (state.lastRealPrimaryMethod || String((state.profile && state.profile.contact_primary_method) || '').trim() || null)
      : (selectedValue || null);

    if (!noPublic && effectivePrimaryMethod) {
      state.lastRealPrimaryMethod = effectivePrimaryMethod;
    }

    const patch = {
      contact_primary_method: effectivePrimaryMethod,
      contact_cta_enabled: noPublic ? false : ($('#settingsCtaEnabled')?.checked !== false)
    };

    await savePatch(
      patch,
      'Preferências de contato atualizadas.',
      '#settingsSaveContact',
      'Contato salvo'
    );
  }

  async function saveVisibilitySettings() {
    const visibility = normalizeVisibility(state.profile);
    document.querySelectorAll('[data-network-visible]').forEach((input) => {
      const key = String(input.getAttribute('data-network-visible') || '').trim();
      if (!key) return;
      visibility[key] = input.checked === true;
    });

    await savePatch(
      { social_visibility: visibility },
      'Visibilidade dos links públicos atualizada.',
      '#settingsSaveVisibility',
      'Visibilidade salva'
    );
  }

  async function saveProfilePublicSettings() {
    await savePatch(
      { profile_public: $('#settingsProfilePublic')?.checked === true },
      'Preferência de perfil público atualizada.',
      '#settingsSaveProfilePublic',
      'Perfil salvo'
    );
  }

  async function saveNotificationSettings() {
    const button = $('#settingsSaveNotifications');
      if (!window.KCAPI ||
          typeof window.KCAPI.updateNotificationPreferences !== 'function' ||
          typeof window.KCAPI.updateNotificationChannelTargets !== 'function') {
      setStatus('Preferências de notificação indisponíveis neste ambiente.', 'error');
      setActionButtonState(button, 'idle');
      return;
    }
    if (state.saving) return;

    const preferences = collectNotificationPreferences();
    const channelTargets = collectNotificationChannelTargets();
    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    state.saving = true;
    setActionButtonState(button, 'loading', 'Salvando...');
    setStatus('Salvando suas preferências de notificação...', 'info');

    try {
      const result = await window.KCAPI.updateNotificationPreferences(preferences);
      if (!isActiveAccountLoad(generation, userId)) return;
      if (!result || !result.ok) {
        setActionButtonState(button, 'idle');
        setStatus((result && result.error && result.error.message) || 'Não foi possível salvar agora.', 'error');
        return;
      }

      const targetsResult = await window.KCAPI.updateNotificationChannelTargets(channelTargets);
      if (!isActiveAccountLoad(generation, userId)) return;
      if (!targetsResult || !targetsResult.ok) {
        setActionButtonState(button, 'idle');
        setStatus((targetsResult && targetsResult.error && targetsResult.error.message) || 'Não foi possível salvar agora.', 'error');
        return;
      }

      state.notificationPreferences = normalizeNotificationPreferences(
        result && result.data && result.data.preferences ? result.data.preferences : preferences
      );
      state.notificationChannelTargets = normalizeNotificationChannelTargets(
        targetsResult && targetsResult.data && targetsResult.data.targets ? targetsResult.data.targets : channelTargets
      );
      renderNotificationPreferences();
      renderNotificationChannelTargets();
      setActionButtonState(button, 'success', 'Notificações salvas');
      setStatus('Preferências de notificação atualizadas.', 'success');
    } catch (error) {
      if (!isActiveAccountLoad(generation, userId)) return;
      console.error('[Settings] notification preferences save failed:', error);
      setActionButtonState(button, 'idle');
      setStatus('Não foi possível salvar agora.', 'error');
    } finally {
      if (isActiveAccountLoad(generation, userId)) state.saving = false;
    }
  }

  async function runAccountEmailAction(config) {
    const userId = getUserId(state.user);
    const email = String(state.user && state.user.email || '').trim();
    const api = window.KCAPI;
    const apiMethod = String(config && config.apiMethod || '').trim();
    const actionKey = String(config && config.actionKey || '').trim();
    if (!userId || !email || !api || !apiMethod || typeof api[apiMethod] !== 'function') {
      return false;
    }

    const locks = state.accountEmailActionsInFlight;
    if (locks[actionKey] === true) {
      setStatus(config.inProgressMessage, 'info');
      return false;
    }

    const generation = state.accountLoadGeneration;
    const button = $(config.buttonSelector);
    locks[actionKey] = true;
    setActionButtonState(button, 'loading', config.loadingButtonLabel);
    setStatus(config.loadingMessage, 'info');
    try {
      const redirectOptions = {
        [config.redirectOption]: buildCallbackUrl(),
      };
      const result = await api[apiMethod].call(api, email, redirectOptions);
      if (!isActiveAccountLoad(generation, userId)) return false;
      if (!result || result.ok === false || result.error) {
        setActionButtonState(button, 'idle');
        setStatus(
          (result && result.error && result.error.message) || config.failureMessage,
          'error'
        );
        return false;
      }
      setActionButtonState(button, 'success', config.successButtonLabel);
      setStatus(config.successMessage, 'success');
      return true;
    } catch (_) {
      if (!isActiveAccountLoad(generation, userId)) return false;
      setActionButtonState(button, 'idle');
      setStatus(config.failureMessage, 'error');
      return false;
    } finally {
      delete locks[actionKey];
      if (
        state.accountEmailActionsInFlight === locks &&
        getUserId(state.user) === userId &&
        !isActiveAccountLoad(generation, userId)
      ) {
        setActionButtonState(button, 'idle');
      }
    }
  }

  function resendConfirmation() {
    return runAccountEmailAction({
      actionKey: 'resend_confirmation',
      apiMethod: 'resendConfirmation',
      buttonSelector: '#settingsResendConfirmation',
      redirectOption: 'emailRedirectTo',
      loadingButtonLabel: 'Reenviando...',
      loadingMessage: 'Reenviando a confirmação...',
      inProgressMessage: 'O reenvio da confirmação já está em andamento.',
      failureMessage: 'Não foi possível reenviar a confirmação.',
      successButtonLabel: 'Confirmação enviada',
      successMessage: 'Novo e-mail de confirmação enviado.',
    });
  }

  function requestResetLink() {
    return runAccountEmailAction({
      actionKey: 'password_reset',
      apiMethod: 'requestPasswordReset',
      buttonSelector: '#settingsRequestReset',
      redirectOption: 'redirectTo',
      loadingButtonLabel: 'Enviando...',
      loadingMessage: 'Enviando o link para redefinir sua senha...',
      inProgressMessage: 'O envio do link de nova senha já está em andamento.',
      failureMessage: 'Não foi possível enviar o link de nova senha.',
      successButtonLabel: 'Link enviado',
      successMessage: 'Link de nova senha enviado para o seu e-mail institucional.',
    });
  }

  async function doLogout() {
    if (!window.KCAPI || typeof window.KCAPI.logout !== 'function') return;
    const button = $('#settingsLogout');
    setActionButtonState(button, 'loading', 'Saindo...');
    setStatus('Saindo da conta...', 'info');
    try {
      const loggedOut = await window.KCAPI.logout();
      if (loggedOut !== true) {
        setActionButtonState(button, 'idle');
        setStatus('Não foi possível sair da conta agora. Sua sessão continua ativa.', 'error');
        return false;
      }
      window.location.href = '/index.html';
      return true;
    } catch (error) {
      console.error('[Settings] logout failed:', error);
      setActionButtonState(button, 'idle');
      setStatus('Não foi possível sair da conta agora. Sua sessão continua ativa.', 'error');
      return false;
    }
  }

  function bindEvents() {
    const saveContact = $('#settingsSaveContact');
    const saveVisibility = $('#settingsSaveVisibility');
    const saveProfilePublic = $('#settingsSaveProfilePublic');
    const saveNotifications = $('#settingsSaveNotifications');
    const resend = $('#settingsResendConfirmation');
    const requestReset = $('#settingsRequestReset');
    const logout = $('#settingsLogout');
    const downloadAccountData = $('#settingsDownloadAccountData');
    const requestDataPortabilityButton = $('#settingsRequestDataPortability');
    const requestAccountErasureButton = $('#settingsRequestAccountErasure');
    const refreshDataRequests = $('#settingsRefreshDataRequests');
    const clearBrowserPrivacyDataButton = $('#settingsClearBrowserPrivacyData');
    const primaryMethod = $('#settingsPrimaryMethod');
    const ctaEnabled = $('#settingsCtaEnabled');
    const profilePublic = $('#settingsProfilePublic');
    const notificationWhatsappCountry = $('#settingsNotificationWhatsappCountry');
    const notificationWhatsappNumber = $('#settingsNotificationWhatsappNumber');
    const notificationWhatsappConsent = $('#settingsNotificationWhatsappConsent');

    if (saveContact) saveContact.addEventListener('click', saveContactSettings);
    if (saveVisibility) saveVisibility.addEventListener('click', saveVisibilitySettings);
    if (saveProfilePublic) saveProfilePublic.addEventListener('click', saveProfilePublicSettings);
    if (saveNotifications) saveNotifications.addEventListener('click', saveNotificationSettings);
    if (resend) resend.addEventListener('click', resendConfirmation);
    if (requestReset) requestReset.addEventListener('click', requestResetLink);
    if (logout) logout.addEventListener('click', doLogout);
    if (downloadAccountData) downloadAccountData.addEventListener('click', requestAndDownloadAccountData);
    if (requestDataPortabilityButton) {
      requestDataPortabilityButton.addEventListener('click', requestAndDownloadDataPortability);
    }
    if (requestAccountErasureButton) requestAccountErasureButton.addEventListener('click', requestAccountErasure);
    if (refreshDataRequests) {
      refreshDataRequests.addEventListener('click', function () {
        loadDataSubjectRequests({ userInitiated: true });
      });
    }
    if (clearBrowserPrivacyDataButton) {
      clearBrowserPrivacyDataButton.addEventListener('click', clearBrowserPrivacyData);
    }

    if (primaryMethod) {
      primaryMethod.addEventListener('change', function () {
        syncContactControls('select');
        updateContactPreview();
      });
      primaryMethod.addEventListener('input', updateContactPreview);
    }

    if (ctaEnabled) {
      ctaEnabled.addEventListener('change', function () {
        syncContactPillLabel();
        updateContactPreview();
      });
    }

    if (profilePublic) {
      profilePublic.addEventListener('change', syncProfilePublicLabel);
    }

    if (notificationWhatsappCountry) notificationWhatsappCountry.addEventListener('change', updateNotificationWhatsappPreview);
    if (notificationWhatsappNumber) {
      notificationWhatsappNumber.addEventListener('input', updateNotificationWhatsappPreview);
      notificationWhatsappNumber.addEventListener('change', updateNotificationWhatsappPreview);
    }
    if (notificationWhatsappConsent) notificationWhatsappConsent.addEventListener('change', updateNotificationWhatsappPreview);
    document.addEventListener('change', function (event) {
      const target = event && event.target;
      if (!target || typeof target.getAttribute !== 'function') return;
      if (target.hasAttribute('data-notification-event') && target.hasAttribute('data-notification-channel')) {
        updateNotificationWhatsappPreview();
      }
    });

    document.addEventListener('kc:authchange', function (event) {
      const detail = event && event.detail && typeof event.detail === 'object'
        ? event.detail
        : {};
      const sessionUser = detail.user || (detail.session && detail.session.user) || null;
      refreshSettingsPage({ authChange: true, sessionUser });
    });

    $all('[data-theme-option]').forEach((button) => {
      button.addEventListener('click', function () {
        const theme = String(button.getAttribute('data-theme-option') || '').trim();
        if (typeof window.kcSetTheme === 'function') window.kcSetTheme(theme);
        updateThemeButtons();
      });
    });

    document.addEventListener('kc:themechange', updateThemeButtons);
  }

  async function loadProfile(options) {
    const opts = options || {};
    const generation = ++state.accountLoadGeneration;
    if (!window.KCSupabase) {
      resetAccountBoundState(null);
      return { generation, userId: '' };
    }

    let nextUser = Object.prototype.hasOwnProperty.call(opts, 'sessionUser')
      ? opts.sessionUser
      : (typeof window.KCSupabase.getUser === 'function'
          ? window.KCSupabase.getUser()
          : null);
    if (!nextUser && !Object.prototype.hasOwnProperty.call(opts, 'sessionUser')
      && typeof window.KCSupabase.getCurrentUser === 'function') {
      nextUser = await window.KCSupabase.getCurrentUser();
    }
    if (generation !== state.accountLoadGeneration) {
      return { generation, userId: '', stale: true };
    }

    const previousUserId = getUserId(state.user);
    const userId = getUserId(nextUser);
    if (previousUserId !== userId) {
      resetAccountBoundState(nextUser);
    } else {
      state.user = nextUser || null;
    }
    if (!userId) return { generation, userId: '' };

    if (window.KCAPI) {
      let profile = typeof window.KCAPI.getCurrentProfile === 'function'
        ? window.KCAPI.getCurrentProfile()
        : null;
      if (!profileBelongsToUser(profile, userId)) profile = null;

      if (!profile && typeof window.KCAPI.getMyProfile === 'function') {
        const fetchedProfile = await window.KCAPI.getMyProfile();
        if (!isActiveAccountLoad(generation, userId)) {
          return { generation, userId, stale: true };
        }
        profile = profileBelongsToUser(fetchedProfile, userId) ? fetchedProfile : null;
      }
      if (!profile && typeof window.KCAPI.syncProfile === 'function') {
        await window.KCAPI.syncProfile();
        if (!isActiveAccountLoad(generation, userId)) {
          return { generation, userId, stale: true };
        }
        profile = typeof window.KCAPI.getCurrentProfile === 'function'
          ? window.KCAPI.getCurrentProfile()
          : null;
        if (!profileBelongsToUser(profile, userId)) profile = null;
        if (!profile && typeof window.KCAPI.getMyProfile === 'function') {
          const fetchedProfile = await window.KCAPI.getMyProfile();
          if (!isActiveAccountLoad(generation, userId)) {
            return { generation, userId, stale: true };
          }
          profile = profileBelongsToUser(fetchedProfile, userId) ? fetchedProfile : null;
        }
      }
      if (isActiveAccountLoad(generation, userId)) state.profile = profile;
    }
    return { generation, userId, stale: !isActiveAccountLoad(generation, userId) };
  }

  async function loadNotificationPreferences() {
    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    state.notificationPreferences = getDefaultNotificationPreferences();
    if (!userId || !window.KCAPI || typeof window.KCAPI.getNotificationPreferences !== 'function') return;
    try {
      const preferences = await window.KCAPI.getNotificationPreferences();
      if (!isActiveAccountLoad(generation, userId)) return;
      state.notificationPreferences = normalizeNotificationPreferences(preferences);
    } catch (error) {
      if (!isActiveAccountLoad(generation, userId)) return;
      console.error('[Settings] notification preferences load failed:', error);
      state.notificationPreferences = getDefaultNotificationPreferences();
    }
  }

  async function loadNotificationChannelTargets() {
    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    state.notificationChannelTargets = getDefaultNotificationChannelTargets();
    if (!userId || !window.KCAPI || typeof window.KCAPI.getNotificationChannelTargets !== 'function') return;
    try {
      const targets = await window.KCAPI.getNotificationChannelTargets();
      if (!isActiveAccountLoad(generation, userId)) return;
      state.notificationChannelTargets = normalizeNotificationChannelTargets(targets);
    } catch (error) {
      if (!isActiveAccountLoad(generation, userId)) return;
      console.error('[Settings] notification channel targets load failed:', error);
      state.notificationChannelTargets = getDefaultNotificationChannelTargets();
    }
  }

  async function refreshSettingsPage(options) {
    const opts = options || {};
    const hasSessionUser = Object.prototype.hasOwnProperty.call(opts, 'sessionUser');
    let generation = state.accountLoadGeneration;
    let expectedUserId = hasSessionUser
      ? getUserId(opts.sessionUser)
      : getUserId(state.user);
    setStatus('Atualizando configurações...', 'info');
    const guest = $('#settingsGuest');
    const content = $('#settingsContent');
    if (opts.authChange) {
      if (guest) guest.style.display = 'none';
      if (content) content.style.display = 'none';
      renderDataSubjectRequestsLoading();
    }
    try {
      const accountLoadPromise = loadProfile(
        hasSessionUser ? { sessionUser: opts.sessionUser } : undefined
      );
      generation = state.accountLoadGeneration;
      const accountLoad = await accountLoadPromise;
      if (accountLoad && accountLoad.stale) return;
      generation = accountLoad && accountLoad.generation || generation;
      expectedUserId = accountLoad && typeof accountLoad.userId === 'string'
        ? accountLoad.userId
        : getUserId(state.user);
      if (!isActiveAccountLoad(generation, expectedUserId)) return;
      if (!state.user) {
        if (guest) guest.style.display = 'grid';
        if (content) content.style.display = 'none';
        setStatus('Entre para atualizar suas configurações.', 'warn');
        return;
      }
      const userId = expectedUserId;
      await Promise.all([
        loadNotificationPreferences(),
        loadNotificationChannelTargets(),
        loadDataSubjectRequests({ silent: true }),
      ]);
      if (!isActiveAccountLoad(generation, userId)) return;
      populate();
      if (guest) guest.style.display = 'none';
      if (content) content.style.display = 'grid';
      setStatus('Configurações atualizadas.', 'success');
    } catch (error) {
      const guardedUserId = expectedUserId || getUserId(state.user);
      if (!isActiveAccountLoad(generation, guardedUserId)) return;
      console.error('[Settings] refresh failed:', error);
      if (state.user) {
        populate();
        if (state.dataSubjectRequests.length) {
          renderDataSubjectRequests(state.dataSubjectRequests);
        } else {
          renderDataSubjectRequestsUnavailable();
        }
        if (guest) guest.style.display = 'none';
        if (content) content.style.display = 'grid';
        setStatus(
          'Não foi possível atualizar todos os dados agora. Os controles disponíveis permanecem visíveis; tente novamente antes de salvar alterações.',
          'error'
        );
      } else {
        if (guest) guest.style.display = 'grid';
        if (content) content.style.display = 'none';
        setStatus('Não foi possível confirmar a conta atual. Entre novamente ou tente atualizar.', 'error');
      }
    }
  }

  function initPullToRefresh() {
    if (!window.KCPullToRefresh || document.body.dataset.kcSettingsPtrReady === '1') return;
    document.body.dataset.kcSettingsPtrReady = '1';
    window.KCPullToRefresh.init({
      container: document.body,
      onRefresh: refreshSettingsPage,
    });
  }

  async function init() {
    state.nextPath = readNextPath();
    renderPrimaryMethodOptions();
    bindEvents();

    try {
      await loadProfile();
    } catch (error) {
      console.error('[Settings] init failed:', error);
    }

    if (!state.user) {
      $('#settingsGuest').style.display = 'grid';
      initPullToRefresh();
      return;
    }

    const generation = state.accountLoadGeneration;
    const userId = getUserId(state.user);
    await Promise.all([
      loadNotificationPreferences(),
      loadNotificationChannelTargets(),
      loadDataSubjectRequests({ silent: true }),
    ]);
    if (!isActiveAccountLoad(generation, userId)) return;
    populate();
    $('#settingsContent').style.display = 'grid';
    initPullToRefresh();
  }

  window.KCSettingsRefresh = refreshSettingsPage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
