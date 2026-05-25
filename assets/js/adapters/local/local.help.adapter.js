/* KinoCampus - Local Help Adapter */
(function () {
  'use strict';

  var HELP_REQUESTS_STORAGE_KEY = 'kc_help_requests';

  window._KCLA = window._KCLA || {};

  function getHelpUtils(deps) {
    if (deps && deps.helpUtils && typeof deps.helpUtils === 'object') return deps.helpUtils;
    return (window.KCHelpUtils && typeof window.KCHelpUtils === 'object') ? window.KCHelpUtils : null;
  }

  function getNowIsoFn(deps) {
    return (deps && typeof deps.getNowIso === 'function')
      ? deps.getNowIso
      : function () { return new Date().toISOString(); };
  }

  function getBuildRequestIdFn(deps) {
    return (deps && typeof deps.buildRequestId === 'function')
      ? deps.buildRequestId
      : function () { return 'help_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); };
  }

  function migrateLegacyHelpPayload(payload) {
    var input = (payload && typeof payload === 'object') ? payload : {};
    var legacyType = String(input.type || '').trim().toLowerCase();
    var legacyTopic = String(input.topic || '').trim().toLowerCase();

    var nextType = (function resolveType() {
      if (legacyType === 'complaint') return 'platform_issue';
      if (legacyType === 'praise') return 'suggestion_praise';
      if (legacyType === 'report') return 'report';
      if (legacyType === 'account_access') return 'account_access';
      if (legacyType === 'external_access') return 'external_access';
      if (legacyType === 'question') return 'question';
      return legacyType || 'question';
    }());

    var nextTopic = (function resolveTopic() {
      if (nextType === 'question') {
        if (legacyTopic === 'profile' || legacyTopic === 'contact') return 'profile_contact';
        if (legacyTopic === 'platform_use' || legacyTopic === 'posts') return 'publishing_navigation';
        return 'modules_filters';
      }
      if (nextType === 'platform_issue') {
        if (legacyTopic === 'posts') return 'create_edit_post';
        if (legacyTopic === 'contact') return 'search_filters';
        if (legacyTopic === 'security') return 'slow_performance';
        return 'bugs_crashes';
      }
      if (nextType === 'account_access') {
        if (legacyTopic === 'security') return 'password';
        if (legacyTopic === 'profile' || legacyTopic === 'contact') return 'onboarding_settings';
        return 'login_signup';
      }
      if (nextType === 'external_access') {
        if (legacyTopic === 'partnership_access') return 'partnership_access';
        return 'non_institutional_email';
      }
      if (nextType === 'report') {
        if (legacyTopic === 'profile') return 'profile_user';
        if (legacyTopic === 'contact') return 'inappropriate_contact';
        if (legacyTopic === 'security') return 'security';
        return 'post';
      }
      if (nextType === 'suggestion_praise') {
        if (legacyTopic === 'posts') return 'specific_module';
        if (legacyTopic === 'payment_benefit') return 'community';
        return 'general_experience';
      }
      return legacyTopic || '';
    }());

    return {
      ...input,
      type: nextType,
      topic: nextTopic,
    };
  }

  function normalizeHelpPayload(payload, deps) {
    var shared = getHelpUtils(deps);
    var migrated = migrateLegacyHelpPayload(payload);
    if (shared && typeof shared.normalizeHelpRequestInput === 'function') {
      return shared.normalizeHelpRequestInput(migrated, {});
    }
    var input = (migrated && typeof migrated === 'object') ? migrated : {};
    return {
      user_id: input.user_id || null,
      type: String(input.type || 'question').trim(),
      topic: String(input.topic || 'publishing_navigation').trim(),
      subtopic: input.subtopic ? String(input.subtopic).trim() : null,
      subject: String(input.subject || '').trim().slice(0, 140),
      message: String(input.message || '').trim().slice(0, 4000),
      priority: String(input.priority || 'normal').trim(),
      status: String(input.status || 'new').trim(),
      page_path: input.page_path ? String(input.page_path).trim().slice(0, 255) : null,
      contact_email: String(input.contact_email || '').trim().toLowerCase(),
      allow_contact: input.allow_contact !== false,
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    };
  }

  function readHelpRequests(deps) {
    try {
      var raw = localStorage.getItem(HELP_REQUESTS_STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      return list.map(function (item) {
        var normalized = normalizeHelpPayload(item, deps);
        return {
          ...(item && typeof item === 'object' ? item : {}),
          ...normalized,
        };
      });
    } catch (_) {
      return [];
    }
  }

  function writeHelpRequests(list) {
    try {
      localStorage.setItem(HELP_REQUESTS_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
      return true;
    } catch (_) {
      return false;
    }
  }

  function attachLocalAdminHelpListMeta(rows, meta) {
    if (meta === undefined) meta = {};
    var list = Array.isArray(rows) ? rows.slice() : [];
    var totalCount = Number(meta.totalCount);
    var limit = Number(meta.limit);
    var offset = Number(meta.offset);
    return Object.assign(list, {
      totalCount: Number.isFinite(totalCount) ? totalCount : list.length,
      limit: Number.isFinite(limit) ? limit : list.length,
      offset: Number.isFinite(offset) ? offset : 0,
      hasMore: Boolean(meta.hasMore),
    });
  }

  async function createHelpRequest(payload, deps) {
    var normalized = normalizeHelpPayload(payload, deps);
    if (!normalized.subject || !normalized.message || !normalized.contact_email) {
      return { ok: false, error: { message: 'Preencha assunto, descricao e e-mail de retorno.' } };
    }
    var list = readHelpRequests(deps);
    var now = getNowIsoFn(deps)();
    var metadata = {
      ...(normalized.metadata && typeof normalized.metadata === 'object' ? normalized.metadata : {}),
    };
    if (normalized.type === 'external_access' || metadata.request_kind === 'external_access') {
      metadata.request_kind = 'external_access';
      metadata.email_notification = {
        status: 'simulated_local',
        provider: 'local',
        to: 'contato@kinocampus.com.br',
        sent_at: now,
      };
    }
    var row = {
      id: getBuildRequestIdFn(deps)(),
      ...normalized,
      metadata: metadata,
      created_at: now,
      updated_at: now,
    };
    list.unshift(row);
    if (!writeHelpRequests(list)) {
      return { ok: false, error: { message: 'Nao foi possivel salvar o pedido de ajuda localmente.' } };
    }
    return { ok: true, data: row };
  }

  async function listAdminHelpRequests(filters, deps) {
    if (filters === undefined) filters = {};
    var current = readHelpRequests(deps).slice().sort(function (a, b) {
      return new Date((b && b.created_at) || 0).getTime() - new Date((a && a.created_at) || 0).getTime();
    });
    var query = String(filters.query || '').trim().toLowerCase();
    var limit = Math.max(1, Math.min(100, Number(filters.limit) || 25));
    var offset = Math.max(0, Number(filters.offset) || 0);
    var filtered = current.filter(function (item) {
      if (filters.status && filters.status !== 'all' && String(item.status || '') !== String(filters.status)) return false;
      if (filters.type && filters.type !== 'all' && String(item.type || '') !== String(filters.type)) return false;
      if (filters.priority && filters.priority !== 'all' && String(item.priority || '') !== String(filters.priority)) return false;
      if (!query) return true;
      var haystack = [
        item.subject,
        item.message,
        item.contact_email,
        item.page_path,
        item.type,
        item.topic,
        item.subtopic,
      ].join(' ').toLowerCase();
      return haystack.indexOf(query) >= 0;
    });
    var rows = filtered.slice(offset, offset + limit);
    return attachLocalAdminHelpListMeta(rows, {
      totalCount: filtered.length,
      limit: limit,
      offset: offset,
      hasMore: (offset + rows.length) < filtered.length,
    });
  }

  async function updateAdminHelpRequest(id, patch, deps) {
    var targetId = String(id || '').trim();
    if (!targetId) return { ok: false, error: { message: 'Pedido invalido.' } };
    var list = readHelpRequests(deps);
    var index = list.findIndex(function (item) {
      return String((item && item.id) || '') === targetId;
    });
    if (index < 0) return { ok: false, error: { message: 'Pedido nao encontrado.' } };
    list[index] = {
      ...list[index],
      ...(patch && typeof patch === 'object' ? patch : {}),
      updated_at: getNowIsoFn(deps)(),
    };
    if (!writeHelpRequests(list)) {
      return { ok: false, error: { message: 'Nao foi possivel atualizar o pedido localmente.' } };
    }
    return { ok: true, data: list[index] };
  }

  async function processAccountErasure(payload, deps) {
    var input = (payload && typeof payload === 'object') ? payload : {};
    var action = String(input.action || 'diagnose').trim();
    var targetEmail = String(input.target_email || '').trim().toLowerCase();
    var helpRequestId = String(input.help_request_id || '').trim();
    var list = readHelpRequests(deps);
    var row = list.find(function (item) {
      return String((item && item.id) || '') === helpRequestId;
    }) || null;
    if (!targetEmail && row) {
      var metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      targetEmail = String(metadata.account_email || row.contact_email || '').trim().toLowerCase();
    }
    if (!targetEmail || targetEmail.indexOf('@') < 0) {
      return { ok: false, error: { message: 'Informe o e-mail da conta para o fluxo LGPD.' } };
    }
    var now = getNowIsoFn(deps)();
    var emailHash = 'local-' + targetEmail.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    var request = {
      id: 'lgpd_' + (helpRequestId || 'local') + '_' + emailHash.slice(-8),
      help_request_id: helpRequestId || null,
      email_hash: emailHash,
      status: action === 'erase_confirmed' ? 'erased' : (action === 'apply_reversible' ? 'pending_confirmation' : 'diagnosed'),
      counts: {
        help_requests: row ? 1 : 0,
      },
      metadata: {
        simulated_local: true,
        updated_at: now,
      },
    };
    if (row && action === 'apply_reversible') {
      row.status = 'in_progress';
      row.metadata = {
        ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
        lgpd_erasure: {
          request_id: request.id,
          email_hash: emailHash,
          stage: 'pending_confirmation',
          updated_at: now,
        },
      };
      writeHelpRequests(list);
    }
    return {
      ok: true,
      action: action,
      request: request,
      diagnostics: {
        user_found: false,
        counts: request.counts,
        warnings: ['local_driver_simulation'],
      },
      target: {
        email_hash: emailHash,
        user_found: false,
      },
    };
  }

  window._KCLA.help = Object.freeze({
    createHelpRequest: createHelpRequest,
    listAdminHelpRequests: listAdminHelpRequests,
    updateAdminHelpRequest: updateAdminHelpRequest,
    processAccountErasure: processAccountErasure,
  });
}());
