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
    },
    requestToken: 0,
  };

  let eventsBound = false;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function esc(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value);
  }

  function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
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
    error.textContent = String(message || 'Nao foi possivel carregar os pedidos de ajuda.');
    error.style.display = 'block';
  }

  function hideError() {
    const error = $('#admin-error');
    if (!error) return;
    error.textContent = '';
    error.style.display = 'none';
  }

  function showLoading(active) {
    const loading = $('#admin-loading');
    const content = $('#admin-content');
    if (loading) loading.style.display = active ? 'flex' : 'none';
    if (content) content.style.display = active ? 'none' : 'block';
  }

  function showToast(message, type) {
    const text = String(message || '').trim();
    if (!text) return;
    if (typeof window.showToast === 'function') {
      window.showToast(text, type || 'info', 2600);
      return;
    }
    window.alert(text);
  }

  async function checkAdminAccess() {
    const driver = window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver;
    if (driver === 'local') return true;
    if (driver !== 'supabase') {
      showError('O painel de ajuda requer driver=supabase.');
      return false;
    }

    const user = await window.KCAPI.getCurrentUser();
    if (!user) {
      showError('Voce precisa estar autenticado para acessar este painel.');
      return false;
    }

    const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
    if (!client) {
      showError('Supabase client nao disponivel.');
      return false;
    }

    const profileResult = await client
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (profileResult && profileResult.error) {
      showError('Nao foi possivel validar seu acesso administrativo.');
      return false;
    }

    if (!profileResult.data || profileResult.data.is_admin !== true) {
      showError('Acesso negado. Apenas administradores podem acessar este painel.');
      return false;
    }

    return true;
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

  function renderSummary(rows) {
    const target = $('#helpSummary');
    if (!target) return;

    const list = Array.isArray(rows) ? rows : [];
    const totalCount = Math.max(list.length, toFiniteNumber(state.pagination.totalCount, list.length));
    const metrics = [
      { label: 'Total filtrado', value: totalCount },
      { label: 'Exibindo', value: list.length },
      { label: 'Urgentes na tela', value: list.filter((row) => row && row.priority === 'urgent').length },
      { label: 'Em andamento', value: list.filter((row) => row && row.status === 'in_progress').length },
    ];

    target.innerHTML = metrics.map((item) => {
      return `<div class="kc-admin-help-metric"><strong>${esc(item.label)}</strong><span>${esc(item.value)}</span></div>`;
    }).join('');
  }

  function renderEmpty() {
    const list = $('#helpRequestsList');
    if (!list) return;
    list.innerHTML = '<div class="kc-admin-help-empty">Nenhum pedido de ajuda encontrado para os filtros atuais.</div>';
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

  function buildPaginationCard() {
    const totalCount = Math.max(0, toFiniteNumber(state.pagination.totalCount, state.rows.length));
    const loadedCount = Array.isArray(state.rows) ? state.rows.length : 0;
    if (!totalCount && !loadedCount) return '';

    const helperText = state.pagination.hasMore
      ? 'Filtros aplicados no servidor. Carregue a proxima pagina para continuar.'
      : 'Todos os resultados disponiveis para os filtros atuais ja foram carregados.';
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

  function renderRows(rows) {
    const list = $('#helpRequestsList');
    if (!list) return;

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
      const pagePath = String((row && row.page_path) || '').trim() || 'Nao informado';
      const subject = String(row.subject || '').trim() || 'Sem assunto';
      const message = String(row.message || '').trim() || 'Sem descricao';
      const contactEmail = String(row.contact_email || '').trim() || 'Sem e-mail';
      const metadataChips = buildMetadataChips(row);
      const metadataSummary = buildMetadataSummary(row);

      return [
        `<article class="kc-admin-help-card" data-help-id="${esc(row.id)}">`,
        '  <div class="kc-admin-help-card-top">',
        `    <div><h2>${esc(subject)}</h2><p>${esc(message)}</p></div>`,
        '    <div class="kc-admin-help-chips">',
        `      <span class="kc-admin-help-chip kc-admin-help-chip--status-${esc(row.status)}"><i class="fas fa-circle" aria-hidden="true"></i>${esc(statusLabel)}</span>`,
        `      <span class="kc-admin-help-chip kc-admin-help-chip--priority-${esc(row.priority)}"><i class="fas fa-bolt" aria-hidden="true"></i>${esc(priorityLabel)}</span>`,
        `      <span class="kc-admin-help-chip"><i class="fas fa-layer-group" aria-hidden="true"></i>${esc(typeLabel)}</span>`,
        metadataChips,
        '    </div>',
        '  </div>',
        '  <div class="kc-admin-help-meta">',
        `    <div><strong>Tema</strong><span>${esc(topicLabel)}</span></div>`,
        `    <div><strong>Subtipo</strong><span>${esc(subtopicLabel)}</span></div>`,
        `    <div><strong>E-mail</strong><span>${esc(contactEmail)}</span></div>`,
        `    <div><strong>Pagina afetada</strong><span>${esc(pagePath)}</span></div>`,
        `    <div><strong>Criado em</strong><span>${esc(formatDateTime(row.created_at))}</span></div>`,
        `    <div><strong>Contato autorizado</strong><span>${row.allow_contact === false ? 'Nao' : 'Sim'}</span></div>`,
        '  </div>',
        metadataSummary,
        '  <div class="kc-admin-help-actions">',
        `    <label><span class="sr-only">Status</span><select data-help-status><option value="new"${row.status === 'new' ? ' selected' : ''}>Novo</option><option value="triaged"${row.status === 'triaged' ? ' selected' : ''}>Triado</option><option value="in_progress"${row.status === 'in_progress' ? ' selected' : ''}>Em andamento</option><option value="resolved"${row.status === 'resolved' ? ' selected' : ''}>Resolvido</option><option value="archived"${row.status === 'archived' ? ' selected' : ''}>Arquivado</option></select></label>`,
        `    <label><span class="sr-only">Urgencia</span><select data-help-priority><option value="low"${row.priority === 'low' ? ' selected' : ''}>Baixa</option><option value="normal"${row.priority === 'normal' ? ' selected' : ''}>Normal</option><option value="high"${row.priority === 'high' ? ' selected' : ''}>Alta</option><option value="urgent"${row.priority === 'urgent' ? ' selected' : ''}>Urgente</option></select></label>`,
        '    <button type="button" data-help-save><i class="fas fa-floppy-disk" aria-hidden="true"></i> Salvar triagem</button>',
        '  </div>',
        '</article>',
      ].join('');
    });

    cards.push(buildPaginationCard());
    list.innerHTML = cards.join('');
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
    const totalCount = Math.max(rows.length, toFiniteNumber(totalCountSource, rows.length));
    const limit = Math.max(1, toFiniteNumber(limitSource, requestedLimit));
    const offset = Math.max(0, toFiniteNumber(offsetSource, requestedOffset));
    const hasMore = typeof hasMoreSource === 'boolean'
      ? hasMoreSource
      : (offset + rows.length) < totalCount;

    return { rows, totalCount, limit, offset, hasMore };
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

  async function loadRows(options = {}) {
    const append = options.append === true;
    const requestedLimit = Math.max(1, Math.min(100, toFiniteNumber(options.limit, state.pagination.limit || HELP_PAGE_SIZE)));
    const requestedOffset = append ? state.rows.length : Math.max(0, toFiniteNumber(options.offset, 0));
    const requestToken = state.requestToken + 1;
    state.requestToken = requestToken;

    if (!append) {
      hideError();
      showLoading(true);
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

      if (requestToken !== state.requestToken) return;

      const payload = unwrapRowsResponse(result, requestedLimit, requestedOffset);
      state.rows = append ? mergeRows(state.rows, payload.rows) : payload.rows;
      state.pagination.limit = payload.limit;
      state.pagination.totalCount = payload.totalCount;
      state.pagination.hasMore = payload.hasMore && state.rows.length < payload.totalCount;
      renderSummary(state.rows);
      renderRows(state.rows);
    } catch (error) {
      if (requestToken !== state.requestToken) return;
      console.error('[AdminHelp] load failed:', error);
      if (append) {
        showToast('Nao foi possivel carregar mais pedidos de ajuda.', 'error');
        renderRows(state.rows);
      } else {
        showError('Nao foi possivel carregar os pedidos de ajuda.');
      }
    } finally {
      if (requestToken !== state.requestToken) return;
      state.pagination.isLoadingMore = false;
      if (!append) showLoading(false);
      renderRows(state.rows);
    }
  }

  async function saveRow(card) {
    const id = String(card && card.getAttribute('data-help-id') || '').trim();
    if (!id) return;

    const status = String(card.querySelector('[data-help-status]')?.value || '').trim();
    const priority = String(card.querySelector('[data-help-priority]')?.value || '').trim();
    const validStatuses = getValidStatuses();
    const validPriorities = getValidPriorities();
    if (validStatuses.indexOf(status) < 0) {
      showToast('Status invalido para triagem.', 'error');
      return;
    }
    if (validPriorities.indexOf(priority) < 0) {
      showToast('Urgencia invalida para triagem.', 'error');
      return;
    }

    const button = card.querySelector('[data-help-save]');
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Salvando...';
    }

    try {
      const result = await window.KCAPI.updateAdminHelpRequest(id, { status, priority });
      if (!result || result.ok === false) {
        showToast((result && result.error && result.error.message) || 'Nao foi possivel salvar a triagem.', 'error');
        return;
      }
      showToast('Triagem atualizada.', 'success');
      await loadRows({
        limit: Math.max(state.pagination.limit, state.rows.length || HELP_PAGE_SIZE),
      });
    } catch (error) {
      console.error('[AdminHelp] save failed:', error);
      showToast('Nao foi possivel salvar a triagem.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-floppy-disk" aria-hidden="true"></i> Salvar triagem';
      }
    }
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    ['#helpStatusFilter', '#helpTypeFilter', '#helpPriorityFilter'].forEach((selector) => {
      const field = $(selector);
      if (field) field.addEventListener('change', function () { loadRows(); });
    });

    const queryField = $('#helpQueryFilter');
    if (queryField) {
      queryField.addEventListener('input', function () {
        window.clearTimeout(queryField._kcTimer);
        queryField._kcTimer = window.setTimeout(function () {
          loadRows();
        }, QUERY_DEBOUNCE_MS);
      });
    }

    const refreshButton = $('#helpRefreshButton');
    if (refreshButton) {
      refreshButton.addEventListener('click', function () {
        loadRows({ limit: Math.max(state.pagination.limit, state.rows.length || HELP_PAGE_SIZE) });
      });
    }

    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest ? event.target.closest('[data-help-save],[data-help-load-more]') : null;
      if (!target) return;

      if (target.hasAttribute('data-help-load-more')) {
        event.preventDefault();
        if (!state.pagination.isLoadingMore && state.pagination.hasMore) {
          loadRows({ append: true, limit: state.pagination.limit || HELP_PAGE_SIZE });
        }
        return;
      }

      const card = target.closest('[data-help-id]');
      if (card) saveRow(card);
    });
  }

  async function init() {
    populateTypeFilter();
    bindEvents();

    const allowed = await checkAdminAccess();
    if (!allowed) {
      showLoading(false);
      return;
    }

    await loadRows();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
