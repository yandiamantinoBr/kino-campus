(function () {
  'use strict';

  const Help = window.KCHelpUtils || {};
  const HELP_PAGE_SIZE = 25;
  const QUERY_DEBOUNCE_MS = 250;
  const FALLBACK_TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'question', label: 'Dúvida' }),
    Object.freeze({ value: 'platform_issue', label: 'Problema na plataforma' }),
    Object.freeze({ value: 'account_access', label: 'Conta e acesso' }),
    Object.freeze({ value: 'external_access', label: 'Solicitação de acesso externo' }),
    Object.freeze({ value: 'report', label: 'Denúncia' }),
    Object.freeze({ value: 'suggestion_praise', label: 'Sugestão ou elogio' }),
  ]);
  const FALLBACK_STATUS_VALUES = Object.freeze(['new', 'triaged', 'in_progress', 'resolved', 'archived']);
  const FALLBACK_PRIORITY_VALUES = Object.freeze(['low', 'normal', 'high', 'urgent']);
  const LGPD_STATUS_LABELS = Object.freeze({
    confirmed: 'Confirmacao registrada',
    partial_failure: 'Execucao parcial; revisao obrigatoria',
    diagnosed: 'Diagnóstico preparado',
    pending_confirmation: 'Aguardando confirmação',
    reversible_applied: 'Ocultação reversível aplicada',
    erased: 'Exclusão executada',
    cancelled: 'Cancelado',
    failed: 'Falhou',
    post_core_redacted: 'Núcleo excluído; carregar estado seguro',
    'não iniciado': 'Não iniciado',
  });
  const LGPD_ACTIONS = new Set([
    'link_verified_identity',
    'diagnose',
    'apply_reversible',
    'record_confirmation_delivery',
    'cancel_reversible',
    'generate_receipt',
    'erase_confirmed',
    'retry_finalize',
  ]);
  const LGPD_POST_CORE_ACTIONS = new Set([
    'diagnose',
    'generate_receipt',
    'retry_finalize',
  ]);
  const LGPD_MUTATING_ACTIONS = new Set([
    'link_verified_identity',
    'apply_reversible',
    'record_confirmation_delivery',
    'cancel_reversible',
    'erase_confirmed',
    'retry_finalize',
  ]);
  const LGPD_RETRY_FINALIZE_FAILURE_STAGES = new Set([
    'completion_email',
    'completion_outbox',
    'help_redaction',
    'external_processors',
    'data_subject_finalization',
    'final_workflow',
    'postconditions',
  ]);
  const EXPORT_MUTATING_ACTIONS = new Set([
    'link_verified_ticket',
    'record_processor',
    'build',
    'retry',
    'purge',
  ]);
  const VERIFIED_ERASURE_IDENTITY_SOURCES = new Set([
    'authenticated_account',
    'admin_verified_anonymous_erasure',
  ]);
  const VERIFIED_DATA_EXPORT_IDENTITY_SOURCES = new Set([
    'authenticated_account',
    'admin_verified_anonymous_ticket',
  ]);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SHA256_RE = /^[a-f0-9]{64}$/i;
  const EXPORT_ARTIFACT_REF_RE = /^KEA-[A-F0-9]{32}$/;
  // Sensitive moderator fields survive renderRows() only in this page's
  // memory. Browser storage persists safe queue preferences, never ticket PII.
  const ADMIN_HELP_DRAFT_KEY = 'kc_admin_help_preferences_v2';
  const ADMIN_HELP_DRAFT_LEGACY_KEYS = Object.freeze(['kc_admin_help_draft_v1']);
  const ADMIN_HELP_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const ADMIN_HELP_DRAFT_DEBOUNCE_MS = 200;
  // Safe view preferences only. Queue rows are reloaded after authorization.
  const ADMIN_HELP_VIEW_KEY = 'kc_admin_help_view_v2';
  const ADMIN_HELP_VIEW_LEGACY_KEYS = Object.freeze(['kc_admin_help_view_v1']);
  const ADMIN_HELP_VIEW_TTL_MS = 30 * 60 * 1000;
  const CADU_HANDOFF_KEY = 'kc_admin_cadu_handoff_v1';
  const EXTERNAL_ACCESS_FOCUS_KEY = 'kc_admin_external_access_focus_v1';
  const ADMIN_HANDOFF_TTL_MS = 5 * 60 * 1000;

  const state = {
    rows: [],
    filters: {
      status: 'all',
      type: 'all',
      priority: 'all',
      query: '',
    },
    pagination: {
      limit: HELP_PAGE_SIZE,
      totalCount: 0,
      hasMore: false,
      isLoadingMore: false,
      summary: null,
    },
    erasureResults: {},
    erasureBusy: {},
    erasureUncertain: {},
    exportSupplementResults: {},
    exportSupplementBusy: {},
    exportSupplementUncertain: {},
    triageBusy: {},
    /** @type {Record<string, number>} id -> saved_at_ms for post-save hint after re-render */
    triageJustSaved: {},
    requestToken: 0,
    authGeneration: 0,
    authorizedAdminUserId: '',
    isAuthorized: false,
  };

  const TRIAGE_SAVED_HINT_MS = 5000;

  let eventsBound = false;
  let adminDraftTimer = null;
  let adminDraftRestoring = false;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[character];
    });
  }

  function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  // ── Per-ticket draft (survives renderRows wipe in this document) ───────
  const adminDraftMemory = {
    tickets: Object.create(null),
    filters: null,
  };
  /** @type {Record<string, Record<string, true>>} */
  const adminDraftDirty = Object.create(null);
  let adminFiltersDirty = false;
  let adminDraftRestoreTimer = null;

  const ADMIN_DRAFT_SKIP_ATTRS = {
    'data-export-delivery-field': true,
    'data-export-processor-row': true,
    'data-export-identity-link': true,
    'data-export-supplement-panel': true,
    'data-lgpd-panel': true,
    'data-lgpd-live': true,
    'data-lgpd-identity-guidance': true,
    'data-lgpd-action': true,
    'data-lgpd-export': true,
    'data-export-action': true,
    'data-export-processor-save': true,
    'data-help-save': true,
    'data-help-status-set': true,
    'data-help-priority-set': true,
    'data-help-load-more': true,
    'data-help-id': true,
    'data-help-copy': true,
    'data-help-triage': true,
    'data-help-triage-status': true,
    'data-help-identity': true,
  };

  function adminDraftStorageClear() {
    [ADMIN_HELP_DRAFT_KEY].concat(ADMIN_HELP_DRAFT_LEGACY_KEYS).forEach(function (key) {
      try {
        if (window.sessionStorage) window.sessionStorage.removeItem(key);
      } catch (_) { /* ignore */ }
      try {
        if (window.localStorage) window.localStorage.removeItem(key);
      } catch (_) { /* purge legacy PII cache */ }
    });
  }

  function adminDraftStorageRead() {
    let raw = null;
    try {
      if (window.sessionStorage) raw = window.sessionStorage.getItem(ADMIN_HELP_DRAFT_KEY);
    } catch (_) { /* ignore */ }
    ADMIN_HELP_DRAFT_LEGACY_KEYS.forEach(function (key) {
      try {
        if (window.sessionStorage) window.sessionStorage.removeItem(key);
      } catch (_) { /* ignore */ }
      try {
        if (window.localStorage) window.localStorage.removeItem(key);
      } catch (_) { /* ignore */ }
    });
    if (!raw) {
      return {
        v: 2,
        saved_at_ms: Date.now(),
        tickets: Object.assign(Object.create(null), adminDraftMemory.tickets),
        filters: adminDraftMemory.filters,
      };
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 2 || typeof parsed.filters !== 'object' || !parsed.filters) {
        return {
          v: 2,
          saved_at_ms: Date.now(),
          tickets: Object.assign(Object.create(null), adminDraftMemory.tickets),
          filters: adminDraftMemory.filters,
        };
      }
      const age = Date.now() - Number(parsed.saved_at_ms || 0);
      if (!Number.isFinite(age) || age < 0 || age > ADMIN_HELP_DRAFT_TTL_MS) {
        adminDraftStorageClear();
        return {
          v: 2,
          saved_at_ms: Date.now(),
          tickets: Object.assign(Object.create(null), adminDraftMemory.tickets),
          filters: adminDraftMemory.filters,
        };
      }
      return {
        v: 2,
        saved_at_ms: Number(parsed.saved_at_ms) || Date.now(),
        tickets: Object.assign(Object.create(null), adminDraftMemory.tickets),
        filters: adminDraftMemory.filters || parsed.filters || null,
      };
    } catch (_) {
      return {
        v: 2,
        saved_at_ms: Date.now(),
        tickets: Object.assign(Object.create(null), adminDraftMemory.tickets),
        filters: adminDraftMemory.filters,
      };
    }
  }

  function adminDraftStorageWrite(store) {
    const tickets = store.tickets || Object.create(null);
    adminDraftMemory.tickets = Object.assign(Object.create(null), tickets);
    adminDraftMemory.filters = store.filters || null;
    const filters = store.filters && typeof store.filters === 'object'
      ? {
          status: String(store.filters.status || 'all'),
          type: String(store.filters.type || 'all'),
          priority: String(store.filters.priority || 'all'),
        }
      : null;
    const payload = JSON.stringify({
      v: 2,
      saved_at_ms: Date.now(),
      filters: filters,
    });
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(ADMIN_HELP_DRAFT_KEY, payload);
    } catch (_) { /* ignore */ }
    ADMIN_HELP_DRAFT_LEGACY_KEYS.concat([ADMIN_HELP_DRAFT_KEY]).forEach(function (key) {
      try {
        if (window.localStorage) window.localStorage.removeItem(key);
      } catch (_) { /* purge legacy PII cache */ }
    });
  }

  function clearAdminDraftMemory() {
    adminDraftMemory.tickets = Object.create(null);
    adminDraftMemory.filters = null;
    Object.keys(adminDraftDirty).forEach(function (id) { delete adminDraftDirty[id]; });
    adminFiltersDirty = false;
    adminDraftStorageClear();
  }

  function isBlankDraftValue(value) {
    if (typeof value === 'boolean') return value === false;
    return String(value == null ? '' : value).trim() === '';
  }

  function isDefaultFilterSnapshot(filters) {
    if (!filters || typeof filters !== 'object') return true;
    return String(filters.status || 'all') === 'all'
      && String(filters.type || 'all') === 'all'
      && String(filters.priority || 'all') === 'all'
      && String(filters.query || '').trim() === '';
  }

  // Never let empty re-captures wipe operator typing (the leave/return bug).
  // newFields is a partial intentional patch (dirty/non-blank only).
  function mergeDraftFields(oldFields, newFields) {
    const out = Object.assign({}, oldFields || {});
    Object.keys(newFields || {}).forEach(function (key) {
      const next = newFields[key];
      if (typeof next === 'boolean') {
        out[key] = next;
        return;
      }
      if (!isBlankDraftValue(next)) {
        out[key] = String(next);
        return;
      }
      // Explicit blank from a dirty field clears prior text (operator deleted it).
      if (Object.prototype.hasOwnProperty.call(newFields, key)) {
        out[key] = '';
      }
    });
    return out;
  }

  function mergeTicketDraft(oldDraft, newDraft) {
    if (!newDraft || !newDraft.fields) return oldDraft || null;
    if (!oldDraft || !oldDraft.fields) {
      return {
        v: 1,
        saved_at_ms: Date.now(),
        fields: Object.assign({}, newDraft.fields),
      };
    }
    return {
      v: 1,
      saved_at_ms: Date.now(),
      fields: mergeDraftFields(oldDraft.fields, newDraft.fields),
    };
  }

  function markAdminDraftFieldDirty(ticketId, fieldKey) {
    const id = String(ticketId || '').trim();
    const key = String(fieldKey || '').trim();
    if (!id || !key) return;
    if (!adminDraftDirty[id]) adminDraftDirty[id] = Object.create(null);
    adminDraftDirty[id][key] = true;
  }

  function clearAdminTicketDraft(ticketId) {
    const id = String(ticketId || '').trim();
    if (!id) return;
    delete adminDraftDirty[id];
    const store = adminDraftStorageRead();
    if (store.tickets && store.tickets[id]) {
      delete store.tickets[id];
      adminDraftStorageWrite(store);
    }
  }

  function adminDraftFieldKey(el) {
    if (!el || !el.getAttribute) return '';
    const preferred = [
      'data-lgpd-account-email',
      'data-lgpd-identity-channel',
      'data-lgpd-identity-reference',
      'data-lgpd-identity-at',
      'data-lgpd-identity-attested',
      'data-lgpd-delivery-reference',
      'data-lgpd-delivery-at',
      'data-lgpd-delivery-attested',
      'data-lgpd-copy-decision',
      'data-lgpd-copy-reference',
      'data-lgpd-copy-at',
      'data-lgpd-copy-attested',
      'data-lgpd-evidence-reference',
      'data-lgpd-evidence-at',
      'data-lgpd-evidence-attested',
      'data-lgpd-confirmation',
      'data-lgpd-cancellation-reason',
      'data-lgpd-provider-reference',
      'data-lgpd-provider-at',
      'data-lgpd-provider-attested',
      'data-lgpd-provider-outcome',
      'data-lgpd-provider-retention-basis',
      'data-lgpd-provider-retention-at',
      'data-lgpd-completion-reference',
      'data-lgpd-completion-at',
      'data-lgpd-completion-attested',
      'data-help-status',
      'data-help-priority',
      'data-export-account-email',
      'data-export-identity-channel',
      'data-export-identity-reference',
      'data-export-identity-at',
      'data-export-identity-attested',
      'data-export-outcome',
      'data-export-evidence',
      'data-export-delivery-channel',
      'data-export-delivered-at',
      'data-export-delivery-reference',
      'data-export-delivery-at',
      'data-export-delivery-attested',
    ];
    let attrName = '';
    for (let i = 0; i < preferred.length; i += 1) {
      if (el.hasAttribute(preferred[i])) {
        attrName = preferred[i];
        break;
      }
    }
    if (!attrName && el.attributes) {
      for (let i = 0; i < el.attributes.length; i += 1) {
        const name = el.attributes[i] && el.attributes[i].name;
        if (!name || ADMIN_DRAFT_SKIP_ATTRS[name]) continue;
        if (
          name.indexOf('data-lgpd-') === 0
          || name.indexOf('data-export-') === 0
          || name === 'data-help-status'
          || name === 'data-help-priority'
        ) {
          attrName = name;
          break;
        }
      }
    }
    if (!attrName) return '';
    const provider = String(el.getAttribute('data-provider') || '').trim();
    return provider ? (attrName + '::' + provider) : attrName;
  }

  function isAdminDraftableControl(el) {
    if (!el || !el.tagName) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return false;
    const type = String(el.type || '').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'hidden') return false;
    return Boolean(adminDraftFieldKey(el));
  }

  /**
   * Capture operator fields from a card.
   * By default only dirty keys and non-blank values are included so a full
   * HTML rebuild (empty defaults) cannot overwrite stored drafts.
   */
  function captureCardDraft(card, options) {
    if (!card || !card.getAttribute) return null;
    const id = String(card.getAttribute('data-help-id') || '').trim();
    if (!id) return null;
    const forceAll = options && options.forceAll === true;
    const dirtyMap = adminDraftDirty[id] || Object.create(null);
    const fields = {};
    let count = 0;
    card.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!isAdminDraftableControl(el)) return;
      const key = adminDraftFieldKey(el);
      if (!key) return;
      const dirty = forceAll || dirtyMap[key] === true;
      if (el.type === 'checkbox' || el.type === 'radio') {
        const checked = !!el.checked;
        // Unchecked defaults after render must not clear a prior true.
        if (!dirty && !checked) return;
        fields[key] = checked;
        count += 1;
        return;
      }
      const value = String(el.value || '');
      if (!dirty && isBlankDraftValue(value)) return;
      // Status/priority selects always have a value; only persist when dirty
      // so server defaults do not stamp over operator triage changes.
      if (!dirty && (key === 'data-help-status' || key === 'data-help-priority')) return;
      fields[key] = value;
      count += 1;
    });
    if (!count) return null;
    return {
      v: 1,
      saved_at_ms: Date.now(),
      fields: fields,
    };
  }

  function applyCardDraft(card, draft) {
    if (!card || !draft || !draft.fields || typeof draft.fields !== 'object') return false;
    adminDraftRestoring = true;
    let applied = 0;
    try {
      Object.keys(draft.fields).forEach(function (key) {
        const parts = String(key).split('::');
        const attr = parts[0];
        const provider = parts[1] || '';
        if (!attr || attr.indexOf('data-') !== 0) return;
        let el = null;
        try {
          if (provider) {
            el = card.querySelector('[' + attr + '][data-provider="' + provider.replace(/"/g, '') + '"]');
          } else {
            el = card.querySelector('[' + attr + ']');
          }
        } catch (_) {
          el = null;
        }
        if (!el) return;
        // Chip triage auto-saves; never rehydrate status/priority from drafts
        // (would desync chips vs server and reintroduce the old select flow).
        if (attr === 'data-help-status' || attr === 'data-help-priority') return;
        const value = draft.fields[key];
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = !!value;
          applied += 1;
        } else if (value != null && String(value) !== '') {
          el.value = String(value);
          applied += 1;
        } else if (value != null && String(value) === '' && (el.tagName || '').toLowerCase() !== 'select') {
          el.value = '';
          applied += 1;
        }
      });
      card.querySelectorAll('[data-export-outcome]').forEach(function (outcome) {
        const processorRow = outcome.closest('[data-export-processor-row]');
        if (!processorRow) return;
        const externalDelivery = outcome.value === 'supplied_out_of_band';
        processorRow.querySelectorAll('[data-export-delivery-field] input, [data-export-delivery-field] select').forEach(function (field) {
          field.disabled = !externalDelivery;
        });
      });
      return applied > 0;
    } catch (_) {
      return false;
    } finally {
      adminDraftRestoring = false;
    }
  }

  function readCurrentFilterSnapshot() {
    return {
      status: String($('#helpStatusFilter') && $('#helpStatusFilter').value || state.filters.status || 'all'),
      type: String($('#helpTypeFilter') && $('#helpTypeFilter').value || state.filters.type || 'all'),
      priority: String($('#helpPriorityFilter') && $('#helpPriorityFilter').value || state.filters.priority || 'all'),
      query: String($('#helpQueryFilter') && $('#helpQueryFilter').value || state.filters.query || ''),
    };
  }

  function captureAllVisibleCardDrafts() {
    const list = $('#helpRequestsList');
    const store = adminDraftStorageRead();
    if (list) {
      list.querySelectorAll('[data-help-id]').forEach(function (card) {
        const id = String(card.getAttribute('data-help-id') || '').trim();
        if (!id) return;
        const snapshot = captureCardDraft(card);
        if (!snapshot) return;
        store.tickets[id] = mergeTicketDraft(store.tickets[id], snapshot);
      });
    }
    const filterSnap = readCurrentFilterSnapshot();
    // After clearSensitiveAdminState the UI is all/empty. Do not overwrite a
    // previously saved non-default filter draft unless the operator edited filters.
    if (adminFiltersDirty || !isDefaultFilterSnapshot(filterSnap) || isDefaultFilterSnapshot(store.filters)) {
      store.filters = filterSnap;
    }
    adminDraftStorageWrite(store);
  }

  function applyAllVisibleCardDrafts() {
    const list = $('#helpRequestsList');
    if (!list) return 0;
    const store = adminDraftStorageRead();
    let count = 0;
    list.querySelectorAll('[data-help-id]').forEach(function (card) {
      const id = String(card.getAttribute('data-help-id') || '').trim();
      const draft = store.tickets && store.tickets[id];
      if (draft && applyCardDraft(card, draft)) count += 1;
    });
    return count;
  }

  function scheduleAdminDraftSave() {
    if (adminDraftRestoring) return;
    if (adminDraftTimer) {
      try { clearTimeout(adminDraftTimer); } catch (_) { /* ignore */ }
    }
    adminDraftTimer = setTimeout(function () {
      adminDraftTimer = null;
      captureAllVisibleCardDrafts();
    }, ADMIN_HELP_DRAFT_DEBOUNCE_MS);
  }

  function flushAdminDraftSave() {
    if (adminDraftTimer) {
      try { clearTimeout(adminDraftTimer); } catch (_) { /* ignore */ }
      adminDraftTimer = null;
    }
    captureAllVisibleCardDrafts();
  }

  // Re-apply after paint so late DOM (or double-render races) still restore.
  function scheduleAdminDraftRestore() {
    try { applyAllVisibleCardDrafts(); } catch (_) { /* ignore */ }
    if (adminDraftRestoreTimer) {
      try { clearTimeout(adminDraftRestoreTimer); } catch (_) { /* ignore */ }
    }
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        try { applyAllVisibleCardDrafts(); } catch (_) { /* ignore */ }
      });
    }
    adminDraftRestoreTimer = setTimeout(function () {
      adminDraftRestoreTimer = null;
      try { applyAllVisibleCardDrafts(); } catch (_) { /* ignore */ }
    }, 50);
  }

  function restoreAdminFiltersFromDraft() {
    const store = adminDraftStorageRead();
    const filters = store.filters;
    if (!filters || typeof filters !== 'object') return false;
    const statusEl = $('#helpStatusFilter');
    const typeEl = $('#helpTypeFilter');
    const priorityEl = $('#helpPriorityFilter');
    const queryEl = $('#helpQueryFilter');
    let changed = false;
    if (statusEl && filters.status != null && statusEl.value !== String(filters.status)) {
      statusEl.value = String(filters.status);
      changed = true;
    }
    if (typeEl && filters.type != null && typeEl.value !== String(filters.type)) {
      typeEl.value = String(filters.type);
      changed = true;
    }
    if (priorityEl && filters.priority != null && priorityEl.value !== String(filters.priority)) {
      priorityEl.value = String(filters.priority);
      changed = true;
    }
    if (queryEl && filters.query != null && queryEl.value !== String(filters.query)) {
      queryEl.value = String(filters.query);
      changed = true;
    }
    state.filters.status = String(filters.status || 'all');
    state.filters.type = String(filters.type || 'all');
    state.filters.priority = String(filters.priority || 'all');
    state.filters.query = String(filters.query || '');
    return changed;
  }

  function getHelpTypeOptions() {
    const shared = window.KCHelpUtils;
    if (shared && Array.isArray(shared.HELP_TYPE_OPTIONS) && shared.HELP_TYPE_OPTIONS.length) {
      return shared.HELP_TYPE_OPTIONS;
    }
    return FALLBACK_TYPE_OPTIONS;
  }

  function getValidValues(options, fallback) {
    if (Array.isArray(options) && options.length) {
      return options
        .map((option) => String(option && option.value || '').trim())
        .filter(Boolean);
    }
    return fallback.slice();
  }

  function getValidStatuses() {
    return getValidValues(Help.HELP_STATUS_OPTIONS, FALLBACK_STATUS_VALUES);
  }

  function getValidPriorities() {
    return getValidValues(Help.HELP_PRIORITY_OPTIONS, FALLBACK_PRIORITY_VALUES);
  }

  function showError(message) {
    const error = $('#admin-error');
    if (!error) return;
    error.textContent = String(message || 'Não foi possível carregar os pedidos de ajuda.');
    error.style.display = 'block';
  }

  function hideError() {
    const error = $('#admin-error');
    if (!error) return;
    error.textContent = '';
    error.style.display = 'none';
  }

  function showLoading(active, options = {}) {
    const silent = options.silent === true;
    const loading = $('#admin-loading');
    const content = $('#admin-content');
    if (silent) {
      // Keep the queue visible during soft revalidation / background refresh.
      if (loading) loading.style.display = 'none';
      if (content && state.isAuthorized) content.style.display = 'block';
      if (content) {
        if (active) content.setAttribute('aria-busy', 'true');
        else content.removeAttribute('aria-busy');
      }
      return;
    }
    if (loading) loading.style.display = active ? 'flex' : 'none';
    if (content) content.style.display = !active && state.isAuthorized ? 'block' : 'none';
    if (content && !active) content.removeAttribute('aria-busy');
  }

  function captureAdminContext() {
    if (!state.isAuthorized || !state.authorizedAdminUserId) return null;
    return {
      generation: state.authGeneration,
      userId: state.authorizedAdminUserId,
    };
  }

  function isActiveAdminContext(context) {
    return Boolean(
      context
      && state.isAuthorized
      && context.generation === state.authGeneration
      && context.userId === state.authorizedAdminUserId
    );
  }

  function clearAdminViewSnapshot() {
    [ADMIN_HELP_VIEW_KEY].concat(ADMIN_HELP_VIEW_LEGACY_KEYS).forEach(function (key) {
      try {
        if (window.sessionStorage) window.sessionStorage.removeItem(key);
      } catch (_) { /* ignore */ }
    });
  }

  function saveAdminViewSnapshot() {
    if (!state.isAuthorized || !state.authorizedAdminUserId) return;
    const payload = {
      v: 2,
      saved_at_ms: Date.now(),
      filters: {
        status: String(state.filters.status || 'all'),
        type: String(state.filters.type || 'all'),
        priority: String(state.filters.priority || 'all'),
      },
      pagination: {
        limit: state.pagination.limit,
      },
    };
    try {
      if (window.sessionStorage) {
        window.sessionStorage.setItem(ADMIN_HELP_VIEW_KEY, JSON.stringify(payload));
      }
    } catch (_) { /* quota / private mode */ }
  }

  function readAdminViewSnapshot() {
    let raw = null;
    try {
      if (window.sessionStorage) raw = window.sessionStorage.getItem(ADMIN_HELP_VIEW_KEY);
    } catch (_) { /* ignore */ }
    ADMIN_HELP_VIEW_LEGACY_KEYS.forEach(function (key) {
      try {
        if (window.sessionStorage) window.sessionStorage.removeItem(key);
      } catch (_) { /* purge legacy queue cache */ }
    });
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 2 || !parsed.filters || typeof parsed.filters !== 'object') return null;
      const age = Date.now() - Number(parsed.saved_at_ms || 0);
      if (!Number.isFinite(age) || age < 0 || age > ADMIN_HELP_VIEW_TTL_MS) {
        clearAdminViewSnapshot();
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  // Restore non-sensitive preferences only. Queue PII is never painted before
  // reauthorizeAdminView validates the active administrator.
  function restoreAdminViewSnapshotPaint() {
    const snap = readAdminViewSnapshot();
    if (!snap) return false;
    if (snap.filters && typeof snap.filters === 'object') {
      state.filters.status = String(snap.filters.status || 'all');
      state.filters.type = String(snap.filters.type || 'all');
      state.filters.priority = String(snap.filters.priority || 'all');
      state.filters.query = '';
      const statusEl = $('#helpStatusFilter');
      const typeEl = $('#helpTypeFilter');
      const priorityEl = $('#helpPriorityFilter');
      const queryEl = $('#helpQueryFilter');
      if (statusEl) statusEl.value = state.filters.status;
      if (typeEl) typeEl.value = state.filters.type;
      if (priorityEl) priorityEl.value = state.filters.priority;
      if (queryEl) queryEl.value = '';
    }
    if (snap.pagination && typeof snap.pagination === 'object') {
      state.pagination.limit = Math.max(1, toFiniteNumber(snap.pagination.limit, HELP_PAGE_SIZE));
    }
    return true;
  }

  function clearSensitiveAdminState(options = {}) {
    state.authGeneration += 1;
    state.requestToken += 1;
    state.authorizedAdminUserId = '';
    state.isAuthorized = false;
    state.rows = [];
    state.filters.status = 'all';
    state.filters.type = 'all';
    state.filters.priority = 'all';
    state.filters.query = '';
    state.pagination.limit = HELP_PAGE_SIZE;
    state.pagination.totalCount = 0;
    state.pagination.hasMore = false;
    state.pagination.isLoadingMore = false;
    state.pagination.summary = null;
    state.erasureResults = Object.create(null);
    state.erasureBusy = Object.create(null);
    state.erasureUncertain = Object.create(null);
    state.exportSupplementResults = Object.create(null);
    state.exportSupplementBusy = Object.create(null);
    state.exportSupplementUncertain = Object.create(null);
    state.triageBusy = Object.create(null);
    state.triageJustSaved = Object.create(null);
    if (options.clearBrowserState === true) {
      clearAdminViewSnapshot();
      clearAdminDraftMemory();
    }

    const queryField = $('#helpQueryFilter');
    if (queryField) {
      window.clearTimeout(queryField._kcTimer);
      queryField._kcTimer = null;
      queryField.value = '';
    }
    [
      ['#helpStatusFilter', 'all'],
      ['#helpTypeFilter', 'all'],
      ['#helpPriorityFilter', 'all'],
    ].forEach(([selector, value]) => {
      const field = $(selector);
      if (field) field.value = value;
    });

    const summary = $('#helpSummary');
    const list = $('#helpRequestsList');
    if (summary) summary.replaceChildren();
    if (list) list.replaceChildren();
    hideError();

    const loading = $('#admin-loading');
    const loadingText = loading && loading.querySelector('span');
    if (loadingText) loadingText.textContent = 'Verificando acesso...';
    if (loading) loading.style.display = options.showChecking === false ? 'none' : 'flex';
    const content = $('#admin-content');
    if (content) {
      content.style.display = 'none';
      content.removeAttribute('aria-busy');
    }
  }

  function denyAdminAccess(message, generation) {
    if (generation !== state.authGeneration) return;
    clearSensitiveAdminState({ showChecking: false, clearBrowserState: true });
    showError(message);
  }

  function showToast(message, type, durationMs) {
    const text = String(message || '').trim();
    if (!text) return;
    const duration = Number.isFinite(Number(durationMs)) && Number(durationMs) > 0
      ? Number(durationMs)
      : 2600;
    if (typeof window.showToast === 'function') {
      window.showToast(text, type || 'info', duration);
      return;
    }
    window.alert(text);
  }

  function friendlyLgpdErrorMessage(error) {
    const raw = String(
      error && typeof error === 'object'
        ? (error.message || error.error || error.detail || '')
        : (error || '')
    ).trim();
    const code = raw.toLowerCase();
    const body = error && typeof error === 'object' && error.body && typeof error.body === 'object'
      ? String(error.body.error || error.body.message || '').toLowerCase()
      : '';
    const value = [code, body].filter(Boolean).join(' ');
    if (
      value.indexOf('erasure_contract_mismatch') >= 0
      || value.indexOf('account_erasure_contract_mismatch') >= 0
    ) {
      return 'O backend de exclusão não está na versão segura exigida por este painel. Nenhuma ação foi enviada; aguarde o deploy validado e atualize a página.';
    }
    if (value.indexOf('erasure_contract_changed_after_probe') >= 0) {
      return 'O backend mudou durante a operação. O resultado é indeterminado: não repita a ação antes de atualizar a fila e executar Preparar diagnóstico.';
    }
    if (value.indexOf('invalid_session') >= 0 || value.indexOf('session_not_active') >= 0 || value.indexOf('missing authorization') >= 0 || value.indexOf('unauthorized') >= 0) {
      return 'Sua sessão administrativa expirou ou foi trocada. Entre novamente com uma conta administradora e recarregue esta página.';
    }
    if (value.indexOf('not_authorized') >= 0) {
      return 'A sessão atual não tem permissão de administrador para executar este fluxo LGPD.';
    }
    if (value.indexOf('invalid_help_request_id') >= 0) {
      return 'O pedido de ajuda não foi localizado no fluxo LGPD. Recarregue a página e tente novamente pelo cartão correto da solicitação.';
    }
    if (value.indexOf('valid_target_email_required') >= 0) {
      return 'Não foi possível identificar o e-mail alvo da conta. Confira o campo de e-mail do pedido de ajuda.';
    }
    if (value.indexOf('valid_account_email_required') >= 0) {
      return 'Informe o e-mail exato da conta cuja identidade foi verificada. O vínculo não aceita e-mail ausente ou inválido.';
    }
    if (value.indexOf('target_email_mismatch') >= 0) {
      return 'O e-mail enviado pela interface não confere com o pedido armazenado. Recarregue o ticket antes de continuar.';
    }
    if (value.indexOf('identity_email_synchronization_failed') >= 0) {
      return 'A identidade foi localizada pelo UUID, mas o e-mail operacional atual do Auth não pôde ser sincronizado com segurança. Nenhuma ação LGPD foi executada; atualize a fila e investigue antes de repetir.';
    }
    if (
      value.indexOf('identity_link_capability_missing') >= 0
      || value.indexOf('identity_link_workflow_missing') >= 0
    ) {
      return 'A vinculação auditada de identidade ainda não está disponível por completo. Não prossiga com ações LGPD até aplicar e validar as migrations necessárias.';
    }
    if (
      value.indexOf('identity_link_result_invalid') >= 0
      || value.indexOf('identity_link_failed') >= 0
    ) {
      return 'O servidor não comprovou o vínculo entre ticket, titular, protocolo e workflow. Recarregue a fila e revise o estado antes de tentar novamente.';
    }
    if (value.indexOf('erasure_identity_dsr_not_unique') >= 0) {
      return 'Este pedido autenticado legado ainda não consegue materializar o protocolo DSR no servidor (função de materialização desatualizada ou DSR inconsistente). Aplique a migration de Help legado autenticado e tente “Criar protocolo” novamente.';
    }
    if (
      value.indexOf('erasure_identity_account_not_unique') >= 0
      || value.indexOf('erasure_identity_workflow_not_unique') >= 0
      || value.indexOf('erasure_identity_subject_conflict') >= 0
      || value.indexOf('erasure_identity_link_conflict') >= 0
      || value.indexOf('erasure_identity_dsr_materialization_conflict') >= 0
    ) {
      return 'Há registros conflitantes ou não únicos para essa identidade. O vínculo foi bloqueado; investigue conta, protocolo e workflow sem repetir ações destrutivas.';
    }
    if (
      value.indexOf('erasure_identity_account_changed') >= 0
      || value.indexOf('erasure_identity_help_changed') >= 0
      || value.indexOf('erasure_identity_dsr_changed') >= 0
      || value.indexOf('erasure_identity_workflow_changed') >= 0
      || value.indexOf('erasure_identity_help_mismatch') >= 0
      || value.indexOf('erasure_identity_dsr_mismatch') >= 0
    ) {
      return 'O ticket, a conta ou o protocolo mudou durante a verificação. Atualize a fila e refaça a conferência de identidade.';
    }
    if (
      value.indexOf('erasure_identity_help_state_invalid') >= 0
      || value.indexOf('erasure_identity_dsr_state_invalid') >= 0
      || value.indexOf('erasure_identity_workflow_state_invalid') >= 0
      || value.indexOf('erasure_identity_subject_closed') >= 0
    ) {
      return 'O pedido está em um estado que não permite criar ou repetir esse vínculo. Revise o histórico e o protocolo antes de qualquer nova ação.';
    }
    if (
      value.indexOf('erasure_identity_profile_missing') >= 0
      || value.indexOf('erasure_identity_help_not_found') >= 0
    ) {
      return 'A conta ou o ticket verificado deixou de existir. Atualize a fila e confirme o titular antes de continuar.';
    }
    if (
      value.indexOf('identity_link_required') >= 0
      || value.indexOf('data_subject_request_link_invalid') >= 0
    ) {
      return 'O vínculo canônico entre ticket, titular e protocolo não foi confirmado. Nenhuma ação foi executada; atualize a fila ou use somente a recuperação pós-exclusão indicada pelo sistema.';
    }
    if (
      value.indexOf('identity_target_mismatch') >= 0
      || value.indexOf('workflow_target_mismatch') >= 0
      || value.indexOf('data_subject_request_link_mismatch') >= 0
    ) {
      return 'O titular autenticado, o ticket, o protocolo e a conta alvo não coincidem. O fluxo foi bloqueado para impedir alteração de dados de terceiros.';
    }
    if (
      value.indexOf('identity_attestation_required') >= 0
      || value.indexOf('identity_reference_required') >= 0
      || value.indexOf('identity_channel_invalid') >= 0
      || value.indexOf('identity_verified_at_required') >= 0
      || value.indexOf('identity_verified_at_in_future') >= 0
      || value.indexOf('erasure_identity_link_input_invalid') >= 0
    ) {
      return 'Este ticket legado/anônimo exige validação independente da identidade antes de qualquer ocultação de dados.';
    }
    if (value.indexOf('help_request_is_not_account_erasure') >= 0) {
      return 'Este ticket não é uma solicitação de exclusão. Pedidos de acesso ou portabilidade não podem abrir controles destrutivos.';
    }
    if (value.indexOf('erasure_help_request_required') >= 0) {
      return 'A exclusão exige um pedido de titular protocolado e classificado como exclusão de conta.';
    }
    if (value.indexOf('invalid_workflow_transition') >= 0 || value.indexOf('workflow_state_conflict') >= 0) {
      return 'Esta ação não é válida no estado atual ou o pedido foi alterado em outra sessão. Execute um novo diagnóstico.';
    }
    if (value.indexOf('workflow_action_in_progress') >= 0) {
      return 'Outra ação deste pedido já está em andamento. Aguarde e atualize o diagnóstico antes de repetir.';
    }
    if (value.indexOf('workflow_claim_capability_missing') >= 0 || value.indexOf('workflow_claim_lost') >= 0) {
      return 'O controle atomico de concorrencia nao esta disponivel ou o claim foi perdido. Nao repita a etapa irreversivel; aplique a migracao correta e execute novo diagnostico.';
    }
    if (
      value.indexOf('erasure_copy_request_not_linked') >= 0
      || value.indexOf('erasure_copy_not_proven_delivered') >= 0
    ) {
      return 'O titular pediu uma cópia antes da exclusão. Gere a cópia e aguarde o download comprovado; a exclusão irreversível permanece bloqueada.';
    }
    if (
      value.indexOf('erasure_copy_guidance_decision_required') >= 0
      || value.indexOf('copy_gate_decision') >= 0
    ) {
      return 'Registre a decisão orientada do titular sobre receber uma cópia antes de continuar.';
    }
    if (
      value.indexOf('erasure_copy_gate') >= 0
      || value.indexOf('erasure_copy_preference') >= 0
    ) {
      return 'A verificação obrigatória da cópia anterior à exclusão não foi concluída. Execute um novo diagnóstico e corrija a pendência.';
    }
    if (value.indexOf('data_export_artifact_active_build_in_progress') >= 0) {
      return 'Há uma exportação em geração com lease ativa. Aguarde o horário de nova tentativa indicado pelo backend e execute a exclusão novamente.';
    }
    if (value.indexOf('data_export_artifact') >= 0 || value.indexOf('export_artifact_purge') >= 0) {
      return 'Não foi possível comprovar a remoção de todos os arquivos privados de exportação. A exclusão parou antes de apagar o banco/Auth; execute novamente após revisar o Storage.';
    }
    if (value.indexOf('data_subject_request_cancelled') >= 0) {
      return 'O titular cancelou o protocolo. Nenhuma exclusao pode continuar; use apenas a restauracao/cancelamento reversivel pendente.';
    }
    if (value.indexOf('data_subject_request_completed') >= 0 || value.indexOf('data_subject_request_expired') >= 0) {
      return 'O protocolo vinculado esta em estado terminal. Revise o historico antes de qualquer nova operacao.';
    }
    if (value.indexOf('data_subject_transition_capability_missing') >= 0 || value.indexOf('data_subject_status_conflict') >= 0) {
      return 'Nao foi possivel sincronizar o protocolo do titular de forma atomica. O fluxo foi bloqueado para evitar divergencia de status.';
    }
    if (value.indexOf('confirmation_delivery_not_proven') >= 0) {
      return 'O envio do e-mail de confirmação ainda não foi comprovado. Registre o envio automático ou manual antes de continuar.';
    }
    if (value.indexOf('confirmation_attestation_required') >= 0 || value.indexOf('confirmation_reference_required') >= 0) {
      return 'Informe a referência da resposta do titular, a data e confirme a validação no e-mail da conta.';
    }
    if (value.indexOf('confirmation_predates_delivery') >= 0) {
      return 'A resposta registrada é anterior ao envio do pedido de confirmação. Revise as datas.';
    }
    if (value.indexOf('delivery_attestation_required') >= 0 || value.indexOf('delivery_reference_required') >= 0) {
      return 'Para registrar envio manual, informe referência, data e confirme que usou o e-mail titular.';
    }
    if (value.indexOf('erasure_preflight_blocked') >= 0 || value.indexOf('safe_erasure_schema_unavailable') >= 0) {
      return 'A exclusão foi bloqueada pelo diagnóstico para evitar dano colateral. Revise conta administrativa, FKs, chat compartilhado, inventário, capability v3 e chave da caixa de saída criptografada.';
    }
    if (value.indexOf('account_ban_failed') >= 0) {
      return 'Nao foi possivel bloquear novos logins antes da exclusao. Nenhuma limpeza irreversivel adicional deve continuar.';
    }
    if (value.indexOf('session_revocation_failed') >= 0) {
      return 'A conta foi restringida, mas a revogacao de sessoes nao foi comprovada. O estado permanece parcial e exige correcao antes de retomar.';
    }
    if (value.indexOf('database_quiescence_verification_failed') >= 0) {
      return 'A barreira contra novas escritas não pôde ser comprovada após revogar as sessões. Nenhuma limpeza adicional deve continuar.';
    }
    if (value.indexOf('storage_cleanup_failed') >= 0 || value.indexOf('storage_inventory_incomplete') >= 0 || value.indexOf('storage_verification_failed') >= 0) {
      return 'A limpeza de arquivos não foi comprovada. Nada deve ser marcado como concluído; corrija o Storage e tente novamente.';
    }
    if (value.indexOf('external_processor_follow_up_required') >= 0) {
      return 'O núcleo da conta foi tratado, mas operadores externos ainda precisam de revisão registrada antes do recibo final.';
    }
    if (value.indexOf('provider_outcomes_incomplete') >= 0 || value.indexOf('provider_attestation_required') >= 0) {
      return 'Conclua e ateste a revisão de cada operador externo listado antes de finalizar.';
    }
    if (value.indexOf('notification_provider_retention_required') >= 0) {
      return 'O provedor SMTP não pode ser marcado como excluído antes de enviar o comprovante final. Documente a retenção temporária, a base e a data futura de revisão.';
    }
    if (value.indexOf('provider_retention_') >= 0) {
      return 'Para cada retenção, registre uma base/justificativa e uma data futura de revisão.';
    }
    if (
      value.indexOf('completion_outbox_unavailable') >= 0
      || value.indexOf('completion_outbox_encryption_unavailable') >= 0
      || value.indexOf('completion_outbox_key_') >= 0
    ) {
      return 'A caixa de saída criptografada do comprovante final não está pronta. Corrija a chave externa e a migração antes de qualquer exclusão irreversível.';
    }
    if (value.indexOf('completion_outbox_expired_manual_delivery_required') >= 0) {
      return 'O destinatário cifrado expirou e foi removido. Não tente reconstruí-lo: entregue o comprovante por um canal já verificado e registre a evidência manual completa.';
    }
    if (value.indexOf('completion_outbox_delivery_in_progress') >= 0) {
      return 'Já existe uma tentativa de entrega do comprovante em andamento. Aguarde a conclusão e atualize o ticket antes de tentar novamente.';
    }
    if (value.indexOf('completion_outbox_delivery_ambiguous') >= 0) {
      return 'O SMTP respondeu, mas o aceite não foi consolidado no banco. Verifique mailbox/log do provedor antes de reenviar; se houve entrega, registre a evidência manual.';
    }
    if (value.indexOf('completion_notification_pending') >= 0) {
      return 'A exclusão e o recibo foram finalizados, mas o SMTP não confirmou a entrega. Tente novamente; se entregar por um canal verificado, preencha a evidência manual completa.';
    }
    if (value.indexOf('completion_email_failed') >= 0) {
      return 'A conclusão não foi enviada. O fluxo permanece parcial e pode ser retomado sem repetir a exclusão do núcleo.';
    }
    if (value.indexOf('confirmation_phrase_mismatch') >= 0) {
      return 'A frase de confirmação irreversível não confere com o e-mail alvo.';
    }
    if (value.indexOf('auth_user_not_found') >= 0) {
      return 'O usuário não foi localizado no Auth. Revise o diagnóstico antes de concluir.';
    }
    if (raw) return raw;
    return 'Não foi possível processar o fluxo LGPD. Recarregue a página e confirme que você está logado como administrador.';
  }

  async function checkAdminAccess(expectedContext = {}) {
    const generation = Number.isInteger(expectedContext.generation)
      ? expectedContext.generation
      : state.authGeneration;
    const expectedUserId = String(expectedContext.userId || '').trim();
    const hasSessionUser = Object.prototype.hasOwnProperty.call(expectedContext, 'sessionUser');
    const isCurrentGeneration = () => generation === state.authGeneration;
    const rejectAccess = (message) => {
      if (isCurrentGeneration()) denyAdminAccess(message, generation);
      return null;
    };
    const driver = window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver;
    if (driver === 'local') {
      const localUserId = 'local-admin';
      if (expectedUserId && expectedUserId !== localUserId) {
        return rejectAccess('A sessão administrativa foi trocada. Recarregue o painel.');
      }
      return isCurrentGeneration() ? { generation, userId: localUserId } : null;
    }
    if (driver !== 'supabase') {
      return rejectAccess('O painel de ajuda requer driver=supabase.');
    }

    const user = hasSessionUser
      ? expectedContext.sessionUser
      : await window.KCAPI.getCurrentUser();
    if (!isCurrentGeneration()) return null;
    if (!user) {
      return rejectAccess('Você precisa estar autenticado para acessar este painel.');
    }
    const userId = String(user.id || '').trim();
    if (!userId || (expectedUserId && expectedUserId !== userId)) {
      return rejectAccess('A sessão administrativa foi trocada. Entre novamente com uma conta administradora.');
    }

    const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
    if (!client) {
      return rejectAccess('Supabase client não disponível.');
    }

    const profileResult = await client
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (!isCurrentGeneration()) return null;
    if (profileResult && profileResult.error) {
      return rejectAccess('Não foi possível validar seu acesso administrativo.');
    }

    if (!profileResult.data || profileResult.data.is_admin !== true) {
      return rejectAccess('Acesso negado. Apenas administradores podem acessar este painel.');
    }

    return { generation, userId };
  }

  function populateTypeFilter() {
    const select = $('#helpTypeFilter');
    if (!select) return;

    const currentValue = String(select.value || state.filters.type || 'all').trim();
    const items = ['<option value="all">Todas as categorias</option>'];
    getHelpTypeOptions().forEach((option) => {
      if (!option || !option.value) return;
      items.push(`<option value="${esc(option.value)}">${esc(option.label || option.value)}</option>`);
    });
    select.innerHTML = items.join('');
    select.value = currentValue || 'all';
  }

  function readFilters() {
    state.filters.status = String($('#helpStatusFilter')?.value || 'all').trim();
    state.filters.type = String($('#helpTypeFilter')?.value || 'all').trim();
    state.filters.priority = String($('#helpPriorityFilter')?.value || 'all').trim();
    state.filters.query = String($('#helpQueryFilter')?.value || '').trim();
  }

  function applyQueueFilters(nextFilters, options = {}) {
    const filters = nextFilters && typeof nextFilters === 'object' ? nextFilters : {};
    const statusEl = $('#helpStatusFilter');
    const typeEl = $('#helpTypeFilter');
    const priorityEl = $('#helpPriorityFilter');
    const queryEl = $('#helpQueryFilter');
    if (Object.prototype.hasOwnProperty.call(filters, 'status') && statusEl) {
      statusEl.value = String(filters.status || 'all');
    }
    if (Object.prototype.hasOwnProperty.call(filters, 'type') && typeEl) {
      typeEl.value = String(filters.type || 'all');
    }
    if (Object.prototype.hasOwnProperty.call(filters, 'priority') && priorityEl) {
      priorityEl.value = String(filters.priority || 'all');
    }
    if (Object.prototype.hasOwnProperty.call(filters, 'query') && queryEl) {
      queryEl.value = String(filters.query || '');
    }
    adminFiltersDirty = true;
    readFilters();
    try { flushAdminDraftSave(); } catch (_) { /* ignore */ }
    if (options.reload === false) return;
    loadRows({
      limit: Math.max(state.pagination.limit || HELP_PAGE_SIZE, HELP_PAGE_SIZE),
    });
  }

  function clearQueueFilters() {
    applyQueueFilters({
      status: 'all',
      type: 'all',
      priority: 'all',
      query: '',
    });
  }

  function updateClearFiltersButton() {
    const button = $('#helpClearFiltersButton');
    if (!button) return;
    const snap = readCurrentFilterSnapshot();
    const active = !isDefaultFilterSnapshot(snap);
    button.hidden = !active;
    button.disabled = !active;
  }

  function triageSavedHintFor(id) {
    const key = String(id || '').trim();
    if (!key) return '';
    const savedAt = Number(state.triageJustSaved[key] || 0);
    if (!savedAt) return '';
    if ((Date.now() - savedAt) > TRIAGE_SAVED_HINT_MS) {
      delete state.triageJustSaved[key];
      return '';
    }
    return 'Triagem salva.';
  }

  function formatDateTime(value) {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '-';
    }
  }

  function getQueueAge(row) {
    const createdAt = new Date(String(row && row.created_at || '')).getTime();
    const status = String(row && row.status || '').trim();
    if (!Number.isFinite(createdAt) || ['resolved', 'archived'].includes(status)) return null;
    const hours = Math.max(0, Math.floor((Date.now() - createdAt) / 3600000));
    let label = 'Aguardando há menos de 1 h';
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      label = `Aguardando há ${days} dia${days === 1 ? '' : 's'}`;
    } else if (hours >= 1) {
      label = `Aguardando há ${hours} h`;
    }
    return {
      hours,
      label,
      level: hours >= 168 ? 'critical' : (hours >= 24 ? 'warn' : 'normal'),
    };
  }

  function isExternalAccessRequest(row) {
    const metadata = row && row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : {};
    return String(row && row.type || '').trim() === 'external_access'
      || String(metadata.request_kind || '').trim() === 'external_access';
  }

  function getExternalAccessState(row) {
    if (!isExternalAccessRequest(row)) return null;
    const metadata = row && row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : {};
    const adminStatus = String(row && row.admin_status || 'pending').trim().toLowerCase();
    const delivery = adminStatus === 'approved'
      ? (metadata.invite_email || {})
      : (adminStatus === 'rejected' ? (metadata.rejection_email || {}) : {});
    const deliveryStatus = String(delivery && delivery.status || '').trim().toLowerCase();
    const statusLabels = {
      pending: 'Aguardando decisão',
      approved: 'Aprovado',
      rejected: 'Recusado',
      na: 'Não se aplica',
    };
    const deliveryLabels = {
      sent: 'E-mail entregue',
      processing: 'Entrega em processamento',
      link_generated: 'Link manual gerado',
      failed: 'Falha de entrega',
      pending_provider_setup: 'SMTP pendente',
    };
    return {
      adminStatus,
      adminLabel: statusLabels[adminStatus] || adminStatus || 'Estado desconhecido',
      deliveryStatus,
      deliveryLabel: deliveryLabels[deliveryStatus] || (deliveryStatus ? deliveryStatus : 'Entrega ainda não registrada'),
      decidedAt: String(row && row.admin_decided_at || '').trim(),
      note: String(row && row.admin_note || '').trim(),
      needsAttention: adminStatus === 'pending'
        || ['processing', 'link_generated', 'failed', 'pending_provider_setup'].includes(deliveryStatus)
        || (['approved', 'rejected'].includes(adminStatus) && !deliveryStatus),
    };
  }

  function buildExternalAccessPanel(row) {
    const external = getExternalAccessState(row);
    if (!external) return '';
    const stateClass = external.needsAttention ? ' is-attention' : ' is-complete';
    const decisionTime = external.decidedAt
      ? `<span><i class="fas fa-clock" aria-hidden="true"></i> ${esc(formatDateTime(external.decidedAt))}</span>`
      : '';
    const note = external.note
      ? `<p><strong>Nota administrativa:</strong> ${esc(external.note)}</p>`
      : '';
    return [
      `<section class="kc-admin-help-workflow${stateClass}" aria-label="Fluxo de acesso externo">`,
      '  <div class="kc-admin-help-workflow__head">',
      '    <strong><i class="fas fa-user-shield" aria-hidden="true"></i> Fluxo de acesso externo</strong>',
      `    <span>${esc(external.adminLabel)}</span>`,
      '  </div>',
      '  <div class="kc-admin-help-workflow__facts">',
      `    <span><i class="fas fa-envelope" aria-hidden="true"></i> ${esc(external.deliveryLabel)}</span>`,
      decisionTime,
      '  </div>',
      note,
      '</section>',
    ].join('');
  }

  function buildOperationalActions(row) {
    const externalAction = isExternalAccessRequest(row)
      ? '<button type="button" data-help-open-external><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i> Abrir decisões de acesso</button>'
      : '';
    return [
      '<div class="kc-admin-help-operations" aria-label="Ações operacionais">',
      externalAction,
      '<button type="button" data-help-open-cadu title="Prepara somente contexto operacional, sem e-mail, mensagem ou identificadores"><i class="fas fa-robot" aria-hidden="true"></i> Preparar análise no Cadu</button>',
      '</div>',
    ].join('');
  }

  function writeShortLivedHandoff(key, value) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify({
        ...value,
        createdAt: Date.now(),
        expiresAt: Date.now() + ADMIN_HANDOFF_TTL_MS,
      }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function openExternalAccessWorkflow(row) {
    const id = String(row && row.id || '').trim();
    if (UUID_RE.test(id)) writeShortLivedHandoff(EXTERNAL_ACCESS_FOCUS_KEY, { requestId: id });
    window.location.assign('moderation.html?section=external-access');
  }

  function prepareCaduHelpAnalysis(row) {
    const typeLabel = buildLabel(Help.HELP_TYPE_LABELS, row && row.type, row && row.type);
    const topicLabel = buildLabel(Help.HELP_TOPIC_LABELS, row && row.topic, row && row.topic);
    const statusLabel = buildLabel(Help.HELP_STATUS_LABELS, row && row.status, row && row.status);
    const priorityLabel = buildLabel(Help.HELP_PRIORITY_LABELS, row && row.priority, row && row.priority);
    const age = getQueueAge(row);
    const external = getExternalAccessState(row);
    const prompt = [
      'Analise operacionalmente um pedido da fila administrativa do KinoCampus, sem dados pessoais.',
      `Categoria: ${typeLabel || 'não informada'}.`,
      `Tema: ${topicLabel || 'não informado'}.`,
      `Status da triagem: ${statusLabel || 'não informado'}.`,
      `Urgência: ${priorityLabel || 'não informada'}.`,
      age ? `Tempo na fila: ${age.label.replace(/^Aguardando /, '')}.` : 'O pedido já está em estado terminal.',
      external ? `Fluxo de acesso externo: ${external.adminLabel}; ${external.deliveryLabel}.` : '',
      'Indique verificações, riscos e o próximo passo para o administrador. Não execute ações e não solicite dados pessoais.',
    ].filter(Boolean).join(' ');
    writeShortLivedHandoff(CADU_HANDOFF_KEY, {
      source: 'help-requests',
      prompt: prompt.slice(0, 1200),
    });
    window.location.assign('cadu.html?tab=openclaw&source=help-requests');
  }

  function renderSummary(rows) {
    const target = $('#helpSummary');
    if (!target) return;
    if (!state.isAuthorized) {
      target.replaceChildren();
      return;
    }

    const list = Array.isArray(rows) ? rows : [];
    const totalCount = Math.max(list.length, toFiniteNumber(state.pagination.totalCount, list.length));
    const currentStatus = String(state.filters.status || 'all');
    const currentPriority = String(state.filters.priority || 'all');
    const serverSummary = state.pagination.summary && typeof state.pagination.summary === 'object'
      ? state.pagination.summary
      : null;
    const metrics = [
      {
        label: 'Total filtrado',
        value: totalCount,
        action: 'clear',
        title: 'Limpar filtros e ver a fila completa',
        active: !isDefaultFilterSnapshot(readCurrentFilterSnapshot()),
      },
      {
        label: 'Exibindo',
        value: list.length,
        action: '',
        title: 'Pedidos carregados nesta página',
        active: false,
      },
      {
        label: serverSummary ? 'Urgentes' : 'Urgentes na tela',
        value: serverSummary
          ? toFiniteNumber(serverSummary.urgentCount, 0)
          : list.filter((row) => row && row.priority === 'urgent').length,
        action: 'priority:urgent',
        title: 'Filtrar fila por urgência Urgente',
        active: currentPriority === 'urgent',
      },
      {
        label: 'Em andamento',
        value: serverSummary
          ? toFiniteNumber(serverSummary.inProgressCount, 0)
          : list.filter((row) => row && row.status === 'in_progress').length,
        action: 'status:in_progress',
        title: 'Filtrar fila por status Em andamento',
        active: currentStatus === 'in_progress',
      },
      {
        label: 'Aguardando +24 h',
        value: serverSummary
          ? toFiniteNumber(serverSummary.waitingOver24hCount, 0)
          : list.filter((row) => {
            const age = getQueueAge(row);
            return age && age.hours >= 24;
          }).length,
        action: '',
        title: 'Pedidos não concluídos criados há mais de 24 horas',
        active: false,
      },
      {
        label: 'Acesso pendente',
        value: serverSummary
          ? toFiniteNumber(serverSummary.externalPendingCount, 0)
          : list.filter((row) => {
            const external = getExternalAccessState(row);
            return external && external.adminStatus === 'pending';
          }).length,
        action: 'external-access',
        title: 'Abrir a fila de decisões de acesso externo',
        active: false,
      },
    ];

    target.innerHTML = metrics.map((item) => {
      const interactive = Boolean(item.action);
      const activeClass = item.active ? ' is-active' : '';
      if (!interactive) {
        return `<div class="kc-admin-help-metric"><strong>${esc(item.label)}</strong><span>${esc(item.value)}</span></div>`;
      }
      return [
        `<button type="button" class="kc-admin-help-metric kc-admin-help-metric--action${activeClass}"`,
        ` data-help-filter-shortcut="${esc(item.action)}"`,
        ` title="${esc(item.title)}">`,
        `<strong>${esc(item.label)}</strong><span>${esc(item.value)}</span>`,
        `</button>`,
      ].join('');
    }).join('');
    updateClearFiltersButton();
  }

  function renderEmpty() {
    const list = $('#helpRequestsList');
    if (!list) return;
    list.innerHTML = '<div class="kc-admin-help-empty">Nenhum pedido de ajuda encontrado para os filtros atuais.</div>';
  }

  function renderUnavailable() {
    const list = $('#helpRequestsList');
    if (!list) return;
    list.innerHTML = '<div class="kc-admin-help-empty" role="status">A fila não pôde ser consultada agora. Os totais exibidos não representam o estado atual; tente novamente.</div>';
  }

  function buildLabel(map, value, fallback) {
    const key = String(value || '').trim();
    return (map && map[key]) || fallback || key || '-';
  }

  function buildSubtopicLabel(row) {
    const raw = String(row && row.subtopic || '').trim();
    if (!raw) return 'Sem subtipo';
    if (Help && typeof Help.getHelpSubtopicOptions === 'function') {
      const options = Help.getHelpSubtopicOptions(row.type, row.topic);
      const match = Array.isArray(options)
        ? options.find((item) => item && String(item.value || '').trim() === raw)
        : null;
      if (match && match.label) return String(match.label);
    }
    return raw;
  }

  function buildMetadataChips(row) {
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const chips = [];

    const moduleValue = String(metadata.affected_module || '').trim();
    if (moduleValue) {
      chips.push(`<span class="kc-admin-help-chip"><i class="fas fa-layer-group" aria-hidden="true"></i>${esc(buildLabel(Help.HELP_MODULE_LABELS, moduleValue, moduleValue))}</span>`);
    }

    const impactValue = String(metadata.impact_scope || '').trim();
    if (impactValue) {
      const impactLabels = {
        only_me: 'So comigo',
        some_people: 'Com outras pessoas',
        entire_platform: 'Plataforma toda',
      };
      chips.push(`<span class="kc-admin-help-chip"><i class="fas fa-signal" aria-hidden="true"></i>${esc(impactLabels[impactValue] || impactValue)}</span>`);
    }

    const pagePath = String((row && row.page_path) || metadata.page_path || '').trim();
    if (pagePath) {
      chips.push(`<span class="kc-admin-help-chip"><i class="fas fa-file-code" aria-hidden="true"></i>${esc(pagePath)}</span>`);
    }

    return chips.join('');
  }

  function buildMetadataSummary(row) {
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const lines = [];

    if (metadata.reproduce_steps) lines.push(`<div><strong>Como reproduzir</strong><span>${esc(metadata.reproduce_steps)}</span></div>`);
    if (metadata.error_message) lines.push(`<div><strong>Mensagem de erro</strong><span>${esc(metadata.error_message)}</span></div>`);
    if (metadata.expected_result) lines.push(`<div><strong>Resultado esperado</strong><span>${esc(metadata.expected_result)}</span></div>`);
    if (metadata.content_link) lines.push(`<div><strong>Link relacionado</strong><span>${esc(metadata.content_link)}</span></div>`);
    if (metadata.account_email) lines.push(`<div><strong>E-mail da conta</strong><span>${esc(metadata.account_email)}</span></div>`);
    if (metadata.requester_name) lines.push(`<div><strong>Nome do solicitante</strong><span>${esc(metadata.requester_name)}</span></div>`);
    if (metadata.affiliation_context) lines.push(`<div><strong>Vínculo ou contexto</strong><span>${esc(metadata.affiliation_context)}</span></div>`);
    if (metadata.institutional_domain_hint) lines.push(`<div><strong>Domínios institucionais</strong><span>${esc(metadata.institutional_domain_hint)}</span></div>`);
    if (metadata.device_context) lines.push(`<div><strong>Dispositivo ou navegador</strong><span>${esc(metadata.device_context)}</span></div>`);
    if (metadata.email_notification && typeof metadata.email_notification === 'object') {
      const status = String(metadata.email_notification.status || '').trim();
      const sentAt = String(metadata.email_notification.sent_at || metadata.email_notification.failed_at || '').trim();
      const detail = [status, sentAt].filter(Boolean).join(' · ');
      if (detail) lines.push(`<div><strong>E-mail automático</strong><span>${esc(detail)}</span></div>`);
    }

    if (!lines.length) return '';
    return `<div class="kc-admin-help-meta">${lines.join('')}</div>`;
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function getLgpdTargetEmail(row) {
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    // contact_email is the canonical Help field checked by the server-side binder.
    // Anonymous metadata remains untrusted until the verified link normalizes it.
    const explicit = String(row.contact_email || metadata.account_email || metadata.email || '').trim().toLowerCase();
    if (explicit) return explicit;
    const haystack = [row && row.subject, row && row.message, row && row.topic].join(' ');
    const match = haystack.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return String(match && match[0] || '').trim().toLowerCase();
  }

  function isLgpdErasureRequest(row) {
    if (!row || typeof row !== 'object') return false;
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const requestKind = String(metadata.request_kind || '').trim().toLowerCase();
    const type = String(row.type || '').trim().toLowerCase();
    const topic = String(row.topic || '').trim().toLowerCase();
    const subtopic = String(row.subtopic || '').trim().toLowerCase();
    const canonicalTuple = type === 'account_access'
      && topic === 'onboarding_settings'
      && subtopic === 'account_deletion';
    // Never open destructive panel for copy/portability kinds.
    if (requestKind === 'data_access_copy' || requestKind === 'data_portability') return false;
    // Canonical privacy tuple wins even without request_kind (pre-DSR form).
    if (canonicalTuple && (!requestKind || requestKind === 'account_erasure')) return true;
    // Non-empty other request_kind never becomes erasure via free text.
    if (requestKind && requestKind !== 'account_erasure') return false;
    if (requestKind === 'account_erasure' && type === 'account_access') return true;

    // Fallback for free-text / very old tickets without structured subtopic.
    // A bare "LGPD" mention never opens destructive controls.
    const text = normalizeSearchText([
      row.type,
      row.topic,
      row.subtopic,
      row.subject,
      row.message,
      row.contact_email,
      metadata.account_email,
    ].join(' '));
    const isAccountFamily = type === 'account_access'
      || type === 'conta_e_acesso'
      || /\b(conta|acesso|account)\b/.test(normalizeSearchText(type));
    const hasErasureVerb = /\b(exclusao|excluir|eliminacao|eliminar|remocao|remover|apagar|deletar|encerrar|delete|erasure)\b/.test(text);
    const hasAccountTarget = /\b(minha conta|sua conta|conta do usuario|conta e dados|exclusao de conta|excluir conta|apagar conta|remover conta|perfil|dados pessoais|dados cadastrais|conta e dados)\b/.test(text)
      || (/\bconta\b/.test(text) && hasErasureVerb);
    return isAccountFamily && hasErasureVerb && hasAccountTarget;
  }

  /**
   * Tickets that need protocol materialization before diagnose/hide/erase:
   * - anonymous (no user_id), or
   * - authenticated legacy (user_id set, no DSR / identity_source yet).
   */
  function needsErasureProtocolLink(row) {
    if (!isLgpdErasureRequest(row)) return false;
    if (isRedactedPostCoreErasure(row)) return false;
    const metadata = getHelpMetadata(row);
    if (UUID_RE.test(String(metadata.data_subject_request_id || '').trim())) {
      return false;
    }
    if (hasCanonicalErasureLink(row)) return false;
    return true;
  }

  function getHelpMetadata(row) {
    return row && row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : {};
  }

  function hasCanonicalErasureLink(row) {
    if (!isLgpdErasureRequest(row)) return false;
    const metadata = getHelpMetadata(row);
    return Boolean(
      UUID_RE.test(String(row && row.user_id || '').trim())
      && UUID_RE.test(String(metadata.data_subject_request_id || '').trim())
      && VERIFIED_ERASURE_IDENTITY_SOURCES.has(
        String(metadata.identity_source || '').trim().toLowerCase()
      )
    );
  }

  function isRedactedPostCoreErasure(row) {
    if (!isLgpdErasureRequest(row)) return false;
    const metadata = getHelpMetadata(row);
    const marker = metadata.lgpd_erasure && typeof metadata.lgpd_erasure === 'object'
      ? metadata.lgpd_erasure
      : {};
    const subjectHash = String(
      marker.subject_hash || marker.email_hash || ''
    ).trim().toLowerCase();
    return Boolean(
      !String(row && row.user_id || '').trim()
      && String(row && row.status || '').trim() === 'resolved'
      && marker.contact_redacted === true
      && marker.content_redacted === true
      && UUID_RE.test(String(marker.request_id || '').trim())
      && SHA256_RE.test(subjectHash)
      && Number.isFinite(Date.parse(String(marker.erased_at || '')))
    );
  }

  function getPostCoreErasureMarker(row) {
    const metadata = getHelpMetadata(row);
    const marker = metadata.lgpd_erasure && typeof metadata.lgpd_erasure === 'object'
      ? metadata.lgpd_erasure
      : {};
    if (!isRedactedPostCoreErasure(row)) return null;
    return {
      request_id: String(marker.request_id || '').trim(),
      subject_hash: String(marker.subject_hash || marker.email_hash || '').trim().toLowerCase(),
      erased_at: String(marker.erased_at || '').trim(),
      protocol: String(metadata.protocol || marker.protocol || '').trim(),
    };
  }

  function isPostCoreProbeCandidate(row) {
    if (!isLgpdErasureRequest(row) || String(row && row.user_id || '').trim()) return false;
    const metadata = getHelpMetadata(row);
    return Boolean(
      UUID_RE.test(String(metadata.data_subject_request_id || '').trim())
      && VERIFIED_ERASURE_IDENTITY_SOURCES.has(
        String(metadata.identity_source || '').trim().toLowerCase()
      )
    );
  }

  function hasConfirmedPostCoreWorkflow(result) {
    const request = result && result.request && typeof result.request === 'object'
      ? result.request
      : {};
    const metadata = request.metadata && typeof request.metadata === 'object'
      ? request.metadata
      : {};
    const receipt = request.receipt && typeof request.receipt === 'object'
      ? request.receipt
      : (result && result.receipt && typeof result.receipt === 'object' ? result.receipt : {});
    return Boolean(
      request.status === 'erased'
      || metadata.auth_deleted === true
      || receipt.result === 'erased'
      || receipt.auth_deleted === true
    );
  }

  function hasRecoverablePostCoreWorkflow(result) {
    const request = result && result.request && typeof result.request === 'object'
      ? result.request
      : {};
    const metadata = request.metadata && typeof request.metadata === 'object'
      ? request.metadata
      : {};
    const status = String(request.status || '').trim();
    const failureStage = String(metadata.failure_stage || '').trim();
    const completionStatus = String(metadata.completion_email_status || '').trim();
    return Boolean(
      metadata.auth_deleted === true
      && (
        (
          ['failed', 'partial_failure'].includes(status)
          && LGPD_RETRY_FINALIZE_FAILURE_STAGES.has(failureStage)
        )
        || (
          status === 'erased'
          && metadata.notification_pending === true
          && !['sent', 'sent_manual'].includes(completionStatus)
        )
      )
    );
  }

  function isAuthoritativeRecoverableRetryFailure(result, diagnosedResult) {
    if (!result || result.ok !== false || !diagnosedResult) return false;
    const error = result.error && typeof result.error === 'object'
      ? result.error
      : {};
    const envelope = error.body && typeof error.body === 'object'
      ? error.body
      : result;
    const projectedRequest = envelope.request && typeof envelope.request === 'object'
      ? envelope.request
      : (result.request && typeof result.request === 'object' ? result.request : null);
    if (
      envelope.retryable !== true
      || String(envelope.next_action || '').trim() !== 'retry_finalize'
      || !projectedRequest
      || !hasRecoverablePostCoreWorkflow({ request: projectedRequest })
      || !hasRecoverablePostCoreWorkflow(diagnosedResult)
    ) return false;

    const diagnosedRequest = diagnosedResult.request && typeof diagnosedResult.request === 'object'
      ? diagnosedResult.request
      : {};
    const projectedMetadata = projectedRequest.metadata && typeof projectedRequest.metadata === 'object'
      ? projectedRequest.metadata
      : {};
    const diagnosedMetadata = diagnosedRequest.metadata && typeof diagnosedRequest.metadata === 'object'
      ? diagnosedRequest.metadata
      : {};
    const optionalFields = [
      'notification_pending',
      'completion_email_status',
    ];
    return Boolean(
      String(projectedRequest.status || '').trim() === String(diagnosedRequest.status || '').trim()
      && projectedMetadata.auth_deleted === true
      && diagnosedMetadata.auth_deleted === true
      && String(projectedMetadata.failure_stage || '').trim()
        === String(diagnosedMetadata.failure_stage || '').trim()
      && optionalFields.every((field) => (
        !Object.prototype.hasOwnProperty.call(projectedMetadata, field)
        || projectedMetadata[field] === diagnosedMetadata[field]
      ))
    );
  }

  function canOfferErasureIdentityLink(row) {
    return needsErasureProtocolLink(row);
  }

  function canProbeErasureWorkflow(row) {
    return hasCanonicalErasureLink(row)
      || isRedactedPostCoreErasure(row)
      || isPostCoreProbeCandidate(row);
  }

  function canRunErasureAction(row, action) {
    if (!LGPD_ACTIONS.has(action) || !isLgpdErasureRequest(row)) return false;
    const id = String(row && row.id || '').trim();
    // Protocol creation is the only recovery path for unlinked tickets. A prior
    // indeterminate outcome must not permanently block "Criar protocolo" when the
    // ticket still needs a DSR — the RPC is fail-closed/idempotent.
    if (action === 'link_verified_identity') {
      return canOfferErasureIdentityLink(row);
    }
    if (
      state.erasureUncertain[id]
      && LGPD_MUTATING_ACTIONS.has(action)
    ) return false;
    if (hasCanonicalErasureLink(row)) return true;
    if (!LGPD_POST_CORE_ACTIONS.has(action)) return false;
    if (action === 'diagnose' || action === 'generate_receipt') {
      return canProbeErasureWorkflow(row);
    }
    const result = state.erasureResults[String(row && row.id || '')] || null;
    return hasRecoverablePostCoreWorkflow(result);
  }

  function getDataExportRequestKind(row) {
    if (!row || typeof row !== 'object') return '';
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const requestKind = String(metadata.request_kind || '').trim().toLowerCase();
    const type = String(row.type || '').trim().toLowerCase();
    const topic = String(row.topic || '').trim().toLowerCase();
    const subtopic = String(row.subtopic || '').trim().toLowerCase();
    const canonicalKind = type === 'account_access' && topic === 'onboarding_settings'
      ? (
          subtopic === 'account_data_copy'
            ? 'data_access_copy'
            : subtopic === 'account_data_portability'
              ? 'data_portability'
              : ''
        )
      : '';
    if (requestKind && requestKind !== canonicalKind) return '';
    return requestKind || canonicalKind;
  }

  function isDataExportSupplementRequest(row) {
    return Boolean(getDataExportRequestKind(row));
  }

  /**
   * Open DSR for copy/portability must keep the help ticket open
   * (DB trigger DSR_HELP_MUST_REMAIN_OPEN). Prefer local signals; when unsure
   * and a DSR id is linked, treat as open (fail closed on close).
   */
  function getLinkedDataExportDsrStatus(row) {
    if (!isDataExportSupplementRequest(row)) return '';
    const id = String(row && row.id || '').trim();
    const metadata = getHelpMetadata(row);
    const fromMeta = String(
      metadata.data_subject_request_status
      || metadata.dsr_status
      || ''
    ).trim().toLowerCase();
    if (fromMeta) return fromMeta;
    const result = state.exportSupplementResults[id] || {};
    const request = result.request && typeof result.request === 'object'
      ? result.request
      : (result.data_subject_request && typeof result.data_subject_request === 'object'
        ? result.data_subject_request
        : null);
    return String(request && request.status || '').trim().toLowerCase();
  }

  function isOpenDataExportHelpRequest(row) {
    if (!isDataExportSupplementRequest(row)) return false;
    const metadata = getHelpMetadata(row);
    const dsrId = String(metadata.data_subject_request_id || '').trim();
    if (!UUID_RE.test(dsrId)) return false;
    const status = getLinkedDataExportDsrStatus(row);
    if (status && ['completed', 'cancelled', 'expired'].includes(status)) {
      return false;
    }
    // Linked DSR without a proven terminal status stays open for close guards.
    return true;
  }

  function getHelpTicketIdentity(row) {
    const id = String(row && row.id || '').trim();
    const metadata = getHelpMetadata(row);
    const dsrId = String(metadata.data_subject_request_id || '').trim();
    const protocol = String(metadata.protocol || metadata.dsr_protocol || '').trim();
    const artifactRef = String(metadata.export_artifact_ref || '').trim().toUpperCase();
    const shortId = id && UUID_RE.test(id)
      ? id.slice(0, 8)
      : (id ? id.slice(0, 12) : '');
    return {
      id: id,
      shortId: shortId,
      dsrId: UUID_RE.test(dsrId) ? dsrId : '',
      protocol: protocol,
      artifactRef: EXPORT_ARTIFACT_REF_RE.test(artifactRef) ? artifactRef : '',
      userId: UUID_RE.test(String(row && row.user_id || '').trim())
        ? String(row.user_id).trim()
        : '',
    };
  }

  function friendlyTriageErrorMessage(error) {
    const raw = String(
      error && typeof error === 'object'
        ? (error.message || error.error || error.details || error.detail || error.code || '')
        : (error || '')
    ).trim();
    const upper = raw.toUpperCase();
    if (upper.indexOf('ERASURE_HELP_MUST_REMAIN_OPEN') >= 0) {
      return 'Este ticket pertence a um fluxo de exclusão de conta ainda aberto. '
        + 'Não é possível marcar Resolvido ou Arquivado até o cancelamento formal ou até o servidor comprovar a entrega do recibo final. '
        + 'Use o painel “Solicitação LGPD” para carregar o estado seguro e concluir a etapa indicada.';
    }
    if (
      upper.indexOf('DSR_HELP_MUST_REMAIN_OPEN') >= 0
      || raw.indexOf('DSR_HELP_MUST_REMAIN_OPEN') >= 0
    ) {
      return 'Este ticket está vinculado a um protocolo aberto de cópia/portabilidade (LGPD). '
        + 'Não é possível marcar Resolvido ou Arquivado até o DSR ser concluído, cancelado ou expirar. '
        + 'Use o painel “Complemento integral da cópia” para diagnosticar, entregar ou cancelar o protocolo; depois arquive o ticket.';
    }
    if (upper.indexOf('HELP_REQUEST_STALE') >= 0) {
      return 'Este ticket foi alterado em outra sessão administrativa. A fila será atualizada para evitar sobrescrever a triagem mais recente.';
    }
    if (upper.indexOf('HELP_REQUEST_NOT_FOUND') >= 0) {
      return 'Este ticket não está mais disponível. Atualize a fila antes de continuar.';
    }
    if (/^[A-Z][A-Z0-9_]{2,80}$/.test(raw)) {
      return 'Não foi possível salvar a triagem (' + raw + ').';
    }
    return raw || 'Não foi possível salvar a triagem.';
  }

  function hasCanonicalDataExportLink(row) {
    if (!isDataExportSupplementRequest(row)) return false;
    const metadata = row && row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : {};
    return Boolean(
      UUID_RE.test(String(row && row.user_id || '').trim())
      && UUID_RE.test(String(metadata.data_subject_request_id || '').trim())
      && EXPORT_ARTIFACT_REF_RE.test(
        String(metadata.export_artifact_ref || '').trim().toUpperCase()
      )
      && VERIFIED_DATA_EXPORT_IDENTITY_SOURCES.has(
        String(metadata.identity_source || '').trim().toLowerCase()
      )
    );
  }

  function isDataExportCleanupCandidate(row) {
    if (!isDataExportSupplementRequest(row) || String(row && row.user_id || '').trim()) {
      return false;
    }
    const metadata = getHelpMetadata(row);
    return Boolean(
      UUID_RE.test(String(metadata.data_subject_request_id || '').trim())
      && VERIFIED_DATA_EXPORT_IDENTITY_SOURCES.has(
        String(metadata.identity_source || '').trim().toLowerCase()
      )
      && EXPORT_ARTIFACT_REF_RE.test(
        String(metadata.export_artifact_ref || '').trim().toUpperCase()
      )
      && String(metadata.export_artifact_status || '').trim()
    );
  }

  function canOfferDataExportIdentityLink(row) {
    if (!isDataExportSupplementRequest(row)) return false;
    const metadata = getHelpMetadata(row);
    return Boolean(
      !String(row && row.user_id || '').trim()
      && !String(metadata.data_subject_request_id || '').trim()
      && !String(metadata.export_artifact_ref || '').trim()
    );
  }

  function isDataExportPurgeEligible(status, expiresAt) {
    const normalized = String(status || '').trim().toLowerCase();
    const expiry = Date.parse(String(expiresAt || ''));
    const expired = Number.isFinite(expiry) && expiry <= Date.now();
    return ['failed', 'expired', 'delivered'].includes(normalized)
      || (['ready', 'download_reserved'].includes(normalized) && expired);
  }

  function canRunDataExportAction(row, action) {
    if (!isDataExportSupplementRequest(row)) return false;
    const id = String(row && row.id || '').trim();
    const uncertain = Boolean(state.exportSupplementUncertain[id]);
    if (
      uncertain
      && EXPORT_MUTATING_ACTIONS.has(action)
    ) return false;
    if (
      action === 'diagnose'
      && uncertain
      && (hasCanonicalDataExportLink(row) || isDataExportCleanupCandidate(row))
    ) return true;
    if (action === 'link_verified_ticket') return canOfferDataExportIdentityLink(row);
    if (hasCanonicalDataExportLink(row)) return true;
    if (action !== 'purge' || !isDataExportCleanupCandidate(row)) return false;
    const metadata = getHelpMetadata(row);
    return isDataExportPurgeEligible(
      metadata.export_artifact_status,
      metadata.export_artifact_expires_at
    );
  }

  function buildDataExportSupplementPanel(row) {
    if (!isDataExportSupplementRequest(row)) return '';
    const id = String(row.id || '');
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const requestKind = getDataExportRequestKind(row);
    const result = state.exportSupplementResults[id] || {};
    const artifact = result.artifact && typeof result.artifact === 'object'
      ? result.artifact
      : {};
    const artifactRef = String(artifact.artifact_ref || metadata.export_artifact_ref || '');
    // A response body is not authority for unlocking assisted export work.
    // The Help row must be reloaded with its canonical owner and DSR relation.
    const canonicalLinked = hasCanonicalDataExportLink(row);
    const cleanupOnly = isDataExportCleanupCandidate(row);
    const linked = canonicalLinked || cleanupOnly;
    const status = String(artifact.status || metadata.export_artifact_status || (linked ? 'queued' : 'identity_pending'));
    const busy = state.exportSupplementBusy[id] === true;
    const uncertain = Boolean(state.exportSupplementUncertain[id]);
    const mutationDisabled = busy || uncertain;
    if (!linked) {
      if (!canOfferDataExportIdentityLink(row)) {
        return [
          `<section class="kc-admin-lgpd-panel" data-export-supplement-panel${busy ? ' aria-busy="true"' : ''}>`,
          '  <div class="kc-admin-lgpd-panel__head">',
          '    <div><strong><i class="fas fa-file-shield" aria-hidden="true"></i> Cópia integral bloqueada</strong><p>A relação entre ticket, titular, protocolo e artefato está incompleta. Não vincule novamente nem inicie coleta; faça uma revisão técnica do DSR.</p></div>',
          '    <span class="kc-admin-help-chip">revisão técnica</span>',
          '  </div>',
          '</section>',
        ].join('');
      }
      const accountEmail = getLgpdTargetEmail(row);
      return [
        `<section class="kc-admin-lgpd-panel" data-export-supplement-panel${busy ? ' aria-busy="true"' : ''}>`,
        '  <div class="kc-admin-lgpd-panel__head">',
        '    <div><strong><i class="fas fa-file-shield" aria-hidden="true"></i> Vincular cópia integral</strong><p>Este pedido ainda não possui protocolo autenticado. Valide a titularidade antes de criar o vínculo e iniciar a coleta assistida.</p></div>',
        '    <span class="kc-admin-help-chip">identidade pendente</span>',
        '  </div>',
        '  <div class="kc-admin-lgpd-danger" data-export-identity-link>',
        `    <label><span>E-mail exato da conta</span><input type="email" data-export-account-email value="${esc(accountEmail)}" autocomplete="off"${mutationDisabled ? ' disabled' : ''} /></label>`,
        '    <label><span>Canal de validação da identidade</span><select data-export-identity-channel',
        mutationDisabled ? ' disabled>' : '>',
        '      <option value="verified_email_challenge">Desafio respondido no e-mail da conta</option>',
        '      <option value="support_mailbox_reply">Resposta validada na caixa de suporte</option>',
        '      <option value="identity_document_review">Documento revisado por canal seguro</option>',
        '      <option value="in_person_verification">Validação presencial</option>',
        '    </select></label>',
        `    <label><span>Referência da validação</span><input type="text" data-export-identity-reference placeholder="Message-ID, protocolo ou registro; será armazenado somente como hash" autocomplete="off"${mutationDisabled ? ' disabled' : ''} /></label>`,
        `    <label><span>Identidade validada em</span><input type="datetime-local" data-export-identity-at${mutationDisabled ? ' disabled' : ''} /></label>`,
        `    <label><span><input type="checkbox" data-export-identity-attested style="width:auto"${mutationDisabled ? ' disabled' : ''} /> Confirmo que validei a identidade antes de vincular o ticket à conta</span></label>`,
        `    <input type="hidden" data-export-request-kind value="${esc(requestKind)}" />`,
        `    <button type="button" data-export-action="link_verified_ticket"${mutationDisabled ? ' disabled' : ''}><i class="fas fa-link" aria-hidden="true"></i> Validar e criar protocolo</button>`,
        '  </div>',
        '</section>',
      ].join('');
    }
    const expiresAt = Date.parse(String(artifact.expires_at || ''));
    const expired = Number.isFinite(expiresAt) && expiresAt <= Date.now();
    const purgeEligible = isDataExportPurgeEligible(
      status,
      artifact.expires_at || metadata.export_artifact_expires_at
    );
    const buildAllowed = ['queued', 'failed', 'expired'].includes(status)
      || (['ready', 'download_reserved'].includes(status) && expired);
    const buildAction = status === 'failed' ? 'retry' : 'build';
    const buildLabel = status === 'failed'
      ? 'Tentar novamente'
      : status === 'expired' || expired
        ? 'Reabrir download'
        : 'Gerar complemento';
    const processors = !cleanupOnly && Array.isArray(artifact.processors)
      ? artifact.processors
      : [];
    const pending = processors.filter((item) => item && item.status === 'manual_follow_up');
    const processorFields = pending.map((item) => [
      '<div class="kc-admin-lgpd-danger" data-export-processor-row>',
      `  <p><strong>${esc(item.processor)}</strong> · ${esc(item.treatment)}</p>`,
      `  <input type="hidden" data-export-processor value="${esc(item.processor)}" />`,
      `  <label><span>Resultado</span><select data-export-outcome${busy ? ' disabled' : ''}><option value="supplied_out_of_band">Entregue fora da plataforma (não incluído no JSON)</option><option value="no_account_data">Operador confirmou ausência de dados da conta</option></select></label>`,
      `  <label><span>Referência da evidência</span><input type="text" data-export-evidence placeholder="Ticket ou registro; será guardado somente como hash" autocomplete="off"${busy ? ' disabled' : ''} /></label>`,
      `  <label data-export-delivery-field><span>Canal da entrega externa</span><select data-export-delivery-channel${busy ? ' disabled' : ''}><option value="">Selecione</option><option value="support_mailbox">Caixa de suporte</option><option value="secure_file_transfer">Transferência segura de arquivo</option><option value="provider_portal">Portal do operador</option><option value="in_person">Entrega presencial</option></select></label>`,
      `  <label data-export-delivery-field><span>Entregue fora da plataforma em</span><input type="datetime-local" data-export-delivered-at${busy ? ' disabled' : ''} /></label>`,
      `  <label data-export-delivery-field><span><input type="checkbox" data-export-delivery-attested style="width:auto"${busy ? ' disabled' : ''} /> Confirmo que a entrega externa foi concluída e que esse conteúdo não está no JSON</span></label>`,
      `  <button type="button" data-export-processor-save${mutationDisabled ? ' disabled' : ''}>Registrar evidência</button>`,
      '</div>',
    ].join('')).join('');
    return [
      `<section class="kc-admin-lgpd-panel" data-export-supplement-panel${busy ? ' aria-busy="true"' : ''}>`,
      '  <div class="kc-admin-lgpd-panel__head">',
      '    <div><strong><i class="fas fa-file-shield" aria-hidden="true"></i> Complemento integral da cópia</strong><p>Enquanto o protocolo DSR de cópia/portabilidade estiver aberto, o ticket <strong>não pode</strong> ser Resolvido nem Arquivado (regra <code>DSR_HELP_MUST_REMAIN_OPEN</code>). Conclua entrega, cancele o protocolo ou aguarde expiração antes de fechar a triagem.</p></div>',
      `    <span class="kc-admin-help-chip">${esc(status)}</span>`,
      '  </div>',
      uncertain
        ? '  <p class="kc-admin-lgpd-warning">Resultado anterior indeterminado: não repita mutações até concluir um novo diagnóstico seguro.</p>'
        : '',
      '  <div class="kc-admin-help-meta">',
      `    <div><strong>Artefato</strong><span>${esc(artifactRef || 'A diagnosticar')}</span></div>`,
      `    <div><strong>Bloqueios</strong><span>${esc(Number(artifact.blocking_processor_count || pending.length))}</span></div>`,
      `    <div><strong>Expira em</strong><span>${esc(formatDateTime(artifact.expires_at))}</span></div>`,
      '  </div>',
      processorFields,
      '  <div class="kc-admin-lgpd-actions">',
      `    <button type="button" data-export-action="diagnose"${busy || (cleanupOnly && !uncertain) ? ' disabled' : ''}><i class="fas fa-magnifying-glass-chart" aria-hidden="true"></i> Diagnosticar</button>`,
      `    <button type="button" data-export-action="${buildAction}"${mutationDisabled || cleanupOnly || !buildAllowed ? ' disabled' : ''} title="${esc(cleanupOnly ? 'Conta removida: somente o expurgo elegível permanece disponível' : buildAllowed ? buildLabel : 'Diagnostique ou aguarde o estado elegível')}"><i class="fas fa-box-archive" aria-hidden="true"></i> ${esc(buildLabel)}</button>`,
      `    <button type="button" data-export-action="purge"${mutationDisabled || !purgeEligible ? ' disabled' : ''} title="${esc(purgeEligible ? 'Remove definitivamente o arquivo privado já elegível' : 'Disponível somente após entrega, falha ou expiração')}"><i class="fas fa-trash-can" aria-hidden="true"></i> Expurgar artefato elegível</button>`,
      '  </div>',
      '</section>',
    ].join('');
  }

  function summarizeCounts(counts) {
    const input = counts && typeof counts === 'object' ? counts : {};
    const labels = {
      active_admins: 'Administradores ativos',
      comment_likes_on_authored_comments: 'Curtidas de terceiros preservadas',
      user_blocks_received: 'Bloqueios de seguranca recebidos',
      user_ratings_received: 'Avaliacoes de terceiros recebidas',
      profiles: 'Perfil',
      posts: 'Publicações',
      post_media: 'Mídias',
      comments: 'Comentários',
      comment_likes: 'Curtidas em comentários',
      post_votes: 'Votos',
      saved_posts: 'Salvos',
      reports: 'Denúncias',
      post_view_events: 'Visualizações vinculadas',
      search_queries: 'Buscas vinculadas',
      home_category_affinity: 'Afinidade da página inicial',
      search_preferences: 'Preferências de busca',
      help_requests: 'Pedidos de ajuda',
      chat_conversations: 'Conversas',
      chat_messages: 'Mensagens',
      chat_messages_third_party: 'Mensagens de terceiros em conversas',
      chat_read_state: 'Estado de leitura',
      chat_reactions: 'Reações no chat',
      notifications: 'Notificações',
      notification_preferences: 'Preferências',
      notification_channel_targets: 'Destinos de notificação',
      notification_delivery_outbox: 'Entregas pendentes',
      notification_delivery_attempts: 'Tentativas de entrega',
      privacy_analytics_events: 'Eventos de analytics',
      privacy_consent_events: 'Consentimentos',
      user_legal_acceptances: 'Aceites legais',
      user_blocks: 'Bloqueios',
      user_ratings: 'Avaliações',
      kc_invited_emails: 'Convites por e-mail',
      audit_log_actor: 'Eventos de auditoria',
    };
    const keys = Object.keys(labels);
    return keys
      .filter((key) => input[key] !== undefined)
      .map((key) => `<span class="kc-admin-help-chip"><strong>${esc(labels[key])}</strong> ${esc(input[key])}</span>`)
      .join('');
  }

  function buildEmailDraftPreview(result) {
    const draft = result && result.email && result.email.draft ? result.email.draft : null;
    if (!draft || !draft.text) return '';
    return [
      '<details class="kc-admin-lgpd-email">',
      '  <summary><i class="fas fa-envelope-open-text" aria-hidden="true"></i> Ver e-mail de confirmação</summary>',
      `  <pre>${esc(draft.text)}</pre>`,
      '</details>',
    ].join('');
  }

  function getManualProviderIds(result) {
    const diagnostics = result && result.diagnostics && typeof result.diagnostics === 'object' ? result.diagnostics : {};
    const request = result && result.request && typeof result.request === 'object' ? result.request : {};
    const metadata = request.metadata && typeof request.metadata === 'object' ? request.metadata : {};
    const tasks = Array.isArray(diagnostics.external_processors)
      ? diagnostics.external_processors
      : (Array.isArray(metadata.external_processors) ? metadata.external_processors : []);
    return tasks
      .filter((task) => task && task.status === 'manual_policy_follow_up')
      .map((task) => String(task.provider || '').trim())
      .filter(Boolean);
  }

  function getErasureCompletionState(row, result) {
    const request = result && result.request && typeof result.request === 'object'
      ? result.request
      : {};
    const metadata = request.metadata && typeof request.metadata === 'object'
      ? request.metadata
      : {};
    const status = String(request.status || '').trim();
    const failureStage = String(metadata.failure_stage || '').trim();
    const completionEmailStatus = String(metadata.completion_email_status || '').trim();
    const postCoreMarker = getPostCoreErasureMarker(row);
    const coreErased = Boolean(
      status === 'erased'
      || metadata.auth_deleted === true
      || postCoreMarker
    );
    const flowComplete = Boolean(
      status === 'erased'
      && metadata.notification_pending === false
      && metadata.retryable === false
      && !failureStage
      && ['sent', 'sent_manual'].includes(completionEmailStatus)
    );
    return {
      status,
      cancelled: status === 'cancelled',
      coreErased,
      flowComplete,
      failureStage,
      completionEmailStatus,
      notificationPending: metadata.notification_pending === true,
    };
  }

  function getErasureCloseGuard(row) {
    if (!isLgpdErasureRequest(row)) return { locked: false, reason: '' };
    const id = String(row && row.id || '').trim();
    const result = state.erasureResults[id] || null;
    const completionState = getErasureCompletionState(row, result);
    if (completionState.flowComplete || completionState.cancelled) {
      return { locked: false, reason: '' };
    }

    let reason = 'Fechamento bloqueado: carregue o estado seguro e conclua o fluxo LGPD antes de resolver ou arquivar.';
    if (needsErasureProtocolLink(row)) {
      reason = 'Fechamento bloqueado: vincule a identidade e crie o protocolo DSR antes de concluir este pedido de exclusão.';
    } else if (completionState.coreErased) {
      reason = 'Fechamento bloqueado: o núcleo foi excluído, mas a entrega do comprovante final ainda não foi comprovada.';
    } else if (result) {
      reason = 'Fechamento bloqueado: a exclusão ainda não foi concluída ou formalmente cancelada.';
    }
    return { locked: true, reason };
  }

  /**
   * Human checklist for moderators (joins Help ticket + DSR protocol + Edge workflow).
   * Matches the operational path reflected in historical LGPD PDF reports.
   */
  function getLgpdModeratorGuide(ctx) {
    const steps = [
      {
        key: 'identity',
        label: '1. Vincular identidade (se o ticket for anônimo/legado)',
        done: Boolean(ctx.canonicalIdentityLinked || ctx.postCoreSurface),
        current: Boolean(ctx.identityLinkRequired),
      },
      {
        key: 'diagnose',
        label: '2. Preparar diagnóstico de dados',
        done: Boolean(ctx.hasDiagnostics || ctx.postCoreSurface),
        current: Boolean(ctx.canonicalIdentityLinked && !ctx.hasDiagnostics && !ctx.postCoreSurface),
      },
      {
        key: 'hide',
        label: '3. Ocultar conta e pedir confirmação por e-mail',
        done: Boolean(
          ctx.status === 'pending_confirmation'
          || ctx.status === 'reversible_applied'
          || ctx.status === 'confirmed'
          || ctx.status === 'partial_failure'
          || ctx.status === 'erased'
          || ctx.postCoreSurface
        ),
        current: Boolean(
          ctx.canonicalIdentityLinked
          && ctx.hasDiagnostics
          && (ctx.status === 'diagnosed' || ctx.status === 'não iniciado' || !ctx.status)
          && !ctx.postCoreSurface
        ),
      },
      {
        key: 'wait',
        label: '4. Aguardar resposta do titular (frase de confirmação)',
        done: Boolean(
          ctx.status === 'confirmed'
          || ctx.status === 'partial_failure'
          || ctx.status === 'erased'
          || ctx.postCoreSurface
        ),
        current: Boolean(
          ctx.status === 'pending_confirmation' || ctx.status === 'reversible_applied'
        ),
      },
      {
        key: 'erase',
        label: '5. Executar exclusão confirmada (frase EXCLUIR e-mail)',
        done: Boolean(ctx.status === 'erased' || ctx.postCoreSurface || ctx.coreErasedAt),
        current: Boolean(
          ctx.status === 'pending_confirmation'
          || ctx.status === 'confirmed'
          || (ctx.status === 'reversible_applied' && ctx.hasDiagnostics)
        ),
      },
      {
        key: 'notify',
        label: '6. Confirmar a entrega do comprovante final ao titular',
        done: Boolean(ctx.flowComplete || ctx.cancelled),
        current: Boolean(ctx.coreErasedAt && !ctx.flowComplete),
      },
      {
        key: 'close',
        label: '7. Exportar relatório LGPD e só então fechar o ticket',
        done: Boolean(
          (ctx.flowComplete || ctx.cancelled)
          && ['resolved', 'archived'].includes(ctx.helpStatus)
        ),
        current: Boolean(ctx.flowComplete || ctx.cancelled),
      },
    ];
    // Ensure only one "current" step: first incomplete current wins.
    let foundCurrent = false;
    const normalized = steps.map((step) => {
      if (step.done) {
        return Object.assign({}, step, { current: false });
      }
      if (!foundCurrent && step.current) {
        foundCurrent = true;
        return step;
      }
      if (!foundCurrent && !step.current) {
        // Fall through — keep as pending unless nothing marked current yet
        return step;
      }
      return Object.assign({}, step, { current: false });
    });
    if (!foundCurrent) {
      const firstOpen = normalized.find((step) => !step.done);
      if (firstOpen) firstOpen.current = true;
    }
    const current = normalized.find((step) => step.current) || normalized[normalized.length - 1];
    return { steps: normalized, current };
  }

  function buildLgpdModeratorGuideHtml(guide, protocol) {
    if (!guide || !Array.isArray(guide.steps)) return '';
    const items = guide.steps.map((step) => {
      const stateClass = step.done
        ? 'is-done'
        : step.current
          ? 'is-current'
          : 'is-pending';
      const icon = step.done
        ? 'fa-circle-check'
        : step.current
          ? 'fa-circle-right'
          : 'fa-circle';
      return [
        `<li class="kc-admin-lgpd-checklist__item ${stateClass}">`,
        `<i class="fas ${icon}" aria-hidden="true"></i>`,
        `<span>${esc(step.label)}</span>`,
        '</li>',
      ].join('');
    }).join('');
    const next = guide.current
      ? `<p class="kc-admin-lgpd-next"><strong>Próximo passo:</strong> ${esc(guide.current.label)}</p>`
      : '';
    const protocolLine = protocol
      ? `<p class="kc-admin-lgpd-protocol"><strong>Protocolo do titular (DSR):</strong> <code>${esc(protocol)}</code> — o mesmo protocolo que o usuário vê em Configurações.</p>`
      : '<p class="kc-admin-lgpd-protocol"><strong>Protocolo do titular (DSR):</strong> ainda não vinculado. Complete a etapa 1 se o pedido for anônimo.</p>';
    return [
      '<div class="kc-admin-lgpd-guide" role="region" aria-label="Roteiro do moderador para exclusão LGPD">',
      '  <strong><i class="fas fa-list-ol" aria-hidden="true"></i> Roteiro unificado (pedido de ajuda + protocolo)</strong>',
      `  ${protocolLine}`,
      next,
      `  <ol class="kc-admin-lgpd-checklist">${items}</ol>`,
      '  <p class="kc-admin-lgpd-guide-note">Dica: use <em>Exportar relatório LGPD</em> a qualquer momento para o PDF de evidência (como os relatórios “Em andamento” / “Resolvido”). Conclua a entrega do comprovante na etapa 6 antes de marcar o ticket como Resolvido na etapa 7.</p>',
      '</div>',
    ].join('');
  }

  function buildLgpdPanel(row) {
    if (!isLgpdErasureRequest(row)) return '';
    const targetEmail = getLgpdTargetEmail(row);
    const result = state.erasureResults[String(row.id || '')] || null;
    const request = result && result.request ? result.request : null;
    const id = String(row && row.id || '');
    const busy = state.erasureBusy[id] === true;
    // Before core erasure, only a canonical owner + DSR link unlocks mutations.
    // Once Auth/profile removal starts, Help.user_id is intentionally cleared,
    // so only the narrow post-core recovery/read-only surface may remain.
    const canonicalIdentityLinked = hasCanonicalErasureLink(row);
    const redactedPostCore = isRedactedPostCoreErasure(row);
    const postCoreProbeCandidate = isPostCoreProbeCandidate(row);
    const confirmedPostCore = hasConfirmedPostCoreWorkflow(result);
    const identityLinkRequired = canOfferErasureIdentityLink(row);
    // Drop stale Passo-1 traps so the banner never blocks protocol creation.
    if (
      identityLinkRequired
      && state.erasureUncertain[id]
      && state.erasureUncertain[id].action === 'link_verified_identity'
    ) {
      delete state.erasureUncertain[id];
    }
    const uncertain = Boolean(state.erasureUncertain[id]);
    const identityStateInconsistent = !canonicalIdentityLinked
      && !identityLinkRequired
      && !redactedPostCore
      && !postCoreProbeCandidate;
    const workflowActionDisabled = busy || uncertain || !canonicalIdentityLinked;
    const readOnlyActionDisabled = busy || !canProbeErasureWorkflow(row);
    const retryActionDisabled = busy || uncertain || !(
      canonicalIdentityLinked
      || hasRecoverablePostCoreWorkflow(result)
    );
    const diagnostics = result && result.diagnostics ? result.diagnostics : null;
    const countsHtml = diagnostics && diagnostics.counts ? summarizeCounts(diagnostics.counts) : '';
    const helpMetadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const helpErasure = helpMetadata.lgpd_erasure && typeof helpMetadata.lgpd_erasure === 'object'
      ? helpMetadata.lgpd_erasure
      : {};
    const redactedMarker = redactedPostCore ? helpErasure : {};
    const helpStage = String(helpErasure.stage || '').trim();
    // Prefer live workflow status; fall back to durable Help stage so a missing
    // in-memory diagnose result does not send the checklist back to Passo 1/2.
    const status = request && request.status
      ? String(request.status)
      : helpStage
        ? helpStage
        : redactedPostCore
          ? 'post_core_redacted'
          : 'não iniciado';
    const requestMetadata = request && request.metadata && typeof request.metadata === 'object' ? request.metadata : {};
    const copyPreference = String(helpMetadata.export_before_erasure || '').trim();
    const copyGate = requestMetadata.pre_erasure_copy_gate && typeof requestMetadata.pre_erasure_copy_gate === 'object'
      ? requestMetadata.pre_erasure_copy_gate
      : {};
    const copyDecision = requestMetadata.pre_erasure_copy_decision && typeof requestMetadata.pre_erasure_copy_decision === 'object'
      ? requestMetadata.pre_erasure_copy_decision
      : {};
    const copyDecisionRequired = (!copyPreference || copyPreference === 'need_guidance')
      && copyDecision.attested !== true;
    const copyGateLabel = copyGate.ok === true
      ? (copyGate.copy_required ? 'Cópia entregue e vinculada' : 'Cópia dispensada conforme escolha/decisão')
      : copyPreference === 'request_copy_first'
        ? 'Aguardando cópia comprovadamente baixada'
        : copyDecisionRequired
          ? 'Aguardando decisão de orientação'
          : 'Será validado antes da exclusão';
    const failureStage = String(requestMetadata.failure_stage || '').trim();
    const exportArtifactCleanup = result
      && result.data_export_artifact_cleanup
      && typeof result.data_export_artifact_cleanup === 'object'
      ? result.data_export_artifact_cleanup
      : {};
    const exportRetryTimestamp = Date.parse(String(exportArtifactCleanup.retry_after || ''));
    const exportRetryLabel = Number.isFinite(exportRetryTimestamp)
      ? new Date(exportRetryTimestamp).toLocaleString('pt-BR')
      : '';
    const statusLabel = buildLabel(LGPD_STATUS_LABELS, status, status);
    const coreErasedAt = request && request.erased_at
      || result && result.receipt && result.receipt.erased_at
      || redactedMarker.erased_at
      || '';
    const completionState = getErasureCompletionState(row, result);
    const erasedAt = completionState.flowComplete ? coreErasedAt : '';
    const canClose = completionState.cancelled
      ? 'Sim, após revisar o cancelamento formal.'
      : completionState.flowComplete
        ? 'Sim, após revisar e exportar o recibo interno.'
        : completionState.coreErased
          ? 'Não. O núcleo foi excluído, mas a entrega final ainda não foi comprovada.'
      : status === 'pending_confirmation' || status === 'reversible_applied'
        ? 'Não. Aguardar confirmação final do titular.'
        : diagnostics && diagnostics.counts
          ? 'Não. Fluxo sem confirmação final.'
          : 'Não. Diagnóstico pendente.';
    const expectedPhrase = targetEmail ? `EXCLUIR ${targetEmail}` : 'EXCLUIR email@domínio';
    const confirmationSummary = canonicalIdentityLinked
      ? expectedPhrase
      : redactedPostCore || confirmedPostCore || postCoreProbeCandidate
        ? 'Não aplicável no modo pós-exclusão'
        : 'Bloqueada até a confirmação do vínculo';
    const postCoreSurface = redactedPostCore
      || confirmedPostCore
      || postCoreProbeCandidate;
    const finalReadOnly = completionState.flowComplete;
    const warningItems = []
      .concat(result && Array.isArray(result.warnings) ? result.warnings : [])
      .concat(diagnostics && Array.isArray(diagnostics.errors) ? diagnostics.errors : [])
      .concat(diagnostics && Array.isArray(diagnostics.blockers) ? diagnostics.blockers : [])
      .concat(failureStage ? [`Etapa pendente: ${failureStage}`] : [])
      .concat(exportRetryLabel ? [`Nova tentativa segura após: ${exportRetryLabel}`] : [])
      // Passo 1 (criar protocolo) never shows the indeterminate trap: there is no
      // diagnose path yet, and protocol creation must remain the recovery action.
      .concat(
        uncertain && !identityLinkRequired
          ? ['Resultado anterior indeterminado: não repita mutações até concluir um novo diagnóstico seguro.']
          : []
      )
      .filter(Boolean);
    const warning = warningItems.length
      ? `<p class="kc-admin-lgpd-warning">${esc(warningItems.join(' | '))}</p>`
      : '';
    const emailDraft = buildEmailDraftPreview(result);
    const manualProviders = getManualProviderIds(result);
    const identityAssurance = diagnostics && diagnostics.identity_assurance && typeof diagnostics.identity_assurance === 'object'
      ? diagnostics.identity_assurance
      : null;
    const identityNeedsManualEvidence = identityAssurance && identityAssurance.requires_manual_evidence === true;
    const showIdentityEvidence = identityLinkRequired
      || (canonicalIdentityLinked && identityNeedsManualEvidence);
    const notificationStateKnown = Boolean(request);
    const notificationPending = requestMetadata.notification_pending === true;
    const notificationLabel = notificationStateKnown
      ? completionState.flowComplete
        ? 'Comprovante entregue'
        : notificationPending
          ? 'Entrega final pendente'
          : completionState.failureStage
            ? `Falha em ${completionState.failureStage}`
            : 'Entrega final não comprovada'
      : redactedPostCore || postCoreProbeCandidate
        ? 'Desconhecida — carregue o estado seguro'
        : 'Ainda não aplicável — o comprovante é enviado após a exclusão';
    const identityStateLabel = redactedPostCore
      ? 'Dados do ticket redigidos; fluxo pós-exclusão'
      : confirmedPostCore
        ? 'Núcleo excluído; recuperação pós-exclusão'
        : postCoreProbeCandidate
          ? 'Vínculo histórico; carregue o estado seguro'
          : identityStateInconsistent
            ? 'Relação canônica inconsistente; revisão técnica obrigatória'
            : identityLinkRequired
              ? 'Aguardando vínculo verificado'
              : identityAssurance
                ? (identityAssurance.verified ? 'Verificado' : 'Exige prova manual')
                : 'Vínculo canônico confirmado';
    const identityGuidance = redactedPostCore
      ? 'O ticket já foi redigido. Não recrie o vínculo nem reabra etapas destrutivas; use somente diagnóstico, recibo e recuperação pós-exclusão.'
      : confirmedPostCore
        ? 'A remoção do núcleo já começou. Somente diagnóstico, recibo e finalização de pendências pós-exclusão permanecem disponíveis.'
        : postCoreProbeCandidate
          ? 'O perfil já não está disponível, mas há um vínculo histórico. Carregue o estado; o servidor só permitirá recuperação se o checkpoint e a prova armazenada coincidirem.'
          : identityStateInconsistent
            ? 'O ticket possui uma relação incompleta entre titular e protocolo. O fluxo está bloqueado; investigue o DSR e o workflow sem tentar vincular ou alterar dados.'
            : identityLinkRequired
              ? (
                  UUID_RE.test(String(row && row.user_id || '').trim())
                    ? 'Pedido legado autenticado: o titular já está no ticket, mas falta o protocolo DSR. Informe o e-mail da conta, canal de validação e use “Criar protocolo e destravar fluxo LGPD” antes de diagnosticar ou ocultar.'
                    : 'Ticket sem titular vinculado: valide a identidade e crie o vínculo auditado antes de qualquer diagnóstico ou ocultação.'
                )
              : identityNeedsManualEvidence
                ? 'Ticket legado/anônimo: valide a titularidade antes de ocultar qualquer dado.'
                : 'O vínculo canônico foi confirmado pelo ticket e pelo protocolo.';
    const providerOutcomeFields = manualProviders.map((provider) => {
      const isFinalNotificationProvider = provider === 'hostinger_smtp_mailbox';
      return [
        `<label><span>${esc(provider)}</span>`,
        `<select data-lgpd-provider-outcome data-provider="${esc(provider)}">`,
        '<option value="">Selecione o resultado</option>',
        ...(isFinalNotificationProvider
          ? ['<option value="retention_documented">Retenção pré-conclusão e entrega documentada</option>']
          : [
            '<option value="deleted">Excluído no operador</option>',
            '<option value="retention_documented">Retenção documentada</option>',
            '<option value="not_applicable">Não aplicável, com justificativa no registro</option>',
          ]),
        '</select></label>',
        `<label><span>Base/justificativa de retenção — ${esc(provider)}</span><input type="text" data-lgpd-provider-retention-basis data-provider="${esc(provider)}" placeholder="${esc(isFinalNotificationProvider ? 'Obrigatório: tratamento pré-conclusão e logs de entrega' : 'Obrigatório se houver retenção documentada')}" autocomplete="off" /></label>`,
        `<label><span>Data de revisão da retenção — ${esc(provider)}</span><input type="datetime-local" data-lgpd-provider-retention-at data-provider="${esc(provider)}" /></label>`,
      ].join('');
    }).join('');
    const providerSummary = manualProviders.length
      ? manualProviders.join(', ')
      : 'Execute o diagnóstico para carregar a matriz de operadores.';
    const protocol = String(
      helpMetadata.protocol
      || helpMetadata.data_subject_protocol
      || requestMetadata.protocol
      || (result && result.protocol)
      || (result && result.data_subject_request && result.data_subject_request.protocol)
      || ''
    ).trim();
    const hasDiagnostics = Boolean(
      (diagnostics && diagnostics.counts)
      || ['pending_confirmation', 'reversible_applied', 'confirmed', 'partial_failure', 'erased', 'diagnosed'].includes(status)
      || Boolean(helpStage)
    );
    const moderatorGuide = getLgpdModeratorGuide({
      canonicalIdentityLinked,
      identityLinkRequired,
      postCoreSurface,
      hasDiagnostics,
      status,
      coreErasedAt,
      flowComplete: completionState.flowComplete,
      cancelled: completionState.cancelled,
      helpStatus: String(row && row.status || ''),
    });
    const moderatorGuideHtml = buildLgpdModeratorGuideHtml(moderatorGuide, protocol);

    return [
      `<section class="kc-admin-lgpd-panel" data-lgpd-panel aria-labelledby="lgpd-title-${esc(id)}" aria-describedby="lgpd-guidance-${esc(id)}"${busy ? ' aria-busy="true"' : ''}>`,
      `  <span class="sr-only" data-lgpd-live role="status" aria-live="polite">${busy ? 'Processando solicitação LGPD.' : ''}</span>`,
      '  <div class="kc-admin-lgpd-panel__head">',
      '    <div>',
      `      <strong id="lgpd-title-${esc(id)}"><i class="fas fa-shield-heart" aria-hidden="true"></i> Solicitação LGPD</strong>`,
      '      <p>Fluxo unificado: o pedido de ajuda e o protocolo do titular (Configurações) são o mesmo caso. Siga o roteiro numerado abaixo — é o mesmo caminho dos relatórios PDF de andamento/resolvido.</p>',
      '    </div>',
      `    <span class="kc-admin-help-chip"><i class="fas fa-circle-info" aria-hidden="true"></i>${esc(statusLabel)}</span>`,
      '  </div>',
      moderatorGuideHtml,
      '  <div class="kc-admin-help-meta">',
      protocol
        ? `    <div><strong>Protocolo DSR</strong><span>${esc(protocol)}</span></div>`
        : '',
      `    <div><strong>E-mail alvo</strong><span>${esc(targetEmail || 'Não informado')}</span></div>`,
      `    <div><strong>Confirmação irreversível</strong><span>${esc(confirmationSummary)}</span></div>`,
      `    <div><strong>Núcleo excluído</strong><span>${coreErasedAt ? 'Sim' : 'Não'}</span></div>`,
      `    <div><strong>Fluxo integral finalizado</strong><span>${erasedAt ? 'Sim' : 'Não'}</span></div>`,
      `    <div><strong>Pode fechar?</strong><span>${esc(canClose)}</span></div>`,
      `    <div><strong>Vínculo de identidade</strong><span>${esc(identityStateLabel)}</span></div>`,
      `    <div><strong>Notificação final</strong><span>${esc(notificationLabel)}</span></div>`,
      canonicalIdentityLinked
        ? `    <div><strong>Cópia antes da exclusão</strong><span>${esc(copyGateLabel)}</span></div>`
        : '',
      '  </div>',
      countsHtml ? `<div class="kc-admin-lgpd-counts">${countsHtml}</div>` : '',
      warning,
      emailDraft,
      '  <div class="kc-admin-lgpd-danger">',
      `    <p id="lgpd-guidance-${esc(id)}" data-lgpd-identity-guidance>${esc(identityGuidance)}</p>`,
      showIdentityEvidence && identityLinkRequired
        ? `    <label><span>E-mail exato da conta verificada</span><input type="email" data-lgpd-account-email value="${esc(targetEmail)}" autocomplete="off" required aria-required="true"${busy ? ' disabled' : ''} /></label>`
        : '',
      showIdentityEvidence
        ? `    <label><span>Canal de validação da identidade</span><select data-lgpd-identity-channel required aria-required="true"${busy ? ' disabled' : ''}><option value="verified_email_challenge">Desafio enviado e respondido no e-mail da conta</option><option value="support_mailbox_reply">Resposta validada na caixa de suporte</option><option value="identity_document_review">Documento revisado por canal seguro</option><option value="in_person_verification">Validação presencial</option></select></label>`
        : '',
      showIdentityEvidence
        ? `    <label><span>Referência da validação</span><input type="text" data-lgpd-identity-reference placeholder="Message-ID, protocolo ou registro; será armazenado apenas como hash" autocomplete="off" minlength="6" required aria-required="true"${busy ? ' disabled' : ''} /></label>`
        : '',
      showIdentityEvidence
        ? `    <label><span>Identidade validada em</span><input type="datetime-local" data-lgpd-identity-at required aria-required="true"${busy ? ' disabled' : ''} /></label>`
        : '',
      showIdentityEvidence
        ? `    <label><span><input type="checkbox" data-lgpd-identity-attested style="width:auto" required aria-required="true"${busy ? ' disabled' : ''} /> Confirmo que a identidade do titular foi validada antes de qualquer ocultação</span></label>`
        : '',
      identityLinkRequired
        // Keep protocol creation clickable even after a prior uncertain outcome —
        // unlinked tickets have no diagnose path to clear the lock.
        ? `    <button type="button" data-lgpd-action="link_verified_identity" aria-describedby="lgpd-guidance-${esc(id)}"${busy ? ' disabled' : ''}><i class="fas fa-link" aria-hidden="true"></i> ${
            UUID_RE.test(String(row && row.user_id || '').trim())
              ? 'Criar protocolo e destravar fluxo LGPD'
              : 'Vincular identidade ao protocolo'
          }</button>`
        : '',
      '  </div>',
      canonicalIdentityLinked || postCoreSurface
        ? [
          '  <div class="kc-admin-lgpd-actions">',
          `    <button type="button" data-lgpd-action="diagnose" aria-describedby="lgpd-guidance-${esc(id)}"${readOnlyActionDisabled ? ' disabled' : ''}><i class="fas fa-magnifying-glass-chart" aria-hidden="true"></i> ${postCoreSurface ? 'Carregar estado seguro' : 'Preparar diagnóstico'}</button>`,
          canonicalIdentityLinked
            ? `    <button type="button" data-lgpd-action="apply_reversible"${workflowActionDisabled ? ' disabled' : ''}><i class="fas fa-eye-slash" aria-hidden="true"></i> Ocultar conta e pedir confirmação</button>`
            : '',
          canonicalIdentityLinked
            ? `    <button type="button" data-lgpd-action="cancel_reversible"${workflowActionDisabled ? ' disabled' : ''}><i class="fas fa-rotate-left" aria-hidden="true"></i> Cancelar e restaurar</button>`
            : '',
          `    <button type="button" data-lgpd-action="generate_receipt" aria-describedby="lgpd-guidance-${esc(id)}"${readOnlyActionDisabled ? ' disabled' : ''}><i class="fas fa-receipt" aria-hidden="true"></i> Gerar recibo interno</button>`,
          `    <button type="button" data-lgpd-export aria-describedby="lgpd-guidance-${esc(id)}"${readOnlyActionDisabled ? ' disabled' : ''}><i class="fas fa-file-arrow-down" aria-hidden="true"></i> Exportar relatório LGPD</button>`,
          '  </div>',
        ].join('')
        : '',
      canonicalIdentityLinked
        ? [
          '  <div class="kc-admin-lgpd-danger">',
      '    <label><span>Referência do envio manual (somente se o SMTP falhou)</span><input type="text" data-lgpd-delivery-reference placeholder="Message-ID ou protocolo; será armazenado apenas como hash" autocomplete="off" /></label>',
      '    <label><span>Enviado em</span><input type="datetime-local" data-lgpd-delivery-at /></label>',
      '    <label><span><input type="checkbox" data-lgpd-delivery-attested style="width:auto" /> Confirmo que enviei o pedido pelo e-mail titular</span></label>',
      `    <button type="button" data-lgpd-action="record_confirmation_delivery"${workflowActionDisabled ? ' disabled' : ''}><i class="fas fa-envelope-circle-check" aria-hidden="true"></i> Registrar envio manual</button>`,
      '  </div>',
        ].join('')
        : '',
      canonicalIdentityLinked && copyDecisionRequired
        ? [
          '  <div class="kc-admin-lgpd-danger">',
          `    <p>${copyPreference === 'need_guidance' ? 'O titular pediu orientação.' : 'Este ticket legado não registrou a preferência de cópia.'} Registre a decisão antes da etapa irreversível; a referência será armazenada somente como hash.</p>`,
          '    <label><span>Decisão após orientação</span><select data-lgpd-copy-decision><option value="">Selecione</option><option value="request_copy_first">Fornecer cópia antes de excluir</option><option value="no_copy_needed">Titular dispensou a cópia</option></select></label>',
          '    <label><span>Referência da orientação/decisão</span><input type="text" data-lgpd-copy-reference placeholder="Message-ID ou protocolo" autocomplete="off" /></label>',
          '    <label><span>Decisão registrada em</span><input type="datetime-local" data-lgpd-copy-at /></label>',
          '    <label><span><input type="checkbox" data-lgpd-copy-attested style="width:auto" /> Confirmo que a decisão do titular foi registrada</span></label>',
          '  </div>',
        ].join('')
        : '',
      canonicalIdentityLinked
        ? [
          '  <div class="kc-admin-lgpd-danger">',
      '    <label><span>Referência da resposta do titular</span><input type="text" data-lgpd-evidence-reference placeholder="Message-ID ou protocolo; será armazenado apenas como hash" autocomplete="off" /></label>',
      '    <label><span>Resposta recebida em</span><input type="datetime-local" data-lgpd-evidence-at /></label>',
      '    <label><span><input type="checkbox" data-lgpd-evidence-attested style="width:auto" /> Confirmo que validei a resposta no e-mail titular</span></label>',
      `    <label><span>Digite exatamente <code>${esc(expectedPhrase)}</code></span><input type="text" data-lgpd-confirmation placeholder="${esc(expectedPhrase)}" autocomplete="off" /></label>`,
      `    <button type="button" data-lgpd-action="erase_confirmed"${workflowActionDisabled ? ' disabled' : ''}><i class="fas fa-user-slash" aria-hidden="true"></i> Executar exclusão confirmada</button>`,
      '  </div>',
      '  <div class="kc-admin-lgpd-danger">',
      `    <label><span>Motivo do cancelamento</span><input type="text" data-lgpd-cancellation-reason placeholder="Motivo operacional; será armazenado apenas como hash" autocomplete="off" /></label>`,
      '  </div>',
        ].join('')
        : '',
      (canonicalIdentityLinked || (postCoreSurface && !finalReadOnly))
        ? [
          '  <div class="kc-admin-lgpd-danger">',
      `    <label><span>Operadores a revisar</span><input type="text" value="${esc(providerSummary)}" readonly /></label>`,
      providerOutcomeFields,
      '    <label><span>Referência da revisão dos operadores</span><input type="text" data-lgpd-provider-reference placeholder="Ticket ou registro; será armazenado apenas como hash" autocomplete="off" /></label>',
      '    <label><span>Revisão concluída em</span><input type="datetime-local" data-lgpd-provider-at /></label>',
      '    <label><span><input type="checkbox" data-lgpd-provider-attested style="width:auto" /> Confirmo que concluí a exclusão ou documentei a retenção em cada operador listado</span></label>',
      `    <button type="button" data-lgpd-action="retry_finalize"${retryActionDisabled ? ' disabled' : ''}><i class="fas fa-list-check" aria-hidden="true"></i> Finalizar operadores e recibo</button>`,
      '  </div>',
      '  <div class="kc-admin-lgpd-danger">',
      '    <p>Se o SMTP falhar, clique novamente em “Finalizar operadores e recibo” para reenvio automático pelo destinatário cifrado. Preencha os campos abaixo somente se a entrega ocorreu manualmente.</p>',
      '    <label><span>Referência do envio manual do comprovante final</span><input type="text" data-lgpd-completion-reference placeholder="Somente para entrega manual já realizada" autocomplete="off" /></label>',
      '    <label><span>Comprovante final entregue em</span><input type="datetime-local" data-lgpd-completion-at /></label>',
      '    <label><span><input type="checkbox" data-lgpd-completion-attested style="width:auto" /> Confirmo que o comprovante final foi entregue manualmente ao titular</span></label>',
      '  </div>',
        ].join('')
        : '',
      '</section>',
    ].join('');
  }

  function buildPaginationCard() {
    const totalCount = Math.max(0, toFiniteNumber(state.pagination.totalCount, state.rows.length));
    const loadedCount = Array.isArray(state.rows) ? state.rows.length : 0;
    if (!totalCount && !loadedCount) return '';

    const helperText = state.pagination.hasMore
      ? 'Filtros aplicados no servidor. Carregue a próxima página para continuar.'
      : 'Todos os resultados disponíveis para os filtros atuais já foram carregados.';
    const buttonHtml = state.pagination.hasMore
      ? [
        '<button',
        ' type="button"',
        ' data-help-load-more',
        state.pagination.isLoadingMore ? ' disabled aria-busy="true"' : '',
        ' style="padding:10px 14px;border-radius:12px;border:1px solid var(--kc-border-dark);background:var(--kc-background-dark);color:var(--kc-text-dark-primary);font:inherit;cursor:pointer;"',
        '>',
        state.pagination.isLoadingMore
          ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Carregando...'
          : '<i class="fas fa-arrow-down" aria-hidden="true"></i> Carregar mais',
        '</button>',
      ].join('')
      : '';

    return [
      '<article class="kc-admin-help-card" data-help-pagination>',
      '  <div class="kc-admin-help-card-top">',
      `    <div><h2>${esc(`${loadedCount} de ${totalCount} pedidos exibidos`)}</h2><p>${esc(helperText)}</p></div>`,
      `    <div class="kc-admin-help-chips">${buttonHtml}</div>`,
      '  </div>',
      '</article>',
    ].join('');
  }

  function buildStatusTriageChips(currentStatus, options = {}) {
    const closeLocked = options.closeLocked === true;
    const closeLockReason = String(options.closeLockReason || '').trim()
      || 'Resolvido/Arquivado bloqueado enquanto o protocolo LGPD de cópia/portabilidade estiver aberto.';
    const statusOptions = [
      { value: 'new', label: 'Novo', icon: 'fa-inbox' },
      { value: 'triaged', label: 'Triado', icon: 'fa-filter' },
      { value: 'in_progress', label: 'Em andamento', icon: 'fa-spinner' },
      { value: 'resolved', label: 'Resolvido', icon: 'fa-circle-check' },
      { value: 'archived', label: 'Arquivado', icon: 'fa-box-archive' },
    ];
    return statusOptions.map((option) => {
      const active = option.value === currentStatus;
      const isCloseStatus = option.value === 'resolved' || option.value === 'archived';
      const locked = closeLocked && isCloseStatus && !active;
      return [
        `<button type="button"`,
        ` class="kc-admin-help-chip kc-admin-help-chip--interactive kc-admin-help-chip--status-${esc(option.value)}${active ? ' is-active' : ''}${locked ? ' is-locked' : ''}"`,
        ` data-help-status-set="${esc(option.value)}"`,
        locked ? ' data-help-status-locked="1"' : '',
        ` aria-pressed="${active ? 'true' : 'false'}"`,
        locked ? ' aria-disabled="true" disabled' : '',
        ` title="${esc(locked ? closeLockReason : ('Definir status: ' + option.label))}">`,
        `<i class="fas ${option.icon}" aria-hidden="true"></i>${esc(option.label)}`,
        `</button>`,
      ].join('');
    }).join('');
  }

  function buildHelpIdentityBlock(row) {
    const identity = getHelpTicketIdentity(row);
    if (!identity.id) return '';
    const lines = [
      `<div class="kc-admin-help-identity" data-help-identity>`,
      '  <div class="kc-admin-help-identity__row">',
      '    <strong>ID do ticket</strong>',
      '    <span class="kc-admin-help-identity__value">',
      `      <code title="Identificador único do pedido de ajuda">${esc(identity.id)}</code>`,
      `      <button type="button" class="kc-admin-help-copy" data-help-copy="${esc(identity.id)}" title="Copiar ID do ticket" aria-label="Copiar ID do ticket">`,
      '        <i class="fas fa-copy" aria-hidden="true"></i> Copiar',
      '      </button>',
      '    </span>',
      '  </div>',
    ];
    if (identity.shortId) {
      lines.push(
        '  <div class="kc-admin-help-identity__row">',
        '    <strong>ID curto</strong>',
        `    <span class="kc-admin-help-identity__value"><code>${esc(identity.shortId)}</code></span>`,
        '  </div>'
      );
    }
    if (identity.userId) {
      lines.push(
        '  <div class="kc-admin-help-identity__row">',
        '    <strong>User ID (titular)</strong>',
        '    <span class="kc-admin-help-identity__value">',
        `      <code title="UUID da conta vinculada">${esc(identity.userId)}</code>`,
        `      <button type="button" class="kc-admin-help-copy" data-help-copy="${esc(identity.userId)}" title="Copiar user id" aria-label="Copiar user id do titular">`,
        '        <i class="fas fa-copy" aria-hidden="true"></i> Copiar',
        '      </button>',
        '    </span>',
        '  </div>'
      );
    }
    if (identity.dsrId) {
      lines.push(
        '  <div class="kc-admin-help-identity__row">',
        '    <strong>ID do protocolo DSR</strong>',
        '    <span class="kc-admin-help-identity__value">',
        `      <code title="data_subject_request_id">${esc(identity.dsrId)}</code>`,
        `      <button type="button" class="kc-admin-help-copy" data-help-copy="${esc(identity.dsrId)}" title="Copiar ID do DSR" aria-label="Copiar ID do protocolo DSR">`,
        '        <i class="fas fa-copy" aria-hidden="true"></i> Copiar',
        '      </button>',
        '    </span>',
        '  </div>'
      );
    }
    if (identity.protocol) {
      lines.push(
        '  <div class="kc-admin-help-identity__row">',
        '    <strong>Protocolo (código)</strong>',
        '    <span class="kc-admin-help-identity__value">',
        `      <code>${esc(identity.protocol)}</code>`,
        `      <button type="button" class="kc-admin-help-copy" data-help-copy="${esc(identity.protocol)}" title="Copiar protocolo" aria-label="Copiar código do protocolo">`,
        '        <i class="fas fa-copy" aria-hidden="true"></i> Copiar',
        '      </button>',
        '    </span>',
        '  </div>'
      );
    }
    if (identity.artifactRef) {
      lines.push(
        '  <div class="kc-admin-help-identity__row">',
        '    <strong>Artefato de exportação</strong>',
        '    <span class="kc-admin-help-identity__value">',
        `      <code>${esc(identity.artifactRef)}</code>`,
        `      <button type="button" class="kc-admin-help-copy" data-help-copy="${esc(identity.artifactRef)}" title="Copiar referência do artefato" aria-label="Copiar referência do artefato">`,
        '        <i class="fas fa-copy" aria-hidden="true"></i> Copiar',
        '      </button>',
        '    </span>',
        '  </div>'
      );
    }
    lines.push('</div>');
    return lines.join('');
  }

  function buildPriorityTriageChips(currentPriority) {
    const options = [
      { value: 'low', label: 'Baixa', icon: 'fa-battery-quarter' },
      { value: 'normal', label: 'Normal', icon: 'fa-battery-half' },
      { value: 'high', label: 'Alta', icon: 'fa-battery-three-quarters' },
      { value: 'urgent', label: 'Urgente', icon: 'fa-bolt' },
    ];
    return options.map((option) => {
      const active = option.value === currentPriority;
      return [
        `<button type="button"`,
        ` class="kc-admin-help-chip kc-admin-help-chip--interactive kc-admin-help-chip--priority-${esc(option.value)}${active ? ' is-active' : ''}"`,
        ` data-help-priority-set="${esc(option.value)}"`,
        ` aria-pressed="${active ? 'true' : 'false'}"`,
        ` title="Definir urgência: ${esc(option.label)}">`,
        `<i class="fas ${option.icon}" aria-hidden="true"></i>${esc(option.label)}`,
        `</button>`,
      ].join('');
    }).join('');
  }

  function renderRows(rows) {
    const list = $('#helpRequestsList');
    if (!list) return;
    // Snapshot operator-typed fields before innerHTML wipe.
    try { captureAllVisibleCardDrafts(); } catch (_) { /* ignore */ }
    if (!state.isAuthorized) {
      list.replaceChildren();
      return;
    }

    if (!Array.isArray(rows) || !rows.length) {
      renderEmpty();
      return;
    }

    const cards = rows.map((row) => {
      const typeLabel = buildLabel(Help.HELP_TYPE_LABELS, row.type, row.type);
      const topicLabel = buildLabel(Help.HELP_TOPIC_LABELS, row.topic, row.topic);
      const priorityLabel = buildLabel(Help.HELP_PRIORITY_LABELS, row.priority, row.priority);
      const statusLabel = buildLabel(Help.HELP_STATUS_LABELS, row.status, row.status);
      const subtopicLabel = buildSubtopicLabel(row);
      const pagePath = String((row && row.page_path) || '').trim() || 'Não informado';
      const subject = String(row.subject || '').trim() || 'Sem assunto';
      const message = String(row.message || '').trim() || 'Sem descrição';
      const contactEmail = String(row.contact_email || '').trim() || 'Sem e-mail';
      const metadataChips = buildMetadataChips(row);
      const metadataSummary = buildMetadataSummary(row);
      const queueAge = getQueueAge(row);
      const queueAgeChip = queueAge
        ? `<span class="kc-admin-help-chip kc-admin-help-chip--age-${esc(queueAge.level)}"><i class="fas fa-hourglass-half" aria-hidden="true"></i>${esc(queueAge.label)}</span>`
        : '';
      const statusValue = String(row.status || 'new').trim() || 'new';
      const priorityValue = String(row.priority || 'normal').trim() || 'normal';
      const identity = getHelpTicketIdentity(row);
      const exportCloseLocked = isOpenDataExportHelpRequest(row);
      const erasureCloseGuard = getErasureCloseGuard(row);
      const closeLocked = exportCloseLocked || erasureCloseGuard.locked;
      const closeLockReason = exportCloseLocked
        ? 'Bloqueado: protocolo DSR de cópia/portabilidade ainda aberto (DSR_HELP_MUST_REMAIN_OPEN). Conclua, cancele ou aguarde expirar o protocolo no painel de complemento integral.'
        : erasureCloseGuard.reason;
      const triageHintDefault = closeLocked
        ? closeLockReason
        : (triageSavedHintFor(row.id) || 'Clique em um chip para salvar a triagem automaticamente.');

      return [
        `<article class="kc-admin-help-card" data-help-id="${esc(row.id)}" data-help-current-status="${esc(statusValue)}" data-help-current-priority="${esc(priorityValue)}"${exportCloseLocked ? ' data-help-export-open="1"' : ''}>`,
        '  <div class="kc-admin-help-card-top">',
        '    <div>',
        `      <p class="kc-admin-help-ticket-ref" title="ID do ticket"><i class="fas fa-fingerprint" aria-hidden="true"></i> Ticket <code>${esc(identity.shortId || identity.id || '—')}</code>${identity.id ? ` <span class="kc-admin-help-ticket-ref__full">· ${esc(identity.id)}</span>` : ''}</p>`,
        `      <h2>${esc(subject)}</h2>`,
        `      <p>${esc(message)}</p>`,
        '    </div>',
        '    <div class="kc-admin-help-chips kc-admin-help-chips--readonly" aria-label="Classificação">',
        `      <span class="kc-admin-help-chip kc-admin-help-chip--status-${esc(statusValue)}" data-help-status-badge><i class="fas fa-circle" aria-hidden="true"></i><span data-help-status-label>${esc(statusLabel)}</span></span>`,
        `      <span class="kc-admin-help-chip kc-admin-help-chip--priority-${esc(priorityValue)}" data-help-priority-badge><i class="fas fa-bolt" aria-hidden="true"></i><span data-help-priority-label>${esc(priorityLabel)}</span></span>`,
        `      <span class="kc-admin-help-chip"><i class="fas fa-layer-group" aria-hidden="true"></i>${esc(typeLabel)}</span>`,
        queueAgeChip,
        metadataChips,
        '    </div>',
        '  </div>',
        buildHelpIdentityBlock(row),
        '  <div class="kc-admin-help-meta">',
        `    <div><strong>Tema</strong><span>${esc(topicLabel)}</span></div>`,
        `    <div><strong>Subtipo</strong><span>${esc(subtopicLabel)}</span></div>`,
        `    <div><strong>E-mail</strong><span>${esc(contactEmail)}</span></div>`,
        `    <div><strong>Página afetada</strong><span>${esc(pagePath)}</span></div>`,
        `    <div><strong>Criado em</strong><span>${esc(formatDateTime(row.created_at))}</span></div>`,
        `    <div><strong>Contato autorizado</strong><span>${row.allow_contact === false ? 'Não' : 'Sim'}</span></div>`,
        '  </div>',
        metadataSummary,
        buildExternalAccessPanel(row),
        buildOperationalActions(row),
        exportCloseLocked
          ? [
            '<p class="kc-admin-lgpd-warning" data-help-export-close-guard role="status">',
            '<strong>Fechamento bloqueado.</strong> ',
            'Este pedido tem protocolo DSR de cópia/portabilidade ainda aberto. ',
            'O banco recusa Resolvido/Arquivado (código <code>DSR_HELP_MUST_REMAIN_OPEN</code>) até o protocolo ser concluído, cancelado ou expirar. ',
            'Trabalhe no painel de complemento integral abaixo; depois feche o ticket.',
            '</p>',
          ].join('')
          : '',
        buildDataExportSupplementPanel(row),
        buildLgpdPanel(row),
        // Chip triage: click status/priority chips to auto-save (no separate save button).
        '  <div class="kc-admin-help-triage" data-help-triage>',
        '    <div class="kc-admin-help-triage-row" role="group" aria-label="Status do pedido">',
        '      <span class="kc-admin-help-triage-label"><i class="fas fa-flag" aria-hidden="true"></i> Status</span>',
        `      <div class="kc-admin-help-chips kc-admin-help-chips--triage">${buildStatusTriageChips(statusValue, {
          closeLocked: closeLocked,
          closeLockReason: closeLockReason,
        })}</div>`,
        '    </div>',
        '    <div class="kc-admin-help-triage-row" role="group" aria-label="Urgência do pedido">',
        '      <span class="kc-admin-help-triage-label"><i class="fas fa-bolt" aria-hidden="true"></i> Urgência</span>',
        `      <div class="kc-admin-help-chips kc-admin-help-chips--triage">${buildPriorityTriageChips(priorityValue)}</div>`,
        '    </div>',
        `    <p class="kc-admin-help-triage-hint" data-help-triage-status aria-live="polite">${esc(triageHintDefault)}</p>`,
        '  </div>',
        // Hidden fields keep draft restore / legacy selectors working.
        `  <input type="hidden" data-help-status value="${esc(statusValue)}" />`,
        `  <input type="hidden" data-help-priority value="${esc(priorityValue)}" />`,
        '</article>',
      ].join('');
    });

    cards.push(buildPaginationCard());
    list.innerHTML = cards.join('');
    // Re-apply drafts after full rebuild (diagnose, refresh, filters, leave/return).
    scheduleAdminDraftRestore();
  }

  function unwrapRowsResponse(result, requestedLimit, requestedOffset) {
    const rawRows = Array.isArray(result)
      ? result
      : (result && Array.isArray(result.rows) ? result.rows : []);
    const rows = rawRows
      .filter((row) => row && typeof row === 'object')
      .map((row) => row);

    const totalCountSource = Array.isArray(result) ? result.totalCount : result && result.totalCount;
    const limitSource = Array.isArray(result) ? result.limit : result && result.limit;
    const offsetSource = Array.isArray(result) ? result.offset : result && result.offset;
    const hasMoreSource = Array.isArray(result) ? result.hasMore : result && result.hasMore;
    const summarySource = Array.isArray(result) ? result.summary : result && result.summary;
    const totalCount = Math.max(rows.length, toFiniteNumber(totalCountSource, rows.length));
    const limit = Math.max(1, toFiniteNumber(limitSource, requestedLimit));
    const offset = Math.max(0, toFiniteNumber(offsetSource, requestedOffset));
    const hasMore = typeof hasMoreSource === 'boolean'
      ? hasMoreSource
      : (offset + rows.length) < totalCount;

    return {
      rows,
      totalCount,
      limit,
      offset,
      hasMore,
      summary: summarySource && typeof summarySource === 'object'
        ? { ...summarySource }
        : null,
    };
  }

  function mergeRows(currentRows, nextRows) {
    const merged = Array.isArray(currentRows) ? currentRows.slice() : [];
    const seen = new Set(merged.map((row) => String(row && row.id || '')).filter(Boolean));
    (Array.isArray(nextRows) ? nextRows : []).forEach((row) => {
      const key = String(row && row.id || '').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(row);
    });
    return merged;
  }

  async function loadHelpRequestById(helpRequestId, adminContext) {
    const id = String(helpRequestId || '').trim();
    if (!UUID_RE.test(id) || !isActiveAdminContext(adminContext)) return null;
    const result = await window.KCAPI.listAdminHelpRequests({
      requestId: id,
      limit: 1,
      offset: 0,
    });
    if (!isActiveAdminContext(adminContext)) return null;
    if (result && result.ok === false) {
      throw new Error(
        result.error && result.error.message
          ? String(result.error.message)
          : 'HELP_REQUEST_LOOKUP_UNAVAILABLE'
      );
    }
    const payload = unwrapRowsResponse(result, 1, 0);
    const row = payload.rows.find(
      (item) => String(item && item.id || '').trim() === id
    ) || null;
    if (!row) return null;
    const currentIndex = state.rows.findIndex(
      (item) => String(item && item.id || '').trim() === id
    );
    if (currentIndex >= 0) state.rows[currentIndex] = row;
    return row;
  }

  async function loadRows(options = {}) {
    const adminContext = captureAdminContext();
    if (!isActiveAdminContext(adminContext)) return;
    const append = options.append === true;
    const silent = options.silent === true;
    let loadFailed = false;
    const requestedLimit = Math.max(1, Math.min(100, toFiniteNumber(options.limit, state.pagination.limit || HELP_PAGE_SIZE)));
    const requestedOffset = append ? state.rows.length : Math.max(0, toFiniteNumber(options.offset, 0));
    const requestToken = state.requestToken + 1;
    state.requestToken = requestToken;

    if (!append) {
      hideError();
      // Silent refresh keeps #admin-content painted (leave/return soft reauth).
      showLoading(true, { silent: silent && state.rows.length > 0 });
      readFilters();
    } else {
      state.pagination.isLoadingMore = true;
      renderRows(state.rows);
    }

    try {
      const result = await window.KCAPI.listAdminHelpRequests({
        status: state.filters.status,
        type: state.filters.type,
        priority: state.filters.priority,
        query: state.filters.query,
        limit: requestedLimit,
        offset: requestedOffset,
      });

      if (requestToken !== state.requestToken || !isActiveAdminContext(adminContext)) return;
      if (result && result.ok === false) {
        throw new Error(
          result.error && result.error.message
            ? String(result.error.message)
            : 'HELP_REQUEST_LIST_UNAVAILABLE'
        );
      }

      const payload = unwrapRowsResponse(result, requestedLimit, requestedOffset);
      state.rows = append ? mergeRows(state.rows, payload.rows) : payload.rows;
      if (!append) {
        state.erasureUncertain = Object.create(null);
        state.exportSupplementUncertain = Object.create(null);
      }
      state.pagination.limit = payload.limit;
      state.pagination.totalCount = payload.totalCount;
      state.pagination.hasMore = payload.hasMore && state.rows.length < payload.totalCount;
      if (payload.summary) state.pagination.summary = payload.summary;
      else if (!append) state.pagination.summary = null;
      renderSummary(state.rows);
      // Single paint path: finally also renders on success. Avoid double
      // renderRows (capture/apply race that used to wipe drafts).
      try { saveAdminViewSnapshot(); } catch (_) { /* ignore */ }
    } catch (error) {
      if (requestToken !== state.requestToken || !isActiveAdminContext(adminContext)) return;
      loadFailed = true;
      console.error('[AdminHelp] load_failed');
      if (append) {
        showToast('Não foi possível carregar mais pedidos de ajuda.', 'error');
        renderRows(state.rows);
      } else {
        showError('Não foi possível carregar os pedidos de ajuda.');
        if (state.rows.length) renderRows(state.rows);
        else renderUnavailable();
      }
    } finally {
      if (requestToken !== state.requestToken || !isActiveAdminContext(adminContext)) return;
      state.pagination.isLoadingMore = false;
      if (!append) showLoading(false, { silent: silent && state.rows.length > 0 });
      if (!loadFailed) renderRows(state.rows);
      if (!loadFailed) {
        try { saveAdminViewSnapshot(); } catch (_) { /* ignore */ }
      }
    }
  }

  function readCardTriageValues(card) {
    const statusHidden = card && card.querySelector('[data-help-status]');
    const priorityHidden = card && card.querySelector('[data-help-priority]');
    return {
      status: String(
        (statusHidden && statusHidden.value)
        || (card && card.getAttribute('data-help-current-status'))
        || ''
      ).trim(),
      priority: String(
        (priorityHidden && priorityHidden.value)
        || (card && card.getAttribute('data-help-current-priority'))
        || ''
      ).trim(),
    };
  }

  function cardMatchesActiveTriageFilters(status, priority) {
    const statusFilter = String(state.filters.status || 'all').trim() || 'all';
    const priorityFilter = String(state.filters.priority || 'all').trim() || 'all';
    const statusValue = String(status || '').trim();
    const priorityValue = String(priority || '').trim();
    if (statusFilter !== 'all' && statusFilter !== statusValue) return false;
    if (priorityFilter !== 'all' && priorityFilter !== priorityValue) return false;
    return true;
  }

  function setCardTriageUi(card, status, priority, options = {}) {
    if (!card) return;
    const saving = options.saving === true;
    const statusValue = String(status || '').trim();
    const priorityValue = String(priority || '').trim();
    card.setAttribute('data-help-current-status', statusValue);
    card.setAttribute('data-help-current-priority', priorityValue);
    const statusHidden = card.querySelector('[data-help-status]');
    const priorityHidden = card.querySelector('[data-help-priority]');
    if (statusHidden) statusHidden.value = statusValue;
    if (priorityHidden) priorityHidden.value = priorityValue;

    card.querySelectorAll('[data-help-status-set]').forEach((button) => {
      const active = button.getAttribute('data-help-status-set') === statusValue;
      const locked = button.getAttribute('data-help-status-locked') === '1';
      const disabled = saving || locked;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.disabled = disabled;
      button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    });
    card.querySelectorAll('[data-help-priority-set]').forEach((button) => {
      const active = button.getAttribute('data-help-priority-set') === priorityValue;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.disabled = saving;
      button.setAttribute('aria-disabled', saving ? 'true' : 'false');
    });

    const statusBadge = card.querySelector('[data-help-status-badge]');
    const priorityBadge = card.querySelector('[data-help-priority-badge]');
    if (statusBadge) {
      statusBadge.className = `kc-admin-help-chip kc-admin-help-chip--status-${statusValue}`;
      const label = statusBadge.querySelector('[data-help-status-label]');
      if (label) label.textContent = buildLabel(Help.HELP_STATUS_LABELS, statusValue, statusValue);
    }
    if (priorityBadge) {
      priorityBadge.className = `kc-admin-help-chip kc-admin-help-chip--priority-${priorityValue}`;
      const label = priorityBadge.querySelector('[data-help-priority-label]');
      if (label) label.textContent = buildLabel(Help.HELP_PRIORITY_LABELS, priorityValue, priorityValue);
    }

    const hint = card.querySelector('[data-help-triage-status]');
    if (hint) {
      let message = '';
      if (typeof options.statusMessage === 'string' && options.statusMessage) {
        message = options.statusMessage;
      } else if (saving) {
        message = 'Salvando triagem…';
      } else {
        message = triageSavedHintFor(card.getAttribute('data-help-id'))
          || 'Clique em um chip para salvar a triagem automaticamente.';
      }
      hint.textContent = message;
      hint.classList.toggle(
        'is-success',
        !saving && message.indexOf('Triagem salva') === 0
      );
    }
    card.classList.toggle('is-triage-saving', saving);
  }

  async function saveRow(card, overrides = {}) {
    const adminContext = captureAdminContext();
    if (!isActiveAdminContext(adminContext)) return false;
    const id = String(card && card.getAttribute('data-help-id') || '').trim();
    if (!id) return false;
    // Serialize chip clicks per card so rapid changes do not race the API.
    if (card.classList.contains('is-triage-saving') || state.triageBusy[id] === true) {
      return false;
    }

    const current = readCardTriageValues(card);
    const status = String(overrides.status != null ? overrides.status : current.status).trim();
    const priority = String(overrides.priority != null ? overrides.priority : current.priority).trim();
    const previous = {
      status: current.status,
      priority: current.priority,
    };
    const validStatuses = getValidStatuses();
    const validPriorities = getValidPriorities();
    if (validStatuses.indexOf(status) < 0) {
      showToast('Status inválido para triagem.', 'error');
      return false;
    }
    if (validPriorities.indexOf(priority) < 0) {
      showToast('Urgência inválida para triagem.', 'error');
      return false;
    }
    if (status === previous.status && priority === previous.priority) {
      return true;
    }

    // Soft/hard guards before API: open data-export DSR cannot close (DB enforce).
    // Erasure tickets remain open until authoritative state also proves delivery.
    if (status === 'resolved' || status === 'archived') {
      const row = (Array.isArray(state.rows) ? state.rows : []).find(
        (item) => String(item && item.id || '').trim() === id
      );
      if (row && isOpenDataExportHelpRequest(row)) {
        setCardTriageUi(card, previous.status, previous.priority, {
          statusMessage: 'Fechamento bloqueado: DSR de cópia/portabilidade ainda aberto.',
        });
        showToast(friendlyTriageErrorMessage({ message: 'DSR_HELP_MUST_REMAIN_OPEN' }), 'warn', 5600);
        return false;
      }
      if (row && isLgpdErasureRequest(row)) {
        const erasure = state.erasureResults[id] || null;
        const completionState = getErasureCompletionState(row, erasure);
        const erasureStatus = completionState.status;
        const safeToClose = completionState.flowComplete
          || completionState.cancelled;
        if (!safeToClose) {
          const label = erasureStatus
            ? (LGPD_STATUS_LABELS[erasureStatus] || erasureStatus)
            : completionState.coreErased
              ? 'núcleo excluído, entrega final pendente'
              : 'fluxo LGPD ainda não finalizado';
          setCardTriageUi(card, previous.status, previous.priority, {
            statusMessage: 'Fechamento bloqueado: conclua o fluxo LGPD e a entrega final.',
          });
          showToast(
            `Fechamento bloqueado (${label}). Carregue o estado seguro e confirme a entrega do comprovante final, ou registre o cancelamento formal.`,
            'warn',
            6200
          );
          return false;
        }
      }
    }

    state.triageBusy[id] = true;
    // Optimistic chip feedback before await; revert on failure / deny.
    setCardTriageUi(card, status, priority, { saving: true });

    try {
      const access = await checkAdminAccess(adminContext);
      if (!access || !isActiveAdminContext(adminContext)) {
        setCardTriageUi(card, previous.status, previous.priority);
        return false;
      }

      const currentRow = state.rows.find(
        (item) => String(item && item.id || '').trim() === id
      );
      const result = await window.KCAPI.updateAdminHelpRequest(id, {
        status,
        priority,
        expected_updated_at: currentRow && currentRow.updated_at
          ? String(currentRow.updated_at)
          : null,
      });
      if (!isActiveAdminContext(adminContext)) return false;
      if (!result || result.ok === false) {
        setCardTriageUi(card, previous.status, previous.priority);
        const resultCode = String(
          result && result.error && (result.error.code || result.error.message) || ''
        ).toUpperCase();
        showToast(
          friendlyTriageErrorMessage(result && result.error) || 'Não foi possível salvar a triagem.',
          'error',
          5200
        );
        if (resultCode.indexOf('HELP_REQUEST_STALE') >= 0) {
          await loadRows({
            silent: true,
            limit: Math.max(state.pagination.limit, state.rows.length || HELP_PAGE_SIZE),
          });
        }
        return false;
      }

      const rowIndex = state.rows.findIndex(
        (item) => String(item && item.id || '').trim() === id
      );
      if (rowIndex >= 0) {
        state.rows[rowIndex] = Object.assign({}, state.rows[rowIndex], result.data || {}, {
          status: status,
          priority: priority,
        });
      }
      state.triageJustSaved[id] = Date.now();
      const stillInFilter = cardMatchesActiveTriageFilters(status, priority);
      // Chip auto-save is high-frequency: no success toast (inline hint only).
      // Errors/warns still toast. Leaving the active filter is self-evident when
      // the card disappears after the quiet local/server reconcile below.
      setCardTriageUi(card, status, priority, {
        saving: false,
        statusMessage: stillInFilter
          ? 'Triagem salva.'
          : 'Triagem salva. Este pedido saiu do filtro atual…',
      });
      // Drop triage draft keys so the next paint uses server status/priority;
      // keep LGPD/export identity drafts intact.
      try {
        const store = adminDraftStorageRead();
        const ticketDraft = store.tickets && store.tickets[id];
        if (ticketDraft && ticketDraft.fields) {
          delete ticketDraft.fields['data-help-status'];
          delete ticketDraft.fields['data-help-priority'];
          if (adminDraftDirty[id]) {
            delete adminDraftDirty[id]['data-help-status'];
            delete adminDraftDirty[id]['data-help-priority'];
          }
          adminDraftStorageWrite(store);
        }
      } catch (_) { /* ignore */ }
      try { saveAdminViewSnapshot(); } catch (_) { /* ignore */ }

      if (stillInFilter) {
        // Stay in queue: local paint is enough; avoid list flicker + toast spam.
        renderSummary(state.rows);
        return true;
      }

      // Left filter: soft-remove optimistically, then silent reconcile.
      if (card && card.isConnected) {
        card.classList.add('is-triage-leaving');
      }
      state.rows = (Array.isArray(state.rows) ? state.rows : []).filter(
        (item) => String(item && item.id || '').trim() !== id
      );
      if (state.pagination.totalCount > 0) {
        state.pagination.totalCount = Math.max(0, state.pagination.totalCount - 1);
      }
      // Brief pause so the inline hint is readable before the card unmounts.
      await new Promise(function (resolve) {
        window.setTimeout(resolve, 420);
      });
      if (!isActiveAdminContext(adminContext)) return false;
      renderRows(state.rows);
      renderSummary(state.rows);
      await loadRows({
        silent: true,
        limit: Math.max(state.pagination.limit, state.rows.length || HELP_PAGE_SIZE),
      });
      return true;
    } catch (error) {
      if (!isActiveAdminContext(adminContext)) return false;
      console.error('[AdminHelp] save_failed');
      setCardTriageUi(card, previous.status, previous.priority);
      showToast('Não foi possível salvar a triagem.', 'error');
      return false;
    } finally {
      delete state.triageBusy[id];
      if (card && card.isConnected && isActiveAdminContext(adminContext)) {
        card.classList.remove('is-triage-saving');
        card.querySelectorAll('[data-help-status-set],[data-help-priority-set]').forEach((button) => {
          const disabled = button.getAttribute('data-help-status-locked') === '1';
          button.disabled = disabled;
          button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        });
      }
    }
  }

  function buildHelpExportReport() {
    const rows = Array.isArray(state.rows) ? state.rows : [];
    const statusCounts = rows.reduce((acc, row) => {
      const key = String(row && row.status || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const typeCounts = rows.reduce((acc, row) => {
      const key = String(row && row.type || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return {
      title: 'KinoCampus - Pedidos de ajuda Admin',
      subtitle: 'Solicitações filtradas, status, prioridade, origem e decisões operacionais',
      source: 'admin/help-requests.html',
      filters: {
        status: state.filters.status || 'all',
        tipo: state.filters.type || 'all',
        prioridade: state.filters.priority || 'all',
        busca: state.filters.query || '',
        total_filtrado: state.pagination.totalCount || rows.length,
      },
      kpis: {
        pedidos_carregados: rows.length,
        pedidos_filtrados_total: state.pagination.totalCount || rows.length,
        urgentes_na_tela: rows.filter((row) => row && row.priority === 'urgent').length,
        em_andamento: rows.filter((row) => row && row.status === 'in_progress').length,
        novos: rows.filter((row) => row && row.status === 'new').length,
      },
      sections: [
        {
          title: 'Resumo por status',
          rows: Object.keys(statusCounts).map((status) => ({ status, total: statusCounts[status] })),
        },
        {
          title: 'Resumo por categoria',
          rows: Object.keys(typeCounts).map((type) => ({
            categoria: buildLabel(Help.HELP_TYPE_LABELS, type, type),
            type_key: type,
            total: typeCounts[type],
          })),
        },
        {
          title: 'Pedidos filtrados',
          rows: rows.map((row) => {
            const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
            return {
              id: row.id,
              criado_em: formatDateTime(row.created_at),
              status: row.status || '',
              prioridade: row.priority || '',
              categoria: buildLabel(Help.HELP_TYPE_LABELS, row.type, row.type || ''),
              tema: row.topic || '',
              subtipo: buildSubtopicLabel(row),
              assunto: row.subject || row.title || '',
              pagina_origem: row.page_path || metadata.page_path || '',
              modulo_afetado: metadata.affected_module || '',
              contato_autorizado: row.allow_contact === false ? 'Não' : 'Sim',
              email_contato: row.contact_email || '',
            };
          }),
        },
      ],
    };
  }

  async function handleHelpExport(kind) {
    const adminContext = captureAdminContext();
    if (!isActiveAdminContext(adminContext)) return;
    if (!window.KCAdminExport) {
      showToast('Exportador admin indisponível.', 'error');
      return;
    }
    const access = await checkAdminAccess(adminContext);
    if (!access || !isActiveAdminContext(adminContext)) return;
    const date = new Date().toISOString().slice(0, 10);
    const report = buildHelpExportReport();
    if (kind === 'pdf') {
      await window.KCAdminExport.exportReportPDF('kc-admin-ajuda-' + date + '.pdf', report);
    } else {
      await window.KCAdminExport.exportReportXLSX('kc-admin-ajuda-' + date + '.xlsx', report);
    }
  }

  function buildLgpdExportReport(row) {
    const result = state.erasureResults[String(row && row.id || '')] || {};
    const diagnostics = result.diagnostics || {};
    const counts = diagnostics.counts && typeof diagnostics.counts === 'object' ? diagnostics.counts : {};
    const request = result.request || {};
    const receipt = result.receipt || request.receipt || {};
    const metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const requestMetadata = request && request.metadata && typeof request.metadata === 'object' ? request.metadata : {};
    const target = result.target || {};
    const completionState = getErasureCompletionState(row, result);
    const countLabels = {
      profiles: 'Perfil cadastral',
      posts: 'Publicações',
      post_media: 'Mídias de publicações',
      comments: 'Comentários',
      comment_likes: 'Curtidas em comentários',
      post_votes: 'Votos realizados',
      saved_posts: 'Publicações salvas',
      reports: 'Denúncias registradas',
      post_view_events: 'Visualizações vinculadas',
      search_queries: 'Buscas vinculadas',
      home_category_affinity: 'Afinidade da página inicial',
      search_preferences: 'Preferências de busca',
      help_requests: 'Pedidos de ajuda',
      chat_conversations: 'Conversas',
      chat_messages: 'Mensagens',
      chat_messages_third_party: 'Mensagens de terceiros em conversas compartilhadas',
      chat_read_state: 'Estado de leitura do chat',
      chat_reactions: 'Reações no chat',
      notifications: 'Notificações',
      notification_preferences: 'Preferências de notificação',
      notification_channel_targets: 'Destinos privados de notificação',
      notification_delivery_outbox: 'Fila de entrega',
      notification_delivery_attempts: 'Tentativas de entrega',
      privacy_analytics_events: 'Eventos opcionais de analytics',
      privacy_consent_events: 'Histórico de consentimento',
      user_legal_acceptances: 'Aceites legais',
      user_blocks: 'Bloqueios',
      user_ratings: 'Avaliações',
      kc_invited_emails: 'Convites por e-mail',
      audit_log_actor: 'Eventos de auditoria',
    };
    const statusLabels = {
      confirmed: 'Confirmação registrada',
      partial_failure: 'Execução parcial; revisão obrigatória',
      diagnosed: 'Diagnóstico preparado',
      pending_confirmation: 'Aguardando confirmação do titular',
      reversible_applied: 'Ocultação reversível aplicada',
      erased: 'Exclusão confirmada executada',
      cancelled: 'Cancelado',
      failed: 'Falhou',
    };
    const postCoreMarker = getPostCoreErasureMarker(row);
    const status = request.status
      || (postCoreMarker ? 'erased' : '')
      || (result.action === 'diagnose' ? 'diagnosed' : '')
      || 'não iniciado';
    const hasDiagnostics = Boolean(
      (diagnostics && diagnostics.counts)
      || postCoreMarker
      || (receipt && receipt.counts)
    );
    const coreErasedAt = request.erased_at
      || receipt.erased_at
      || (postCoreMarker && postCoreMarker.erased_at)
      || '';
    const erasedAt = completionState.coreErased ? coreErasedAt : '';
    const confirmationRequestedAt = request.confirmation_requested_at || '';
    const userFoundKnown = Object.prototype.hasOwnProperty.call(target, 'user_found')
      || Boolean(postCoreMarker);
    const userFoundLabel = postCoreMarker
      ? 'Não'
      : userFoundKnown
        ? (target.user_found ? 'Sim' : 'Não')
        : (row && row.user_id ? 'Vinculado ao pedido; diagnóstico pendente' : 'Não verificado');
    const canCloseLabel = completionState.cancelled
      ? 'Sim, após revisar o cancelamento formal'
      : completionState.flowComplete
        ? 'Sim, após revisar e exportar o recibo interno'
        : completionState.coreErased
          ? 'Não. Núcleo excluído, mas entrega do comprovante final ainda não comprovada.'
      : status === 'pending_confirmation' || status === 'reversible_applied'
        ? 'Não. Aguardar confirmação final do titular por e-mail.'
        : hasDiagnostics
          ? 'Não. Fluxo ainda sem confirmação final.'
          : 'Não. Prepare o diagnóstico antes de concluir.';
    const dataDeletedLabel = erasedAt ? 'Sim' : 'Não';
    const warnings = []
      .concat(Array.isArray(result.warnings) ? result.warnings : [])
      .concat(Array.isArray(diagnostics.warnings) ? diagnostics.warnings : [])
      .concat(Array.isArray(requestMetadata.warnings) ? requestMetadata.warnings : [])
      .filter(Boolean);
    if (!hasDiagnostics) warnings.push('Diagnóstico ainda não executado ou não carregado no painel.');
    if (!erasedAt) warnings.push('Exclusão definitiva ainda não executada.');
    if (completionState.coreErased && !completionState.flowComplete) {
      warnings.push('O núcleo foi excluído, mas o caso permanece aberto até a entrega final ser comprovada.');
    }
    if (postCoreMarker) {
      warnings.push('Ticket retido em forma minimizada (hash/protocolo/datas) para evidência e comparativo antes/depois.');
    }
    const effectiveCounts = diagnostics.counts && typeof diagnostics.counts === 'object'
      ? diagnostics.counts
      : (receipt.counts && typeof receipt.counts === 'object' ? receipt.counts : {});
    const countsRows = Object.keys(countLabels).map((key) => ({
      categoria: countLabels[key],
      chave_tecnica: key,
      quantidade: hasDiagnostics || postCoreMarker
        ? (Number(effectiveCounts[key]) || 0)
        : 'A verificar',
      tratamento_previsto: key === 'posts' || key === 'post_media'
        ? 'Ocultar e anonimizar/remover conforme confirmação'
        : key === 'privacy_analytics_events' || key === 'privacy_consent_events'
          ? 'Manter apenas o mínimo agregado ou anonimizado quando aplicável'
          : 'Eliminar, anonimizar ou reter minimamente conforme hipótese legal',
    }));
    const steps = [
      {
        etapa: '1. Vínculo de identidade (Help + protocolo DSR)',
        status: hasCanonicalErasureLink(row) || postCoreMarker ? 'Confirmado' : 'Pendente / anônimo',
        detalhe: 'Confere titular UUID, protocolo KC-DSR e, se anônimo, o vínculo administrativo auditado.',
      },
      {
        etapa: '2. Diagnóstico de dados',
        status: diagnostics && diagnostics.counts || postCoreMarker ? 'Preparado' : 'Pendente',
        detalhe: 'Levanta perfil, publicações, mídias, comentários, votos, salvos, mensagens, consentimentos e analytics vinculados.',
      },
      {
        etapa: '3. Ocultação reversível',
        status: request.reversible_applied_at || postCoreMarker ? 'Aplicada' : 'Pendente',
        detalhe: 'Remove visibilidade pública enquanto aguarda confirmação final do titular.',
      },
      {
        etapa: '4. Confirmação do titular',
        status: request.confirmed_at || postCoreMarker ? 'Confirmada' : 'Aguardando resposta',
        detalhe: 'Exige resposta por e-mail (frase de confirmação) antes da eliminação irreversível.',
      },
      {
        etapa: '5. Exclusão/anonimização final',
        status: request.erased_at || receipt.erased_at || postCoreMarker ? 'Executada' : 'Pendente',
        detalhe: 'Executa limpeza de Auth, dados cadastrais, mídias e vínculos pessoais quando confirmado.',
      },
      {
        etapa: '6. Entrega do comprovante final',
        status: completionState.flowComplete
          ? 'Comprovada'
          : completionState.notificationPending
            ? 'Pendente'
            : 'Não comprovada',
        detalhe: 'Exige aceite SMTP consolidado ou evidência manual por canal verificado.',
      },
      {
        etapa: '7. Fechamento do pedido de ajuda',
        status: ['resolved', 'archived'].includes(String(row && row.status || ''))
          ? 'Fechado'
          : 'Aberto',
        detalhe: 'Só feche após fluxo integral concluído (ou cancelamento formal) e revisão do relatório LGPD.',
      },
    ];
    const subjectHash = target.subject_hash
      || target.email_hash
      || request.email_hash
      || receipt.subject_hash
      || receipt.email_hash
      || (postCoreMarker && postCoreMarker.subject_hash)
      || '';
    return {
      title: 'KinoCampus - Relatório LGPD',
      subtitle: 'Solicitação de remoção de conta e dados cadastrais',
      source: 'admin/help-requests.html',
      filters: {
        pedido_de_ajuda: row && row.id || '',
        status_do_pedido: row && row.status || '',
        status_lgpd: statusLabels[status] || status,
        dominio_do_e_mail: request.target_email_domain || 'Não informado',
        identificador_pseudonimo_do_titular: subjectHash,
        protocolo: receipt.protocol
          || metadata.protocol
          || (postCoreMarker && postCoreMarker.protocol)
          || result.protocol
          || '',
      },
      kpis: {
        auth: userFoundKnown ? (postCoreMarker ? 'Não encontrado' : (target.user_found ? 'Encontrado' : 'Não encontrado')) : 'Pendente',
        status_final: dataDeletedLabel === 'Sim' ? 'Executado' : 'Pendente',
        fechamento: completionState.flowComplete || completionState.cancelled
          ? 'Pode fechar'
          : 'Não fechar',
        publicacoes: hasDiagnostics || postCoreMarker ? (effectiveCounts.posts || 0) : 'A verificar',
        midias: hasDiagnostics || postCoreMarker ? (effectiveCounts.post_media || 0) : 'A verificar',
        pedidos_de_ajuda: hasDiagnostics || postCoreMarker ? (effectiveCounts.help_requests || 0) : 'A verificar',
      },
      sections: [
        {
          title: 'Dados da solicitação',
          pdfColumns: [{ key: 'campo', width: 1 }, { key: 'valor', width: 2.2 }],
          xlsxColumns: ['campo', 'valor'],
          rows: [{
            campo: 'Pedido de ajuda',
            valor: row && row.id || '',
          }, {
            campo: 'Criado em',
            valor: formatDateTime(row && row.created_at),
          }, {
            campo: 'Status do pedido',
            valor: row && row.status || '',
          }, {
            campo: 'Prioridade',
            valor: row && row.priority || '',
          }, {
            campo: 'Tipo',
            valor: buildLabel(Help.HELP_TYPE_LABELS, row && row.type, row && row.type || ''),
          }],
        },
        {
          title: 'Status administrativo atual',
          note: 'Esta seção evita conclusão indevida: o núcleo excluído não encerra sozinho o caso. A entrega do comprovante final também deve estar confirmada, salvo cancelamento formal.',
          pdfColumns: [{ key: 'campo', width: 1 }, { key: 'valor', width: 2.2 }],
          xlsxColumns: ['campo', 'valor'],
          rows: [{
            campo: 'Usuário localizado no Auth',
            valor: userFoundLabel,
          }, {
            campo: 'Dados definitivamente excluídos',
            valor: dataDeletedLabel,
          }, {
            campo: 'Comprovante final entregue',
            valor: completionState.flowComplete ? 'Sim' : 'Não',
          }, {
            campo: 'Pode fechar a solicitação agora?',
            valor: canCloseLabel,
          }, {
            campo: 'Próxima ação recomendada',
            valor: completionState.flowComplete
              ? 'Revisar e exportar o recibo antes de fechar o ticket.'
              : completionState.coreErased
                ? 'Concluir ou comprovar a entrega do e-mail final; não repetir a exclusão do núcleo.'
              : confirmationRequestedAt
                ? 'Aguardar resposta do titular com a frase de confirmação antes da exclusão definitiva.'
                : 'Executar “Ocultar conta e pedir confirmação” após validar o diagnóstico.',
          }],
        },
        {
          title: 'Diagnóstico de dados vinculados',
          pdfColumns: [
            { key: 'categoria', width: 1.2 },
            { key: 'quantidade', width: 0.7 },
            { key: 'tratamento_previsto', label: 'Tratamento', width: 2.2 },
          ],
          xlsxColumns: ['categoria', 'chave_tecnica', 'quantidade', 'tratamento_previsto'],
          maxPdfRows: 14,
          rows: countsRows,
        },
        {
          title: 'Andamento do fluxo LGPD',
          pdfColumns: [
            { key: 'etapa', width: 1.25 },
            { key: 'status', width: 0.8 },
            { key: 'detalhe', width: 2.1 },
          ],
          xlsxColumns: ['etapa', 'status', 'detalhe'],
          rows: steps,
        },
        {
          title: 'Recibo interno',
          pdfColumns: [{ key: 'campo', width: 1 }, { key: 'valor', width: 2.2 }],
          xlsxColumns: ['campo', 'valor'],
          rows: [{
            campo: 'Status LGPD',
            valor: statusLabels[status] || status,
          }, {
            campo: 'Confirmação solicitada em',
            valor: formatDateTime(confirmationRequestedAt),
          }, {
            campo: 'Ocultação reversível em',
            valor: formatDateTime(request.reversible_applied_at),
          }, {
            campo: 'Confirmado em',
            valor: formatDateTime(request.confirmed_at),
          }, {
            campo: 'Eliminado/anonimizado em',
            valor: formatDateTime(erasedAt),
          }, {
            campo: 'Entrega do comprovante final',
            valor: completionState.flowComplete
              ? `Comprovada (${completionState.completionEmailStatus})`
              : completionState.notificationPending
                ? 'Pendente'
                : 'Não comprovada',
          }, {
            campo: 'Identificador pseudônimo do titular',
            valor: subjectHash,
          }, {
            campo: 'Observações',
            valor: warnings.length ? warnings.join(' | ') : 'Sem avisos registrados.',
          }],
        },
        {
          title: 'Base legal e orientações',
          pdfColumns: [{ key: 'item', width: 1 }, { key: 'descricao', label: 'Descrição', width: 2.4 }],
          xlsxColumns: ['item', 'descricao'],
          rows: [{
            item: 'Direito solicitado',
            descricao: 'Eliminação de dados pessoais tratados com consentimento ou quando aplicável, nos termos do art. 18, VI, da LGPD.',
          }, {
            item: 'Confirmação obrigatória',
            descricao: 'A exclusão irreversível exige confirmação enviada pelo e-mail titular antes da execução final.',
          }, {
            item: 'Retenção mínima',
            descricao: 'Podem ser mantidos registros mínimos de auditoria, token opaco aleatório sem vínculo reversível com UUID/e-mail, datas, contagens e recibo interno para segurança e exercício regular de direitos.',
          }, {
            item: 'Publicações e conteúdo',
            descricao: 'Conteúdos vinculados ao titular devem ficar ocultos da comunidade e ser anonimizados ou removidos após confirmação final.',
          }],
        },
      ],
    };
  }

  async function exportLgpdReport(row) {
    const adminContext = captureAdminContext();
    if (!isActiveAdminContext(adminContext)) return;
    const id = String(row && row.id || '').trim();
    if (!id || !canProbeErasureWorkflow(row)) {
      showToast('Confirme primeiro o vínculo canônico do protocolo. Nenhum diagnóstico ou relatório foi gerado.', 'error');
      return;
    }
    if (!window.KCAdminExport) {
      showToast('Exportador admin indisponível.', 'error');
      return;
    }
    const access = await checkAdminAccess(adminContext);
    if (!access || !isActiveAdminContext(adminContext)) return;
    const currentRow = state.rows.find(
      (item) => String(item && item.id || '').trim() === id
    );
    if (!currentRow || !canProbeErasureWorkflow(currentRow)) {
      showToast('O vínculo do protocolo mudou durante a autorização. Atualize a fila antes de exportar.', 'error');
      return;
    }
    const targetEmail = getLgpdTargetEmail(currentRow);
    if (
      window.KCAPI
      && typeof window.KCAPI.processAccountErasure === 'function'
      && (!state.erasureResults[id] || !state.erasureResults[id].diagnostics)
    ) {
      const result = await window.KCAPI.processAccountErasure({
        action: 'diagnose',
        actionKey: 'diagnose',
        help_request_id: id,
        helpRequestId: id,
        target_email: targetEmail,
        targetEmail,
      });
      if (!isActiveAdminContext(adminContext)) return;
      if (result && result.ok !== false && result.diagnostics) {
        state.erasureResults[id] = result;
        renderRows(state.rows);
      } else {
        showToast(
          result && result.ok !== false
            ? 'O backend não retornou um diagnóstico autoritativo. Nenhum relatório foi gerado.'
            : friendlyLgpdErrorMessage(result && result.error),
          'error'
        );
        return;
      }
    }
    if (!isActiveAdminContext(adminContext)) return;
    const date = new Date().toISOString().slice(0, 10);
    await window.KCAdminExport.exportReportPDF(
      `kc-lgpd-${date}.pdf`,
      buildLgpdExportReport(currentRow)
    );
  }

  function readIsoDateTime(card, selector) {
    const raw = String(card.querySelector(selector)?.value || '').trim();
    if (!raw) return '';
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
  }

  function setFieldInvalid(card, selector, invalid) {
    const field = card && card.querySelector(selector);
    if (!field) return;
    if (invalid) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }

  function hasValidTimestamp(value) {
    return Number.isFinite(Date.parse(String(value || '')));
  }

  function isErasureMutationPostconditionConfirmed(action, row, result) {
    const request = result && result.request && typeof result.request === 'object'
      ? result.request
      : {};
    const metadata = request.metadata && typeof request.metadata === 'object'
      ? request.metadata
      : {};
    const status = String(request.status || '').trim();
    if (action === 'link_verified_identity') return hasCanonicalErasureLink(row);
    if (action === 'apply_reversible') {
      const emailStatus = String(
        metadata.confirmation_email_status
        || (metadata.confirmation_delivery && metadata.confirmation_delivery.status)
        || ''
      ).trim();
      // Accept either status machine progress or durable reversible timestamp.
      // A lagging diagnose projection (or split workflows) must not trap the UI
      // after the mutation already recorded reversible_applied_at / SMTP send.
      return Boolean(
        (
          hasValidTimestamp(request.reversible_applied_at)
          && ['reversible_applied', 'pending_confirmation', 'confirmed', 'partial_failure', 'erased'].includes(status)
        )
        || (
          hasValidTimestamp(request.reversible_applied_at)
          && (emailStatus === 'sent' || emailStatus === 'draft_only' || hasValidTimestamp(request.confirmation_requested_at))
        )
        || ['pending_confirmation', 'reversible_applied'].includes(status)
      );
    }
    if (action === 'record_confirmation_delivery') {
      const delivery = metadata.confirmation_delivery && typeof metadata.confirmation_delivery === 'object'
        ? metadata.confirmation_delivery
        : {};
      return Boolean(
        hasValidTimestamp(request.confirmation_requested_at)
        && ['sent_manual', 'sent'].includes(String(delivery.status || '').trim())
        && ['pending_confirmation', 'confirmed', 'partial_failure', 'erased'].includes(status)
      );
    }
    if (action === 'cancel_reversible') {
      return status === 'cancelled'
        && metadata.cancelled
        && typeof metadata.cancelled === 'object';
    }
    if (action === 'erase_confirmed') {
      return Boolean(
        metadata.auth_deleted === true
        || status === 'erased'
      );
    }
    if (action === 'retry_finalize') {
      return Boolean(
        status === 'erased'
        && metadata.notification_pending === false
        && metadata.retryable === false
        && !String(metadata.failure_stage || '').trim()
        && ['sent', 'sent_manual'].includes(
          String(metadata.completion_email_status || '').trim()
        )
      );
    }
    return false;
  }

  async function reconcileErasureMutation(id, action, adminContext) {
    let row = null;
    try {
      row = await loadHelpRequestById(id, adminContext);
    } catch (_) {
      return { known: false, committed: false, row: null, result: null };
    }
    if (!isActiveAdminContext(adminContext)) {
      return { known: false, committed: false, row: null, result: null };
    }
    if (action === 'link_verified_identity') {
      return {
        known: Boolean(row),
        committed: hasCanonicalErasureLink(row),
        row,
        result: null,
      };
    }
    if (!row) {
      return { known: false, committed: false, row: null, result: null };
    }
    let result = null;
    try {
      result = await window.KCAPI.processAccountErasure({
        action: 'diagnose',
        actionKey: 'diagnose',
        help_request_id: id,
        helpRequestId: id,
        target_email: getLgpdTargetEmail(row),
        targetEmail: getLgpdTargetEmail(row),
      });
    } catch (_) {
      return { known: false, committed: false, row, result: null };
    }
    if (!isActiveAdminContext(adminContext)) {
      return { known: false, committed: false, row: null, result: null };
    }
    if (!result || result.ok === false || !result.request) {
      return { known: false, committed: false, row, result };
    }
    state.erasureResults[id] = result;
    return {
      known: true,
      committed: isErasureMutationPostconditionConfirmed(action, row, result),
      row,
      result,
    };
  }

  function exportProcessorStoredStatus(outcome) {
    return String(outcome || '').trim() === 'no_account_data'
      ? 'no_account_data'
      : 'sanitized_disclosure';
  }

  function isExportMutationPostconditionConfirmed(
    action,
    row,
    result,
    payload,
    previousArtifactVersion
  ) {
    const artifact = result && result.artifact && typeof result.artifact === 'object'
      ? result.artifact
      : {};
    const artifactRef = String(
      artifact.artifact_ref || getHelpMetadata(row).export_artifact_ref || ''
    ).trim().toUpperCase();
    if (!EXPORT_ARTIFACT_REF_RE.test(artifactRef)) return false;
    if (action === 'link_verified_ticket') return hasCanonicalDataExportLink(row);
    if (action === 'record_processor') {
      const processor = String(payload && payload.processor || '').trim().toLowerCase();
      const expectedStatus = exportProcessorStoredStatus(payload && payload.outcome);
      const processors = Array.isArray(artifact.processors) ? artifact.processors : [];
      const version = Number(artifact.version);
      const versionAdvanced = Number.isFinite(previousArtifactVersion)
        ? version > previousArtifactVersion
        : Number.isInteger(version) && version > 0;
      return versionAdvanced && processors.some((entry) => (
        entry
        && String(entry.processor || '').trim().toLowerCase() === processor
        && String(entry.status || '').trim().toLowerCase() === expectedStatus
        && SHA256_RE.test(String(entry.evidence_sha256 || '').trim())
        && hasValidTimestamp(entry.resolved_at)
      ));
    }
    if (action === 'build' || action === 'retry') {
      return Boolean(
        String(artifact.status || '').trim().toLowerCase() === 'ready'
        && SHA256_RE.test(String(artifact.sha256 || '').trim())
        && Number(artifact.byte_size) > 0
        && hasValidTimestamp(artifact.ready_at)
        && Date.parse(String(artifact.expires_at || '')) > Date.now()
      );
    }
    if (action === 'purge') {
      return String(artifact.status || '').trim().toLowerCase() === 'purged';
    }
    return false;
  }

  async function reconcileExportMutation(
    id,
    action,
    payload,
    previousArtifactVersion,
    adminContext
  ) {
    let row = null;
    try {
      row = await loadHelpRequestById(id, adminContext);
    } catch (_) {
      return { known: false, committed: false, row: null, result: null };
    }
    if (!isActiveAdminContext(adminContext)) {
      return { known: false, committed: false, row: null, result: null };
    }
    if (action === 'link_verified_ticket') {
      return {
        known: Boolean(row),
        committed: hasCanonicalDataExportLink(row),
        row,
        result: null,
      };
    }
    if (!row) {
      return { known: false, committed: false, row: null, result: null };
    }
    const artifactRef = String(
      payload && payload.artifact_ref
      || getHelpMetadata(row).export_artifact_ref
      || ''
    ).trim().toUpperCase();
    let result = null;
    try {
      result = await window.KCAPI.processDataExportSupplement({
        action: 'diagnose',
        help_request_id: id,
        artifact_ref: artifactRef,
      });
    } catch (_) {
      return { known: false, committed: false, row, result: null };
    }
    if (!isActiveAdminContext(adminContext)) {
      return { known: false, committed: false, row: null, result: null };
    }
    if (!result || result.ok === false || !result.artifact) {
      return { known: false, committed: false, row, result };
    }
    state.exportSupplementResults[id] = result;
    return {
      known: true,
      committed: isExportMutationPostconditionConfirmed(
        action,
        row,
        result,
        payload,
        previousArtifactVersion
      ),
      row,
      result,
    };
  }

  function markErasureOutcomeUncertain(id, action) {
    // Protocol creation is idempotent and remains the only safe recovery for an
    // unlinked ticket. Every other mutation, including reversible hiding, must
    // fail closed when its postcondition cannot be proven.
    const act = String(action || '');
    if (act === 'link_verified_identity') return;
    state.erasureUncertain[id] = {
      action,
      recordedAt: new Date().toISOString(),
    };
  }

  function markExportOutcomeUncertain(id, action) {
    state.exportSupplementUncertain[id] = {
      action,
      recordedAt: new Date().toISOString(),
    };
  }

  function sleepMs(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function isAmbiguousErasureTransportFailure(result, transportFailed) {
    if (transportFailed) return true;
    const error = result && result.error;
    const value = [
      typeof error === 'string' ? error : '',
      error && error.code,
      error && error.message,
      error && error.body && error.body.error,
      error && error.body && error.body.message,
    ].filter(Boolean).join(' ').toLowerCase();
    return /timeout|timed out|network|transport|failed to fetch|load failed|possible_commit|contract_changed_after_probe|conex[aã]o interrompida/.test(value);
  }

  async function settleErasureMutationResult(options) {
    const {
      id,
      action,
      result,
      currentResult,
      adminContext,
      transportFailed,
    } = options;
    let reconciliation = await reconcileErasureMutation(
      id,
      action,
      adminContext
    );
    if (!isActiveAdminContext(adminContext)) return;

    // Trust a complete successful mutation payload when diagnose lags or reads
    // a split/orphan workflow (seen on apply_reversible for Christian@UFG).
    if (
      !reconciliation.committed
      && result
      && result.ok !== false
      && result.request
      && isErasureMutationPostconditionConfirmed(action, reconciliation.row, result)
    ) {
      reconciliation = {
        known: true,
        committed: true,
        row: reconciliation.row,
        result: result,
      };
      state.erasureResults[id] = {
        ...(currentResult || {}),
        ...result,
      };
    }

    // Help metadata update can lag one read after a successful link RPC.
    if (
      action === 'link_verified_identity'
      && !reconciliation.committed
      && result
      && result.ok !== false
      && result.linked === true
      && /^KC-DSR-[0-9]{8}-[A-F0-9]{16}$/.test(String(result.protocol || '').trim())
    ) {
      for (let attempt = 0; attempt < 3 && !reconciliation.committed; attempt += 1) {
        await sleepMs(180 * (attempt + 1));
        if (!isActiveAdminContext(adminContext)) return;
        reconciliation = await reconcileErasureMutation(id, action, adminContext);
      }
    }

    // Retry diagnose once for reversible apply when the mutation claimed success.
    if (
      action === 'apply_reversible'
      && !reconciliation.committed
      && result
      && result.ok !== false
    ) {
      for (let attempt = 0; attempt < 2 && !reconciliation.committed; attempt += 1) {
        await sleepMs(250 * (attempt + 1));
        if (!isActiveAdminContext(adminContext)) return;
        reconciliation = await reconcileErasureMutation(id, action, adminContext);
        if (
          !reconciliation.committed
          && result.request
          && isErasureMutationPostconditionConfirmed(action, reconciliation.row, result)
        ) {
          reconciliation = {
            known: true,
            committed: true,
            row: reconciliation.row,
            result: result,
          };
          state.erasureResults[id] = {
            ...(currentResult || {}),
            ...result,
          };
        }
      }
    }

    if (reconciliation.committed) {
      delete state.erasureUncertain[id];
      if (action === 'link_verified_identity' && result && result.request) {
        state.erasureResults[id] = {
          ...(currentResult || {}),
          ...result,
        };
      } else if (action === 'link_verified_identity' && result) {
        state.erasureResults[id] = {
          ...(currentResult || {}),
          ...result,
        };
      }
      renderRows(state.rows);
      if (transportFailed || !result || result.ok === false) {
        showToast(
          'A resposta foi interrompida, mas a pós-condição específica foi confirmada por leitura autoritativa. A operação não foi repetida.',
          'success'
        );
        return;
      }
      const protocol = String(
        result.protocol
        || getHelpMetadata(reconciliation.row).protocol
        || ''
      ).trim();
      const successMessages = {
        link_verified_identity: /^KC-DSR-[0-9]{8}-[A-F0-9]{16}$/.test(protocol)
          ? `Identidade vinculada ao protocolo ${protocol}.`
          : 'Identidade vinculada e confirmada pela leitura autoritativa do ticket.',
        apply_reversible: 'Ocultação reversível confirmada pela leitura do workflow.',
        record_confirmation_delivery: 'Envio manual registrado com referência protegida por hash.',
        cancel_reversible: 'Fluxo cancelado e alterações reversíveis restauradas.',
        erase_confirmed: 'Exclusão do núcleo confirmada; revise os operadores antes do recibo final.',
        retry_finalize: 'Operadores revisados, comprovante enviado e fluxo finalizado.',
      };
      showToast(successMessages[action] || 'Fluxo LGPD atualizado.', 'success');
      return;
    }

    if (
      action === 'retry_finalize'
      && result
      && result.ok === false
      && reconciliation.known
      && reconciliation.row
      && isAuthoritativeRecoverableRetryFailure(
        result,
        reconciliation.result
      )
    ) {
      delete state.erasureUncertain[id];
      renderRows(state.rows);
      showToast(friendlyLgpdErrorMessage(result.error || result), 'error');
      return;
    }

    // Protocol link (Passo 1): never mark uncertain and always keep the action
    // available. Surface the real server/network error instead of the trap copy.
    if (action === 'link_verified_identity') {
      delete state.erasureUncertain[id];
      renderRows(state.rows);
      if (result && result.ok === false) {
        showToast(friendlyLgpdErrorMessage(result.error || result), 'error');
        return;
      }
      if (transportFailed) {
        showToast(
          'A rede ou o servidor interrompeu a criação do protocolo. Atualize a fila e tente “Criar protocolo” de novo (a operação é segura para repetir).',
          'error'
        );
        return;
      }
      showToast(
        result && result.linked === true
          ? 'O protocolo ainda não aparece no ticket recarregado. Atualize a fila e tente “Criar protocolo” de novo (a operação é idempotente).'
          : 'Não foi possível criar/confirmar o protocolo neste ticket. Confira e-mail, evidência e tente novamente.',
        'error'
      );
      return;
    }

    // Phase 3 (hide + confirmation email): if the edge returned a workflow body,
    // trust it as committed even when a subsequent diagnose reads a split row.
    if (action === 'apply_reversible') {
      if (result && result.ok !== false && result.request) {
        delete state.erasureUncertain[id];
        state.erasureResults[id] = {
          ...(currentResult || {}),
          ...result,
          ok: true,
        };
        renderRows(state.rows);
        const st = String(result.request.status || '').trim();
        const emailStatus = String(
          result.email && result.email.status
          || result.request.metadata && result.request.metadata.confirmation_email_status
          || ''
        ).trim();
        showToast(
          st === 'pending_confirmation' || emailStatus === 'sent'
            ? 'Ocultação aplicada e pedido de confirmação enviado. Execute Preparar diagnóstico para atualizar o roteiro (fase 4).'
            : emailStatus === 'draft_only' || st === 'reversible_applied'
              ? 'Ocultação aplicada, mas o e-mail automático não foi confirmado. Registre o envio manual ou execute Preparar diagnóstico.'
              : 'Ocultação registrada. Execute Preparar diagnóstico para sincronizar o estado do fluxo.',
          'success'
        );
        return;
      }
      if (
        result
        && result.ok === false
        && !isAmbiguousErasureTransportFailure(result, transportFailed)
      ) {
        delete state.erasureUncertain[id];
        renderRows(state.rows);
        showToast(friendlyLgpdErrorMessage(result.error || result), 'error');
        return;
      }
      // A falha pode ter ocorrido depois do commit. Sem uma leitura
      // autoritativa, caia no bloqueio indeterminado comum abaixo.
    }

    if (result && result.request && !reconciliation.result) {
      state.erasureResults[id] = {
        ...(currentResult || {}),
        ...result,
        diagnostics: result.diagnostics
          || (currentResult && currentResult.diagnostics),
      };
    }
    markErasureOutcomeUncertain(id, action);
    renderRows(state.rows);
    showToast(
      reconciliation.known
        ? 'A leitura segura não confirmou a pós-condição desta operação. As mutações ficaram bloqueadas; não repita a ação antes de executar Preparar diagnóstico.'
        : 'O resultado da operação é indeterminado. As mutações ficaram bloqueadas; não repita a ação até recarregar e executar Preparar diagnóstico.',
      'error'
    );
  }

  async function settleExportMutationResult(options) {
    const {
      id,
      action,
      payload,
      result,
      previousArtifactVersion,
      adminContext,
      transportFailed,
    } = options;
    const reconciliation = await reconcileExportMutation(
      id,
      action,
      payload,
      previousArtifactVersion,
      adminContext
    );
    if (!isActiveAdminContext(adminContext)) return;
    if (reconciliation.committed) {
      delete state.exportSupplementUncertain[id];
      if (action === 'link_verified_ticket' && result && result.ok !== false) {
        state.exportSupplementResults[id] = result;
      }
      renderRows(state.rows);
      if (transportFailed || !result || result.ok === false) {
        showToast(
          'A resposta foi interrompida, mas a pós-condição específica do artefato foi confirmada. A operação não foi repetida.',
          'success'
        );
        return;
      }
      const successMessages = {
        link_verified_ticket: 'Identidade, protocolo e artefato confirmados por leitura autoritativa.',
        record_processor: 'Evidência do operador confirmada somente por hash.',
        build: 'Complemento privado íntegro e disponível foi confirmado.',
        retry: 'Complemento privado íntegro e disponível foi confirmado.',
        purge: 'Expurgo do artefato foi confirmado.',
      };
      showToast(successMessages[action] || 'Suplemento atualizado.', 'success');
      return;
    }

    markExportOutcomeUncertain(id, action);
    renderRows(state.rows);
    showToast(
      action === 'link_verified_ticket'
        ? 'O servidor respondeu, mas a leitura autoritativa não confirmou o vínculo completo entre ticket, protocolo e artefato. Não repita a ação antes de recarregar.'
        : reconciliation.known
          ? 'A leitura segura não confirmou a pós-condição específica do artefato. As mutações ficaram bloqueadas; não repita a ação antes de executar Diagnosticar.'
          : 'O resultado do suplemento é indeterminado. As mutações ficaram bloqueadas; não repita a ação até recarregar e diagnosticar o artefato.',
      'error'
    );
  }

  async function handleLgpdAction(card, action) {
    const adminContext = captureAdminContext();
    if (!isActiveAdminContext(adminContext)) return;
    const id = String(card && card.getAttribute('data-help-id') || '').trim();
    if (!id || !LGPD_ACTIONS.has(action) || state.erasureBusy[id] === true) return;
    let row = state.rows.find((item) => String(item && item.id || '') === id);
    if (!row) return;
    if (!canRunErasureAction(row, action)) {
      showToast(
        action === 'retry_finalize'
          ? 'Carregue primeiro o estado pós-exclusão. A finalização permanece bloqueada até o servidor confirmar o checkpoint e a prova armazenada.'
          : 'A ação foi bloqueada porque o ticket não possui o vínculo canônico exigido para esta etapa.',
        'error'
      );
      return;
    }
    const allowed = await checkAdminAccess(adminContext);
    if (!allowed || !isActiveAdminContext(adminContext)) {
      if (isActiveAdminContext(adminContext)) {
        showToast('Entre novamente com uma conta administradora antes de executar o fluxo LGPD.', 'error');
      }
      return;
    }
    if (state.erasureBusy[id] === true) return;
    row = state.rows.find((item) => String(item && item.id || '') === id);
    if (!row || !canRunErasureAction(row, action)) {
      showToast('O estado do vínculo mudou durante a autorização. Atualize a fila antes de continuar.', 'error');
      return;
    }
    const verifiedAccountEmail = String(
      card.querySelector('[data-lgpd-account-email]')?.value || getLgpdTargetEmail(row)
    ).trim().toLowerCase();
    const targetEmail = action === 'link_verified_identity'
      ? verifiedAccountEmail
      : getLgpdTargetEmail(row);
    const confirmation = String(card.querySelector('[data-lgpd-confirmation]')?.value || '').trim();
    const evidenceReference = String(card.querySelector('[data-lgpd-evidence-reference]')?.value || '').trim();
    const evidenceAt = readIsoDateTime(card, '[data-lgpd-evidence-at]');
    const evidenceAttested = card.querySelector('[data-lgpd-evidence-attested]')?.checked === true;
    const deliveryReference = String(card.querySelector('[data-lgpd-delivery-reference]')?.value || '').trim();
    const deliveryAt = readIsoDateTime(card, '[data-lgpd-delivery-at]');
    const deliveryAttested = card.querySelector('[data-lgpd-delivery-attested]')?.checked === true;
    const cancellationReason = String(card.querySelector('[data-lgpd-cancellation-reason]')?.value || '').trim();
    const providerReference = String(card.querySelector('[data-lgpd-provider-reference]')?.value || '').trim();
    const providerAt = readIsoDateTime(card, '[data-lgpd-provider-at]');
    const providerAttested = card.querySelector('[data-lgpd-provider-attested]')?.checked === true;
    const identityChannel = String(card.querySelector('[data-lgpd-identity-channel]')?.value || '').trim();
    const identityReference = String(card.querySelector('[data-lgpd-identity-reference]')?.value || '').trim();
    const identityAt = readIsoDateTime(card, '[data-lgpd-identity-at]');
    const identityAttested = card.querySelector('[data-lgpd-identity-attested]')?.checked === true;
    const completionReference = String(card.querySelector('[data-lgpd-completion-reference]')?.value || '').trim();
    const completionAt = readIsoDateTime(card, '[data-lgpd-completion-at]');
    const completionAttested = card.querySelector('[data-lgpd-completion-attested]')?.checked === true;
    const copyDecisionValue = String(card.querySelector('[data-lgpd-copy-decision]')?.value || '').trim();
    const copyDecisionReference = String(card.querySelector('[data-lgpd-copy-reference]')?.value || '').trim();
    const copyDecisionAt = readIsoDateTime(card, '[data-lgpd-copy-at]');
    const copyDecisionAttested = card.querySelector('[data-lgpd-copy-attested]')?.checked === true;
    const currentResult = state.erasureResults[id] || {};
    const manualProviders = getManualProviderIds(currentResult);
    const providerOutcomes = {};
    const providerRetentions = {};
    card.querySelectorAll('[data-lgpd-provider-outcome]').forEach((field) => {
      const provider = String(field.getAttribute('data-provider') || '').trim();
      const outcome = String(field.value || '').trim();
      if (provider && outcome) providerOutcomes[provider] = outcome;
    });
    manualProviders.forEach((provider) => {
      if (providerOutcomes[provider] !== 'retention_documented') return;
      const escapedProvider = window.CSS && typeof window.CSS.escape === 'function'
        ? window.CSS.escape(provider)
        : provider.replace(/["\\]/g, '\\$&');
      const basis = String(card.querySelector(`[data-lgpd-provider-retention-basis][data-provider="${escapedProvider}"]`)?.value || '').trim();
      const reviewAt = readIsoDateTime(card, `[data-lgpd-provider-retention-at][data-provider="${escapedProvider}"]`);
      providerRetentions[provider] = { legal_basis: basis, review_at: reviewAt };
    });
    const currentRequest = currentResult && currentResult.request && typeof currentResult.request === 'object'
      ? currentResult.request
      : {};
    const currentMetadata = currentRequest.metadata && typeof currentRequest.metadata === 'object'
      ? currentRequest.metadata
      : {};
    const helpMetadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const existingCopyDecision = currentMetadata.pre_erasure_copy_decision
      && typeof currentMetadata.pre_erasure_copy_decision === 'object'
      ? currentMetadata.pre_erasure_copy_decision
      : {};
    const identityNeedsManual = Boolean(
      currentResult
      && currentResult.diagnostics
      && currentResult.diagnostics.identity_assurance
      && currentResult.diagnostics.identity_assurance.requires_manual_evidence === true
    );
    const completionNotificationPending = currentRequest.status === 'erased'
      && currentMetadata.notification_pending === true;
    // Authenticated legacy tickets already have user_id but still need DSR
    // materialization (needsErasureProtocolLink). Only reject when the email
    // is invalid or the panel no longer offers the protocol-link action.
    if (action === 'link_verified_identity') {
      // Clear any stale Passo-1 trap from earlier attempts before validating.
      delete state.erasureUncertain[id];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(verifiedAccountEmail)) {
        setFieldInvalid(card, '[data-lgpd-account-email]', true);
        showToast('Informe o e-mail exato da conta do titular para protocolar o pedido.', 'error');
        return;
      }
      if (!canOfferErasureIdentityLink(row)) {
        setFieldInvalid(card, '[data-lgpd-account-email]', true);
        showToast(
          hasCanonicalErasureLink(row)
            ? 'Este ticket já possui protocolo e vínculo canônico. Atualize a fila e continue pelo diagnóstico.'
            : 'Este ticket não está elegível para criar o protocolo de identidade. Atualize a fila e confira o estado do pedido.',
          'error'
        );
        return;
      }
    }
    if (
      action === 'link_verified_identity'
      && (
        ![
          'verified_email_challenge',
          'support_mailbox_reply',
          'identity_document_review',
          'in_person_verification',
        ].includes(identityChannel)
        || identityReference.length < 6
        || !identityAt
        || Date.parse(identityAt) < Date.now() - (30 * 24 * 60 * 60 * 1000)
        || Date.parse(identityAt) > Date.now() + (5 * 60 * 1000)
        || !identityAttested
      )
    ) {
      setFieldInvalid(
        card,
        '[data-lgpd-identity-channel]',
        ![
          'verified_email_challenge',
          'support_mailbox_reply',
          'identity_document_review',
          'in_person_verification',
        ].includes(identityChannel)
      );
      setFieldInvalid(card, '[data-lgpd-identity-reference]', identityReference.length < 6);
      setFieldInvalid(
        card,
        '[data-lgpd-identity-at]',
        !identityAt
          || Date.parse(identityAt) < Date.now() - (30 * 24 * 60 * 60 * 1000)
          || Date.parse(identityAt) > Date.now() + (5 * 60 * 1000)
      );
      setFieldInvalid(card, '[data-lgpd-identity-attested]', !identityAttested);
      showToast('Informe e ateste canal, referência e data válida da verificação antes de vincular a identidade.', 'error');
      return;
    }
    if (action === 'erase_confirmed' && confirmation !== `EXCLUIR ${targetEmail}`) {
      showToast('Digite a frase de confirmação exatamente como exibida antes da exclusão irreversível.', 'error');
      return;
    }
    if (action === 'erase_confirmed' && (!evidenceReference || !evidenceAt || !evidenceAttested)) {
      showToast('Registre a referência, a data e a validação da resposta do titular antes da exclusão.', 'error');
      return;
    }
    if (
      action === 'erase_confirmed'
      && (
        !String(helpMetadata.export_before_erasure || '').trim()
        || String(helpMetadata.export_before_erasure || '').trim() === 'need_guidance'
      )
      && existingCopyDecision.attested !== true
      && (!copyDecisionValue || !copyDecisionReference || !copyDecisionAt || !copyDecisionAttested)
    ) {
      showToast('Registre e ateste a decisão do titular sobre receber uma cópia antes da exclusão.', 'error');
      return;
    }
    if (action === 'record_confirmation_delivery' && (!deliveryReference || !deliveryAt || !deliveryAttested)) {
      showToast('Informe referência, data e ateste o envio manual pelo e-mail titular.', 'error');
      return;
    }
    if (
      action === 'apply_reversible'
      && identityNeedsManual
      && (!identityChannel || !identityReference || !identityAt || !identityAttested)
    ) {
      showToast('Valide e ateste a identidade do titular antes de ocultar qualquer dado deste ticket legado/anônimo.', 'error');
      return;
    }
    if (action === 'cancel_reversible' && cancellationReason.length < 8) {
      showToast('Informe um motivo operacional com pelo menos 8 caracteres para cancelar e restaurar.', 'error');
      return;
    }
    if (
      action === 'retry_finalize'
      && !completionNotificationPending
      && (
        !providerReference
        || !providerAt
        || !providerAttested
        || !manualProviders.length
        || manualProviders.some((provider) => !providerOutcomes[provider])
        || manualProviders.some((provider) => (
          providerOutcomes[provider] === 'retention_documented'
          && (
            !providerRetentions[provider]
            || String(providerRetentions[provider].legal_basis || '').trim().length < 8
            || !providerRetentions[provider].review_at
          )
        ))
      )
    ) {
      showToast('Execute o diagnóstico e registre a revisão concluída de todos os operadores externos.', 'error');
      return;
    }
    if (
      action === 'retry_finalize'
      && completionNotificationPending
      && (completionReference || completionAt || completionAttested)
      && (!completionReference || !completionAt || !completionAttested)
    ) {
      showToast('Complete todos os campos de entrega manual ou deixe todos vazios para tentar o reenvio automático.', 'error');
      return;
    }
    const button = card.querySelector(`[data-lgpd-action="${action}"]`);
    const focusAction = action;
    state.erasureBusy[id] = true;
    const panel = card.querySelector('[data-lgpd-panel]');
    if (panel) {
      panel.setAttribute('aria-busy', 'true');
      const liveStatus = panel.querySelector('[data-lgpd-live]');
      if (liveStatus) liveStatus.textContent = 'Processando solicitação LGPD.';
      panel.querySelectorAll('button, input, select, textarea').forEach((control) => {
        control.disabled = true;
      });
    }
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Processando...';
    }
    try {
      const result = await window.KCAPI.processAccountErasure({
        action,
        actionKey: action,
        help_request_id: id,
        helpRequestId: id,
        account_email: verifiedAccountEmail,
        accountEmail: verifiedAccountEmail,
        target_email: targetEmail,
        targetEmail,
        confirmation_phrase: confirmation,
        confirmationPhrase: confirmation,
        confirmation_evidence: {
          channel: 'email_reply',
          reference: evidenceReference,
          received_at: evidenceAt,
          attested: evidenceAttested,
        },
        confirmationEvidence: {
          channel: 'email_reply',
          reference: evidenceReference,
          received_at: evidenceAt,
          attested: evidenceAttested,
        },
        identity_evidence: {
          channel: identityChannel,
          reference: identityReference,
          verified_at: identityAt,
          attested: identityAttested,
        },
        delivery_evidence: {
          channel: 'manual_email',
          reference: deliveryReference,
          delivered_at: deliveryAt,
          attested: deliveryAttested,
        },
        deliveryEvidence: {
          channel: 'manual_email',
          reference: deliveryReference,
          delivered_at: deliveryAt,
          attested: deliveryAttested,
        },
        cancellation_reason: cancellationReason,
        cancellationReason,
        copy_gate_decision: copyDecisionValue
          ? {
            decision: copyDecisionValue,
            channel: 'admin_guidance_review',
            reference: copyDecisionReference,
            decided_at: copyDecisionAt,
            attested: copyDecisionAttested,
          }
          : undefined,
        provider_evidence: {
          channel: 'admin_provider_review',
          reference: providerReference,
          completed_at: providerAt,
          attested: providerAttested,
          outcomes: providerOutcomes,
          retentions: providerRetentions,
        },
        completion_delivery_evidence: {
          channel: 'manual_email',
          reference: completionReference,
          delivered_at: completionAt,
          attested: completionAttested,
        },
      });
      if (!isActiveAdminContext(adminContext)) return;
      if (LGPD_MUTATING_ACTIONS.has(action)) {
        await settleErasureMutationResult({
          id,
          action,
          result,
          currentResult,
          adminContext,
          transportFailed: false,
        });
        return;
      }
      if (action === 'diagnose' && result && result.ok !== false) {
        delete state.erasureUncertain[id];
      }
      if (!result || result.ok === false) {
        if (result && result.request) {
          state.erasureResults[id] = {
            ...currentResult,
            ...result,
            diagnostics: result.diagnostics || currentResult.diagnostics,
          };
          renderRows(state.rows);
        }
        showToast(friendlyLgpdErrorMessage(result && result.error), 'error');
        return;
      }
      state.erasureResults[id] = result;
      showToast('Fluxo LGPD atualizado.', 'success');
      renderRows(state.rows);
    } catch (error) {
      if (!isActiveAdminContext(adminContext)) return;
      console.error('[AdminHelp] lgpd_action_failed');
      if (LGPD_MUTATING_ACTIONS.has(action)) {
        await settleErasureMutationResult({
          id,
          action,
          result: null,
          currentResult,
          adminContext,
          transportFailed: true,
        });
        return;
      }
      showToast(friendlyLgpdErrorMessage(error), 'error');
    } finally {
      if (isActiveAdminContext(adminContext)) {
        delete state.erasureBusy[id];
        renderRows(state.rows);
        const refreshedCard = document.querySelector(`[data-help-id="${id}"]`);
        const nextFocus = refreshedCard && (
          refreshedCard.querySelector(`[data-lgpd-action="${focusAction}"]`)
          || refreshedCard.querySelector('[data-lgpd-action="diagnose"]')
          || refreshedCard.querySelector('[data-lgpd-export]')
          || refreshedCard.querySelector('[data-help-status-set].is-active')
          || refreshedCard.querySelector('[data-help-status-set]')
        );
        if (nextFocus && typeof nextFocus.focus === 'function') nextFocus.focus();
      }
    }
  }

  async function handleDataExportSupplementAction(card, action, processorRow) {
    const adminContext = captureAdminContext();
    if (!isActiveAdminContext(adminContext)) return;
    const id = String(card && card.getAttribute('data-help-id') || '').trim();
    if (!id || !window.KCAPI || typeof window.KCAPI.processDataExportSupplement !== 'function') return;
    const allowedActions = ['link_verified_ticket', 'diagnose', 'record_processor', 'build', 'retry', 'purge'];
    if (!allowedActions.includes(action) || state.exportSupplementBusy[id] === true) return;
    let row = state.rows.find((item) => String(item && item.id || '').trim() === id);
    if (!row || !canRunDataExportAction(row, action)) {
      showToast('A ação do suplemento foi bloqueada porque o vínculo canônico ou a elegibilidade de expurgo não foi confirmado.', 'error');
      return;
    }
    const access = await checkAdminAccess(adminContext);
    if (!access || !isActiveAdminContext(adminContext)) {
      if (isActiveAdminContext(adminContext)) {
        showToast('Entre novamente com uma conta administradora.', 'error');
      }
      return;
    }
    if (state.exportSupplementBusy[id] === true) return;
    row = state.rows.find((item) => String(item && item.id || '').trim() === id);
    if (!row || !canRunDataExportAction(row, action)) {
      showToast('O estado do protocolo ou do artefato mudou durante a autorização. Atualize a fila antes de continuar.', 'error');
      return;
    }
    if (
      action === 'purge'
      && typeof window.confirm === 'function'
      && !window.confirm('Expurgar definitivamente este arquivo privado? Esta ação não pode ser desfeita.')
    ) {
      return;
    }
    const payload = { action, help_request_id: id };
    if (action === 'purge') {
      const artifactRef = String(
        getHelpMetadata(row).export_artifact_ref || ''
      ).trim().toUpperCase();
      if (EXPORT_ARTIFACT_REF_RE.test(artifactRef)) {
        payload.artifact_ref = artifactRef;
      }
    }
    if (action === 'link_verified_ticket') {
      const identityPanel = card.querySelector('[data-export-identity-link]');
      const accountEmail = String(identityPanel && identityPanel.querySelector('[data-export-account-email]')?.value || '').trim().toLowerCase();
      const requestKind = String(identityPanel && identityPanel.querySelector('[data-export-request-kind]')?.value || '').trim().toLowerCase();
      const identityChannel = String(identityPanel && identityPanel.querySelector('[data-export-identity-channel]')?.value || '').trim();
      const identityReference = String(identityPanel && identityPanel.querySelector('[data-export-identity-reference]')?.value || '').trim();
      const identityVerifiedAt = String(identityPanel && identityPanel.querySelector('[data-export-identity-at]')?.value || '').trim();
      const identityAttested = Boolean(identityPanel && identityPanel.querySelector('[data-export-identity-attested]')?.checked);
      const verifiedAtMs = Date.parse(identityVerifiedAt);
      if (
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(accountEmail)
        || !['data_access_copy', 'data_portability'].includes(requestKind)
        || ![
          'verified_email_challenge',
          'support_mailbox_reply',
          'identity_document_review',
          'in_person_verification',
        ].includes(identityChannel)
        || identityReference.length < 8
        || !Number.isFinite(verifiedAtMs)
        || verifiedAtMs < Date.now() - 30 * 24 * 60 * 60 * 1000
        || verifiedAtMs > Date.now() + 5 * 60 * 1000
        || !identityAttested
      ) {
        showToast('Informe o e-mail exato, a referência, a data recente e confirme a validação da identidade.', 'error');
        return;
      }
      payload.account_email = accountEmail;
      payload.request_kind = requestKind;
      payload.identity_channel = identityChannel;
      payload.identity_reference = identityReference;
      payload.identity_verified_at = new Date(verifiedAtMs).toISOString();
      payload.identity_attested = true;
    }
    if (action === 'record_processor' && processorRow) {
      payload.processor = String(processorRow.querySelector('[data-export-processor]')?.value || '').trim();
      payload.outcome = String(processorRow.querySelector('[data-export-outcome]')?.value || '').trim();
      payload.evidence_reference = String(processorRow.querySelector('[data-export-evidence]')?.value || '').trim();
      if (payload.evidence_reference.length < 8) {
        showToast('Informe uma referência de evidência com pelo menos 8 caracteres.', 'error');
        return;
      }
      if (payload.outcome === 'supplied_out_of_band') {
        const deliveryChannel = String(processorRow.querySelector('[data-export-delivery-channel]')?.value || '').trim();
        const deliveredAtInput = String(processorRow.querySelector('[data-export-delivered-at]')?.value || '').trim();
        const deliveredAtMs = Date.parse(deliveredAtInput);
        const deliveryAttested = processorRow.querySelector('[data-export-delivery-attested]')?.checked === true;
        if (
          !['support_mailbox', 'secure_file_transfer', 'provider_portal', 'in_person'].includes(deliveryChannel)
          || !Number.isFinite(deliveredAtMs)
          || deliveredAtMs < Date.now() - 365 * 24 * 60 * 60 * 1000
          || deliveredAtMs > Date.now() + 5 * 60 * 1000
          || !deliveryAttested
        ) {
          showToast('Informe o canal e a data da entrega externa e confirme que o conteúdo não está no JSON.', 'error');
          return;
        }
        payload.delivery_channel = deliveryChannel;
        payload.delivered_out_of_band_at = new Date(deliveredAtMs).toISOString();
        payload.delivery_attested = true;
      }
    }
    state.exportSupplementBusy[id] = true;
    renderRows(state.rows);
    const previousArtifactVersion = Number(
      state.exportSupplementResults[id]
      && state.exportSupplementResults[id].artifact
      && state.exportSupplementResults[id].artifact.version
    );
    try {
      const result = await window.KCAPI.processDataExportSupplement(payload);
      if (!isActiveAdminContext(adminContext)) return;
      if (EXPORT_MUTATING_ACTIONS.has(action)) {
        await settleExportMutationResult({
          id,
          action,
          payload,
          result,
          previousArtifactVersion,
          adminContext,
          transportFailed: false,
        });
        return;
      }
      if (action === 'diagnose' && result && result.ok !== false) {
        delete state.exportSupplementUncertain[id];
      }
      if (!result || result.ok === false) {
        showToast(String(result && result.error && result.error.message || 'Falha no suplemento.'), 'error');
        return;
      }
      state.exportSupplementResults[id] = result;
      showToast('Diagnóstico do suplemento atualizado.', 'success');
    } catch (error) {
      if (!isActiveAdminContext(adminContext)) return;
      console.error('[AdminHelp] export_supplement_action_failed');
      if (EXPORT_MUTATING_ACTIONS.has(action)) {
        await settleExportMutationResult({
          id,
          action,
          payload,
          result: null,
          previousArtifactVersion,
          adminContext,
          transportFailed: true,
        });
        return;
      }
      showToast(String(error && error.message || 'Falha no suplemento.'), 'error');
    } finally {
      if (!isActiveAdminContext(adminContext)) return;
      delete state.exportSupplementBusy[id];
      renderRows(state.rows);
      const refreshedCard = document.querySelector(`[data-help-id="${id}"]`);
      const nextFocus = refreshedCard && refreshedCard.querySelector(
        action === 'record_processor'
          ? '[data-export-processor-save]'
          : `[data-export-action="${action}"], [data-export-action="diagnose"]`
      );
      if (nextFocus && typeof nextFocus.focus === 'function') nextFocus.focus();
    }
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    document.addEventListener('kc:authchange', function (event) {
      const detail = event && event.detail && typeof event.detail === 'object'
        ? event.detail
        : null;
      // Flush ticket drafts while the list is still mounted; filters stay in
      // storage unless the operator actually changed them (adminFiltersDirty).
      try { flushAdminDraftSave(); } catch (_) { /* ignore */ }
      try { saveAdminViewSnapshot(); } catch (_) { /* ignore */ }
      const sessionUser = detail && Object.prototype.hasOwnProperty.call(detail, 'user')
        ? detail.user
        : undefined;
      const nextUserId = sessionUser && sessionUser.id
        ? String(sessionUser.id || '').trim()
        : '';
      // Soft reauth when the same admin remains signed in (token refresh).
      // Hard wipe only on logout or account switch.
      const soft = Boolean(
        nextUserId
        && state.authorizedAdminUserId
        && nextUserId === String(state.authorizedAdminUserId)
      );
      if (!nextUserId && Object.prototype.hasOwnProperty.call(detail || {}, 'user')) {
        clearSensitiveAdminState({ showChecking: false, clearBrowserState: true });
        showError('Você precisa estar autenticado para acessar este painel.');
        return;
      }
      reauthorizeAdminView(
        Object.assign(
          { soft: soft },
          Object.prototype.hasOwnProperty.call(detail || {}, 'user')
            ? { sessionUser: sessionUser }
            : {}
        )
      );
    });

    ['#helpStatusFilter', '#helpTypeFilter', '#helpPriorityFilter'].forEach((selector) => {
      const field = $(selector);
      if (field) {
        field.addEventListener('change', function () {
          adminFiltersDirty = true;
          try { flushAdminDraftSave(); } catch (_) { /* ignore */ }
          loadRows();
        });
      }
    });

    const queryField = $('#helpQueryFilter');
    if (queryField) {
      queryField.addEventListener('input', function () {
        adminFiltersDirty = true;
        scheduleAdminDraftSave();
        window.clearTimeout(queryField._kcTimer);
        queryField._kcTimer = window.setTimeout(function () {
          try { flushAdminDraftSave(); } catch (_) { /* ignore */ }
          loadRows();
        }, QUERY_DEBOUNCE_MS);
      });
    }

    const refreshButton = $('#helpRefreshButton');
    if (refreshButton) {
      refreshButton.addEventListener('click', function () {
        try { flushAdminDraftSave(); } catch (_) { /* ignore */ }
        loadRows({ limit: Math.max(state.pagination.limit, state.rows.length || HELP_PAGE_SIZE) });
      });
    }

    const clearFiltersButton = $('#helpClearFiltersButton');
    if (clearFiltersButton) {
      clearFiltersButton.addEventListener('click', function () {
        clearQueueFilters();
      });
    }

    const summary = $('#helpSummary');
    if (summary) {
      summary.addEventListener('click', function (event) {
        const shortcut = event.target && event.target.closest
          ? event.target.closest('[data-help-filter-shortcut]')
          : null;
        if (!shortcut) return;
        event.preventDefault();
        const action = String(shortcut.getAttribute('data-help-filter-shortcut') || '').trim();
        if (action === 'clear') {
          clearQueueFilters();
          return;
        }
        if (action.indexOf('status:') === 0) {
          applyQueueFilters({ status: action.slice('status:'.length) || 'all' });
          return;
        }
        if (action.indexOf('priority:') === 0) {
          applyQueueFilters({ priority: action.slice('priority:'.length) || 'all' });
          return;
        }
        if (action === 'external-access') {
          openExternalAccessWorkflow(null);
        }
      });
    }

    // Persist operator typing (identity evidence, phrases, triage) as drafts.
    document.addEventListener('input', function (event) {
      const target = event && event.target;
      if (!target || adminDraftRestoring) return;
      const card = target.closest && target.closest('[data-help-id]');
      if (card) {
        const key = adminDraftFieldKey(target);
        if (key) markAdminDraftFieldDirty(card.getAttribute('data-help-id'), key);
        scheduleAdminDraftSave();
        return;
      }
      if (target.closest && (
        target.closest('#helpStatusFilter')
        || target.closest('#helpTypeFilter')
        || target.closest('#helpPriorityFilter')
        || target.closest('#helpQueryFilter')
      )) {
        adminFiltersDirty = true;
        scheduleAdminDraftSave();
      }
    });
    document.addEventListener('change', function (event) {
      const target = event && event.target;
      if (!target || adminDraftRestoring) return;
      const card = target.closest && target.closest('[data-help-id]');
      if (!card) return;
      const key = adminDraftFieldKey(target);
      if (key) markAdminDraftFieldDirty(card.getAttribute('data-help-id'), key);
      scheduleAdminDraftSave();
    });
    window.addEventListener('pagehide', function () {
      try { flushAdminDraftSave(); } catch (_) { /* ignore */ }
      try { saveAdminViewSnapshot(); } catch (_) { /* ignore */ }
    });
    window.addEventListener('beforeunload', function () {
      try { flushAdminDraftSave(); } catch (_) { /* ignore */ }
      try { saveAdminViewSnapshot(); } catch (_) { /* ignore */ }
    });
    window.addEventListener('pageshow', function (event) {
      // Back/forward cache or soft return: restore filters + fields.
      try { restoreAdminFiltersFromDraft(); } catch (_) { /* ignore */ }
      scheduleAdminDraftRestore();
      // bfcache restore: revalidate quietly without blanking main content.
      if (event && event.persisted) {
        reauthorizeAdminView({ soft: true }).catch(function () { /* ignore */ });
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        try { flushAdminDraftSave(); } catch (_) { /* ignore */ }
        try { saveAdminViewSnapshot(); } catch (_) { /* ignore */ }
      } else if (document.visibilityState === 'visible') {
        scheduleAdminDraftRestore();
      }
    });

    const exportXlsx = $('#helpExportXlsx');
    if (exportXlsx) exportXlsx.addEventListener('click', () => handleHelpExport('xlsx').catch(() => console.error('[AdminHelp] export_xlsx_failed')));
    const exportPdf = $('#helpExportPdf');
    if (exportPdf) exportPdf.addEventListener('click', () => handleHelpExport('pdf').catch(() => console.error('[AdminHelp] export_pdf_failed')));

    document.addEventListener('change', function (event) {
      const outcome = event.target && event.target.closest
        ? event.target.closest('[data-export-outcome]')
        : null;
      if (!outcome) return;
      const processorRow = outcome.closest('[data-export-processor-row]');
      if (!processorRow) return;
      const externalDelivery = outcome.value === 'supplied_out_of_band';
      processorRow.querySelectorAll('[data-export-delivery-field] input, [data-export-delivery-field] select').forEach((field) => {
        field.disabled = !externalDelivery;
        if (!externalDelivery) {
          if (field.type === 'checkbox') field.checked = false;
          else field.value = '';
        }
      });
    });

    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest
        ? event.target.closest(
          '[data-help-copy],[data-help-status-set],[data-help-priority-set],[data-help-save],[data-help-load-more],[data-help-open-external],[data-help-open-cadu],[data-lgpd-action],[data-lgpd-export],[data-export-action],[data-export-processor-save]'
        )
        : null;
      if (!target) return;

      if (target.hasAttribute('data-help-copy')) {
        event.preventDefault();
        const value = String(target.getAttribute('data-help-copy') || '').trim();
        if (!value) return;
        const done = function (ok) {
          showToast(ok ? 'Identificador copiado.' : 'Não foi possível copiar. Selecione o código manualmente.', ok ? 'success' : 'warn', 2200);
        };
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(value).then(function () { done(true); }).catch(function () { done(false); });
        } else {
          try {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            done(ok);
          } catch (_) {
            done(false);
          }
        }
        return;
      }

      if (target.hasAttribute('data-help-load-more')) {
        event.preventDefault();
        if (!state.pagination.isLoadingMore && state.pagination.hasMore) {
          loadRows({ append: true, limit: state.pagination.limit || HELP_PAGE_SIZE });
        }
        return;
      }

      const card = target.closest('[data-help-id]');
      if (target.hasAttribute('data-help-open-external') || target.hasAttribute('data-help-open-cadu')) {
        event.preventDefault();
        const id = String(card && card.getAttribute('data-help-id') || '').trim();
        const row = state.rows.find((item) => String(item && item.id || '').trim() === id) || null;
        if (!row) {
          showToast('Não foi possível localizar este pedido na fila atual.', 'warn');
          return;
        }
        if (target.hasAttribute('data-help-open-external')) openExternalAccessWorkflow(row);
        else prepareCaduHelpAnalysis(row);
        return;
      }

      if (target.hasAttribute('data-help-status-set') || target.hasAttribute('data-help-priority-set')) {
        event.preventDefault();
        if (!card || card.classList.contains('is-triage-saving')) return;
        const overrides = {};
        if (target.hasAttribute('data-help-status-set')) {
          overrides.status = String(target.getAttribute('data-help-status-set') || '').trim();
        }
        if (target.hasAttribute('data-help-priority-set')) {
          overrides.priority = String(target.getAttribute('data-help-priority-set') || '').trim();
        }
        saveRow(card, overrides).catch(() => console.error('[AdminHelp] triage_chip_save_unhandled'));
        return;
      }

      // Legacy: keep data-help-save working if any residual markup remains.
      if (target.hasAttribute('data-help-save')) {
        event.preventDefault();
        if (card) saveRow(card).catch(() => console.error('[AdminHelp] triage_save_unhandled'));
        return;
      }

      if (target.hasAttribute('data-export-action')) {
        event.preventDefault();
        if (card) {
          handleDataExportSupplementAction(
            card,
            String(target.getAttribute('data-export-action') || ''),
            null
          ).catch(() => console.error('[AdminHelp] export_supplement_action_unhandled'));
        }
        return;
      }
      if (target.hasAttribute('data-export-processor-save')) {
        event.preventDefault();
        if (card) {
          handleDataExportSupplementAction(
            card,
            'record_processor',
            target.closest('[data-export-processor-row]')
          ).catch(() => console.error('[AdminHelp] export_supplement_evidence_unhandled'));
        }
        return;
      }
      if (target.hasAttribute('data-lgpd-action')) {
        event.preventDefault();
        if (card) {
          handleLgpdAction(card, String(target.getAttribute('data-lgpd-action') || '')).catch(() => console.error('[AdminHelp] lgpd_action_unhandled'));
        }
        return;
      }

      if (target.hasAttribute('data-lgpd-export')) {
        event.preventDefault();
        const id = String(card && card.getAttribute('data-help-id') || '').trim();
        const row = state.rows.find((item) => String(item && item.id || '') === id);
        if (row) exportLgpdReport(row).catch(() => console.error('[AdminHelp] lgpd_export_failed'));
      }
    });
  }

  function showLoadingSkeletons() {
    const summary = $('#helpSummary');
    if (summary && !summary.children.length) {
      summary.innerHTML = '<div class="kc-skeleton" style="height:60px;border-radius:14px;"></div>'.repeat(4);
    }
    const list = $('#helpRequestsList');
    if (list && !list.children.length) {
      list.innerHTML = '<div class="kc-skeleton" style="height:84px;border-radius:14px;margin-bottom:12px;"></div>'.repeat(4);
    }
  }

  async function reauthorizeAdminView(options = {}) {
    const soft = options.soft === true;
    const previousUserId = String(state.authorizedAdminUserId || '');
    const hadPaintedRows = Array.isArray(state.rows) && state.rows.length > 0;

    if (!soft) {
      clearSensitiveAdminState();
      // clearSensitiveAdminState resets filter controls to all/empty. Re-apply
      // the saved queue view immediately so loadRows uses the operator's filters.
      try { restoreAdminFiltersFromDraft(); } catch (_) { /* ignore */ }
      try { restoreAdminViewSnapshotPaint(); } catch (_) { /* ignore */ }
    } else {
      // Soft path: keep queue painted; only revalidate access + refresh data.
      try { restoreAdminFiltersFromDraft(); } catch (_) { /* ignore */ }
      showLoading(true, { silent: hadPaintedRows });
    }

    const generation = state.authGeneration;
    let access = null;
    try {
      access = await checkAdminAccess({
        generation,
        ...(Object.prototype.hasOwnProperty.call(options, 'sessionUser')
          ? { sessionUser: options.sessionUser }
          : {}),
      });
    } catch (_) {
      if (generation === state.authGeneration) {
        denyAdminAccess('Não foi possível validar seu acesso administrativo.', generation);
      }
      console.error('[AdminHelp] admin_access_check_failed');
      return;
    }
    if (!access || generation !== state.authGeneration) {
      if (generation === state.authGeneration) showLoading(false, { silent: soft && hadPaintedRows });
      return;
    }

    // Account switch must hard-reset (PII isolation).
    if (previousUserId && previousUserId !== String(access.userId || '')) {
      clearSensitiveAdminState({ clearBrowserState: true });
      try { restoreAdminFiltersFromDraft(); } catch (_) { /* ignore */ }
    }

    state.authorizedAdminUserId = access.userId;
    state.isAuthorized = true;
    const adminContext = captureAdminContext();
    if (!isActiveAdminContext(adminContext)) return;
    // Auth recheck may have raced with another clear; restore filters again.
    try { restoreAdminFiltersFromDraft(); } catch (_) { /* ignore */ }

    const keepPaint = soft || (Array.isArray(state.rows) && state.rows.length > 0);
    if (!keepPaint) showLoadingSkeletons();
    await loadRows({
      silent: keepPaint,
      limit: Math.max(state.pagination.limit || HELP_PAGE_SIZE, state.rows.length || HELP_PAGE_SIZE),
    });
  }

  async function init() {
    populateTypeFilter();
    bindEvents();
    // Restore only safe preferences before authorization. Ticket rows and PII
    // are fetched and painted only after the current admin session is rechecked.
    try { restoreAdminFiltersFromDraft(); } catch (_) { /* ignore */ }
    try { restoreAdminViewSnapshotPaint(); } catch (_) { /* ignore */ }
    await reauthorizeAdminView({ soft: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
